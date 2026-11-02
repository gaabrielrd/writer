import assert from 'node:assert/strict';
import { createCampaignDeletionService } from '../../src/campaignDeletion.mjs';
import { adoptionFixture, uid, op, heroKey } from './campaignAdoption.mjs';
import { startComparison } from './campaignComparison.mjs';
export { uid, op, heroKey };
export async function startDeletion(db, campaignId, name = 'delete') {
  const service = createCampaignDeletionService({ db }),
    source = await service.getCampaignDeletionSource(uid, { campaignId });
  assert.ok(source);
  const input = {
    campaignId,
    campaignToken: source.campaignToken,
    expectedRevision: source.revision,
    operationId: op(name),
  };
  return { service, input, result: await service.startCampaignDeletion(uid, input) };
}
export async function finishDeletion(service, initial, name = 'cleanup', observe = () => {}) {
  let p = initial;
  for (let n = 0; !p.complete && n < 600; n++) {
    const input = {
        deletionId: p.deletionId,
        operationId: op(name + '-' + n),
        expectedCheckpoint: p.checkpoint,
      },
      result = await service.advanceCampaignDeletion(uid, input);
    await observe(input, result);
    p = result.progress;
  }
  assert.equal(p.complete, true, 'A limpeza terminou dentro do limite do teste');
  return p;
}
export async function adoptedDeletionFixture(db) {
  const f = await adoptionFixture(db),
    saved = await f.save('variant-to-delete');
  for (let i = 0; i < 2; i++) {
    const candidate = await f.candidate('adopted-' + i),
      started = await f.start(candidate, 'adoption-' + i);
    let p = started.result.progress;
    const rows = await f.adoptions.listCampaignAdoptionDecisions(uid, { adoptionId: p.adoptionId });
    for (const row of rows.items.filter((r) => r.required))
      p = (
        await f.step('decideCampaignAdoption', p, {
          sourceKey: row.sourceKey,
          expectedRevision: row.revision,
          choice: 'keep-local',
        })
      ).progress;
    p = await f.finish(p);
    await f.step('activateCampaignAdoption', p);
    f.acceptCampaign((await db.doc('campaigns/' + f.campaign.id).get()).data());
  }
  let pending = (await startComparison(f, 'pending-image')).result.progress;
  for (let n = 0; pending.phase !== 'images' && n < 150; n++)
    pending = (
      await f.api.advanceCampaignComparison(uid, {
        comparisonId: pending.comparisonId,
        operationId: op('partial-' + n),
        expectedCheckpoint: pending.checkpoint,
      })
    ).progress;
  assert.equal(pending.phase, 'images');
  const source = await f.api.getCampaignComparisonSource(uid, {
    campaignId: f.campaign.id,
    currentBaseId: f.campaign.activeBaseId,
  });
  await f.api.resolveCampaignComparisonStart(uid, {
    campaignId: f.campaign.id,
    campaignToken: f.campaignToken,
    currentBaseId: f.campaign.activeBaseId,
    expectedSourceToken: source.sourceToken,
    operationId: op('fenced-before-deletion'),
    intent: 'cancel',
  });
  const header = {
    ...f.scope(),
    sourceKey: heroKey,
    expectedRevision: 3,
    operationId: op('open-key'),
    relatedSourceKeys: [],
  };
  await f.recovery.prepareCampaignLoreVariant(uid, header);
  const resolvedHeader = { ...header, operationId: op('resolved-key') };
  await f.recovery.prepareCampaignLoreVariant(uid, resolvedHeader);
  const list = await f.remote.listCampaignLoreOperations(uid, f.scope()),
    item = list.items.find((v) => v.operationId === resolvedHeader.operationId);
  await f.remote.resolveCampaignLoreRemoteOperation(uid, {
    ...f.scope(),
    operationId: item.operationId,
    statusToken: item.statusToken,
    resolutionId: op('remote-resolution'),
    intent: 'cancel',
  });
  return { ...f, saved, pending, header };
}
