import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { createBookRestoreUploadService } from '../src/bookRestoreUpload.mjs';
import { requestHash, mutationInput, chunkId } from '../src/bookRestoreUploadContracts.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import { BOOK_RESTORE_READ_BYTES } from '../src/bookRestoreIntegrityRead.mjs';
import { encodeBookBackup, decodeBookBackup } from '../src/bookBackupContainer.mjs';
const uid = 'author',
  id = 'restore-integrity-001';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const bytes = (n) => Buffer.from(Array.from({ length: n }, (_, i) => (i * 17 + 13) % 256));
function fixture() {
  const f = adventureImportDb();
  return { ...f, api: createBookRestoreUploadService({ db: f.db, now: () => 1000 }) };
}
const mutate = (p, operationId, extra = {}) => ({
  restoreId: p.restoreId,
  jobToken: p.jobToken,
  operationId,
  expectedCheckpoint: p.checkpoint,
  ...extra,
});
const advance = (f, p, operationId = 'integrity-step-0001', limit = 1) =>
  f.api.advanceBookRestoreIntegrity(uid, mutate(p, operationId, { limit }));
const root = () => 'users/' + uid + '/bookRestores/' + id;
async function uploaded(f, data = bytes(131079), hash = sha(data)) {
  let p = (
    await f.api.startBookRestore(uid, {
      operationId: id,
      source: { format: 'writer-book-archive', version: 1, byteLength: data.length, sha256: hash },
      reviewHash: 'a'.repeat(64),
    })
  ).progress;
  await f.api.getBookRestoreRecoveryKey(uid, {
    restoreId: id,
    jobToken: p.jobToken,
    reviewHash: p.reviewHash,
  });
  for (let index = 0; index < Math.ceil(data.length / 65536); index++) {
    const part = data.subarray(index * 65536, (index + 1) * 65536);
    p = (
      await f.api.appendBookRestoreChunk(
        uid,
        mutate(p, 'upload-integrity-' + String(index).padStart(3, '0'), {
          index,
          chunkHash: sha(part),
          chunkBase64: part.toString('base64'),
        }),
      )
    ).progress;
  }
  return p;
}
async function complete(f, p, limit = 1) {
  let step = 0;
  while (['uploaded', 'checking'].includes(p.state))
    p = (await advance(f, p, 'integrity-full-' + String(step++).padStart(4, '0'), limit)).progress;
  return p;
}
test('SHA-256 matches independent Node vectors across block, padding and upload boundaries', async () => {
  for (const size of [1, 55, 56, 63, 64, 65, 65535, 65536, 65537, 131079]) {
    const f = fixture(),
      data = bytes(size),
      p = await complete(f, await uploaded(f, data));
    assert.equal(p.state, 'bytes-verified');
    assert.equal(p.integrity.checkedBytes, size);
    assert.equal(f.records.get(root()).integrityDigest, sha(data));
    assert.equal(f.records.has(root() + '/integrityState/current'), false);
    assert.equal(f.records.has('books/' + p.bookId), false);
  }
});
test('resume from private SHA state in a new service instance; receipts contain only metadata', async () => {
  const f = fixture(),
    p = await uploaded(f),
    request = mutate(p, 'integrity-step-0001', { limit: 1 }),
    first = await f.api.advanceBookRestoreIntegrity(uid, request);
  assert.equal(first.progress.state, 'checking');
  assert.equal(first.progress.integrity.checkedChunks, 1);
  const state = f.records.get(root() + '/integrityState/current');
  assert.ok(state.hashState);
  assert.equal(f.records.get(root()).hashState, undefined);
  f.api = createBookRestoreUploadService({ db: f.db, now: () => 1000 });
  const two = await advance(f, first.progress, 'integrity-step-0002'),
    last = await advance(f, two.progress, 'integrity-step-0003');
  assert.equal(last.progress.state, 'bytes-verified');
  const replay = await f.api.advanceBookRestoreIntegrity(uid, request);
  assert.deepEqual(replay.receipt, first.receipt);
  assert.equal(replay.progress.state, 'bytes-verified');
  const normalized = { ...mutationInput(request, ['limit']), limit: request.limit };
  const resolved = await f.api.resolveBookRestoreOperation(uid, {
    restoreId: id,
    jobToken: p.jobToken,
    operationId: request.operationId,
    requestHash: requestHash('advanceBookRestoreIntegrity', normalized),
  });
  assert.deepEqual(resolved, replay);
  const list = await f.api.listBookRestores(uid, {});
  for (const value of [first, last, replay, list]) {
    assert.equal(JSON.stringify(value).includes(state.hashState), false);
    assert.equal(JSON.stringify(value).includes('hashState'), false);
  }
});
test('chunk corruption, missing chunks, foreign context and occupied proof fail without progress', async () => {
  for (const mode of ['body', 'missing', 'owner', 'proof']) {
    const f = fixture(),
      p = await uploaded(f),
      path = root() + '/chunks/' + chunkId(0),
      value = f.records.get(path);
    if (mode === 'body')
      f.records.set(path, { ...value, chunkBase64: Buffer.alloc(65536).toString('base64') });
    if (mode === 'missing') f.records.delete(path);
    if (mode === 'owner') f.records.set(path, { ...value, ownerId: 'other' });
    if (mode === 'proof')
      f.records.set(root() + '/integrityProofs/' + chunkId(0), { ownerId: 'other' });
    await assert.rejects(advance(f, p), { code: 'failed-precondition' });
    assert.equal(f.records.get(root()).checkpoint, p.checkpoint);
    assert.equal(f.records.has(root() + '/integrityState/current'), false);
  }
});
test('saved SHA context is bound, missing/incompatible/altered state never restarts hashing', async () => {
  for (const mode of ['missing', 'algorithm', 'bytes', 'checkpoint', 'owner']) {
    const f = fixture();
    let p = await uploaded(f);
    p = (await advance(f, p)).progress;
    const path = root() + '/integrityState/current',
      state = f.records.get(path),
      before = f.records.get(root()).checkpoint;
    if (mode === 'missing') f.records.delete(path);
    else if (mode === 'algorithm') f.records.set(path, { ...state, algorithm: 'sha256/future' });
    else if (mode === 'bytes')
      f.records.set(path, { ...state, hashState: Buffer.alloc(116).toString('base64') });
    else if (mode === 'checkpoint')
      f.records.set(path, { ...state, checkpoint: state.checkpoint + 1 });
    else f.records.set(path, { ...state, ownerId: 'other' });
    await assert.rejects(advance(f, p, 'integrity-step-0002'), { code: 'failed-precondition' });
    assert.equal(f.records.get(root()).checkpoint, before);
  }
});
test('full file hash and chain mismatches reject durably without activation or retaining SHA state', async () => {
  for (const mode of ['hash', 'chain']) {
    const f = fixture();
    const p = await uploaded(f, bytes(65537), mode === 'hash' ? '0'.repeat(64) : undefined);
    if (mode === 'chain') f.records.get(root()).uploadedChainHash = 'f'.repeat(64);
    const result = await advance(f, p, 'integrity-reject-001', 16);
    assert.equal(result.progress.state, 'rejected');
    assert.equal(
      result.progress.integrity.failure,
      mode === 'hash' ? 'file-hash-mismatch' : 'upload-chain-mismatch',
    );
    assert.equal(f.records.has(root() + '/integrityState/current'), false);
    assert.equal(f.records.has('books/' + p.bookId), false);
    await assert.rejects(
      f.api.openVerifiedBookRestoreSource(uid, { restoreId: id, jobToken: p.jobToken }),
      { code: 'failed-precondition' },
    );
    assert.equal(
      (
        await f.api.advanceBookRestoreIntegrity(
          uid,
          mutate(p, 'integrity-reject-001', { limit: 16 }),
        )
      ).receipt.state,
      'rejected',
    );
  }
});
test('verified source bounds each read, supports crossing chunks and invalidates native chunk ABA', async () => {
  const f = fixture(),
    data = bytes(131079),
    p = await complete(f, await uploaded(f, data));
  const source = await f.api.openVerifiedBookRestoreSource(uid, {
    restoreId: id,
    jobToken: p.jobToken,
  });
  assert.equal(source.size, data.length);
  for (const [offset, length] of [
    [0, 0],
    [0, 65536],
    [65530, 30],
    [65536, 65536],
    [131070, 9],
  ])
    assert.deepEqual(
      Buffer.from(await source.read(offset, length)),
      data.subarray(offset, offset + length),
    );
  for (const [offset, length] of [
    [-1, 2],
    [0, BOOK_RESTORE_READ_BYTES + 1],
    [data.length, 1],
  ])
    await assert.rejects(source.read(offset, length), { code: 'invalid-argument' });
  const path = root() + '/chunks/' + chunkId(0);
  f.metadata.set(path, { createdAt: 1000, createdAtNanoseconds: 99999 });
  await assert.rejects(source.read(0, 1), { code: 'failed-precondition' });
});
test('verified source rejects changed proof, body and authorization without exposing stale bytes', async () => {
  for (const mode of ['proof', 'body', 'root', 'cancel']) {
    const f = fixture(),
      p = await complete(f, await uploaded(f, bytes(65)));
    const source = await f.api.openVerifiedBookRestoreSource(uid, {
      restoreId: id,
      jobToken: p.jobToken,
    });
    if (mode === 'proof')
      f.records.get(root() + '/integrityProofs/' + chunkId(0)).jobToken = 'f'.repeat(64);
    else if (mode === 'body')
      f.records.get(root() + '/chunks/' + chunkId(0)).chunkBase64 =
        Buffer.alloc(65).toString('base64');
    else if (mode === 'root') f.records.set('books/' + p.bookId, { authorId: uid });
    else await f.api.cancelBookRestore(uid, mutate(p, 'cancel-integrity-01'));
    await assert.rejects(source.read(0, 1), { code: 'failed-precondition' });
  }
  const f = fixture(),
    p = await complete(f, await uploaded(f, bytes(1)));
  await assert.rejects(
    f.api.openVerifiedBookRestoreSource('other', { restoreId: id, jobToken: p.jobToken }),
    { code: 'not-found' },
  );
});
test('checkpoint race advances exactly once; cancellation invalidates any late advance', async () => {
  const f = fixture(),
    p = await uploaded(f);
  const results = await Promise.allSettled([advance(f, p), advance(f, p, 'integrity-race-0002')]);
  assert.equal(results.filter((v) => v.status === 'fulfilled').length, 1);
  assert.equal(results.find((v) => v.status === 'rejected').reason.code, 'failed-precondition');
  const current = results.find((v) => v.status === 'fulfilled').value.progress;
  await f.api.cancelBookRestore(uid, mutate(current, 'cancel-integrity-01'));
  await assert.rejects(advance(f, current, 'integrity-late-0001'), { code: 'failed-precondition' });
});
test('cleanup v2 deletes chunks, proofs and SHA state in bounded phases; v1 is unchanged', async () => {
  for (const mode of ['partial', 'verified', 'rejected']) {
    const f = fixture();
    let p = await uploaded(f, bytes(65537), mode === 'rejected' ? '0'.repeat(64) : undefined);
    p = mode === 'partial' ? (await advance(f, p)).progress : await complete(f, p);
    const source =
      mode === 'verified'
        ? await f.api.openVerifiedBookRestoreSource(uid, { restoreId: id, jobToken: p.jobToken })
        : null;
    p = (await f.api.cancelBookRestore(uid, mutate(p, 'cancel-integrity-01'))).progress;
    let step = 0;
    while (p.state !== 'cancelled') {
      const request = mutate(p, 'cleanup-integrity-' + String(step++).padStart(3, '0'), {
          limit: 1,
        }),
        result = await f.api.advanceBookRestoreCleanup(uid, request);
      assert.deepEqual(await f.api.advanceBookRestoreCleanup(uid, request), result);
      p = result.progress;
      assert.ok(step < 12);
    }
    assert.equal(p.integrity.cleanupPhase, 'done');
    assert.equal(
      [...f.records.keys()].some((path) => path.startsWith(root() + '/')),
      false,
    );
    assert.equal(f.records.has('deletedBooks/' + p.bookId), true);
    assert.equal(f.records.has('bookRestoreReservations/' + p.bookId), true);
    if (source) await assert.rejects(source.read(0, 1), { code: 'failed-precondition' });
    assert.ok(
      f.commits.every(
        (w) =>
          w.filter((v) => v.method === 'delete' && /\/(chunks|integrityProofs)\//.test(v.path))
            .length <= 1,
      ),
    );
  }
});
test('cleanup refuses foreign proof/state and reappearing parts instead of deleting another context', async () => {
  for (const mode of ['proof', 'state', 'late-chunk']) {
    const f = fixture();
    let p = await uploaded(f, bytes(65537));
    p = (await advance(f, p)).progress;
    p = (await f.api.cancelBookRestore(uid, mutate(p, 'cancel-integrity-01'))).progress;
    p = (
      await f.api.advanceBookRestoreCleanup(uid, mutate(p, 'cleanup-integrity-01', { limit: 50 }))
    ).progress;
    assert.equal(p.integrity.cleanupPhase, 'proofs');
    if (mode === 'proof') {
      f.records.get(root() + '/integrityProofs/' + chunkId(0)).ownerId = 'other';
      await assert.rejects(
        f.api.advanceBookRestoreCleanup(uid, mutate(p, 'cleanup-integrity-02', { limit: 50 })),
        { code: 'failed-precondition' },
      );
    } else {
      p = (
        await f.api.advanceBookRestoreCleanup(uid, mutate(p, 'cleanup-integrity-02', { limit: 50 }))
      ).progress;
      if (mode === 'state') f.records.get(root() + '/integrityState/current').ownerId = 'other';
      else f.records.set(root() + '/chunks/' + chunkId(0), { ownerId: 'other' });
      await assert.rejects(
        f.api.advanceBookRestoreCleanup(uid, mutate(p, 'cleanup-integrity-03', { limit: 50 })),
        { code: 'failed-precondition' },
      );
    }
  }
});
test('unknown limits, DTO fields, pre-upload state and changed start source fail closed', async () => {
  const f = fixture(),
    p = await uploaded(f);
  for (const limit of [0, 17, NaN])
    await assert.rejects(advance(f, p, 'integrity-invalid-1', limit), { code: 'invalid-argument' });
  await assert.rejects(
    f.api.advanceBookRestoreIntegrity(uid, {
      ...mutate(p, 'integrity-invalid-1', { limit: 1 }),
      hashState: 'forged',
    }),
    { code: 'invalid-argument' },
  );
  f.records.get(root()).source.sha256 = 'f'.repeat(64);
  await assert.rejects(advance(f, p), { code: 'failed-precondition' });
});

test('one integrity request processes at most sixteen parts and leaves the remainder resumable', async () => {
  const f = fixture(),
    data = bytes(16 * 65536 + 7),
    p = await uploaded(f, data);
  const first = await advance(f, p, 'integrity-max-page01', 16);
  assert.equal(first.progress.state, 'checking');
  assert.equal(first.progress.integrity.checkedBytes, 16 * 65536);
  assert.equal(
    [...f.records.keys()].filter((path) => path.startsWith(root() + '/integrityProofs/')).length,
    16,
  );
  assert.equal(f.records.has(root() + '/integrityProofs/' + chunkId(16)), false);
  const last = await advance(f, first.progress, 'integrity-max-page02', 16);
  assert.equal(last.progress.state, 'bytes-verified');
  assert.equal(f.records.get(root()).integrityDigest, sha(data));
  const source = await f.api.openVerifiedBookRestoreSource(uid, {
    restoreId: id,
    jobToken: p.jobToken,
  });
  assert.deepEqual(
    Buffer.from(await source.read(65000, BOOK_RESTORE_READ_BYTES)),
    data.subarray(65000, 65000 + BOOK_RESTORE_READ_BYTES),
  );
  await assert.rejects(source.read(0, BOOK_RESTORE_READ_BYTES + 1), { code: 'invalid-argument' });
});
test('unrecorded trailing chunks never receive a complete integrity receipt', async () => {
  const f = fixture(),
    p = await uploaded(f, bytes(1));
  f.records.set(root() + '/chunks/' + chunkId(1), { ownerId: 'other' });
  await assert.rejects(advance(f, p), { code: 'failed-precondition' });
  assert.equal(f.records.get(root()).checkpoint, p.checkpoint);
});

test('verified byte source interoperates with real framing at a full payload boundary', async () => {
  const payload = Buffer.alloc(65536, 75),
    segments = [];
  for await (const segment of encodeBookBackup([
    { kind: 'chapter', id: 'chapter', part: 0, payload },
  ]))
    segments.push(segment);
  const archive = Buffer.concat(segments),
    f = fixture(),
    p = await complete(f, await uploaded(f, archive));
  const source = await f.api.openVerifiedBookRestoreSource(uid, {
      restoreId: id,
      jobToken: p.jobToken,
    }),
    stream = decodeBookBackup(source);
  const first = await stream.next();
  assert.equal(first.done, false);
  assert.deepEqual(Buffer.from(first.value.payload), payload);
  const end = await stream.next();
  assert.equal(end.done, true);
  assert.equal(end.value.archiveBytes, archive.length);
});
