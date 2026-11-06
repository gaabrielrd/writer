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
    const editorial = await call('planningApi', 'getLiteraryContract', { target: book });
    assert.equal(editorial.revision, 0);
    await assert.rejects(call('planningApi', 'startLiteraryProse', { target: book }), {
      code: 'invalid-argument',
    });
    await assert.rejects(call('generationApi', 'getLiteraryContract', { target: book }), {
      code: 'invalid-argument',
    });
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

test('actual SDK sector composition registers and controls native chapter sequences while keeping internal hooks unreachable', async () => {
  const { setup } = await import('./helpers/literarySequenceFixtures.mjs');
  const f = await setup(),
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
      app: { appId: 'demo' },
      data: { version: 1, action, payload },
    });
  try {
    const source = await call('planningApi', 'getLiterarySequenceScope', {
      target: f.input.target,
      chapterIds: f.input.chapterIds,
    });
    const registered = await call('planningApi', 'startLiterarySequence', {
      ...f.input,
      expectedScopeToken: source.originToken,
      requestHash: 'a'.repeat(64),
    });
    assert.equal(registered.job.currentWorkflowId, null);
    const first = await call('generationApi', 'advanceLiterarySequence', {
      target: f.input.target,
      jobId: f.input.jobId,
      operationId: 'sdk-sequence-advance-0001',
      expectedRevision: registered.job.revision,
      expectedOriginToken: registered.job.originToken,
      requestHash: 'b'.repeat(64),
    });
    assert.ok(first.job.currentWorkflowId);
    const outcome = await call('planningApi', 'getLiterarySequenceOperation', {
      target: f.input.target,
      jobId: f.input.jobId,
      operationId: 'sdk-sequence-advance-0001',
    });
    assert.equal(outcome.state, 'confirmed');
    assert.equal(outcome.requestHash, 'b'.repeat(64));
    const replay = await call('generationApi', 'resumeLiterarySequenceOperation', {
      target: f.input.target,
      jobId: f.input.jobId,
      operationId: 'sdk-sequence-advance-0001',
    });
    assert.equal(replay.job.currentWorkflowId, first.job.currentWorkflowId);
    const paused = await call('planningApi', 'setLiterarySequenceControl', {
      target: f.input.target,
      jobId: f.input.jobId,
      operationId: 'sdk-sequence-control-0001',
      expectedRevision: first.job.revision,
      expectedOriginToken: first.job.originToken,
      action: 'pause',
      requestHash: 'c'.repeat(64),
    });
    assert.equal(paused.job.paused, true);
    const listed = await call('planningApi', 'listLiterarySequences', {
      target: f.input.target,
      limit: 1,
    });
    assert.equal(listed.items[0].jobId, f.input.jobId);
    const current = await call('planningApi', 'getLiterarySequence', {
      target: f.input.target,
      jobId: f.input.jobId,
    });
    assert.equal(current.job.paused, true);
    for (const helper of [
      'workflowHooks',
      'completeLiterarySequenceChapter',
      'createLiterarySequenceDriver',
    ])
      await assert.rejects(call('planningApi', helper, { target: f.input.target }), {
        code: 'invalid-argument',
      });
    await assert.rejects(call('planningApi', 'advanceLiterarySequence', {}), {
      code: 'invalid-argument',
    });
    await assert.rejects(call('generationApi', 'getLiterarySequence', {}), {
      code: 'invalid-argument',
    });
    assert.equal(f.records.get('users/author').credits, 10);
  } finally {
    for (const [method, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(Firestore.prototype, method, descriptor);
      else delete Firestore.prototype[method];
    }
  }
});

test('sector exposes managed impact actions while refusing its raw graph and index helpers', async () => {
  const { studioDb } = await import('./helpers/studioDb.mjs'),
    f = studioDb({ sharedBirth: true }),
    descriptors = new Map();
  f.records.set('books/book', {
    authorId: 'author',
    title: 'Private',
    status: 'draft',
    updatedAt: 10,
  });
  for (const method of ['doc', 'collection', 'collectionGroup', 'runTransaction']) {
    descriptors.set(method, Object.getOwnPropertyDescriptor(Firestore.prototype, method));
    Object.defineProperty(Firestore.prototype, method, {
      configurable: true,
      value: (...args) => f.db[method](...args),
    });
  }
  const call = (action, payload) =>
    endpoints.planningApi.run({
      auth: { uid: 'author' },
      app: { appId: 'demo-app' },
      data: { version: 1, action, payload },
    });
  try {
    const intent = {
      target: { kind: 'book', id: 'book' },
      bookIds: ['book'],
      sources: [{ kind: 'book', id: 'book', scopeKind: 'book', scopeId: 'book' }],
      prepareIndices: false,
    };
    const scope = await call('getLiteraryImpactScope', intent);
    const frame = await call('startLiteraryImpact', {
      ...intent,
      jobId: 'impact-sector-000001',
      expectedBookToken: scope.bookToken,
      expectedScopeToken: scope.scopeToken,
      requestHash: 'a'.repeat(64),
    });
    assert.equal(frame.phase, 'freezing');
    assert.equal(frame.publicationReady, false);
    for (const action of [
      'readLiteraryImpactBookInventoryPage',
      'verifyLiteraryImpactInventoryLink',
      'backfillLiteraryGuideDependencyIndex',
      'append',
    ])
      await assert.rejects(call(action, { target: intent.target }), { code: 'invalid-argument' });
  } finally {
    for (const [method, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(Firestore.prototype, method, descriptor);
      else delete Firestore.prototype[method];
    }
  }
});
