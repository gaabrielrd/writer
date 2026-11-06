import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
let environment;
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!address) throw new Error('Use somente o emulador demo.');
  const [host, port] = address.split(':');
  environment = await initializeTestEnvironment({
    projectId: 'demo-writer-chapter-workflow-tests',
    firestore: {
      host,
      port: Number(port),
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
  });
});
after(async () => {
  await environment?.cleanup();
});
test('chapter workflow controllers and phase authorizations remain server-only for owner, foreign account and anonymous SDKs', async () => {
  for (const kind of ['literaryWorkflowJobs', 'literarySequenceJobs']) {
    const path = 'books/book/' + kind + '/native-source',
      value = {
        jobId: 'job',
        chapterId: 'chapter',
        phase: 'review',
        paused: true,
        revision: 4,
        instruction: 'Private author direction',
        limits: { maxApplications: 2, maxCredits: 2, maxSteps: 100 },
        authorizedPhases: ['firstVersion'],
      };
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'books/book'), {
        authorId: 'author',
        title: 'Livro',
        status: 'draft',
        wordCount: 0,
        createdAt: 100,
        updatedAt: 100,
        hasLiteraryResources: true,
      });
      await setDoc(doc(context.firestore(), path), value);
    });
    for (const uid of ['author', 'other', null]) {
      const db = uid
        ? environment.authenticatedContext(uid).firestore()
        : environment.unauthenticatedContext().firestore();
      await assertFails(getDoc(doc(db, path)));
      await assertFails(getDocs(collection(db, 'books/book/' + kind)));
      await assertFails(
        setDoc(doc(db, path), {
          ...value,
          authorizedPhases: ['firstVersion', 'review', 'revisedVersion'],
        }),
      );
      await assertFails(updateDoc(doc(db, path), { paused: false }));
      await assertFails(deleteDoc(doc(db, path)));
    }
    await environment.withSecurityRulesDisabled(async (context) =>
      assert.deepEqual((await getDoc(doc(context.firestore(), path))).data(), value),
    );
  }
});

test('workflow capture markers remain server-only even for the author', async () => {
  const path = 'books/book/literaryBackupControls/current',
    value = { schemaVersion: 1, writeId: '00000000-0000-4000-8000-000000000000' };
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'books/book'), {
      authorId: 'author',
      title: 'Livro',
      createdAt: 100,
      updatedAt: 100,
      wordCount: 0,
    });
    await setDoc(doc(context.firestore(), path), value);
  });
  for (const uid of ['author', 'other', null]) {
    const db = uid
      ? environment.authenticatedContext(uid).firestore()
      : environment.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, path)));
    await assertFails(getDocs(collection(db, 'books/book/literaryBackupControls')));
    await assertFails(setDoc(doc(db, path), value));
    await assertFails(updateDoc(doc(db, path), { writeId: 'forged' }));
    await assertFails(deleteDoc(doc(db, path)));
  }
});
