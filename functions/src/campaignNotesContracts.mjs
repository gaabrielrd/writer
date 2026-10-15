import { validateId } from './generation.mjs';
import { availableCampaign } from './campaigns.mjs';
import {
  workClosed,
  workFail,
  workId,
  workRevision,
  digest,
  readWorkMetadata,
} from './workProgressContracts.mjs';

export { workClosed as closed, workFail as fail, workId as id, workRevision as revision, digest };
export const NOTES_BYTES = 4 * 1024 * 1024;
export const noteMetadata = [
  'id',
  'schemaVersion',
  'ownerId',
  'campaignId',
  'campaignToken',
  'revision',
  'deleted',
  'createdAt',
  'updatedAt',
];
export const campaignChanged = () =>
  workFail(
    'failed-precondition',
    'A campanha mudou. Reabra sem reaplicar o pedido antigo.',
    'campaign-changed',
  );
export const notesCursorChanged = () =>
  workFail('failed-precondition', 'As notas mudaram. Recarregue a lista.', 'cursor-invalidated');
export function notesToken(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
    workFail('invalid-argument', 'Identidade da campanha inválida.');
  return value;
}
export function validNoteDate(value) {
  return (
    typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 8640000000000000
  );
}
export function validNoteContent(value) {
  return (
    typeof value === 'string' &&
    value.length <= 150000 &&
    Buffer.byteLength(value) <= 512 * 1024 &&
    Buffer.from(value).toString('utf8') === value
  );
}
export function validNoteTitle(value) {
  return (
    typeof value === 'string' &&
    !!value.trim() &&
    value.length <= 300 &&
    Buffer.from(value).toString('utf8') === value
  );
}
export async function notesContext(tx, db, uid, data, keys, optionalToken = false) {
  if (!uid) workFail('unauthenticated', 'Entre na sua conta.');
  workClosed(data, ['campaignId', 'campaignToken', ...keys]);
  const campaignId = workId(data.campaignId),
    path = 'campaigns/' + campaignId,
    ref = db.doc(path),
    snapshot = await tx.get(ref);
  const campaign = availableCampaign(snapshot.data(), uid);
  if (
    campaign.provenance.kind === 'original' &&
    (!campaign.provenance.adventureId ||
      campaign.provenance.adventureId.includes('/') ||
      !/^[a-f0-9]{64}$/.test(campaign.activeBaseId))
  )
    workFail('failed-precondition', 'A procedência da campanha está inconsistente.');
  const stamp = snapshot.createTime;
  if (
    !stamp ||
    !Number.isSafeInteger(stamp.seconds) ||
    !Number.isInteger(stamp.nanoseconds) ||
    stamp.nanoseconds < 0 ||
    stamp.nanoseconds >= 1e9
  )
    workFail('failed-precondition', 'Não foi possível conferir a identidade da campanha.');
  const campaignToken = digest({
    version: 1,
    uid,
    campaignId,
    createTime: { seconds: stamp.seconds, nanoseconds: stamp.nanoseconds },
  });
  if (!optionalToken || data.campaignToken !== undefined)
    if (notesToken(data.campaignToken) !== campaignToken) campaignChanged();
  const controlRef = db.doc(path + '/noteState/current'),
    control = (await tx.get(controlRef)).data();
  let collectionRevision = 0;
  if (control) {
    if (
      control.ownerId !== uid ||
      control.campaignId !== campaignId ||
      control.campaignToken !== campaignToken
    )
      campaignChanged();
    if (
      control.schemaVersion !== 1 ||
      !Number.isSafeInteger(control.revision) ||
      control.revision < 0
    )
      workFail('failed-precondition', 'O controle das notas está inconsistente.');
    collectionRevision = control.revision;
  } else if (
    (
      await tx.get(
        db
          .collection(path + '/notes')
          .orderBy('__name__')
          .limit(1)
          .select(),
      )
    ).docs.length
  )
    workFail('failed-precondition', 'O controle das notas está ausente.');
  return { uid, campaignId, campaignToken, collectionRevision, path, controlRef };
}
export const notesEnvelope = (context) => ({
  ownerId: context.uid,
  campaignId: context.campaignId,
  schemaVersion: 1,
  campaignToken: context.campaignToken,
  collectionRevision: context.collectionRevision,
});
export function validateStoredNote(value, context, noteId) {
  if (!value) return null;
  if (value.ownerId !== context.uid || value.campaignId !== context.campaignId)
    workFail('not-found', 'Nota indisponível.');
  if (value.campaignToken !== context.campaignToken) campaignChanged();
  if (
    value.id !== noteId ||
    value.schemaVersion !== 1 ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 1 ||
    typeof value.deleted !== 'boolean' ||
    !validNoteDate(value.createdAt) ||
    !validNoteDate(value.updatedAt) ||
    value.updatedAt < value.createdAt
  )
    workFail('failed-precondition', 'A nota está inconsistente.');
  return value;
}
export async function readNoteMetadata(tx, ref, context, noteId) {
  return validateStoredNote(
    (await readWorkMetadata(tx, ref, noteMetadata)).data(),
    context,
    noteId,
  );
}
export function noteView(value) {
  if (!validNoteTitle(value.title) || !validNoteContent(value.content))
    workFail('failed-precondition', 'O texto da nota está inconsistente.');
  return {
    id: value.id,
    ownerId: value.ownerId,
    campaignId: value.campaignId,
    schemaVersion: 1,
    revision: value.revision,
    title: value.title,
    content: value.content,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}
export const noteSummary = (value) => ({
  id: value.id,
  title: value.title,
  revision: value.revision,
  createdAt: value.createdAt,
  updatedAt: value.updatedAt,
});
export function tombstoneHash(value) {
  return digest(Object.fromEntries(noteMetadata.map((field) => [field, value[field]])));
}
export const encodeNotesCursor = (value) =>
  Buffer.from(JSON.stringify(value)).toString('base64url');
export function decodeNotesCursor(value, context) {
  if (value == null) return null;
  let parsed;
  try {
    if (typeof value !== 'string' || value.length > 12000 || !/^[A-Za-z0-9_-]+$/.test(value))
      throw new Error();
    parsed = JSON.parse(Buffer.from(value, 'base64url').toString());
  } catch {
    workFail('invalid-argument', 'Página inválida.');
  }
  workClosed(parsed, [
    'version',
    'uid',
    'campaignId',
    'campaignToken',
    'collectionRevision',
    'createdAt',
    'id',
  ]);
  if (
    parsed.version !== 1 ||
    !validNoteDate(parsed.createdAt) ||
    !Number.isSafeInteger(parsed.collectionRevision) ||
    parsed.collectionRevision < 0 ||
    typeof parsed.uid !== 'string' ||
    typeof parsed.campaignId !== 'string'
  )
    workFail('invalid-argument', 'Página inválida.');
  notesToken(parsed.campaignToken);
  validateId(parsed.id);
  if (
    parsed.uid !== context.uid ||
    parsed.campaignId !== context.campaignId ||
    parsed.campaignToken !== context.campaignToken ||
    parsed.collectionRevision !== context.collectionRevision
  )
    notesCursorChanged();
  return parsed;
}
