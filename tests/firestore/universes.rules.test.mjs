import { readFile } from 'node:fs/promises';
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
  query,
  where,
} from 'firebase/firestore';
let environment;
const root = {
  schemaVersion: 2,
  title: 'Atlas',
  authorName: 'Autora',
  revisionId: 'rev',
  publishedAt: 1,
  universeId: 'world',
  universePrivacyVersion: 0,
};
const revision = {
  createdAt: 1,
  chapterCount: 1,
  loreCount: 1,
  privacyVersion: 0,
  universeId: 'world',
  universePrivacyVersion: 0,
};
const lore = { name: 'Arthur', aliases: ['Rei'], category: 'character', summary: 'O rei' };
const revisionPath = 'publicBooks/book/revisions/rev';
const client = (uid) =>
  uid
    ? environment.authenticatedContext(uid).firestore()
    : environment.unauthenticatedContext().firestore();
before(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Use somente o emulador demo.');
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
  environment = await initializeTestEnvironment({
    projectId: 'demo-writer-universes',
    firestore: { host, port: Number(port), rules: await readFile('firestore.rules', 'utf8') },
  });
});
after(async () => environment?.cleanup());
beforeEach(async () => {
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, 'universes/world'), {
        authorId: 'author',
        name: 'Atlas',
        description: 'SEGREDO',
        privacyVersion: 0,
        bookCount: 1,
      }),
      setDoc(doc(db, 'universes/world/lore/arthur'), {
        ...lore,
        isPublic: true,
        details: 'SEGREDO',
      }),
      setDoc(doc(db, 'universes/world/lore/private'), {
        ...lore,
        isPublic: false,
        notes: 'SEGREDO',
      }),
      setDoc(doc(db, 'publicUniversePrivacy/world'), { version: 0, active: true }),
      setDoc(doc(db, 'books/book'), {
        authorId: 'author',
        universeId: 'world',
        status: 'published',
        updatedAt: 1,
      }),
      setDoc(doc(db, 'books/book/lore/local'), { ...lore, isPublic: true }),
    ]);
  });
});
async function publish() {
  const db = client('author');
  await assertSucceeds(setDoc(doc(db, revisionPath), revision));
  await assertSucceeds(
    setDoc(doc(db, `${revisionPath}/chapters/ch`), {
      title: 'Um',
      order: 1,
      content: '<p>Arthur</p>',
    }),
  );
  await assertSucceeds(
    setDoc(doc(db, `${revisionPath}/lore/universe:world:arthur`), {
      ...lore,
      sourceEntityId: 'arthur',
    }),
  );
  await assertSucceeds(setDoc(doc(db, 'publicBooks/book'), root));
}

test('isolates universe originals by author and makes management and relationships server-only', async () => {
  for (const path of [
    'universes/world',
    'universes/world/lore/arthur',
    'universes/world/lore/private',
  ]) {
    await assertSucceeds(getDoc(doc(client('author'), path)));
    for (const uid of [null, 'other']) await assertFails(getDoc(doc(client(uid), path)));
    await assertFails(updateDoc(doc(client('author'), path), { name: 'Takeover' }));
    await assertFails(deleteDoc(doc(client('author'), path)));
  }
  await assertSucceeds(
    getDocs(query(collection(client('author'), 'universes'), where('authorId', '==', 'author'))),
  );
  await assertFails(getDocs(collection(client('author'), 'universes')));
  await assertFails(setDoc(doc(client('author'), 'universes/new'), { authorId: 'author' }));
  await assertFails(
    setDoc(doc(client('author'), 'universes/world/books/book'), { bookId: 'book' }),
  );
  await assertFails(updateDoc(doc(client('author'), 'books/book'), { universeId: null }));
  await assertFails(
    setDoc(doc(client('author'), 'books/new'), {
      authorId: 'author',
      status: 'draft',
      universeId: 'world',
    }),
  );
});
test('exposes only the minimal revocation signal, without allowing callers to forge it', async () => {
  await assertSucceeds(getDoc(doc(client(), 'publicUniversePrivacy/world')));
  await assertFails(getDocs(collection(client(), 'publicUniversePrivacy')));
  await assertFails(
    updateDoc(doc(client('author'), 'publicUniversePrivacy/world'), { version: 0 }),
  );
});
test('publishes authorized global projections and immediately blocks all stale direct reads on revocation', async () => {
  await publish();
  for (const path of [
    'publicBooks/book',
    revisionPath,
    `${revisionPath}/chapters/ch`,
    `${revisionPath}/lore/universe:world:arthur`,
  ])
    await assertSucceeds(getDoc(doc(client(), path)));
  await environment.withSecurityRulesDisabled((context) =>
    updateDoc(doc(context.firestore(), 'publicUniversePrivacy/world'), { version: 1 }),
  );
  for (const path of [
    'publicBooks/book',
    revisionPath,
    `${revisionPath}/chapters/ch`,
    `${revisionPath}/lore/universe:world:arthur`,
  ])
    await assertFails(getDoc(doc(client(), path)));
  await assertFails(getDocs(collection(client(), `${revisionPath}/chapters`)));
  await assertFails(setDoc(doc(client('author'), 'publicBooks/book'), root));
  await assertFails(setDoc(doc(client('author'), 'publicBooks/book/revisions/replay'), revision));
});
test('rejects private global lore, forged provenance, private fields and omitted universe versions', async () => {
  const db = client('author');
  await assertFails(
    setDoc(doc(db, revisionPath), {
      createdAt: 1,
      chapterCount: 1,
      loreCount: 1,
      privacyVersion: 0,
    }),
  );
  await assertSucceeds(setDoc(doc(db, revisionPath), revision));
  await assertFails(
    setDoc(doc(db, `${revisionPath}/lore/universe:world:private`), {
      ...lore,
      sourceEntityId: 'private',
    }),
  );
  await assertFails(
    setDoc(doc(db, `${revisionPath}/lore/fake`), { ...lore, sourceEntityId: 'arthur' }),
  );
  await assertFails(
    setDoc(doc(db, `${revisionPath}/lore/universe:world:arthur`), {
      ...lore,
      sourceEntityId: 'arthur',
      details: 'SEGREDO',
    }),
  );
  await assertFails(setDoc(doc(db, 'publicBooks/book'), { ...root, schemaVersion: 1 }));
  await assertFails(setDoc(doc(db, 'publicBooks/book'), { ...root, universeId: 'foreign' }));
});
test('deleting a universe revokes snapshots without exposing its private document to readers', async () => {
  await publish();
  await environment.withSecurityRulesDisabled((context) =>
    updateDoc(doc(context.firestore(), 'publicUniversePrivacy/world'), { active: false }),
  );
  await assertFails(getDoc(doc(client(), 'publicBooks/book')));
  await assertFails(getDoc(doc(client(), `${revisionPath}/chapters/ch`)));
});
