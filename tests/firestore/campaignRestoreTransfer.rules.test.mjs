import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import {
  doc,
  collection,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  limit,
  query,
} from 'firebase/firestore';
import { createCampaignRestoreTransferService } from '../../functions/src/campaignRestoreTransfer.mjs';
import { createStudioService } from '../../functions/src/studio.mjs';
import {
  sha,
  chunkId,
  fingerprint,
  startInput,
} from '../../functions/src/campaignRestoreContracts.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url));
const { Firestore } = requireFunctions('firebase-admin/firestore');
const projectId = 'demo-writer-campaign-restore',
  uid = 'campaign-restore-owner',
  rid = 'campaign-restore-sdk-0001',
  bytes = Buffer.from('PRIVATE-CAMPAIGN-UPLOAD-'.repeat(7000)),
  input = {
    operationId: rid,
    source: {
      format: 'writer-campaign-backup',
      version: 1,
      byteLength: bytes.length,
      sha256: sha(bytes),
    },
  };
let env, admin, api;
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127\.0\.0\.1:\d+$/.test(address ?? '')) throw Error('Local demo emulator only');
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
  api = createCampaignRestoreTransferService({ db: admin });
});
beforeEach(async () => env.clearFirestore());
after(async () => {
  await admin?.terminate();
  await env?.cleanup();
});
const mut = (p, oid, extra = {}) => ({
  restoreId: rid,
  jobToken: p.jobToken,
  operationId: oid,
  expectedCheckpoint: p.checkpoint,
  ...extra,
});
const part = (p, index, oid = 'campaign-sdk-upload-' + index) => {
  const b = bytes.subarray(index * 65536, (index + 1) * 65536);
  return mut(p, oid, { index, chunkHash: sha(b), chunkBase64: b.toString('base64') });
};
test('SDK cannot read, query or mutate any upload, key, receipt, marker or reservation even as owner', async () => {
  let p = (await api.startCampaignRestore(uid, input)).progress;
  p = (await api.appendCampaignRestoreChunk(uid, part(p, 0))).progress;
  const otherId = 'campaign-restore-sdk-fence';
  await api.resolveCampaignRestoreStart(uid, {
    operationId: otherId,
    requestHash: 'a'.repeat(64),
    intent: 'cancel',
  });
  const root = 'users/' + uid + '/campaignRestores/' + rid,
    paths = [
      root,
      root + '/chunks/' + chunkId(0),
      root + '/receipts/' + rid,
      'users/' + uid + '/campaignRestoreKeys/' + rid,
      'users/' + uid + '/campaignRestoreOperations/' + rid,
      'users/' + uid + '/campaignRestoreStartFences/' + otherId,
      'campaignRestoreReservations/' + p.campaignId,
      'campaigns/' + p.campaignId,
    ];
  for (const context of [
    env.authenticatedContext(uid),
    env.authenticatedContext('other'),
    env.unauthenticatedContext(),
  ]) {
    const db = context.firestore();
    for (const path of paths) {
      await assertFails(getDoc(doc(db, path)));
      await assertFails(setDoc(doc(db, path), { ownerId: uid }));
      await assertFails(deleteDoc(doc(db, path)));
    }
    for (const name of [
      'campaignRestores',
      'campaignRestoreKeys',
      'campaignRestoreOperations',
      'campaignRestoreStartFences',
    ])
      await assertFails(getDocs(query(collection(db, 'users/' + uid + '/' + name), limit(25))));
    await assertFails(getDocs(query(collection(db, 'campaignRestoreReservations'), limit(25))));
  }
  const studio = createStudioService({ db: admin });
  assert.equal(await studio.getCampaign(uid, { id: p.campaignId }), null);
  assert.deepEqual((await studio.listStudioProjects(uid, { kind: 'campaign' })).items, []);
  await admin.doc('campaigns/' + p.campaignId).delete();
  await assert.rejects(
    studio.createCampaign(uid, { operationId: p.campaignId, title: 'Cannot reuse' }),
    (e) => e.details?.reason === 'campaign-restore-reserved',
  );
});

test('real native timestamps and concurrent transactions preserve one upload prefix, then read exact ciphertext-backed bytes', async () => {
  const p = (await api.startCampaignRestore(uid, input)).progress;
  const docs = await admin.getAll(
    admin.doc('users/' + uid + '/campaignRestores/' + rid),
    admin.doc('users/' + uid + '/campaignRestoreKeys/' + rid),
    admin.doc('campaignRestoreReservations/' + p.campaignId),
    admin.doc('campaigns/' + p.campaignId),
  );
  assert.ok(docs.every((s) => s.createTime.isEqual(docs[0].createTime)));
  const outcomes = await Promise.allSettled([
    api.appendCampaignRestoreChunk(uid, part(p, 0, 'campaign-sdk-race-one')),
    api.appendCampaignRestoreChunk(uid, part(p, 0, 'campaign-sdk-race-two')),
  ]);
  assert.equal(outcomes.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(
    outcomes.find((r) => r.status === 'rejected').reason.details.reason,
    'checkpoint-conflict',
  );
  let current = (await api.getCampaignRestore(uid, { restoreId: rid })).progress;
  for (let n = current.uploadedChunks; n < Math.ceil(bytes.length / 65536); n++)
    current = (await api.appendCampaignRestoreChunk(uid, part(current, n))).progress;
  assert.equal(current.state, 'bytes-verified');
  const port = await api.openCampaignRestoreSource(uid, {
    restoreId: rid,
    jobToken: current.jobToken,
  });
  assert.deepEqual(await port.read(65520, 80), bytes.subarray(65520, 65600));
  assert.deepEqual(await port.read(0, bytes.length), bytes);
});

test('real cancellation revokes the key, paginates metadata cleanup, preserves native creation and fences a delayed start', async () => {
  let p = (await api.startCampaignRestore(uid, input)).progress;
  for (let n = 0; n < Math.ceil(bytes.length / 65536); n++)
    p = (await api.appendCampaignRestoreChunk(uid, part(p, n))).progress;
  const request = mut(p, 'campaign-sdk-cancel'),
    cancelled = await api.cancelCampaignRestore(uid, request);
  assert.deepEqual(await api.cancelCampaignRestore(uid, request), cancelled);
  assert.equal(
    (await admin.doc('users/' + uid + '/campaignRestoreKeys/' + rid).get()).exists,
    false,
  );
  p = cancelled.progress;
  for (let n = 0; p.state !== 'cancelled' && n < 20; n++)
    p = (
      await api.advanceCampaignRestoreCleanup(
        uid,
        mut(p, 'campaign-sdk-cleanup-' + n, { limit: 1 }),
      )
    ).progress;
  assert.equal(p.state, 'cancelled');
  assert.equal(
    (await admin.collection('users/' + uid + '/campaignRestores/' + rid + '/chunks').get()).empty,
    true,
  );
  const studio = createStudioService({ db: admin });
  const ordinary = await studio.createCampaign(uid, {
    operationId: 'campaign-sdk-control-0001',
    title: 'Ordinary',
  });
  assert.equal(ordinary.title, 'Ordinary');
  await assert.rejects(
    studio.createCampaign(uid, { operationId: p.campaignId, title: 'Collision' }),
  );
  await assert.rejects(
    api.openCampaignRestoreSource(uid, { restoreId: rid, jobToken: p.jobToken }),
  );
  assert.equal((await api.startCampaignRestore(uid, input)).progress.state, 'cancelled');
  const original = fingerprint(
    'start',
    startInput({ ...input, operationId: 'campaign-sdk-unknown-0001' }),
  );
  const fence = await api.resolveCampaignRestoreStart(uid, {
    operationId: 'campaign-sdk-unknown-0001',
    requestHash: original,
    intent: 'cancel',
  });
  assert.equal(
    (await api.startCampaignRestore(uid, { ...input, operationId: 'campaign-sdk-unknown-0001' }))
      .campaignId,
    fence.campaignId,
  );
});
