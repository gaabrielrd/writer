import { closed, inconsistent } from './bookRestoreInput.mjs';
import { validateId } from './generation.mjs';
export function validateBookRestoreActivation(value) {
  closed(value, [
    'schemaVersion',
    'operationId',
    'requestHash',
    'reviewToken',
    'sourceCheckpoint',
    'activatedAt',
    'mediaState',
  ], ['editorial']);
  if (Object.hasOwn(value, 'editorial')) {
    closed(value.editorial, ['schemaVersion', 'contextToken', 'controlToken', 'sealToken']);
    if (value.editorial.schemaVersion !== 1 ||
      ['contextToken', 'controlToken', 'sealToken'].some(
        key => typeof value.editorial[key] !== 'string' || !/^[a-f0-9]{64}$/.test(value.editorial[key])))
      inconsistent();
  }
  if (
    value.schemaVersion !== 1 ||
    !Number.isSafeInteger(value.sourceCheckpoint) ||
    value.sourceCheckpoint < 0 ||
    !Number.isSafeInteger(value.activatedAt) ||
    value.activatedAt < 0 ||
    !Number.isFinite(new Date(value.activatedAt).getTime()) ||
    !['none', 'pending'].includes(value.mediaState) ||
    ['requestHash', 'reviewToken'].some(
      (k) => typeof value[k] !== 'string' || !/^[a-f0-9]{64}$/.test(value[k]),
    )
  )
    inconsistent();
  try {
    validateId(value.operationId);
  } catch {
    inconsistent();
  }
  return structuredClone(value);
}
