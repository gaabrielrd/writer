import { createHash, webcrypto } from 'node:crypto';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  auth: { currentUser: { uid: 'author' } },
  call: vi.fn<(name: string, input: Record<string, unknown>) => Promise<unknown>>(),
}));
vi.mock('@/shared/lib', () => ({ auth: mocks.auth, getFirebaseApp: () => ({}) }));
vi.mock('firebase/functions', () => ({
  getFunctions: () => ({}),
  httpsCallable: (_functions: unknown, name: string) => async (input: Record<string, unknown>) => ({
    data: await mocks.call(name, input),
  }),
}));
import { hydrateSceneSource, type ExternalSceneSource } from '../services/sceneSourceText';
import { listSceneSources } from '../services/sceneService';
const text = '\ufeff  Ação 🌙\n' + ' frozen source  '.repeat(76000),
  bytes = Buffer.from(text),
  hash = createHash('sha256').update(bytes).digest('hex'),
  descriptor = {
    schemaVersion: 1,
    bodyId: 'a'.repeat(64),
    contentHash: hash,
    byteLength: bytes.length,
    chunkCount: Math.ceil(bytes.length / 65536),
  },
  token = 'b'.repeat(64),
  input = { target: { kind: 'book' as const, id: 'book' }, expectedProjectRevision: 7 },
  source: ExternalSceneSource = {
    id: 'chapter',
    hash,
    content: null,
    original: { title: 'Original', order: 1 },
    contentStorage: descriptor,
    sourceToken: token,
  };
function response(value: Record<string, unknown>) {
  return {
    sourceId: source.id,
    projectRevision: 7,
    sourceToken: token,
    manifest: descriptor,
    index: value.index,
    chunkBase64: bytes
      .subarray(Number(value.index) * 65536, (Number(value.index) + 1) * 65536)
      .toString('base64'),
  };
}
beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto);
  mocks.auth.currentUser = { uid: 'author' };
  mocks.call.mockReset().mockImplementation((_name, value) => Promise.resolve(response(value)));
});
afterEach(() => vi.unstubAllGlobals());
const read = () =>
  hydrateSceneSource(source, input, 'author', (name, value) =>
    mocks.call(name, value as Record<string, unknown>),
  );

it('returns the exact Unicode/BOM original, pins all pages and confirms it again before returning', async () => {
  const result = await read();
  expect(result).toEqual({ id: source.id, hash, content: text, original: source.original });
  expect(mocks.call).toHaveBeenCalledTimes(descriptor.chunkCount + 1);
  expect(
    mocks.call.mock.calls.every(
      ([name, value]) =>
        name === 'readSceneSourceText' &&
        value.sourceToken === token &&
        value.expectedProjectRevision === 7,
    ),
  ).toBe(true);
  expect(mocks.call.mock.lastCall?.[1].index).toBe(0);
});
it('preserves inline sources without additional requests', async () => {
  const inline = { id: 'inline', content: '', hash: 'inline-hash', original: {} };
  await expect(hydrateSceneSource(inline, input, 'author', mocks.call as never)).resolves.toBe(
    inline,
  );
  expect(mocks.call).not.toHaveBeenCalled();
});
for (const mode of [
  'source',
  'revision',
  'token',
  'index',
  'manifest',
  'bytes',
  'size',
  'base64',
  'unknown',
])
  it('rejects malformed ' + mode + ' replies without exposing partial text', async () => {
    mocks.call.mockImplementation((_name, value) => {
      const r: Record<string, unknown> = response(value);
      if (Number(value.index) === 1) {
        if (mode === 'source') r.sourceId = 'other';
        if (mode === 'revision') r.projectRevision = 8;
        if (mode === 'token') r.sourceToken = 'c'.repeat(64);
        if (mode === 'index') r.index = 0;
        if (mode === 'manifest') r.manifest = { ...descriptor, bodyId: 'd'.repeat(64) };
        if (mode === 'bytes') {
          const part = Buffer.from(String(r.chunkBase64), 'base64');
          part[0] = part[0]! ^ 1;
          r.chunkBase64 = part.toString('base64');
        }
        if (mode === 'size') r.chunkBase64 = 'eA==';
        if (mode === 'base64') r.chunkBase64 = String(r.chunkBase64) + '\n';
        if (mode === 'unknown') r.path = 'private/body';
      }
      return Promise.resolve(r);
    });
    await expect(read()).rejects.toThrow('conferir');
  });
it('drops a successful response after account switch', async () => {
  mocks.call.mockImplementation((_name, value) => {
    mocks.auth.currentUser = { uid: 'other' };
    return Promise.resolve(response(value));
  });
  await expect(read()).rejects.toThrow('conta mudou');
});
it('does not return assembled content when final authorization fails', async () => {
  let first = true;
  mocks.call.mockImplementation((_name, value) => {
    if (value.index === 0) {
      if (!first) return Promise.reject(new Error('Origin changed'));
      first = false;
    }
    return Promise.resolve(response(value));
  });
  await expect(read()).rejects.toThrow('Origin changed');
});
it('public source list hydrates external rows and preserves the inline contract', async () => {
  const inline = { id: 'inline', content: 'Saved', hash: 'saved', original: {} };
  mocks.call.mockImplementation((name, value) =>
    Promise.resolve(
      name === 'listSceneSources'
        ? { items: [inline, source], nextCursor: null, projectRevision: 7 }
        : response(value),
    ),
  );
  const result = await listSceneSources(input);
  expect(result.items).toEqual([
    inline,
    { id: source.id, content: text, hash, original: source.original },
  ]);
  expect(result.projectRevision).toBe(7);
});

it('rejects malformed UTF-8 even when its bytes match the received hash', async () => {
  const malformed = Buffer.from([0xc0, 0xaf]),
    badHash = createHash('sha256').update(malformed).digest('hex'),
    value = { ...descriptor, byteLength: 2, chunkCount: 1, contentHash: badHash };
  mocks.call.mockImplementation((_name, request) =>
    Promise.resolve({
      ...response(request),
      manifest: value,
      chunkBase64: malformed.toString('base64'),
    }),
  );
  await expect(
    hydrateSceneSource(
      { ...source, hash: badHash, contentStorage: value },
      input,
      'author',
      (name, request) => mocks.call(name, request as Record<string, unknown>),
    ),
  ).rejects.toThrow('conferir');
});
it('does not request the source list without an authenticated account', async () => {
  mocks.auth.currentUser = { uid: '' };
  await expect(listSceneSources(input)).rejects.toThrow('Entre na sua conta');
  expect(mocks.call).not.toHaveBeenCalled();
});
