import { readFile } from 'node:fs/promises';
import { before, after, beforeEach, test } from 'node:test';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  doc,
  collection,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  writeBatch,
} from 'firebase/firestore';
const names = [
  'literaryImpactControls',
  'literaryImpactChecks',
  'literaryImpactDecisions',
  'literaryImpactDecisionVersions',
  'literaryImpactJobs',
  'literaryImpactNodes',
  'literaryImpactLinks',
  'literaryImpactVisits',
  'literaryImpactWitnesses',
  'literaryChatContexts',
  'literaryChatTurns',
  'literaryApplications',
  'literaryChatApplications',
  'literaryLegacyChatMessages',
  'literaryLegacyChatApplications',
  'literaryProgressNotes',
  'literaryProgressNoteVersions',
  'literaryPassageInspections',
  'literaryPublications',
  'literaryPublicationCandidates',
  'literaryPublicationChapters',
  'literaryPublicationUnits',
  'literaryPublicationBodies',
  'literaryPublicationRemovals',
  'literaryPublicationGuideDependencies',
];
let environment;
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!address) throw new Error('Use somente o emulador demo.');
  const [host, port] = address.split(':');
  environment = await initializeTestEnvironment({
    projectId: 'demo-writer-literary-impact-tests',
    firestore: {
      host,
      port: Number(port),
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
  });
});
beforeEach(async () => {
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'books/book'), {
      authorId: 'author',
      title: 'Livro',
      status: 'draft',
      createdAt: 1,
      updatedAt: 1,
    });
    for (const name of names)
      await setDoc(doc(db, 'books/book/' + name + '/private'), {
        jobId: 'job',
        state: 'collecting',
      });
  });
});
after(async () => {
  await environment?.cleanup();
});
test('impact metadata is server-only even for the author and on a published parent', async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), 'books/book'), { status: 'published' });
  });
  for (const uid of [null, 'author', 'other']) {
    const db = (
      uid ? environment.authenticatedContext(uid) : environment.unauthenticatedContext()
    ).firestore();
    for (const name of names) {
      const target = doc(db, 'books/book/' + name + '/private');
      await assertFails(getDoc(target));
      await assertFails(getDocs(collection(db, 'books/book/' + name)));
      await assertFails(
        setDoc(doc(db, 'books/book/' + name + '/forged'), {
          state: 'done',
          publicationReady: true,
        }),
      );
      await assertFails(updateDoc(target, { state: 'done' }));
      await assertFails(deleteDoc(target));
    }
  }
});

test('clients preserve the server-only dependency revision and cannot remove or forge it', async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), 'books/book'), {
      localLoreVersion: 0,
      literaryDependencyRevision: 7,
    });
  });
  const db = environment.authenticatedContext('author').firestore(),
    root = doc(db, 'books/book');
  await assertSucceeds(updateDoc(root, { title: 'Título atual', updatedAt: 2 }));
  await assertFails(updateDoc(root, { literaryDependencyRevision: 8 }));
  await assertFails(updateDoc(root, { literaryDependencyRevision: deleteField() }));
  const newBook = {
    authorId: 'author',
    title: 'Novo',
    status: 'draft',
    createdAt: 1,
    updatedAt: 1,
    localLoreVersion: 0,
  };
  await assertSucceeds(setDoc(doc(db, 'books/allowed'), newBook));
  await assertFails(setDoc(doc(db, 'books/forged'), { ...newBook, literaryDependencyRevision: 1 }));
});
test('SDK chapter changes require the parent structure clock in the same commit', async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await updateDoc(doc(db, 'books/book'), { localLoreVersion: 0 });
    await setDoc(doc(db, 'books/book/chapters/chapter'), {
      title: 'Anterior',
      order: 1,
      content: '<p>Texto</p>',
      wordCount: 1,
      createdAt: 1,
      updatedAt: 1,
    });
  });
  const db = environment.authenticatedContext('author').firestore();
  const chapter = doc(db, 'books/book/chapters/chapter'),
    root = doc(db, 'books/book');
  await assertFails(updateDoc(chapter, { title: 'Sem avanço da raiz', updatedAt: 2 }));
  const batch = writeBatch(db);
  batch.update(chapter, { title: 'Título confirmado', updatedAt: 2 });
  batch.update(root, { updatedAt: 2 });
  await assertSucceeds(batch.commit());
});

test('managed editorial staging is immutable to SDK writers and unreadable before the public pointer', async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await updateDoc(doc(db, 'books/book'), { hasLiteraryPublications: true, localLoreVersion: 0 });
    await setDoc(doc(db, 'publicBooks/book/revisions/managed'), {
      createdAt: 1,
      chapterCount: 1,
      loreCount: 0,
      privacyVersion: 0,
    });
    await setDoc(doc(db, 'publicBooks/book/revisions/managed/chapters/chapter'), {
      title: 'Capítulo',
      order: 1,
      content: '<p>Texto preparado.</p>',
    });
  });
  const owner = environment.authenticatedContext('author').firestore(),
    reader = environment.unauthenticatedContext().firestore(),
    chapter = doc(owner, 'publicBooks/book/revisions/managed/chapters/chapter');
  await assertSucceeds(updateDoc(doc(owner, 'books/book'), { title: 'Livro atual', updatedAt: 2 }));
  await assertFails(
    updateDoc(doc(owner, 'books/book'), { hasLiteraryPublications: false, updatedAt: 3 }),
  );
  await assertFails(
    updateDoc(doc(owner, 'books/book'), { hasLiteraryPublications: deleteField(), updatedAt: 3 }),
  );
  await assertFails(
    setDoc(doc(owner, 'publicBooks/book/revisions/forged'), {
      createdAt: 2,
      chapterCount: 0,
      loreCount: 0,
      privacyVersion: 0,
    }),
  );
  await assertFails(
    setDoc(doc(owner, 'publicBooks/book/revisions/managed/chapters/forged'), {
      title: 'Forjado',
      order: 2,
      content: '<p>Corte.</p>',
    }),
  );
  await assertFails(deleteDoc(chapter));
  await assertFails(getDoc(doc(reader, 'publicBooks/book/revisions/managed/chapters/chapter')));
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await updateDoc(doc(db, 'books/book'), { status: 'published' });
    await setDoc(doc(db, 'publicBooks/book'), {
      schemaVersion: 1,
      title: 'Livro',
      authorName: 'Autor',
      revisionId: 'managed',
      publishedAt: 2,
    });
  });
  await assertSucceeds(getDoc(doc(reader, 'publicBooks/book/revisions/managed/chapters/chapter')));
});
