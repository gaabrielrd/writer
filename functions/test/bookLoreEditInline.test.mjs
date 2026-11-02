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
  editControl,
  cancelEditReservation,
  drainEditReservation,
  getEditReservation,
} from './helpers/bookLoreEditReservationFixture.mjs';
import { inlineUploadId, readInlineChild } from '../src/bookLoreEditInline.mjs';
import { loadEditReservation } from '../src/bookLoreEditReservationStore.mjs';
import {
  editReservationIntent,
  editReservationStartHash,
} from '../src/bookLoreEditReservationContracts.mjs';
import { createBookLoreFieldUploadService } from '../src/bookLoreFieldUpload.mjs';
import { prepareBookResourcePayload } from '../src/bookResourcePayload.mjs';
import { fieldUploadOperationId } from '../src/bookLoreFieldUploadContracts.mjs';
import { readBookResourcePayload } from '../src/bookResourcePayloadRead.mjs';
import { resourcePayloadChunkPath } from '../src/bookResourcePayloadPaths.mjs';
async function setup(options = {}) {
  const d = adventureImportDb({ nativeUpdates: true });
  return { ...d, ...(await compilationFixture(d.db, { mode: 'inline', ...options })) };
}
const job = (f) => f.records.get(f.c.path);
const child = (f) => {
  const w = job(f).compilation?.inlineWork;
  return w ? f.records.get('users/' + f.uid + '/bookLoreFieldUploads/' + w.uploadId) : null;
};
const current = (f) => getEditReservation(f);
const value = (f, pointer) =>
  f.db.runTransaction((tx) =>
    readBookResourcePayload(tx, f.db, {
      uid: f.uid,
      bookId: f.bookId,
      resource: { kind: 'lore', parentId: null, id: f.loreId },
      ...pointer,
    }),
  );
async function until(f, predicate, p = f.progress) {
  for (let i = 0; i < 1000 && !predicate(job(f), child(f)); i++)
    p = (await advanceCompilation(f, p)).progress;
  assert.ok(predicate(job(f), child(f)));
  return p;
}
const largeSource = () => ({
  name: 'Name',
  category: 'other',
  details: 'PRIVATE_INLINE_TEXT_' + 'x'.repeat(100000),
  createdAt: 100,
  updatedAt: 101,
});
test('all inline fields and relation pages materialize literally while optional removals and root stay intact', async () => {
  const data = {
      name: '  Name 🌙 ',
      category: 'other',
      summary: 'removed',
      details: '\ufeffliteral\u0001🌙',
      aliases: ['', 'same', 'same'],
      structuredDetails: { notes: 'literal 🌙' },
      isPublic: false,
      createdAt: 100,
      updatedAt: 101,
      relations: Array.from({ length: 65 }, (_, i) => ({
        targetEntityId: 't' + i,
        relationType: 'r',
        description: 'literal ' + i,
      })),
    },
    f = await setup({ changes: [], removals: ['summary'], sourceOptions: { data } }),
    original = structuredClone(f.records.get(f.source.seed.path)),
    book = structuredClone(f.records.get(f.source.seed.bookPath)),
    done = await finishCompilation(f),
    { storage } = await openCompilation(f);
  assert.equal(storage.base, null);
  assert.equal(storage.fields.summary, null);
  assert.equal(done.reservedCount, 8);
  for (const field of ['name', 'category', 'details', 'aliases', 'structuredDetails', 'isPublic'])
    assert.deepEqual(await value(f, storage.fields[field]), data[field]);
  assert.equal(storage.dates.createdAt, 100);
  assert.equal(storage.relations.count, 65);
  assert.equal(done.compilation.materializing, null);
  assert.deepEqual(f.records.get(f.source.seed.path), original);
  assert.deepEqual(f.records.get(f.source.seed.bookPath), book);
  for (const [path, v] of f.records)
    if (path.startsWith(f.c.path)) assert.equal(JSON.stringify(v).includes('literal'), false);
  const cancelled = await drainEditReservation(f, (await cancelEditReservation(f, done)).progress);
  assert.equal(cancelled.phase, 'cancelled');
  assert.equal(cancelled.releasedCount, 8);
  assert.deepEqual(f.records.get(f.source.seed.path), original);
});
test('absent inline fields, dates and relations remain absent rather than gaining defaults', async () => {
  const f = await setup({
    changes: [],
    removals: ['summary'],
    sourceOptions: { data: { name: 'N', category: 'other' } },
  });
  await finishCompilation(f);
  const { storage } = await openCompilation(f);
  assert.equal(Object.hasOwn(storage.fields, 'isPublic'), false);
  assert.equal(Object.hasOwn(storage.fields, 'aliases'), false);
  assert.equal(Object.hasOwn(storage.dates, 'createdAt'), false);
  assert.equal(storage.relations.present, false);
});
test('creator fields override inline values and removals do not materialize discarded prose', async () => {
  const f = await setup({
    changes: [{ target: { field: 'details' }, value: 'override' }],
    removals: ['isPublic'],
    sourceOptions: {
      data: {
        name: 'N',
        category: 'other',
        details: 'discarded',
        isPublic: true,
      },
    },
  });
  await finishCompilation(f);
  const { storage } = await openCompilation(f);
  assert.equal(await value(f, storage.fields.details), 'override');
  assert.equal(storage.fields.isPublic, null);
  const fields = [...f.records]
    .filter(([p]) => p.startsWith(f.c.path + '/slots/'))
    .map(([, v]) => v.target.field);
  assert.equal(fields.filter((x) => x === 'details').length, 1);
  assert.equal(fields.includes('isPublic'), false);
});
test('inline relation diff preserves an inherited page and selects a replacement page', async () => {
  const relations = Array.from({ length: 65 }, (_, i) => ({
      targetEntityId: 't' + i,
      relationType: 'r',
    })),
    f = await setup({
      changes: [
        {
          target: { field: 'relations', page: 1, count: 1 },
          value: [{ targetEntityId: 'new', relationType: 'r' }],
        },
      ],
      relations: { present: true, count: 65 },
      sourceOptions: { data: { name: 'N', category: 'other', relations } },
    });
  await finishCompilation(f);
  assert.equal((await openCompilation(f)).storage.relations.pages, 2);
  const slots = [...f.records]
    .filter(([p]) => p.startsWith(f.c.path + '/slots/'))
    .map(([, v]) => v);
  const inherited = slots.find((s) => s.target.field === 'relations' && s.target.page === 0),
    replacement = slots.find((s) => s.target.field === 'relations' && s.target.page === 1);
  assert.ok(inherited.materialized);
  assert.equal(replacement.materialized, undefined);
  assert.deepEqual(await value(f, inherited.pointer), relations.slice(0, 64));
  assert.deepEqual(await value(f, replacement.pointer), [
    { targetEntityId: 'new', relationType: 'r' },
  ]);
});
test('escaped inline text expands beyond 16 parts and seals in bounded batches', async () => {
  const text = '\u0001'.repeat(200000),
    f = await setup({
      changes: [],
      removals: ['summary'],
      sourceOptions: { data: { name: 'N', category: 'other', details: text } },
    });
  await finishCompilation(f);
  const { storage } = await openCompilation(f);
  assert.ok(storage.fields.details.manifest.chunkCount > 16);
  assert.equal(await value(f, storage.fields.details), text);
});
for (const [stage, change] of [
  ['new', 'absent'],
  ['partial', 'owner'],
  ['verifying', 'deleting'],
  ['sealed', 'absent'],
])
  test(
    'cancel inline child ' + stage + ' after project ' + change + ' before its slot exists',
    async () => {
      const f = await setup({
          changes: [],
          removals: ['summary'],
          sourceOptions: { data: largeSource() },
        }),
        p = await until(
          f,
          (j, c) =>
            j.compilation?.inlineWork?.target.field === 'details' &&
            c &&
            (stage === 'new'
              ? c.phase === 'uploading' && c.nextIndex === 0
              : stage === 'partial'
                ? c.phase === 'uploading' && c.nextIndex > 0
                : c.phase === stage),
        ),
        work = structuredClone(job(f).compilation.inlineWork),
        beforeCount = job(f).reservedCount,
        path = 'users/' + f.uid + '/bookLoreFieldUploads/' + work.uploadId,
        manifest = f.records.get(path).context.manifest;
      assert.equal(
        [...f.records].some(
          ([p, s]) => p.startsWith(f.c.path + '/slots/') && s.upload.uploadId === work.uploadId,
        ),
        false,
      );
      await f.db.runTransaction((tx) =>
        change === 'absent'
          ? tx.delete(f.db.doc(f.source.seed.bookPath))
          : tx.update(
              f.db.doc(f.source.seed.bookPath),
              change === 'owner' ? { authorId: 'other' } : { deleting: true },
            ),
      );
      const done = await drainEditReservation(f, (await cancelEditReservation(f, p)).progress);
      assert.equal(done.phase, 'cancelled');
      assert.equal(done.reservedCount, beforeCount);
      assert.equal(done.releasedCount, beforeCount);
      assert.equal(f.records.get(path).phase, 'cancelled');
      assert.equal(job(f).compilation.inlineWork, null);
      assert.equal(
        f.records.has('books/' + f.bookId + '/bookResourceBodies/' + manifest.bodyId),
        false,
      );
      assert.equal(f.records.has(resourcePayloadChunkPath(f.bookId, manifest.bodyId, 0)), false);
      assert.equal(f.records.has(path + '/state/current'), false);
    },
  );
test('standalone append, seal and cancel cannot advance a managed inline child', async () => {
  const f = await setup({
      changes: [],
      removals: ['summary'],
      sourceOptions: { data: largeSource() },
    }),
    p = await until(
      f,
      (j, c) =>
        j.compilation?.inlineWork?.target.field === 'details' &&
        c?.phase === 'uploading' &&
        c.nextIndex > 0,
    ),
    work = job(f).compilation.inlineWork,
    api = createBookLoreFieldUploadService({ db: f.db }),
    view = await api.getBookLoreFieldUpload(f.uid, {
      uploadId: work.uploadId,
      startHash: work.startHash,
    }),
    request = {
      uploadId: work.uploadId,
      startHash: work.startHash,
      jobToken: view.jobToken,
      operationId: 'outside-parent',
      expectedRevision: view.revision,
    },
    field = child(f),
    prepared = prepareBookResourcePayload({
      uid: f.uid,
      bookId: f.bookId,
      resource: { kind: 'lore', parentId: null, id: f.loreId },
      operationId: fieldUploadOperationId(f.uid, f.bookId, f.loreId, work.uploadId, work.target),
      timestamp: job(f).compilation.timestamp,
      value: largeSource().details,
    }),
    part = prepared.part(field.nextIndex);
  await assert.rejects(() =>
    api.appendBookLoreFieldUpload(f.uid, {
      ...request,
      index: field.nextIndex,
      chunkBase64: Buffer.from(part.bytes).toString('base64'),
      proof: part.proof,
    }),
  );
  await assert.rejects(() =>
    api.cancelBookLoreFieldUpload(f.uid, {
      uploadId: work.uploadId,
      startHash: work.startHash,
      jobToken: view.jobToken,
      operationId: 'cancel-outside',
    }),
  );
  const sealed = await until(
      f,
      (j, c) => j.compilation?.inlineWork?.target.field === 'details' && c?.phase === 'verifying',
      p,
    ),
    next = await api.getBookLoreFieldUpload(f.uid, {
      uploadId: work.uploadId,
      startHash: work.startHash,
    });
  await assert.rejects(() =>
    api.advanceBookLoreFieldSeal(f.uid, { ...request, expectedRevision: next.revision }),
  );
  assert.equal((await current(f)).revision, sealed.revision);
  await until(
    f,
    (j, c) => j.compilation?.inlineWork?.target.field === 'details' && c?.phase === 'sealed',
    sealed,
  );
});
test('another preparation cannot claim a managed sealed child', async () => {
  const f = await setup({
    changes: [],
    removals: ['summary'],
    sourceOptions: { data: largeSource() },
  });
  await until(
    f,
    (j, c) => j.compilation?.inlineWork?.target.field === 'details' && c?.phase === 'sealed',
  );
  const work = job(f).compilation.inlineWork,
    api = createBookLoreFieldUploadService({ db: f.db }),
    view = await api.getBookLoreFieldUpload(f.uid, {
      uploadId: work.uploadId,
      startHash: work.startHash,
    }),
    ref = { uploadId: work.uploadId, startHash: work.startHash, jobToken: view.jobToken },
    intent = editReservationIntent(f.uid, {
      ...f.intent,
      editId: 'other-preparation',
      fields: { details: ref },
    }),
    hash = editReservationStartHash(intent),
    start = await f.factory().startBookLoreEditReservation(f.uid, intent),
    r = {
      editId: intent.editId,
      startHash: hash,
      jobToken: start.jobToken,
      operationId: 'init-other',
      expectedRevision: start.revision,
    },
    ready = (await f.factory().initializeBookLoreEditGeneration(f.uid, r)).progress;
  await assert.rejects(() =>
    f.factory().reserveBookLoreEditUpload(f.uid, {
      ...r,
      jobToken: ready.jobToken,
      expectedRevision: ready.revision,
      operationId: 'claim-other',
      target: { field: 'details' },
      upload: ref,
    }),
  );
  assert.equal(child(f).phase, 'sealed');
});
for (const artifact of ['child', 'lease', 'start-pair'])
  test(
    'recreated inline ' + artifact + ' cannot be resumed or cleaned as the original child',
    async () => {
      const f = await setup({
          changes: [],
          removals: ['summary'],
          sourceOptions: { data: largeSource() },
        }),
        p = await until(
          f,
          (j, c) =>
            j.compilation?.inlineWork?.target.field === 'details' &&
            c?.phase === 'uploading' &&
            c.nextIndex > 0,
        ),
        work = job(f).compilation.inlineWork,
        field = child(f),
        paths =
          artifact === 'child'
            ? ['users/' + f.uid + '/bookLoreFieldUploads/' + work.uploadId]
            : artifact === 'lease'
              ? ['books/' + f.bookId + '/bookResourceLeases/' + field.context.manifest.bodyId]
              : [
                  f.c.path + '/operations/' + work.operationId,
                  f.c.path + '/operationProofs/' + work.operationId,
                ],
        values = paths.map((path) => structuredClone(f.records.get(path)));
      await f.db.runTransaction((tx) => paths.forEach((path) => tx.delete(f.db.doc(path))));
      await f.db.runTransaction((tx) =>
        paths.forEach((path, i) => tx.create(f.db.doc(path), values[i])),
      );
      await assert.rejects(() => advanceCompilation(f, p));
      assert.equal(
        f.records.has(resourcePayloadChunkPath(f.bookId, field.context.manifest.bodyId, 0)),
        true,
      );
    },
  );
for (const phase of ['start', 'append', 'reserve'])
  test('rollback keeps inline ' + phase + ' child and parent in one transaction', async () => {
    const f = await setup({
      changes: [],
      removals: ['summary'],
      sourceOptions: { data: largeSource() },
    });
    const p =
      phase === 'start'
        ? await until(f, (j) => j.compilation?.phase === 'fields' && j.compilation.fieldIndex === 0)
        : await until(
            f,
            (j, c) =>
              j.compilation?.inlineWork?.target.field === 'details' &&
              (phase === 'append' ? c?.phase === 'uploading' : c?.phase === 'sealed'),
          );
    const before = structuredClone([...f.records]),
      run = f.db.runTransaction.bind(f.db);
    f.db.runTransaction = (fn) =>
      run((tx) =>
        fn({
          ...tx,
          update(ref, v) {
            tx.update(ref, v);
            if (ref.path === f.c.path) throw Error('injected inline rollback');
          },
        }),
      );
    await assert.rejects(() => advanceCompilation(f, p), /injected inline rollback/);
    assert.deepEqual([...f.records], before);
    f.db.runTransaction = run;
    assert.equal((await advanceCompilation(f, p)).progress.revision, p.revision + 1);
  });
test('inline child opening rejects a copied parent or a different transaction', async () => {
  const f = await setup(),
    p = await until(f, (j) => !!j.compilation?.inlineWork);
  let parent, work;
  await f.db.runTransaction(async (tx) => {
    parent = await loadEditReservation(tx, f.c, { startHash: f.startHash });
    work = parent.job.compilation.inlineWork;
    await readInlineChild(tx, parent, work);
    await assert.rejects(() => readInlineChild(tx, { ...parent }, work));
    assert.equal(inlineUploadId(parent, work.target), work.uploadId);
  });
  await f.db.runTransaction((tx) => assert.rejects(() => readInlineChild(tx, parent, work)));
  assert.equal(p.phase, 'preparing');
});
test('exact materialization replay after cancellation cannot recreate the child bytes', async () => {
  const f = await setup(),
    p = await until(f, (j) => j.compilation?.phase === 'fields' && j.compilation.fieldIndex === 0),
    r = editControl(f, p, 'materialize-first'),
    first = await f.factory().advanceBookLoreEditCompilation(f.uid, r);
  assert.ok(job(f).compilation.inlineWork);
  const done = await drainEditReservation(
    f,
    (await cancelEditReservation(f, first.progress)).progress,
  );
  assert.equal(done.phase, 'cancelled');
  const replay = await f.factory().advanceBookLoreEditCompilation(f.uid, r);
  assert.deepEqual(replay.receipt, first.receipt);
  assert.equal(replay.progress.phase, 'cancelled');
  assert.equal(job(f).compilation.inlineWork, null);
});

test('parent reconciles an unreserved inline child cleaned independently after coordinated cancel', async () => {
  const f = await setup({
      changes: [],
      removals: ['summary'],
      sourceOptions: { data: largeSource() },
    }),
    p = await until(
      f,
      (j, c) =>
        j.compilation?.inlineWork?.target.field === 'details' &&
        c?.phase === 'uploading' &&
        c.nextIndex > 0,
    ),
    work = job(f).compilation.inlineWork,
    api = createBookLoreFieldUploadService({ db: f.db }),
    cancelled = (await cancelEditReservation(f, p)).progress,
    pending = (
      await f.factory().advanceBookLoreEditReservationCleanup(f.uid, editControl(f, cancelled))
    ).progress;
  let view = await api.getBookLoreFieldUpload(f.uid, {
    uploadId: work.uploadId,
    startHash: work.startHash,
  });
  assert.equal(view.phase, 'cancelling');
  while (view.phase === 'cancelling')
    view = (
      await api.advanceBookLoreFieldCleanup(f.uid, {
        uploadId: work.uploadId,
        startHash: work.startHash,
        jobToken: view.jobToken,
        operationId: 'independent-inline-' + view.revision,
        expectedRevision: view.revision,
      })
    ).progress;
  const done = await drainEditReservation(f, pending);
  assert.equal(done.phase, 'cancelled');
  assert.equal(done.releasedCount, 2);
  assert.equal(done.reservedCount, 2);
  assert.equal(job(f).compilation.inlineWork, null);
});
