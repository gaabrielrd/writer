import type { BookCoverApi } from '../../../../functions/src/bookBackupCover.mjs';
import { bookStructureApi, callBookBackup } from './bookStructureCallables';
export const bookCoverApi: BookCoverApi = {
  getSource: bookStructureApi.getSource,
  cover: (input) => callBookBackup('getBookBackupCover', input),
  read: (input) => callBookBackup('readBookBackupCoverChunk', input),
  verify: (input) => callBookBackup('verifyBookBackupCover', input),
};
