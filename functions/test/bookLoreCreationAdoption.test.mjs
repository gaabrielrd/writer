import test from 'node:test';
import assert from 'node:assert/strict';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import {
  creationAdoptionFixture,
  adoptCreation,
} from './helpers/bookLoreCreationAdoptionFixture.mjs';
import { creationCompositionFixture } from './helpers/bookLoreCreationCompositionFixture.mjs';
import {
  creationUploadFixture,
  finishCreationUploads,
} from './helpers/bookLoreCreationUploadFixture.mjs';
import { nextAdoptionFixture, adoptFixture } from './helpers/bookLoreEditAdoptionFixture.mjs';
import {
  cancelEditReservation,
  drainEditReservation,
} from './helpers/bookLoreEditReservationFixture.mjs';
import { appendRequest } from './helpers/bookLoreFieldUploadFixture.mjs';
import { createBookLoreReadService } from '../src/bookLoreRead.mjs';
import { readGenerationSection } from './helpers/bookLoreGenerationFixture.mjs';
import { sourceInspectionFixture } from './helpers/bookLoreSourceInspectionFixture.mjs';
import { removalFixture, finishRemoval } from './helpers/bookLoreRemovalFixture.mjs';
import {
  bookLoreDeletionFixture,
  markBookDeleting,
  finishBookLoreDeletion,
} from './helpers/bookLoreDeletionFixture.mjs';
import { createBookLoreResourceInventoryService } from '../src/bookLoreResourceInventory.mjs';
const setup = async (options) => {
  const d = adventureImportDb({ nativeUpdates: true });
  return { ...d, ...(await creationAdoptionFixture(d.db, options)) };
};
const view = (f) =>
  createBookLoreReadService({ db: f.db }).getBookLoreRead(f.uid, {
    bookId: f.bookId,
    id: f.loreId,
  });
const bytes = (f) => [...f.records.keys()].filter((p) => /\/bookResource(Bodies|Chunks)\//.test(p));
const head = (f) => f.records.get(f.headPath);
for (const privacy of ['absent', false, true, null])
  test(
    'creation activation is readable, native and atomic with explicit privacy ' + privacy,
    async () => {
      const changes = [
        { target: { field: 'name' }, value: '\ufeffName 🌙' },
        { target: { field: 'category' }, value: 'other' },
        { target: { field: 'details' }, value: '\ufeffPRIVATE_LITERAL🌙\r\n'.repeat(8000) },
      ];
      if (typeof privacy === 'boolean')
        changes.push({ target: { field: 'isPublic' }, value: privacy });
      const f = await setup({ changes, removals: privacy === null ? ['isPublic'] : [] });
      await f.db.runTransaction((tx) => {
        tx.update(f.db.doc('books/book'), {
          updatedAt: 9999,
          localLoreVersion: 4,
          publicationPrivacyVersion: 3,
          status: 'published',
        });
        tx.create(f.db.doc('publicBooks/book'), { title: 'Existing publication' });
      });
      const result = await adoptCreation(f),
        p = await f.parent.get(),
        h = head(f),
        j = f.records.get(f.c.path),
        creation = f.parent.c.path + '/adoptions/current',
        receipt = f.c.path + '/operations/' + f.adoptRequest.operationId,
        event = 'books/book/bookLoreGenerations/' + j.generationId + '/events/0000000000000001';
      assert.equal(result.progress.phase, 'adopted');
      assert.equal(p.phase, 'adopted');
      assert.equal(p.adoption.timestamp, 10000);
      assert.equal(h.createdAt, 10000);
      assert.equal(h.updatedAt, 10000);
      assert.deepEqual(h.payloadStorage.dates, { createdAt: 10000, updatedAt: 10000 });
      assert.equal(h.payloadStorage.base, null);
      assert.equal(f.records.get('books/book').localLoreVersion, 5);
      assert.equal(f.records.get('books/book').status, 'published');
      assert.equal(f.records.get('books/book').publicationPrivacyVersion, 3);
      assert.deepEqual(f.records.get('publicBooks/book'), { title: 'Existing publication' });
      assert.equal(Object.hasOwn(h, 'isPublic'), typeof privacy === 'boolean');
      if (typeof privacy === 'boolean') assert.equal(h.isPublic, privacy);
      for (const path of [
        creation,
        creation.replace('/adoptions/', '/adoptionProofs/'),
        receipt,
        event,
      ])
        assert.equal(
          f.metadata.get(path).createdAtNanoseconds,
          f.metadata.get(f.headPath).createdAtNanoseconds,
        );
      const v = await view(f);
      for (const field of changes)
        assert.deepEqual(
          await readGenerationSection(
            createBookLoreReadService({ db: f.db }),
            f.source.seed,
            v,
            'field',
            field.target.field,
          ),
          field.value,
        );
      assert.equal(JSON.stringify(p).includes('PRIVATE_LITERAL'), false);
      await assert.rejects(() => f.parent.cancel());
      await assert.rejects(() => cancelEditReservation(f, result.progress));
      assert.deepEqual(await f.parent.start(), p);
      assert.deepEqual((await adoptCreation(f)).receipt, result.receipt);
      assert.equal(f.records.get('books/book').localLoreVersion, 5);
    },
  );
test('identical concurrent activation creates one receipt and increments the lore clock once', async () => {
  const f = await setup(),
    [a, b] = await Promise.all([adoptCreation(f), adoptCreation(f)]);
  assert.deepEqual(a.receipt, b.receipt);
  assert.equal(f.records.get('books/book').localLoreVersion, 1);
  assert.equal((await f.parent.get()).phase, 'adopted');
  assert.equal(
    [...f.records.keys()].filter((p) => p.startsWith(f.parent.c.path + '/adoptions/')).length,
    1,
  );
});
for (const first of ['activation', 'cancel'])
  test('racing ' + first + ' against the opposite operation has one terminal outcome', async () => {
    const f = await setup(),
      operations =
        first === 'activation'
          ? [() => adoptCreation(f), () => f.parent.cancel()]
          : [() => f.parent.cancel(), () => adoptCreation(f)],
      results = await Promise.allSettled(operations.map((fn) => fn()));
    assert.equal(results[0].status, 'fulfilled');
    assert.equal(results[1].status, 'rejected');
    if (first === 'activation') {
      assert.equal((await f.parent.get()).phase, 'adopted');
      assert.ok(head(f));
    } else {
      await finishCreationUploads(f.parent, results[0].value);
      assert.equal((await f.parent.get()).phase, 'cancelled');
      assert.equal(head(f), undefined);
      assert.equal(bytes(f).length, 0);
    }
  });
for (const artifact of ['head', 'root', 'creator', 'creator-proof', 'receipt', 'generation-state'])
  test(
    'failure at ' + artifact + ' rolls activation, clock, leases and all receipts back',
    async () => {
      const f = await setup(),
        j = f.records.get(f.c.path),
        path =
          artifact === 'head'
            ? f.headPath
            : artifact === 'root'
              ? 'books/book'
              : artifact === 'creator'
                ? f.parent.c.path + '/adoptions/current'
                : artifact === 'creator-proof'
                  ? f.parent.c.path + '/adoptionProofs/current'
                  : artifact === 'receipt'
                    ? f.c.path + '/operations/' + f.adoptRequest.operationId
                    : 'books/book/bookLoreGenerations/' + j.generationId + '/state/current',
        before = structuredClone([...f.records]),
        run = f.db.runTransaction.bind(f.db);
      f.db.runTransaction = (fn) =>
        run((tx) => {
          const wrapped = { ...tx };
          for (const key of ['create', 'set', 'update'])
            wrapped[key] = (ref, v) => {
              tx[key](ref, v);
              if (ref.path === path) throw Error('injected atomic activation failure');
            };
          return fn(wrapped);
        });
      await assert.rejects(() => adoptCreation(f), /injected/);
      assert.deepEqual([...f.records], before);
      f.db.runTransaction = run;
      assert.equal((await f.parent.get()).phase, 'preparing');
      assert.equal((await adoptCreation(f)).progress.phase, 'adopted');
    },
  );
for (const change of [
  'owner',
  'deleting',
  'absent',
  'recreated-book',
  'premature-head',
  'tombstone',
  'clock',
])
  test('activation rejects changed ' + change + ' and preserves the preparation', async () => {
    const f = await setup();
    if (change === 'recreated-book') {
      const value = structuredClone(f.records.get('books/book'));
      await f.db.runTransaction((tx) => tx.delete(f.db.doc('books/book')));
      await f.db.runTransaction((tx) => tx.create(f.db.doc('books/book'), value));
    } else
      await f.db.runTransaction((tx) => {
        if (change === 'absent') tx.delete(f.db.doc('books/book'));
        else if (change === 'premature-head')
          tx.create(f.db.doc(f.headPath), { name: 'fake', category: 'other' });
        else if (change === 'tombstone')
          tx.create(f.db.doc('books/book/bookLoreTombstones/' + f.loreId), {});
        else
          tx.update(
            f.db.doc('books/book'),
            change === 'owner'
              ? { authorId: 'other' }
              : change === 'deleting'
                ? { deleting: true }
                : { localLoreVersion: Number.MAX_SAFE_INTEGER },
          );
      });
    const before = structuredClone([...f.records]);
    await assert.rejects(() => adoptCreation(f));
    assert.deepEqual([...f.records], before);
  });
for (const artifact of [
  'creator-context',
  'reservation',
  'adoption',
  'adoption-proof',
  'attempt',
  'attempt-proof',
  'edit',
  'receipt',
  'receipt-proof',
  'generation',
  'generation-event',
  'generation-proof',
])
  test(
    'recreated ' +
      artifact +
      ' invalidates historical proof and prevents reading the reserved head',
    async () => {
      const f = await setup();
      await adoptCreation(f);
      const j = f.records.get(f.c.path),
        generation = 'books/book/bookLoreGenerations/' + j.generationId,
        path =
          artifact === 'creator-context'
            ? f.parent.c.path
            : artifact === 'reservation'
              ? f.parent.c.reservationPath
              : artifact === 'adoption'
                ? f.parent.c.path + '/adoptions/current'
                : artifact === 'adoption-proof'
                  ? f.parent.c.path + '/adoptionProofs/current'
                  : artifact === 'attempt'
                    ? f.parent.c.path + '/attempts/' + f.editId
                    : artifact === 'attempt-proof'
                      ? f.parent.c.path + '/attemptProofs/' + f.editId
                      : artifact === 'edit'
                        ? f.c.path
                        : artifact === 'receipt'
                          ? f.c.path + '/operations/' + f.adoptRequest.operationId
                          : artifact === 'receipt-proof'
                            ? f.c.path + '/operationProofs/' + f.adoptRequest.operationId
                            : artifact === 'generation'
                              ? generation
                              : artifact === 'generation-event'
                                ? generation + '/events/0000000000000001'
                                : generation + '/proofs/0000000000000001',
        value = structuredClone(f.records.get(path));
      await f.db.runTransaction((tx) => tx.delete(f.db.doc(path)));
      await f.db.runTransaction((tx) => tx.create(f.db.doc(path), value));
      await assert.rejects(() => f.parent.get());
      await assert.rejects(() => view(f));
      await assert.rejects(() => adoptCreation(f));
      assert.deepEqual(f.records.get(path), value);
    },
  );
for (const artifact of ['head', 'book'])
  test(
    'recreated ' +
      artifact +
      ' denies current reading while confirming original success without resurrection',
    async () => {
      const f = await setup();
      await adoptCreation(f);
      const p = await f.parent.get(),
        path = artifact === 'head' ? f.headPath : 'books/book',
        value = structuredClone(f.records.get(path));
      await f.db.runTransaction((tx) => tx.delete(f.db.doc(path)));
      await f.db.runTransaction((tx) => tx.create(f.db.doc(path), value));
      const before = structuredClone([...f.records]);
      await assert.rejects(() => view(f));
      assert.deepEqual(await f.parent.get(), p);
      assert.equal((await adoptCreation(f)).receipt.phase, 'adopted');
      await assert.rejects(() => f.parent.cancel());
      assert.deepEqual([...f.records], before);
    },
  );
test('first creation survives a second native edit and collection of the retired generation bytes', async () => {
  const f = await setup({
    changes: [
      { target: { field: 'name' }, value: 'Name' },
      { target: { field: 'category' }, value: 'other' },
      { target: { field: 'details' }, value: 'old literal' },
    ],
  });
  await adoptCreation(f);
  const p = await f.parent.get(),
    firstHead = structuredClone(head(f)),
    oldBody = firstHead.payloadStorage.fields.details.manifest.bodyId,
    next = await nextAdoptionFixture(f, {
      changes: [{ target: { field: 'details' }, value: 'new literal' }],
    });
  await adoptFixture(next);
  assert.equal(head(f).createdAt, firstHead.createdAt);
  assert.equal(f.records.get('books/book').localLoreVersion, 2);
  const v = await view(f);
  assert.equal(
    await readGenerationSection(
      createBookLoreReadService({ db: f.db }),
      f.source.seed,
      v,
      'field',
      'details',
    ),
    'new literal',
  );
  const collector = createBookLoreResourceInventoryService({ db: f.db });
  for (let i = 0; i < 1000; i++) {
    const result = await collector.collectBookLoreInventoryBody(f.uid, {
      bookId: f.bookId,
      bodyId: oldBody,
    });
    if (result.complete) break;
  }
  assert.equal(f.records.has('books/book/bookResourceBodies/' + oldBody), false);
  assert.deepEqual(await f.parent.get(), p);
  assert.deepEqual((await adoptCreation(f)).receipt.phase, 'adopted');
});
test('individual removal and whole-book deletion preserve the creation success and prevent replay resurrection', async () => {
  const f = await setup();
  await adoptCreation(f);
  const p = await f.parent.get(),
    inspected = await sourceInspectionFixture(f.db, {
      uid: f.uid,
      bookId: f.bookId,
      id: f.loreId,
      inspectionId: 'inspect-created-removal',
      existingSeed: f.source.seed,
    }),
    removal = await removalFixture(f.db, { source: inspected });
  await finishRemoval(removal);
  assert.equal(head(f), undefined);
  assert.equal(await view(f), null);
  assert.deepEqual(await f.parent.get(), p);
  assert.equal((await adoptCreation(f)).receipt.phase, 'adopted');
  assert.equal(head(f), undefined);
  const deletion = bookLoreDeletionFixture(f.db);
  await markBookDeleting(deletion);
  assert.equal((await finishBookLoreDeletion(deletion)).complete, true);
  assert.deepEqual(await f.parent.get(), p);
  assert.deepEqual(await f.parent.start(), p);
  assert.equal((await adoptCreation(f)).receipt.phase, 'adopted');
  await assert.rejects(() => f.parent.cancel());
  assert.equal(f.records.has('books/book'), false);
  assert.equal(bytes(f).length, 0);
});
test('a winning attempt closes other activations, uploads and starts while unused attempts remain safely cancellable', async () => {
  const f = await setup(),
    other = await creationAdoptionFixture(f.db, { parent: f.parent, editId: 'losing-attempt' }),
    loose = await creationUploadFixture(f.db, {
      parent: f.parent,
      uploadId: 'unused-after-adoption',
    });
  const looseProgress = await loose.factory().startBookLoreFieldUpload(loose.uid, loose.intent);
  await adoptCreation(f);
  await assert.rejects(() => adoptCreation(other));
  await assert.rejects(() => f.parent.cancel());
  await assert.rejects(() =>
    loose.factory().appendBookLoreFieldUpload(loose.uid, appendRequest(loose, looseProgress)),
  );
  const newAttempt = await creationCompositionFixture(f.db, {
    parent: f.parent,
    editId: 'new-attempt-after-adoption',
  }).catch(() => null);
  assert.equal(newAttempt, null);
  const cancelled = await cancelEditReservation(other, other.ready);
  assert.equal((await drainEditReservation(other, cancelled.progress)).phase, 'cancelled');
  assert.equal((await view(f)).id, f.loreId);
  const deletion = bookLoreDeletionFixture(f.db);
  await markBookDeleting(deletion);
  await finishBookLoreDeletion(deletion);
  assert.equal((await f.parent.get()).phase, 'adopted');
  assert.equal(bytes(f).length, 0);
});

test('missing creator activation proofs cannot confirm an adopted edit through its receipt alone', async () => {
  const f = await setup();
  await adoptCreation(f);
  const before = structuredClone(head(f));
  await f.db.runTransaction((tx) => {
    tx.delete(f.db.doc(f.parent.c.path + '/adoptions/current'));
    tx.delete(f.db.doc(f.parent.c.path + '/adoptionProofs/current'));
  });
  await assert.rejects(() => adoptCreation(f));
  await assert.rejects(() =>
    f.factory().getBookLoreEditReservation(f.uid, { editId: f.editId, startHash: f.startHash }),
  );
  await assert.rejects(() => view(f));
  assert.deepEqual(head(f), before);
  assert.equal(f.records.get('books/book').localLoreVersion, 1);
});
for (const artifact of ['adoptions', 'adoptionProofs'])
  test('orphan ' + artifact + ' prevents a new creator context or cancellation fence', async () => {
    const { creationFixture, seedCreationBook } =
        await import('./helpers/bookLoreCreationFixture.mjs'),
      d = adventureImportDb({ nativeUpdates: true });
    await seedCreationBook(d.db);
    const parent = creationFixture(d.db),
      path = parent.c.path + '/' + artifact + '/current';
    await d.db.runTransaction((tx) => tx.create(d.db.doc(path), { orphan: true }));
    await assert.rejects(() => parent.start());
    await assert.rejects(() => parent.cancel());
    assert.equal(d.records.has(parent.c.path), false);
    assert.deepEqual(d.records.get(path), { orphan: true });
  });
