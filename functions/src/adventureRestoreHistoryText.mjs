import { inconsistent } from './adventureRestoreContracts.mjs';
const decode = (bytes) => new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
const continuation = (b) => (b & 0xc0) === 0x80;
/** Reblock authenticated fixed bytes into complete native UTF-8 parts, retaining less than one part. */
export function reblockAdventureHistoryText(previous, bytes, final, priorParts) {
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.length > 65536 ||
    typeof final !== 'boolean' ||
    !Number.isSafeInteger(priorParts) ||
    priorParts < 0
  )
    inconsistent();
  const before = Buffer.from(previous, 'base64');
  if (before.toString('base64') !== previous || before.length >= 65536) inconsistent();
  let remaining = Buffer.concat([before, bytes]);
  const chunks = [];
  while (remaining.length >= 65536) {
    let end = 65536;
    if (end < remaining.length) {
      while (continuation(remaining[end])) end--;
    } else if (!final) {
      let start = end - 1;
      while (start > 0 && continuation(remaining[start])) start--;
      const lead = remaining[start],
        length = lead < 128 ? 1 : lead < 224 ? 2 : lead < 240 ? 3 : 4;
      if (end - start < length) end = start;
    }
    if (end < 65533 || end > 65536) inconsistent();
    chunks.push(decode(remaining.subarray(0, end)));
    remaining = remaining.subarray(end);
  }
  if (final) {
    if (remaining.length || priorParts + chunks.length === 0) chunks.push(decode(remaining));
    remaining = Buffer.alloc(0);
  }
  if (chunks.length > 2) inconsistent();
  return { chunks, tailBase64: remaining.toString('base64') };
}
