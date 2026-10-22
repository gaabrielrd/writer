import type { BookResourceApi } from '../../../../functions/src/bookBackupResources.mjs';
import { bookStructureApi, callBookBackup } from './bookStructureCallables';
export const bookResourceApi: BookResourceApi = {
  getSource: bookStructureApi.getSource,
  list: (input) => callBookBackup('listBookBackupResources', input),
  read: (input) => callBookBackup('readBookBackupResource', input),
};
