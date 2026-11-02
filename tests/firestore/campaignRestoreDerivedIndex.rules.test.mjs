import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, collection, getDoc, getDocs, setDoc, deleteDoc } from 'firebase/firestore';
import {
  restoredBackupFixture,
  uid,
} from '../../functions/test/helpers/campaignRestoredBackup.mjs';
import { createCampaignRestoreTransferService } from '../../functions/src/campaignRestoreTransfer.mjs';
import { sha, chunkId } from '../../functions/src/campaignRestoreContracts.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  rid = 'campaign-derived-sdk-0001',
  root = 'users/' + uid + '/campaignRestores/' + rid;
let env, admin;
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127\.0\.0\.1:\d+$/.test(address ?? '')) throw Error('Local demo emulator only');
  const [host, port] = address.split(':'),
    projectId = 'demo-writer-derived-index';
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
  'real derived index preserves row-position native birth, authenticated lookup/absence and private cancellation cleanup',
  { timeout: 240000 },
  async () => {
    // The signed imported archive is not evidence of current native origin access.
    // This journey deliberately stops at staging, before any origin grant/activation.
    const original = await restoredBackupFixture({ local: true }),
      bytes = (await original.write()).bytes,
      keys = original.keys,
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
          mut(p, 'derived-sdk-upload-' + n, {
            index: n,
            chunkHash: sha(b),
            chunkBase64: b.toString('base64'),
          }),
        )
      ).progress;
    }
    let n = 0;
    while (p.fileReview?.status !== 'verified' && n < 100)
      p = (
        await api.advanceCampaignRestoreFileReview(
          uid,
          mut(p, 'derived-sdk-file-' + n++, { limit: 25 }),
        )
      ).progress;
    n = 0;
    while (p.ownReview?.phase !== 'verified' && n < 100)
      p = (
        await api.advanceCampaignRestoreOwnReview(
          uid,
          mut(p, 'derived-sdk-own-' + n++, { limit: 25 }),
        )
      ).progress;
    const q = mut(p, 'derived-sdk-index-first', { limit: 25 }),
      first = await api.advanceCampaignRestoreDerivedIndex(uid, q);
    assert.deepEqual(await api.advanceCampaignRestoreDerivedIndex(uid, q), first);
    api = createCampaignRestoreTransferService(options);
    p = first.progress;
    n = 0;
    while (p.derivedReview.phase !== 'indexed' && n < 100)
      p = (
        await api.advanceCampaignRestoreDerivedIndex(
          uid,
          mut(p, 'derived-sdk-index-' + n++, { limit: 25 }),
        )
      ).progress;
    const port = await api.openCampaignRestoreDerivedIndex(uid, {
        restoreId: rid,
        jobToken: p.jobToken,
      }),
      page = await port.read(0, Math.min(25, port.certificate.rows)),
      item = page.find((r) => r.section === 'base:item');
    assert.ok(item);
    assert.equal(port.certificate.validation, 'campaign-derived-index-only');
    assert.deepEqual(await port.lookup(item.section, item.key), item);
    const absent = await port.lookup('base:item', JSON.stringify(['f'.repeat(64), null]));
    assert.equal(absent.after, null);
    assert.equal(absent.before.position + 1, port.certificate.sizes['base:item']);
    const native = await admin.doc(root + '/derivedRows/' + chunkId(0)).get(),
      row = native.data(),
      pointer = await admin
        .doc(root + '/derivedPositions/' + row.section + '-' + chunkId(row.position))
        .get();
    assert.ok(native.createTime.isEqual(pointer.createTime));
    const client = env.authenticatedContext(uid).firestore();
    for (const path of [native.ref.path, pointer.ref.path]) {
      await assertFails(getDoc(doc(client, path)));
      await assertFails(setDoc(doc(client, path), { ownerId: uid }));
      await assertFails(deleteDoc(doc(client, path)));
    }
    await assertFails(getDocs(collection(client, root + '/derivedRows')));
    await assertFails(getDocs(collection(client, root + '/derivedPositions')));
    p = (await api.cancelCampaignRestore(uid, mut(p, 'derived-sdk-cancel-operation'))).progress;
    await assert.rejects(port.read(0, 1));
    p = (
      await api.advanceCampaignRestoreCleanup(uid, mut(p, 'derived-sdk-clean-first', { limit: 2 }))
    ).progress;
    assert.equal(p.derivedIndex.cleanedRows, 2);
    assert.equal(p.reviewIndex.cleanedRows, 0);
    assert.equal(p.cleanedChunks, 0);
    n = 0;
    while (p.state !== 'cancelled' && n < 100)
      p = (
        await api.advanceCampaignRestoreCleanup(
          uid,
          mut(p, 'derived-sdk-clean-' + n++, { limit: 25 }),
        )
      ).progress;
    assert.equal(p.state, 'cancelled');
    for (const family of ['derivedRows', 'derivedPositions', 'reviewRows', 'chunks'])
      assert.equal((await admin.collection(root + '/' + family).get()).empty, true);
    assert.equal(
      (await admin.doc('users/' + uid + '/campaignRestoreKeys/' + rid).get()).exists,
      false,
    );
    assert.equal((await admin.doc(root).get()).data().derivedReview, null);
  },
);
