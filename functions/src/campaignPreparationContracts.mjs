import { validateId } from './generation.mjs';
import { availableCampaign } from './campaigns.mjs';
import { assertCampaignNotDeleted } from './campaignDeletionGuard.mjs';
import { campaignIdentityToken } from './campaignIdentity.mjs';
import {
  workClosed as closed,
  workFail as fail,
  workId,
  workRevision,
  workConflict,
  readWorkMetadata,
  digest,
} from './workProgressContracts.mjs';
import {
  safe,
  token,
  utf8,
  bounded,
  sessionContext,
  readSessionMetadata,
} from './campaignSessionsContracts.mjs';
export { closed, fail, workRevision, workConflict, readWorkMetadata, digest, safe, bounded };
export const actions = [
  'save-item',
  'delete-item',
  'move-item',
  'add-link',
  'remove-link',
  'move-link',
];
export const statuses = {
  clue: ['pending', 'handled'],
  quest: ['available', 'active', 'completed', 'failed', 'abandoned'],
};
export const bodyKeys = {
  clue: ['text', 'condition', 'recipient'],
  quest: ['description', 'consequences'],
};
export const inconsistent = () =>
  fail(
    'failed-precondition',
    'A preparação ou seu controle está inconsistente.',
    'preparation-inconsistent',
  );
export const cursorChanged = () =>
  fail('failed-precondition', 'A preparação mudou. Recarregue a lista.', 'cursor-invalidated');
export const identity = (c) => ({
  schemaVersion: 1,
  ownerId: c.uid,
  campaignId: c.campaignId,
  campaignToken: c.campaignToken,
});
export const operationPath = (uid, id) => `users/${uid}/campaignPreparationOperations/${id}`;
export const fencePath = (uid, id) => `users/${uid}/campaignPreparationFences/${id}`;
export const itemFields = [
  'schemaVersion',
  'ownerId',
  'campaignId',
  'campaignToken',
  'id',
  'kind',
  'revision',
  'order',
  'title',
  'status',
  'createdAt',
  'updatedAt',
  'deleted',
];
export const linkFields = [
  'schemaVersion',
  'ownerId',
  'campaignId',
  'campaignToken',
  'id',
  'sessionId',
  'itemId',
  'revision',
  'order',
  'createdAt',
  'updatedAt',
  'deleted',
];
const exact = (value, keys) =>
  !!value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key));
export function validBody(kind, value) {
  const keys = typeof kind === 'string' && Object.hasOwn(bodyKeys, kind) ? bodyKeys[kind] : null;
  return (
    !!keys &&
    exact(value, keys) &&
    keys.every((key) => utf8(value[key]) && value[key].length <= 150000) &&
    keys.reduce((n, key) => n + Buffer.byteLength(value[key]), 0) <= 512 * 1024
  );
}
export const validTitle = (value) =>
  utf8(value) && !!value.trim() && value === value.trim() && value.length <= 300;
export function form(data) {
  const title = typeof data.title === 'string' ? data.title.trim() : data.title;
  if (
    typeof data.kind !== 'string' ||
    !Object.hasOwn(statuses, data.kind) ||
    !statuses[data.kind].includes(data.status) ||
    !validTitle(title) ||
    !validBody(data.kind, data.body)
  )
    fail('invalid-argument', 'Título, estado ou texto de preparação inválido.');
  return {
    kind: data.kind,
    title,
    status: data.status,
    body: Object.fromEntries(bodyKeys[data.kind].map((key) => [key, data.body[key]])),
  };
}
export function scopeInput(uid, data, fields, optionalToken = false) {
  if (!uid) fail('unauthenticated', 'Entre na sua conta.');
  closed(data, ['campaignId', 'campaignToken', ...fields]);
  workId(uid);
  workId(data.campaignId);
  if (!optionalToken || data.campaignToken !== undefined) token(data.campaignToken);
}
export function sessionInput(data) {
  validateId(data.sessionId);
  if (!workRevision(data.expectedSessionRevision))
    fail('invalid-argument', 'Revisão da sessão inválida.');
}
export function requestInput(uid, data, action) {
  if (!actions.includes(action)) fail('invalid-argument', 'Ação inválida.');
  const item = action.endsWith('-item');
  const fields = item
    ? [
        'operationId',
        'itemId',
        'expectedRevision',
        'expectedItemCollectionRevision',
        ...(action === 'save-item'
          ? ['kind', 'title', 'status', 'body']
          : action === 'move-item'
            ? ['direction']
            : []),
      ]
    : [
        'sessionId',
        'expectedSessionRevision',
        'operationId',
        'linkId',
        'expectedRevision',
        'expectedLinkCollectionRevision',
        ...(action === 'add-link'
          ? ['itemId', 'expectedItemRevision']
          : action === 'move-link'
            ? ['direction']
            : []),
      ];
  scopeInput(uid, data, fields);
  validateId(data.operationId);
  validateId(item ? data.itemId : data.linkId);
  workRevision(data.expectedRevision);
  workRevision(item ? data.expectedItemCollectionRevision : data.expectedLinkCollectionRevision);
  if (!item) sessionInput(data);
  if (action.startsWith('move-') && !['up', 'down'].includes(data.direction))
    fail('invalid-argument', 'Direção inválida.');
  if (action === 'add-link') {
    validateId(data.itemId);
    if (
      !workRevision(data.expectedItemRevision) ||
      data.expectedRevision !== 0 ||
      data.linkId !== data.operationId
    )
      fail('invalid-argument', 'Identidade ou revisão do vínculo inválida.');
  }
  if (action !== 'save-item' && action !== 'add-link' && !data.expectedRevision)
    fail('invalid-argument', 'Revisão inválida.');
  const input = structuredClone(data);
  if (action === 'save-item') {
    Object.assign(input, form(data));
    if (
      !input.expectedRevision &&
      (input.itemId !== input.operationId || input.status !== statuses[input.kind][0])
    )
      fail('invalid-argument', 'Crie o item no estado inicial com o identificador da operação.');
  }
  // Canonical key order makes transport property order irrelevant to the fingerprint.
  return Object.fromEntries(
    ['campaignId', 'campaignToken', ...fields].map((key) => [key, input[key]]),
  );
}
export async function ownCampaign(tx, db, uid, data, optionalToken = false) {
  await assertCampaignNotDeleted(tx, db, uid, data.campaignId);
  const path = 'campaigns/' + data.campaignId;
  const snapshot = await readWorkMetadata(tx, db.doc(path), [
    'ownerId',
    'schemaVersion',
    'revision',
    'deleting',
    'provenance',
    'activeBaseId',
  ]);
  availableCampaign(snapshot.data(), uid);
  const campaignToken = campaignIdentityToken(uid, data.campaignId, snapshot);
  if ((!optionalToken || data.campaignToken !== undefined) && data.campaignToken !== campaignToken)
    fail('failed-precondition', 'A identidade da campanha mudou.', 'campaign-changed');
  return { uid, campaignId: data.campaignId, campaignToken, path };
}
export async function activeSession(tx, db, c, request) {
  const s = await sessionContext(
    tx,
    db,
    c.uid,
    { campaignId: c.campaignId, campaignToken: c.campaignToken },
    [],
  );
  const value = await readSessionMetadata(
    tx,
    db.doc(c.path + '/sessions/' + request.sessionId),
    s,
    request.sessionId,
  );
  if (!value || value.deleted) fail('not-found', 'Sessão indisponível.', 'session-unavailable');
  if (value.revision !== request.expectedSessionRevision) workConflict();
  return { ...c, sessionId: request.sessionId, sessionRevision: value.revision };
}
function own(value, c) {
  if (
    !value ||
    value.schemaVersion !== 1 ||
    value.ownerId !== c.uid ||
    value.campaignId !== c.campaignId ||
    value.campaignToken !== c.campaignToken
  )
    inconsistent();
}
export async function control(tx, db, c, links = false) {
  const controlRef = db.doc(
    c.path + (links ? '/sessionPreparationState/' + c.sessionId : '/preparationState/current'),
  );
  const value = (await tx.get(controlRef)).data();
  const collection = c.path + (links ? '/sessionPreparationLinks' : '/preparationItems');
  let revision = 0,
    nextOrder = 1;
  if (value) {
    own(value, c);
    if (
      !exact(value, [
        'schemaVersion',
        'ownerId',
        'campaignId',
        'campaignToken',
        ...(links ? ['sessionId'] : []),
        'revision',
        'nextOrder',
      ]) ||
      !safe(value.revision) ||
      !safe(value.nextOrder, 1) ||
      (links && value.sessionId !== c.sessionId)
    )
      inconsistent();
    revision = value.revision;
    nextOrder = value.nextOrder;
  } else {
    let query = db.collection(collection).orderBy('__name__').limit(1).select();
    if (links) query = query.where('sessionId', '==', c.sessionId);
    if ((await tx.get(query)).docs.length) inconsistent();
  }
  return links
    ? {
        ...c,
        linkControlRef: controlRef,
        linkCollectionRevision: revision,
        linkNextOrder: nextOrder,
      }
    : {
        ...c,
        itemControlRef: controlRef,
        itemCollectionRevision: revision,
        itemNextOrder: nextOrder,
      };
}
export const controlValue = (c, revision, nextOrder, links = false) => ({
  ...identity(c),
  ...(links ? { sessionId: c.sessionId } : {}),
  revision,
  nextOrder,
});
function common(value, c, id, maxRevision, nextOrder) {
  own(value, c);
  if (
    !/^[A-Za-z0-9-]{16,80}$/.test(id) ||
    value.id !== id ||
    !safe(value.revision, 1) ||
    value.revision > maxRevision ||
    !safe(value.order, 1) ||
    value.order >= nextOrder ||
    typeof value.deleted !== 'boolean' ||
    ![value.createdAt, value.updatedAt].every((v) => safe(v) && v <= 8640000000000000) ||
    value.updatedAt < value.createdAt
  )
    inconsistent();
}
export function storedItem(value, c, id) {
  if (!value) return null;
  common(value, c, id, c.itemCollectionRevision, c.itemNextOrder);
  if (
    typeof value.kind !== 'string' ||
    !Object.hasOwn(statuses, value.kind) ||
    (!value.deleted &&
      (!validTitle(value.title) || !statuses[value.kind].includes(value.status))) ||
    (value.deleted && (value.title !== undefined || value.status !== undefined))
  )
    inconsistent();
  return value;
}
export function storedLink(value, c, id) {
  if (!value) return null;
  common(value, c, id, c.linkCollectionRevision, c.linkNextOrder);
  if (
    value.sessionId !== c.sessionId ||
    (!value.deleted &&
      (typeof value.itemId !== 'string' || !/^[A-Za-z0-9-]{16,80}$/.test(value.itemId))) ||
    (value.deleted && value.itemId !== undefined)
  )
    inconsistent();
  return value;
}
export const itemSummary = (v) => ({
  id: v.id,
  kind: v.kind,
  revision: v.revision,
  order: v.order,
  title: v.title,
  status: v.status,
  createdAt: v.createdAt,
  updatedAt: v.updatedAt,
});
export const linkSummary = (v) => ({
  id: v.id,
  revision: v.revision,
  order: v.order,
  createdAt: v.createdAt,
  updatedAt: v.updatedAt,
});
export function storedBody(value, c, item) {
  own(value, c);
  if (
    !exact(value, [
      'schemaVersion',
      'ownerId',
      'campaignId',
      'campaignToken',
      'id',
      'kind',
      'revision',
      'body',
    ]) ||
    value.id !== item.id ||
    value.kind !== item.kind ||
    value.revision !== item.revision ||
    !validBody(item.kind, value.body)
  )
    inconsistent();
  return structuredClone(value.body);
}
export function receipt(value, request, action) {
  const item = action.endsWith('-item');
  const keys = item
    ? ['operationId', 'action', 'itemId', 'expectedRevision', 'revision', 'itemCollectionRevision']
    : [
        'operationId',
        'action',
        'linkId',
        'sessionId',
        'expectedSessionRevision',
        'expectedRevision',
        'revision',
        'linkCollectionRevision',
      ];
  if (
    !exact(value, keys) ||
    value.operationId !== request.operationId ||
    value.action !== action ||
    value.expectedRevision !== request.expectedRevision ||
    !safe(value.revision, 1) ||
    value.revision !== request.expectedRevision + 1 ||
    (item
      ? value.itemId !== request.itemId ||
        value.itemCollectionRevision !== request.expectedItemCollectionRevision + 1 ||
        !safe(value.itemCollectionRevision, 1)
      : value.linkId !== request.linkId ||
        value.sessionId !== request.sessionId ||
        value.expectedSessionRevision !== request.expectedSessionRevision ||
        value.linkCollectionRevision !== request.expectedLinkCollectionRevision + 1 ||
        !safe(value.linkCollectionRevision, 1))
  )
    inconsistent();
  return value;
}
export function prior(value, c, request, action, fingerprint, hasReceipt) {
  if (!value) return null;
  own(value, c);
  if (
    !exact(value, [
      'schemaVersion',
      'ownerId',
      'campaignId',
      'campaignToken',
      'action',
      'operationId',
      'fingerprint',
      ...(hasReceipt ? ['receipt'] : []),
    ]) ||
    value.action !== action ||
    value.operationId !== request.operationId ||
    typeof value.fingerprint !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.fingerprint)
  )
    inconsistent();
  if (value.fingerprint !== fingerprint)
    fail('invalid-argument', 'Operação utilizada com outro pedido.');
  if (hasReceipt) receipt(value.receipt, request, action);
  return value;
}
export const confirmed = (c, value) => ({
  ...identity(c),
  kind: 'confirmed',
  receipt: value.receipt,
});
export const canceled = (c, request, action) => ({
  ...identity(c),
  kind: 'canceled',
  action,
  operationId: request.operationId,
});
export function encodeCursor(scope, last) {
  return Buffer.from(JSON.stringify({ ...scope, order: last.order, id: last.id })).toString(
    'base64url',
  );
}
export function decodeCursor(value, scope) {
  if (value == null) return null;
  let parsed;
  try {
    if (typeof value !== 'string' || value.length > 12000 || !/^[A-Za-z0-9_-]+$/.test(value))
      throw new Error();
    parsed = JSON.parse(Buffer.from(value, 'base64url').toString());
  } catch {
    fail('invalid-argument', 'Página inválida.');
  }
  closed(parsed, [...Object.keys(scope), 'order', 'id']);
  if (!safe(parsed.order, 1)) fail('invalid-argument', 'Página inválida.');
  validateId(parsed.id);
  if (Object.keys(scope).some((key) => parsed[key] !== scope[key])) cursorChanged();
  return parsed;
}
