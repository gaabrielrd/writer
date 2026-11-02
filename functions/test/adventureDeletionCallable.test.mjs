import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ADVENTURE_DELETION_METHODS as methods,
  ADVENTURE_DELETION_CALLABLE_OPTIONS as options,
  invokeAdventureDeletionCallable as invoke,
  setAdventureDeletionHeaders as headers,
} from '../src/adventureDeletionCallable.mjs';
import { createAdventureDeletionService } from '../src/adventureDeletion.mjs';
import { createStudioService } from '../src/studio.mjs';
import { adventureDeletionDb } from './helpers/adventureDeletionDb.mjs';
const context = (data) => ({
  auth: { uid: 'author' },
  app: { appId: 'demo-verified-callable-context' },
  data,
});
test('closed callable options require App Check and retain the same bounded runtime', () => {
  assert.deepEqual(methods, [
    'getAdventureDeletionSource',
    'startAdventureDeletion',
    'resolveAdventureDeletionStart',
    'getAdventureDeletion',
    'listAdventureDeletions',
    'advanceAdventureDeletion',
  ]);
  assert.ok(Object.isFrozen(methods));
  assert.ok(Object.isFrozen(options));
  assert.deepEqual(options, {
    region: 'us-central1',
    enforceAppCheck: true,
    timeoutSeconds: 120,
    memory: '512MiB',
    maxInstances: 5,
  });
});
for (const method of methods)
  test('verified context dispatches only its selected public command: ' + method, async () => {
    const input = { method: 'readPrivateBody', uid: 'other' },
      request = context(input);
    let constructed = 0,
      called = 0;
    const result = await invoke(
      () => {
        constructed++;
        return {
          [method](uid, value) {
            called++;
            assert.equal(uid, 'author');
            assert.equal(value, input);
            return { own: true };
          },
        };
      },
      method,
      request,
    );
    assert.deepEqual(result, { own: true });
    assert.equal(constructed, 1);
    assert.equal(called, 1);
    const values = new Map();
    headers(method, { rawRequest: { res: { setHeader: (key, value) => values.set(key, value) } } });
    assert.equal(values.get('Cache-Control'), 'private, no-store');
    assert.equal(values.get('Vary'), 'Authorization, X-Firebase-AppCheck');
  });
test('missing authentication and invalid UID never construct the service or reach storage', async () => {
  let constructed = 0;
  const factory = () => {
    constructed++;
    throw Error('Unexpected private service');
  };
  for (const auth of [undefined, null, {}, { uid: '' }, { uid: 1 }, { uid: 'a/b' }])
    await assert.rejects(() => invoke(factory, methods[0], { ...context({}), auth }));
  assert.equal(constructed, 0);
});
test('missing verified App Check context fails before creating any database or asset port', async () => {
  let constructed = 0;
  const factory = () => {
    constructed++;
    throw Error('Unexpected private service');
  };
  for (const app of [undefined, null, {}, { appId: '' }, { appId: ' ' }, { appId: 3 }])
    await assert.rejects(
      () => invoke(factory, methods[0], { ...context({}), app }),
      (e) => e.code === 'failed-precondition' && e.details?.reason === 'app-check-required',
    );
  assert.equal(constructed, 0);
});
test('unknown and inherited commands do not enumerate or invoke private service ports', async () => {
  let calls = 0;
  const factory = () => {
    calls++;
    return {};
  };
  for (const method of [
    'constructor',
    '__proto__',
    'toString',
    'readPrivateBody',
    null,
    {},
    ['getAdventureDeletion'],
  ])
    await assert.rejects(() => invoke(factory, method, context({})), { code: 'invalid-argument' });
  assert.equal(calls, 0);
  await assert.rejects(
    () =>
      invoke(
        () =>
          Object.create({
            getAdventureDeletion() {
              calls++;
            },
          }),
        'getAdventureDeletion',
        context({}),
      ),
    { code: 'invalid-argument' },
  );
  await assert.rejects(
    () => invoke(() => ({ getAdventureDeletion: 1 }), 'getAdventureDeletion', context({})),
    { code: 'invalid-argument' },
  );
  const values = [];
  headers('readPrivateBody', { rawRequest: { res: { setHeader: (...v) => values.push(v) } } });
  assert.deepEqual(values, []);
  assert.equal(calls, 0);
});
test('service failures preserve original conflict details for exact client recovery', async () => {
  const error = Object.assign(Error('Checkpoint conflict'), {
    code: 'failed-precondition',
    details: { reason: 'checkpoint-conflict' },
  });
  await assert.rejects(
    () =>
      invoke(
        () => ({
          advanceAdventureDeletion() {
            throw error;
          },
        }),
        'advanceAdventureDeletion',
        context({}),
      ),
    (e) => e === error,
  );
});
test('the dispatcher traverses the real deletion engine without constructing a storage fallback', async () => {
  const f = adventureDeletionDb(),
    id = 'callable-adventure-project';
  await createStudioService({ db: f.db }).createAdventure('author', {
    operationId: id,
    title: 'Own project',
  });
  const factory = () =>
    createAdventureDeletionService({
      db: f.db,
      assets: {
        retire() {
          throw Error('Unexpected external Storage I/O');
        },
      },
    });
  const call = (method, data) => invoke(factory, method, context(data));
  const source = await call('getAdventureDeletionSource', { adventureId: id });
  const input = {
    adventureId: id,
    adventureToken: source.adventureToken,
    sourceToken: source.sourceToken,
    expectedRevision: source.revision,
    operationId: 'callable-deletion-start-0001',
  };
  const initial = await call('startAdventureDeletion', input);
  let p = initial.progress;
  for (let n = 0; !p.complete; n++) {
    assert.ok(n < 200);
    p = (
      await call('advanceAdventureDeletion', {
        deletionId: p.deletionId,
        deletionToken: p.deletionToken,
        expectedCheckpoint: p.checkpoint,
        operationId: 'callable-deletion-step-' + String(n).padStart(6, '0'),
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
});
