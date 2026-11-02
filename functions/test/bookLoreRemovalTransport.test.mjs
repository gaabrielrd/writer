import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBookLoreRemovalTransportService,
  setBookLoreRemovalHeaders,
} from '../src/bookLoreRemovalTransport.mjs';
import {
  BOOK_LORE_REMOVAL_CALLABLE,
  BOOK_LORE_REMOVAL_ROUTES,
} from '../src/bookLoreRemovalTransportMethods.mjs';
import {
  BOOK_LORE_EDIT_ROUTES,
  BOOK_LORE_MANUAL_ROUTES,
} from '../src/bookLoreEditTransportMethods.mjs';
import { createBookLoreEditTransportService } from '../src/bookLoreEditTransport.mjs';
import { createBookLoreSourceInspectionService } from '../src/bookLoreSourceInspection.mjs';
import { createBookLoreRemovalService } from '../src/bookLoreRemoval.mjs';
import { removalStartHash } from '../src/bookLoreRemovalContracts.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import {
  sourceInspectionFixture,
  inspectionControl,
} from './helpers/bookLoreSourceInspectionFixture.mjs';

const hash = 'a'.repeat(64),
  id = (prefix) => prefix + '-' + hash;
const noDb = new Proxy(
  {},
  {
    get() {
      throw Error('Unexpected database access');
    },
  },
);
const unopened = createBookLoreRemovalTransportService({ db: noDb });
const invalid = (method, input) =>
  assert.rejects(unopened.bookLoreRemoval('author', { method, input }), {
    code: 'invalid-argument',
  });
test('dedicated frozen contract has exactly seven native methods and preserves old allowlists', () => {
  assert.equal(BOOK_LORE_REMOVAL_CALLABLE, 'bookLoreRemoval');
  const all = [];
  for (const route of BOOK_LORE_REMOVAL_ROUTES) {
    assert.ok(Object.isFrozen(route));
    assert.ok(Object.isFrozen(route.methods));
    const factory =
      route.key === 'inspectionId'
        ? createBookLoreSourceInspectionService
        : createBookLoreRemovalService;
    const service = factory({ db: noDb });
    for (const method of route.methods) {
      assert.equal(Object.hasOwn(service, method), true);
      assert.equal(typeof service[method], 'function');
      all.push(method);
    }
  }
  assert.ok(Object.isFrozen(BOOK_LORE_REMOVAL_ROUTES));
  assert.equal(all.length, 7);
  assert.equal(new Set(all).size, 7);
  assert.equal(BOOK_LORE_EDIT_ROUTES.flatMap((r) => r.methods).length, 18);
  assert.equal(BOOK_LORE_MANUAL_ROUTES.flatMap((r) => r.methods).length, 22);
});
test('missing Auth is rejected before parsing or database access', async () => {
  for (const uid of [undefined, null, '', 42, 'other/account'])
    await assert.rejects(unopened.bookLoreRemoval(uid, null), { code: 'unauthenticated' });
});
test('unknown, inherited, internal and malformed envelopes never reach a service', async () => {
  for (const data of [
    null,
    [],
    {},
    { method: 'constructor', input: {} },
    { method: '__proto__', input: {} },
    { method: 'toString', input: {} },
    { method: 'adoptBookLoreEditGeneration', input: {} },
    { method: 'bookLoreRemoval', input: {} },
    { method: 'getBookLoreRemoval', input: null },
    { method: 'getBookLoreRemoval', input: [] },
    { method: 'getBookLoreRemoval', input: {}, uid: 'other' },
    { method: 'getBookLoreRemoval', input: {}, transaction: {} },
  ])
    await assert.rejects(unopened.bookLoreRemoval('author', data), { code: 'invalid-argument' });
});
test('every method refuses other namespaces, path IDs, upper-case hashes and malformed references', async () => {
  for (const route of BOOK_LORE_REMOVAL_ROUTES)
    for (const method of route.methods)
      for (const foreign of [
        id('analysis-source'),
        id('analysis-removal'),
        id('lore-source'),
        id('lore-edit'),
        id('lore-creation'),
        id(route.prefix) + '/child',
        route.prefix + '-' + hash.toUpperCase(),
        id(route.key === 'inspectionId' ? 'lore-removal' : 'lore-removal-source'),
      ])
        await invalid(method, { [route.key]: foreign, startHash: hash });
  for (const inspection of [
    null,
    {},
    { inspectionId: id('lore-source') },
    { inspectionId: id('analysis-source') },
  ])
    await invalid('startBookLoreRemoval', { removalId: id('lore-removal'), inspection });
});
test('native request parsers refuse caller authority and prose before database access', async () => {
  for (const extra of ['uid', 'ownerId', 'createdAt', 'text', 'cursor'])
    await invalid('startBookLoreSourceInspection', {
      bookId: 'book',
      loreId: 'entity',
      inspectionId: id('lore-removal-source'),
      sourceToken: hash,
      [extra]: 'PRIVATE_PROSE',
    });
  await invalid('startBookLoreRemoval', {
    bookId: 'book',
    loreId: 'entity',
    removalId: id('lore-removal'),
    sourceToken: hash,
    inspection: { inspectionId: id('lore-removal-source'), startHash: hash, jobToken: hash },
    uid: 'other',
  });
});
test('edition endpoint cannot get, advance or cancel a removal inspection', async () => {
  const edit = createBookLoreEditTransportService({ db: noDb });
  for (const method of BOOK_LORE_REMOVAL_ROUTES[0].methods)
    await assert.rejects(
      edit.bookLoreEdit('author', {
        method,
        input: {
          inspectionId: id('lore-removal-source'),
          startHash: hash,
        },
      }),
      { code: 'invalid-argument' },
    );
});
test('no-store headers are scoped to the removal endpoint without leaking control data', () => {
  const headers = [],
    request = { rawRequest: { res: { setHeader: (...v) => headers.push(v) } } };
  setBookLoreRemovalHeaders('bookLoreRemoval', request);
  assert.deepEqual(headers, [
    ['Cache-Control', 'private, no-store'],
    ['Vary', 'Authorization'],
  ]);
  setBookLoreRemovalHeaders('bookLoreEdit', request);
  assert.equal(headers.length, 2);
  setBookLoreRemovalHeaders('bookLoreRemoval', {});
});

async function fixture(mode) {
  const f = adventureImportDb({ nativeUpdates: true });
  const source = await sourceInspectionFixture(f.db, {
    mode,
    inspectionId: id('lore-removal-source'),
    data: {
      name: 'PRIVATE_PROSE',
      category: 'other',
      details: 'PRIVATE_PROSE'.repeat(15000),
      isPublic: true,
      createdAt: 1000,
      updatedAt: 1001,
    },
  });
  const service = createBookLoreRemovalTransportService({ db: f.db, now: () => 3000 });
  const call = (method, input, uid = source.uid) => service.bookLoreRemoval(uid, { method, input });
  const inspect = async () => {
    let p = await call('startBookLoreSourceInspection', source.intent);
    for (let i = 0; !p.ready && i < 1000; i++)
      p = (await call('advanceBookLoreSourceInspection', inspectionControl(source, p))).progress;
    assert.equal(p.ready, true);
    assert.equal(JSON.stringify(p).includes('PRIVATE_PROSE'), false);
    return p;
  };
  return { ...f, source, call, inspect };
}
for (const mode of ['inline', 'v1', 'v2'])
  test(
    'native ' +
      mode +
      ' inspection is non-destructive; explicit withdrawal is exactly-once and resumable',
    async () => {
      const f = await fixture(mode),
        before = f.records.get('books/book').localLoreVersion;
      const ready = await f.inspect();
      assert.equal(f.records.has(f.source.seed.path), true);
      assert.equal(f.records.get('books/book').localLoreVersion, before);
      const intent = {
        bookId: 'book',
        loreId: 'entity',
        removalId: id('lore-removal'),
        sourceToken: f.source.view.readToken,
        inspection: {
          inspectionId: ready.inspectionId,
          startHash: ready.startHash,
          jobToken: ready.jobToken,
        },
      };
      const control = { removalId: intent.removalId, startHash: removalStartHash(intent) };
      await assert.rejects(f.call('startBookLoreRemoval', intent, 'other'));
      assert.equal(f.records.has(f.source.seed.path), true);
      const p = await f.call('startBookLoreRemoval', intent); // Simulate accepted start with lost response.
      assert.equal(p.removed, true);
      assert.equal(f.records.has(f.source.seed.path), false);
      assert.equal(f.records.get('books/book').localLoreVersion, before + 1);
      assert.equal(await f.call('getBookLoreRemoval', control, 'other'), null);
      assert.deepEqual(await f.call('getBookLoreRemoval', control), p);
      assert.deepEqual(await f.call('startBookLoreRemoval', intent), p);
      const wire = {
        ...control,
        jobToken: p.jobToken,
        expectedRevision: p.revision,
        operationId: 'advance-own-0001',
      };
      const next = await f.call('advanceBookLoreRemoval', wire);
      assert.deepEqual(await f.call('advanceBookLoreRemoval', wire), next);
      let current = next.progress;
      for (let i = 0; !current.complete && i < 10000; i++)
        current = (
          await f.call('advanceBookLoreRemoval', {
            ...control,
            jobToken: current.jobToken,
            expectedRevision: current.revision,
            operationId: 'advance-own-' + current.revision,
          })
        ).progress;
      assert.equal(current.complete, true);
      assert.equal(f.records.get('books/book').localLoreVersion, before + 1);
      assert.equal(f.records.has('books/book/bookLoreTombstones/entity'), true);
      assert.equal(f.records.has('books/book'), true);
      assert.deepEqual(await f.call('getBookLoreRemoval', control), current);
      assert.equal(JSON.stringify(current).includes('PRIVATE_PROSE'), false);
    },
  );
test('cancelled removal inspection preserves the head and prevents withdrawal', async () => {
  const f = await fixture('inline'),
    ready = await f.inspect();
  await f.call('cancelBookLoreSourceInspection', {
    inspectionId: ready.inspectionId,
    startHash: ready.startHash,
    jobToken: ready.jobToken,
    operationId: 'cancel-before-withdrawal',
  });
  await assert.rejects(
    f.call('startBookLoreRemoval', {
      bookId: 'book',
      loreId: 'entity',
      removalId: id('lore-removal'),
      sourceToken: f.source.view.readToken,
      inspection: {
        inspectionId: ready.inspectionId,
        startHash: ready.startHash,
        jobToken: ready.jobToken,
      },
    }),
  );
  assert.equal(f.records.has(f.source.seed.path), true);
  assert.equal(f.records.has('books/book/bookLoreTombstones/entity'), false);
});
test('source changed after inspection is never silently replaced by the current head', async () => {
  const f = await fixture('inline'),
    ready = await f.inspect();
  await f.db.runTransaction(async (tx) => {
    tx.update(f.db.doc(f.source.seed.path), { summary: 'NEW PRIVATE TEXT', updatedAt: 4000 });
  });
  await assert.rejects(
    f.call('startBookLoreRemoval', {
      bookId: 'book',
      loreId: 'entity',
      removalId: id('lore-removal'),
      sourceToken: f.source.view.readToken,
      inspection: {
        inspectionId: ready.inspectionId,
        startHash: ready.startHash,
        jobToken: ready.jobToken,
      },
    }),
  );
  assert.equal(f.records.get(f.source.seed.path).summary, 'NEW PRIVATE TEXT');
  assert.equal(f.records.has('books/book/bookLoreTombstones/entity'), false);
});
