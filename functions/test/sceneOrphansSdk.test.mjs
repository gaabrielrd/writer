import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import express from 'express';
process.env.GCLOUD_PROJECT = 'demo-writer-orphans-sdk';
process.env.FIREBASE_CONFIG = JSON.stringify({
  projectId: 'demo-writer-orphans-sdk',
  storageBucket: 'demo-writer-orphans-sdk.appspot.com',
});
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:9';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9';
const endpoints = await import('../src/index.mjs'),
  names = ['listOrphanScenes', 'recoverOrphanScene'];
test('actual SDK routes bind both scene methods, private headers and runtime limits and reject unauthenticated run', async () => {
  const source = await readFile(new URL('../src/index.mjs', import.meta.url), 'utf8');
  for (const name of names) {
    assert.match(source, new RegExp('export const ' + name + " = callable\\('" + name + "'\\)"));
    const handler = endpoints[name],
      headers = new Map();
    assert.deepEqual(handler.__endpoint.region, ['us-central1']);
    assert.equal(handler.__endpoint.timeoutSeconds, 120);
    await assert.rejects(
      () =>
        handler.run({
          data: { target: { kind: 'adventure', id: 'private-adventure' } },
          rawRequest: { res: { setHeader: (k, v) => headers.set(k, v) } },
        }),
      { code: 'unauthenticated' },
    );
    assert.equal(headers.get('Cache-Control'), 'private, no-store');
    assert.equal(headers.get('Vary'), 'Authorization');
  }
});
test('actual SDK middleware refuses requests missing Auth/App Check before any project scan', async () => {
  const app = express();
  app.use(
    express.json({
      verify: (req, _res, bytes) => {
        req.rawBody = bytes;
      },
    }),
  );
  for (const name of names) app.post('/' + name, endpoints[name]);
  const server = createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    for (const name of names) {
      const r = await fetch('http://127.0.0.1:' + server.address().port + '/' + name, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Connection: 'close' },
        body: JSON.stringify({ data: { target: { kind: 'adventure', id: 'private-adventure' } } }),
        signal: AbortSignal.timeout(3000),
      });
      assert.equal(r.status, 401);
      assert.equal((await r.json()).error.message, 'Unauthenticated');
    }
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
});
