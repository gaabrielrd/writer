import type { BookBackupByteSource } from '../model/backupContainer';

/** Only the requested interval is materialized; the archive itself stays in the Blob. */
export function createBookBackupBlobSource(blob: Blob): BookBackupByteSource {
  return {
    size: blob.size,
    async read(offset, length) {
      if (
        !Number.isSafeInteger(offset) ||
        !Number.isSafeInteger(length) ||
        offset < 0 ||
        length < 0 ||
        !Number.isSafeInteger(offset + length) ||
        offset + length > blob.size
      ) {
        throw new RangeError('Intervalo de leitura fora do arquivo.');
      }
      return new Uint8Array(await blob.slice(offset, offset + length).arrayBuffer());
    },
  };
}
