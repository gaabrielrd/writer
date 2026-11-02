import type { BookPersonaApi } from '../../../../functions/src/bookBackupPersonas.mjs';
import { bookStructureApi, callBookBackup } from './bookStructureCallables';
export const bookPersonaApi: BookPersonaApi = {
  getSource: bookStructureApi.getSource,
  list: (input) => callBookBackup('listBookBackupPersonaBindings', input),
  read: (input) => callBookBackup('readBookBackupPersona', input),
};
