import { campaignBackupIdentity } from './campaignBackupSource.mjs';
import { readCampaignBackupDerivedSource } from './campaignBackupDerivedSource.mjs';
import { basePath } from './campaignBaseContracts.mjs';
import { adventureIdentityToken, validLoreOrigin } from './campaignLoreOrigin.mjs';
import { CAMPAIGN_BASE_FIELDS } from './campaignBackupBaseDefinitions.mjs';
import { digest, workFail, workId } from './workProgressContracts.mjs';

export const baseInconsistent = () =>
  workFail(
    'failed-precondition',
    'O recurso congelado está inconsistente.',
    'campaign-backup-base-inconsistent',
  );
export const baseChanged = () =>
  workFail(
    'failed-precondition',
    'O recurso congelado mudou. Reinicie a captura.',
    'campaign-backup-base-item-changed',
  );
export const baseHash = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export const BASE_ITEM_HEAD = Object.freeze([
  'sourceKey',
  'kind',
  'origin',
  'parentKey',
  'originAdventureToken',
]);
export async function baseMasked(tx, ref, fieldMask) {
  const result = await tx.getAll(ref, { fieldMask }),
    snapshot = result?.[0];
  if (!Array.isArray(result) || result.length !== 1 || snapshot?.ref?.path !== ref.path)
    baseInconsistent();
  return { snapshot, value: snapshot.data(), native: campaignBackupIdentity(snapshot) };
}
const before = (a, b) =>
  a.seconds < b.seconds || (a.seconds === b.seconds && a.nanoseconds <= b.nanoseconds);
function id(value) {
  try {
    return workId(value);
  } catch {
    baseInconsistent();
  }
}
function keys(value, names) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== names.length ||
    Object.keys(value).some((k) => !names.includes(k))
  )
    baseInconsistent();
}
/** Metadata only until item authorization. A fresh context is mandatory for every call. */
export async function campaignBackupBaseContext(tx, input) {
  const source = await readCampaignBackupDerivedSource(tx, input);
  if (source.availability !== 'available')
    workFail(
      'failed-precondition',
      'A base da campanha está indisponível.',
      'campaign-backup-base-unavailable',
    );
  const path = basePath(input.uid, source.base.id),
    base = await baseMasked(tx, input.db.doc(path), ['adventureId', 'universeId']),
    adventure = await baseMasked(tx, input.db.doc('adventures/' + base.value.adventureId), [
      'ownerId',
    ]),
    adventureToken = adventureIdentityToken(input.uid, base.value.adventureId, adventure.snapshot),
    heads = new Map(),
    proven = new Map();
  const anchor = {
    schemaVersion: 1,
    campaignId: input.campaignId,
    sourceToken: source.sourceToken,
    derivedToken: source.derivedToken,
    baseId: source.base.id,
  };
  async function head(key) {
    if (!baseHash(key)) baseInconsistent();
    if (!heads.has(key))
      heads.set(key, await baseMasked(tx, input.db.doc(path + '/items/' + key), BASE_ITEM_HEAD));
    return heads.get(key);
  }
  async function inspect(key, optional = false, depth = 0) {
    if (depth > 2) baseInconsistent();
    if (proven.has(key)) return proven.get(key);
    const h = await head(key),
      v = h.value;
    if (!h.snapshot.exists) {
      if (optional) return null;
      baseInconsistent();
    }
    if (
      !v ||
      v.sourceKey !== key ||
      !Object.hasOwn(CAMPAIGN_BASE_FIELDS, v.kind) ||
      !baseHash(key) ||
      digest(v.origin) !== key ||
      !(v.parentKey === null || baseHash(v.parentKey))
    )
      baseInconsistent();
    let parent = null,
      authorization = null,
      available = true;
    const o = v.origin;
    if (v.kind === 'lore') {
      try {
        validLoreOrigin(o, base.value);
      } catch {
        baseInconsistent();
      }
      if (v.parentKey !== null) baseInconsistent();
      if (o.kind === 'lore') {
        if (source.base.globalLore !== 'available') {
          available = false;
          authorization = { available: false };
        } else {
          const origin = await baseMasked(
            tx,
            input.db.doc('universes/' + o.scopeId + '/lore/' + o.id),
            ['deleted', 'deleting'],
          );
          available =
            !!origin.snapshot.exists &&
            !origin.value.deleted &&
            !origin.value.deleting &&
            before(origin.native.created, base.native.created);
          authorization = { available, born: origin.native?.created ?? null };
        }
      } else {
        const origin = await baseMasked(
          tx,
          input.db.doc('adventures/' + o.adventureId + '/lore/' + o.id),
          [
            'schemaVersion',
            'ownerId',
            'adventureId',
            'adventureToken',
            'entityId',
            'deleted',
            'deleting',
          ],
        );
        const e = origin.value;
        available =
          v.originAdventureToken === adventureToken &&
          !!origin.snapshot.exists &&
          e.schemaVersion === 1 &&
          e.ownerId === input.uid &&
          e.adventureId === o.adventureId &&
          e.adventureToken === adventureToken &&
          e.entityId === o.id &&
          e.deleted === false &&
          !e.deleting &&
          before(origin.native.created, base.native.created);
        authorization = { available, born: origin.native?.created ?? null, adventureToken };
      }
    } else {
      const extra = v.kind === 'block' ? 'role' : v.kind === 'milestone' ? 'arcId' : null;
      keys(o, ['adventureId', 'kind', 'id', ...(extra ? [extra] : [])]);
      if (o.adventureId !== base.value.adventureId || o.kind !== v.kind) baseInconsistent();
      id(o.id);
      let parentKind = null;
      if (v.kind === 'scene' && v.parentKey !== null) parentKind = 'part';
      if (v.kind === 'block') {
        if (!['main', 'additional'].includes(o.role)) baseInconsistent();
        parentKind = 'scene';
      }
      if (v.kind === 'milestone') {
        id(o.arcId);
        parentKind = 'arc';
        if (v.parentKey !== digest({ adventureId: o.adventureId, kind: 'arc', id: o.arcId }))
          baseInconsistent();
      }
      if (parentKind) {
        if (!baseHash(v.parentKey)) baseInconsistent();
        parent = await inspect(v.parentKey, false, depth + 1);
        if (parent.value.kind !== parentKind) baseInconsistent();
        if (v.kind === 'block' && o.role === 'main' && parent.value.origin.id !== o.id)
          baseInconsistent();
      } else if (v.parentKey !== null) baseInconsistent();
    }
    const itemToken = digest({
      version: 1,
      kind: 'campaign-backup-frozen-item',
      uid: input.uid,
      ...anchor,
      id: key,
      native: h.native,
      head: v,
      parent: parent?.itemToken ?? null,
      authorization,
    });
    const result = { ...h, itemToken, availability: available ? 'available' : 'unavailable' };
    proven.set(key, result);
    return result;
  }
  return { ...input, source, anchor, path, base: base.value, head, inspect, tx };
}
