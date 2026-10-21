import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
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
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

const projectId = 'demo-writer-publication-tests';
const [host, rawPort] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
let environment;
const bookId = 'book-1';
const bookPath = `books/${bookId}`;
const rootPath = `publicBooks/${bookId}`;
const revisionPath = `${rootPath}/revisions/rev-1`;
const privateBook = {
  authorId: 'author',
  title: 'Livro',
  status: 'published',
  createdAt: 100,
  updatedAt: 100,
};
const root = {
  schemaVersion: 1,
  title: 'Livro',
  authorName: 'Pseudônimo',
  revisionId: 'rev-1',
  publishedAt: 100,
};
const revision = { createdAt: 100, chapterCount: 1, loreCount: 1, privacyVersion: 0 };
const chapter = { title: 'Capítulo', order: 1, content: '<p>Texto público.</p>' };
const lore = {
  name: 'Heroína',
  aliases: ['Luz'],
  category: 'character',
  summary: 'Resumo público.',
};

function db(userId) {
  return userId
    ? environment.authenticatedContext(userId).firestore()
    : environment.unauthenticatedContext().firestore();
}

async function seed(overrides = {}) {
  await environment.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
    await Promise.all([
      setDoc(doc(firestore, bookPath), { ...privateBook, ...overrides }),
      setDoc(doc(firestore, `${bookPath}/chapters/ch-1`), { ...chapter, draftNotes: 'SEGREDO' }),
      setDoc(doc(firestore, `${bookPath}/lore/lore-1`), {
        ...lore,
        isPublic: true,
        details: 'SEGREDO',
        relations: [{ targetEntityId: 'private-lore' }],
      }),
      setDoc(doc(firestore, `${bookPath}/lore/private-lore`), { ...lore, isPublic: false }),
      setDoc(doc(firestore, rootPath), root),
      setDoc(doc(firestore, revisionPath), revision),
      setDoc(doc(firestore, `${revisionPath}/chapters/ch-1`), chapter),
      setDoc(doc(firestore, `${revisionPath}/lore/lore-1`), lore),
    ]);
  });
}

describe('publicação segura no Firestore', { concurrency: false }, () => {
  before(async () => {
    environment = await initializeTestEnvironment({
      projectId,
      firestore: { host, port: Number(rawPort), rules: await readFile('firestore.rules', 'utf8') },
    });
  });
  beforeEach(async () => environment.clearFirestore());
  after(async () => environment?.cleanup());

  it('nega todos os originais anônimos, inclusive lore público de livro publicado', async () => {
    await seed();
    for (const path of [
      bookPath,
      `${bookPath}/chapters/ch-1`,
      `${bookPath}/lore/lore-1`,
      `${bookPath}/lore/private-lore`,
    ]) {
      await assertFails(getDoc(doc(db(), path)));
      await assertFails(getDoc(doc(db('other-author'), path)));
      await assertSucceeds(getDoc(doc(db('author'), path)));
    }
  });

  it('permite leitura anônima apenas da projeção atual e suas coleções', async () => {
    await seed();
    const snapshot = await assertSucceeds(getDoc(doc(db(), rootPath)));
    assert.deepEqual(snapshot.data(), root);
    await assertSucceeds(getDoc(doc(db(), `${revisionPath}/chapters/ch-1`)));
    await assertSucceeds(getDocs(collection(db(), `${revisionPath}/chapters`)));
    const entities = await assertSucceeds(getDocs(collection(db(), `${revisionPath}/lore`)));
    assert.deepEqual(
      entities.docs.map((entity) => entity.data()),
      [lore],
    );
    await assertFails(getDocs(collection(db(), 'publicBooks')));
    await assertFails(getDocs(collection(db(), `${rootPath}/revisions`)));
  });

  it('bloqueia rascunhos, revisões antigas, preparação e livros inexistentes', async () => {
    await seed({ status: 'draft' });
    await assertFails(getDoc(doc(db(), rootPath)));
    await assertFails(getDoc(doc(db(), `${revisionPath}/chapters/ch-1`)));
    await assertFails(getDoc(doc(db(), `${revisionPath}/lore/lore-1`)));
    await seed();
    await assertFails(getDoc(doc(db(), `${rootPath}/revisions/pending/chapters/ch-1`)));
    await assertFails(getDoc(doc(db(), 'publicBooks/missing')));
  });

  it('impede tomar autoria e escrever projeções de outro autor', async () => {
    await seed();
    await assertFails(updateDoc(doc(db('author'), bookPath), { authorId: 'other-author' }));
    await assertFails(setDoc(doc(db('other-author'), rootPath), root));
    await assertFails(setDoc(doc(db('other-author'), `${rootPath}/revisions/pending`), revision));
    await assertFails(setDoc(doc(db(), rootPath), root));
  });

  it('rejeita publicação sem projeção e originais criados publicados', async () => {
    const owner = db('author');
    await assertFails(setDoc(doc(owner, 'books/new'), { ...privateBook, localLoreVersion: 0 }));
    await assertSucceeds(
      setDoc(doc(owner, 'books/new'), { ...privateBook, localLoreVersion: 0, status: 'draft' }),
    );
    await assertFails(updateDoc(doc(owner, 'books/new'), { status: 'published' }));
  });

  it('permite editar livro legado publicado sem expor originais nem exigir migração implícita', async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), bookPath), privateBook);
    });
    await assertSucceeds(
      updateDoc(doc(db('author'), bookPath), { title: 'Rascunho revisado', wordCount: 42 }),
    );
    await assertSucceeds(setDoc(doc(db('author'), `${bookPath}/chapters/new`), chapter));
    await assertFails(getDoc(doc(db(), bookPath)));
    await assertFails(getDoc(doc(db(), `${bookPath}/chapters/new`)));
    assert.equal((await getDoc(doc(db(), rootPath))).exists(), false);
  });

  it('rejeita campos privados e tipos inválidos em toda projeção', async () => {
    await seed();
    const owner = db('author');
    const pending = `${rootPath}/revisions/pending`;
    for (const extra of [{ authorId: 'author' }, { apiKey: 'segredo' }, { synopsis: 'rascunho' }]) {
      await assertFails(setDoc(doc(owner, rootPath), { ...root, ...extra }));
    }
    await assertFails(setDoc(doc(owner, rootPath), { ...root, authorName: '' }));
    await assertFails(setDoc(doc(owner, rootPath), { ...root, revisionId: 'missing' }));
    await assertFails(setDoc(doc(owner, pending), { ...revision, privateNotes: 'segredo' }));
    await assertSucceeds(setDoc(doc(owner, pending), revision));
    await assertFails(
      setDoc(doc(owner, `${pending}/chapters/ch-1`), { ...chapter, authorId: 'author' }),
    );
    await assertFails(setDoc(doc(owner, `${pending}/chapters/ch-1`), { ...chapter, order: '1' }));
    for (const extra of [
      { details: 'segredo' },
      { relations: [] },
      { bookId },
      { isPublic: true },
    ]) {
      await assertFails(setDoc(doc(owner, `${pending}/lore/lore-1`), { ...lore, ...extra }));
    }
    await assertFails(
      setDoc(doc(owner, `${pending}/lore/lore-1`), { ...lore, aliases: [{ privateId: 'secret' }] }),
    );
    await assertFails(setDoc(doc(owner, `${pending}/lore/private-lore`), lore));
    await assertSucceeds(setDoc(doc(owner, `${pending}/lore/lore-1`), lore));
  });

  it('mantém revisões imutáveis e troca a publicação atomicamente', async () => {
    await seed();
    const owner = db('author');
    await assertFails(
      updateDoc(doc(owner, `${revisionPath}/chapters/ch-1`), { content: 'alterado' }),
    );
    await assertFails(deleteDoc(doc(owner, `${revisionPath}/chapters/ch-1`)));
    await assertFails(setDoc(doc(owner, `${revisionPath}/chapters/ch-2`), chapter));
    const pending = `${rootPath}/revisions/rev-2`;
    await assertSucceeds(setDoc(doc(owner, pending), revision));
    await assertSucceeds(setDoc(doc(owner, `${pending}/chapters/ch-1`), chapter));
    await assertFails(getDoc(doc(db(), `${pending}/chapters/ch-1`)));
    const batch = writeBatch(owner);
    batch.set(doc(owner, rootPath), { ...root, revisionId: 'rev-2' });
    batch.update(doc(owner, bookPath), { status: 'published', updatedAt: 200 });
    await assertSucceeds(batch.commit());
    await assertSucceeds(getDoc(doc(db(), `${pending}/chapters/ch-1`)));
    await assertFails(getDoc(doc(db(), `${revisionPath}/chapters/ch-1`)));
    await assertFails(getDoc(doc(db(), `${revisionPath}/lore/lore-1`)));
  });

  it('prepara lotes reais com dez entidades e vinte apelidos sem expor a revisão', async () => {
    await seed({ status: 'draft' });
    const owner = db('author');
    const pending = `${rootPath}/revisions/batched`;
    const fullLore = {
      ...lore,
      aliases: Array.from({ length: 20 }, (_, index) => `Apelido ${index}`),
    };
    await environment.withSecurityRulesDisabled(async (context) => {
      await Promise.all(
        Array.from({ length: 10 }, (_, index) =>
          setDoc(doc(context.firestore(), `${bookPath}/lore/entity-${index}`), {
            ...fullLore,
            isPublic: true,
          }),
        ),
      );
    });
    await assertSucceeds(setDoc(doc(owner, pending), { ...revision, loreCount: 10 }));
    const batch = writeBatch(owner);
    for (let index = 0; index < 10; index += 1) {
      batch.set(doc(owner, `${pending}/lore/entity-${index}`), fullLore);
    }
    await assertSucceeds(batch.commit());
    await assertFails(getDocs(collection(db(), `${pending}/lore`)));
    const publish = writeBatch(owner);
    publish.set(doc(owner, rootPath), { ...root, revisionId: 'batched' });
    publish.update(doc(owner, bookPath), { status: 'published' });
    await assertSucceeds(publish.commit());
    const published = await assertSucceeds(getDocs(collection(db(), `${pending}/lore`)));
    assert.equal(published.size, 10);
  });

  it('exige revogação atômica ao tornar lore público privado ou excluí-lo', async () => {
    await seed();
    const owner = db('author');
    const entity = doc(owner, `${bookPath}/lore/lore-1`);
    await assertFails(updateDoc(entity, { isPublic: false }));
    await assertFails(deleteDoc(entity));
    const revoke = writeBatch(owner);
    revoke.update(doc(owner, bookPath), {
      status: 'draft',
      updatedAt: 200,
      publicationPrivacyVersion: 1,
      localLoreVersion: 1,
    });
    revoke.delete(doc(owner, rootPath));
    revoke.update(entity, { isPublic: false });
    await assertSucceeds(revoke.commit());
    await assertFails(getDoc(doc(db(), `${revisionPath}/lore/lore-1`)));
    await assertFails(getDoc(doc(db(), `${revisionPath}/chapters/ch-1`)));
    const removePrivate = writeBatch(owner);
    removePrivate.update(doc(owner, bookPath), { localLoreVersion: 2 });
    removePrivate.delete(entity);
    await assertSucceeds(removePrivate.commit());
  });

  it('impede reativar revisões antigas ou reconstruir sua autorização após revogar lore', async () => {
    await seed();
    const owner = db('author');
    const revoke = writeBatch(owner);
    revoke.update(doc(owner, bookPath), {
      status: 'draft',
      publicationPrivacyVersion: 1,
      localLoreVersion: 1,
    });
    revoke.delete(doc(owner, rootPath));
    revoke.update(doc(owner, `${bookPath}/lore/lore-1`), { isPublic: false });
    await assertSucceeds(revoke.commit());
    const replay = writeBatch(owner);
    replay.set(doc(owner, rootPath), root);
    replay.update(doc(owner, bookPath), { status: 'published' });
    await assertFails(replay.commit());
    await assertFails(updateDoc(doc(owner, bookPath), { publicationPrivacyVersion: 0 }));
    await assertFails(updateDoc(doc(owner, revisionPath), { privacyVersion: 1 }));
    await assertFails(deleteDoc(doc(owner, revisionPath)));
    await assertFails(setDoc(doc(owner, `${rootPath}/revisions/stale`), revision));
    await assertSucceeds(
      setDoc(doc(owner, `${rootPath}/revisions/fresh`), { ...revision, privacyVersion: 1 }),
    );
    await assertFails(setDoc(doc(owner, `${rootPath}/revisions/fresh/lore/lore-1`), lore));
    await assertSucceeds(updateDoc(doc(owner, bookPath), { deleting: true }));
    await assertFails(updateDoc(doc(owner, bookPath), { deleting: false }));
    await assertFails(
      setDoc(doc(owner, `${rootPath}/revisions/rebuilt`), { ...revision, privacyVersion: 1 }),
    );
    await assertSucceeds(deleteDoc(doc(owner, revisionPath)));
    await assertFails(setDoc(doc(owner, revisionPath), { ...revision, privacyVersion: 1 }));
  });

  it('excluir lore público exige aumentar a versão de privacidade e revogar a publicação', async () => {
    await seed();
    const owner = db('author');
    const incomplete = writeBatch(owner);
    incomplete.update(doc(owner, bookPath), { status: 'draft' });
    incomplete.delete(doc(owner, rootPath));
    incomplete.delete(doc(owner, `${bookPath}/lore/lore-1`));
    await assertFails(incomplete.commit());
    const complete = writeBatch(owner);
    complete.update(doc(owner, bookPath), {
      status: 'draft',
      publicationPrivacyVersion: 1,
      localLoreVersion: 1,
    });
    complete.delete(doc(owner, rootPath));
    complete.delete(doc(owner, `${bookPath}/lore/lore-1`));
    await assertSucceeds(complete.commit());
    await assertFails(getDoc(doc(db(), `${revisionPath}/lore/lore-1`)));
  });

  it('retirar publicação revoga imediatamente todos os caminhos diretos', async () => {
    await seed();
    const owner = db('author');
    await assertFails(deleteDoc(doc(owner, rootPath)));
    await assertFails(deleteDoc(doc(owner, bookPath)));
    const batch = writeBatch(owner);
    batch.update(doc(owner, bookPath), { status: 'draft' });
    batch.delete(doc(owner, rootPath));
    await assertSucceeds(batch.commit());
    for (const path of [
      rootPath,
      revisionPath,
      `${revisionPath}/chapters/ch-1`,
      `${revisionPath}/lore/lore-1`,
    ]) {
      await assertFails(getDoc(doc(db(), path)));
      await assertFails(getDoc(doc(db('other-author'), path)));
    }
    await assertSucceeds(updateDoc(doc(owner, bookPath), { deleting: true }));
    const remove = writeBatch(owner);
    remove.set(doc(owner, `deletedBooks/${bookId}`), { deletedAt: serverTimestamp() });
    remove.delete(doc(owner, bookPath));
    await assertSucceeds(remove.commit());
    await assertFails(setDoc(doc(owner, bookPath), { ...privateBook, status: 'draft' }));
    await assertFails(deleteDoc(doc(owner, `deletedBooks/${bookId}`)));
    await assertFails(getDoc(doc(db(), `${revisionPath}/chapters/ch-1`)));
  });
});
