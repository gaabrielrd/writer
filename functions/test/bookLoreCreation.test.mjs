import test from 'node:test';
import assert from 'node:assert/strict';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import { creationFixture, seedCreationBook } from './helpers/bookLoreCreationFixture.mjs';
import { creationLoreId } from '../src/bookLoreCreationContracts.mjs';
import { openCreationReservation, assertCreationOpening } from '../src/bookLoreCreationStore.mjs';
import {
  bookLoreDeletionFixture,
  markBookDeleting,
  finishBookLoreDeletion,
} from './helpers/bookLoreDeletionFixture.mjs';
import { createBookLoreReadService } from '../src/bookLoreRead.mjs';
async function fixture(data = {}) {
  const d = adventureImportDb({ nativeUpdates: true });
  await seedCreationBook(d.db, 'book', 'author', data);
  return { ...d, ...creationFixture(d.db) };
}
test('reservation is native, metadata-only and creates no active head, clock, debit or privacy change', async () => {
  const f = await fixture({
      title: 'PRIVATE_PROSE',
      publicationPrivacyVersion: 3,
      status: 'published',
    }),
    old = structuredClone(f.records.get('books/book'));
  await f.db.runTransaction(async (tx) =>
    tx.create(f.db.doc('publicBooks/book'), { revisionId: 'old' }),
  );
  const p = await f.start(),
    context = f.records.get(f.c.path);
  assert.equal(p.phase, 'preparing');
  assert.equal(p.loreId, creationLoreId(f.uid, f.intent));
  assert.match(p.jobToken, /^[a-f0-9]{64}$/);
  assert.equal(f.records.has('books/book/lore/' + p.loreId), false);
  assert.deepEqual(f.records.get('books/book'), { ...old, hasLoreResources: true });
  assert.deepEqual(f.metadata.get(f.c.path), f.metadata.get(f.c.reservationPath));
  assert.equal(JSON.stringify(context).includes('PRIVATE_PROSE'), false);
  assert.equal(f.records.has('publicBooks/book'), true);
  assert.deepEqual(await f.start(), p);
  assert.deepEqual(await f.get(), p);
});
test('different UID, book or creation IDs have distinct server-derived lore IDs', async () => {
  const f = await fixture(),
    a = await f.start();
  assert.notEqual(a.loreId, creationLoreId('other', f.intent));
  assert.notEqual(a.loreId, creationLoreId(f.uid, { ...f.intent, bookId: 'other-book' }));
  assert.notEqual(a.loreId, creationLoreId(f.uid, { ...f.intent, creationId: 'other-operation' }));
  await seedCreationBook(f.db, 'other-book');
  await assert.rejects(() =>
    f.factory().startBookLoreCreationReservation(f.uid, { ...f.intent, bookId: 'other-book' }),
  );
});
test('concurrent starts reserve once and two independent reservations keep their own permanent IDs', async () => {
  const f = await fixture(),
    [a, b] = await Promise.all([f.start(), f.start()]);
  assert.deepEqual(a, b);
  const second = creationFixture(f.db, { creationId: 'creation-operation-0002' }),
    p = await second.start(),
    before = structuredClone(f.records.get(second.c.path));
  await f.cancel();
  assert.deepEqual(f.records.get(second.c.path), before);
  assert.equal((await second.get()).phase, 'preparing');
  assert.notEqual(a.loreId, p.loreId);
  assert.equal(f.records.has('books/book/lore/' + p.loreId), false);
});
for (const data of [
  { authorId: 'other' },
  { deleting: true },
  { localLoreVersion: '0' },
  { localLoreVersion: Number.MAX_SAFE_INTEGER },
  { hasLoreResources: 'true' },
])
  test('invalid live book ' + JSON.stringify(data) + ' cannot create a reservation', async () => {
    const f = await fixture(data),
      before = structuredClone([...f.records]);
    await assert.rejects(() => f.start());
    assert.deepEqual([...f.records], before);
  });
test('cancel-before-start creates a private fence without writing an absent or foreign book namespace', async () => {
  const d = adventureImportDb({ nativeUpdates: true }),
    f = { ...d, ...creationFixture(d.db, { bookId: 'foreign' }) },
    p = await f.cancel();
  assert.equal(p.phase, 'cancelled');
  assert.equal(p.jobToken, null);
  assert.equal(
    [...f.records.keys()].some((path) => path.startsWith('books/')),
    false,
  );
  assert.deepEqual(await f.start(), p);
  await seedCreationBook(f.db, 'foreign', 'other');
  const before = structuredClone(f.records.get('books/foreign'));
  assert.deepEqual(await f.start(), p);
  assert.deepEqual(f.records.get('books/foreign'), before);
});
test('native reservation cancellation survives owner revocation and never releases the ID', async () => {
  const f = await fixture(),
    p = await f.start();
  await f.db.runTransaction(async (tx) => tx.update(f.db.doc('books/book'), { authorId: 'other' }));
  const canceled = await f.cancel('cancel-after-revocation', p.jobToken);
  assert.equal(canceled.phase, 'cancelled');
  assert.equal(f.records.has(f.c.reservationPath), true);
  assert.deepEqual(await f.start(), canceled);
  await assert.rejects(() =>
    f.db.runTransaction((tx) => openCreationReservation(tx, f.c, { jobToken: p.jobToken })),
  );
  assert.equal(f.records.get('books/book').authorId, 'other');
});
test('a cancelled operation freezes the first exact payload and reports later cancellation as historical', async () => {
  const f = await fixture(),
    p = await f.start(),
    done = await f.cancel('first-cancellation', p.jobToken);
  assert.deepEqual(await f.cancel('first-cancellation', p.jobToken), done);
  await assert.rejects(() => f.cancel('first-cancellation'));
  assert.deepEqual(await f.cancel('second-cancellation', p.jobToken), done);
});
for (const artifact of ['context', 'marker', 'cancellation', 'proof'])
  test('recreated ' + artifact + ' cannot confirm the original reservation', async () => {
    const f = await fixture();
    await f.start();
    await f.cancel();
    const path =
        artifact === 'context'
          ? f.c.path
          : artifact === 'marker'
            ? f.c.reservationPath
            : artifact === 'cancellation'
              ? f.c.cancelRef.path
              : f.c.proofRef.path,
      value = structuredClone(f.records.get(path));
    await f.db.runTransaction(async (tx) => tx.delete(f.db.doc(path)));
    await f.db.runTransaction(async (tx) => tx.create(f.db.doc(path), value));
    await assert.rejects(() => f.get());
    assert.equal(f.records.has(path), true);
  });
test('native openings reject reconstructed DTOs, another transaction and a recreated root', async () => {
  const f = await fixture(),
    p = await f.start();
  let l;
  await f.db.runTransaction(async (tx) => {
    l = await openCreationReservation(tx, f.c, { jobToken: p.jobToken });
    assertCreationOpening(tx, l);
    assert.throws(() => assertCreationOpening(tx, { ...l }));
  });
  await f.db.runTransaction(async (tx) => assert.throws(() => assertCreationOpening(tx, l)));
  const root = structuredClone(f.records.get('books/book'));
  await f.db.runTransaction(async (tx) => tx.delete(f.db.doc('books/book')));
  await f.db.runTransaction(async (tx) => tx.create(f.db.doc('books/book'), root));
  await assert.rejects(() =>
    f.db.runTransaction((tx) => openCreationReservation(tx, f.c, { jobToken: p.jobToken })),
  );
});
test('other visible lore changes do not invalidate a still-owned native creation reservation', async () => {
  const f = await fixture(),
    p = await f.start();
  await f.db.runTransaction(async (tx) =>
    tx.update(f.db.doc('books/book'), { localLoreVersion: 2 }),
  );
  await f.db.runTransaction(async (tx) =>
    assertCreationOpening(tx, await openCreationReservation(tx, f.c, { jobToken: p.jobToken })),
  );
});
test('start rollback keeps the flag, private context and book marker atomic', async () => {
  const f = await fixture(),
    before = structuredClone([...f.records]),
    run = f.db.runTransaction.bind(f.db);
  f.db.runTransaction = (fn) =>
    run((tx) =>
      fn({
        ...tx,
        update(ref, v) {
          tx.update(ref, v);
          if (ref.path === 'books/book') throw Error('injected reservation failure');
        },
      }),
    );
  await assert.rejects(() => f.start(), /injected reservation failure/);
  assert.deepEqual([...f.records], before);
  f.db.runTransaction = run;
  assert.equal((await f.start()).phase, 'preparing');
});
test('cancellation rollback leaves no partial fence or proof', async () => {
  const f = await fixture();
  await f.start();
  const before = structuredClone([...f.records]),
    run = f.db.runTransaction.bind(f.db);
  f.db.runTransaction = (fn) =>
    run((tx) =>
      fn({
        ...tx,
        create(ref, v) {
          tx.create(ref, v);
          if (ref.path === f.c.proofRef.path) throw Error('injected cancellation failure');
        },
      }),
    );
  await assert.rejects(() => f.cancel(), /injected cancellation failure/);
  assert.deepEqual([...f.records], before);
  f.db.runTransaction = run;
  assert.equal((await f.cancel()).phase, 'cancelled');
});
for (const resource of ['body', 'segment', 'generation', 'inventory', 'lease', 'upload', 'edit'])
  test(
    'unexpected ' + resource + ' is preserved and blocks empty-reservation cancellation',
    async () => {
      const f = await fixture(),
        p = await f.start(),
        loreId = p.loreId,
        at =
          resource === 'body'
            ? [
                'books/book/bookResourceBodies/unknown',
                { resource: { kind: 'lore', parentId: null, id: loreId } },
              ]
            : resource === 'segment'
              ? ['books/book/bookLoreSegments/unknown', { loreId }]
              : resource === 'generation'
                ? ['books/book/bookLoreGenerations/unknown', { loreId }]
                : resource === 'inventory'
                  ? ['books/book/bookResourceInventory/unknown', { loreId }]
                  : resource === 'lease'
                    ? ['books/book/bookResourceLeases/unknown', { loreId }]
                    : resource === 'upload'
                      ? [
                          'users/author/bookLoreFieldUploads/unknown',
                          { context: { bookId: 'book', loreId } },
                        ]
                      : [
                          'users/author/bookLoreEdits/unknown',
                          { context: { intent: { bookId: 'book', loreId } } },
                        ];
      await f.db.runTransaction(async (tx) => tx.create(f.db.doc(at[0]), at[1]));
      const before = structuredClone([...f.records]);
      await assert.rejects(() => f.cancel());
      assert.deepEqual([...f.records], before);
    },
  );
test('a premature reserved head is unreadable and cannot be cancelled as an empty preparation', async () => {
  const f = await fixture(),
    p = await f.start(),
    path = 'books/book/lore/' + p.loreId,
    head = { bookId: 'book', name: 'Premature', category: 'other' };
  await f.db.runTransaction(async (tx) => tx.create(f.db.doc(path), head));
  await assert.rejects(() =>
    createBookLoreReadService({ db: f.db }).getBookLoreRead(f.uid, {
      bookId: 'book',
      id: p.loreId,
    }),
  );
  await assert.rejects(() => f.cancel());
  assert.deepEqual(f.records.get(path), head);
});
test('an existing orphan marker or private proof blocks a fresh reservation instead of being reused', async () => {
  for (const orphan of ['marker', 'proof']) {
    const f = await fixture(),
      path = orphan === 'marker' ? f.c.reservationPath : f.c.proofRef.path;
    await f.db.runTransaction(async (tx) => tx.create(f.db.doc(path), { orphan: true }));
    await assert.rejects(() => f.start());
    assert.equal(f.records.has(f.c.path), false);
  }
});
test('book deletion cancels empty reservations, preserves both fences and resumes after checkpoint rollback', async () => {
  const f = await fixture(),
    p = await f.start(),
    book = bookLoreDeletionFixture(f.db);
  await markBookDeleting(book);
  for (
    let i = 0;
    i < 1000 &&
    f.records.get('users/author/bookLoreDeletions/book/state/current')?.phase !== 'creations';
    i++
  )
    await book.step();
  const before = structuredClone([...f.records]),
    run = f.db.runTransaction.bind(f.db);
  f.db.runTransaction = (fn) =>
    run((tx) =>
      fn({
        ...tx,
        set(ref, v) {
          tx.set(ref, v);
          if (ref.path === 'users/author/sceneOperations/' + book.operationId)
            throw Error('injected book checkpoint failure');
        },
      }),
    );
  await assert.rejects(() => book.step(), /injected book checkpoint failure/);
  assert.deepEqual([...f.records], before);
  f.db.runTransaction = run;
  await finishBookLoreDeletion(book);
  assert.equal(f.records.has('books/book'), false);
  assert.equal(f.records.has(f.c.reservationPath), true);
  const done = await f.get();
  assert.equal(done.phase, 'cancelled');
  assert.equal(done.jobToken, p.jobToken);
  assert.deepEqual(await f.start(), done);
});
test('a private cancel-before-start fence does not prevent deletion of a later unrelated book incarnation', async () => {
  const d = adventureImportDb({ nativeUpdates: true }),
    f = { ...d, ...creationFixture(d.db) };
  await f.cancel();
  await seedCreationBook(f.db);
  const book = bookLoreDeletionFixture(f.db);
  await markBookDeleting(book);
  await finishBookLoreDeletion(book);
  assert.equal((await f.get()).phase, 'cancelled');
  assert.equal(f.records.has('books/book'), false);
});
test('unknown content claims and another account cannot obtain or mint a native reservation', async () => {
  const f = await fixture();
  await assert.rejects(() =>
    f.factory().startBookLoreCreationReservation(f.uid, { ...f.intent, name: 'not accepted' }),
  );
  await assert.rejects(() => f.factory().startBookLoreCreationReservation('other', f.intent));
  assert.equal(await f.factory().getBookLoreCreationReservation('other', f.intent), null);
  await f.start();
  await assert.rejects(() =>
    f.factory().getBookLoreCreationReservation(f.uid, { ...f.intent, jobToken: 'a'.repeat(64) }),
  );
});
