import assert from 'node:assert/strict';
import {
  originRestoreFixture,
  signedOriginCampaign,
  uid,
  originMutation as mut,
  originRestoreId as rid,
} from './campaignOriginRestore.mjs';
import { finishOwnMaterialization } from './campaignOwnMaterialization.mjs';
import { sha } from '../../src/campaignRestoreContracts.mjs';
import { restoredLoreGenerationId } from '../../src/campaignRestoreVariantFormat.mjs';
export { uid, mut, rid };
export const variantRestoreRoot = 'users/' + uid + '/campaignRestores/' + rid;
export const generationPath = (f, p = f.p) =>
  'campaigns/' +
  p.campaignId +
  '/loreGenerations/' +
  restoredLoreGenerationId({ uid, rid, token: p.jobToken });
let cached;
export async function variantMaterializationFixture(source) {
  cached ??= signedOriginCampaign();
  const f = await originRestoreFixture(source ?? (await cached));
  f.p = await finishOwnMaterialization(f);
  let n = 0;
  while (f.p.baseMaterialization?.phase !== 'ready' && n++ < 10000)
    f.p = (
      await f.api.advanceCampaignRestoreBase(
        uid,
        mut(f.p, 'variant-base-' + sha(JSON.stringify([rid, f.p.checkpoint])), { limit: 25 }),
      )
    ).progress;
  assert.equal(f.p.baseMaterialization.phase, 'ready');
  return f;
}
export async function finishVariants(f, p = f.p, limit = 25) {
  let n = 0;
  while (p.variantMaterialization?.phase !== 'ready' && n++ < 10000)
    p = (
      await f.api.advanceCampaignRestoreVariants(
        uid,
        mut(p, 'variant-copy-' + sha(JSON.stringify([rid, p.checkpoint])), { limit }),
      )
    ).progress;
  assert.equal(p.variantMaterialization.phase, 'ready');
  return p;
}
