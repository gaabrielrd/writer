import { after, before, beforeEach, describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
let environment;
const act = { name: null, order: 1, createdAt: 100, updatedAt: 100 };
const db = (user = 'author') =>
  user
    ? environment.authenticatedContext(user).firestore()
    : environment.unauthenticatedContext().firestore();
async function seed() {
  await environment.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
    await setDoc(doc(firestore, 'books/book'), {
      authorId: 'author',
      title: 'Livro',
      status: 'draft',
      wordCount: 4,
      updatedAt: 100,
      actCount: 1,
    });
    await setDoc(doc(firestore, 'books/other'), {
      authorId: 'other',
      title: 'Outro',
      status: 'draft',
      updatedAt: 100,
    });
    await setDoc(doc(firestore, 'books/book/acts/a'), act);
    await setDoc(doc(firestore, 'books/other/acts/foreign'), act);
    await setDoc(doc(firestore, 'books/book/chapters/c'), {
      title: 'Texto',
      content: 'duas palavras',
      wordCount: 2,
      order: 1,
      updatedAt: 100,
    });
  });
}
describe('atos privados e projeção pública', { concurrency: false }, () => {
  before(async () => {
    environment = await initializeTestEnvironment({
      projectId: 'demo-writer-acts',
      firestore: { host, port: Number(port), rules: await readFile('firestore.rules', 'utf8') },
    });
  });
  beforeEach(async () => {
    await environment.clearFirestore();
    await seed();
  });
  after(async () => environment?.cleanup());
  it('permite criação atômica e leitura somente pelo autor', async () => {
    const firestore = db();
    const batch = writeBatch(firestore);
    batch.set(doc(firestore, 'books/book/acts/b'), { ...act, name: 'Virada', order: 2 });
    batch.update(doc(firestore, 'books/book'), { actCount: 2, updatedAt: 101 });
    await assertSucceeds(batch.commit());
    await assertSucceeds(getDocs(collection(firestore, 'books/book/acts')));
    await assertFails(getDoc(doc(db(null), 'books/book/acts/a')));
    await assertFails(getDoc(doc(db('intruder'), 'books/book/acts/a')));
    await assertFails(setDoc(doc(db('intruder'), 'books/book/acts/x'), act));
  });
  it('valida nomes, números e campos; atos são imutáveis e não podem ser excluídos isoladamente', async () => {
    const firestore = db();
    for (const invalid of [
      { ...act, name: 'a'.repeat(301) },
      { ...act, order: 0 },
      { ...act, privateNotes: 'secret' },
      { ...act, order: 4000 },
    ]) {
      await assertFails(setDoc(doc(firestore, 'books/book/acts/invalid'), invalid));
    }
    await assertFails(updateDoc(doc(firestore, 'books/book/acts/a'), { name: 'Outro' }));
    await assertFails(deleteDoc(doc(firestore, 'books/book/acts/a')));
    await assertSucceeds(updateDoc(doc(firestore, 'books/book'), { deleting: true }));
    await assertSucceeds(deleteDoc(doc(firestore, 'books/book/acts/a')));
  });
  it('aceita vínculo local ou Sem ato e recusa ato de outro livro e inexistente', async () => {
    const chapterRef = doc(db(), 'books/book/chapters/c');
    await assertSucceeds(updateDoc(chapterRef, { actId: 'a' }));
    await assertSucceeds(updateDoc(chapterRef, { actId: null }));
    await assertFails(updateDoc(chapterRef, { actId: 'foreign' }));
    await assertFails(updateDoc(chapterRef, { actId: 'missing' }));
    await assertFails(updateDoc(chapterRef, { actId: 7 }));
  });
  it('aceita exclusão em lote pelo autor e bloqueia intruso', async () => {
    const intruderDb = db('intruder');
    const intruder = writeBatch(intruderDb);
    intruder.delete(doc(intruderDb, 'books/book/chapters/c'));
    await assertFails(intruder.commit());
    const firestore = db();
    const batch = writeBatch(firestore);
    batch.delete(doc(firestore, 'books/book/chapters/c'));
    batch.update(doc(firestore, 'books/book'), { wordCount: 2, updatedAt: 101 });
    await assertSucceeds(batch.commit());
  });
  it('publica projeção de ato sem metadados privados e bloqueia revisões inativas e revogadas', async () => {
    const firestore = db();
    const revision = 'publicBooks/book/revisions/r1';
    await assertSucceeds(
      setDoc(doc(firestore, revision), {
        createdAt: 101,
        chapterCount: 1,
        loreCount: 0,
        privacyVersion: 0,
        actCount: 1,
      }),
    );
    await assertFails(setDoc(doc(firestore, revision + '/acts/fake'), { name: 'I', order: 1 }));
    await assertFails(
      setDoc(doc(firestore, revision + '/acts/a'), { name: 'I', order: 1, createdAt: 100 }),
    );
    await assertSucceeds(setDoc(doc(firestore, revision + '/acts/a'), { name: 'I', order: 1 }));
    await assertFails(
      setDoc(doc(firestore, revision + '/chapters/invalid'), {
        title: 'X',
        order: 1,
        content: 'X',
        actId: 'missing',
      }),
    );
    await assertSucceeds(
      setDoc(doc(firestore, revision + '/chapters/c'), {
        title: 'Texto',
        order: 1,
        content: 'duas palavras',
        actId: 'a',
      }),
    );
    await assertFails(getDoc(doc(db(null), revision + '/acts/a')));
    const publish = writeBatch(firestore);
    publish.set(doc(firestore, 'publicBooks/book'), {
      schemaVersion: 1,
      title: 'Livro',
      authorName: 'Autora',
      revisionId: 'r1',
      publishedAt: 101,
      hasActs: true,
    });
    publish.update(doc(firestore, 'books/book'), { status: 'published', updatedAt: 101 });
    await assertSucceeds(publish.commit());
    await assertSucceeds(getDocs(collection(db(null), revision + '/acts')));
    await assertSucceeds(getDoc(doc(db(null), revision + '/chapters/c')));
    await assertFails(updateDoc(doc(firestore, revision + '/acts/a'), { name: 'Alterado' }));
    await assertFails(deleteDoc(doc(firestore, revision + '/acts/a')));
    const revoke = writeBatch(firestore);
    revoke.delete(doc(firestore, 'publicBooks/book'));
    revoke.update(doc(firestore, 'books/book'), { status: 'draft', updatedAt: 102 });
    await assertSucceeds(revoke.commit());
    await assertFails(getDoc(doc(db(null), revision + '/acts/a')));
    await assertFails(getDoc(doc(db(null), revision + '/chapters/c')));
  });
});
