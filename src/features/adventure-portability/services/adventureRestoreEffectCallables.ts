import { callAdventureRestore } from './adventureRestoreCallables';
import {
  recoveryCheck as check,
  recoveryObject as closed,
  recoveryOwner,
  recoveryOperationId as id,
  recoveryHash as hash,
} from './adventureRestoreRecoveryContracts';
import {
  ADVENTURE_RESTORE_EFFECT_ACTIONS,
  effectCount as count,
  type AdventureRestoreEffectAction,
  type AdventureRestoreEffectInput,
} from './adventureRestoreEffectContracts';
type Scope = Readonly<{ restoreId: string; jobToken: string }>;
export interface AdventureRestoreEffectApi {
  mutate(
    action: AdventureRestoreEffectAction,
    input: AdventureRestoreEffectInput,
  ): Promise<unknown>;
  retireActivation(input: AdventureRestoreEffectInput): Promise<unknown>;
  review(input: Scope): Promise<unknown>;
  media(input: Scope): Promise<unknown>;
  archive(input: Scope): Promise<unknown>;
  resolve(input: Scope & { operationId: string; requestHash: string }): Promise<unknown>;
}
function scope(raw: unknown): Scope {
  check(closed(raw, ['restoreId', 'jobToken']) && id(raw.restoreId) && hash(raw.jobToken));
  return Object.freeze({ restoreId: raw.restoreId, jobToken: raw.jobToken });
}
function mutation(action: AdventureRestoreEffectAction, raw: unknown) {
  check(
    ADVENTURE_RESTORE_EFFECT_ACTIONS.includes(action) &&
      closed(raw, [
        'restoreId',
        'jobToken',
        'operationId',
        'expectedCheckpoint',
        ...(action === 'activateAdventureRestore' ? ['reviewToken'] : []),
        ...(action === 'advanceAdventureRestoreCleanup' ? ['limit'] : []),
      ]) &&
      id(raw.restoreId) &&
      hash(raw.jobToken) &&
      id(raw.operationId) &&
      count(raw.expectedCheckpoint) &&
      Number.isSafeInteger(raw.expectedCheckpoint + 1) &&
      (action !== 'activateAdventureRestore' || hash(raw.reviewToken)) &&
      (action !== 'advanceAdventureRestoreCleanup' || raw.limit === 16),
  );
  return Object.freeze({
    restoreId: raw.restoreId,
    jobToken: raw.jobToken,
    operationId: raw.operationId,
    expectedCheckpoint: raw.expectedCheckpoint,
    ...(action === 'activateAdventureRestore' ? { reviewToken: raw.reviewToken } : {}),
    ...(action === 'advanceAdventureRestoreCleanup' ? { limit: 16 } : {}),
  });
}
export function createAdventureRestoreEffectApi(
  ownerId: string,
  guard: () => void,
): AdventureRestoreEffectApi {
  check(recoveryOwner(ownerId));
  const call = (name: string, input: Readonly<Record<string, unknown>>) =>
    callAdventureRestore(ownerId, guard, name, input);
  return {
    mutate(action, input) {
      guard();
      return call(action, mutation(action, input));
    },
    retireActivation(input) {
      guard();
      return call('retireAdventureRestoreActivation', mutation('activateAdventureRestore', input));
    },
    review(input) {
      guard();
      return call('getAdventureRestoreActivationReview', scope(input));
    },
    media(input) {
      guard();
      return call('getAdventureRestoreMediaState', scope(input));
    },
    archive(input) {
      guard();
      return call('getAdventureRestoreArchiveCleanup', scope(input));
    },
    resolve(input) {
      guard();
      check(
        closed(input, ['restoreId', 'jobToken', 'operationId', 'requestHash']) &&
          id(input.restoreId) &&
          hash(input.jobToken) &&
          id(input.operationId) &&
          hash(input.requestHash),
      );
      return call(
        'resolveAdventureRestoreOperation',
        Object.freeze({
          restoreId: input.restoreId,
          jobToken: input.jobToken,
          operationId: input.operationId,
          requestHash: input.requestHash,
        }),
      );
    },
  };
}
