import { createHash, webcrypto } from 'node:crypto';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  auth: { currentUser: { uid: 'author' } },
  call: vi.fn<(input: Record<string, unknown>) => Promise<{ data: unknown }>>(),
}));
vi.mock('@/shared/lib', () => ({ auth: mocks.auth, getFirebaseApp: () => ({}) }));
vi.mock('firebase/functions', () => ({
  getFunctions: () => ({}),
  httpsCallable: () => mocks.call,
}));
import { readServerLegacyChapterText } from '../services/chapterTextReadService';
const content = '\ufeff' + 'ação 🌙\n'.repeat(60000),
  bytes = Buffer.from(content),
  manifest = {
    schemaVersion: 1,
    bodyId: 'a'.repeat(64),
    contentHash: createHash('sha256').update(bytes).digest('hex'),
    byteLength: bytes.length,
    chunkCount: Math.ceil(bytes.length / 65536),
  },
  token = 'b'.repeat(64);
const response = (input: Record<string, unknown>) => ({
  bookId: 'book',
  chapterId: 'chapter',
  manifest,
  sourceToken: token,
  index: input.index,
  chunkBase64: bytes
    .subarray(Number(input.index) * 65536, (Number(input.index) + 1) * 65536)
    .toString('base64'),
});
beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto);
  mocks.auth.currentUser = { uid: 'author' };
  mocks.call.mockReset();
  mocks.call.mockImplementation((input) => Promise.resolve({ data: response(input) }));
});
afterEach(() => vi.unstubAllGlobals());
const read = () => readServerLegacyChapterText('book', 'chapter', manifest);
it('reassembles all bytes across Unicode boundaries, pins every page and reauthorizes at the end', async () => {
  await expect(read()).resolves.toBe(content);
  expect(mocks.call).toHaveBeenCalledTimes(manifest.chunkCount + 1);
  expect(mocks.call.mock.calls[0]![0].sourceToken).toBeNull();
  for (const [input] of mocks.call.mock.calls.slice(1)) expect(input.sourceToken).toBe(token);
  expect(mocks.call.mock.lastCall?.[0]).toMatchObject({ index: 0, sourceToken: token });
});
for (const mode of ['index', 'book', 'manifest', 'token', 'bytes', 'base64', 'size', 'unknown'])
  it('rejects malformed ' + mode + ' page without returning partial text', async () => {
    mocks.call.mockImplementation((input) => {
      const r: Record<string, unknown> = response(input);
      if (Number(input.index) === 1) {
        if (mode === 'index') r.index = 0;
        if (mode === 'book') r.bookId = 'other';
        if (mode === 'manifest') r.manifest = { ...manifest, bodyId: 'c'.repeat(64) };
        if (mode === 'token') r.sourceToken = 'd'.repeat(64);
        if (mode === 'bytes') {
          const part = Buffer.from(String(r.chunkBase64), 'base64');
          part.writeUInt8(part.readUInt8(0) ^ 1, 0);
          r.chunkBase64 = part.toString('base64');
        }
        if (mode === 'base64') r.chunkBase64 = String(r.chunkBase64) + '\n';
        if (mode === 'size') r.chunkBase64 = 'eA==';
        if (mode === 'unknown') r.path = 'private/path';
      }
      return Promise.resolve({ data: r });
    });
    await expect(read()).rejects.toThrow('conferir');
  });
it('discards a successful reply that arrives after account switch', async () => {
  mocks.call.mockImplementation((input) => {
    mocks.auth.currentUser = { uid: 'other' };
    return Promise.resolve({ data: response(input) });
  });
  await expect(read()).rejects.toThrow('conta mudou');
});
it('propagates revocation during final confirmation and never caches the earlier body', async () => {
  mocks.call.mockImplementation((input) => {
    if (input.index === 0 && input.sourceToken !== null) throw new Error('acesso revogado');
    return Promise.resolve({ data: response(input) });
  });
  await expect(read()).rejects.toThrow('acesso revogado');
  mocks.call.mockImplementation((input) => Promise.resolve({ data: response(input) }));
  await expect(read()).resolves.toBe(content);
  expect(mocks.call.mock.calls.filter(([input]) => input.sourceToken === null)).toHaveLength(2);
});
it('rejects invalid descriptors before any request, including unknown fields and logical overflow', async () => {
  for (const descriptor of [
    null,
    {},
    { ...manifest, byteLength: 8388609 },
    { ...manifest, chunkCount: 0 },
    { ...manifest, extra: true },
  ])
    await expect(readServerLegacyChapterText('book', 'chapter', descriptor)).rejects.toThrow(
      'conferir',
    );
  expect(mocks.call).not.toHaveBeenCalled();
});

it('preserves the full 8-MiB logical limit through bounded pages', async () => {
  const large = Buffer.alloc(8 * 1024 * 1024, 120),
    descriptor = {
      ...manifest,
      contentHash: createHash('sha256').update(large).digest('hex'),
      byteLength: large.length,
      chunkCount: 128,
    };
  mocks.call.mockImplementation((input) =>
    Promise.resolve({
      data: {
        ...response(input),
        manifest: descriptor,
        chunkBase64: large
          .subarray(Number(input.index) * 65536, (Number(input.index) + 1) * 65536)
          .toString('base64'),
      },
    }),
  );
  const text = await readServerLegacyChapterText('book', 'chapter', descriptor);
  expect(text).toBe(large.toString('utf8'));
  expect(mocks.call).toHaveBeenCalledTimes(129);
});
it('rejects invalid UTF-8 even when byte length and checksum match', async () => {
  const invalid = Buffer.from([255]),
    descriptor = {
      ...manifest,
      contentHash: createHash('sha256').update(invalid).digest('hex'),
      byteLength: 1,
      chunkCount: 1,
    };
  mocks.call.mockImplementation((input) =>
    Promise.resolve({
      data: { ...response(input), manifest: descriptor, chunkBase64: invalid.toString('base64') },
    }),
  );
  await expect(readServerLegacyChapterText('book', 'chapter', descriptor)).rejects.toThrow(
    'conferir',
  );
});
