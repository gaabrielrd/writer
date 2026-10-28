import {
  readAdventureRestoreRecoveryContext,
  recoveryObject,
  recoveryCheck as check,
  type AdventureRestoreRecoveryContext,
} from './adventureRestoreRecoveryContracts';
import {
  ADVENTURE_RESTORE_PREPARATION_COMMANDS,
  readAdventureRestorePreparationIntent,
} from './adventureRestorePreparationContracts';
import type { AdventurePreparationApi } from './adventureRestorePreparationDriver';

export function createAdventureRestorePreparationApi(
  expected: AdventureRestoreRecoveryContext,
  guard: () => void,
): AdventurePreparationApi {
  const context = readAdventureRestoreRecoveryContext(expected);
  async function call(name: string, input: Readonly<Record<string, unknown>>): Promise<unknown> {
    guard();
    const [{ getFunctions, httpsCallable }, { getFirebaseApp, auth }] = await Promise.all([
      import('firebase/functions'),
      import('@/shared/lib'),
    ]);
    const active = () => {
      guard();
      check(auth.currentUser?.uid === context.ownerId);
    };
    active();
    const result = await httpsCallable<unknown, unknown>(
      getFunctions(getFirebaseApp(), 'us-central1'),
      name,
      { timeout: name === 'advanceAdventureRestoreValidation' ? 600_000 : 180_000 },
    )(input);
    active();
    return result.data;
  }
  return {
    get(input) {
      guard();
      check(
        recoveryObject(input, ['restoreId', 'jobToken']) &&
          input.restoreId === context.restoreId &&
          input.jobToken === context.jobToken,
      );
      return call(
        'getAdventureRestore',
        Object.freeze({ restoreId: context.restoreId, jobToken: context.jobToken }),
      );
    },
    advance(action, input) {
      guard();
      check((ADVENTURE_RESTORE_PREPARATION_COMMANDS as readonly unknown[]).includes(action));
      check(
        recoveryObject(
          input,
          ['restoreId', 'jobToken', 'operationId', 'expectedCheckpoint'],
          action === 'advanceAdventureRestoreIntegrity' ? ['limit'] : [],
        ),
      );
      const intent = readAdventureRestorePreparationIntent(
        {
          schemaVersion: 1,
          ownerId: context.ownerId,
          adventureId: context.adventureId,
          ...input,
          action,
          limit: action === 'advanceAdventureRestoreIntegrity' ? input.limit : null,
        },
        context,
      );
      return call(
        action,
        Object.freeze({
          restoreId: intent.restoreId,
          jobToken: intent.jobToken,
          operationId: intent.operationId,
          expectedCheckpoint: intent.expectedCheckpoint,
          ...(intent.limit === null ? {} : { limit: intent.limit }),
        }),
      );
    },
  };
}
