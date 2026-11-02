import { Blob as NodeBlob } from 'node:buffer';
import { webcrypto } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createBookBackupBlobSource,
  encodeBookBackup,
  decodeBookBackup,
  BOOK_BACKUP_LIMITS,
  type BookBackupRecord,
} from '../index';

afterEach(() => vi.unstubAllGlobals());

describe('leitura local limitada do backup', () => {
  it('lê somente o intervalo pedido e rejeita intervalos fora do arquivo', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const blob = new NodeBlob([bytes]) as unknown as Blob;
    const slice = vi.spyOn(blob, 'slice');
    const whole = vi.spyOn(blob, 'arrayBuffer');
    const source = createBookBackupBlobSource(blob);
    expect(source.size).toBe(5);
    expect(await source.read(1, 2)).toEqual(new Uint8Array([2, 3]));
    expect(slice).toHaveBeenCalledExactlyOnceWith(1, 3);
    expect(whole).not.toHaveBeenCalled();
    for (const [offset, length] of [
      [-1, 1],
      [0, -1],
      [4, 2],
      [0.5, 1],
      [NaN, 1],
      [0, Infinity],
      [Number.MAX_SAFE_INTEGER, 1],
    ]) {
      await expect(source.read(offset!, length!)).rejects.toBeInstanceOf(RangeError);
    }
    expect(slice).toHaveBeenCalledTimes(1);
  });
  it('preserva erro do Blob sem repetir a leitura', async () => {
    const blob = new NodeBlob([new Uint8Array(8)]) as unknown as Blob;
    const failure = new Error('arquivo indisponível');
    const slice = vi.spyOn(blob, 'slice').mockReturnValue({
      arrayBuffer: () => Promise.reject(failure),
    } as Blob);
    await expect(createBookBackupBlobSource(blob).read(0, 4)).rejects.toBe(failure);
    expect(slice).toHaveBeenCalledTimes(1);
  });
  it('expõe codec compartilhado e verifica o selo usando Blob e Web Crypto reais', async () => {
    vi.stubGlobal('crypto', webcrypto);
    const original: BookBackupRecord = {
      kind: 'text',
      id: 'cena-🌙',
      part: 0,
      payload: new TextEncoder().encode('Ação 🌙'),
    };
    const frames: Uint8Array<ArrayBuffer>[] = [];
    for await (const frame of encodeBookBackup([original])) {
      frames.push(new Uint8Array(frame));
    }
    const blob = new NodeBlob(frames) as unknown as Blob;
    const slice = vi.spyOn(blob, 'slice');
    const whole = vi.spyOn(blob, 'arrayBuffer');
    const reader = decodeBookBackup(createBookBackupBlobSource(blob));
    const first = await reader.next();
    expect(first.done).toBe(false);
    if (first.done) throw new Error('Registro ausente.');
    const { payload, ...identity } = first.value;
    expect(identity).toEqual({ kind: original.kind, id: original.id, part: original.part });
    expect(Array.from(payload)).toEqual(Array.from(original.payload));
    const last = await reader.next();
    expect(last.done).toBe(true);
    expect(last.value).toMatchObject({
      records: 1,
      payloadBytes: original.payload.length,
      archiveBytes: blob.size,
    });
    expect(whole).not.toHaveBeenCalled();
    expect(
      slice.mock.calls.every(
        ([start, end]) =>
          (end ?? 0) - (start ?? 0) <=
          BOOK_BACKUP_LIMITS.maxMetadataBytes + BOOK_BACKUP_LIMITS.maxPayloadBytes,
      ),
    ).toBe(true);
  });
});
