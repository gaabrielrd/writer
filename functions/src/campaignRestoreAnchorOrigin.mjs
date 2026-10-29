import { createCampaignRestoreVariantOrigin } from './campaignRestoreVariantOrigin.mjs';
import { createCampaignRestoreVariantWrites } from './campaignRestoreVariantWrites.mjs';
import { NATIVE_WRITE_FIELDS } from './campaignRestoreNativeWrites.mjs';
import { restoredLoreGenerationId } from './campaignRestoreVariantFormat.mjs';
import { keyFor } from './campaignBackupDerivedStaging.mjs';
import { digest, bad } from './campaignRestoreContracts.mjs';
export function createCampaignRestoreAnchorOrigin(store, index) {
  const origins = createCampaignRestoreVariantOrigin(store, index),
    variants = createCampaignRestoreVariantWrites(store);
  async function selection(tx, l, key, ctx, rowIndex) {
    const row = (await index.page(tx, l, key, rowIndex, 1))[0];
    if (row?.section !== 'anchor' || row.value.unit.outcome !== 'available') bad();
    const meta = row.value.meta,
      variant = await index.lookup(tx, l, key, 'variant', keyFor(meta.item.sourceKey));
    if (
      !variant?.value ||
      variant.value.unit.outcome !== 'available' ||
      variant.value.meta.anchorKey !== meta.anchorKey
    )
      bad();
    const path =
        'campaigns/' +
        l.job.campaignId +
        '/loreGenerations/' +
        restoredLoreGenerationId(l) +
        '/loreVariants/' +
        meta.item.sourceKey,
      overlay = (
        await tx.getAll(store.db.doc(path), { fieldMask: ['sourceKey', 'baseId', 'anchor'] })
      )[0],
      journals = (
        await tx.get(
          store.db
            .collection(l.ref.path + '/variantWrites')
            .where('row', '==', variant.index)
            .select(...NATIVE_WRITE_FIELDS, 'row', 'authorizationHash')
            .limit(6),
        )
      ).docs;
    // 900,000 bytes use <=14 chunks, <=5 body/overlay journal batches.
    if (journals.length > 5) bad();
    const parents = journals.filter((d) =>
      d.data().targets.some((t) => t.collection === 'loreVariants' && t.id === meta.item.sourceKey),
    );
    if (!overlay.exists && !journals.length) return { kind: 'omitted' };
    if (!overlay.exists || parents.length !== 1) bad();
    await variants.verify(tx, l, parents[0]);
    const active = await origins.base(tx, l, ctx),
      own = await origins.anchor(tx, l, key, ctx, variant.value.meta);
    if (active.availability !== 'available' || own.availability !== 'available')
      return { kind: 'unavailable' };
    if (digest(overlay.data().anchor) !== digest(own.anchor)) bad();
    return {
      kind: own.anchor.capturedBaseId === overlay.data().baseId ? 'reused' : 'historical',
      anchor: own.anchor,
      proof: digest([active.proof, own.proof, overlay.data()]),
      decision: digest([
        ctx.proof.archive,
        ctx.port.context.active,
        meta,
        own.anchor,
        overlay.data(),
      ]),
    };
  }
  return { base: origins.base, selection };
}
