import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createBookRestoreUploadService } from '../src/bookRestoreUpload.mjs';
import { BOOK_RESTORE_METHODS, preparationProgress } from '../src/bookRestoreUploadContracts.mjs';
import { validateBookBackupCover } from '../src/bookBackupCover.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import {
  coverPng,
  coverRestoreFixture,
  readyRestoreCover,
  finishRestoreCover,
} from './helpers/bookRestoreCoverFixture.mjs';
import {
  legacyMutation as mutation,
  cleanupLegacyRestore,
} from './helpers/bookLegacyRestoreFixture.mjs';
const uid = 'author',
  id = 'cover-restore-001',
  root = 'users/' + uid + '/bookRestores/' + id;
function setup() {
  const f = adventureImportDb({ nativeUpdates: true }),
    factory = () => createBookRestoreUploadService({ db: f.db, now: () => 1000 });
  return { ...f, factory, api: factory() };
}
const stage = async (f, p, op = 'cover-stage-0001') =>
  (await f.api.advanceBookRestoreCover(uid, mutation(id, p, op))).progress;
const multi = () => Buffer.concat([coverPng, Buffer.alloc(70000 - coverPng.length, 53)]);
test('stages exact private PNG bytes and original metadata with a mapped image identity without Storage/library/root', async () => {
  const f = setup(),
    initial = await readyRestoreCover(f.factory, uid, id),
    p = await stage(f, initial),
    definition = f.records.get(root + '/preparedCovers/current'),
    part = f.records.get(root + '/preparedCoverChunks/000000000000000');
  assert.equal(p.preparation.schemaVersion, 9);
  assert.equal(f.records.get(root).cleanupVersion, 12);
  assert.equal(p.preparation.phase, 'cover-finalize');
  assert.equal(p.preparation.itemIndex, initial.preparation.itemIndex + 1);
  assert.match(definition.cover.imageId, /^restore-[a-f0-9]{64}$/);
  assert.equal(definition.cover.imageId, part.imageId);
  assert.equal(definition.cover.name, '\ufeff  Capa 🌙  ');
  assert.equal(definition.cover.createdAt, 3);
  assert.equal(definition.cover.updatedAt, 7);
  assert.deepEqual(Buffer.from(part.bytes), coverPng);
  assert.equal(part.contentHash, createHash('sha256').update(coverPng).digest('hex'));
  assert.equal(definition.cover.contentHash, part.contentHash);
  assert.equal(f.records.has('books/' + p.bookId), false);
  assert.equal(
    [...f.records.keys()].some((k) => k.startsWith('users/' + uid + '/imageLibrary/')),
    false,
  );
  assert.equal(f.records.get('books/' + p.bookId + '/workProgress/current').countReady, false);
  assert.equal(BOOK_RESTORE_METHODS.includes('advanceBookRestoreCover'), false);
  const reader = await f.api.openVerifiedBookRestoreContent(uid, {
    restoreId: id,
    jobToken: p.jobToken,
  });
  assert.equal(p.preparation.itemIndex, reader.itemCount);
});
for (const kind of ['none', 'legacy-unavailable'])
  test(kind + ' stays explicit without importing a URL or querying an image', async () => {
    const f = setup(),
      initial = await readyRestoreCover(f.factory, uid, id, coverRestoreFixture({ kind })),
      p = await stage(f, initial);
    assert.deepEqual(f.records.get(root + '/preparedCovers/current'), {
      schemaVersion: 1,
      cover: { kind },
    });
    assert.equal(p.preparation.cover.parts, 0);
    assert.equal(p.preparation.cover.bytes, 0);
    assert.equal(p.preparation.artifactCount, initial.preparation.artifactCount + 1);
    assert.equal(
      [...f.records.keys()].some((k) => k.startsWith(root + '/preparedCoverChunks/')),
      false,
    );
  });
test('multipart copy advances one frame, resumes with SHA and commits the descriptor only at the end', async () => {
  const f = setup(),
    bytes = multi(),
    initial = await readyRestoreCover(f.factory, uid, id, coverRestoreFixture({ bytes })),
    first = await stage(f, initial),
    p = await finishRestoreCover(f.factory, uid, id, first),
    pieces = [...f.records]
      .filter(([k]) => k.startsWith(root + '/preparedCoverChunks/'))
      .map(([, v]) => v)
      .sort((a, b) => a.index - b.index);
  assert.equal(first.preparation.itemIndex, initial.preparation.itemIndex);
  assert.equal(first.preparation.cover.parts, 1);
  assert.equal(first.preparation.cover.bytes, 65536);
  assert.equal(p.preparation.cover.parts, 2);
  assert.equal(p.preparation.cover.pending, null);
  assert.deepEqual(Buffer.concat(pieces.map((v) => Buffer.from(v.bytes))), bytes);
  assert.equal(
    f.records.get(root + '/preparedCovers/current').cover.contentHash,
    createHash('sha256').update(bytes).digest('hex'),
  );
});
test('CAS and historical replay never duplicate a cover part or final descriptor', async () => {
  const f = setup(),
    initial = await readyRestoreCover(f.factory, uid, id),
    a = mutation(id, initial, 'cover-race-one01'),
    b = mutation(id, initial, 'cover-race-two01'),
    results = await Promise.allSettled([
      f.api.advanceBookRestoreCover(uid, a),
      f.factory().advanceBookRestoreCover(uid, b),
    ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const won = results[0].status === 'fulfilled' ? a : b,
    first = results.find((r) => r.status === 'fulfilled').value;
  assert.deepEqual(await f.factory().advanceBookRestoreCover(uid, won), first);
  assert.equal(
    [...f.records.keys()].filter((k) => k.startsWith(root + '/preparedCoverChunks/')).length,
    1,
  );
  const terminal = await cleanupLegacyRestore(f.api, uid, id, first.progress, { limit: 5 });
  assert.equal(terminal.state, 'cancelled');
  assert.deepEqual((await f.api.advanceBookRestoreCover(uid, won)).receipt, first.receipt);
});
test('storage failure and automatic transaction retry retain cursor and count only one part', async () => {
  const f = setup(),
    initial = await readyRestoreCover(f.factory, uid, id),
    run = f.db.runTransaction.bind(f.db),
    before = structuredClone([...f.records]),
    failure = new Error('cover part storage failure');
  let inject = true,
    automatic = false;
  f.db.runTransaction = async (operation) => {
    try {
      return await run(async (tx) => {
        const create = tx.create;
        tx.create = (ref, ...args) => {
          if (inject && ref.path.includes('/preparedCoverChunks/')) throw failure;
          return create(ref, ...args);
        };
        return operation(tx);
      });
    } catch (error) {
      if (error === failure && automatic) {
        inject = false;
        return run(operation);
      }
      throw error;
    }
  };
  const request = mutation(id, initial, 'cover-retry-op01');
  await assert.rejects(
    () => f.api.advanceBookRestoreCover(uid, request),
    (e) => e === failure,
  );
  assert.deepEqual([...f.records], before);
  automatic = true;
  const p = (await f.api.advanceBookRestoreCover(uid, request)).progress;
  assert.equal(p.preparation.cover.parts, 1);
  assert.equal(p.preparation.artifactCount, initial.preparation.artifactCount + 2);
});
test('occupied cover namespace blocks inventory migration and preserves the foreign record', async () => {
  const f = setup(),
    initial = await readyRestoreCover(f.factory, uid, id),
    path = root + '/preparedCovers/foreign';
  f.records.set(path, { foreign: true });
  const before = structuredClone([...f.records]);
  await assert.rejects(() => stage(f, initial));
  assert.deepEqual([...f.records], before);
  assert.equal(f.records.get(root).cleanupVersion, 11);
});
test('cancellation during source item reading prevents every new cover resource and receipt', async () => {
  const f = setup(),
    initial = await readyRestoreCover(f.factory, uid, id),
    doc = f.db.doc.bind(f.db),
    path = root + '/validationItems/' + String(initial.preparation.itemIndex).padStart(15, '0'),
    request = mutation(id, initial, 'cover-reading-request01');
  let intercepted = false;
  f.db.doc = (value) => {
    const ref = doc(value);
    if (value === path)
      return {
        ...ref,
        get: async () => {
          const snapshot = await ref.get();
          if (!intercepted) {
            intercepted = true;
            await f.api.cancelBookRestore(uid, mutation(id, initial, 'cover-reading-cancel01'));
          }
          return snapshot;
        },
      };
    return ref;
  };
  await assert.rejects(() => f.api.advanceBookRestoreCover(uid, request));
  assert.equal(intercepted, true);
  assert.equal(f.records.has(root + '/preparedCovers/current'), false);
  assert.equal(
    [...f.records.keys()].some((k) => k.startsWith(root + '/preparedCoverChunks/')),
    false,
  );
  assert.equal(
    f.records.has('users/' + uid + '/bookRestoreOperations/' + request.operationId),
    false,
  );
});
test('partial cleanup reads masks and preserves the current library and other jobs', async () => {
  const f = setup(),
    initial = await readyRestoreCover(f.factory, uid, id, coverRestoreFixture({ bytes: multi() })),
    first = await stage(f, initial),
    library = 'users/' + uid + '/imageLibrary/' + first.preparation.cover.imageId;
  f.records.set(library, { keep: true });
  f.records.set('users/' + uid + '/bookRestores/other/preparedCoverChunks/000000000000000', {
    keep: true,
  });
  assert.equal(f.records.has(root + '/preparedCovers/current'), false);
  f.metadataReads.length = 0;
  const terminal = await cleanupLegacyRestore(f.api, uid, id, first, { limit: 2 });
  assert.equal(terminal.state, 'cancelled');
  assert.equal(terminal.preparation.cleanedArtifacts, first.preparation.artifactCount);
  assert.equal(
    [...f.records.keys()].some((k) => k.startsWith(root + '/preparedCoverChunks/')),
    false,
  );
  assert.equal(f.records.get(library).keep, true);
  assert.equal(
    f.records.get('users/' + uid + '/bookRestores/other/preparedCoverChunks/000000000000000').keep,
    true,
  );
  assert.ok(
    f.metadataReads
      .filter((v) => v.path.startsWith(root + '/preparedCoverChunks/'))
      .every((v) => v.fields.length === 0),
  );
});
for (const family of ['preparedCovers', 'preparedCoverChunks'])
  test('cleanup protects a recreated ' + family + ' incarnation', async () => {
    const f = setup(),
      initial = await readyRestoreCover(f.factory, uid, id),
      p = await stage(f, initial),
      path =
        root + '/' + family + '/' + (family === 'preparedCovers' ? 'current' : '000000000000000'),
      value = structuredClone(f.records.get(path));
    await f.db.runTransaction((tx) => tx.delete(f.db.doc(path)));
    await f.db.runTransaction((tx) => tx.create(f.db.doc(path), value));
    const cancelling = (
      await f.api.cancelBookRestore(uid, mutation(id, p, 'cover-recreated-cancel'))
    ).progress;
    await assert.rejects(() => cleanupLegacyRestore(f.api, uid, id, cancelling, { limit: 5 }));
    assert.deepEqual(f.records.get(path), value);
  });
test('closed v9 progress and names reject wrong counts, phases, private fields and lossy Unicode', async () => {
  const f = setup(),
    initial = await readyRestoreCover(f.factory, uid, id, coverRestoreFixture({ bytes: multi() })),
    first = await stage(f, initial);
  for (const change of [
    (v) => v.cover.parts++,
    (v) => (v.phase = 'cover-finalize'),
    (v) => (v.cover.imageId = 'foreign'),
    (v) => (v.cover.path = 'outside'),
    (v) => (v.cover.pending.cursor.previous = 'bad'),
    (v) => (v.cover = null),
  ]) {
    const p = structuredClone(first.preparation);
    change(p);
    assert.throws(
      () => preparationProgress(p),
      (e) => e.code === 'failed-precondition' && e.details.reason === 'identity-conflict',
    );
  }
  assert.throws(() =>
    validateBookBackupCover({
      kind: 'library',
      imageId: 'image-source-test0001',
      name: '\ud800',
      contentType: 'image/png',
      byteLength: 8,
      chunkCount: 1,
      contentHash: 'a'.repeat(64),
    }),
  );
});
