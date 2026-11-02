import type {
  BookRestorePreparationJournal,
  BookRestorePreparationIntent,
} from '../model/bookRestorePreparation';
import {
  getBookRestoreRecoveryGrant,
  readBookRestoreRecoveryContext,
  type BookRestoreRecoveryContext,
  type BookRestoreRecoveryGrant,
} from './bookRestoreRecoveryKey';
import {
  readBookRestorePreparationIntent,
  restorePreparationCheck as check,
} from './bookRestorePreparationContracts';
import {
  openBookRestorePreparationIntent,
  sealBookRestorePreparationIntent,
  readBookRestorePreparationEnvelope,
  sameBookRestorePreparationIntent,
  sameBookRestorePreparationEnvelope,
} from './bookRestorePreparationCrypto';
import {
  bookRestorePreparationStorageAvailable,
  readStoredBookRestorePreparation,
  compareStoredBookRestorePreparation,
} from './bookRestorePreparationDb';
export function createBookRestorePreparationJournal(
  expected: BookRestoreRecoveryContext,
  guard: () => void,
  authorize: (
    context: BookRestoreRecoveryContext,
    guard: () => void,
  ) => Promise<BookRestoreRecoveryGrant> = getBookRestoreRecoveryGrant,
): BookRestorePreparationJournal {
  const context = Object.freeze(readBookRestoreRecoveryContext(expected)),
    lock =
      'writer.book-restore.preparation:' + JSON.stringify([context.ownerId, context.restoreId]);
  async function locked<T>(work: () => Promise<T>): Promise<T> {
    guard();
    check(bookRestorePreparationStorageAvailable());
    return navigator.locks.request(lock, async () => {
      guard();
      return work();
    });
  }
  return {
    read: () =>
      locked(async () => {
        const raw = await readStoredBookRestorePreparation(context, guard);
        guard();
        if (raw === null) return null;
        const snapshot = readBookRestorePreparationEnvelope(raw, context),
          grant = await authorize(context, guard);
        guard();
        const pending = await openBookRestorePreparationIntent(context, grant, snapshot, guard);
        guard();
        const current = await readStoredBookRestorePreparation(context, guard);
        guard();
        check(sameBookRestorePreparationEnvelope(snapshot, current, context));
        return pending;
      }),
    async compareAndSet(
      previous: BookRestorePreparationIntent | null,
      next: BookRestorePreparationIntent | null,
    ) {
      guard();
      const old = previous === null ? null : readBookRestorePreparationIntent(previous, context),
        value = next === null ? null : readBookRestorePreparationIntent(next, context);
      return locked(async () => {
        const raw = await readStoredBookRestorePreparation(context, guard);
        guard();
        if ((old === null) !== (raw === null)) return false;
        if (raw === null && value === null) return true;
        const snapshot = raw === null ? null : readBookRestorePreparationEnvelope(raw, context),
          grant = await authorize(context, guard);
        guard();
        if (snapshot && old) {
          const current = await openBookRestorePreparationIntent(context, grant, snapshot, guard);
          guard();
          if (!sameBookRestorePreparationIntent(current, old, context)) return false;
        }
        const sealed =
          value === null
            ? null
            : await sealBookRestorePreparationIntent(context, grant, value, guard);
        guard();
        const saved = await compareStoredBookRestorePreparation(context, snapshot, sealed, guard);
        guard();
        return saved;
      });
    },
  };
}
