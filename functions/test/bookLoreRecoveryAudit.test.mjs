import test from 'node:test';
import assert from 'node:assert/strict';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import {
  bookLoreWriteRecoveryFixture,
  recoveryControl,
} from './helpers/bookLoreWriteRecoveryFixture.mjs';
import { bookLoreCreationRecoveryFixture } from './helpers/bookLoreCreationRecoveryFixture.mjs';
import { createBookLoreRecoveryAuditService } from '../src/bookLoreRecoveryAudit.mjs';
import { recoveryKeyInventoryRef } from '../src/bookLoreWriteRecoveryInventory.mjs';
import { digest } from '../src/workProgressContracts.mjs';
const snapshot = (f) => structuredClone([...f.records]);
async function fixture({ legacy = false, creation = false, deleted = true } = {}) {
  const d = adventureImportDb({ nativeUpdates: true }),
    s = await (creation
      ? bookLoreCreationRecoveryFixture(d.db)
      : bookLoreWriteRecoveryFixture(d.db)),
    recovery = await s.service.reserveBookLoreEditRecovery(s.uid, s.intent),
    index = recoveryKeyInventoryRef(s.c, s.bookId);
  const f = {
    ...d,
    ...s,
    recovery,
    index,
    audit: createBookLoreRecoveryAuditService({ db: d.db }),
  };
  if (legacy) {
    const root = f.records.get(f.c.root.path);
    delete root.keyInventory;
    f.records.set(f.c.proof.path, { schemaVersion: 1, hash: digest(root) });
    f.records.delete(index.path);
    f.metadata.delete(index.path);
  }
  if (deleted)
    await f.db.runTransaction((tx) => {
      tx.delete(f.db.doc('books/book'));
      tx.create(f.db.doc('deletedBooks/book'), { deletedAt: 9000 });
    });
  return f;
}
const scan = (f) => f.audit.auditBookLoreRecoveryKeys(f.uid),
  candidate = async (f) => (await scan(f)).items[0];
async function recreate(f, path) {
  const value = structuredClone(f.records.get(path));
  await f.db.runTransaction((tx) => tx.delete(f.db.doc(path)));
  await f.db.runTransaction((tx) => tx.create(f.db.doc(path), value));
}
for (const options of [{}, { legacy: true }, { creation: true }])
  test(
    'audit and explicit revoke ' +
      (options.legacy ? 'legacy' : options.creation ? 'creation' : 'indexed') +
      ' historical key without authoring changes',
    async () => {
      const f = await fixture(options),
        before = snapshot(f),
        row = await candidate(f);
      assert.equal(row.status, 'eligible');
      assert.deepEqual(snapshot(f), before);
      const remains = structuredClone(f.records.get('books/book/lore/' + f.intent.loreId));
      f.metadataReads.length = 0;
      const result = await f.audit.revokeAuditedBookLoreRecovery(f.uid, row.control);
      assert.equal(result.status, 'revoked');
      assert.equal(f.records.has(f.c.key.path), false);
      assert.equal(f.records.has(f.index.path), false);
      assert.equal(f.records.has('books/book'), false);
      assert.deepEqual(f.records.get('books/book/lore/' + f.intent.loreId), remains);
      assert.equal(
        (await f.service.getBookLoreEditRecovery(f.uid, recoveryControl(f.recovery))).jobToken,
        f.recovery.jobToken,
      );
      assert.equal((await candidate(f)).status, 'already-revoked');
      const reads = f.metadataReads.filter((r) => r.path === f.c.key.path);
      assert.ok(reads.length > 0);
      assert.ok(reads.every((r) => JSON.stringify(r.fields) === '["schemaVersion"]'));
      assert.equal(JSON.stringify(row).includes('keyBase64'), false);
      assert.equal(
        (await f.audit.revokeAuditedBookLoreRecovery(f.uid, row.control)).status,
        'already-revoked',
      );
    },
  );
test('live and identically recreated books never become automatic candidates', async () => {
  const f = await fixture({ deleted: false });
  assert.equal((await candidate(f)).status, 'book-present');
  const data = structuredClone(f.records.get('books/book'));
  await f.db.runTransaction((tx) => tx.delete(f.db.doc('books/book')));
  await f.db.runTransaction((tx) => {
    tx.create(f.db.doc('books/book'), data);
    tx.create(f.db.doc('deletedBooks/book'), { deletedAt: 9000 });
  });
  const before = snapshot(f);
  assert.equal((await candidate(f)).status, 'book-present');
  assert.deepEqual(snapshot(f), before);
});
for (const [name, data, reason] of [
  ['missing', null, 'missing-deletion-marker'],
  ['restore reservation', { kind: 'book-restore-reservation' }, 'unsupported-deletion-marker'],
  ['invalid date', { deletedAt: 'tomorrow' }, 'invalid-deletion-marker'],
  ['negative date', { deletedAt: -1 }, 'invalid-deletion-marker'],
  ['extra field', { deletedAt: 9000, forged: true }, 'unsupported-deletion-marker'],
])
  test(name + ' marker is reported for review and preserved', async () => {
    const f = await fixture();
    await f.db.runTransaction((tx) => {
      tx.delete(f.db.doc('deletedBooks/book'));
    });
    if (data !== null)
      await f.db.runTransaction((tx) => tx.create(f.db.doc('deletedBooks/book'), data));
    const before = snapshot(f),
      row = await candidate(f);
    assert.equal(row.status, 'needs-review');
    assert.equal(row.reason, reason);
    assert.equal(row.control, undefined);
    assert.deepEqual(snapshot(f), before);
  });
test('payload date alone cannot replace the native chronology of the marker', async () => {
  const f = await fixture();
  f.metadata.set('deletedBooks/book', {
    createdAt: 1000,
    createdAtNanoseconds: 0,
    updatedAt: 1000,
    updatedAtNanoseconds: 0,
  });
  assert.equal((await candidate(f)).reason, 'invalid-deletion-marker');
  assert.equal(f.records.has(f.c.key.path), true);
});
for (const what of ['key', 'proof', 'root', 'index'])
  test(
    'recreated ' + what + ' requires review and never gets deleted by a stale report',
    async () => {
      const f = await fixture(),
        row = await candidate(f);
      await recreate(f, what === 'index' ? f.index.path : f.c[what].path);
      const before = snapshot(f);
      assert.equal((await candidate(f)).status, 'needs-review');
      await assert.rejects(f.audit.revokeAuditedBookLoreRecovery(f.uid, row.control));
      assert.deepEqual(snapshot(f), before);
    },
  );
for (const change of ['marker-update', 'marker-recreation', 'book-return', 'marker-removal'])
  test('review pins evidence and refuses ' + change, async () => {
    const f = await fixture(),
      row = await candidate(f);
    if (change === 'marker-update')
      await f.db.runTransaction((tx) =>
        tx.update(f.db.doc('deletedBooks/book'), { deletedAt: 9001 }),
      );
    else if (change === 'marker-recreation') await recreate(f, 'deletedBooks/book');
    else if (change === 'book-return')
      await f.db.runTransaction((tx) => tx.create(f.db.doc('books/book'), { authorId: 'author' }));
    else await f.db.runTransaction((tx) => tx.delete(f.db.doc('deletedBooks/book')));
    const before = snapshot(f);
    await assert.rejects(f.audit.revokeAuditedBookLoreRecovery(f.uid, row.control));
    assert.deepEqual(snapshot(f), before);
  });
test('a missing original key can close without resurrection, but later closed-control residue is preserved', async () => {
  const f = await fixture();
  await f.db.runTransaction((tx) => tx.delete(f.c.key));
  const row = await candidate(f);
  assert.equal(row.status, 'eligible');
  assert.equal(row.keyPresent, false);
  await f.audit.revokeAuditedBookLoreRecovery(f.uid, row.control);
  await f.db.runTransaction((tx) =>
    tx.create(f.c.key, { schemaVersion: 1, keyBase64: Buffer.alloc(32).toString('base64') }),
  );
  const before = snapshot(f);
  assert.equal((await candidate(f)).status, 'needs-review');
  await assert.rejects(f.audit.revokeAuditedBookLoreRecovery(f.uid, row.control));
  assert.deepEqual(snapshot(f), before);
});
test('own metadata scan is paginated and never observes another UID namespace', async () => {
  const f = await fixture({ deleted: false });
  for (const id of ['a', 'b', 'z'])
    await f.service.reserveBookLoreEditRecovery(f.uid, { ...f.intent, writeId: id });
  await f.db.runTransaction((tx) =>
    tx.create(f.db.doc('users/other/bookLoreWriteRecoveries/private'), { secret: true }),
  );
  const first = await f.audit.auditBookLoreRecoveryKeys(f.uid, { limit: 2 }),
    second = await f.audit.auditBookLoreRecoveryKeys(f.uid, { limit: 2, after: first.next }),
    last = await f.audit.auditBookLoreRecoveryKeys(f.uid, { limit: 2, after: second.next });
  assert.equal(first.items.length, 2);
  assert.equal(second.items.length, 2);
  assert.equal(last.next, null);
  assert.equal(last.items.length, 0);
  assert.equal(new Set([...first.items, ...second.items].map((i) => i.writeId)).size, 4);
  assert.equal(JSON.stringify(first).includes('secret'), false);
});
test('an infrastructure failure aborts the page instead of certifying a bad control', async () => {
  const f = await fixture(),
    run = f.db.runTransaction.bind(f.db);
  let count = 0;
  f.db.runTransaction = (fn) => {
    if (++count === 2)
      return Promise.reject(Object.assign(Error('private diagnostic'), { code: 'unavailable' }));
    return run(fn);
  };
  await assert.rejects(scan(f), { code: 'unavailable' });
  assert.equal(f.records.has(f.c.key.path), true);
});
test('a final delete failure rolls back the terminal, proof and key together', async () => {
  const f = await fixture(),
    row = await candidate(f),
    before = snapshot(f),
    run = f.db.runTransaction.bind(f.db);
  f.db.runTransaction = (fn) =>
    run((tx) =>
      fn({
        ...tx,
        delete(ref) {
          tx.delete(ref);
          if (ref.path === f.index.path) throw Error('injected last delete');
        },
      }),
    );
  await assert.rejects(f.audit.revokeAuditedBookLoreRecovery(f.uid, row.control), /injected/);
  assert.deepEqual(snapshot(f), before);
  f.db.runTransaction = run;
  assert.equal((await f.audit.revokeAuditedBookLoreRecovery(f.uid, row.control)).status, 'revoked');
});
test('scope, hashes and argument shape are checked before a mutation', async () => {
  const f = await fixture(),
    row = await candidate(f),
    before = snapshot(f);
  await assert.rejects(f.audit.auditBookLoreRecoveryKeys(f.uid, { limit: 51 }));
  await assert.rejects(f.audit.auditBookLoreRecoveryKeys(f.uid, { unrecognized: true }));
  await assert.rejects(f.audit.revokeAuditedBookLoreRecovery('other', row.control));
  await assert.rejects(
    f.audit.revokeAuditedBookLoreRecovery(f.uid, { ...row.control, deletionToken: '0'.repeat(64) }),
  );
  await assert.rejects(
    f.audit.revokeAuditedBookLoreRecovery(f.uid, { ...row.control, force: true }),
  );
  assert.deepEqual(snapshot(f), before);
});
