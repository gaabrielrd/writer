import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { before, beforeEach, after, test } from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { digest } from '../../functions/src/workProgressContracts.mjs';
import { editSlotId } from '../../functions/src/bookLoreEditReservationContracts.mjs';
import { resourcePayloadChunkPath } from '../../functions/src/bookResourcePayloadPaths.mjs';
import { createBookLoreResourceInventoryService } from '../../functions/src/bookLoreResourceInventory.mjs';
import {
  editReservationFixture,
  initializeEditReservation,
  reserveAllEditUploads,
  editControl,
  editReserveRequest,
  cancelEditReservation,
  drainEditReservation,
  getEditReservation,
} from '../../functions/test/helpers/bookLoreEditReservationFixture.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-lore-edit-reservation';
let admin, env;
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127\.0\.0\.1:\d+$/.test(address ?? ''))
    throw Error('Dedicated loopback emulator required');
  const [host, port] = address.split(':');
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      host,
      port: Number(port),
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
  });
  admin = new Firestore({ projectId, host: address, ssl: false, universeDomain: 'googleapis.com' });
});
beforeEach(async () => env.clearFirestore());
after(async () => {
  await admin?.terminate();
  await env?.cleanup();
});
const bodyPath = (f) =>
  'books/' + f.bookId + '/bookResourceBodies/' + f.uploads[0].prepared.manifest.bodyId;
const inventoryPath = (f) =>
  'books/' + f.bookId + '/bookResourceInventory/' + f.uploads[0].prepared.manifest.bodyId;
const leasePath = (f) =>
  'books/' + f.bookId + '/bookResourceLeases/' + f.uploads[0].prepared.manifest.bodyId;
const partPath = (f) =>
  resourcePayloadChunkPath(f.bookId, f.uploads[0].prepared.manifest.bodyId, 0);
const fieldView = (f) => f.uploads[0].factory().getBookLoreFieldUpload(f.uid, f.uploads[0].ref);
test('SDK concurrent reservation keeps native metadata private and cancels 141 parts after source removal with header last', async () => {
  const f = await editReservationFixture(admin, {
      changes: [
        { target: { field: 'details' }, value: 'PRIVATE_LARGE_TEXT_' + '🌙'.repeat(2300000) },
      ],
    }),
    book = await admin.doc(f.source.seed.bookPath).get(),
    source = await admin.doc(f.source.seed.path).get(),
    ready = await initializeEditReservation(f),
    request = editReserveRequest(f, ready),
    results = await Promise.all([
      f.factory().reserveBookLoreEditUpload(f.uid, request),
      f.factory().reserveBookLoreEditUpload(f.uid, request),
    ]);
  assert.deepEqual(results[0], results[1]);
  const reserved = results[0].progress,
    job = (await admin.doc(f.c.path).get()).data(),
    generation = 'books/' + f.bookId + '/bookLoreGenerations/' + job.generationId,
    slot = f.c.path + '/slots/' + editSlotId(f.uploads[0].target),
    field = await fieldView(f),
    inventory = createBookLoreResourceInventoryService({ db: admin });
  assert.equal(reserved.reservedCount, 1);
  assert.equal(field.phase, 'reserved');
  assert.equal(
    (
      await inventory.collectBookLoreInventoryBody(f.uid, {
        bookId: f.bookId,
        bodyId: f.uploads[0].prepared.manifest.bodyId,
      })
    ).reason,
    'lease',
  );
  assert.equal(
    (await admin.doc(f.source.seed.bookPath).get()).updateTime.isEqual(book.updateTime),
    true,
  );
  assert.equal(
    (await admin.doc(f.source.seed.path).get()).updateTime.isEqual(source.updateTime),
    true,
  );
  const client = env.authenticatedContext(f.uid).firestore();
  for (const path of [
    f.c.path,
    slot,
    f.c.path + '/operations/' + request.operationId,
    f.c.path + '/operationProofs/' + request.operationId,
    generation,
    generation + '/state/current',
    inventoryPath(f),
    inventoryPath(f) + '/state/current',
    leasePath(f),
    f.uploads[0].c.path,
  ]) {
    const snapshot = await admin.doc(path).get();
    assert.equal(snapshot.exists, true);
    assert.equal(JSON.stringify(snapshot.data()).includes('PRIVATE_LARGE_TEXT'), false);
    await assertFails(getDoc(doc(client, path)));
    await assertFails(setDoc(doc(client, path), { forged: true }));
  }
  await admin.doc(f.source.seed.bookPath).delete();
  let progress = (await cancelEditReservation(f, reserved)).progress,
    removed = 0;
  const count = f.uploads[0].prepared.manifest.chunkCount;
  assert.ok(count > 128);
  while (progress.phase === 'cancelling') {
    progress = (
      await f.factory().advanceBookLoreEditReservationCleanup(f.uid, editControl(f, progress))
    ).progress;
    const next = await fieldView(f);
    if (next.cleanupIndex > removed) {
      assert.ok(next.cleanupIndex - removed <= 16);
      removed = next.cleanupIndex;
      assert.equal((await admin.doc(bodyPath(f)).get()).exists, true);
    }
  }
  assert.equal(removed, count);
  assert.equal(progress.phase, 'cancelled');
  assert.equal(progress.releasedCount, 1);
  assert.equal((await admin.doc(bodyPath(f)).get()).exists, false);
  assert.equal((await admin.doc(partPath(f)).get()).exists, false);
  assert.equal(
    (await admin.doc(inventoryPath(f) + '/state/current').get()).data().phase,
    'collected',
  );
  const repeated = await f.factory().reserveBookLoreEditUpload(f.uid, request);
  assert.deepEqual(repeated.receipt, results[0].receipt);
  assert.equal(repeated.progress.phase, 'cancelled');
  assert.equal((await admin.doc(bodyPath(f)).get()).exists, false);
});
test('SDK v1 and v2 reserve scalar and relation slots and finish cleanup after owner revocation', async () => {
  for (const mode of ['v1', 'v2']) {
    const f = await editReservationFixture(admin, {
        bookId: 'source-' + mode,
        editId: 'edit-' + mode,
        mode,
        changes: [
          { target: { field: 'name' }, value: 'New name' },
          { target: { field: 'isPublic' }, value: false },
          {
            target: { field: 'relations', page: 0, count: 1 },
            value: [{ targetEntityId: 'target', relationType: 'r' }],
          },
        ],
        removals: ['summary'],
        relations: { present: true, count: 1 },
      }),
      source = await admin.doc(f.source.seed.path).get(),
      book = await admin.doc(f.source.seed.bookPath).get(),
      reserved = await reserveAllEditUploads(f),
      field = f.uploads[0];
    assert.equal(reserved.reservedCount, 3);
    await assert.rejects(() =>
      field
        .factory()
        .cancelBookLoreFieldUpload(f.uid, { ...field.ref, operationId: 'isolated-cancel' }),
    );
    assert.equal(
      (await admin.doc(f.source.seed.path).get()).updateTime.isEqual(source.updateTime),
      true,
    );
    assert.equal(
      (await admin.doc(f.source.seed.bookPath).get()).updateTime.isEqual(book.updateTime),
      true,
    );
    await admin.doc(f.source.seed.bookPath).update({ authorId: 'other' });
    const done = await drainEditReservation(f, (await cancelEditReservation(f, reserved)).progress);
    assert.equal(done.phase, 'cancelled');
    assert.equal(done.releasedCount, 3);
    for (const upload of f.uploads) {
      assert.equal(
        (await upload.factory().getBookLoreFieldUpload(f.uid, upload.ref)).phase,
        'cancelled',
      );
      assert.equal(
        (
          await admin
            .doc('books/' + f.bookId + '/bookResourceBodies/' + upload.prepared.manifest.bodyId)
            .get()
        ).exists,
        false,
      );
    }
  }
});
test('SDK current v2 head protects staged bytes during cancel and cleanup resumes after that reference is removed', async () => {
  const f = await editReservationFixture(admin, { mode: 'v1' }),
    source = await admin.doc(f.source.seed.path).get(),
    reserved = await reserveAllEditUploads(f),
    cancelled = (await cancelEditReservation(f, reserved)).progress,
    slot = (await admin.doc(f.c.path + '/slots/' + editSlotId(f.uploads[0].target)).get()).data(),
    old = f.source.seed.storage,
    storage = {
      schemaVersion: 2,
      generationId: digest('sdk-late-reserved-head'),
      base: old.base,
      fields: { details: slot.pointer },
      dates: { createdAt: 1000, updatedAt: 2000 },
      relations: { ...old.relations, generationId: old.generationId, sealBirth: old.sealBirth },
      sealBirth: slot.pointer.expectedBirth,
    };
  // Reachability harness only: adoption remains a later increment.
  await admin
    .doc(f.source.seed.path)
    .set({ bookId: f.bookId, ...storage.dates, payloadStorage: storage });
  const blocked = await drainEditReservation(f, cancelled);
  assert.equal(blocked.phase, 'cancelling');
  assert.equal(blocked.blockedReason, 'active-head');
  assert.equal(blocked.releasedCount, 0);
  assert.equal((await admin.doc(partPath(f)).get()).exists, true);
  await admin.doc(f.source.seed.path).set(source.data());
  assert.equal((await drainEditReservation(f, blocked)).phase, 'cancelled');
});
test('SDK native recreation of slot, lease, header or part preserves the affected staged body', async () => {
  for (const artifact of ['slot', 'lease', 'header', 'part']) {
    const f = await editReservationFixture(admin, {
        bookId: 'recreated-' + artifact,
        editId: 'edit-' + artifact,
      }),
      reserved = await reserveAllEditUploads(f),
      cancelled = (await cancelEditReservation(f, reserved)).progress,
      path =
        artifact === 'slot'
          ? f.c.path + '/slots/' + editSlotId(f.uploads[0].target)
          : artifact === 'lease'
            ? leasePath(f)
            : artifact === 'header'
              ? bodyPath(f)
              : partPath(f),
      ref = admin.doc(path),
      original = (await ref.get()).data();
    await ref.delete();
    await ref.create(original);
    await assert.rejects(() => drainEditReservation(f, cancelled));
    assert.equal((await ref.get()).exists, true);
    assert.equal((await admin.doc(bodyPath(f)).get()).exists, true);
    assert.equal((await admin.doc(partPath(f)).get()).exists, true);
  }
});
test('SDK failed parent write rolls back physical collection and child controls before a resumable retry', async () => {
  const f = await editReservationFixture(admin),
    reserved = await reserveAllEditUploads(f),
    cancelled = (await cancelEditReservation(f, reserved)).progress;
  let pending = (
    await f.factory().advanceBookLoreEditReservationCleanup(f.uid, editControl(f, cancelled))
  ).progress;
  pending = (
    await f.factory().advanceBookLoreEditReservationCleanup(f.uid, editControl(f, pending))
  ).progress;
  assert.equal(
    (await admin.doc(inventoryPath(f) + '/state/current').get()).data().phase,
    'collecting',
  );
  const paths = [
      f.c.path,
      f.uploads[0].c.path,
      leasePath(f),
      inventoryPath(f) + '/state/current',
      partPath(f),
    ],
    before = await Promise.all(paths.map((path) => admin.doc(path).get())),
    run = admin.runTransaction.bind(admin),
    request = editControl(f, pending);
  admin.runTransaction = (fn) =>
    run((tx) =>
      fn(
        new Proxy(tx, {
          get(target, key) {
            if (key === 'update')
              return (ref, ...args) => {
                target.update(ref, ...args);
                if (ref.path === f.c.path) throw Error('injected collection rollback');
                return target;
              };
            const value = Reflect.get(target, key, target);
            return typeof value === 'function' ? value.bind(target) : value;
          },
        }),
      ),
    );
  try {
    await assert.rejects(
      () => f.factory().advanceBookLoreEditReservationCleanup(f.uid, request),
      /injected collection rollback/,
    );
  } finally {
    admin.runTransaction = run;
  }
  for (let i = 0; i < paths.length; i++) {
    const current = await admin.doc(paths[i]).get();
    assert.deepEqual(current.data(), before[i].data());
    assert.equal(current.updateTime.isEqual(before[i].updateTime), true);
  }
  assert.equal((await getEditReservation(f)).revision, pending.revision);
  assert.equal((await drainEditReservation(f, pending)).phase, 'cancelled');
});
