import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import express from 'express';
import { onRequest } from 'firebase-functions/v2/https';
import { createBookLoreWriteRecoveryHandler } from '../src/bookLoreWriteRecoveryHttp.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import {
  bookLoreWriteRecoveryFixture,
  recoveryControl,
} from './helpers/bookLoreWriteRecoveryFixture.mjs';
import { readFile } from 'node:fs/promises';

function response() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(k, v) {
      this.headers[k] = v;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}
const request = (body = {}, extra = {}) => ({
  method: 'POST',
  headers: {
    authorization: 'Bearer fixture-auth',
    'x-firebase-appcheck': 'fixture-app',
    'content-type': 'text/plain;charset=utf-8',
  },
  rawBody: Buffer.from(JSON.stringify(body)),
  ...extra,
});
async function fixture() {
  const f = adventureImportDb({ nativeUpdates: true }),
    seed = await bookLoreWriteRecoveryFixture(f.db),
    p = await seed.service.reserveBookLoreEditRecovery(seed.uid, seed.intent);
  let hits = 0;
  const verifyIdToken = async (value) => {
      assert.equal(value, 'fixture-auth');
      return { uid: seed.uid };
    },
    verifyAppCheck = async (value) => assert.equal(value, 'fixture-app'),
    service = {
      async getBookLoreEditRecoveryKey(...args) {
        hits++;
        return seed.service.getBookLoreEditRecoveryKey(...args);
      },
    };
  return { ...f, ...seed, p, verifyIdToken, verifyAppCheck, service, hits: () => hits };
}
test('handler returns only the currently authorized original key with no-store and two verified credentials', async () => {
  const f = await fixture(),
    res = response(),
    handler = createBookLoreWriteRecoveryHandler(f);
  await handler(request(recoveryControl(f.p)), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['Cache-Control'], 'private, no-store');
  assert.equal(res.headers.Vary, 'Authorization');
  assert.equal(res.body.data.algorithm, 'AES-GCM');
  assert.equal(Buffer.from(res.body.data.keyBase64, 'base64').length, 32);
  assert.equal(f.hits(), 1);
});
test('method/auth/app-check failures always have no-store, never echo bytes and never open a key', async () => {
  const f = await fixture();
  for (const [req, overrides, status] of [
    [request({}, { method: 'GET' }), {}, 405],
    [request({}, { headers: {} }), {}, 401],
    [request({}, { headers: { authorization: 'Bearer fixture-auth' } }), {}, 401],
    [
      request(),
      {
        verifyIdToken: async () => {
          throw Error('PRIVATE');
        },
      },
      401,
    ],
    [request(), { verifyIdToken: async () => ({}) }, 401],
    [
      request(),
      {
        verifyAppCheck: async () => {
          throw Error('PRIVATE');
        },
      },
      401,
    ],
  ]) {
    const res = response();
    await createBookLoreWriteRecoveryHandler({ ...f, ...overrides })(req, res);
    assert.equal(res.statusCode, status);
    assert.equal(res.headers['Cache-Control'], 'private, no-store');
    assert.equal(JSON.stringify(res.body).includes('PRIVATE'), false);
  }
  assert.equal(f.hits(), 0);
});
test('content-type/raw-body/UTF8/closed-argument failures are sanitized without key or draft echo', async () => {
  const f = await fixture(),
    base = request(recoveryControl(f.p));
  for (const req of [
    { ...base, headers: { ...base.headers, 'content-type': 'application/json' } },
    { ...base, rawBody: 'PRIVATE' },
    { ...base, rawBody: Buffer.alloc(8193, 65) },
    { ...base, rawBody: Buffer.from([0xc3, 0x28]) },
    { ...base, rawBody: Buffer.from('PRIVATE') },
    request({ ...recoveryControl(f.p), keyBase64: 'PRIVATE' }),
  ]) {
    const res = response();
    await createBookLoreWriteRecoveryHandler(f)(req, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.headers['Cache-Control'], 'private, no-store');
    assert.equal(JSON.stringify(res.body).includes('PRIVATE'), false);
    assert.equal('data' in res.body, false);
  }
});
test('origin revocation and unexpected failure never expose a key or private diagnostics', async () => {
  const f = await fixture();
  f.records.get('books/book').authorId = 'other';
  const res = response();
  await createBookLoreWriteRecoveryHandler(f)(request(recoveryControl(f.p)), res);
  assert.equal(res.statusCode, 404);
  assert.equal(res.headers['Cache-Control'], 'private, no-store');
  assert.equal(JSON.stringify(res.body).includes('keyBase64'), false);
  const failed = response();
  await createBookLoreWriteRecoveryHandler({
    ...f,
    service: {
      getBookLoreEditRecoveryKey() {
        throw Error('PRIVATE keyBase64 secret');
      },
    },
  })(request(recoveryControl(f.p)), failed);
  assert.equal(failed.statusCode, 503);
  assert.equal(JSON.stringify(failed.body).includes('PRIVATE'), false);
});
test('real HTTP onRequest serves protected JSON and rejects unsupported requests before key access', async () => {
  const f = await fixture(),
    app = express();
  app.use(express.raw({ type: () => true, limit: '16kb' }));
  app.use((req, _res, next) => {
    req.rawBody = req.body;
    next();
  });
  app.all('/key', onRequest({ cors: false }, createBookLoreWriteRecoveryHandler(f)));
  const server = createServer(app);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const url = 'http://127.0.0.1:' + server.address().port + '/key';
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: request().headers,
      body: JSON.stringify(recoveryControl(f.p)),
    });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('cache-control'), 'private, no-store');
    const body = await r.json();
    assert.equal(Buffer.from(body.data.keyBase64, 'base64').length, 32);
    const missing = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: 'PRIVATE',
    });
    assert.equal(missing.status, 401);
    assert.equal(missing.headers.get('cache-control'), 'private, no-store');
    assert.equal((await missing.text()).includes('PRIVATE'), false);
    const unsupported = await fetch(url);
    assert.equal(unsupported.status, 405);
    assert.equal(unsupported.headers.get('allow'), 'POST');
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
test('Hosting routes recovery-key before SPA and no metadata method is the key endpoint', async () => {
  const config = JSON.parse(
      await readFile(new URL('../../firebase.json', import.meta.url), 'utf8'),
    ),
    at = config.hosting.rewrites.findIndex((r) => r.source === '/api/book-lore/recovery-key'),
    wildcard = config.hosting.rewrites.findIndex((r) => r.source === '**');
  assert.ok(at >= 0 && at < wildcard);
  assert.deepEqual(config.hosting.rewrites[at].function, {
    functionId: 'getBookLoreEditRecoveryKey',
    region: 'us-central1',
  });
});
