import { createHash } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import type {
  BookCoverApi,
  BookCoverDescriptor,
} from '../../../../functions/src/bookBackupCover.mjs';
import {
  bookCoverBackupRecords,
  verifyBookBackupCover,
  encodeBookBackup,
  decodeBookBackup,
  createBookBackupBlobSource,
  type BookBackupRecord,
  type BookCoverProof,
} from '../index';
const hash = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
function fixture(length = 140008, kind: BookCoverDescriptor['kind'] = 'library') {
  const anchor = { schemaVersion: 1 as const, bookId: 'book', sourceToken: 'a'.repeat(64) },
    bytes = Buffer.alloc(length, 7);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(bytes);
  const state = {
    coverToken: 'b'.repeat(64),
    cover: (kind === 'library'
      ? {
          kind,
          imageId: 'cover-capture-image-0001',
          name: 'Own image',
          contentType: 'image/png',
          byteLength: bytes.length,
          chunkCount: Math.ceil(bytes.length / 65536),
          contentHash: hash(bytes),
        }
      : { kind }) as BookCoverDescriptor,
  };
  const api: BookCoverApi = {
    getSource: vi.fn(() => Promise.resolve({ ...anchor })),
    cover: vi.fn(() =>
      Promise.resolve({
        ...anchor,
        coverToken: state.coverToken,
        cover: structuredClone(state.cover),
      }),
    ),
    read: vi.fn((input: Parameters<BookCoverApi['read']>[0]) => {
      const part = bytes.subarray(input.index * 65536, (input.index + 1) * 65536);
      return Promise.resolve({
        ...anchor,
        coverToken: state.coverToken,
        index: input.index,
        chunkBase64: part.toString('base64'),
        chunkHash: hash(part),
      });
    }),
    verify: vi.fn(() => Promise.resolve({ ...anchor, coverToken: state.coverToken })),
  };
  return { anchor, state, bytes, api };
}
async function drain(stream: ReturnType<typeof bookCoverBackupRecords>) {
  const records: BookBackupRecord[] = [];
  for (;;) {
    const next = await stream.next();
    if (next.done) return { records, proof: next.value! };
    records.push(next.value);
  }
}
it('all authorized bytes/hash and own descriptor survive without Storage generation/path/download token', async () => {
  const f = fixture(),
    out = await drain(bookCoverBackupRecords('book', { api: f.api }));
  expect(
    Buffer.concat(
      out.records.filter((r) => r.kind === 'book-cover-bytes').map((r) => Buffer.from(r.payload)),
    ),
  ).toEqual(f.bytes);
  expect(out.records.filter((r) => r.kind === 'book-cover-bytes')).toHaveLength(3);
  const meta = new TextDecoder().decode(out.records[0]!.payload);
  expect(JSON.parse(meta)).toEqual({ schemaVersion: 1, cover: f.state.cover });
  expect(meta).not.toContain(f.state.coverToken);
  expect(meta).not.toContain(f.anchor.sourceToken);
  expect(meta).not.toContain('generation');
  expect(f.api.verify).toHaveBeenCalledTimes(1);
  await verifyBookBackupCover(out.proof, { api: f.api });
});
it.each(['none', 'legacy-unavailable'] as const)(
  '%s is explicit and makes no part reads',
  async (kind) => {
    const f = fixture(8, kind),
      out = await drain(bookCoverBackupRecords('book', { api: f.api }));
    expect(out.records).toHaveLength(1);
    expect(JSON.parse(new TextDecoder().decode(out.records[0]!.payload))).toEqual({
      schemaVersion: 1,
      cover: { kind },
    });
    expect(f.api.read).not.toHaveBeenCalled();
    expect(f.api.verify).toHaveBeenCalledTimes(1);
  },
);
it('16 MiB image emits 256 bounded parts with incremental hash and no retained part array in consumer', async () => {
  const f = fixture(16 * 1024 * 1024),
    stream = bookCoverBackupRecords('book', { api: f.api }),
    digest = createHash('sha256');
  let count = 0,
    proof: BookCoverProof | undefined;
  for (;;) {
    const next = await stream.next();
    if (next.done) {
      proof = next.value;
      break;
    }
    if (next.value.kind === 'book-cover-bytes') {
      expect(next.value.payload.byteLength).toBeLessThanOrEqual(65536);
      digest.update(next.value.payload);
      count++;
    }
  }
  expect(count).toBe(256);
  expect(proof?.cover.kind === 'library' && proof.cover.contentHash).toBe(digest.digest('hex'));
});
it('part index/hash/base64/token and PNG signature corruption cannot succeed', async () => {
  for (const issue of ['index', 'hash', 'base64', 'token', 'signature']) {
    const f = fixture(),
      original = f.api.read;
    f.api.read = vi.fn(async (input: Parameters<BookCoverApi['read']>[0]) => {
      const row = await original(input);
      if (issue === 'index') row.index++;
      if (issue === 'hash') row.chunkHash = '0'.repeat(64);
      if (issue === 'base64') row.chunkBase64 += ' ';
      if (issue === 'token') row.coverToken = 'c'.repeat(64);
      if (issue === 'signature') {
        const bytes = Buffer.from(row.chunkBase64, 'base64');
        bytes[0] = 0;
        row.chunkBase64 = bytes.toString('base64');
        row.chunkHash = hash(bytes);
      }
      return row;
    });
    await expect(drain(bookCoverBackupRecords('book', { api: f.api }))).rejects.toThrow(
      'bytes autorizados',
    );
    expect(f.api.verify).not.toHaveBeenCalled();
  }
});
it('whole-image mismatch throws after provisional parts and leaves M2 without a seal', async () => {
  const f = fixture(),
    frames: Uint8Array[] = [];
  if (f.state.cover.kind !== 'library') throw new Error('fixture');
  f.state.cover.contentHash = '0'.repeat(64);
  await expect(
    (async () => {
      for await (const frame of encodeBookBackup(bookCoverBackupRecords('book', { api: f.api })))
        frames.push(frame);
    })(),
  ).rejects.toThrow('bytes autorizados');
  const archive = createBookBackupBlobSource(new Blob(frames as BlobPart[]));
  await expect(
    (async () => {
      for await (const record of decodeBookBackup(archive)) void record;
    })(),
  ).rejects.toMatchObject({ code: 'incomplete-archive' });
});
it('invalid/oversize/private descriptor or wrong source is rejected before emitting header', async () => {
  for (const issue of ['size', 'private', 'source']) {
    const f = fixture(),
      original = f.api.cover;
    f.api.cover = vi.fn(async (input: Parameters<BookCoverApi['cover']>[0]) => {
      const row = await original(input);
      if (issue === 'source') row.sourceToken = 'c'.repeat(64);
      else
        row.cover = {
          ...row.cover,
          ...(issue === 'size' ? { byteLength: 16777217 } : { path: 'DO NOT COPY' }),
        };
      return row;
    });
    await expect(bookCoverBackupRecords('book', { api: f.api }).next()).rejects.toThrow(
      'bytes autorizados',
    );
    expect(f.api.read).not.toHaveBeenCalled();
  }
});
it('consumer pressure, early return, abort and context switch do not read another part or yield proof', async () => {
  const f = fixture(),
    controller = new AbortController(),
    stream = bookCoverBackupRecords('book', { api: f.api, signal: controller.signal });
  await stream.next();
  expect(f.api.read).not.toHaveBeenCalled();
  await stream.next();
  expect(f.api.read).toHaveBeenCalledTimes(1);
  controller.abort();
  await expect(stream.next()).rejects.toMatchObject({ name: 'AbortError' });
  expect(f.api.read).toHaveBeenCalledTimes(1);
  const early = bookCoverBackupRecords('book', { api: f.api });
  await early.next();
  expect((await early.return(undefined)).value).toBeUndefined();
  expect(f.api.verify).not.toHaveBeenCalled();
  let current = true;
  const switched = bookCoverBackupRecords('book', { api: f.api, isCurrent: () => current });
  await switched.next();
  current = false;
  await expect(switched.next()).rejects.toMatchObject({ name: 'AbortError' });
});
it('final authorization failure propagates without retry and proof/token shape is checked', async () => {
  const f = fixture(),
    error = new Error('revoked');
  vi.mocked(f.api.verify).mockRejectedValueOnce(error);
  await expect(drain(bookCoverBackupRecords('book', { api: f.api }))).rejects.toBe(error);
  expect(f.api.verify).toHaveBeenCalledTimes(1);
  const good = fixture(),
    out = await drain(bookCoverBackupRecords('book', { api: good.api }));
  good.state.coverToken = 'c'.repeat(64);
  await expect(verifyBookBackupCover(out.proof, { api: good.api })).rejects.toThrow(
    'bytes autorizados',
  );
  const calls = vi.mocked(good.api.verify).mock.calls.length;
  await expect(
    verifyBookBackupCover({ ...out.proof, coverToken: 'bad' }, { api: good.api }),
  ).rejects.toThrow('bytes autorizados');
  expect(good.api.verify).toHaveBeenCalledTimes(calls);
});
