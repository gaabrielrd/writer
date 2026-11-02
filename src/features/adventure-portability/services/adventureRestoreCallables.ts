import { ADVENTURE_RESTORE_PREPARATION_COMMANDS } from './adventureRestorePreparationContracts';
import { recoveryCheck as check, recoveryOwner } from './adventureRestoreRecoveryContracts';
const methods = Object.freeze([
  ...ADVENTURE_RESTORE_PREPARATION_COMMANDS,
  'startAdventureRestore',
  'getAdventureRestore',
  'listAdventureRestores',
  'appendAdventureRestoreChunk',
  'resolveAdventureRestoreStart',
  'getAdventureRestoreActivationReview',
  'activateAdventureRestore',
  'retireAdventureRestoreActivation',
  'getAdventureRestoreMediaState',
  'advanceAdventureRestoreMedia',
  'getAdventureRestoreArchiveCleanup',
  'advanceAdventureRestoreArchiveCleanup',
  'cancelAdventureRestore',
  'advanceAdventureRestoreCleanup',
  'resolveAdventureRestoreOperation',
]);
/** Internal transport only; callers validate and snapshot their domain request before invoking. */
export async function callAdventureRestore(
  ownerId: string,
  guard: () => void,
  name: string,
  input: Readonly<Record<string, unknown>>,
): Promise<unknown> {
  guard();
  check(recoveryOwner(ownerId) && methods.includes(name));
  const [{ getFunctions, httpsCallable }, { getFirebaseApp, auth }] = await Promise.all([
    import('firebase/functions'),
    import('@/shared/lib'),
  ]);
  const active = () => {
    guard();
    check(auth.currentUser?.uid === ownerId);
  };
  active();
  const result = await httpsCallable<unknown, unknown>(
    getFunctions(getFirebaseApp(), 'us-central1'),
    name,
    {
      timeout: name === 'advanceAdventureRestoreValidation' ? 600_000 : 180_000,
    },
  )(input);
  active();
  return result.data;
}
