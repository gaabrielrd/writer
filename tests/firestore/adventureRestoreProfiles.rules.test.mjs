import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { before, beforeEach, after, test } from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc } from 'firebase/firestore';
import { createAdventureRestoreTransferService } from '../../functions/src/adventureRestoreTransfer.mjs';
import { profileAdventureArchive } from '../../functions/test/helpers/adventureRestoreProfileArchiveFixture.mjs';
import {
  adventureIdentityToken,
  storedMetadata,
  storedBody,
} from '../../functions/src/adventureLoreContracts.mjs';
import { digest } from '../../functions/src/adventureRestoreContracts.mjs';
import {
  uid,
  id,
  request,
  mutation,
  chunkRequest,
} from '../../functions/test/helpers/adventureRestoreTransferFixture.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-adventure-profiles',
  jobPath = 'users/' + uid + '/adventureRestores/' + id;
let env, admin, api;
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127\.0\.0\.1:\d+$/.test(address ?? '')) throw Error('Use only the local demo emulator');
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
  api = createAdventureRestoreTransferService({ db: admin });
});
beforeEach(async () => {
  await env.clearFirestore();
});
after(async () => {
  await admin?.terminate();
  await env?.cleanup();
});
const req = (p) => mutation(p, 'sdk-resource-' + String(p.checkpoint).padStart(8, '0'));
async function ready(options) {
  const bytes = await profileAdventureArchive(options);
  let p = (await api.startAdventureRestore(uid, request(bytes))).progress;
  for (let at = 0; at < Math.ceil(bytes.length / 65536); at++)
    p = (await api.appendAdventureRestoreChunk(uid, chunkRequest(p, bytes, at))).progress;
  p = (
    await api.advanceAdventureRestoreIntegrity(
      uid,
      mutation(p, 'sdk-resource-integrity-0001', { limit: 16 }),
    )
  ).progress;
  for (let n = 0; ['bytes-verified', 'validating'].includes(p.state); n++) {
    assert.ok(n < 2000);
    p = (
      await api.advanceAdventureRestoreValidation(
        uid,
        mutation(p, 'sdk-resource-validate-' + String(n).padStart(6, '0')),
      )
    ).progress;
  }
  assert.equal(p.state, 'content-verified');
  return p;
}
async function step(p) {
  return (await api.advanceAdventureRestoreStructure(uid, req(p))).progress;
}
async function finish(p) {
  for (let n = 0; !p.staging || p.staging.phase === 'structure'; n++) {
    assert.ok(n < 2000);
    p = await step(p);
  }
  return p;
}
async function clean(p) {
  p = (await api.cancelAdventureRestore(uid, mutation(p, 'sdk-resource-cancel-0001'))).progress;
  for (let n = 0; p.state === 'cancelling'; n++) {
    assert.ok(n < 2000);
    p = (
      await api.advanceAdventureRestoreCleanup(
        uid,
        mutation(p, 'sdk-resource-clean-' + String(n).padStart(6, '0'), { limit: 50 }),
      )
    ).progress;
  }
  return p;
}
async function resourceStep(p) {
  return (await api.advanceAdventureRestoreResources(uid, req(p))).progress;
}
async function resources(p) {
  for (let n = 0; p.staging.phase !== 'resources-ready'; n++) {
    assert.ok(n < 2000);
    p = await resourceStep(p);
  }
  return p;
}
async function profiles(p) {
  for (let n = 0; p.staging.phase !== 'profiles-ready'; n++) {
    assert.ok(n < 1000);
    p = (
      await api.advanceAdventureRestoreProfiles(
        uid,
        mutation(p, 'sdk-profile-' + String(p.checkpoint).padStart(8, '0')),
      )
    ).progress;
  }
  return p;
}
test('SDK native lore pairs preserve root birth identity and private persona dedup, then cleanup removes all targets', async () => {
  const start = await resources(await finish(await ready({ bodiesFirst: true }))),
    end = await profiles(start),
    root = 'adventures/' + start.adventureId,
    rootSnapshot = await admin.doc(root).get(),
    definition = (await admin.doc(jobPath + '/preparedRoot/current').get()).data();
  assert.equal(rootSnapshot.data().ownerId, undefined);
  const context = {
    uid,
    adventureId: start.adventureId,
    adventureToken: adventureIdentityToken(uid, start.adventureId, rootSnapshot),
    collectionRevision: definition.value.loreVersion,
  };
  const heads = (await admin.collection(root + '/lore').get()).docs,
    bodies = (await admin.collection(root + '/loreBodies').get()).docs,
    privateValues = (await admin.collection(jobPath + '/preparedRoot').get()).docs;
  assert.equal(heads.length, 3);
  assert.equal(bodies.length, 2);
  assert.equal(definition.value.loreVersion, 3);
  assert.equal(end.staging.personaProfiles, 1);
  for (const h of heads) {
    const value = h.data();
    storedMetadata(value, context, h.id);
    const body = await admin.doc(root + '/loreBodies/' + h.id).get();
    if (value.deleted) assert.equal(body.exists, false);
    else {
      assert.ok(h.createTime.isEqual(body.createTime));
      assert.equal(storedBody(body.data(), context, value).details, 'PRIVATE_DETAILS 🌙');
    }
  }
  const persona = privateValues.find((v) => v.id.startsWith('persona-')),
    bindings = privateValues.filter((v) => v.id.startsWith('binding-'));
  assert.equal(bindings.length, 2);
  assert.equal(persona.data().profileHash, digest(persona.data().profile));
  assert.ok(bindings.every((v) => v.data().profileHash === persona.data().profileHash));
  assert.equal((await admin.collection('users/' + uid + '/aiPersonas').get()).empty, true);
  for (const auth of [
    env.authenticatedContext(uid),
    env.authenticatedContext('stranger'),
    env.unauthenticatedContext(),
  ])
    for (const path of [
      root,
      heads[0].ref.path,
      bodies[0].ref.path,
      persona.ref.path,
      bindings[0].ref.path,
    ])
      await assertFails(getDoc(doc(auth.firestore(), path)));
  const cancelled = await clean(end);
  assert.equal(cancelled.state, 'cancelled');
  assert.equal(cancelled.staging.cleanedArtifacts, end.staging.artifactCount);
  for (const name of ['lore', 'loreBodies', 'scenes', 'workProgress'])
    assert.equal((await admin.collection(root + '/' + name).get()).empty, true);
  assert.equal((await admin.collection(jobPath + '/preparedRoot').get()).empty, true);
});
test('SDK native pair rollback and same-operation/checkpoint races preserve one confirmed lore effect', async () => {
  const p = await resources(await finish(await ready())),
    root = 'adventures/' + p.adventureId,
    before = await admin.doc(jobPath + '/preparedRoot/current').get(),
    request = mutation(p, 'sdk-profile-initial-0001');
  const db = {
    doc: admin.doc.bind(admin),
    collection: admin.collection.bind(admin),
    runTransaction: (cb) =>
      admin.runTransaction((tx) =>
        cb({
          get: tx.get.bind(tx),
          getAll: tx.getAll.bind(tx),
          create: tx.create.bind(tx),
          set: tx.set.bind(tx),
          delete: tx.delete.bind(tx),
          update(ref, value) {
            if (ref.path === jobPath) throw Error('SDK profile commit unavailable');
            return tx.update(ref, value);
          },
        }),
      ),
  };
  await assert.rejects(
    () =>
      createAdventureRestoreTransferService({ db }).advanceAdventureRestoreProfiles(uid, request),
    /SDK profile commit unavailable/,
  );
  assert.equal((await admin.collection(root + '/lore').get()).empty, true);
  assert.equal((await admin.collection(root + '/loreBodies').get()).empty, true);
  assert.ok((await before.ref.get()).updateTime.isEqual(before.updateTime));
  const pair = await Promise.all([
    api.advanceAdventureRestoreProfiles(uid, request),
    api.advanceAdventureRestoreProfiles(uid, request),
  ]);
  assert.deepEqual(pair[0], pair[1]);
  const next = pair[0].progress,
    operation = mutation(next, 'sdk-profile-next-0001'),
    race = await Promise.allSettled([
      api.advanceAdventureRestoreProfiles(uid, operation),
      api.advanceAdventureRestoreProfiles(uid, {
        ...operation,
        operationId: 'sdk-profile-competitor-0001',
      }),
    ]);
  assert.equal(race.filter((v) => v.status === 'fulfilled').length, 1);
  assert.equal((await admin.collection(root + '/lore').get()).size, 2);
  assert.equal((await admin.collection(root + '/loreBodies').get()).size, 2);
  const replay = await api.advanceAdventureRestoreProfiles(uid, request);
  assert.deepEqual(replay.receipt, pair[0].receipt);
  assert.equal(replay.progress.checkpoint, p.checkpoint + 2);
});
test('SDK a changed private persona prevents certification without deleting the changed definition', async () => {
  const p = await profiles(await resources(await finish(await ready()))),
    persona = (await admin.collection(jobPath + '/preparedRoot').get()).docs.find((d) =>
      d.id.startsWith('persona-'),
    );
  await persona.ref.update({ 'profile.name': 'FOREIGN_PROFILE' });
  await assert.rejects(() => clean(p));
  assert.equal((await admin.doc(jobPath).get()).data().state, 'cancelling');
  assert.equal((await persona.ref.get()).data().profile.name, 'FOREIGN_PROFILE');
});
