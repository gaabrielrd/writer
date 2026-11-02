import { domainSdkFixture } from './helpers/domainSdkFixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import express from 'express';
import { ADVENTURE_BACKUP_METHODS } from '../src/adventureBackupCallable.mjs';
// Fresh process, synthetic project and closed loopback emulator address: no remote credentials or data.
process.env.GCLOUD_PROJECT = 'demo-writer-backup-sdk';
process.env.FIREBASE_CONFIG = JSON.stringify({
  projectId: 'demo-writer-backup-sdk',
  storageBucket: 'demo-writer-backup-sdk.appspot.com',
});
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:9';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9';
const endpoints = domainSdkFixture(await import('../src/index.mjs'));
test('all 17 actual SDK sector actions preserve endpoint limits and private headers while rejecting unauthenticated run', async () => {
  for (const name of ADVENTURE_BACKUP_METHODS) {
    const endpoint = endpoints[name];
    assert.equal(typeof endpoint, 'function');
    assert.equal(typeof endpoint.run, 'function');
    assert.deepEqual(endpoint.__endpoint.region, ['us-central1']);
    assert.equal(endpoint.__endpoint.timeoutSeconds, 120);
    const headers = new Map();
    await assert.rejects(
      () =>
        endpoint.run({
          data: { adventureId: 'private-adventure-0001' },
          rawRequest: { res: { setHeader: (k, v) => headers.set(k, v) } },
        }),
      { code: 'unauthenticated' },
    );
    assert.equal(headers.get('Cache-Control'), 'private, no-store');
    assert.equal(headers.get('Vary'), 'Authorization, X-Firebase-AppCheck');
  }
});
test('actual SDK HTTP middleware rejects calls without Auth/App Check before any source or Storage read', async () => {
  const app = express();
  app.use(
    express.json({
      verify: (req, _res, bytes) => {
        req.rawBody = bytes;
      },
    }),
  );
  for (const name of ADVENTURE_BACKUP_METHODS) app.post('/' + name, endpoints[name]);
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    for (const name of ADVENTURE_BACKUP_METHODS) {
      const response = await fetch('http://127.0.0.1:' + server.address().port + '/' + name, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Connection: 'close' },
        body: JSON.stringify({ data: { adventureId: 'private-adventure-0001' } }),
        signal: AbortSignal.timeout(3000),
      });
      assert.equal(response.status, 401);
      const body = await response.json();
      assert.equal(body.error.status, 'UNAUTHENTICATED');
      assert.equal(body.error.message, 'Unauthenticated');
    }
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
