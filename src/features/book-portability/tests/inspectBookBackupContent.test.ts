import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { encodeBookBackup } from '../model/backupContainer';
import {
  bookPackageHeader,
  bookPackageEnd,
  createBookPackageCounts,
  countBookPackageRecord,
  bookPackageSection,
} from '../../../../functions/src/bookBackupPackage.mjs';
import { BOOK_RESOURCE_KINDS } from '../../../../functions/src/bookBackupResources.mjs';
import type { BookValidationIndex } from '../../../../functions/src/bookBackupContent.mjs';
import { createBookValidationIndex } from '../services/bookValidationIndex';
import { inspectBookBackupContent } from '../services/inspectBookBackupContent';
vi.mock('../services/bookValidationIndex', () => ({ createBookValidationIndex: vi.fn() }));
function indexFixture() {
  const data = new Map<string, Record<string, unknown>>();
  const index: BookValidationIndex & { dispose: ReturnType<typeof vi.fn<() => Promise<void>>> } = {
    add: async (key, value) => {
      await Promise.resolve();
      const k = JSON.stringify(key);
      if (data.has(k)) throw new Error('duplicate');
      data.set(k, value);
    },
    get: async (key) => {
      await Promise.resolve();
      return data.get(JSON.stringify(key));
    },
    dispose: vi.fn(() => Promise.resolve()),
  };
  return index;
}
async function source() {
  const values = [
    ['book-metadata', { book: { title: 'Livro' }, progress: {}, cover: { kind: 'none' } }],
    [
      'book-resources',
      { schemaVersion: 1, counts: Object.fromEntries(BOOK_RESOURCE_KINDS.map((k) => [k, 0])) },
    ],
    [
      'book-personas',
      {
        schemaVersion: 1,
        owners: { book: 1, chapter: 0, 'scene-source': 0 },
        bindings: { book: 0, chapter: 0, 'scene-source': 0 },
      },
    ],
    ['book-universe', { schemaVersion: 1, origin: { kind: 'none' } }],
    ['work-history', { schemaVersion: 1, versions: 0, byteLength: 0, chunkCount: 0 }],
    ['book-draft', { schemaVersion: 1, state: 'none' }],
    ['book-cover', { schemaVersion: 1, cover: { kind: 'none' } }],
  ] as const;
  const counts = createBookPackageCounts(),
    records = values.map(([kind, value]) => {
      const record = {
        kind,
        id: 'book',
        part: 0,
        payload: new TextEncoder().encode(JSON.stringify(value)),
      };
      const section = bookPackageSection(kind);
      if (!section) throw new Error('bad fixture');
      countBookPackageRecord(counts, section, record);
      return record;
    });
  const chunks: Uint8Array[] = [];
  for await (const frame of encodeBookBackup([
    bookPackageHeader('book'),
    ...records,
    bookPackageEnd('book', counts),
  ]))
    chunks.push(frame);
  const bytes = Buffer.concat(chunks);
  return {
    size: bytes.length,
    read: (offset: number, length: number) =>
      Promise.resolve(bytes.subarray(offset, offset + length)),
  };
}
beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto);
  vi.mocked(createBookValidationIndex).mockReset();
});
afterEach(() => vi.unstubAllGlobals());
it('validates inert content using the temporary index and disposes before returning its report', async () => {
  const index = indexFixture();
  vi.mocked(createBookValidationIndex).mockResolvedValue(index);
  const report = await inspectBookBackupContent(await source());
  expect(report.validation).toBe('content-only');
  expect(report.totals.versions).toBe(0);
  expect(index.dispose).toHaveBeenCalledOnce();
});
it('cleans temporary metadata when local file I/O fails', async () => {
  const index = indexFixture(),
    error = new Error('read failed');
  vi.mocked(createBookValidationIndex).mockResolvedValue(index);
  await expect(
    inspectBookBackupContent({ size: 16, read: () => Promise.reject(error) }),
  ).rejects.toBe(error);
  expect(index.dispose).toHaveBeenCalledOnce();
});
it('keeps primary and cleanup failures observable and never returns a positive report', async () => {
  const index = indexFixture(),
    primary = new Error('read failed'),
    cleanup = new Error('remove failed');
  index.dispose.mockRejectedValueOnce(cleanup);
  vi.mocked(createBookValidationIndex).mockResolvedValue(index);
  await expect(
    inspectBookBackupContent({ size: 16, read: () => Promise.reject(primary) }),
  ).rejects.toMatchObject({ errors: [primary, cleanup] });
});
it('does not return success when cleanup fails after valid content, and propagates unavailable storage', async () => {
  const index = indexFixture(),
    cleanup = new Error('remove failed');
  index.dispose.mockRejectedValueOnce(cleanup);
  vi.mocked(createBookValidationIndex)
    .mockResolvedValueOnce(index)
    .mockRejectedValueOnce(new Error('storage unavailable'));
  await expect(inspectBookBackupContent(await source())).rejects.toBe(cleanup);
  await expect(inspectBookBackupContent(await source())).rejects.toThrow('storage unavailable');
});
it('cancellation during validation still cleans its own temporary index', async () => {
  const index = indexFixture(),
    controller = new AbortController();
  vi.mocked(createBookValidationIndex).mockResolvedValue(index);
  controller.abort();
  await expect(
    inspectBookBackupContent(await source(), { signal: controller.signal }),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(index.dispose).toHaveBeenCalledOnce();
});

it('freezes the cancellation context before awaiting storage', async () => {
  const index = indexFixture(),
    controller = new AbortController(),
    input = await source();
  let release!: (value: Awaited<ReturnType<typeof createBookValidationIndex>>) => void;
  vi.mocked(createBookValidationIndex).mockReturnValue(
    new Promise((resolve) => {
      release = resolve;
    }),
  );
  const options = { signal: controller.signal },
    pending = inspectBookBackupContent(input, options);
  options.signal = new AbortController().signal;
  controller.abort();
  release(index);
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(index.dispose).toHaveBeenCalledOnce();
});
it('does not return a stale positive report when cancelled while cleanup is pending', async () => {
  const index = indexFixture(),
    controller = new AbortController();
  index.dispose.mockImplementation(() => {
    controller.abort();
    return Promise.resolve();
  });
  vi.mocked(createBookValidationIndex).mockResolvedValue(index);
  await expect(
    inspectBookBackupContent(await source(), { signal: controller.signal }),
  ).rejects.toMatchObject({ name: 'AbortError' });
});
