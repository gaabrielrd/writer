import type { BookEditorialCaptureApi } from '../../../../functions/src/bookEditorialCaptureCatalog.mjs';
import { callBookBackup } from './bookStructureCallables';
/** Shared sector transport; no Firebase initialization until an action is invoked. */
export const bookEditorialApi: BookEditorialCaptureApi = {
  getSource: (input) => callBookBackup('getBookEditorialCaptureSource', input),
  catalog: (input) => callBookBackup('getBookEditorialCaptureCatalog', input),
  list: (input) => callBookBackup('listBookEditorialCaptureRecords', input),
  read: (input) => callBookBackup('readBookEditorialCaptureRecord', input),
  inspect: (input) => callBookBackup('inspectBookEditorialCaptureRecord', input),
  verify: (input) => callBookBackup('verifyBookEditorialCaptureRecord', input),
  verifySource: (input) => callBookBackup('verifyBookEditorialCaptureSource', input),
};
