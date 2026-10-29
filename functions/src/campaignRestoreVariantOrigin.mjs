import { readCampaignSourceAccess } from './campaignSourceAccess.mjs';
import { keyFor } from './campaignBackupDerivedStaging.mjs';
import { restoredBaseId } from './campaignRestoreBaseFormat.mjs';
import { restoredAnchorBaseId } from './campaignRestoreVariantFormat.mjs';
import { digest, bad } from './campaignRestoreContracts.mjs';
export function createCampaignRestoreVariantOrigin(store, index) {
  const unavailable = (reason) => ({ availability: 'unavailable', proof: digest(reason) });
  async function base(tx, l, ctx) {
    const source = ctx.port.context.active;
    return source
      ? readCampaignSourceAccess(tx, store.db, l.uid, source)
      : unavailable(['exported-base-omission', ctx.port.context.baseWitness]);
  }
  async function anchor(tx, l, key, ctx, meta) {
    const row = await index.lookup(tx, l, key, 'w:anchor', keyFor(meta.sourceKey)),
      record = row?.value.record;
    if (!record || record[2] !== 'available')
      return unavailable(['exported-anchor-omission', meta.anchorKey]);
    const { base: source, item } = record[3];
    if (item.sourceKey !== meta.sourceKey || record[3].anchorKey !== meta.anchorKey) bad();
    const access = await readCampaignSourceAccess(tx, store.db, l.uid, source, item);
    let capturedBaseId = restoredAnchorBaseId(l, meta.anchorKey);
    if (digest(source) === digest(ctx.port.context.active)) {
      const id = restoredBaseId(l),
        physical = (
          await tx.getAll(
            store.db.doc('users/' + l.uid + '/campaignBases/' + id + '/items/' + meta.sourceKey),
            { fieldMask: ['sourceKey'] },
          )
        )[0];
      if (physical.exists && physical.data().sourceKey === meta.sourceKey) capturedBaseId = id;
    }
    return {
      ...access,
      anchor: { capturedBaseId, sourceKey: meta.sourceKey },
      proof: digest([access.proof, capturedBaseId]),
    };
  }
  async function target(tx, l, key, ctx, targetKey) {
    const variant = await index.lookup(tx, l, key, 'variant', keyFor(targetKey));
    if (variant?.value) {
      const v = variant.value;
      if (
        v.unit.outcome !== 'available' ||
        v.meta.mode === 'removed' ||
        v.meta.participation === 'inactive'
      )
        return unavailable(['unavailable-variant-target', targetKey]);
      return anchor(tx, l, key, ctx, v.meta);
    }
    const item = await index.lookup(tx, l, key, 'w:item', keyFor(targetKey));
    if (
      !item ||
      item.value.record[2] !== 'available' ||
      item.value.record[3].availability !== 'available'
    )
      return unavailable(['unavailable-item-target', targetKey]);
    return readCampaignSourceAccess(
      tx,
      store.db,
      l.uid,
      ctx.port.context.active,
      item.value.record[3],
    );
  }
  async function authorization(tx, l, key, ctx, rowIndex) {
    const active = await base(tx, l, ctx);
    if (rowIndex === null || active.availability !== 'available') return active;
    const row = (await index.page(tx, l, key, rowIndex, 1))[0];
    if (row?.section !== 'variant' || row.value.unit.outcome !== 'available') bad();
    const owner = await anchor(tx, l, key, ctx, row.value.meta);
    if (owner.availability !== 'available')
      return { ...owner, proof: digest([active.proof, owner.proof]) };
    const relations = [],
      permissions = [];
    for (const r of row.value.meta.relations) {
      const access = r.available
        ? await target(tx, l, key, ctx, r.targetKey)
        : unavailable(['opaque-relation', r.targetKey]);
      relations.push(access.availability === 'available');
      permissions.push(access.proof);
    }
    return {
      availability: 'available',
      anchor: owner.anchor,
      relations,
      proof: digest([active.proof, owner.proof, permissions]),
    };
  }
  return { base, anchor, authorization };
}
