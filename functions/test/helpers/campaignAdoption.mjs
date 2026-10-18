import {
  comparisonFixture,
  startComparison,
  finishComparison,
  uid,
  op,
  target,
} from './campaignComparison.mjs';
import { createCampaignLoreService } from '../../src/campaignLore.mjs';
import { createCampaignVariantRecoveryService } from '../../src/campaignVariantRecovery.mjs';
import { createCampaignVariantRemoteRecoveryService } from '../../src/campaignVariantRemoteRecovery.mjs';
import { createCampaignAdoptionService } from '../../src/campaignAdoption.mjs';
import { baseSourceKey, digest } from '../../src/campaignBaseContracts.mjs';
import { entity, seal } from './campaignLore.mjs';
export { uid, op, entity };
export const heroKey = baseSourceKey({ kind: 'lore', scopeId: 'world', id: 'hero' });
export function measuredDb(db) {
  const measurements = [];
  return {
    measurements,
    db: {
      ...db,
      runTransaction: (fn) =>
        db.runTransaction(async (tx) => {
          const value = {
            reads: 0,
            readBytes: 0,
            writes: 0,
            writeBytes: 0,
            queries: 0,
            bodyReads: 0,
          };
          measurements.push(value);
          const charge = (s) => {
            for (const d of s.docs ?? [s]) {
              value.reads++;
              value.readBytes += Buffer.byteLength(JSON.stringify(d.data() ?? null));
            }
            return s;
          };
          const wrapped = {
            ...tx,
            get: async (ref) => {
              if (!ref.path) value.queries++;
              if (ref.path?.includes('/loreVariantBodies/')) value.bodyReads++;
              return charge(await tx.get(ref));
            },
            getAll: async (ref, options) => {
              if (ref.path.includes('/loreVariantBodies/') && options.fieldMask.includes('content'))
                value.bodyReads++;
              return [charge((await tx.getAll(ref, options))[0])];
            },
          };
          for (const method of ['create', 'set', 'update', 'delete'])
            wrapped[method] = (ref, data) => {
              value.writes++;
              value.writeBytes += Buffer.byteLength(
                JSON.stringify({ path: ref.path, data: data ?? null }),
              );
              return method === 'delete' ? tx.delete(ref) : tx[method](ref, data);
            };
          return fn(wrapped);
        }),
    },
  };
}
export async function adoptionFixture(db, beforeCapture) {
  const f = await comparisonFixture(db, undefined, beforeCapture);
  f.lore = createCampaignLoreService({ db });
  f.recovery = createCampaignVariantRecoveryService({ db });
  f.remote = createCampaignVariantRemoteRecoveryService({ db });
  f.adoptions = createCampaignAdoptionService({ db });
  f.scope = () => ({
    campaignId: f.campaign.id,
    campaignToken: f.campaignToken,
    baseId: f.campaign.activeBaseId,
  });
  f.acceptCampaign = (campaign) => (f.campaign = campaign);
  f.campaignToken = (
    await f.lore.listCampaignLore(uid, {
      campaignId: f.campaign.id,
      baseId: f.campaign.activeBaseId,
    })
  ).campaignToken;
  f.save = async (name, revision = 0, value = entity(), key = heroKey, close = true) => {
    const header = {
      ...f.scope(),
      sourceKey: key,
      expectedRevision: revision,
      operationId: op(name),
      relatedSourceKeys: [...new Set(value.relations.map((r) => r.targetKey))].sort(),
    };
    const prepared = await f.recovery.prepareCampaignLoreVariant(uid, header);
    const input = { ...header, sealed: seal(prepared, value) };
    const result = await f.lore.saveCampaignLoreVariant(uid, input);
    if (close)
      await f.recovery.resolveCampaignLoreOperation(uid, {
        ...header,
        action: 'save',
        intent: 'confirm',
      });
    return { input, result, prepared, header };
  };
  f.candidate = async (name = 'candidate') =>
    finishComparison(f, (await startComparison(f, name)).result);
  f.start = async (candidate, name = 'adoption') => {
    const collectionRevision = (await f.lore.listCampaignLore(uid, f.scope())).collectionRevision;
    const input = {
      operationId: op(name),
      campaignId: f.campaign.id,
      campaignToken: f.campaignToken,
      comparisonId: candidate.comparisonId,
      currentBaseId: f.campaign.activeBaseId,
      candidateBaseId: candidate.candidateBaseId,
      expectedCollectionRevision: collectionRevision,
    };
    return { input, result: await f.adoptions.startCampaignAdoption(uid, input) };
  };
  f.step = (method, p, extra = {}) =>
    f.adoptions[method](uid, {
      adoptionId: p.adoptionId,
      operationId: digest({ method, id: p.adoptionId, checkpoint: p.checkpoint, ...extra }),
      expectedCheckpoint: p.checkpoint,
      ...extra,
    });
  f.finish = async (p) => {
    p = (await f.step('prepareCampaignAdoption', p)).progress;
    for (let n = 0; n < 500 && p.state === 'preparing'; n++)
      p = (await f.step('advanceCampaignAdoption', p)).progress;
    if (p.state !== 'ready') throw new Error('Adoção não pronta: ' + JSON.stringify(p));
    return p;
  };
  f.removeReferences = async () => {
    const reference = { kind: 'universe', scopeId: 'world', entityId: 'hero' };
    const scene = await f.scenes.getScene(uid, { target, sceneId: f.scene.id });
    await f.scenes.setSceneReference(uid, {
      target,
      sceneId: f.scene.id,
      reference,
      remove: true,
      expectedRevision: scene.revision,
      operationId: op('remove-scene-ref'),
    });
    const source = { kind: 'arc', id: f.arc.item.id };
    const arc = await f.narrative.getNarrativeItem(uid, { target, source });
    await f.narrative.setNarrativeReference(uid, {
      target,
      source,
      reference: { kind: 'lore', reference },
      remove: true,
      expectedRevision: arc.revision,
      operationId: op('remove-arc-ref'),
    });
  };
  return f;
}
