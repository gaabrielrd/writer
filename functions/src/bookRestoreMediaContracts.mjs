import { digest } from './sceneContracts.mjs';
import {
  closed,
  inconsistent,
  restoreId,
  restoreHash,
  authorize,
  restoreFail as fail,
} from './bookRestoreUploadContracts.mjs';
import { bookRestoreStorageProof } from './bookRestoreCoverStorageContracts.mjs';
export function bookRestoreMediaRequest(uid, input, mutate = false) {
  authorize(uid);
  closed(input, ['restoreId', 'jobToken', ...(mutate ? ['operationId'] : [])]);
  return {
    restoreId: restoreId(input.restoreId),
    jobToken: restoreHash(input.jobToken),
    ...(mutate ? { operationId: restoreId(input.operationId) } : {}),
  };
}
export const bookRestoreMediaFingerprint = (uid, r) =>
  digest({ schemaVersion: 1, action: 'finalizeBookRestoreMedia', ownerId: uid, ...r });
export const mediaOrigin = (loaded) => ({
  schemaVersion: 1,
  restoreId: loaded.job.restoreId,
  jobToken: loaded.view.jobToken,
  activationOperationId: loaded.job.activation.operationId,
  bookId: loaded.job.bookId,
});
export function assertBookRestoreMediaPhase(loaded) {
  if (loaded.job.state !== 'activated') fail('failed-precondition', 'media-phase-conflict');
}
export function validateBookRestoreMediaOutcome(value, loaded) {
  closed(value, [
    'schemaVersion',
    'ownerId',
    'restoreId',
    'jobToken',
    'bookId',
    'activationOperationId',
    'operationId',
    'state',
    'imageId',
    'sourceProof',
    'storageProof',
    'urlHash',
    'rootUpdated',
    'completedAt',
  ]);
  const j = loaded.job,
    library = j.preparation.cover.kind === 'library';
  if (
    value.schemaVersion !== 1 ||
    value.ownerId !== j.ownerId ||
    value.restoreId !== j.restoreId ||
    value.jobToken !== loaded.view.jobToken ||
    value.bookId !== j.bookId ||
    value.activationOperationId !== j.activation.operationId ||
    value.state !== (library ? 'ready' : 'none') ||
    value.imageId !== (library ? j.preparation.cover.imageId : null) ||
    typeof value.rootUpdated !== 'boolean' ||
    !Number.isSafeInteger(value.completedAt) ||
    value.completedAt < j.activation.activatedAt ||
    !Number.isFinite(new Date(value.completedAt).getTime())
  )
    inconsistent();
  restoreId(value.operationId);
  if (library) {
    bookRestoreStorageProof(value.sourceProof);
    bookRestoreStorageProof(value.storageProof);
    if (
      digest(value.sourceProof) !== digest(j.preparation.coverStorage.proof) ||
      value.sourceProof.generation !== value.storageProof.generation ||
      value.storageProof.metageneration !== String(BigInt(value.sourceProof.metageneration) + 1n)
    )
      inconsistent();
    restoreHash(value.urlHash);
  } else if (
    value.sourceProof !== null ||
    value.storageProof !== null ||
    value.urlHash !== null ||
    value.rootUpdated
  )
    inconsistent();
  return value;
}
export function validateBookRestoreAcceptedMedia(value, pending) {
  closed(value, ['proof', 'url']);
  bookRestoreStorageProof(value.proof);
  if (
    value.proof.generation !== pending.sourceProof.generation ||
    value.proof.metageneration !== String(BigInt(pending.sourceProof.metageneration) + 1n) ||
    typeof value.url !== 'string' ||
    value.url.length > 2048
  )
    inconsistent();
  let url;
  try {
    url = new URL(value.url);
  } catch {
    inconsistent();
  }
  if (
    url.origin !== 'https://firebasestorage.googleapis.com' ||
    url.hash ||
    url.username ||
    url.password ||
    !url.pathname.startsWith('/v0/b/') ||
    url.pathname.slice(url.pathname.indexOf('/o/') + 3) !== encodeURIComponent(pending.path) ||
    !/^\/v0\/b\/[^/]+\/o\//.test(url.pathname) ||
    url.searchParams.get('alt') !== 'media' ||
    [...url.searchParams.keys()].length !== 2 ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
      url.searchParams.get('token') ?? '',
    )
  )
    inconsistent();
  return value;
}
