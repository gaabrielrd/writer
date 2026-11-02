import { expect, it, vi } from 'vitest';
import { inspectLegacyBookBackup } from '../services/inspectLegacyBookBackup';
import { createBookValidationIndex } from '../services/bookValidationIndex';
import type { BookValidationIndex } from '../../../../functions/src/bookBackupContent.mjs';
vi.mock('../services/bookValidationIndex', () => ({ createBookValidationIndex: vi.fn() }));
function fixture(
  text = JSON.stringify({
    format: 'writer-book-backup',
    version: 1,
    book: { id: 'book', title: 'Own' },
    chapters: [],
    lore: [],
  }),
) {
  const data = new Map<string, Record<string, unknown>>(),
    dispose = vi.fn(() => Promise.resolve());
  const index: BookValidationIndex & { dispose: () => Promise<void> } = {
    add: async (key, value) => {
      await Promise.resolve();
      data.set(JSON.stringify(key), value);
    },
    get: async (key) => {
      await Promise.resolve();
      return data.get(JSON.stringify(key));
    },
    dispose,
  };
  vi.mocked(createBookValidationIndex).mockResolvedValueOnce(index);
  const bytes = new Uint8Array(new TextEncoder().encode(text));
  return {
    dispose,
    source: {
      size: bytes.length,
      read: (offset: number, length: number) =>
        Promise.resolve(bytes.slice(offset, offset + length)),
    },
  };
}
it('returns distinct legacy provenance and explicit absences only after temporary cleanup', async () => {
  const f = fixture(),
    report = await inspectLegacyBookBackup(f.source);
  expect(report.validation).toBe('legacy-content-only');
  expect(report.source.availability.history).toBe('not-recorded');
  expect(report.source.availability.cover).toBe('not-recorded');
  expect(f.dispose).toHaveBeenCalledOnce();
});
it('cleans on invalid JSON or cancellation without reporting a partial review', async () => {
  const invalid = fixture('{"format":');
  await expect(inspectLegacyBookBackup(invalid.source)).rejects.toThrow();
  expect(invalid.dispose).toHaveBeenCalledOnce();
  const cancelled = fixture(),
    controller = new AbortController();
  controller.abort();
  await expect(
    inspectLegacyBookBackup(cancelled.source, { signal: controller.signal }),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(cancelled.dispose).toHaveBeenCalledOnce();
});
