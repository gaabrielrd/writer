import { createHash, webcrypto } from 'node:crypto';
import { Blob as NodeBlob } from 'node:buffer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type {
  VersionSummary,
  WorkHistoryBackupPart,
  WorkHistoryStreamProof,
} from '@/features/manuscript-history';
import {
  bookHistoryBackupRecords,
  encodeBookBackup,
  decodeBookBackup,
  createBookBackupBlobSource,
  type BookBackupRecord,
} from '../index';
const text = 'ação 🌙';
function fixture() {
  const headers: VersionSummary[] = ['', text].map((content, i) => ({
    id: 'version-' + i,
    target: { kind: 'book', id: 'book' },
    resource: { kind: i ? 'scene' : 'chapter', id: 'removed-' + i },
    createdAt: 100 + i,
    reason: i ? 'before-restore' : 'manual',
    label: i ? 'Antes 🌙' : null,
    wordCount: i ? 2 : 0,
    byteLength: Buffer.byteLength(content),
    contentHash: createHash('sha256').update(content).digest('hex'),
    chunkCount: 1,
  }));
  const proof: WorkHistoryStreamProof = {
    schemaVersion: 1,
    target: { kind: 'book', id: 'book' },
    source: { schemaVersion: 1, historyRevision: 3, sourceToken: 'a'.repeat(64) },
    versions: 2,
    byteLength: Buffer.byteLength(text),
    chunkCount: 2,
  };
  const close = vi.fn();
  async function* stream(): AsyncGenerator<
    WorkHistoryBackupPart,
    WorkHistoryStreamProof | undefined,
    void
  > {
    await Promise.resolve();
    try {
      for (let i = 0; i < headers.length; i++) {
        yield {
          type: 'version',
          version: withPrivateFields(headers[i]!),
        };
        yield {
          type: 'text',
          versionId: headers[i]!.id,
          index: 0,
          payload: new TextEncoder().encode(i ? text : ''),
        };
      }
      return proof;
    } finally {
      close();
    }
  }
  return { headers, proof, close, stream };
}
async function collect(stream: ReturnType<typeof bookHistoryBackupRecords>) {
  const records: BookBackupRecord[] = [];
  for (;;) {
    const next = await stream.next();
    if (next.done) return { records, proof: next.value };
    records.push(next.value);
  }
}
beforeEach(() => vi.stubGlobal('crypto', webcrypto));
afterEach(() => vi.unstubAllGlobals());
it('preserves manual/pre-restore versions and removed-resource identities, emits explicit totals and omits private controls', async () => {
  const f = fixture(),
    result = await collect(bookHistoryBackupRecords('book', f.stream()));
  expect(result.proof).toBe(f.proof);
  expect(result.records.map((r) => [r.kind, r.id, r.part])).toEqual([
    ['work-version', 'version-0', 0],
    ['work-version-text', 'version-0', 0],
    ['work-version', 'version-1', 0],
    ['work-version-text', 'version-1', 0],
    ['work-history', 'book', 0],
  ]);
  expect(JSON.parse(new TextDecoder().decode(result.records[0]!.payload))).toEqual(f.headers[0]);
  expect(Array.from(result.records[1]!.payload)).toEqual([]);
  expect(new TextDecoder().decode(result.records[3]!.payload)).toBe(text);
  const json = result.records.map((r) => new TextDecoder().decode(r.payload)).join('');
  expect(json).not.toContain('never-export');
  expect(json).not.toContain('private');
  expect(json).not.toContain(f.proof.source.sourceToken);
  expect(JSON.parse(new TextDecoder().decode(result.records[4]!.payload))).toEqual({
    schemaVersion: 1,
    versions: 2,
    byteLength: Buffer.byteLength(text),
    chunkCount: 2,
  });
  expect(f.close).toHaveBeenCalledTimes(1);
});
it('empty history is explicit and still requires a completed proof', async () => {
  const f = fixture();
  f.proof.versions = 0;
  f.proof.byteLength = 0;
  f.proof.chunkCount = 0;
  async function* empty(): AsyncGenerator<
    WorkHistoryBackupPart,
    WorkHistoryStreamProof | undefined,
    void
  > {
    yield* [];
    await Promise.resolve();
    return f.proof;
  }
  const result = await collect(bookHistoryBackupRecords('book', empty()));
  expect(result.records).toHaveLength(1);
  expect(JSON.parse(new TextDecoder().decode(result.records[0]!.payload))).toEqual({
    schemaVersion: 1,
    versions: 0,
    byteLength: 0,
    chunkCount: 0,
  });
});
it.each(['book', 'target', 'totals'] as const)(
  'rejects mismatched %s before history index',
  async (issue) => {
    const f = fixture();
    if (issue === 'target') {
      f.proof.target = { kind: 'adventure', id: 'book' };
    }
    if (issue === 'totals') f.proof.versions++;
    await expect(
      collect(bookHistoryBackupRecords(issue === 'book' ? 'other' : 'book', f.stream())),
    ).rejects.toMatchObject({ code: 'invalid-record' });
  },
);
it('early return closes the original generator; no source reads or seal are invented', async () => {
  const f = fixture(),
    stream = bookHistoryBackupRecords('book', f.stream());
  expect((await stream.next()).done).toBe(false);
  expect(f.close).not.toHaveBeenCalled();
  expect((await stream.return(undefined)).value).toBeUndefined();
  expect(f.close).toHaveBeenCalledTimes(1);
});
it('M2 reconstitutes history bytes; upstream failure leaves an incomplete archive', async () => {
  const f = fixture(),
    frames: Uint8Array<ArrayBuffer>[] = [];
  for await (const bytes of encodeBookBackup(bookHistoryBackupRecords('book', f.stream())))
    frames.push(new Uint8Array(bytes));
  const records: BookBackupRecord[] = [];
  for await (const record of decodeBookBackup(
    createBookBackupBlobSource(new NodeBlob(frames) as unknown as Blob),
  ))
    records.push(record);
  expect(records).toHaveLength(5);
  expect(new TextDecoder().decode(records[3]!.payload)).toBe(text);
  async function* failed(): AsyncGenerator<
    WorkHistoryBackupPart,
    WorkHistoryStreamProof | undefined,
    void
  > {
    await Promise.resolve();
    yield { type: 'version', version: f.headers[0]! };
    yield { type: 'text', versionId: f.headers[0]!.id, index: 0, payload: new Uint8Array() };
    throw new Error('history-snapshot-changed');
  }
  const partial: Uint8Array<ArrayBuffer>[] = [];
  await expect(
    (async () => {
      for await (const bytes of encodeBookBackup(bookHistoryBackupRecords('book', failed())))
        partial.push(new Uint8Array(bytes));
    })(),
  ).rejects.toThrow('history-snapshot-changed');
  await expect(
    (async () => {
      for await (const record of decodeBookBackup(
        createBookBackupBlobSource(new NodeBlob(partial) as unknown as Blob),
      ))
        void record;
    })(),
  ).rejects.toMatchObject({ code: 'incomplete-archive' });
});
it('missing proof, incomplete parts and out-of-order parts fail explicitly', async () => {
  const f = fixture();
  for (const issue of ['proof', 'missing', 'index', 'large']) {
    async function* broken(): AsyncGenerator<
      WorkHistoryBackupPart,
      WorkHistoryStreamProof | undefined,
      void
    > {
      await Promise.resolve();
      if (issue === 'proof') return undefined;
      yield { type: 'version', version: f.headers[0]! };
      if (issue !== 'missing')
        yield {
          type: 'text',
          versionId: 'version-0',
          index: issue === 'index' ? 1 : 0,
          payload: issue === 'large' ? new Uint8Array(65537) : new Uint8Array(),
        };
      return f.proof;
    }
    await expect(collect(bookHistoryBackupRecords('book', broken()))).rejects.toMatchObject({
      code: 'invalid-record',
    });
  }
});

function withPrivateFields(value: VersionSummary) {
  return { ...value, sourceToken: 'never-export', receipt: 'private' };
}
