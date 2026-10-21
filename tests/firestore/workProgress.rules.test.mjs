import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, deleteField } from 'firebase/firestore';
import { createWorkProgressService } from '../../functions/src/workProgress.mjs';
import { createScenesService } from '../../functions/src/scenes.mjs';
import { digest } from '../../functions/src/sceneContracts.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url));
const { Firestore } = requireFunctions('firebase-admin/firestore');
const projectId = 'demo-writer-work-progress-tests';
const target = { kind: 'book', id: 'book' };
const adventure = { kind: 'adventure', id: 'adventure' };
const campaign = { kind: 'campaign', id: 'campaign' };
const op = (name) => `work-emulator-${name}`;
const previousMetadata = process.env.METADATA_SERVER_DETECTION;
let environment, admin, api, scenes;
const client = (uid = 'author') =>
  uid
    ? environment.authenticatedContext(uid).firestore()
    : environment.unauthenticatedContext().firestore();
before(async () => {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  if (!host) throw new Error('Use somente o emulador demo.');
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
  api = createWorkProgressService({ db: admin });
  scenes = createScenesService({ db: admin });
});
beforeEach(async () => {
  await environment.clearFirestore();
  await admin.doc('books/book').set({
    authorId: 'author',
    title: 'Livro atual',
    status: 'draft',
    createdAt: 1,
    updatedAt: 100,
    wordCount: 99,
  });
  await legacy('aaa', 'Texto original');
  await admin.doc('adventures/adventure').set({
    ownerId: 'author',
    title: 'Aventura atual',
    status: 'ready',
    createdAt: 1,
    updatedAt: 100,
  });
  await admin.doc('campaigns/campaign').set({
    ownerId: 'author',
    title: 'Campanha atual',
    status: 'planning',
    createdAt: 1,
    updatedAt: 100,
  });
});
after(async () => {
  await environment?.cleanup();
  await admin?.terminate();
  if (previousMetadata === undefined) delete process.env.METADATA_SERVER_DETECTION;
  else process.env.METADATA_SERVER_DETECTION = previousMetadata;
});
async function legacy(id, content) {
  await admin.doc(`books/book/chapters/${id}`).set({
    title: `Capítulo ${id}`,
    content,
    wordCount: 99,
    order: id === 'aaa' ? 1 : 2,
    createdAt: 1,
    updatedAt: 100,
  });
}
async function finish(call) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const result = await call();
    if (result.complete) return result;
  }
  assert.fail('Checkpoint não terminou no corpus de teste.');
}
const prepare = (project = target, name = 'prepare') =>
  finish(() =>
    api.prepareWorkWordCount('author', {
      target: project,
      operationId: op(name),
      limit: 1,
    }),
  );
test('estado/meta são privados, pronto não publica e escritores diretos não adulteram o total ativado', async () => {
  const result = await api.updateWorkProgress('author', {
    target,
    operationId: op('metadata'),
    expectedRevision: 0,
    patch: { editorialState: 'ready', wordGoal: 50000 },
  });
  assert.equal(result.editorialState, 'ready');
  assert.equal((await admin.doc('books/book').get()).data().status, 'draft');
  assert.equal((await admin.doc('publicBooks/book').get()).exists, false);
  const owner = client();
  await assertSucceeds(updateDoc(doc(owner, 'books/book/chapters/aaa'), { title: 'Título novo' }));
  for (const patch of [{ content: 'Adulterado' }, { wordCount: 500 }, { contentMode: 'scenes' }])
    await assertFails(updateDoc(doc(owner, 'books/book/chapters/aaa'), patch));
  await assertFails(
    setDoc(doc(owner, 'books/book/chapters/forged'), {
      title: 'Novo',
      content: 'Direto',
      order: 2,
    }),
  );
  await assertFails(deleteDoc(doc(owner, 'books/book/chapters/aaa')));
  for (const patch of [
    { wordCount: 0 },
    { hasProgressResources: false },
    { hasProgressResources: deleteField() },
    { editorialState: 'draft' },
  ])
    await assertFails(updateDoc(doc(owner, 'books/book'), patch));
  for (const path of [
    'books/book/workProgress/current',
    'books/book/workWordSources/forged',
    'books/book/workWordGroups/forged',
  ]) {
    await assertFails(getDoc(doc(owner, path)));
    await assertFails(setDoc(doc(owner, path), { wordCount: 999 }));
  }
  await assertFails(getDoc(doc(client('other'), 'books/book')));
  await assertFails(getDoc(doc(client(null), 'books/book')));
  assert.equal(await api.getWorkProgress('other', { target }), null);
});
test('preparação usa a prosa atual e não duplica fontes alteradas/criadas antes do cursor', async () => {
  await legacy('zzz', '<p>Ar<strong>tu</strong>r &eacute; lua</p>');
  const first = await api.prepareWorkWordCount('author', {
    target,
    operationId: op('interleaved'),
    limit: 1,
  });
  assert.equal(first.complete, false);
  assert.equal(first.wordCount, null);
  assert.equal((await api.getWorkProgress('author', { target })).manuscript.wordCount, null);
  await api.saveLegacyChapter('author', {
    bookId: 'book',
    chapterId: 'zzz',
    operationId: op('edit-before-cursor'),
    expectedContentHash: digest('<p>Ar<strong>tu</strong>r &eacute; lua</p>'),
    content: '<p>Reescrita</p>',
  });
  const creation = {
    bookId: 'book',
    operationId: '000-progress-late-create',
    input: { title: 'Novo', content: 'Três palavras novas' },
  };
  await api.createLegacyChapter('author', creation);
  await api.createLegacyChapter('author', creation);
  await api.deleteLegacyChapters('author', {
    bookId: 'book',
    operationId: op('delete-scanned'),
    chapters: [{ id: 'aaa', expectedUpdatedAt: 100 }],
  });
  const result = await prepare(target, 'interleaved');
  assert.equal(result.wordCount, 4);
  assert.equal((await admin.doc('books/book').get()).data().wordCount, 4);
  const rootTime = (await admin.doc('books/book').get()).data().updatedAt;
  assert.equal((await prepare(target, 'prepare-replay')).wordCount, 4);
  assert.equal((await admin.doc('books/book').get()).data().updatedAt, rootTime);
});
test('cenas ativas contribuem; exclusão em lotes subtrai uma vez, movimento e arquivo/restauração ajustam o total', async () => {
  await admin.doc('books/book/chapters/aaa').delete();
  const group = await scenes.createSceneGroup('author', {
    target,
    operationId: op('group'),
    title: 'Capítulo',
  });
  const rows = [];
  for (const [index, content] of ['Uma', 'Duas palavras', 'Três palavras agora'].entries())
    rows.push(
      await scenes.createScene('author', {
        target,
        operationId: op(`scene-${index}`),
        parentId: group.id,
        title: `Cena ${index}`,
        content,
      }),
    );
  assert.equal((await prepare()).wordCount, 6);
  const currentGroup = await scenes.getSceneGroup('author', { target, parentId: group.id });
  const request = {
    target,
    operationId: op('delete-group'),
    parentId: group.id,
    expectedUpdatedAt: currentGroup.group.updatedAt,
    limit: 1,
  };
  const first = await scenes.deleteSceneGroup('author', request);
  assert.equal(first.complete, false);
  assert.equal((await api.getWorkProgress('author', { target })).manuscript.wordCount, 0);
  await finish(() => scenes.deleteSceneGroup('author', request));
  assert.equal((await api.getWorkProgress('author', { target })).manuscript.wordCount, 0);
  const destination = await scenes.createSceneGroup('author', {
    target,
    operationId: op('destination'),
    title: 'Outro capítulo',
  });
  const source = await scenes.getScene('author', { target, sceneId: rows[0].scene.id });
  const unassigned = await scenes.getSceneGroup('author', { target, parentId: null });
  const moved = await scenes.moveScene('author', {
    target,
    sceneId: source.id,
    operationId: op('move'),
    expectedRevision: source.revision,
    parentId: destination.id,
    expectedSourceStructureRevision: unassigned.group.structureRevision,
    expectedTargetStructureRevision: destination.structureRevision,
  });
  assert.equal((await api.getWorkProgress('author', { target })).manuscript.wordCount, 1);
  const archived = await scenes.archiveScene('author', {
    target,
    sceneId: source.id,
    operationId: op('archive'),
    expectedRevision: moved.scene.revision,
    archived: true,
  });
  assert.equal((await api.getWorkProgress('author', { target })).manuscript.wordCount, 0);
  await scenes.archiveScene('author', {
    target,
    sceneId: source.id,
    operationId: op('restore'),
    expectedRevision: archived.scene.revision,
    archived: false,
  });
  assert.equal((await api.getWorkProgress('author', { target })).manuscript.wordCount, 1);
});
test('conversão preserva a fonte e troca contribuição legada por cena sem somar duas vezes', async () => {
  assert.equal((await prepare()).wordCount, 2);
  const original = (await admin.doc('books/book/chapters/aaa').get()).data();
  const converted = await scenes.convertChapterToScenes('author', {
    target,
    parentId: 'aaa',
    operationId: op('convert'),
    expectedSourceVersion: digest(original),
  });
  assert.equal((await api.getWorkProgress('author', { target })).manuscript.wordCount, 2);
  assert.deepEqual(
    (await admin.doc('books/book/sceneSources/aaa').get()).data().original,
    original,
  );
  await scenes.updateScene('author', {
    target,
    sceneId: converted.scene.id,
    operationId: op('rewrite'),
    expectedRevision: converted.scene.revision,
    patch: { content: '<p>Menos</p>' },
  });
  assert.equal((await api.getWorkProgress('author', { target })).manuscript.wordCount, 1);
});
test('checklist privado tem totais, reabertura, CAS e cursor invalidado sem inventar sessões', async () => {
  const one = await api.createWorkChecklistItem('author', {
    target: campaign,
    operationId: op('task-one'),
    title: 'Preparar encontro',
  });
  await api.createWorkChecklistItem('author', {
    target: campaign,
    operationId: op('task-two'),
    title: 'Revisar consequências',
  });
  const page = await api.listWorkChecklist('author', { target: campaign, limit: 1 });
  assert.equal(page.total, 2);
  assert.ok(page.nextCursor);
  const done = await api.updateWorkChecklistItem('author', {
    target: campaign,
    id: one.item.id,
    operationId: op('task-done'),
    expectedRevision: one.item.revision,
    patch: { completed: true },
  });
  assert.equal(done.completed, 1);
  await assert.rejects(
    api.listWorkChecklist('author', { target: campaign, limit: 1, cursor: page.nextCursor }),
    { code: 'failed-precondition' },
  );
  const reopened = await api.updateWorkChecklistItem('author', {
    target: campaign,
    id: one.item.id,
    operationId: op('task-reopen'),
    expectedRevision: done.item.revision,
    patch: { completed: false },
  });
  assert.equal(reopened.completed, 0);
  await assert.rejects(
    api.updateWorkChecklistItem('author', {
      target: campaign,
      id: one.item.id,
      operationId: op('stale-task'),
      expectedRevision: one.item.revision,
      patch: { completed: true },
    }),
    { code: 'failed-precondition' },
  );
  await assertFails(getDoc(doc(client(), `campaigns/campaign/workChecklist/${one.item.id}`)));
  await assertFails(
    setDoc(doc(client(), 'campaigns/campaign/workChecklist/forged'), { title: 'Direto' }),
  );
  assert.equal((await admin.doc('campaigns/campaign').get()).data().status, 'planning');
  assert.equal((await admin.collection('campaigns/campaign/sessions').get()).empty, true);
  await assert.rejects(api.listWorkChecklist('other', { target: campaign }), { code: 'not-found' });
});
test('atividade tem CAS global, títulos atuais e fallback autorizado após remoção; visitas não mudam datas do projeto', async () => {
  const beforeTime = (await admin.doc('books/book').get()).data().updatedAt;
  const first = await api.recordWorkActivity('author', {
    target,
    resource: { kind: 'chapter', id: 'aaa' },
    operationId: op('visit-book'),
    expectedActivityRevision: 0,
  });
  await assert.rejects(
    api.recordWorkActivity('author', {
      target: campaign,
      resource: { kind: 'project' },
      operationId: op('old-device'),
      expectedActivityRevision: 0,
    }),
    { code: 'failed-precondition' },
  );
  assert.equal((await admin.doc('books/book').get()).data().updatedAt, beforeTime);
  const rows = (await admin.collection('users/author/workActivity').get()).docs.map((row) =>
    row.data(),
  );
  assert.equal(rows.length, 1);
  assert.equal('title' in rows[0], false);
  assert.equal('content' in rows[0], false);
  await admin.doc('books/book').update({ title: 'Título atual novo' });
  assert.equal((await api.listWorkResume('author', {})).items[0].title, 'Título atual novo');
  await admin.doc('books/book/chapters/aaa').delete();
  assert.deepEqual((await api.resolveWorkResume('author', { target })).resource, {
    kind: 'project',
  });
  assert.equal((await api.resolveWorkResume('author', { target })).fallback, true);
  assert.equal((await api.listWorkResume('other', {})).items.length, 0);
  await admin.doc('books/book').update({ deleting: true });
  assert.equal((await api.listWorkResume('author', {})).items.length, 0);
  assert.equal(await api.resolveWorkResume('author', { target }), null);
  await assert.rejects(
    api.recordWorkActivity('author', {
      target,
      resource: { kind: 'chapter', id: 'aaa' },
      operationId: op('visit-book'),
      expectedActivityRevision: 0,
    }),
    { code: 'not-found' },
  );
  assert.equal(first.activityRevision, 1);
});
test('fuso é particular, inicialização concorrente conserva a escolha e meta total não reinicia', async () => {
  assert.deepEqual(await api.getWorkPreferences('author', {}), { revision: 0, timeZone: null });
  await api.updateWorkProgress('author', {
    target: adventure,
    operationId: op('adventure-goal'),
    expectedRevision: 0,
    patch: { wordGoal: 20000 },
  });
  const saved = await api.saveWorkPreferences('author', {
    operationId: op('zone'),
    expectedRevision: 0,
    timeZone: 'America/Sao_Paulo',
  });
  await assert.rejects(
    api.saveWorkPreferences('author', {
      operationId: op('second-device'),
      expectedRevision: 0,
      timeZone: 'Europe/Paris',
    }),
    { code: 'failed-precondition' },
  );
  assert.deepEqual(await api.getWorkPreferences('author', {}), saved);
  await api.saveWorkPreferences('author', {
    operationId: op('zone-change'),
    expectedRevision: 1,
    timeZone: 'Asia/Tokyo',
  });
  assert.equal((await api.getWorkProgress('author', { target: adventure })).wordGoal, 20000);
  assert.equal(
    (await api.getWorkProgress('author', { target: adventure })).editorialState,
    'ready',
  );
  for (const path of [
    'users/author/workPreferences/current',
    'users/author/workActivityState/current',
  ]) {
    await assertFails(getDoc(doc(client(), path)));
    await assertFails(setDoc(doc(client(), path), { revision: 999 }));
  }
});
test('fonte ativa sem corpo não é confirmada como zero nem altera silenciosamente o manuscrito', async () => {
  await admin.doc('books/book/chapters/aaa').delete();
  await admin
    .doc('books/book/chapters/group')
    .set({ contentMode: 'scenes', title: 'Grupo', order: 1, wordCount: 0 });
  await admin.doc('books/book/scenes/missing-body').set({
    id: 'missing-body',
    ownerId: 'author',
    parentId: 'group',
    archived: false,
    wordCount: 10,
  });
  await assert.rejects(prepare(target, 'missing-body'), { code: 'failed-precondition' });
  const progress = await api.getWorkProgress('author', { target });
  assert.equal(progress.manuscript.ready, false);
  assert.equal(progress.manuscript.wordCount, null);
  assert.equal(
    (await admin.doc('books/book/scenes/missing-body/body/current').get()).exists,
    false,
  );
  const checkpoint = (await admin.doc('books/book/workProgress/current').get()).data();
  assert.equal(checkpoint.phase, 'scenes');
  assert.equal(checkpoint.cursor, null);
  await admin
    .doc('books/book/scenes/missing-body/body/current')
    .set({ content: '<p>Corpo recuperado</p>' });
  assert.equal((await prepare(target, 'missing-body')).wordCount, 2);
});

test('recibo de salvamento antigo não confirma nem sobrescreve alteração posterior de outro dispositivo', async () => {
  await prepare(target, 'receipt-isolation');
  const originalRequest = {
    bookId: 'book',
    chapterId: 'aaa',
    operationId: op('lost-save-response'),
    expectedContentHash: digest('Texto original'),
    content: 'Texto do primeiro dispositivo',
  };
  // The write commits even when the caller has lost its transport response.
  const applied = await api.saveLegacyChapter('author', originalRequest);
  const afterFirstWrite = (await admin.doc('books/book').get()).data();
  assert.deepEqual(await api.saveLegacyChapter('author', originalRequest), applied);
  assert.deepEqual((await admin.doc('books/book').get()).data(), afterFirstWrite);

  const external = await api.saveLegacyChapter('author', {
    bookId: 'book',
    chapterId: 'aaa',
    operationId: op('second-device-save'),
    expectedContentHash: digest(originalRequest.content),
    content: 'Outro dispositivo preservado',
  });
  const paths = [
    'books/book',
    'books/book/chapters/aaa',
    'books/book/workProgress/current',
    `users/author/workOperations/${originalRequest.operationId}`,
    `users/author/workOperations/${op('second-device-save')}`,
  ];
  const beforeReplay = await Promise.all(
    paths.map(async (path) => (await admin.doc(path).get()).data()),
  );
  await assert.rejects(api.saveLegacyChapter('author', originalRequest), (error) => {
    assert.equal(error.code, 'failed-precondition');
    assert.equal(error.details.reason, 'revision-conflict');
    return true;
  });
  const afterReplay = await Promise.all(
    paths.map(async (path) => (await admin.doc(path).get()).data()),
  );
  assert.deepEqual(afterReplay, beforeReplay);
  assert.equal(afterReplay[1].content, external.content);
  assert.equal((await api.getWorkProgress('author', { target })).manuscript.wordCount, 3);
});
