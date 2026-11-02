import test from 'node:test';
import assert from 'node:assert/strict';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import { removalBatchFixture } from './helpers/bookLoreRemovalBatchFixture.mjs';
import { finishRemoval } from './helpers/bookLoreRemovalFixture.mjs';
import { cancelSourceInspection } from './helpers/bookLoreSourceInspectionFixture.mjs';
import {
  bookLoreDeletionFixture,
  markBookDeleting,
  finishBookLoreDeletion,
} from './helpers/bookLoreDeletionFixture.mjs';
import { createBookLoreRemovalBatchService } from '../src/bookLoreRemovalBatch.mjs';
import {
  prepareBookLoreRemovalStart,
  prepareBookLoreRemovalBatch,
} from '../src/bookLoreRemovalStart.mjs';

async function fixture(options) {
  const db = adventureImportDb({ nativeUpdates: true });
  return { ...db, ...(await removalBatchFixture(db.db, options)) };
}
const snapshot = (f) => structuredClone([...f.records]);
const privatePaths = (f) => [
  f.c.record.path,
  f.c.proof.path,
  ...f.members.flatMap((m) => [m.path, m.path + '/state/current', m.tombstonePath]),
];
function untouched(f) {
  for (const member of f.members) {
    assert.equal(f.records.has(member.source.seed.path), true);
    assert.equal(f.records.has(member.path), false);
    assert.equal(f.records.has(member.tombstonePath), false);
  }
  assert.equal(f.records.has(f.c.record.path), false);
  assert.equal(f.records.has(f.c.proof.path), false);
}
test('one native commit withdraws mixed inline/v1/v2 lore with a single clock/privacy change and shared proof', async () => {
  const f = await fixture(),
    beforeSibling = structuredClone(f.records.get(f.sibling.seed.path));
  const p = await f.start();
  assert.equal(p.removed, true);
  assert.equal(p.complete, false);
  assert.equal(p.items.length, 3);
  assert.equal(p.localLoreVersion, 11);
  assert.equal(p.publicationPrivacyVersion, 5);
  assert.equal(p.revoked, true);
  assert.equal(p.timestamp, 10001);
  const root = f.records.get('books/book');
  assert.equal(root.localLoreVersion, 11);
  assert.equal(root.publicationPrivacyVersion, 5);
  assert.equal(root.updatedAt, 10001);
  assert.equal(root.createdAt, 500);
  assert.equal(root.hasLoreResources, true);
  assert.equal(root.status, 'draft');
  assert.equal(f.records.has('publicBooks/book'), false);
  for (const path of privatePaths(f))
    assert.deepEqual(f.metadata.get(path).createTime, f.metadata.get(f.c.record.path).createTime);
  for (const m of f.members) {
    assert.equal(f.records.has(m.source.seed.path), false);
    assert.equal(f.records.get(m.path).localLoreVersion, 11);
    assert.equal(f.records.get(m.path).publicationPrivacyVersion, 5);
  }
  assert.deepEqual(f.records.get(f.sibling.seed.path), beforeSibling);
  assert.equal(f.records.get('users/author').credits, 20);
  const proof = JSON.stringify([f.records.get(f.c.record.path), f.records.get(f.c.proof.path)]);
  assert.equal(proof.includes('PRIVATE_NAME'), false);
  assert.equal(proof.includes('PRIVATE_PROSE'), false);
});
test('read-only preparation changes nothing and caller rollback preserves all heads and public state', async () => {
  const f = await fixture(),
    before = snapshot(f);
  await f.db.runTransaction(async (tx) => {
    const plan = await prepareBookLoreRemovalBatch(
      tx,
      { db: f.db, now: () => 3000 },
      f.uid,
      f.input,
    );
    assert.equal(plan.result, null);
    assert.deepEqual(snapshot(f), before);
  });
  assert.deepEqual(snapshot(f), before);
  await assert.rejects(
    f.db.runTransaction(async (tx) => {
      const plan = await prepareBookLoreRemovalBatch(
        tx,
        { db: f.db, now: () => 3000 },
        f.uid,
        f.input,
      );
      plan.commit();
      throw Error('caller rollback');
    }),
    /caller rollback/,
  );
  assert.deepEqual(snapshot(f), before);
  untouched(f);
});
test('private/absent consent keeps publication and epoch while still sharing one lore clock', async () => {
  const f = await fixture({ publicIndices: [] }),
    p = await f.start(),
    root = f.records.get('books/book');
  assert.equal(p.revoked, false);
  assert.equal(p.publicationPrivacyVersion, 4);
  assert.equal(root.publicationPrivacyVersion, 4);
  assert.equal(root.status, 'published');
  assert.equal(root.localLoreVersion, 11);
  assert.equal(f.records.has('publicBooks/book'), true);
});
test('concurrent retry and historical replay confirm the aggregate without repeating effects or reading the clock provider', async () => {
  const f = await fixture(),
    [a, b] = await Promise.all([f.start(), f.start()]);
  assert.deepEqual(a, b);
  const before = snapshot(f);
  const cold = createBookLoreRemovalBatchService({
    db: f.db,
    now: () => {
      throw Error('must not use now on replay');
    },
  });
  assert.deepEqual(await cold.startBookLoreRemovalBatch(f.uid, f.input), a);
  assert.deepEqual(snapshot(f), before);
});
test('one changed source rejects the whole batch and leaves sibling heads, counters and publication intact', async () => {
  const f = await fixture();
  await f.db.runTransaction(async (tx) => {
    tx.update(f.db.doc(f.members[1].source.seed.path), { summary: 'CHANGED' });
  });
  const before = snapshot(f);
  await assert.rejects(f.start(), { code: 'failed-precondition' });
  assert.deepEqual(snapshot(f), before);
  untouched(f);
});
test('one cancelled inspection rejects the batch before any withdrawal', async () => {
  const f = await fixture();
  await cancelSourceInspection(
    f.members[1].source,
    await f.members[1].source.factory().getBookLoreSourceInspection(f.uid, {
      inspectionId: f.members[1].source.inspectionId,
      startHash: f.members[1].source.startHash,
    }),
  );
  const before = snapshot(f);
  await assert.rejects(f.start(), { code: 'failed-precondition' });
  assert.deepEqual(snapshot(f), before);
  untouched(f);
});
test('individual success cannot be promoted to an aggregate proof', async () => {
  const f = await fixture();
  await f.members[0].start();
  const before = snapshot(f);
  await assert.rejects(f.start(), { code: 'failed-precondition' });
  await assert.rejects(f.get(), { code: 'failed-precondition' });
  assert.deepEqual(snapshot(f), before);
  assert.equal(f.records.has(f.c.record.path), false);
});
test('even singular plans committed together are not an aggregate event without its own original proof', async () => {
  const f = await fixture();
  await f.db.runTransaction(async (tx) => {
    const plans = await Promise.all(
      f.members.map((m) =>
        prepareBookLoreRemovalStart(tx, { db: f.db, now: () => 3000 }, f.uid, m.intent),
      ),
    );
    for (const plan of plans) plan.commit();
  });
  const before = snapshot(f);
  await assert.rejects(f.get(), { code: 'failed-precondition' });
  await assert.rejects(f.start(), { code: 'failed-precondition' });
  assert.deepEqual(snapshot(f), before);
});
for (const target of ['record', 'proof', 'pair', 'context', 'tombstone'])
  test('recreated ' + target + ' never inherits the native aggregate proof', async () => {
    const f = await fixture();
    await f.start();
    const paths =
      target === 'pair'
        ? [f.c.record.path, f.c.proof.path]
        : [
            target === 'record'
              ? f.c.record.path
              : target === 'proof'
                ? f.c.proof.path
                : target === 'context'
                  ? f.members[1].path
                  : f.members[1].tombstonePath,
          ];
    const values = paths.map((p) => structuredClone(f.records.get(p)));
    await f.db.runTransaction(async (tx) => {
      for (const p of paths) tx.delete(f.db.doc(p));
    });
    await f.db.runTransaction(async (tx) => {
      paths.forEach((p, n) => tx.create(f.db.doc(p), values[n]));
    });
    const before = snapshot(f);
    await assert.rejects(f.get(), { code: 'failed-precondition' });
    await assert.rejects(f.start(), { code: 'failed-precondition' });
    assert.deepEqual(snapshot(f), before);
  });
test('missing both aggregate documents with a surviving leader is conflict, not event absence', async () => {
  const f = await fixture();
  await f.start();
  await f.db.runTransaction(async (tx) => {
    tx.delete(f.c.record);
    tx.delete(f.c.proof);
  });
  await assert.rejects(f.get(), { code: 'failed-precondition' });
});
test('intent order/hash and another account cannot claim an existing aggregate', async () => {
  const f = await fixture();
  await f.start();
  await assert.rejects(
    f
      .factory()
      .startBookLoreRemovalBatch(f.uid, { ...f.input, requests: [...f.input.requests].reverse() }),
  );
  await assert.rejects(
    f.factory().getBookLoreRemovalBatch(f.uid, { ...f.control, intentHash: 'f'.repeat(64) }),
  );
  assert.equal(await f.factory().getBookLoreRemovalBatch('other', f.control), null);
  await assert.rejects(f.factory().startBookLoreRemovalBatch('other', f.input));
});
test('scoped cleanup keeps the aggregate proof and unrelated lore intact', async () => {
  const f = await fixture();
  await f.start();
  const sibling = structuredClone(f.records.get(f.sibling.seed.path));
  for (const m of f.members) await finishRemoval(m);
  const done = await f.get();
  assert.equal(done.complete, true);
  assert.equal(
    done.items.every((p) => p.complete),
    true,
  );
  assert.deepEqual(f.records.get(f.sibling.seed.path), sibling);
  assert.equal(f.records.get('books/book').localLoreVersion, 11);
  assert.deepEqual(await f.start(), done);
});
test('whole-book handoff preserves historical aggregate completion after original root removal', async () => {
  const f = await fixture();
  await f.start();
  const book = bookLoreDeletionFixture(f.db);
  await markBookDeleting(book);
  await finishBookLoreDeletion(book);
  assert.equal(f.records.has('books/book'), false);
  const done = await f.get();
  assert.equal(done.complete, true);
  assert.deepEqual(await f.start(), done);
});
test('the 50-member transaction unit is supported without changing per-fiche cleanup formats', async () => {
  const f = await fixture({ count: 50, modes: ['inline'] }),
    p = await f.start();
  assert.equal(p.items.length, 50);
  assert.equal(p.localLoreVersion, 11);
  assert.equal(f.records.get('books/book').localLoreVersion, 11);
  assert.equal(f.records.has(f.sibling.seed.path), true);
});
test('closed input, auth, duplicates and mixed books fail before database access', async () => {
  const noDb = new Proxy(
    {},
    {
      get() {
        throw Error('Unexpected database access');
      },
    },
  );
  const api = createBookLoreRemovalBatchService({ db: noDb }),
    h = 'a'.repeat(64);
  const item = {
    bookId: 'book',
    loreId: 'entity',
    removalId: 'remove-id',
    sourceToken: h,
    inspection: { inspectionId: 'source-id', startHash: h, jobToken: h },
  };
  for (const uid of [undefined, '', 'other/account'])
    await assert.rejects(api.startBookLoreRemovalBatch(uid, null), { code: 'unauthenticated' });
  for (const input of [
    {},
    { batchId: 'batch', requests: [] },
    { batchId: 'batch', requests: Array(51).fill(item) },
    { batchId: 'batch', requests: [item, { ...item, removalId: 'other' }] },
    { batchId: 'batch', requests: [item, { ...item, loreId: 'other' }] },
    {
      batchId: 'batch',
      requests: [item, { ...item, bookId: 'other', loreId: 'other', removalId: 'other' }],
    },
    { batchId: 'batch', requests: [item], uid: 'other' },
    { batchId: 'batch', requests: [{ ...item, timestamp: 123 }] },
  ])
    await assert.rejects(api.startBookLoreRemovalBatch('author', input));
  await assert.rejects(
    api.getBookLoreRemovalBatch('author', {
      leaderRemovalId: 'remove-id',
      batchId: 'batch',
      intentHash: h,
      uid: 'other',
    }),
  );
});

test('the observed native batch token remains pinned across history and rejects a fully recreated control cohort', async () => {
  const f = await fixture(),
    original = await f.start();
  assert.match(original.jobToken, /^[a-f0-9]{64}$/);
  assert.deepEqual(
    await f.factory().getBookLoreRemovalBatch(f.uid, { ...f.control, jobToken: original.jobToken }),
    original,
  );
  await assert.rejects(
    f.factory().getBookLoreRemovalBatch(f.uid, { ...f.control, jobToken: 'f'.repeat(64) }),
  );
  const paths = [
    f.c.record.path,
    f.c.proof.path,
    ...f.members.flatMap((m) => [
      m.path,
      m.path + '/state/current',
      m.path + '/events/0000000000000000',
      m.path + '/proofs/0000000000000000',
      m.tombstonePath,
    ]),
  ];
  const values = paths.map((p) => structuredClone(f.records.get(p)));
  await f.db.runTransaction(async (tx) => {
    for (const p of paths) tx.delete(f.db.doc(p));
  });
  await f.db.runTransaction(async (tx) => {
    paths.forEach((p, n) => tx.create(f.db.doc(p), values[n]));
  });
  await assert.rejects(
    f.factory().getBookLoreRemovalBatch(f.uid, { ...f.control, jobToken: original.jobToken }),
    { code: 'failed-precondition' },
  );
});
