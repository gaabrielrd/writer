// @vitest-environment node
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listEditorialHistory, readEditorialHistory } from '../services/bookEditorialHistoryApi';

const call = vi.hoisted(() => vi.fn());
vi.mock('../services/bookStructureCallables', () => ({ callBookBackup: call }));
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
function fixture(text = 'Texto original 🌙\r\nsem alterações') {
  const bytes = Buffer.from(text),
    id = 'a'.repeat(64);
  const metadata = {
    id,
    recordKind: 'book-editorial-artifact',
    artifact: { kind: 'document', revision: 2, availability: 'included', role: 'progress' },
    byteLength: bytes.length,
    chunkCount: Math.ceil(bytes.length / 65536),
    contentHash: sha(bytes),
  };
  const header = { schemaVersion: 1, bookId: 'book', ...metadata, readToken: 'b'.repeat(64) };
  call.mockImplementation((method: string, input: { index: number }) => {
    if (method === 'listBookEditorialHistory')
      return Promise.resolve({ schemaVersion: 1, bookId: 'book', items: [metadata], next: null });
    if (method === 'getBookEditorialHistory') return Promise.resolve(header);
    const part = bytes.subarray(input.index * 65536, (input.index + 1) * 65536);
    return Promise.resolve({
      schemaVersion: 1,
      bookId: 'book',
      index: input.index,
      byteLength: part.length,
      chunkBase64: part.toString('base64'),
      contentHash: sha(part),
      done: input.index + 1 === metadata.chunkCount,
    });
  });
  return { id, bytes, metadata, header, text };
}
beforeEach(() => call.mockReset());
describe('leitura privada do arquivo editorial', () => {
  it('consulta uma página limitada sob o guard da sessão', async () => {
    const f = fixture(),
      guard = vi.fn();
    expect(await listEditorialHistory('book', null, guard)).toEqual({
      items: [f.metadata],
      next: null,
    });
    expect(call).toHaveBeenCalledWith('listBookEditorialHistory', {
      bookId: 'book',
      after: null,
      limit: 25,
    });
    expect(guard).toHaveBeenCalledTimes(2);
  });
  it('recompõe todas as partes, preserva UTF-8/BOM e reautoriza antes de entregar', async () => {
    const f = fixture('\ufeff' + 'História 🌙\r\n'.repeat(15000));
    expect(await readEditorialHistory('book', f.id, () => {})).toBe(f.text);
    const headers = call.mock.calls.filter(([method]) => method === 'getBookEditorialHistory');
    expect(headers).toHaveLength(2);
    expect(
      call.mock.calls.filter(([method]) => method === 'readBookEditorialHistoryPart'),
    ).toHaveLength(f.metadata.chunkCount);
  });
  it('recusa conteúdo cuja parte não corresponde ao SHA informado', async () => {
    const f = fixture();
    call
      .mockImplementationOnce(() => Promise.resolve(f.header))
      .mockImplementationOnce(() =>
        Promise.resolve({
          schemaVersion: 1,
          bookId: 'book',
          index: 0,
          byteLength: f.bytes.length,
          chunkBase64: Buffer.alloc(f.bytes.length).toString('base64'),
          contentHash: sha(f.bytes),
          done: true,
        }),
      );
    await expect(readEditorialHistory('book', f.id, () => {})).rejects.toThrow('conferir');
  });
  it('recusa um agregado diferente mesmo quando a parte está íntegra', async () => {
    const f = fixture();
    call.mockImplementationOnce(() =>
      Promise.resolve({ ...f.header, contentHash: 'c'.repeat(64) }),
    );
    await expect(readEditorialHistory('book', f.id, () => {})).rejects.toThrow('conferir');
  });
  it('não entrega bytes quando a prova final de origem mudou', async () => {
    const f = fixture(),
      implementation = call.getMockImplementation()!;
    let reads = 0;
    call.mockImplementation((method: string, input: { index: number }) => {
      if (method === 'getBookEditorialHistory' && ++reads === 2)
        return Promise.resolve({ ...f.header, readToken: 'c'.repeat(64) });
      return implementation(method, input);
    });
    await expect(readEditorialHistory('book', f.id, () => {})).rejects.toThrow('conferir');
  });
  it('interrompe após revogação do guard sem fazer a consulta seguinte', async () => {
    const f = fixture(),
      guard = vi
        .fn()
        .mockImplementationOnce(() => {})
        .mockImplementation(() => {
          throw Error('Conta alterada');
        });
    await expect(readEditorialHistory('book', f.id, guard)).rejects.toThrow('Conta alterada');
    expect(call).toHaveBeenCalledTimes(1);
  });
  it('recusa tamanho excessivo antes de solicitar partes', async () => {
    const f = fixture();
    call.mockResolvedValue({ ...f.header, byteLength: 8 * 1024 * 1024 + 1, chunkCount: 129 });
    await expect(readEditorialHistory('book', f.id, () => {})).rejects.toThrow('conferir');
    expect(call).toHaveBeenCalledTimes(1);
  });
  it('recusa uma página de outro livro', async () => {
    fixture();
    call.mockResolvedValue({ schemaVersion: 1, bookId: 'other', items: [], next: null });
    await expect(listEditorialHistory('book', null, () => {})).rejects.toThrow('conferir');
  });
});
