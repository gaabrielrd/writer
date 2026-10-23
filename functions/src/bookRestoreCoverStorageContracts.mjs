import { BOOK_COVER_LIMITS } from './bookBackupCover.mjs';
const closed = (v, keys) =>
  !!v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.keys(v).length === keys.length &&
  keys.every((k) => Object.hasOwn(v, k));
export function bookRestoreStorageProof(value) {
  if (
    !closed(value, ['generation', 'metageneration']) ||
    Object.values(value).some((v) => typeof v !== 'string' || !/^[1-9][0-9]{0,39}$/.test(v))
  )
    throw new TypeError('Invalid restored image generation.');
  return { ...value };
}
export function bookRestoreCoverStorageContext(value) {
  if (
    !closed(value, ['ownerId', 'restoreId', 'jobToken', 'imageId', 'contentHash', 'byteLength']) ||
    ['ownerId', 'restoreId'].some(
      (k) =>
        typeof value[k] !== 'string' ||
        !value[k].isWellFormed() ||
        !value[k].length ||
        value[k].length > 128 ||
        value[k].includes('/') ||
        value[k].includes(String.fromCharCode(92)) ||
        Array.from(value[k]).some((c) => c.charCodeAt(0) < 32),
    ) ||
    !/^restore-[a-f0-9]{64}$/.test(value.imageId) ||
    ['jobToken', 'contentHash'].some(
      (k) => typeof value[k] !== 'string' || !/^[a-f0-9]{64}$/.test(value[k]),
    ) ||
    !Number.isSafeInteger(value.byteLength) ||
    value.byteLength < 8 ||
    value.byteLength > BOOK_COVER_LIMITS.imageBytes
  )
    throw new TypeError('Invalid restored image identity.');
  return { ...value };
}
export function validateBookRestoreCoverStorageProgress(value, kind) {
  if (
    !closed(value, ['schemaVersion', 'state', 'proof', 'fence']) ||
    value.schemaVersion !== 1 ||
    !['reserved', 'prepared'].includes(value.state)
  )
    throw new TypeError('Invalid private image progress.');
  if (value.state === 'reserved' || kind !== 'library') {
    if (value.proof !== null) throw new TypeError('Unexpected image generation.');
  } else bookRestoreStorageProof(value.proof);
  if (value.fence !== null) {
    if (kind === 'library') bookRestoreStorageProof(value.fence);
    else if (!closed(value.fence, ['kind']) || value.fence.kind !== 'none')
      throw new TypeError('Invalid absent image fence.');
  }
  return structuredClone(value);
}
