import { createHash, webcrypto } from 'node:crypto';
import { Blob as NodeBlob } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  BookStructureApi,
  BookStructureChunk,
  BookStructureKind,
} from '../../../../functions/src/bookBackupStructure.mjs';
import {
  captureBookBackupStructure,
  verifyBookBackupStructure,
  BookStructureCaptureError,
  encodeBookBackup,
  decodeBookBackup,
  createBookBackupBlobSource,
  type BookBackupRecord,
} from '../index';

const token = (text: string) => createHash('sha256').update(text).digest('hex');
function fixture(count = 2) {
  const anchor = { schemaVersion: 1 as const, bookId: 'book', sourceToken: 'a'.repeat(64) };
  const documents = new Map<string, { body: string; itemToken: string }>();
  documents.set('book/book', {
    body: JSON.stringify({
      book: { title: 'Meu livro' },
      progress: { wordGoal: 1000 },
      cover: { kind: 'none' },
    }),
    itemToken: anchor.sourceToken,
  });
  documents.set('act/ato', {
    body: JSON.stringify({ name: null, order: 1 }),
    itemToken: token('ato'),
  });
  for (let i = 0; i < count; i++)
    documents.set('chapter/c' + String(i).padStart(3, '0'), {
      body: JSON.stringify({ title: 'Capítulo ' + i, content: i ? 'ação 🌙' : '', order: i + 1 }),
      itemToken: token('c' + i),
    });
  const api: BookStructureApi = {
    getSource: vi.fn(() => Promise.resolve({ ...anchor })),
    list: vi.fn((input: Parameters<BookStructureApi['list']>[0]) => {
      const items = [...documents]
        .filter(([key]) => key.startsWith(input.kind + '/'))
        .map(([key, value]) => ({
          id: key.slice(input.kind.length + 1),
          itemToken: value.itemToken,
        }))
        .sort((a, b) => Buffer.compare(Buffer.from(a.id), Buffer.from(b.id)));
      const start = input.cursor === null ? 0 : Number(input.cursor);
      return Promise.resolve({
        ...anchor,
        kind: input.kind,
        items: items.slice(start, start + input.limit),
        nextCursor: items.length > start + input.limit ? String(start + input.limit) : null,
      });
    }),
    read: vi.fn((input: Parameters<BookStructureApi['read']>[0]) => {
      const document = documents.get(input.kind + '/' + input.id);
      if (!document || document.itemToken !== input.itemToken) throw new Error('item mudou');
      const bytes = Buffer.from(document.body);
      return Promise.resolve({
        ...anchor,
        kind: input.kind,
        id: input.id,
        itemToken: input.itemToken,
        index: input.index,
        chunkCount: Math.ceil(bytes.length / 65536),
        byteLength: bytes.length,
        contentHash: token(document.body),
        chunkBase64: bytes
          .subarray(input.index * 65536, (input.index + 1) * 65536)
          .toString('base64'),
      });
    }),
  };
  return { api, anchor, documents };
}
beforeEach(() => vi.stubGlobal('crypto', webcrypto));
afterEach(() => vi.unstubAllGlobals());
function collected() {
  const records: BookBackupRecord[] = [];
  return {
    records,
    write: vi.fn((record: BookBackupRecord) => {
      records.push(record);
      return Promise.resolve();
    }),
  };
}
function body(records: BookBackupRecord[], kind: string, id: string) {
  return Buffer.concat(
    records.filter((r) => r.kind === kind && r.id === id).map((r) => Buffer.from(r.payload)),
  ).toString('utf8');
}

describe('captura provisória da estrutura salva', () => {
  it('preserva 119 capítulos/IDs Unicode em ordem UTF-8, vazio, metadados e páginas; conferência relê somente identidades', async () => {
    const f = fixture(117),
      sink = collected();
    for (const id of ['\ue000', '🌙'])
      f.documents.set('chapter/' + id, {
        body: JSON.stringify({ title: id, content: id }),
        itemToken: token(id),
      });
    const proof = await captureBookBackupStructure({
      bookId: 'book',
      api: f.api,
      write: sink.write,
    });
    expect(proof).toMatchObject({
      source: f.anchor,
      acts: 1,
      chapters: 119,
    });
    expect(proof.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(body(sink.records, 'chapter', 'c000')).toBe(f.documents.get('chapter/c000')!.body);
    expect(body(sink.records, 'book-metadata', 'book')).toBe(f.documents.get('book/book')!.body);
    expect(sink.records.slice(-2).map((r) => r.id)).toEqual(['\ue000', '🌙']);
    expect(f.api.list).toHaveBeenCalledTimes(4);
    const reads = vi.mocked(f.api.read).mock.calls.length;
    await verifyBookBackupStructure(proof, { api: f.api });
    expect(f.api.list).toHaveBeenCalledTimes(8);
    expect(f.api.read).toHaveBeenCalledTimes(reads);
    expect(f.api.getSource).toHaveBeenLastCalledWith({
      bookId: 'book',
      expectedSourceToken: f.anchor.sourceToken,
    });
    for (const [input] of vi.mocked(f.api.list).mock.calls)
      expect(Object.keys(input).sort()).toEqual([
        'bookId',
        'cursor',
        'kind',
        'limit',
        'sourceToken',
      ]);
  });
  it('confere hash exato de item com várias partes e só escreve após recebê-lo completo', async () => {
    const f = fixture(1),
      sink = collected();
    f.documents.get('chapter/c000')!.body = JSON.stringify({
      title: 'Grande',
      content: '🌙ação\u0000'.repeat(35000),
    });
    vi.mocked(f.api.read).mockImplementation((input) => {
      if (input.kind === 'chapter')
        expect(sink.records.some((r) => r.kind === 'chapter')).toBe(false);
      return Promise.resolve(
        chunkFor(f.documents.get(input.kind + '/' + input.id)!, input, f.anchor),
      );
    });
    await captureBookBackupStructure({ bookId: 'book', api: f.api, write: sink.write });
    expect(body(sink.records, 'chapter', 'c000')).toBe(f.documents.get('chapter/c000')!.body);
    expect(sink.records.filter((r) => r.kind === 'chapter').length).toBeGreaterThan(8);
    expect(sink.records.every((r) => r.payload.length <= 65536)).toBe(true);
  });
  it('aguarda sink antes de ler próximo recurso; falha de escrita não repete nem avança', async () => {
    const f = fixture();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered!: () => void;
    const writing = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const write = vi.fn(async () => {
      entered();
      await gate;
      throw new Error('disco indisponível');
    });
    const pending = captureBookBackupStructure({ bookId: 'book', api: f.api, write });
    await writing;
    expect(f.api.read).toHaveBeenCalledTimes(1);
    expect(f.api.list).not.toHaveBeenCalled();
    release();
    await expect(pending).rejects.toThrow('disco indisponível');
    expect(f.api.read).toHaveBeenCalledTimes(1);
    expect(f.api.list).not.toHaveBeenCalled();
  });
  it.each(['metadata', 'recreated', 'added', 'removed'] as const)(
    'conferência final recusa %s sem confiar só no token da raiz',
    async (change) => {
      const f = fixture(),
        sink = collected();
      const proof = await captureBookBackupStructure({
        bookId: 'book',
        api: f.api,
        write: sink.write,
      });
      if (change === 'added')
        f.documents.set('chapter/new', { body: '{}', itemToken: token('new') });
      else if (change === 'removed') f.documents.delete('chapter/c000');
      else f.documents.get('chapter/c000')!.itemToken = token(change);
      await expect(verifyBookBackupStructure(proof, { api: f.api })).rejects.toBeInstanceOf(
        BookStructureCaptureError,
      );
    },
  );
  it('recusa origem diferente no início e após a última página', async () => {
    const f = fixture(),
      sink = collected();
    await expect(
      captureBookBackupStructure({
        bookId: 'book',
        api: f.api,
        write: sink.write,
        source: { ...f.anchor, sourceToken: 'b'.repeat(64) },
      }),
    ).rejects.toBeInstanceOf(BookStructureCaptureError);
    expect(sink.records).toHaveLength(0);
    const proof = await captureBookBackupStructure({
      bookId: 'book',
      api: f.api,
      write: sink.write,
    });
    f.anchor.sourceToken = 'b'.repeat(64);
    await expect(verifyBookBackupStructure(proof, { api: f.api })).rejects.toBeInstanceOf(
      BookStructureCaptureError,
    );
  });
  it('abort antes de HTTP e após resposta/sink interrompe sem entregar prova nem repetir leitura', async () => {
    for (const moment of ['before', 'response', 'sink']) {
      const f = fixture(),
        controller = new AbortController(),
        sink = collected();
      if (moment === 'before') controller.abort();
      if (moment === 'response')
        vi.mocked(f.api.getSource).mockImplementation(() => {
          controller.abort();
          return Promise.resolve(f.anchor);
        });
      const write = vi.fn(async (record: BookBackupRecord) => {
        await sink.write(record);
        if (moment === 'sink') controller.abort();
      });
      await expect(
        captureBookBackupStructure({
          bookId: 'book',
          api: f.api,
          write,
          signal: controller.signal,
        }),
      ).rejects.toMatchObject({ name: 'AbortError' });
      expect(f.api.getSource).toHaveBeenCalledTimes(moment === 'before' ? 0 : 1);
      expect(f.api.list).not.toHaveBeenCalled();
      expect(f.api.read).toHaveBeenCalledTimes(moment === 'sink' ? 1 : 0);
    }
  });
  it.each([
    'extra',
    'wrong-id',
    'bad-hash',
    'oversize',
    'bad-base64',
    'bad-index',
    'bad-json',
    'bad-utf8',
  ] as const)('falha antes de escrever ao receber chunk %s', async (issue) => {
    const f = fixture(),
      sink = collected();
    vi.mocked(f.api.read).mockImplementation(async (input) => {
      const part = await originalChunk(f, input);
      if (issue === 'extra') return { ...part, secret: true };
      if (issue === 'wrong-id') return { ...part, id: 'other' };
      if (issue === 'bad-hash') return { ...part, contentHash: 'b'.repeat(64) };
      if (issue === 'oversize') return { ...part, byteLength: 8 * 1024 * 1024 + 1 };
      if (issue === 'bad-base64') return { ...part, chunkBase64: '!!!!' };
      if (issue === 'bad-index') return { ...part, index: 1 };
      const bytes = issue === 'bad-utf8' ? Buffer.from([0xff]) : Buffer.from('x');
      return {
        ...part,
        chunkBase64: bytes.toString('base64'),
        byteLength: bytes.length,
        contentHash: createHash('sha256').update(bytes).digest('hex'),
      };
    });
    await expect(
      captureBookBackupStructure({ bookId: 'book', api: f.api, write: sink.write }),
    ).rejects.toBeInstanceOf(BookStructureCaptureError);
    expect(sink.write).not.toHaveBeenCalled();
  });
  it.each(['duplicate', 'backwards', 'empty-cursor', 'extra'] as const)(
    'recusa página %s sem laço ou corte silencioso',
    async (issue) => {
      const f = fixture(),
        sink = collected();
      vi.mocked(f.api.list).mockImplementation((input) =>
        Promise.resolve({
          ...f.anchor,
          kind: input.kind,
          items:
            issue === 'duplicate'
              ? [
                  { id: 'x', itemToken: token('x') },
                  { id: 'x', itemToken: token('x') },
                ]
              : issue === 'backwards'
                ? [
                    { id: 'z', itemToken: token('z') },
                    { id: 'a', itemToken: token('a') },
                  ]
                : [],
          nextCursor: issue === 'empty-cursor' ? '' : null,
          ...(issue === 'extra' ? { content: 'private' } : {}),
        }),
      );
      await expect(
        captureBookBackupStructure({ bookId: 'book', api: f.api, write: sink.write }),
      ).rejects.toBeInstanceOf(BookStructureCaptureError);
      expect(f.api.list).toHaveBeenCalledTimes(1);
    },
  );
  it('registros conferidos integram framing M2 e mudança antes do selo impede um arquivo completo', async () => {
    const f = fixture(1),
      sink = collected();
    const proof = await captureBookBackupStructure({
      bookId: 'book',
      api: f.api,
      write: sink.write,
    });
    async function* records() {
      yield* sink.records;
      await verifyBookBackupStructure(proof, { api: f.api });
    }
    const frames: Uint8Array<ArrayBuffer>[] = [];
    for await (const bytes of encodeBookBackup(records())) frames.push(new Uint8Array(bytes));
    const reader = decodeBookBackup(
      createBookBackupBlobSource(new NodeBlob(frames) as unknown as Blob),
    );
    const decoded: BookBackupRecord[] = [];
    for (;;) {
      const next = await reader.next();
      if (next.done) {
        expect(next.value.records).toBe(sink.records.length);
        break;
      }
      decoded.push(next.value);
    }
    expect(decoded.map((r) => [r.kind, r.id, r.part, Array.from(r.payload)])).toEqual(
      sink.records.map((r) => [r.kind, r.id, r.part, Array.from(r.payload)]),
    );
    f.documents.get('chapter/c000')!.itemToken = token('changed after writing');
    const partial: Uint8Array<ArrayBuffer>[] = [];
    await expect(
      (async () => {
        for await (const bytes of encodeBookBackup(records())) partial.push(new Uint8Array(bytes));
      })(),
    ).rejects.toBeInstanceOf(BookStructureCaptureError);
    await expect(
      (async () => {
        for await (const record of decodeBookBackup(
          createBookBackupBlobSource(new NodeBlob(partial) as unknown as Blob),
        ))
          void record;
      })(),
    ).rejects.toMatchObject({ code: 'incomplete-archive' });
  });

  it('interrompe mudança de manifesto e abort entre partes antes de escrever o capítulo parcial', async () => {
    for (const mode of ['manifest', 'abort']) {
      const f = fixture(1),
        sink = collected(),
        controller = new AbortController();
      f.documents.get('chapter/c000')!.body = JSON.stringify({ content: 'x'.repeat(140000) });
      vi.mocked(f.api.read).mockImplementation((input) => {
        const part = chunkFor(f.documents.get(input.kind + '/' + input.id)!, input, f.anchor);
        if (input.kind === 'chapter' && input.index === 1) {
          if (mode === 'abort') controller.abort();
          else part.contentHash = token('another manifest');
        }
        return Promise.resolve(part);
      });
      const pending = captureBookBackupStructure({
        bookId: 'book',
        api: f.api,
        write: sink.write,
        signal: controller.signal,
      });
      if (mode === 'abort') await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
      else await expect(pending).rejects.toBeInstanceOf(BookStructureCaptureError);
      expect(sink.records.some((record) => record.kind === 'chapter')).toBe(false);
      expect(
        vi.mocked(f.api.read).mock.calls.filter(([input]) => input.kind === 'chapter'),
      ).toHaveLength(2);
    }
  });
  it('não repete leitura em erro de transporte e rejeita página repetida antes de reler corpos', async () => {
    const f = fixture(60),
      sink = collected();
    const pageItems = [...f.documents]
      .filter(([key]) => key.startsWith('chapter/'))
      .slice(0, 50)
      .map(([key, item]) => ({ id: key.slice(8), itemToken: item.itemToken }));
    vi.mocked(f.api.list).mockImplementation((input) =>
      Promise.resolve({
        ...f.anchor,
        kind: input.kind,
        items: input.kind === 'act' ? [] : pageItems,
        nextCursor: input.kind === 'act' ? null : input.cursor === null ? '50' : '100',
      }),
    );
    await expect(
      captureBookBackupStructure({ bookId: 'book', api: f.api, write: sink.write }),
    ).rejects.toBeInstanceOf(BookStructureCaptureError);
    expect(
      vi.mocked(f.api.read).mock.calls.filter(([input]) => input.kind === 'chapter'),
    ).toHaveLength(50);
    const failure = new Error('sem resposta');
    vi.mocked(f.api.read).mockRejectedValue(failure);
    vi.mocked(f.api.read).mockClear();
    await expect(
      captureBookBackupStructure({ bookId: 'book', api: f.api, write: sink.write }),
    ).rejects.toBe(failure);
    expect(f.api.read).toHaveBeenCalledTimes(1);
  });
  it('projeto vazio continua exigindo reautorização final e partes entregues não podem alterar as próximas', async () => {
    const f = fixture(0),
      sink = collected();
    f.documents.delete('act/ato');
    const proof = await captureBookBackupStructure({
      bookId: 'book',
      api: f.api,
      write: sink.write,
    });
    expect(proof).toMatchObject({ acts: 0, chapters: 0 });
    await verifyBookBackupStructure(proof, { api: f.api });
    vi.mocked(f.api.getSource).mockRejectedValue(new Error('origem indisponível'));
    await expect(verifyBookBackupStructure(proof, { api: f.api })).rejects.toThrow(
      'origem indisponível',
    );
    const other = fixture(1),
      written: Uint8Array[] = [];
    other.documents.get('chapter/c000')!.body = JSON.stringify({ content: '🌙'.repeat(50000) });
    await captureBookBackupStructure({
      bookId: 'book',
      api: other.api,
      write: (record) => {
        if (record.kind === 'chapter') written.push(new Uint8Array(record.payload));
        record.payload.fill(0);
        return Promise.resolve();
      },
    });
    expect(Buffer.concat(written).toString('utf8')).toBe(other.documents.get('chapter/c000')!.body);
  });
});
function chunkFor(
  document: { body: string; itemToken: string },
  input: { kind: BookStructureKind; id: string; index: number },
  anchor: { schemaVersion: 1; bookId: string; sourceToken: string },
): BookStructureChunk {
  const bytes = Buffer.from(document.body);
  return {
    ...anchor,
    ...input,
    itemToken: document.itemToken,
    chunkCount: Math.ceil(bytes.length / 65536),
    byteLength: bytes.length,
    contentHash: token(document.body),
    chunkBase64: bytes.subarray(input.index * 65536, (input.index + 1) * 65536).toString('base64'),
  };
}
function originalChunk(
  f: ReturnType<typeof fixture>,
  input: Parameters<BookStructureApi['read']>[0],
) {
  return Promise.resolve(chunkFor(f.documents.get(input.kind + '/' + input.id)!, input, f.anchor));
}
