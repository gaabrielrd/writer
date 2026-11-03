import { before, beforeEach, after, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
let environment;
const profile = () => ({
  schemaVersion: 1,
  revision: 1,
  interests: ['campaign'],
  startingPoint: 'empty',
  guidance: 'guided',
  questionnaire: 'completed',
  tour: 'active',
  step: 0,
});
const ref = (uid) =>
  doc(
    uid
      ? environment.authenticatedContext(uid).firestore()
      : environment.unauthenticatedContext().firestore(),
    'users/writer/preferences/onboarding',
  );
before(async () => {
  environment = await initializeTestEnvironment({
    projectId: 'demo-writer-onboarding',
    firestore: { host, port: Number(port), rules: await readFile('firestore.rules', 'utf8') },
  });
});
beforeEach(async () => environment.clearFirestore());
after(async () => environment?.cleanup());
it('allows only the owner and requires monotonic revisions', async () => {
  await assertSucceeds(setDoc(ref('writer'), profile()));
  await assertSucceeds(getDoc(ref('writer')));
  await assertFails(getDoc(ref('other')));
  await assertFails(getDoc(ref(null)));
  await assertFails(setDoc(ref('writer'), profile()));
  await assertFails(setDoc(ref('other'), { ...profile(), revision: 2 }));
  await assertSucceeds(
    setDoc(ref('writer'), { ...profile(), revision: 2, tour: 'paused', step: 2 }),
  );
  await assertFails(deleteDoc(ref('writer')));
});
it('rejects extra privileges, malformed preferences, duplicates and oversized tours', async () => {
  for (const change of [
    { credits: 1000000 },
    { interests: [] },
    { interests: ['book', 'book'] },
    { interests: ['commerce'] },
    { revision: 2 },
    { step: 6 },
    { step: -1 },
    { guidance: 'automatic' },
    { tour: 'unknown' },
    { schemaVersion: 2 },
  ])
    await assertFails(setDoc(ref('writer'), { ...profile(), ...change }));
  await assertFails(setDoc(ref(null), profile()));
  await assertFails(setDoc(ref('other'), profile()));
});
