import test, { before, beforeEach, after } from 'node:test';
import { generateKeyPairSync } from 'node:crypto';
import { createCampaignSessionsService } from '../../functions/src/campaignSessions.mjs';
import { createCampaignPreparationService } from '../../functions/src/campaignPreparation.mjs';
import { createCampaignBackupFileService } from '../../functions/src/campaignBackupFile.mjs';
import { encodeCampaignBackup } from '../../functions/src/campaignBackupContainer.mjs';
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

test('real signed campaign integrity and own semantics resume encrypted steps with native joins, CAS, cancellation and revocation', async () => {
  const pair = generateKeyPairSync('ed25519'),
    keys = [{ id: 'restore-review-sdk', state: 'active', publicKey: pair.publicKey }],
    native = await createStudioService({ db: admin }).createCampaign(uid, {
      operationId: 'campaign-review-sdk-original',
      title: 'Private original',
    });
  const sessions = createCampaignSessionsService({ db: admin }),
    preparation = createCampaignPreparationService({ db: admin }),
    scope = {
      campaignId: native.id,
      campaignToken: (await sessions.listCampaignSessions(uid, { campaignId: native.id }))
        .campaignToken,
    };
  await sessions.saveCampaignSession(uid, {
    ...scope,
    sessionId: 'sdk-own-session-0001',
    operationId: 'sdk-own-session-0001',
    expectedRevision: 0,
    title: 'PRIVATE SESSION',
    summary: 'PRIVATE SUMMARY',
    status: 'planned',
    scheduledDate: null,
  });
  await preparation.saveCampaignPreparationItem(uid, {
    ...scope,
    itemId: 'sdk-own-clue-0001',
    operationId: 'sdk-own-clue-0001',
    expectedRevision: 0,
    expectedItemCollectionRevision: 0,
    kind: 'clue',
    title: 'PRIVATE CLUE',
    status: 'pending',
    body: { text: 'PRIVATE CLUE', condition: 'PRIVATE CONDITION', recipient: 'PRIVATE RECIPIENT' },
  });
  await preparation.addCampaignSessionPreparationLink(uid, {
    ...scope,
    sessionId: 'sdk-own-session-0001',
    expectedSessionRevision: 1,
    linkId: 'sdk-own-link-0001',
    operationId: 'sdk-own-link-0001',
    expectedRevision: 0,
    expectedLinkCollectionRevision: 0,
    itemId: 'sdk-own-clue-0001',
    expectedItemRevision: 1,
  });
  const frames = [];
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
  const data = Buffer.concat(frames);
  api = createCampaignRestoreTransferService({ db: admin, keys, now: () => 6000 });
  let p = (
    await api.startCampaignRestore(uid, {
      ...input,
      source: { ...input.source, byteLength: data.length, sha256: sha(data) },
    })
  ).progress;
  for (let n = 0; n < Math.ceil(data.length / 65536); n++) {
    const b = data.subarray(n * 65536, (n + 1) * 65536);
    p = (
      await api.appendCampaignRestoreChunk(
        uid,
        mut(p, 'campaign-review-sdk-upload-' + n, {
          index: n,
          chunkHash: sha(b),
          chunkBase64: b.toString('base64'),
        }),
      )
    ).progress;
  }
  const q = mut(p, 'campaign-review-sdk-step-0', { limit: 1 }),
    first = await api.advanceCampaignRestoreFileReview(uid, q);
  assert.equal(first.progress.fileReview.records, 1);
  assert.deepEqual(await api.advanceCampaignRestoreFileReview(uid, q), first);
  api = createCampaignRestoreTransferService({ db: admin, keys, now: () => 6000 });
  p = (await api.getCampaignRestore(uid, { restoreId: rid })).progress;
  let n = 1;
  while (p.fileReview.status !== 'verified' && n < 50)
    p = (
      await api.advanceCampaignRestoreFileReview(
        uid,
        mut(p, 'campaign-review-sdk-step-' + n++, { limit: 3 }),
      )
    ).progress;
  assert.equal(p.fileReview.status, 'verified');
  const proof = await api.getCampaignRestoreFileIntegrity(uid, {
    restoreId: rid,
    jobToken: p.jobToken,
  });
  assert.equal(proof.validation, 'campaign-file-integrity-only');
  const stored = (await admin.doc('users/' + uid + '/campaignRestores/' + rid).get()).data();
  assert.ok(stored.fileReview.payload.data);
  assert.doesNotMatch(JSON.stringify(p), /payload|attestation|originCampaignId|Private original/);
  await assertFails(
    getDoc(
      doc(env.authenticatedContext(uid).firestore(), 'users/' + uid + '/campaignRestores/' + rid),
    ),
  );
  while ((!p.ownReview || p.ownReview.phase === 'indexing') && n < 100)
    p = (
      await api.advanceCampaignRestoreOwnReview(
        uid,
        mut(p, 'campaign-sdk-own-index-' + n++, { limit: 3 }),
      )
    ).progress;
  assert.equal(p.ownReview.phase, 'checking');
  const race = await Promise.allSettled([
    api.advanceCampaignRestoreOwnReview(uid, mut(p, 'campaign-sdk-own-race-a', { limit: 1 })),
    api.advanceCampaignRestoreOwnReview(uid, mut(p, 'campaign-sdk-own-race-b', { limit: 1 })),
  ]);
  assert.equal(race.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(
    race.find((r) => r.status === 'rejected').reason.details.reason,
    'checkpoint-conflict',
  );
  api = createCampaignRestoreTransferService({ db: admin, keys, now: () => 6000 });
  p = (await api.getCampaignRestore(uid, { restoreId: rid })).progress;
  while (p.ownReview.phase === 'checking' && n < 150)
    p = (
      await api.advanceCampaignRestoreOwnReview(
        uid,
        mut(p, 'campaign-sdk-own-check-' + n++, { limit: 3 }),
      )
    ).progress;
  const own = await api.getCampaignRestoreOwnSemantics(uid, {
    restoreId: rid,
    jobToken: p.jobToken,
  });
  assert.equal(own.validation, 'campaign-own-semantics-only');
  assert.equal(own.own.sessionLinks, 1);
  assert.equal(own.own.preparationBodies, 1);
  assert.equal(own.own.sessions, 1);
  const rowPath = 'users/' + uid + '/campaignRestores/' + rid + '/reviewRows/' + chunkId(0);
  await assertFails(getDoc(doc(env.authenticatedContext(uid).firestore(), rowPath)));
  await assertFails(
    getDocs(
      collection(
        env.authenticatedContext(uid).firestore(),
        'users/' + uid + '/campaignRestores/' + rid + '/reviewRows',
      ),
    ),
  );
  keys[0].state = 'revoked';
  await assert.rejects(
    api.getCampaignRestoreFileIntegrity(uid, { restoreId: rid, jobToken: p.jobToken }),
    (e) => e.details?.reason === 'campaign-backup-invalid-attestation',
  );
  const cancelled = await api.cancelCampaignRestore(uid, mut(p, 'campaign-review-sdk-cancel'));
  assert.equal(
    (await admin.doc('users/' + uid + '/campaignRestores/' + rid).get()).data().fileReview,
    null,
  );
  assert.equal(
    (await admin.doc('users/' + uid + '/campaignRestoreKeys/' + rid).get()).exists,
    false,
  );
  assert.deepEqual((await api.advanceCampaignRestoreFileReview(uid, q)).receipt, first.receipt);
  assert.equal(cancelled.progress.state, 'cancelling');
  p = cancelled.progress;
  p = (
    await api.advanceCampaignRestoreCleanup(
      uid,
      mut(p, 'campaign-sdk-own-clean-first', { limit: 2 }),
    )
  ).progress;
  assert.equal(p.reviewIndex.cleanedRows, 2);
  assert.equal(p.cleanedChunks, 0);
  while (p.state !== 'cancelled' && n < 200)
    p = (
      await api.advanceCampaignRestoreCleanup(
        uid,
        mut(p, 'campaign-sdk-own-clean-' + n++, { limit: 2 }),
      )
    ).progress;
  assert.equal(p.state, 'cancelled');
  assert.equal(p.reviewIndex.cleanedRows, p.reviewIndex.rows);
  assert.equal(
    (await admin.collection('users/' + uid + '/campaignRestores/' + rid + '/reviewRows').get())
      .empty,
    true,
  );
  assert.equal(
    (await admin.doc('users/' + uid + '/campaignRestores/' + rid).get()).data().ownReview,
    null,
  );
});
test('real competing file reviewers commit a single checkpoint and preserve cancellation during a pending read', async () => {
  // A bounded prefix needs no attestation yet; an independently encoded header is enough
  // to exercise native locking, CAS and cancellation before any semantic proof.
  const header = {
      schemaVersion: 1,
      kind: 'writer-campaign',
      contentVersion: 3,
      provenanceVersion: 2,
      originCampaignId: 'campaign-sdk-prefix-source',
      availability: 'none',
    },
    frames = [];
  for await (const b of encodeCampaignBackup([
    { kind: 'campaign', id: 'header', part: 0, payload: Buffer.from(JSON.stringify(header)) },
  ]))
    frames.push(Buffer.from(b));
  const data = Buffer.concat(frames);
  api = createCampaignRestoreTransferService({ db: admin });
  let p = (
    await api.startCampaignRestore(uid, {
      ...input,
      source: { ...input.source, byteLength: data.length, sha256: sha(data) },
    })
  ).progress;
  p = (
    await api.appendCampaignRestoreChunk(
      uid,
      mut(p, 'campaign-review-sdk-prefix', {
        index: 0,
        chunkHash: sha(data),
        chunkBase64: data.toString('base64'),
      }),
    )
  ).progress;
  const results = await Promise.allSettled([
    api.advanceCampaignRestoreFileReview(uid, mut(p, 'campaign-review-sdk-race-a', { limit: 1 })),
    api.advanceCampaignRestoreFileReview(uid, mut(p, 'campaign-review-sdk-race-b', { limit: 1 })),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(
    results.find((r) => r.status === 'rejected').reason.details.reason,
    'checkpoint-conflict',
  );
  p = (await api.getCampaignRestore(uid, { restoreId: rid })).progress;
  const original = api.openCampaignRestoreSource.bind(api);
  let entered, release;
  const arrival = new Promise((r) => (entered = r)),
    gate = new Promise((r) => (release = r));
  api.openCampaignRestoreSource = async (...args) => {
    const port = await original(...args);
    return {
      size: port.size,
      async read(o, n) {
        entered();
        await gate;
        return port.read(o, n);
      },
    };
  };
  const pending = api
    .advanceCampaignRestoreFileReview(uid, mut(p, 'campaign-review-sdk-pending', { limit: 1 }))
    .then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
  await arrival;
  await api.cancelCampaignRestore(uid, mut(p, 'campaign-review-sdk-interrupt'));
  release();
  assert.ok((await pending).error);
  const stored = (await admin.doc('users/' + uid + '/campaignRestores/' + rid).get()).data();
  assert.equal(stored.state, 'cancelling');
  assert.equal(stored.fileReview, null);
});
