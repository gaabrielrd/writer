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
vi.mock('@/features/document-import', () => ({ extractLoreDocument: vi.fn() }));
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
it('uploads original bytes and complete extracted source separately, then seals', async () => {
  const file = {
    name: 'atlas.pdf',
    size: 3,
    arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3]).buffer),
  } as File;
  const result = await uploadLoreImport({
    id: 'session',
    files: [file],
    signal: new AbortController().signal,
    onProgress: vi.fn(),
  });
  expect(result.state).toBe('analyzing');
  expect(invoke).toHaveBeenCalledWith(
    'appendUniverseLoreImport',
    expect.objectContaining({ kind: 'bytes', payload: 'AQID' }),
  );
  expect(invoke).toHaveBeenCalledWith(
    'appendUniverseLoreImport',
    expect.objectContaining({ kind: 'source', payload: 'Arthur voltou.', page: 3 }),
  );
  expect(invoke.mock.calls.at(-1)?.[0]).toBe('sealUniverseLoreImport');
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
