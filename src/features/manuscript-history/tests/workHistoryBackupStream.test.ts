import { createHash, webcrypto } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  streamWorkHistoryBackup,
  verifyWorkHistoryBackupStream,
} from '../services/workHistoryBackupStream';
import type {
  VersionSummary,
  VersionTarget,
  WorkHistoryBackupPart,
  WorkHistoryBackupStreamApi,
  WorkHistoryStreamProof,
} from '../model/workHistory';
const target: VersionTarget = { kind: 'book', id: 'book' };
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
function split(text: string) {
  const bytes = Buffer.from(text),
    chunks: string[] = [];
  for (let start = 0; start < bytes.length;) {
    let end = Math.min(start + 65536, bytes.length);
    while (end < bytes.length && (bytes[end]! & 0xc0) === 0x80) end--;
    chunks.push(bytes.subarray(start, end).toString('utf8'));
    start = end;
  }
  return chunks.length ? chunks : [''];
}
function fixture(count = 3, requested = target) {
  const source = { schemaVersion: 1 as const, historyRevision: 7, sourceToken: 'a'.repeat(64) };
  const data = new Map<string, { summary: VersionSummary; chunks: string[] }>();
  function put(id: string, content = '') {
    const chunks = split(content);
    data.set(id, {
      chunks,
      summary: {
        id,
        target: { ...requested },
        resource: { kind: id.endsWith('1') ? 'scene' : 'chapter', id: 'removed-' + id },
        createdAt: 1000 - data.size,
        reason: data.size % 2 ? 'before-restore' : 'manual',
        label: data.size % 2 ? 'Versão 🌙' : null,
        wordCount: content ? 3 : 0,
        byteLength: Buffer.byteLength(content),
        contentHash: hash(content),
        chunkCount: chunks.length,
      },
    });
  }
  for (let i = 0; i < count; i++) put('v' + String(i).padStart(4, '0'), i ? 'ação 🌙' : '');
  const api: WorkHistoryBackupStreamApi = {
    getSource: vi.fn(() => Promise.resolve({ ...source })),
    list: vi.fn((input: Parameters<WorkHistoryBackupStreamApi['list']>[0]) => {
      if (input.expectedHistoryToken !== source.sourceToken)
        return Promise.reject(new Error('history-snapshot-changed'));
      const ids = [...data.keys()].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
      const start = input.cursor === null ? 0 : Number(input.cursor);
      return Promise.resolve({
        items: ids.slice(start, start + input.limit).map((id) => data.get(id)!.summary),
        nextCursor: ids.length > start + input.limit ? String(start + input.limit) : null,
      });
    }),
    read: vi.fn((input: Parameters<WorkHistoryBackupStreamApi['read']>[0]) => {
      if (input.expectedHistoryToken !== source.sourceToken)
        return Promise.reject(new Error('history-snapshot-changed'));
      const value = data.get(input.versionId)!;
      const start = input.cursor === null ? 0 : Number(input.cursor);
      return Promise.resolve({
        version: value.summary,
        chunks: value.chunks
          .slice(start, start + input.limit)
          .map((content, i) => ({ index: start + i, content })),
        nextCursor: value.chunks.length > start + input.limit ? String(start + input.limit) : null,
      });
    }),
  };
  return { source, data, api, put };
}
async function consume(stream: ReturnType<typeof streamWorkHistoryBackup>) {
  const parts: WorkHistoryBackupPart[] = [];
  for (;;) {
    const next = await stream.next();
    if (next.done) return { proof: next.value!, parts };
    parts.push(next.value);
  }
}
beforeEach(() => vi.stubGlobal('crypto', webcrypto));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('captures 59 versions in ID/UTF-8 order with removed resources, old dates, exact empty body and final source proof', async () => {
  const f = fixture(57);
  f.put('\ue000', 'privado');
  f.put('🌙', 'final');
  const { proof, parts } = await consume(streamWorkHistoryBackup(target, { api: f.api }));
  expect(proof).toMatchObject({ schemaVersion: 1, target, source: f.source, versions: 59 });
  const headers = parts.filter((part) => part.type === 'version').map((part) => part.version);
  expect(headers.map((row) => row.id)).toEqual(
    [...f.data.keys()].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b))),
  );
  expect(headers.at(-2)?.id).toBe('\ue000');
  expect(headers.at(-1)?.id).toBe('🌙');
  expect(headers[0]).toEqual(f.data.get('v0000')!.summary);
  const empty = parts.find((part) => part.type === 'text' && part.versionId === 'v0000');
  expect(empty).toMatchObject({ index: 0 });
  if (empty?.type !== 'text') throw new Error('Missing empty part');
  expect(Array.from(empty.payload)).toEqual([]);
  expect(f.api.list).toHaveBeenCalledTimes(2);
  expect(f.api.getSource).toHaveBeenCalledTimes(2);
  await verifyWorkHistoryBackupStream(proof, { api: f.api });
  expect(f.api.getSource).toHaveBeenCalledTimes(3);
  for (const [input] of vi.mocked(f.api.list).mock.calls)
    expect(input).toMatchObject({
      order: 'id',
      limit: 50,
      expectedHistoryToken: f.source.sourceToken,
    });
});
it.each([
  ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
  ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
  ['a'.repeat(1000000), 'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0'],
])('uses SHA-256 byte-compatible with the fixed vector %#', async (text, expected) => {
  const f = fixture(0);
  f.put('version', text);
  f.data.get('version')!.summary.contentHash = expected;
  const { proof } = await consume(streamWorkHistoryBackup(target, { api: f.api }));
  expect(proof.byteLength).toBe(Buffer.byteLength(text));
  expect(proof.versions).toBe(1);
});
it('streams a 20 MiB historical body with bounded parts, early delivery and no whole-input Web Crypto digest', async () => {
  const f = fixture(1),
    bytes = Buffer.alloc(65536, 97),
    expected = createHash('sha256');
  for (let i = 0; i < 320; i++) expected.update(bytes);
  const summary = f.data.get('v0000')!.summary;
  Object.assign(summary, {
    byteLength: 20 * 1024 * 1024,
    chunkCount: 320,
    contentHash: expected.digest('hex'),
  });
  vi.mocked(f.api.read).mockImplementation((input) => {
    const start = input.cursor === null ? 0 : Number(input.cursor);
    return Promise.resolve({
      version: summary,
      chunks: Array.from({ length: Math.min(input.limit, 320 - start) }, (_, i) => ({
        index: start + i,
        content: bytes.toString(),
      })),
      nextCursor: start + input.limit < 320 ? String(start + input.limit) : null,
    });
  });
  const digest = vi.spyOn(crypto.subtle, 'digest');
  const stream = streamWorkHistoryBackup(target, { api: f.api });
  expect(f.api.getSource).not.toHaveBeenCalled();
  expect((await stream.next()).value).toMatchObject({ type: 'version' });
  expect(f.api.read).not.toHaveBeenCalled();
  let total = 0,
    records = 0,
    proof: WorkHistoryStreamProof | undefined;
  for (;;) {
    const next = await stream.next();
    if (next.done) {
      proof = next.value;
      break;
    }
    if (next.value.type !== 'text') throw new Error('Unexpected header');
    total += next.value.payload.length;
    records++;
    expect(next.value.payload.length).toBeLessThanOrEqual(65536);
    if (records === 1) expect(f.api.read).toHaveBeenCalledTimes(1);
  }
  expect(total).toBe(20 * 1024 * 1024);
  expect(records).toBe(320);
  expect(proof?.byteLength).toBe(total);
  expect(f.api.read).toHaveBeenCalledTimes(80);
  expect(digest).not.toHaveBeenCalled();
});
it('slow consumer and early return stop fetching without a completion proof or final source call', async () => {
  const f = fixture(60),
    stream = streamWorkHistoryBackup(target, { api: f.api });
  await stream.next();
  expect(f.api.list).toHaveBeenCalledTimes(1);
  expect(f.api.read).not.toHaveBeenCalled();
  const first = await stream.next();
  expect(first.value).toMatchObject({ type: 'text' });
  expect(f.api.read).toHaveBeenCalledTimes(1);
  const end = await stream.return(undefined);
  expect(end.value).toBeUndefined();
  expect(f.api.list).toHaveBeenCalledTimes(1);
  expect(f.api.getSource).toHaveBeenCalledTimes(1);
});
it.each(['hash', 'manifest', 'index', 'oversize', 'truncated', 'surrogate', 'extra'] as const)(
  'rejects %s in body without returning a proof',
  async (issue) => {
    const f = fixture(1),
      value = f.data.get('v0000')!;
    if (issue === 'hash') Object.assign(value.summary, { byteLength: 1, contentHash: hash('z') });
    vi.mocked(f.api.read).mockImplementation(() =>
      Promise.resolve({
        version: issue === 'manifest' ? { ...value.summary, label: 'changed' } : value.summary,
        chunks:
          issue === 'truncated'
            ? []
            : [
                {
                  index: issue === 'index' ? 1 : 0,
                  content:
                    issue === 'oversize'
                      ? 'x'.repeat(65537)
                      : issue === 'surrogate'
                        ? '\ud800'
                        : issue === 'hash'
                          ? 'x'
                          : '',
                  ...(issue === 'extra' ? { secret: true } : {}),
                },
              ],
        nextCursor: null,
      }),
    );
    await expect(consume(streamWorkHistoryBackup(target, { api: f.api }))).rejects.toThrow(
      'histórico completo',
    );
    expect(f.api.getSource).toHaveBeenCalledTimes(1);
  },
);
it('rejects repeated IDs with changed dates and cyclic pages without an unbounded seen-ID set', async () => {
  const f = fixture(60);
  vi.mocked(f.api.list).mockImplementation((input) =>
    Promise.resolve({
      items: Array.from(f.data.values())
        .slice(0, 50)
        .map((entry) => ({
          ...entry.summary,
          createdAt: input.cursor ? 1 : entry.summary.createdAt,
        })),
      nextCursor: input.cursor ? '100' : '50',
    }),
  );
  await expect(consume(streamWorkHistoryBackup(target, { api: f.api }))).rejects.toThrow(
    'histórico completo',
  );
  expect(f.api.list).toHaveBeenCalledTimes(2);
  expect(f.api.read).toHaveBeenCalledTimes(50);
});
it.each(['before', 'response', 'yield', 'session'] as const)(
  'abort at %s prevents further reads and proof',
  async (moment) => {
    const f = fixture(),
      controller = new AbortController();
    let current = true;
    if (moment === 'before') controller.abort();
    if (moment === 'response')
      vi.mocked(f.api.getSource).mockImplementation(() => {
        controller.abort();
        return Promise.resolve(f.source);
      });
    const stream = streamWorkHistoryBackup(target, {
      api: f.api,
      signal: controller.signal,
      isCurrent: () => current,
    });
    if (moment === 'yield' || moment === 'session') {
      await stream.next();
      if (moment === 'yield') controller.abort();
      else current = false;
    }
    await expect(stream.next()).rejects.toMatchObject({ name: 'AbortError' });
    expect(f.api.read).not.toHaveBeenCalled();
  },
);
it('final origin changes, empty history and final verification do not silently accept a newer source', async () => {
  const f = fixture(0);
  const { proof, parts } = await consume(streamWorkHistoryBackup(target, { api: f.api }));
  expect(parts).toEqual([]);
  expect(proof).toMatchObject({ versions: 0, byteLength: 0, chunkCount: 0 });
  f.source.historyRevision++;
  await expect(verifyWorkHistoryBackupStream(proof, { api: f.api })).rejects.toThrow(
    'histórico completo',
  );
  const other = fixture(0);
  vi.mocked(other.api.getSource)
    .mockResolvedValueOnce(other.source)
    .mockResolvedValue({ ...other.source, sourceToken: 'b'.repeat(64) });
  await expect(consume(streamWorkHistoryBackup(target, { api: other.api }))).rejects.toThrow(
    'histórico completo',
  );
  expect(other.api.getSource).toHaveBeenCalledTimes(2);
});
it('changed origin, invalid metadata and read failures are preserved without retries', async () => {
  const f = fixture(1);
  await expect(
    consume(
      streamWorkHistoryBackup(target, { api: f.api, source: { ...f.source, historyRevision: 0 } }),
    ),
  ).rejects.toThrow('histórico completo');
  expect(f.api.list).not.toHaveBeenCalled();
  const failure = new Error('transport unavailable');
  vi.mocked(f.api.read).mockRejectedValue(failure);
  await expect(consume(streamWorkHistoryBackup(target, { api: f.api }))).rejects.toBe(failure);
  expect(f.api.read).toHaveBeenCalledTimes(1);
  f.data.get('v0000')!.summary.chunkCount = 2;
  await expect(consume(streamWorkHistoryBackup(target, { api: f.api }))).rejects.toThrow(
    'histórico completo',
  );
  expect(f.api.read).toHaveBeenCalledTimes(1);
});

it('preserves BOM as prose and as part of version IDs without normalization', async () => {
  const f = fixture(0),
    id = '\ufeffversão',
    content = '\ufeffação 🌙' + 'x'.repeat(65530) + '\ufefffim';
  f.put(id, content);
  const { proof, parts } = await consume(streamWorkHistoryBackup(target, { api: f.api }));
  const body = Buffer.concat(
    parts.filter((part) => part.type === 'text').map((part) => Buffer.from(part.payload)),
  ).toString('utf8');
  expect(body).toBe(content);
  expect(proof.versions).toBe(1);
  expect(parts[0]).toMatchObject({ type: 'version', version: { id } });
});
