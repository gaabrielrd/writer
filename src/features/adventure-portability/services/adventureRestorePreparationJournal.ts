import { getAdventureRestoreRecoveryGrant } from './adventureRestoreRecoveryKey';
import type {
  AdventureRestorePreparationJournal,
  AdventureRestorePreparationIntent,
} from './adventureRestorePreparationContracts';
import {
  readAdventureRestoreRecoveryContext,
  type AdventureRestoreRecoveryContext,
  type AdventureRestoreRecoveryGrant,
} from './adventureRestoreRecoveryContracts';
import {
  readAdventureRestorePreparationIntent,
  adventurePreparationCheck as check,
} from './adventureRestorePreparationContracts';
import {
  openAdventureRestorePreparationIntent,
  sealAdventureRestorePreparationIntent,
  readAdventureRestorePreparationEnvelope,
  sameAdventureRestorePreparationIntent,
  sameAdventureRestorePreparationEnvelope,
} from './adventureRestorePreparationCrypto';
import {
  adventureRestorePreparationStorageAvailable,
  readStoredAdventureRestorePreparation,
  compareStoredAdventureRestorePreparation,
} from './adventureRestorePreparationDb';
export function createAdventureRestorePreparationJournal(
  expected: AdventureRestoreRecoveryContext,
  guard: () => void,
  authorize: (
    context: AdventureRestoreRecoveryContext,
    guard: () => void,
  ) => Promise<AdventureRestoreRecoveryGrant> = getAdventureRestoreRecoveryGrant,
): AdventureRestorePreparationJournal {
  const context = Object.freeze(readAdventureRestoreRecoveryContext(expected)),
    lock =
      'writer.adventure-restore.preparation:' +
      JSON.stringify([context.ownerId, context.restoreId]);
  async function locked<T>(work: () => Promise<T>): Promise<T> {
    guard();
    check(adventureRestorePreparationStorageAvailable());
    return navigator.locks.request(lock, async () => {
      guard();
      return work();
    });
  }
  return {
    read: () =>
      locked(async () => {
        const raw = await readStoredAdventureRestorePreparation(context, guard);
        guard();
        if (raw === null) return null;
        const snapshot = readAdventureRestorePreparationEnvelope(raw, context),
          grant = await authorize(context, guard);
        guard();
        const pending = await openAdventureRestorePreparationIntent(
          context,
          grant,
          snapshot,
          guard,
        );
        guard();
        const current = await readStoredAdventureRestorePreparation(context, guard);
        guard();
        check(sameAdventureRestorePreparationEnvelope(snapshot, current, context));
        return pending;
      }),
    async compareAndSet(
      previous: AdventureRestorePreparationIntent | null,
      next: AdventureRestorePreparationIntent | null,
    ) {
      guard();
      const old =
          previous === null ? null : readAdventureRestorePreparationIntent(previous, context),
        value = next === null ? null : readAdventureRestorePreparationIntent(next, context);
      return locked(async () => {
        const raw = await readStoredAdventureRestorePreparation(context, guard);
        guard();
        if ((old === null) !== (raw === null)) return false;
        if (raw === null && value === null) return true;
        const snapshot =
            raw === null ? null : readAdventureRestorePreparationEnvelope(raw, context),
          grant = await authorize(context, guard);
        guard();
        if (snapshot && old) {
          const current = await openAdventureRestorePreparationIntent(
            context,
            grant,
            snapshot,
            guard,
          );
          guard();
          if (!sameAdventureRestorePreparationIntent(current, old, context)) return false;
        }
        const sealed =
          value === null
            ? null
            : await sealAdventureRestorePreparationIntent(context, grant, value, guard);
        guard();
        const saved = await compareStoredAdventureRestorePreparation(
          context,
          snapshot,
          sealed,
          guard,
        );
        guard();
        return saved;
      });
    },
  };
}
