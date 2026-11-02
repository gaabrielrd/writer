import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyAdventureArchive } from './helpers/adventureRestoreArchiveFixture.mjs';
import {
  transferFixture,
  upload,
  verify,
  mutation,
  cleanup,
} from './helpers/adventureRestoreTransferFixture.mjs';
const req = (p) => mutation(p, 'node-validation-' + String(p.checkpoint).padStart(8, '0'));
async function advance(f, p) {
  return (await f.api.advanceAdventureRestoreValidation(f.uid, req(p))).progress;
}
async function ready(invalidRoot = false) {
  const f = transferFixture(await emptyAdventureArchive({ invalidRoot }));
  return { f, p: await verify(f, await upload(f), 16) };
}
test('SDK contract archive reaches a closed content result through persisted private state', async () => {
  const { f, p } = await ready();
  let current = p,
    steps = 0;
  while (['bytes-verified', 'validating'].includes(current.state)) {
    assert.ok(++steps < 100);
    current = await advance(f, current);
  }
  assert.equal(current.state, 'content-verified');
  assert.equal(current.validation.summary.sourceAdventureId, 'original-empty-adventure-0001');
  assert.equal(current.validation.summary.totals.resources.progress, 1);
  assert.ok(!JSON.stringify(current).includes('PRIVATE_EMPTY_TITLE'));
  assert.equal((await cleanup(f, current, 50)).state, 'cancelled');
});
test('semantic rejection keeps the last confirmed state and discards all buffered JSON effects', async () => {
  const { f, p } = await ready(true);
  let current = await advance(f, p);
  while (current.state === 'validating') current = await advance(f, current);
  assert.equal(current.state, 'content-rejected');
  assert.equal(current.validation.failure, 'adventure-backup-invalid-content');
  assert.equal(f.records.get(f.path).validation.indexEntries, 0);
  assert.equal(f.records.get(f.path).validation.items, 0);
  assert.equal((await cleanup(f, current)).state, 'cancelled');
});
test('failed final transaction discards the state and effects and permits exact retry', async () => {
  const { f, p } = await ready(),
    run = f.db.runTransaction.bind(f.db);
  f.db.runTransaction = (cb) =>
    run((tx) =>
      cb({
        ...tx,
        update(ref, value) {
          if (ref.path === f.path) throw Error('commit unavailable');
          return tx.update(ref, value);
        },
      }),
    );
  await assert.rejects(() => advance(f, p), /commit unavailable/);
  assert.equal(f.records.get(f.path).checkpoint, p.checkpoint);
  assert.equal(f.records.has(f.path + '/validationState/current'), false);
  assert.equal(
    f.records.has('users/' + f.uid + '/adventureRestoreOperations/' + req(p).operationId),
    false,
  );
  f.db.runTransaction = run;
  assert.equal((await advance(f, p)).state, 'validating');
});
test('source change between read and commit is an identity error with no rejection or partial writes', async () => {
  const { f, p } = await ready(),
    run = f.db.runTransaction.bind(f.db);
  let changed = false;
  f.db.runTransaction = (cb) =>
    run((tx) =>
      cb({
        ...tx,
        async getAll(ref, options) {
          if (
            !changed &&
            ref.path.includes('/chunks/') &&
            options.fieldMask.includes('chunkHash')
          ) {
            changed = true;
            f.metadata.set(ref.path, { createdAt: 9999, updatedAt: 9999 });
          }
          return tx.getAll(ref, options);
        },
      }),
    );
  await assert.rejects(() => advance(f, p), { code: 'failed-precondition' });
  assert.equal(changed, true);
  assert.equal(f.records.get(f.path).state, 'bytes-verified');
  assert.equal(f.records.has(f.path + '/validationState/current'), false);
});
test('input schema excludes client certificates, phase overrides and source replacements', async () => {
  const { f, p } = await ready();
  for (const patch of [
    { phase: 'verified' },
    { reportHash: 'a'.repeat(64) },
    { stateJSON: '{}' },
    { source: {} },
  ])
    await assert.rejects(
      () => f.api.advanceAdventureRestoreValidation(f.uid, { ...req(p), ...patch }),
      { code: 'invalid-argument' },
    );
  assert.equal(f.records.get(f.path).checkpoint, p.checkpoint);
});
