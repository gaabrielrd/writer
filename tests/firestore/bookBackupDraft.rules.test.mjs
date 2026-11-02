import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { before, beforeEach, after, test } from 'node:test';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { createBookBackupReadService } from '../../functions/src/bookBackupRead.mjs';
import { createBookBackupDraftService } from '../../functions/src/bookBackupDraftRead.mjs';
import { DEFAULT_PERSONAS } from '../../functions/src/personaProfile.mjs';
import { digest } from '../../functions/src/workProgressContracts.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url));
const { Firestore } = requireFunctions('firebase-admin/firestore');
const projectId = 'demo-writer-backup-draft';
let environment, admin, root, api;
const profile = {
  ...structuredClone(DEFAULT_PERSONAS[0]),
  id: 'custom-draft-only',
  archived: true,
  revision: 1,
  createdAt: 10,
  updatedAt: 11,
};
const source = () => root.getBookBackupSource('author', { bookId: 'book' });
const read = (pin, extra = {}, uid = 'author') =>
  api.getBookBackupDraftPersona(uid, {
    bookId: 'book',
    sourceToken: pin.sourceToken,
    personaId: profile.id,
    ...extra,
  });
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127\.0\.0\.1:\d+$/.test(address ?? '')) throw new Error('Use emulador local demo.');
  const [host, port] = address.split(':');
  environment = await initializeTestEnvironment({
    projectId,
    firestore: {
      host,
      port: Number(port),
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
  });
  admin = new Firestore({ projectId, host: address, ssl: false, universeDomain: 'googleapis.com' });
  root = createBookBackupReadService({ db: admin });
  api = createBookBackupDraftService({ db: admin });
});
beforeEach(async () => {
  await environment.clearFirestore();
  await admin
    .doc('books/book')
    .set({ authorId: 'author', title: 'Book', status: 'draft', createdAt: 1, updatedAt: 2 });
  await admin.doc('users/author/aiPersonas/' + profile.id).set(profile);
});
after(async () => {
  await admin?.terminate();
  await environment?.cleanup();
});
test('explicit draft-only profile works without chapter, saved binding or writes', async () => {
  const pin = await source(),
    before = await admin.doc('books/book').get(),
    value = await read(pin);
  assert.equal(value.profile.id, profile.id);
  assert.equal(value.profile.archived, true);
  assert.equal(value.profileHash, digest(JSON.stringify(value.profile)));
  assert.deepEqual(await source(), pin);
  assert.ok(before.updateTime.isEqual((await admin.doc('books/book').get()).updateTime));
  assert.equal((await admin.collection('books/book/chapters').limit(1).get()).empty, true);
  assert.equal((await admin.collection('books/book/workVersions').limit(1).get()).empty, true);
  const preset = await read(pin, { personaId: 'preset-epic' });
  assert.equal(preset.profile.id, 'preset-epic');
});
test('real SDK style edit leaves root unchanged but invalidates old explicit-style token', async () => {
  const pin = await source(),
    old = await read(pin),
    db = environment.authenticatedContext('author').firestore();
  await assertSucceeds(
    setDoc(doc(db, 'users/author/aiPersonas/' + profile.id), {
      ...profile,
      revision: 2,
      instructions: 'New style',
      updatedAt: 12,
    }),
  );
  assert.deepEqual(await source(), pin);
  await assert.rejects(read(pin, { expectedPersonaToken: old.personaToken }), {
    code: 'failed-precondition',
  });
  assert.equal((await read(pin)).profile.instructions, 'New style');
});
test('SDK deletion remains denied and Admin equal-body recreation invalidates explicit-style token', async () => {
  const pin = await source(),
    old = await read(pin),
    db = environment.authenticatedContext('author').firestore(),
    ref = admin.doc('users/author/aiPersonas/' + profile.id);
  await assertFails(deleteDoc(doc(db, 'users/author/aiPersonas/' + profile.id)));
  await ref.delete();
  await assert.rejects(read(pin), { code: 'failed-precondition' });
  await ref.set(profile);
  assert.deepEqual(await source(), pin);
  await assert.rejects(read(pin, { expectedPersonaToken: old.personaToken }), {
    code: 'failed-precondition',
  });
});
test('own namespace/current book authorization and closed descriptor guard every profile read', async () => {
  const pin = await source(),
    other = environment.authenticatedContext('other').firestore();
  await assertFails(getDoc(doc(other, 'users/author/aiPersonas/' + profile.id)));
  await assert.rejects(read(pin, {}, 'other'), { code: 'not-found' });
  await assert.rejects(read(pin, {}, ''), { code: 'unauthenticated' });
  await assert.rejects(read(pin, { ownerId: 'other' }), { code: 'invalid-argument' });
  await admin.doc('users/author/aiPersonas/' + profile.id).delete();
  await admin.doc('users/other/aiPersonas/' + profile.id).set(profile);
  await assert.rejects(read(pin), { code: 'failed-precondition' });
  await admin.doc('books/book').update({ deleting: true });
  await assert.rejects(read(pin), { code: 'not-found' });
});
