import {
  BOOK_RESTORE_PREPARATION_COMMANDS,
  type BookRestorePreparationApi,
} from '../model/bookRestorePreparation';
import { callBookBackup } from './bookStructureCallables';
import { restorePreparationCheck } from './bookRestorePreparationContracts';

export const bookRestorePreparationApi: BookRestorePreparationApi = {
  get(input) {
    return callBookBackup<unknown>('getBookRestore', input);
  },
  advance(action, input) {
    restorePreparationCheck(BOOK_RESTORE_PREPARATION_COMMANDS.includes(action));
    return callBookBackup<unknown>(action, input);
  },
};
