import { validateId } from './generation.mjs';
import { availableCampaign } from './campaigns.mjs';
import { assertCampaignNotDeleted } from './campaignDeletionGuard.mjs';
import { campaignIdentityToken } from './campaignIdentity.mjs';
import {
  workClosed as closed,
  workFail as fail,
  workRevision,
  workId,
  readWorkMetadata,
  digest,
} from './workProgressContracts.mjs';
import {
  safe,
  token,
  bounded,
  sessionContext,
  readSessionMetadata,
} from './campaignSessionsContracts.mjs';
import { loreContext, loreEnvelope } from './campaignLoreContracts.mjs';
import { baseSourceKey } from './campaignBaseContracts.mjs';
export { closed, fail, readWorkMetadata, digest, safe, bounded };
export const scopeFields = ['campaignId', 'campaignToken', 'sessionId', 'expectedSessionRevision'];
export const addFields = [
  ...scopeFields,
  'referenceId',
  'operationId',
  'expectedReferenceCollectionRevision',
  'sourceContext',
  'target',
];
export const removeFields = [
  ...scopeFields,
  'referenceId',
  'operationId',
  'expectedRevision',
  'expectedReferenceCollectionRevision',
];
export const referenceFields = [
  'id',
  'schemaVersion',
  'ownerId',
  'campaignId',
  'campaignToken',
  'sessionId',
  'revision',
  'createdAt',
  'updatedAt',
  'deleted',
  'target.kind',
  'target.sourceKey',
];
export const inconsistent = () =>
  fail(
    'failed-precondition',
    'O vínculo ou seu controle está inconsistente.',
    'reference-inconsistent',
  );
export const sourceChanged = () =>
  fail(
    'failed-precondition',
    'A projeção mudou. Consulte o material novamente.',
    'source-context-changed',
  );
export function sourceContextInput(value) {
  closed(value, ['baseId', 'projectionToken']);
  token(value.baseId);
  token(value.projectionToken);
  return value;
}
export function scopeInput(uid, data, fields) {
  if (!uid) fail('unauthenticated', 'Entre na sua conta.');
  closed(data, fields);
  workId(data.campaignId);
  token(data.campaignToken);
  validateId(data.sessionId);
  if (!workRevision(data.expectedSessionRevision))
    fail('invalid-argument', 'Revisão da sessão inválida.');
}
export function requestInput(uid, data, action) {
  scopeInput(uid, data, action === 'add' ? addFields : removeFields);
  validateId(data.referenceId);
  validateId(data.operationId);
  workRevision(data.expectedReferenceCollectionRevision);
  if (action === 'add') {
    if (data.referenceId !== data.operationId)
      fail('invalid-argument', 'O vínculo deve usar o identificador da operação.');
    sourceContextInput(data.sourceContext);
    closed(data.target, ['kind', 'sourceKey']);
    if (!['lore', 'scene'].includes(data.target.kind)) fail('invalid-argument', 'Alvo inválido.');
    token(data.target.sourceKey);
  } else if (!workRevision(data.expectedRevision))
    fail('invalid-argument', 'Revisão do vínculo inválida.');
  return structuredClone(data);
}
export async function ownCampaign(tx, db, uid, request) {
  await assertCampaignNotDeleted(tx, db, uid, request.campaignId);
  const path = 'campaigns/' + request.campaignId;
  const snapshot = await readWorkMetadata(tx, db.doc(path), [
    'ownerId',
    'schemaVersion',
    'revision',
    'deleting',
    'provenance',
    'activeBaseId',
  ]);
  const campaign = availableCampaign(snapshot.data(), uid),
    campaignToken = campaignIdentityToken(uid, request.campaignId, snapshot);
  if (campaignToken !== request.campaignToken)
    fail('failed-precondition', 'A identidade da campanha mudou.', 'campaign-changed');
  return {
    uid,
    campaignId: request.campaignId,
    campaignToken,
    path,
    campaign,
    sessionId: request.sessionId,
  };
}
export async function activeSession(tx, db, c, request) {
  const context = await sessionContext(
    tx,
    db,
    c.uid,
    { campaignId: c.campaignId, campaignToken: c.campaignToken },
    [],
  );
  const value = await readSessionMetadata(
    tx,
    db.doc(c.path + '/sessions/' + c.sessionId),
    context,
    c.sessionId,
  );
  if (!value || value.deleted) fail('not-found', 'Sessão indisponível.', 'session-unavailable');
  if (value.revision !== request.expectedSessionRevision)
    fail(
      'failed-precondition',
      'A sessão mudou. Consulte-a antes de continuar.',
      'revision-conflict',
    );
  return { ...c, sessionRevision: value.revision };
}
export async function referenceControl(tx, db, c) {
  const controlRef = db.doc(c.path + '/sessionReferenceState/' + c.sessionId),
    value = (await tx.get(controlRef)).data();
  let referenceCollectionRevision = 0;
  if (value) {
    if (
      value.schemaVersion !== 1 ||
      value.ownerId !== c.uid ||
      value.campaignId !== c.campaignId ||
      value.campaignToken !== c.campaignToken ||
      value.sessionId !== c.sessionId ||
      !safe(value.revision)
    )
      inconsistent();
    referenceCollectionRevision = value.revision;
  } else if (
    (
      await tx.get(
        db
          .collection(c.path + '/sessionReferences')
          .where('sessionId', '==', c.sessionId)
          .orderBy('__name__')
          .limit(1)
          .select(),
      )
    ).docs.length
  )
    inconsistent();
  return { ...c, controlRef, referenceCollectionRevision };
}
export const identity = (c) => ({
  schemaVersion: 1,
  ownerId: c.uid,
  campaignId: c.campaignId,
  campaignToken: c.campaignToken,
  sessionId: c.sessionId,
});
export const envelope = (c) => ({
  ...identity(c),
  sessionRevision: c.sessionRevision,
  referenceCollectionRevision: c.referenceCollectionRevision,
});
export function storedReference(value, c, referenceId) {
  if (!value) return null;
  if (
    value.ownerId !== c.uid ||
    value.campaignId !== c.campaignId ||
    value.campaignToken !== c.campaignToken ||
    value.sessionId !== c.sessionId
  )
    fail('not-found', 'Vínculo indisponível.');
  if (
    value.schemaVersion !== 1 ||
    value.id !== referenceId ||
    !safe(value.revision, 1) ||
    value.revision > c.referenceCollectionRevision ||
    typeof value.deleted !== 'boolean' ||
    ![value.createdAt, value.updatedAt].every((v) => safe(v) && v <= 8640000000000000) ||
    value.updatedAt < value.createdAt
  )
    inconsistent();
  if (
    !value.deleted &&
    (!value.target ||
      !['lore', 'scene'].includes(value.target.kind) ||
      typeof value.target.sourceKey !== 'string' ||
      !/^[a-f0-9]{64}$/.test(value.target.sourceKey))
  )
    inconsistent();
  if (value.deleted && value.target !== undefined) inconsistent();
  return value;
}
export const referenceMetadata = (value) => ({
  id: value.id,
  revision: value.revision,
  createdAt: value.createdAt,
  updatedAt: value.updatedAt,
});
export const sceneFields = [
  'sourceKey',
  'kind',
  'origin',
  'title',
  'parentKey',
  'archived',
  'orderKey',
  'stage',
];
export function sceneCandidate(item, context, key) {
  const origin = item.origin;
  if (
    item.kind !== 'scene' ||
    item.sourceKey !== key ||
    !origin ||
    Object.keys(origin).length !== 3 ||
    origin.kind !== 'scene' ||
    origin.adventureId !== context.base.adventureId ||
    typeof origin.id !== 'string' ||
    !origin.id ||
    origin.id.includes('/') ||
    baseSourceKey(origin) !== key ||
    typeof item.title !== 'string' ||
    Buffer.from(item.title).toString('utf8') !== item.title ||
    typeof item.archived !== 'boolean' ||
    typeof item.orderKey !== 'string' ||
    !item.orderKey ||
    !(item.parentKey === null || /^[a-f0-9]{64}$/.test(item.parentKey)) ||
    (item.stage !== undefined && typeof item.stage !== 'string')
  )
    inconsistent();
  return {
    kind: 'scene',
    sourceKey: key,
    title: item.title,
    stage: item.stage ?? null,
    archived: item.archived,
  };
}
export async function sceneRecord(tx, db, context, key, supplied) {
  const item =
    supplied ??
    (await readWorkMetadata(tx, db.doc(context.path + '/items/' + key), sceneFields)).data();
  if (!item) return null;
  sceneCandidate(item, context, key);
  return item;
}
export async function optionalLore(tx, db, c) {
  return loreContext(
    tx,
    db,
    c.uid,
    { campaignId: c.campaignId, campaignToken: c.campaignToken, baseId: c.campaign.activeBaseId },
    false,
    { optionalSource: true },
  );
}
export const projectedContext = (context) =>
  context
    ? { baseId: context.base.id, projectionToken: loreEnvelope(context).projectionToken }
    : null;
export function compareSource(expected, actual) {
  if (actual !== null && digest(expected) !== digest(actual)) sourceChanged();
}
export const operationPath = (uid, operationId) =>
  `users/${uid}/campaignSessionReferenceOperations/${operationId}`;
export const fencePath = (uid, operationId) =>
  `users/${uid}/campaignSessionReferenceFences/${operationId}`;
export function priorRecord(value, c, fingerprint) {
  if (!value) return null;
  if (value.fingerprint !== fingerprint)
    fail('invalid-argument', 'Operação usada com outro pedido.');
  if (
    value.schemaVersion !== 1 ||
    value.ownerId !== c.uid ||
    value.campaignId !== c.campaignId ||
    value.campaignToken !== c.campaignToken ||
    value.sessionId !== c.sessionId
  )
    inconsistent();
  return value;
}
export function confirmed(c, previous, request, action) {
  const receipt = previous.receipt;
  if (
    !receipt ||
    Object.keys(receipt).length !== 8 ||
    receipt.operationId !== request.operationId ||
    receipt.action !== action ||
    receipt.referenceId !== request.referenceId ||
    receipt.sessionId !== request.sessionId ||
    receipt.expectedSessionRevision !== request.expectedSessionRevision ||
    receipt.expectedReferenceCollectionRevision !== request.expectedReferenceCollectionRevision ||
    !safe(receipt.revision, 1) ||
    receipt.revision !== (action === 'add' ? 1 : request.expectedRevision + 1) ||
    !safe(receipt.referenceCollectionRevision, 1) ||
    receipt.referenceCollectionRevision !== request.expectedReferenceCollectionRevision + 1
  )
    inconsistent();
  return { ...identity(c), kind: 'confirmed', receipt };
}
export const canceled = (c, request, action) => ({
  ...identity(c),
  kind: 'canceled',
  action,
  request,
});
