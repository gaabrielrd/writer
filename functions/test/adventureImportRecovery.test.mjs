import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdventureImportRecoveryHandler } from '../src/adventureImportRecovery.mjs';
import { adventureImportFail } from '../src/adventureImportContracts.mjs';

function response() {
  return {
    headers: {},
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}
const input = {
  importId: 'ImportFixture0001',
  jobToken: 'a'.repeat(64),
  reviewHash: 'b'.repeat(64),
};
const request = (extra = {}) => ({
  method: 'POST',
  headers: {
    authorization: 'Bearer firebase-token',
    'x-firebase-appcheck': 'appcheck-token',
    'content-type': 'text/plain;charset=UTF-8',
  },
  rawBody: Buffer.from(JSON.stringify(input)),
  ...extra,
});
function fixture(overrides = {}) {
  const calls = [];
  const service = {
    async getAdventureImportRecoveryKey(uid, value) {
      calls.push({ uid, value });
      return { keyBase64: Buffer.alloc(32).toString('base64') };
    },
  };
  const handler = createAdventureImportRecoveryHandler({
    service,
    verifyIdToken: async () => ({ uid: 'author' }),
    verifyAppCheck: async () => ({ appId: 'app' }),
    ...overrides,
  });
  return { handler, calls };
}
const privateHeaders = (res) => {
  assert.equal(res.headers['Cache-Control'], 'private, no-store');
  assert.equal(res.headers['Content-Type'], 'application/json; charset=utf-8');
};

test('key adapter sets private no-store before every method/auth/app-check/parse/domain error without echo', async () => {
  const cases = [
    [request({ method: 'GET' }), {}, 405, 'method-not-allowed'],
    [request({ headers: {} }), {}, 401, 'unauthenticated'],
    [request({ headers: { authorization: 'Bearer firebase-token' } }), {}, 401, 'unauthenticated'],
    [
      request(),
      {
        verifyIdToken: async () => {
          throw Error('secret-token');
        },
      },
      401,
      'unauthenticated',
    ],
    [
      request(),
      {
        verifyAppCheck: async () => {
          throw Error('secret-appcheck');
        },
      },
      401,
      'unauthenticated',
    ],
    [request({ rawBody: Buffer.from('{bad JSON') }), {}, 400, 'invalid-argument'],
    [request({ rawBody: Buffer.from([0xff, 0xfe]) }), {}, 400, 'invalid-argument'],
    [request({ rawBody: Buffer.alloc(8193) }), {}, 400, 'invalid-argument'],
    [
      request({
        headers: {
          authorization: 'Bearer token',
          'x-firebase-appcheck': 'token',
          'content-type': 'application/json',
        },
      }),
      {},
      400,
      'invalid-argument',
    ],
    [
      request(),
      {
        service: {
          getAdventureImportRecoveryKey: async () =>
            adventureImportFail('failed-precondition', 'key-mismatch'),
        },
      },
      412,
      'failed-precondition',
    ],
    [
      request(),
      {
        service: {
          getAdventureImportRecoveryKey: async () => {
            throw Error('server-private-stack');
          },
        },
      },
      503,
      'unavailable',
    ],
  ];
  for (const [req, dependencies, status, code] of cases) {
    const res = response(),
      base = fixture(dependencies);
    await base.handler(req, res);
    assert.equal(res.statusCode, status);
    assert.equal(res.body.error.code, code);
    privateHeaders(res);
    for (const forbidden of [
      'keyBase64',
      'secret-token',
      'secret-appcheck',
      'server-private-stack',
      input.reviewHash,
    ])
      assert.equal(JSON.stringify(res.body).includes(forbidden), false);
  }
});
test('positive key adapter verifies both tokens before domain access and uses the dedicated data envelope', async () => {
  const order = [],
    res = response();
  const handler = createAdventureImportRecoveryHandler({
    verifyIdToken: async (token) => {
      privateHeaders(res);
      order.push(['auth', token]);
      return { uid: 'author' };
    },
    verifyAppCheck: async (token) => {
      privateHeaders(res);
      order.push(['appcheck', token]);
      return {};
    },
    service: {
      async getAdventureImportRecoveryKey(uid, data) {
        order.push(['domain', uid]);
        assert.deepEqual(data, input);
        return { algorithm: 'AES-GCM' };
      },
    },
  });
  await handler(request(), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { data: { algorithm: 'AES-GCM' } });
  assert.deepEqual(order, [
    ['auth', 'firebase-token'],
    ['appcheck', 'appcheck-token'],
    ['domain', 'author'],
  ]);
  privateHeaders(res);
});
