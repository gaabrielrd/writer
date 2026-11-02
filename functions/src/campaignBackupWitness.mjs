import { campaignBackupScope, campaignBackupToken } from './campaignBackupSource.mjs';
import { campaignBackupBaseContext, baseChanged } from './campaignBackupBaseContext.mjs';
import { campaignBackupLoreContext, loreBackupChanged } from './campaignBackupLoreContext.mjs';
import { validatePortableCampaignWitness } from './portableCampaignProvenance.mjs';
import { digest, workId } from './workProgressContracts.mjs';
import { readCampaignBackupDerivedSource } from './campaignBackupDerivedSource.mjs';
import { baseMasked, baseInconsistent } from './campaignBackupBaseContext.mjs';
function input(db, uid, data, keys) {
  const c = campaignBackupScope(db, uid, data, ['sourceToken', 'derivedToken', ...keys]);
  return {
    ...c,
    expected: campaignBackupToken(data.sourceToken),
    derivedExpected: campaignBackupToken(data.derivedToken),
  };
}
function item(c, head) {
  const content = {
    kind: 'item',
    baseId: c.anchor.baseId,
    sourceKey: head.value.sourceKey,
    availability: head.availability,
  };
  if (head.availability === 'available') {
    const o = head.value.origin;
    content.origin =
      head.value.kind !== 'lore'
        ? { kind: 'adventure', adventureId: c.base.adventureId }
        : o.kind === 'lore'
          ? { kind: 'lore', scopeId: o.scopeId, entityId: o.id, born: head.authorization.born }
          : {
              kind: 'adventure-lore',
              adventureId: o.adventureId,
              entityId: o.id,
              born: head.authorization.born,
            };
  }
  return validatePortableCampaignWitness(content);
}
function result(common, content, proof) {
  if (content === null) return { ...common, outcome: 'unavailable' };
  const value = validatePortableCampaignWitness(content),
    json = JSON.stringify(value);
  return {
    ...common,
    outcome: 'available',
    content: value,
    byteLength: Buffer.byteLength(json),
    contentHash: digest(json),
    witnessToken: digest({
      version: 1,
      kind: 'campaign-backup-witness',
      ...common,
      proof,
      contentHash: digest(json),
    }),
  };
}
export function createCampaignBackupWitnessService({ db }) {
  return {
    async getCampaignBackupProjectWitness(uid, data) {
      const p = input(db, uid, data, []);
      return db.runTransaction(async (tx) => {
        const source = await readCampaignBackupDerivedSource(tx, p),
          root = await baseMasked(tx, db.doc(p.path), ['ownerId', 'universeId']);
        if (root.value?.ownerId !== uid) baseInconsistent();
        let universe = { kind: 'none' },
          world = null;
        if (root.value.universeId != null) {
          const id = workId(root.value.universeId);
          world = await baseMasked(tx, db.doc('universes/' + id), ['authorId', 'deleting']);
          universe =
            world.snapshot.exists && world.value.authorId === uid && !world.value.deleting
              ? { kind: 'reference', id, born: world.native.created }
              : { kind: 'unavailable', id };
        }
        return result(
          {
            campaignId: p.campaignId,
            sourceToken: source.sourceToken,
            derivedToken: source.derivedToken,
          },
          { kind: 'project', campaignId: p.campaignId, universe },
          {
            root: root.native,
            world: world && { native: world.native, value: world.value ?? null },
          },
        );
      });
    },
    async getCampaignBackupBaseWitness(uid, data) {
      const p = input(db, uid, data, []);
      return db.runTransaction(async (tx) => {
        const c = await campaignBackupBaseContext(tx, p);
        return result({ ...c.anchor }, c.originWitness, c.baseIdentity);
      });
    },
    async getCampaignBackupItemWitness(uid, data) {
      const p = input(db, uid, data, ['id', 'itemToken']),
        id = campaignBackupToken(data.id),
        expected = campaignBackupToken(data.itemToken);
      return db.runTransaction(async (tx) => {
        const c = await campaignBackupBaseContext(tx, p),
          head = await c.inspect(id);
        if (head.itemToken !== expected) baseChanged();
        return result(
          { ...c.anchor, id, itemToken: head.itemToken },
          item(c, head),
          head.itemToken,
        );
      });
    },
    async getCampaignBackupLoreWitness(uid, data) {
      const p = input(db, uid, data, ['id', 'variantToken']),
        id = campaignBackupToken(data.id),
        expected = campaignBackupToken(data.variantToken);
      return db.runTransaction(async (tx) => {
        const c = await campaignBackupLoreContext(tx, p),
          unit = await c.inspect(id);
        if (!unit || unit.entry.variantToken !== expected) loreBackupChanged();
        const common = { ...c.anchor, id, variantToken: expected };
        if (unit.entry.availability !== 'available') return result(common, null, null);
        return result(
          common,
          {
            kind: 'anchor',
            anchorKey: unit.anchorKey,
            base: unit.origin.originWitness,
            item: item(unit.origin, unit.item),
          },
          expected,
        );
      });
    },
  };
}
