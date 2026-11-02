import { auth } from '@/shared/lib';
import {
  recoveryCheck as check,
  recoveryObject as object,
  readAdventureRestoreRecoveryContext,
  type AdventureRestoreRecoveryIdentity,
} from './adventureRestoreRecoveryContracts';
import { readAdventureEffectIdentity } from './adventureRestoreEffectContracts';
import { createAdventureRestoreStartSession } from './adventureRestoreStartSession';
import {
  readStoredAdventureRestorePreparationMetadata,
  compareStoredAdventureRestorePreparation,
} from './adventureRestorePreparationDb';
import { readAdventureRestorePreparationEnvelope } from './adventureRestorePreparationCrypto';
import { getAdventureRestoreRecoveryGrant } from './adventureRestoreRecoveryKey';
export function checkAdventureRestoreAccount(ownerId: string) {
  check(auth.currentUser?.uid === ownerId);
}
async function snapshot(identity: AdventureRestoreRecoveryIdentity, guard: () => void) {
  const c = readAdventureEffectIdentity(identity);
  guard();
  const raw = await readStoredAdventureRestorePreparationMetadata(c, guard);
  guard();
  if (raw === null) return null;
  check(object(raw, ['schemaVersion', 'context', 'stamp', 'nonce', 'ciphertext']));
  const context = readAdventureRestoreRecoveryContext(raw.context);
  check(Object.entries(c).every(([k, v]) => context[k as keyof typeof context] === v));
  return readAdventureRestorePreparationEnvelope(raw, context);
}
/** An envelope identifies the prior key; it never grants decryption or authorizes a request. */
export async function adventureRestorePreparationContext(
  identity: AdventureRestoreRecoveryIdentity,
  guard: () => void,
) {
  const c = readAdventureEffectIdentity(identity),
    stored = await snapshot(c, guard);
  guard();
  if (stored) return stored.context;
  const grant = await getAdventureRestoreRecoveryGrant(c, guard);
  guard();
  return readAdventureRestoreRecoveryContext({ ...c, keyId: grant.keyId });
}
export async function hasAdventureRestoreLocalRecovery(
  identity: AdventureRestoreRecoveryIdentity,
  guard: () => void,
) {
  return (await snapshot(identity, guard)) !== null;
}
/** Explicit terminal discard, reauthorized and CAS-bound; never decrypts or retrieves a retired key. */
export async function discardAdventureRestoreLocalRecovery(
  identity: AdventureRestoreRecoveryIdentity,
  guard: () => void,
) {
  const c = readAdventureEffectIdentity(identity);
  guard();
  const current = await createAdventureRestoreStartSession({
    ownerId: c.ownerId,
    check: guard,
  }).get(c);
  guard();
  check(
    current.adventureId === c.adventureId &&
      current.jobToken === c.jobToken &&
      current.reviewHash === c.reviewHash &&
      (current.state === 'activated' || current.state === 'cancelled'),
  );
  const stored = await snapshot(c, guard);
  guard();
  if (stored === null) return;
  const ok = await compareStoredAdventureRestorePreparation(stored.context, stored, null, guard);
  guard();
  check(ok);
}
