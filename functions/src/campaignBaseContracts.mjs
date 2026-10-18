import {
  workClosed,
  workFail,
  workId,
  digest,
  workLimit,
  readWorkMetadata,
} from './workProgressContracts.mjs';
import { splitHistoryContent } from './workHistoryContracts.mjs';
import { assertCampaignNotDeleted } from './campaignDeletionGuard.mjs';

const id = workId;
export { workClosed as closed, workFail as fail, workId as id, digest, workLimit as limit };
export const BASE_PAGE_BYTES = 4 * 1024 * 1024;
export const CAPTURE_WRITE_BYTES = 2 * 1024 * 1024;
export const BASE_IMAGE_BYTES = 16 * 1024 * 1024;
export const baseKinds = ['part', 'scene', 'block', 'arc', 'milestone', 'event', 'lore'];
export const capturePhases = [
  'parts',
  'scenes',
  'blocks',
  'sceneReferences',
  'arcs',
  'milestones',
  'events',
  'narrativeLinks',
  'lore',
  'images',
  'finalizing',
  'complete',
  'cleanup',
];
export const emptyCaptureCounts = () =>
  Object.fromEntries([...baseKinds, 'reference', 'image'].map((kind) => [kind, 0]));
export const basePath = (uid, baseId) => `users/${id(uid)}/campaignBases/${id(baseId)}`;
export const preparationPath = (uid, captureId) =>
  `users/${id(uid)}/campaignPreparations/${id(captureId)}`;
export const baseSourceKey = (origin) => digest(origin);
export const baseBodyKey = (sourceKey, field, index) => digest({ sourceKey, field, index });
export const baseImageKey = (imageId) => digest({ imageId });
export const baseImageUseKey = (baseId, imageId) => 'campaign-base:' + digest({ baseId, imageId });
export function preciseStamp(snapshot) {
  const stamp = snapshot?.updateTime;
  if (
    !stamp ||
    !Number.isSafeInteger(stamp.seconds) ||
    !Number.isInteger(stamp.nanoseconds) ||
    stamp.nanoseconds < 0 ||
    stamp.nanoseconds >= 1e9
  )
    workFail('failed-precondition', 'Não foi possível conferir a versão da origem.');
  return { seconds: stamp.seconds, nanoseconds: stamp.nanoseconds };
}
export function captureScope(uid, data, fields) {
  if (!uid) workFail('unauthenticated', 'Entre na sua conta.');
  id(uid);
  workClosed(data, fields);
  return { uid };
}
export function captureToken(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
    workFail('invalid-argument', 'Versão da origem inválida.');
  return value;
}
export async function readCaptureOrigin(tx, db, uid, adventureId) {
  const snapshot = await tx.get(db.doc('adventures/' + id(adventureId))),
    adventure = snapshot.data();
  if (
    !adventure ||
    adventure.ownerId !== uid ||
    adventure.deleting ||
    adventure.schemaVersion !== 1
  )
    return null;
  let worldSnapshot = null,
    world = null;
  if (adventure.universeId != null) {
    worldSnapshot = await tx.get(db.doc('universes/' + id(adventure.universeId)));
    world = worldSnapshot.data();
    if (!world || world.authorId !== uid || world.deleting) return null;
  }
  const sourceToken = digest({
    version: 1,
    uid,
    adventureId,
    adventure: preciseStamp(snapshot),
    universeId: adventure.universeId ?? null,
    universe: worldSnapshot ? preciseStamp(worldSnapshot) : null,
    sceneRevision: adventure.sceneRevision ?? 0,
    narrativeRevision: adventure.narrativeRevision ?? 0,
    loreVersion: world?.loreVersion ?? 0,
    privacyVersion: world?.privacyVersion ?? 0,
  });
  return { adventure, world, snapshot, worldSnapshot, sourceToken };
}
export function captureSource(adventureId, value) {
  return {
    adventureId,
    title: value.adventure.title,
    universeId: value.adventure.universeId ?? null,
    sourceToken: value.sourceToken,
    loreSelection: 'referenced',
    counts: Object.fromEntries(Object.keys(emptyCaptureCounts()).map((kind) => [kind, null])),
  };
}
export function captureProgress(value, sourceAvailable = true) {
  if (
    ![value.campaignId, value.baseId].every(
      (key) => typeof key === 'string' && /^[a-f0-9]{64}$/.test(key),
    )
  )
    workFail('failed-precondition', 'A identidade da preparação está inconsistente.');
  return {
    captureId: value.id,
    state: value.state,
    phase: value.phase,
    checkpoint: value.checkpoint,
    processed: sourceAvailable ? value.processed : 0,
    counts: sourceAvailable ? value.counts : null,
    sourceAvailable,
    cleanupComplete: value.state === 'deleted',
    campaignId: value.state === 'activated' ? value.campaignId : null,
    reserved: { campaignId: value.campaignId, baseId: value.baseId },
    reason: value.reason ?? null,
    request: {
      adventureId: value.adventureId,
      title: value.title,
      description: value.description,
      universeId: value.universeId,
    },
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}
export function baseTextFields(sourceKey, fields) {
  const manifests = [],
    bodies = [];
  for (const [field, content] of Object.entries(fields)) {
    if (typeof content !== 'string') workFail('failed-precondition', 'Texto da origem inválido.');
    const chunks = splitHistoryContent(content);
    manifests.push({
      field,
      sha256: digest(content),
      bytes: Buffer.byteLength(content),
      chunkCount: chunks.length,
      bodySourceKey: sourceKey,
    });
    chunks.forEach((text, index) => bodies.push({ sourceKey, field, index, content: text }));
  }
  return { fields: manifests, bodies };
}
export function assertCaptureBudget(value) {
  if (Buffer.byteLength(JSON.stringify(value)) > CAPTURE_WRITE_BYTES)
    workFail(
      'failed-precondition',
      'O recurso ultrapassa o orçamento da captura. Nenhum texto foi truncado.',
    );
}
export function baseSummary(item) {
  const result = {
    sourceKey: item.sourceKey,
    kind: item.kind,
    parentKey: item.parentKey,
    title: item.title,
    archived: item.archived,
    orderKey: item.orderKey,
  };
  for (const key of ['stage', 'type', 'audience', 'role', 'dateLabel'])
    if (item[key] !== undefined) result[key] = item[key];
  return result;
}
export function publicField(field) {
  return {
    field: field.field,
    sha256: field.sha256,
    bytes: field.bytes,
    chunkCount: field.chunkCount,
  };
}
export const encodeBaseCursor = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
export function decodeBaseCursor(value, scope, keys = ['key']) {
  if (value == null) return null;
  let parsed;
  try {
    if (typeof value !== 'string' || value.length > 12000 || !/^[A-Za-z0-9_-]+$/.test(value))
      throw new Error();
    parsed = JSON.parse(Buffer.from(value, 'base64url').toString());
  } catch {
    workFail('invalid-argument', 'Página inválida.');
  }
  workClosed(parsed, ['version', 'scope', ...keys]);
  if (
    parsed.version !== 1 ||
    !parsed.scope ||
    typeof parsed.scope !== 'object' ||
    Array.isArray(parsed.scope) ||
    keys.some((key) => !(key in parsed))
  )
    workFail('invalid-argument', 'Página inválida.');
  if (
    'key' in parsed &&
    (typeof parsed.key !== 'string' || !parsed.key || parsed.key.length > 1500)
  )
    workFail('invalid-argument', 'Página inválida.');
  if ('index' in parsed && (!Number.isSafeInteger(parsed.index) || parsed.index < 0))
    workFail('invalid-argument', 'Página inválida.');
  if (parsed.version !== 1 || digest(parsed.scope) !== digest(scope))
    workFail(
      'failed-precondition',
      'A projeção mudou. Abra a base novamente.',
      'cursor-invalidated',
    );
  return parsed;
}
// Ready-base readers reuse this gate; content updateTime is deliberately not compared.
export async function readCampaignBase(tx, db, uid, campaignId, { optionalSource = false } = {}) {
  if (!uid) workFail('unauthenticated', 'Entre na sua conta.');
  await assertCampaignNotDeleted(tx, db, uid, id(campaignId));
  const campaignSnapshot = await tx.get(db.doc('campaigns/' + id(campaignId))),
    campaign = campaignSnapshot.data();
  if (!campaign || campaign.ownerId !== uid || campaign.deleting)
    workFail('not-found', 'Campanha indisponível.');
  if (campaign.schemaVersion !== 1)
    workFail('failed-precondition', 'Versão da campanha não suportada.');
  if (
    optionalSource &&
    campaign.provenance?.kind === 'independent' &&
    campaign.activeBaseId == null
  )
    return null;
  if (
    campaign.provenance?.kind !== 'original' ||
    !campaign.activeBaseId ||
    campaign.provenance.baseId !== campaign.activeBaseId
  )
    workFail('not-found', 'Base indisponível.');
  const ref = db.doc(basePath(uid, campaign.activeBaseId)),
    base = (await tx.get(ref)).data();
  if (optionalSource && !base) return null;
  if (
    !base ||
    base.ownerId !== uid ||
    base.id !== campaign.activeBaseId ||
    base.state !== 'ready' ||
    base.campaignId !== campaignId ||
    base.adventureId !== campaign.provenance.adventureId
  )
    workFail(optionalSource ? 'failed-precondition' : 'not-found', 'Base indisponível.');
  if (base.schemaVersion !== 1) workFail('failed-precondition', 'Versão da base não suportada.');
  const adventureSnapshot = await tx.get(db.doc('adventures/' + id(base.adventureId))),
    adventure = adventureSnapshot.data();
  if (optionalSource && adventure && (adventure.ownerId !== uid || adventure.schemaVersion !== 1))
    workFail('failed-precondition', 'A identidade ou versão da aventura está inconsistente.');
  if (optionalSource && (!adventure || adventure.deleting)) return null;
  if (!adventure || adventure.ownerId !== uid || adventure.deleting)
    workFail('not-found', 'Origem indisponível.');
  if (adventure.schemaVersion !== 1)
    workFail('failed-precondition', 'Versão da aventura não suportada.');
  let world = null;
  if (base.universeId != null) {
    const worldSnapshot = await tx.get(db.doc('universes/' + id(base.universeId)));
    world = worldSnapshot.data();
  }
  const projectionToken = digest({
    version: 1,
    uid,
    campaignId,
    baseId: base.id,
    worldAvailable: Boolean(world && world.authorId === uid && !world.deleting),
    loreVersion: world?.loreVersion ?? null,
    privacyVersion: world?.privacyVersion ?? null,
  });
  return {
    uid,
    campaignId,
    campaign,
    campaignSnapshot,
    base,
    ref,
    path: ref.path,
    adventure,
    world,
    projectionToken,
  };
}
export async function baseItemAvailable(tx, db, context, item) {
  if (item.kind !== 'lore') return true;
  if (
    !context.world ||
    context.world.authorId !== context.uid ||
    context.world.deleting ||
    item.origin.scopeId !== context.base.universeId
  )
    return false;
  const entity = (
    await readWorkMetadata(
      tx,
      db.doc(`universes/${id(item.origin.scopeId)}/lore/${id(item.origin.id)}`),
      ['deleting'],
    )
  ).data();
  return Boolean(entity && !entity.deleting);
}
