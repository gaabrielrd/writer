import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBookLoreEditTransportService,
  setBookLoreEditHeaders,
} from '../src/bookLoreEditTransport.mjs';
import {
  BOOK_LORE_EDIT_CALLABLE,
  BOOK_LORE_MANUAL_ROUTES,
  BOOK_LORE_EDIT_ROUTES,
  BOOK_LORE_CREATION_ROUTE,
} from '../src/bookLoreEditTransportMethods.mjs';
import { createBookLoreCreationReservationService } from '../src/bookLoreCreation.mjs';
import { createBookLoreSourceInspectionService } from '../src/bookLoreSourceInspection.mjs';
import { createBookLoreFieldUploadService } from '../src/bookLoreFieldUpload.mjs';
import { createBookLoreEditReservationService } from '../src/bookLoreEditReservation.mjs';
import { createBookLoreReadService } from '../src/bookLoreRead.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import { loreLogicalFixture } from './helpers/bookLoreLogicalFixture.mjs';

import { seedCreationBook, creationFixture } from './helpers/bookLoreCreationFixture.mjs';
import {
  creationUploadFixture,
  finishCreationUploads,
} from './helpers/bookLoreCreationUploadFixture.mjs';
import { uploadAll, sealAll } from './helpers/bookLoreFieldUploadFixture.mjs';
import {
  editReservationIntent,
  editReservationStartHash,
} from '../src/bookLoreEditReservationContracts.mjs';
import { reserveAllEditUploads, editControl } from './helpers/bookLoreEditReservationFixture.mjs';
import { finishCompilation } from './helpers/bookLoreEditCompilationFixture.mjs';

const hash = 'a'.repeat(64);
const id = (prefix) => prefix + '-' + hash;
const noDb = new Proxy(
  {},
  {
    get() {
      throw Error('Unexpected database access');
    },
  },
);
const unopened = createBookLoreEditTransportService({ db: noDb });
const checkInvalid = async (data, uid = 'author') =>
  assert.rejects(unopened.bookLoreEdit(uid, data), { code: 'invalid-argument' });

test('closed wire contract names only own methods in the intended services and is frozen', () => {
  const factories = {
    creationId: createBookLoreCreationReservationService,
    inspectionId: createBookLoreSourceInspectionService,
    uploadId: createBookLoreFieldUploadService,
    editId: createBookLoreEditReservationService,
  };
  const all = [];
  assert.equal(BOOK_LORE_EDIT_CALLABLE, 'bookLoreEdit');
  assert.ok(Object.isFrozen(BOOK_LORE_MANUAL_ROUTES));
  for (const route of BOOK_LORE_MANUAL_ROUTES) {
    assert.ok(Object.isFrozen(route));
    assert.ok(Object.isFrozen(route.methods));
    const service = factories[route.key]({ db: noDb });
    for (const method of route.methods) {
      assert.equal(Object.hasOwn(service, method), true);
      assert.equal(typeof service[method], 'function');
      all.push(method);
    }
  }
  assert.equal(BOOK_LORE_EDIT_ROUTES.flatMap((route) => route.methods).length, 18);
  assert.deepEqual(BOOK_LORE_MANUAL_ROUTES, [BOOK_LORE_CREATION_ROUTE, ...BOOK_LORE_EDIT_ROUTES]);
  assert.equal(all.length, 22);
  assert.equal(new Set(all).size, 22);
});
test('missing or invalid authentication is refused before envelope parsing or database I/O', async () => {
  for (const uid of [undefined, null, '', 42, 'other/account'])
    await assert.rejects(
      unopened.bookLoreEdit(uid, { method: 'PRIVATE', input: { bytes: 'PRIVATE' } }),
      { code: 'unauthenticated' },
    );
});
test('unknown, inherited, internal methods and malformed or extended envelopes never reach a service', async () => {
  for (const data of [
    null,
    [],
    {},
    { method: 'constructor', input: {} },
    { method: 'toString', input: {} },
    { method: '__proto__', input: {} },
    { method: 'adoptPreparedBookLoreEdits', input: {} },
    { method: 'bookLoreEdit', input: {} },
    { method: 'getBookLoreFieldUpload', input: null },
    { method: 'getBookLoreFieldUpload', input: [] },
    { method: 'getBookLoreFieldUpload', input: {}, uid: 'other' },
    { method: 'getBookLoreFieldUpload', input: {}, transaction: {} },
  ])
    await checkInvalid(data);
});
test('every operation rejects foreign or reserved primary IDs, including get/cancel/cleanup', async () => {
  for (const route of BOOK_LORE_MANUAL_ROUTES)
    for (const method of route.methods)
      for (const foreign of [
        'analysis-field-' + hash,
        'analysis-edit-' + hash,
        'analysis-source-' + hash,
        'lore-create-' + hash,
        'lore-field-' + hash + '/child',
        'lore-field-' + hash.toUpperCase(),
      ])
        await checkInvalid({ method, input: { [route.key]: foreign, startHash: hash } });
});
test('manual endpoint rejects malformed creation and reserved child references before database I/O', async () => {
  for (const input of [
    { editId: id('lore-edit'), creation: null },
    { editId: id('lore-edit'), inspection: { inspectionId: 'analysis-source-' + hash } },
    { editId: id('lore-edit'), fields: { summary: { uploadId: 'analysis-field-' + hash } } },
    { editId: id('lore-edit'), upload: { uploadId: 'analysis-field-' + hash } },
  ])
    await checkInvalid({ method: 'startBookLoreEditReservation', input });
});
for (const route of BOOK_LORE_MANUAL_ROUTES.filter((route) => route.key !== 'creationId'))
  test(
    'real ' +
      route.key +
      ' cancel-before-start and metadata stay private and isolated by authenticated UID',
    async () => {
      const f = adventureImportDb({ nativeUpdates: true }),
        service = createBookLoreEditTransportService({ db: f.db }),
        control = { [route.key]: id(route.prefix), startHash: hash },
        get = route.methods.find((m) => m.startsWith('get')),
        cancel = route.methods.find((m) => m.startsWith('cancel'));
      assert.equal(await service.bookLoreEdit('author', { method: get, input: control }), null);
      const result = await service.bookLoreEdit('author', {
        method: cancel,
        input: { ...control, operationId: 'own-cancel' },
      });
      assert.equal(result.progress.phase, 'cancelled');
      assert.equal(result.progress.jobToken, null);
      assert.deepEqual(
        await service.bookLoreEdit('author', { method: get, input: control }),
        result.progress,
      );
      assert.equal(await service.bookLoreEdit('other', { method: get, input: control }), null);
      assert.equal(JSON.stringify(result).includes('bodyId'), false);
      assert.equal(JSON.stringify(result).includes('bytes'), false);
      const snapshot = structuredClone([...f.records]);
      await assert.rejects(
        service.bookLoreEdit('author', { method: get, input: { ...control, ownerId: 'other' } }),
        { code: 'invalid-argument' },
      );
      assert.deepEqual([...f.records], snapshot);
    },
  );
test('real source start uses authenticated owner and current source CAS without opening another account job', async () => {
  const f = adventureImportDb({ nativeUpdates: true }),
    seed = await loreLogicalFixture(f.db, { mode: 'inline' }),
    view = await createBookLoreReadService({ db: f.db }).getBookLoreRead(seed.uid, {
      bookId: seed.bookId,
      id: seed.entityId,
    }),
    service = createBookLoreEditTransportService({ db: f.db }),
    input = {
      bookId: seed.bookId,
      loreId: seed.entityId,
      inspectionId: id('lore-source'),
      sourceToken: view.readToken,
    };
  const before = structuredClone([...f.records]);
  await assert.rejects(
    service.bookLoreEdit('other', { method: 'startBookLoreSourceInspection', input }),
    { code: 'not-found' },
  );
  assert.deepEqual([...f.records], before);
  const p = await service.bookLoreEdit(seed.uid, {
    method: 'startBookLoreSourceInspection',
    input,
  });
  assert.equal(p.inspectionId, input.inspectionId);
  assert.equal(typeof p.jobToken, 'string');
  assert.equal(
    await service.bookLoreEdit('other', {
      method: 'getBookLoreSourceInspection',
      input: { inspectionId: input.inspectionId, startHash: p.startHash, jobToken: p.jobToken },
    }),
    null,
  );
  assert.deepEqual(
    await service.bookLoreEdit(seed.uid, {
      method: 'getBookLoreSourceInspection',
      input: { inspectionId: input.inspectionId, startHash: p.startHash, jobToken: p.jobToken },
    }),
    p,
  );
});
test('cache policy covers this callable only and contains no private data', () => {
  const headers = [],
    request = { rawRequest: { res: { setHeader: (...v) => headers.push(v) } } };
  setBookLoreEditHeaders('bookLoreEdit', request);
  assert.deepEqual(headers, [
    ['Cache-Control', 'private, no-store'],
    ['Vary', 'Authorization'],
  ]);
  setBookLoreEditHeaders('getBookLoreRead', request);
  assert.equal(headers.length, 2);
  setBookLoreEditHeaders('bookLoreEdit', {}); // no HTTP response in direct service callers
});

const throughTransport = (service) =>
  Object.fromEntries(
    BOOK_LORE_MANUAL_ROUTES.flatMap((route) => route.methods).map((method) => [
      method,
      (uid, input) => service.bookLoreEdit(uid, { method, input }),
    ]),
  );
test('manual creation cancel-before-start is permanent, private and metadata-only', async () => {
  const f = adventureImportDb({ nativeUpdates: true });
  const port = throughTransport(createBookLoreEditTransportService({ db: f.db }));
  const input = { bookId: 'book', creationId: id('lore-creation') };
  assert.equal(await port.getBookLoreCreationReservation('author', input), null);
  const closed = await port.cancelBookLoreCreationReservation('author', {
    ...input,
    operationId: 'cancel-before-start',
  });
  assert.equal(closed.phase, 'cancelled');
  assert.equal(closed.jobToken, null);
  const before = structuredClone([...f.records]);
  assert.deepEqual(await port.startBookLoreCreationReservation('author', input), closed);
  assert.deepEqual(await port.getBookLoreCreationReservation('author', input), closed);
  assert.equal(await port.getBookLoreCreationReservation('other', input), null);
  assert.deepEqual([...f.records], before);
  assert.equal(JSON.stringify(closed).includes('bytes'), false);
});

test('manual creation start and cleanup use original identity without a lore head or local clock', async () => {
  const f = adventureImportDb({ nativeUpdates: true });
  await seedCreationBook(f.db);
  const port = throughTransport(createBookLoreEditTransportService({ db: f.db }));
  const input = { bookId: 'book', creationId: id('lore-creation') };
  await assert.rejects(port.startBookLoreCreationReservation('other', input), {
    code: 'failed-precondition',
  });
  const [a, b] = await Promise.all([
    port.startBookLoreCreationReservation('author', input),
    port.startBookLoreCreationReservation('author', input),
  ]);
  assert.deepEqual(a, b);
  const parent = creationFixture(f.db, input);
  parent.factory = () => port;
  const cancelled = await finishCreationUploads(
    parent,
    await port.cancelBookLoreCreationReservation('author', {
      ...input,
      jobToken: a.jobToken,
      operationId: 'cancel-manual-creation',
    }),
  );
  assert.equal(cancelled.phase, 'cancelled');
  assert.equal(f.records.has('books/book/lore/' + a.loreId), false);
  assert.equal(f.records.get('books/book').hasLoreResources, true);
  assert.equal(f.records.get('books/book').localLoreVersion, undefined);
});

test('manual callable creates literal fields and paged relations through native uploads, composition and atomic adoption', async () => {
  const f = adventureImportDb({ nativeUpdates: true });
  await seedCreationBook(f.db);
  const uid = 'author',
    bookId = 'book';
  const port = throughTransport(createBookLoreEditTransportService({ db: f.db, now: () => 3000 }));
  const parent = creationFixture(f.db, { creationId: id('lore-creation') });
  parent.factory = () => port;
  const p = await parent.start(),
    uploads = [],
    fields = {};
  const details = '\ufeff  Literal 🌙\r\n'.repeat(7000);
  const relations = Array.from({ length: 65 }, (_, i) => ({
    targetEntityId: 'target-' + i,
    relationType: '  Knows\r\n',
    ...(i % 2 ? { description: '' } : {}),
  }));
  const changes = [
    { target: { field: 'name' }, value: '\ufeff  Name  ' },
    { target: { field: 'category' }, value: 'other' },
    { target: { field: 'details' }, value: details },
    { target: { field: 'relations', page: 0, count: 64 }, value: relations.slice(0, 64) },
    { target: { field: 'relations', page: 1, count: 1 }, value: relations.slice(64) },
  ];
  for (const [index, change] of changes.entries()) {
    const upload = await creationUploadFixture(f.db, {
      parent,
      uploadId: 'lore-field-' + String(index + 1).repeat(64),
      ...change,
    });
    upload.factory = () => port;
    const progress = await sealAll(upload, await uploadAll(upload));
    const ref = {
      uploadId: upload.uploadId,
      startHash: upload.startHash,
      jobToken: progress.jobToken,
    };
    uploads.push({ ...upload, progress, ref });
    if (change.target.field !== 'relations') fields[change.target.field] = ref;
  }
  const intent = editReservationIntent(uid, {
    bookId,
    loreId: p.loreId,
    editId: id('lore-edit'),
    sourceToken: p.jobToken,
    creation: { creationId: p.creationId, startHash: p.startHash, jobToken: p.jobToken },
    fields,
    relations: { present: true, count: relations.length },
  });
  const edit = {
    uid,
    intent,
    editId: intent.editId,
    uploads,
    startHash: editReservationStartHash(intent),
    factory: () => port,
  };
  const ready = await finishCompilation(edit, await reserveAllEditUploads(edit));
  assert.equal(f.records.has('books/book/lore/' + p.loreId), false);
  const request = editControl(edit, ready, 'adopt-manual-creation');
  const applied = await port.adoptBookLoreEditGeneration(uid, request);
  assert.equal(applied.progress.phase, 'adopted');
  const before = structuredClone([...f.records]);
  assert.deepEqual(await port.adoptBookLoreEditGeneration(uid, request), applied);
  assert.deepEqual([...f.records], before);
  const source = await createBookLoreReadService({ db: f.db }).getBookLoreRead(uid, {
    bookId,
    id: p.loreId,
  });
  assert.equal(source.mode, 'payload');
  const { readBookLoreLogical, createBookLoreLogicalBudget } =
    await import('../src/bookLoreLogicalRead.mjs');
  const logical = await f.db.runTransaction(async (tx) =>
    readBookLoreLogical(
      tx,
      { db: f.db, uid, bookId, path: 'books/book' },
      await tx.get(f.db.doc('books/book/lore/' + p.loreId)),
      createBookLoreLogicalBudget(),
    ),
  );
  assert.equal(logical.data.name, '\ufeff  Name  ');
  assert.equal(logical.data.details, details);
  assert.deepEqual(logical.data.relations, relations);
  assert.equal(Object.hasOwn(logical.data, 'summary'), false);
  assert.equal(Object.hasOwn(logical.data, 'isPublic'), false);
  assert.equal(logical.data.createdAt, logical.data.updatedAt);
  assert.equal(f.records.get('books/book').localLoreVersion, 1);
  assert.equal((await parent.get()).phase, 'adopted');
});

test('creation and child references reject internal namespaces before I/O', async () => {
  for (const [method, input] of [
    ['startBookLoreCreationReservation', { creationId: 'analysis-creation-' + hash }],
    ['getBookLoreCreationReservation', { creationId: 'analysis-creation-' + hash }],
    ['cancelBookLoreCreationReservation', { creationId: 'analysis-creation-' + hash }],
    ['advanceBookLoreCreationCleanup', { creationId: 'analysis-creation-' + hash }],
    [
      'startBookLoreFieldUpload',
      { uploadId: id('lore-field'), creation: { creationId: 'analysis-creation-' + hash } },
    ],
    [
      'startBookLoreEditReservation',
      { editId: id('lore-edit'), creation: { creationId: 'analysis-creation-' + hash } },
    ],
    [
      'startBookLoreSourceInspection',
      { inspectionId: id('lore-source'), creation: { creationId: id('lore-creation') } },
    ],
  ])
    await checkInvalid({ method, input });
});
