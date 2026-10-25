import test from 'node:test';
import assert from 'node:assert/strict';
import { BOOK_RESTORE_METHODS } from '../src/bookRestoreUploadContracts.mjs';
import { invokeBookRestoreCallable } from '../src/bookRestoreCallable.mjs';
import { setBookRestoreHeaders } from '../src/bookRestoreUpload.mjs';
import { readyArchive, uid } from './helpers/bookRestoreArchiveFixture.mjs';
const expected = [
  'startBookRestore',
  'resolveBookRestoreStart',
  'getBookRestore',
  'listBookRestores',
  'appendBookRestoreChunk',
  'advanceBookRestoreIntegrity',
  'advanceBookRestoreValidation',
  'resolveBookRestoreOperation',
  'cancelBookRestore',
  'advanceBookRestoreCleanup',
  'advanceBookRestoreStructure',
  'advanceBookRestoreLore',
  'advanceBookRestoreResources',
  'advanceBookRestoreCounts',
  'advanceBookRestorePersonas',
  'advanceBookRestoreUniverse',
  'advanceBookRestoreHistory',
  'advanceBookRestoreDraft',
  'finalizeBookRestoreDraft',
  'advanceBookRestoreCover',
  'reserveBookRestoreCover',
  'materializeBookRestoreCover',
  'advanceBookRestorePersonaLibrary',
  'advanceBookRestoreSourceIndexes',
  'advanceBookRestoreAudit',
  'getBookRestoreActivationReview',
  'activateBookRestore',
  'getBookRestoreMediaState',
  'finalizeBookRestoreMedia',
  'getBookRestoreArchiveCleanup',
  'advanceBookRestoreArchiveCleanup',
];
const internal = [
  'openPreparedBookRestoreLore',
  'openVerifiedBookRestoreContent',
  'openVerifiedBookRestoreSource',
  'getBookRestoreRecoveryKey',
  'cleanupPersonaLibrary',
  'cleanupCoverStorage',
  'toString',
  'constructor',
  '__proto__',
];

test('restore callable list is immutable, exact and excludes every internal reader/key/helper', () => {
  assert.deepEqual(BOOK_RESTORE_METHODS, expected);
  assert.equal(new Set(BOOK_RESTORE_METHODS).size, 31);
  assert.ok(Object.isFrozen(BOOK_RESTORE_METHODS));
  assert.throws(() => BOOK_RESTORE_METHODS.push('openPreparedBookRestoreLore'), TypeError);
  for (const method of internal) assert.equal(BOOK_RESTORE_METHODS.includes(method), false);
});
for (const method of expected)
  test('closed restore dispatch and private headers: ' + method, async () => {
    const input = { method: 'openPreparedBookRestoreLore', privateText: 'PRIVATE_TEST_LITERAL' };
    let calls = 0;
    const result = await invokeBookRestoreCallable(
      {
        [method](actor, data) {
          assert.equal(actor, uid);
          assert.equal(data, input);
          calls++;
          return { confirmed: method };
        },
      },
      method,
      uid,
      input,
    );
    assert.deepEqual(result, { confirmed: method });
    assert.equal(calls, 1);
    const headers = new Map();
    setBookRestoreHeaders(method, {
      rawRequest: { res: { setHeader: (k, v) => headers.set(k, v) } },
    });
    assert.equal(headers.get('Cache-Control'), 'private, no-store');
    assert.equal(headers.get('Vary'), 'Authorization');
  });

test('internal/unknown commands and inherited callable methods cannot cross the boundary', async () => {
  let calls = 0;
  for (const method of [...internal, 'not-a-restore-command', null, {}, ['getBookRestore']])
    await assert.rejects(
      () =>
        invokeBookRestoreCallable(
          new Proxy(
            {},
            {
              get() {
                calls++;
                return () => calls++;
              },
            },
          ),
          method,
          uid,
          {},
        ),
      (error) => error.code === 'invalid-argument',
    );
  assert.equal(calls, 0);
  await assert.rejects(
    () =>
      invokeBookRestoreCallable(
        Object.create({
          getBookRestore() {
            calls++;
          },
        }),
        'getBookRestore',
        uid,
        {},
      ),
    (error) => error.code === 'invalid-argument',
  );
  await assert.rejects(
    () => invokeBookRestoreCallable({ getBookRestore: 42 }, 'getBookRestore', uid, {}),
    (error) => error.code === 'invalid-argument',
  );
  assert.equal(calls, 0);
  const headers = [];
  setBookRestoreHeaders('openPreparedBookRestoreLore', {
    rawRequest: { res: { setHeader: (...a) => headers.push(a) } },
  });
  assert.deepEqual(headers, []);
});
test('missing or malformed account is refused before command selection or service execution', async () => {
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
  for (const actor of [undefined, null, '', 'a/b', 'a\\b'])
    await assert.rejects(
      () => invokeBookRestoreCallable(service, 'getBookRestore', actor, {}),
      (error) => error.code === 'unauthenticated',
    );
  assert.equal(calls, 0);
});
test('dispatch awaits and preserves a command contract error without replacing its reason', async () => {
  const failure = Object.assign(new Error('safe'), {
    code: 'failed-precondition',
    details: { reason: 'revision-conflict' },
  });
  await assert.rejects(
    () =>
      invokeBookRestoreCallable(
        {
          async getBookRestore() {
            throw failure;
          },
        },
        'getBookRestore',
        uid,
        {},
      ),
    (error) => error === failure,
  );
});
test('real activated restore queries, media and archive cleanup use the closed dispatch without reconstructing the root', async () => {
  const f = await readyArchive({ none: true }),
    input = { restoreId: f.id, jobToken: f.p.jobToken },
    call = (method, data) => invokeBookRestoreCallable(f.factory(), method, uid, data);
  const before = structuredClone(f.records.get('books/' + f.p.bookId));
  const job = await call('getBookRestore', input);
  assert.equal(job.state, 'activated');
  assert.deepEqual(
    await call('getBookRestoreMediaState', input),
    await f.factory().getBookRestoreMediaState(uid, input),
  );
  const again = await call('finalizeBookRestoreMedia', {
    ...input,
    operationId: f.id + '-host-media',
  });
  assert.equal(again.kind, 'already-complete');
  let p = (await call('getBookRestoreArchiveCleanup', input)).progress;
  for (let n = 0; n < 10000 && p.phase !== 'done'; n++)
    p = (
      await call('advanceBookRestoreArchiveCleanup', {
        ...input,
        operationId: f.id + '-host-' + n,
        expectedRevision: p.revision,
      })
    ).progress;
  assert.equal(p.phase, 'done');
  assert.deepEqual(f.records.get('books/' + f.p.bookId), before);
  assert.deepEqual((await call('getBookRestoreArchiveCleanup', input)).progress, p);
});
