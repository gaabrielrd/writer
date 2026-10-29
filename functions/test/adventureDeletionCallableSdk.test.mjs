import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import express from 'express';
import { Firestore } from 'firebase-admin/firestore';
import { ADVENTURE_DELETION_METHODS as methods } from '../src/adventureDeletionCallable.mjs';
import { adventureDeletionDb } from './helpers/adventureDeletionDb.mjs';
import { createStudioService } from '../src/studio.mjs';
// Fresh process; the actual SDK binding uses a synthetic project and a local DB port.
// No credentials, customer data, Storage calls or remote emulator are needed.
process.env.GCLOUD_PROJECT = 'demo-writer-deletion-sdk';
process.env.FIREBASE_CONFIG = JSON.stringify({
  projectId: 'demo-writer-deletion-sdk',
  storageBucket: 'demo-writer-deletion-sdk.appspot.com',
});
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:9';
// Admin's emulator verifier checks the synthetic user record on loopback.
const authApp = express(),
  authReads = [];
authApp.use(express.json());
authApp.use((req, res) => {
  authReads.push(req.body);
  res.json({ users: [{ localId: 'synthetic-http-author', validSince: '0', disabled: false }] });
});
const authServer = createServer(authApp);
await new Promise((resolve) => authServer.listen(0, '127.0.0.1', resolve));
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:' + authServer.address().port;
test.after(async () => {
  authServer.closeAllConnections();
  await new Promise((resolve) => authServer.close(resolve));
});
const f = adventureDeletionDb();
let calls = 0;
const descriptors = new Map();
for (const method of ['doc', 'collection', 'collectionGroup', 'runTransaction']) {
  descriptors.set(method, Object.getOwnPropertyDescriptor(Firestore.prototype, method));
  Object.defineProperty(Firestore.prototype, method, {
    configurable: true,
    value(...args) {
      calls++;
      return f.db[method](...args);
    },
  });
}
test.after(() => {
  for (const [method, descriptor] of descriptors)
    if (descriptor) Object.defineProperty(Firestore.prototype, method, descriptor);
    else delete Firestore.prototype[method];
});
const endpoints = await import('../src/index.mjs');
const context = (data) => ({
  auth: { uid: 'author' },
  app: { appId: 'synthetic-verified-context' },
  data,
});
test('all six actual SDK exports retain bounded options, private headers and pre-storage guards', async () => {
  for (const name of methods) {
    const endpoint = endpoints[name];
    assert.equal(typeof endpoint, 'function');
    assert.equal(typeof endpoint.run, 'function');
    assert.deepEqual(endpoint.__endpoint.region, ['us-central1']);
    assert.equal(endpoint.__endpoint.timeoutSeconds, 120);
    assert.equal(endpoint.__endpoint.availableMemoryMb, 512);
    assert.equal(endpoint.__endpoint.maxInstances, 5);
    const headers = new Map(),
      before = calls;
    await assert.rejects(
      () =>
        endpoint.run({
          data: { adventureId: 'private-adventure' },
          rawRequest: { res: { setHeader: (k, v) => headers.set(k, v) } },
        }),
      { code: 'unauthenticated' },
    );
    assert.equal(headers.get('Cache-Control'), 'private, no-store');
    assert.equal(headers.get('Vary'), 'Authorization, X-Firebase-AppCheck');
    for (const app of [undefined, {}, { appId: '' }])
      await assert.rejects(
        () => endpoint.run({ ...context({}), app }),
        (e) => e.code === 'failed-precondition' && e.details.reason === 'app-check-required',
      );
    assert.equal(calls, before);
  }
});
test('actual index traverses all six commands and keeps the job discoverable after root deletion', async () => {
  const id = 'sdk-adventure-project-0001';
  await createStudioService({ db: f.db }).createAdventure('author', {
    operationId: id,
    title: 'Own SDK project',
  });
  const call = (method, data) => endpoints[method].run(context(data));
  const source = await call('getAdventureDeletionSource', { adventureId: id });
  const input = {
    adventureId: id,
    adventureToken: source.adventureToken,
    sourceToken: source.sourceToken,
    expectedRevision: source.revision,
    operationId: 'sdk-deletion-start-0001',
  };
  let p = (await call('startAdventureDeletion', input)).progress;
  for (let n = 0; !p.complete; n++) {
    assert.ok(n < 200);
    p = (
      await call('advanceAdventureDeletion', {
        deletionId: p.deletionId,
        deletionToken: p.deletionToken,
        expectedCheckpoint: p.checkpoint,
        operationId: 'sdk-deletion-step-' + String(n).padStart(6, '0'),
      })
    ).progress;
  }
  assert.equal(f.records.has('adventures/' + id), false);
  assert.equal((await call('getAdventureDeletion', { adventureId: id })).deletion.complete, true);
  assert.equal((await call('listAdventureDeletions', {})).items[0].complete, true);
  assert.equal(
    (await call('resolveAdventureDeletionStart', { ...input, intent: 'cancel' })).progress.complete,
    true,
  );
  assert.equal(await call('getAdventureDeletionSource', { adventureId: id }), null);
});
test('actual HTTP middleware rejects missing and malformed App Check without reflecting private input or reading storage', async () => {
  const app = express();
  app.use(
    express.json({
      verify: (req, _res, bytes) => {
        req.rawBody = bytes;
      },
    }),
  );
  for (const name of methods) app.post('/' + name, endpoints[name]);
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const before = calls,
      now = Math.floor(Date.now() / 1000);
    // The installed Admin SDK accepts unsigned Auth Emulator tokens only under
    // FIREBASE_AUTH_EMULATOR_HOST. This is synthetic identity, not a real account.
    const tokenPart = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const authToken =
      tokenPart({ alg: 'none', typ: 'JWT' }) +
      '.' +
      tokenPart({
        aud: process.env.GCLOUD_PROJECT,
        iss: 'https://securetoken.google.com/' + process.env.GCLOUD_PROJECT,
        sub: 'synthetic-http-author',
        iat: now,
        exp: now + 3600,
        auth_time: now,
        firebase: { identities: {}, sign_in_provider: 'custom' },
      }) +
      '.';
    for (const name of methods)
      for (const token of [null, 'malformed-private-appcheck']) {
        const response = await fetch('http://127.0.0.1:' + server.address().port + '/' + name, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Connection: 'close',
            Authorization: 'Bearer ' + authToken,
            ...(token ? { 'X-Firebase-AppCheck': token } : {}),
          },
          body: JSON.stringify({ data: { adventureId: 'DO_NOT_REFLECT_PRIVATE_TITLE' } }),
          signal: AbortSignal.timeout(3000),
        });
        assert.equal(response.status, 401);
        const body = await response.json();
        assert.deepEqual(body, {
          error: { message: 'Unauthenticated', status: 'UNAUTHENTICATED' },
        });
      }
    assert.equal(calls, before);
    assert.equal(authReads.length, methods.length * 2);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
