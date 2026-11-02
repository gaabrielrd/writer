import test from 'node:test';
import assert from 'node:assert/strict';
import { createStudioService } from '../src/studio.mjs';
import { createScenesService } from '../src/scenes.mjs';
import { createAdventureBackupSourceService } from '../src/adventureBackupSource.mjs';
import {
  transferFixture,
  upload,
  verify,
  cleanup,
  uid,
  id,
  request,
  mutation,
  chunkRequest,
  hash,
} from './helpers/adventureRestoreTransferFixture.mjs';
import { startInput, requestHash, targetId, bornEqual } from '../src/adventureRestoreContracts.mjs';
test('atomic native reservation stays invisible and start replay preserves the same identity', async () => {
  const f = transferFixture(),
    one = await f.api.startAdventureRestore(uid, f.input),
    p = one.progress;
  const paths = [
    f.path,
    'adventures/' + p.adventureId,
    'adventureRestoreReservations/' + p.adventureId,
    'users/' + uid + '/adventureRestoreOperations/' + id,
  ];
  const docs = await Promise.all(paths.map((path) => f.db.doc(path).get()));
  assert.ok(docs.every((d) => bornEqual(d, docs[0])));
  assert.equal(Object.hasOwn(f.records.get(paths[1]), 'ownerId'), false);
  assert.equal(p.adventureId.length <= 80, true);
  assert.deepEqual(await f.api.startAdventureRestore(uid, f.input), one);
  const studio = createStudioService({ db: f.db });
  assert.equal(await studio.getAdventure(uid, { id: p.adventureId }), null);
  await assert.rejects(
    studio.createAdventure(uid, { operationId: p.adventureId, title: 'Collision' }),
  );
  await assert.rejects(
    createScenesService({ db: f.db }).createScene(uid, {
      target: { kind: 'adventure', id: p.adventureId },
      operationId: 'adventure-stub-scene-0001',
      title: 'No',
    }),
  );
  await assert.rejects(
    createAdventureBackupSourceService({ db: f.db }).getAdventureBackupSource(uid, {
      adventureId: p.adventureId,
    }),
    { code: 'not-found' },
  );
  assert.deepEqual(f.records.get(paths[1]), {
    schemaVersion: 1,
    kind: 'adventure-restore-pending',
    restoreOwnerId: uid,
    restoreId: id,
    startFingerprint: requestHash('startAdventureRestore', startInput(f.input)),
  });
});
test('actual uploaded bytes pass independent full SHA with resumable private states and safe metadata', async () => {
  const f = transferFixture(),
    uploaded = await upload(f),
    p = await verify(f, uploaded);
  assert.equal(uploaded.state, 'uploaded');
  assert.equal(p.state, 'bytes-verified');
  assert.equal(p.integrityDigest, hash(f.bytes));
  assert.equal(p.checkedChunks, 3);
  assert.equal(p.checkedBytes, f.bytes.length);
  assert.equal(f.records.get(f.path).writtenStates, 2);
  for (const value of [
    p,
    await f.api.listAdventureRestores(uid, { limit: 1 }),
    await f.api.getAdventureRestore(uid, { restoreId: id }),
  ]) {
    const json = JSON.stringify(value);
    assert.equal(json.includes('chunkBase64'), false);
    assert.equal(json.includes('hashState'), false);
    assert.equal(json.includes(f.bytes.toString('base64').slice(0, 100)), false);
  }
});
test('cancelled transfer removes bytes/proofs/hash state but retains the exclusive private root', async () => {
  const f = transferFixture(),
    p = await verify(f, await upload(f)),
    done = await cleanup(f, p, 1);
  assert.equal(done.state, 'cancelled');
  for (const collection of ['chunks', 'integrityProofs', 'integrityStates'])
    assert.equal(
      [...f.records.keys()].filter((p) => p.startsWith(f.path + '/' + collection + '/')).length,
      0,
    );
  assert.equal(f.records.get('adventures/' + done.adventureId).kind, 'adventure-restore-retired');
  assert.equal(Object.hasOwn(f.records.get('adventures/' + done.adventureId), 'ownerId'), false);
  assert.deepEqual(await f.api.getAdventureRestore(uid, { restoreId: id }), done);
  const replay = await f.api.startAdventureRestore(uid, f.input);
  assert.equal(replay.receipt.state, 'uploading');
  assert.equal(replay.progress.state, 'cancelled');
});
test('an unknown start cancellation fences a late start without allocating a job or file', async () => {
  const f = transferFixture(),
    fingerprint = requestHash('startAdventureRestore', startInput(f.input));
  const canceled = await f.api.resolveAdventureRestoreStart(uid, {
    operationId: id,
    requestHash: fingerprint,
    intent: 'cancel',
  });
  assert.equal(canceled.kind, 'cancelled');
  assert.deepEqual(await f.api.startAdventureRestore(uid, f.input), canceled);
  assert.equal(f.records.has(f.path), false);
  assert.equal(
    f.records.get('adventures/' + targetId(uid, id, fingerprint)).kind,
    'adventure-restore-retired',
  );
});

test('same append is idempotent and historic receipt never replaces the latest progress', async () => {
  const f = transferFixture(),
    start = (await f.api.startAdventureRestore(uid, f.input)).progress,
    one = chunkRequest(start, f.bytes, 0);
  const a = await f.api.appendAdventureRestoreChunk(uid, one),
    b = await f.api.appendAdventureRestoreChunk(uid, one);
  assert.deepEqual(a, b);
  const p = (await f.api.appendAdventureRestoreChunk(uid, chunkRequest(a.progress, f.bytes, 1)))
    .progress;
  const replay = await f.api.appendAdventureRestoreChunk(uid, one);
  assert.equal(replay.receipt.checkpoint, 1);
  assert.equal(replay.progress.checkpoint, p.checkpoint);
  const { chunkInput } = await import('../src/adventureRestoreContracts.mjs');
  const resolved = await f.api.resolveAdventureRestoreOperation(uid, {
    restoreId: id,
    jobToken: p.jobToken,
    operationId: one.operationId,
    requestHash: requestHash('appendAdventureRestoreChunk', chunkInput(one)),
  });
  assert.deepEqual(resolved, replay);
  const absent = await f.api.resolveAdventureRestoreOperation(uid, {
    restoreId: id,
    jobToken: p.jobToken,
    operationId: 'adventure-unresolved-0001',
    requestHash: 'c'.repeat(64),
  });
  assert.equal(absent.kind, 'unresolved');
  assert.equal(absent.progress.checkpoint, p.checkpoint);
});
test('competing checkpoints commit exactly once and reject reuse of an operation with different content', async () => {
  const f = transferFixture(),
    p = (await f.api.startAdventureRestore(uid, f.input)).progress,
    a = chunkRequest(p, f.bytes, 0, 'adventure-race-one-0001'),
    b = chunkRequest(p, f.bytes, 0, 'adventure-race-two-0001');
  const results = await Promise.allSettled([
    f.api.appendAdventureRestoreChunk(uid, a),
    f.api.appendAdventureRestoreChunk(uid, b),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(f.records.get(f.path).uploadedChunks, 1);
  const good = results[0].status === 'fulfilled' ? a : b;
  const changed = Buffer.alloc(65536, 66);
  await assert.rejects(
    f.api.appendAdventureRestoreChunk(uid, {
      ...good,
      chunkHash: hash(changed),
      chunkBase64: changed.toString('base64'),
    }),
  );
  assert.equal(f.records.get(f.path).uploadedChunks, 1);
});
test('an independent full-file digest mismatch is rejected even though every chunk hash is valid', async () => {
  const f = transferFixture();
  f.input.source.sha256 = '0'.repeat(64);
  const p = await verify(f, await upload(f), 16);
  assert.equal(p.state, 'rejected');
  assert.equal(p.integrityFailure, 'file-hash-mismatch');
  assert.equal(p.integrityDigest, hash(f.bytes));
  assert.equal(f.records.get('adventures/' + p.adventureId).kind, 'adventure-restore-pending');
});
test('bounds canonical base64, positions, formats and closed inputs before creating effects', async () => {
  const f = transferFixture(),
    p = (await f.api.startAdventureRestore(uid, f.input)).progress,
    before = structuredClone(f.records);
  for (const extra of [
    { chunkBase64: '%%%' },
    { chunkBase64: 'QQ' },
    { chunkHash: '0'.repeat(64) },
    { index: 1 },
    { chunkBase64: Buffer.alloc(65537).toString('base64'), chunkHash: hash(Buffer.alloc(65537)) },
    { providerKey: 'NO' },
  ])
    await assert.rejects(
      f.api.appendAdventureRestoreChunk(uid, { ...chunkRequest(p, f.bytes, 0), ...extra }),
    );
  assert.deepEqual(f.records, before);
  for (const input of [
    { ...f.input, extra: true },
    { ...f.input, source: { ...f.input.source, format: 'writer-book-archive' } },
    { ...f.input, source: { ...f.input.source, version: 2 } },
    { ...f.input, source: { ...f.input.source, byteLength: 15 } },
  ])
    await assert.rejects(f.api.startAdventureRestore(uid, input));
  for (const actor of [null, '', '../bad'])
    await assert.rejects(f.api.startAdventureRestore(actor, f.input), { code: 'unauthenticated' });
});
test('foreign account and stale token cannot access, append or cancel a transfer', async () => {
  const f = transferFixture(),
    p = (await f.api.startAdventureRestore(uid, f.input)).progress;
  await assert.rejects(f.api.getAdventureRestore('other', { restoreId: id }), {
    code: 'not-found',
  });
  await assert.rejects(
    f.api.getAdventureRestore(uid, { restoreId: id, jobToken: 'f'.repeat(64) }),
    { code: 'failed-precondition' },
  );
  await assert.rejects(f.api.appendAdventureRestoreChunk('other', chunkRequest(p, f.bytes, 0)));
  await assert.rejects(
    f.api.cancelAdventureRestore('other', mutation(p, 'adventure-foreign-cancel-0001')),
  );
  assert.equal(f.records.get(f.path).state, 'uploading');
  const other = await f.api.startAdventureRestore('other', f.input);
  assert.notEqual(other.progress.adventureId, p.adventureId);
  assert.notEqual(other.progress.jobToken, p.jobToken);
});
test('metadata pagination is bounded, complete and tied to the account', async () => {
  const f = transferFixture();
  for (let n = 0; n < 7; n++)
    await f.api.startAdventureRestore(
      uid,
      request(f.bytes, 'adventure-page-' + String(n).padStart(6, '0')),
    );
  const ids = [];
  let cursor;
  do {
    const page = await f.api.listAdventureRestores(uid, {
      limit: 2,
      ...(cursor ? { cursor } : {}),
    });
    ids.push(...page.items.map((v) => v.restoreId));
    cursor = page.nextCursor;
  } while (cursor);
  assert.equal(ids.length, 7);
  assert.equal(new Set(ids).size, 7);
  const page = await f.api.listAdventureRestores(uid, { limit: 2 });
  await assert.rejects(f.api.listAdventureRestores('other', { limit: 2, cursor: page.nextCursor }));
  await assert.rejects(f.api.listAdventureRestores(uid, { limit: 51 }));
  await assert.rejects(f.api.listAdventureRestores(uid, { cursor: 'bad!' }));
  assert.ok(f.reads.every((r) => r.maximum <= 50));
});
test('recreated root, reservation, start receipt or job cannot authorize an old token', async () => {
  for (const which of ['root', 'reservation', 'receipt', 'job']) {
    const f = transferFixture(),
      p = (await f.api.startAdventureRestore(uid, f.input)).progress;
    const path = {
        root: 'adventures/' + p.adventureId,
        reservation: 'adventureRestoreReservations/' + p.adventureId,
        receipt: 'users/' + uid + '/adventureRestoreOperations/' + id,
        job: f.path,
      }[which],
      value = structuredClone(f.records.get(path));
    await f.db.runTransaction((tx) => tx.delete(f.db.doc(path)));
    await f.db.runTransaction((tx) => tx.create(f.db.doc(path), value));
    await assert.rejects(f.api.getAdventureRestore(uid, { restoreId: id, jobToken: p.jobToken }));
  }
});
test('an orphan or changed chunk cannot be adopted by the independent verifier', async () => {
  for (const which of ['orphan', 'payload', 'recreated']) {
    const f = transferFixture(),
      p = await upload(f),
      path = f.path + '/chunks/000000000000000';
    if (which === 'orphan')
      await f.db.runTransaction((tx) =>
        tx.create(f.db.doc(f.path + '/chunks/000000000000000a'), { index: 0 }),
      );
    else if (which === 'payload') {
      const value = f.records.get(path);
      value.chunkBase64 = Buffer.alloc(65536, 66).toString('base64');
    } else {
      const value = structuredClone(f.records.get(path));
      await f.db.runTransaction((tx) => tx.delete(f.db.doc(path)));
      await f.db.runTransaction((tx) => tx.create(f.db.doc(path), value));
    }
    await assert.rejects(
      f.api.advanceAdventureRestoreIntegrity(
        uid,
        mutation(p, 'adventure-bad-chunk-0001', { limit: 16 }),
      ),
    );
    assert.equal(f.records.get(f.path).checkedChunks, 0);
  }
});
test('private hash state corruption never falls back to an empty SHA state', async () => {
  const f = transferFixture(),
    uploaded = await upload(f),
    p = (
      await f.api.advanceAdventureRestoreIntegrity(
        uid,
        mutation(uploaded, 'adventure-first-check-0001', { limit: 1 }),
      )
    ).progress;
  const job = f.records.get(f.path),
    state = f.records.get(f.path + '/integrityStates/' + job.integrityStateId);
  state.hashState.state = 'AAAA';
  await assert.rejects(
    f.api.advanceAdventureRestoreIntegrity(
      uid,
      mutation(p, 'adventure-second-check-0001', { limit: 1 }),
    ),
  );
  assert.equal(f.records.get(f.path).checkedChunks, 1);
});
test('a transaction failure after its first proof write rolls back the entire batch and exact retry succeeds', async () => {
  const f = transferFixture(),
    p = await upload(f),
    before = structuredClone(f.records),
    run = f.db.runTransaction.bind(f.db),
    failure = Error('injected write failure');
  f.db.runTransaction = (callback) =>
    run((tx) => {
      let proofs = 0;
      return callback({
        ...tx,
        create(ref, value) {
          if (ref.path.includes('/integrityProofs/') && ++proofs === 2) throw failure;
          return tx.create(ref, value);
        },
      });
    });
  const input = mutation(p, 'adventure-rollback-integrity-0001', { limit: 16 });
  await assert.rejects(
    f.api.advanceAdventureRestoreIntegrity(uid, input),
    (error) => error === failure,
  );
  assert.deepEqual(f.records, before);
  f.db.runTransaction = run;
  const result = await f.api.advanceAdventureRestoreIntegrity(uid, input);
  assert.equal(result.progress.state, 'bytes-verified');
  assert.deepEqual(await f.api.advanceAdventureRestoreIntegrity(uid, input), result);
});
test('an automatic callback retry initializes its own hash prefix instead of counting data twice', async () => {
  const f = transferFixture(),
    p = await upload(f),
    run = f.db.runTransaction.bind(f.db);
  f.db.runTransaction = (callback) =>
    run(async (tx) => {
      await callback({ ...tx, create() {}, set() {}, update() {}, delete() {} });
      return callback(tx);
    });
  const result = await f.api.advanceAdventureRestoreIntegrity(
    uid,
    mutation(p, 'adventure-auto-retry-0001', { limit: 16 }),
  );
  assert.equal(result.progress.integrityDigest, hash(f.bytes));
  assert.equal(result.progress.checkedBytes, f.bytes.length);
});
test('late append and verification cannot pass a cancellation checkpoint', async () => {
  const f = transferFixture(),
    p = await upload(f),
    cancelled = (await f.api.cancelAdventureRestore(uid, mutation(p, 'adventure-cancel-race-0001')))
      .progress;
  await assert.rejects(
    f.api.advanceAdventureRestoreIntegrity(
      uid,
      mutation(p, 'adventure-late-integrity-0001', { limit: 1 }),
    ),
  );
  await assert.rejects(
    f.api.appendAdventureRestoreChunk(
      uid,
      chunkRequest(p, f.bytes, 0, 'adventure-late-upload-0001'),
    ),
  );
  assert.equal((await cleanup(f, cancelled)).state, 'cancelled');
});
test('cleanup refuses foreign artifacts, missing expected data and data reappearing before its cursor', async () => {
  for (const mode of ['foreign', 'missing', 'before-cursor']) {
    const f = transferFixture(),
      uploaded = await upload(f),
      p = (await f.api.cancelAdventureRestore(uid, mutation(uploaded, 'adventure-clean-bad-0001')))
        .progress;
    if (mode === 'foreign')
      await f.db.runTransaction((tx) =>
        tx.create(f.db.doc(f.path + '/chunks/000000000000000a'), {
          schemaVersion: 1,
          ownerId: 'other',
        }),
      );
    if (mode === 'missing')
      await f.db.runTransaction((tx) => tx.delete(f.db.doc(f.path + '/chunks/000000000000001')));
    if (mode === 'before-cursor') {
      const one = (
        await f.api.advanceAdventureRestoreCleanup(
          uid,
          mutation(p, 'adventure-clean-first-0001', { limit: 1 }),
        )
      ).progress;
      await f.db.runTransaction((tx) =>
        tx.create(f.db.doc(f.path + '/chunks/000000000000000'), {
          schemaVersion: 1,
          ownerId: 'other',
        }),
      );
      await assert.rejects(cleanup(f, one, 1));
    } else await assert.rejects(cleanup(f, p, 2));
    assert.equal(f.records.get('adventures/' + p.adventureId).kind, 'adventure-restore-pending');
  }
});
test('unexpected authored descendants prevent cleanup certification without erasing that content', async () => {
  const f = transferFixture(),
    p = (await f.api.startAdventureRestore(uid, f.input)).progress,
    path = 'adventures/' + p.adventureId + '/parts/unregistered-part';
  await f.db.runTransaction((tx) => tx.create(f.db.doc(path), { content: 'PRIVATE_UNEXPECTED' }));
  await assert.rejects(cleanup(f, p));
  assert.equal(f.records.get(path).content, 'PRIVATE_UNEXPECTED');
  assert.equal(f.records.get('adventures/' + p.adventureId).kind, 'adventure-restore-pending');
});
test('closed receipt schemas never echo prose inserted into an operation record', async () => {
  const f = transferFixture(),
    p = (await f.api.startAdventureRestore(uid, f.input)).progress;
  f.records.get('users/' + uid + '/adventureRestoreOperations/' + id).receipt.prose =
    'PRIVATE_UNEXPECTED';
  await assert.rejects(
    f.api.getAdventureRestore(uid, { restoreId: id, jobToken: p.jobToken }),
    (error) => !JSON.stringify(error).includes('PRIVATE_UNEXPECTED'),
  );
});

test('current job must be proven by its exact latest checkpoint rather than an older valid receipt', async () => {
  for (const mode of ['advance-counter', 'rewind-receipt']) {
    const f = transferFixture(),
      p = (await f.api.startAdventureRestore(uid, f.input)).progress;
    if (mode === 'advance-counter') f.records.get(f.path).checkpoint++;
    else {
      await f.api.appendAdventureRestoreChunk(uid, chunkRequest(p, f.bytes, 0));
      const job = f.records.get(f.path);
      job.lastOperationId = id;
      job.lastRequestHash = job.startFingerprint;
    }
    await assert.rejects(f.api.getAdventureRestore(uid, { restoreId: id, jobToken: p.jobToken }));
  }
});

test('full 16-chunk verification batches and 50-artifact cleanup pages preserve a larger private file exactly', async () => {
  const f = transferFixture(Buffer.alloc(53 * 65536 + 11, 83)),
    p = await verify(f, await upload(f), 16);
  assert.equal(p.checkedChunks, 54);
  assert.equal(p.integrityDigest, hash(f.bytes));
  assert.equal(f.records.get(f.path).writtenStates, 3);
  const done = await cleanup(f, p, 50);
  assert.equal(done.cleanedChunks, 54);
  assert.equal(done.cleanedProofs, 54);
  assert.equal(done.cleanedStates, 3);
  assert.equal(done.state, 'cancelled');
});

test('frozen native chunk proofs bind the exact verified bytes for the next semantic reader', async () => {
  const { createAdventureRestoreStore } = await import('../src/adventureRestoreStore.mjs'),
    { readAdventureRestoreChunk, readAdventureRestoreProof } =
      await import('../src/adventureRestoreChunks.mjs');
  const f = transferFixture(),
    p = await verify(f, await upload(f)),
    store = createAdventureRestoreStore({ db: f.db });
  await f.db.runTransaction(async (tx) => {
    const loaded = await store.load(tx, uid, id, p.jobToken);
    for (let index = 0; index < 3; index++) {
      const chunk = await readAdventureRestoreChunk(store, tx, loaded, index),
        proof = await readAdventureRestoreProof(store, tx, loaded, index, chunk);
      assert.equal(proof.value.chunkHash, hash(chunk.bytes));
      assert.deepEqual(chunk.bytes, f.bytes.subarray(index * 65536, (index + 1) * 65536));
      await assert.rejects(
        readAdventureRestoreProof(store, tx, loaded, index, {
          ...chunk,
          proof: { ...chunk.proof, chunkToken: 'f'.repeat(64) },
        }),
      );
    }
  });
});
