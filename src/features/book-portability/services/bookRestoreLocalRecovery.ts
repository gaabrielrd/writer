import { auth } from '@/shared/lib';
import { createBookRestoreStartSession } from './bookRestoreStartSession';
import { readBookRestoreRecoveryContext } from './bookRestoreRecoveryKey';
import { readBookRestorePreparationEnvelope } from './bookRestorePreparationCrypto';
import {
  readStoredBookRestorePreparation,
  compareStoredBookRestorePreparation,
} from './bookRestorePreparationDb';
import { restorePreparationCheck as check } from './bookRestorePreparationContracts';
import type { BookRestoreTransferJob } from './bookRestoreTransferJob';
export function checkBookRestoreAccount(ownerId: string) {
  check(auth.currentUser?.uid === ownerId);
}
export async function hasBookRestoreLocalRecovery(job: BookRestoreTransferJob, guard: () => void) {
  guard();
  const raw = await readStoredBookRestorePreparation(readBookRestoreRecoveryContext(job), guard);
  guard();
  return raw !== null;
}
/** Explicit local discard only; terminal state is reauthorized and ciphertext never decrypted. */
export async function discardBookRestoreLocalRecovery(
  job: BookRestoreTransferJob,
  guard: () => void,
) {
  const context = readBookRestoreRecoveryContext(job),
    session = createBookRestoreStartSession({ ownerId: job.ownerId, check: guard });
  guard();
  const current = await session.get(context);
  guard();
  check(
    current.bookId === context.bookId &&
      current.keyId === context.keyId &&
      current.reviewHash === context.reviewHash &&
      (current.state === 'activated' || current.state === 'cancelled'),
  );
  const raw = await readStoredBookRestorePreparation(context, guard);
  guard();
  if (raw === null) return;
  const envelope = readBookRestorePreparationEnvelope(raw, context);
  const cleared = await compareStoredBookRestorePreparation(context, envelope, null, guard);
  guard();
  check(cleared);
}
