import { readFile } from 'node:fs/promises';
import { before, after, test } from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { createLoreAnalysisService } from '../../functions/src/loreAnalysis.mjs';
const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
let environment;
before(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Use somente o emulador demo.');
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
  environment = await initializeTestEnvironment({
    projectId: 'demo-writer-lore-analysis-tests',
    firestore: {
      host,
      port: Number(port),
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
  });
});
after(async () => environment?.cleanup());
test('analysis tickets and quotas are server-only even for their owner', async () => {
  for (const path of [
    'users/author/loreAnalyses/batch',
    'users/author/loreAnalysisLimits/current',
    'users/author/campaignAuthorization/current',
  ]) {
    await environment.withSecurityRulesDisabled(async (context) =>
      setDoc(doc(context.firestore(), path), { provider: 'platform', state: 'ready' }),
    );
    for (const uid of ['author', 'other', null]) {
      const db = uid
        ? environment.authenticatedContext(uid).firestore()
        : environment.unauthenticatedContext().firestore();
      await assertFails(getDoc(doc(db, path)));
      await assertFails(setDoc(doc(db, path), { provider: 'byok' }));
      await assertFails(updateDoc(doc(db, path), { provider: 'byok' }));
      await assertFails(deleteDoc(doc(db, path)));
    }
  }
});
test('real Firestore transaction applies local/global together and charges once across concurrent retries', async () => {
  const app = initializeApp({ projectId: 'demo-writer-lore-batch-admin-tests' }, 'lore-batch-test');
  const db = getFirestore(app);
  try {
    await Promise.all([
      db.doc('books/book').set({ authorId: 'author', universeId: 'world' }),
      db.doc('books/book/chapters/chapter').set({ content: 'Nara chegou.' }),
      db.doc('universes/world').set({ authorId: 'author', loreVersion: 0, privacyVersion: 0 }),
      db.doc('users/author').set({ credits: 2 }),
    ]);
    const item = {
      name: 'Nara',
      category: 'character',
      summary: 'Navegadora',
      details: '',
      aliases: [],
      evidence: 'Nara chegou.',
    };
    const service = createLoreAnalysisService({
      db,
      generator: async () => JSON.stringify({ entities: [item] }),
    });
    const request = {
      bookId: 'book',
      chapterId: 'chapter',
      requestId: 'analysis-000000000001',
      text: item.evidence,
      content: item.evidence,
      loreVersions: [],
    };
    await service.analyzeChapterLore('author', request);
    const data = {
      id: request.requestId,
      text: request.text,
      changes: [
        { scope: 'local', input: { name: 'Nara', category: 'character', summary: 'Navegadora' } },
        {
          scope: 'global',
          input: { name: 'Porto', category: 'location', summary: 'Destino de Nara' },
        },
      ],
    };
    const results = await Promise.all([
      service.applyLoreAnalysis('author', data),
      service.applyLoreAnalysis('author', data),
    ]);
    assert.deepEqual(results, [
      { applied: 2, credits: 1 },
      { applied: 2, credits: 1 },
    ]);
    assert.equal((await db.doc('users/author').get()).data().credits, 1);
    assert.equal((await db.doc('books/book').get()).data().localLoreVersion, 1);
    const clock = (await db.doc('users/author/campaignAuthorization/current').get()).data();
    assert.equal(clock.epoch, 1);
    assert.equal(clock.ownerId, 'author');
    assert.match(clock.token, /^[a-f0-9]{64}$/);
    assert.equal(
      (await db.doc(`books/book/lore/${request.requestId}-0`).get()).data().isPublic,
      false,
    );
    assert.equal(
      (await db.doc(`universes/world/lore/${request.requestId}-1`).get()).data().isPublic,
      false,
    );
  } finally {
    await db.terminate();
    await deleteApp(app);
  }
});
