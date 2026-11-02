import {
  BOOK_RESTORE_EFFECT_ACTIONS,
  type BookRestoreEffectIntent,
  type BookRestoreEffectRecord,
  type BookRestoreEffectInput,
} from '../model/bookRestoreEffects';
import type { BookRestoreIdentity } from '../model/bookRestorePreparation';
import {
  restorePreparationCheck as check,
  restorePreparationOperationId,
  readBookRestoreIdentity,
} from './bookRestorePreparationContracts';
import { bookRestoreMetadataHash } from './bookRestoreTransferContracts';
const closed = (v: unknown, keys: string[]): v is Record<string, unknown> =>
  !!v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.keys(v).length === keys.length &&
  keys.every((k) => Object.hasOwn(v, k));
const index = (v: unknown): v is number =>
  Number.isSafeInteger(v) && (v as number) >= 0 && (v as number) < Number.MAX_SAFE_INTEGER;
export function readBookRestoreEffectIntent(
  raw: unknown,
  expected: BookRestoreIdentity,
): BookRestoreEffectIntent {
  const identity = readBookRestoreIdentity(expected);
  check(
    closed(raw, [
      'schemaVersion',
      'ownerId',
      'restoreId',
      'bookId',
      'jobToken',
      'action',
      'operationId',
      'expectedCheckpoint',
      'expectedRevision',
      'reviewToken',
    ]) &&
      raw.schemaVersion === 1 &&
      Object.entries(identity).every(([k, v]) => raw[k] === v) &&
      BOOK_RESTORE_EFFECT_ACTIONS.includes(raw.action as BookRestoreEffectIntent['action']) &&
      restorePreparationOperationId(raw.operationId),
  );
  const action = raw.action as BookRestoreEffectIntent['action'];
  if (action === 'activateBookRestore')
    check(
      index(raw.expectedCheckpoint) &&
        raw.expectedRevision === null &&
        typeof raw.reviewToken === 'string' &&
        /^[a-f0-9]{64}$/.test(raw.reviewToken),
    );
  else if (action === 'advanceBookRestoreArchiveCleanup')
    check(
      raw.expectedCheckpoint === null && index(raw.expectedRevision) && raw.reviewToken === null,
    );
  else if (action === 'finalizeBookRestoreMedia')
    check(
      raw.expectedCheckpoint === null && raw.expectedRevision === null && raw.reviewToken === null,
    );
  else
    check(
      index(raw.expectedCheckpoint) && raw.expectedRevision === null && raw.reviewToken === null,
    );
  return Object.freeze({
    schemaVersion: 1,
    ...identity,
    action,
    operationId: raw.operationId,
    expectedCheckpoint: raw.expectedCheckpoint,
    expectedRevision: raw.expectedRevision,
    reviewToken: raw.reviewToken,
  });
}
export function readBookRestoreEffectRecord(
  raw: unknown,
  ownerId: string,
  restoreId?: string,
): BookRestoreEffectRecord {
  check(
    closed(raw, ['schemaVersion', 'stamp', 'intent']) &&
      raw.schemaVersion === 1 &&
      closed(raw.intent, [
        'schemaVersion',
        'ownerId',
        'restoreId',
        'bookId',
        'jobToken',
        'action',
        'operationId',
        'expectedCheckpoint',
        'expectedRevision',
        'reviewToken',
      ]) &&
      typeof raw.stamp === 'string' &&
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(raw.stamp),
  );
  const identity = readBookRestoreIdentity(raw.intent);
  check(
    identity.ownerId === ownerId && (restoreId === undefined || identity.restoreId === restoreId),
  );
  return Object.freeze({
    schemaVersion: 1,
    stamp: raw.stamp,
    intent: readBookRestoreEffectIntent(raw.intent, identity),
  });
}
export function createBookRestoreEffectRecord(
  intent: BookRestoreEffectIntent,
): BookRestoreEffectRecord {
  return readBookRestoreEffectRecord(
    { schemaVersion: 1, stamp: crypto.randomUUID(), intent },
    intent.ownerId,
    intent.restoreId,
  );
}
export function bookRestoreEffectInput(intent: BookRestoreEffectIntent): BookRestoreEffectInput {
  const value = readBookRestoreEffectIntent(intent, intent);
  return {
    restoreId: value.restoreId,
    jobToken: value.jobToken,
    operationId: value.operationId,
    ...(value.action === 'advanceBookRestoreCleanup' ? { limit: 16 } : {}),
    ...(value.expectedCheckpoint === null ? {} : { expectedCheckpoint: value.expectedCheckpoint }),
    ...(value.expectedRevision === null ? {} : { expectedRevision: value.expectedRevision }),
    ...(value.reviewToken === null ? {} : { reviewToken: value.reviewToken }),
  };
}
export function bookRestoreEffectFingerprint(intent: BookRestoreEffectIntent): string {
  check(
    ['activateBookRestore', 'cancelBookRestore', 'advanceBookRestoreCleanup'].includes(
      intent.action,
    ),
  );
  return bookRestoreMetadataHash({
    schemaVersion: 1,
    action: intent.action,
    request: bookRestoreEffectInput(intent),
  });
}
