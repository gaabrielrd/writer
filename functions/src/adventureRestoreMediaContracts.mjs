import {
  authorize,
  closed,
  restoreId,
  restoreHash,
  mutationInput,
  requestHash,
  inconsistent,
  restoreFail,
} from './adventureRestoreContracts.mjs';
import { bookRestoreStorageProof } from './bookRestoreCoverStorageContracts.mjs';
export const MEDIA_ACTION = 'advanceAdventureRestoreMedia';
export const mediaFingerprint = (request) => requestHash(MEDIA_ACTION, request);
export function mediaRequest(uid, input, mutate = false) {
  authorize(uid);
  if (mutate) return Object.freeze(mutationInput(input));
  closed(input, ['restoreId', 'jobToken']);
  return { restoreId: restoreId(input.restoreId), jobToken: restoreHash(input.jobToken) };
}
export function assertMediaPhase(loaded) {
  if (loaded.job.state !== 'activated') restoreFail('failed-precondition', 'media-phase-conflict');
}
const count = (n) => Number.isSafeInteger(n) && n >= 0;
export const mediaIdentity = (l) => ({
  schemaVersion: 1,
  ownerId: l.uid,
  restoreId: l.id,
  jobToken: l.view.jobToken,
  adventureId: l.job.adventureId,
  activationOperationId: l.job.activation.operationId,
});
const identityFields = [
  'schemaVersion',
  'ownerId',
  'restoreId',
  'jobToken',
  'adventureId',
  'activationOperationId',
];
function identity(value, loaded) {
  const expected = mediaIdentity(loaded);
  if (identityFields.some((k) => value[k] !== expected[k])) inconsistent();
}
export function initialMediaControl(l) {
  return {
    ...mediaIdentity(l),
    checkpoint: 0,
    processed: 0,
    ready: 0,
    unavailable: 0,
    total: l.job.staging.imageAssets,
    cursor: null,
    complete: false,
    firstOperationId: null,
    lastOperationId: null,
    updatedAt: l.job.activation.activatedAt,
  };
}
export function validateMediaControl(v, l) {
  closed(v, [
    ...identityFields,
    'checkpoint',
    'processed',
    'ready',
    'unavailable',
    'total',
    'cursor',
    'complete',
    'firstOperationId',
    'lastOperationId',
    'updatedAt',
  ]);
  identity(v, l);
  if (
    !['checkpoint', 'processed', 'ready', 'unavailable', 'total', 'updatedAt'].every((k) =>
      count(v[k]),
    ) ||
    typeof v.complete !== 'boolean' ||
    v.total !== l.job.staging.imageAssets ||
    v.processed !== v.ready + v.unavailable ||
    v.processed > v.total ||
    v.checkpoint !== v.processed + Number(v.complete) ||
    (v.complete && v.processed !== v.total) ||
    (v.processed === 0 ? v.cursor !== null : !/^image-storage-[a-f0-9]{64}$/.test(v.cursor)) ||
    v.updatedAt < l.job.activation.activatedAt ||
    v.updatedAt > 8640000000000000
  )
    inconsistent();
  if (v.checkpoint === 0) {
    if (
      v.firstOperationId !== null ||
      v.lastOperationId !== null ||
      v.updatedAt !== l.job.activation.activatedAt
    )
      inconsistent();
  } else {
    restoreId(v.firstOperationId);
    restoreId(v.lastOperationId);
    if (v.updatedAt <= l.job.activation.activatedAt) inconsistent();
  }
  return v;
}
export function validateMediaOutcome(v, l) {
  closed(v, [
    ...identityFields,
    'operationId',
    'checkpoint',
    'assetId',
    'imageId',
    'state',
    'sourceProof',
    'storageProof',
    'urlHash',
    'completedAt',
  ]);
  identity(v, l);
  restoreId(v.operationId);
  restoreHash(v.assetId);
  if (
    !/^restore-[a-f0-9]{64}$/.test(v.imageId) ||
    !['ready', 'unavailable'].includes(v.state) ||
    !count(v.checkpoint) ||
    v.checkpoint < 1 ||
    v.checkpoint > l.job.staging.imageAssets ||
    !count(v.completedAt) ||
    v.completedAt <= l.job.activation.activatedAt ||
    v.completedAt > 8640000000000000
  )
    inconsistent();
  try {
    bookRestoreStorageProof(v.sourceProof);
    bookRestoreStorageProof(v.storageProof);
  } catch {
    inconsistent();
  }
  if (v.state === 'ready') {
    if (
      v.storageProof.generation !== v.sourceProof.generation ||
      v.storageProof.metageneration !== String(BigInt(v.sourceProof.metageneration) + 1n)
    )
      inconsistent();
    restoreHash(v.urlHash);
  } else if (v.storageProof.generation === v.sourceProof.generation || v.urlHash !== null)
    inconsistent();
  return v;
}
export const mediaView = (c) => ({
  checkpoint: c.checkpoint,
  total: c.total,
  processed: c.processed,
  ready: c.ready,
  unavailable: c.unavailable,
  complete: c.complete,
});
