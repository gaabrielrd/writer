import { createHash } from 'node:crypto';
import { pinnedStorageFile } from './pinnedStorageFile.mjs';
function bound(value, max) {
  if (!Number.isSafeInteger(value) || value < 1 || value > max)
    throw new RangeError('Leitura Storage fora do limite.');
}
export function createBookBackupAssetStorage(bucket) {
  return {
    async metadata(path, generation) {
      const file =
        generation === undefined
          ? bucket().file(path)
          : pinnedStorageFile(bucket, path, generation);
      const [value] = await file.getMetadata();
      return {
        generation: String(value.generation),
        metageneration: String(value.metageneration),
        size: Number(value.size),
        contentType: value.contentType,
        accepted: value.metadata?.accepted === 'true',
      };
    },
    async hashGeneration(path, generation, maxBytes) {
      bound(maxBytes, 16 * 1024 * 1024);
      const stream = pinnedStorageFile(bucket, path, generation).createReadStream({
          decompress: false,
          validation: 'crc32c',
        }),
        hash = createHash('sha256');
      let byteLength = 0,
        prefix = Buffer.alloc(0);
      try {
        for await (const bytes of stream) {
          if (!Buffer.isBuffer(bytes)) throw new TypeError('Bytes Storage inválidos.');
          byteLength += bytes.length;
          if (byteLength > maxBytes) throw new RangeError('Imagem Storage acima do limite.');
          if (prefix.length < 8)
            prefix = Buffer.concat([prefix, bytes.subarray(0, 8 - prefix.length)]);
          hash.update(bytes);
        }
        return { byteLength, contentHash: hash.digest('hex'), signature: prefix.toString('hex') };
      } finally {
        stream.destroy();
      }
    },
    async readRange(path, generation, start, end) {
      if (!Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(end) || end < start)
        throw new RangeError('Range inválido.');
      const length = end - start + 1;
      bound(length, 65536);
      const stream = pinnedStorageFile(bucket, path, generation).createReadStream({
          start,
          end,
          decompress: false,
          validation: false,
        }),
        chunks = [];
      let size = 0;
      try {
        for await (const bytes of stream) {
          if (!Buffer.isBuffer(bytes)) throw new TypeError('Bytes Storage inválidos.');
          size += bytes.length;
          if (size > length) throw new RangeError('Range Storage acima do limite.');
          chunks.push(bytes);
        }
        if (size !== length) throw new RangeError('Range Storage incompleto.');
        return Buffer.concat(chunks, size);
      } finally {
        stream.destroy();
      }
    },
  };
}
