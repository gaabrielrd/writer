import {
  PORTABLE_BACKUP_LIMITS,
  createPortableBackupContainer,
} from './portableBackupContainer.mjs';
export const BOOK_BACKUP_LIMITS = PORTABLE_BACKUP_LIMITS;
export class BookBackupFormatError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'BookBackupFormatError';
    this.code = code;
  }
}

export const {
  encodeBackup: encodeBookBackup,
  readBackupFrame: readBookBackupFrame,
  decodeBackup: decodeBookBackup,
  readBackupIndexedPart: readBookBackupIndexedPart,
} = createPortableBackupContainer('WRITER-BOOK\n', BookBackupFormatError);
