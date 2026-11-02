import { BOOK_COVER_LIMITS } from './bookBackupCover.mjs';
import { validateBookRestorePendingRaw } from './bookRestoreHistoryContracts.mjs';
export function validateBookRestoreCover(value) {
  const keys = [
    'schemaVersion',
    'startIndex',
    'kind',
    'imageId',
    'parts',
    'bytes',
    'pending',
    'state',
  ];
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== keys.length ||
    keys.some((k) => !Object.hasOwn(value, k)) ||
    value.schemaVersion !== 1 ||
    !['none', 'legacy-unavailable', 'library'].includes(value.kind) ||
    !['preparing', 'prepared'].includes(value.state) ||
    ['startIndex', 'parts', 'bytes'].some((k) => !Number.isSafeInteger(value[k]) || value[k] < 0)
  )
    throw new TypeError('Invalid private cover progress.');
  if (value.kind === 'library') {
    if (
      typeof value.imageId !== 'string' ||
      !/^restore-[a-f0-9]{64}$/.test(value.imageId) ||
      value.bytes < 8 ||
      value.bytes > BOOK_COVER_LIMITS.imageBytes ||
      value.parts !== Math.ceil(value.bytes / BOOK_COVER_LIMITS.chunkBytes)
    )
      throw new TypeError('Invalid cover counters.');
    if (value.state === 'preparing') {
      validateBookRestorePendingRaw(value.pending);
      if (
        !value.pending ||
        value.pending.id !== value.imageId ||
        value.pending.part !== value.parts ||
        value.pending.bytes !== value.bytes ||
        value.pending.chunkCount !== value.parts ||
        value.bytes !== value.parts * BOOK_COVER_LIMITS.chunkBytes
      )
        throw new TypeError('Invalid pending cover.');
    } else if (value.pending !== null) throw new TypeError('Unexpected pending cover.');
  } else if (
    value.state !== 'prepared' ||
    value.imageId !== null ||
    value.parts !== 0 ||
    value.bytes !== 0 ||
    value.pending !== null
  )
    throw new TypeError('Invalid unavailable cover.');
  return structuredClone(value);
}
