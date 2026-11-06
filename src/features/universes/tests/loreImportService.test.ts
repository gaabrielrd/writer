import { beforeEach, expect, it, vi } from 'vitest';
import {
  uploadLoreImport,
  getPendingLoreImport,
  rememberLoreImport,
  clearPendingLoreImport,
} from '../services/loreImportService';
import { extractLoreDocument } from '@/features/document-import';
const invoke = vi.hoisted(() =>
  vi.fn<(name: string, input: Record<string, unknown>) => Promise<{ data: unknown }>>(),
);
vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(),
  httpsCallable: (_f: unknown, name: string) => (input: Record<string, unknown>) =>
    invoke(name, input),
}));
vi.mock('@/shared/lib', () => ({ getFirebaseApp: vi.fn() }));
vi.mock('@/features/document-import', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/document-import')>()),
  extractLoreDocument: vi.fn(),
}));
beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  vi.mocked(extractLoreDocument).mockResolvedValue([{ page: 3, text: 'Arthur voltou.' }]);
  invoke.mockImplementation((name) =>
    Promise.resolve({
      data: {
        id: 'session',
        state: name === 'sealUniverseLoreImport' ? 'analyzing' : 'uploading',
        candidates: [],
        existing: [],
        cursor: 0,
        total: 1,
      },
    }),
  );
});
it('uploads prepared text and hashes without rereading or sending original bytes after extraction', async () => {
  const readOriginal = vi.fn(() => Promise.reject(new Error('O original não deve ser enviado.')));
  const file = {
    name: 'atlas.pdf',
    size: 3,
    arrayBuffer: readOriginal,
  } as unknown as File;
  const result = await uploadLoreImport({
    id: 'session',
    files: [file],
    signal: new AbortController().signal,
    onProgress: vi.fn(),
  });
  expect(result.state).toBe('analyzing');
  expect(readOriginal).not.toHaveBeenCalled();
  const start = invoke.mock.calls.find(([name]) => name === 'startUniverseLoreImport')![1];
  expect(start.version).toBe(2);
  const files = start.files as Array<Record<string, unknown>>;
  expect(files).toHaveLength(1);
  expect(files[0]!.sourceBytes).toBe(14);
  expect(files[0]!.sourceHash).toMatch(/^[a-f0-9]{64}$/);
  expect(invoke).toHaveBeenCalledWith(
    'appendUniverseLoreImport',
    expect.objectContaining({
      kind: 'source',
      payload: 'Arthur voltou.',
      spans: [{ start: 0, end: 14, page: 3 }],
    }),
  );
  const appended = invoke.mock.calls.find(([name]) => name === 'appendUniverseLoreImport')![1];
  expect(appended.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(invoke.mock.calls.at(-1)?.[0]).toBe('sealUniverseLoreImport');
});
it('resumes legacy uploads with original bytes and the original per-page source contract', async () => {
  const file = {
    name: 'atlas.pdf',
    size: 3,
    arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3]).buffer),
  } as File;
  await uploadLoreImport({
    id: 'session',
    version: 1,
    files: [file],
    signal: new AbortController().signal,
    onProgress: vi.fn(),
  });
  expect(extractLoreDocument).toHaveBeenCalledWith(
    file,
    expect.objectContaining({ legacyLore: true }),
  );
  expect(invoke).toHaveBeenCalledWith(
    'appendUniverseLoreImport',
    expect.objectContaining({ kind: 'bytes', payload: 'AQID' }),
  );
  expect(invoke).toHaveBeenCalledWith(
    'appendUniverseLoreImport',
    expect.objectContaining({ kind: 'source', payload: 'Arthur voltou.', page: 3 }),
  );
});
it('preserves long sources through overlapping parts rather than truncation', async () => {
  const text = 'Arthur '.repeat(4000);
  vi.mocked(extractLoreDocument).mockResolvedValue([{ page: null, text }]);
  const file = {
    name: 'lore.txt',
    size: 3,
    arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3]).buffer),
  } as File;
  await uploadLoreImport({
    id: 'session',
    files: [file],
    signal: new AbortController().signal,
    onProgress: vi.fn(),
  });
  const pieces = invoke.mock.calls
    .filter(([name, value]) => name === 'appendUniverseLoreImport' && value.kind === 'source')
    .map(([, value]) => value.payload as string);
  expect(pieces.length).toBeGreaterThan(1);
  expect(pieces.every((part) => part.length <= 12000)).toBe(true);
  expect(pieces[0]!.slice(-300)).toBe(pieces[1]!.slice(0, 300));
  expect(
    pieces[0] +
      pieces
        .slice(1)
        .map((part) => part.slice(300))
        .join(''),
  ).toBe(text);
});
it('checks cancellation before sending and keeps only operation identity in session storage', async () => {
  rememberLoreImport('author', 'session', 'world');
  expect(getPendingLoreImport('author', 'world')).toBe('session');
  expect(getPendingLoreImport('other', 'world')).toBeNull();
  clearPendingLoreImport('author', 'world');
  expect(getPendingLoreImport('author', 'world')).toBeNull();
  const abort = new AbortController();
  abort.abort();
  await expect(
    uploadLoreImport({
      id: 'session',
      files: [{ name: 'lore.txt', size: 3 } as File],
      signal: abort.signal,
      onProgress: vi.fn(),
    }),
  ).rejects.toThrow();
  expect(invoke).not.toHaveBeenCalled();
});
