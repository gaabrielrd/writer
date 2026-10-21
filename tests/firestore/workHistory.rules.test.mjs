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
  setDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  query,
  limit,
} from 'firebase/firestore';
import { createWorkHistoryService } from '../../functions/src/workHistory.mjs';
import { createWorkProgressService } from '../../functions/src/workProgress.mjs';
import { createScenesService } from '../../functions/src/scenes.mjs';
import { digest, CHUNK_BYTES } from '../../functions/src/workHistoryContracts.mjs';

const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-work-history-tests',
  target = { kind: 'book', id: 'book' },
  resource = { kind: 'chapter', id: 'chapter' },
  op = (name) => 'history-sdk-' + name,
  previousMetadata = process.env.METADATA_SERVER_DETECTION;
let environment, admin, api, progress, scenes;
const client = (uid = 'author') =>
  uid
    ? environment.authenticatedContext(uid).firestore()
    : environment.unauthenticatedContext().firestore();
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!address) throw new Error('Use somente o emulador demo.');
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
  api = createWorkHistoryService({ db: admin });
  progress = createWorkProgressService({ db: admin });
  scenes = createScenesService({ db: admin });
});
beforeEach(async () => {
  await environment.clearFirestore();
  await admin.doc('books/book').set({
    authorId: 'author',
    title: 'Livro',
    status: 'published',
    createdAt: 1,
    updatedAt: 100,
    wordCount: 99,
  });
  await admin.doc('books/book/chapters/chapter').set({
    bookId: 'book',
    title: 'Capítulo',
    order: 1,
    content: '<p>Texto original</p>',
    wordCount: 2,
    createdAt: 1,
    updatedAt: 100,
  });
  await admin.doc('users/author').set({ credits: 7 });
  await admin
    .doc('adventures/adventure')
    .set({ ownerId: 'author', title: 'Aventura', status: 'draft', createdAt: 1, updatedAt: 100 });
});
after(async () => {
  await admin?.terminate();
  await environment?.cleanup();
  if (previousMetadata === undefined) delete process.env.METADATA_SERVER_DETECTION;
  else process.env.METADATA_SERVER_DETECTION = previousMetadata;
});
const source = (project = target, res = resource) =>
  api.getWorkVersionSource('author', { target: project, resource: res });
async function capture(name, project = target, res = resource) {
  const current = await source(project, res);
  return api.createWorkVersion('author', {
    target: project,
    resource: res,
    operationId: op(name),
    expectedSourceToken: current.sourceToken,
  });
}
async function read(versionId, project = target) {
  let cursor = null,
    text = '';
  do {
    const page = await api.readWorkVersion('author', { target: project, versionId, cursor });
    text += page.chunks.map((chunk) => chunk.content).join('');
    cursor = page.nextCursor;
  } while (cursor);
  return text;
}
async function save(text, name) {
  return progress.saveLegacyChapter('author', {
    bookId: 'book',
    chapterId: 'chapter',
    operationId: op(name),
    content: text,
    expectedContentHash: (await source()).contentHash,
  });
}
async function prepare(project = target) {
  for (let count = 0; count < 20; count++) {
    const result = await progress.prepareWorkWordCount('author', {
      target: project,
      operationId: op('prepare-' + project.kind),
      limit: 1,
    });
    if (result.complete) return result;
  }
  assert.fail('Preparação não terminou.');
}

test('SDK history is server-only for owner, foreign account and anonymous; explicit capture activates legacy protection without rewriting source', async () => {
  const chapter = admin.doc('books/book/chapters/chapter'),
    before = await chapter.get(),
    current = await source();
  assert.equal((await admin.doc('books/book').get()).data().hasProgressResources, undefined);
  const { version } = await capture('private');
  const after = await chapter.get(),
    root = (await admin.doc('books/book').get()).data();
  assert.deepEqual(after.data(), before.data());
  assert.equal(after.updateTime.isEqual(before.updateTime), true);
  assert.equal((await source()).sourceToken, current.sourceToken);
  assert.equal(root.wordCount, 99);
  assert.equal(root.updatedAt, 100);
  assert.equal(root.status, 'published');
  assert.equal(root.hasProgressResources, true);
  const chunk = (await admin.collection('books/book/workVersionBodies').limit(1).get()).docs[0];
  const paths = [
    'books/book/workVersions/' + version.id,
    chunk.ref.path,
    'users/author/workHistoryOperations/' + op('private'),
  ];
  for (const uid of ['author', 'other', null])
    for (const path of paths) {
      await assertFails(getDoc(doc(client(uid), path)));
      await assertFails(setDoc(doc(client(uid), path), { forged: true }));
      await assertFails(deleteDoc(doc(client(uid), path)));
    }
  for (const uid of ['author', 'other', null])
    for (const name of ['workVersions', 'workVersionBodies'])
      await assertFails(getDocs(query(collection(client(uid), 'books/book/' + name), limit(25))));
  await assertFails(updateDoc(doc(client(), chapter.path), { content: 'Cliente antigo' }));
  await assertSucceeds(
    updateDoc(doc(client(), chapter.path), { title: 'Novo título', updatedAt: 101 }),
  );
  assert.notEqual((await source()).sourceToken, current.sourceToken);
  assert.equal(await api.getWorkVersionSource('other', { target, resource }), null);
  await assert.rejects(api.readWorkVersion('other', { target, versionId: version.id }), {
    code: 'not-found',
  });
});

test('SDK large legacy Unicode and quoted HTML fit real body documents and restore exact prose without the scene cap', async () => {
  const text = 'á😀"\\\n'.repeat(100000);
  assert.equal(Buffer.byteLength(text), 900000);
  await admin.doc('books/book/chapters/chapter').update({ content: text });
  const { version } = await capture('large');
  assert.equal(await read(version.id), text);
  const chunks = await admin
    .collection('books/book/workVersionBodies')
    .where('versionId', '==', version.id)
    .get();
  assert.equal(chunks.size, version.chunkCount);
  for (const snapshot of chunks.docs) {
    assert.ok(Buffer.byteLength(snapshot.data().content) <= CHUNK_BYTES);
    assert.ok(Buffer.byteLength(JSON.stringify(snapshot.data())) <= 900000);
  }
  await save('Texto curto', 'short');
  const restored = await api.restoreWorkVersion('author', {
    target,
    resource,
    versionId: version.id,
    operationId: op('restore-large'),
    expectedSourceToken: (await source()).sourceToken,
  });
  assert.equal(restored.source.content, text);
  assert.equal(restored.source.contentHash, digest(text));
  assert.equal(await read(restored.previousVersion.id), 'Texto curto');
  assert.equal((await admin.doc('books/book/chapters/chapter').get()).data().content, text);
  assert.equal((await admin.doc('users/author').get()).data().credits, 7);
});

test('SDK concurrent restores commit one predecessor and source change; retries after later writing cannot overwrite it', async () => {
  const { version } = await capture('original');
  await prepare();
  await save('Um texto novo', 'new-save');
  const request = {
    target,
    resource,
    versionId: version.id,
    operationId: op('parallel-restore'),
    expectedSourceToken: (await source()).sourceToken,
  };
  const [first, second] = await Promise.all([
    api.restoreWorkVersion('author', request),
    api.restoreWorkVersion('author', request),
  ]);
  assert.deepEqual(first, second);
  assert.equal((await admin.collection('books/book/workVersions').get()).size, 2);
  assert.equal(await read(first.previousVersion.id), 'Um texto novo');
  assert.equal((await admin.doc('books/book/workProgress/current').get()).data().wordCount, 2);
  assert.equal((await admin.doc('books/book').get()).data().wordCount, 2);
  assert.equal((await admin.doc('books/book').get()).data().historyRevision, 2);
  await save('Depois do recibo', 'later');
  await assert.rejects(api.restoreWorkVersion('author', request), { code: 'failed-precondition' });
  assert.equal((await source()).content, 'Depois do recibo');
  assert.equal((await admin.collection('books/book/workVersions').get()).size, 2);
  const other = await source();
  await assert.rejects(
    api.restoreWorkVersion('author', { ...request, expectedSourceToken: other.sourceToken }),
    { code: 'invalid-argument' },
  );
});

test('SDK scene history works for books and adventures and preserves planning, placement and archive while updating composition', async () => {
  for (const project of [target, { kind: 'adventure', id: 'adventure' }]) {
    const group = await scenes.createSceneGroup('author', {
        target: project,
        operationId: op('group-' + project.kind),
        title: 'Parte',
      }),
      initial = await scenes.createScene('author', {
        target: project,
        operationId: op('scene-' + project.kind),
        title: 'Cena',
        parentId: group.id,
        content: 'Texto inicial',
        planning: { objective: 'SEGREDO' },
      }),
      res = { kind: 'scene', id: initial.scene.id },
      { version } = await capture('version-' + project.kind, project, res);
    await prepare(project);
    const changed = await scenes.updateScene('author', {
      target: project,
      sceneId: res.id,
      operationId: op('edit-' + project.kind),
      expectedRevision: initial.scene.revision,
      patch: { content: 'Texto atual mais longo' },
    });
    const before = await scenes.getScene('author', { target: project, sceneId: res.id });
    const restored = await api.restoreWorkVersion('author', {
      target: project,
      resource: res,
      versionId: version.id,
      operationId: op('restore-' + project.kind),
      expectedSourceToken: (await source(project, res)).sourceToken,
    });
    assert.equal(restored.source.revision, changed.scene.revision + 1);
    const after = await scenes.getScene('author', { target: project, sceneId: res.id });
    assert.equal(after.content, 'Texto inicial');
    assert.deepEqual(after.planning, before.planning);
    assert.equal(after.parentId, before.parentId);
    assert.equal(after.rank, before.rank);
    assert.equal(after.group.wordCount, 2);
    const archived = await scenes.archiveScene('author', {
      target: project,
      sceneId: res.id,
      operationId: op('archive-' + project.kind),
      expectedRevision: after.revision,
      archived: true,
    });
    await scenes.updateScene('author', {
      target: project,
      sceneId: res.id,
      operationId: op('archive-edit-' + project.kind),
      expectedRevision: archived.scene.revision,
      patch: { content: 'Rascunho arquivado' },
    });
    await api.restoreWorkVersion('author', {
      target: project,
      resource: res,
      versionId: version.id,
      operationId: op('archive-restore-' + project.kind),
      expectedSourceToken: (await source(project, res)).sourceToken,
    });
    const result = await scenes.getScene('author', { target: project, sceneId: res.id });
    assert.equal(result.archived, true);
    assert.equal(result.group.wordCount, 0);
    assert.equal(
      (await api.getWorkHistoryBackupSource('author', { target: project })).historyRevision,
      3,
    );
    for (const uid of ['author', 'other', null])
      await assertFails(
        getDoc(
          doc(
            client(uid),
            (project.kind === 'book' ? 'books' : 'adventures') +
              '/' +
              project.id +
              '/workVersions/' +
              version.id,
          ),
        ),
      );
  }
});

test('SDK metadata pages and deleted-source versions remain private; explicit version and project deletion clean bodies', async () => {
  let selected;
  for (let index = 0; index < 27; index++)
    selected = (await capture('page-' + String(index).padStart(2, '0'))).version;
  const first = await api.listWorkVersions('author', { target, resource });
  assert.equal(first.items.length, 25);
  assert.equal('content' in first.items[0], false);
  const next = await api.listWorkVersions('author', { target, resource, cursor: first.nextCursor });
  assert.equal(next.items.length, 2);
  assert.equal(next.nextCursor, null);
  await assert.rejects(
    api.listWorkVersions('other', { target, resource, cursor: first.nextCursor }),
    { code: 'invalid-argument' },
  );
  await admin.doc('books/book/chapters/chapter').delete();
  assert.equal(await source(), null);
  assert.equal(await read(selected.id), '<p>Texto original</p>');
  const request = { target, versionId: selected.id, operationId: op('delete-version') },
    result = await api.deleteWorkVersion('author', request);
  assert.equal(result.complete, true);
  assert.deepEqual(await api.deleteWorkVersion('author', request), result);
  await assert.rejects(read(selected.id), { code: 'not-found' });
  assert.equal(
    (
      await admin
        .collection('books/book/workVersionBodies')
        .where('versionId', '==', selected.id)
        .get()
    ).size,
    0,
  );
  await admin.doc('books/book').update({ deleting: true });
  let cleanup;
  for (let index = 0; index < 50; index++) {
    cleanup = await scenes.deleteSceneBook('author', {
      target,
      operationId: op('delete-project'),
      limit: 25,
    });
    if (cleanup.complete) break;
  }
  assert.equal(cleanup.complete, true);
  assert.equal((await admin.collection('books/book/workVersions').get()).size, 0);
  assert.equal((await admin.collection('books/book/workVersionBodies').get()).size, 0);
  assert.equal((await admin.doc('books/book').get()).exists, false);
});

test('SDK backup source is read-only; native tokens reject root ABA, recreation, foreign UID and revocation', async () => {
  const ref = admin.doc('books/book'),
    initial = await ref.get();
  const first = await api.getWorkHistoryBackupSource('author', { target });
  assert.equal(first.historyRevision, 0);
  assert.equal((await ref.get()).updateTime.isEqual(initial.updateTime), true);
  await ref.update({ title: 'Outra' });
  await ref.update({ title: 'Livro' });
  const after = await api.getWorkHistoryBackupSource('author', { target });
  assert.equal(after.historyRevision, first.historyRevision);
  assert.notEqual(after.sourceToken, first.sourceToken);
  await assert.rejects(
    api.listWorkVersions('author', { target, expectedHistoryToken: first.sourceToken }),
    { code: 'failed-precondition', details: { reason: 'history-snapshot-changed' } },
  );
  const old = await ref.get();
  await ref.delete();
  await ref.set(old.data());
  assert.equal((await ref.get()).createTime.isEqual(old.createTime), false);
  await assert.rejects(
    api.listWorkVersions('author', { target, expectedHistoryToken: after.sourceToken }),
    { code: 'failed-precondition', details: { reason: 'history-snapshot-changed' } },
  );
  const current = await api.getWorkHistoryBackupSource('author', { target });
  await assert.rejects(api.getWorkHistoryBackupSource('other', { target }), { code: 'not-found' });
  await assert.rejects(
    api.listWorkVersions('other', { target, expectedHistoryToken: current.sourceToken }),
    { code: 'not-found' },
  );
  await assert.rejects(api.getWorkHistoryBackupSource(null, { target }), {
    code: 'unauthenticated',
  });
  await ref.update({ deleting: true });
  await assert.rejects(
    api.listWorkVersions('author', { target, expectedHistoryToken: current.sourceToken }),
    { code: 'not-found' },
  );
});

test('SDK concurrent catalog creation increments once per new receipt and guarded list rejects a changed page', async () => {
  await prepare();
  const observed = await source(),
    request = (name) => ({
      target,
      resource,
      operationId: op(name),
      expectedSourceToken: observed.sourceToken,
    });
  const [a, replay, b] = await Promise.all([
    api.createWorkVersion('author', request('epoch-a')),
    api.createWorkVersion('author', request('epoch-a')),
    api.createWorkVersion('author', request('epoch-b')),
  ]);
  assert.deepEqual(a, replay);
  assert.notEqual(a.version.id, b.version.id);
  assert.equal((await admin.doc('books/book').get()).data().historyRevision, 2);
  assert.equal((await admin.collection('books/book/workVersions').get()).size, 2);
  const epoch = await api.getWorkHistoryBackupSource('author', { target });
  const page = await api.listWorkVersions('author', {
    target,
    expectedHistoryToken: epoch.sourceToken,
    limit: 1,
  });
  assert.ok(page.nextCursor);
  await capture('epoch-c');
  await assert.rejects(
    api.listWorkVersions('author', {
      target,
      expectedHistoryToken: epoch.sourceToken,
      cursor: page.nextCursor,
      limit: 1,
    }),
    { code: 'failed-precondition', details: { reason: 'history-snapshot-changed' } },
  );
  assert.equal((await api.getWorkHistoryBackupSource('author', { target })).historyRevision, 3);
  assert.equal((await admin.doc('users/author').get()).data().credits, 7);
});

test('SDK interrupted version deletion changes selection once and bounded cleanup/replay preserves its new token', async () => {
  const { version } = await capture('epoch-delete');
  const old = await api.getWorkHistoryBackupSource('author', { target });
  const request = { target, versionId: version.id, operationId: op('epoch-delete-request') };
  let interrupt = true;
  const interrupted = createWorkHistoryService({
    db: {
      doc: (path) => admin.doc(path),
      collection: (path) => admin.collection(path),
      runTransaction: (work) =>
        admin.runTransaction((tx) =>
          work({
            get: tx.get.bind(tx),
            getAll: tx.getAll.bind(tx),
            set: tx.set.bind(tx),
            create: tx.create.bind(tx),
            update: tx.update.bind(tx),
            delete(ref) {
              if (interrupt && ref.path.includes('/workVersionBodies/')) {
                interrupt = false;
                throw new Error('Limpeza interrompida');
              }
              return tx.delete(ref);
            },
          }),
        ),
    },
  });
  await assert.rejects(interrupted.deleteWorkVersion('author', request), /Limpeza interrompida/);
  const epoch = await api.getWorkHistoryBackupSource('author', { target });
  assert.equal(epoch.historyRevision, 2);
  assert.notEqual(epoch.sourceToken, old.sourceToken);
  assert.equal(
    (await admin.doc('books/book/workVersions/' + version.id).get()).data().deleting,
    true,
  );
  assert.equal(
    (await api.listWorkVersions('author', { target, expectedHistoryToken: epoch.sourceToken }))
      .items.length,
    0,
  );
  await assert.rejects(
    api.readWorkVersion('author', {
      target,
      versionId: version.id,
      expectedHistoryToken: old.sourceToken,
    }),
    { code: 'failed-precondition', details: { reason: 'history-snapshot-changed' } },
  );
  assert.equal((await api.deleteWorkVersion('author', request)).complete, true);
  assert.deepEqual(await api.getWorkHistoryBackupSource('author', { target }), epoch);
  await api.deleteWorkVersion('author', request);
  assert.deepEqual(await api.getWorkHistoryBackupSource('author', { target }), epoch);
});

test('SDK guarded history retains a deleted chapter version and preserves exact Unicode without granting direct reads', async () => {
  const content = '<p>  ação 🐉 e ação  </p>';
  await admin.doc('books/book/chapters/chapter').update({ content });
  const { version } = await capture('epoch-removed');
  await admin.doc('books/book/chapters/chapter').delete();
  const epoch = await api.getWorkHistoryBackupSource('author', { target });
  const page = await api.listWorkVersions('author', {
    target,
    expectedHistoryToken: epoch.sourceToken,
  });
  assert.equal(page.items[0].id, version.id);
  const body = await api.readWorkVersion('author', {
    target,
    versionId: version.id,
    expectedHistoryToken: epoch.sourceToken,
  });
  assert.equal(body.chunks.map((row) => row.content).join(''), content);
  await assertFails(getDoc(doc(client(), 'books/book/workVersions/' + version.id)));
});

test('SDK Rules reserve catalog clock: clients cannot forge, reset, remove or increment it', async () => {
  await capture('epoch-rule');
  const ref = doc(client(), 'books/book');
  for (const historyRevision of [0, 2, null, deleteField()])
    await assertFails(updateDoc(ref, { historyRevision }));
  await assertSucceeds(updateDoc(ref, { title: 'Metadado próprio', updatedAt: 101 }));
  assert.equal((await admin.doc('books/book').get()).data().historyRevision, 1);
  const value = {
    authorId: 'author',
    title: 'Novo',
    status: 'draft',
    localLoreVersion: 0,
    createdAt: 1,
    updatedAt: 1,
    wordCount: 0,
  };
  await assertFails(setDoc(doc(client(), 'books/forged-clock'), { ...value, historyRevision: 1 }));
  await assertSucceeds(
    setDoc(doc(client(), 'books/legacy-zero'), { ...value, historyRevision: 0 }),
  );
  await assertFails(updateDoc(doc(client(), 'books/legacy-zero'), { historyRevision: 1 }));
});
