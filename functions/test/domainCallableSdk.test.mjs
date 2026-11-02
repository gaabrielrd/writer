import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { FUNCTION_DOMAINS } from '../src/functionDomains.mjs';
import { Firestore } from 'firebase-admin/firestore';
import { workFixture, book } from './workProgressFixtures.mjs';
process.env.GCLOUD_PROJECT = 'demo-writer-domains';
process.env.FIREBASE_CONFIG = JSON.stringify({
  projectId: 'demo-writer-domains',
  storageBucket: 'demo-writer-domains.appspot.com',
});
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:9';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9';
const endpoints = await import('../src/index.mjs');

test('real sector composition reaches progress, campaigns, adventures and image library through their own services', async () => {
  const f = workFixture(),
    descriptors = new Map();
  for (const method of ['doc', 'collection', 'collectionGroup', 'runTransaction']) {
    descriptors.set(method, Object.getOwnPropertyDescriptor(Firestore.prototype, method));
    Object.defineProperty(Firestore.prototype, method, {
      configurable: true,
      value: (...args) => f.db[method](...args),
    });
  }
  const call = (endpoint, action, payload) =>
    endpoints[endpoint].run({
      auth: { uid: 'author' },
      app: { appId: 'demo-app' },
      data: { version: 1, action, payload },
    });
  try {
    const progress = await call('workApi', 'getWorkProgress', { target: book });
    assert.equal(progress.target.id, 'book');
    const campaign = await call('campaignsApi', 'createCampaign', {
      operationId: 'domain-campaign-0001',
      title: 'Private campaign',
    });
    assert.ok(campaign);
    assert.equal(f.records.get('campaigns/domain-campaign-0001').title, 'Private campaign');
    await call('adventuresApi', 'createAdventure', {
      operationId: 'domain-adventure-0001',
      title: 'Private adventure',
    });
    assert.equal(f.records.get('adventures/domain-adventure-0001').title, 'Private adventure');
    f.records.set('users/author/imageLibrary/domain-image-0001', {
      state: 'active',
      name: 'Before',
    });
    await call('mediaApi', 'renameLibraryImage', { id: 'domain-image-0001', name: 'Renamed' });
    assert.equal(f.records.get('users/author/imageLibrary/domain-image-0001').name, 'Renamed');
  } finally {
    for (const [method, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(Firestore.prototype, method, descriptor);
      else delete Firestore.prototype[method];
    }
  }
});

test('actual SDK exports exactly 30 resources, isolated secrets and long-running profiles', async () => {
  assert.equal(Object.keys(endpoints).length, 30);
  for (const [name, domain] of Object.entries(FUNCTION_DOMAINS)) {
    const endpoint = endpoints[name];
    assert.ok(endpoint.__endpoint.callableTrigger);
    assert.equal(endpoint.__endpoint.timeoutSeconds, domain.options.timeoutSeconds);
    assert.equal(endpoint.__endpoint.availableMemoryMb, 512);
    const secrets = endpoint.__endpoint.secretEnvironmentVariables ?? [];
    assert.equal(secrets.length, domain.requiresGenerationKey ? 1 : 0);
    for (const secret of secrets) assert.equal(secret.key, 'BOOK_GENERATION_GEMINI_KEY');
    const action = Object.keys(domain.actions)[0];
    await assert.rejects(endpoint.run(request(action)), { code: 'unauthenticated' });
    await assert.rejects(
      endpoint.run({
        auth: { uid: 'author' },
        data: { version: 1, action: '__proto__', payload: {} },
      }),
      { code: 'invalid-argument' },
    );
  }
  for (const name of ['chapterChat', 'editorChat'])
    assert.ok(endpoints[name].__endpoint.callableTrigger);
});
function request(action) {
  return { data: { version: 1, action, payload: {} } };
}

test('real HTTP middleware rejects missing Auth/App Check for all sectors without credentials or I/O', async () => {
  const app = express();
  app.use(express.json());
  for (const name of Object.keys(FUNCTION_DOMAINS)) app.post('/' + name, endpoints[name]);
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    for (const [name, domain] of Object.entries(FUNCTION_DOMAINS)) {
      const response = await fetch('http://127.0.0.1:' + server.address().port + '/' + name, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Connection: 'close' },
        body: JSON.stringify(request(Object.keys(domain.actions)[0])),
        signal: AbortSignal.timeout(3000),
      });
      assert.equal(response.status, 401);
      assert.equal((await response.json()).error.status, 'UNAUTHENTICATED');
    }
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
