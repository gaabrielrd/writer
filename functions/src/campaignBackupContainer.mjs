import {
  createPortableBackupContainer,
  PORTABLE_BACKUP_LIMITS,
} from './portableBackupContainer.mjs';
export const CAMPAIGN_BACKUP_LIMITS = PORTABLE_BACKUP_LIMITS;
export class CampaignBackupFormatError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CampaignBackupFormatError';
    this.code = code;
  }
}
export const {
  encodeBackup: encodeCampaignBackup,
  readBackupFrame: readCampaignBackupFrame,
  decodeBackup: decodeCampaignBackup,
  createBackupEncoder: createCampaignBackupEncoder,
} = createPortableBackupContainer('WRITER-CAMP\n', CampaignBackupFormatError);
