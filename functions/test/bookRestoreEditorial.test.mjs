import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createBookRestoreUploadService } from '../src/bookRestoreUpload.mjs';
import { createBookRestoreRemapper } from '../src/bookRestoreRemap.mjs';
import { BOOK_RESTORE_METHODS } from '../src/bookRestoreUploadContracts.mjs';
import { normalizeBookEditorialArtifact } from '../src/bookEditorialProtocol.mjs';
import { digest } from '../src/sceneContracts.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import { legacyMutation as mutation } from './helpers/bookLegacyRestoreFixture.mjs';
import { source } from './helpers/bookContentFixture.mjs';
import { personasWithDraftFixture } from './helpers/bookRestorePersonasFixture.mjs';
import {
  readyEditorial,
  finishEditorial,
  editorialRecords,
  artifact,
  reference,
  contractId,
  noteId,
  uid,
} from './helpers/bookRestoreEditorialFixture.mjs';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const snapshot = (f) => structuredClone([...f.records]);
const identity = (f, id = noteId) =>
  createBookRestoreRemapper({
    schemaVersion: 1,
    sourceBookId: 'book',
    bookId: f.p.bookId,
    jobToken: f.p.jobToken,
  }).editorialIdentity({ kind: 'book-editorial-artifact', id, part: 0 });
const control = (f) => f.records.get(f.root + '/preparedEditorial/current');
const bodyPath = (f, id = identity(f)) => 'books/' + f.p.bookId + '/literaryArchiveBodies/' + id;
const recordPath = (f, id = identity(f)) => 'books/' + f.p.bookId + '/literaryArchive/' + id;
const partPath = (f, index, id = identity(f)) =>
  'books/' + f.p.bookId + '/literaryArchiveParts/' + id + ':' + String(index).padStart(15, '0');
async function step(f, p, id) {
  return f.factory().advanceBookRestoreEditorial(uid, mutation(f.id, p, id));
}
async function until(f, predicate) {
  let p = f.p;
  for (let unit = 0; unit < 1000; unit++) {
    if (predicate(control(f))) return p;
    p = (await step(f, p, f.id + '-seek-' + unit)).progress;
  }
  throw Error('Missing editorial phase');
}
function preservedBytes(f, id = identity(f)) {
  const header = f.records.get(recordPath(f, id));
  return Buffer.concat(
    Array.from({ length: header.chunkCount }, (_, index) =>
      Buffer.from(f.records.get(partPath(f, index, id)).bytesBase64, 'base64'),
    ),
  );
}
test('v2 allocation is closed by default and caller input cannot enable the private preparation option', async () => {
  const f = adventureImportDb({ nativeUpdates: true });
  const api = createBookRestoreUploadService({ db: f.db, now: () => 1000 });
  const archive = await source(editorialRecords(), 'book', 2),
    bytes = await archive.read(0, archive.size);
  const input = {
    operationId: 'editorial-closed-0001',
    reviewHash: 'a'.repeat(64),
    source: {
      format: 'writer-book-archive',
      version: 2,
      byteLength: bytes.length,
      sha256: sha(bytes),
    },
  };
  await assert.rejects(() => api.startBookRestore(uid, input));
  assert.equal(f.records.size, 0);
  await assert.rejects(() => api.startBookRestore(uid, { ...input, editorialPreparation: true }));
  assert.equal(f.records.size, 0);
  for (const name of ['advanceBookRestoreEditorial', 'getBookRestoreEditorial'])
    assert.equal(BOOK_RESTORE_METHODS.includes(name), false);
});
test('real v2 source crosses all base preparation phases and reserves each body before its first part', async () => {
  const f = await readyEditorial();
  let previousCount = f.p.preparation.artifactCount;
  const p = await finishEditorial(f, f.p, {
    onStep: ({ before, p }) => {
      assert.equal(f.records.has('books/' + p.bookId), false);
      assert.ok(p.preparation.artifactCount >= previousCount);
      previousCount = p.preparation.artifactCount;
      const current = control(f);
      if (current.phase === 'copy' && current.pending.part === 0) {
        const id = current.pending.body.id;
        assert.equal(f.records.get(bodyPath(f, id)).state, 'preparing');
        assert.equal(f.records.has(partPath(f, 0, id)), false);
        assert.equal(f.records.has(recordPath(f, id)), false);
      }
      if (before.phase === 'seal') assert.equal(current.phase, 'scan');
    },
  });
  assert.equal(p.state, 'content-verified');
  assert.equal(f.records.get(f.root).cleanupVersion, 15);
  const state = await f
    .factory()
    .getBookRestoreEditorial(uid, { restoreId: f.id, jobToken: p.jobToken });
  assert.equal(state.phase, 'materialized');
  assert.equal(state.artifacts, 2);
  assert.equal(state.links, 1);
  assert.equal(state.summaries, 1);
  assert.equal(f.records.get(recordPath(f)).contentHash, sha(preservedBytes(f)));
  assert.equal(JSON.stringify(state).includes('hashState'), false);
  assert.equal(JSON.stringify(state).includes('sourceToken'), false);
  assert.equal(JSON.stringify(state).includes('Private'), false);
  await assert.rejects(
    () =>
      f.factory().getBookRestoreActivationReview(uid, { restoreId: f.id, jobToken: p.jobToken }),
    { code: 'failed-precondition' },
  );
  assert.equal(f.records.has('books/' + p.bookId), false);
});
test('canonical JSON preserves original UTF-8 bytes and escaped CRLF text unchanged', async () => {
  const rows = editorialRecords({ note: '\ufeffPrivate 🌙\r\n"quoted" \\ original' });
  const original = rows.find((r) => r.kind === 'book-editorial-artifact' && r.id === noteId);
  const wire = Buffer.from(original.payload);
  const f = await readyEditorial({ records: rows });
  await finishEditorial(f);
  assert.deepEqual(preservedBytes(f), wire);
  const header = f.records.get(recordPath(f));
  assert.equal(
    header.valueHash,
    digest(normalizeBookEditorialArtifact(JSON.parse(wire.toString()))),
  );
  assert.equal(header.contentHash, sha(wire));
});

test('noncanonical JSON is rejected before editorial materialization', async () => {
  const original = editorialRecords().find(
    (r) => r.kind === 'book-editorial-artifact' && r.id === noteId,
  );
  const wire = Buffer.from(
    JSON.stringify(JSON.parse(Buffer.from(original.payload).toString()), null, 2)
      .replace(/\n/g, '\r\n')
      .replace('"revision": 1', '"revision": 1e0'),
  );
  await assert.rejects(
    () => readyEditorial({ records: editorialRecords({ payload: wire }) }),
    /Editorial fixture rejected: invalid-record/,
  );
});

test('an almost eight MiB original keeps its exact size when remapped identities would exceed the item limit', async () => {
  const base = artifact(noteId, 'prose', {
    role: 'prior-version',
    format: 'plain',
    text: '',
    rationale: '',
    source: { ...reference('book'), kind: 'book' },
  });
  const overhead = Buffer.byteLength(JSON.stringify(base)),
    limit = 8 * 1024 * 1024;
  base.content.text = 'x'.repeat(limit - overhead - 4);
  const wire = Buffer.from(JSON.stringify(base));
  assert.equal(wire.length, limit - 4);
  const f = await readyEditorial({ records: editorialRecords({ payload: wire }) });
  const mapper = createBookRestoreRemapper({
    schemaVersion: 1,
    sourceBookId: 'book',
    bookId: f.p.bookId,
    jobToken: f.p.jobToken,
  });
  assert.throws(() =>
    mapper.mapJSON({ kind: 'book-editorial-artifact', id: noteId, part: 0 }, base),
  );
  await finishEditorial(f);
  const header = f.records.get(recordPath(f));
  assert.equal(header.byteLength, wire.length);
  assert.equal(header.chunkCount, 128);
  assert.equal(header.contentHash, sha(wire));
  assert.deepEqual(preservedBytes(f), wire);
});
test('native semantic hashes come from the certified index, not the legacy-only valueHash pointer field', async () => {
  const f = await readyEditorial();
  const reader = await f
    .factory()
    .openVerifiedBookRestoreContent(uid, { restoreId: f.id, jobToken: f.p.jobToken });
  const at = reader.itemCount - 4;
  const item = await reader.openEditorialItem(at);
  assert.equal(item.record.id, contractId);
  const pointer = f.records.get(f.root + '/validationItems/' + String(at).padStart(15, '0'));
  assert.equal(Object.hasOwn(pointer, 'valueHash'), false);
  const original = f.sourceRecords.find((row) => row.id === contractId);
  assert.equal(
    item.valueHash,
    digest(normalizeBookEditorialArtifact(JSON.parse(Buffer.from(original.payload).toString()))),
  );
});

test('an existing native v2 reservation replays and resumes even after disabling new v2 admission', async () => {
  const f = await readyEditorial();
  f.factory = () => f.apiWith(false);
  const replay = await f.factory().startBookRestore(uid, {
    operationId: f.id,
    source: f.records.get(f.root).source,
    reviewHash: f.p.reviewHash,
  });
  assert.equal(replay.progress.bookId, f.p.bookId);
  const p = await finishEditorial(f);
  assert.equal(control(f).phase, 'materialized');
  assert.equal(p.state, 'content-verified');
});
test('a lost reply replays the original receipt after later units without another body, part or debit', async () => {
  const f = await readyEditorial();
  const request = mutation(f.id, f.p, f.id + '-held-reply');
  const first = await f.factory().advanceBookRestoreEditorial(uid, request);
  const p = await finishEditorial(f, first.progress);
  const before = snapshot(f);
  const again = await f.factory().advanceBookRestoreEditorial(uid, request);
  assert.deepEqual(again.receipt, first.receipt);
  assert.deepEqual(snapshot(f), before);
  assert.equal(again.progress.checkpoint, p.checkpoint);
});
test('a failed body/control transaction rolls back all staged resources and the immutable receipt', async () => {
  const f = await readyEditorial(),
    before = snapshot(f),
    run = f.db.runTransaction;
  let armed = true;
  f.db.runTransaction = (operation) =>
    run((tx) =>
      operation({
        ...tx,
        update(ref, value) {
          if (armed && ref.path === f.root && value.cleanupVersion === 15) {
            armed = false;
            throw Error('editorial commit failed');
          }
          return tx.update(ref, value);
        },
      }),
    );
  const request = mutation(f.id, f.p, f.id + '-rollback');
  await assert.rejects(
    () => f.factory().advanceBookRestoreEditorial(uid, request),
    /editorial commit failed/,
  );
  assert.deepEqual(snapshot(f), before);
  const result = await f.factory().advanceBookRestoreEditorial(uid, request);
  assert.equal(result.progress.checkpoint, f.p.checkpoint + 1);
  assert.equal(control(f).pending.part, 0);
  assert.equal(f.records.get(bodyPath(f, control(f).pending.body.id)).state, 'preparing');
});
for (const kind of ['body', 'part', 'control'])
  test('a recreated native ' + kind + ' cannot inherit the pending editorial proof', async () => {
    const f = await readyEditorial();
    const p = await until(f, (state) => state && (kind !== 'part' || state.phase === 'seal'));
    const pending = control(f).pending,
      id = pending.body.id;
    const path =
      kind === 'body'
        ? bodyPath(f, id)
        : kind === 'part'
          ? partPath(f, pending.lastPart.index, id)
          : f.root + '/preparedEditorial/current';
    const old = structuredClone(f.records.get(path));
    f.records.delete(path);
    f.records.set(path, old);
    const metadata = f.metadata.get(path);
    f.metadata.set(path, {
      ...metadata,
      createdAtNanoseconds: metadata.createdAtNanoseconds + 100000,
      updatedAtNanoseconds: metadata.updatedAtNanoseconds + 100000,
    });
    const before = snapshot(f);
    await assert.rejects(() => step(f, p, f.id + '-recreated-' + kind));
    assert.deepEqual(snapshot(f), before);
    assert.equal(f.records.has(recordPath(f, id)), false);
  });
test('source part verification is consumed in the write transaction and cancellation invalidates it', async () => {
  const f = await readyEditorial();
  const reader = await f
    .factory()
    .openVerifiedBookRestoreContent(uid, { restoreId: f.id, jobToken: f.p.jobToken });
  const item = await reader.openEditorialItem(reader.itemCount - 4),
    part = await item.readPart(0);
  await f.factory().cancelBookRestore(uid, mutation(f.id, f.p, f.id + '-cancel-source'));
  const before = snapshot(f);
  await assert.rejects(() =>
    f.db.runTransaction(async (tx) => {
      await part.verify(tx);
      tx.create(f.db.doc('books/' + f.p.bookId + '/literaryArchiveParts/untrusted'), {});
    }),
  );
  assert.deepEqual(snapshot(f), before);
});
test('actual cancellation drains prepared parts and headers through inventory v15 without creating a book', async () => {
  const f = await readyEditorial();
  const p = await until(f, (state) => state?.phase === 'seal');
  let done = (await f.factory().cancelBookRestore(uid, mutation(f.id, p, f.id + '-cancel')))
    .progress;
  let sawEditorial = false;
  for (let unit = 0; done.state !== 'cancelled' && unit < 1000; unit++) {
    const job = f.records.get(f.root);
    if (job.cleanupPhase === 'editorial') {
      sawEditorial = true;
      assert.equal(job.preparation.personaLibrary.revoked, true);
      assert.notEqual(job.preparation.coverStorage.fence, null);
    }
    done = (
      await f
        .factory()
        .advanceBookRestoreCleanup(
          uid,
          mutation(f.id, done, f.id + '-cleanup-' + unit, { limit: 1 }),
        )
    ).progress;
  }
  assert.equal(sawEditorial, true);
  assert.equal(done.state, 'cancelled');
  for (const path of f.records.keys()) {
    assert.equal(path.startsWith('books/' + p.bookId + '/literaryArchive'), false);
    assert.equal(path.startsWith(f.root + '/preparedEditorial/'), false);
  }
  assert.equal(f.records.has('books/' + p.bookId), false);
});
test('a v2 archive with an exclusive draft persona reads the validated draft before its editorial tail', async () => {
  const own = personasWithDraftFixture({ exclusive: true });
  const f = await readyEditorial({ records: editorialRecords({ base: own.records }) });
  const reader = await f
    .factory()
    .openVerifiedBookRestoreContent(uid, { restoreId: f.id, jobToken: f.p.jobToken });
  const draft = await reader.readMappedDraft();
  assert.equal(draft.record.kind, 'book-draft');
  assert.equal(draft.value.state, 'present');
  assert.notEqual(draft.value.persona.id, own.profile.id);
  assert.equal(draft.value.persona.id, f.p.preparation.personas.draftProfileId);
  await finishEditorial(f);
  assert.equal(f.records.has('books/' + f.p.bookId), false);
});

test('a JSON item above 64 KiB is copied from bounded physical frames without rewriting its bytes', async () => {
  const rows = editorialRecords({ note: 'x'.repeat(70000) });
  const pieces = rows.filter((row) => row.kind === 'book-editorial-artifact' && row.id === noteId);
  const wire = Buffer.concat(pieces.map((row) => Buffer.from(row.payload)));
  const first = rows.findIndex((row) => row.id === noteId);
  assert.equal(pieces.length, 2);
  assert.equal(first >= 0, true);
  const f = await readyEditorial({ records: rows });
  await finishEditorial(f);
  assert.equal(f.records.get(recordPath(f)).chunkCount, 2);
  assert.equal(f.records.get(partPath(f, 0)).byteLength, 65536);
  assert.equal(f.records.get(partPath(f, 1)).byteLength, wire.length - 65536);
  assert.deepEqual(preservedBytes(f), wire);
});

test('a physical JSON frame above 64 KiB is rejected by the package boundary', async () => {
  const rows = editorialRecords({ note: 'x'.repeat(70000) });
  const pieces = rows.filter((row) => row.kind === 'book-editorial-artifact' && row.id === noteId);
  const wire = Buffer.concat(pieces.map((row) => Buffer.from(row.payload)));
  rows.splice(
    rows.findIndex((row) => row.id === noteId),
    pieces.length,
    { ...pieces[0], part: 0, payload: wire },
  );
  await assert.rejects(() => readyEditorial({ records: rows }), { code: 'invalid-record' });
});
