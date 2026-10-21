import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, runTransaction } from 'firebase/firestore';
let environment;
before(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Use somente o emulador demo.');
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
  environment = await initializeTestEnvironment({
    projectId: 'demo-writer-book-generation',
    firestore: {
      host,
      port: Number(port),
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
  });
});
after(async () => environment?.cleanup());
beforeEach(async () => environment.clearFirestore());
test('manual creation can read an absent ID and atomically create only one private draft', async () => {
  const db = environment.authenticatedContext('author').firestore();
  const ref = doc(db, 'books', 'book-000000000001');
  const create = () =>
    runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists()) return snap.data();
      const book = {
        authorId: 'author',
        title: 'Atlas',
        status: 'draft',
        localLoreVersion: 0,
        createdAt: 1,
        updatedAt: 1,
      };
      tx.set(ref, book);
      return book;
    });
  const results = await assertSucceeds(Promise.all([create(), create()]));
  assert.deepEqual(results[0], results[1]);
  await assertFails(
    getDoc(doc(environment.authenticatedContext('other').firestore(), 'books', ref.id)),
  );
  await assertFails(
    getDoc(doc(environment.unauthenticatedContext().firestore(), 'books', 'absent')),
  );
});
test('browser cannot read or forge its own generation ledger or rate limits', async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'users/author/bookGenerations/request-1'), {
      state: 'ready',
      cost: 5,
    });
  });
  for (const uid of ['author', 'other']) {
    const db = environment.authenticatedContext(uid).firestore();
    await assertFails(getDoc(doc(db, 'users/author/bookGenerations/request-1')));
    await assertFails(
      setDoc(doc(db, `users/${uid}/bookGenerations/request-1`), { state: 'accepted', cost: 0 }),
    );
    await assertFails(setDoc(doc(db, `users/${uid}/generationLimits/current`), { count: 0 }));
  }
});

test('assisted sessions, operations, limits and receipts are server-only', async () => {
  for (const suffix of [
    'assistedSessions/session-1',
    'assistedSessions/session-1/operations/op-1',
    'assistedLimits/current',
    'assistedCurrent/current',
    'assistedReceipts/receipt-1',
  ]) {
    const path = `users/author/${suffix}`;
    await environment.withSecurityRulesDisabled((context) =>
      setDoc(doc(context.firestore(), path), { private: 'idea' }),
    );
    for (const context of [
      environment.authenticatedContext('author'),
      environment.authenticatedContext('other'),
      environment.unauthenticatedContext(),
    ]) {
      await assertFails(getDoc(doc(context.firestore(), path)));
      await assertFails(setDoc(doc(context.firestore(), path), { private: 'forged' }));
    }
  }
});

test('library metadata is owner-readable and all image mutations are server-only', async () => {
  const path = 'users/author/imageLibrary/image-0000000001';
  await environment.withSecurityRulesDisabled((context) =>
    setDoc(doc(context.firestore(), path), { state: 'active', useCount: 1 }),
  );
  const author = environment.authenticatedContext('author').firestore();
  await assertSucceeds(getDoc(doc(author, path)));
  await assertFails(getDoc(doc(environment.authenticatedContext('other').firestore(), path)));
  await assertFails(getDoc(doc(environment.unauthenticatedContext().firestore(), path)));
  await assertFails(setDoc(doc(author, path), { state: 'active', useCount: 0 }));
  await assertFails(deleteDoc(doc(author, path)));
  await assertFails(setDoc(doc(author, path + '/uses/book'), { bookId: 'book' }));
  await assertFails(
    setDoc(doc(author, 'users/author/imageLibraryMigration/current'), { complete: true }),
  );
});
test('browser cannot attach, unlink or change a managed image to bypass use counts', async () => {
  const author = environment.authenticatedContext('author').firestore();
  await environment.withSecurityRulesDisabled((context) =>
    setDoc(doc(context.firestore(), 'books/managed'), {
      authorId: 'author',
      title: 'Atlas',
      status: 'draft',
      coverImageId: 'image-0000000001',
      coverUrl: 'https://example.test/cover.png',
    }),
  );
  await assertFails(
    setDoc(doc(author, 'books/forged'), {
      authorId: 'author',
      status: 'draft',
      coverImageId: 'image-0000000001',
    }),
  );
  await assertFails(updateDoc(doc(author, 'books/managed'), { coverImageId: null }));
  await assertFails(
    updateDoc(doc(author, 'books/managed'), { coverUrl: 'https://example.test/other.png' }),
  );
  await assertSucceeds(updateDoc(doc(author, 'books/managed'), { title: 'Novo título' }));
});
