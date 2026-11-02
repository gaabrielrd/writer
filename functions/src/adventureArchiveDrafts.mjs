export const ADVENTURE_DRAFTS_SEED = 'writer-adventure-drafts-v1\n';
export function adventureDraftsManifest(count, bytes, digest) {
  if (
    ![0, 1].includes(count) ||
    !Number.isSafeInteger(bytes) ||
    bytes < 0 ||
    (count === 0 && bytes !== 0) ||
    typeof digest !== 'string' ||
    !/^[a-f0-9]{64}$/.test(digest)
  )
    throw new TypeError('Manifesto de rascunho inválido.');
  return { schemaVersion: 1, count, bytes, digest };
}
