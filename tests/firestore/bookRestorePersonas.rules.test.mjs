import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { before, beforeEach, after, test } from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, collection, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { createBookRestoreUploadService } from '../../functions/src/bookRestoreUpload.mjs';
import { createBookRestoreRemapper } from '../../functions/src/bookRestoreRemap.mjs';
import {
  personasRestoreFixture,
  personasWithDraftFixture,
  readyRestorePersonas,
  finishRestorePersonas,
} from '../../functions/test/helpers/bookRestorePersonasFixture.mjs';
import { finishRestoreHistory } from '../../functions/test/helpers/bookRestoreHistoryFixture.mjs';
import {
  cleanupLegacyRestore,
  legacyMutation as mutation,
} from '../../functions/test/helpers/bookLegacyRestoreFixture.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-restore-personas',
  uid = 'author',
  id = 'restore-personas-sdk01',
  root = 'users/' + uid + '/bookRestores/' + id;
let env, admin, api;
const factory = () => createBookRestoreUploadService({ db: admin });
before(async () => {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127\.0\.0\.1:\d+$/.test(host ?? '')) throw new Error('Use a local demo emulator.');
  const [address, port] = host.split(':');
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: address,
      port: Number(port),
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
  });
  admin = new Firestore({ projectId, host, ssl: false, universeDomain: 'googleapis.com' });
  api = factory();
});
beforeEach(async () => {
  await env.clearFirestore();
});
after(async () => {
  await admin?.terminate();
  await env?.cleanup();
});
test('SDK stages exact profiles once with CAS, private bindings, native no-op proofs and complete v9 cleanup', async () => {
  const { records, shared, archived } = personasRestoreFixture(),
    initial = await readyRestorePersonas(factory, uid, id, records),
    m = createBookRestoreRemapper({
      schemaVersion: 1,
      jobToken: initial.jobToken,
      sourceBookId: 'book',
      bookId: initial.bookId,
    }),
    sharedId = m.identity('persona', shared.id),
    archivedId = m.identity('persona', archived.id),
    libraryPath = 'users/' + uid + '/aiPersonas/' + sharedId;
  await admin.doc(libraryPath).set({ instructions: 'CURRENT PROFILE MUST NOT COPY' });
  const request = mutation(id, initial, 'personas-sdk-race01'),
    results = await Promise.allSettled([
      api.advanceBookRestorePersonas(uid, request),
      factory().advanceBookRestorePersonas(uid, mutation(id, initial, 'personas-sdk-race02')),
    ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const winner = results.findIndex((r) => r.status === 'fulfilled'),
    first = results[winner].value,
    won = winner === 0 ? request : mutation(id, initial, 'personas-sdk-race02'),
    p = await finishRestorePersonas(factory, uid, id, first.progress),
    definitions = await admin.collection(root + '/preparedPersonas').get(),
    bindings = await admin.collection(root + '/personaBindings').get();
  assert.equal(definitions.size, 2);
  assert.equal(bindings.size, 4);
  assert.equal(p.preparation.personas.profileCount, 2);
  assert.deepEqual(p.preparation.personas.bindings, { book: 1, chapter: 2, 'scene-source': 1 });
  assert.deepEqual((await admin.doc(root + '/preparedPersonas/' + sharedId).get()).data().profile, {
    ...shared,
    id: sharedId,
  });
  assert.deepEqual(
    (await admin.doc(root + '/preparedPersonas/' + archivedId).get()).data().profile,
    { ...archived, id: archivedId },
  );
  const journals = await admin
    .collection(root + '/materializationArtifacts')
    .where('kind', 'in', ['persona-definition', 'persona-binding'])
    .get();
  assert.equal(journals.size, 6);
  for (const journal of journals.docs) {
    const data = journal.data(),
      collection = data.kind === 'persona-definition' ? 'preparedPersonas' : 'personaBindings',
      native = await admin.doc(root + '/' + collection + '/' + data.id).get(),
      born = await admin
        .doc('users/' + uid + '/bookRestoreOperations/' + data.createdByOperationId)
        .get(),
      latest = await admin
        .doc('users/' + uid + '/bookRestoreOperations/' + data.lastOperationId)
        .get();
    assert.ok(native.createTime.isEqual(journal.createTime));
    assert.ok(native.createTime.isEqual(born.createTime));
    assert.ok(native.updateTime.isEqual(journal.updateTime));
    assert.ok(native.updateTime.isEqual(latest.createTime));
    assert.equal(data.createdByOperationId, data.lastOperationId);
  }
  for (const actor of [
    env.authenticatedContext(uid),
    env.authenticatedContext('other'),
    env.unauthenticatedContext(),
  ]) {
    const db = actor.firestore();
    await assertFails(getDoc(doc(db, root + '/preparedPersonas/' + sharedId)));
    await assertFails(getDocs(collection(db, root + '/personaBindings')));
    await assertFails(
      setDoc(doc(db, root + '/preparedPersonas/' + sharedId), { profile: 'replace' }),
    );
  }
  assert.equal((await admin.doc('books/' + p.bookId).get()).exists, false);
  assert.equal(
    (await admin.doc(libraryPath).get()).data().instructions,
    'CURRENT PROFILE MUST NOT COPY',
  );
  const terminal = await cleanupLegacyRestore(api, uid, id, p, { limit: 3 });
  assert.equal(terminal.preparation.cleanedArtifacts, p.preparation.artifactCount);
  assert.equal((await admin.collection(root + '/preparedPersonas').get()).empty, true);
  assert.equal((await admin.collection(root + '/personaBindings').get()).empty, true);
  assert.equal((await admin.collection(root + '/materializationArtifacts').get()).empty, true);
  assert.equal(
    (await admin.doc(libraryPath).get()).data().instructions,
    'CURRENT PROFILE MUST NOT COPY',
  );
  const replay = await api.advanceBookRestorePersonas(uid, won);
  assert.deepEqual(replay.receipt, first.receipt);
  assert.equal(replay.progress.state, 'cancelled');
});
test('SDK rejects recreated staged persona before deduplicating or committing another binding', async () => {
  const initial = await readyRestorePersonas(factory, uid, id),
    first = (
      await api.advanceBookRestorePersonas(uid, mutation(id, initial, 'personas-sdk-first01'))
    ).progress,
    definition = (await admin.collection(root + '/preparedPersonas').get()).docs[0],
    stored = definition.data();
  await definition.ref.delete();
  await definition.ref.create(stored);
  const before = await admin.doc(root).get(),
    request = mutation(id, first, 'personas-sdk-reborn01');
  await assert.rejects(() => api.advanceBookRestorePersonas(uid, request));
  const after = await admin.doc(root).get();
  assert.deepEqual(after.data(), before.data());
  assert.ok(after.updateTime.isEqual(before.updateTime));
  assert.equal((await admin.collection(root + '/personaBindings').get()).size, 1);
  assert.equal(
    (await admin.doc('users/' + uid + '/bookRestoreOperations/' + request.operationId).get())
      .exists,
    false,
  );
  assert.equal((await definition.ref.get()).exists, true);
});

test('SDK reconciles draft-only persona exactly without copying a current profile and continues through history', async () => {
  const { records, profile } = personasWithDraftFixture(),
    initial = await readyRestorePersonas(factory, uid, id, records),
    m = createBookRestoreRemapper({
      schemaVersion: 1,
      jobToken: initial.jobToken,
      sourceBookId: 'book',
      bookId: initial.bookId,
    }),
    profileId = m.identity('persona', profile.id),
    library = admin.doc('users/' + uid + '/aiPersonas/' + profileId);
  await library.create({ instructions: 'CURRENT LIBRARY MUST NOT COPY' });
  const p = await finishRestorePersonas(factory, uid, id, initial),
    stored = await admin.doc(root).get();
  assert.equal(stored.data().validationSummary.totals.profiles, 3);
  assert.equal(p.preparation.personas.profileCount, 2);
  assert.equal(p.preparation.personas.draftProfileId, profileId);
  assert.equal((await admin.doc(root + '/preparedPersonas/' + profileId).get()).exists, false);
  assert.equal((await admin.collection(root + '/preparedPersonas').get()).size, 2);
  const universe = (
      await api.advanceBookRestoreUniverse(uid, mutation(id, p, 'draft-only-sdk-universe'))
    ).progress,
    completed = await finishRestoreHistory(factory, uid, id, universe);
  assert.equal(completed.preparation.phase, 'draft');
  assert.equal(completed.preparation.personas.draftProfileId, profileId);
  assert.equal((await library.get()).data().instructions, 'CURRENT LIBRARY MUST NOT COPY');
  assert.equal((await admin.doc('books/' + completed.bookId).get()).exists, false);
  const terminal = await cleanupLegacyRestore(api, uid, id, completed, { limit: 5 });
  assert.equal(terminal.state, 'cancelled');
  assert.equal((await admin.collection(root + '/preparedPersonas').get()).empty, true);
  assert.equal((await library.get()).exists, true);
});
