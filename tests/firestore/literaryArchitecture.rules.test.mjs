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
    projectId: 'demo-writer-global-architecture-tests',
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
test('architecture census and its native proofs remain server-only for owner, foreign account and anonymous SDKs', async () => {
  const path = 'books/book/literaryIntegrationArchitecture/native-source',
    value = {
      jobId: 'job',
      index: 0,
      source: { kind: 'plan', id: 'brief', arcId: null },
      identityToken: 'a'.repeat(64),
      nativeToken: 'b'.repeat(64),
      coverage: null,
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
    await assertFails(getDocs(collection(db, 'books/book/literaryIntegrationArchitecture')));
    await assertFails(setDoc(doc(db, path), { ...value, nativeToken: 'c'.repeat(64) }));
    await assertFails(updateDoc(doc(db, path), { coverage: { complete: true } }));
    await assertFails(deleteDoc(doc(db, path)));
  }
  await environment.withSecurityRulesDisabled(async (context) =>
    assert.deepEqual((await getDoc(doc(context.firestore(), path))).data(), value),
  );
});
