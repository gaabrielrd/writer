import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { generateKeyPairSync } from 'node:crypto';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc } from 'firebase/firestore';
import { createStudioService } from '../../functions/src/studio.mjs';
import { createCampaignBackupFileService } from '../../functions/src/campaignBackupFile.mjs';
import { createCampaignBackupDerivedSemanticsService } from '../../functions/src/campaignBackupDerivedSemantics.mjs';
import { campaignBackupTestIndexes } from '../../functions/test/helpers/campaignBackupTestIndexes.mjs';
import { createCampaignRestoreTransferService } from '../../functions/src/campaignRestoreTransfer.mjs';
import { sha } from '../../functions/src/campaignRestoreContracts.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  uid = 'derived-semantic-sdk-owner',
  rid = 'campaign-derived-semantic-sdk',
  root = 'users/' + uid + '/campaignRestores/' + rid;
let env, admin;
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127\.0\.0\.1:\d+$/.test(address ?? '')) throw Error('Local demo emulator only');
  const [host, port] = address.split(':'),
    projectId = 'demo-writer-derived-semantics';
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
  'real semantic checkpoint preserves native receipts, concurrent CAS, resumed proof, revocation and cancellation',
  { timeout: 180000 },
  async () => {
    const pair = generateKeyPairSync('ed25519'),
      keys = [{ id: 'semantic-sdk-test', state: 'active', publicKey: pair.publicKey }],
      native = await createStudioService({ db: admin }).createCampaign(uid, {
        operationId: 'semantic-sdk-original-campaign',
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
          mut(p, 'semantic-sdk-upload-' + n, {
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
    ]) {
      let n = 0;
      while ((p[field]?.phase ?? p[field]?.status) !== phase && n < 100)
        p = (await api[method](uid, mut(p, 'semantic-sdk-' + field + '-' + n++, { limit: 25 })))
          .progress;
      assert.equal(p[field].phase ?? p[field].status, phase);
    }
    const requests = [
        mut(p, 'semantic-sdk-race-first', { limit: 1 }),
        mut(p, 'semantic-sdk-race-second', { limit: 1 }),
      ],
      results = await Promise.allSettled(
        requests.map((r) => api.advanceCampaignRestoreDerivedSemantics(uid, r)),
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
    let n = 0;
    while (p.derivedCheck.phase !== 'verified' && n < 100)
      p = (
        await api.advanceCampaignRestoreDerivedSemantics(
          uid,
          mut(p, 'semantic-sdk-check-' + n++, { limit: 1 }),
        )
      ).progress;
    const proof = await api.getCampaignRestoreDerivedSemantics(uid, {
        restoreId: rid,
        jobToken: p.jobToken,
      }),
      expected = await createCampaignBackupDerivedSemanticsService({
        keys,
        now: () => 6000,
      }).reviewCampaignBackupDerivedContent(
        uid,
        { size: bytes.length, read: async (o, n) => bytes.subarray(o, o + n) },
        { index: await campaignBackupTestIndexes([])('derived') },
      );
    assert.deepEqual(proof, expected);
    assert.equal(proof.validation, 'campaign-derived-semantics-only');
    const job = (await admin.doc(root).get()).data();
    assert.ok(job.derivedCheck.payload.data);
    assert.doesNotMatch(JSON.stringify(p), /payload|hashState|PRIVATE/);
    await assertFails(getDoc(doc(env.authenticatedContext(uid).firestore(), root)));
    keys[0].state = 'revoked';
    await assert.rejects(
      api.getCampaignRestoreDerivedSemantics(uid, { restoreId: rid, jobToken: p.jobToken }),
      (e) => e.details?.reason === 'campaign-backup-invalid-attestation',
    );
    p = (await api.cancelCampaignRestore(uid, mut(p, 'semantic-sdk-cancel-operation'))).progress;
    assert.equal((await admin.doc(root).get()).data().derivedCheck, null);
    assert.equal(
      (await admin.doc('users/' + uid + '/campaignRestoreKeys/' + rid).get()).exists,
      false,
    );
    assert.deepEqual(
      (await api.advanceCampaignRestoreDerivedSemantics(uid, requests[winner])).receipt,
      receipt,
    );
    await assert.rejects(
      api.getCampaignRestoreDerivedSemantics(uid, { restoreId: rid, jobToken: p.jobToken }),
    );
  },
);
