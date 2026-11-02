import test from 'node:test';
import assert from 'node:assert/strict';
import { createDomainHandler } from '../src/domainCallable.mjs';
import { FUNCTION_DOMAINS, FUNCTION_ROUTES } from '../src/functionDomains.mjs';
import { GenerationError } from '../src/generation.mjs';
import { createWorkProgressService } from '../src/workProgress.mjs';
import { workFixture, book, operation } from './workProgressFixtures.mjs';
import { chapterWritingFixture } from './helpers/bookChapterStorageFixture.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';

const request = (action, payload = {}, uid = 'author') => ({
  auth: uid ? { uid } : null,
  app: { appId: 'demo-app' },
  data: { version: 1, action, payload },
});

test('306 actions have exactly one destination and retain every private payload/context', async () => {
  assert.equal(Object.keys(FUNCTION_DOMAINS).length, 16);
  assert.equal(Object.keys(FUNCTION_ROUTES).length, 306);
  const seen = new Set();
  for (const [name, domain] of Object.entries(FUNCTION_DOMAINS)) {
    for (const [action, method] of Object.entries(domain.actions)) {
      assert.equal(seen.has(action), false);
      seen.add(action);
      assert.equal(FUNCTION_ROUTES[action], name);
      const payload = { operationId: 'same-operation-0001', target: { id: 'private' } };
      const original = request(action, payload);
      let calls = 0;
      const dispatch = createDomainHandler({
        domain,
        name,
        invoke: async (selected, passed) => {
          calls++;
          assert.equal(selected, method);
          assert.equal(passed.auth, original.auth);
          assert.equal(passed.app, original.app);
          assert.equal(passed.data, payload);
          return { accepted: true };
        },
      });
      assert.deepEqual(await dispatch(original), { accepted: true });
      assert.equal(calls, 1);
    }
  }
});

test('closed envelopes reject foreign sectors, inherited properties, version and forged identity before dispatch', async () => {
  let calls = 0;
  const dispatch = createDomainHandler({
    domain: FUNCTION_DOMAINS.workApi,
    name: 'workApi',
    invoke: () => {
      calls++;
    },
  });
  for (const action of ['constructor', '__proto__', 'toString', 'createUniverse', 'chapterChat'])
    await assert.rejects(dispatch(request(action)), { code: 'invalid-argument' });
  for (const data of [
    null,
    [],
    {},
    { version: 2, action: 'getWorkProgress', payload: {} },
    { version: 1, action: 'getWorkProgress' },
    { version: 1, action: 'getWorkProgress', payload: {}, auth: { uid: 'other' } },
  ])
    await assert.rejects(dispatch({ ...request('getWorkProgress'), data }), {
      code: 'invalid-argument',
    });
  await assert.rejects(dispatch(request('getWorkProgress', {}, null)), { code: 'unauthenticated' });
  assert.equal(calls, 0);
});

test('same accepted progress mutation replays across direct service and domain without duplicate revision or credits', async () => {
  const f = workFixture(),
    api = createWorkProgressService({ db: f.db, now: () => 200 }),
    dispatch = createDomainHandler({
      domain: FUNCTION_DOMAINS.workApi,
      name: 'workApi',
      invoke: (method, r) => api[method](r.auth.uid, r.data),
    }),
    payload = {
      target: book,
      operationId: operation(1),
      expectedRevision: 0,
      patch: { wordGoal: 100 },
    };
  const first = await dispatch(request('updateWorkProgress', payload));
  assert.deepEqual(await dispatch(request('updateWorkProgress', payload)), first);
  assert.deepEqual(await api.updateWorkProgress('author', payload), first);
  assert.equal((await api.getWorkProgress('author', { target: book })).revision, 1);
  await assert.rejects(
    dispatch(request('updateWorkProgress', { ...payload, operationId: operation(2) }, 'other')),
    { code: 'not-found' },
  );
});

test('history capture and exact body read use the same real services through the sector boundary', async () => {
  const memory = adventureImportDb({ nativeUpdates: true }),
    f = await chapterWritingFixture(memory.db),
    dispatch = createDomainHandler({
      domain: FUNCTION_DOMAINS.workApi,
      name: 'workApi',
      invoke: (method, r) => f.history[method](r.auth.uid, r.data),
    }),
    source = await dispatch(
      request('getWorkVersionSource', { target: f.target, resource: f.resource }),
    ),
    payload = {
      target: f.target,
      resource: f.resource,
      operationId: 'domain-history-capture-0001',
      expectedSourceToken: source.sourceToken,
    },
    first = await dispatch(request('createWorkVersion', payload));
  assert.deepEqual(await dispatch(request('createWorkVersion', payload)), first);
  const body = await dispatch(
    request('readWorkVersion', { target: f.target, versionId: first.version.id }),
  );
  assert.equal(body.chunks.map((c) => c.content).join(''), 'Base');
  assert.equal(
    await dispatch(
      request('getWorkVersionSource', { target: f.target, resource: f.resource }, 'other'),
    ),
    null,
  );
});

test('uncertain responses never repeat dispatch and logs contain only registered action/status/latency', async () => {
  const logs = [];
  let calls = 0;
  const error = new GenerationError('unavailable', 'PRIVATE_TEXT');
  const dispatch = createDomainHandler({
    domain: FUNCTION_DOMAINS.workApi,
    name: 'workApi',
    invoke: () => {
      calls++;
      throw error;
    },
    observe: (entry) => logs.push(entry),
  });
  await assert.rejects(
    dispatch(request('updateWorkProgress', { secret: 'PRIVATE_TEXT' })),
    (e) => e === error,
  );
  assert.equal(calls, 1);
  assert.deepEqual(Object.keys(logs[0]).sort(), ['action', 'domain', 'durationMs', 'outcome']);
  assert.equal(JSON.stringify(logs).includes('PRIVATE_TEXT'), false);
  assert.equal(logs[0].outcome, 'unavailable');
  const sdkFailure = createDomainHandler({
    domain: FUNCTION_DOMAINS.workApi,
    name: 'workApi',
    invoke: () => {
      throw Object.assign(new Error('PRIVATE_TEXT'), { code: 'invalid-argument' });
    },
    observe: (entry) => logs.push(entry),
  });
  await assert.rejects(sdkFailure(request('getWorkProgress')), { code: 'invalid-argument' });
  assert.equal(logs.at(-1).outcome, 'invalid-argument');
  const accepted = createDomainHandler({
    domain: FUNCTION_DOMAINS.workApi,
    name: 'workApi',
    invoke: () => 42,
    observe: () => {
      throw Error('logger offline');
    },
  });
  assert.equal(await accepted(request('getWorkProgress')), 42);
});
