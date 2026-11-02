import test from 'node:test';
import assert from 'node:assert/strict';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import { adoptionFixture, adoptFixture } from './helpers/bookLoreEditAdoptionFixture.mjs';
import {
  compilationFixture,
  advanceCompilation,
} from './helpers/bookLoreEditCompilationFixture.mjs';
import { fieldUploadFixture, uploadAll } from './helpers/bookLoreFieldUploadFixture.mjs';
import {
  sourceInspectionFixture,
  inspectionControl,
} from './helpers/bookLoreSourceInspectionFixture.mjs';
import { seedResourcePayload } from './helpers/bookResourcePayloadFixture.mjs';
import { seedBookLoreRead } from './helpers/bookLoreReadFixture.mjs';
import {
  bookLoreDeletionFixture,
  markBookDeleting,
  finishBookLoreDeletion,
} from './helpers/bookLoreDeletionFixture.mjs';
import { digest } from '../src/workProgressContracts.mjs';
import { getEditReservation } from './helpers/bookLoreEditReservationFixture.mjs';
import { resourcePayloadChunkPath } from '../src/bookResourcePayloadPaths.mjs';
import { loadBookLoreDeletion, assertDeletionOpening } from '../src/bookLoreDeletionStore.mjs';
async function adopted(options = {}) {
  const d = adventureImportDb({ nativeUpdates: true }),
    f = await adoptionFixture(d.db, { mode: 'inline', ...options });
  await adoptFixture(f);
  return { ...d, ...f, ...bookLoreDeletionFixture(d.db, { uid: f.uid, bookId: f.bookId }) };
}
const state = (f) => f.records.get(f.path + '/state/current');
const remains = (f) =>
  [...f.records.keys()].filter((p) =>
    ['bookResourceBodies', 'bookResourceChunks', 'bookLoreSegments', 'lore'].some((n) =>
      p.startsWith('books/' + f.bookId + '/' + n + '/'),
    ),
  );
async function until(f, condition) {
  for (let i = 0; i < 10000 && !condition(state(f)); i++) await f.step();
  assert.ok(condition(state(f)));
}
test('delete an adopted inline book and retain private success, leases and inventory fences', async () => {
  const f = await adopted(),
    count = jobCount(f);
  await markBookDeleting(f);
  const result = await finishBookLoreDeletion(f);
  assert.equal(result.complete, true);
  assert.equal(f.records.has('books/' + f.bookId), false);
  assert.equal(remains(f).length, 0);
  assert.equal((await getEditReservation(f)).phase, 'adopted');
  assert.ok(
    [...f.records.keys()].some((p) => p.startsWith('books/' + f.bookId + '/bookResourceLeases/')),
  );
  assert.equal(jobCount(f), count);
  assert.ok(f.records.has('deletedBooks/' + f.bookId));
  assert.deepEqual(await f.step(), result);
});
function jobCount(f) {
  return [...f.records.keys()].filter(
    (p) =>
      p.startsWith('users/' + f.uid + '/bookLoreEdits/') ||
      p.startsWith('users/' + f.uid + '/bookLoreFieldUploads/'),
  ).length;
}
for (const mode of ['v1', 'v2'])
  test(
    'delete adopted ' +
      mode +
      ' payloads and descriptors without purging original control metadata',
    async () => {
      const relations = Array.from({ length: 65 }, (_, i) => ({
          targetEntityId: 't' + i,
          relationType: 'r',
        })),
        f = await adopted({
          mode,
          sourceOptions:
            mode === 'v2' ? { relations } : { data: { name: 'N', category: 'other', relations } },
          relations: { present: true, count: 65 },
          changes: [{ target: { field: 'details' }, value: 'new' }],
        });
      await markBookDeleting(f);
      await finishBookLoreDeletion(f);
      assert.equal(remains(f).length, 0);
      assert.ok(
        [...f.records.keys()].some((p) =>
          p.startsWith('books/' + f.bookId + '/bookLoreGenerations/'),
        ),
      );
    },
  );
test('book cleanup cancels unreserved inline work, standalone upload and pending inspection', async () => {
  const d = adventureImportDb({ nativeUpdates: true }),
    base = await compilationFixture(d.db, {
      mode: 'inline',
      changes: [],
      removals: ['summary'],
      sourceOptions: { data: { name: 'N', category: 'other', details: 'x'.repeat(100000) } },
    });
  let p = base.progress;
  while (true) {
    const w = d.records.get(base.c.path).compilation?.inlineWork,
      c = w ? d.records.get('users/author/bookLoreFieldUploads/' + w.uploadId) : null;
    if (w?.target.field === 'details' && c?.nextIndex > 0 && c.phase === 'uploading') break;
    p = (await advanceCompilation(base, p)).progress;
  }
  const ordinary = await fieldUploadFixture(d.db, {
    loreId: 'other-lore',
    uploadId: 'ordinary-upload',
    value: 'x'.repeat(100000),
  });
  await uploadAll(ordinary);
  const inspecting = await sourceInspectionFixture(d.db, {
      inspectionId: 'pending-inspection',
      existingSeed: base.source.seed,
    }),
    started = await inspecting
      .factory()
      .startBookLoreSourceInspection(inspecting.uid, inspecting.intent);
  await inspecting
    .factory()
    .advanceBookLoreSourceInspection(inspecting.uid, inspectionControl(inspecting, started));
  const f = { ...d, ...base, ...bookLoreDeletionFixture(d.db) };
  await markBookDeleting(f);
  await finishBookLoreDeletion(f);
  assert.equal(remains(f).length, 0);
  assert.equal((await getEditReservation(base)).phase, 'cancelled');
  assert.equal(d.records.get(ordinary.c.path).phase, 'cancelled');
  assert.equal(d.records.get(inspecting.c.path).phase, 'cancelled');
  assert.equal(d.records.has(inspecting.c.stateRef.path), false);
});
test('unmanaged legacy payload over 128 parts is deleted by metadata batches with header last', async () => {
  const d = adventureImportDb({ nativeUpdates: true }),
    seed = await seedBookLoreRead(d.db, {
      data: { name: 'N', category: 'other', details: '🌙'.repeat(2300000) },
    }),
    f = { ...d, ...bookLoreDeletionFixture(d.db) },
    header = seed.base.path,
    count = seed.base.prepared.manifest.chunkCount;
  assert.ok(count > 128);
  await markBookDeleting(f);
  let before = count;
  for (let i = 0; i < 1000; i++) {
    const result = await f.step(),
      current = [...f.records.keys()].filter((p) =>
        p.startsWith('books/book/bookResourceChunks/'),
      ).length;
    assert.ok(before - current <= 16);
    if (current > 0) assert.equal(f.records.has(header), true);
    before = current;
    if (result.complete) break;
  }
  assert.equal(f.records.has('books/book'), false);
  assert.equal(remains(f).length, 0);
  const reads = f.metadataReads.filter((r) => r.path.includes('/bookResourceChunks/'));
  assert.ok(reads.length > 128);
  assert.ok(reads.every((r) => !r.fields.includes('bytes') && !r.fields.includes('proof')));
});
for (const artifact of [
  'book',
  'context',
  'state',
  'checkpoint',
  'body',
  'part',
  'inventory',
  'generation',
])
  test('recreated ' + artifact + ' cannot resume the original book payload deletion', async () => {
    const f = await adopted();
    await markBookDeleting(f);
    await until(f, (s) => s?.phase === 'bodies' && s.body !== null);
    const body = state(f).body,
      path =
        artifact === 'book'
          ? 'books/' + f.bookId
          : artifact === 'context'
            ? f.path
            : artifact === 'state'
              ? f.path + '/state/current'
              : artifact === 'checkpoint'
                ? 'users/' + f.uid + '/sceneOperations/' + f.operationId
                : artifact === 'body'
                  ? 'books/' + f.bookId + '/bookResourceBodies/' + body.bodyId
                  : artifact === 'inventory'
                    ? 'books/' + f.bookId + '/bookResourceInventory/' + body.bodyId
                    : artifact === 'generation'
                      ? 'books/' +
                        f.bookId +
                        '/bookLoreGenerations/' +
                        f.records.get(f.c.path).generationId
                      : resourcePayloadChunkPath(f.bookId, body.bodyId, body.index),
      value = structuredClone(f.records.get(path));
    await f.db.runTransaction((tx) => tx.delete(f.db.doc(path)));
    await f.db.runTransaction((tx) => tx.create(f.db.doc(path), value));
    await assert.rejects(() => f.step());
    assert.equal(f.records.has(path), true);
    assert.equal(f.records.has('books/' + f.bookId), true);
  });
test('foreign body scope is preserved and blocks final root removal', async () => {
  const f = await adopted();
  await markBookDeleting(f);
  const header = [...f.records.keys()].find((p) =>
    /^books\/book\/bookResourceBodies\/[^/]+$/.test(p),
  );
  await f.db.runTransaction((tx) => tx.update(f.db.doc(header), { ownerId: 'other' }));
  await assert.rejects(() => finishBookLoreDeletion(f));
  assert.equal(f.records.has(header), true);
  assert.equal(f.records.has('books/book'), true);
});
test('unknown orphan chunk cannot be swept or hidden by finishing the book', async () => {
  const f = await adopted();
  await markBookDeleting(f);
  await f.db.runTransaction((tx) =>
    tx.create(f.db.doc('books/book/bookResourceChunks/unknown'), {
      schemaVersion: 1,
      ownerId: 'author',
      bookId: 'book',
      bodyId: 'a'.repeat(64),
      index: 0,
    }),
  );
  await assert.rejects(() => finishBookLoreDeletion(f));
  assert.equal(f.records.has('books/book/bookResourceChunks/unknown'), true);
  assert.equal(f.records.has('books/book'), true);
});
test('rollback reverts payload deletion, inventory and both checkpoints together', async () => {
  const f = await adopted();
  await markBookDeleting(f);
  await until(f, (s) => s?.phase === 'bodies' && s.body !== null);
  if (
    f.records.get('books/book/bookResourceInventory/' + state(f).body.bodyId + '/state/current')
      .phase !== 'collecting'
  )
    await f.step();
  const before = structuredClone([...f.records]),
    run = f.db.runTransaction.bind(f.db);
  f.db.runTransaction = (fn) =>
    run((tx) =>
      fn({
        ...tx,
        set(ref, v) {
          tx.set(ref, v);
          if (ref.path === 'users/author/sceneOperations/' + f.operationId)
            throw Error('injected deletion failure');
        },
      }),
    );
  await assert.rejects(() => f.step(), /injected deletion failure/);
  assert.deepEqual([...f.records], before);
  f.db.runTransaction = run;
  await finishBookLoreDeletion(f);
  assert.equal(remains(f).length, 0);
});
test('alias operation resumes the original native deletion context', async () => {
  const f = await adopted();
  await markBookDeleting(f);
  await f.step();
  const first = f.operationId;
  f.request = { ...f.request, operationId: 'alias-delete-operation' };
  f.step = () => f.deletionFactory().deleteSceneBook(f.uid, f.request);
  const result = await finishBookLoreDeletion(f);
  assert.equal(result.complete, true);
  assert.equal(f.records.get(f.path).operationId, first);
  assert.equal(
    f.records.get('users/author/sceneOperations/alias-delete-operation').checkpointId,
    first,
  );
});
for (const version of [1, 2])
  test(
    'legacy cleanup v' + version + ' resumes its recorded phase after the new lore stage',
    async () => {
      const f = await adopted();
      await markBookDeleting(f);
      const path = 'users/author/sceneOperations/' + f.operationId,
        target = { kind: 'book', id: f.bookId };
      await f.db.runTransaction((tx) => {
        tx.create(f.db.doc(path), {
          fingerprint: digest({ target, method: 'deleteSceneBook' }),
          kind: 'delete-book',
          input: { target, operationId: f.operationId },
          cleanupVersion: version,
          phase: 'acts',
          processed: 5,
          complete: false,
        });
        tx.update(f.db.doc('books/' + f.bookId), { sceneDeletionOperationId: f.operationId });
      });
      await finishBookLoreDeletion(f);
      assert.equal(remains(f).length, 0);
      assert.equal(f.records.get(path).cleanupVersion, 3);
    },
  );
test('native deletion opening rejects clones and another transaction', async () => {
  const f = await adopted();
  await markBookDeleting(f);
  await f.step();
  let loaded;
  await f.db.runTransaction(async (tx) => {
    loaded = await loadBookLoreDeletion(tx, f.db, f.uid, f.bookId, f.operationId);
    assertDeletionOpening(tx, loaded);
    assert.throws(() => assertDeletionOpening(tx, { ...loaded }));
  });
  await f.db.runTransaction((tx) => assert.throws(() => assertDeletionOpening(tx, loaded)));
});

test('late payload after an empty audit blocks finish without widening the original cutoff', async () => {
  const d = adventureImportDb({ nativeUpdates: true }),
    f = { ...d, ...bookLoreDeletionFixture(d.db) };
  await f.db.runTransaction((tx) =>
    tx.create(f.db.doc('books/book'), {
      authorId: 'author',
      status: 'draft',
      deleting: true,
      updatedAt: 1000,
    }),
  );
  await f.step();
  assert.equal(state(f).complete, true);
  const body = await seedResourcePayload(f.db, {
    uid: f.uid,
    bookId: f.bookId,
    resource: { kind: 'lore', parentId: null, id: 'late' },
    operationId: 'late-payload-operation',
    timestamp: 1000,
    value: { name: 'late' },
  });
  await assert.rejects(() => finishBookLoreDeletion(f));
  assert.equal(f.records.has(body.path), true);
  assert.equal(f.records.has('books/book'), true);
});
test('a recreated relation descriptor is preserved during whole-book cleanup', async () => {
  const relations = [{ targetEntityId: 't', relationType: 'r' }],
    f = await adopted({
      mode: 'v1',
      sourceOptions: { data: { name: 'N', category: 'other', relations } },
      relations: { present: true, count: 1 },
    });
  await markBookDeleting(f);
  await until(f, (s) => s?.phase === 'segments');
  const path = [...f.records.keys()].find((p) => /^books\/book\/bookLoreSegments\/[^/]+$/.test(p)),
    value = structuredClone(f.records.get(path));
  await f.db.runTransaction((tx) => tx.delete(f.db.doc(path)));
  await f.db.runTransaction((tx) => tx.create(f.db.doc(path), value));
  await assert.rejects(() => f.step());
  assert.equal(f.records.has(path), true);
  assert.equal(f.records.has('books/book'), true);
});
test('an unknown lease cannot authorize deletion of a legacy body without inventory', async () => {
  const d = adventureImportDb({ nativeUpdates: true }),
    seed = await seedBookLoreRead(d.db, { data: { name: 'N', category: 'other' } }),
    f = { ...d, ...bookLoreDeletionFixture(d.db) },
    bodyId = seed.base.prepared.manifest.bodyId;
  await f.db.runTransaction((tx) =>
    tx.create(f.db.doc('books/book/bookResourceLeases/' + bodyId), { phase: 'adopted' }),
  );
  await markBookDeleting(f);
  await assert.rejects(() => finishBookLoreDeletion(f));
  assert.equal(f.records.has(seed.base.path), true);
  assert.equal(f.records.has(resourcePayloadChunkPath('book', bodyId, 0)), true);
});
