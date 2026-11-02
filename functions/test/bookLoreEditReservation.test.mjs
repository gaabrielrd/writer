import test from 'node:test';
import assert from 'node:assert/strict';
import { digest } from '../src/workProgressContracts.mjs';
import {
  editReservationIntent,
  editReservationStartHash,
  editSlotId,
} from '../src/bookLoreEditReservationContracts.mjs';
import { createBookLoreEditReservationService } from '../src/bookLoreEditReservation.mjs';
import { loadFieldUpload } from '../src/bookLoreFieldUploadStore.mjs';
import { cancelledEditUploadAccess } from '../src/bookLoreEditLeaseProofs.mjs';
import { collectBookLoreInventoryUnit } from '../src/bookLoreResourceInventoryCleanup.mjs';
import { createBookLoreResourceInventoryService } from '../src/bookLoreResourceInventory.mjs';
import { inventoryScope } from '../src/bookLoreResourceInventoryContracts.mjs';
import { resourcePayloadChunkPath } from '../src/bookResourcePayloadPaths.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import {
  editReservationFixture,
  initializeEditReservation,
  reserveAllEditUploads,
  editControl,
  editReserveRequest,
  cancelEditReservation,
  drainEditReservation,
  getEditReservation,
} from './helpers/bookLoreEditReservationFixture.mjs';
async function setup(options) {
  const f = adventureImportDb({ nativeUpdates: true });
  return { ...f, ...(await editReservationFixture(f.db, options)) };
}
const fieldGet = (f) => f.uploads[0].factory().getBookLoreFieldUpload(f.uid, f.uploads[0].ref);
const parentJob = (f) => f.records.get(f.c.path);
const generationPath = (f) =>
  'books/' + f.bookId + '/bookLoreGenerations/' + parentJob(f).generationId;
const bodyControl = (f) =>
  'books/' + f.bookId + '/bookResourceInventory/' + f.uploads[0].prepared.manifest.bodyId;
const firstPart = (f) =>
  resourcePayloadChunkPath(f.bookId, f.uploads[0].prepared.manifest.bodyId, 0);
const bodyHeader = (f) =>
  'books/' + f.bookId + '/bookResourceBodies/' + f.uploads[0].prepared.manifest.bodyId;
for (const mode of ['inline', 'v1', 'v2'])
  test(
    'reserve and cancel a sealed field from ' +
      mode +
      ' without changing source, clock or publication',
    async () => {
      const f = await setup({ mode }),
        source = structuredClone(f.records.get(f.source.seed.path)),
        book = structuredClone(f.records.get(f.source.seed.bookPath)),
        p = await reserveAllEditUploads(f);
      assert.equal(p.reservedCount, 1);
      assert.equal((await fieldGet(f)).phase, 'reserved');
      assert.equal(f.records.get(generationPath(f) + '/state/current').phase, 'preparing');
      assert.equal(f.records.get(bodyControl(f) + '/state/current').phase, 'initializing');
      const inventory = createBookLoreResourceInventoryService({ db: f.db });
      assert.equal(
        (
          await inventory.collectBookLoreInventoryBody(f.uid, {
            bookId: f.bookId,
            bodyId: f.uploads[0].prepared.manifest.bodyId,
          })
        ).reason,
        'lease',
      );
      await assert.rejects(() =>
        inventory.retireBookLoreInventoryGeneration(f.uid, {
          bookId: f.bookId,
          generationId: parentJob(f).generationId,
        }),
      );
      assert.deepEqual(f.records.get(f.source.seed.path), source);
      assert.deepEqual(f.records.get(f.source.seed.bookPath), book);
      for (const [path, value] of f.records)
        if (path.startsWith(f.c.path) || path.startsWith(bodyControl(f)))
          assert.equal(JSON.stringify(value).includes('new literal'), false);
      const cancelled = (await cancelEditReservation(f, p)).progress;
      assert.equal(f.records.get(generationPath(f) + '/state/current').phase, 'cancelled');
      const done = await drainEditReservation(f, cancelled);
      assert.equal(done.phase, 'cancelled');
      assert.equal(done.releasedCount, 1);
      assert.equal(done.blockedReason, null);
      assert.equal((await fieldGet(f)).phase, 'cancelled');
      assert.equal(f.records.has(bodyHeader(f)), false);
      assert.equal(f.records.get(bodyControl(f) + '/state/current').phase, 'collected');
      assert.deepEqual(f.records.get(f.source.seed.path), source);
      assert.deepEqual(f.records.get(f.source.seed.bookPath), book);
    },
  );
test('reserved upload rejects isolated cancel, append and seal while exact old receipts remain confirmable', async () => {
  const f = await setup(),
    p = await reserveAllEditUploads(f),
    field = f.uploads[0],
    current = await fieldGet(f);
  await assert.rejects(() =>
    field
      .factory()
      .cancelBookLoreFieldUpload(f.uid, { ...field.ref, operationId: 'isolated-cancel' }),
  );
  await assert.rejects(() =>
    field.factory().advanceBookLoreFieldSeal(f.uid, {
      ...field.ref,
      operationId: 'seal-again',
      expectedRevision: current.revision,
    }),
  );
  const part = field.prepared.part(0);
  await assert.rejects(() =>
    field.factory().appendBookLoreFieldUpload(f.uid, {
      ...field.ref,
      operationId: 'append-again',
      expectedRevision: current.revision,
      index: 0,
      chunkBase64: part.bytes.toString('base64'),
      proof: part.proof,
    }),
  );
  assert.equal((await getEditReservation(f)).revision, p.revision);
  assert.equal((await fieldGet(f)).phase, 'reserved');
});
test('parent replay confirms old reservation after cancel and source revocation without recreating bytes', async () => {
  const f = await setup(),
    initial = await initializeEditReservation(f),
    r = editReserveRequest(f, initial),
    first = await f.factory().reserveBookLoreEditUpload(f.uid, r);
  await f.db.runTransaction(async (tx) => tx.delete(f.db.doc(f.source.seed.bookPath)));
  await drainEditReservation(f, (await cancelEditReservation(f, first.progress)).progress);
  const repeated = await f.factory().reserveBookLoreEditUpload(f.uid, r);
  assert.deepEqual(repeated.receipt, first.receipt);
  assert.equal(repeated.progress.phase, 'cancelled');
  assert.equal(f.records.has(bodyHeader(f)), false);
  assert.equal(f.records.has(firstPart(f)), false);
  assert.equal(
    (await f.factory().startBookLoreEditReservation(f.uid, f.intent)).phase,
    'cancelled',
  );
});
test('early cancel fences a later start without claiming unrelated pre-existing uploads', async () => {
  const f = await setup(),
    result = await f.factory().cancelBookLoreEditReservation(f.uid, {
      editId: f.editId,
      startHash: f.startHash,
      operationId: 'early-cancel',
    });
  assert.equal(result.progress.phase, 'cancelled');
  assert.equal(result.progress.jobToken, null);
  assert.equal(
    (await f.factory().startBookLoreEditReservation(f.uid, f.intent)).phase,
    'cancelled',
  );
  assert.equal((await fieldGet(f)).phase, 'sealed');
  assert.equal(f.records.has(bodyHeader(f)), true);
});
for (const stage of ['initializing', 'preparing'])
  test(
    'cancelling before the first claim closes ' + stage + ' but preserves unclaimed upload bytes',
    async () => {
      const f = await setup(),
        p =
          stage === 'preparing'
            ? await initializeEditReservation(f)
            : await f.factory().startBookLoreEditReservation(f.uid, f.intent),
        done = await drainEditReservation(f, (await cancelEditReservation(f, p)).progress);
      assert.equal(done.phase, 'cancelled');
      assert.equal(done.reservedCount, 0);
      assert.equal((await fieldGet(f)).phase, 'sealed');
      assert.equal(f.records.has(bodyHeader(f)), true);
    },
  );
test('multiple fields and relation pages have independent frozen slots and complete all owned cleanup', async () => {
  const f = await setup({
      changes: [
        { target: { field: 'name' }, value: ' New ' },
        { target: { field: 'isPublic' }, value: false },
        {
          target: { field: 'relations', page: 0, count: 64 },
          value: Array.from({ length: 64 }, () => ({ targetEntityId: 't', relationType: 'r' })),
        },
        {
          target: { field: 'relations', page: 1, count: 1 },
          value: [{ targetEntityId: 'last', relationType: 'r' }],
        },
      ],
      removals: ['summary'],
      relations: { present: true, count: 65 },
    }),
    p = await reserveAllEditUploads(f);
  assert.equal(p.reservedCount, 4);
  const done = await drainEditReservation(f, (await cancelEditReservation(f, p)).progress);
  assert.equal(done.releasedCount, 4);
  assert.equal(done.phase, 'cancelled');
  for (const field of f.uploads)
    assert.equal(
      (await field.factory().getBookLoreFieldUpload(f.uid, field.ref)).phase,
      'cancelled',
    );
});
test('more than 8 MiB/128 parts survive reservation and are cancelled in bounded metadata batches', async () => {
  const f = await setup({
      changes: [
        { target: { field: 'details' }, value: 'PRIVATE_LARGE_TEXT_' + '🌙'.repeat(2300000) },
      ],
    }),
    p = await reserveAllEditUploads(f);
  assert.ok(f.uploads[0].prepared.manifest.chunkCount > 128);
  for (const [path, value] of f.records)
    if (path.startsWith(f.c.path) || path.startsWith(bodyControl(f)))
      assert.equal(JSON.stringify(value).includes('PRIVATE_LARGE_TEXT'), false);
  f.metadataReads.length = 0;
  const done = await drainEditReservation(f, (await cancelEditReservation(f, p)).progress);
  assert.equal(done.phase, 'cancelled');
  assert.equal(f.records.has(firstPart(f)), false);
  const reads = f.metadataReads.filter((r) => r.path.includes('/bookResourceChunks/'));
  assert.ok(reads.length > 128);
  assert.ok(reads.every((r) => !r.fields.includes('bytes') && !r.fields.includes('proof')));
});
test('concurrent reservation requests use one CAS and exact operation retries confirm that claim', async () => {
  const f = await setup(),
    p = await initializeEditReservation(f),
    a = editReserveRequest(f, p, 0, 'a'),
    b = editReserveRequest(f, p, 0, 'b'),
    results = await Promise.allSettled([
      f.factory().reserveBookLoreEditUpload(f.uid, a),
      f.factory().reserveBookLoreEditUpload(f.uid, b),
    ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal((await getEditReservation(f)).reservedCount, 1);
  const request = results[0].status === 'fulfilled' ? a : b,
    repeated = await f.factory().reserveBookLoreEditUpload(f.uid, request);
  assert.equal(repeated.receipt.reservedCount, 1);
  assert.equal((await fieldGet(f)).phase, 'reserved');
  await assert.rejects(() =>
    f.factory().reserveBookLoreEditUpload(f.uid, {
      ...request,
      expectedRevision: request.expectedRevision + 1,
    }),
  );
});
test('a second edit cannot reserve or cancel a field already owned by another preparation', async () => {
  const f = await setup(),
    p = await reserveAllEditUploads(f),
    intent = editReservationIntent(f.uid, { ...f.intent, editId: 'another-edit' }),
    hash = editReservationStartHash(intent),
    api = f.factory(),
    start = await api.startBookLoreEditReservation(f.uid, intent),
    ready = (
      await api.initializeBookLoreEditGeneration(f.uid, {
        editId: intent.editId,
        startHash: hash,
        jobToken: start.jobToken,
        operationId: 'init-second',
        expectedRevision: start.revision,
      })
    ).progress;
  await assert.rejects(() =>
    api.reserveBookLoreEditUpload(f.uid, {
      ...editReserveRequest(f, ready),
      editId: intent.editId,
      startHash: hash,
      jobToken: ready.jobToken,
    }),
  );
  assert.equal((await getEditReservation(f)).reservedCount, p.reservedCount);
  assert.equal((await fieldGet(f)).phase, 'reserved');
});
for (const change of ['owner', 'clock', 'head', 'inspection-cancelled'])
  test('new reservations reauthorize ' + change, async () => {
    const f = await setup(),
      p = await initializeEditReservation(f);
    if (change === 'inspection-cancelled')
      await f.source.factory().cancelBookLoreSourceInspection(f.uid, {
        inspectionId: f.source.inspectionId,
        startHash: f.source.startHash,
        operationId: 'cancel-inspection',
      });
    else
      await f.db.runTransaction(async (tx) =>
        tx.update(
          f.db.doc(change === 'head' ? f.source.seed.path : f.source.seed.bookPath),
          change === 'owner'
            ? { authorId: 'other' }
            : change === 'clock'
              ? { localLoreVersion: 1 }
              : { updatedAt: 9999 },
        ),
      );
    await assert.rejects(() =>
      f.factory().reserveBookLoreEditUpload(f.uid, editReserveRequest(f, p)),
    );
    assert.equal((await fieldGet(f)).phase, 'sealed');
    assert.equal((await getEditReservation(f)).reservedCount, 0);
  });
for (const change of ['owner', 'deleting', 'absent'])
  test('own staged cleanup continues after project ' + change, async () => {
    const f = await setup(),
      p = await reserveAllEditUploads(f);
    if (change === 'absent')
      await f.db.runTransaction(async (tx) => tx.delete(f.db.doc(f.source.seed.bookPath)));
    else
      await f.db.runTransaction(async (tx) =>
        tx.update(
          f.db.doc(f.source.seed.bookPath),
          change === 'owner' ? { authorId: 'other' } : { deleting: true },
        ),
      );
    const done = await drainEditReservation(f, (await cancelEditReservation(f, p)).progress);
    assert.equal(done.phase, 'cancelled');
    assert.equal(f.records.has(bodyHeader(f)), false);
  });
test('a recreated book blocks cleanup and preserves original staged bytes', async () => {
  const f = await setup(),
    p = await reserveAllEditUploads(f),
    cancelled = (await cancelEditReservation(f, p)).progress,
    root = structuredClone(f.records.get(f.source.seed.bookPath));
  await f.db.runTransaction(async (tx) => tx.delete(f.db.doc(f.source.seed.bookPath)));
  await f.db.runTransaction(async (tx) => tx.create(f.db.doc(f.source.seed.bookPath), root));
  await assert.rejects(() => drainEditReservation(f, cancelled));
  assert.equal(f.records.has(firstPart(f)), true);
  assert.equal(f.records.has(bodyHeader(f)), true);
});
test('fake, cloned and cross-transaction staging capabilities cannot bypass default collection guards', async () => {
  const f = await setup(),
    p = await reserveAllEditUploads(f),
    cancelled = (await cancelEditReservation(f, p)).progress,
    released = (
      await f.factory().advanceBookLoreEditReservationCleanup(f.uid, editControl(f, cancelled))
    ).progress,
    field = f.uploads[0],
    scope = inventoryScope(f.db, f.uid, f.bookId);
  let access;
  await f.db.runTransaction(async (tx) => {
    const loaded = await loadFieldUpload(tx, field.c, field.ref);
    await assert.rejects(() => cancelledEditUploadAccess(tx, { ...loaded }));
    access = await cancelledEditUploadAccess(tx, loaded);
    await assert.rejects(() =>
      collectBookLoreInventoryUnit(
        tx,
        scope,
        { bodyId: field.prepared.manifest.bodyId, limit: 16 },
        {},
      ),
    );
    await assert.rejects(() =>
      collectBookLoreInventoryUnit(
        tx,
        scope,
        { bodyId: field.prepared.manifest.bodyId, limit: 16 },
        { ...access },
      ),
    );
  });
  await assert.rejects(() =>
    f.db.runTransaction((tx) =>
      collectBookLoreInventoryUnit(
        tx,
        scope,
        {
          bodyId: field.prepared.manifest.bodyId,
          limit: 16,
        },
        access,
      ),
    ),
  );
  assert.equal(released.phase, 'cancelling');
  assert.equal(f.records.has(firstPart(f)), true);
});
test('invalid intention, source mismatches and unsealed uploads never claim a field', async () => {
  const f = await setup({ seal: false }),
    p = await initializeEditReservation(f);
  await assert.rejects(() =>
    f.factory().reserveBookLoreEditUpload(f.uid, editReserveRequest(f, p)),
  );
  for (const patch of [
    { target: { field: 'name' } },
    { upload: { ...f.uploads[0].ref, jobToken: 'a'.repeat(64) } },
    { target: { field: 'relations', page: 0, count: 1 } },
  ])
    await assert.rejects(() =>
      f.factory().reserveBookLoreEditUpload(f.uid, { ...editReserveRequest(f, p), ...patch }),
    );
  assert.equal((await getEditReservation(f)).reservedCount, 0);
  for (const patch of [
    { fields: { name: null } },
    { fields: { category: null } },
    { fields: { unknown: null } },
    { sourceToken: 'bad' },
    { pointer: { physical: true } },
  ])
    await assert.rejects(() =>
      f.factory().startBookLoreEditReservation(f.uid, { ...f.intent, ...patch }),
    );
});
test('rollback after reserving the lease leaves parent, field and inventory unchanged', async () => {
  const f = await setup(),
    p = await initializeEditReservation(f),
    before = structuredClone([...f.records]),
    run = f.db.runTransaction.bind(f.db);
  f.db.runTransaction = (fn) =>
    run((tx) =>
      fn({
        ...tx,
        update(ref, value) {
          tx.update(ref, value);
          if (ref.path === f.c.path) throw Error('injected parent failure');
        },
      }),
    );
  await assert.rejects(
    () => f.factory().reserveBookLoreEditUpload(f.uid, editReserveRequest(f, p)),
    /injected parent failure/,
  );
  assert.deepEqual([...f.records], before);
});
test('unknown parent IDs return null within the actor namespace', async () => {
  const f = adventureImportDb({ nativeUpdates: true }),
    api = createBookLoreEditReservationService({ db: f.db });
  assert.equal(
    await api.getBookLoreEditReservation('author', { editId: 'absent', startHash: 'a'.repeat(64) }),
    null,
  );
});

for (const artifact of [
  'parent',
  'generation',
  'slot',
  'field',
  'lease',
  'inventory',
  'header',
  'part',
])
  test('native recreation blocks reservation cleanup and preserves ' + artifact, async () => {
    const f = await setup(),
      p = await reserveAllEditUploads(f),
      cancelled = (await cancelEditReservation(f, p)).progress,
      field = f.uploads[0],
      slotId = editSlotId(field.target),
      path =
        artifact === 'parent'
          ? f.c.path
          : artifact === 'generation'
            ? generationPath(f)
            : artifact === 'slot'
              ? f.c.path + '/slots/' + slotId
              : artifact === 'field'
                ? field.c.path
                : artifact === 'lease'
                  ? 'books/' + f.bookId + '/bookResourceLeases/' + field.prepared.manifest.bodyId
                  : artifact === 'inventory'
                    ? bodyControl(f)
                    : artifact === 'header'
                      ? bodyHeader(f)
                      : firstPart(f),
      value = structuredClone(f.records.get(path));
    await f.db.runTransaction(async (tx) => tx.delete(f.db.doc(path)));
    await f.db.runTransaction(async (tx) => tx.create(f.db.doc(path), value));
    await assert.rejects(() => drainEditReservation(f, cancelled));
    assert.equal(f.records.has(path), true);
    assert.equal(f.records.has(bodyHeader(f)), true);
    assert.equal(f.records.has(firstPart(f)), true);
  });
test('an old parent receipt and anchor recreated together cannot reclaim a former slot', async () => {
  const f = await setup(),
    p = await initializeEditReservation(f),
    r = editReserveRequest(f, p),
    reserved = (await f.factory().reserveBookLoreEditUpload(f.uid, r)).progress;
  await drainEditReservation(f, (await cancelEditReservation(f, reserved)).progress);
  const paths = [
      f.c.path + '/operations/' + r.operationId,
      f.c.path + '/operationProofs/' + r.operationId,
    ],
    values = paths.map((path) => structuredClone(f.records.get(path)));
  await f.db.runTransaction(async (tx) => paths.forEach((path) => tx.delete(f.db.doc(path))));
  await f.db.runTransaction(async (tx) =>
    paths.forEach((path, i) => tx.create(f.db.doc(path), values[i])),
  );
  await assert.rejects(() => f.factory().reserveBookLoreEditUpload(f.uid, r));
  assert.equal(f.records.has(bodyHeader(f)), false);
});
test('byte cleanup rollback keeps parent, upload, lease, inventory and parts together', async () => {
  const f = await setup(),
    p = await reserveAllEditUploads(f),
    cancelled = (await cancelEditReservation(f, p)).progress;
  let pending = (
    await f.factory().advanceBookLoreEditReservationCleanup(f.uid, editControl(f, cancelled))
  ).progress;
  pending = (
    await f.factory().advanceBookLoreEditReservationCleanup(f.uid, editControl(f, pending))
  ).progress;
  assert.equal(f.records.get(bodyControl(f) + '/state/current').phase, 'collecting');
  const before = structuredClone([...f.records]),
    run = f.db.runTransaction.bind(f.db),
    request = editControl(f, pending);
  f.db.runTransaction = (fn) =>
    run((tx) =>
      fn({
        ...tx,
        update(ref, value) {
          tx.update(ref, value);
          if (ref.path === f.c.path) throw Error('injected byte cleanup failure');
        },
      }),
    );
  await assert.rejects(
    () => f.factory().advanceBookLoreEditReservationCleanup(f.uid, request),
    /injected byte cleanup failure/,
  );
  assert.deepEqual([...f.records], before);
  f.db.runTransaction = run;
  assert.equal((await drainEditReservation(f, pending)).phase, 'cancelled');
});
test('a current head referencing staged bytes blocks cancellation cleanup until that reference is removed', async () => {
  const f = await setup({ mode: 'v1' }),
    oldHead = structuredClone(f.records.get(f.source.seed.path)),
    p = await reserveAllEditUploads(f),
    cancelled = (await cancelEditReservation(f, p)).progress,
    slot = f.records.get(f.c.path + '/slots/' + editSlotId(f.uploads[0].target)),
    old = f.source.seed.storage,
    storage = {
      schemaVersion: 2,
      generationId: digest('late-reserved-head'),
      base: old.base,
      fields: { details: slot.pointer },
      dates: { createdAt: 1000, updatedAt: 2000 },
      relations: { ...old.relations, generationId: old.generationId, sealBirth: old.sealBirth },
      sealBirth: slot.pointer.expectedBirth,
    };
  // Explicit reachability harness, not an implementation of adoption.
  await f.db.runTransaction(async (tx) =>
    tx.set(f.db.doc(f.source.seed.path), {
      bookId: f.bookId,
      ...storage.dates,
      payloadStorage: storage,
    }),
  );
  const blocked = await drainEditReservation(f, cancelled);
  assert.equal(blocked.phase, 'cancelling');
  assert.equal(blocked.blockedReason, 'active-head');
  assert.equal(blocked.releasedCount, 0);
  assert.equal(f.records.has(firstPart(f)), true);
  await f.db.runTransaction(async (tx) => tx.set(f.db.doc(f.source.seed.path), oldHead));
  assert.equal((await drainEditReservation(f, blocked)).phase, 'cancelled');
});
test('inspection of a different book or source cannot authorize a new parent', async () => {
  const f = await setup();
  for (const patch of [
    { bookId: 'other-book' },
    { loreId: 'other-lore' },
    { sourceToken: 'a'.repeat(64) },
  ])
    await assert.rejects(() =>
      f.factory().startBookLoreEditReservation(f.uid, {
        ...f.intent,
        ...patch,
        editId: 'mismatched-parent',
      }),
    );
});
test('a pre-existing foreign body control is never adopted when reserving a field', async () => {
  const f = await setup(),
    p = await initializeEditReservation(f);
  await f.db.runTransaction(async (tx) => tx.create(f.db.doc(bodyControl(f)), { foreign: true }));
  await assert.rejects(() =>
    f.factory().reserveBookLoreEditUpload(f.uid, editReserveRequest(f, p)),
  );
  assert.deepEqual(f.records.get(bodyControl(f)), { foreign: true });
  assert.equal((await fieldGet(f)).phase, 'sealed');
  assert.equal((await getEditReservation(f)).reservedCount, 0);
});

test('independent child cleanup after parent cancellation is reconciled once by the parent', async () => {
  const f = await setup(),
    reserved = await reserveAllEditUploads(f),
    cancelled = (await cancelEditReservation(f, reserved)).progress,
    pending = (
      await f.factory().advanceBookLoreEditReservationCleanup(f.uid, editControl(f, cancelled))
    ).progress,
    field = f.uploads[0];
  let current = await fieldGet(f);
  while (current.phase === 'cancelling') {
    current = (
      await field.factory().advanceBookLoreFieldCleanup(f.uid, {
        ...field.ref,
        operationId: 'independent-' + current.revision,
        expectedRevision: current.revision,
      })
    ).progress;
  }
  assert.equal(current.phase, 'cancelled');
  assert.equal(f.records.has(bodyHeader(f)), false);
  const request = editControl(f, pending),
    confirmed = await f.factory().advanceBookLoreEditReservationCleanup(f.uid, request);
  assert.equal(confirmed.progress.releasedCount, 1);
  assert.deepEqual(
    await f.factory().advanceBookLoreEditReservationCleanup(f.uid, request),
    confirmed,
  );
  const done = await drainEditReservation(f, confirmed.progress);
  assert.equal(done.phase, 'cancelled');
  assert.equal(done.releasedCount, 1);
});
