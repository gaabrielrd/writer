import { validateBookRestorePendingRaw } from './bookRestoreHistoryContracts.mjs';
const closed = (v, keys, optional = []) =>
  v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.keys(v).every((k) => [...keys, ...optional].includes(k)) &&
  keys.every((k) => Object.hasOwn(v, k));
const integer = (v) => Number.isSafeInteger(v) && v >= 0;
export function validateBookRestoreDraft(value) {
  if (
    !closed(
      value,
      [
        'schemaVersion',
        'startIndex',
        'parts',
        'bytes',
        'bodyCount',
        'match',
        'pending',
        'outcome',
        'versionId',
      ],
      ['finalized'],
    ) ||
    value.schemaVersion !== 1 ||
    ['startIndex', 'parts', 'bytes', 'bodyCount'].some((k) => !integer(value[k])) ||
    ![null, true, false].includes(value.match) ||
    !['preparing', 'none', 'saved', 'version'].includes(value.outcome) ||
    (value.versionId !== null &&
      (typeof value.versionId !== 'string' || !/^restore-[a-f0-9]{64}$/.test(value.versionId))) ||
    value.bodyCount > value.parts
  )
    throw new TypeError('Invalid private draft progress.');
  if (value.pending !== null) validateBookRestorePendingRaw(value.pending);
  if (value.outcome === 'preparing') {
    if (
      !value.pending ||
      value.match === null ||
      value.parts !== value.pending.part ||
      value.bytes !== value.pending.bytes ||
      value.pending.id !== value.versionId ||
      value.pending.chunkCount !== value.parts
    )
      throw new TypeError('Invalid pending draft.');
  } else if (value.pending !== null) throw new TypeError('Unexpected pending draft.');
  if (value.outcome === 'none') {
    if (
      value.parts !== 0 ||
      value.bytes !== 0 ||
      value.bodyCount !== 0 ||
      value.match !== null ||
      value.versionId !== null
    )
      throw new TypeError('Invalid absent draft.');
  } else if (
    value.parts < 1 ||
    value.match === null ||
    (value.match ? value.bodyCount !== 0 : value.bodyCount !== value.parts) ||
    (value.outcome === 'saved' && (value.match !== true || value.versionId !== null)) ||
    (value.outcome === 'version' && (value.match !== false || value.versionId === null))
  )
    throw new TypeError('Invalid prepared draft.');
  if (Object.hasOwn(value, 'finalized')) {
    const f = value.finalized;
    if (
      !closed(f, ['schemaVersion', 'wordCount']) ||
      f.schemaVersion !== 1 ||
      value.outcome === 'preparing' ||
      (value.outcome === 'version' ? !integer(f.wordCount) : f.wordCount !== null)
    )
      throw new TypeError('Invalid finalized draft.');
  }
  return structuredClone(value);
}
