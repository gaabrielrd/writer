import type { BookDraftApi } from '../../../../functions/src/bookBackupDraft.mjs';
import { bookStructureApi, callBookBackup } from './bookStructureCallables';
export const bookDraftApi: BookDraftApi = {
  getSource: bookStructureApi.getSource,
  persona: (input) => callBookBackup('getBookBackupDraftPersona', input),
};
