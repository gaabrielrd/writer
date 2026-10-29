import { CAMPAIGN_BASE_CHUNK_BYTES as CHUNK } from './campaignBackupBaseDefinitions.mjs';
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const safe = (n) => Number.isSafeInteger(n) && n >= 0;
export const campaignTextUnit = (section) => section === 'base:field' || section === 'anchor:field';
export function campaignFieldChunkCount(bytes, chunks) {
  return (
    safe(bytes) &&
    safe(chunks) &&
    chunks >= Math.max(1, Math.ceil(bytes / CHUNK)) &&
    chunks <= Math.max(1, Math.ceil(bytes / (CHUNK - 3)))
  );
}
/** Native chunks end at the last complete UTF-8 character that fits the 64 KiB budget. */
export function campaignFieldChunk(value, index, chunks, bytes, previousLength) {
  if (
    !(value instanceof Uint8Array) ||
    !campaignFieldChunkCount(bytes, chunks) ||
    !safe(index) ||
    index >= chunks ||
    value.length > CHUNK ||
    value.length > bytes ||
    (bytes === 0 ? value.length !== 0 : value.length === 0) ||
    (index < chunks - 1 && value.length < CHUNK - 3)
  )
    return false;
  try {
    decoder.decode(value);
  } catch {
    return false;
  }
  if (index > 0) {
    if (!Number.isInteger(previousLength) || previousLength < CHUNK - 3 || previousLength > CHUNK)
      return false;
    if (previousLength < CHUNK) {
      const first = value[0],
        width = first < 0x80 ? 1 : first < 0xe0 ? 2 : first < 0xf0 ? 3 : 4;
      if (width <= CHUNK - previousLength) return false;
    }
  }
  return true;
}
