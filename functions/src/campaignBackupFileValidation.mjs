import { createCampaignBackupFileScanner } from './campaignBackupFileScanner.mjs';
/** Full bytes/roots/issuance only. Current origin access and restoration remain separate. */
export async function validateCampaignBackupFile(uid, source, options = {}) {
  // Public full review never accepts caller checkpoints or changes its streaming mode.
  const { resumable: _resumable, checkpoint: _checkpoint, ...callbacks } = options;
  if (_resumable !== undefined || _checkpoint !== undefined)
    throw new TypeError('Checkpoint não pertence à revisão completa.');
  const scanner = await createCampaignBackupFileScanner(uid, source, callbacks);
  try {
    for (;;) {
      const next = await scanner.next();
      if (next.done) return next.result;
    }
  } finally {
    scanner.dispose();
  }
}
