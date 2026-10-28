import { validateId } from './generation.mjs';
import { digest, workClosed, workFail, workId } from './workProgressContracts.mjs';

export { digest };
export const ADVENTURE_DELETION_VERSION = 1;
export const ADVENTURE_DELETION_PHASES = Object.freeze([
  'quiescence',
  'media',
  'images',
  'children',
  'controls',
  'activity',
  'verify',
  'complete',
]);
export const ADVENTURE_DELETION_JOB_FIELDS = Object.freeze([
  'schemaVersion',
  'cleanupVersion',
  'ownerId',
  'adventureId',
  'adventureToken',
  'sourceToken',
  'expectedRevision',
  'title',
  'deletionId',
  'startFingerprint',
  'state',
  'phase',
  'checkpoint',
  'createdAt',
  'updatedAt',
  'lastOperationId',
  'lastRequestHash',
  'part',
  'cursor',
  'parentId',
  'childPart',
  'childCursor',
  'certified',
  'deletedDocuments',
]);
export const ADVENTURE_DELETION_OPERATION_FIELDS = Object.freeze([
  'schemaVersion',
  'ownerId',
  'deletionId',
  'fingerprint',
  'receipt',
  'jobHash',
]);
export const ADVENTURE_DELETION_OPERATION_READ_FIELDS = Object.freeze([
  'schemaVersion',
  'ownerId',
  'deletionId',
  'fingerprint',
  'jobHash',
  'receipt.operationId',
  'receipt.action',
  'receipt.expectedCheckpoint',
  'receipt.confirmedCheckpoint',
]);
export const ADVENTURE_DELETION_FENCE_FIELDS = Object.freeze([
  'schemaVersion',
  'ownerId',
  'fingerprint',
]);
export const adventureDeletionPath = (uid, id) => 'users/' + uid + '/adventureDeletions/' + id;
export const adventureDeletionOperationPath = (uid, id) =>
  'users/' + uid + '/adventureDeletionOperations/' + id;
export const adventureDeletionFencePath = (uid, id) =>
  'users/' + uid + '/adventureDeletionStartFences/' + id;
export const adventureDeletionInconsistent = () =>
  workFail(
    'failed-precondition',
    'A exclusão da aventura está inconsistente.',
    'adventure-deletion-inconsistent',
  );
const hashValue = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const integer = (v) => Number.isSafeInteger(v) && v >= 0;
const date = (v) => integer(v) && v <= 8640000000000000;
const nativeId = (v) =>
  typeof v === 'string' &&
  v.length > 0 &&
  v.isWellFormed() &&
  Buffer.byteLength(v) <= 1500 &&
  !v.includes('/') &&
  !['.', '..'].includes(v);
const nullableId = (v) => v === null || nativeId(v);
const exact = (v, keys) =>
  !!v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.keys(v).length === keys.length &&
  keys.every((k) => Object.hasOwn(v, k));
export function adventureDeletionScope(uid, data, keys) {
  if (!uid) workFail('unauthenticated', 'Entre na sua conta.');
  workId(uid);
  workClosed(data, keys);
}
export function adventureDeletionHash(value) {
  if (!hashValue(value)) workFail('invalid-argument', 'Identidade da exclusão inválida.');
  return value;
}
export const ADVENTURE_DELETION_START_FIELDS = Object.freeze([
  'adventureId',
  'adventureToken',
  'sourceToken',
  'expectedRevision',
  'operationId',
]);
export function adventureDeletionStartInput(uid, data) {
  adventureDeletionScope(uid, data, ADVENTURE_DELETION_START_FIELDS);
  if (!integer(data.expectedRevision) || data.expectedRevision < 1)
    workFail('invalid-argument', 'Revisão inválida.');
  return {
    adventureId: workId(data.adventureId),
    adventureToken: adventureDeletionHash(data.adventureToken),
    sourceToken: adventureDeletionHash(data.sourceToken),
    expectedRevision: data.expectedRevision,
    operationId: validateId(data.operationId),
  };
}
export const adventureDeletionFingerprint = (action, input) =>
  digest({ domain: 'writer-adventure-deletion-v1', action, input });
export function adventureDeletionBorn(snapshot, updated = false) {
  const stamp = snapshot?.[updated ? 'updateTime' : 'createTime'];
  if (!stamp || !integer(stamp.seconds) || !integer(stamp.nanoseconds) || stamp.nanoseconds >= 1e9)
    adventureDeletionInconsistent();
  return { seconds: stamp.seconds, nanoseconds: stamp.nanoseconds };
}
export const adventureDeletionSameBirth = (a, b) =>
  digest(adventureDeletionBorn(a)) === digest(adventureDeletionBorn(b));
export function adventureDeletionImmutable(snapshot) {
  if (!adventureDeletionSameBirth(snapshot, { createTime: snapshot?.updateTime }))
    adventureDeletionInconsistent();
}
export function adventureDeletionJobToken(p, snapshot) {
  return digest({
    domain: 'writer-adventure-deletion-job-v1',
    ownerId: p.ownerId,
    adventureId: p.adventureId,
    adventureToken: p.adventureToken,
    deletionId: p.deletionId,
    startFingerprint: p.startFingerprint,
    born: adventureDeletionBorn(snapshot),
  });
}
export function adventureDeletionIdentity(p) {
  return {
    schemaVersion: 1,
    ownerId: p.ownerId,
    adventureId: p.adventureId,
    adventureToken: p.adventureToken,
    deletionId: p.deletionId,
  };
}
export function adventureDeletionOwned(value, uid, id) {
  if (!value || value.ownerId !== uid) workFail('not-found', 'Exclusão indisponível.');
  const p = value,
    phaseIndex = ADVENTURE_DELETION_PHASES.indexOf(p.phase);
  if (
    !exact(p, ADVENTURE_DELETION_JOB_FIELDS) ||
    p.schemaVersion !== 1 ||
    p.cleanupVersion !== ADVENTURE_DELETION_VERSION ||
    p.deletionId !== id ||
    ![p.ownerId, p.adventureId, p.deletionId, p.lastOperationId].every(nativeId) ||
    ![p.adventureToken, p.sourceToken, p.startFingerprint, p.lastRequestHash].every(hashValue) ||
    !integer(p.expectedRevision) ||
    p.expectedRevision < 1 ||
    typeof p.title !== 'string' ||
    !p.title.trim() ||
    p.title.length > 300 ||
    !p.title.isWellFormed() ||
    !['deleting', 'deleted'].includes(p.state) ||
    phaseIndex < 0 ||
    (p.state === 'deleted') !== (p.phase === 'complete') ||
    !integer(p.checkpoint) ||
    ![p.createdAt, p.updatedAt].every(date) ||
    p.updatedAt < p.createdAt ||
    !integer(p.part) ||
    p.part > 128 ||
    !integer(p.childPart) ||
    p.childPart > 128 ||
    !integer(p.deletedDocuments) ||
    ![p.cursor, p.parentId, p.childCursor].every(nullableId) ||
    !Array.isArray(p.certified) ||
    digest(p.certified) !== digest(ADVENTURE_DELETION_PHASES.slice(0, phaseIndex)) ||
    (p.parentId === null && (p.childPart !== 0 || p.childCursor !== null))
  )
    adventureDeletionInconsistent();
  const request = {
    adventureId: p.adventureId,
    adventureToken: p.adventureToken,
    sourceToken: p.sourceToken,
    expectedRevision: p.expectedRevision,
    operationId: p.deletionId,
  };
  if (
    adventureDeletionFingerprint('start', request) !== p.startFingerprint ||
    (p.checkpoint === 0 &&
      (p.lastOperationId !== p.deletionId ||
        p.lastRequestHash !== p.startFingerprint ||
        p.phase !== 'quiescence' ||
        p.updatedAt !== p.createdAt ||
        p.part !== 0 ||
        p.cursor !== null ||
        p.parentId !== null ||
        p.deletedDocuments !== 0))
  )
    adventureDeletionInconsistent();
  return p;
}
export function adventureDeletionProgress(p, snapshot) {
  return {
    ...adventureDeletionIdentity(p),
    deletionToken: adventureDeletionJobToken(p, snapshot),
    title: p.title,
    state: p.state,
    phase: p.phase,
    checkpoint: p.checkpoint,
    deletedDocuments: p.deletedDocuments,
    complete: p.state === 'deleted',
    revoked: true,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}
export function adventureDeletionOperation(snapshot, uid, fingerprint) {
  if (!snapshot.exists) return null;
  const v = snapshot.data();
  if (
    !exact(v, ADVENTURE_DELETION_OPERATION_FIELDS) ||
    v.schemaVersion !== 1 ||
    v.ownerId !== uid ||
    !nativeId(v.deletionId) ||
    !hashValue(v.fingerprint) ||
    !hashValue(v.jobHash) ||
    !exact(v.receipt, ['operationId', 'action', 'expectedCheckpoint', 'confirmedCheckpoint'])
  )
    adventureDeletionInconsistent();
  adventureDeletionImmutable(snapshot);
  const r = v.receipt;
  if (
    r.operationId !== snapshot.id ||
    !['start', 'advance'].includes(r.action) ||
    !integer(r.confirmedCheckpoint) ||
    (r.action === 'start'
      ? r.expectedCheckpoint !== null || r.confirmedCheckpoint !== 0 || v.deletionId !== snapshot.id
      : !integer(r.expectedCheckpoint) || r.confirmedCheckpoint !== r.expectedCheckpoint + 1)
  )
    adventureDeletionInconsistent();
  if (fingerprint !== undefined && v.fingerprint !== fingerprint)
    workFail('invalid-argument', 'Operação usada com outros dados.');
  return v;
}
export function adventureDeletionFence(snapshot, uid, fingerprint) {
  if (!snapshot.exists) return null;
  const v = snapshot.data();
  if (
    !exact(v, ADVENTURE_DELETION_FENCE_FIELDS) ||
    v.schemaVersion !== 1 ||
    v.ownerId !== uid ||
    !hashValue(v.fingerprint)
  )
    adventureDeletionInconsistent();
  adventureDeletionImmutable(snapshot);
  if (v.fingerprint !== fingerprint)
    workFail('invalid-argument', 'Operação usada com outros dados.');
  return v;
}
export const adventureDeletionCanceled = (uid, input) => ({
  schemaVersion: 1,
  ownerId: uid,
  kind: 'canceled',
  request: input,
});
export function adventureDeletionCursor(value, uid) {
  if (value === undefined || value === null) return null;
  let v;
  try {
    if (typeof value !== 'string' || value.length > 4096 || !/^[A-Za-z0-9_-]+$/.test(value))
      throw Error();
    const raw = Buffer.from(value, 'base64url');
    if (raw.toString('base64url') !== value) throw Error();
    v = JSON.parse(raw.toString('utf8'));
    if (
      !exact(v, ['schemaVersion', 'ownerId', 'createdAt', 'deletionId']) ||
      v.schemaVersion !== 1 ||
      v.ownerId !== uid ||
      !date(v.createdAt) ||
      !nativeId(v.deletionId)
    )
      throw Error();
  } catch {
    workFail('invalid-argument', 'Página de exclusão inválida.');
  }
  return v;
}
export const encodeAdventureDeletionCursor = (uid, p) =>
  Buffer.from(
    JSON.stringify({
      schemaVersion: 1,
      ownerId: uid,
      createdAt: p.createdAt,
      deletionId: p.deletionId,
    }),
  ).toString('base64url');

export function initialAdventureDeletion(uid, input, title, timestamp) {
  return {
    schemaVersion: 1,
    cleanupVersion: ADVENTURE_DELETION_VERSION,
    ownerId: uid,
    adventureId: input.adventureId,
    adventureToken: input.adventureToken,
    sourceToken: input.sourceToken,
    expectedRevision: input.expectedRevision,
    title,
    deletionId: input.operationId,
    startFingerprint: adventureDeletionFingerprint('start', input),
    state: 'deleting',
    phase: 'quiescence',
    checkpoint: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastOperationId: input.operationId,
    lastRequestHash: adventureDeletionFingerprint('start', input),
    part: 0,
    cursor: null,
    parentId: null,
    childPart: 0,
    childCursor: null,
    certified: [],
    deletedDocuments: 0,
  };
}
