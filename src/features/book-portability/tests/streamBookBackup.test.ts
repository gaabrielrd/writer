import { createHash, webcrypto } from 'node:crypto';
import type { BookStructureApi } from '../../../../functions/src/bookBackupStructure.mjs';
import type { BookResourceApi } from '../../../../functions/src/bookBackupResources.mjs';
import type { BookPersonaApi } from '../../../../functions/src/bookBackupPersonas.mjs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  streamBookBackup,
  saveBookBackup,
  createBookBackupFileSink,
  inspectBookBackupPackage,
  decodeBookBackup,
  type BookBackupOptions,
  type BookBackupSink,
} from '../index';
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const text = (s: string) => new TextEncoder().encode(s);
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function fixture() {
  const anchor = { schemaVersion: 1 as const, bookId: 'book', sourceToken: 'a'.repeat(64) };
  const metadata = JSON.stringify({
    book: { title: 'Livro' },
    progress: {},
    cover: { kind: 'none' },
  });
  const getSource = vi.fn(() => Promise.resolve({ ...anchor }));
  const unexpected = vi.fn(() => {
    throw new Error('Unexpected read');
  });
  const structure: NonNullable<BookBackupOptions['apis']>['structure'] = {
    getSource,
    list: vi.fn((input: Parameters<BookStructureApi['list']>[0]) =>
      Promise.resolve({ ...anchor, kind: input.kind, items: [], nextCursor: null }),
    ),
    read: vi.fn((input: Parameters<BookStructureApi['read']>[0]) =>
      Promise.resolve({
        ...anchor,
        kind: input.kind,
        id: input.id,
        itemToken: input.itemToken,
        index: input.index,
        chunkCount: 1,
        byteLength: Buffer.byteLength(metadata),
        contentHash: hash(metadata),
        chunkBase64: Buffer.from(metadata).toString('base64'),
      }),
    ),
  };
  const resources: NonNullable<BookBackupOptions['apis']>['resources'] = {
    getSource,
    list: vi.fn((input: Parameters<BookResourceApi['list']>[0]) =>
      Promise.resolve({
        ...anchor,
        kind: input.kind,
        parentId: input.parentId,
        items: [],
        nextCursor: null,
      }),
    ),
    read: unexpected,
  };
  const personas: NonNullable<BookBackupOptions['apis']>['personas'] = {
    getSource,
    list: vi.fn((input: Parameters<BookPersonaApi['list']>[0]) =>
      Promise.resolve({
        ...anchor,
        kind: input.kind,
        items:
          input.kind === 'book' ? [{ id: 'book', personaId: null, itemToken: 'b'.repeat(64) }] : [],
        nextCursor: null,
      }),
    ),
    read: unexpected,
  };
  const universe: NonNullable<BookBackupOptions['apis']>['universe'] = {
    getSource,
    read: vi.fn(() =>
      Promise.resolve({
        ...anchor,
        origin: { kind: 'none' as const },
        universeToken: 'c'.repeat(64),
      }),
    ),
  };
  const draft: NonNullable<BookBackupOptions['apis']>['draft'] = { getSource, persona: unexpected };
  const cover: NonNullable<BookBackupOptions['apis']>['cover'] = {
    getSource,
    cover: vi.fn(() =>
      Promise.resolve({ ...anchor, coverToken: 'd'.repeat(64), cover: { kind: 'none' as const } }),
    ),
    read: unexpected,
    verify: vi.fn(() => Promise.resolve({ ...anchor, coverToken: 'd'.repeat(64) })),
  };
  const proof = {
    schemaVersion: 1 as const,
    target: { kind: 'book' as const, id: 'book' },
    source: { schemaVersion: 1 as const, historyRevision: 0, sourceToken: 'e'.repeat(64) },
    versions: 0,
    byteLength: 0,
    chunkCount: 0,
  };
  const history = {
    stream: vi.fn(async function* () {
      await Promise.resolve();
      yield* [];
      return proof;
    }),
    verify: vi.fn(() => Promise.resolve()),
  };
  const options: BookBackupOptions = {
    history,
    apis: { structure, resources, personas, universe, draft, cover },
  };
  const chunks: Uint8Array[] = [];
  const sink: BookBackupSink = {
    write: vi.fn((bytes: Uint8Array) => {
      chunks.push(bytes.slice());
      return Promise.resolve();
    }),
    close: vi.fn(() => Promise.resolve()),
    abort: vi.fn(() => Promise.resolve()),
  };
  return {
    options,
    anchor,
    structure,
    resources,
    personas,
    universe,
    cover,
    history,
    chunks,
    sink,
    getSource,
    metadata,
  };
}
function source(chunks: Uint8Array[]) {
  const bytes = Buffer.concat(chunks);
  return {
    size: bytes.length,
    read: (offset: number, length: number) =>
      Promise.resolve(bytes.subarray(offset, offset + length)),
  };
}
beforeEach(() => vi.stubGlobal('crypto', webcrypto));
afterEach(() => vi.unstubAllGlobals());
it('writes all seven sections including explicit absence, reverifies each domain and closes only after a sealed package', async () => {
  const f = fixture(),
    seal = await saveBookBackup('book', f.options, f.sink),
    report = await inspectBookBackupPackage(source(f.chunks));
  expect(report.validation).toBe('envelope-only');
  expect(report.seal).toMatchObject(seal);
  expect(seal.records).toBe(9);
  expect(f.history.verify).toHaveBeenCalledWith(
    expect.objectContaining({ target: { kind: 'book', id: 'book' } }),
    expect.any(Object),
  );
  expect(f.universe.read).toHaveBeenCalledTimes(2);
  expect(f.cover.verify).toHaveBeenCalledTimes(2);
  expect(f.structure.list).toHaveBeenCalledTimes(4);
  expect(f.personas.list).toHaveBeenCalledTimes(6);
  expect(f.sink.close).toHaveBeenCalledOnce();
  expect(f.sink.abort).not.toHaveBeenCalled();
  const all = Buffer.concat(f.chunks).toString('utf8');
  for (const token of ['a', 'b', 'c', 'd', 'e']) expect(all).not.toContain(token.repeat(64));
  expect(f.getSource).toHaveBeenLastCalledWith({
    bookId: 'book',
    expectedSourceToken: f.anchor.sourceToken,
  });
});
it('freezes the draft before awaiting the destination and preserves an explicit empty or removed chapter', async () => {
  const f = fixture(),
    destination = deferred<BookBackupSink>();
  const draft = {
    chapter: {
      id: 'removed',
      bookId: 'book',
      title: 'Original',
      order: 1,
      createdAt: 1,
      updatedAt: 2,
    },
    content: '\ufeffOwn 🌙',
  };
  f.options.draft = draft;
  const saving = saveBookBackup('book', f.options, destination.promise);
  draft.content = 'Changed';
  draft.chapter.title = 'Changed';
  f.options.draft = null;
  destination.resolve(f.sink);
  await saving;
  const records = [];
  for await (const record of decodeBookBackup(source(f.chunks))) records.push(record);
  expect(
    Buffer.concat(
      records.filter((r) => r.kind === 'book-draft-text').map((r) => r.payload),
    ).toString('utf8'),
  ).toBe('\ufeffOwn 🌙');
  expect(
    (
      JSON.parse(
        Buffer.concat(
          records.filter((r) => r.kind === 'book-draft').map((r) => r.payload),
        ).toString('utf8'),
      ) as { chapter: { title: string } }
    ).chapter.title,
  ).toBe('Original');
});
it('awaits each sink write before producing another frame or requesting the next section', async () => {
  const f = fixture(),
    entered = deferred<void>(),
    gate = deferred<void>();
  vi.mocked(f.sink.write).mockImplementationOnce(async () => {
    entered.resolve();
    await gate.promise;
  });
  const saving = saveBookBackup('book', f.options, f.sink);
  await entered.promise;
  await tick();
  expect(f.sink.write).toHaveBeenCalledOnce();
  expect(f.getSource).not.toHaveBeenCalled();
  expect(f.sink.close).not.toHaveBeenCalled();
  gate.resolve();
  await saving;
  expect(f.sink.close).toHaveBeenCalledOnce();
});
it.each(['history', 'root', 'universe', 'cover'] as const)(
  'does not seal or commit after %s changes during final verification',
  async (domain) => {
    const f = fixture(),
      changed = new Error('changed');
    if (domain === 'history') f.history.verify.mockRejectedValueOnce(changed);
    if (domain === 'root')
      f.getSource.mockImplementation(() =>
        Promise.resolve({
          ...f.anchor,
          sourceToken: f.history.verify.mock.calls.length ? 'f'.repeat(64) : f.anchor.sourceToken,
        }),
      );
    if (domain === 'universe')
      vi.mocked(f.universe.read)
        .mockResolvedValueOnce({
          ...f.anchor,
          origin: { kind: 'none' },
          universeToken: 'c'.repeat(64),
        })
        .mockResolvedValue({
          ...f.anchor,
          origin: { kind: 'none' },
          universeToken: 'f'.repeat(64),
        });
    if (domain === 'cover')
      vi.mocked(f.cover.verify)
        .mockResolvedValueOnce({ ...f.anchor, coverToken: 'd'.repeat(64) })
        .mockRejectedValue(changed);
    await expect(saveBookBackup('book', f.options, f.sink)).rejects.toThrow();
    expect(f.sink.close).not.toHaveBeenCalled();
    expect(f.sink.abort).toHaveBeenCalledOnce();
    await expect(inspectBookBackupPackage(source(f.chunks))).rejects.toThrow();
  },
);
it('revokes consumption after a context change and preserves primary and abort errors', async () => {
  const f = fixture(),
    primary = new Error('disk full'),
    cleanup = new Error('abort failed');
  vi.mocked(f.sink.write).mockRejectedValueOnce(primary);
  vi.mocked(f.sink.abort).mockRejectedValueOnce(cleanup);
  await expect(saveBookBackup('book', f.options, f.sink)).rejects.toMatchObject({
    errors: [primary, cleanup],
  });
  expect(f.getSource).not.toHaveBeenCalled();
  expect(f.sink.close).not.toHaveBeenCalled();
  const g = fixture();
  let current = true;
  g.options.isCurrent = () => current;
  vi.mocked(g.sink.write).mockImplementationOnce(() => {
    current = false;
    return Promise.resolve();
  });
  await expect(saveBookBackup('book', g.options, g.sink)).rejects.toMatchObject({
    name: 'AbortError',
  });
  expect(g.sink.abort).toHaveBeenCalledOnce();
  expect(g.sink.close).not.toHaveBeenCalled();
});
it('returns no success for missing history port, rejected destination or file close failure', async () => {
  const f = fixture();
  expect(() =>
    streamBookBackup('book', { ...f.options, history: {} as BookBackupOptions['history'] }),
  ).toThrow();
  await expect(
    saveBookBackup('book', f.options, Promise.reject(new Error('picker cancelled'))),
  ).rejects.toThrow('picker cancelled');
  expect(f.getSource).not.toHaveBeenCalled();
  vi.mocked(f.sink.close).mockRejectedValueOnce(new Error('close failed'));
  await expect(saveBookBackup('book', f.options, f.sink)).rejects.toThrow('close failed');
  expect(f.sink.abort).toHaveBeenCalledOnce();
});
it('temporary file adapter copies frames, commits once and refuses writes after abort or close', async () => {
  const written: Uint8Array[] = [],
    writer = {
      write: vi.fn((bytes: Uint8Array) => {
        written.push(bytes);
        return Promise.resolve();
      }),
      close: vi.fn(() => Promise.resolve()),
      abort: vi.fn(() => Promise.resolve()),
    };
  const createWritable = vi.fn(() =>
    Promise.resolve(writer as unknown as FileSystemWritableFileStream),
  );
  const sink = await createBookBackupFileSink({ createWritable }),
    frame = text('original');
  expect(createWritable).toHaveBeenCalledWith({ keepExistingData: false });
  await sink.write(frame);
  frame.fill(0);
  expect(new TextDecoder().decode(written[0])).toBe('original');
  await sink.close();
  await sink.abort('late');
  expect(writer.abort).not.toHaveBeenCalled();
  await expect(sink.write(frame)).rejects.toThrow();
  await expect(sink.close()).rejects.toThrow();
  const second = await createBookBackupFileSink({ createWritable });
  await second.abort('cancel');
  await second.abort('again');
  expect(writer.abort).toHaveBeenCalledOnce();
  await expect(second.write(frame)).rejects.toThrow();
});
