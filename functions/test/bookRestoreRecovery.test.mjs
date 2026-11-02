import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBookRestoreRecoveryHandler } from '../src/bookRestoreRecovery.mjs';
import { GenerationError } from '../src/generation.mjs';
function fixture(overrides = {}) {
  const calls = [];
  const handler = createBookRestoreRecoveryHandler({
    service: {
      getBookRestoreRecoveryKey: async (...args) => {
        calls.push(args);
        return { keyBase64: 'private-key' };
      },
    },
    verifyIdToken: async (token) => {
      assert.equal(token, 'auth-token');
      return { uid: 'author' };
    },
    verifyAppCheck: async (token) => {
      assert.equal(token, 'app-token');
      return { appId: 'app' };
    },
    ...overrides,
  });
  return {
    calls,
    async run(extra = {}) {
      const headers = {};
      const res = {
        code: 200,
        setHeader: (k, v) => {
          headers[k] = v;
        },
        status(code) {
          this.code = code;
          return this;
        },
        json(body) {
          return { code: this.code, headers, body };
        },
      };
      return handler(
        {
          method: 'POST',
          headers: {
            authorization: 'Bearer auth-token',
            'x-firebase-appcheck': 'app-token',
            'content-type': 'text/plain;charset=utf-8',
          },
          rawBody: Buffer.from('{"restoreId":"example"}'),
          ...extra,
        },
        res,
      );
    },
  };
}
test('HTTP authenticates both tokens, forwards parsed input and disables caching', async () => {
  const f = fixture(),
    r = await f.run();
  assert.equal(r.code, 200);
  assert.equal(r.body.data.keyBase64, 'private-key');
  assert.deepEqual(f.calls, [['author', { restoreId: 'example' }]]);
  assert.equal(r.headers['Cache-Control'], 'private, no-store');
  assert.match(r.headers['Content-Type'], /^application\/json/);
});
test('method, auth and App Check failures never call the key service', async () => {
  for (const change of [
    { method: 'GET' },
    { headers: {} },
    { headers: { authorization: 'Bearer auth-token' } },
  ]) {
    const f = fixture(),
      r = await f.run(change);
    assert.ok([401, 405].includes(r.code));
    assert.equal(r.headers['Cache-Control'], 'private, no-store');
    assert.equal(f.calls.length, 0);
  }
  for (const name of ['verifyIdToken', 'verifyAppCheck']) {
    const f = fixture({
        [name]: async () => {
          throw new Error('sensitive');
        },
      }),
      r = await f.run();
    assert.equal(r.code, 401);
    assert.equal(f.calls.length, 0);
    assert.equal(JSON.stringify(r).includes('sensitive'), false);
  }
});
test('raw HTTP bounds, UTF-8, JSON and content type are enforced before the service', async () => {
  for (const change of [
    { rawBody: Buffer.alloc(8193) },
    { rawBody: Buffer.from([0xff]) },
    { rawBody: Buffer.from('{') },
    { rawBody: undefined },
    {
      headers: {
        authorization: 'Bearer auth-token',
        'x-firebase-appcheck': 'app-token',
        'content-type': 'application/json',
      },
    },
  ]) {
    const f = fixture(),
      r = await f.run(change);
    assert.equal(r.code, 400);
    assert.equal(f.calls.length, 0);
  }
});
test('known service errors preserve safe reason, unknown errors expose no internals', async () => {
  for (const known of [false, true]) {
    const error = known
      ? new GenerationError('failed-precondition', 'private-text')
      : new Error('private-key');
    if (known) error.details = { reason: 'identity-conflict' };
    const f = fixture({
        service: {
          getBookRestoreRecoveryKey: async () => {
            throw error;
          },
        },
      }),
      r = await f.run();
    assert.equal(r.code, known ? 412 : 503);
    assert.equal(JSON.stringify(r).includes('private-text'), false);
    assert.equal(JSON.stringify(r).includes('private-key'), false);
  }
});
