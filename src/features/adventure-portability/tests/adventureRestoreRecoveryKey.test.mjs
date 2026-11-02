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
  adventureId: 'adventure-key-test-0001',
  jobToken: 'a'.repeat(64),
  reviewHash: 'b'.repeat(64),
  keyId: 'c'.repeat(64),
};
const keyBase64 = Buffer.alloc(32, 7).toString('base64');
const body = () => ({ data: { schemaVersion: 1, ...context, algorithm: 'AES-GCM', keyBase64 } });
const response = (value = body(), status = 200, headers = { 'content-type': 'application/json' }) =>
  new Response(JSON.stringify(value), { status, headers });
const grant = async (guard = () => {}) =>
  (await import('../services/adventureRestoreRecoveryKey.ts')).getAdventureRestoreRecoveryGrant(
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
  const { getAdventureRestoreRecoveryGrant } =
    await import('../services/adventureRestoreRecoveryKey.ts');
  expect(mocks.load).not.toHaveBeenCalled();
  const value = await getAdventureRestoreRecoveryGrant(context, () => {});
  expect(fetch).toHaveBeenCalledExactlyOnceWith(
    '/api/adventure-restore/recovery-key',
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
    { adventureId: 'other' },
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
    expect(error.message).toContain('autorizar');
  }
});

it('first authorization learns the keyId; the same context reauthorizes and decrypts with the same key', async () => {
  const first = { ...context };
  delete first.keyId;
  const { getAdventureRestoreRecoveryGrant } =
    await import('../services/adventureRestoreRecoveryKey.ts');
  const one = await getAdventureRestoreRecoveryGrant(first, () => {});
  const initialBody = JSON.parse(fetch.mock.calls[0][1].body);
  expect(initialBody).not.toHaveProperty('expectedKeyId');
  expect(one.keyId).toBe(context.keyId);
  expect(Object.isFrozen(one)).toBe(true);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    one.key,
    new TextEncoder().encode('PRIVATE_REVIEW_TEXT'),
  );
  const again = await getAdventureRestoreRecoveryGrant(context, () => {});
  expect(JSON.parse(fetch.mock.calls[1][1].body).expectedKeyId).toBe(context.keyId);
  const clear = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, again.key, encrypted);
  expect(new TextDecoder().decode(clear)).toBe('PRIVATE_REVIEW_TEXT');
});

it.each([
  { ownerId: '' },
  { ownerId: '.' },
  { ownerId: '..' },
  { ownerId: 'a/b' },
  { ownerId: 'a\\b' },
  { ownerId: 'a\u0000b' },
  { ownerId: '\uD800' },
  { ownerId: 'a'.repeat(129) },
  { restoreId: 'too-short' },
  { restoreId: 'a'.repeat(81) },
  { restoreId: 'restore/invalid-id' },
  { adventureId: 'book' },
  { jobToken: 'A'.repeat(64) },
  { reviewHash: 'bad' },
  { keyId: undefined },
  { keyId: 'bad' },
  { keyBase64: 'PRIVATE_LITERAL' },
  { bookId: 'foreign-domain' },
])('invalid recovery context fails before loading credentials: %j', async (patch) => {
  const { getAdventureRestoreRecoveryGrant } =
    await import('../services/adventureRestoreRecoveryKey.ts');
  await expect(
    getAdventureRestoreRecoveryGrant({ ...context, ...patch }, () => {}),
  ).rejects.toThrow();
  expect(mocks.load).not.toHaveBeenCalled();
  expect(mocks.getToken).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

it('identity is captured before awaiting tokens and mutation cannot retarget the request', async () => {
  const expected = { ...context };
  mocks.auth.currentUser.getIdToken.mockImplementation(async () => {
    expected.adventureId = 'another-adventure-0001';
    expected.keyId = 'd'.repeat(64);
    return 'local-auth';
  });
  const { getAdventureRestoreRecoveryGrant } =
    await import('../services/adventureRestoreRecoveryKey.ts');
  const result = await getAdventureRestoreRecoveryGrant(expected, () => {});
  expect(result.adventureId).toBe(context.adventureId);
  expect(result.keyId).toBe(context.keyId);
  expect(JSON.parse(fetch.mock.calls[0][1].body).expectedKeyId).toBe(context.keyId);
});

it('guard invalidation after key import cannot yield a key and imported key bytes are wiped', async () => {
  let current = true,
    captured;
  const importKey = webcrypto.subtle.importKey.bind(webcrypto.subtle);
  vi.stubGlobal('crypto', {
    subtle: {
      importKey: async (...args) => {
        captured = args[1];
        const key = await importKey(...args);
        current = false;
        return key;
      },
    },
  });
  await expect(
    grant(() => {
      if (!current) throw Error('Expired scope');
    }),
  ).rejects.toThrow('Expired scope');
  expect([...captured].every((v) => v === 0)).toBe(true);
});

it('error status and fixed reason vocabulary prevent reflecting private server text', async () => {
  for (const [status, code, reason] of [
    [500, 'failed-precondition', 'state-conflict'],
    [412, 'failed-precondition', 'private-manuscript-text'],
    [412, 'constructor', 'state-conflict'],
  ]) {
    fetch.mockResolvedValue(
      response({ error: { code, message: 'PRIVATE_ERROR', details: { reason } } }, status),
    );
    await expect(grant()).rejects.toMatchObject({ code: 'adventure-restore-recovery-invalid' });
  }
});

it.each(['oversized', 'scope-expired'])(
  'response %s cancels its stream and wipes even the rejected chunk',
  async (kind) => {
    let allowed = true;
    const bytes =
      kind === 'oversized'
        ? new Uint8Array(8193).fill(65)
        : new TextEncoder().encode(JSON.stringify(body()));
    const cancel = vi.fn();
    fetch.mockResolvedValue(
      new Response(
        new ReadableStream(
          {
            pull(controller) {
              controller.enqueue(bytes);
              if (kind === 'scope-expired') allowed = false;
            },
            cancel,
          },
          { highWaterMark: 0 },
        ),
        { headers: { 'content-type': 'application/json' } },
      ),
    );
    await expect(
      grant(() => {
        if (!allowed) throw Error('Expired');
      }),
    ).rejects.toThrow();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect([...bytes].every((v) => v === 0)).toBe(true);
  },
);

it('the real adventure recovery handler provides compatible grants and closes them after cancellation', async () => {
  const { transferFixture, mutation } =
    await import('../../../../functions/test/helpers/adventureRestoreTransferFixture.mjs');
  const { createAdventureRestoreRecoveryHandler } =
    await import('../../../../functions/src/adventureRestoreRecoveryHttp.mjs');
  const f = transferFixture(),
    p = (await f.api.startAdventureRestore(f.uid, f.input)).progress;
  const expected = {
    ownerId: f.uid,
    restoreId: p.restoreId,
    adventureId: p.adventureId,
    jobToken: p.jobToken,
    reviewHash: f.input.reviewHash,
  };
  const handler = createAdventureRestoreRecoveryHandler({
    service: f.api,
    verifyIdToken: async (token) => {
      expect(token).toBe('local-auth');
      return { uid: f.uid };
    },
    verifyAppCheck: async (token) => {
      expect(token).toBe('local-app-check');
      return { appId: 'test' };
    },
  });
  fetch.mockImplementation(async (path, init) => {
    expect(path).toBe('/api/adventure-restore/recovery-key');
    const headers = Object.fromEntries(new Headers(init.headers));
    const resultHeaders = {};
    const res = {
      code: 200,
      setHeader: (name, value) => {
        resultHeaders[name] = value;
      },
      status(code) {
        this.code = code;
        return this;
      },
      json(value) {
        return new Response(JSON.stringify(value), { status: this.code, headers: resultHeaders });
      },
    };
    return handler({ method: init.method, headers, rawBody: Buffer.from(init.body) }, res);
  });
  const { getAdventureRestoreRecoveryGrant } =
    await import('../services/adventureRestoreRecoveryKey.ts');
  const initial = await getAdventureRestoreRecoveryGrant(expected, () => {});
  const resumed = await getAdventureRestoreRecoveryGrant(
    { ...expected, keyId: initial.keyId },
    () => {},
  );
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    initial.key,
    new TextEncoder().encode('OWN_REVIEW'),
  );
  expect(
    new TextDecoder().decode(
      await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, resumed.key, encrypted),
    ),
  ).toBe('OWN_REVIEW');
  await f.api.cancelAdventureRestore(f.uid, mutation(p, 'adventure-client-cancel-0001'));
  await expect(
    getAdventureRestoreRecoveryGrant({ ...expected, keyId: initial.keyId }, () => {}),
  ).rejects.toMatchObject({ code: 'failed-precondition', details: { reason: 'state-conflict' } });
});

it.each(['\uFEFFauthor', 'autora-😀', ' '])(
  'identity preserves the server-authorized Unicode UID %j',
  async (ownerId) => {
    const { readAdventureRestoreRecoveryRequest, readAdventureRestoreRecoveryContext } =
      await import('../services/adventureRestoreRecoveryContracts.ts');
    const identity = readAdventureRestoreRecoveryRequest({ ...context, ownerId });
    expect(identity.ownerId).toBe(ownerId);
    expect(readAdventureRestoreRecoveryContext(identity)).toEqual({ ...context, ownerId });
    expect(Object.isFrozen(identity)).toBe(true);
    expect(mocks.load).not.toHaveBeenCalled();
  },
);
