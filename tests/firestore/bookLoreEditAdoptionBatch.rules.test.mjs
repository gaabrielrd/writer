import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { before, beforeEach, after, test } from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
  adoptionBatchFixture,
  applyAdoptionBatch,
} from '../../functions/test/helpers/bookLoreEditAdoptionBatchFixture.mjs';
import { adoptFixture } from '../../functions/test/helpers/bookLoreEditAdoptionFixture.mjs';
import { prepareBookLoreEditAdoptionBatch } from '../../functions/src/bookLoreEditAdoption.mjs';
import { adoptionBatchScope } from '../../functions/src/bookLoreEditAdoptionBatch.mjs';
import {
  bookLoreDeletionFixture,
  markBookDeleting,
  finishBookLoreDeletion,
} from '../../functions/test/helpers/bookLoreDeletionFixture.mjs';
import { createBookLoreReadService } from '../../functions/src/bookLoreRead.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-lore-adoption-batch';
let admin, env;
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127[.]0[.]0[.]1:[0-9]+$/.test(address ?? ''))
    throw Error('Dedicated loopback emulator required');
  const [host, port] = address.split(':');
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      host,
      port: Number(port),
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
  });
  admin = new Firestore({ projectId, host: address, ssl: false, universeDomain: 'googleapis.com' });
});
beforeEach(async () => env.clearFirestore());
after(async () => {
  await admin?.terminate();
  await env?.cleanup();
});
const data = async (path) => (await admin.doc(path).get()).data();
test('SDK concurrent mixed batch has common native birth, one clock, one privacy revocation and protected proofs', async () => {
  const f = await adoptionBatchFixture(admin, {
    members: [
      { mode: 'inline', changes: [{ target: { field: 'isPublic' }, value: false }] },
      { mode: 'v1', changes: [], removals: ['isPublic'] },
      { creating: true },
    ],
  });
  await admin
    .doc('books/book')
    .update({ status: 'published', publicationPrivacyVersion: 3, updatedAt: 9000 });
  await admin.doc('publicBooks/book').create({ revisionId: 'old' });
  const [a, b] = await Promise.all([applyAdoptionBatch(f), applyAdoptionBatch(f)]),
    at = adoptionBatchScope(admin, f.uid, f.request),
    receipt = await at.record.get(),
    root = await admin.doc('books/book').get();
  assert.deepEqual(a, b);
  assert.equal(a.timestamp, 9001);
  assert.equal(root.data().localLoreVersion, 1);
  assert.equal(root.data().publicationPrivacyVersion, 4);
  assert.equal(root.data().status, 'draft');
  assert.equal(root.updateTime.isEqual(receipt.createTime), true);
  assert.equal((await admin.doc('publicBooks/book').get()).exists, false);
  for (const [i, m] of f.members.entries()) {
    const head = await admin.doc(m.source.seed.path).get(),
      original = await admin.doc(m.c.path + '/operations/' + m.adoptRequest.operationId).get();
    assert.equal(head.updateTime.isEqual(receipt.createTime), true);
    assert.equal(original.createTime.isEqual(receipt.createTime), true);
    assert.equal(a.items[i].adoption.publicationPrivacyVersion, 4);
    assert.deepEqual((await adoptFixture(m)).receipt, a.items[i]);
  }
  assert.equal((await f.members[2].parent.get()).phase, 'adopted');
  for (const client of [
    env.authenticatedContext(f.uid).firestore(),
    env.unauthenticatedContext().firestore(),
  ]) {
    await assertFails(getDoc(doc(client, at.record.path)));
    await assertFails(
      setDoc(doc(client, at.proof.path), { schemaVersion: 1, batchHash: 'forged' }),
    );
  }
  const deletion = bookLoreDeletionFixture(admin);
  await markBookDeleting(deletion);
  assert.equal((await finishBookLoreDeletion(deletion)).complete, true);
  assert.equal((await admin.doc('books/book').get()).exists, false);
  assert.deepEqual(await applyAdoptionBatch(f), a);
  for (const m of f.members)
    assert.equal((await admin.doc(m.source.seed.path).get()).exists, false);
});
test('SDK native final receipt failure rolls back heads, creator proof, batch, clock and caller balance before exact retry', async () => {
  const f = await adoptionBatchFixture(admin),
    before = await data('books/book'),
    jobs = await Promise.all(f.members.map((m) => data(m.c.path))),
    at = adoptionBatchScope(admin, f.uid, f.request);
  await admin.doc('credits/author').create({ balance: 20 });
  await admin.doc('analysisReceipts/one').create({ existing: true });
  const compose = () =>
    admin.runTransaction(async (tx) => {
      const plan = await prepareBookLoreEditAdoptionBatch(
          tx,
          { db: admin, now: () => 2000 },
          f.uid,
          f.request,
        ),
        credit = await tx.get(admin.doc('credits/author'));
      plan.commit();
      tx.update(admin.doc('credits/author'), { balance: credit.data().balance - 3 });
      tx.create(admin.doc('analysisReceipts/one'), { batchId: f.request.batchId });
      return plan.result;
    });
  await assert.rejects(compose, (e) => e.code === 6);
  assert.deepEqual(await data('books/book'), before);
  assert.equal((await data('credits/author')).balance, 20);
  assert.equal((await at.record.get()).exists, false);
  assert.equal((await at.proof.get()).exists, false);
  for (const [i, m] of f.members.entries()) assert.deepEqual(await data(m.c.path), jobs[i]);
  const created = f.members[1];
  assert.equal((await admin.doc(created.source.seed.path).get()).exists, false);
  assert.equal((await created.parent.get()).phase, 'preparing');
  await admin.doc('analysisReceipts/one').delete();
  const success = await compose(),
    batch = await at.record.get(),
    credit = await admin.doc('credits/author').get(),
    receipt = await admin.doc('analysisReceipts/one').get();
  assert.equal(success.items.length, 2);
  assert.equal(credit.data().balance, 17);
  assert.equal(receipt.createTime.isEqual(batch.createTime), true);
  assert.equal(credit.updateTime.isEqual(batch.createTime), true);
  assert.deepEqual(await applyAdoptionBatch(f), success);
});
test('SDK one stale member or a recreated aggregate proof cannot commit or confirm a batch', async () => {
  const f = await adoptionBatchFixture(admin),
    stale = {
      ...f.request,
      requests: f.request.requests.map((r, i) =>
        i ? { ...r, expectedRevision: r.expectedRevision - 1 } : r,
      ),
    };
  await assert.rejects(() => applyAdoptionBatch(f, stale));
  assert.equal((await data('books/book')).localLoreVersion, 0);
  const a = await applyAdoptionBatch(f),
    at = adoptionBatchScope(admin, f.uid, f.request),
    original = (await at.record.get()).data(),
    proof = (await at.proof.get()).data();
  await admin.runTransaction(async (tx) => {
    tx.delete(at.record);
    tx.delete(at.proof);
  });
  await admin.runTransaction(async (tx) => {
    tx.create(at.record, original);
    tx.create(at.proof, proof);
  });
  await assert.rejects(() => applyAdoptionBatch(f));
  assert.equal((await data('books/book')).localLoreVersion, 1);
  assert.deepEqual((await adoptFixture(f.members[0])).receipt, a.items[0]);
});
test('SDK 50 payload edits adopt and retire native generations atomically with bounded metadata and no body writes', async () => {
  const f = await adoptionBatchFixture(admin, {
      members: Array.from({ length: 50 }, () => ({ mode: 'v1', registerOld: true })),
      concurrency: 5,
    }),
    writes = [];
  const result = await admin.runTransaction(async (tx) => {
      const proxy = new Proxy(tx, {
        get(target, key) {
          if (['create', 'set', 'update', 'delete'].includes(key))
            return (ref, ...args) => {
              writes.push(ref.path);
              return target[key](ref, ...args);
            };
          const value = target[key];
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
      const plan = await prepareBookLoreEditAdoptionBatch(
        proxy,
        { db: admin, now: () => 2000 },
        f.uid,
        f.request,
      );
      // Native SDK enforces all reads before writes, including this caller-owned read.
      await proxy.get(admin.doc('users/author'));
      return plan.commit();
    }),
    at = adoptionBatchScope(admin, f.uid, f.request),
    batch = await at.record.get(),
    root = await admin.doc('books/book').get();
  assert.equal(result.items.length, 50);
  assert.equal(root.data().localLoreVersion, 1);
  assert.equal(root.updateTime.isEqual(batch.createTime), true);
  assert.ok(writes.length > 500);
  assert.equal(writes.filter((p) => p === 'books/book').length, 1);
  assert.ok(writes.every((p) => !/bookResource(Chunks|Bodies|Leases)/.test(p)));
  for (const m of f.members) {
    const head = await admin.doc(m.source.seed.path).get(),
      receipt = await admin.doc(m.c.path + '/operations/' + m.adoptRequest.operationId).get(),
      old = await data(
        'books/book/bookLoreGenerations/' + m.source.seed.storage.generationId + '/state/current',
      );
    assert.equal(old.phase, 'retired');
    assert.equal(head.updateTime.isEqual(batch.createTime), true);
    assert.equal(receipt.createTime.isEqual(batch.createTime), true);
  }
  assert.deepEqual(await applyAdoptionBatch(f), result);
  const view = await createBookLoreReadService({ db: admin }).getBookLoreRead(f.uid, {
    bookId: f.bookId,
    id: f.members[49].loreId,
  });
  assert.equal(view.id, f.members[49].loreId);
});
