import test from 'node:test';
import assert from 'node:assert/strict';
import { born } from '../src/bookRestoreUploadContracts.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import {
  adoptionFixture,
  adoptFixture,
  nextAdoptionFixture,
} from './helpers/bookLoreEditAdoptionFixture.mjs';
import {
  editControl,
  cancelEditReservation,
  getEditReservation,
} from './helpers/bookLoreEditReservationFixture.mjs';
import { createBookLoreReadService } from '../src/bookLoreRead.mjs';
import { readGenerationSection } from './helpers/bookLoreGenerationFixture.mjs';
import { createBookLoreResourceInventoryService } from '../src/bookLoreResourceInventory.mjs';
import { resolveAdoptedInventoryLease } from '../src/bookLoreAdoptedLease.mjs';
import { loadInventoryControl } from '../src/bookLoreResourceInventoryStore.mjs';
import { inventoryScope } from '../src/bookLoreResourceInventoryContracts.mjs';
import { resourcePayloadChunkPath } from '../src/bookResourcePayloadPaths.mjs';
async function setup(options = {}) {
  const d = adventureImportDb({ nativeUpdates: true });
  return { ...d, ...(await adoptionFixture(d.db, options)) };
}
const job = (f) => f.records.get(f.c.path);
const generationPath = (f) => 'books/' + f.bookId + '/bookLoreGenerations/' + job(f).generationId;
const fieldPointer = (f) => job(f).adoption.storage.fields.details;
const collect = (f, id) =>
  createBookLoreResourceInventoryService({ db: f.db }).collectBookLoreInventoryBody(f.uid, {
    bookId: f.bookId,
    bodyId: id,
  });
async function leaseState(f, pointer) {
  return f.db.runTransaction(async (tx) => {
    const c = inventoryScope(f.db, f.uid, f.bookId),
      body = await loadInventoryControl(tx, c, 'body', pointer.manifest.bodyId),
      lease = await tx.get(
        f.db.doc('books/' + f.bookId + '/bookResourceLeases/' + pointer.manifest.bodyId),
      );
    return (await resolveAdoptedInventoryLease(tx, c, body, lease))?.phase;
  });
}
for (const mode of ['inline', 'v1', 'v2'])
  test(
    'adopt ' + mode + ' as a readable native generation with one clock and one atomic receipt',
    async () => {
      const f = await setup({ mode }),
        oldView = f.source.view,
        adopted = await adoptFixture(f),
        j = job(f),
        head = await f.db.runTransaction((tx) => tx.get(f.db.doc(f.source.seed.path))),
        receipt = await f.db.runTransaction((tx) =>
          tx.get(f.db.doc(f.c.path + '/operations/' + f.adoptRequest.operationId)),
        ),
        book = await f.db.runTransaction((tx) => tx.get(f.db.doc(f.source.seed.bookPath))),
        state = await f.db.runTransaction((tx) =>
          tx.get(f.db.doc(generationPath(f) + '/state/current')),
        ),
        api = createBookLoreReadService({ db: f.db }),
        view = await api.getBookLoreRead(f.uid, { bookId: f.bookId, id: f.loreId });
      assert.equal(adopted.progress.phase, 'adopted');
      assert.equal(book.data().localLoreVersion, 1);
      assert.equal(book.data().hasLoreResources, true);
      assert.deepEqual(born({ createTime: head.updateTime }), born(receipt));
      assert.deepEqual(born({ createTime: book.updateTime }), born(receipt));
      assert.deepEqual(born({ createTime: state.updateTime }), born(receipt));
      assert.equal(state.data().phase, 'active');
      assert.notEqual(view.readToken, oldView.readToken);
      const literal = await readGenerationSection(
        api,
        { uid: f.uid, bookId: f.bookId, id: f.loreId },
        view,
        'field',
        'details',
      );
      assert.equal(literal, '\ufeffnew literal 🌙');
      assert.equal(j.adoption.storage.dates.updatedAt, head.data().updatedAt);
      await assert.rejects(() =>
        api.readBookLorePart(f.uid, {
          bookId: f.bookId,
          id: f.loreId,
          readToken: oldView.readToken,
          section: 'base',
          page: 0,
          index: 0,
        }),
      );
      assert.equal((await getEditReservation(f)).phase, 'adopted');
    },
  );
for (const [before, after, revoke] of [
  [true, false, true],
  [true, 'remove', true],
  [true, true, false],
  [false, true, false],
  ['absent', false, false],
  ['absent', 'remove', false],
  ['absent', 'keep', false],
  [true, 'keep', false],
])
  test(
    'consent ' +
      before +
      ' to ' +
      after +
      ' revokes publication exactly when explicit consent leaves',
    async () => {
      const data = {
          name: 'N',
          category: 'other',
          ...(before === 'absent' ? {} : { isPublic: before }),
        },
        options =
          after === 'remove'
            ? { changes: [], removals: ['isPublic'] }
            : after === 'keep'
              ? { changes: [{ target: { field: 'details' }, value: 'new' }] }
              : { changes: [{ target: { field: 'isPublic' }, value: after }] },
        f = await setup({ mode: 'inline', sourceOptions: { data }, ...options });
      await f.db.runTransaction((tx) => {
        tx.update(f.db.doc(f.source.seed.bookPath), {
          status: 'published',
          publicationPrivacyVersion: 7,
          updatedAt: 10,
        });
        tx.create(f.db.doc('publicBooks/' + f.bookId), { revisionId: 'old' });
      });
      const adopted = await adoptFixture(f),
        book = f.records.get(f.source.seed.bookPath),
        head = f.records.get(f.source.seed.path);
      assert.equal(adopted.progress.adoption.revoked, revoke);
      assert.equal(book.publicationPrivacyVersion, revoke ? 8 : 7);
      assert.equal(book.status, revoke ? 'draft' : 'published');
      assert.equal(f.records.has('publicBooks/' + f.bookId), !revoke);
      const expected = after === 'keep' ? before : after;
      assert.equal(Object.hasOwn(head, 'isPublic'), !['remove', 'absent'].includes(expected));
      if (Object.hasOwn(head, 'isPublic')) assert.equal(head.isPublic, expected);
    },
  );
test('timestamp advances both current book and logical lore while preserving createdAt', async () => {
  const f = await setup({
    mode: 'inline',
    sourceOptions: { data: { name: 'N', category: 'other', createdAt: 123, updatedAt: 5000 } },
  });
  await f.db.runTransaction((tx) =>
    tx.update(f.db.doc(f.source.seed.bookPath), { updatedAt: 9999 }),
  );
  await adoptFixture(f);
  const a = job(f).adoption;
  assert.equal(a.timestamp, 10000);
  assert.equal(a.storage.dates.createdAt, 123);
  assert.equal(f.records.get(f.source.seed.bookPath).updatedAt, 10000);
});
for (const bad of [null, -1, 1.2, Number.MAX_SAFE_INTEGER])
  test(
    'invalid or exhausted publication epoch ' + bad + ' cannot change the prepared generation',
    async () => {
      const f = await setup({
        mode: 'inline',
        changes: [{ target: { field: 'isPublic' }, value: false }],
      });
      await f.db.runTransaction((tx) =>
        tx.update(f.db.doc(f.source.seed.bookPath), { publicationPrivacyVersion: bad }),
      );
      const before = structuredClone([...f.records]);
      await assert.rejects(() => adoptFixture(f));
      assert.deepEqual([...f.records], before);
    },
  );
test('exhausted lore clock is rejected after a valid ready preparation at that baseline', async () => {
  const first = await setup({ mode: 'inline' });
  await first.db.runTransaction((tx) =>
    tx.update(first.db.doc(first.source.seed.bookPath), {
      localLoreVersion: Number.MAX_SAFE_INTEGER,
    }),
  );
  const f = await nextAdoptionFixture(first, { editId: 'at-last-clock' }),
    before = structuredClone([...first.records]);
  await assert.rejects(() => adoptFixture(f));
  assert.deepEqual([...first.records], before);
});
for (const change of ['owner', 'deleting', 'absent', 'clock', 'head', 'recreated-book'])
  test(
    'adoption rechecks ' + change + ' after ready and leaves all prepared data intact',
    async () => {
      const f = await setup();
      await f.db.runTransaction((tx) => {
        const path = change === 'head' ? f.source.seed.path : f.source.seed.bookPath,
          ref = f.db.doc(path);
        if (change === 'absent' || change === 'recreated-book') tx.delete(ref);
        else
          tx.update(
            ref,
            change === 'owner'
              ? { authorId: 'other' }
              : change === 'deleting'
                ? { deleting: true }
                : change === 'clock'
                  ? { localLoreVersion: 1 }
                  : { updatedAt: 9999 },
          );
      });
      if (change === 'recreated-book')
        await f.db.runTransaction((tx) =>
          tx.create(f.db.doc(f.source.seed.bookPath), { authorId: f.uid, localLoreVersion: 0 }),
        );
      const before = structuredClone([...f.records]);
      await assert.rejects(() => adoptFixture(f));
      assert.deepEqual([...f.records], before);
    },
  );
test('a stale adoption revision never mutates the head', async () => {
  const f = await setup(),
    before = structuredClone([...f.records]);
  await assert.rejects(() =>
    f.factory().adoptBookLoreEditGeneration(f.uid, {
      ...f.adoptRequest,
      expectedRevision: f.ready.revision - 1,
    }),
  );
  assert.deepEqual([...f.records], before);
});
test('concurrent identical adoption confirms one receipt and never increments the clock twice', async () => {
  const f = await setup(),
    results = await Promise.all([adoptFixture(f), adoptFixture(f)]);
  assert.deepEqual(results[0], results[1]);
  assert.equal(f.records.get(f.source.seed.bookPath).localLoreVersion, 1);
  assert.equal(f.records.get(generationPath(f) + '/state/current').revision, 1);
});
test('a new adoption operation and cancel are refused after success', async () => {
  const f = await setup(),
    first = await adoptFixture(f),
    before = structuredClone([...f.records]);
  await assert.rejects(() =>
    f.factory().adoptBookLoreEditGeneration(f.uid, editControl(f, first.progress, 'adopt-again')),
  );
  await assert.rejects(() => cancelEditReservation(f, first.progress));
  assert.deepEqual([...f.records], before);
});
test('rollback of parent write reverts head, book, privacy, activation and public root together', async () => {
  const f = await setup({
    mode: 'inline',
    changes: [{ target: { field: 'isPublic' }, value: false }],
  });
  await f.db.runTransaction((tx) => {
    tx.update(f.db.doc(f.source.seed.bookPath), {
      status: 'published',
      publicationPrivacyVersion: 2,
    });
    tx.create(f.db.doc('publicBooks/' + f.bookId), { revisionId: 'old' });
  });
  const before = structuredClone([...f.records]),
    run = f.db.runTransaction.bind(f.db);
  f.db.runTransaction = (fn) =>
    run((tx) =>
      fn({
        ...tx,
        update(ref, v) {
          tx.update(ref, v);
          if (ref.path === f.c.path) throw Error('injected adoption rollback');
        },
      }),
    );
  await assert.rejects(() => adoptFixture(f), /injected adoption rollback/);
  assert.deepEqual([...f.records], before);
  f.db.runTransaction = run;
  assert.equal((await adoptFixture(f)).progress.phase, 'adopted');
});
for (const artifact of ['certificate', 'generation', 'parent'])
  test('recreated ready ' + artifact + ' cannot authorize adoption', async () => {
    const f = await setup(),
      path =
        artifact === 'certificate'
          ? f.c.path + '/compilationCertificate/current'
          : artifact === 'generation'
            ? generationPath(f)
            : f.c.path,
      value = structuredClone(f.records.get(path));
    await f.db.runTransaction((tx) => tx.delete(f.db.doc(path)));
    await f.db.runTransaction((tx) => tx.create(f.db.doc(path), value));
    const before = structuredClone([...f.records]);
    await assert.rejects(() => adoptFixture(f));
    assert.deepEqual([...f.records], before);
  });
test('a second real edit reuses the adopted source and retires its predecessor without retaining removed bodies', async () => {
  const f = await setup({ mode: 'inline' });
  await adoptFixture(f);
  const pointer = fieldPointer(f);
  assert.equal(await leaseState(f, pointer), 'adopted');
  const g = await nextAdoptionFixture(f, {
    changes: [{ target: { field: 'details' }, value: 'second literal' }],
  });
  await adoptFixture(g);
  assert.equal(f.records.get(generationPath(f) + '/state/current').phase, 'retired');
  assert.equal((await getEditReservation(f)).phase, 'adopted');
  assert.equal(await leaseState(f, pointer), 'retired');
  let result;
  for (let i = 0; i < 100; i++) {
    result = await collect(f, pointer.manifest.bodyId);
    if (result.complete) break;
    assert.equal(result.deferred, undefined);
  }
  assert.equal(result.complete, true);
  assert.equal(
    f.records.has('books/' + f.bookId + '/bookResourceBodies/' + pointer.manifest.bodyId),
    false,
  );
  const retained = job(f).adoption.storage.fields.name;
  assert.equal((await collect(f, retained.manifest.bodyId)).reason, 'active-head');
  const api = createBookLoreReadService({ db: f.db }),
    view = await api.getBookLoreRead(f.uid, { bookId: f.bookId, id: f.loreId });
  assert.equal(
    await readGenerationSection(
      api,
      { uid: f.uid, bookId: f.bookId, id: f.loreId },
      view,
      'field',
      'details',
    ),
    'second literal',
  );
});
test('source registration recognizes a prepared generation by its native adoption rather than rebuilding its original context', async () => {
  const f = await setup();
  await adoptFixture(f);
  const api = createBookLoreReadService({ db: f.db }),
    view = await api.getBookLoreRead(f.uid, { bookId: f.bookId, id: f.loreId }),
    inventory = createBookLoreResourceInventoryService({ db: f.db });
  assert.deepEqual(
    await inventory.registerBookLoreSourceReference(f.uid, {
      bookId: f.bookId,
      loreId: f.loreId,
      sourceToken: view.readToken,
      selector: { section: 'field', field: 'details', page: 0 },
    }),
    { phase: 'registered', registered: true },
  );
});
test('old success replay after another edition and book removal cannot restore its head', async () => {
  const f = await setup(),
    first = await adoptFixture(f),
    g = await nextAdoptionFixture(f, {
      changes: [{ target: { field: 'details' }, value: 'second' }],
    });
  await adoptFixture(g);
  const head = structuredClone(f.records.get(f.source.seed.path));
  await f.db.runTransaction((tx) => tx.delete(f.db.doc(f.source.seed.bookPath)));
  const replay = await adoptFixture(f);
  assert.deepEqual(replay.receipt, first.receipt);
  assert.deepEqual(f.records.get(f.source.seed.path), head);
  assert.equal(f.records.has(f.source.seed.bookPath), false);
});
test('a forged lease phase does not release a retired generation body', async () => {
  const f = await setup();
  await adoptFixture(f);
  const pointer = fieldPointer(f),
    g = await nextAdoptionFixture(f, {
      changes: [{ target: { field: 'details' }, value: 'second' }],
    });
  await adoptFixture(g);
  await f.db.runTransaction((tx) =>
    tx.update(f.db.doc('books/' + f.bookId + '/bookResourceLeases/' + pointer.manifest.bodyId), {
      phase: 'adopted',
    }),
  );
  await assert.rejects(() => collect(f, pointer.manifest.bodyId));
  assert.equal(f.records.has(resourcePayloadChunkPath(f.bookId, pointer.manifest.bodyId, 0)), true);
});
test('recreated adoption event and anchor cannot confirm the historical success', async () => {
  const f = await setup();
  await adoptFixture(f);
  const paths = [
      generationPath(f) + '/events/0000000000000001',
      generationPath(f) + '/proofs/0000000000000001',
    ],
    values = paths.map((path) => structuredClone(f.records.get(path)));
  await f.db.runTransaction((tx) => paths.forEach((path) => tx.delete(f.db.doc(path))));
  await f.db.runTransaction((tx) =>
    paths.forEach((path, i) => tx.create(f.db.doc(path), values[i])),
  );
  await assert.rejects(() => adoptFixture(f));
  assert.equal(f.records.get(f.source.seed.bookPath).localLoreVersion, 1);
});
test('a consent mirror that disagrees with the logical body is not an inspection authority', async () => {
  const f = await setup({ mode: 'inline' });
  await adoptFixture(f);
  await f.db.runTransaction((tx) => tx.update(f.db.doc(f.source.seed.path), { isPublic: false }));
  await assert.rejects(() => nextAdoptionFixture(f, { editId: 'mirror-mismatch' }));
});

test('adoption of 141 parts and 129 relation pages performs bounded metadata writes', async () => {
  const relations = Array.from({ length: 129 * 64 }, (_, i) => ({
      targetEntityId: 't' + i,
      relationType: 'r',
    })),
    f = await setup({
      sourceOptions: { data: { name: 'N', category: 'other', relations } },
      changes: [{ target: { field: 'details' }, value: '🌙'.repeat(2300000) }],
    }),
    run = f.db.runTransaction.bind(f.db),
    writes = [];
  f.db.runTransaction = (fn) =>
    run((tx) =>
      fn({
        ...tx,
        update(ref, v) {
          writes.push(ref.path);
          return tx.update(ref, v);
        },
        set(ref, v) {
          writes.push(ref.path);
          return tx.set(ref, v);
        },
        create(ref, v) {
          writes.push(ref.path);
          return tx.create(ref, v);
        },
        delete(ref) {
          writes.push(ref.path);
          return tx.delete(ref);
        },
      }),
    );
  await adoptFixture(f);
  f.db.runTransaction = run;
  assert.ok(writes.length <= 12);
  assert.ok(
    writes.every(
      (p) =>
        !p.includes('/bookResourceLeases/') &&
        !p.includes('/bookResourceChunks/') &&
        !p.includes('/bookLoreSegments/'),
    ),
  );
  assert.ok(fieldPointer(f).manifest.chunkCount > 128);
  assert.equal(job(f).adoption.storage.relations.pages, 129);
});

test('129 reserved relation leases are adopted logically without per-lease writes', async () => {
  const changes = Array.from({ length: 129 }, (_, page) => ({
      target: { field: 'relations', page, count: 64 },
      value: Array.from({ length: 64 }, (_, i) => ({
        targetEntityId: 't' + (page * 64 + i),
        relationType: 'r',
      })),
    })),
    f = await setup({ changes, relations: { present: true, count: 129 * 64 } }),
    run = f.db.runTransaction.bind(f.db),
    writes = [];
  assert.equal(f.ready.reservedCount, 129);
  f.db.runTransaction = (fn) =>
    run((tx) =>
      fn({
        ...tx,
        update(ref, v) {
          writes.push(ref.path);
          return tx.update(ref, v);
        },
        set(ref, v) {
          writes.push(ref.path);
          return tx.set(ref, v);
        },
        create(ref, v) {
          writes.push(ref.path);
          return tx.create(ref, v);
        },
        delete(ref) {
          writes.push(ref.path);
          return tx.delete(ref);
        },
      }),
    );
  const result = await adoptFixture(f);
  f.db.runTransaction = run;
  assert.equal(result.progress.phase, 'adopted');
  assert.equal(result.progress.reservedCount, 129);
  assert.ok(writes.length <= 12);
  assert.ok(writes.every((p) => !p.includes('/bookResourceLeases/')));
  const leases = [...f.records].filter(([p]) =>
    p.startsWith('books/' + f.bookId + '/bookResourceLeases/'),
  );
  assert.equal(leases.length, 129);
  assert.ok(leases.every(([, v]) => v.phase === 'reserved'));
});
