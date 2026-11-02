import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { generateKeyPairSync } from 'node:crypto';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc } from 'firebase/firestore';
import {
  uid,
  ownMut as mut,
  prepareOwnRestore,
  finishOwnMaterialization,
} from '../../functions/test/helpers/campaignOwnMaterialization.mjs';
import { ownRestoredId } from '../../functions/src/campaignRestoreOwnFormat.mjs';
import { createStudioService } from '../../functions/src/studio.mjs';
import { createCampaignNotesService } from '../../functions/src/campaignNotes.mjs';
import { createCampaignSessionsService } from '../../functions/src/campaignSessions.mjs';
import { createCampaignPreparationService } from '../../functions/src/campaignPreparation.mjs';
import { createWorkProgressService } from '../../functions/src/workProgress.mjs';
import { createCampaignBackupFileService } from '../../functions/src/campaignBackupFile.mjs';
import { createCampaignRestoreTransferService } from '../../functions/src/campaignRestoreTransfer.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore');
let env, admin;
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127\.0\.0\.1:\d+$/.test(address ?? '')) throw Error('Local demo only');
  const [host, port] = address.split(':'),
    projectId = 'demo-writer-own-materialization';
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      host,
      port: Number(port),
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
  });
  admin = new Firestore({ projectId, host: address, ssl: false, universeDomain: 'googleapis.com' });
  await env.clearFirestore();
});
after(async () => {
  await admin?.terminate();
  await env?.cleanup();
});
test(
  'native own materialization remaps links, binds same-commit journals, survives resume and privately collects every target',
  { timeout: 180000 },
  async () => {
    const native = await createStudioService({ db: admin }).createCampaign(uid, {
        operationId: 'own-sdk-original-campaign',
        title: 'PRIVATE ROOT',
      }),
      notes = createCampaignNotesService({ db: admin }),
      sessions = createCampaignSessionsService({ db: admin }),
      prep = createCampaignPreparationService({ db: admin }),
      scope = {
        campaignId: native.id,
        campaignToken: (await sessions.listCampaignSessions(uid, { campaignId: native.id }))
          .campaignToken,
      },
      noteId = 'own-sdk-original-note',
      sessionId = 'own-sdk-original-session',
      itemId = 'own-sdk-original-clue',
      linkId = 'own-sdk-original-link',
      text = ' \ufeff Texto próprio 🐉\n  ';
    await notes.saveCampaignNote(uid, {
      ...scope,
      noteId,
      operationId: noteId,
      expectedRevision: 0,
      title: 'Nota',
      content: text,
    });
    await sessions.saveCampaignSession(uid, {
      ...scope,
      sessionId,
      operationId: sessionId,
      expectedRevision: 0,
      title: 'Sessão',
      summary: text,
      status: 'planned',
      scheduledDate: '2026-10-30',
    });
    await prep.saveCampaignPreparationItem(uid, {
      ...scope,
      itemId,
      operationId: itemId,
      expectedRevision: 0,
      expectedItemCollectionRevision: 0,
      kind: 'clue',
      title: 'Pista',
      status: 'pending',
      body: { text, condition: '', recipient: '' },
    });
    await prep.addCampaignSessionPreparationLink(uid, {
      ...scope,
      sessionId,
      expectedSessionRevision: 1,
      linkId,
      operationId: linkId,
      expectedRevision: 0,
      expectedLinkCollectionRevision: 0,
      expectedItemRevision: 1,
      itemId,
    });
    await createWorkProgressService({ db: admin }).createWorkChecklistItem(uid, {
      target: { kind: 'campaign', id: native.id },
      operationId: 'own-sdk-checklist-operation',
      title: 'Preparar',
    });
    const pair = generateKeyPairSync('ed25519'),
      keys = [{ id: 'own-sdk-test', state: 'active', publicKey: pair.publicKey }],
      frames = [];
    await createCampaignBackupFileService({
      db: admin,
      storage: {},
      keys,
      keyId: keys[0].id,
      privateKey: pair.privateKey,
      now: () => 6000,
    }).writeCampaignBackupFile(
      uid,
      { campaignId: native.id },
      {
        sink: {
          async write(bytes) {
            frames.push(Buffer.from(bytes));
          },
          async commit() {},
          async abort() {
            frames.length = 0;
          },
        },
      },
    );
    const original = { file: Buffer.concat(frames), keys },
      rid = 'campaign-own-materialize-sdk';
    let { api, p } = await prepareOwnRestore(admin, original, rid);
    while ((p.ownMaterialization?.processed ?? 0) < 2)
      p = (
        await api.advanceCampaignRestoreOwnMaterialization(
          uid,
          mut(p, 'own-sdk-before-note-' + p.checkpoint, { limit: 25 }),
        )
      ).progress;
    const requests = [
        mut(p, 'own-sdk-native-race-first', { limit: 25 }),
        mut(p, 'own-sdk-native-race-second', { limit: 25 }),
      ],
      results = await Promise.allSettled(
        requests.map((r) => api.advanceCampaignRestoreOwnMaterialization(uid, r)),
      );
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(
      results.find((r) => r.status === 'rejected').reason.details.reason,
      'checkpoint-conflict',
    );
    const winner = results.findIndex((r) => r.status === 'fulfilled'),
      receipt = results[winner].value.receipt;
    api = createCampaignRestoreTransferService({ db: admin, keys, now: () => 7000 });
    p = (await api.getCampaignRestore(uid, { restoreId: rid })).progress;
    p = await finishOwnMaterialization({ api, p });
    const result = await api.getCampaignRestoreOwnProject(uid, {
        restoreId: rid,
        jobToken: p.jobToken,
      }),
      path = 'campaigns/' + p.campaignId,
      jobRoot = 'users/' + uid + '/campaignRestores/' + rid,
      map = (family, id) => ownRestoredId({ uid, rid, token: p.jobToken }, family, id),
      restoredNote = await admin.doc(path + '/notes/' + map('note', noteId)).get(),
      journal = await admin.doc(jobRoot + '/ownWrites/000000000000000').get(),
      links = (await admin.collection(path + '/sessionPreparationLinks').get()).docs;
    assert.equal(restoredNote.data().content, text);
    assert.equal(restoredNote.createTime.isEqual(journal.createTime), true);
    assert.equal(links.length, 1);
    assert.equal(links[0].data().sessionId, map('session', sessionId));
    assert.equal(links[0].data().itemId, map('preparation-item', itemId));
    assert.equal(
      (await admin.doc(path + '/sessionPreparationState/' + map('session', sessionId)).get()).data()
        .nextOrder,
      2,
    );
    assert.equal((await admin.doc(path).get()).data().ownerId, undefined);
    assert.equal(result.validation, 'campaign-own-materialized-only');
    assert.doesNotMatch(JSON.stringify(p), /PRIVATE|payload|content|project/);
    const client = env.authenticatedContext(uid).firestore();
    await assertFails(getDoc(doc(client, path)));
    await assertFails(getDoc(doc(client, restoredNote.ref.path)));
    await assertFails(getDoc(doc(client, journal.ref.path)));
    keys[0].state = 'revoked';
    await assert.rejects(
      api.getCampaignRestoreOwnProject(uid, { restoreId: rid, jobToken: p.jobToken }),
      (e) => e.details?.reason === 'campaign-backup-invalid-attestation',
    );
    p = (await api.cancelCampaignRestore(uid, mut(p, 'own-sdk-cancel-operation'))).progress;
    assert.equal((await admin.doc(jobRoot).get()).data().ownMaterialization.payload, null);
    for (let n = 0; p.state !== 'cancelled' && n < 1000; n++)
      p = (
        await api.advanceCampaignRestoreCleanup(
          uid,
          mut(p, 'own-sdk-cleanup-' + p.checkpoint, { limit: 3 }),
        )
      ).progress;
    assert.equal(p.state, 'cancelled');
    for (const collection of [
      'notes',
      'sessions',
      'workChecklist',
      'preparationItems',
      'preparationBodies',
      'sessionReferences',
      'sessionPreparationLinks',
      'noteState',
      'sessionState',
      'preparationState',
      'sessionReferenceState',
      'sessionPreparationState',
      'workProgress',
    ])
      assert.equal(
        (
          await admin
            .collection(path + '/' + collection)
            .limit(1)
            .get()
        ).empty,
        true,
      );
    assert.equal(
      (
        await admin
          .collection(jobRoot + '/ownWrites')
          .limit(1)
          .get()
      ).empty,
      true,
    );
    assert.equal(
      (await admin.doc('users/' + uid + '/campaignRestoreKeys/' + rid).get()).exists,
      false,
    );
    assert.deepEqual(
      (await api.advanceCampaignRestoreOwnMaterialization(uid, requests[winner])).receipt,
      receipt,
    );
    assert.equal(
      (await admin.doc('campaigns/' + native.id + '/notes/' + noteId).get()).data().content,
      text,
    );
  },
);
