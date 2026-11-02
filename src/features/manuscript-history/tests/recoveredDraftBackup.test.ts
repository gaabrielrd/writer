import { createHash } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { DEFAULT_PERSONAS } from '../../../../functions/src/personaProfile.mjs';
import { streamWorkHistoryBackup } from '../services/workHistoryBackupStream';
import { bookHistoryBackupRecords } from '@/features/book-portability';
import type {
  VersionSummary,
  WorkHistoryBackupStreamApi,
  WorkHistoryBackupPart,
} from '../model/workHistory';
const target = { kind: 'book' as const, id: 'book' },
  text = '\ufefftexto 🌙';
function fixture(title = 'Título original') {
  const profile = {
      ...structuredClone(DEFAULT_PERSONAS[0]!),
      id: 'custom-historical',
      instructions: '\ufeff  Exact style  ',
    },
    source = { schemaVersion: 1 as const, historyRevision: 2, sourceToken: 'a'.repeat(64) },
    values: VersionSummary[] = Array.from({ length: 3 }, (_, i) => ({
      id: 'version-' + i,
      target,
      resource: { kind: 'chapter', id: 'removed' },
      createdAt: i + 1,
      reason: 'manual',
      label: 'Recuperado',
      wordCount: 1,
      byteLength: new TextEncoder().encode(text).length,
      chunkCount: 1,
      contentHash: createHash('sha256').update(text).digest('hex'),
      draft: {
        schemaVersion: 1,
        chapter: {
          id: 'removed',
          title,
          order: 1,
          createdAt: 111,
          updatedAt: 222,
          personaComplement: { personaId: profile.id, overrides: [] },
        },
        persona: structuredClone(profile),
      },
    }));
  const api: WorkHistoryBackupStreamApi = {
    getSource: vi.fn(() => Promise.resolve(source)),
    list: vi.fn((input: Parameters<WorkHistoryBackupStreamApi['list']>[0]) => {
      const index = input.cursor === null ? 0 : Number(input.cursor);
      return Promise.resolve({
        items: [values[index]!],
        nextCursor: index < 2 ? String(index + 1) : null,
      });
    }),
    read: vi.fn((input: Parameters<WorkHistoryBackupStreamApi['read']>[0]) =>
      Promise.resolve({
        version: values.find((v) => v.id === input.versionId)!,
        chunks: [{ index: 0, content: text }],
        nextCursor: null,
      }),
    ),
  };
  return { api, values, profile };
}
async function collect<T, R>(stream: AsyncGenerator<T, R, void>) {
  const values: T[] = [];
  for (;;) {
    const next = await stream.next();
    if (next.done) return { values, result: next.value };
    values.push(next.value);
  }
}
it('accepts budgeted short pages and preserves recovered metadata through the complete history stream', async () => {
  const f = fixture(),
    result = await collect(streamWorkHistoryBackup(target, { api: f.api }));
  const headers = result.values.filter(
    (v): v is Extract<WorkHistoryBackupPart, { type: 'version' }> => v.type === 'version',
  );
  expect(headers).toHaveLength(3);
  expect(headers[0]!.version.draft!.chapter.createdAt).toBe(111);
  expect(headers[0]!.version.draft!.persona).toEqual(f.profile);
  expect(result.result!.versions).toBe(3);
  expect(f.api.list).toHaveBeenCalledTimes(3);
});
it('freezes recovered metadata before yielding and detects a changed body-page snapshot', async () => {
  const f = fixture(),
    stream = streamWorkHistoryBackup(target, { api: f.api }),
    first = await stream.next();
  if (first.done || first.value.type !== 'version') throw new Error('Expected version');
  const version = first.value.version;
  expect(() => {
    version.draft!.chapter.title = 'changed';
  }).toThrow();
  f.values[0]!.draft!.chapter.title = 'changed remotely';
  await expect(stream.next()).rejects.toThrow('histórico completo');
});
it.each(['grant', 'chapter', 'persona'] as const)(
  'rejects invalid recovered %s metadata before export',
  async (issue) => {
    const f = fixture(),
      draft = f.values[0]!.draft!;
    if (issue === 'grant') Object.assign(draft, { grant: 'owner' });
    if (issue === 'chapter') draft.chapter.id = 'other';
    if (issue === 'persona') draft.persona!.id = 'other';
    await expect(collect(streamWorkHistoryBackup(target, { api: f.api }))).rejects.toThrow(
      'histórico completo',
    );
  },
);
it('splits large recovered JSON headers while retaining complete metadata and unchanged text parts', async () => {
  const f = fixture('ç'.repeat(40000)),
    result = await collect(
      bookHistoryBackupRecords('book', streamWorkHistoryBackup(target, { api: f.api })),
    ),
    header = result.values.filter((r) => r.kind === 'work-version' && r.id === 'version-0'),
    payload = new Uint8Array(header.reduce((n, r) => n + r.payload.length, 0));
  let offset = 0;
  for (const r of header) {
    payload.set(r.payload, offset);
    offset += r.payload.length;
  }
  expect(header.length).toBeGreaterThan(1);
  expect(header.every((r) => r.payload.length <= 65536)).toBe(true);
  const value: unknown = JSON.parse(
    new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(payload),
  );
  expect(value).toMatchObject({
    draft: {
      chapter: { title: 'ç'.repeat(40000) },
      persona: { instructions: '\ufeff  Exact style  ' },
    },
  });
  expect(result.values.filter((r) => r.kind === 'work-version-text')).toHaveLength(3);
  expect(result.result!.versions).toBe(3);
});
