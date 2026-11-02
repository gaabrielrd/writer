import { availableCampaign } from './campaigns.mjs';
import { assertCampaignNotDeleted } from './campaignDeletionGuard.mjs';
import { campaignIdentityToken } from './campaignIdentity.mjs';
import {
  workClosed as closed,
  workFail as fail,
  workId as id,
  digest,
  readWorkMetadata,
} from './workProgressContracts.mjs';

export { closed, fail, id, digest, readWorkMetadata };
export const SESSION_BYTES = 4 * 1024 * 1024;
export const sessionFields = [
  'id',
  'schemaVersion',
  'ownerId',
  'campaignId',
  'campaignToken',
  'revision',
  'order',
  'createdAt',
  'updatedAt',
  'deleted',
  'title',
  'scheduledDate',
  'status',
];
export const inconsistent = () =>
  fail(
    'failed-precondition',
    'A sessão ou seu controle está inconsistente.',
    'session-inconsistent',
  );
export const campaignChanged = () =>
  fail('failed-precondition', 'A identidade da campanha mudou.', 'campaign-changed');
export const cursorChanged = () =>
  fail('failed-precondition', 'As sessões mudaram. Recarregue a lista.', 'cursor-invalidated');
export const safe = (value, minimum = 0) => Number.isSafeInteger(value) && value >= minimum;
export const utf8 = (value) =>
  typeof value === 'string' && Buffer.from(value).toString('utf8') === value;
export const token = (value) => {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
    fail('invalid-argument', 'Identidade inválida.');
  return value;
};
export const validTitle = (value) =>
  utf8(value) && !!value.trim() && value === value.trim() && value.length <= 300;
export const validSummary = (value) =>
  utf8(value) && value.length <= 150000 && Buffer.byteLength(value) <= 512 * 1024;
export function validScheduledDate(value) {
  if (value === null) return true;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return (
    year >= 1 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
  );
}
export const statuses = ['planned', 'running', 'completed'];
export function form(data) {
  const title = typeof data.title === 'string' ? data.title.trim() : data.title;
  if (
    !validTitle(title) ||
    !validSummary(data.summary) ||
    !validScheduledDate(data.scheduledDate) ||
    !statuses.includes(data.status)
  )
    fail('invalid-argument', 'Título, preparação, data ou estado inválido.');
  return { title, scheduledDate: data.scheduledDate, status: data.status, summary: data.summary };
}
export async function sessionContext(tx, db, uid, data, keys, optionalToken = false) {
  if (!uid) fail('unauthenticated', 'Entre na sua conta.');
  closed(data, ['campaignId', 'campaignToken', ...keys]);
  const campaignId = id(data.campaignId),
    path = 'campaigns/' + campaignId;
  await assertCampaignNotDeleted(tx, db, uid, campaignId);
  const snapshot = await readWorkMetadata(tx, db.doc(path), [
    'ownerId',
    'deleting',
    'schemaVersion',
    'revision',
    'provenance',
    'activeBaseId',
  ]);
  availableCampaign(snapshot.data(), uid);
  const campaignToken = campaignIdentityToken(uid, campaignId, snapshot);
  if (
    (!optionalToken || data.campaignToken !== undefined) &&
    token(data.campaignToken) !== campaignToken
  )
    campaignChanged();
  const controlRef = db.doc(path + '/sessionState/current'),
    control = (await tx.get(controlRef)).data();
  let collectionRevision = 0,
    nextOrder = 1;
  if (control) {
    if (
      control.ownerId !== uid ||
      control.campaignId !== campaignId ||
      control.campaignToken !== campaignToken
    )
      campaignChanged();
    if (control.schemaVersion !== 1 || !safe(control.revision) || !safe(control.nextOrder, 1))
      inconsistent();
    collectionRevision = control.revision;
    nextOrder = control.nextOrder;
  } else if (
    (
      await tx.get(
        db
          .collection(path + '/sessions')
          .orderBy('__name__')
          .limit(1)
          .select(),
      )
    ).docs.length
  )
    inconsistent();
  return { uid, campaignId, campaignToken, path, controlRef, collectionRevision, nextOrder };
}
export const envelope = (c) => ({
  schemaVersion: 1,
  ownerId: c.uid,
  campaignId: c.campaignId,
  campaignToken: c.campaignToken,
  collectionRevision: c.collectionRevision,
});
export function storedSession(value, c, sessionId) {
  if (!value) return null;
  if (value.ownerId !== c.uid || value.campaignId !== c.campaignId)
    fail('not-found', 'Sessão indisponível.');
  if (value.campaignToken !== c.campaignToken) campaignChanged();
  if (
    value.schemaVersion !== 1 ||
    value.id !== sessionId ||
    !safe(value.revision, 1) ||
    value.revision > c.collectionRevision ||
    !safe(value.order, 1) ||
    value.order >= c.nextOrder ||
    typeof value.deleted !== 'boolean' ||
    ![value.createdAt, value.updatedAt].every((v) => safe(v) && v <= 8640000000000000) ||
    value.updatedAt < value.createdAt
  )
    inconsistent();
  if (
    !value.deleted &&
    (!validTitle(value.title) ||
      !validScheduledDate(value.scheduledDate) ||
      !statuses.includes(value.status))
  )
    inconsistent();
  return value;
}
export function sessionSummary(value) {
  return {
    id: value.id,
    schemaVersion: 1,
    ownerId: value.ownerId,
    campaignId: value.campaignId,
    revision: value.revision,
    order: value.order,
    title: value.title,
    scheduledDate: value.scheduledDate,
    status: value.status,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}
export function sessionView(value) {
  if (!validSummary(value.summary)) inconsistent();
  return { ...sessionSummary(value), summary: value.summary };
}
export const readSessionMetadata = async (tx, ref, c, sessionId) =>
  storedSession((await readWorkMetadata(tx, ref, sessionFields)).data(), c, sessionId);
export function bounded(value) {
  if (Buffer.byteLength(JSON.stringify(value)) > SESSION_BYTES)
    fail('resource-exhausted', 'A resposta ultrapassa o orçamento de leitura.');
  return value;
}
export const encodeCursor = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
export function decodeCursor(value, c) {
  if (value == null) return null;
  let parsed;
  try {
    if (typeof value !== 'string' || value.length > 12000 || !/^[A-Za-z0-9_-]+$/.test(value))
      throw new Error();
    parsed = JSON.parse(Buffer.from(value, 'base64url').toString());
  } catch {
    fail('invalid-argument', 'Página inválida.');
  }
  closed(parsed, [
    'version',
    'uid',
    'campaignId',
    'campaignToken',
    'collectionRevision',
    'order',
    'id',
  ]);
  if (
    parsed.version !== 1 ||
    typeof parsed.uid !== 'string' ||
    !parsed.uid ||
    !safe(parsed.collectionRevision) ||
    !safe(parsed.order, 1)
  )
    fail('invalid-argument', 'Página inválida.');
  id(parsed.campaignId);
  id(parsed.id);
  token(parsed.campaignToken);
  if (
    parsed.uid !== c.uid ||
    parsed.campaignId !== c.campaignId ||
    parsed.campaignToken !== c.campaignToken ||
    parsed.collectionRevision !== c.collectionRevision
  )
    cursorChanged();
  return parsed;
}
export function validateReceipt(value, c, input, action, fingerprint) {
  if (value.fingerprint !== fingerprint)
    fail('invalid-argument', 'Operação usada com outro pedido.');
  const r = value.receipt;
  if (
    value.schemaVersion !== 1 ||
    value.ownerId !== c.uid ||
    value.campaignId !== c.campaignId ||
    value.campaignToken !== c.campaignToken ||
    !r ||
    Object.keys(r).length !== 6 ||
    r.operationId !== input.operationId ||
    r.action !== action ||
    r.sessionId !== input.sessionId ||
    r.expectedRevision !== input.expectedRevision ||
    !safe(r.revision, 1) ||
    r.revision !== input.expectedRevision + 1 ||
    !safe(r.collectionRevision, 1) ||
    r.collectionRevision > c.collectionRevision ||
    (action === 'move' && r.collectionRevision !== input.expectedCollectionRevision + 1) ||
    typeof value.confirmationHash !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.confirmationHash)
  )
    inconsistent();
  return r;
}
