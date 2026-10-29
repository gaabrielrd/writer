import { createSHA256 } from 'hash-wasm';
import { campaignFieldChunk } from './campaignBackupTextChunks.mjs';
import { bad } from './campaignRestoreContracts.mjs';
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }),
  CHUNK = 65536;
function text(bytes) {
  try {
    return decoder.decode(bytes);
  } catch {
    bad();
  }
}
function cut(bytes) {
  const n = Math.min(CHUNK, bytes.length);
  for (let tail = 0; tail <= 3; tail++) {
    try {
      decoder.decode(bytes.subarray(0, n - tail));
      return n - tail;
    } catch {
      /* Retry the preceding UTF-8 boundary, at most three bytes. */
    }
  }
  bad();
}
export async function advanceRestoredBaseField(s, unit, frame, version) {
  if (
    frame.kind !== 'data' ||
    frame.part !== s.part ||
    frame.id !== s.id ||
    !(frame.payload instanceof Uint8Array)
  )
    bad();
  const h = await createSHA256();
  h.init();
  if (s.hashState) {
    const saved = Buffer.from(s.hashState, 'base64');
    if (saved.length > 4096 || saved.toString('base64') !== s.hashState) bad();
    try {
      h.load(saved);
    } catch {
      bad();
    }
  }
  const bytes = Buffer.from(frame.payload),
    final = s.part + 1 === unit.chunkCount;
  if (s.part >= unit.chunkCount || bytes.length > CHUNK || s.bytes + bytes.length > unit.byteLength)
    bad();
  if (
    version !== 1 &&
    !campaignFieldChunk(bytes, s.part, unit.chunkCount, unit.byteLength, s.previousLength)
  )
    bad();
  h.update(bytes);
  s.bytes += bytes.length;
  s.part++;
  const output = [];
  if (version !== 1) output.push(text(bytes));
  else {
    let pending = Buffer.concat([Buffer.from(s.pending, 'base64'), bytes]);
    while (pending.length >= CHUNK || (final && (pending.length || s.written === 0))) {
      const count = cut(pending);
      if (!count && pending.length) bad();
      output.push(text(pending.subarray(0, count)));
      pending = pending.subarray(count);
      if (!pending.length) break;
    }
    if (final && pending.length) {
      output.push(text(pending));
      pending = Buffer.alloc(0);
    }
    if (pending.length > 128) bad();
    s.pending = pending.toString('base64');
  }
  const from = s.written;
  s.written += output.length;
  s.previousLength = bytes.length;
  s.hashState = Buffer.from(h.save()).toString('base64');
  if (final) {
    if (s.bytes !== unit.byteLength || h.digest('hex') !== unit.contentHash || s.pending) bad();
  }
  return { chunks: output.map((content, n) => ({ index: from + n, content })), done: final };
}
