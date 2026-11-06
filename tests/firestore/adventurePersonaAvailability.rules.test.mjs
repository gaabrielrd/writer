import { setPersonaWithCatalog, updatePersonaWithCatalog } from './helpers/personaCatalog.mjs';
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
  adventurePersonaUid as uid,
  adventurePersonaId as id,
  adventurePersonaPaths as paths,
  adventurePersonaValue,
  adventurePersonaOrigin as origin,
  prepareAdventurePersonaBatch,
  activateAdventurePersonaBatch,
  cancelAdventurePersonaBatch,
} from '../../functions/test/helpers/adventurePersonaAvailabilityFixture.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-adventure-persona-availability';
let env, admin;
const available = () =>
  admin.runTransaction((tx) => readAvailablePersonaMetadata(tx, admin, uid, id, ['revision']));
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127\.0\.0\.1:\d+$/.test(address ?? '')) throw Error('Only local demo emulator');
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
  await prepareAdventurePersonaBatch(admin);
  await admin
    .doc('books/existing-book')
    .create({ authorId: uid, title: 'Existing book', status: 'draft', createdAt: 1, updatedAt: 2 });
});
after(async () => {
  await admin?.terminate();
  await env?.cleanup();
});
test('SDK adventure preparing profile cannot be edited, forged, erased, activated or bound; private reads unchanged', async () => {
  const own = env.authenticatedContext(uid).firestore(),
    other = env.authenticatedContext('other').firestore(),
    anon = env.unauthenticatedContext().firestore(),
    profile = adventurePersonaValue(),
    ref = doc(own, paths.profile);
  await assertSucceeds(getDoc(ref));
  await assertSucceeds(getDoc(doc(own, paths.batch)));
  await assertFails(getDoc(doc(other, paths.profile)));
  await assertFails(getDoc(doc(anon, paths.profile)));
  await assertFails(getDoc(doc(other, paths.batch)));
  await assertFails(updateDoc(ref, { revision: 8, name: 'Blocked' }));
  await assertFails(updateDoc(doc(own, 'books/existing-book'), { personaId: id }));
  await assertFails(updateDoc(doc(own, paths.batch), { state: 'active' }));
  await assertFails(deleteDoc(doc(own, paths.batch)));
  await assertFails(deleteDoc(ref));
  await assertFails(
    setDoc(doc(own, 'users/' + uid + '/aiPersonas/custom-' + 'f'.repeat(64)), {
      ...profile,
      id: 'custom-' + 'f'.repeat(64),
      revision: 1,
    }),
  );
  assert.equal(await available(), null);
});
test('SDK active adventure origin allows revision CAS and binding, but cannot be removed, changed or cast to book', async () => {
  await activateAdventurePersonaBatch(admin);
  assert.equal((await available()).data().revision, 7);
  const own = env.authenticatedContext(uid).firestore(),
    profile = adventurePersonaValue();
  await assertSucceeds(
    setPersonaWithCatalog(own, doc(own, paths.profile), {
      ...profile,
      revision: 8,
      name: 'Edited',
      updatedAt: 8,
    }),
  );
  await assertSucceeds(updateDoc(doc(own, 'books/existing-book'), { personaId: id }));
  assert.equal((await available()).data().revision, 8);
  const { restoreOrigin, ...withoutOrigin } = profile;
  assert.deepEqual(restoreOrigin, origin);
  await assertFails(
    setPersonaWithCatalog(own, doc(own, paths.profile), { ...withoutOrigin, revision: 9 }),
  );
  await assertFails(
    setPersonaWithCatalog(own, doc(own, paths.profile), {
      ...profile,
      revision: 9,
      restoreOrigin: { ...origin, jobToken: 'f'.repeat(64) },
    }),
  );
  await assertFails(
    setPersonaWithCatalog(own, doc(own, paths.profile), {
      ...profile,
      revision: 9,
      restoreOrigin: {
        schemaVersion: 1,
        bookId: 'restore-' + 'b'.repeat(64),
        restoreId: origin.restoreId,
        jobToken: origin.jobToken,
      },
    }),
  );
  await assertFails(
    updatePersonaWithCatalog(own, doc(own, paths.profile), { revision: 8, name: 'Stale' }),
  );
  await cancelAdventurePersonaBatch(admin);
  assert.equal(await available(), null);
  await assertFails(
    updatePersonaWithCatalog(own, doc(own, paths.profile), { revision: 9, name: 'Revoked' }),
  );
  await assertFails(updateDoc(doc(own, 'books/existing-book'), { personaId: id }));
});
for (const which of ['batch', 'first', 'last'])
  test(
    'SDK adventure native ' +
      which +
      ' recreated with identical data cannot authorize server consumers',
    async () => {
      await activateAdventurePersonaBatch(admin);
      assert.ok(await available());
      const ref = admin.doc(paths[which]),
        before = await ref.get(),
        data = before.data();
      await ref.delete();
      await ref.create(data);
      assert.equal((await ref.get()).createTime.isEqual(before.createTime), false);
      assert.equal(await available(), null);
    },
  );
test('SDK v2 rules refuse wrong target, owner, generation, missing batch and extra origin fields', async () => {
  await activateAdventurePersonaBatch(admin);
  const own = env.authenticatedContext(uid).firestore(),
    ref = admin.doc(paths.batch),
    batch = (await ref.get()).data(),
    profile = adventurePersonaValue();
  for (const patch of [
    { ownerId: 'other' },
    { jobToken: 'f'.repeat(64) },
    { target: { kind: 'adventure', id: 'restore-a-' + 'a'.repeat(64) } },
    { target: { kind: 'book', id: origin.target.id } },
    { schemaVersion: 1 },
  ]) {
    await ref.set({ ...batch, ...patch });
    assert.equal(await available(), null);
    await assertFails(
      updatePersonaWithCatalog(own, doc(own, paths.profile), {
        revision: 8,
        name: 'Blocked mismatch',
      }),
    );
    await assertFails(updateDoc(doc(own, 'books/existing-book'), { personaId: id }));
  }
  await ref.delete();
  assert.equal(await available(), null);
  await assertFails(
    updatePersonaWithCatalog(own, doc(own, paths.profile), { revision: 8, name: 'Missing batch' }),
  );
  await ref.set(batch);
  for (const marker of [
    { ...origin, bookId: 'restore-' + 'b'.repeat(64) },
    { ...origin, target: { ...origin.target, path: 'outside' } },
  ]) {
    await admin.doc(paths.profile).set({ ...profile, restoreOrigin: marker });
    assert.equal(await available(), null);
    await assertFails(
      updatePersonaWithCatalog(own, doc(own, paths.profile), { revision: 8, name: 'Malformed' }),
    );
    await assertFails(updateDoc(doc(own, 'books/existing-book'), { personaId: id }));
  }
});

test('SDK keeps all 8–16 trait slots, integer and range checks within the rule evaluation budget', async () => {
  await activateAdventurePersonaBatch(admin);
  const own = env.authenticatedContext(uid).firestore(),
    reference = doc(own, paths.profile),
    value = adventurePersonaValue(),
    trait = value.traits[0],
    traits = (length) =>
      Array.from({ length }, (_, n) => ({ ...trait, id: 'sdk-trait-' + n, value: 50 }));
  await assertSucceeds(
    updatePersonaWithCatalog(own, reference, { revision: 8, traits: traits(8) }),
  );
  await assertSucceeds(
    updatePersonaWithCatalog(own, reference, { revision: 9, traits: traits(16) }),
  );
  for (const count of [7, 17])
    await assertFails(
      updatePersonaWithCatalog(own, reference, { revision: 10, traits: traits(count) }),
    );
  for (const index of [0, 7, 8, 15])
    for (const invalid of [-1, 101, 50.5, '50', null]) {
      const items = traits(16);
      items[index] = { ...items[index], value: invalid };
      await assertFails(updatePersonaWithCatalog(own, reference, { revision: 10, traits: items }));
    }
  assert.equal((await available()).data().revision, 9);
});
test('SDK manual profiles cannot acquire a null or forged restoration origin during an update', async () => {
  const own = env.authenticatedContext(uid).firestore(),
    value = adventurePersonaValue(),
    { restoreOrigin, ...plain } = value,
    path = 'users/' + uid + '/aiPersonas/custom-manual';
  assert.deepEqual(restoreOrigin, origin);
  await assertSucceeds(
    setPersonaWithCatalog(own, doc(own, path), { ...plain, id: 'custom-manual', revision: 1 }),
  );
  await assertFails(
    updatePersonaWithCatalog(own, doc(own, path), { restoreOrigin: null, revision: 2 }),
  );
  await assertFails(
    updatePersonaWithCatalog(own, doc(own, path), { restoreOrigin: origin, revision: 2 }),
  );
  await assertSucceeds(
    updatePersonaWithCatalog(own, doc(own, path), { name: 'Still manual', revision: 2 }),
  );
});
