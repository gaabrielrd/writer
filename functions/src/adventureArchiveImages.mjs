const encoder = new TextEncoder(),
  decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const count = (v) => Number.isSafeInteger(v) && v >= 0;
const hash = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
function invalid() {
  throw new TypeError('Manifesto de imagens inválido.');
}
export const ADVENTURE_IMAGES_SEED = 'writer-adventure-images-v1\n';
export const ADVENTURE_IMAGE_SOURCES_SEED = 'writer-adventure-image-sources-v1\n';
export function adventureImageAddressLine(kind, id) {
  if (
    !['scene', 'block'].includes(kind) ||
    typeof id !== 'string' ||
    !id ||
    ['.', '..'].includes(id) ||
    encoder.encode(id).length > 1500 ||
    Array.from(id).some(
      (c) => c === '/' || c === '\\' || c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127,
    ) ||
    decoder.decode(encoder.encode(id)) !== id
  )
    invalid();
  return JSON.stringify(['writer-adventure-image-v1', kind, id]);
}
export function adventureImagesManifest(bindings, assets, bytes, digest) {
  if (
    ![bindings, assets, bytes].every(count) ||
    assets > bindings ||
    !hash(digest) ||
    (assets === 0 ? bytes !== 0 : bytes < assets * 8)
  )
    invalid();
  return { schemaVersion: 1, bindings, assets, bytes, digest };
}
