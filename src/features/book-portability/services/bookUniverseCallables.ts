import type { BookUniverseApi } from '../../../../functions/src/bookBackupUniverse.mjs';
import { bookStructureApi, callBookBackup } from './bookStructureCallables';
export const bookUniverseApi: BookUniverseApi = {
  getSource: bookStructureApi.getSource,
  read: (input) => callBookBackup('getBookBackupUniverse', input),
};
