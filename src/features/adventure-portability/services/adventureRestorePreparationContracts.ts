import {
  readAdventureRestoreRecoveryContext,
  recoveryCheck,
  recoveryObject,
  type AdventureRestoreRecoveryContext,
} from './adventureRestoreRecoveryContracts';

export function adventurePreparationCheck(condition: unknown): asserts condition {
  recoveryCheck(condition);
}
export const ADVENTURE_RESTORE_PREPARATION_COMMANDS = Object.freeze([
  'advanceAdventureRestoreIntegrity',
  'advanceAdventureRestoreValidation',
  'advanceAdventureRestoreStructure',
  'advanceAdventureRestoreResources',
  'advanceAdventureRestoreProfiles',
  'advanceAdventureRestoreHistory',
  'finalizeAdventureRestoreDraft',
  'advanceAdventureRestoreUniverse',
  'advanceAdventureRestorePersonaLibrary',
  'advanceAdventureRestoreImages',
  'advanceAdventureRestoreImageStorage',
  'advanceAdventureRestoreCounts',
  'advanceAdventureRestoreAudit',
  'advanceAdventureRestoreImageLibrary',
] as const);
export type AdventureRestorePreparationCommand =
  (typeof ADVENTURE_RESTORE_PREPARATION_COMMANDS)[number];
export type AdventureRestorePreparationIntent = Readonly<{
  schemaVersion: 1;
  ownerId: string;
  restoreId: string;
  adventureId: string;
  jobToken: string;
  action: AdventureRestorePreparationCommand;
  operationId: string;
  expectedCheckpoint: number;
  limit: number | null;
}>;
export interface AdventureRestorePreparationJournal {
  read(): Promise<AdventureRestorePreparationIntent | null>;
  compareAndSet(
    previous: AdventureRestorePreparationIntent | null,
    next: AdventureRestorePreparationIntent | null,
  ): Promise<boolean>;
}
export function readAdventureRestorePreparationIntent(
  raw: unknown,
  expected: AdventureRestoreRecoveryContext,
): AdventureRestorePreparationIntent {
  const context = readAdventureRestoreRecoveryContext(expected);
  recoveryCheck(
    recoveryObject(raw, [
      'schemaVersion',
      'ownerId',
      'restoreId',
      'adventureId',
      'jobToken',
      'action',
      'operationId',
      'expectedCheckpoint',
      'limit',
    ]) &&
      raw.schemaVersion === 1 &&
      (['ownerId', 'restoreId', 'adventureId', 'jobToken'] as const).every(
        (k) => raw[k] === context[k],
      ) &&
      typeof raw.action === 'string' &&
      (ADVENTURE_RESTORE_PREPARATION_COMMANDS as readonly string[]).includes(raw.action) &&
      typeof raw.operationId === 'string' &&
      /^[A-Za-z0-9-]{16,80}$/.test(raw.operationId) &&
      typeof raw.expectedCheckpoint === 'number' &&
      Number.isSafeInteger(raw.expectedCheckpoint) &&
      raw.expectedCheckpoint >= 0 &&
      raw.expectedCheckpoint < Number.MAX_SAFE_INTEGER &&
      (raw.action === 'advanceAdventureRestoreIntegrity'
        ? typeof raw.limit === 'number' &&
          Number.isSafeInteger(raw.limit) &&
          raw.limit >= 1 &&
          raw.limit <= 16
        : raw.limit === null),
  );
  return Object.freeze({
    schemaVersion: 1,
    ownerId: context.ownerId,
    restoreId: context.restoreId,
    adventureId: context.adventureId,
    jobToken: context.jobToken,
    action: raw.action as AdventureRestorePreparationCommand,
    operationId: raw.operationId,
    expectedCheckpoint: raw.expectedCheckpoint,
    limit: raw.limit as number | null,
  });
}
