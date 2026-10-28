import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ADVENTURE_RESTORE_METHODS,
  invokeAdventureRestoreCallable,
  setAdventureRestoreHeaders,
} from '../src/adventureRestoreCallable.mjs';
import { transferFixture, request, mutation } from './helpers/adventureRestoreTransferFixture.mjs';
import { emptyAdventureArchive } from './helpers/adventureRestoreArchiveFixture.mjs';
import { prepareAdventureImages, finishImages } from './helpers/adventureRestoreImageFixture.mjs';
import { finishImageStorage } from './helpers/adventureRestoreImageStorageFixture.mjs';
import { finishCounts } from './helpers/adventureRestoreCountsFixture.mjs';
import { finishAudit } from './helpers/adventureRestoreAuditFixture.mjs';
import { finishImageLibrary } from './helpers/adventureRestoreImageLibraryFixture.mjs';
import { activationRequest } from './helpers/adventureRestoreActivationFixture.mjs';
import { finishMedia } from './helpers/adventureRestoreMediaFixture.mjs';
import { finishArchiveCleanup } from './helpers/adventureRestoreArchiveCleanupFixture.mjs';
const expected = [
  'startAdventureRestore',
  'resolveAdventureRestoreStart',
  'getAdventureRestore',
  'listAdventureRestores',
  'appendAdventureRestoreChunk',
  'resolveAdventureRestoreOperation',
  'cancelAdventureRestore',
  'advanceAdventureRestoreCleanup',
  'advanceAdventureRestoreIntegrity',
  'advanceAdventureRestoreValidation',
  'advanceAdventureRestoreStructure',
  'advanceAdventureRestoreResources',
  'advanceAdventureRestoreProfiles',
  'advanceAdventureRestoreHistory',
  'finalizeAdventureRestoreDraft',
  'advanceAdventureRestoreUniverse',
  'advanceAdventureRestorePersonaLibrary',
  'advanceAdventureRestoreImages',
  'advanceAdventureRestoreImageStorage',
  'advanceAdventureRestoreCounts',
  'advanceAdventureRestoreAudit',
  'advanceAdventureRestoreImageLibrary',
  'getAdventureRestoreActivationReview',
  'activateAdventureRestore',
  'retireAdventureRestoreActivation',
  'getAdventureRestoreMediaState',
  'advanceAdventureRestoreMedia',
  'getAdventureRestoreArchiveCleanup',
  'advanceAdventureRestoreArchiveCleanup',
];
const internal = [
  'getAdventureRestoreRecoveryKey',
  'createVerifiedAdventureRestoreContent',
  'readAdventureStageJournal',
  'observeImageArtifact',
  'finishCleanup',
  'openVerifiedAdventureRestoreSource',
  'constructor',
  'toString',
  '__proto__',
];
test('the public adventure protocol is immutable, explicit and excludes private ports and recovery keys', () => {
  assert.deepEqual(ADVENTURE_RESTORE_METHODS, expected);
  assert.equal(new Set(ADVENTURE_RESTORE_METHODS).size, 29);
  assert.ok(Object.isFrozen(ADVENTURE_RESTORE_METHODS));
  assert.throws(() => ADVENTURE_RESTORE_METHODS.push('getAdventureRestoreRecoveryKey'), TypeError);
  for (const method of internal) assert.equal(ADVENTURE_RESTORE_METHODS.includes(method), false);
});
for (const method of expected)
  test('public adventure dispatch and private headers: ' + method, async () => {
    const input = { method: 'readAdventureStageJournal', privateText: 'PRIVATE_LITERAL' };
    let calls = 0;
    const result = await invokeAdventureRestoreCallable(
      {
        [method](uid, value) {
          assert.equal(uid, 'author');
          assert.equal(value, input);
          calls++;
          return { confirmed: method };
        },
      },
      method,
      'author',
      input,
    );
    assert.deepEqual(result, { confirmed: method });
    assert.equal(calls, 1);
    const headers = new Map();
    setAdventureRestoreHeaders(method, {
      rawRequest: { res: { setHeader: (k, v) => headers.set(k, v) } },
    });
    assert.equal(headers.get('Cache-Control'), 'private, no-store');
    assert.equal(headers.get('Vary'), 'Authorization');
  });
test('unknown, inherited and non-function methods never reach a service port', async () => {
  let calls = 0;
  const spy = new Proxy(
    {},
    {
      get() {
        calls++;
        return () => calls++;
      },
    },
  );
  for (const method of [...internal, null, {}, ['getAdventureRestore'], 'not-a-command'])
    await assert.rejects(() => invokeAdventureRestoreCallable(spy, method, 'author', {}), {
      code: 'invalid-argument',
    });
  await assert.rejects(
    () =>
      invokeAdventureRestoreCallable(
        Object.create({
          getAdventureRestore() {
            calls++;
          },
        }),
        'getAdventureRestore',
        'author',
        {},
      ),
    { code: 'invalid-argument' },
  );
  await assert.rejects(
    () =>
      invokeAdventureRestoreCallable(
        { getAdventureRestore: 5 },
        'getAdventureRestore',
        'author',
        {},
      ),
    { code: 'invalid-argument' },
  );
  assert.equal(calls, 0);
  const headers = [];
  setAdventureRestoreHeaders('readAdventureStageJournal', {
    rawRequest: { res: { setHeader: (...args) => headers.push(args) } },
  });
  assert.deepEqual(headers, []);
});
test('authentication is checked before selecting or invoking a service', async () => {
  let calls = 0;
  const service = new Proxy(
    {},
    {
      get() {
        calls++;
        return () => calls++;
      },
    },
  );
  for (const uid of [undefined, null, '', 'a/b', 'a\\b', '.', '..', 'a\u0000b'])
    await assert.rejects(
      () => invokeAdventureRestoreCallable(service, 'getAdventureRestore', uid, {}),
      { code: 'unauthenticated' },
    );
  assert.equal(calls, 0);
});
test('contract reasons cross the internal dispatch unchanged', async () => {
  const failure = Object.assign(new Error('safe'), {
    code: 'failed-precondition',
    details: { reason: 'checkpoint-conflict' },
  });
  await assert.rejects(
    () =>
      invokeAdventureRestoreCallable(
        {
          async getAdventureRestore() {
            throw failure;
          },
        },
        'getAdventureRestore',
        'author',
        {},
      ),
    (e) => e === failure,
  );
});
test('the real adventure pipeline crosses the closed dispatch through activation, media and source collection', async () => {
  const f = transferFixture(),
    service = f.api;
  f.api = Object.fromEntries(
    expected.map((method) => [
      method,
      (uid, input) => invokeAdventureRestoreCallable(service, method, uid, input),
    ]),
  );
  let p = await prepareAdventureImages(f.api, f.uid, await emptyAdventureArchive());
  p = await finishCounts(f, await finishImageStorage(f, await finishImages(f, p)));
  p = await finishAudit(f, await finishImageLibrary(f, await finishAudit(f, p)));
  const review = await activationRequest(f, p),
    activated = await f.api.activateAdventureRestore(f.uid, review.request);
  p = activated.progress;
  assert.deepEqual(await f.api.retireAdventureRestoreActivation(f.uid, review.request), activated);
  const root = structuredClone(f.records.get('adventures/' + p.adventureId));
  const media = (
    await f.api.getAdventureRestoreMediaState(f.uid, {
      restoreId: p.restoreId,
      jobToken: p.jobToken,
    })
  ).media;
  await finishMedia(f, p, media);
  const archive = (
    await f.api.getAdventureRestoreArchiveCleanup(f.uid, {
      restoreId: p.restoreId,
      jobToken: p.jobToken,
    })
  ).progress;
  assert.equal((await finishArchiveCleanup(f, p, archive)).phase, 'done');
  assert.deepEqual(f.records.get('adventures/' + p.adventureId), root);
  assert.equal(
    (await f.api.getAdventureRestore(f.uid, { restoreId: p.restoreId, jobToken: p.jobToken }))
      .state,
    'activated',
  );
  await assert.rejects(
    () =>
      f.api.getAdventureRestore(f.uid, {
        restoreId: p.restoreId,
        jobToken: p.jobToken,
        method: 'readAdventureStageJournal',
      }),
    { code: 'invalid-argument' },
  );
  const separate = transferFixture(),
    start = await invokeAdventureRestoreCallable(
      separate.api,
      'startAdventureRestore',
      separate.uid,
      request(separate.bytes),
    );
  const cancelled = await invokeAdventureRestoreCallable(
    separate.api,
    'cancelAdventureRestore',
    separate.uid,
    mutation(start.progress, 'cancel-via-callable-0001'),
  );
  assert.equal(cancelled.progress.state, 'cancelling');
});
