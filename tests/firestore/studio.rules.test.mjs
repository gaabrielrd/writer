import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
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
  where,
} from 'firebase/firestore';
import { createStudioService } from '../../functions/src/studio.mjs';
import { createUniverseService } from '../../functions/src/universes.mjs';
import { createChapterChatService } from '../../functions/src/chapterChat.mjs';

const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url));
const { Firestore } = requireFunctions('firebase-admin/firestore');
const projectId = 'demo-writer-studio-tests';
let environment, admin, studio, universes;
const metadataDetection = process.env.METADATA_SERVER_DETECTION;
const operationId = 'studio-emulator-operation';
const client = (uid = 'author') =>
  uid
    ? environment.authenticatedContext(uid).firestore()
    : environment.unauthenticatedContext().firestore();

before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!address) throw new Error('Use somente o emulador demo.');
  // This local SDK client must not probe Google metadata or an account environment.
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
  studio = createStudioService({ db: admin });
  universes = createUniverseService({ db: admin });
});
beforeEach(async () => environment.clearFirestore());
after(async () => {
  await admin?.terminate();
  await environment?.cleanup();
  if (metadataDetection === undefined) delete process.env.METADATA_SERVER_DETECTION;
  else process.env.METADATA_SERVER_DETECTION = metadataDetection;
});

test('private originals keep adventure owner queries and server-only campaigns; all writes and children are closed', async () => {
  const adventure = await studio.createAdventure('author', {
    operationId,
    title: 'Aventura',
    synopsis: 'SEGREDO',
  });
  const campaign = await studio.createCampaign('author', {
    operationId: operationId + '-campaign',
    title: 'Mesa',
    description: 'SEGREDO',
  });
  for (const [kind, value] of [
    ['adventures', adventure],
    ['campaigns', campaign],
  ]) {
    const path = `${kind}/${value.id}`;
    const ownerRead = kind === 'campaigns' ? assertFails : assertSucceeds;
    await ownerRead(getDoc(doc(client(), path)));
    for (const uid of [null, 'other']) {
      await assertFails(getDoc(doc(client(uid), path)));
      await assertFails(
        getDocs(query(collection(client(uid), kind), where('ownerId', '==', 'author'), limit(25))),
      );
    }
    await ownerRead(
      getDocs(query(collection(client(), kind), where('ownerId', '==', 'author'), limit(50))),
    );
    await assertFails(getDocs(query(collection(client(), kind), where('ownerId', '==', 'author'))));
    await assertFails(
      getDocs(query(collection(client(), kind), where('ownerId', '==', 'author'), limit(51))),
    );
    await assertFails(getDocs(query(collection(client(), kind), limit(25))));
    await assertFails(setDoc(doc(client(), `${kind}/forged`), value));
    await assertFails(updateDoc(doc(client(), path), { ownerId: 'other' }));
    await assertFails(deleteDoc(doc(client(), path)));
    await admin.doc(`${path}/notes/private`).set({ secret: true });
    await assertFails(getDoc(doc(client(), `${path}/notes/private`)));
    await assertFails(setDoc(doc(client(), `${path}/notes/forged`), { secret: true }));
  }
  assert.equal(await studio.getAdventure('other', { id: operationId }), null);
  assert.equal(await studio.getAdventure('author', { id: operationId + '-absent' }), null);
  assert.deepEqual(await studio.listStudioProjects('other', { kind: 'adventure' }), {
    items: [],
    nextCursor: null,
  });
});

test('receipts, preparation progress and typed universe references are server-only', async () => {
  await universes.createUniverse('author', { creationId: 'world', name: 'Atlas' });
  await studio.createAdventure('author', { operationId, title: 'Aventura', universeId: 'world' });
  await studio.createCampaign('author', {
    operationId: operationId + '-campaign',
    title: 'Mesa',
    universeId: 'world',
  });
  await studio.prepareStudioBooks('author');
  for (const path of [
    `users/author/studioOperations/${operationId}`,
    'users/author/studioPreparation/books-v1',
    `universes/world/adventures/${operationId}`,
    `universes/world/campaigns/${operationId}-campaign`,
  ]) {
    for (const uid of ['author', 'other', null]) {
      await assertFails(getDoc(doc(client(uid), path)));
      await assertFails(setDoc(doc(client(uid), path), { forged: true }));
      await assertFails(deleteDoc(doc(client(uid), path)));
    }
  }
});

test('book dates cannot be omitted at creation or removed after normalization; legacy fields stay usable', async () => {
  const value = { authorId: 'author', title: 'Livro', status: 'draft', createdAt: 1, updatedAt: 2 };
  await assertSucceeds(setDoc(doc(client(), 'books/new'), value));
  for (const key of ['createdAt', 'updatedAt']) {
    for (const invalid of [null, 'date', -1, Infinity, NaN, 9_000_000_000_000_000])
      await assertFails(setDoc(doc(client(), 'books/invalid'), { ...value, [key]: invalid }));
    const without = { ...value };
    delete without[key];
    await assertFails(setDoc(doc(client(), 'books/invalid'), without));
    await assertFails(updateDoc(doc(client(), 'books/new'), { [key]: deleteField() }));
    await assertFails(updateDoc(doc(client(), 'books/new'), { [key]: null }));
  }
  await admin.doc('books/legacy').set({ authorId: 'author', title: 'Antigo', status: 'draft' });
  await assertSucceeds(updateDoc(doc(client(), 'books/legacy'), { title: 'Ainda editável' }));
  await studio.prepareStudioBooks('author');
  await assertFails(updateDoc(doc(client(), 'books/legacy'), { updatedAt: deleteField() }));
  await assertSucceeds(
    updateDoc(doc(client(), 'books/legacy'), { title: 'Editado', updatedAt: 300 }),
  );
  await assertFails(setDoc(doc(client('other'), 'books/takeover'), value));
});

test('real snapshot metadata repairs legacy books without fabricating dates or losing content', async () => {
  await admin.doc('books/old_id').set({
    authorId: 'author',
    title: 'Antigo',
    content: 'PROSA',
    coverUrl: 'CAPA',
    createdAt: 9_000_000_000_000_000,
    updatedAt: 9_000_000_000_000_000,
    genre: 'Fantasia',
    synopsis: 'Sinopse',
  });
  const beforeRepair = await admin.doc('books/old_id').get();
  await admin
    .doc('books/valid')
    .set({ authorId: 'author', title: 'Atual', createdAt: 5, updatedAt: 500, status: 'published' });
  await admin.doc('books/foreign').set({ authorId: 'other', title: 'Outro' });
  await assert.rejects(studio.listStudioProjects('author', { kind: 'book' }), {
    code: 'failed-precondition',
  });
  assert.deepEqual(await studio.prepareStudioBooks('author', { limit: 1 }), {
    complete: false,
    processed: 1,
  });
  assert.deepEqual(await studio.prepareStudioBooks('author', { limit: 1 }), {
    complete: false,
    processed: 2,
  });
  assert.deepEqual(await studio.prepareStudioBooks('author', { limit: 1 }), {
    complete: true,
    processed: 2,
  });
  const repaired = (await admin.doc('books/old_id').get()).data();
  assert.equal(repaired.updatedAt, beforeRepair.updateTime.toMillis());
  assert.equal(repaired.createdAt, beforeRepair.createTime.toMillis());
  assert.equal(repaired.status, 'draft');
  assert.equal(repaired.content, 'PROSA');
  assert.equal(repaired.coverUrl, 'CAPA');
  assert.equal((await admin.doc('books/valid').get()).data().updatedAt, 500);
  assert.equal((await admin.doc('books/foreign').get()).data().updatedAt, undefined);
  const page = await studio.listStudioProjects('author', { kind: 'book', status: 'draft' });
  assert.equal(page.items[0].id, 'old_id');
  assert.equal(page.items[0].genre, 'Fantasia');
  assert.equal('content' in page.items[0], false);
  assert.doesNotThrow(() => new Date(page.items[0].updatedAt).toISOString());
  const forged = Buffer.from(
    JSON.stringify({
      version: 1,
      uid: 'author',
      kind: 'book',
      status: 'draft',
      updatedAt: 9_000_000_000_000_000,
      id: 'old_id',
    }),
  ).toString('base64url');
  await assert.rejects(
    studio.listStudioProjects('author', { kind: 'book', status: 'draft', cursor: forged }),
    { code: 'invalid-argument' },
  );
});

test('SDK pagination uses exact update/id cursors, filters and authorization', async () => {
  const batch = admin.batch();
  for (let i = 0; i < 27; i++)
    batch.set(admin.doc(`campaigns/id-${String(i).padStart(2, '0')}`), {
      ownerId: 'author',
      title: String(i),
      status: i === 0 ? 'completed' : 'planning',
      revision: 1,
      createdAt: 1,
      updatedAt: 100,
      description: 'SEGREDO',
    });
  batch.set(admin.doc('campaigns/foreign'), {
    ownerId: 'other',
    status: 'planning',
    updatedAt: 500,
  });
  await batch.commit();
  const first = await studio.listStudioProjects('author', { kind: 'campaign' });
  assert.equal(first.items.length, 25);
  assert.equal(first.items[0].id, 'id-26');
  assert.ok(first.nextCursor);
  const second = await studio.listStudioProjects('author', {
    kind: 'campaign',
    cursor: first.nextCursor,
  });
  assert.deepEqual(
    second.items.map((item) => item.id),
    ['id-01', 'id-00'],
  );
  assert.equal(second.nextCursor, null);
  const filtered = await studio.listStudioProjects('author', {
    kind: 'campaign',
    status: 'completed',
  });
  assert.deepEqual(
    filtered.items.map((item) => item.id),
    ['id-00'],
  );
  assert.equal('description' in first.items[0], false);
  await assert.rejects(
    studio.listStudioProjects('other', { kind: 'campaign', cursor: first.nextCursor }),
    { code: 'invalid-argument' },
  );
  await assert.rejects(
    studio.listStudioProjects('author', {
      kind: 'campaign',
      status: 'planning',
      cursor: first.nextCursor,
    }),
    { code: 'invalid-argument' },
  );
});

test('SDK editorial windows preserve current and legacy states beyond an empty first page', async () => {
  const batch = admin.batch();
  for (let i = 0; i < 29; i++) {
    const value = {
      ownerId: 'author',
      title: String(i),
      status: 'ready',
      editorialState: 'ready',
      createdAt: 1,
      updatedAt: 100,
      synopsis: 'SEGREDO',
      content: 'PROSA',
    };
    if (i === 0) value.editorialState = 'draft';
    if (i === 1) {
      value.status = 'draft';
      delete value.editorialState;
    }
    if (i === 2) value.editorialState = 'review';
    if (i === 3) value.status = 'draft';
    if (i === 4) value.editorialState = 'invalid';
    batch.set(admin.doc(`adventures/id-${String(i).padStart(2, '0')}`), value);
  }
  batch.set(admin.doc('adventures/foreign'), {
    ownerId: 'other',
    status: 'draft',
    editorialState: 'draft',
    updatedAt: 500,
  });
  await batch.commit();
  const request = { kind: 'adventure', editorialState: 'draft' };
  const first = await studio.listStudioProjects('author', request);
  assert.deepEqual(first.items, []);
  assert.equal(JSON.parse(Buffer.from(first.nextCursor, 'base64url').toString()).id, 'id-04');
  const next = await studio.listStudioProjects('author', { ...request, cursor: first.nextCursor });
  assert.deepEqual(
    next.items.map(({ id, status, editorialState }) => [id, status, editorialState]),
    [
      ['id-01', 'draft', 'draft'],
      ['id-00', 'ready', 'draft'],
    ],
  );
  assert.equal(next.nextCursor, null);
  assert.equal('content' in next.items[0], false);
  assert.equal('synopsis' in next.items[0], false);
  const review = await studio.listStudioProjects('author', {
    kind: 'adventure',
    editorialState: 'review',
  });
  assert.deepEqual(review.items, []);
  assert.deepEqual(
    (
      await studio.listStudioProjects('author', {
        kind: 'adventure',
        editorialState: 'review',
        cursor: review.nextCursor,
      })
    ).items.map((item) => item.id),
    ['id-02'],
  );
  const ready = await studio.listStudioProjects('author', {
    kind: 'adventure',
    editorialState: 'ready',
  });
  assert.equal(ready.items.length, 25);
  assert.equal(ready.items.at(-1).id, 'id-04');
  assert.equal(ready.items.at(-1).editorialState, 'ready');
  assert.deepEqual(
    (
      await studio.listStudioProjects('author', {
        kind: 'adventure',
        editorialState: 'ready',
        cursor: ready.nextCursor,
      })
    ).items.map((item) => item.id),
    ['id-03'],
  );
  const combined = await studio.listStudioProjects('author', {
    kind: 'adventure',
    status: 'ready',
    editorialState: 'draft',
    limit: 50,
  });
  assert.deepEqual(
    combined.items.map((item) => item.id),
    ['id-00'],
  );
  assert.equal((await admin.doc('adventures/id-00').get()).data().status, 'ready');
  for (const [uid, patch] of [
    ['other', {}],
    ['author', { editorialState: 'review' }],
    ['author', { editorialState: 'all' }],
    ['author', { status: 'ready' }],
    ['author', { kind: 'book' }],
  ])
    await assert.rejects(
      studio.listStudioProjects(uid, { ...request, cursor: first.nextCursor, ...patch }),
      { code: 'invalid-argument' },
    );
});

test('SDK editorial book state is independent of publication and old cursors only resume all states', async () => {
  for (const [id, editorialState] of [
    ['legacy', undefined],
    ['review', 'review'],
    ['ready', 'ready'],
  ]) {
    const value = {
      authorId: 'author',
      title: id,
      status: 'published',
      createdAt: 1,
      updatedAt: 100,
      content: 'PROSA',
    };
    if (editorialState) value.editorialState = editorialState;
    await admin.doc(`books/${id}`).set(value);
  }
  await studio.prepareStudioBooks('author');
  for (const [editorialState, id] of [
    ['draft', 'legacy'],
    ['review', 'review'],
    ['ready', 'ready'],
  ]) {
    const page = await studio.listStudioProjects('author', {
      kind: 'book',
      status: 'published',
      editorialState,
    });
    assert.deepEqual(
      page.items.map((item) => item.id),
      [id],
    );
    assert.equal(page.items[0].status, 'published');
    assert.equal(page.items[0].editorialState, editorialState);
    assert.equal('content' in page.items[0], false);
  }
  const first = await studio.listStudioProjects('author', { kind: 'book', limit: 1 });
  const cursor = JSON.parse(Buffer.from(first.nextCursor, 'base64url').toString());
  delete cursor.editorialState;
  const legacyCursor = Buffer.from(JSON.stringify(cursor)).toString('base64url');
  const next = await studio.listStudioProjects('author', { kind: 'book', cursor: legacyCursor });
  assert.deepEqual(
    next.items.map((item) => item.id),
    ['ready', 'legacy'],
  );
  await assert.rejects(
    studio.listStudioProjects('author', {
      kind: 'book',
      editorialState: 'ready',
      cursor: legacyCursor,
    }),
    { code: 'invalid-argument' },
  );
});

test('concurrent real creation retries create one project, receipt and universe reference', async () => {
  await universes.createUniverse('author', { creationId: 'world', name: 'Atlas' });
  const request = { operationId, title: 'Mesa', universeId: 'world' };
  const results = await Promise.all([
    studio.createCampaign('author', request),
    studio.createCampaign('author', request),
  ]);
  assert.deepEqual(results[0], results[1]);
  assert.equal((await admin.doc('universes/world').get()).data().campaignCount, 1);
  assert.equal((await admin.collection('universes/world/campaigns').get()).size, 1);
  assert.equal((await admin.collection('users/author/studioOperations').get()).size, 1);
  await assert.rejects(studio.createCampaign('author', { ...request, description: 'Outro' }), {
    code: 'invalid-argument',
  });
  await admin.doc(`campaigns/${operationId}`).delete();
  await assert.rejects(studio.createCampaign('author', request), { code: 'failed-precondition' });
  assert.equal((await admin.doc(`campaigns/${operationId}`).get()).exists, false);
});

test('real transactions serialize book preparation and concurrent edits without overwriting valid values', async () => {
  await admin.doc('books/legacy').set({ authorId: 'author', title: 'Original', status: 'draft' });
  await Promise.all([
    studio.prepareStudioBooks('author'),
    admin.runTransaction(async (tx) => {
      const snapshot = await tx.get(admin.doc('books/legacy'));
      assert.equal(snapshot.data().authorId, 'author');
      tx.update(snapshot.ref, {
        updatedAt: 1234,
        title: 'Edição concorrente',
        status: 'published',
      });
    }),
  ]);
  const record = (await admin.doc('books/legacy').get()).data();
  assert.equal(record.updatedAt, 1234);
  assert.equal(record.title, 'Edição concorrente');
  assert.equal(record.status, 'published');
  assert.equal(typeof record.createdAt, 'number');
});

test('real universe deletion racing typed creation cannot leave orphaned projects or references', async () => {
  for (const kind of ['adventure', 'campaign']) {
    const world = `race-${kind}`;
    const id = `${operationId}-${kind}`;
    await universes.createUniverse('author', { creationId: world, name: 'Atlas' });
    const create = kind === 'adventure' ? studio.createAdventure : studio.createCampaign;
    const results = await Promise.allSettled([
      create('author', { operationId: id, title: 'Projeto', universeId: world }),
      universes.deleteUniverse('author', { id: world }),
    ]);
    const project = await admin
      .doc(`${kind === 'adventure' ? 'adventures' : 'campaigns'}/${id}`)
      .get();
    const universe = await admin.doc(`universes/${world}`).get();
    if (results[0].status === 'fulfilled') {
      assert.equal(results[1].status, 'rejected');
      assert.ok(project.exists && universe.exists);
      assert.equal(universe.data().deleting, undefined);
      assert.equal(universe.data()[`${kind}Count`], 1);
    } else {
      assert.equal(results[1].status, 'fulfilled');
      assert.equal(project.exists, false);
      assert.equal(universe.exists, false);
      assert.equal((await admin.doc(`users/author/studioOperations/${id}`).get()).exists, false);
    }
  }
});

test('bounded reference checks protect universes even with zero counters', async () => {
  await universes.createUniverse('author', { creationId: 'world', name: 'Atlas' });
  for (const kind of ['books', 'adventures', 'campaigns']) {
    const ref = admin.doc(`universes/world/${kind}/orphan-reference`);
    await ref.set({});
    await assert.rejects(universes.deleteUniverse('author', { id: 'world' }), {
      code: 'failed-precondition',
    });
    assert.equal((await admin.doc('universes/world').get()).data().deleting, undefined);
    await ref.delete();
  }
});

test('Admin AI acceptance rejects invalid monotonic dates before writes or credits and can retry', async () => {
  const hash = (value) => createHash('sha256').update(value).digest('hex');
  const identity = { bookId: 'book', chapterId: 'chapter', conversationId: 'conversation' };
  const context = {
    source: 'selection',
    text: 'Texto',
    surrounding: 'Texto',
    title: 'Capítulo',
    bookTitle: 'Livro',
    truncated: false,
    persona: { instruction: '', version: '' },
    lore: [],
    target: { hash: hash('<p>Texto</p>'), from: 1, to: 6 },
  };
  const chat = createChapterChatService({
    db: admin,
    generator: async () => 'Uma análise. [[SUGESTAO]]Novo texto[[/SUGESTAO]]',
  });
  for (const [path, invalid] of [
    ['books/book/chapters/chapter', Infinity],
    ['books/book', 8_640_000_000_000_000],
  ]) {
    await admin.doc('books/book').set({
      authorId: 'author',
      title: 'Livro',
      wordCount: 1,
      status: 'draft',
      createdAt: 1,
      updatedAt: 1,
    });
    await admin
      .doc('books/book/chapters/chapter')
      .set({ content: '<p>Texto</p>', wordCount: 1, updatedAt: 1 });
    await admin.doc('users/author').set({ credits: 5 });
    await chat.chapterChat('author', { ...identity, action: 'create' });
    const requestId = path === 'books/book' ? 'max-date' : 'infinite-date';
    await chat.chapterChat('author', {
      ...identity,
      action: 'send',
      requestId,
      text: '/reescrever',
      context,
    });
    await admin.doc(path).update({ updatedAt: invalid });
    const receipt = `users/author/chapterChats/book/chapters/chapter/receipts/${requestId}`;
    const watched = [
      'books/book',
      'books/book/chapters/chapter',
      'users/author',
      `users/author/chapterChats/book/chapters/chapter/conversations/conversation/messages/${requestId}`,
    ];
    const before = await Promise.all(watched.map((item) => admin.doc(item).get()));
    const accept = {
      ...identity,
      action: 'apply',
      requestId,
      messageId: requestId,
      expectedHash: hash('<p>Texto</p>'),
      sourceHash: context.target.hash,
      after: '<p>Novo texto</p>',
    };
    await assert.rejects(chat.chapterChat('author', accept), { code: 'failed-precondition' });
    const after = await Promise.all(watched.map((item) => admin.doc(item).get()));
    for (let i = 0; i < before.length; i++) {
      assert.deepEqual(after[i].data(), before[i].data());
      assert.equal(after[i].updateTime.toMillis(), before[i].updateTime.toMillis());
    }
    assert.equal((await admin.doc(receipt).get()).exists, false);
    await admin.doc(path).update({ updatedAt: 100 });
    const applied = await chat.chapterChat('author', accept);
    assert.equal((await admin.doc('users/author').get()).data().credits, 4);
    assert.equal(
      (await admin.doc('books/book/chapters/chapter').get()).data().content,
      '<p>Novo texto</p>',
    );
    assert.equal((await admin.doc(receipt).get()).exists, true);
    assert.deepEqual(await chat.chapterChat('author', accept), applied);
    assert.equal((await admin.doc('users/author').get()).data().credits, 4);
  }
});
