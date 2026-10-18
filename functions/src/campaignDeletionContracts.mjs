import { validateId } from './generation.mjs';
import {
  workClosed,
  workFail,
  workId,
  workRevision,
  workDate,
  digest,
} from './workProgressContracts.mjs';
import { meteredTransaction } from './campaignAdoptionContracts.mjs';
export {
  workClosed as closed,
  workFail as fail,
  workId as id,
  workRevision as revision,
  workDate as date,
  digest,
  meteredTransaction,
};
export const deletionPath = (uid, deletionId) => `users/${uid}/campaignDeletions/${deletionId}`;
export const deletionOperationPath = (uid, operationId) =>
  `users/${uid}/campaignDeletionOperations/${operationId}`;
export const deletionFencePath = (uid, operationId) =>
  `users/${uid}/campaignDeletionStartFences/${operationId}`;
export const deletionPhases = [
  'recovery',
  'controls',
  'bases',
  'lore-generations',
  'campaign-children',
  'activity',
  'finalizing',
  'complete',
];
export const hash = (value) => {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
    workFail('invalid-argument', 'Identidade inválida.');
  return value;
};
export function scope(uid, data, fields) {
  if (!uid) workFail('unauthenticated', 'Entre na sua conta.');
  workId(uid);
  workClosed(data, fields);
}
export const startFields = ['campaignId', 'campaignToken', 'expectedRevision', 'operationId'];
export function startInput(uid, data) {
  scope(uid, data, startFields);
  const expectedRevision = workRevision(data.expectedRevision);
  if (!expectedRevision) workFail('invalid-argument', 'Revisão inválida.');
  return {
    campaignId: workId(data.campaignId),
    campaignToken: hash(data.campaignToken),
    expectedRevision,
    operationId: validateId(data.operationId),
  };
}
export function identity(p) {
  return {
    schemaVersion: 1,
    ownerId: p.ownerId,
    campaignId: p.campaignId,
    campaignToken: p.campaignToken,
    deletionId: p.deletionId,
  };
}
export function progress(p) {
  if (
    !p ||
    p.schemaVersion !== 1 ||
    !deletionPhases.includes(p.phase) ||
    ![p.ownerId, p.campaignId, p.deletionId].every(
      (v) => typeof v === 'string' && v && !v.includes('/'),
    ) ||
    typeof p.campaignToken !== 'string' ||
    !/^[a-f0-9]{64}$/.test(p.campaignToken) ||
    ![p.createdAt, p.updatedAt].every(
      (v) => Number.isSafeInteger(v) && v >= 0 && v <= 8640000000000000,
    ) ||
    p.updatedAt < p.createdAt ||
    !['deleting', 'deleted'].includes(p.state) ||
    !Number.isSafeInteger(p.checkpoint) ||
    p.checkpoint < 0 ||
    (p.state === 'deleted') !== (p.phase === 'complete')
  )
    workFail('failed-precondition', 'A exclusão está inconsistente.');
  return {
    ...identity(p),
    state: p.state,
    phase: p.phase,
    checkpoint: p.checkpoint,
    complete: p.state === 'deleted',
    revoked: true,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}
export function owned(p, uid, deletionId) {
  if (!p || p.ownerId !== uid) workFail('not-found', 'Exclusão indisponível.');
  if (p.deletionId !== deletionId)
    workFail('failed-precondition', 'A identidade da exclusão mudou.');
  const dto = progress(p);
  if (p.state === 'deleted') {
    if (
      Object.keys(p).some((key) => !Object.hasOwn(dto, key)) ||
      p.complete !== true ||
      p.revoked !== true
    )
      workFail('failed-precondition', 'O registro terminal está inconsistente.');
    return p;
  }
  const internal = ['part', 'cursor', 'childId', 'childPart', 'childCursor', 'certified'],
    nullableId = (value) =>
      value === null ||
      (typeof value === 'string' &&
        value.length > 0 &&
        !value.includes('/') &&
        Buffer.byteLength(value) <= 1500),
    maxima = {
      recovery: 3,
      controls: 4,
      bases: 0,
      'lore-generations': 0,
      'campaign-children': 7,
      activity: 0,
      finalizing: 0,
    },
    phaseIndex = deletionPhases.indexOf(p.phase);
  if (
    Object.keys(p).some((key) => !Object.hasOwn(dto, key) && !internal.includes(key)) ||
    !internal.every((key) => Object.hasOwn(p, key)) ||
    !Number.isSafeInteger(p.part) ||
    p.part < 0 ||
    p.part > maxima[p.phase] ||
    !nullableId(p.cursor) ||
    !nullableId(p.childId) ||
    !nullableId(p.childCursor) ||
    !Number.isSafeInteger(p.childPart) ||
    p.childPart < 0 ||
    !Array.isArray(p.certified) ||
    digest(p.certified) !== digest(deletionPhases.slice(0, phaseIndex)) ||
    (p.childId === null && (p.childPart !== 0 || p.childCursor !== null)) ||
    (p.childId !== null && !['controls', 'bases', 'lore-generations'].includes(p.phase)) ||
    (p.phase === 'controls' && p.childId !== null && (p.part !== 2 || p.childPart > 1)) ||
    (p.phase === 'bases' && p.childPart > 4) ||
    (p.phase === 'lore-generations' && p.childPart > 1) ||
    (p.childCursor !== null && !(p.phase === 'controls' && p.part === 2 && p.childPart === 1)) ||
    (p.cursor !== null && !['recovery', 'controls'].includes(p.phase))
  )
    workFail('failed-precondition', 'O checkpoint interno da exclusão está inconsistente.');
  return p;
}
export const fingerprint = (action, input) => digest({ action, input });
export function prior(value, uid, fingerprint) {
  if (!value) return null;
  if (value.schemaVersion !== 1 || value.ownerId !== uid)
    workFail('failed-precondition', 'Recibo inconsistente.');
  if (value.fingerprint !== fingerprint)
    workFail('invalid-argument', 'Operação usada com outro pedido.');
  return value;
}
export function next(p, now, patch = {}) {
  return {
    ...p,
    ...patch,
    checkpoint: workRevision(p.checkpoint + 1),
    updatedAt: workDate(now, p.updatedAt),
  };
}
export const checkpointConflict = () =>
  workFail(
    'failed-precondition',
    'O progresso mudou. Consulte a exclusão antes de continuar.',
    'checkpoint-conflict',
  );
