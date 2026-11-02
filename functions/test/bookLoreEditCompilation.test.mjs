import test from 'node:test';
import assert from 'node:assert/strict';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import {
  compilationFixture,
  advanceCompilation,
  finishCompilation,
  openCompilation,
} from './helpers/bookLoreEditCompilationFixture.mjs';
import {
  editReservationFixture,
  editControl,
  editReserveRequest,
  cancelEditReservation,
  drainEditReservation,
} from './helpers/bookLoreEditReservationFixture.mjs';
import {
  compilationSegmentPath,
  compilationSegmentJournal,
} from '../src/bookLoreEditCompilationStore.mjs';
import { resourcePayloadChunkPath } from '../src/bookResourcePayloadPaths.mjs';
import { readBookResourcePayload } from '../src/bookResourcePayloadRead.mjs';
async function setup(options) {
  const d = adventureImportDb({ nativeUpdates: true });
  return { ...d, ...(await compilationFixture(d.db, options)) };
}
const job = (f) => f.records.get(f.c.path);
const pointerValue = (f, pointer) =>
  f.db.runTransaction((tx) =>
    readBookResourcePayload(tx, f.db, {
      uid: f.uid,
      bookId: f.bookId,
      resource: { kind: 'lore', parentId: null, id: f.loreId },
      ...pointer,
    }),
  );
const bodyPath = (f, p) => 'books/' + f.bookId + '/bookResourceBodies/' + p.manifest.bodyId;
const record = (f) => ({ c: f.c, job: job(f) });
for (const mode of ['v1', 'v2'])
  test(
    'compile ' +
      mode +
      ' into a flat ready generation without changing source, clock or publication',
    async () => {
      const f = await setup({
          mode,
          changes: [{ target: { field: 'details' }, value: 'literal 🌙' }],
          removals: ['summary'],
        }),
        source = structuredClone(f.records.get(f.source.seed.path)),
        book = structuredClone(f.records.get(f.source.seed.bookPath)),
        done = await finishCompilation(f),
        opened = await openCompilation(f),
        storage = opened.storage;
      assert.equal(done.phase, 'preparing');
      assert.equal(storage.schemaVersion, 2);
      assert.deepEqual(storage.base, f.source.seed.storage.base);
      assert.equal(storage.fields.summary, null);
      assert.equal(await pointerValue(f, storage.fields.details), 'literal 🌙');
      if (mode === 'v2') assert.deepEqual(storage.fields.name, f.source.seed.storage.fields.name);
      assert.deepEqual(f.records.get(f.source.seed.path), source);
      assert.deepEqual(f.records.get(f.source.seed.bookPath), book);
      assert.equal(f.records.has(f.c.path + '/compilationState/current'), false);
      assert.equal(storage.generationId, job(f).generationId);
      assert.equal(
        f.records.get(
          'books/' + f.bookId + '/bookLoreGenerations/' + storage.generationId + '/state/current',
        ).phase,
        'preparing',
      );
    },
  );
test('v2 without a base preserves absence of createdAt and required scalar fields', async () => {
  const f = await setup({
    mode: 'v2',
    sourceOptions: { noBase: true, fields: { name: 'Name', category: 'other' } },
  });
  await finishCompilation(f);
  const { storage } = await openCompilation(f);
  assert.equal(storage.base, null);
  assert.equal(Object.hasOwn(storage.dates, 'createdAt'), false);
  assert.equal(await pointerValue(f, storage.fields.name), 'Name');
});
test('relation page diff copies an unchanged page and selects one newly reserved page', async () => {
  const relations = Array.from({ length: 65 }, (_, i) => ({
      targetEntityId: 't' + i,
      relationType: 'r',
    })),
    f = await setup({
      sourceOptions: { data: { name: 'N', category: 'other', relations } },
      changes: [
        {
          target: { field: 'relations', page: 1, count: 1 },
          value: [{ targetEntityId: 'new', relationType: 'r' }],
        },
      ],
      relations: { present: true, count: 65 },
    }),
    done = await finishCompilation(f),
    { storage } = await openCompilation(f),
    copied = f.records.get(compilationSegmentPath(record(f), 0)),
    changed = f.records.get(compilationSegmentPath(record(f), 1));
  assert.equal(done.compilation.totalPages, 2);
  assert.equal(storage.relations.generationId, job(f).generationId);
  assert.equal(copied.schemaVersion, 1);
  assert.equal(changed.schemaVersion, 2);
  assert.deepEqual(await pointerValue(f, copied.payload), relations.slice(0, 64));
  assert.deepEqual(await pointerValue(f, changed.payload), [
    { targetEntityId: 'new', relationType: 'r' },
  ]);
  const doneCancel = await drainEditReservation(f, (await cancelEditReservation(f, done)).progress);
  assert.equal(doneCancel.phase, 'cancelled');
  assert.equal(doneCancel.compilation.cleanupPage, 2);
  assert.equal(f.records.has(compilationSegmentPath(record(f), 0)), false);
  assert.equal(f.records.has(bodyPath(f, copied.payload)), true);
  assert.equal(f.records.has(bodyPath(f, changed.payload)), false);
});
test('relations with no change retain their generation and emit no copied descriptor', async () => {
  const f = await setup({
    sourceOptions: {
      data: {
        name: 'N',
        category: 'other',
        relations: [{ targetEntityId: 't', relationType: 'r' }],
      },
    },
  });
  await finishCompilation(f);
  const { storage } = await openCompilation(f);
  assert.equal(storage.relations.generationId, f.source.seed.storage.generationId);
  assert.equal(
    [...f.records.keys()].filter((x) => x.startsWith(f.c.path + '/compilationSegments/')).length,
    0,
  );
});
test('removing relations preserves absent rather than synthesizing an empty present array', async () => {
  const f = await setup({ changes: [], relations: { present: false, count: 0 } });
  await finishCompilation(f);
  assert.equal((await openCompilation(f)).storage.relations.present, false);
});
test('missing new relation page cannot certify a ready generation', async () => {
  const f = await setup({ changes: [], relations: { present: true, count: 1 } });
  await assert.rejects(() => finishCompilation(f));
  assert.equal(job(f).compilation.phase, 'relations');
  assert.equal(f.records.has(f.c.path + '/compilationCertificate/current'), false);
});
test('an incompatible inherited tail count requires a reserved replacement', async () => {
  const f = await setup({
    changes: [],
    sourceOptions: {
      data: {
        name: 'N',
        category: 'other',
        relations: [
          { targetEntityId: 'a', relationType: 'r' },
          { targetEntityId: 'b', relationType: 'r' },
        ],
      },
    },
    relations: { present: true, count: 1 },
  });
  await assert.rejects(() => finishCompilation(f));
  assert.equal(job(f).compilation.phase, 'relations');
});
test('compilation freezes new reservations while exact historical claims remain replayable', async () => {
  const d = adventureImportDb({ nativeUpdates: true }),
    f = { ...d, ...(await editReservationFixture(d.db, { mode: 'v1' })) },
    initial = await f.factory().startBookLoreEditReservation(f.uid, f.intent),
    initialized = (
      await f.factory().initializeBookLoreEditGeneration(f.uid, editControl(f, initial, 'init'))
    ).progress,
    r = editReserveRequest(f, initialized),
    claim = await f.factory().reserveBookLoreEditUpload(f.uid, r),
    started = (await advanceCompilation(f, claim.progress)).progress;
  await assert.rejects(() =>
    f.factory().reserveBookLoreEditUpload(f.uid, {
      ...editReserveRequest(f, started),
      operationId: 'new-claim',
    }),
  );
  assert.deepEqual((await f.factory().reserveBookLoreEditUpload(f.uid, r)).receipt, claim.receipt);
});
test('inline source compiles through server materialization without changing the origin', async () => {
  const f = await setup({ mode: 'inline' }),
    before = structuredClone(f.records.get(f.source.seed.path));
  await finishCompilation(f);
  const { storage } = await openCompilation(f);
  assert.equal(storage.base, null);
  assert.equal(await pointerValue(f, storage.fields.name), 'Original');
  assert.deepEqual(f.records.get(f.source.seed.path), before);
});
test('a field above 8 MiB/128 parts is audited one part at a time and loses its private SHA checkpoint at EOF', async () => {
  const f = await setup({
      changes: [
        { target: { field: 'details' }, value: 'PRIVATE_COMPILE_PROSE_' + '🌙'.repeat(2300000) },
      ],
    }),
    count = f.uploads[0].prepared.manifest.chunkCount;
  assert.ok(count > 128);
  const done = await finishCompilation(f);
  assert.ok(done.compilation.auditedParts > 128);
  assert.equal(f.records.has(f.c.path + '/compilationState/current'), false);
  for (const [path, value] of f.records)
    if (path.startsWith(f.c.path) && !path.includes('/compilationState/'))
      assert.equal(JSON.stringify(value).includes('PRIVATE_COMPILE_PROSE_'), false);
});
for (const change of ['owner', 'clock', 'head', 'inspection'])
  test('new compilation unit reauthorizes changed ' + change, async () => {
    const f = await setup(),
      p = (await advanceCompilation(f, f.progress)).progress;
    if (change === 'inspection')
      await f.source.factory().cancelBookLoreSourceInspection(f.uid, {
        inspectionId: f.source.inspectionId,
        startHash: f.source.startHash,
        operationId: 'cancel-source',
      });
    else
      await f.db.runTransaction(async (tx) =>
        tx.update(
          f.db.doc(change === 'head' ? f.source.seed.path : f.source.seed.bookPath),
          change === 'owner'
            ? { authorId: 'other' }
            : change === 'clock'
              ? { localLoreVersion: 1 }
              : { updatedAt: 99999 },
        ),
      );
    const before = structuredClone([...f.records]);
    await assert.rejects(() => advanceCompilation(f, p));
    assert.deepEqual([...f.records], before);
  });
test('concurrent identical compilation unit has one native receipt and one increment', async () => {
  const f = await setup(),
    r = editControl(f, f.progress, 'same-unit'),
    results = await Promise.all([
      f.factory().advanceBookLoreEditCompilation(f.uid, r),
      f.factory().advanceBookLoreEditCompilation(f.uid, r),
    ]);
  assert.deepEqual(results[0], results[1]);
  assert.equal(results[0].progress.revision, f.progress.revision + 1);
});
for (const artifact of ['segment', 'journal', 'certificate', 'state'])
  test('a recreated ' + artifact + ' cannot authorize compilation or cleanup', async () => {
    const relations = [{ targetEntityId: 't', relationType: 'r' }],
      f = await setup({
        sourceOptions: { data: { name: 'N', category: 'other', relations } },
        relations: { present: true, count: 1 },
        changes: [{ target: { field: 'details' }, value: 'x'.repeat(100000) }],
      });
    let p = f.progress,
      path;
    if (artifact === 'state') {
      while (!job(f).compilation?.auditHash) p = (await advanceCompilation(f, p)).progress;
      path = f.c.path + '/compilationState/current';
    } else {
      p = await finishCompilation(f);
      await openCompilation(f);
      path =
        artifact === 'segment'
          ? compilationSegmentPath(record(f), 0)
          : artifact === 'journal'
            ? compilationSegmentJournal(record(f), 0)
            : f.c.path + '/compilationCertificate/current';
    }
    const value = structuredClone(f.records.get(path));
    await f.db.runTransaction((tx) => tx.delete(f.db.doc(path)));
    await f.db.runTransaction((tx) => tx.create(f.db.doc(path), value));
    if (artifact === 'certificate') await assert.rejects(() => openCompilation(f));
    else if (artifact === 'state') await assert.rejects(() => advanceCompilation(f, p));
    else {
      const cancelled = (await cancelEditReservation(f, p)).progress;
      await assert.rejects(() => drainEditReservation(f, cancelled));
    }
    assert.equal(f.records.has(path), true);
  });
test('rollback of a body reference and parent operation preserves all controls together', async () => {
  const f = await setup(),
    p = (await advanceCompilation(f, f.progress)).progress,
    before = structuredClone([...f.records]),
    run = f.db.runTransaction.bind(f.db);
  f.db.runTransaction = (fn) =>
    run((tx) =>
      fn({
        ...tx,
        update(ref, value) {
          tx.update(ref, value);
          if (ref.path === f.c.path) throw Error('injected compiler failure');
        },
      }),
    );
  await assert.rejects(() => advanceCompilation(f, p), /injected compiler failure/);
  assert.deepEqual([...f.records], before);
  f.db.runTransaction = run;
  assert.ok((await advanceCompilation(f, p)).progress.revision > p.revision);
});
test('deleted or recreated inherited native parts prevent final certification', async () => {
  const f = await setup(),
    pointer = f.source.seed.storage.base,
    path = resourcePayloadChunkPath(f.bookId, pointer.manifest.bodyId, 0),
    value = structuredClone(f.records.get(path));
  await f.db.runTransaction((tx) => tx.delete(f.db.doc(path)));
  await f.db.runTransaction((tx) => tx.create(f.db.doc(path), value));
  await assert.rejects(() => finishCompilation(f));
  assert.equal(f.records.has(f.c.path + '/compilationCertificate/current'), false);
});
test('cancel during audit drops private state and retains inherited bodies after owner revocation', async () => {
  const f = await setup({ changes: [{ target: { field: 'details' }, value: 'x'.repeat(100000) }] });
  let p = f.progress;
  while (!job(f).compilation?.auditHash) p = (await advanceCompilation(f, p)).progress;
  await f.db.runTransaction((tx) =>
    tx.update(f.db.doc(f.source.seed.bookPath), { authorId: 'other' }),
  );
  const done = await drainEditReservation(f, (await cancelEditReservation(f, p)).progress);
  assert.equal(done.phase, 'cancelled');
  assert.equal(f.records.has(f.c.path + '/compilationState/current'), false);
  assert.equal(f.records.has(bodyPath(f, f.source.seed.storage.base)), true);
  await assert.rejects(() => openCompilation(f));
});
test('late head using the copied relation generation protects descriptors until removed', async () => {
  const f = await setup({
      changes: [],
      sourceOptions: {
        data: {
          name: 'N',
          category: 'other',
          relations: [{ targetEntityId: 't', relationType: 'r' }],
        },
      },
      relations: { present: true, count: 1 },
    }),
    done = await finishCompilation(f),
    old = structuredClone(f.records.get(f.source.seed.path)),
    { storage } = await openCompilation(f);
  await f.db.runTransaction((tx) =>
    tx.set(f.db.doc(f.source.seed.path), {
      bookId: f.bookId,
      ...storage.dates,
      payloadStorage: storage,
    }),
  );
  const blocked = await drainEditReservation(f, (await cancelEditReservation(f, done)).progress);
  assert.equal(blocked.phase, 'cancelling');
  assert.equal(blocked.blockedReason, 'active-head');
  assert.equal(f.records.has(compilationSegmentPath(record(f), 0)), true);
  await f.db.runTransaction((tx) => tx.set(f.db.doc(f.source.seed.path), old));
  assert.equal((await drainEditReservation(f, blocked)).phase, 'cancelled');
});
test('ready replay remains historical after cancellation and does not regenerate descriptors', async () => {
  const f = await setup();
  let p = f.progress,
    request,
    result;
  while (p.compilation?.phase !== 'ready') {
    request = editControl(f, p, 'compile-' + p.revision);
    result = await f.factory().advanceBookLoreEditCompilation(f.uid, request);
    p = result.progress;
  }
  await drainEditReservation(f, (await cancelEditReservation(f, p)).progress);
  const replay = await f.factory().advanceBookLoreEditCompilation(f.uid, request);
  assert.deepEqual(replay.receipt, result.receipt);
  assert.equal(replay.progress.phase, 'cancelled');
  await assert.rejects(() => openCompilation(f));
});

test('more than 128 relation pages are copied and certified by bounded units', async () => {
  const relations = Array.from({ length: 129 * 64 }, (_, i) => ({
      targetEntityId: 't' + i,
      relationType: 'r',
    })),
    f = await setup({
      changes: [],
      sourceOptions: { data: { name: 'N', category: 'other', relations } },
      relations: { present: true, count: relations.length },
    }),
    done = await finishCompilation(f);
  assert.equal(done.compilation.page, 129);
  assert.equal(done.compilation.auditedParts, 130);
  assert.equal(f.records.get(compilationSegmentPath(record(f), 128)).count, 64);
  const { storage } = await openCompilation(f);
  assert.equal(storage.relations.pages, 129);
});
test('removing a part after selection blocks audit without advancing the parent', async () => {
  const f = await setup();
  let p = f.progress;
  while (p.compilation?.phase !== 'audit') p = (await advanceCompilation(f, p)).progress;
  const path = resourcePayloadChunkPath(f.bookId, f.source.seed.storage.base.manifest.bodyId, 0);
  await f.db.runTransaction((tx) => tx.delete(f.db.doc(path)));
  const before = structuredClone(job(f));
  await assert.rejects(() => advanceCompilation(f, p));
  assert.deepEqual(job(f), before);
});
test('ready metadata does not grant access after source revocation', async () => {
  const f = await setup();
  await finishCompilation(f);
  await openCompilation(f);
  await f.db.runTransaction((tx) =>
    tx.update(f.db.doc(f.source.seed.bookPath), { authorId: 'other' }),
  );
  await assert.rejects(() => openCompilation(f));
});

test('an inherited relation page with invalid domain data cannot be certified', async () => {
  const f = await setup({
    sourceOptions: { data: { name: 'N', category: 'other', relations: [{ targetEntityId: 't' }] } },
  });
  await assert.rejects(() => finishCompilation(f));
  assert.equal(job(f).compilation.phase, 'audit');
  assert.equal(f.records.has(f.c.path + '/compilationCertificate/current'), false);
});
test('native compilation openings reject cloned parents and a different transaction', async () => {
  const f = await setup();
  await finishCompilation(f);
  const { loadEditReservation } = await import('../src/bookLoreEditReservationStore.mjs'),
    { openBookLoreEditCompilation } = await import('../src/bookLoreEditCompilationStore.mjs');
  let saved;
  await f.db.runTransaction(async (tx) => {
    saved = await loadEditReservation(tx, f.c, { startHash: f.startHash });
    await openBookLoreEditCompilation(tx, saved);
    await assert.rejects(() => openBookLoreEditCompilation(tx, { ...saved }));
  });
  await f.db.runTransaction((tx) => assert.rejects(() => openBookLoreEditCompilation(tx, saved)));
});
test('cancelling a partial page composition deletes only its proven descriptors', async () => {
  const relations = Array.from({ length: 65 }, (_, i) => ({
      targetEntityId: 't' + i,
      relationType: 'r',
    })),
    f = await setup({
      changes: [],
      sourceOptions: { data: { name: 'N', category: 'other', relations } },
      relations: { present: true, count: 65 },
    });
  let p = f.progress;
  while (p.compilation?.page !== 1) p = (await advanceCompilation(f, p)).progress;
  assert.equal(f.records.has(compilationSegmentPath(record(f), 0)), true);
  assert.equal(f.records.has(compilationSegmentPath(record(f), 1)), false);
  const done = await drainEditReservation(f, (await cancelEditReservation(f, p)).progress);
  assert.equal(done.phase, 'cancelled');
  assert.equal(done.compilation.cleanupPage, 1);
  assert.equal(f.records.has(compilationSegmentPath(record(f), 0)), false);
  for (const segment of f.source.seed.segments) assert.equal(f.records.has(segment.path), true);
});
