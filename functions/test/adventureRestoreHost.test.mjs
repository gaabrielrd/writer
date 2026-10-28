import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import express from 'express';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getAppCheck } from 'firebase-admin/app-check';
import { ADVENTURE_RESTORE_METHODS } from '../src/adventureRestoreCallable.mjs';
const previousProject = process.env.GCLOUD_PROJECT;
process.env.GCLOUD_PROJECT = 'demo-writer-adventure-restore-host';
const host = await import('../src/index.mjs');
let server,
  address,
  auth,
  appCheckService,
  previousAuth,
  previousAppCheck,
  authChecks = 0;
before(async () => {
  // Test-only verifiers: production code and Functions middleware are unchanged.
  auth = getAuth();
  appCheckService = getAppCheck();
  previousAuth = auth.verifyIdToken;
  previousAppCheck = appCheckService.verifyToken;
  auth.verifyIdToken = async (token) => {
    authChecks++;
    if (token !== 'only-local-auth') throw Error('Rejected synthetic token');
    return { uid: 'author', sub: 'author' };
  };
  appCheckService.verifyToken = async (token, ...args) =>
    token === 'only-local-valid-app-check'
      ? { appId: 'local-contract-app', token: { app_id: 'local-contract-app' } }
      : previousAppCheck.call(appCheckService, token, ...args);
  const app = express();
  app.use(express.json());
  for (const method of ADVENTURE_RESTORE_METHODS) app.post('/' + method, host[method]);
  server = createServer(app);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  address = 'http://127.0.0.1:' + server.address().port;
});
after(async () => {
  if (auth) auth.verifyIdToken = previousAuth;
  if (appCheckService) appCheckService.verifyToken = previousAppCheck;
  server?.closeAllConnections();
  if (server) await new Promise((resolve) => server.close(resolve));
  if (previousProject === undefined) delete process.env.GCLOUD_PROJECT;
  else process.env.GCLOUD_PROJECT = previousProject;
});
test('host exports exactly the public adventure protocol without internal readers or recovery keys', () => {
  assert.deepEqual(
    Object.keys(host)
      .filter((n) => /AdventureRestore/.test(n))
      .sort(),
    [...ADVENTURE_RESTORE_METHODS].sort(),
  );
  assert.equal(host.getAdventureRestoreRecoveryKey, undefined);
  assert.equal(host.openVerifiedAdventureRestoreContent, undefined);
  assert.equal(host.readAdventureStageJournal, undefined);
});
for (const method of ADVENTURE_RESTORE_METHODS)
  test(
    'exported restore command preserves Auth, region and resource limits: ' + method,
    async () => {
      const callable = host[method];
      assert.equal(typeof callable, 'function');
      assert.equal(typeof callable.run, 'function');
      assert.deepEqual(callable.__endpoint.region, ['us-central1']);
      assert.equal(callable.__endpoint.availableMemoryMb, 512);
      assert.deepEqual(callable.__endpoint.secretEnvironmentVariables, []);
      assert.ok(callable.__endpoint.callableTrigger);
      assert.equal(callable.__endpoint.httpsTrigger, undefined);
      assert.equal(callable.__endpoint.maxInstances, 5);
      assert.equal(
        callable.__endpoint.timeoutSeconds,
        method === 'advanceAdventureRestoreValidation' ? 540 : 120,
      );
      const headers = new Map();
      await assert.rejects(
        () =>
          callable.run({
            data: { privateText: 'PRIVATE_TEST_LITERAL' },
            rawRequest: { res: { setHeader: (k, v) => headers.set(k, v) } },
          }),
        (error) => error.code === 'unauthenticated' && error.details?.reason === 'auth-required',
      );
      assert.equal(headers.get('Cache-Control'), 'private, no-store');
      assert.equal(headers.get('Vary'), 'Authorization');
    },
  );
for (const method of [
  'advanceAdventureRestoreProfiles',
  'getAdventureRestoreActivationReview',
  'activateAdventureRestore',
  'advanceAdventureRestoreMedia',
  'advanceAdventureRestoreArchiveCleanup',
])
  for (const appCheck of [null, 'invalid-test-app-check'])
    test(
      'HTTP ' +
        method +
        ' rejects ' +
        (appCheck === null ? 'missing' : 'invalid') +
        ' App Check before service',
      async () => {
        const response = await fetch(address + '/' + method, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer only-local-auth',
            ...(appCheck ? { 'X-Firebase-AppCheck': appCheck } : {}),
          },
          body: JSON.stringify({
            data: {
              privateText: 'PRIVATE_TEST_LITERAL',
              method: 'openPreparedAdventureRestoreLore',
            },
          }),
        });
        assert.ok(authChecks > 0);
        assert.equal(response.status, 401);
        const raw = await response.text(),
          body = JSON.parse(raw);
        assert.equal(body.error.status, 'UNAUTHENTICATED');
        assert.equal(body.error.message, 'Unauthenticated');
        assert.equal(body.error.details, undefined);
        assert.equal(raw.includes('PRIVATE_TEST_LITERAL'), false);
        assert.equal(raw.includes('invalid-test-app-check'), false);
      },
    );

for (const authToken of [null, 'only-local-invalid-auth', 'only-local-auth'])
  test(
    'HTTP valid test App Check still enforces Auth and the closed restore input: ' + authToken,
    async () => {
      const response = await fetch(address + '/getAdventureRestoreActivationReview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Firebase-AppCheck': 'only-local-valid-app-check',
          ...(authToken ? { Authorization: 'Bearer ' + authToken } : {}),
        },
        body: JSON.stringify({
          data: { privateText: 'PRIVATE_TEST_LITERAL', method: 'openPreparedAdventureRestoreLore' },
        }),
      });
      const raw = await response.text(),
        body = JSON.parse(raw);
      assert.equal(raw.includes('PRIVATE_TEST_LITERAL'), false);
      if (authToken === 'only-local-auth') {
        assert.equal(response.status, 400);
        assert.equal(body.error.status, 'INVALID_ARGUMENT');
        assert.equal(body.error.details.reason, 'invalid-input');
        assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
        assert.ok(response.headers.get('Vary').includes('Authorization'));
      } else {
        assert.equal(response.status, 401);
        assert.equal(body.error.status, 'UNAUTHENTICATED');
      }
    },
  );

test('unexpected service faults are sanitized by the real HTTP callable boundary', async () => {
  const db = getFirestore(),
    previousRun = db.runTransaction;
  db.runTransaction = async () => {
    throw Error('PRIVATE_UNEXPECTED_SERVICE_DETAILS');
  };
  try {
    const response = await fetch(address + '/getAdventureRestore', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer only-local-auth',
        'X-Firebase-AppCheck': 'only-local-valid-app-check',
      },
      body: JSON.stringify({
        data: { restoreId: 'service-fault-check-0001', jobToken: 'a'.repeat(64) },
      }),
    });
    assert.equal(response.status, 503);
    const text = await response.text(),
      body = JSON.parse(text);
    assert.equal(body.error.status, 'UNAVAILABLE');
    assert.equal(body.error.details, undefined);
    assert.equal(text.includes('PRIVATE_UNEXPECTED'), false);
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  } finally {
    db.runTransaction = previousRun;
  }
});
