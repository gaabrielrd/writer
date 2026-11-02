// @vitest-environment node
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
const mocks = vi.hoisted(() => ({
  auth: { currentUser: null },
  appCheck: { test: true },
  getToken: vi.fn(),
  load: vi.fn(),
}));
vi.mock('firebase/app-check', () => ({ getToken: mocks.getToken }));
vi.mock('@/shared/lib', () => {
  mocks.load();
  return { auth: mocks.auth, appCheck: mocks.appCheck };
});
const context = {
  ownerId: 'author',
  restoreId: 'restore-key-0001',
  bookId: 'book',
  jobToken: 'a'.repeat(64),
  reviewHash: 'b'.repeat(64),
  keyId: 'c'.repeat(64),
};
const keyBase64 = Buffer.alloc(32, 7).toString('base64');
const body = () => ({ data: { schemaVersion: 1, ...context, algorithm: 'AES-GCM', keyBase64 } });
const response = (value = body(), status = 200, headers = { 'content-type': 'application/json' }) =>
  new Response(JSON.stringify(value), { status, headers });
const grant = async (guard = () => {}) =>
  (await import('../services/bookRestoreRecoveryKey.ts')).getBookRestoreRecoveryGrant(
    context,
    guard,
  );
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubGlobal('crypto', webcrypto);
  mocks.auth.currentUser = {
    uid: 'author',
    getIdToken: vi.fn(() => Promise.resolve('local-auth')),
  };
  mocks.getToken.mockResolvedValue({ token: 'local-app-check' });
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(response())),
  );
});
afterEach(() => vi.unstubAllGlobals());
it('import is credential-free; authorized HTTP returns only a nonextractable AES key and exact context', async () => {
  const { getBookRestoreRecoveryGrant } = await import('../services/bookRestoreRecoveryKey.ts');
  expect(mocks.load).not.toHaveBeenCalled();
  const value = await getBookRestoreRecoveryGrant(context, () => {});
  expect(fetch).toHaveBeenCalledExactlyOnceWith(
    '/api/book-restore/recovery-key',
    expect.objectContaining({
      method: 'POST',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      headers: {
        'Content-Type': 'text/plain;charset=UTF-8',
        Authorization: 'Bearer local-auth',
        'X-Firebase-AppCheck': 'local-app-check',
      },
      body: JSON.stringify({
        restoreId: context.restoreId,
        jobToken: context.jobToken,
        reviewHash: context.reviewHash,
        expectedKeyId: context.keyId,
      }),
    }),
  );
  expect(value.key.extractable).toBe(false);
  expect(value.key.algorithm).toMatchObject({ name: 'AES-GCM', length: 256 });
  expect(value.key.usages).toEqual(['encrypt', 'decrypt']);
  expect(Object.keys(value).sort()).toEqual([...Object.keys(context), 'key'].sort());
  expect(value).not.toHaveProperty('keyBase64');
  await expect(crypto.subtle.exportKey('raw', value.key)).rejects.toThrow();
});
it('missing or foreign account cannot request tokens or a key', async () => {
  for (const user of [null, { uid: 'other' }]) {
    mocks.auth.currentUser = user;
    await expect(grant()).rejects.toThrow();
  }
  expect(mocks.getToken).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});
it('account change after Auth, App Check or fetch never yields a recovery grant', async () => {
  for (const stage of ['auth', 'app', 'fetch']) {
    mocks.auth.currentUser = {
      uid: 'author',
      getIdToken: vi.fn(async () => {
        if (stage === 'auth') mocks.auth.currentUser = null;
        return 'local-auth';
      }),
    };
    mocks.getToken.mockImplementation(async () => {
      if (stage === 'app') mocks.auth.currentUser = null;
      return { token: 'local-app-check' };
    });
    fetch.mockImplementation(async () => {
      if (stage === 'fetch') mocks.auth.currentUser = null;
      return response();
    });
    await expect(grant()).rejects.toThrow();
  }
});
it('guard invalidation during response reading prevents key import and exposure', async () => {
  let active = true;
  fetch.mockImplementation(
    async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(JSON.stringify(body())));
            active = false;
            controller.close();
          },
        }),
        { headers: { 'content-type': 'application/json' } },
      ),
  );
  await expect(
    grant(() => {
      if (!active) throw Error('Inactive scope');
    }),
  ).rejects.toThrow('Inactive scope');
});
it('every context field, algorithm, schema and key format is checked before returning material', async () => {
  for (const extra of [
    { ownerId: 'other' },
    { restoreId: 'other' },
    { bookId: 'other' },
    { jobToken: 'd'.repeat(64) },
    { reviewHash: 'd'.repeat(64) },
    { keyId: 'd'.repeat(64) },
    { schemaVersion: 2 },
    { algorithm: 'AES-CBC' },
    { keyBase64: 'bad' },
    { keyBase64: Buffer.alloc(16).toString('base64') },
    { unexpected: 'PRIVATE_TEST_LITERAL' },
  ]) {
    fetch.mockResolvedValue(response({ data: { ...body().data, ...extra } }));
    await expect(grant()).rejects.toThrow();
  }
});
it('noncanonical base64 is rejected even when it decodes to the same 32 bytes', async () => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',
    last = alphabet.indexOf(keyBase64.at(-2)),
    bad = keyBase64.slice(0, -2) + alphabet[last + 1] + '=';
  expect(Buffer.from(bad, 'base64')).toEqual(Buffer.from(keyBase64, 'base64'));
  fetch.mockResolvedValue(response({ data: { ...body().data, keyBase64: bad } }));
  await expect(grant()).rejects.toThrow();
});
it('safe HTTP failure preserves reason while excluding private error text', async () => {
  fetch.mockResolvedValue(
    response(
      {
        error: {
          code: 'failed-precondition',
          message: 'PRIVATE_KEY_OR_TEXT',
          details: { reason: 'state-conflict' },
        },
      },
      412,
    ),
  );
  await expect(grant()).rejects.toMatchObject({
    code: 'failed-precondition',
    details: { reason: 'state-conflict' },
  });
  fetch.mockResolvedValue(
    response(
      {
        error: {
          code: 'failed-precondition',
          message: 'PRIVATE_KEY_OR_TEXT',
          details: { reason: 'state-conflict' },
        },
      },
      412,
    ),
  );
  try {
    await grant();
    expect.fail('Expected refusal');
  } catch (error) {
    expect(error.message).not.toContain('PRIVATE_KEY_OR_TEXT');
  }
});
it('unknown error envelopes, HTML, oversized data, invalid JSON and UTF-8 never return a grant', async () => {
  const values = [
    response(
      { error: { code: 'unknown', message: 'private', details: { reason: 'unknown' } } },
      503,
    ),
    response(
      { error: { code: 'unavailable', message: 'private', details: { reason: 'PRIVATE TEXT' } } },
      503,
    ),
    new Response('<html>private</html>', { headers: { 'content-type': 'text/html' } }),
    new Response('x'.repeat(8193), { headers: { 'content-type': 'application/json' } }),
    new Response('{', { headers: { 'content-type': 'application/json' } }),
    new Response(new Uint8Array([255]), { headers: { 'content-type': 'application/json' } }),
  ];
  for (const value of values) {
    fetch.mockResolvedValue(value);
    await expect(grant()).rejects.toThrow();
  }
});
it('network failure is preserved without retrying or falling back to a callable', async () => {
  const failure = Error('No response');
  fetch.mockRejectedValueOnce(failure);
  await expect(grant()).rejects.toBe(failure);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('malformed private JSON does not expose response bytes through a parser error', async () => {
  fetch.mockResolvedValue(
    new Response('{"private":"PRIVATE_TEST_LITERAL', {
      headers: { 'content-type': 'application/json' },
    }),
  );
  try {
    await grant();
    expect.fail('Expected malformed JSON refusal');
  } catch (error) {
    expect(error.message).not.toContain('PRIVATE_TEST_LITERAL');
    expect(error.message).toContain('confirmar');
  }
});
