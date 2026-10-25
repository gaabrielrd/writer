import test from 'node:test';
import assert from 'node:assert/strict';
import { born } from '../src/bookRestoreUploadContracts.mjs';
import { createBookLoreReadService } from '../src/bookLoreRead.mjs';
import { createBookLoreSourceInspectionService } from '../src/bookLoreSourceInspection.mjs';
import {
  inspectionIntent,
  inspectionStartHash,
} from '../src/bookLoreSourceInspectionContracts.mjs';
import { resourcePayloadChunkPath } from '../src/bookResourcePayloadPaths.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import {
  sourceInspectionFixture,
  inspectionControl,
  finishSourceInspection,
  sourceInspectionMetadata,
  cancelSourceInspection,
} from './helpers/bookLoreSourceInspectionFixture.mjs';
async function setup(options) {
  const f = adventureImportDb({ nativeUpdates: true });
  return { ...f, ...(await sourceInspectionFixture(f.db, options)) };
}
const get = (f) =>
  f
    .factory()
    .getBookLoreSourceInspection(f.uid, { inspectionId: f.inspectionId, startHash: f.startHash });
test('v1 server inspection resolves public visibility hidden by the stub and preserves native source and clock', async () => {
  const f = await setup(),
    source = structuredClone(f.records.get(f.seed.path)),
    clock = f.records.get(f.seed.bookPath).localLoreVersion,
    p = await finishSourceInspection(f),
    m = await sourceInspectionMetadata(f, p);
  assert.deepEqual(m.isPublic, { present: true, value: true });
  assert.deepEqual(m.dates, { createdAt: 1000, updatedAt: 1000 });
  assert.equal(p.ready, true);
  assert.equal(f.records.has(f.c.stateRef.path), false);
  assert.deepEqual(f.records.get(f.seed.path), source);
  assert.equal(f.records.get(f.seed.bookPath).localLoreVersion, clock);
  assert.equal(
    JSON.stringify([...f.records].filter(([path]) => path.startsWith(f.c.path))).includes(
      'PRIVATE_PROSE',
    ),
    false,
  );
  assert.equal(Object.hasOwn(p, 'metadata'), false);
  assert.equal(Object.hasOwn(p, 'isPublic'), false);
});
test('inline inspection preserves optional date and isPublic absence without manufacturing defaults', async () => {
  const f = await setup({
      mode: 'inline',
      data: { name: '', category: 'other', aliases: ['', 'same', 'same'] },
    }),
    begin = await f.factory().startBookLoreSourceInspection(f.uid, f.intent),
    p = await finishSourceInspection(f, begin),
    m = await sourceInspectionMetadata(f, p);
  assert.equal(begin.phase, 'checking');
  assert.deepEqual(m.dates, {});
  assert.deepEqual(m.isPublic, { present: false, value: null });
  assert.deepEqual(m.fields, ['name', 'category', 'aliases']);
  assert.deepEqual(m.ranges, {});
});
test('v2 inspection applies a boolean override in a separate unit and authoritative date absence', async () => {
  const f = await setup({
      mode: 'v2',
      fields: { isPublic: false, summary: null },
      dates: { updatedAt: 2000 },
    }),
    begin = await f.factory().startBookLoreSourceInspection(f.uid, f.intent),
    scanned = (
      await f.factory().advanceBookLoreSourceInspection(f.uid, inspectionControl(f, begin))
    ).progress;
  assert.equal(scanned.phase, 'privacy');
  assert.equal(scanned.ready, false);
  assert.equal(f.records.has(f.c.stateRef.path), false);
  const p = await finishSourceInspection(f, scanned),
    m = await sourceInspectionMetadata(f, p);
  assert.deepEqual(m.isPublic, { present: true, value: false });
  assert.deepEqual(m.dates, { updatedAt: 2000 });
  assert.equal(m.fields.includes('summary'), false);
});
for (const [field, value, expected] of [
  ['isPublic', null, { present: false, value: null }],
  ['name', 'New', { present: true, value: true }],
])
  test('v2 presence merge preserves privacy for ' + JSON.stringify(value), async () => {
    const f = await setup({ mode: 'v2', fields: { [field]: value } }),
      p = await finishSourceInspection(f),
      m = await sourceInspectionMetadata(f, p);
    assert.deepEqual(m.isPublic, expected);
  });
test('a field-only v2 origin is resolved without scanning a synthetic base', async () => {
  const f = await setup({
      mode: 'v2',
      noBase: true,
      fields: { name: 'N', category: 'other', isPublic: true },
    }),
    p = await finishSourceInspection(f),
    m = await sourceInspectionMetadata(f, p);
  assert.equal(p.nextIndex, 0);
  assert.equal(p.byteLength, 0);
  assert.equal(p.totalParts, 0);
  assert.deepEqual(m.dates, { updatedAt: 2000 });
  assert.deepEqual(m.isPublic, { present: true, value: true });
});
test('a large source above 8 MiB/128 parts resumes with bounded state and one chunk per unit', async () => {
  const secret = 'DO_NOT_KEEP_THE_PROSE',
    f = await setup({
      data: {
        name: 'N',
        category: 'other',
        details: secret + '🌙'.repeat(2300000),
        isPublic: false,
      },
    }),
    run = f.db.runTransaction.bind(f.db);
  let p = await f.factory().startBookLoreSourceInspection(f.uid, f.intent),
    units = 0,
    paths = [];
  f.db.runTransaction = (fn) =>
    run((tx) =>
      fn({
        ...tx,
        get(ref) {
          paths.push(ref.path);
          return tx.get(ref);
        },
        getAll(ref, ...args) {
          paths.push(ref.path);
          return tx.getAll(ref, ...args);
        },
      }),
    );
  while (p.phase === 'base') {
    paths = [];
    p = (await f.factory().advanceBookLoreSourceInspection(f.uid, inspectionControl(f, p)))
      .progress;
    assert.equal(paths.filter((path) => path.includes('/bookResourceChunks/')).length, 1);
    for (const [path, value] of f.records)
      if (path.startsWith(f.c.path) && path !== f.c.stateRef.path)
        assert.equal(JSON.stringify(value).includes(secret), false);
    const s = f.records.get(f.c.stateRef.path);
    if (s) {
      assert.ok(JSON.stringify(s).length < 8000);
      assert.equal(JSON.stringify(s.parser).includes(secret), false);
    }
    units++;
  }
  assert.ok(units > 128);
  assert.equal(p.phase, 'ready');
  assert.deepEqual((await sourceInspectionMetadata(f, p)).isPublic, {
    present: true,
    value: false,
  });
});
test('replay confirms its past unit after cancellation and origin revocation without re-reading content', async () => {
  const f = await setup({ data: { name: 'N', category: 'other', details: 'x'.repeat(90000) } }),
    begin = await f.factory().startBookLoreSourceInspection(f.uid, f.intent),
    r = inspectionControl(f, begin),
    first = await f.factory().advanceBookLoreSourceInspection(f.uid, r);
  await f.db.runTransaction(async (tx) => tx.delete(f.db.doc(f.seed.bookPath)));
  await cancelSourceInspection(f, first.progress);
  const again = await f.factory().advanceBookLoreSourceInspection(f.uid, r);
  assert.deepEqual(again.receipt, first.receipt);
  assert.equal(again.progress.phase, 'cancelled');
  assert.equal(f.records.has(f.c.stateRef.path), false);
  assert.equal(
    (await f.factory().startBookLoreSourceInspection(f.uid, f.intent)).phase,
    'cancelled',
  );
});
test('early cancellation fences an uncertain start forever', async () => {
  const f = await setup(),
    result = await f.factory().cancelBookLoreSourceInspection(f.uid, {
      inspectionId: f.inspectionId,
      startHash: f.startHash,
      operationId: 'early-cancel',
    });
  assert.equal(result.progress.phase, 'cancelled');
  assert.equal(result.progress.jobToken, null);
  assert.equal(
    (await f.factory().startBookLoreSourceInspection(f.uid, f.intent)).phase,
    'cancelled',
  );
  assert.equal(f.records.has(f.c.stateRef.path), false);
});
for (const at of ['initial', 'partial', 'ready'])
  test('cancellation clears private state and prevents certificate reuse at ' + at, async () => {
    const f = await setup({ data: { name: 'N', category: 'other', details: 'x'.repeat(90000) } }),
      begin = await f.factory().startBookLoreSourceInspection(f.uid, f.intent);
    const p =
      at === 'initial'
        ? begin
        : at === 'ready'
          ? await finishSourceInspection(f, begin)
          : (await f.factory().advanceBookLoreSourceInspection(f.uid, inspectionControl(f, begin)))
              .progress;
    const result = await cancelSourceInspection(f, p);
    assert.equal(result.progress.phase, 'cancelled');
    assert.equal(f.records.has(f.c.stateRef.path), false);
    await assert.rejects(() => sourceInspectionMetadata(f, p));
    assert.equal(f.records.has(f.c.certificateRef.path), at === 'ready');
  });
for (const change of [
  'owner',
  'clock',
  'head',
  'book-recreated',
  'lore-recreated',
  'base-header',
  'base-part',
])
  test('fresh source authorization refuses ' + change, async () => {
    const f = await setup(),
      p = await f.factory().startBookLoreSourceInspection(f.uid, f.intent);
    if (change === 'owner' || change === 'clock' || change === 'head')
      await f.db.runTransaction(async (tx) =>
        tx.update(
          f.db.doc(change === 'head' ? f.seed.path : f.seed.bookPath),
          change === 'owner'
            ? { authorId: 'other' }
            : change === 'clock'
              ? { localLoreVersion: 1 }
              : { updatedAt: 3 },
        ),
      );
    else {
      const path =
          change === 'book-recreated'
            ? f.seed.bookPath
            : change === 'lore-recreated'
              ? f.seed.path
              : change === 'base-header'
                ? f.seed.base.path
                : resourcePayloadChunkPath(f.bookId, f.seed.base.prepared.manifest.bodyId, 0),
        data = structuredClone(f.records.get(path));
      await f.db.runTransaction(async (tx) => tx.delete(f.db.doc(path)));
      await f.db.runTransaction(async (tx) => tx.create(f.db.doc(path), data));
    }
    await assert.rejects(() =>
      f.factory().advanceBookLoreSourceInspection(f.uid, inspectionControl(f, p)),
    );
    assert.equal((await get(f)).nextIndex, 0);
  });
test('the final metadata opening requires the same still-authorized source', async () => {
  const f = await setup(),
    p = await finishSourceInspection(f);
  await f.db.runTransaction(async (tx) => tx.update(f.db.doc(f.seed.bookPath), { deleting: true }));
  await assert.rejects(() => sourceInspectionMetadata(f, p));
  assert.equal((await get(f)).ready, true);
});
for (const artifact of ['job', 'state', 'receipt', 'anchor', 'certificate'])
  test('native recreation or mutation refuses ' + artifact, async () => {
    const f = await setup({ data: { name: 'N', category: 'other', details: 'x'.repeat(90000) } }),
      begin = await f.factory().startBookLoreSourceInspection(f.uid, f.intent);
    let p = begin;
    if (['receipt', 'anchor'].includes(artifact))
      p = (await f.factory().advanceBookLoreSourceInspection(f.uid, inspectionControl(f, p)))
        .progress;
    if (artifact === 'certificate') p = await finishSourceInspection(f, p);
    const path =
        artifact === 'job'
          ? f.c.path
          : artifact === 'state'
            ? f.c.stateRef.path
            : artifact === 'certificate'
              ? f.c.certificateRef.path
              : f.c.path +
                (artifact === 'receipt' ? '/operations/' : '/operationProofs/') +
                'inspect-0',
      data = structuredClone(f.records.get(path));
    await f.db.runTransaction(async (tx) => tx.delete(f.db.doc(path)));
    await f.db.runTransaction(async (tx) => tx.create(f.db.doc(path), data));
    if (artifact === 'certificate') await assert.rejects(() => sourceInspectionMetadata(f, p));
    else
      await assert.rejects(() =>
        f.factory().advanceBookLoreSourceInspection(f.uid, inspectionControl(f, p)),
      );
  });
test('concurrent units preserve one CAS and exact-operation replays confirm that receipt', async () => {
  const f = await setup({ data: { name: 'N', category: 'other', details: 'x'.repeat(90000) } }),
    p = await f.factory().startBookLoreSourceInspection(f.uid, f.intent),
    a = inspectionControl(f, p, 'a'),
    b = inspectionControl(f, p, 'b'),
    results = await Promise.allSettled([
      f.factory().advanceBookLoreSourceInspection(f.uid, a),
      f.factory().advanceBookLoreSourceInspection(f.uid, b),
    ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const accepted = results[0].status === 'fulfilled' ? a : b,
    repeated = await Promise.all([
      f.factory().advanceBookLoreSourceInspection(f.uid, accepted),
      f.factory().advanceBookLoreSourceInspection(f.uid, accepted),
    ]);
  assert.deepEqual(repeated[0], repeated[1]);
  assert.equal(repeated[0].progress.nextIndex, 1);
  await assert.rejects(() =>
    f.factory().advanceBookLoreSourceInspection(f.uid, { ...accepted, expectedRevision: 1 }),
  );
});
test('a transaction retry after EOF digest resets SHA/parser and commits only one certificate', async () => {
  const f = await setup(),
    p = await f.factory().startBookLoreSourceInspection(f.uid, f.intent),
    run = f.db.runTransaction.bind(f.db),
    retry = Error('retry');
  let once = true;
  f.db.runTransaction = (fn) => {
    if (!once) return run(fn);
    once = false;
    return run(async (tx) => {
      await fn(tx);
      throw retry;
    }).catch((error) => {
      if (error !== retry) throw error;
      return run(fn);
    });
  };
  const result = await f.factory().advanceBookLoreSourceInspection(f.uid, inspectionControl(f, p));
  assert.equal(result.progress.phase, 'ready');
  assert.equal(result.progress.revision, 1);
  assert.equal((await sourceInspectionMetadata(f, result.progress)).isPublic.value, true);
});
test('rollback after preparing a final certificate preserves cursor, SHA and receipt together', async () => {
  const f = await setup(),
    p = await f.factory().startBookLoreSourceInspection(f.uid, f.intent),
    before = structuredClone([...f.records]),
    run = f.db.runTransaction.bind(f.db);
  f.db.runTransaction = (fn) =>
    run((tx) =>
      fn({
        ...tx,
        create(ref, value) {
          tx.create(ref, value);
          if (ref.path === f.c.certificateRef.path) throw Error('injected final failure');
        },
      }),
    );
  await assert.rejects(
    () => f.factory().advanceBookLoreSourceInspection(f.uid, inspectionControl(f, p)),
    /injected final failure/,
  );
  assert.deepEqual([...f.records], before);
});
test('an invalid base domain is not certified even with valid storage and Merkle bytes', async () => {
  const f = await setup({ data: { name: 'N', category: 'other', isPublic: 'yes' } }),
    p = await f.factory().startBookLoreSourceInspection(f.uid, f.intent);
  await assert.rejects(() =>
    f.factory().advanceBookLoreSourceInspection(f.uid, inspectionControl(f, p)),
  );
  assert.equal((await get(f)).phase, 'base');
  assert.equal(f.records.has(f.c.certificateRef.path), false);
});
test('full SHA is required independently of valid Merkle parts and canonical domain', async () => {
  const f = await setup(),
    header = f.seed.base.path,
    record = structuredClone(f.records.get(header));
  record.contentHash = 'f'.repeat(64);
  await f.db.runTransaction(async (tx) => tx.delete(f.db.doc(header)));
  await f.db.runTransaction(async (tx) => tx.create(f.db.doc(header), record));
  const snapshot = await f.db.runTransaction((tx) => tx.get(f.db.doc(header))),
    storage = structuredClone(f.seed.storage);
  storage.base.manifest.contentHash = record.contentHash;
  storage.base.expectedBirth = born(snapshot);
  storage.sealBirth = born(snapshot);
  await f.db.runTransaction(async (tx) =>
    tx.update(f.db.doc(f.seed.path), { payloadStorage: storage }),
  );
  const view = await createBookLoreReadService({ db: f.db }).getBookLoreRead(f.uid, {
    bookId: f.bookId,
    id: f.id,
  });
  f.intent = inspectionIntent(f.uid, { ...f.intent, sourceToken: view.readToken });
  f.startHash = inspectionStartHash(f.intent);
  const p = await f.factory().startBookLoreSourceInspection(f.uid, f.intent);
  await assert.rejects(() =>
    f.factory().advanceBookLoreSourceInspection(f.uid, inspectionControl(f, p)),
  );
  assert.equal(f.records.has(f.c.certificateRef.path), false);
});
test('anonymous actors, wire metadata injections and wrong scope fail without data writes', async () => {
  const f = await setup(),
    before = structuredClone([...f.records]);
  for (const uid of ['', undefined, 'bad/actor'])
    await assert.rejects(() => f.factory().startBookLoreSourceInspection(uid, f.intent));
  for (const extra of [
    { isPublic: false },
    { dates: { createdAt: 1 } },
    { bytes: 'fake' },
    { sourceToken: 'bad' },
  ])
    await assert.rejects(() =>
      f.factory().startBookLoreSourceInspection(f.uid, { ...f.intent, ...extra }),
    );
  assert.deepEqual([...f.records], before);
  const p = await f.factory().startBookLoreSourceInspection(f.uid, f.intent);
  await assert.rejects(() =>
    f
      .factory()
      .advanceBookLoreSourceInspection(f.uid, { ...inspectionControl(f, p), bytes: 'fake' }),
  );
  assert.equal(
    await f.factory().getBookLoreSourceInspection('other', {
      inspectionId: f.inspectionId,
      startHash: f.startHash,
      jobToken: p.jobToken,
    }),
    null,
  );
});
test('unknown inspections return null and foreign orphan state is preserved rather than adopted', async () => {
  const f = adventureImportDb({ nativeUpdates: true }),
    api = createBookLoreSourceInspectionService({ db: f.db });
  assert.equal(
    await api.getBookLoreSourceInspection('author', {
      inspectionId: 'absent',
      startHash: 'a'.repeat(64),
    }),
    null,
  );
  const s = await sourceInspectionFixture(f.db);
  await f.db.runTransaction(async (tx) => tx.create(s.c.stateRef, { foreign: true }));
  await assert.rejects(() => s.factory().startBookLoreSourceInspection(s.uid, s.intent));
  assert.deepEqual(f.records.get(s.c.stateRef.path), { foreign: true });
});
test('corrupt persisted SHA state is refused before a new receipt', async () => {
  const f = await setup(),
    p = await f.factory().startBookLoreSourceInspection(f.uid, f.intent);
  f.records.get(f.c.stateRef.path).hashState = 'bad';
  await assert.rejects(() =>
    f.factory().advanceBookLoreSourceInspection(f.uid, inspectionControl(f, p)),
  );
  assert.equal((await get(f)).revision, 0);
});

test('cancelling between base and privacy prevents emitting a final certificate', async () => {
  const f = await setup({ mode: 'v2', fields: { isPublic: false } }),
    begin = await f.factory().startBookLoreSourceInspection(f.uid, f.intent),
    privacy = (
      await f.factory().advanceBookLoreSourceInspection(f.uid, inspectionControl(f, begin))
    ).progress;
  assert.equal(privacy.phase, 'privacy');
  await cancelSourceInspection(f, privacy);
  assert.equal(f.records.has(f.c.stateRef.path), false);
  assert.equal(f.records.has(f.c.certificateRef.path), false);
  await assert.rejects(() =>
    f.factory().advanceBookLoreSourceInspection(f.uid, inspectionControl(f, privacy)),
  );
});
test('a paired old receipt recreated after the current job cannot confirm its former event', async () => {
  const f = await setup({ data: { name: 'N', category: 'other', details: 'x'.repeat(90000) } }),
    begin = await f.factory().startBookLoreSourceInspection(f.uid, f.intent),
    request = inspectionControl(f, begin),
    first = (await f.factory().advanceBookLoreSourceInspection(f.uid, request)).progress;
  await finishSourceInspection(f, first);
  const paths = [
      f.c.path + '/operations/' + request.operationId,
      f.c.path + '/operationProofs/' + request.operationId,
    ],
    records = paths.map((path) => structuredClone(f.records.get(path)));
  await f.db.runTransaction(async (tx) => paths.forEach((path) => tx.delete(f.db.doc(path))));
  await f.db.runTransaction(async (tx) =>
    paths.forEach((path, i) => tx.create(f.db.doc(path), records[i])),
  );
  await assert.rejects(() => f.factory().advanceBookLoreSourceInspection(f.uid, request));
});
test('a ready metadata certificate is not a proof that all source chunks still exist', async () => {
  const f = await setup(),
    p = await finishSourceInspection(f),
    path = resourcePayloadChunkPath(f.bookId, f.seed.base.prepared.manifest.bodyId, 0);
  await f.db.runTransaction(async (tx) => tx.delete(f.db.doc(path)));
  assert.equal((await sourceInspectionMetadata(f, p)).isPublic.value, true);
  await assert.rejects(() =>
    createBookLoreReadService({ db: f.db }).readBookLorePart(f.uid, {
      bookId: f.bookId,
      id: f.id,
      readToken: f.view.readToken,
      section: 'base',
      page: 0,
      index: 0,
    }),
  );
});

test('persisted native identities reject extra timestamp keys and invalid receipt IDs', async () => {
  for (const mode of ['timestamp', 'operation']) {
    const f = await setup(),
      begin = await f.factory().startBookLoreSourceInspection(f.uid, f.intent);
    if (mode === 'timestamp') f.records.get(f.c.path).context.bookBirth.extra = 'unexpected';
    else {
      const p = await finishSourceInspection(f, begin);
      f.records.get(f.c.path).lastOperationId = 'foreign/path';
      await assert.rejects(() => sourceInspectionMetadata(f, p));
      continue;
    }
    await assert.rejects(() =>
      f.factory().advanceBookLoreSourceInspection(f.uid, inspectionControl(f, begin)),
    );
  }
});

test('restored field-only generation inspection preserves portable missing dates and zero independently of physical dates', async () => {
  for (const portableDates of [{}, { createdAt: 0 }, { updatedAt: 0 }]) {
    const f = await setup({
        mode: 'v2',
        noBase: true,
        fields: { name: 'Restored', category: 'other' },
        dates: { createdAt: 1000, updatedAt: 2000 },
        transform: (storage) => ({ ...storage, portableDates }),
      }),
      done = await finishSourceInspection(f),
      metadata = await sourceInspectionMetadata(f, done);
    assert.deepEqual(metadata.dates, portableDates);
    assert.equal(f.records.get(f.seed.path).updatedAt, 2000);
  }
});
