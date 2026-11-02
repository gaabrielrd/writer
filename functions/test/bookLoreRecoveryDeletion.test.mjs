import test from 'node:test';
import assert from 'node:assert/strict';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import {
  bookLoreWriteRecoveryFixture,
  recoveryControl,
} from './helpers/bookLoreWriteRecoveryFixture.mjs';
import { bookLoreCreationRecoveryFixture } from './helpers/bookLoreCreationRecoveryFixture.mjs';
import {
  bookLoreDeletionFixture,
  markBookDeleting,
  finishBookLoreDeletion,
} from './helpers/bookLoreDeletionFixture.mjs';
import { recoveryPaths } from '../src/bookLoreWriteRecoveryContracts.mjs';
import { recoveryKeyInventoryRef } from '../src/bookLoreWriteRecoveryInventory.mjs';
import { digest } from '../src/workProgressContracts.mjs';
import { loadBookLoreDeletion } from '../src/bookLoreDeletionStore.mjs';
import { prepareBookLoreRecoveryDeletion } from '../src/bookLoreRecoveryDeletion.mjs';

async function fixture({ creation = false, legacy = false } = {}) {
  const d = adventureImportDb({ nativeUpdates: true }),
    seed = await (creation
      ? bookLoreCreationRecoveryFixture(d.db)
      : bookLoreWriteRecoveryFixture(d.db)),
    p = await seed.service.reserveBookLoreEditRecovery(seed.uid, seed.intent),
    inventory = recoveryKeyInventoryRef(seed.c, seed.bookId),
    f = { ...d, ...seed, ...bookLoreDeletionFixture(d.db), recovery: p, inventory };
  if (legacy) {
    const root = f.records.get(f.c.root.path);
    delete root.keyInventory;
    f.records.set(f.c.proof.path, { schemaVersion: 1, hash: digest(root) });
    f.records.delete(inventory.path);
    f.metadata.delete(inventory.path);
  }
  return f;
}
const state = (f) => f.records.get(f.path + '/state/current');
const capture = (f) => structuredClone([...f.records]);
const closed = (f) => f.records.has(f.c.closed.path);
async function until(f, condition) {
  for (let n = 0; n < 1000 && !condition(); n++) await f.step();
  assert.ok(condition());
}
async function recreate(f, path) {
  const data = structuredClone(f.records.get(path));
  await f.db.runTransaction((tx) => tx.delete(f.db.doc(path)));
  await f.db.runTransaction((tx) => tx.create(f.db.doc(path), data));
}
test('new recovery inventories its original key atomically, keeps authoring unchanged and explicit revoke removes both', async () => {
  const f = await fixture(),
    root = f.records.get(f.c.root.path);
  assert.equal(root.keyInventory, 1);
  const index = f.records.get(f.inventory.path);
  assert.equal(index.bookId, f.bookId);
  assert.equal(index.keyId, f.recovery.keyId);
  assert.equal('keyBase64' in index, false);
  assert.deepEqual(f.metadata.get(f.inventory.path), f.metadata.get(f.c.root.path));
  await f.service.getBookLoreEditRecoveryKey(f.uid, recoveryControl(f.recovery));
  await f.service.revokeBookLoreEditRecovery(f.uid, recoveryControl(f.recovery));
  assert.equal(f.records.has(f.inventory.path), false);
  assert.equal(f.records.has(f.c.key.path), false);
  assert.equal(f.records.has(f.c.root.path), true);
});
for (const kind of ['missing', 'recreated', 'changed'])
  test('an ' + kind + ' inventory cannot release a key or be silently repaired', async () => {
    const f = await fixture();
    if (kind === 'missing') await f.db.runTransaction((tx) => tx.delete(f.inventory));
    else if (kind === 'recreated') await recreate(f, f.inventory.path);
    else await f.db.runTransaction((tx) => tx.update(f.inventory, { keyId: 'f'.repeat(64) }));
    const before = capture(f);
    await assert.rejects(f.service.getBookLoreEditRecoveryKey(f.uid, recoveryControl(f.recovery)));
    await assert.rejects(f.service.revokeBookLoreEditRecovery(f.uid, recoveryControl(f.recovery)));
    assert.deepEqual(capture(f), before);
    assert.deepEqual(await f.service.reserveBookLoreEditRecovery(f.uid, f.intent), f.recovery);
  });
for (const options of [{}, { creation: true }, { legacy: true }])
  test(
    'book deletion revokes ' +
      (options.creation ? 'creation' : options.legacy ? 'legacy unindexed' : 'indexed edit') +
      ' recovery and retains historical metadata',
    async () => {
      const f = await fixture(options);
      await markBookDeleting(f);
      f.reads.length = 0;
      f.metadataReads.length = 0;
      await finishBookLoreDeletion(f);
      assert.equal(f.records.has('books/book'), false);
      assert.equal(f.records.has(f.c.key.path), false);
      assert.equal(f.records.has(f.inventory.path), false);
      const result = await f.service.getBookLoreEditRecovery(f.uid, recoveryControl(f.recovery));
      assert.equal(result.phase, 'revoked');
      assert.equal(result.jobToken, f.recovery.jobToken);
      assert.equal(result.sourceToken, f.recovery.sourceToken);
      assert.equal(f.records.has(f.c.root.path), true);
      assert.equal(f.records.has(f.c.proof.path), true);
      const keyReads = f.metadataReads.filter((r) => r.path === f.c.key.path);
      assert.ok(keyReads.length > 0);
      assert.ok(keyReads.every((r) => JSON.stringify(r.fields) === '["schemaVersion"]'));
      assert.deepEqual(await f.step(), {
        complete: true,
        processed: f.records.get('users/author/sceneOperations/' + f.operationId).processed,
      });
    },
  );
test('missing source and missing key do not require prosa or regenerate a key during book deletion', async () => {
  const f = await fixture();
  await f.db.runTransaction((tx) => {
    tx.delete(f.c.key);
    tx.delete(f.db.doc('books/book/lore/' + f.intent.loreId));
  });
  await markBookDeleting(f);
  await finishBookLoreDeletion(f);
  assert.equal(closed(f), true);
  assert.equal(f.records.has(f.inventory.path), false);
  assert.equal(f.records.has(f.c.key.path), false);
});
test('many controls are revoked one per unit, preserving other books and another account', async () => {
  const f = await fixture(),
    controls = [f.c];
  for (let i = 0; i < 19; i++) {
    const writeId = 'attempt-' + String(i).padStart(2, '0');
    await f.service.reserveBookLoreEditRecovery(f.uid, { ...f.intent, writeId });
    controls.push(recoveryPaths(f.db, f.uid, writeId));
  }
  await f.db.runTransaction((tx) => {
    tx.create(f.db.doc('books/other/bookLoreRecoveryKeys/keep'), { keep: true });
    tx.create(f.db.doc('users/other/bookLoreWriteRecoveries/keep/keys/current'), { keep: true });
  });
  await markBookDeleting(f);
  let previous = 0;
  for (let n = 0; n < 1000; n++) {
    const p = await f.step(),
      count = controls.filter((c) => !f.records.has(c.key.path)).length;
    assert.ok(count - previous <= 1);
    previous = count;
    if (p.complete) break;
  }
  assert.equal(previous, 20);
  assert.equal(f.records.has('books/book'), false);
  assert.deepEqual(f.records.get('books/other/bookLoreRecoveryKeys/keep'), { keep: true });
  assert.deepEqual(f.records.get('users/other/bookLoreWriteRecoveries/keep/keys/current'), {
    keep: true,
  });
});
for (const artifact of ['key', 'inventory', 'proof', 'root'])
  test(
    'recreated ' + artifact + ' blocks deletion and preserves every remaining artifact',
    async () => {
      const f = await fixture();
      await markBookDeleting(f);
      await f.step();
      await recreate(f, artifact === 'inventory' ? f.inventory.path : f.c[artifact].path);
      const before = capture(f);
      await assert.rejects(f.step());
      assert.deepEqual(capture(f), before);
      assert.equal(f.records.has('books/book'), true);
    },
  );
test('already revoked controls remain intact, but an unexpected later key blocks rather than being swept', async () => {
  const f = await fixture();
  await f.service.revokeBookLoreEditRecovery(f.uid, recoveryControl(f.recovery));
  const terminal = structuredClone(f.records.get(f.c.closed.path));
  await f.db.runTransaction((tx) =>
    tx.create(f.c.key, { schemaVersion: 1, keyBase64: Buffer.alloc(32).toString('base64') }),
  );
  await markBookDeleting(f);
  await f.step();
  const before = capture(f);
  await assert.rejects(f.step());
  assert.deepEqual(capture(f), before);
  assert.deepEqual(f.records.get(f.c.closed.path), terminal);
});
test('revoked controls without residues are traversed without recreating terminals or keys', async () => {
  const f = await fixture();
  await f.service.revokeBookLoreEditRecovery(f.uid, recoveryControl(f.recovery));
  const birth = structuredClone(f.metadata.get(f.c.closed.path));
  await markBookDeleting(f);
  await finishBookLoreDeletion(f);
  assert.deepEqual(f.metadata.get(f.c.closed.path), birth);
  assert.equal(f.records.has(f.c.key.path), false);
});
test('the last external checkpoint write rolls back key/index/terminal and child state together', async () => {
  const f = await fixture();
  await markBookDeleting(f);
  await f.step();
  const before = capture(f),
    run = f.db.runTransaction.bind(f.db);
  f.db.runTransaction = (fn) =>
    run((tx) =>
      fn({
        ...tx,
        set(ref, v) {
          tx.set(ref, v);
          if (ref.path === 'users/author/sceneOperations/' + f.operationId)
            throw Error('injected final checkpoint');
        },
      }),
    );
  await assert.rejects(f.step(), /injected final checkpoint/);
  assert.deepEqual(capture(f), before);
  f.db.runTransaction = run;
  await finishBookLoreDeletion(f);
  assert.equal(closed(f), true);
});
for (const old of [
  { phase: 'applications', complete: false },
  { phase: 'heads', complete: false },
  { phase: 'finish', complete: true },
])
  test(
    'verified v1 state in ' + old.phase + ' migrates even when complete=' + old.complete,
    async () => {
      const f = await fixture();
      await markBookDeleting(f);
      await f.step();
      const at = f.path + '/state/current',
        v = { ...state(f), schemaVersion: 1, ...old, processed: 7 };
      delete v.recoveryCursor;
      delete v.recoveriesComplete;
      f.records.set(at, v);
      const eventPath = f.path + '/events/0000000000000000',
        e = { ...f.records.get(eventPath), stateHash: digest(v) };
      f.records.set(eventPath, e);
      f.records.set(f.path + '/proofs/0000000000000000', {
        schemaVersion: 1,
        eventHash: digest(e),
      });
      const scene = f.records.get('users/author/sceneOperations/' + f.operationId);
      scene.processed = 7;
      scene.loreProcessed = 7;
      if (old.complete) f.records.delete('books/book/lore/' + f.intent.loreId);
      await f.step();
      assert.equal(state(f).schemaVersion, 2);
      assert.equal(state(f).phase, old.phase);
      assert.ok(state(f).processed >= 7);
      assert.equal(closed(f), true);
      await finishBookLoreDeletion(f);
      assert.equal(f.records.has('books/book'), false);
    },
  );
test('an orphan or late inventory cannot pass either final book check', async () => {
  const f = await fixture();
  await markBookDeleting(f);
  await until(f, () => state(f)?.complete === true);
  const orphan = f.db.doc('books/book/bookLoreRecoveryKeys/unrecognized');
  await f.db.runTransaction((tx) => tx.create(orphan, { schemaVersion: 1, ownerId: 'author' }));
  await assert.rejects(finishBookLoreDeletion(f));
  assert.equal(f.records.has(orphan.path), true);
  assert.equal(f.records.has('books/book'), true);
});
test('a new reservation is forbidden once deletion begins, even without resource flags', async () => {
  const f = await fixture();
  assert.equal(f.records.get('books/book').hasLoreResources, undefined);
  await markBookDeleting(f);
  const before = capture(f);
  await assert.rejects(
    f.service.reserveBookLoreEditRecovery(f.uid, { ...f.intent, writeId: 'too-late' }),
  );
  assert.deepEqual(capture(f), before);
});
test('a DTO or a real opening reused outside its original transaction cannot authorize revocation', async () => {
  const f = await fixture();
  await f.db.runTransaction((tx) =>
    assert.rejects(
      prepareBookLoreRecoveryDeletion(tx, { c: { db: f.db, uid: f.uid, bookId: f.bookId } }, {}),
    ),
  );
  assert.equal(closed(f), false);
});

test('a genuine deletion opening from another transaction cannot revoke a key', async () => {
  const f = await fixture();
  await markBookDeleting(f);
  await f.step();
  let opening;
  await f.db.runTransaction(async (tx) => {
    opening = await loadBookLoreDeletion(tx, f.db, f.uid, f.bookId, f.operationId);
  });
  await f.db.runTransaction((tx) =>
    assert.rejects(prepareBookLoreRecoveryDeletion(tx, opening, { ...state(f) })),
  );
  assert.equal(closed(f), false);
  assert.equal(f.records.has(f.c.key.path), true);
});
test('a recovery root created after the deletion cutoff is preserved and stops cleanup', async () => {
  const f = await fixture();
  await markBookDeleting(f);
  await f.step();
  const value = structuredClone(f.records.get(f.c.root.path)),
    key = structuredClone(f.records.get(f.c.key.path)),
    index = structuredClone(f.records.get(f.inventory.path));
  await f.db.runTransaction((tx) => {
    tx.delete(f.c.root);
    tx.delete(f.c.proof);
    tx.delete(f.c.key);
    tx.delete(f.inventory);
  });
  await f.db.runTransaction((tx) => {
    tx.create(f.c.root, value);
    tx.create(f.c.proof, { schemaVersion: 1, hash: digest(value) });
    tx.create(f.c.key, key);
    tx.create(f.inventory, index);
  });
  const before = capture(f);
  await assert.rejects(f.step());
  assert.deepEqual(capture(f), before);
});

test('a recreated book before deletion cannot collect a recovery of its former incarnation', async () => {
  const f = await fixture(),
    original = structuredClone(f.records.get('books/book'));
  await f.db.runTransaction((tx) => tx.delete(f.db.doc('books/book')));
  await f.db.runTransaction((tx) => tx.create(f.db.doc('books/book'), original));
  await markBookDeleting(f);
  await f.step();
  const before = capture(f);
  await assert.rejects(f.step());
  assert.deepEqual(capture(f), before);
  assert.equal(f.records.has(f.c.key.path), true);
});
test('an orphan inventory prevents a new reservation without overwriting the foreign marker', async () => {
  const d = adventureImportDb({ nativeUpdates: true }),
    f = await bookLoreWriteRecoveryFixture(d.db),
    index = recoveryKeyInventoryRef(f.c, f.bookId);
  await d.db.runTransaction((tx) => tx.create(index, { foreign: 'preserved' }));
  const before = structuredClone([...d.records]);
  await assert.rejects(f.service.reserveBookLoreEditRecovery(f.uid, f.intent));
  assert.deepEqual([...d.records], before);
  assert.equal(d.records.has(f.c.key.path), false);
});
