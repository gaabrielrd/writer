import { variantBodyCodec } from './campaignVariantBodyCodec.mjs';
import { readRestoredCampaignBaseAccess } from './campaignRestoredSource.mjs';
import { readCampaignBackupDerivedSource } from './campaignBackupDerivedSource.mjs';
import { campaignBackupIdentity } from './campaignBackupSource.mjs';
import { campaignBackupBaseAnchor, baseMasked, baseHash } from './campaignBackupBaseContext.mjs';
import { campaignIdentityToken } from './campaignIdentity.mjs';
import { loreGenerationPath } from './campaignLoreStorage.mjs';
import { digest, workFail, workId } from './workProgressContracts.mjs';
export const loreBackupBad = () =>
  workFail(
    'failed-precondition',
    'O lore do backup está inconsistente.',
    'campaign-backup-lore-inconsistent',
  );
export const loreBackupChanged = () =>
  workFail(
    'failed-precondition',
    'A variante mudou. Reinicie a captura.',
    'campaign-backup-lore-variant-changed',
  );
export const LORE_BACKUP_HEAD = Object.freeze([
  'bodyCodec',
  'schemaVersion',
  'ownerId',
  'campaignId',
  'campaignToken',
  'baseId',
  'sourceKey',
  'revision',
  'mode',
  'previousMode',
  'createdAt',
  'updatedAt',
  'participation',
  'anchor',
  'retainedLegacy',
  'bodyBinding',
]);
const safe = (v, min = 0) => Number.isSafeInteger(v) && v >= min;
const own = (v, c) =>
  v?.schemaVersion === 1 &&
  v.ownerId === c.uid &&
  v.campaignId === c.campaignId &&
  v.campaignToken === c.campaignToken;
function id(v) {
  try {
    return workId(v);
  } catch {
    loreBackupBad();
  }
}
const bornBefore = (a, b) =>
  a.seconds < b.seconds || (a.seconds === b.seconds && a.nanoseconds <= b.nanoseconds);
async function bodyOrigin(tx, c, head, item) {
  const mode = head.mode === 'removed' ? head.previousMode : head.mode,
    b = head.bodyBinding;
  if (mode === 'base') {
    if (b != null) loreBackupBad();
    return { available: true, native: null, generation: null };
  }
  if (
    b != null &&
    (!b ||
      b.schemaVersion !== 1 ||
      !['legacy', 'generation'].includes(b.layout) ||
      !baseHash(b.baseId) ||
      b.sourceKey !== head.sourceKey ||
      !safe(b.bodyRevision, 1) ||
      b.bodyRevision > head.revision ||
      (b.layout === 'legacy' ? b.generationId !== null : !baseHash(b.generationId)) ||
      Object.keys(b).length !== 6 ||
      Object.keys(b).some(
        (k) =>
          ![
            'schemaVersion',
            'layout',
            'generationId',
            'baseId',
            'sourceKey',
            'bodyRevision',
          ].includes(k),
      ))
  )
    loreBackupBad();
  if (item?.availability !== 'available')
    return { available: false, native: null, generation: null };
  const baseId = b?.baseId ?? c.baseId,
    base = await baseMasked(tx, c.db.doc('users/' + c.uid + '/campaignBases/' + baseId), [
      'id',
      'schemaVersion',
      'ownerId',
      'campaignId',
      'adventureId',
      'state',
      'universeId',
      'capturedAt',
      'sourceMode',
      'sourceEvidence',
    ]);
  if (
    !base.snapshot.exists ||
    base.value.id !== baseId ||
    base.value.schemaVersion !== 1 ||
    base.value.ownerId !== c.uid ||
    base.value.campaignId !== c.campaignId ||
    base.value.adventureId !== c.adventureId ||
    base.value.state !== 'ready'
  )
    loreBackupBad();
  let generation = null;
  const generationId =
    b?.layout === 'generation' ? b.generationId : b == null ? c.generationId : null;
  if (generationId !== null) {
    const g = await baseMasked(tx, c.db.doc(loreGenerationPath(c.campaignId, generationId)), [
      'schemaVersion',
      'ownerId',
      'campaignId',
      'campaignToken',
      'baseId',
      'id',
      'state',
    ]);
    if (
      !g.snapshot.exists ||
      !own(g.value, c) ||
      g.value.id !== generationId ||
      g.value.baseId !== baseId ||
      g.value.state !== 'ready'
    )
      loreBackupBad();
    generation = g.native;
  }
  const restoredAccess = await readRestoredCampaignBaseAccess(tx, c.db, c.uid, base.value);
  const born = item.authorization?.born;
  if (!born) loreBackupBad();
  return {
    available: restoredAccess
      ? restoredAccess.availability === 'available'
      : bornBefore(born, base.native.created),
    native: base.native,
    generation,
    ...(restoredAccess ? { restoredSourceProof: digest(restoredAccess) } : {}),
  };
}

/** Current source must be revalidated here even if all origins are unavailable. */
export async function campaignBackupLoreContext(tx, input) {
  const source = await readCampaignBackupDerivedSource(tx, input),
    root = await baseMasked(tx, input.db.doc(input.path), [
      'ownerId',
      'provenance.kind',
      'provenance.adventureId',
      'activeBaseId',
      'activeLoreGenerationId',
    ]);
  if (!root.snapshot.exists || root.value.ownerId !== input.uid) loreBackupBad();
  const campaignToken = campaignIdentityToken(input.uid, input.campaignId, root.snapshot),
    independent = root.value.provenance?.kind === 'independent',
    baseId = independent ? null : root.value.activeBaseId,
    adventureId = independent ? null : id(root.value.provenance?.adventureId),
    generationId = Object.hasOwn(root.value, 'activeLoreGenerationId')
      ? root.value.activeLoreGenerationId
      : null,
    c = { ...input, tx, source, campaignToken, baseId, adventureId, generationId, independent };
  if (
    (!independent && !baseHash(baseId)) ||
    (Object.hasOwn(root.value, 'activeLoreGenerationId') && !baseHash(generationId))
  )
    loreBackupBad();
  let generation = null;
  if (generationId !== null) {
    generation = await baseMasked(
      tx,
      input.db.doc(loreGenerationPath(input.campaignId, generationId)),
      ['schemaVersion', 'ownerId', 'campaignId', 'campaignToken', 'baseId', 'state', 'id'],
    );
    if (
      !generation.snapshot.exists ||
      !own(generation.value, c) ||
      generation.value.id !== generationId ||
      generation.value.baseId !== baseId ||
      generation.value.state !== 'ready'
    )
      loreBackupBad();
  }
  const state = await baseMasked(tx, input.db.doc(input.path + '/loreVariantState/current'), [
    'schemaVersion',
    'ownerId',
    'campaignId',
    'campaignToken',
    'baseId',
    'revision',
  ]);
  if (
    state.snapshot.exists &&
    (!own(state.value, c) || state.value.baseId !== baseId || !safe(state.value.revision))
  )
    loreBackupBad();
  if (generationId !== null && !state.snapshot.exists) loreBackupBad();
  const lorePath =
      generationId === null ? input.path : loreGenerationPath(input.campaignId, generationId),
    storageToken = digest({
      version: 1,
      kind: 'campaign-backup-lore-storage',
      uid: input.uid,
      campaignId: input.campaignId,
      sourceToken: source.sourceToken,
      derivedToken: source.derivedToken,
      baseId,
      generationId,
      state: state.native,
      generation: generation?.native ?? null,
    }),
    anchors = new Map(),
    units = new Map();
  const anchor = {
    schemaVersion: 1,
    campaignId: input.campaignId,
    sourceToken: source.sourceToken,
    derivedToken: source.derivedToken,
    baseId,
  };
  async function captured(key) {
    if (source.availability !== 'available') return null;
    if (!anchors.has(key))
      anchors.set(key, await campaignBackupBaseAnchor(tx, input, source, key, adventureId));
    return anchors.get(key);
  }
  async function inspect(key, supplied) {
    if (!baseHash(key)) loreBackupBad();
    if (units.has(key)) return units.get(key);
    const ref = input.db.doc(lorePath + '/loreVariants/' + key),
      h = supplied
        ? { snapshot: supplied, value: supplied.data(), native: campaignBackupIdentity(supplied) }
        : await baseMasked(tx, ref, LORE_BACKUP_HEAD);
    if (h.snapshot.ref?.path !== ref.path) loreBackupBad();
    if (!h.snapshot.exists) {
      units.set(key, null);
      return null;
    }
    const v = h.value;
    if (
      independent ||
      !state.snapshot.exists ||
      !own(v, c) ||
      v.baseId !== baseId ||
      v.sourceKey !== key ||
      !safe(v.revision, 1) ||
      v.revision > state.value.revision ||
      !['base', 'override', 'removed'].includes(v.mode) ||
      !safe(v.createdAt) ||
      !safe(v.updatedAt) ||
      v.updatedAt < v.createdAt ||
      (v.mode === 'removed' && !['base', 'override'].includes(v.previousMode)) ||
      (v.participation !== undefined &&
        !['candidate', 'legacy', 'inactive'].includes(v.participation)) ||
      (v.retainedLegacy !== undefined && typeof v.retainedLegacy !== 'boolean')
    )
      loreBackupBad();
    try {
      variantBodyCodec(v);
    } catch {
      loreBackupBad();
    }
    const a = v.anchor ?? { capturedBaseId: baseId, sourceKey: key };
    if (
      !a ||
      !baseHash(a.capturedBaseId) ||
      a.sourceKey !== key ||
      Object.keys(a).length !== 2 ||
      Object.keys(a).some((k) => !['capturedBaseId', 'sourceKey'].includes(k)) ||
      (v.participation === 'candidate' && a.capturedBaseId !== baseId)
    )
      loreBackupBad();
    const origin = await captured(a.capturedBaseId),
      item = origin ? await origin.inspect(key, true) : null;
    if (item && item.value.kind !== 'lore') loreBackupBad();
    const bindingOrigin = await bodyOrigin(tx, c, v, item);
    const availability =
        item?.availability === 'available' && bindingOrigin.available ? 'available' : 'unavailable',
      anchorKey = digest({ capturedBaseId: a.capturedBaseId, sourceKey: key }),
      variantToken = digest({
        version: 1,
        kind: 'campaign-backup-lore-variant',
        uid: input.uid,
        ...anchor,
        storageToken,
        id: key,
        native: h.native,
        head: v,
        anchorKey,
        captured: origin?.baseIdentity ?? null,
        item: item?.itemToken ?? null,
        bindingOrigin,
        availability,
      });
    const result = {
      ...h,
      entry: { id: key, variantToken, availability },
      anchorKey,
      origin,
      item,
    };
    units.set(key, result);
    return result;
  }
  async function target(key) {
    const variant = await inspect(key);
    if (variant)
      return {
        available:
          variant.entry.availability === 'available' &&
          variant.value.mode !== 'removed' &&
          variant.value.participation !== 'inactive',
        token: variant.entry.variantToken,
      };
    const origin = await captured(baseId),
      item = origin ? await origin.inspect(key, true) : null;
    if (item && item.value.kind !== 'lore') loreBackupBad();
    return { available: item?.availability === 'available', token: item?.itemToken ?? null };
  }
  return { ...c, anchor, lorePath, storageToken, captured, inspect, target };
}
