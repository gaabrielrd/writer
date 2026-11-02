import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { before, beforeEach, after, test } from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc } from 'firebase/firestore';
import { createAdventureRestoreTransferService } from '../../functions/src/adventureRestoreTransfer.mjs';
import { historyDraftAdventureArchive } from '../../functions/test/helpers/adventureRestoreHistoryDraftFixture.mjs';
import { readHistoryVersion, readHistoryChunk } from '../../functions/src/workHistoryContracts.mjs';
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
  projectId = 'demo-writer-adventure-history',
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
  const bytes = await historyDraftAdventureArchive(options);
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
const historyReq = (p) => mutation(p, 'sdk-history-' + String(p.checkpoint).padStart(8, '0'));
async function historyStep(p) {
  return (await api.advanceAdventureRestoreHistory(uid, historyReq(p))).progress;
}
async function history(p) {
  for (let n = 0; p.staging.phase !== 'history-ready'; n++) {
    assert.ok(n < 2000);
    p = await historyStep(p);
  }
  return p;
}
async function pending(p) {
  while (!p.staging.historyPending) p = await historyStep(p);
  return p;
}
test('SDK historical UTF-8 and draft bodies preserve saved text, native readers and private visibility through complete cleanup', async () => {
  const p = await profiles(await resources(await finish(await ready()))),
    root = 'adventures/' + p.adventureId,
    scene = (await admin.collection(root + '/scenes').get()).docs[0],
    saved = await scene.ref.collection('body').doc('current').get();
  const end = await history(p),
    version = (await admin.collection(root + '/workVersions').get()).docs[0],
    context = { target: { kind: 'adventure', id: p.adventureId }, path: root };
  const actual = await admin.runTransaction(async (tx) => {
    const value = await readHistoryVersion(tx, admin, context, version.id),
      parts = [];
    for (let i = 0; i < value.chunkCount; i++)
      parts.push((await readHistoryChunk(tx, admin, context, value, i)).content);
    return { value, content: parts.join('') };
  });
  assert.equal(actual.content, 'a'.repeat(65535) + '🌙');
  assert.equal(actual.value.contentHash, digest(actual.content));
  assert.equal(actual.value.resource.kind, 'scene');
  assert.equal((await admin.collection(root + '/scenes').get()).size, 1);
  assert.ok((await saved.ref.get()).updateTime.isEqual(saved.updateTime));
  assert.equal((await admin.doc(root).get()).data().ownerId, undefined);
  const draft = await admin.doc(jobPath + '/preparedRoot/recovered-draft').get(),
    descriptor = draft.data(),
    state = admin.doc(jobPath + '/preparedRoot/text-state');
  assert.equal(descriptor.state, 'pending-finalization');
  assert.equal(
    (await admin.doc(root + '/workVersions/' + descriptor.versionId).get()).exists,
    false,
  );
  const bodies = (await admin.collection(root + '/workVersionBodies').get()).docs
    .map((d) => d.data())
    .filter((v) => v.versionId === descriptor.versionId)
    .sort((a, b) => a.index - b.index);
  assert.equal(bodies.map((v) => v.content).join(''), 'PRIVATE_DRAFT 🌙'.repeat(5000));
  for (const auth of [
    env.authenticatedContext(uid),
    env.authenticatedContext('stranger'),
    env.unauthenticatedContext(),
  ])
    for (const path of [
      version.ref.path,
      state.path,
      draft.ref.path,
      root + '/workVersionBodies/' + digest({ versionId: descriptor.versionId, index: 0 }),
    ])
      await assertFails(getDoc(doc(auth.firestore(), path)));
  const cancelled = await clean(end);
  assert.equal(cancelled.state, 'cancelled');
  assert.equal(cancelled.staging.cleanedArtifacts, end.staging.artifactCount);
  for (const name of ['workVersions', 'workVersionBodies', 'scenes'])
    assert.equal((await admin.collection(root + '/' + name).get()).empty, true);
  assert.equal((await admin.collection(jobPath + '/preparedRoot').get()).empty, true);
});
test('SDK raw rollback and concurrent replay commit the verified prefix and final native manifest once', async () => {
  const p = await pending(await profiles(await resources(await finish(await ready())))),
    root = 'adventures/' + p.adventureId,
    state = await admin.doc(jobPath + '/preparedRoot/text-state').get(),
    input = historyReq(p);
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
            if (ref.path === jobPath) throw Error('SDK history commit unavailable');
            return tx.update(ref, value);
          },
        }),
      ),
  };
  await assert.rejects(
    () => createAdventureRestoreTransferService({ db }).advanceAdventureRestoreHistory(uid, input),
    /SDK history commit unavailable/,
  );
  assert.equal((await admin.collection(root + '/workVersionBodies').get()).empty, true);
  assert.ok((await state.ref.get()).updateTime.isEqual(state.updateTime));
  const pair = await Promise.all([
    api.advanceAdventureRestoreHistory(uid, input),
    api.advanceAdventureRestoreHistory(uid, input),
  ]);
  assert.deepEqual(pair[0], pair[1]);
  const next = pair[0].progress,
    race = await Promise.allSettled([
      historyStep(next),
      api.advanceAdventureRestoreHistory(uid, {
        ...historyReq(next),
        operationId: 'sdk-history-competitor-0001',
      }),
    ]);
  assert.equal(race.filter((v) => v.status === 'fulfilled').length, 1);
  const replay = await api.advanceAdventureRestoreHistory(uid, input);
  assert.equal(replay.progress.checkpoint, p.checkpoint + 2);
  assert.deepEqual(replay.receipt, pair[0].receipt);
  assert.equal((await admin.collection(root + '/workVersions').get()).size, 1);
});
test('SDK altered native private prefix cannot resume or certify cancellation and is preserved', async () => {
  const prepared = await profiles(await resources(await finish(await ready()))),
    p = await historyStep(await pending(prepared)),
    state = admin.doc(jobPath + '/preparedRoot/text-state');
  await state.update({ tailBase64: 'Rk9SRUlHTg==' });
  await assert.rejects(() => historyStep(p));
  assert.equal((await admin.doc(jobPath).get()).data().checkpoint, p.checkpoint);
  await assert.rejects(() => clean(p));
  assert.equal((await admin.doc(jobPath).get()).data().state, 'cancelling');
  assert.equal((await state.get()).data().tailBase64, 'Rk9SRUlHTg==');
});
