import test from 'node:test';
import assert from 'node:assert/strict';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import {
  adoptionFixture,
  adoptFixture,
  nextAdoptionFixture,
} from './helpers/bookLoreEditAdoptionFixture.mjs';
import { cancelEditReservation } from './helpers/bookLoreEditReservationFixture.mjs';
import { createBookLoreEditOutcomeService } from '../src/bookLoreEditOutcome.mjs';
import { createBookLoreResourceInventoryService } from '../src/bookLoreResourceInventory.mjs';
import { digest } from '../src/workProgressContracts.mjs';
import { creationFixture, seedCreationBook } from './helpers/bookLoreCreationFixture.mjs';
import { creationAdoptionFixture } from './helpers/bookLoreCreationAdoptionFixture.mjs';

const identity = (overrides = {}) => ({
  writeId: 'original-write',
  bookId: 'book',
  loreId: 'entity',
  ...overrides,
});
const editId = (uid, i) =>
  'lore-edit-' +
  digest({
    domain: 'writer-book-lore-client-job',
    uid,
    writeId: i.writeId,
    bookId: i.bookId,
    loreId: i.loreId,
    kind: 'lore-edit',
    index: 0,
  });
async function setup(options = {}) {
  const d = adventureImportDb({ nativeUpdates: true }),
    i = identity(),
    f = await adoptionFixture(d.db, { editId: editId('author', i), ...options });
  return {
    ...d,
    ...f,
    request: { ...i, editId: f.editId, sourceToken: f.intent.sourceToken, startHash: f.startHash },
  };
}
const api = (f) => createBookLoreEditOutcomeService({ db: f.db });
const query = (f, input = f.request) => api(f).bookLoreEditOutcome(f.uid, input);
const conflict = (error) => error.code === 'failed-precondition';
async function readonly(f, action) {
  const before = f.commits.length,
    records = structuredClone([...f.records]);
  const result = await action();
  assert.deepEqual([...f.records], records);
  assert.deepEqual(f.commits.slice(before).flat(), []);
  return result;
}
for (const mode of ['inline', 'v1', 'v2'])
  test(
    mode + ': ready is not applied; native original adoption is confirmed without body or writes',
    async () => {
      const f = await setup({ mode, changes: [{ target: { field: 'isPublic' }, value: false }] });
      const ready = await readonly(f, () => query(f));
      assert.equal(ready.phase, 'preparing');
      assert.equal(ready.applied, false);
      assert.equal(ready.adoption, null);
      assert.equal(ready.outcomeToken, null);
      assert.deepEqual(ready.changedFields, ['isPublic']);
      await adoptFixture(f);
      const success = await readonly(f, () => query(f, { ...f.request, jobToken: ready.jobToken }));
      assert.equal(success.applied, true);
      assert.equal(success.phase, 'adopted');
      assert.match(success.outcomeToken, /^[a-f0-9]{64}$/);
      assert.deepEqual(success.adoption.privacy, {
        before: { present: true, value: mode !== 'v2' },
        after: { present: true, value: false },
      });
      assert.equal(success.adoption.revoked, mode !== 'v2');
      const serialized = JSON.stringify(success);
      for (const forbidden of [
        'Original',
        'saved',
        'chunkBase64',
        'bodyId',
        'generationId',
        'books/',
        'users/',
      ])
        assert.equal(serialized.includes(forbidden), false, forbidden);
      assert.deepEqual(
        await readonly(f, () =>
          query(f, {
            ...f.request,
            jobToken: success.jobToken,
            outcomeToken: success.outcomeToken,
          }),
        ),
        success,
      );
    },
  );
test('lost apply response can be checked with a new service without any mutation', async () => {
  const f = await setup();
  await adoptFixture(f); // original reply intentionally not retained by caller
  const result = await readonly(f, () => query(f));
  assert.equal(result.applied, true);
  assert.equal(result.adoption.operationId, f.adoptRequest.operationId);
});
for (const key of [
  'writeId',
  'bookId',
  'loreId',
  'sourceToken',
  'startHash',
  'jobToken',
  'outcomeToken',
  'editId',
])
  test('rejects changed original ' + key, async () => {
    const f = await setup();
    await adoptFixture(f);
    const r = await query(f);
    await assert.rejects(
      () =>
        readonly(f, () =>
          query(f, {
            ...f.request,
            jobToken: r.jobToken,
            outcomeToken: r.outcomeToken,
            [key]: ['writeId', 'bookId', 'loreId', 'editId'].includes(key)
              ? 'different'
              : 'f'.repeat(64),
          }),
        ),
      conflict,
    );
  });
test('different authenticated UID cannot adopt the same operation identity', async () => {
  const f = await setup();
  await assert.rejects(() => api(f).bookLoreEditOutcome('other', f.request), conflict);
});
test('requires Auth and closed request without content, methods or supplied UID', async () => {
  const f = await setup();
  await assert.rejects(
    () => api(f).bookLoreEditOutcome(null, f.request),
    (e) => e.code === 'unauthenticated',
  );
  for (const extra of [
    { uid: 'author' },
    { method: 'adoptBookLoreEditGeneration' },
    { text: 'PRIVATE' },
  ])
    await assert.rejects(
      () => query(f, { ...f.request, ...extra }),
      (e) => e.code === 'invalid-argument',
    );
});
test('unobserved absence is null, never an applied result; pinned absence fails', async () => {
  const d = adventureImportDb({ nativeUpdates: true }),
    i = identity(),
    r = {
      ...i,
      editId: editId('author', i),
      sourceToken: 'a'.repeat(64),
      startHash: 'b'.repeat(64),
    },
    f = { ...d, uid: 'author', request: r };
  assert.equal(await readonly(f, () => query(f)), null);
  for (const key of ['jobToken', 'outcomeToken'])
    await assert.rejects(() => query(f, { ...r, [key]: 'c'.repeat(64) }), conflict);
});
for (const child of ['operations', 'operationProofs', 'slots'])
  test('absent parent with orphan ' + child + ' fails without returning null', async () => {
    const d = adventureImportDb({ nativeUpdates: true }),
      i = identity(),
      id = editId('author', i),
      f = {
        ...d,
        uid: 'author',
        request: {
          ...i,
          editId: id,
          sourceToken: 'a'.repeat(64),
          startHash: 'b'.repeat(64),
        },
      };
    await f.db.runTransaction((tx) =>
      tx.create(f.db.doc('users/author/bookLoreEdits/' + id + '/' + child + '/orphan'), {}),
    );
    await assert.rejects(() => query(f), conflict);
  });
for (const kind of [
  'receipt-missing',
  'anchor-missing',
  'receipt-recreated',
  'anchor-recreated',
  'event-recreated',
  'event-proof-missing',
])
  test('rejects broken original native ' + kind + ', even with a saved outcome token', async () => {
    const f = await setup();
    await adoptFixture(f);
    const result = await query(f),
      j = f.records.get(f.c.path),
      generation = 'books/book/bookLoreGenerations/' + j.generationId,
      eventId = '0000000000000001',
      path = kind.startsWith('receipt')
        ? f.c.path + '/operations/' + f.adoptRequest.operationId
        : kind.startsWith('anchor')
          ? f.c.path + '/operationProofs/' + f.adoptRequest.operationId
          : generation + (kind === 'event-proof-missing' ? '/proofs/' : '/events/') + eventId,
      old = f.records.get(path);
    assert.ok(old, path);
    await f.db.runTransaction((tx) => tx.delete(f.db.doc(path)));
    if (kind.endsWith('recreated'))
      await f.db.runTransaction((tx) => tx.create(f.db.doc(path), old));
    await assert.rejects(
      () => query(f, { ...f.request, outcomeToken: result.outcomeToken }),
      conflict,
    );
  });
test('original result survives a second edit, retirement, body GC and missing book/head', async () => {
  const f = await setup();
  await adoptFixture(f);
  const first = await query(f),
    pointer = f.records.get(f.c.path).adoption.storage.fields.details;
  const next = await nextAdoptionFixture(f, {
    changes: [{ target: { field: 'details' }, value: 'another actual edit' }],
  });
  await adoptFixture(next);
  const inventory = createBookLoreResourceInventoryService({ db: f.db });
  let complete = false;
  for (let n = 0; n < 100 && !complete; n++)
    complete = (
      await inventory.collectBookLoreInventoryBody(f.uid, {
        bookId: f.bookId,
        bodyId: pointer.manifest.bodyId,
      })
    ).complete;
  assert.equal(complete, true);
  assert.equal(f.records.has('books/book/bookResourceBodies/' + pointer.manifest.bodyId), false);
  const pinned = { ...f.request, jobToken: first.jobToken, outcomeToken: first.outcomeToken };
  assert.deepEqual(await readonly(f, () => query(f, pinned)), first);
  await f.db.runTransaction((tx) => {
    tx.delete(f.db.doc(f.source.seed.path));
    tx.delete(f.db.doc(f.source.seed.bookPath));
  });
  assert.deepEqual(await readonly(f, () => query(f, pinned)), first);
});
test('cancelling preparation is not reported as application or a cancellation certificate', async () => {
  const f = await setup();
  await cancelEditReservation(f, f.ready);
  const r = await readonly(f, () => query(f));
  assert.equal(r.phase, 'cancelling');
  assert.equal(r.applied, false);
  assert.equal(r.outcomeToken, null);
  assert.equal(r.adoption, null);
});

test('rejects a real creation even if its edit ID is derived from the supplied manual identity', async () => {
  const d = adventureImportDb({ nativeUpdates: true });
  await seedCreationBook(d.db);
  const parent = creationFixture(d.db),
    created = await parent.start(),
    i = identity({ loreId: created.loreId }),
    f = await creationAdoptionFixture(d.db, { parent, editId: editId('author', i) });
  await assert.rejects(
    () =>
      api(f).bookLoreEditOutcome(f.uid, {
        ...i,
        editId: f.editId,
        startHash: f.startHash,
        sourceToken: f.intent.sourceToken,
      }),
    conflict,
  );
});
test('an original cancel fence is metadata only, with no fabricated adoption', async () => {
  const f = await setup();
  // Use another deterministic manual ID with no producer.
  const i = identity({ writeId: 'never-started' }),
    id = editId(f.uid, i),
    r = { ...i, editId: id, startHash: 'b'.repeat(64), sourceToken: 'a'.repeat(64) };
  await f.factory().cancelBookLoreEditReservation(f.uid, {
    editId: id,
    startHash: r.startHash,
    operationId: 'original-cancel',
  });
  const result = await readonly(f, () => query(f, r));
  assert.equal(result.phase, 'cancelled');
  assert.equal(result.jobToken, null);
  assert.equal(result.applied, false);
  assert.deepEqual(result.changedFields, []);
  assert.equal(result.relationsChanged, false);
});
