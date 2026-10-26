import {
  PORTABLE_BACKUP_LIMITS,
  createPortableBackupContainer,
} from './portableBackupContainer.mjs';
export const ADVENTURE_BACKUP_LIMITS = PORTABLE_BACKUP_LIMITS;
export class AdventureBackupFormatError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AdventureBackupFormatError';
    this.code = code;
  }
}

export const {
  encodeBackup: encodeAdventureBackup,
  readBackupFrame: readAdventureBackupFrame,
  decodeBackup: decodeAdventureBackup,
  readBackupIndexedPart: readAdventureBackupIndexedPart,
} = createPortableBackupContainer('WRITER-ADVN\n', AdventureBackupFormatError);
