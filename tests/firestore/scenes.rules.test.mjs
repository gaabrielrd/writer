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
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { createScenesService } from '../../functions/src/scenes.mjs';
import { createChapterChatService } from '../../functions/src/chapterChat.mjs';
import { digest } from '../../functions/src/sceneContracts.mjs';

const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url));
const { Firestore } = requireFunctions('firebase-admin/firestore');
const projectId = 'demo-writer-scenes-tests';
const target = { kind: 'book', id: 'book' };
const op = (n) => `scene-emulator-operation-${n}`;
const previousMetadata = process.env.METADATA_SERVER_DETECTION;
let environment, admin, api;
const client = (uid = 'author') =>
  uid
    ? environment.authenticatedContext(uid).firestore()
    : environment.unauthenticatedContext().firestore();
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!address) throw new Error('Use somente emulador demo.');
  process.env.METADATA_SERVER_DETECTION = 'none';
  const [host, port] = address.split(':');
  environment = await initializeTestEnvironment({
    projectId,
    firestore: {
      host,
      port: Number(port),
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
  });
  admin = new Firestore({ projectId, host: address, ssl: false, universeDomain: 'googleapis.com' });
  api = createScenesService({ db: admin });
});
beforeEach(async () => {
  await environment.clearFirestore();
  await admin.doc('books/book').set({
    authorId: 'author',
    title: 'Livro',
    status: 'draft',
    createdAt: 1,
    updatedAt: 100,
    wordCount: 2,
  });
  await admin.doc('books/book/chapters/legacy').set({
    title: 'Capítulo',
    content: '<p>Texto original</p>',
    wordCount: 2,
    order: 1,
    createdAt: 1,
    updatedAt: 100,
    privateLegacy: 'Fonte privada',
  });
  await admin.doc('users/author').set({ credits: 5 });
});
after(async () => {
  await admin?.terminate();
  await environment?.cleanup();
  if (previousMetadata === undefined) delete process.env.METADATA_SERVER_DETECTION;
  else process.env.METADATA_SERVER_DETECTION = previousMetadata;
});
const createGroup = (n = 1) =>
  api.createSceneGroup('author', { target, operationId: op(n), title: 'Capítulo composto' });
const createScene = (parentId = null, n = 2, content = '<p>Texto novo</p>') =>
  api.createScene('author', {
    target,
    operationId: op(n),
    parentId,
    title: 'Cena',
    content,
    planning: { objective: 'Segredo privado' },
  });
async function finish(call) {
  for (let i = 0; i < 100; i++) {
    const result = await call();
    if (result.complete) return result;
  }
  assert.fail('Job did not finish');
}

test('direct scene/part/body/planning/reference access is private, writes and ledgers are server-only', async () => {
  const group = await createGroup(),
    created = await createScene(group.id),
    own = client();
  await admin
    .doc(`books/book/scenes/${created.scene.id}/references/ref`)
    .set({ kind: 'book', scopeId: 'book', entityId: 'npc' });
  for (const path of [
    `books/book/scenes/${created.scene.id}`,
    `books/book/scenes/${created.scene.id}/body/current`,
    `books/book/scenes/${created.scene.id}/planning/current`,
    `books/book/scenes/${created.scene.id}/references/ref`,
  ]) {
    await assertSucceeds(getDoc(doc(own, path)));
    for (const uid of ['other', null]) await assertFails(getDoc(doc(client(uid), path)));
    await assertFails(updateDoc(doc(own, path), { title: 'Ataque' }));
    await assertFails(deleteDoc(doc(own, path)));
  }
  await assertSucceeds(getDocs(query(collection(own, 'books/book/scenes'), limit(50))));
  await assertFails(getDocs(collection(own, 'books/book/scenes')));
  await assertFails(getDocs(query(collection(own, 'books/book/scenes'), limit(51))));
  for (const path of [
    `users/author/sceneOperations/${op(2)}`,
    'books/book/sceneControls/unassigned',
    'books/book/sceneJobs/job',
    'books/book/sceneSources/legacy',
  ]) {
    await assertFails(getDoc(doc(own, path)));
    await assertFails(setDoc(doc(own, path), { fake: true }));
  }
  await admin
    .doc('adventures/adventure')
    .set({ ownerId: 'author', title: 'Aventura', updatedAt: 1 });
  const adventure = { kind: 'adventure', id: 'adventure' };
  const part = await api.createSceneGroup('author', {
    target: adventure,
    operationId: op(3),
    title: 'Parte',
  });
  await assertSucceeds(getDoc(doc(own, `adventures/adventure/parts/${part.id}`)));
  await assertFails(getDoc(doc(client('other'), `adventures/adventure/parts/${part.id}`)));
  await assertFails(setDoc(doc(own, 'adventures/adventure/parts/fake'), { title: 'Parte' }));
  const detail = await api.getScene('author', { target, sceneId: created.scene.id });
  assert.equal(detail.content, '<p>Texto novo</p>');
  assert.equal(await api.getScene('other', { target, sceneId: created.scene.id }), null);
});

test('legacy edits remain allowed while old clients cannot overwrite composed prosa, mode, counters or deletion guards', async () => {
  const own = client(),
    legacy = doc(own, 'books/book/chapters/legacy');
  await assertSucceeds(
    updateDoc(legacy, { title: 'Legado editado', content: '<p>Texto original</p>' }),
  );
  const original = await api.getSceneGroup('author', { target, parentId: 'legacy' });
  await api.convertChapterToScenes('author', {
    target,
    parentId: 'legacy',
    operationId: op(1),
    expectedSourceVersion: original.sourceVersion,
  });
  await assertSucceeds(updateDoc(legacy, { title: 'Título novo' }));
  const maximumComplement = {
    personaId: 'preset-incisive',
    overrides: Array.from({ length: 16 }, (_, index) => ({
      traitId: `custom-${index}`,
      value: index,
    })),
  };
  await assertSucceeds(updateDoc(legacy, { personaComplement: maximumComplement }));
  await assertSucceeds(updateDoc(legacy, { title: 'Título com 16 substituições' }));
  await admin.doc('users/author/aiPersonas/custom-full').set({ name: 'Persona própria' });
  await assertSucceeds(
    updateDoc(legacy, { personaComplement: { ...maximumComplement, personaId: 'custom-full' } }),
  );
  for (const override of [
    null,
    1,
    {},
    { traitId: null, value: 1 },
    { traitId: 1, value: 1 },
    { traitId: 'x', value: 0.5 },
    { traitId: 'x', value: 101 },
    { traitId: 'x', value: -1 },
    { traitId: 'x', value: 1, private: 'extra' },
  ])
    await assertFails(
      updateDoc(legacy, {
        personaComplement: { personaId: 'preset-incisive', overrides: [override] },
      }),
    );
  await assertFails(
    updateDoc(legacy, {
      personaComplement: {
        ...maximumComplement,
        overrides: [...maximumComplement.overrides, { traitId: 'overflow', value: 50 }],
      },
    }),
  );
  for (const patch of [
    { content: 'Corpo antigo' },
    { contentMode: 'legacy' },
    { contentMode: deleteField() },
    { assemblyRevision: 0 },
    { wordCount: 0 },
    { sceneCount: 0 },
  ])
    await assertFails(updateDoc(legacy, patch));
  await assertFails(setDoc(legacy, { title: 'Capítulo', content: 'Antigo' }));
  await assertFails(deleteDoc(legacy));
  const book = doc(own, 'books/book');
  await assertFails(updateDoc(book, { hasSceneResources: deleteField() }));
  await assertFails(updateDoc(book, { sceneRevision: 0 }));
  await assertFails(
    setDoc(book, {
      authorId: 'author',
      title: 'Livro',
      status: 'draft',
      createdAt: 1,
      updatedAt: 200,
    }),
  );
  await assertFails(
    setDoc(doc(own, 'books/book/chapters/fake'), {
      title: 'Cena',
      contentMode: 'scenes',
      content: '',
      assemblyRevision: 0,
    }),
  );
  const revocation = writeBatch(own);
  revocation.update(book, { deleting: true, status: 'draft', updatedAt: Date.now() });
  revocation.delete(doc(own, 'publicBooks/book'));
  await assertSucceeds(revocation.commit());
  await assertFails(deleteDoc(book));
  const source = await admin.doc('books/book/sceneSources/legacy').get();
  assert.equal(source.data().original.content, '<p>Texto original</p>');
});

test('publication requires current scene capture on revision and pointer, preserves closed prosa projection and never returns private plan', async () => {
  const group = await createGroup(),
    created = await createScene(group.id),
    own = client();
  const sourceSceneRevision = (await admin.doc('books/book').get()).data().sceneRevision;
  const revision = { createdAt: 200, chapterCount: 1, loreCount: 0, privacyVersion: 0 };
  await assertFails(setDoc(doc(own, 'publicBooks/book/revisions/missing'), revision));
  await assertFails(
    setDoc(doc(own, 'publicBooks/book/revisions/stale'), {
      ...revision,
      sourceSceneRevision: sourceSceneRevision - 1,
    }),
  );
  await assertSucceeds(
    setDoc(doc(own, 'publicBooks/book/revisions/captured'), { ...revision, sourceSceneRevision }),
  );
  const page = await api.readSceneAssembly('author', {
    target,
    parentId: group.id,
    expectedAssemblyRevision: created.groups[0].assemblyRevision,
  });
  const projection = {
    title: group.title,
    order: 1,
    content: page.items.map((item) => item.content).join(''),
  };
  await assertFails(
    setDoc(doc(own, `publicBooks/book/revisions/captured/chapters/${group.id}`), {
      ...projection,
      objective: 'Segredo privado',
    }),
  );
  await assertSucceeds(
    setDoc(doc(own, `publicBooks/book/revisions/captured/chapters/${group.id}`), projection),
  );
  const pointer = {
    schemaVersion: 1,
    title: 'Livro',
    authorName: 'Autora',
    revisionId: 'captured',
    publishedAt: 200,
  };
  const publish = writeBatch(own);
  publish.update(doc(own, 'books/book'), { status: 'published', updatedAt: Date.now() });
  publish.set(doc(own, 'publicBooks/book'), { ...pointer, sourceSceneRevision });
  await assertSucceeds(publish.commit());
  const publicChapter = await assertSucceeds(
    getDoc(doc(client(null), `publicBooks/book/revisions/captured/chapters/${group.id}`)),
  );
  assert.deepEqual(publicChapter.data(), projection);
  await api.updateScene('author', {
    target,
    sceneId: created.scene.id,
    operationId: op(3),
    expectedRevision: 1,
    patch: { content: '<p>Editado</p>' },
  });
  await assertFails(
    updateDoc(doc(own, 'publicBooks/book'), { sourceSceneRevision: sourceSceneRevision + 1 }),
  );
  await assertFails(setDoc(doc(own, 'publicBooks/book'), pointer));
});

test('real concurrent creation and CAS produce one scene/receipt and one winning edit without content loss', async () => {
  const group = await createGroup(),
    request = {
      target,
      operationId: op(2),
      parentId: group.id,
      title: 'Cena',
      content: '<p>Texto novo</p>',
    };
  const results = await Promise.all([
    api.createScene('author', request),
    api.createScene('author', request),
  ]);
  assert.deepEqual(results[0], results[1]);
  assert.equal((await admin.collection('books/book/scenes').get()).size, 1);
  assert.equal((await admin.doc(`users/author/sceneOperations/${op(2)}`).get()).data().revision, 1);
  const edits = await Promise.allSettled(
    [3, 4].map((n) =>
      api.updateScene('author', {
        target,
        sceneId: op(2),
        operationId: op(n),
        expectedRevision: 1,
        patch: { content: `<p>Texto ${n}</p>` },
      }),
    ),
  );
  assert.equal(edits.filter((item) => item.status === 'fulfilled').length, 1);
  const failed = edits.find((item) => item.status === 'rejected');
  assert.equal(failed.reason.details.reason, 'revision-conflict');
  const scene = await api.getScene('author', { target, sceneId: op(2) });
  assert.equal(scene.revision, 2);
  assert.ok(['<p>Texto 3</p>', '<p>Texto 4</p>'].includes(scene.content));
});

test('SDK pages use active rank/id and byte budget, reject stale assembly and rebalance without publishing intermediate order', async () => {
  const group = await createGroup();
  for (let n = 2; n < 5; n++) await createScene(group.id, n, `<p>${'á'.repeat(260000)}</p>`);
  const detail = await api.getSceneGroup('author', { target, parentId: group.id });
  const first = await api.readSceneAssembly('author', {
    target,
    parentId: group.id,
    expectedAssemblyRevision: detail.group.assemblyRevision,
  });
  assert.equal(first.items.length, 1);
  assert.ok(first.nextCursor);
  const rebalance = { target, parentId: group.id, operationId: op(8), limit: 1 };
  assert.equal((await api.rebalanceSceneRanks('author', rebalance)).complete, false);
  assert.equal(
    (await api.getSceneGroup('author', { target, parentId: group.id })).group.rankSlot,
    'A',
  );
  await assert.rejects(createScene(group.id, 9), { code: 'failed-precondition' });
  await finish(() => api.rebalanceSceneRanks('author', rebalance));
  const after = await api.getSceneGroup('author', { target, parentId: group.id });
  assert.equal(after.group.rankSlot, 'B');
  await assert.rejects(
    api.readSceneAssembly('author', {
      target,
      parentId: group.id,
      expectedAssemblyRevision: detail.group.assemblyRevision,
      cursor: first.nextCursor,
    }),
    { code: 'failed-precondition' },
  );
  const list = await api.listScenes('author', { target, parentId: group.id, limit: 2 });
  const next = await api.listScenes('author', {
    target,
    parentId: group.id,
    limit: 2,
    cursor: list.nextCursor,
  });
  assert.deepEqual(
    [...list.items, ...next.items].map((item) => item.id),
    [op(2), op(3), op(4)],
  );
  assert.equal('content' in list.items[0], false);
});

test('SDK group cursor invalidates after a legacy metadata edit, while another scope remains invalid', async () => {
  await createGroup();
  const first = await api.listSceneGroups('author', { target, limit: 1 });
  assert.ok(first.nextCursor);
  const root = await admin.doc('books/book').get();
  await assertSucceeds(
    updateDoc(doc(client(), 'books/book'), {
      title: 'Título atualizado',
      updatedAt: root.data().updatedAt + 1,
    }),
  );
  await assert.rejects(
    api.listSceneGroups('author', {
      target,
      limit: 1,
      cursor: first.nextCursor,
    }),
    { code: 'failed-precondition', details: { reason: 'revision-conflict' } },
  );
  const fresh = await api.listSceneGroups('author', { target, limit: 1 });
  assert.equal(fresh.projectRevision, first.projectRevision);
  const next = await api.listSceneGroups('author', { target, limit: 1, cursor: fresh.nextCursor });
  assert.equal(next.items.length, 1);
  const token = JSON.parse(Buffer.from(first.nextCursor, 'base64url').toString());
  token.context.uid = 'intruder';
  await assert.rejects(
    api.listSceneGroups('author', {
      target,
      cursor: Buffer.from(JSON.stringify(token)).toString('base64url'),
    }),
    { code: 'invalid-argument' },
  );
});

test('Admin persists a complete body at 900000 bytes and rejects excess create, edit and conversion atomically', async () => {
  const content = '\u0000'.repeat(20000) + 'a'.repeat(779906);
  const rootRef = admin.doc('books/book');
  const beforeCreate = await rootRef.get();
  await assert.rejects(createScene(null, 2, content), { code: 'invalid-argument' });
  assert.equal((await rootRef.get()).updateTime.toMillis(), beforeCreate.updateTime.toMillis());
  assert.equal((await admin.collection('books/book/scenes').get()).size, 0);
  assert.equal((await admin.doc(`users/author/sceneOperations/${op(2)}`).get()).exists, false);
  const created = await createScene(null, 2, content.slice(0, -7));
  const bodyRef = admin.doc(`books/book/scenes/${created.scene.id}/body/current`);
  const beforeEdit = await bodyRef.get();
  assert.equal(Buffer.byteLength(JSON.stringify(beforeEdit.data())), 900000);
  await assert.rejects(
    api.updateScene('author', {
      target,
      sceneId: created.scene.id,
      operationId: op(3),
      expectedRevision: 1,
      patch: { content },
    }),
    { code: 'invalid-argument' },
  );
  assert.equal((await bodyRef.get()).updateTime.toMillis(), beforeEdit.updateTime.toMillis());
  assert.equal((await admin.doc(`users/author/sceneOperations/${op(3)}`).get()).exists, false);
  const chapterRef = admin.doc('books/book/chapters/legacy');
  await chapterRef.update({ content });
  const beforeConversion = await chapterRef.get();
  const detail = await api.getSceneGroup('author', { target, parentId: 'legacy' });
  await assert.rejects(
    api.convertChapterToScenes('author', {
      target,
      parentId: 'legacy',
      operationId: op(4),
      expectedSourceVersion: detail.sourceVersion,
    }),
    { code: 'invalid-argument' },
  );
  assert.equal(
    (await chapterRef.get()).updateTime.toMillis(),
    beforeConversion.updateTime.toMillis(),
  );
  assert.equal((await admin.doc('books/book/sceneSources/legacy').get()).exists, false);
  assert.equal((await admin.doc(`users/author/sceneOperations/${op(4)}`).get()).exists, false);
});

test('real deletion jobs preserve scenes and complete legacy source, resume after reload and clean books only after revocation', async () => {
  const source = await api.getSceneGroup('author', { target, parentId: 'legacy' });
  const converted = await api.convertChapterToScenes('author', {
    target,
    parentId: 'legacy',
    operationId: op(1),
    expectedSourceVersion: source.sourceVersion,
  });
  const group = await api.getSceneGroup('author', { target, parentId: 'legacy' });
  const deletion = {
    target,
    parentId: 'legacy',
    expectedUpdatedAt: group.group.updatedAt,
    operationId: op(3),
    limit: 1,
  };
  await api.deleteSceneGroup('author', deletion);
  const job = await api.getSceneJob('author', { target, operationId: op(3) });
  assert.equal(job.kind, 'delete-groups');
  await finish(() => api.deleteSceneGroups('author', { ...job.input, limit: 1 }));
  assert.equal((await api.listScenes('author', { target, parentId: null })).items.length, 1);
  const root = (await admin.doc('books/book').get()).data();
  const sources = await api.listSceneSources('author', {
    target,
    expectedProjectRevision: root.sceneRevision,
  });
  assert.equal(sources.items[0].content, '<p>Texto original</p>');
  assert.equal(sources.items[0].original.privateLegacy, 'Fonte privada');
  assert.equal(
    (await api.getScene('author', { target, sceneId: converted.scene.id })).content,
    sources.items[0].content,
  );
  await assert.rejects(api.deleteSceneBook('author', { target, operationId: op(4) }), {
    code: 'failed-precondition',
  });
  await admin.doc('books/book').update({ deleting: true, status: 'draft' });
  await api.deleteSceneBook('author', { target, operationId: op(4), limit: 1 });
  await finish(() => api.deleteSceneBook('author', { target, operationId: op(5), limit: 1 }));
  assert.equal((await admin.doc('books/book').get()).exists, false);
  assert.equal((await admin.doc('deletedBooks/book').get()).exists, true);
  for (const name of ['scenes', 'chapters', 'sceneSources', 'sceneControls'])
    assert.equal((await admin.collection(`books/book/${name}`).get()).size, 0);
  assert.equal(
    (await admin.doc(`books/book/scenes/${converted.scene.id}/body/current`).get()).exists,
    false,
  );
});

test('Admin chapter AI cannot accept after conversion without writes or credit changes', async () => {
  const identity = { bookId: 'book', chapterId: 'legacy', conversationId: 'conversation' },
    content = '<p>Texto original</p>';
  const context = {
    source: 'selection',
    text: 'Texto original',
    surrounding: 'Texto original',
    title: 'Capítulo',
    bookTitle: 'Livro',
    truncated: false,
    persona: { instruction: '', version: '' },
    lore: [],
    target: { hash: digest(content), from: 1, to: 15 },
  };
  const chat = createChapterChatService({
    db: admin,
    generator: async () => 'Análise. [[SUGESTAO]]Outra prosa[[/SUGESTAO]]',
  });
  await chat.chapterChat('author', { ...identity, action: 'create' });
  await chat.chapterChat('author', {
    ...identity,
    action: 'send',
    requestId: 'request',
    text: '/reescrever',
    context,
  });
  const source = await api.getSceneGroup('author', { target, parentId: 'legacy' });
  await api.convertChapterToScenes('author', {
    target,
    parentId: 'legacy',
    operationId: op(1),
    expectedSourceVersion: source.sourceVersion,
  });
  const paths = [
    'books/book',
    'books/book/chapters/legacy',
    'users/author',
    'users/author/chapterChats/book/chapters/legacy/conversations/conversation/messages/request',
  ];
  const before = await Promise.all(paths.map((path) => admin.doc(path).get()));
  await assert.rejects(
    chat.chapterChat('author', {
      ...identity,
      action: 'apply',
      requestId: 'accept',
      messageId: 'request',
      expectedHash: digest(content),
      sourceHash: digest(content),
      after: '<p>Outra prosa</p>',
    }),
    { code: 'failed-precondition' },
  );
  const after = await Promise.all(paths.map((path) => admin.doc(path).get()));
  for (let i = 0; i < before.length; i++) {
    assert.deepEqual(after[i].data(), before[i].data());
    assert.equal(after[i].updateTime.toMillis(), before[i].updateTime.toMillis());
  }
  assert.equal(
    (await admin.doc('users/author/chapterChats/book/chapters/legacy/receipts/accept').get())
      .exists,
    false,
  );
});
