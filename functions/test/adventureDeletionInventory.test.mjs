import test from 'node:test';
import assert from 'node:assert/strict';
import { adventureDeletionDb } from './helpers/adventureDeletionDb.mjs';
import {
  ADVENTURE_DELETION_LAYOUT as layout,
  ADVENTURE_DELETION_ROOT_COLLECTIONS as roots,
  readAdventureDeletionInventoryPage as page,
  assertAdventureDeletionInventoryEmpty as empty,
} from '../src/adventureDeletionInventory.mjs';
import { ADVENTURE_RESTORE_ROOT_COLLECTIONS as restored } from '../src/adventureRestoreRootCollections.mjs';
const p = { ownerId: 'author', adventureId: 'inventory-deletion-adventure' },
  root = 'adventures/' + p.adventureId;
const index = (scope, collection) =>
  layout.findIndex((v) => v.scope === scope && v.collection === collection);
test('versioned inventory includes all current root collections and known nested authoring families', () => {
  assert.deepEqual([...roots].sort(), [...restored].sort());
  assert.equal(roots.length, 19);
  assert.deepEqual(
    layout.filter((v) => v.scope === 'nested').map((v) => [v.collection, [...v.parents]]),
    [
      ['body', ['scenes', 'sceneBlocks']],
      ['planning', ['scenes']],
      ['references', ['scenes']],
      ['milestones', ['arcs']],
    ],
  );
  assert.ok(Object.isFrozen(layout));
  assert.ok(layout.every(Object.isFrozen));
  assert.ok(Object.isFrozen(roots));
});
test('inventory reads every declared family by metadata even without any root or parent heads', async () => {
  const f = adventureDeletionDb();
  for (const family of layout) {
    if (family.scope === 'root')
      f.records.set(root + '/' + family.collection + '/own', {
        ownerId: p.ownerId,
        adventureId: p.adventureId,
        content: 'PRIVATE_ROOT',
        ...(family.collection === 'workVersions'
          ? { target: { kind: 'adventure', id: p.adventureId } }
          : {}),
      });
    else
      for (const parent of family.parents)
        f.records.set(root + '/' + parent + '/missing/' + family.collection + '/current', {
          content: 'PRIVATE_CHILD',
        });
  }
  f.records.set(root + '-other/scenes/missing/body/current', { content: 'FOREIGN_BODY' });
  f.records.set('books/' + p.adventureId + '/scenes/missing/body/current', {
    content: 'OTHER_KIND',
  });
  const before = structuredClone(f.records);
  let total = 0;
  for (let n = 0; n < layout.length; n++) {
    const result = await f.db.runTransaction((tx) => page(tx, f.db, p, n));
    assert.equal(result.empty, false);
    total += result.documents.length;
    assert.ok(result.documents.every((s) => !JSON.stringify(s.data()).includes('PRIVATE_')));
  }
  assert.equal(total, 24);
  assert.deepEqual(f.records, before);
  assert.ok(
    f.groupReads.every(
      (r) =>
        r.maximum === 25 &&
        r.lower === root + '/!/!' &&
        r.upper === root + '/~/~' &&
        !r.fields.includes('content'),
    ),
  );
  assert.ok(f.reads.every((r) => r.maximum === 25 && !r.fields.includes('content')));
});
test('repeated bounded first pages remove every orphan and preserve the neighboring projects; empty is a separate observation', async () => {
  const f = adventureDeletionDb(),
    foreign = root + '-other/scenes/a/body/current';
  for (let n = 0; n < 53; n++)
    f.records.set(root + '/scenes/missing-' + String(n).padStart(3, '0') + '/body/current', {
      content: 'Own private ' + n,
    });
  f.records.set(foreign, { content: 'Keep this' });
  const batches = [];
  for (;;) {
    const result = await f.db.runTransaction(async (tx) => {
      const result = await page(tx, f.db, p, index('nested', 'body'));
      for (const doc of result.documents) tx.delete(doc.ref);
      return result;
    });
    batches.push(result.documents.length);
    if (result.empty) break;
    assert.ok(batches.length < 10);
  }
  assert.deepEqual(batches, [25, 25, 3, 0]);
  assert.equal(f.records.get(foreign).content, 'Keep this');
  await f.db.runTransaction((tx) => empty(tx, f.db, p));
  assert.equal(f.records.size, 1);
});
test('a document reappearing before prior progress prevents an empty inventory certificate', async () => {
  const f = adventureDeletionDb();
  await f.db.runTransaction((tx) => empty(tx, f.db, p));
  f.records.set(root + '/sceneBlocks/old/body/current', { content: 'Reappeared private body' });
  const before = structuredClone(f.records);
  await assert.rejects(
    () => f.db.runTransaction((tx) => empty(tx, f.db, p)),
    (e) => e.details?.reason === 'adventure-deletion-inventory-inconsistent',
  );
  assert.deepEqual(f.records, before);
});
for (const path of ['parts/part/body/current', 'scenes/scene/extra/item/body/current'])
  test(
    'unexpected nested path is preserved and prevents deletion certification ' + path,
    async () => {
      const f = adventureDeletionDb();
      f.records.set(root + '/' + path, { content: 'Do not guess' });
      const before = structuredClone(f.records);
      await assert.rejects(
        () => f.db.runTransaction((tx) => page(tx, f.db, p, index('nested', 'body'))),
        { code: 'failed-precondition' },
      );
      assert.deepEqual(f.records, before);
    },
  );
for (const patch of [{ ownerId: 'other' }, { adventureId: 'other-adventure' }])
  test(
    'conflicting owned-path metadata is never returned for deletion ' + JSON.stringify(patch),
    async () => {
      const f = adventureDeletionDb();
      f.records.set(root + '/scenes/scene', { ...patch, content: 'Keep corrupt record' });
      const before = structuredClone(f.records);
      await assert.rejects(
        () => f.db.runTransaction((tx) => page(tx, f.db, p, index('root', 'scenes'))),
        { code: 'failed-precondition' },
      );
      assert.deepEqual(f.records, before);
    },
  );
test('history metadata keeps its exact project identity while unrelated nested fields are never selected', async () => {
  const f = adventureDeletionDb(),
    key = root + '/workVersions/version';
  f.records.set(key, {
    target: { kind: 'book', id: p.adventureId, privatePayload: 'DO_NOT_READ' },
    content: 'Private',
  });
  await assert.rejects(
    () => f.db.runTransaction((tx) => page(tx, f.db, p, index('root', 'workVersions'))),
    { code: 'failed-precondition' },
  );
  const read = f.reads.at(-1);
  assert.deepEqual(read.fields, ['ownerId', 'adventureId', 'target.kind', 'target.id']);
  assert.equal(read.fields.includes('target'), false);
});
test('invalid pages and missing group-query support cannot silently skip orphan descendants', async () => {
  const f = adventureDeletionDb(),
    before = structuredClone(f.records);
  for (const [family, size] of [
    [-1, 1],
    [layout.length, 1],
    [0, 0],
    [0, 26],
    [0, 1.5],
  ])
    await assert.rejects(() => f.db.runTransaction((tx) => page(tx, f.db, p, family, size)), {
      code: 'failed-precondition',
    });
  const db = { ...f.db };
  delete db.collectionGroup;
  await assert.rejects(() => f.db.runTransaction((tx) => page(tx, db, p, 0)), {
    code: 'failed-precondition',
  });
  assert.equal(f.groupReads.length, 0);
  assert.deepEqual(f.records, before);
});
test('an incompatible query adapter cannot return another project or exceed the fixed page budget', async () => {
  const f = adventureDeletionDb(),
    bad = {
      exists: true,
      id: 'current',
      ref: { path: 'adventures/foreign/scenes/scene/body/current' },
      data: () => ({}),
    };
  await assert.rejects(
    () =>
      f.db.runTransaction((tx) =>
        page({ ...tx, get: async () => ({ docs: [bad] }) }, f.db, p, 0, 1),
      ),
    { code: 'failed-precondition' },
  );
  await assert.rejects(
    () =>
      f.db.runTransaction((tx) =>
        page({ ...tx, get: async () => ({ docs: [bad, bad] }) }, f.db, p, 0, 1),
      ),
    { code: 'failed-precondition' },
  );
});
