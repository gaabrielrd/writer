import test from 'node:test';
import assert from 'node:assert/strict';
import { studioDb } from './helpers/studioDb.mjs';
import { workScope } from '../src/workProgressContracts.mjs';
import {
  normalizePersonaCatalogState,
  nextPersonaCatalogState,
} from '../src/personaCatalogProtocol.mjs';
import {
  preparePersonaCatalogWrite,
  readPersonaCatalogFence,
} from '../src/personaCatalogClock.mjs';
import { readLiteraryImpactFence } from '../src/literaryImpactFence.mjs';
import { readLiteraryIntegrationFence } from '../src/literaryIntegrationSources.mjs';
const target = { kind: 'book', id: 'book' };
test('catalog clock is closed, bounded, and preserves missing-vs-invalid state', () => {
  assert.deepEqual(normalizePersonaCatalogState(null), { schemaVersion: 1, revision: 0 });
  assert.deepEqual(nextPersonaCatalogState(null), { schemaVersion: 1, revision: 1 });
  for (const value of [
    { schemaVersion: 1, revision: 0 },
    { schemaVersion: 1, revision: 1, instructions: 'private' },
    { schemaVersion: 2, revision: 1 },
    { schemaVersion: 1, revision: 1.5 },
  ])
    assert.throws(() => normalizePersonaCatalogState(value), TypeError);
  assert.throws(
    () => nextPersonaCatalogState({ schemaVersion: 1, revision: Number.MAX_SAFE_INTEGER }),
    TypeError,
  );
});
test('profile/catalog mutation invalidates impact without touching manuscript semantic fences or credits', async () => {
  const f = studioDb();
  f.records.set('books/book', { authorId: 'author', updatedAt: 1 });
  f.records.set('users/author', { credits: 9 });
  const c = workScope(f.db, 'author', { target }, []);
  const read = () =>
    f.db.runTransaction((tx) => readLiteraryImpactFence(tx, c, { bookIds: ['book'] }));
  const before = await read(),
    semantic = await f.db.runTransaction((tx) => readLiteraryIntegrationFence(tx, c));
  await f.db.runTransaction(async (tx) => {
    const write = await preparePersonaCatalogWrite(tx, f.db, 'author');
    tx.create(f.db.doc('users/author/aiPersonas/custom-new'), { id: 'custom-new', revision: 1 });
    write.commit();
    write.commit();
  });
  assert.notEqual((await read()).token, before.token);
  assert.equal(
    (await f.db.runTransaction((tx) => readLiteraryIntegrationFence(tx, c))).token,
    semantic.token,
  );
  assert.equal(f.records.get('users/author').credits, 9);
  assert.equal(f.records.get('users/author/aiPersonaCatalog/current').revision, 1);
  const fence = await f.db.runTransaction((tx) => readPersonaCatalogFence(tx, f.db, 'author'));
  assert.match(fence.presetDefinition, /^[a-f0-9]{64}$/);
});
test('book persona pointer is a fence input even if updatedAt is unchanged', async () => {
  const f = studioDb();
  f.records.set('books/book', { authorId: 'author', updatedAt: 1, personaId: null });
  const c = workScope(f.db, 'author', { target }, []);
  const first = await f.db.runTransaction((tx) =>
    readLiteraryImpactFence(tx, c, { bookIds: ['book'] }),
  );
  f.records.set('books/book', {
    authorId: 'author',
    updatedAt: 1,
    personaId: 'preset-atmospheric',
  });
  const second = await f.db.runTransaction((tx) =>
    readLiteraryImpactFence(tx, c, { bookIds: ['book'] }),
  );
  assert.notEqual(second.token, first.token);
});
test('retrying with the same transaction object prepares the current catalog revision again', async () => {
  let value = { schemaVersion: 1, revision: 2 },
    writes = [];
  const tx = {
    get: async () => ({ exists: true, data: () => value }),
    set: (_ref, next) => writes.push(next),
  };
  const db = { doc: (path) => ({ path }) };
  const first = await preparePersonaCatalogWrite(tx, db, 'author');
  first.commit();
  value = { schemaVersion: 1, revision: 10 };
  writes = [];
  const retried = await preparePersonaCatalogWrite(tx, db, 'author');
  retried.commit();
  assert.deepEqual(writes, [{ schemaVersion: 1, revision: 11 }]);
});
