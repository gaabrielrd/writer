import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createBookRestoreUploadService,
  setBookRestoreHeaders,
} from '../src/bookRestoreUpload.mjs';
import { requestHash, startInput, chunkInput, sha256 } from '../src/bookRestoreUploadContracts.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
const uid = 'author',
  id = 'restore-test-00001';
const bytes = Buffer.alloc(65539, 65);
const startRequest = (operationId = id, data = bytes) => ({
  operationId,
  source: {
    format: 'writer-book-archive',
    version: 1,
    byteLength: data.length,
    sha256: sha256(data),
  },
  reviewHash: 'a'.repeat(64),
});
function fixture() {
  const f = adventureImportDb({ nativeUpdates: true });
  return { ...f, api: createBookRestoreUploadService({ db: f.db, now: () => 1000 }) };
}
const start = (f, request = startRequest()) => f.api.startBookRestore(uid, request);
const key = (f, p, extra = {}) =>
  f.api.getBookRestoreRecoveryKey(uid, {
    restoreId: p.restoreId,
    jobToken: p.jobToken,
    reviewHash: p.reviewHash,
    ...extra,
  });
const mutation = (p, operationId, extra = {}) => ({
  restoreId: p.restoreId,
  jobToken: p.jobToken,
  operationId,
  expectedCheckpoint: p.checkpoint,
  ...extra,
});
const appendRequest = (
  p,
  index = 0,
  operationId = 'upload-test-000001',
  data = bytes.subarray(index * 65536, (index + 1) * 65536),
) =>
  mutation(p, operationId, {
    index,
    chunkHash: sha256(data),
    chunkBase64: data.toString('base64'),
  });
async function prepare(f, request = startRequest()) {
  const p = (await start(f, request)).progress;
  await key(f, p);
  return await f.api.getBookRestore(uid, { restoreId: p.restoreId });
}
test('start reserves an absent root, replays metadata and isolates identity', async () => {
  const f = fixture(),
    request = startRequest(),
    first = await start(f, request),
    p = first.progress;
  assert.match(p.bookId, /^restore-[a-f0-9]{64}$/);
  assert.equal(p.state, 'uploading');
  assert.equal(p.checkpoint, 0);
  assert.equal(f.records.has('books/' + p.bookId), false);
  const marker = f.records.get('deletedBooks/' + p.bookId);
  assert.equal(marker.kind, 'book-restore-reservation');
  assert.equal(Object.hasOwn(marker, 'deletedAt'), false);
  assert.deepEqual(await start(f, request), first);
  assert.equal(f.records.size, 4);
  assert.equal(JSON.stringify(first).includes('keyBase64'), false);
  await assert.rejects(start(f, { ...request, reviewHash: 'b'.repeat(64) }), {
    code: 'invalid-argument',
  });
  await assert.rejects(f.api.getBookRestore('other', { restoreId: id }), { code: 'not-found' });
  await assert.rejects(start(f, { ...request, ownerId: 'other' }), { code: 'invalid-argument' });
  await assert.rejects(f.api.startBookRestore('', request), { code: 'unauthenticated' });
});
test('native recreation of any reservation member invalidates the job', async () => {
  for (const kind of ['job', 'reservation', 'marker']) {
    const f = fixture(),
      p = (await start(f)).progress;
    const path =
      kind === 'job'
        ? 'users/' + uid + '/bookRestores/' + id
        : kind === 'marker'
          ? 'deletedBooks/' + p.bookId
          : 'bookRestoreReservations/' + p.bookId;
    f.metadata.set(path, { createdAt: 1000, createdAtNanoseconds: 99999 });
    await assert.rejects(f.api.getBookRestore(uid, { restoreId: id, jobToken: p.jobToken }), {
      code: 'failed-precondition',
    });
  }
});
test('key binds context and secret, is issued once, and never appears in progress or receipts', async () => {
  const f = fixture(),
    p = (await start(f)).progress;
  await assert.rejects(f.api.appendBookRestoreChunk(uid, appendRequest(p)), {
    code: 'failed-precondition',
    details: { reason: 'recovery-not-ready' },
  });
  await assert.rejects(key(f, p, { reviewHash: 'b'.repeat(64) }), { code: 'failed-precondition' });
  await assert.rejects(key(f, p, { expectedKeyId: 'c'.repeat(64) }), {
    code: 'failed-precondition',
  });
  const k = await key(f, p);
  assert.equal(Buffer.from(k.keyBase64, 'base64').length, 32);
  assert.deepEqual(await key(f, p), k);
  const list = await f.api.listBookRestores(uid, {});
  assert.equal(JSON.stringify(list).includes(k.keyBase64), false);
  assert.equal(JSON.stringify(list).includes('keyFingerprint'), false);
  const path = 'users/' + uid + '/bookRestoreRecoveryKeys/' + id,
    original = f.records.get(path);
  f.records.set(path, { ...original, keyBase64: Buffer.alloc(32, 2).toString('base64') });
  await assert.rejects(key(f, p), { code: 'failed-precondition' });
  await assert.rejects(f.api.appendBookRestoreChunk(uid, appendRequest(p)), {
    code: 'failed-precondition',
  });
  f.records.delete(path);
  await assert.rejects(key(f, p), { code: 'failed-precondition' });
});
test('append verifies bytes, contiguous position, CAS and request identity atomically', async () => {
  const f = fixture(),
    p = await prepare(f);
  for (const changes of [
    { chunkHash: 'f'.repeat(64) },
    { chunkBase64: 'AB==' },
    { index: 1 },
    { expectedCheckpoint: 1 },
    { chunkBase64: Buffer.alloc(65537).toString('base64') },
  ])
    await assert.rejects(f.api.appendBookRestoreChunk(uid, { ...appendRequest(p), ...changes }));
  assert.equal(
    f.records.has('users/' + uid + '/bookRestores/' + id + '/chunks/000000000000000'),
    false,
  );
  const request = appendRequest(p),
    first = await f.api.appendBookRestoreChunk(uid, request);
  assert.equal(first.progress.uploadedBytes, 65536);
  assert.equal(first.progress.state, 'uploading');
  assert.equal(first.receipt.checkpoint, 1);
  const second = await f.api.appendBookRestoreChunk(
    uid,
    appendRequest(first.progress, 1, 'upload-test-000002'),
  );
  assert.equal(second.progress.state, 'uploaded');
  assert.equal(second.progress.uploadedBytes, bytes.length);
  assert.equal(f.records.has('books/' + p.bookId), false);
  const replay = await f.api.appendBookRestoreChunk(uid, request);
  assert.deepEqual(replay.receipt, first.receipt);
  assert.equal(replay.progress.checkpoint, 2);
  assert.equal(replay.progress.state, 'uploaded');
  await assert.rejects(
    f.api.appendBookRestoreChunk(uid, {
      ...request,
      chunkHash: sha256(Buffer.alloc(65536, 66)),
      chunkBase64: Buffer.alloc(65536, 66).toString('base64'),
    }),
    { code: 'invalid-argument' },
  );
  const resolved = await f.api.resolveBookRestoreOperation(uid, {
    restoreId: id,
    jobToken: p.jobToken,
    operationId: request.operationId,
    requestHash: requestHash('appendBookRestoreChunk', chunkInput(request)),
  });
  assert.deepEqual(resolved, replay);
  const unknown = await f.api.resolveBookRestoreOperation(uid, {
    restoreId: id,
    jobToken: p.jobToken,
    operationId: 'unknown-test-00001',
    requestHash: 'f'.repeat(64),
  });
  assert.equal(unknown.kind, 'unknown');
  await assert.rejects(
    f.api.appendBookRestoreChunk(
      uid,
      appendRequest(second.progress, 2, 'upload-test-000003', Buffer.from('x')),
    ),
    { code: 'failed-precondition' },
  );
});
test('same checkpoint concurrent appends produce one receipt and one conflict', async () => {
  const f = fixture(),
    p = await prepare(f);
  const result = await Promise.allSettled([
    f.api.appendBookRestoreChunk(uid, appendRequest(p)),
    f.api.appendBookRestoreChunk(uid, appendRequest(p, 0, 'upload-test-other1')),
  ]);
  assert.equal(result.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(result.find((r) => r.status === 'rejected').reason.code, 'failed-precondition');
  assert.equal((await f.api.getBookRestore(uid, { restoreId: id })).uploadedChunks, 1);
});
test('cancel removes key, bounded cleanup removes raw bytes and keeps permanent metadata', async () => {
  const f = fixture();
  let p = await prepare(f);
  p = (await f.api.appendBookRestoreChunk(uid, appendRequest(p))).progress;
  p = (await f.api.appendBookRestoreChunk(uid, appendRequest(p, 1, 'upload-test-000002'))).progress;
  const cancel = mutation(p, 'cancel-test-000001');
  let result = await f.api.cancelBookRestore(uid, cancel);
  p = result.progress;
  assert.equal(p.state, 'cancelling');
  assert.equal(f.records.has('users/' + uid + '/bookRestoreRecoveryKeys/' + id), false);
  await assert.rejects(key(f, p), { code: 'failed-precondition' });
  const request = mutation(p, 'cleanup-test-00001', { limit: 1 });
  result = await f.api.advanceBookRestoreCleanup(uid, request);
  assert.equal(result.progress.state, 'cancelling');
  assert.equal(result.progress.cleanedChunks, 1);
  assert.deepEqual(await f.api.advanceBookRestoreCleanup(uid, request), result);
  result = await f.api.advanceBookRestoreCleanup(
    uid,
    mutation(result.progress, 'cleanup-test-00002', { limit: 1 }),
  );
  assert.equal(result.progress.state, 'cancelled');
  assert.equal(result.progress.cleanedChunks, 2);
  assert.equal(
    [...f.records.keys()].some((path) => path.includes('/chunks/')),
    false,
  );
  assert.equal(f.records.has('deletedBooks/' + p.bookId), true);
  assert.equal(f.records.has('bookRestoreReservations/' + p.bookId), true);
  const late = await f.api.cancelBookRestore(uid, cancel);
  assert.equal(late.receipt.state, 'cancelling');
  assert.equal(late.progress.state, 'cancelled');
  assert.ok(
    f.reads
      .filter((r) => r.collectionPath.endsWith('/chunks'))
      .every((r) => r.maximum === 2 && !r.fields.includes('chunkBase64')),
  );
  assert.ok(
    f.commits.every(
      (w) => w.filter((v) => v.method === 'delete' && v.path.includes('/chunks/')).length <= 1,
    ),
  );
});
test('cleanup counts only actual deletions, rejects foreign children and protects unexpected roots', async () => {
  const f = fixture();
  let p = await prepare(f);
  p = (await f.api.appendBookRestoreChunk(uid, appendRequest(p))).progress;
  p = (await f.api.cancelBookRestore(uid, mutation(p, 'cancel-test-000001'))).progress;
  const path = 'users/' + uid + '/bookRestores/' + id + '/chunks/000000000000000',
    child = f.records.get(path);
  f.records.set(path, { ...child, ownerId: 'other' });
  await assert.rejects(
    f.api.advanceBookRestoreCleanup(uid, mutation(p, 'cleanup-test-00001', { limit: 1 })),
    { code: 'failed-precondition' },
  );
  assert.equal(f.records.has(path), true);
  f.records.delete(path);
  f.records.set('books/' + p.bookId, { authorId: 'author' });
  await assert.rejects(
    f.api.advanceBookRestoreCleanup(uid, mutation(p, 'cleanup-test-00001', { limit: 1 })),
    { code: 'failed-precondition', details: { reason: 'target-present' } },
  );
  f.records.delete('books/' + p.bookId);
  const done = await f.api.advanceBookRestoreCleanup(
    uid,
    mutation(p, 'cleanup-test-00001', { limit: 1 }),
  );
  assert.equal(done.progress.state, 'cancelled');
  assert.equal(done.progress.cleanedChunks, 0);
});
test('cancel before any bytes still certifies empty chunks and revokes late append', async () => {
  const f = fixture(),
    p = (await start(f)).progress;
  const cancelled = await f.api.cancelBookRestore(uid, mutation(p, 'cancel-test-000001'));
  const done = await f.api.advanceBookRestoreCleanup(
    uid,
    mutation(cancelled.progress, 'cleanup-test-00001', { limit: 50 }),
  );
  assert.equal(done.progress.state, 'cancelled');
  assert.equal(done.progress.uploadedChunks, 0);
  await assert.rejects(f.api.appendBookRestoreChunk(uid, appendRequest(p)), {
    code: 'failed-precondition',
  });
});
test('start resolver installs a permanent fence; late starts cannot allocate a job', async () => {
  const f = fixture(),
    request = startRequest(),
    hash = requestHash('startBookRestore', startInput(request));
  const input = { operationId: id, requestHash: hash, intent: 'cancel' };
  const terminal = await f.api.resolveBookRestoreStart(uid, input);
  assert.equal(terminal.kind, 'cancelled');
  assert.deepEqual(await start(f), terminal);
  assert.deepEqual(await f.api.resolveBookRestoreStart(uid, input), terminal);
  assert.equal(f.records.has('users/' + uid + '/bookRestores/' + id), false);
  assert.equal(f.records.size, 3);
  await assert.rejects(start(f, { ...request, reviewHash: 'b'.repeat(64) }), {
    code: 'invalid-argument',
  });
  const fence = f.records.get('users/' + uid + '/bookRestoreStartFences/' + id);
  fence.ownerId = 'other';
  await assert.rejects(start(f), { code: 'failed-precondition' });
});
test('resolver finding an existing start only confirms it and preserves its key', async () => {
  const f = fixture(),
    request = startRequest(),
    p = await prepare(f);
  const result = await f.api.resolveBookRestoreStart(uid, {
    operationId: id,
    requestHash: requestHash('startBookRestore', startInput(request)),
    intent: 'cancel',
  });
  assert.equal(result.kind, 'confirmed');
  assert.equal(result.progress.state, 'uploading');
  assert.equal(result.progress.jobToken, p.jobToken);
  assert.equal(result.progress.recoveryReady, true);
});
test('list uses bounded deterministic pages, binds cursor to owner, and excludes secrets', async () => {
  const f = fixture();
  for (let i = 0; i < 4; i++) await start(f, startRequest('restore-list-0000' + i));
  const one = await f.api.listBookRestores(uid, { limit: 2 });
  assert.equal(one.items.length, 2);
  assert.ok(one.nextCursor);
  const two = await f.api.listBookRestores(uid, { limit: 2, cursor: one.nextCursor });
  assert.equal(two.items.length, 2);
  assert.equal(two.nextCursor, null);
  assert.equal(new Set([...one.items, ...two.items].map((x) => x.restoreId)).size, 4);
  await assert.rejects(f.api.listBookRestores('other', { cursor: one.nextCursor }), {
    code: 'invalid-argument',
  });
  for (const input of [{ limit: 0 }, { limit: 51 }, { cursor: '!' }, { ownerId: 'other' }])
    await assert.rejects(f.api.listBookRestores(uid, input), { code: 'invalid-argument' });
  assert.ok(f.reads.every((r) => r.maximum <= 51));
});
test('unsupported sources, malformed IDs and unknown cleanup schemas fail closed', async () => {
  const f = fixture();
  for (const input of [
    { ...startRequest(), operationId: 'bad' },
    { ...startRequest(), source: { ...startRequest().source, version: 7 } },
    { ...startRequest(), source: { ...startRequest().source, byteLength: 0 } },
  ])
    await assert.rejects(start(f, input), { code: 'invalid-argument' });
  for (let version = 1; version <= 6; version++)
    await start(f, {
      ...startRequest('restore-legacy-00' + version),
      source: { ...startRequest().source, format: 'writer-book-backup', version },
    });
  const p = (await start(f)).progress;
  f.records.get('users/' + uid + '/bookRestores/' + id).cleanupVersion = 2;
  await assert.rejects(f.api.getBookRestore(uid, { restoreId: id, jobToken: p.jobToken }), {
    code: 'failed-precondition',
  });
});
test('private cache headers cover all callable methods without affecting unrelated calls', () => {
  const values = [];
  for (const method of [
    'startBookRestore',
    'appendBookRestoreChunk',
    'listBookRestores',
    'cancelBookRestore',
    'other',
  ])
    setBookRestoreHeaders(method, {
      rawRequest: { res: { setHeader: (...args) => values.push(args) } },
    });
  assert.deepEqual(
    values,
    Array.from({ length: 4 }, () => [
      ['Cache-Control', 'private, no-store'],
      ['Vary', 'Authorization'],
    ]).flat(),
  );
});
