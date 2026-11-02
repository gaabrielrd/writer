import test from 'node:test';
import assert from 'node:assert/strict';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import { seedBookLoreRead } from './helpers/bookLoreReadFixture.mjs';
import { seedBookLoreGeneration } from './helpers/bookLoreGenerationFixture.mjs';
import {
  creationAdoptionFixture,
  adoptCreation,
} from './helpers/bookLoreCreationAdoptionFixture.mjs';
import { createScenesService } from '../src/scenes.mjs';
import { createNarrativePlanningService } from '../src/narrativePlanning.mjs';
import { resourcePayloadChunkPath } from '../src/bookResourcePayloadPaths.mjs';
const uid = 'author',
  target = { kind: 'book', id: 'book' },
  data = () => ({
    name: '\ufeffAria 🌙\r\n',
    category: 'character',
    aliases: ['PRIVATE_ALIAS'],
    summary: 'PRIVATE_SUMMARY',
    details: 'PRIVATE_DETAILS',
    structuredDetails: { notes: 'PRIVATE_NOTES' },
  });
const source = (item) => ({ kind: item.kind, id: item.id });
async function fixture(mode = 'v2', fields = {}) {
  const f = adventureImportDb({ nativeUpdates: true });
  await f.db.runTransaction((tx) =>
    tx.create(f.db.doc('books/book'), {
      authorId: uid,
      title: 'Book',
      status: 'draft',
      createdAt: 100,
      updatedAt: 100,
      wordCount: 0,
      localLoreVersion: 0,
    }),
  );
  const scenes = createScenesService({ db: f.db, now: () => 3000 }),
    narrative = createNarrativePlanningService({ db: f.db, now: () => 3000 });
  const scene = (
    await scenes.createScene(uid, {
      target,
      operationId: 'reference-test-scene-first',
      title: 'Scene',
    })
  ).scene;
  const arc = (
    await narrative.createNarrativeItem(uid, {
      target,
      resource: { kind: 'arc' },
      operationId: 'reference-test-arc-first',
      title: 'Arc',
    })
  ).item;
  let seed,
    id = 'aria';
  if (mode === 'created') {
    const creation = await creationAdoptionFixture(f.db, {
      bookId: 'book',
      changes: Object.entries({ ...data(), ...fields }).map(([field, value]) => ({
        target: { field },
        value,
      })),
    });
    await adoptCreation(creation);
    seed = creation.source.seed;
    id = creation.loreId;
  } else if (mode === 'v2')
    seed = await seedBookLoreGeneration(f.db, {
      id,
      noBase: true,
      fields: { ...data(), ...fields },
    });
  else
    seed = await seedBookLoreRead(f.db, {
      id,
      inline: mode === 'inline',
      data: { ...data(), ...fields },
    });
  const events = [],
    run = f.db.runTransaction.bind(f.db);
  f.db.runTransaction = (fn) =>
    run((tx) =>
      fn(
        new Proxy(tx, {
          get(object, key) {
            const method = object[key];
            if (typeof method !== 'function') return method;
            return (...args) => {
              if (['get', 'getAll', 'create', 'set', 'update', 'delete'].includes(key))
                events.push({ method: key, path: args[0]?.path });
              return method.apply(object, args);
            };
          },
        }),
      ),
    );
  const ref = { kind: 'book', scopeId: 'book', entityId: id };
  const linkScene = (extra = {}) =>
    scenes.setSceneReference(uid, {
      target,
      sceneId: scene.id,
      expectedRevision: 1,
      operationId: 'reference-test-scene-reference',
      reference: ref,
      ...extra,
    });
  const linkItem = (extra = {}) =>
    narrative.setNarrativeReference(uid, {
      target,
      source: source(arc),
      expectedRevision: 1,
      operationId: 'reference-test-arc-reference',
      reference: { kind: 'lore', reference: ref },
      ...extra,
    });
  const listScene = () => scenes.listSceneReferences(uid, { target, sceneId: scene.id });
  const listItem = () => narrative.listNarrativeReferences(uid, { target, source: source(arc) });
  const options = (extra) =>
    narrative.listNarrativeLoreOptions(uid, { target, scope: 'book', ...extra });
  return {
    ...f,
    events,
    scenes,
    narrative,
    scene,
    arc,
    seed,
    id,
    ref,
    linkScene,
    linkItem,
    listScene,
    listItem,
    options,
  };
}
const chunks = (f) => f.events.filter((e) => e.path?.includes('/bookResourceChunks/'));
async function index(f) {
  for (let i = 0; i < 20; i++)
    if (
      (
        await f.narrative.prepareEntitySceneIndex(uid, {
          target,
          operationId: 'reference-test-index-first',
          limit: 50,
        })
      ).complete
    )
      return;
  assert.fail('Index not complete');
}
for (const mode of ['inline', 'v1', 'v2', 'created'])
  test(mode + ' references resolve literal labels and retain only IDs on links', async () => {
    const f = await fixture(mode);
    await f.linkScene();
    await f.linkItem();
    await index(f);
    assert.equal(chunks(f).length, 0);
    assert.equal((await f.listScene()).items[0].name, data().name);
    assert.equal((await f.listItem()).items[0].label, data().name);
    assert.equal((await f.options()).items[0].category, 'character');
    assert.equal(JSON.stringify(await f.options()).includes('PRIVATE_'), false);
    for (const [path, value] of f.records)
      if (path.includes('/references/') || path.includes('/narrativeLinks/'))
        assert.equal(JSON.stringify(value).includes(data().name), false);
    f.events.length = 0;
    assert.equal(
      (await f.narrative.listEntityScenes(uid, { target, reference: f.ref })).items[0].available,
      true,
    );
    assert.equal(
      (await f.narrative.listEntityNarrativeItems(uid, { target, reference: f.ref })).items.length,
      1,
    );
    assert.equal(chunks(f).length, 0);
  });
test('v2 labels do not fetch unselected details/aliases/notes and reference writes do not fetch chunks', async () => {
  const f = await fixture('v2', {
    details: '🌙'.repeat(2300000),
    aliases: Array(10000).fill('PRIVATE_ALIAS'),
  });
  await f.linkScene();
  await f.linkItem();
  assert.equal(chunks(f).length, 0);
  await f.listScene();
  await f.listItem();
  await f.options();
  for (const key of ['details', 'aliases', 'structuredDetails', 'summary'])
    assert.equal(
      f.events.some((e) => e.path?.includes(f.seed.bodies[key].prepared.manifest.bodyId)),
      false,
    );
});
test('v1 greater than 8 MiB/128 parts can be linked without downloading prose and labels are certified in flow', async () => {
  const f = await fixture('v1', { details: '🌙'.repeat(2300000) });
  await f.linkScene();
  await f.linkItem();
  assert.equal(chunks(f).length, 0);
  assert.ok(f.seed.base.prepared.manifest.chunkCount > 128);
  assert.equal((await f.listScene()).items[0].name, data().name);
  assert.equal(chunks(f).length, f.seed.base.prepared.manifest.chunkCount);
});
for (const change of [
  'deleted',
  'deleting',
  'rebalancing',
  'tombstone',
  'owner',
  'scope',
  'missing',
])
  test(
    change + ' origin hides labels, denies additions, and still permits explicit removals',
    async () => {
      const f = await fixture();
      await f.linkScene();
      await f.linkItem();
      const path = 'books/book/lore/' + f.id;
      if (['deleted', 'deleting', 'rebalancing'].includes(change))
        f.records.get(path)[change] = true;
      if (change === 'tombstone')
        f.records.set('books/book/bookLoreTombstones/' + f.id, { removed: true });
      if (change === 'owner') f.records.get(path).ownerId = 'other';
      if (change === 'scope') f.records.get(path).bookId = 'other';
      if (change === 'missing') f.records.delete(path);
      const before = structuredClone([...f.records]);
      await assert.rejects(
        f.linkScene({ expectedRevision: 2, operationId: 'reference-test-scene-reference-new' }),
        { code: 'permission-denied' },
      );
      await assert.rejects(
        f.linkItem({ expectedRevision: 2, operationId: 'reference-test-arc-reference-new' }),
        {
          code: 'permission-denied',
        },
      );
      assert.deepEqual([...f.records], before);
      const sc = (await f.listScene()).items[0],
        nar = (await f.listItem()).items[0];
      assert.equal(sc.available, false);
      assert.equal(Object.hasOwn(sc, 'name'), false);
      assert.equal(nar.available, false);
      assert.equal(Object.hasOwn(nar, 'label'), false);
      assert.equal((await f.options()).items.length, 0);
      assert.equal(chunks(f).length, 0);
      await f.linkScene({
        remove: true,
        expectedRevision: 2,
        operationId: 'reference-test-scene-reference-remove',
      });
      await f.linkItem({
        remove: true,
        expectedRevision: 2,
        operationId: 'reference-test-arc-reference-remove',
      });
      assert.equal((await f.listScene()).items.length, 0);
      assert.equal((await f.listItem()).items.length, 0);
    },
  );
test('a corrupt base header blocks reference writes atomically instead of fallback or unavailable labels', async () => {
  const f = await fixture('v1'),
    body = f.records.get(f.seed.base.path);
  body.ownerId = 'other';
  const before = structuredClone([...f.records]);
  await assert.rejects(f.linkScene());
  await assert.rejects(f.linkItem());
  await assert.rejects(f.options());
  assert.deepEqual([...f.records], before);
  assert.equal(chunks(f).length, 0);
});
test('a recreated creation head cannot be linked or labeled even with its old data', async () => {
  const f = await fixture('created'),
    path = 'books/book/lore/' + f.id,
    value = structuredClone(f.records.get(path));
  await f.db.runTransaction((tx) => tx.delete(f.db.doc(path)));
  await f.db.runTransaction((tx) => tx.create(f.db.doc(path), value));
  const before = structuredClone([...f.records]);
  await assert.rejects(f.linkScene());
  await assert.rejects(f.linkItem());
  await assert.rejects(f.options());
  assert.deepEqual([...f.records], before);
  assert.equal(chunks(f).length, 0);
});
test('large names do not prevent authorization-only links but labels fail explicitly without truncation', async () => {
  const f = await fixture('v2', { name: 'N'.repeat(910000) });
  await f.linkScene();
  await f.linkItem();
  assert.equal(chunks(f).length, 0);
  const before = structuredClone([...f.records]);
  for (const list of [f.listScene, f.listItem, f.options])
    await assert.rejects(list(), { code: 'resource-exhausted' });
  assert.deepEqual([...f.records], before);
});
test('label retention is shared by the page and a second label cannot publish a partial first item', async () => {
  const f = await fixture('v2', { name: 'N'.repeat(460000) });
  await f.linkScene();
  await f.linkItem();
  await seedBookLoreGeneration(f.db, {
    id: 'second',
    noBase: true,
    fields: { name: 'M'.repeat(460000), category: 'other' },
  });
  const ref = { kind: 'book', scopeId: 'book', entityId: 'second' };
  await f.linkScene({
    reference: ref,
    expectedRevision: 2,
    operationId: 'reference-test-scene-reference-second',
  });
  await f.linkItem({
    reference: { kind: 'lore', reference: ref },
    expectedRevision: 2,
    operationId: 'reference-test-arc-reference-second',
  });
  const before = structuredClone([...f.records]);
  for (const list of [f.listScene, f.listItem, f.options])
    await assert.rejects(list(), { code: 'resource-exhausted' });
  assert.deepEqual([...f.records], before);
});
test('logical label parsing validates bytes after a usable prefix and returns no partial list on corruption', async () => {
  const f = await fixture('v1', { details: 'x'.repeat(160000) });
  await f.linkScene();
  await f.linkItem();
  const manifest = f.seed.base.prepared.manifest;
  f.records.get(resourcePayloadChunkPath('book', manifest.bodyId, manifest.chunkCount - 1)).bytes =
    'AAAA';
  const before = structuredClone([...f.records]);
  for (const list of [f.listScene, f.listItem, f.options]) await assert.rejects(list());
  assert.deepEqual([...f.records], before);
});
test('option and scene-reference cursors reject clock changes while dates and scene revisions stay equal', async () => {
  const f = await fixture();
  await f.linkScene();
  await f.linkItem();
  await seedBookLoreGeneration(f.db, {
    id: 'second',
    noBase: true,
    fields: { name: 'Second', category: 'other' },
  });
  await f.linkScene({
    reference: { ...f.ref, entityId: 'second' },
    expectedRevision: 2,
    operationId: 'reference-test-scene-reference-second',
  });
  const opts = await f.options({ limit: 1 });
  const page = await f.scenes.listSceneReferences(uid, { target, sceneId: f.scene.id, limit: 1 });
  assert.ok(opts.nextCursor);
  assert.ok(page.nextCursor);
  f.records.get('books/book').localLoreVersion++;
  await assert.rejects(f.options({ cursor: opts.nextCursor }));
  await assert.rejects(
    f.scenes.listSceneReferences(uid, { target, sceneId: f.scene.id, cursor: page.nextCursor }),
  );
});
test('inverse cursors reject submillisecond native head changes without reading names or details', async () => {
  const f = await fixture();
  await f.linkScene();
  await f.linkItem();
  const otherScene = (
    await f.scenes.createScene(uid, {
      target,
      operationId: 'reference-test-scene-second',
      title: 'Other scene',
    })
  ).scene;
  await f.linkScene({
    sceneId: otherScene.id,
    operationId: 'reference-test-scene-second-reference',
  });
  const other = (
    await f.narrative.createNarrativeItem(uid, {
      target,
      resource: { kind: 'arc' },
      operationId: 'reference-test-arc-second',
      title: 'Other arc',
    })
  ).item;
  await f.linkItem({ source: source(other), operationId: 'reference-test-arc-second-reference' });
  await index(f);
  const a = await f.narrative.listEntityNarrativeItems(uid, { target, reference: f.ref, limit: 1 });
  const b = await f.narrative.listEntityScenes(uid, { target, reference: f.ref, limit: 1 });
  assert.ok(a.nextCursor);
  assert.ok(b.nextCursor);
  const path = 'books/book/lore/' + f.id,
    stamp = f.metadata.get(path);
  f.metadata.set(path, { ...stamp, updatedAtNanoseconds: stamp.updatedAtNanoseconds + 1 });
  f.events.length = 0;
  await assert.rejects(
    f.narrative.listEntityNarrativeItems(uid, { target, reference: f.ref, cursor: a.nextCursor }),
    { code: 'failed-precondition' },
  );
  await assert.rejects(
    f.narrative.listEntityScenes(uid, { target, reference: f.ref, cursor: b.nextCursor }),
    { code: 'failed-precondition' },
  );
  assert.equal(chunks(f).length, 0);
});
test('book recreation with matching logical clocks invalidates option cursors by native root identity', async () => {
  const f = await fixture();
  await seedBookLoreGeneration(f.db, {
    id: 'second',
    noBase: true,
    fields: { name: 'Second', category: 'other' },
  });
  const page = await f.options({ limit: 1 });
  assert.ok(page.nextCursor);
  const stamp = f.metadata.get('books/book');
  f.metadata.set('books/book', {
    ...stamp,
    createdAtNanoseconds: stamp.createdAtNanoseconds + 100,
  });
  await assert.rejects(f.options({ cursor: page.nextCursor }), { code: 'failed-precondition' });
});

test('infrastructure failure remains an error and never becomes an unavailable or partially labeled origin', async () => {
  const f = await fixture('v1'),
    failure = Object.assign(new Error('Temporary storage failure'), { code: 'unavailable' });
  const run = f.db.runTransaction.bind(f.db);
  f.db.runTransaction = (operation) =>
    run((tx) =>
      operation(
        new Proxy(tx, {
          get(object, member) {
            if (member === 'get')
              return (ref, ...args) => {
                if (ref.path === f.seed.base.path) throw failure;
                return object.get(ref, ...args);
              };
            const value = object[member];
            return typeof value === 'function' ? value.bind(object) : value;
          },
        }),
      ),
    );
  const before = structuredClone([...f.records]);
  for (const call of [f.linkScene, f.linkItem, f.options])
    await assert.rejects(call(), (error) => error === failure);
  assert.deepEqual([...f.records], before);
});
