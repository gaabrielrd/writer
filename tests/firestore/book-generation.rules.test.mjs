import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, runTransaction } from 'firebase/firestore';
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
      const book = { authorId: 'author', title: 'Atlas', status: 'draft' };
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
