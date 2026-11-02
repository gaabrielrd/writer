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
  projectId = 'demo-writer-adventure-draft-final',
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
const draftInput = (p) =>
  mutation(p, 'sdk-draft-finalize-' + String(p.checkpoint).padStart(8, '0'));
async function finalize(p) {
  return (await api.finalizeAdventureRestoreDraft(uid, draftInput(p))).progress;
}
async function prepared(options) {
  return history(await profiles(await resources(await finish(await ready(options)))));
}
test('SDK recovered native draft retains exact text, correct global count and saved manuscript, then cleanup removes it', async () => {
  const p = await prepared(),
    root = 'adventures/' + p.adventureId,
    scene = (await admin.collection(root + '/scenes').get()).docs[0],
    body = await scene.ref.collection('body').doc('current').get(),
    d = (await admin.doc(jobPath + '/preparedRoot/recovered-draft').get()).data(),
    end = await finalize(p),
    context = { target: { kind: 'adventure', id: p.adventureId }, path: root };
  assert.equal(end.staging.draftOutcome, 'version');
  assert.equal(end.staging.draftWordCount, 5000);
  const actual = await admin.runTransaction(async (tx) => {
    const version = await readHistoryVersion(tx, admin, context, d.versionId),
      parts = [];
    for (let i = 0; i < version.chunkCount; i++)
      parts.push((await readHistoryChunk(tx, admin, context, version, i)).content);
    return { version, content: parts.join('') };
  });
  assert.equal(actual.content, 'PRIVATE_DRAFT 🌙'.repeat(5000));
  assert.equal(actual.version.wordCount, 5000);
  assert.equal(actual.version.createdAt, 1234);
  assert.equal(Object.hasOwn(actual.version, 'draft'), false);
  assert.ok((await body.ref.get()).updateTime.isEqual(body.updateTime));
  assert.equal((await admin.doc(root).get()).data().ownerId, undefined);
  assert.equal(
    (await admin.doc(jobPath + '/preparedRoot/current').get()).data().value.historyRevision,
    p.staging.historyVersions + 1,
  );
  const header = await admin.doc(root + '/workVersions/' + d.versionId).get(),
    descriptor = await admin.doc(jobPath + '/preparedRoot/recovered-draft').get(),
    op = await admin
      .doc('users/' + uid + '/adventureRestoreOperations/' + draftInput(p).operationId)
      .get();
  assert.ok(header.createTime.isEqual(op.createTime));
  assert.ok(descriptor.updateTime.isEqual(op.createTime));
  assert.equal(descriptor.data().state, 'finalized');
  for (const auth of [
    env.authenticatedContext(uid),
    env.authenticatedContext('stranger'),
    env.unauthenticatedContext(),
  ])
    for (const path of [header.ref.path, descriptor.ref.path])
      await assertFails(getDoc(doc(auth.firestore(), path)));
  const cancelled = await clean(end);
  assert.equal(cancelled.state, 'cancelled');
  assert.equal(cancelled.staging.cleanedArtifacts, end.staging.artifactCount);
  assert.equal((await admin.collection(root + '/workVersions').get()).empty, true);
  assert.equal((await admin.collection(root + '/workVersionBodies').get()).empty, true);
});
test('SDK recovered draft finalization rolls back all native effects and concurrent replay creates one manifest', async () => {
  const p = await prepared(),
    root = 'adventures/' + p.adventureId,
    d = (await admin.doc(jobPath + '/preparedRoot/recovered-draft').get()).data(),
    request = draftInput(p),
    before = await admin.doc(jobPath + '/preparedRoot/current').get();
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
            if (ref.path === jobPath) throw Error('SDK draft finalization unavailable');
            return tx.update(ref, value);
          },
        }),
      ),
  };
  await assert.rejects(
    () => createAdventureRestoreTransferService({ db }).finalizeAdventureRestoreDraft(uid, request),
    /SDK draft finalization unavailable/,
  );
  assert.equal((await admin.doc(root + '/workVersions/' + d.versionId).get()).exists, false);
  assert.ok((await before.ref.get()).updateTime.isEqual(before.updateTime));
  assert.equal(
    (await admin.doc(jobPath + '/preparedRoot/recovered-draft').get()).data().state,
    'pending-finalization',
  );
  const pair = await Promise.all([
    api.finalizeAdventureRestoreDraft(uid, request),
    api.finalizeAdventureRestoreDraft(uid, request),
  ]);
  assert.deepEqual(pair[0], pair[1]);
  assert.equal(
    (await admin.collection(root + '/workVersions').get()).size,
    p.staging.historyVersions + 1,
  );
  await assert.rejects(() =>
    api.finalizeAdventureRestoreDraft(uid, {
      ...request,
      operationId: 'sdk-draft-finalize-competitor-0001',
    }),
  );
  const replay = await api.finalizeAdventureRestoreDraft(uid, request);
  assert.deepEqual(replay, pair[0]);
});
test('SDK a part modified between counting and final transaction cannot certify or create the recovered native version', async () => {
  const p = await prepared(),
    root = 'adventures/' + p.adventureId,
    d = (await admin.doc(jobPath + '/preparedRoot/recovered-draft').get()).data(),
    request = draftInput(p),
    body = admin.doc(root + '/workVersionBodies/' + digest({ versionId: d.versionId, index: 0 })),
    operationPath = 'users/' + uid + '/adventureRestoreOperations/' + request.operationId;
  let reads = 0;
  const db = {
    doc: admin.doc.bind(admin),
    collection: admin.collection.bind(admin),
    runTransaction: (cb) =>
      admin.runTransaction((tx) =>
        cb({
          get: async (ref) => {
            const result = await tx.get(ref);
            if (ref.path === operationPath && ++reads === 2)
              await body.update({ content: 'FOREIGN_AFTER_COUNT' });
            return result;
          },
          getAll: tx.getAll.bind(tx),
          create: tx.create.bind(tx),
          set: tx.set.bind(tx),
          update: tx.update.bind(tx),
          delete: tx.delete.bind(tx),
        }),
      ),
  };
  await assert.rejects(() =>
    createAdventureRestoreTransferService({ db }).finalizeAdventureRestoreDraft(uid, request),
  );
  assert.equal((await admin.doc(root + '/workVersions/' + d.versionId).get()).exists, false);
  assert.equal((await admin.doc(jobPath).get()).data().checkpoint, p.checkpoint);
  assert.equal((await body.get()).data().content, 'FOREIGN_AFTER_COUNT');
  await assert.rejects(() => clean(p));
  assert.equal((await body.get()).data().content, 'FOREIGN_AFTER_COUNT');
});
