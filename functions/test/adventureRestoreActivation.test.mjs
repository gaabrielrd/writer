import assert from 'node:assert/strict';
import test from 'node:test';
import {
  activationFixture,
  activationRequest,
} from './helpers/adventureRestoreActivationFixture.mjs';
import { emptyAdventureArchive } from './helpers/adventureRestoreArchiveFixture.mjs';
test('activation releases the reserved adventure, counts and persona batch in the same commit', async () => {
  const { f, p } = await activationFixture(await emptyAdventureArchive());
  const { review, request } = await activationRequest(f, p);
  assert.equal(review.summary.visibility, 'private');
  const result = await f.api.activateAdventureRestore(f.uid, request);
  assert.equal(result.progress.state, 'activated');
  assert.equal(f.records.get('adventures/' + p.adventureId).ownerId, f.uid);
  assert.equal(
    f.records.get('adventures/' + p.adventureId + '/workProgress/current').countReady,
    true,
  );
  assert.equal(
    f.records.get('users/' + f.uid + '/aiPersonaRestoreBatches/' + p.adventureId).state,
    'active',
  );
  assert.deepEqual(await f.api.activateAdventureRestore(f.uid, request), result);
});

test('activation preserves native root birth and authorial creation while leaving prose and library preparing', async () => {
  const { f, p } = await activationFixture();
  const rootPath = 'adventures/' + p.adventureId;
  const oldStamp = structuredClone(f.metadata.get(rootPath));
  const prepared = f.records.get(f.path + '/preparedRoot/current').value;
  const protectedRows = structuredClone(
    [...f.records].filter(([k]) => k.includes('/body/') || k.includes('/imageLibrary/')),
  );
  const { request } = await activationRequest(f, p);
  const result = await f.api.activateAdventureRestore(f.uid, request);
  const receiptPath = 'users/' + f.uid + '/adventureRestoreOperations/' + request.operationId;
  const root = f.records.get(rootPath);
  assert.equal(root.createdAt, prepared.createdAt);
  assert.ok(root.updatedAt > prepared.updatedAt);
  assert.equal(f.metadata.get(rootPath).createdAtNanoseconds, oldStamp.createdAtNanoseconds);
  assert.equal(
    f.metadata.get(rootPath).updatedAtNanoseconds,
    f.metadata.get(receiptPath).createdAtNanoseconds,
  );
  assert.equal(root.restoreOrigin.activationOperationId, request.operationId);
  assert.equal(result.progress.activation.mediaState, 'pending');
  assert.deepEqual(
    [...f.records].filter(([k]) => k.includes('/body/') || k.includes('/imageLibrary/')),
    protectedRows,
  );
  assert.equal(f.commits.at(-1).length, 5);
});

test('the first audit cannot activate before the library and its final physical audit', async () => {
  const { libraryFixture } = await import('./helpers/adventureRestoreImageLibraryFixture.mjs');
  const { f, p } = await libraryFixture(await emptyAdventureArchive());
  const before = structuredClone([...f.records]);
  await assert.rejects(() =>
    f.api.getAdventureRestoreActivationReview(f.uid, {
      restoreId: p.restoreId,
      jobToken: p.jobToken,
    }),
  );
  await assert.rejects(() =>
    f.api.activateAdventureRestore(f.uid, {
      restoreId: p.restoreId,
      jobToken: p.jobToken,
      operationId: 'invalid-activation-0001',
      expectedCheckpoint: p.checkpoint,
      reviewToken: 'a'.repeat(64),
    }),
  );
  assert.deepEqual([...f.records], before);
});

test('wrong account, token, review, checkpoint and extra grant fields never release a root', async () => {
  const { f, p } = await activationFixture(await emptyAdventureArchive());
  const { request } = await activationRequest(f, p);
  const before = structuredClone([...f.records]);
  for (const [uid, patch] of [
    [null, {}],
    ['other', {}],
    [f.uid, { jobToken: 'b'.repeat(64) }],
    [f.uid, { reviewToken: 'c'.repeat(64) }],
    [f.uid, { expectedCheckpoint: p.checkpoint - 1 }],
    [f.uid, { ownerId: f.uid }],
  ]) {
    await assert.rejects(() => f.api.activateAdventureRestore(uid, { ...request, ...patch }));
    assert.deepEqual([...f.records], before);
  }
});

test('every activation write rolls back together and retry releases exactly once', async () => {
  for (let failWrite = 1; failWrite <= 5; failWrite++) {
    const { f, p } = await activationFixture(await emptyAdventureArchive());
    const { request } = await activationRequest(f, p);
    const before = structuredClone([...f.records]),
      run = f.db.runTransaction;
    f.db.runTransaction = (cb) =>
      run((tx) => {
        let writes = 0;
        return cb(
          new Proxy(tx, {
            get(object, key) {
              if (['set', 'create', 'update'].includes(key))
                return (...args) => {
                  if (++writes === failWrite) throw Error('activation rollback');
                  return object[key](...args);
                };
              return typeof object[key] === 'function' ? object[key].bind(object) : object[key];
            },
          }),
        );
      });
    await assert.rejects(
      () => f.api.activateAdventureRestore(f.uid, request),
      /activation rollback/,
    );
    assert.deepEqual([...f.records], before);
    f.db.runTransaction = run;
    assert.equal(
      (await f.api.activateAdventureRestore(f.uid, request)).progress.state,
      'activated',
    );
  }
});

test('changed and recreated native controls or persona batches invalidate a reviewed activation', async () => {
  for (const kind of ['root', 'definition', 'control', 'index', 'batch', 'source']) {
    const { f, p } = await activationFixture(await emptyAdventureArchive());
    const { request } = await activationRequest(f, p);
    const path = {
      root: 'adventures/' + p.adventureId,
      definition: f.path + '/preparedRoot/current',
      control: 'adventures/' + p.adventureId + '/workProgress/current',
      index: 'adventures/' + p.adventureId + '/narrativeControls/entity-scenes',
      batch: 'users/' + f.uid + '/aiPersonaRestoreBatches/' + p.adventureId,
      source: [...f.records.keys()].find((k) => k.startsWith(f.path + '/validationItems/')),
    }[kind];
    assert.ok(path);
    f.metadata.get(path).createdAtNanoseconds += 50000;
    const before = structuredClone([...f.records]);
    await assert.rejects(() => f.api.activateAdventureRestore(f.uid, request));
    assert.deepEqual([...f.records], before);
  }
});

test('retirement fences the exact uncertain activation and requires a fresh review and operation', async () => {
  const { f, p } = await activationFixture(await emptyAdventureArchive());
  const { request } = await activationRequest(f, p);
  const retired = await f.api.retireAdventureRestoreActivation(f.uid, request);
  assert.equal(retired.receipt.action, 'retireAdventureRestoreActivation');
  assert.equal(retired.progress.state, 'content-verified');
  assert.equal(retired.progress.checkpoint, p.checkpoint + 1);
  assert.equal(f.records.get('adventures/' + p.adventureId).ownerId, undefined);
  const before = structuredClone([...f.records]);
  assert.deepEqual(await f.api.activateAdventureRestore(f.uid, request), retired);
  assert.deepEqual(await f.api.retireAdventureRestoreActivation(f.uid, request), retired);
  assert.deepEqual([...f.records], before);
  const next = await activationRequest(f, retired.progress, 'fresh-activation-0002');
  assert.notEqual(next.review.reviewToken, request.reviewToken);
  assert.equal(
    (await f.api.activateAdventureRestore(f.uid, next.request)).progress.state,
    'activated',
  );
  assert.equal(
    (await f.api.activateAdventureRestore(f.uid, request)).receipt.action,
    'retireAdventureRestoreActivation',
  );
});

test('a delayed activation cannot win after the same request is retired', async () => {
  const { f, p } = await activationFixture(await emptyAdventureArchive());
  const { request } = await activationRequest(f, p);
  const run = f.db.runTransaction;
  let release,
    entered,
    once = true;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  const paused = new Promise((resolve) => {
    entered = resolve;
  });
  f.db.runTransaction = async (cb) => {
    const result = await run(cb);
    if (once && result === null) {
      once = false;
      entered();
      await held;
    }
    return result;
  };
  const pending = f.api.activateAdventureRestore(f.uid, request);
  await paused;
  const retired = await f.api.retireAdventureRestoreActivation(f.uid, request);
  release();
  assert.deepEqual(await pending, retired);
  assert.equal(f.records.get('adventures/' + p.adventureId).ownerId, undefined);
});

test('a lost activation acknowledgement remains resolvable after edits, deletion and recreation without root reads', async () => {
  const { f, p } = await activationFixture(await emptyAdventureArchive());
  const { request } = await activationRequest(f, p);
  const run = f.db.runTransaction;
  let once = true;
  f.db.runTransaction = async (cb) => {
    const result = await run(cb);
    if (once && result?.receipt?.action === 'activateAdventureRestore') {
      once = false;
      throw Error('lost activation ACK');
    }
    return result;
  };
  await assert.rejects(() => f.api.activateAdventureRestore(f.uid, request), /lost activation ACK/);
  f.db.runTransaction = run;
  const confirmed = await f.api.activateAdventureRestore(f.uid, request);
  const rootPath = 'adventures/' + p.adventureId;
  for (const state of ['edit', 'delete', 'recreate']) {
    await run((tx) =>
      state === 'edit'
        ? tx.update(f.db.doc(rootPath), { title: 'Current edit' })
        : state === 'delete'
          ? tx.delete(f.db.doc(rootPath))
          : tx.create(f.db.doc(rootPath), { ownerId: 'other', title: 'Replacement' }),
    );
    const before = structuredClone([...f.records]);
    f.reads.length = 0;
    f.metadataReads.length = 0;
    assert.deepEqual(await f.api.activateAdventureRestore(f.uid, request), confirmed);
    assert.deepEqual(await f.api.retireAdventureRestoreActivation(f.uid, request), confirmed);
    assert.equal(
      f.reads.some((v) => (typeof v === 'string' ? v : v.path) === rootPath),
      false,
    );
    assert.equal(
      f.metadataReads.some((v) => v.path === rootPath),
      false,
    );
    assert.deepEqual([...f.records], before);
  }
});

test('activated jobs reject cancellation, cleanup, competing decisions and new reviews', async () => {
  const { mutation } = await import('./helpers/adventureRestoreTransferFixture.mjs');
  const { f, p } = await activationFixture(await emptyAdventureArchive());
  const { request } = await activationRequest(f, p);
  const done = await f.api.activateAdventureRestore(f.uid, request),
    before = structuredClone([...f.records]);
  await assert.rejects(() =>
    f.api.cancelAdventureRestore(f.uid, mutation(done.progress, 'cancel-active-00001')),
  );
  await assert.rejects(() =>
    f.api.advanceAdventureRestoreCleanup(
      f.uid,
      mutation(done.progress, 'cleanup-active-0001', { limit: 50 }),
    ),
  );
  await assert.rejects(() =>
    f.api.activateAdventureRestore(f.uid, { ...request, operationId: 'competing-active-0001' }),
  );
  await assert.rejects(() =>
    f.api.getAdventureRestoreActivationReview(f.uid, {
      restoreId: p.restoreId,
      jobToken: p.jobToken,
    }),
  );
  assert.deepEqual([...f.records], before);
});

test('restored personas become available through the real activation proof and survive root deletion', async () => {
  const { profileAdventureArchive } =
    await import('./helpers/adventureRestoreProfileArchiveFixture.mjs');
  const { readAvailablePersonaMetadata } = await import('../src/personaAvailability.mjs');
  const { f, p } = await activationFixture(await profileAdventureArchive());
  const prefix = 'users/' + f.uid + '/aiPersonas/';
  const path = [...f.records.keys()].find((k) => k.startsWith(prefix));
  assert.ok(path);
  const id = path.slice(prefix.length);
  const read = () =>
    f.db.runTransaction((tx) => readAvailablePersonaMetadata(tx, f.db, f.uid, id, ['revision']));
  assert.equal(await read(), null);
  const { request } = await activationRequest(f, p);
  await f.api.activateAdventureRestore(f.uid, request);
  assert.ok(await read());
  await f.db.runTransaction((tx) => tx.delete(f.db.doc('adventures/' + p.adventureId)));
  assert.ok(await read());
});

test('activated metadata is closed, frozen and bound to the terminal checkpoint', async () => {
  const { parseJob, requestHash } = await import('../src/adventureRestoreContracts.mjs');
  const { f, p } = await activationFixture(await emptyAdventureArchive());
  const { request } = await activationRequest(f, p);
  const done = await f.api.activateAdventureRestore(f.uid, request),
    saved = f.records.get(f.path);
  for (const patch of [
    { activation: null },
    { activation: { ...saved.activation, mediaState: 'ready' } },
    { activation: { ...saved.activation, sourceCheckpoint: 0 } },
    { activation: { ...saved.activation, ownerId: f.uid } },
    { state: 'cancelling' },
    { checkpoint: saved.checkpoint + 1 },
    { checkedChunks: 0, checkedBytes: 0 },
  ]) {
    assert.throws(() => parseJob({ ...saved, ...patch }, f.uid, p.restoreId));
  }
  assert.equal(
    (await f.api.getAdventureRestore(f.uid, { restoreId: p.restoreId, jobToken: p.jobToken }))
      .state,
    'activated',
  );
  assert.deepEqual(
    await f.api.resolveAdventureRestoreOperation(f.uid, {
      restoreId: p.restoreId,
      jobToken: p.jobToken,
      operationId: request.operationId,
      requestHash: requestHash('activateAdventureRestore', request),
    }),
    done,
  );
});
