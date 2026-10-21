import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { before, beforeEach, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, getDocs, collection, query, limit, where } from 'firebase/firestore';
import { createStudioService } from '../../functions/src/studio.mjs';
import { createUniverseService } from '../../functions/src/universes.mjs';
import { createCampaignNotesService } from '../../functions/src/campaignNotes.mjs';
import { createCampaignDeletionService } from '../../functions/src/campaignDeletion.mjs';
import { createCampaignBaseReadService } from '../../functions/src/campaignBaseRead.mjs';
import { createCampaignCaptureService } from '../../functions/src/campaignCapture.mjs';
import {
  adoptedDeletionFixture,
  startDeletion,
  finishDeletion,
  uid,
  op,
  heroKey,
} from '../../functions/test/helpers/campaignDeletion.mjs';
import {
  comparisonFixture,
  startComparison,
  finishComparison,
} from '../../functions/test/helpers/campaignComparison.mjs';
import { campaignIdentityToken } from '../../functions/src/campaignIdentity.mjs';
import {
  digest,
  baseImageUseKey,
  baseImageKey,
} from '../../functions/src/campaignBaseContracts.mjs';

const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url));
const { Firestore } = requireFunctions('firebase-admin/firestore');
const projectId = 'demo-writer-campaign-deletion-tests';
let environment, admin;
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!address) throw new Error('Use somente o emulador demo.');
  const [host, port] = address.split(':');
  environment = await initializeTestEnvironment({
    projectId,
    firestore: {
      host,
      port: Number(port),
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
  });
  admin = new Firestore({ projectId, host: address, ssl: false, universeDomain: 'googleapis.com' });
});
beforeEach(() => environment.clearFirestore());
after(async () => {
  await admin?.terminate();
  await environment?.cleanup();
});
async function independent() {
  const studio = createStudioService({ db: admin }),
    notes = createCampaignNotesService({ db: admin }),
    campaignId = op('independent');
  await createUniverseService({ db: admin }).createUniverse(uid, {
    creationId: 'deletion-world',
    name: 'Universo da mesa',
    description: '',
  });
  await studio.createCampaign(uid, {
    operationId: campaignId,
    title: 'Minha mesa',
    description: 'Descrição privada',
    universeId: 'deletion-world',
  });
  return { studio, notes, campaignId };
}
const absent = async (path) => assert.equal((await admin.doc(path).get()).exists, false);
async function noBodyResidue(campaignId) {
  await absent('campaigns/' + campaignId);
  for (const name of [
    'notes',
    'noteState',
    'workChecklist',
    'workProgress',
    'loreVariants',
    'loreVariantBodies',
    'loreVariantState',
    'loreGenerations',
  ])
    assert.equal(
      (await admin.collection(`campaigns/${campaignId}/${name}`).limit(1).get()).empty,
      true,
    );
  assert.equal(
    (
      await admin
        .collection(`users/${uid}/campaignBases`)
        .where('campaignId', '==', campaignId)
        .limit(1)
        .get()
    ).empty,
    true,
  );
}
test('SDK independent deletion revokes first, resumes more than25 notes, keeps counters/other projects and paginates past a reserved real snapshot', async () => {
  const f = await independent();
  await f.studio.createCampaign(uid, { operationId: op('other'), title: 'Outra mesa' });
  const token = (await f.notes.listCampaignNotes(uid, { campaignId: f.campaignId })).campaignToken;
  for (let n = 0; n < 27; n++) {
    const noteId = op('note-' + n);
    await f.notes.saveCampaignNote(uid, {
      campaignId: f.campaignId,
      campaignToken: token,
      noteId,
      operationId: noteId,
      expectedRevision: 0,
      title: 'Nota',
      content: 'Prosa 🐉',
    });
    await admin
      .doc(`campaigns/${f.campaignId}/workChecklist/${n}`)
      .set({ title: 'Preparar segredo' });
  }
  await admin
    .doc(`users/${uid}/workActivity/${digest({ kind: 'campaign', id: f.campaignId })}`)
    .set({ target: { kind: 'campaign', id: f.campaignId }, accessedAt: 1 });
  await admin.doc(`users/${uid}/workActivityState/current`).set({ revision: 4, accessedAt: 1 });
  const d = await startDeletion(admin, f.campaignId);
  assert.equal((await admin.doc('universes/deletion-world').get()).data().campaignCount, 0);
  await absent('universes/deletion-world/campaigns/' + f.campaignId);
  assert.equal(await f.studio.getCampaign(uid, { id: f.campaignId }), null);
  const first = await f.studio.listStudioProjects(uid, { kind: 'campaign', limit: 1 });
  assert.equal(first.items.length, 0);
  assert.ok(first.nextCursor);
  const second = await f.studio.listStudioProjects(uid, {
    kind: 'campaign',
    limit: 1,
    cursor: first.nextCursor,
  });
  assert.equal(second.items[0].id, op('other'));
  await assert.rejects(f.notes.listCampaignNotes(uid, { campaignId: f.campaignId }), {
    code: 'failed-precondition',
  });
  await finishDeletion(d.service, d.result.progress, 'independent-clean', async (input, result) => {
    assert.deepEqual(await d.service.advanceCampaignDeletion(uid, input), result);
  });
  await noBodyResidue(f.campaignId);
  assert.equal(
    (await admin.doc(`users/${uid}/workActivityState/current`).get()).data().revision,
    5,
  );
  assert.ok(await f.studio.getCampaign(uid, { id: op('other') }));
});
test('SDK captured deletion clears every adopted generation and old body binding plus partial candidate and source-revoked private context', async () => {
  const f = await adoptedDeletionFixture(admin),
    campaignId = f.campaign.id,
    original = (await admin.doc('adventures/comparison-adventure-001').get()).data(),
    generations = (
      await admin.collection(`campaigns/${campaignId}/loreGenerations`).get()
    ).docs.map((d) => d.id);
  await f.universe.deleteUniverseLore(uid, { universeId: 'world', id: 'hero' });
  const clock = (await admin.doc(`users/${uid}/campaignAuthorization/current`).get()).data();
  const d = await startDeletion(admin, campaignId);
  assert.equal((await f.api.listCampaignComparisons(uid, {})).items.length, 0);
  assert.equal((await f.adoptions.listCampaignAdoptions(uid, {})).items.length, 0);
  await finishDeletion(d.service, d.result.progress, 'captured-clean');
  await noBodyResidue(campaignId);
  for (const generation of generations)
    for (const name of ['loreVariants', 'loreVariantBodies'])
      assert.equal(
        (
          await admin
            .collection(`campaigns/${campaignId}/loreGenerations/${generation}/${name}`)
            .limit(1)
            .get()
        ).empty,
        true,
      );
  assert.equal(
    (await admin.doc(`users/${uid}/imageLibrary/${f.imageId}`).get()).data().useCount,
    1,
  );
  assert.deepEqual((await admin.doc('adventures/comparison-adventure-001').get()).data(), original);
  assert.deepEqual(
    (await admin.doc(`users/${uid}/campaignAuthorization/current`).get()).data(),
    clock,
  );
  for (const name of [
    'campaignPreparations',
    'campaignComparisons',
    'campaignAdoptions',
    'campaignVariantOperations',
    'campaignVariantResolutionOperations',
    'campaignComparisonStartFences',
  ]) {
    const docs = (await admin.collection(`users/${uid}/${name}`).limit(100).get()).docs;
    for (const doc of docs)
      for (const field of [
        'title',
        'description',
        'key',
        'relatedSourceKeys',
        'request',
        'result',
        'sourceToken',
        'authorization',
      ])
        assert.equal(Object.hasOwn(doc.data(), field), false, `${name}/${doc.id}.${field}`);
  }
});
test('SDK ready and pending pins preserve shared library bytes and another campaign, and inconsistent counts do not become confirmed progress', async () => {
  const f = await comparisonFixture(admin),
    candidate = await finishComparison(f, (await startComparison(f)).result),
    capture = createCampaignCaptureService({ db: admin, assets: f.assets });
  let p = await capture.startCampaignCapture(uid, {
    operationId: op('second-table'),
    adventureId: 'comparison-adventure-001',
    expectedSourceToken: (
      await capture.getCampaignCaptureSource(uid, { adventureId: 'comparison-adventure-001' })
    ).sourceToken,
    title: 'Segunda mesa',
    description: '',
    universeId: 'world',
  });
  while (p.state === 'preparing')
    p = await capture.advanceCampaignCapture(uid, {
      captureId: p.captureId,
      operationId: op('second-capture-' + p.checkpoint),
      expectedCheckpoint: p.checkpoint,
    });
  const other = (
    await capture.activateCampaignCapture(uid, {
      captureId: p.captureId,
      operationId: op('second-activate'),
      expectedCheckpoint: p.checkpoint,
    })
  ).campaign;
  const before = (await admin.doc(`users/${uid}/imageLibrary/${f.imageId}`).get()).data(),
    d = await startDeletion(admin, f.campaign.id);
  let q = d.result.progress;
  while (q.phase !== 'bases')
    q = (
      await d.service.advanceCampaignDeletion(uid, {
        deletionId: q.deletionId,
        operationId: op('to-pins-' + q.checkpoint),
        expectedCheckpoint: q.checkpoint,
      })
    ).progress;
  await admin.doc(`users/${uid}/imageLibrary/${f.imageId}`).update({ useCount: 0 });
  const input = {
    deletionId: q.deletionId,
    operationId: op('pin-corrected'),
    expectedCheckpoint: q.checkpoint,
  };
  await assert.rejects(d.service.advanceCampaignDeletion(uid, input), {
    code: 'failed-precondition',
  });
  assert.equal(
    (await d.service.getCampaignDeletion(uid, { campaignId: f.campaign.id })).deletion.checkpoint,
    q.checkpoint,
  );
  await admin.doc(`users/${uid}/imageLibrary/${f.imageId}`).update({ useCount: before.useCount });
  q = (await d.service.advanceCampaignDeletion(uid, input)).progress;
  const decremented = (await admin.doc(`users/${uid}/imageLibrary/${f.imageId}`).get()).data()
    .useCount;
  await d.service.advanceCampaignDeletion(uid, input);
  assert.equal(
    (await admin.doc(`users/${uid}/imageLibrary/${f.imageId}`).get()).data().useCount,
    decremented,
  );
  await finishDeletion(d.service, q, 'pins-clean');
  const library = (await admin.doc(`users/${uid}/imageLibrary/${f.imageId}`).get()).data();
  assert.equal(library.useCount, 2);
  assert.equal(library.path, before.path);
  assert.ok(await f.studio.getCampaign(uid, { id: other.id }));
  assert.equal(
    (
      await admin
        .doc(
          `users/${uid}/imageLibrary/${f.imageId}/uses/${baseImageUseKey(other.activeBaseId, f.imageId)}`,
        )
        .get()
    ).exists,
    true,
  );
  await absent(`users/${uid}/campaignBases/${candidate.candidateBaseId}`);
});
test('SDK deletion races have one permanent winner, stale replay/fence cannot recreate roots and cleanup survives root loss but refuses another incarnation', async () => {
  const f = await independent(),
    service = createCampaignDeletionService({ db: admin }),
    source = await service.getCampaignDeletionSource(uid, { campaignId: f.campaignId }),
    input = {
      campaignId: f.campaignId,
      campaignToken: source.campaignToken,
      expectedRevision: source.revision,
      operationId: op('race-a'),
    };
  const results = await Promise.allSettled([
    service.startCampaignDeletion(uid, input),
    service.startCampaignDeletion(uid, { ...input, operationId: op('race-b') }),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  let p = results.find((r) => r.status === 'fulfilled').value.progress;
  const stale = {
    deletionId: p.deletionId,
    operationId: op('late-step'),
    expectedCheckpoint: p.checkpoint,
  };
  p = (await service.advanceCampaignDeletion(uid, { ...stale, operationId: op('winner-step') }))
    .progress;
  await assert.rejects(service.advanceCampaignDeletion(uid, stale), {
    details: { reason: 'checkpoint-conflict' },
  });
  await admin.doc('campaigns/' + f.campaignId).delete();
  await admin.doc('campaigns/' + f.campaignId).create({
    ownerId: uid,
    schemaVersion: 1,
    deleting: true,
    deletionId: p.deletionId,
    private: 'Outra encarnação',
  });
  assert.notEqual(
    campaignIdentityToken(uid, f.campaignId, await admin.doc('campaigns/' + f.campaignId).get()),
    source.campaignToken,
  );
  await assert.rejects(
    service.advanceCampaignDeletion(uid, {
      ...stale,
      operationId: op('changed-root'),
      expectedCheckpoint: p.checkpoint,
    }),
    { details: { reason: 'campaign-changed' } },
  );
  await admin.doc('campaigns/' + f.campaignId).delete();
  await finishDeletion(service, p, 'root-gone');
  await assert.rejects(
    f.studio.createCampaign(uid, { operationId: f.campaignId, title: 'Não recriar' }),
    { code: 'failed-precondition' },
  );
  const missing = { ...input, campaignId: 'missing', operationId: op('never-received') };
  const canceled = await service.resolveCampaignDeletionStart(uid, {
    ...missing,
    intent: 'cancel',
  });
  assert.deepEqual(await service.startCampaignDeletion(uid, missing), canceled);
});
test('SDK deletion gates late media after I/O, closes old mutation paths without descriptors, supports capture-only proof and denies every private direct SDK boundary', async () => {
  for (const mode of ['base', 'comparison']) {
    if (mode === 'comparison') await environment.clearFirestore();
    const f = await comparisonFixture(admin),
      candidate = await finishComparison(f, (await startComparison(f)).result),
      reader = createCampaignBaseReadService({
        db: admin,
        assets: f.assets,
        deriveImage: async (bytes) => bytes,
      });
    let d,
      downloaded = 0;
    f.assets.readGeneration = async () => {
      downloaded++;
      d = await startDeletion(admin, f.campaign.id, 'delete-during-io');
      return Buffer.from('webp');
    };
    const promise =
      mode === 'base'
        ? reader.readCampaignBaseImage(uid, {
            campaignId: f.campaign.id,
            imageKey: baseImageKey(f.imageId),
          })
        : f.reader.readCampaignComparisonImage(uid, {
            comparisonId: candidate.comparisonId,
            side: 'candidate',
            imageKey: baseImageKey(f.imageId),
          });
    await assert.rejects(promise);
    assert.equal(downloaded, 1);
    assert.ok(d);
    const proof = await d.service.getCampaignDeletion(uid, { captureId: op('base') });
    assert.equal(proof.deletion.campaignId, f.campaign.id);
    assert.equal(proof.deletion.revoked, true);
    assert.equal(
      (await d.service.getCampaignDeletion('other', { campaignId: f.campaign.id })).deletion,
      null,
    );
    const before = (await admin.collection(`users/${uid}/campaignVariantOperations`).limit(1).get())
      .size;
    const recovery = (
      await import('../../functions/src/campaignVariantRecovery.mjs')
    ).createCampaignVariantRecoveryService({ db: admin });
    await assert.rejects(
      recovery.resolveCampaignLoreOperation(uid, {
        campaignId: f.campaign.id,
        campaignToken: proof.deletion.campaignToken,
        baseId: f.campaign.activeBaseId,
        sourceKey: heroKey,
        operationId: op('late-canceled'),
        expectedRevision: 0,
        action: 'save',
        relatedSourceKeys: [],
        intent: 'cancel',
      }),
      { code: 'failed-precondition' },
    );
    assert.equal(
      (await admin.collection(`users/${uid}/campaignVariantOperations`).limit(1).get()).size,
      before,
    );
    const paths = [
      `campaigns/${f.campaign.id}`,
      `campaignDeletionReservations/${f.campaign.id}`,
      `users/${uid}/campaignDeletions/${d.result.progress.deletionId}`,
      `users/${uid}/campaignDeletionOperations/${d.input.operationId}`,
      `users/${uid}/campaignDeletionStartFences/never`,
      `campaigns/${f.campaign.id}/loreGenerations/unknown/loreVariantBodies/chunk`,
    ];
    for (const client of [
      environment.authenticatedContext(uid).firestore(),
      environment.authenticatedContext('other').firestore(),
      environment.unauthenticatedContext().firestore(),
    ]) {
      for (const path of paths) {
        await assertFails(getDoc(doc(client, path)));
        await assertFails(setDoc(doc(client, path), { ownerId: uid }));
      }
      await assertFails(
        getDocs(query(collection(client, 'campaigns'), where('ownerId', '==', uid), limit(25))),
      );
      await assertFails(
        getDocs(query(collection(client, `users/${uid}/campaignDeletions`), limit(25))),
      );
    }
  }
});
