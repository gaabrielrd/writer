import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { before, beforeEach, after, test } from 'node:test';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { readAvailablePersonaMetadata } from '../../functions/src/personaAvailability.mjs';
import {
  personaRestoreUid as uid,
  personaRestoreProfile as id,
  personaRestorePaths as paths,
  personaRestoreValue,
  preparePersonaRestoreBatch,
  activatePersonaRestoreBatch,
} from '../../functions/test/helpers/personaRestoreAvailabilityFixture.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-persona-availability';
let env, admin;
const available = () =>
  admin.runTransaction((tx) => readAvailablePersonaMetadata(tx, admin, uid, id, ['revision']));
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127\.0\.0\.1:\d+$/.test(address ?? ''))
    throw new Error('Dedicated local emulator required.');
  const [host, port] = address.split(':');
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      host,
      port: Number(port),
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
  });
  admin = new Firestore({ projectId, host: address, ssl: false, universeDomain: 'googleapis.com' });
});
beforeEach(async () => {
  await env.clearFirestore();
  await preparePersonaRestoreBatch(admin);
  await admin
    .doc('books/existing-book')
    .create({ authorId: uid, title: 'Existing book', status: 'draft', createdAt: 1, updatedAt: 2 });
});
after(async () => {
  await admin?.terminate();
  await env?.cleanup();
});
test('SDK pending personas cannot be edited, forged, erased or linked while existing library remains usable', async () => {
  const own = env.authenticatedContext(uid).firestore(),
    other = env.authenticatedContext('other').firestore(),
    anon = env.unauthenticatedContext().firestore(),
    profile = personaRestoreValue(),
    reference = doc(own, paths.profile);
  await assertSucceeds(getDoc(reference));
  await assertSucceeds(getDoc(doc(own, paths.batch)));
  await assertFails(getDoc(doc(other, paths.profile)));
  await assertFails(getDoc(doc(anon, paths.profile)));
  await assertFails(getDoc(doc(other, paths.batch)));
  await assertFails(setDoc(reference, { ...profile, revision: 8, name: 'Changed' }));
  await assertFails(
    setDoc(doc(own, 'users/' + uid + '/aiPersonas/custom-' + 'e'.repeat(64)), {
      ...profile,
      id: 'custom-' + 'e'.repeat(64),
      revision: 1,
    }),
  );
  await assertFails(updateDoc(doc(own, paths.batch), { state: 'active' }));
  await assertFails(deleteDoc(doc(own, paths.batch)));
  await assertFails(updateDoc(doc(own, 'books/existing-book'), { personaId: id }));
  assert.equal(await available(), null);
  const legacy = { ...profile, id: 'custom-existing', revision: 1 };
  delete legacy.restoreOrigin;
  await assertSucceeds(setDoc(doc(own, 'users/' + uid + '/aiPersonas/' + legacy.id), legacy));
  await assertSucceeds(updateDoc(doc(own, 'books/existing-book'), { personaId: legacy.id }));
  await assertSucceeds(
    updateDoc(doc(own, 'users/' + uid + '/aiPersonas/' + legacy.id), {
      revision: 2,
      name: 'Legacy changed',
    }),
  );
});
test('SDK active persona can be edited and linked while operational origin stays immutable', async () => {
  await activatePersonaRestoreBatch(admin);
  const own = env.authenticatedContext(uid).firestore(),
    profile = personaRestoreValue();
  assert.equal((await available()).data().revision, 7);
  await assertSucceeds(
    setDoc(doc(own, paths.profile), { ...profile, revision: 8, name: 'Changed', updatedAt: 8 }),
  );
  assert.equal((await available()).data().revision, 8);
  await assertSucceeds(updateDoc(doc(own, 'books/existing-book'), { personaId: id }));
  const removed = { ...profile, revision: 9 };
  delete removed.restoreOrigin;
  await assertFails(setDoc(doc(own, paths.profile), removed));
  await assertFails(
    setDoc(doc(own, paths.profile), {
      ...profile,
      revision: 9,
      restoreOrigin: { ...profile.restoreOrigin, jobToken: 'f'.repeat(64) },
    }),
  );
  await assertFails(updateDoc(doc(own, paths.batch), { state: 'cancelled' }));
  await assertFails(deleteDoc(doc(own, paths.profile)));
});
for (const which of ['batch', 'last'])
  test(
    'SDK native ' + which + ' recreated with identical fields cannot authorize server consumers',
    async () => {
      await activatePersonaRestoreBatch(admin);
      assert.ok(await available());
      const ref = admin.doc(paths[which]),
        before = await ref.get(),
        value = before.data();
      await ref.delete();
      await ref.create(value);
      const recreated = await ref.get();
      assert.equal(before.createTime.isEqual(recreated.createTime), false);
      assert.equal(await available(), null);
    },
  );
