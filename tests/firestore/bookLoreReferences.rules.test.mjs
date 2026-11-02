import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { seedBookLoreRead } from '../../functions/test/helpers/bookLoreReadFixture.mjs';
import { seedBookLoreGeneration } from '../../functions/test/helpers/bookLoreGenerationFixture.mjs';
import {
  creationAdoptionFixture,
  adoptCreation,
} from '../../functions/test/helpers/bookLoreCreationAdoptionFixture.mjs';
import { createScenesService } from '../../functions/src/scenes.mjs';
import { createNarrativePlanningService } from '../../functions/src/narrativePlanning.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  uid = 'author',
  target = { kind: 'book', id: 'book' },
  projectId = 'demo-writer-native-lore-references';
let admin, env;
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127[.]0[.]0[.]1:[0-9]+$/.test(address ?? ''))
    throw Error('Dedicated demo loopback emulator required');
  const [host, port] = address.split(':');
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      host,
      port: Number(port),
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
  });
  admin = new Firestore({ projectId, host: address, ssl: false, universeDomain: 'googleapis.com' });
});
beforeEach(async () => {
  await env.clearFirestore();
  await admin.doc('books/book').create({
    authorId: uid,
    title: 'Book',
    status: 'draft',
    createdAt: 100,
    updatedAt: 100,
    wordCount: 0,
    localLoreVersion: 0,
  });
  await admin.doc('users/author').create({ credits: 5 });
});
after(async () => {
  await admin?.terminate();
  await env?.cleanup();
});
function observed(failWritePrefix = null) {
  const reads = [];
  const db = new Proxy(admin, {
    get(object, key) {
      if (key === 'runTransaction')
        return (fn) =>
          object.runTransaction((tx) =>
            fn(
              new Proxy(tx, {
                get(target, member) {
                  const method = target[member];
                  if (typeof method !== 'function') return method;
                  return (...args) => {
                    if (member === 'get' && args[0]?.path) reads.push(args[0].path);
                    if (
                      member === 'set' &&
                      failWritePrefix &&
                      args[0]?.path.includes(failWritePrefix)
                    ) {
                      target.update(admin.doc('rollback/missing'), { fail: true });
                      return target;
                    }
                    return method.apply(target, args);
                  };
                },
              }),
            ),
          );
      const value = object[key];
      return typeof value === 'function' ? value.bind(object) : value;
    },
  });
  return { db, reads };
}
const chunks = (reads) => reads.filter((p) => p.includes('/bookResourceChunks/'));
const itemSource = (item) => ({ kind: item.kind, id: item.id });
async function resources(database = admin) {
  const scenes = createScenesService({ db: database }),
    narrative = createNarrativePlanningService({ db: database }),
    scene = (
      await scenes.createScene(uid, {
        target,
        operationId: 'native-reference-scene-first',
        title: 'Scene',
      })
    ).scene,
    arc = (
      await narrative.createNarrativeItem(uid, {
        target,
        resource: { kind: 'arc' },
        operationId: 'native-reference-arc-first',
        title: 'Arc',
      })
    ).item;
  return { scenes, narrative, scene, arc };
}
async function link(f, ref) {
  await f.scenes.setSceneReference(uid, {
    target,
    sceneId: f.scene.id,
    expectedRevision: 1,
    operationId: 'native-reference-scene-link',
    reference: ref,
  });
  await f.narrative.setNarrativeReference(uid, {
    target,
    source: itemSource(f.arc),
    expectedRevision: 1,
    operationId: 'native-reference-arc-link',
    reference: { kind: 'lore', reference: ref },
  });
}
test('SDK native reference: >8 MiB/128 parts authorize links without chunks and expose certified literal labels', async () => {
  const seed = await seedBookLoreRead(admin, {
    id: 'aria',
    data: { name: '\ufeffAria 🌙', category: 'character', details: '🌙'.repeat(2300000) },
  });
  const o = observed(),
    f = await resources(o.db),
    ref = { kind: 'book', scopeId: 'book', entityId: 'aria' };
  o.reads.length = 0;
  await link(f, ref);
  assert.equal(chunks(o.reads).length, 0);
  assert.ok(seed.base.prepared.manifest.chunkCount > 128);
  const page = await f.scenes.listSceneReferences(uid, { target, sceneId: f.scene.id });
  assert.equal(page.items[0].name, '\ufeffAria 🌙');
  assert.equal(chunks(o.reads).length, seed.base.prepared.manifest.chunkCount);
  assert.equal((await admin.doc('users/author').get()).data().credits, 5);
});
test('SDK native reference: flat labels avoid unselected bodies and logical clock invalidates option cursors', async () => {
  const seed = await seedBookLoreGeneration(admin, {
    id: 'aria',
    noBase: true,
    fields: {
      name: '\ufeffAria 🌙',
      category: 'character',
      details: 'PRIVATE_' + 'x'.repeat(200000),
      aliases: ['PRIVATE_ALIAS'],
      structuredDetails: { notes: 'PRIVATE_NOTES' },
    },
  });
  await seedBookLoreGeneration(admin, {
    id: 'second',
    noBase: true,
    fields: { name: 'Second', category: 'other' },
  });
  const o = observed(),
    f = await resources(o.db),
    ref = { kind: 'book', scopeId: 'book', entityId: 'aria' };
  await link(f, ref);
  assert.equal(
    (await f.narrative.listNarrativeReferences(uid, { target, source: itemSource(f.arc) })).items[0]
      .label,
    '\ufeffAria 🌙',
  );
  const first = await f.narrative.listNarrativeLoreOptions(uid, {
    target,
    scope: 'book',
    limit: 1,
  });
  assert.equal(first.items[0].name, '\ufeffAria 🌙');
  assert.ok(first.nextCursor);
  for (const key of ['details', 'aliases', 'structuredDetails'])
    assert.equal(
      o.reads.some((p) => p.includes(seed.bodies[key].prepared.manifest.bodyId)),
      false,
    );
  await admin.doc('books/book').update({ localLoreVersion: 1 });
  await assert.rejects(
    f.narrative.listNarrativeLoreOptions(uid, { target, scope: 'book', cursor: first.nextCursor }),
  );
});
test('SDK native reference: original creation proof, tombstone denial and removal keep source and counters safe', async () => {
  const creation = await creationAdoptionFixture(admin, {
    changes: [
      { target: { field: 'name' }, value: 'Aria' },
      { target: { field: 'category' }, value: 'character' },
    ],
  });
  await adoptCreation(creation);
  const o = observed(),
    f = await resources(o.db),
    ref = { kind: 'book', scopeId: 'book', entityId: creation.loreId };
  await link(f, ref);
  assert.equal(chunks(o.reads).length, 0);
  assert.equal(
    (await f.narrative.listNarrativeLoreOptions(uid, { target, scope: 'book' })).items[0].name,
    'Aria',
  );
  await admin.doc('books/book/bookLoreTombstones/' + creation.loreId).create({ removed: true });
  o.reads.length = 0;
  const s = await f.scenes.listSceneReferences(uid, { target, sceneId: f.scene.id });
  assert.equal(s.items[0].available, false);
  assert.equal(Object.hasOwn(s.items[0], 'name'), false);
  await assert.rejects(
    f.scenes.setSceneReference(uid, {
      target,
      sceneId: f.scene.id,
      expectedRevision: 2,
      operationId: 'native-reference-denied-link',
      reference: ref,
    }),
    { code: 'permission-denied' },
  );
  await f.scenes.setSceneReference(uid, {
    target,
    sceneId: f.scene.id,
    expectedRevision: 2,
    operationId: 'native-reference-remove-link',
    reference: ref,
    remove: true,
  });
  const removed = await f.narrative.setNarrativeReference(uid, {
    target,
    source: itemSource(f.arc),
    expectedRevision: 2,
    operationId: 'native-reference-remove-item',
    reference: { kind: 'lore', reference: ref },
    remove: true,
  });
  assert.equal(removed.item.referenceCount, 0);
  assert.equal(chunks(o.reads).length, 0);
  assert.equal((await admin.doc('books/book/lore/' + creation.loreId).get()).exists, true);
});
test('SDK native reference: last scene or narrative index failure rolls back source revision, link and receipt', async () => {
  await seedBookLoreGeneration(admin, {
    id: 'aria',
    noBase: true,
    fields: { name: 'Aria', category: 'character' },
  });
  const f = await resources(),
    ref = { kind: 'book', scopeId: 'book', entityId: 'aria' };
  const scene = await admin.doc('books/book/scenes/' + f.scene.id).get(),
    arc = await admin.doc('books/book/arcs/' + f.arc.id).get(),
    root = await admin.doc('books/book').get();
  const s = observed('/sceneLoreLinks/'),
    scenes = createScenesService({ db: s.db });
  await assert.rejects(
    scenes.setSceneReference(uid, {
      target,
      sceneId: f.scene.id,
      expectedRevision: 1,
      operationId: 'native-reference-failed-scene',
      reference: ref,
    }),
  );
  const n = observed('/narrativeLinks/'),
    narrative = createNarrativePlanningService({ db: n.db });
  await assert.rejects(
    narrative.setNarrativeReference(uid, {
      target,
      source: itemSource(f.arc),
      expectedRevision: 1,
      operationId: 'native-reference-failed-item',
      reference: { kind: 'lore', reference: ref },
    }),
  );
  assert.equal((await scene.ref.get()).updateTime.isEqual(scene.updateTime), true);
  assert.equal((await arc.ref.get()).updateTime.isEqual(arc.updateTime), true);
  assert.equal((await root.ref.get()).updateTime.isEqual(root.updateTime), true);
  assert.equal((await admin.collection('books/book/sceneLoreLinks').get()).empty, true);
  assert.equal((await admin.collection('books/book/narrativeLinks').get()).empty, true);
  assert.equal(
    (await admin.doc('users/author/sceneOperations/native-reference-failed-scene').get()).exists,
    false,
  );
  assert.equal(
    (await admin.doc('users/author/narrativeOperations/native-reference-failed-item').get()).exists,
    false,
  );
});
