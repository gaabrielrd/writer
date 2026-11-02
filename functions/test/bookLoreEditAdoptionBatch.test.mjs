import test from 'node:test';
import assert from 'node:assert/strict';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import {
  adoptionBatchFixture,
  applyAdoptionBatch,
} from './helpers/bookLoreEditAdoptionBatchFixture.mjs';
import { adoptFixture, nextAdoptionFixture } from './helpers/bookLoreEditAdoptionFixture.mjs';
import {
  cancelEditReservation,
  drainEditReservation,
} from './helpers/bookLoreEditReservationFixture.mjs';
import { sourceInspectionFixture } from './helpers/bookLoreSourceInspectionFixture.mjs';
import { removalFixture, finishRemoval } from './helpers/bookLoreRemovalFixture.mjs';
import {
  bookLoreDeletionFixture,
  markBookDeleting,
  finishBookLoreDeletion,
} from './helpers/bookLoreDeletionFixture.mjs';
import { prepareBookLoreEditAdoptionBatch } from '../src/bookLoreEditAdoption.mjs';
import { adoptionBatchScope } from '../src/bookLoreEditAdoptionBatch.mjs';
import { createBookLoreReadService } from '../src/bookLoreRead.mjs';
import { createBookLoreResourceInventoryService } from '../src/bookLoreResourceInventory.mjs';
import { readGenerationSection } from './helpers/bookLoreGenerationFixture.mjs';
import { born } from '../src/bookRestoreUploadContracts.mjs';
import { digest } from '../src/workProgressContracts.mjs';
async function setup(options) {
  const d = adventureImportDb({ nativeUpdates: true });
  return { ...d, ...(await adoptionBatchFixture(d.db, options)) };
}
const job = (f, i) => f.records.get(f.members[i].c.path);
const scope = (f) => adoptionBatchScope(f.db, f.uid, f.request);
const all = (f) => structuredClone([...f.records]);
const root = (f) => f.records.get('books/' + f.bookId);
const read = (f, path) => f.db.runTransaction((tx) => tx.get(f.db.doc(path)));
test('mixed creation and edit commit with one native root clock and a metadata-only batch proof', async () => {
  const f = await setup(),
    result = await applyAdoptionBatch(f),
    at = scope(f),
    proof = await read(f, at.record.path),
    api = createBookLoreReadService({ db: f.db }),
    writes = f.commits.at(-2);
  assert.equal(result.items.length, 2);
  assert.equal(result.phase, 'adopted');
  assert.equal(root(f).localLoreVersion, 1);
  assert.equal(root(f).hasLoreResources, true);
  assert.ok(!JSON.stringify(proof.data()).includes('new literal'));
  for (const [i, member] of f.members.entries()) {
    const adoption = job(f, i).adoption;
    assert.equal(adoption.timestamp, result.timestamp);
    assert.equal(adoption.localLoreVersion, 1);
    const head = await read(f, member.source.seed.path),
      receipt = await read(f, member.c.path + '/operations/' + member.adoptRequest.operationId);
    assert.deepEqual(born(receipt), born(proof));
    assert.deepEqual(born({ createTime: head.updateTime }), born(proof));
    assert.equal(
      (await api.getBookLoreRead(f.uid, { bookId: f.bookId, id: member.loreId })).id,
      member.loreId,
    );
    assert.deepEqual((await adoptFixture(member)).receipt, result.items[i]);
  }
  assert.equal(writes.filter((w) => w.path === 'books/' + f.bookId).length, 1);
  assert.equal((await f.members[1].parent.get()).phase, 'adopted');
  assert.deepEqual(await applyAdoptionBatch(f), result);
});
test('failed candidate waits for sibling reads before rejecting the caller transaction', async () => {
  const f = await setup({ members: [{ mode: 'v1' }, { mode: 'inline' }] });
  f.request.requests[1].expectedRevision--;
  let inFlight = 0,
    rejected = false,
    lateReads = 0;
  const before = all(f);
  await assert.rejects(() =>
    f.db.runTransaction(async (tx) => {
      const proxy = { ...tx };
      for (const method of ['get', 'getAll'])
        proxy[method] = async (...args) => {
          if (rejected) lateReads++;
          inFlight++;
          try {
            await new Promise((resolve) => setTimeout(resolve, 1));
            return await tx[method](...args);
          } finally {
            inFlight--;
          }
        };
      try {
        await prepareBookLoreEditAdoptionBatch(
          proxy,
          { db: f.db, now: () => 2000 },
          f.uid,
          f.request,
        );
      } catch (error) {
        rejected = true;
        assert.equal(inFlight, 0, 'No sibling read can outlive transaction rejection');
        throw error;
      }
    }),
  );
  assert.equal(inFlight, 0);
  assert.equal(lateReads, 0);
  assert.deepEqual(all(f), before);
});

test('one v2 member preserves the batch contract and explicit removals without altering the singular API', async () => {
  const f = await setup({
      members: [{ mode: 'v2', changes: [{ target: { field: 'details' }, value: 'one 🌙' }] }],
    }),
    result = await applyAdoptionBatch(f),
    api = createBookLoreReadService({ db: f.db }),
    member = f.members[0],
    view = await api.getBookLoreRead(f.uid, { bookId: f.bookId, id: member.loreId });
  assert.equal(result.items.length, 1);
  assert.equal(result.localLoreVersion, 1);
  assert.equal(
    await readGenerationSection(api, member.source.seed, view, 'field', 'details'),
    'one 🌙',
  );
  assert.deepEqual((await adoptFixture(member)).receipt, result.items[0]);
  assert.deepEqual(await applyAdoptionBatch(f), result);
});

test('timestamp and privacy aggregate once while each member retains its own before/after decision', async () => {
  const f = await setup({
    members: [
      {
        mode: 'inline',
        changes: [{ target: { field: 'isPublic' }, value: false }],
        sourceOptions: { data: { name: 'A', category: 'other', isPublic: true, updatedAt: 9000 } },
      },
      { mode: 'v1', removals: ['isPublic'], changes: [] },
      { creating: true },
    ],
  });
  await f.db.runTransaction((tx) => {
    tx.update(f.db.doc('books/book'), {
      updatedAt: 10000,
      status: 'published',
      publicationPrivacyVersion: 7,
    });
    tx.create(f.db.doc('publicBooks/book'), { revisionId: 'old' });
  });
  const result = await applyAdoptionBatch(f);
  assert.equal(result.timestamp, 10001);
  assert.equal(result.publicationPrivacyVersion, 8);
  assert.equal(result.revoked, true);
  assert.equal(root(f).localLoreVersion, 1);
  assert.equal(root(f).status, 'draft');
  assert.equal(f.records.has('publicBooks/book'), false);
  assert.deepEqual(
    result.items.map((p) => p.adoption.revoked),
    [true, true, false],
  );
  for (const [i] of f.members.entries()) {
    assert.equal(job(f, i).adoption.publicationPrivacyVersion, 8);
    assert.equal(job(f, i).adoption.timestamp, 10001);
  }
  assert.equal(job(f, 2).adoption.storage.dates.createdAt, 10001);
});
test('preparation performs no writes and composes with caller credit/receipt reads and atomic writes', async () => {
  const f = await setup();
  await f.db.runTransaction((tx) => tx.create(f.db.doc('credits/author'), { balance: 20 }));
  const result = await f.db.runTransaction(async (tx) => {
    const plan = await prepareBookLoreEditAdoptionBatch(
        tx,
        { db: f.db, now: () => 2000 },
        f.uid,
        f.request,
      ),
      credit = await tx.get(f.db.doc('credits/author'));
    assert.equal(root(f).localLoreVersion, 0);
    assert.equal(plan.result.items.length, 2);
    plan.commit();
    tx.update(f.db.doc('credits/author'), { balance: credit.data().balance - 3 });
    tx.create(f.db.doc('analysisReceipts/one'), { batchId: f.request.batchId });
    return plan.result;
  });
  const batch = await read(f, scope(f).record.path),
    receipt = await read(f, 'analysisReceipts/one'),
    credit = await read(f, 'credits/author');
  assert.deepEqual(born(receipt), born(batch));
  assert.deepEqual(born({ createTime: credit.updateTime }), born(batch));
  assert.equal(credit.data().balance, 17);
  assert.deepEqual(await applyAdoptionBatch(f), result);
});
for (const point of ['head', 'member', 'root', 'batch', 'proof', 'credit', 'receipt'])
  test(
    'rollback at ' + point + ' preserves every prepared item and the caller balance',
    async () => {
      const f = await setup();
      await f.db.runTransaction((tx) => tx.create(f.db.doc('credits/author'), { balance: 20 }));
      const at = scope(f),
        before = all(f),
        paths = {
          head: f.members[1].source.seed.path,
          member: f.members[1].c.path,
          root: 'books/book',
          batch: at.record.path,
          proof: at.proof.path,
          credit: 'credits/author',
          receipt: 'analysisReceipts/one',
        };
      await assert.rejects(
        () =>
          f.db.runTransaction(async (tx) => {
            const proxy = { ...tx };
            for (const method of ['create', 'set', 'update', 'delete'])
              proxy[method] = (ref, ...args) => {
                const value = tx[method](ref, ...args);
                if (ref.path === paths[point]) throw Error('injected batch rollback');
                return value;
              };
            const plan = await prepareBookLoreEditAdoptionBatch(
                proxy,
                { db: f.db, now: () => 2000 },
                f.uid,
                f.request,
              ),
              credit = await proxy.get(f.db.doc('credits/author'));
            plan.commit();
            proxy.update(f.db.doc('credits/author'), { balance: credit.data().balance - 3 });
            proxy.create(f.db.doc('analysisReceipts/one'), { done: true });
          }),
        /injected batch rollback/,
      );
      assert.deepEqual(all(f), before);
      assert.equal((await applyAdoptionBatch(f)).phase, 'adopted');
    },
  );
for (const defect of [
  'stale',
  'owner',
  'deleting',
  'book-recreated',
  'head-recreated',
  'cancelled',
  'certificate',
])
  test('one member with ' + defect + ' rejects the entire batch without writes', async () => {
    const f = await setup({ members: [{ mode: 'inline' }, { mode: 'v1' }] }),
      member = f.members[1];
    if (defect === 'stale') f.request.requests[1].expectedRevision--;
    else if (defect === 'cancelled') await cancelEditReservation(member, member.ready);
    else {
      const path =
        defect === 'head-recreated'
          ? member.source.seed.path
          : defect === 'certificate'
            ? member.c.path + '/compilationCertificate/current'
            : 'books/book';
      if (defect.includes('recreated')) {
        const value = structuredClone(f.records.get(path));
        await f.db.runTransaction((tx) => tx.delete(f.db.doc(path)));
        await f.db.runTransaction((tx) => tx.create(f.db.doc(path), value));
      } else
        await f.db.runTransaction((tx) =>
          defect === 'certificate'
            ? tx.delete(f.db.doc(path))
            : tx.update(
                f.db.doc(path),
                defect === 'owner' ? { authorId: 'other' } : { deleting: true },
              ),
        );
    }
    const before = all(f);
    await assert.rejects(() => applyAdoptionBatch(f));
    assert.deepEqual(all(f), before);
    assert.equal(job(f, 0).phase, 'preparing');
  });
for (const change of [
  'extra',
  'empty',
  '51',
  'duplicate-edit',
  'wrong-user',
  'cross-book',
  'duplicate-lore',
])
  test('closed batch rejects ' + change, async () => {
    const f = await setup({ members: [{ mode: 'inline' }, { mode: 'v1' }] });
    let uid = f.uid;
    if (change === 'extra') f.request.credit = 1;
    if (change === 'empty') f.request.requests = [];
    if (change === '51') f.request.requests = Array(51).fill(f.request.requests[0]);
    if (change === 'duplicate-edit') f.request.requests[1] = f.request.requests[0];
    if (change === 'wrong-user') uid = 'other';
    if (change === 'cross-book') {
      const other = await adoptionBatchFixture(f.db, {
        bookId: 'other',
        prefix: 'other',
        members: [{ mode: 'inline' }],
      });
      f.request.requests[1] = other.request.requests[0];
    }
    if (change === 'duplicate-lore') {
      const other = await nextAdoptionFixture(f.members[0], { editId: 'same-target' });
      f.request.requests[1] = other.adoptRequest;
    }
    const before = all(f);
    await assert.rejects(() => applyAdoptionBatch(f, f.request, uid));
    assert.deepEqual(all(f), before);
  });
test('concurrent exact requests commit once and changed order or intent cannot reuse that proof', async () => {
  const f = await setup(),
    [a, b] = await Promise.all([applyAdoptionBatch(f), applyAdoptionBatch(f)]);
  assert.deepEqual(a, b);
  assert.equal(root(f).localLoreVersion, 1);
  const before = all(f);
  for (const request of [
    { ...f.request, batchId: 'other-id' },
    { ...f.request, requests: [...f.request.requests].reverse() },
    { ...f.request, requests: [f.request.requests[0]] },
    {
      ...f.request,
      requests: f.request.requests.map((r, i) => (i ? { ...r, operationId: 'different' } : r)),
    },
  ])
    await assert.rejects(() => applyAdoptionBatch(f, request));
  assert.deepEqual(all(f), before);
});
for (const subset of [1, 2])
  test(subset + ' individually adopted items never imply a joint batch receipt', async () => {
    // Individually adopting the first item invalidates the other's source clock.
    const f = await setup({ members: [{ mode: 'inline' }, { mode: 'v1' }] });
    await adoptFixture(f.members[0]);
    if (subset === 2) {
      const next = await nextAdoptionFixture(f.members[1], { editId: 'fresh-second' });
      await adoptFixture(next);
      f.request.requests[1] = next.adoptRequest;
    }
    const before = all(f);
    await assert.rejects(() => applyAdoptionBatch(f));
    assert.deepEqual(all(f), before);
    assert.equal(f.records.has(scope(f).record.path), false);
  });
for (const defect of [
  'missing-pair',
  'missing-proof',
  'recreated-pair',
  'recreated-member',
  'tampered-record',
])
  test(defect + ' blocks aggregate replay without changing a real singular success', async () => {
    const f = await setup(),
      result = await applyAdoptionBatch(f),
      at = scope(f),
      paths =
        defect === 'recreated-member'
          ? [
              f.members[1].c.path + '/operations/' + f.members[1].adoptRequest.operationId,
              f.members[1].c.path + '/operationProofs/' + f.members[1].adoptRequest.operationId,
            ]
          : defect === 'missing-proof'
            ? [at.proof.path]
            : [at.record.path, at.proof.path],
      values = paths.map((path) => structuredClone(f.records.get(path)));
    if (defect === 'tampered-record') {
      const value = structuredClone(f.records.get(at.record.path));
      value.items[1].progress.adoption.localLoreVersion++;
      await f.db.runTransaction((tx) => {
        tx.set(at.record, value);
        tx.set(at.proof, { schemaVersion: 1, batchHash: digest(value) });
      });
    } else {
      await f.db.runTransaction((tx) => paths.forEach((p) => tx.delete(f.db.doc(p))));
      if (defect.startsWith('recreated'))
        await f.db.runTransaction((tx) =>
          paths.forEach((p, i) => tx.create(f.db.doc(p), values[i])),
        );
    }
    const before = all(f);
    await assert.rejects(() => applyAdoptionBatch(f));
    assert.deepEqual(all(f), before);
    assert.deepEqual((await adoptFixture(f.members[0])).receipt, result.items[0]);
  });
test('historical batch survives reedition, GC, individual removal and full book cleanup without resurrection', async () => {
  const f = await setup({
      members: [
        {
          creating: true,
          changes: [
            { target: { field: 'name' }, value: 'N' },
            { target: { field: 'category' }, value: 'other' },
            { target: { field: 'details' }, value: 'old text' },
          ],
        },
        { mode: 'v1' },
      ],
    }),
    result = await applyAdoptionBatch(f),
    member = f.members[0],
    oldBody = job(f, 0).adoption.storage.fields.details.manifest.bodyId,
    next = await nextAdoptionFixture(member, {
      changes: [{ target: { field: 'details' }, value: 'next text' }],
    });
  await adoptFixture(next);
  const inventory = createBookLoreResourceInventoryService({ db: f.db });
  let collected;
  for (let i = 0; i < 100; i++) {
    collected = await inventory.collectBookLoreInventoryBody(f.uid, {
      bookId: f.bookId,
      bodyId: oldBody,
    });
    if (collected.complete) break;
  }
  assert.equal(collected.complete, true);
  assert.deepEqual(await applyAdoptionBatch(f), result);
  const inspected = await sourceInspectionFixture(f.db, {
      uid: f.uid,
      bookId: f.bookId,
      id: member.loreId,
      inspectionId: 'remove-batch-member',
      existingSeed: member.source.seed,
    }),
    removal = await removalFixture(f.db, { source: inspected });
  await finishRemoval(removal);
  assert.deepEqual(await applyAdoptionBatch(f), result);
  const deletion = bookLoreDeletionFixture(f.db);
  await markBookDeleting(deletion);
  assert.equal((await finishBookLoreDeletion(deletion)).complete, true);
  const before = all(f);
  assert.deepEqual(await applyAdoptionBatch(f), result);
  assert.deepEqual(all(f), before);
  assert.equal(f.records.has('books/book'), false);
  for (const m of f.members) assert.equal(f.records.has(m.source.seed.path), false);
});
test('50 prepared payload edits retire all native predecessors in a single metadata-only commit', async () => {
  const f = await setup({
      members: Array.from({ length: 50 }, () => ({ mode: 'v1', registerOld: true })),
    }),
    result = await applyAdoptionBatch(f),
    writes = f.commits.at(-1);
  assert.equal(result.items.length, 50);
  assert.equal(root(f).localLoreVersion, 1);
  assert.equal(writes.filter((w) => w.path === 'books/book').length, 1);
  assert.equal(writes.filter((w) => w.path.includes('/adoptionBatches/')).length, 1);
  assert.ok(writes.length > 500);
  assert.ok(writes.every((w) => !/bookResource(Chunks|Bodies|Leases)/.test(w.path)));
  for (const member of f.members) {
    const path =
      'books/book/bookLoreGenerations/' +
      member.source.seed.storage.generationId +
      '/state/current';
    assert.equal(f.records.get(path).phase, 'retired');
  }
  assert.deepEqual(await applyAdoptionBatch(f), result);
  const api = createBookLoreReadService({ db: f.db }),
    member = f.members[49],
    view = await api.getBookLoreRead(f.uid, { bookId: f.bookId, id: member.loreId });
  assert.equal(
    await readGenerationSection(api, member.source.seed, view, 'field', 'details'),
    '\ufeffnew literal 🌙',
  );
});
test('a rejected fresh batch can be cancelled and its preparations cleaned without committing a partial head', async () => {
  const f = await setup();
  f.request.requests[1].expectedRevision--;
  await assert.rejects(() => applyAdoptionBatch(f));
  for (const member of f.members) {
    const cancelled = await cancelEditReservation(member, member.ready);
    assert.equal((await drainEditReservation(member, cancelled.progress)).phase, 'cancelled');
  }
  assert.equal(root(f).localLoreVersion, 0);
  assert.equal(f.records.has(f.members[1].source.seed.path), false);
  assert.equal(f.records.has(scope(f).record.path), false);
});
