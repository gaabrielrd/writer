import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBookLoreEditTransportService,
  setBookLoreEditHeaders,
} from '../src/bookLoreEditTransport.mjs';
import {
  BOOK_LORE_EDIT_CALLABLE,
  BOOK_LORE_EDIT_ROUTES,
} from '../src/bookLoreEditTransportMethods.mjs';
import { createBookLoreSourceInspectionService } from '../src/bookLoreSourceInspection.mjs';
import { createBookLoreFieldUploadService } from '../src/bookLoreFieldUpload.mjs';
import { createBookLoreEditReservationService } from '../src/bookLoreEditReservation.mjs';
import { createBookLoreReadService } from '../src/bookLoreRead.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import { loreLogicalFixture } from './helpers/bookLoreLogicalFixture.mjs';

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
    inspectionId: createBookLoreSourceInspectionService,
    uploadId: createBookLoreFieldUploadService,
    editId: createBookLoreEditReservationService,
  };
  const all = [];
  assert.equal(BOOK_LORE_EDIT_CALLABLE, 'bookLoreEdit');
  assert.ok(Object.isFrozen(BOOK_LORE_EDIT_ROUTES));
  for (const route of BOOK_LORE_EDIT_ROUTES) {
    assert.ok(Object.isFrozen(route));
    assert.ok(Object.isFrozen(route.methods));
    const service = factories[route.key]({ db: noDb });
    for (const method of route.methods) {
      assert.equal(Object.hasOwn(service, method), true);
      assert.equal(typeof service[method], 'function');
      all.push(method);
    }
  }
  assert.equal(all.length, 18);
  assert.equal(new Set(all).size, 18);
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
  for (const route of BOOK_LORE_EDIT_ROUTES)
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
test('manual endpoint rejects creation and reserved child references before database I/O', async () => {
  for (const input of [
    { editId: id('lore-edit'), creation: null },
    { editId: id('lore-edit'), inspection: { inspectionId: 'analysis-source-' + hash } },
    { editId: id('lore-edit'), fields: { summary: { uploadId: 'analysis-field-' + hash } } },
    { editId: id('lore-edit'), upload: { uploadId: 'analysis-field-' + hash } },
  ])
    await checkInvalid({ method: 'startBookLoreEditReservation', input });
});
for (const route of BOOK_LORE_EDIT_ROUTES)
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
