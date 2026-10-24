import test from 'node:test';
import assert from 'node:assert/strict';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import { creationCompositionFixture } from './helpers/bookLoreCreationCompositionFixture.mjs';
import {
  creationUploadFixture,
  finishCreationUploads,
  advanceParent,
  creationCleanupControl,
} from './helpers/bookLoreCreationUploadFixture.mjs';
import {
  reserveAllEditUploads,
  editControl,
  initializeEditReservation,
  getEditReservation,
} from './helpers/bookLoreEditReservationFixture.mjs';
import {
  advanceCompilation,
  finishCompilation,
  openCompilation,
} from './helpers/bookLoreEditCompilationFixture.mjs';
import {
  bookLoreDeletionFixture,
  markBookDeleting,
  finishBookLoreDeletion,
} from './helpers/bookLoreDeletionFixture.mjs';
import { readBookResourcePayload } from '../src/bookResourcePayloadRead.mjs';
import { resourcePayloadChunkPath } from '../src/bookResourcePayloadPaths.mjs';
import { editReservationIntent } from '../src/bookLoreEditReservationContracts.mjs';
const setup = async (options) => {
  const d = adventureImportDb({ nativeUpdates: true });
  return { ...d, ...(await creationCompositionFixture(d.db, options)) };
};
const pointerValue = (f, pointer) =>
  f.db.runTransaction((tx) =>
    readBookResourcePayload(tx, f.db, {
      uid: f.uid,
      bookId: f.bookId,
      resource: { kind: 'lore', parentId: null, id: f.loreId },
      ...pointer,
    }),
  );
const bytes = (f) => [...f.records.keys()].filter((p) => /\/bookResource(Bodies|Chunks)\//.test(p));
const start = (f) => f.factory().startBookLoreEditReservation(f.uid, f.intent);
const ready = async (f) => finishCompilation(f, await reserveAllEditUploads(f));
const end = async (f) =>
  finishCreationUploads(
    f.parent,
    await f.parent.cancel('cancel-composition', f.parentProgress.jobToken),
  );

test('creation compiles required literal fields without a head, inspection, base or premature clocks', async () => {
  const f = await setup({
      changes: [
        { target: { field: 'name' }, value: '\ufeffName 🌙' },
        { target: { field: 'category' }, value: 'other' },
        { target: { field: 'details' }, value: '\ufeffliteral 🌙\r\n'.repeat(8000) },
        { target: { field: 'isPublic' }, value: true },
      ],
      removals: ['summary'],
    }),
    book = structuredClone(f.records.get('books/book')),
    p = await ready(f),
    opened = await openCompilation(f),
    storage = opened.storage;
  assert.equal(p.compilation.phase, 'ready');
  assert.equal(storage.base, null);
  assert.deepEqual(storage.dates, { updatedAt: 2000 });
  assert.equal(storage.fields.summary, null);
  assert.equal(Object.hasOwn(storage.fields, 'imageUrl'), false);
  for (const field of f.uploads)
    assert.deepEqual(await pointerValue(f, storage.fields[field.target.field]), field.value);
  assert.deepEqual(f.records.get('books/book'), book);
  assert.equal(f.records.has('books/book/lore/' + f.loreId), false);
  assert.equal(
    [...f.records.keys()].some((p) => p.includes('/bookLoreSourceInspections/')),
    false,
  );
  const context = f.records.get(f.c.path).context;
  assert.equal(context.sourceMode, 'creation');
  for (const key of ['sourceBirth', 'sourceUpdate', 'inspectionBirth', 'sourceStorageHash'])
    assert.equal(Object.hasOwn(context, key), false);
  const generation = f.records.get('books/book/bookLoreGenerations/' + storage.generationId);
  assert.equal(generation.schemaVersion, 2);
  assert.deepEqual(generation.creationSource.reference, f.intent.creation);
  assert.equal(Object.hasOwn(generation, 'sourceBirth'), false);
  await assert.rejects(() =>
    f.factory().adoptBookLoreEditGeneration(f.uid, editControl(f, p, 'no-premature-activation')),
  );
  assert.equal((await end(f)).phase, 'cancelled');
  assert.equal(bytes(f).length, 0);
  assert.equal((await getEditReservation(f)).phase, 'cancelled');
  assert.equal(f.records.has(f.c.path + '/compilationCertificate/current'), true);
});

test('creation requires every selected relation page and cannot inherit a nonexistent source', async () => {
  const relation = { targetEntityId: 'other', relationType: 'linked' },
    f = await setup({
      relations: { present: true, count: 65 },
      changes: [
        { target: { field: 'name' }, value: 'Name' },
        { target: { field: 'category' }, value: 'other' },
        {
          target: { field: 'relations', page: 0, count: 64 },
          value: Array.from({ length: 64 }, () => relation),
        },
        { target: { field: 'relations', page: 1, count: 1 }, value: [relation] },
      ],
    });
  const p = await ready(f),
    { storage } = await openCompilation(f);
  assert.equal(p.compilation.totalPages, 2);
  assert.equal(storage.relations.count, 65);
  assert.equal(storage.relations.generationId, storage.generationId);
  await end(f);
  assert.equal(
    [...f.records.keys()].some((p) => p.includes('/bookLoreSegments/')),
    false,
  );
  assert.equal(bytes(f).length, 0);
  assert.equal(f.records.has(f.parent.c.path + '/attempts/' + f.editId), true);
});
for (const relations of [
  { present: false, count: 0 },
  { present: true, count: 0 },
])
  test('creation preserves explicit empty relation presence ' + relations.present, async () => {
    const f = await setup({ relations });
    await ready(f);
    assert.equal((await openCompilation(f)).storage.relations.present, relations.present);
    await end(f);
  });
test('creation has no implicit required fields, relations or inspection and tokens cannot cross origins', async () => {
  const f = await setup();
  for (const change of [
    (v) => delete v.fields.name,
    (v) => delete v.fields.category,
    (v) => (v.fields.name = null),
    (v) => delete v.relations,
    (v) => (v.sourceToken = 'a'.repeat(64)),
    (v) =>
      (v.inspection = {
        inspectionId: 'fake',
        startHash: 'a'.repeat(64),
        jobToken: 'b'.repeat(64),
      }),
  ]) {
    const v = structuredClone(f.intent);
    change(v);
    assert.throws(() => editReservationIntent(f.uid, v));
  }
  const v = structuredClone(f.intent);
  v.creation.startHash = 'a'.repeat(64);
  await assert.rejects(() => f.factory().startBookLoreEditReservation(f.uid, v));
  assert.equal(f.records.has(f.c.path), false);
  await end(f);
});
test('missing relation upload blocks compilation with a domain conflict and remains cancellable', async () => {
  const f = await setup({ relations: { present: true, count: 1 } });
  let p = await reserveAllEditUploads(f);
  while (p.compilation?.phase !== 'relations') p = (await advanceCompilation(f, p)).progress;
  await assert.rejects(
    () => advanceCompilation(f, p),
    (e) => e.details?.reason === 'book-lore-edit-conflict' || e.code === 'failed-precondition',
  );
  await end(f);
  assert.equal(bytes(f).length, 0);
});
for (const stage of ['initializing', 'generation', 'reserved', 'audit', 'ready'])
  test(
    'parent cancellation coordinates the ' + stage + ' attempt before draining all owned bytes',
    async () => {
      const f = await setup();
      let p = await start(f);
      if (stage !== 'initializing') p = await initializeEditReservation(f, p);
      if (['reserved', 'audit', 'ready'].includes(stage)) p = await reserveAllEditUploads(f, p);
      if (stage === 'audit')
        while (p.compilation?.phase !== 'audit') p = (await advanceCompilation(f, p)).progress;
      if (stage === 'ready') p = await finishCompilation(f, p);
      const cancelled = await f.parent.cancel('cancel-at-' + stage, f.parentProgress.jobToken);
      assert.equal(cancelled.cleanupPhase, 'attempts');
      await assert.rejects(() => advanceCompilation(f, p));
      const other = await creationUploadFixture(f.db, {
        parent: f.parent,
        uploadId: 'after-close',
      });
      await assert.rejects(() => other.factory().startBookLoreFieldUpload(other.uid, other.intent));
      await assert.rejects(() =>
        f.factory().startBookLoreEditReservation(f.uid, { ...f.intent, editId: 'after-close' }),
      );
      const done = await finishCreationUploads(f.parent, cancelled);
      assert.equal(done.completedUploads, 2);
      assert.equal(bytes(f).length, 0);
      assert.equal((await getEditReservation(f)).phase, 'cancelled');
      assert.equal((await f.parent.start()).phase, 'cancelled');
    },
  );
for (const change of ['owner', 'deleting', 'absent'])
  test(
    'cleanup of a preparing creation after root becomes ' + change + ' preserves history only',
    async () => {
      const f = await setup();
      await ready(f);
      await f.db.runTransaction((tx) =>
        change === 'absent'
          ? tx.delete(f.db.doc('books/book'))
          : tx.update(
              f.db.doc('books/book'),
              change === 'owner' ? { authorId: 'other' } : { deleting: true },
            ),
      );
      await assert.rejects(() => openCompilation(f));
      await end(f);
      assert.equal(bytes(f).length, 0);
      assert.equal((await getEditReservation(f)).phase, 'cancelled');
    },
  );
for (const artifact of ['binding', 'proof', 'job', 'generation', 'part'])
  test(
    'recreated ' + artifact + ' is never collected through the old creation attempt',
    async () => {
      const f = await setup();
      await ready(f);
      const p = await f.parent.cancel(),
        job = f.records.get(f.c.path),
        path =
          artifact === 'binding'
            ? f.parent.c.path + '/attempts/' + f.editId
            : artifact === 'proof'
              ? f.parent.c.path + '/attemptProofs/' + f.editId
              : artifact === 'job'
                ? f.c.path
                : artifact === 'generation'
                  ? 'books/book/bookLoreGenerations/' + job.generationId
                  : resourcePayloadChunkPath(f.bookId, f.uploads[0].prepared.manifest.bodyId, 0),
        value = structuredClone(f.records.get(path));
      await f.db.runTransaction((tx) => tx.delete(f.db.doc(path)));
      await f.db.runTransaction((tx) => tx.create(f.db.doc(path), value));
      await assert.rejects(() => finishCreationUploads(f.parent, p));
      assert.deepEqual(f.records.get(path), value);
      assert.equal((await f.parent.get()).phase, 'cancelling');
    },
  );
test('start rolls the native attempt binding and proof back with the edit job', async () => {
  const f = await setup(),
    before = structuredClone([...f.records]),
    run = f.db.runTransaction.bind(f.db);
  f.db.runTransaction = (fn) =>
    run((tx) =>
      fn({
        ...tx,
        create(ref, v) {
          tx.create(ref, v);
          if (ref.path === f.c.path) throw Error('injected attempt start failure');
        },
      }),
    );
  await assert.rejects(() => start(f), /injected/);
  assert.deepEqual([...f.records], before);
});
test('cancellation advances child and parent atomically; concurrent exact retries replay one receipt', async () => {
  const f = await setup();
  await ready(f);
  const p = await f.parent.cancel(),
    before = structuredClone([...f.records]),
    run = f.db.runTransaction.bind(f.db);
  f.db.runTransaction = (fn) =>
    run((tx) =>
      fn({
        ...tx,
        update(ref, v) {
          tx.update(ref, v);
          if (ref.path === f.parent.c.path + '/cleanup/current')
            throw Error('injected parent failure');
        },
      }),
    );
  await assert.rejects(() => advanceParent(f.parent, p), /injected/);
  assert.deepEqual([...f.records], before);
  f.db.runTransaction = run;
  const r = creationCleanupControl(f.parent, p),
    [a, b] = await Promise.all([
      f.parent.factory().advanceBookLoreCreationCleanup(f.uid, r),
      f.parent.factory().advanceBookLoreCreationCleanup(f.uid, r),
    ]);
  assert.deepEqual(a.receipt, b.receipt);
  assert.equal((await f.parent.get()).cleanupRevision, 1);
  await finishCreationUploads(f.parent, await f.parent.get());
});
test('book deletion coordinates a partially compiled native creation without erasing its permanent proofs', async () => {
  const f = await setup();
  await ready(f);
  const deletion = bookLoreDeletionFixture(f.db);
  await markBookDeleting(deletion);
  assert.equal((await finishBookLoreDeletion(deletion)).complete, true);
  assert.equal(bytes(f).length, 0);
  assert.equal(f.records.has('books/book'), false);
  assert.equal((await getEditReservation(f)).phase, 'cancelled');
  assert.equal((await f.parent.get()).phase, 'cancelled');
});
test('unknown generation or inventory cannot be hidden among retained cancelled creation metadata', async () => {
  for (const collection of ['bookLoreGenerations', 'bookResourceInventory', 'bookLoreEdits']) {
    const f = await setup();
    await ready(f);
    const path =
        collection === 'bookLoreEdits'
          ? 'users/author/bookLoreEdits/unknown'
          : 'books/book/' + collection + '/' + 'a'.repeat(64),
      value =
        collection === 'bookLoreEdits'
          ? { context: { intent: { loreId: f.loreId } }, startHash: 'b'.repeat(64) }
          : { loreId: f.loreId };
    await f.db.runTransaction((tx) => tx.create(f.db.doc(path), value));
    await assert.rejects(() => end(f));
    assert.deepEqual(f.records.get(path), value);
    assert.equal((await f.parent.get()).phase, 'cancelling');
  }
});

test('multiple creation attempts and unreserved uploads are drained while another creator remains untouched', async () => {
  const f = await setup();
  await ready(f);
  const second = await creationCompositionFixture(f.db, {
    parent: f.parent,
    editId: 'second-native-attempt',
  });
  await ready(second);
  const loose = await creationUploadFixture(f.db, {
    parent: f.parent,
    uploadId: 'unreserved-extra-field',
  });
  const { uploadAll, sealAll } = await import('./helpers/bookLoreFieldUploadFixture.mjs');
  await sealAll(loose, await uploadAll(loose));
  const sibling = await creationCompositionFixture(f.db, {
    creationId: 'sibling-creation',
    editId: 'sibling-attempt',
  });
  const siblingProgress = await ready(sibling),
    before = structuredClone(f.records.get(sibling.c.path));
  const done = await end(f);
  assert.equal(done.completedUploads, 5);
  assert.equal((await getEditReservation(second)).phase, 'cancelled');
  assert.deepEqual(f.records.get(sibling.c.path), before);
  assert.equal((await sibling.parent.get()).phase, 'preparing');
  assert.equal((await getEditReservation(sibling)).revision, siblingProgress.revision);
  assert.ok(bytes(f).length > 0);
  await end(sibling);
  assert.equal(bytes(f).length, 0);
});
test('the frozen native attempt confirms exact start retries and cleanup CAS never mutates a later revision', async () => {
  const f = await setup(),
    [a, b] = await Promise.all([start(f), start(f)]);
  assert.deepEqual(a, b);
  const initialized = await initializeEditReservation(f, a);
  assert.equal((await start(f)).revision, initialized.revision);
  let p = await f.parent.cancel();
  const r = creationCleanupControl(f.parent, p),
    one = await f.parent.factory().advanceBookLoreCreationCleanup(f.uid, r);
  const before = structuredClone([...f.records]);
  await assert.rejects(() =>
    f.parent
      .factory()
      .advanceBookLoreCreationCleanup(f.uid, { ...r, operationId: 'stale-cleanup-revision' }),
  );
  assert.deepEqual([...f.records], before);
  assert.deepEqual(
    (await f.parent.factory().advanceBookLoreCreationCleanup(f.uid, r)).receipt,
    one.receipt,
  );
  p = await finishCreationUploads(f.parent, one.progress);
  assert.equal((await start(f)).phase, 'cancelled');
  assert.equal(p.phase, 'cancelled');
});
test('a recreated root does not authorize compilation or erasing the former incarnation bytes', async () => {
  const f = await setup();
  await ready(f);
  const original = structuredClone(f.records.get('books/book'));
  await f.db.runTransaction((tx) => tx.delete(f.db.doc('books/book')));
  await f.db.runTransaction((tx) => tx.create(f.db.doc('books/book'), original));
  await assert.rejects(() => openCompilation(f));
  await assert.rejects(() => end(f));
  assert.ok(bytes(f).length > 0);
  assert.equal((await f.parent.get()).phase, 'cancelling');
});
