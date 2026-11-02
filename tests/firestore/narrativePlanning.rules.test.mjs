import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  updateDoc,
  writeBatch,
  deleteField,
} from 'firebase/firestore';
import { createNarrativePlanningService } from '../../functions/src/narrativePlanning.mjs';
import { createScenesService } from '../../functions/src/scenes.mjs';
import { digest } from '../../functions/src/narrativeContracts.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url));
const { Firestore } = requireFunctions('firebase-admin/firestore');
const projectId = 'demo-writer-narrative-tests',
  target = { kind: 'book', id: 'book' },
  op = (n) => `narrative-emulator-operation-${n}`;
const previousMetadata = process.env.METADATA_SERVER_DETECTION;
let environment, admin, api, scenes;
const client = (uid = 'author') =>
  uid
    ? environment.authenticatedContext(uid).firestore()
    : environment.unauthenticatedContext().firestore();
before(async () => {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  if (!host) throw Error('Use somente emulador demo.');
  process.env.METADATA_SERVER_DETECTION = 'none';
  const [hostname, port] = host.split(':');
  environment = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: hostname,
      port: Number(port),
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
  });
  admin = new Firestore({ projectId, host, ssl: false, universeDomain: 'googleapis.com' });
  api = createNarrativePlanningService({ db: admin });
  scenes = createScenesService({ db: admin });
});
beforeEach(async () => {
  await environment.clearFirestore();
  await admin.doc('books/book').set({
    authorId: 'author',
    title: 'Livro',
    status: 'draft',
    updatedAt: 100,
    createdAt: 1,
    wordCount: 2,
  });
  await admin.doc('books/book/chapters/legacy').set({
    title: 'Original',
    content: 'Texto original',
    order: 1,
    wordCount: 2,
    updatedAt: 100,
    createdAt: 1,
  });
  await admin
    .doc('adventures/adventure')
    .set({ ownerId: 'author', title: 'Aventura', status: 'draft', updatedAt: 100, createdAt: 1 });
  await admin
    .doc('books/book/lore/entity')
    .set({ name: 'Aurora', category: 'character', details: 'Segredo lore' });
});
after(async () => {
  await admin?.terminate();
  await environment?.cleanup();
  if (previousMetadata === undefined) delete process.env.METADATA_SERVER_DETECTION;
  else process.env.METADATA_SERVER_DETECTION = previousMetadata;
});
const create = (n, kind = 'arc', extra = {}) =>
  api.createNarrativeItem('author', {
    target,
    resource: { kind },
    operationId: op(n),
    title: `Item ${n}`,
    ...extra,
  });
const source = (item) => ({
  kind: item.kind,
  id: item.id,
  ...(item.kind === 'milestone' ? { arcId: item.arcId } : {}),
});
async function finish(call) {
  for (let n = 0; n < 500; n++) {
    const value = await call();
    if (value.complete) return value;
  }
  assert.fail('Job did not finish');
}

test('SDK narrative resources are private, lists bounded, mutations/index/controls/receipts server-only for book and adventure', async () => {
  const arc = await create(1, 'arc', { initialState: 'Plano privado' });
  const milestone = await api.createNarrativeItem('author', {
    target,
    resource: { kind: 'milestone', arcId: arc.item.id },
    operationId: op(2),
    title: 'Marco',
  });
  const adventure = { kind: 'adventure', id: 'adventure' };
  const event = await api.createNarrativeItem('author', {
    target: adventure,
    resource: { kind: 'event' },
    operationId: op(3),
    title: 'Acontecimento',
  });
  for (const path of [
    `books/book/arcs/${arc.item.id}`,
    `books/book/arcs/${arc.item.id}/milestones/${milestone.item.id}`,
    `adventures/adventure/timelineEvents/${event.item.id}`,
  ]) {
    assert.equal((await assertSucceeds(getDoc(doc(client(), path)))).exists(), true);
    await assertFails(getDoc(doc(client('intruder'), path)));
    await assertFails(getDoc(doc(client(null), path)));
    await assertFails(updateDoc(doc(client(), path), { title: 'Cliente antigo' }));
  }
  await assertSucceeds(getDocs(query(collection(client(), 'books/book/arcs'), limit(50))));
  await assertFails(getDocs(collection(client(), 'books/book/arcs')));
  await assertFails(getDocs(query(collection(client(), 'books/book/arcs'), limit(51))));
  for (const path of [
    'books/book/narrativeControls/private',
    'books/book/narrativeJobs/private',
    'books/book/sceneLoreLinks/private',
    `users/author/narrativeOperations/${op(1)}`,
  ]) {
    await assertFails(getDoc(doc(client(), path)));
    await assertFails(setDoc(doc(client(), path), { value: 'forjado' }));
  }
  assert.equal(await api.getNarrativeItem('intruder', { target, source: source(arc.item) }), null);
  assert.equal(await api.getNarrativeContext('intruder', { target }), null);
});
test('narrative-only marker blocks legacy finish and omission while retaining permitted book metadata updates', async () => {
  const arc = await create(1);
  const own = client();
  await assertSucceeds(
    updateDoc(doc(own, 'books/book'), { title: 'Título permitido', updatedAt: 200 }),
  );
  await assertFails(updateDoc(doc(own, 'books/book'), { hasNarrativeResources: deleteField() }));
  await assertFails(updateDoc(doc(own, 'books/book'), { narrativeRevision: 0 }));
  await assertFails(
    setDoc(doc(own, 'books/book'), {
      authorId: 'author',
      title: 'Set antigo',
      status: 'draft',
      wordCount: 2,
      createdAt: 1,
      updatedAt: 200,
    }),
  );
  await assertFails(
    setDoc(doc(own, 'books/forged'), {
      authorId: 'author',
      title: 'Forjado',
      status: 'draft',
      createdAt: 1,
      updatedAt: 1,
      hasNarrativeResources: true,
      narrativeRevision: 1,
    }),
  );
  await assertSucceeds(
    updateDoc(doc(own, 'books/book'), { deleting: true, status: 'draft', updatedAt: 300 }),
  );
  const batch = writeBatch(own);
  batch.set(doc(own, 'deletedBooks/book'), { deletedAt: 300 });
  batch.delete(doc(own, 'books/book'));
  await assertFails(batch.commit());
  await assertFails(getDoc(doc(own, `books/book/arcs/${arc.item.id}`)));
  await finish(() => scenes.deleteSceneBook('author', { target, operationId: op(10), limit: 2 }));
  assert.equal((await admin.doc('books/book').get()).exists, false);
  assert.equal((await admin.doc(`books/book/arcs/${arc.item.id}`).get()).exists, false);
  assert.equal((await admin.doc('deletedBooks/book').get()).exists, true);
});
test('real concurrent creation and CAS produce one item/receipt and exactly one winning edit', async () => {
  const request = {
    target,
    resource: { kind: 'arc' },
    operationId: op(1),
    title: 'Arco',
    objective: 'Original',
  };
  const created = await Promise.all([
    api.createNarrativeItem('author', request),
    api.createNarrativeItem('author', request),
  ]);
  assert.deepEqual(created[0], created[1]);
  assert.equal((await admin.collection('books/book/arcs').get()).size, 1);
  const edits = await Promise.allSettled(
    [2, 3].map((n) =>
      api.updateNarrativeItem('author', {
        target,
        source: source(created[0].item),
        operationId: op(n),
        expectedRevision: 1,
        patch: { objective: `Versão ${n}` },
      }),
    ),
  );
  assert.equal(edits.filter((item) => item.status === 'fulfilled').length, 1);
  assert.equal(
    edits.find((item) => item.status === 'rejected').reason.details.reason,
    'revision-conflict',
  );
  const final = await api.getNarrativeItem('author', { target, source: source(created[0].item) });
  assert.equal(final.revision, 2);
  assert.ok(['Versão 2', 'Versão 3'].includes(final.objective));
});
test('SDK pagination and manual event ranks preserve manuscript, accept free dates and invalidate stale cursors', async () => {
  for (let n = 1; n <= 4; n++)
    await create(n, 'event', { dateLabel: n === 1 ? '3º dia do inverno' : '' });
  const first = await api.listNarrativeItems('author', {
    target,
    resource: { kind: 'event' },
    limit: 2,
  });
  const second = await api.listNarrativeItems('author', {
    target,
    resource: { kind: 'event' },
    limit: 2,
    cursor: first.nextCursor,
  });
  assert.equal(second.items.length, 2);
  const chapter = await admin.doc('books/book/chapters/legacy').get();
  await api.moveNarrativeItem('author', {
    target,
    source: { kind: 'event', id: op(4) },
    operationId: op(5),
    expectedRevision: 1,
    expectedStructureRevision: first.sequence.structureRevision,
    beforeId: op(1),
  });
  assert.deepEqual(
    (await api.listNarrativeItems('author', { target, resource: { kind: 'event' } })).items.map(
      (item) => item.id,
    ),
    [op(4), op(1), op(2), op(3)],
  );
  assert.equal((await admin.doc('books/book').get()).data().wordCount, 2);
  const after = await admin.doc('books/book/chapters/legacy').get();
  assert.deepEqual(after.data(), chapter.data());
  assert.equal(after.updateTime.toMillis(), chapter.updateTime.toMillis());
  await assert.rejects(
    api.listNarrativeItems('author', {
      target,
      resource: { kind: 'event' },
      cursor: first.nextCursor,
    }),
    { code: 'failed-precondition', details: { reason: 'revision-conflict' } },
  );
  await assert.rejects(
    api.listNarrativeItems('author', {
      target,
      resource: { kind: 'arc' },
      cursor: first.nextCursor,
    }),
    { code: 'invalid-argument' },
  );
  assert.equal(
    (await api.getNarrativeItem('author', { target, source: { kind: 'event', id: op(1) } }))
      .dateLabel,
    '3º dia do inverno',
  );
});
test('preparation indexes legacy scene references in bounded steps and concurrent remove/add never publishes a false ready projection', async () => {
  const ref = { kind: 'book', scopeId: 'book', entityId: 'entity' };
  const created = await scenes.createScene('author', { target, operationId: op(1), title: 'Cena' });
  const refPath = `books/book/scenes/${created.scene.id}/references/${digest(ref)}`;
  await admin.doc(refPath).set(ref);
  await assert.rejects(api.listEntityScenes('author', { target, reference: ref }), {
    code: 'failed-precondition',
    details: { reason: 'entity-index-not-ready' },
  });
  const preparation = { target, operationId: op(10), limit: 1 };
  await Promise.all([
    api.prepareEntitySceneIndex('author', preparation),
    scenes.setSceneReference('author', {
      target,
      sceneId: created.scene.id,
      operationId: op(2),
      expectedRevision: 1,
      reference: ref,
      remove: true,
    }),
  ]);
  await finish(() =>
    api.prepareEntitySceneIndex('author', { ...preparation, operationId: op(11) }),
  );
  assert.equal((await api.listEntityScenes('author', { target, reference: ref })).items.length, 0);
  assert.equal((await admin.collection('books/book/sceneLoreLinks').get()).size, 0);
  await scenes.setSceneReference('author', {
    target,
    sceneId: created.scene.id,
    operationId: op(3),
    expectedRevision: 2,
    reference: ref,
  });
  assert.equal(
    (await api.listEntityScenes('author', { target, reference: ref })).items[0].title,
    'Cena',
  );
  await admin.doc('books/book/lore/entity').delete();
  const item = (await api.listEntityScenes('author', { target, reference: ref })).items[0];
  assert.deepEqual(item, { id: item.id, sceneId: created.scene.id, available: false });
  const context = await api.getNarrativeContext('author', { target });
  assert.equal(context.entityIndexReady, true);
});
test('current origin resolution keeps multiple references and never returns label after universe change or event deletion', async () => {
  await admin.doc('universes/world').set({ authorId: 'author', updatedAt: 1 });
  await admin
    .doc('universes/world/lore/global')
    .set({ name: 'Segredo global', category: 'character' });
  await admin.doc('books/book').update({ universeId: 'world' });
  const arc = await create(1),
    event = await create(2, 'event');
  const lore = {
    kind: 'lore',
    reference: { kind: 'universe', scopeId: 'world', entityId: 'global' },
  };
  await api.setNarrativeReference('author', {
    target,
    source: source(arc.item),
    operationId: op(3),
    expectedRevision: 1,
    reference: lore,
  });
  await api.setNarrativeReference('author', {
    target,
    source: source(arc.item),
    operationId: op(4),
    expectedRevision: 2,
    reference: { kind: 'event', eventId: event.item.id },
  });
  assert.equal(
    (await api.getNarrativeItem('author', { target, source: source(arc.item) })).referenceCount,
    2,
  );
  await admin.doc('books/book').update({ universeId: null });
  assert.equal(
    (await api.listEntityNarrativeItems('author', { target, reference: lore.reference })).items
      .length,
    0,
  );
  await admin.doc('books/book').update({ universeId: 'world' });
  await admin.doc('universes/world/lore/global').delete();
  assert.equal(
    (await api.listEntityNarrativeItems('author', { target, reference: lore.reference })).items
      .length,
    0,
  );
  await admin.doc('books/book').update({ universeId: null });
  await finish(() =>
    api.deleteNarrativeItem('author', {
      target,
      source: source(event.item),
      operationId: op(5),
      expectedRevision: 1,
      limit: 1,
    }),
  );
  const refs = await api.listNarrativeReferences('author', { target, source: source(arc.item) });
  assert.equal(refs.items.length, 2);
  assert.ok(refs.items.every((view) => !view.available && !('label' in view)));
  await api.setNarrativeReference('author', {
    target,
    source: source(arc.item),
    operationId: op(6),
    expectedRevision: 3,
    reference: lore,
    remove: true,
  });
  await assert.rejects(
    api.setNarrativeReference('author', {
      target,
      source: source(arc.item),
      operationId: op(7),
      expectedRevision: 4,
      reference: lore,
    }),
    { code: 'permission-denied' },
  );
});
test('rebalance and arc removal resume across calls with original requests, preserve independent timeline and expose deleting summaries', async () => {
  const arc = await create(1);
  await create(2, 'event');
  for (let n = 3; n <= 5; n++)
    await api.createNarrativeItem('author', {
      target,
      resource: { kind: 'milestone', arcId: arc.item.id },
      operationId: op(n),
      title: `Marco ${n}`,
    });
  const rebalance = {
    target,
    resource: { kind: 'milestone', arcId: arc.item.id },
    operationId: op(10),
    limit: 1,
  };
  assert.equal((await api.rebalanceNarrativeRanks('author', rebalance)).complete, false);
  assert.equal(
    (await api.getNarrativeJob('author', { target, operationId: op(10) })).input.resource.arcId,
    arc.item.id,
  );
  await assert.rejects(
    api.deleteNarrativeItem('author', {
      target,
      source: source(arc.item),
      operationId: op(11),
      expectedRevision: 1,
    }),
    { code: 'failed-precondition' },
  );
  await api.updateNarrativeItem('author', {
    target,
    source: { kind: 'milestone', arcId: arc.item.id, id: op(3) },
    operationId: op(12),
    expectedRevision: 1,
    patch: { notes: 'Edição durante job' },
  });
  await finish(() => api.rebalanceNarrativeRanks('author', rebalance));
  assert.equal(
    (await api.listNarrativeItems('author', { target, resource: rebalance.resource })).sequence
      .rankSlot,
    'B',
  );
  const remove = {
    target,
    source: source(arc.item),
    operationId: op(11),
    expectedRevision: 1,
    limit: 1,
  };
  await api.deleteNarrativeItem('author', remove);
  const pending = await api.listNarrativeItems('author', { target, resource: { kind: 'arc' } });
  assert.equal(pending.items[0].deleting, true);
  assert.equal(pending.items[0].deletionOperationId, op(11));
  await finish(() => api.deleteNarrativeItem('author', remove));
  assert.equal((await admin.collection(`books/book/arcs/${arc.item.id}/milestones`).get()).size, 0);
  assert.equal(
    (await api.listNarrativeItems('author', { target, resource: { kind: 'event' } })).items.length,
    1,
  );
});
