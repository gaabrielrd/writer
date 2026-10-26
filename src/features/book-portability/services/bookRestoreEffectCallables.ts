import {
  BOOK_RESTORE_EFFECT_ACTIONS,
  type BookRestoreEffectAction,
  type BookRestoreEffectInput,
} from '../model/bookRestoreEffects';
import { callBookBackup } from './bookStructureCallables';
import { restorePreparationCheck as check } from './bookRestorePreparationContracts';
export interface BookRestoreEffectApi {
  mutate(action: BookRestoreEffectAction, input: BookRestoreEffectInput): Promise<unknown>;
  review(input: { restoreId: string; jobToken: string }): Promise<unknown>;
  media(input: { restoreId: string; jobToken: string }): Promise<unknown>;
  archive(input: { restoreId: string; jobToken: string }): Promise<unknown>;
  resolve(input: {
    restoreId: string;
    jobToken: string;
    operationId: string;
    requestHash: string;
  }): Promise<unknown>;
}
export const bookRestoreEffectApi: BookRestoreEffectApi = {
  mutate(action, input) {
    check(BOOK_RESTORE_EFFECT_ACTIONS.includes(action));
    return callBookBackup<unknown>(action, input);
  },
  review: (input) => callBookBackup<unknown>('getBookRestoreActivationReview', input),
  media: (input) => callBookBackup<unknown>('getBookRestoreMediaState', input),
  archive: (input) => callBookBackup<unknown>('getBookRestoreArchiveCleanup', input),
  resolve: (input) => callBookBackup<unknown>('resolveBookRestoreOperation', input),
};
