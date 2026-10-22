import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { BookBackupByteSource } from '../model/backupContainer';

/** Full file hash for upload identity; the container chain hash is a separate proof. */
export async function fingerprintBookBackup(
  source: BookBackupByteSource,
  options: { signal?: AbortSignal } = {},
): Promise<{ byteLength: number; sha256: string }> {
  const size = source.size,
    read = source.read.bind(source),
    signal = options.signal;
  if (!Number.isSafeInteger(size) || size < 1)
    throw new RangeError('Arquivo vazio ou tamanho inválido.');
  signal?.throwIfAborted();
  const hash = sha256.create();
  try {
    for (let offset = 0; offset < size;) {
      signal?.throwIfAborted();
      const length = Math.min(65536, size - offset);
      const bytes = await read(offset, length);
      signal?.throwIfAborted();
      if (!(bytes instanceof Uint8Array) || bytes.byteLength !== length)
        throw new RangeError('Leitura incompleta do arquivo.');
      hash.update(bytes);
      offset += length;
    }
    signal?.throwIfAborted();
    return { byteLength: size, sha256: bytesToHex(hash.digest()) };
  } finally {
    hash.destroy();
  }
}
