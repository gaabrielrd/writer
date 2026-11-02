import {
  recoveryCheck as check,
  recoveryObject as closed,
  recoveryOperationId as id,
  recoveryHash as hash,
  readAdventureRestoreRecoveryRequest,
  type AdventureRestoreRecoveryIdentity,
} from './adventureRestoreRecoveryContracts';
import { adventureRestoreMetadataHash } from './adventureRestoreTransferContracts';

export const ADVENTURE_RESTORE_EFFECT_ACTIONS = Object.freeze([
  'activateAdventureRestore',
  'cancelAdventureRestore',
  'advanceAdventureRestoreCleanup',
  'advanceAdventureRestoreMedia',
  'advanceAdventureRestoreArchiveCleanup',
] as const);
export type AdventureRestoreEffectAction = (typeof ADVENTURE_RESTORE_EFFECT_ACTIONS)[number];
export type AdventureRestoreEffectIntent = AdventureRestoreRecoveryIdentity &
  Readonly<{
    schemaVersion: 1;
    action: AdventureRestoreEffectAction;
    operationId: string;
    expectedCheckpoint: number;
    reviewToken: string | null;
  }>;
export type AdventureRestoreEffectRecord = Readonly<{
  schemaVersion: 1;
  stamp: string;
  intent: AdventureRestoreEffectIntent;
}>;
export type AdventureRestoreEffectInput = Readonly<{
  restoreId: string;
  jobToken: string;
  operationId: string;
  expectedCheckpoint: number;
  reviewToken?: string;
  limit?: 16;
}>;
export const effectCount = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
export const effectObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
export function readAdventureEffectIdentity(raw: AdventureRestoreRecoveryIdentity) {
  const c = readAdventureRestoreRecoveryRequest({
    ownerId: raw.ownerId,
    restoreId: raw.restoreId,
    adventureId: raw.adventureId,
    jobToken: raw.jobToken,
    reviewHash: raw.reviewHash,
  });
  return Object.freeze({
    ownerId: c.ownerId,
    restoreId: c.restoreId,
    adventureId: c.adventureId,
    jobToken: c.jobToken,
    reviewHash: c.reviewHash,
  });
}
export function readAdventureRestoreEffectIntent(
  raw: unknown,
  expected: AdventureRestoreRecoveryIdentity,
): AdventureRestoreEffectIntent {
  const c = readAdventureEffectIdentity(expected);
  check(
    closed(raw, [
      'schemaVersion',
      'ownerId',
      'restoreId',
      'adventureId',
      'jobToken',
      'reviewHash',
      'action',
      'operationId',
      'expectedCheckpoint',
      'reviewToken',
    ]) &&
      raw.schemaVersion === 1 &&
      Object.entries(c).every(([k, v]) => raw[k] === v) &&
      ADVENTURE_RESTORE_EFFECT_ACTIONS.includes(raw.action as AdventureRestoreEffectAction) &&
      id(raw.operationId) &&
      effectCount(raw.expectedCheckpoint) &&
      Number.isSafeInteger(raw.expectedCheckpoint + 1) &&
      (raw.action === 'activateAdventureRestore'
        ? hash(raw.reviewToken)
        : raw.reviewToken === null),
  );
  return Object.freeze({
    schemaVersion: 1,
    ...c,
    action: raw.action as AdventureRestoreEffectAction,
    operationId: raw.operationId,
    expectedCheckpoint: raw.expectedCheckpoint,
    reviewToken: raw.reviewToken as string | null,
  });
}
export function readAdventureRestoreEffectRecord(
  raw: unknown,
  ownerId: string,
  restoreId?: string,
): AdventureRestoreEffectRecord {
  check(
    closed(raw, ['schemaVersion', 'stamp', 'intent']) &&
      raw.schemaVersion === 1 &&
      typeof raw.stamp === 'string' &&
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(raw.stamp) &&
      effectObject(raw.intent),
  );
  const c = readAdventureEffectIdentity({
    ownerId: raw.intent.ownerId as string,
    restoreId: raw.intent.restoreId as string,
    adventureId: raw.intent.adventureId as string,
    jobToken: raw.intent.jobToken as string,
    reviewHash: raw.intent.reviewHash as string,
  });
  check(c.ownerId === ownerId && (restoreId === undefined || c.restoreId === restoreId));
  return Object.freeze({
    schemaVersion: 1,
    stamp: raw.stamp,
    intent: readAdventureRestoreEffectIntent(raw.intent, c),
  });
}
export function createAdventureRestoreEffectRecord(intent: AdventureRestoreEffectIntent) {
  return readAdventureRestoreEffectRecord(
    { schemaVersion: 1, stamp: crypto.randomUUID(), intent },
    intent.ownerId,
    intent.restoreId,
  );
}
export function adventureRestoreEffectInput(
  value: AdventureRestoreEffectIntent,
): AdventureRestoreEffectInput {
  const i = readAdventureRestoreEffectIntent(value, readAdventureEffectIdentity(value));
  return Object.freeze({
    restoreId: i.restoreId,
    jobToken: i.jobToken,
    operationId: i.operationId,
    expectedCheckpoint: i.expectedCheckpoint,
    ...(i.action === 'activateAdventureRestore' ? { reviewToken: i.reviewToken! } : {}),
    ...(i.action === 'advanceAdventureRestoreCleanup' ? { limit: 16 as const } : {}),
  });
}
export function adventureRestoreEffectFingerprint(intent: AdventureRestoreEffectIntent): string {
  const request = adventureRestoreEffectInput(intent);
  return intent.action === 'advanceAdventureRestoreArchiveCleanup'
    ? adventureRestoreMetadataHash({ action: intent.action, ...request })
    : adventureRestoreMetadataHash({
        domain: 'writer-adventure-restore-v1',
        action: intent.action,
        request,
      });
}
