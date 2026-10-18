import {
  captureScope,
  captureToken,
  basePath,
  baseSourceKey,
  digest,
  fail,
  readCaptureOrigin,
} from './campaignBaseContracts.mjs';
import { workRevision, readWorkMetadata } from './workProgressContracts.mjs';
import { campaignIdentityToken } from './campaignIdentity.mjs';
import { loreStorageContext } from './campaignLoreStorage.mjs';
import { readCampaignAuthorization } from './campaignAuthorization.mjs';
import { readCampaignDeletionReservation } from './campaignDeletionGuard.mjs';

export { digest, fail, captureToken as hashId, basePath, readWorkMetadata };
export const comparisonPath = (uid, id) => `users/${uid}/campaignComparisons/${id}`;
export const candidateId = (uid, campaignToken, comparisonId) =>
  digest({ kind: 'campaign-comparison-base', uid, campaignToken, comparisonId });
export const sourceKey = (adventureId) => digest({ kind: 'source', adventureId });
export const request = (uid, data, fields) => captureScope(uid, data, fields);
export const inconsistent = () => fail('failed-precondition', 'A comparação está inconsistente.');
export const identity = (p) => ({
  schemaVersion: 1,
  ownerId: p.ownerId,
  comparisonId: p.id,
  campaignId: p.campaignId,
  campaignToken: p.campaignToken,
  currentBaseId: p.currentBaseId,
  candidateBaseId: p.baseId,
});
export function ownedComparison(p, uid, id) {
  if (!p || p.ownerId !== uid) fail('not-found', 'Comparação indisponível.');
  if (
    p.schemaVersion !== 1 ||
    p.id !== id ||
    p.baseId !== candidateId(uid, p.campaignToken, id) ||
    !['preparing', 'ready', 'adopted', 'aborted', 'deleting', 'deleted'].includes(p.state)
  )
    inconsistent();
  workRevision(p.checkpoint);
  return p;
}
export const progress = (p, observation) => ({
  ...identity(p),
  state: p.state,
  phase: p.phase,
  checkpoint: p.checkpoint,
  processed: observation.available ? p.processed : null,
  counts: observation.available
    ? Object.fromEntries(
        Object.entries(p.counts).map(([k, v]) => [k === 'reference' ? 'loreReference' : k, v]),
      )
    : null,
  sourceAvailable: observation.available,
  cleanupComplete: p.state === 'deleted',
  reason: observation.reason ?? p.reason ?? null,
  createdAt: p.createdAt,
  updatedAt: p.updatedAt,
});
const campaignFields = [
  'ownerId',
  'schemaVersion',
  'deleting',
  'activeBaseId',
  'provenance',
  'activeLoreGenerationId',
];
const baseFields = [
  'id',
  'ownerId',
  'schemaVersion',
  'state',
  'campaignId',
  'adventureId',
  'universeId',
  'capturedAt',
  'snapshot',
];
export async function observeCampaign(tx, db, uid, campaignId, expected = null) {
  if ((await readCampaignDeletionReservation(tx, db, campaignId)).record)
    return { available: false, reason: 'campaign-deleting' };
  const snapshot = await readWorkMetadata(tx, db.doc('campaigns/' + campaignId), campaignFields);
  const campaign = snapshot.data();
  const unavailable = { available: false, reason: 'campaign-unavailable' };
  if (!campaign || campaign.ownerId !== uid || campaign.deleting || campaign.schemaVersion !== 1)
    return unavailable;
  const campaignToken = campaignIdentityToken(uid, campaignId, snapshot);
  if (expected && campaignToken !== expected.campaignToken)
    return { available: false, reason: 'campaign-changed' };
  if (
    campaign.provenance?.kind !== 'original' ||
    !campaign.activeBaseId ||
    campaign.provenance.baseId !== campaign.activeBaseId
  )
    return unavailable;
  if (
    expected &&
    (campaign.activeBaseId !== expected.currentBaseId ||
      campaign.provenance.adventureId !== expected.adventureId)
  )
    return { available: false, reason: 'base-changed' };
  const base = (
    await readWorkMetadata(tx, db.doc(basePath(uid, campaign.activeBaseId)), baseFields)
  ).data();
  if (
    !base ||
    base.schemaVersion !== 1 ||
    base.ownerId !== uid ||
    base.id !== campaign.activeBaseId ||
    base.campaignId !== campaignId ||
    base.adventureId !== campaign.provenance.adventureId ||
    base.state !== 'ready'
  )
    return { available: false, reason: 'base-changed' };
  const adventure = (
    await readWorkMetadata(tx, db.doc('adventures/' + base.adventureId), [
      'ownerId',
      'schemaVersion',
      'deleting',
    ])
  ).data();
  if (
    !adventure ||
    adventure.ownerId !== uid ||
    adventure.schemaVersion !== 1 ||
    adventure.deleting
  )
    return { available: false, reason: 'source-unavailable' };
  return { available: true, reason: null, campaign, campaignToken, base, snapshot };
}
export async function observeComparison(tx, db, p, checkSourceToken = false) {
  const result = await observeCampaign(tx, db, p.ownerId, p.campaignId, p);
  if (!result.available) return result;
  if (p.sourceUniverseId != null) {
    const world = (
      await readWorkMetadata(tx, db.doc('universes/' + p.sourceUniverseId), [
        'authorId',
        'deleting',
      ])
    ).data();
    if (!world || world.authorId !== p.ownerId || world.deleting)
      return { available: false, reason: 'source-unavailable' };
  }
  if (checkSourceToken) {
    const origin = await readCaptureOrigin(tx, db, p.ownerId, p.adventureId);
    if (!origin) return { available: false, reason: 'source-unavailable' };
    if (origin.sourceToken !== p.sourceToken)
      return { ...result, reason: 'source-changed', origin };
    return { ...result, origin };
  }
  return result;
}
export async function generationContext(tx, db, uid, campaignId, base) {
  let world = null;
  if (base.universeId != null)
    world = (
      await readWorkMetadata(tx, db.doc('universes/' + base.universeId), [
        'authorId',
        'deleting',
        'loreVersion',
        'privacyVersion',
      ])
    ).data();
  return {
    uid,
    campaignId,
    base,
    path: basePath(uid, base.id),
    world,
    projectionToken: digest({
      uid,
      campaignId,
      baseId: base.id,
      worldAvailable: Boolean(world && world.authorId === uid && !world.deleting),
      loreVersion: world?.loreVersion ?? null,
      privacyVersion: world?.privacyVersion ?? null,
    }),
  };
}
export async function readComparisonContext(tx, db, uid, p) {
  if (p.state !== 'ready') fail('not-found', 'Comparação indisponível.');
  const observed = await observeCampaign(tx, db, uid, p.campaignId, p);
  if (!observed.available) fail('not-found', 'Comparação indisponível.', observed.reason);
  const candidate = (
    await readWorkMetadata(tx, db.doc(basePath(uid, p.baseId)), baseFields)
  ).data();
  if (
    !candidate ||
    candidate.schemaVersion !== 1 ||
    candidate.state !== 'ready' ||
    candidate.ownerId !== uid ||
    candidate.campaignId !== p.campaignId ||
    candidate.id !== p.baseId ||
    candidate.adventureId !== p.adventureId
  )
    inconsistent();
  const current = await generationContext(tx, db, uid, p.campaignId, observed.base);
  const storage = await loreStorageContext(tx, db, {
    ...current,
    campaign: observed.campaign,
    campaignToken: p.campaignToken,
  });
  Object.assign(current, storage);
  const next = await generationContext(tx, db, uid, p.campaignId, candidate);
  const control = (
    await readWorkMetadata(tx, db.doc(`campaigns/${p.campaignId}/loreVariantState/current`), [
      'schemaVersion',
      'ownerId',
      'campaignId',
      'campaignToken',
      'baseId',
      'revision',
    ])
  ).data();
  let collectionRevision = 0;
  if (control) {
    if (
      control.schemaVersion !== 1 ||
      control.ownerId !== uid ||
      control.campaignId !== p.campaignId ||
      control.campaignToken !== p.campaignToken ||
      control.baseId !== p.currentBaseId
    )
      inconsistent();
    collectionRevision = workRevision(control.revision);
  } else if (
    (
      await tx.get(
        db
          .collection(current.lorePath + '/loreVariants')
          .orderBy('__name__')
          .limit(1)
          .select(),
      )
    ).docs.length
  )
    inconsistent();
  const authorization = await readCampaignAuthorization(tx, db, uid);
  const envelope = {
    ...identity(p),
    currentCapturedAt: observed.base.capturedAt,
    candidateCapturedAt: candidate.capturedAt,
    collectionRevision,
    comparisonToken: digest({
      identity: identity(p),
      current: current.projectionToken,
      candidate: next.projectionToken,
      collectionRevision,
      authorization: authorization.record
        ? { token: authorization.record.token, epoch: authorization.epoch }
        : null,
    }),
  };
  if (
    ![envelope.currentCapturedAt, envelope.candidateCapturedAt].every(
      (v) => Number.isSafeInteger(v) && v >= 0,
    )
  )
    inconsistent();
  return { p, current, candidate: next, envelope };
}
// A per-attempt read budget, including queries and metadata gates. Never reads blobs.
export function meteredTransaction(tx) {
  let bytes = 0,
    documents = 0;
  const cache = new Map();
  function charge(snap) {
    const docs = snap.docs ?? [snap];
    documents += docs.length;
    for (const doc of docs) bytes += Buffer.byteLength(JSON.stringify(doc.data() ?? null));
    if (bytes > 4 * 1024 * 1024 || documents > 512)
      fail('failed-precondition', 'O par ultrapassa o orçamento da comparação.');
    return snap;
  }
  const wrapped = {
    async get(ref) {
      if (!ref.path) return charge(await tx.get(ref));
      const key = ref.path + '|all';
      if (!cache.has(key)) cache.set(key, charge(await tx.get(ref)));
      return cache.get(key);
    },
    async getAll(ref, options) {
      const key = ref.path + '|' + JSON.stringify(options.fieldMask);
      if (!cache.has(key)) {
        const snap =
          typeof tx.getAll === 'function' ? (await tx.getAll(ref, options))[0] : await tx.get(ref);
        cache.set(key, charge(snap));
      }
      return [cache.get(key)];
    },
  };
  return {
    tx: wrapped,
    canReserve: (b, d) => bytes + b <= 4 * 1024 * 1024 && documents + d <= 512,
    usage: () => ({ bytes, documents }),
  };
}
export const loreOriginKey = (scopeId, id) => baseSourceKey({ kind: 'lore', scopeId, id });
