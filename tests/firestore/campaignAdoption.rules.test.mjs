import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { before, beforeEach, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, collection, getDocs, query, limit } from 'firebase/firestore';
import {
  adoptionFixture,
  uid,
  op,
  heroKey,
  entity,
} from '../../functions/test/helpers/campaignAdoption.mjs';
import { target } from '../../functions/test/helpers/campaignComparison.mjs';
import { baseSourceKey, digest } from '../../functions/src/campaignBaseContracts.mjs';
import { loreGenerationPath, loreGuardPath } from '../../functions/src/campaignLoreStorage.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url));
const { Firestore } = requireFunctions('firebase-admin/firestore');
const projectId = 'demo-writer-campaign-adoption-tests';
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
async function decisions(f, p, choice = 'keep-local') {
  let cursor;
  const rows = [];
  do {
    const page = await f.adoptions.listCampaignAdoptionDecisions(uid, {
      adoptionId: p.adoptionId,
      ...(cursor ? { cursor } : {}),
    });
    rows.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  for (const row of rows.filter((r) => r.required))
    p = (
      await f.step('decideCampaignAdoption', p, {
        sourceKey: row.sourceKey,
        expectedRevision: row.revision,
        choice: typeof choice === 'function' ? choice(row) : choice,
      })
    ).progress;
  return p;
}
async function refresh(f) {
  f.campaign = f.acceptCampaign((await admin.doc('campaigns/' + f.campaign.id).get()).data());
}
test('SDK adoption moves more than25 overlays and large Unicode without copying old chunks, preserving notes and original', async () => {
  const f = await adoptionFixture(admin, async ({ universe, scenes, scene }) => {
    for (let index = 0; index < 26; index++) {
      const id = 'target-' + index;
      await universe.saveUniverseLore(uid, {
        universeId: 'world',
        id,
        create: true,
        input: {
          name: 'Alvo ' + index,
          category: 'character',
          summary: 'Resumo',
          details: 'Detalhes',
          isPublic: false,
        },
      });
      await scenes.setSceneReference(uid, {
        target,
        sceneId: scene.id,
        expectedRevision: (await scenes.getScene(uid, { target, sceneId: scene.id })).revision,
        reference: { kind: 'universe', scopeId: 'world', entityId: id },
        operationId: op('target-ref-' + index),
      });
    }
  });
  const keys = Array.from({ length: 26 }, (_, i) =>
    baseSourceKey({ kind: 'lore', scopeId: 'world', id: 'target-' + i }),
  );
  const large = entity({
    details: '🐉'.repeat(70000),
    relations: keys.map((targetKey) => ({
      targetKey,
      relationType: 'Conhece',
      description: 'Relação',
    })),
  });
  await f.save('large', 0, large);
  for (let i = 0; i < keys.length; i++) {
    const header = {
      ...f.scope(),
      sourceKey: keys[i],
      expectedRevision: 0,
      operationId: op('remove-' + i),
    };
    await f.lore.removeCampaignLore(uid, header);
    await f.recovery.resolveCampaignLoreOperation(uid, {
      ...header,
      action: 'remove',
      intent: 'confirm',
    });
  }
  const note = admin.doc(`campaigns/${f.campaign.id}/notes/own-note`);
  await note.set({ content: 'Autoria própria' });
  const original = (await admin.doc('adventures/' + target.id).get()).data();
  const oldBodyDocs = (
    await admin
      .collection('campaigns/' + f.campaign.id + '/loreVariantBodies')
      .limit(30)
      .get()
  ).docs;
  const candidate = await f.candidate();
  let p = (await f.start(candidate)).result.progress;
  p = await decisions(f, p);
  p = await f.finish(p);
  const input = {
    adoptionId: p.adoptionId,
    operationId: op('activate'),
    expectedCheckpoint: p.checkpoint,
  };
  const response = await f.adoptions.activateCampaignAdoption(uid, input);
  assert.equal(response.progress.state, 'adopted');
  assert.deepEqual(await f.adoptions.activateCampaignAdoption(uid, input), response);
  await refresh(f);
  const read = await f.lore.getCampaignLore(uid, { ...f.scope(), sourceKey: heroKey });
  assert.equal(read.item.entity.details, large.details);
  assert.equal(read.item.entity.relations.length, 0);
  for (const snapshot of oldBodyDocs)
    assert.deepEqual((await snapshot.ref.get()).data(), snapshot.data());
  assert.equal(
    (
      await admin
        .collection(loreGenerationPath(f.campaign.id, p.loreGenerationId) + '/loreVariantBodies')
        .limit(1)
        .get()
    ).empty,
    true,
  );
  assert.equal((await note.get()).data().content, 'Autoria própria');
  assert.deepEqual((await admin.doc('adventures/' + target.id).get()).data(), original);
  const removed = [];
  let cursor;
  do {
    const page = await f.lore.listCampaignLore(uid, {
      ...f.scope(),
      view: 'removed',
      ...(cursor ? { cursor } : {}),
    });
    removed.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  assert.equal(removed.length, 26);
});
test('SDK admission audits old receipts without closed, releases before recovery, and remote stale closure has an exact durable rejection', async () => {
  const f = await adoptionFixture(admin);
  const saved = await f.save('pending', 0, entity(), heroKey, false);
  const candidate = await f.candidate();
  let p = (await f.start(candidate)).result.progress;
  p = await decisions(f, p);
  p = (await f.step('prepareCampaignAdoption', p)).progress;
  await assert.rejects(
    f.recovery.prepareCampaignLoreVariant(uid, {
      ...f.scope(),
      sourceKey: heroKey,
      expectedRevision: 1,
      operationId: op('blocked'),
      relatedSourceKeys: [],
    }),
    (e) => e.details?.reason === 'adoption-in-progress',
  );
  p = (await f.step('advanceCampaignAdoption', p)).progress;
  assert.equal(p.reason, 'pending-operations');
  const listed = (await f.remote.listCampaignLoreOperations(uid, f.scope())).items[0];
  assert.deepEqual(Object.keys(listed).sort(), ['operationId', 'revision', 'state', 'statusToken']);
  await f.recovery.resolveCampaignLoreOperation(uid, {
    ...saved.header,
    action: 'save',
    intent: 'confirm',
  });
  const input = {
    ...f.scope(),
    operationId: listed.operationId,
    statusToken: listed.statusToken,
    resolutionId: op('remote-stale'),
    intent: 'confirm',
  };
  const response = await f.remote.resolveCampaignLoreRemoteOperation(uid, input);
  assert.equal(response.outcome, 'rejected');
  assert.equal(response.reason, 'operation-changed');
  await admin.doc('campaigns/' + f.campaign.id).delete();
  assert.deepEqual(await f.remote.resolveCampaignLoreRemoteOperation(uid, input), response);
  assert.equal(
    (await f.adoptions.getCampaignAdoption(uid, { adoptionId: p.adoptionId })).sourceAvailable,
    false,
  );
  for (let i = 0; i < 8 && p.state !== 'deleted'; i++)
    p = (await f.step('cancelCampaignAdoption', p)).progress;
  assert.equal(p.state, 'deleted');
});
test('SDK concurrent claims have one winner and canceled old preparation cannot release another admission epoch', async () => {
  const f = await adoptionFixture(admin);
  const candidate = await f.candidate();
  const a = (await f.start(candidate, 'a')).result.progress,
    b = (await f.start(candidate, 'b')).result.progress;
  const outcomes = await Promise.allSettled([
    f.step('prepareCampaignAdoption', a),
    f.step('prepareCampaignAdoption', b),
  ]);
  assert.equal(outcomes.filter((r) => r.status === 'fulfilled').length, 1);
  let winner = outcomes.find((r) => r.status === 'fulfilled').value.progress;
  const guardRef = admin.doc(loreGuardPath(uid, f.campaign.id, f.campaignToken));
  assert.equal((await guardRef.get()).data().adoptionId, winner.adoptionId);
  const originalWinner = winner;
  winner = (await f.step('cancelCampaignAdoption', winner)).progress;
  const other = originalWinner.adoptionId === a.adoptionId ? b : a;
  const prepared = (await f.step('prepareCampaignAdoption', other)).progress;
  const current = (await guardRef.get()).data();
  assert.equal(current.adoptionId, prepared.adoptionId);
  await f.step('cancelCampaignAdoption', winner);
  assert.deepEqual((await guardRef.get()).data(), current);
  await assert.rejects(
    f.api.cancelCampaignComparison(uid, {
      comparisonId: candidate.comparisonId,
      operationId: op('cancel-claimed'),
      expectedCheckpoint: candidate.checkpoint,
    }),
    { code: 'failed-precondition' },
  );
});
test('SDK legacy uses a frozen anchor, local discard preserves legacy, and adopted candidate remains protected after a later adoption', async () => {
  const f = await adoptionFixture(admin);
  await f.save('local');
  await f.removeReferences();
  const candidate = await f.candidate();
  let p = (await f.start(candidate)).result.progress;
  p = await decisions(f, p);
  p = await f.finish(p);
  await f.step('activateCampaignAdoption', p);
  await refresh(f);
  let read = await f.lore.getCampaignLore(uid, { ...f.scope(), sourceKey: heroKey });
  assert.equal(read.item.legacy, true);
  assert.equal(read.item.revision, 2);
  const header = {
    ...f.scope(),
    sourceKey: heroKey,
    expectedRevision: 2,
    operationId: op('discard-override'),
  };
  read = await f.lore.discardCampaignLoreVariant(uid, header);
  assert.equal(read.item.legacy, true);
  assert.equal(read.item.entity.name, 'Heroína');
  await f.recovery.resolveCampaignLoreOperation(uid, {
    ...header,
    action: 'discard',
    intent: 'confirm',
  });
  const second = await f.candidate('second');
  p = (await f.start(second, 'second-plan')).result.progress;
  p = await decisions(f, p, 'discard-local');
  p = await f.finish(p);
  await f.step('activateCampaignAdoption', p);
  await refresh(f);
  assert.equal((await f.lore.listCampaignLore(uid, f.scope())).items.length, 0);
  const older = (
    await admin.doc(`users/${uid}/campaignComparisons/${candidate.comparisonId}`).get()
  ).data();
  await assert.rejects(
    f.api.cancelCampaignComparison(uid, {
      comparisonId: candidate.comparisonId,
      expectedCheckpoint: older.checkpoint,
      operationId: op('delete-old-adopted'),
    }),
    { code: 'failed-precondition' },
  );
  assert.equal(
    (await admin.doc(`users/${uid}/campaignBases/${candidate.candidateBaseId}`).get()).exists,
    true,
  );
});
test('SDK epoch revalidation preserves frozen candidate, revocation aborts, and direct access is denied on every new private boundary', async () => {
  const f = await adoptionFixture(admin);
  await f.save('local');
  const candidate = await f.candidate();
  let p = (await f.start(candidate)).result.progress;
  p = await decisions(f, p);
  p = await f.finish(p);
  await f.universe.saveUniverseLore(uid, {
    universeId: 'world',
    id: 'hero',
    input: { name: 'Novo nome vivo', category: 'character', summary: 'Novo', isPublic: false },
  });
  const response = await f.step('activateCampaignAdoption', p);
  assert.equal(response.receipt.outcome, 'reauthorization-required');
  p = response.progress;
  for (let i = 0; i < 10 && p.state === 'preparing'; i++)
    p = (await f.step('advanceCampaignAdoption', p)).progress;
  assert.equal(p.state, 'ready');
  await f.universe.deleteUniverseLore(uid, { universeId: 'world', id: 'hero' });
  p = (await f.step('activateCampaignAdoption', p)).progress;
  p = (await f.step('advanceCampaignAdoption', p)).progress;
  assert.equal(p.state, 'aborted');
  const paths = [
    `users/${uid}/campaignAdoptions/${p.adoptionId}`,
    `users/${uid}/campaignAdoptions/${p.adoptionId}/decisions/${heroKey}`,
    `users/${uid}/campaignAdoptionOperations/${op('private')}`,
    `users/${uid}/campaignAdoptionStartFences/${op('private')}`,
    loreGuardPath(uid, f.campaign.id, f.campaignToken),
    `users/${uid}/campaignAuthorization/current`,
    `users/${uid}/campaignVariantResolutionOperations/${op('private')}`,
    loreGenerationPath(f.campaign.id, p.loreGenerationId),
    loreGenerationPath(f.campaign.id, p.loreGenerationId) + '/loreVariants/' + heroKey,
    loreGenerationPath(f.campaign.id, p.loreGenerationId) + '/loreVariantBodies/' + digest('body'),
  ];
  for (const user of [uid, 'other', null]) {
    const client = user
      ? environment.authenticatedContext(user).firestore()
      : environment.unauthenticatedContext().firestore();
    for (const path of paths) {
      await assertFails(getDoc(doc(client, path)));
      await assertFails(setDoc(doc(client, path), { ownerId: uid }));
    }
    await assertFails(
      getDocs(query(collection(client, `users/${uid}/campaignAdoptions`), limit(25))),
    );
  }
});
