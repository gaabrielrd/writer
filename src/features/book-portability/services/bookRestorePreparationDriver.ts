import type {
  BookRestoreIdentity,
  BookRestorePreparationApi,
  BookRestorePreparationJournal,
  BookRestorePreparationStep,
} from '../model/bookRestorePreparation';
import {
  restorePreparationCheck,
  readBookRestoreIdentity,
  readBookRestorePreparationProgress,
  readBookRestorePreparationIntent,
  chooseBookRestorePreparationStep,
  readBookRestorePreparationConfirmation,
} from './bookRestorePreparationContracts';

export function createBookRestorePreparationDriver(options: {
  identity: BookRestoreIdentity;
  api: BookRestorePreparationApi;
  journal: BookRestorePreparationJournal;
  check: () => void;
  operationId: () => string;
}) {
  const identity = Object.freeze(readBookRestoreIdentity(options.identity)),
    { api, journal, check, operationId } = options;
  let running = false;
  return {
    async step(): Promise<BookRestorePreparationStep> {
      check();
      restorePreparationCheck(!running);
      running = true;
      try {
        const stored = await journal.read();
        check();
        let intent = stored === null ? null : readBookRestorePreparationIntent(stored, identity);
        if (!intent) {
          const raw = await api.get({ restoreId: identity.restoreId, jobToken: identity.jobToken });
          check();
          const progress = readBookRestorePreparationProgress(raw, identity),
            next = chooseBookRestorePreparationStep(progress);
          if ('reason' in next) return { kind: 'paused', reason: next.reason, progress };
          intent = readBookRestorePreparationIntent(
            {
              schemaVersion: 1,
              ...identity,
              action: next.action,
              operationId: operationId(),
              expectedCheckpoint: progress.checkpoint,
              limit: next.action === 'advanceBookRestoreIntegrity' ? 16 : null,
            },
            identity,
          );
          const saved = await journal.compareAndSet(null, intent);
          check();
          restorePreparationCheck(saved);
        }
        check();
        const raw = await api.advance(intent.action, {
          restoreId: identity.restoreId,
          jobToken: identity.jobToken,
          operationId: intent.operationId,
          expectedCheckpoint: intent.expectedCheckpoint,
          ...(intent.limit === null ? {} : { limit: intent.limit }),
        });
        check();
        const progress = readBookRestorePreparationConfirmation(raw, intent);
        const cleared = await journal.compareAndSet(intent, null);
        check();
        restorePreparationCheck(cleared);
        return { kind: 'advanced', action: intent.action, progress };
      } finally {
        running = false;
      }
    },
  };
}
