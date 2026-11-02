import { createHash } from 'node:crypto';
import { readCampaignBackupFrame } from './campaignBackupContainer.mjs';
export async function readCampaignRestoreJsonUnit(source, active, invalid, maxBytes) {
  const u = active.unit;
  if (u.byteLength > maxBytes || u.chunkCount > Math.ceil(maxBytes / 65536)) invalid();
  const parts = [],
    h = createHash('sha256');
  let cursor = active.start;
  try {
    for (let n = 0; n < u.chunkCount; n++) {
      const step = await readCampaignBackupFrame(source, cursor);
      cursor = step.cursor;
      const r = step.record;
      if (
        !r ||
        r.kind !== 'data' ||
        r.id !== active.id ||
        r.part !== n ||
        r.payload.length !== Math.min(65536, u.byteLength - n * 65536)
      )
        invalid();
      parts.push(Buffer.from(r.payload));
      h.update(r.payload);
    }
    if (h.digest('hex') !== u.contentHash) invalid();
    return Buffer.concat(parts, u.byteLength);
  } finally {
    h.destroy();
  }
}
