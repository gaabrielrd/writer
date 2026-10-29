import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { generateKeyPairSync } from 'node:crypto';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc } from 'firebase/firestore';
import { createStudioService } from '../../functions/src/studio.mjs';
import { createCampaignBackupFileService } from '../../functions/src/campaignBackupFile.mjs';
import { createCampaignBackupOriginReviewService } from '../../functions/src/campaignBackupOriginReview.mjs';
import { campaignBackupTestIndexes } from '../../functions/test/helpers/campaignBackupTestIndexes.mjs';
import { createCampaignRestoreTransferService } from '../../functions/src/campaignRestoreTransfer.mjs';
import { prepareCampaignAuthorization } from '../../functions/src/campaignAuthorization.mjs';
import { sha } from '../../functions/src/campaignRestoreContracts.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  uid = 'origin-review-sdk-owner',
  rid = 'campaign-origin-review-sdk',
  root = 'users/' + uid + '/campaignRestores/' + rid;
let env, admin;
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127\.0\.0\.1:\d+$/.test(address ?? '')) throw Error('Local demo emulator only');
  const [host, port] = address.split(':'),
    projectId = 'demo-writer-origin-review';
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
beforeEach(async () => env.clearFirestore());
after(async () => {
  await admin?.terminate();
  await env?.cleanup();
});
const mut = (p, operationId, extra = {}) => ({
  restoreId: rid,
  jobToken: p.jobToken,
  operationId,
  expectedCheckpoint: p.checkpoint,
  ...extra,
});
test(
  'native origin checkpoints enforce CAS, clock revalidation, explicit restart, Rules and cancellation',
  { timeout: 180000 },
  async () => {
    const pair = generateKeyPairSync('ed25519'),
      keys = [{ id: 'origin-sdk-test', state: 'active', publicKey: pair.publicKey }],
      native = await createStudioService({ db: admin }).createCampaign(uid, {
        operationId: 'origin-sdk-original-campaign',
        title: 'PRIVATE ORIGINAL',
      }),
      frames = [];
    await createCampaignBackupFileService({
      db: admin,
      storage: {},
      keys,
      keyId: keys[0].id,
      privateKey: pair.privateKey,
      now: () => 5000,
    }).writeCampaignBackupFile(
      uid,
      { campaignId: native.id },
      {
        sink: {
          async write(b) {
            frames.push(Buffer.from(b));
          },
          async commit() {},
          async abort() {
            frames.length = 0;
          },
        },
      },
    );
    const bytes = Buffer.concat(frames),
      options = { db: admin, keys, now: () => 6000 };
    let api = createCampaignRestoreTransferService(options),
      p = (
        await api.startCampaignRestore(uid, {
          operationId: rid,
          source: {
            format: 'writer-campaign-backup',
            version: 1,
            byteLength: bytes.length,
            sha256: sha(bytes),
          },
        })
      ).progress;
    for (let n = 0; n < Math.ceil(bytes.length / 65536); n++) {
      const b = bytes.subarray(n * 65536, (n + 1) * 65536);
      p = (
        await api.appendCampaignRestoreChunk(
          uid,
          mut(p, 'origin-sdk-upload-' + n, {
            index: n,
            chunkHash: sha(b),
            chunkBase64: b.toString('base64'),
          }),
        )
      ).progress;
    }
    for (const [method, field, phase] of [
      ['advanceCampaignRestoreFileReview', 'fileReview', 'verified'],
      ['advanceCampaignRestoreOwnReview', 'ownReview', 'verified'],
      ['advanceCampaignRestoreDerivedIndex', 'derivedReview', 'indexed'],
      ['advanceCampaignRestoreDerivedSemantics', 'derivedCheck', 'verified'],
    ]) {
      let n = 0;
      while ((p[field]?.phase ?? p[field]?.status) !== phase && n < 100)
        p = (await api[method](uid, mut(p, 'origin-sdk-' + field + '-' + n++, { limit: 25 })))
          .progress;
      assert.equal(p[field].phase ?? p[field].status, phase);
    }
    const requests = [
        mut(p, 'origin-sdk-race-first', { limit: 1 }),
        mut(p, 'origin-sdk-race-second', { limit: 1 }),
      ],
      results = await Promise.allSettled(
        requests.map((r) => api.advanceCampaignRestoreOriginReview(uid, r)),
      );
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(
      results.find((r) => r.status === 'rejected').reason.details.reason,
      'checkpoint-conflict',
    );
    const winner = results.findIndex((r) => r.status === 'fulfilled'),
      receipt = results[winner].value.receipt;
    api = createCampaignRestoreTransferService(options);
    p = (await api.getCampaignRestore(uid, { restoreId: rid })).progress;
    async function finish() {
      let n = 0;
      while (p.originReview?.phase !== 'verified' && n++ < 200)
        p = (
          await api.advanceCampaignRestoreOriginReview(
            uid,
            mut(p, 'origin-sdk-finish-' + p.checkpoint, { limit: 1 }),
          )
        ).progress;
      assert.equal(p.originReview.phase, 'verified');
    }
    async function reference() {
      return createCampaignBackupOriginReviewService(options).reviewCampaignBackupOrigins(
        uid,
        {
          size: bytes.length,
          read: async (o, n) => bytes.subarray(o, o + n),
        },
        { index: await campaignBackupTestIndexes([])('origins') },
      );
    }
    const getProof = () =>
      api.getCampaignRestoreOriginReview(uid, { restoreId: rid, jobToken: p.jobToken });
    await finish();
    assert.deepEqual(await getProof(), await reference());
    const job = (await admin.doc(root).get()).data();
    assert.ok(job.originReview.payload.data);
    assert.doesNotMatch(JSON.stringify(p), /payload|hashState|PRIVATE|clock/);
    await assertFails(getDoc(doc(env.authenticatedContext(uid).firestore(), root)));
    await admin.runTransaction(async (tx) => {
      const a = await prepareCampaignAuthorization(tx, admin, uid, { bump: true });
      a.commit();
    });
    await assert.rejects(getProof(), (e) => e.details?.reason === 'campaign-backup-origin-changed');
    const restart = mut(p, 'origin-sdk-restart-operation'),
      reset = await api.restartCampaignRestoreOriginReview(uid, restart);
    p = reset.progress;
    assert.equal(p.originReview, undefined);
    assert.equal(p.derivedCheck.phase, 'verified');
    assert.equal(p.ownReview.phase, 'verified');
    await finish();
    assert.deepEqual(await getProof(), await reference());
    assert.deepEqual(
      (await api.restartCampaignRestoreOriginReview(uid, restart)).receipt,
      reset.receipt,
    );
    keys[0].state = 'revoked';
    await assert.rejects(
      getProof(),
      (e) => e.details?.reason === 'campaign-backup-invalid-attestation',
    );
    p = (await api.cancelCampaignRestore(uid, mut(p, 'origin-sdk-cancel-operation'))).progress;
    assert.equal((await admin.doc(root).get()).data().originReview, null);
    assert.equal(
      (await admin.doc('users/' + uid + '/campaignRestoreKeys/' + rid).get()).exists,
      false,
    );
    assert.deepEqual(
      (await api.advanceCampaignRestoreOriginReview(uid, requests[winner])).receipt,
      receipt,
    );
    await assert.rejects(getProof());
  },
);
