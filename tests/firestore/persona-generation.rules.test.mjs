import { before, beforeEach, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import {
  createPersonaGenerationService,
  cleanupExpiredPersonaGenerations,
} from '../../functions/src/personaGeneration.mjs';
import { STANDARD_TRAITS } from '../../functions/src/personaProfile.mjs';
const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
let environment, app, db;
const projectId = 'demo-writer-persona-generation';
before(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Use somente emulador demo.');
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
  environment = await initializeTestEnvironment({
    projectId,
    firestore: {
      host,
      port: Number(port),
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
  });
  app = initializeApp({ projectId }, projectId);
  db = getFirestore(app);
});
beforeEach(async () => environment.clearFirestore());
after(async () => {
  await db?.terminate();
  if (app) await deleteApp(app);
  await environment?.cleanup();
});
test('dono, intruso e anônimo não leem nem forjam pedidos ou quota', async () => {
  const path = 'users/author/personaGenerations/request-persona-000001';
  await db.doc(path).set({ state: 'ready', proposal: { instructions: 'privado' } });
  for (const uid of ['author', 'intruder', null]) {
    const client = (
      uid ? environment.authenticatedContext(uid) : environment.unauthenticatedContext()
    ).firestore();
    await assertFails(getDoc(doc(client, path)));
    await assertFails(setDoc(doc(client, path), { state: 'accepted' }));
    await assertFails(deleteDoc(doc(client, path)));
    await assertFails(setDoc(doc(client, 'users/author/generationLimits/personas'), { count: 0 }));
  }
});
test('transações reais criam uma única persona privada com aceite concorrente e sem crédito', async () => {
  await db.doc('users/author').set({ credits: 0 });
  await db.doc('universes/world').set({
    authorId: 'author',
    name: 'Mundo',
    description: 'Mistério',
    loreVersion: 1,
    privacyVersion: 0,
    updatedAt: 1,
  });
  const service = createPersonaGenerationService({
    db,
    generator: async () =>
      JSON.stringify({
        name: 'Voz de bruma',
        description: 'Mistério íntimo.',
        instructions: 'Use voz íntima e gradual.',
        rationale: 'A atmosfera orienta tensão moderada.',
        values: Object.fromEntries(STANDARD_TRAITS.map((trait) => [trait.id, 50])),
        customTraits: [],
      }),
  });
  const context = await service.dispatch('author', {
    action: 'context',
    universeId: 'world',
    entityIds: [],
  });
  const ready = await service.dispatch('author', {
    action: 'generate',
    universeId: 'world',
    entityIds: [],
    contextToken: context.contextToken,
    requestId: 'request-persona-000001',
  });
  const { name, description, instructions, traits } = ready.persona;
  const request = {
    action: 'accept',
    requestId: ready.requestId,
    persona: { name, description, instructions, traits },
  };
  const results = await Promise.all([
    service.dispatch('author', request),
    service.dispatch('author', request),
  ]);
  assert.equal(results[0].personaId, results[1].personaId);
  assert.equal((await db.collection('users/author/aiPersonas').get()).size, 1);
  assert.equal((await db.doc('users/author').get()).data().credits, 0);
  await assertSucceeds(
    getDoc(
      doc(
        environment.authenticatedContext('author').firestore(),
        `users/author/aiPersonas/${results[0].personaId}`,
      ),
    ),
  );
  await assertFails(
    getDoc(
      doc(
        environment.authenticatedContext('intruder').firestore(),
        `users/author/aiPersonas/${results[0].personaId}`,
      ),
    ),
  );
});

test('coleta remove apenas pedidos expirados e preserva personas e pedidos ativos', async () => {
  await db.doc('users/author/personaGenerations/expired').set({ state: 'accepted', expiresAt: 1 });
  await db.doc('users/author/personaGenerations/active').set({ state: 'ready', expiresAt: 200 });
  await db.doc('users/author/aiPersonas/saved').set({ name: 'Voz permanente' });
  await cleanupExpiredPersonaGenerations(db, () => 100);
  assert.equal((await db.doc('users/author/personaGenerations/expired').get()).exists, false);
  assert.equal((await db.doc('users/author/personaGenerations/active').get()).exists, true);
  assert.equal((await db.doc('users/author/aiPersonas/saved').get()).exists, true);
});
