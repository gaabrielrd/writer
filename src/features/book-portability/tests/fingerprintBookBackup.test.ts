import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { fingerprintBookBackup } from '../index';
describe('full backup fingerprint', () => {
  it('hashes bounded ranges including BOM and final short chunk', async () => {
    const bytes = new Uint8Array(3 * 65536 + 7).fill(65);
    bytes.set([239, 187, 191]);
    const reads: number[][] = [];
    const value = await fingerprintBookBackup({
      size: bytes.length,
      read: (offset, length) => {
        reads.push([offset, length]);
        return Promise.resolve(bytes.slice(offset, offset + length));
      },
    });
    expect(value).toEqual({
      byteLength: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
    expect(reads).toEqual([
      [0, 65536],
      [65536, 65536],
      [131072, 65536],
      [196608, 7],
    ]);
  });
  it('does not report a hash after an abort during I/O', async () => {
    const controller = new AbortController();
    await expect(
      fingerprintBookBackup(
        {
          size: 10,
          read: () => {
            controller.abort();
            return Promise.resolve(new Uint8Array(10));
          },
        },
        { signal: controller.signal },
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('rejects empty/unsafe lengths and incomplete reads', async () => {
    for (const size of [0, -1, NaN, Number.MAX_SAFE_INTEGER + 1])
      await expect(
        fingerprintBookBackup({ size, read: () => Promise.resolve(new Uint8Array()) }),
      ).rejects.toThrow(RangeError);
    await expect(
      fingerprintBookBackup({ size: 2, read: () => Promise.resolve(new Uint8Array(1)) }),
    ).rejects.toThrow('Leitura incompleta');
  });
});
