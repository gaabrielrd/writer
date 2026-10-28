import {
  readAdventureRestoreRecoveryContext,
  recoveryCheck as check,
  type AdventureRestoreRecoveryContext,
} from './adventureRestoreRecoveryContracts';
import {
  readAdventureRestorePreparationIntent,
  type AdventureRestorePreparationIntent,
  type AdventureRestorePreparationJournal,
  type AdventureRestorePreparationCommand,
} from './adventureRestorePreparationContracts';
import {
  readAdventurePreparationProgress,
  chooseAdventurePreparationStep,
  readAdventurePreparationConfirmation,
  type AdventurePreparationStep,
} from './adventureRestorePreparationProgress';
export type AdventurePreparationRequest = Readonly<{
  restoreId: string;
  jobToken: string;
  operationId: string;
  expectedCheckpoint: number;
  limit?: number;
}>;
export interface AdventurePreparationApi {
  get(input: Readonly<{ restoreId: string; jobToken: string }>): Promise<unknown>;
  advance(
    action: AdventureRestorePreparationCommand,
    input: AdventurePreparationRequest,
  ): Promise<unknown>;
}
export function createAdventureRestorePreparationDriver(options: {
  context: AdventureRestoreRecoveryContext;
  api: AdventurePreparationApi;
  journal: AdventureRestorePreparationJournal;
  check: () => void;
  operationId: () => string;
}) {
  const context = readAdventureRestoreRecoveryContext(options.context),
    { api, journal, check: guard, operationId } = options;
  let running = false;
  return {
    async step(): Promise<AdventurePreparationStep> {
      guard();
      check(!running);
      running = true;
      try {
        const stored = await journal.read();
        guard();
        let intent: AdventureRestorePreparationIntent | null =
          stored === null ? null : readAdventureRestorePreparationIntent(stored, context);
        if (!intent) {
          const raw = await api.get({ restoreId: context.restoreId, jobToken: context.jobToken });
          guard();
          const progress = readAdventurePreparationProgress(raw, context),
            next = chooseAdventurePreparationStep(progress);
          if ('reason' in next) return { kind: 'paused', reason: next.reason, progress };
          intent = readAdventureRestorePreparationIntent(
            {
              schemaVersion: 1,
              ownerId: context.ownerId,
              restoreId: context.restoreId,
              adventureId: context.adventureId,
              jobToken: context.jobToken,
              action: next.action,
              operationId: operationId(),
              expectedCheckpoint: progress.checkpoint,
              limit: next.action === 'advanceAdventureRestoreIntegrity' ? 16 : null,
            },
            context,
          );
          const saved = await journal.compareAndSet(null, intent);
          guard();
          check(saved);
        }
        guard();
        const raw = await api.advance(intent.action, {
          restoreId: context.restoreId,
          jobToken: context.jobToken,
          operationId: intent.operationId,
          expectedCheckpoint: intent.expectedCheckpoint,
          ...(intent.limit === null ? {} : { limit: intent.limit }),
        });
        guard();
        const progress = readAdventurePreparationConfirmation(raw, intent, context);
        const cleared = await journal.compareAndSet(intent, null);
        guard();
        check(cleared);
        return { kind: 'advanced', action: intent.action, progress };
      } finally {
        running = false;
      }
    },
  };
}
