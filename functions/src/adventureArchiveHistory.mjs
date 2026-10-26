const encoder = new TextEncoder(),
  decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const count = (v) => Number.isSafeInteger(v) && v >= 0;
const hash = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
function invalid() {
  throw new TypeError('Manifesto histórico inválido.');
}
function id(value) {
  if (
    typeof value !== 'string' ||
    !value ||
    ['.', '..'].includes(value) ||
    Array.from(value).some(
      (c) => c === '/' || c === '\\' || c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127,
    ) ||
    encoder.encode(value).length > 1500 ||
    decoder.decode(encoder.encode(value)) !== value
  )
    invalid();
  return value;
}
export const ADVENTURE_HISTORY_SEED = 'writer-adventure-history-v1\n';
export function adventureHistoryBodyManifest(versionId, headerHash, native) {
  if (
    !hash(headerHash) ||
    !native ||
    typeof native !== 'object' ||
    Array.isArray(native) ||
    Object.keys(native).length !== 3 ||
    !['byteLength', 'chunkCount', 'contentHash'].every((k) => Object.hasOwn(native, k)) ||
    !count(native.byteLength) ||
    !count(native.chunkCount) ||
    native.chunkCount < 1 ||
    native.chunkCount > Math.max(1, Math.ceil(native.byteLength / 65533)) ||
    !hash(native.contentHash)
  )
    invalid();
  const chunkCount = Math.max(1, Math.ceil(native.byteLength / 65536));
  if (chunkCount > 0xffffffff) invalid();
  return {
    schemaVersion: 1,
    versionId: id(versionId),
    layout: 'fixed64k',
    headerHash,
    byteLength: native.byteLength,
    contentHash: native.contentHash,
    chunkCount,
  };
}
export function adventureHistoryDigestLine(versionId, header, body) {
  if (
    !header ||
    !count(header.byteLength) ||
    header.byteLength < 1 ||
    !count(header.chunkCount) ||
    header.chunkCount !== Math.ceil(header.byteLength / 65536) ||
    !hash(header.contentHash) ||
    !body ||
    body.versionId !== versionId ||
    body.headerHash !== header.contentHash ||
    !count(body.byteLength) ||
    body.chunkCount !== Math.max(1, Math.ceil(body.byteLength / 65536)) ||
    !hash(body.contentHash)
  )
    invalid();
  return (
    JSON.stringify([
      'version',
      id(versionId),
      header.byteLength,
      header.chunkCount,
      header.contentHash,
      body.byteLength,
      body.chunkCount,
      body.contentHash,
    ]) + '\n'
  );
}
export function adventureHistoryManifest(versions, nativeRecords, textBytes, digest) {
  if (
    !count(versions) ||
    !count(nativeRecords) ||
    !count(textBytes) ||
    !hash(digest) ||
    (versions === 0 ? nativeRecords !== 0 || textBytes !== 0 : nativeRecords < versions * 2)
  )
    invalid();
  return { schemaVersion: 1, versions, nativeRecords, textBytes, digest };
}
