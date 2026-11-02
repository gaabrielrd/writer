import assert from 'node:assert/strict';
import { signedOriginCampaign } from './campaignOriginRestore.mjs';
import {
  variantMaterializationFixture,
  finishVariants,
  uid,
  rid,
  mut,
  generationPath,
} from './campaignVariantMaterialization.mjs';
import { digest } from '../../src/sceneContracts.mjs';
export { uid, rid, mut, generationPath };
export const anchorRestoreRoot = 'users/' + uid + '/campaignRestores/' + rid;
let cached;
export async function historicalAnchorOriginal({ long = false } = {}) {
  const f = await signedOriginCampaign();
  if (long) {
    await f.db.runTransaction((tx) =>
      tx.update(f.db.doc('universes/world/lore/hero'), {
        details: '\ufeff  ' + '🐉á'.repeat(24000) + '\n ',
      }),
    );
    await f.adopt();
  }
  await f.removeReferences();
  await f.adopt();
  f.file = await f.makeFile();
  return f;
}
export async function anchorMaterializationFixture(source) {
  cached ??= historicalAnchorOriginal();
  const f = await variantMaterializationFixture(source ?? (await cached));
  f.p = await finishVariants(f);
  return f;
}
export async function finishAnchors(f, p = f.p, limit = 25) {
  let n = 0;
  while (p.anchorMaterialization?.phase !== 'ready' && n++ < 10000)
    p = (
      await f.api.advanceCampaignRestoreAnchors(
        uid,
        mut(p, 'anchor-copy-' + digest([rid, p.checkpoint]), { limit }),
      )
    ).progress;
  assert.equal(p.anchorMaterialization.phase, 'ready');
  return p;
}
export async function positionAnchor(f) {
  const port = await f.api.openCampaignRestoreDerivedIndex(uid, {
      restoreId: rid,
      jobToken: f.p.jobToken,
    }),
    rows = [];
  for (let n = 0; n < port.certificate.rows; n += 25)
    rows.push(...(await port.read(n, Math.min(25, port.certificate.rows - n))));
  const row = rows.find((r) => r.section === 'anchor' && r.value.unit.outcome === 'available');
  assert.ok(row);
  let p = f.p;
  while ((p.anchorMaterialization?.processedRows ?? 0) < row.index)
    p = (
      await f.api.advanceCampaignRestoreAnchors(
        uid,
        mut(p, 'anchor-pos-' + digest(p.checkpoint), {
          limit: Math.min(25, row.index - (p.anchorMaterialization?.processedRows ?? 0)),
        }),
      )
    ).progress;
  return { p, row, port };
}
