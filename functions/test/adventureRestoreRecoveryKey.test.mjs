import test from 'node:test';
import assert from 'node:assert/strict';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import {
  transferFixture,
  mutation,
  cleanup,
  chunkRequest,
} from './helpers/adventureRestoreTransferFixture.mjs';
import {
  archiveCleanupFixture,
  archiveStep,
  finishArchiveCleanup,
} from './helpers/adventureRestoreArchiveCleanupFixture.mjs';
import { emptyAdventureArchive } from './helpers/adventureRestoreArchiveFixture.mjs';
import { bornEqual } from '../src/adventureRestoreContracts.mjs';

const path = (f) => 'users/' + f.uid + '/adventureRestoreRecoveryKeys/' + f.id;
const keyRequest = (f, p) => ({
  restoreId: p.restoreId,
  jobToken: p.jobToken,
  reviewHash: f.input.reviewHash,
});
async function fixture() {
  const f = transferFixture();
  const initial = await f.api.startAdventureRestore(f.uid, f.input);
  return { f, initial, p: initial.progress };
}

test('key is born atomically with the native job and survives retry as the same usable AES key', async () => {
  const { f, initial, p } = await fixture();
  const key = await f.api.getAdventureRestoreRecoveryKey(f.uid, keyRequest(f, p));
  const [job, secret] = await Promise.all([f.db.doc(f.path).get(), f.db.doc(path(f)).get()]);
  assert.ok(bornEqual(job, secret));
  assert.equal(Buffer.from(key.keyBase64, 'base64').length, 32);
  assert.equal(key.algorithm, 'AES-GCM');
  const iv = randomBytes(12),
    bytes = Buffer.from('My private review');
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(key.keyBase64, 'base64'), iv);
  const encrypted = Buffer.concat([cipher.update(bytes), cipher.final()]);
  const resumed = await f.api.getAdventureRestoreRecoveryKey(f.uid, {
    ...keyRequest(f, p),
    expectedKeyId: key.keyId,
  });
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(resumed.keyBase64, 'base64'), iv);
  decipher.setAuthTag(cipher.getAuthTag());
  assert.deepEqual(Buffer.concat([decipher.update(encrypted), decipher.final()]), bytes);
  assert.deepEqual(resumed, key);
  assert.deepEqual(await f.api.startAdventureRestore(f.uid, f.input), initial);
  const advanced = await f.api.appendAdventureRestoreChunk(f.uid, chunkRequest(p, f.bytes, 0));
  assert.deepEqual(
    await f.api.getAdventureRestoreRecoveryKey(f.uid, keyRequest(f, advanced.progress)),
    key,
  );
  const ordinary = JSON.stringify([
    initial,
    advanced,
    await f.api.listAdventureRestores(f.uid),
    await f.api.getAdventureRestore(f.uid, { restoreId: p.restoreId }),
  ]);
  for (const secretText of [key.keyBase64, key.keyId, 'keyBase64', 'recovery-key'])
    assert.equal(ordinary.includes(secretText), false);
});

for (const [name, actor, patch] of [
  ['another account', 'other', {}],
  ['missing actor', null, {}],
  ['wrong incarnation', 'author', { jobToken: 'b'.repeat(64) }],
  ['wrong review', 'author', { reviewHash: 'b'.repeat(64) }],
  ['wrong key id', 'author', { expectedKeyId: 'b'.repeat(64) }],
  ['extra field', 'author', { keyBase64: 'never-trust-client' }],
])
  test('recovery rejects ' + name + ' without writes', async () => {
    const { f, p } = await fixture(),
      before = structuredClone([...f.records]);
    await assert.rejects(() =>
      f.api.getAdventureRestoreRecoveryKey(actor, { ...keyRequest(f, p), ...patch }),
    );
    assert.deepEqual([...f.records], before);
  });

for (const kind of ['missing', 'changed', 'recreated', 'extra-field', 'foreign-owner'])
  test('a ' + kind + ' key is preserved and never replaced or adopted', async () => {
    const { f, p } = await fixture(),
      ref = f.db.doc(path(f));
    if (kind === 'missing') await f.db.runTransaction((tx) => tx.delete(ref));
    if (kind === 'changed')
      await f.db.runTransaction((tx) =>
        tx.update(ref, { keyBase64: randomBytes(32).toString('base64') }),
      );
    if (kind === 'extra-field') await f.db.runTransaction((tx) => tx.update(ref, { extra: true }));
    if (kind === 'foreign-owner') f.records.get(ref.path).ownerId = 'other';
    if (kind === 'recreated') {
      const value = structuredClone(f.records.get(ref.path));
      await f.db.runTransaction((tx) => tx.delete(ref));
      await f.db.runTransaction((tx) => tx.create(ref, value));
    }
    const before = structuredClone([...f.records]);
    await assert.rejects(() => f.api.getAdventureRestoreRecoveryKey(f.uid, keyRequest(f, p)));
    await assert.rejects(() =>
      f.api.cancelAdventureRestore(f.uid, mutation(p, 'adventure-key-invalid-cancel')),
    );
    assert.deepEqual([...f.records], before);
  });

test('legacy starts without a key effect are usable but never receive a late key', async () => {
  const { f, p } = await fixture();
  f.records.get('users/' + f.uid + '/adventureRestoreOperations/' + f.id).effects = [];
  f.records.delete(path(f));
  const before = structuredClone([...f.records]);
  await assert.rejects(
    () => f.api.getAdventureRestoreRecoveryKey(f.uid, keyRequest(f, p)),
    (e) => e.details.reason === 'recovery-key-unavailable',
  );
  assert.deepEqual([...f.records], before);
  assert.equal((await cleanup(f, p)).state, 'cancelled');
  assert.equal(f.records.has(path(f)), false);
});

test('cancel removes the key atomically, closes recovery, and historical replay cannot recreate it', async () => {
  const { f, p } = await fixture(),
    input = mutation(p, 'adventure-key-cancel-0001');
  const cancelled = await f.api.cancelAdventureRestore(f.uid, input);
  assert.equal(cancelled.progress.state, 'cancelling');
  assert.equal(f.records.has(path(f)), false);
  await assert.rejects(
    () => f.api.getAdventureRestoreRecoveryKey(f.uid, keyRequest(f, p)),
    (e) => e.details.reason === 'state-conflict',
  );
  await cleanup(f, cancelled.progress);
  await f.api.cancelAdventureRestore(f.uid, input);
  await f.api.startAdventureRestore(f.uid, f.input);
  assert.equal(f.records.has(path(f)), false);
});

for (const boundary of ['key', 'receipt', 'job'])
  test(
    'cancel rollback at ' + boundary + ' keeps the original key and permits exact retry',
    async () => {
      const { f, p } = await fixture(),
        run = f.db.runTransaction;
      f.db.runTransaction = (cb) =>
        run((tx) =>
          cb(
            new Proxy(tx, {
              get(target, method) {
                if (['delete', 'create', 'update'].includes(method))
                  return (...args) => {
                    const address = args[0].path;
                    if (
                      (boundary === 'key' && address === path(f)) ||
                      (boundary === 'receipt' &&
                        address.includes('/adventureRestoreOperations/')) ||
                      (boundary === 'job' && address === f.path)
                    )
                      throw Error('Local rollback');
                    return target[method](...args);
                  };
                return typeof target[method] === 'function'
                  ? target[method].bind(target)
                  : target[method];
              },
            }),
          ),
        );
      const before = structuredClone([...f.records]),
        input = mutation(p, 'adventure-key-rollback-0001');
      await assert.rejects(() => f.api.cancelAdventureRestore(f.uid, input), /Local rollback/);
      assert.deepEqual([...f.records], before);
      f.db.runTransaction = run;
      await f.api.cancelAdventureRestore(f.uid, input);
      assert.equal(f.records.has(path(f)), false);
    },
  );

test('collection retires the key with its first checkpoint and never mutates the activated parent', async () => {
  const { f, p, progress } = await archiveCleanupFixture(await emptyAdventureArchive());
  const input = {
    restoreId: p.restoreId,
    jobToken: p.jobToken,
    reviewHash: f.records.get(f.path).reviewHash,
  };
  const key = await f.api.getAdventureRestoreRecoveryKey(f.uid, input);
  const parent = structuredClone(f.records.get(f.path)),
    before = structuredClone([...f.records]);
  // A rejected checkpoint must not retire the key.
  await assert.rejects(() =>
    f.api.advanceAdventureRestoreArchiveCleanup(f.uid, {
      restoreId: p.restoreId,
      jobToken: p.jobToken,
      operationId: 'adventure-key-archive-bad',
      expectedCheckpoint: 1,
    }),
  );
  assert.deepEqual([...f.records], before);
  const first = await archiveStep(f, p, progress);
  assert.equal(f.records.has(path(f)), false);
  await assert.rejects(
    () => f.api.getAdventureRestoreRecoveryKey(f.uid, input),
    (e) => e.details.reason === 'recovery-key-unavailable',
  );
  await finishArchiveCleanup(f, p, first.progress);
  await archiveStep(f, p, progress);
  assert.deepEqual(f.records.get(f.path), parent);
  assert.equal(f.records.has(path(f)), false);
  assert.equal(JSON.stringify(first).includes(key.keyBase64), false);
});

test('a preexisting key prevents new start without allocating a root or job', async () => {
  const f = transferFixture();
  f.records.set(path(f), { restoreId: f.id, keyBase64: 'foreign' });
  const before = structuredClone([...f.records]);
  await assert.rejects(() => f.api.startAdventureRestore(f.uid, f.input));
  assert.deepEqual([...f.records], before);
});

function metadataOnlyKeyPort(f, dropMaskPort = false) {
  const run = f.db.runTransaction;
  f.db.runTransaction = (cb) =>
    run((tx) =>
      cb(
        new Proxy(tx, {
          get(target, method) {
            if (dropMaskPort && method === 'getAll') return undefined;
            if (method === 'get')
              return (ref) => {
                if (ref.path === path(f)) throw Error('Secret body must not be read');
                return target.get(ref);
              };
            return typeof target[method] === 'function'
              ? target[method].bind(target)
              : target[method];
          },
        }),
      ),
    );
  return () => {
    f.db.runTransaction = run;
  };
}

test('key retirement and final cancellation use nonempty metadata masks, never secret-body reads', async () => {
  const { f, p } = await fixture(),
    restore = metadataOnlyKeyPort(f);
  try {
    const cancelling = await f.api.cancelAdventureRestore(
      f.uid,
      mutation(p, 'adventure-key-masked-cancel'),
    );
    // Preserve the existing ability to cancel again with a new operation at the current checkpoint.
    const repeated = await f.api.cancelAdventureRestore(
      f.uid,
      mutation(cancelling.progress, 'adventure-key-masked-again'),
    );
    assert.equal((await cleanup(f, repeated.progress)).state, 'cancelled');
    const masks = f.metadataReads.filter((r) => r.path === path(f));
    assert.ok(masks.length >= 3);
    for (const read of masks) {
      assert.ok(read.fields.length > 0);
      assert.equal(read.fields.includes('keyBase64'), false);
    }
  } finally {
    restore();
  }
});

test('first archive checkpoint retires key using metadata while retaining activated bytes', async () => {
  const { f, p, progress } = await archiveCleanupFixture(await emptyAdventureArchive());
  const restore = metadataOnlyKeyPort(f);
  try {
    assert.equal((await finishArchiveCleanup(f, p, progress)).phase, 'done');
    for (const read of f.metadataReads.filter((r) => r.path === path(f))) {
      assert.ok(read.fields.length > 0);
      assert.equal(read.fields.includes('keyBase64'), false);
    }
    assert.equal(f.records.has(path(f)), false);
  } finally {
    restore();
  }
});

test('key retirement refuses a port without masks before a secret read or write', async () => {
  const { f, p } = await fixture(),
    before = structuredClone([...f.records]);
  const restore = metadataOnlyKeyPort(f, true);
  try {
    await assert.rejects(
      () => f.api.cancelAdventureRestore(f.uid, mutation(p, 'adventure-key-no-mask-0001')),
      (e) => e.details.reason === 'identity-conflict',
    );
    assert.deepEqual([...f.records], before);
  } finally {
    restore();
  }
});

for (const boundary of ['job', 'root', 'reservation', 'key', 'receipt'])
  test('start rollback at ' + boundary + ' leaves no key or partial adventure', async () => {
    const f = transferFixture(),
      run = f.db.runTransaction;
    f.db.runTransaction = (cb) =>
      run((tx) =>
        cb(
          new Proxy(tx, {
            get(target, method) {
              if (method === 'create')
                return (ref, ...args) => {
                  const hit =
                    boundary === 'job'
                      ? ref.path === f.path
                      : boundary === 'key'
                        ? ref.path === path(f)
                        : boundary === 'root'
                          ? ref.path.startsWith('adventures/')
                          : boundary === 'reservation'
                            ? ref.path.startsWith('adventureRestoreReservations/')
                            : ref.path.includes('/adventureRestoreOperations/');
                  if (hit) throw Error('Start rollback');
                  return target.create(ref, ...args);
                };
              return typeof target[method] === 'function'
                ? target[method].bind(target)
                : target[method];
            },
          }),
        ),
      );
    await assert.rejects(() => f.api.startAdventureRestore(f.uid, f.input), /Start rollback/);
    assert.equal(f.records.size, 0);
    f.db.runTransaction = run;
    const started = await f.api.startAdventureRestore(f.uid, f.input);
    assert.ok(await f.api.getAdventureRestoreRecoveryKey(f.uid, keyRequest(f, started.progress)));
  });
