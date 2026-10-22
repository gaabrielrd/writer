import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBookRestoreUploadService } from '../src/bookRestoreUpload.mjs';
import { sha256, chunkId, requestHash, mutationInput } from '../src/bookRestoreUploadContracts.mjs';
import { validateBookBackupContent } from '../src/bookBackupContent.mjs';
import { fixture, source, indexFixture, hashPort, record } from './helpers/bookContentFixture.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
const uid = 'author',
  id = 'restore-validation01',
  root = 'users/' + uid + '/bookRestores/' + id;
const mutate = (p, operationId, extra = {}) => ({
  restoreId: id,
  jobToken: p.jobToken,
  operationId,
  expectedCheckpoint: p.checkpoint,
  ...extra,
});
function setup() {
  const f = adventureImportDb({ nativeUpdates: true });
  return { ...f, api: createBookRestoreUploadService({ db: f.db, now: () => 1000 }) };
}
async function ready(f, records = fixture(), format = 'writer-book-archive') {
  const src = ArrayBuffer.isView(records) ? null : await source(records),
    bytes = src ? await src.read(0, src.size) : records;
  let p = (
    await f.api.startBookRestore(uid, {
      operationId: id,
      source: {
        format,
        version: format === 'writer-book-archive' ? 1 : 6,
        byteLength: bytes.length,
        sha256: sha256(bytes),
      },
      reviewHash: 'a'.repeat(64),
    })
  ).progress;
  await f.api.getBookRestoreRecoveryKey(uid, {
    restoreId: id,
    jobToken: p.jobToken,
    reviewHash: p.reviewHash,
  });
  for (let index = 0; index < Math.ceil(bytes.length / 65536); index++) {
    const part = bytes.subarray(index * 65536, (index + 1) * 65536);
    p = (
      await f.api.appendBookRestoreChunk(
        uid,
        mutate(p, 'validation-upload-' + index, {
          index,
          chunkHash: sha256(part),
          chunkBase64: Buffer.from(part).toString('base64'),
        }),
      )
    ).progress;
  }
  let step = 0;
  while (p.state !== 'bytes-verified')
    p = (
      await f.api.advanceBookRestoreIntegrity(
        uid,
        mutate(p, 'validation-bytes-' + step++, { limit: 16 }),
      )
    ).progress;
  return { p, src, bytes };
}
async function finish(f, p, { fresh = false } = {}) {
  let step = 0;
  while (['bytes-verified', 'validating'].includes(p.state)) {
    if (fresh) f.api = createBookRestoreUploadService({ db: f.db, now: () => 1000 });
    p = (
      await f.api.advanceBookRestoreValidation(
        uid,
        mutate(p, 'validation-step-' + String(step++).padStart(4, '0')),
      )
    ).progress;
    assert.ok(step < 500);
  }
  return p;
}
async function cleanup(f, p) {
  p = (await f.api.cancelBookRestore(uid, mutate(p, 'validation-cancel01'))).progress;
  let step = 0;
  while (p.state !== 'cancelled') {
    const request = mutate(p, 'validation-clean-' + String(step++).padStart(4, '0'), { limit: 7 });
    const result = await f.api.advanceBookRestoreCleanup(uid, request);
    assert.deepEqual(await f.api.advanceBookRestoreCleanup(uid, request), result);
    p = result.progress;
    assert.ok(step < 200);
  }
  return p;
}
test('server validates a full archive across fresh instances and matches the shared public validator', async () => {
  const f = setup(),
    { p, src } = await ready(f),
    expected = await validateBookBackupContent(src, { index: indexFixture(), hash: hashPort });
  const done = await finish(f, p, { fresh: true });
  assert.equal(done.state, 'content-verified');
  assert.equal(done.validation.phase, 'done');
  assert.deepEqual(done.validation.summary.totals, expected.totals);
  assert.deepEqual(done.validation.summary.warnings, expected.warnings);
  assert.equal(f.records.has('books/' + done.bookId), false);
  assert.ok([...f.records.keys()].some((k) => k.startsWith(root + '/validationItems/')));
  const metadata = JSON.stringify(await f.api.listBookRestores(uid, {}));
  for (const text of ['Own', 'Original', 'Livro', 'hashState', 'PRIVATE'])
    assert.equal(metadata.includes(text), false, text);
  for (const [path, value] of f.records)
    if (
      path.startsWith(root + '/validationIndex/') ||
      path.startsWith(root + '/validationItems/')
    ) {
      for (const text of ['Original', 'Livro', 'instructions'])
        assert.equal(JSON.stringify(value).includes(text), false, text);
    }
});
test('replay confirms historical progress and concurrent requests cannot reject a newer checkpoint', async () => {
  const f = setup(),
    { p } = await ready(f),
    request = mutate(p, 'validation-replay001');
  const first = await f.api.advanceBookRestoreValidation(uid, request);
  const next = (
    await f.api.advanceBookRestoreValidation(uid, mutate(first.progress, 'validation-replay002'))
  ).progress;
  const race = await Promise.allSettled([
    f.api.advanceBookRestoreValidation(uid, mutate(next, 'validation-race001')),
    f.api.advanceBookRestoreValidation(uid, mutate(next, 'validation-race002')),
  ]);
  assert.equal(race.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(race.find((r) => r.status === 'rejected').reason.code, 'failed-precondition');
  const current = await f.api.getBookRestore(uid, { restoreId: id });
  assert.equal(current.state, 'validating');
  assert.equal(current.validation.failure, null);
  const replay = await f.api.advanceBookRestoreValidation(uid, request);
  assert.deepEqual(replay.receipt, first.receipt);
  assert.equal(replay.progress.checkpoint, current.checkpoint);
  const normalized = mutationInput(request);
  const resolved = await f.api.resolveBookRestoreOperation(uid, {
    restoreId: id,
    jobToken: p.jobToken,
    operationId: request.operationId,
    requestHash: requestHash('advanceBookRestoreValidation', normalized),
  });
  assert.deepEqual(resolved, replay);
});
test('semantic corruption and a broken frame are terminal content rejections without activating a book', async () => {
  const malformed = fixture().map((r) => {
    if (r.kind !== 'book-scene-body') return r;
    const v = JSON.parse(new TextDecoder().decode(r.payload));
    v.data.hash = '0'.repeat(64);
    return record(r.kind, r.id, v);
  });
  for (const mode of ['semantic', 'frame']) {
    const f = setup();
    let p;
    if (mode === 'semantic') p = (await ready(f, malformed)).p;
    else {
      const src = await source(fixture()),
        bytes = Buffer.from(await src.read(0, src.size));
      bytes[bytes.length - 1] ^= 1;
      p = (await ready(f, bytes)).p;
    }
    const done = await finish(f, p);
    assert.equal(done.state, 'content-rejected');
    assert.equal(
      done.validation.failure,
      mode === 'semantic' ? 'invalid-record' : 'integrity-mismatch',
    );
    assert.equal(f.records.has(root + '/validationState/current'), false);
    assert.equal(f.records.has('books/' + done.bookId), false);
    await cleanup(f, done);
    assert.equal(
      [...f.records.keys()].some((path) => path.startsWith(root + '/')),
      false,
    );
  }
});
test('v3 cleanup removes state, item pointers and index in bounded pages and preserves other books', async () => {
  const f = setup(),
    { p } = await ready(f),
    done = await finish(f, p);
  f.records.set('books/other/chapters/chapter', { content: 'preserve' });
  const terminal = await cleanup(f, done);
  assert.equal(terminal.state, 'cancelled');
  assert.equal(
    [...f.records.keys()].some((path) => path.startsWith(root + '/')),
    false,
  );
  assert.equal(f.records.get('books/other/chapters/chapter').content, 'preserve');
  assert.equal(f.records.has('deletedBooks/' + done.bookId), true);
  assert.ok(
    f.commits.every(
      (w) => w.filter((v) => v.method === 'delete' && v.path.startsWith(root + '/')).length <= 7,
    ),
  );
});
test('state checksum, raw part ABA and foreign reserved namespaces fail without semantic rejection', async () => {
  const f = setup(),
    { p } = await ready(f);
  const first = (await f.api.advanceBookRestoreValidation(uid, mutate(p, 'validation-state001')))
    .progress;
  f.records.get(root + '/validationState/current').state.items = 99;
  await assert.rejects(
    f.api.advanceBookRestoreValidation(uid, mutate(first, 'validation-state002')),
    { code: 'failed-precondition' },
  );
  assert.equal(f.records.get(root).state, 'validating');
  const other = setup(),
    readyOther = await ready(other);
  other.records.set(root + '/validationIndex/foreign', { ownerId: 'other' });
  await assert.rejects(
    other.api.advanceBookRestoreValidation(uid, mutate(readyOther.p, 'validation-state003')),
    { code: 'failed-precondition' },
  );
  assert.equal(other.records.get(root + '/validationIndex/foreign').ownerId, 'other');
  const changed = setup(),
    r = await ready(changed),
    path = root + '/chunks/' + chunkId(0);
  changed.metadata.set(path, { createdAt: 1000, createdAtNanoseconds: 99999 });
  await assert.rejects(
    changed.api.advanceBookRestoreValidation(uid, mutate(r.p, 'validation-state004')),
    { code: 'failed-precondition' },
  );
  assert.equal(changed.records.get(root).state, 'bytes-verified');
});
test('incomplete legacy content is rejected and closed requests refuse forged cursors or reports', async () => {
  const f = setup(),
    { p } = await ready(
      f,
      Buffer.from('{"format":"writer-book-backup","version":6}'),
      'writer-book-backup',
    );
  const done = await finish(f, p);
  assert.equal(done.state, 'content-rejected');
  assert.equal(done.validation.failure, 'invalid-record');
  await assert.rejects(
    f.api.advanceBookRestoreValidation(uid, { ...mutate(p, 'validation-legacy02'), cursor: {} }),
    { code: 'invalid-argument' },
  );
});

test('multipart JSON, resumable Unicode raw, cover and large relation fanout match direct validation', async () => {
  const text = Buffer.from('\ufeff' + 'ação 🌙'.repeat(18000)),
    parts = [];
  for (let at = 0; at < text.length;) {
    let end = Math.min(text.length, at + 65536);
    while (end < text.length && (text[end] & 0xc0) === 0x80) end--;
    parts.push(text.subarray(at, end));
    at = end;
  }
  const imageId = 'cover-image-0001',
    png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6xkAAAAASUVORK5CYII=',
      'base64',
    );
  const records = fixture()
    .map((r) => {
      if (['book-lore', 'chapter', 'book-draft', 'book-metadata', 'book-cover'].includes(r.kind)) {
        const v = JSON.parse(new TextDecoder().decode(r.payload));
        if (r.kind === 'book-lore')
          v.data.relations = Array.from({ length: 205 }, (_, i) => ({
            targetEntityId: 'missing-' + i,
            relationType: 'knows',
          }));
        if (r.kind === 'chapter') v.title = '🌙'.repeat(40000);
        if (r.kind === 'book-draft') {
          v.byteLength = text.length;
          v.chunkCount = parts.length;
          v.contentHash = sha256(text);
        }
        if (r.kind === 'book-metadata') {
          v.book.coverImageId = imageId;
          v.cover = { kind: 'library', imageId };
        }
        if (r.kind === 'book-cover')
          v.cover = {
            kind: 'library',
            imageId,
            contentType: 'image/png',
            byteLength: png.length,
            chunkCount: 1,
            contentHash: sha256(png),
            name: 'PRIVATE COVER',
          };
        return record(r.kind, r.id, v);
      }
      return r;
    })
    .flatMap((r) =>
      r.kind === 'book-draft-text' ? parts.map((payload, part) => ({ ...r, payload, part })) : [r],
    )
    .flatMap((r) => {
      if (r.payload.length <= 65536) return [r];
      const list = [];
      for (let at = 0; at < r.payload.length; at += 65536)
        list.push({ ...r, part: at / 65536, payload: r.payload.slice(at, at + 65536) });
      return list;
    });
  records.push({ kind: 'book-cover-bytes', id: imageId, part: 0, payload: png });
  const f = setup(),
    { p, src } = await ready(f, records),
    expected = await validateBookBackupContent(src, { index: indexFixture(), hash: hashPort });
  const done = await finish(f, p, { fresh: true });
  assert.equal(done.state, 'content-verified');
  assert.deepEqual(done.validation.summary.totals, expected.totals);
  assert.deepEqual(done.validation.summary.warnings, expected.warnings);
  assert.equal(done.validation.summary.totals.draftBytes, text.length);
  assert.equal(done.validation.summary.warnings.danglingLocalReferences, 205);
  const items = [...f.records.entries()]
    .filter(([path]) => path.startsWith(root + '/validationItems/'))
    .map(([, data]) => data);
  assert.ok(items.some((v) => v.record.kind === 'chapter' && v.spans.length > 1));
  assert.ok(
    items.some(
      (v) => v.record.kind === 'book-draft' && v.raw.cursor && v.raw.manifest.chunkCount > 1,
    ),
  );
});
test('a source mutation between preparation and final commit prevents every buffered index write', async () => {
  const f = setup();
  let { p } = await ready(f);
  p = (await f.api.advanceBookRestoreValidation(uid, mutate(p, 'validation-atomic01'))).progress;
  p = (await f.api.advanceBookRestoreValidation(uid, mutate(p, 'validation-atomic02'))).progress;
  const doc = f.db.doc.bind(f.db);
  let fired = false;
  f.db.doc = (path) => {
    const ref = doc(path);
    return {
      ...ref,
      async get() {
        const snapshot = await ref.get();
        if (!fired && path.startsWith(root + '/validationIndex/')) {
          fired = true;
          const chunk = root + '/chunks/' + chunkId(0);
          f.metadata.set(chunk, { ...f.metadata.get(chunk), updatedAt: 9999 });
        }
        return snapshot;
      },
    };
  };
  await assert.rejects(f.api.advanceBookRestoreValidation(uid, mutate(p, 'validation-atomic03')), {
    code: 'failed-precondition',
  });
  assert.equal(fired, true);
  assert.equal(f.records.get(root).checkpoint, p.checkpoint);
  assert.equal(
    [...f.records.keys()].some((path) => path.startsWith(root + '/validationIndex/')),
    false,
  );
  assert.equal(f.records.get(root).state, 'validating');
});
test('cancellation removes an own corrupt validation snapshot but preserves a foreign index', async () => {
  const f = setup(),
    { p } = await ready(f);
  const first = (await f.api.advanceBookRestoreValidation(uid, mutate(p, 'validation-corrupt01')))
    .progress;
  f.records.get(root + '/validationState/current').state.raw = { hashState: 'corrupted' };
  await cleanup(f, first);
  assert.equal(f.records.has(root + '/validationState/current'), false);
  const other = setup(),
    r = await ready(other);
  const q = (await other.api.advanceBookRestoreValidation(uid, mutate(r.p, 'validation-foreign01')))
    .progress;
  const cancelled = (await other.api.cancelBookRestore(uid, mutate(q, 'validation-cancel01')))
    .progress;
  other.records.set(root + '/validationIndex/foreign', {
    schemaVersion: 1,
    ownerId: 'other',
    restoreId: id,
    jobToken: q.jobToken,
    key: ['foreign'],
  });
  const raw = (
    await other.api.advanceBookRestoreCleanup(
      uid,
      mutate(cancelled, 'validation-cleanraw', { limit: 50 }),
    )
  ).progress;
  await assert.rejects(
    other.api.advanceBookRestoreCleanup(uid, mutate(raw, 'validation-cleanidx', { limit: 50 })),
    { code: 'failed-precondition' },
  );
  assert.equal(other.records.get(root + '/validationIndex/foreign').ownerId, 'other');
});

test('a late stale read resolves the receipt when an identical twin already committed', async () => {
  const f = setup();
  let { p } = await ready(f);
  p = (await f.api.advanceBookRestoreValidation(uid, mutate(p, 'validation-twinprep01'))).progress;
  p = (await f.api.advanceBookRestoreValidation(uid, mutate(p, 'validation-twinprep02'))).progress;
  const doc = f.db.doc.bind(f.db);
  let blocked = false,
    release,
    signal;
  const gate = new Promise((resolve) => {
      release = resolve;
    }),
    started = new Promise((resolve) => {
      signal = resolve;
    });
  f.db.doc = (path) => {
    const ref = doc(path);
    return {
      ...ref,
      async get() {
        if (!blocked && path.startsWith(root + '/validationIndex/')) {
          blocked = true;
          signal();
          await gate;
          const error = new Error('stale read');
          error.code = 'failed-precondition';
          throw error;
        }
        return ref.get();
      },
    };
  };
  const request = mutate(p, 'validation-identical01'),
    slow = f.api.advanceBookRestoreValidation(uid, request);
  await started;
  const fast = await f.api.advanceBookRestoreValidation(uid, request);
  release();
  const result = await slow;
  assert.deepEqual(result, fast);
  assert.equal(result.progress.checkpoint, p.checkpoint + 1);
});
