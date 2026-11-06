import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  readyEditorialHistory,
  finishEditorialSourceCleanup,
  historyInput,
  uid,
} from './helpers/bookEditorialHistoryFixture.mjs';
import { readyEditableEditorial } from './helpers/bookRestoreEditorialHeadsFixture.mjs';
import { editorialRecords, noteId } from './helpers/bookRestoreEditorialFixture.mjs';
import { BOOK_RESTORE_METHODS } from '../src/bookRestoreUploadContracts.mjs';
import { BOOK_RESTORE_EDITORIAL_PROOF_SEED } from '../src/bookRestoreEditorialBodyContracts.mjs';
import { digest } from '../src/sceneContracts.mjs';
import { createLiteraryPlanningService } from '../src/literaryPlanning.mjs';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const root = (f) => 'books/' + f.p.bookId;
const request = (f, id) => ({ bookId: f.p.bookId, id });
const large = () => editorialRecords({ note: '\ufeffPrivate 🌙\r\n"quoted" '.repeat(5000) });
async function document(f) {
  const page = await f.history().listBookEditorialHistory(uid, historyInput(f));
  return page.items.find((item) => item.artifact?.kind === 'document');
}
async function allBytes(f, id) {
  const source = await f.history().openVerifiedBookEditorialHistory(uid, request(f, id));
  const chunks = [];
  let proof = BOOK_RESTORE_EDITORIAL_PROOF_SEED;
  for (let index = 0; index < source.chunkCount; index++) {
    const part = await source.readPart(index);
    chunks.push(part.bytes);
    assert.equal(part.bytes.length <= 65536, true);
    assert.equal(part.contentHash, sha(part.bytes));
    await f.db.runTransaction((tx) => part.verify(tx));
    proof = digest({
      previous: proof,
      part: index,
      token: part.partToken,
      contentHash: part.contentHash,
    });
  }
  const bytes = Buffer.concat(chunks);
  assert.equal(bytes.length, source.byteLength);
  assert.equal(sha(bytes), source.contentHash);
  assert.equal(proof, source.partProofRoot);
  await f.db.runTransaction((tx) => source.verify(tx));
  return bytes;
}

test('history stays internal and a prepared rootless copy cannot grant current content access', async () => {
  for (const name of [
    'listBookEditorialHistory',
    'getBookEditorialHistory',
    'readBookEditorialHistoryPart',
    'openVerifiedBookEditorialHistory',
    'getBookEditorialRestoreReview',
  ])
    assert.equal(BOOK_RESTORE_METHODS.includes(name), false);
  const f = await readyEditableEditorial({ editorialActivation: true });
  await assert.rejects(() => f.factory().listBookEditorialHistory(uid, historyInput(f)));
});

test('history lists stable bounded metadata pages without archive prose', async () => {
  const f = await readyEditorialHistory(),
    ids = [];
  let after = null;
  do {
    const page = await f
      .history()
      .listBookEditorialHistory(uid, { ...historyInput(f), after, limit: 1 });
    assert.ok(page.items.length <= 1);
    assert.equal(JSON.stringify(page).includes('Own function'), false);
    ids.push(...page.items.map((item) => item.id));
    after = page.next;
  } while (after !== null);
  assert.equal(ids.length, 5);
  assert.equal(new Set(ids).size, 5);
  assert.deepEqual(ids, [...ids].sort());
  await assert.rejects(() =>
    f.history().listBookEditorialHistory(uid, { ...historyInput(f), limit: 51 }),
  );
});

test('parts preserve literal UTF-8 bytes with integral SHA and native part-chain proof', async () => {
  const f = await readyEditorialHistory({ records: large() }),
    item = await document(f);
  assert.ok(item.chunkCount > 1);
  const expected = Buffer.concat(
    f.sourceRecords.filter((row) => row.id === noteId).map((row) => Buffer.from(row.payload)),
  );
  assert.deepEqual(await allBytes(f, item.id), expected);
  const descriptor = await f.history().getBookEditorialHistory(uid, request(f, item.id));
  assert.match(descriptor.readToken, /^[a-f0-9]{64}$/);
  assert.equal(Object.hasOwn(descriptor, 'sourceToken'), false);
  assert.equal(Object.hasOwn(descriptor, 'sourceRecord'), false);
});

test('source archive cleanup removes journals and uploaded bytes but preserves readable native history', async () => {
  const f = await readyEditorialHistory({ records: large() }),
    item = await document(f);
  const before = await f.history().getBookEditorialHistory(uid, request(f, item.id));
  const expected = await allBytes(f, item.id);
  const result = await finishEditorialSourceCleanup(f);
  assert.equal(result.phase, 'done');
  for (const name of ['materializationArtifacts', 'chunks', 'validationItems', 'validationIndex'])
    assert.equal(
      [...f.records.keys()].some((path) => path.startsWith(f.root + '/' + name + '/')),
      false,
    );
  assert.equal(f.records.has(f.root + '/preparedEditorial/current'), true);
  assert.deepEqual(await f.history().getBookEditorialHistory(uid, request(f, item.id)), before);
  assert.deepEqual(await allBytes(f, item.id), expected);
});

test('source cleanup remains historical after deleting the root but cannot authorize a new history read', async () => {
  const f = await readyEditorialHistory();
  await f.db.runTransaction((tx) => tx.delete(f.db.doc(root(f))));
  assert.equal((await finishEditorialSourceCleanup(f)).phase, 'done');
  await assert.rejects(() => f.history().listBookEditorialHistory(uid, historyInput(f)));
});

test('current account and closed inputs are checked before history is returned', async () => {
  const f = await readyEditorialHistory(),
    item = await document(f);
  const before = structuredClone([...f.records]);
  for (const actor of ['other', null]) {
    await assert.rejects(() => f.history().listBookEditorialHistory(actor, historyInput(f)));
    await assert.rejects(() => f.history().getBookEditorialHistory(actor, request(f, item.id)));
  }
  for (const patch of [
    { bookId: '../other' },
    { sourceToken: 'a'.repeat(64) },
    { limit: 0 },
    { after: 'forged' },
  ])
    await assert.rejects(() =>
      f.history().listBookEditorialHistory(uid, { ...historyInput(f), ...patch }),
    );
  assert.deepEqual([...f.records], before);
});

for (const kind of ['root', 'job', 'control', 'seal'])
  test('a recreated equal ' + kind + ' cannot inherit the active history origin', async () => {
    const f = await readyEditorialHistory(),
      item = await document(f);
    const path =
      kind === 'root'
        ? root(f)
        : kind === 'job'
          ? f.root
          : kind === 'control'
            ? f.root + '/preparedEditorial/current'
            : 'users/' +
              uid +
              '/bookRestoreOperations/' +
              f.records.get(f.root + '/preparedEditorial/current').census.sealOperationId;
    const value = structuredClone(f.records.get(path));
    await f.db.runTransaction((tx) => tx.delete(f.db.doc(path)));
    await f.db.runTransaction((tx) => tx.create(f.db.doc(path), value));
    await assert.rejects(() => f.history().getBookEditorialHistory(uid, request(f, item.id)));
  });

for (const collection of ['literaryArchive', 'literaryArchiveBodies', 'literaryArchiveParts'])
  test(
    'a recreated equal ' + collection + ' resource cannot inherit old bytes or their native proof',
    async () => {
      const f = await readyEditorialHistory(),
        item = await document(f);
      const descriptor = await f.history().getBookEditorialHistory(uid, request(f, item.id));
      const path =
        root(f) +
        '/' +
        collection +
        '/' +
        item.id +
        (collection === 'literaryArchiveParts' ? ':000000000000000' : '');
      const value = structuredClone(f.records.get(path));
      await f.db.runTransaction((tx) => tx.delete(f.db.doc(path)));
      await f.db.runTransaction((tx) => tx.create(f.db.doc(path), value));
      await assert.rejects(() =>
        f.history().readBookEditorialHistoryPart(uid, {
          ...request(f, item.id),
          readToken: descriptor.readToken,
          index: 0,
        }),
      );
    },
  );

test('tampering with a part and recomputing its hash cannot pass the native immutable cutoff', async () => {
  const f = await readyEditorialHistory(),
    item = await document(f);
  const descriptor = await f.history().getBookEditorialHistory(uid, request(f, item.id));
  const path = root(f) + '/literaryArchiveParts/' + item.id + ':000000000000000';
  const part = structuredClone(f.records.get(path)),
    bytes = Buffer.from(part.bytesBase64, 'base64');
  bytes[0] ^= 1;
  part.bytesBase64 = bytes.toString('base64');
  part.contentHash = sha(bytes);
  await f.db.runTransaction((tx) => tx.set(f.db.doc(path), part));
  await assert.rejects(() =>
    f.history().readBookEditorialHistoryPart(uid, {
      ...request(f, item.id),
      readToken: descriptor.readToken,
      index: 0,
    }),
  );
});

test('a held part loses consumption authority on current owner loss without writing the consumer', async () => {
  const f = await readyEditorialHistory(),
    item = await document(f);
  const source = await f.history().openVerifiedBookEditorialHistory(uid, request(f, item.id));
  const part = await source.readPart(0);
  await f.db.runTransaction((tx) => tx.update(f.db.doc(root(f)), { authorId: 'other' }));
  await assert.rejects(() => source.readPart(0));
  await assert.rejects(() =>
    f.db.runTransaction(async (tx) => {
      await part.verify(tx);
      tx.create(f.db.doc('users/' + uid + '/consumer/forbidden'), { accepted: true });
    }),
  );
  assert.equal(f.records.has('users/' + uid + '/consumer/forbidden'), false);
});

test('deleting the book revokes both held sources and their part proofs', async () => {
  const f = await readyEditorialHistory(),
    item = await document(f);
  const source = await f.history().openVerifiedBookEditorialHistory(uid, request(f, item.id));
  const part = await source.readPart(0);
  await f.db.runTransaction((tx) => tx.update(f.db.doc(root(f)), { deleting: true }));
  await assert.rejects(() => f.db.runTransaction((tx) => source.verify(tx)));
  await assert.rejects(() => f.db.runTransaction((tx) => part.verify(tx)));
});

test('normal editorial edits preserve raw history tokens but invalidate the original pending-plan basis', async () => {
  const f = await readyEditorialHistory(),
    item = await document(f);
  const descriptor = await f.history().getBookEditorialHistory(uid, request(f, item.id));
  const [path, saved] = [...f.records].find(([path]) =>
    path.startsWith(root(f) + '/literaryPlans/'),
  );
  const id = path.split('/').at(-1),
    before = await f.history().getBookEditorialRestoreReview(uid, request(f, id));
  assert.equal(before.state, 'unchanged');
  assert.equal(before.canUseOriginalDraft, true);
  assert.equal(before.pendingReferences.length, 1);
  assert.equal(Object.hasOwn(before.pendingReferences[0], 'sourceToken'), false);
  await createLiteraryPlanningService({ db: f.db, now: () => 6000 }).saveLiteraryPlan(uid, {
    target: { kind: 'book', id: f.p.bookId },
    id,
    operationId: 'edit-before-restore-review',
    expectedRevision: 1,
    plan: { ...saved.plan, title: 'Own newer plan' },
  });
  const after = await f.history().getBookEditorialRestoreReview(uid, request(f, id));
  assert.equal(after.state, 'changed');
  assert.equal(after.canUseOriginalDraft, false);
  assert.notEqual(after.reviewToken, before.reviewToken);
  assert.deepEqual(after.pendingReferences, before.pendingReferences);
  assert.deepEqual(await f.history().getBookEditorialHistory(uid, request(f, item.id)), descriptor);
});

test('missing or recreated equal current heads cannot reclaim the original pending draft', async () => {
  const f = await readyEditorialHistory(),
    path = root(f) + '/literaryProduction/current';
  const saved = structuredClone(f.records.get(path));
  const before = await f.history().getBookEditorialRestoreReview(uid, request(f, 'contract'));
  assert.equal(before.state, 'unchanged');
  await f.db.runTransaction((tx) => tx.delete(f.db.doc(path)));
  assert.equal(
    (await f.history().getBookEditorialRestoreReview(uid, request(f, 'contract'))).state,
    'missing',
  );
  await f.db.runTransaction((tx) => tx.create(f.db.doc(path), saved));
  const after = await f.history().getBookEditorialRestoreReview(uid, request(f, 'contract'));
  assert.equal(after.state, 'changed');
  assert.notEqual(after.reviewToken, before.reviewToken);
});

test('history cursors cannot cross native book origins even in the same account', async () => {
  const one = await readyEditorialHistory(),
    two = await readyEditorialHistory({ db: one.db, id: 'editorial-history-second' });
  const page = await one
    .history()
    .listBookEditorialHistory(uid, { ...historyInput(one), limit: 1 });
  await assert.rejects(() =>
    one.history().listBookEditorialHistory(uid, { ...historyInput(two), after: page.next }),
  );
});

test('part bounds and read tokens are exact and cannot address another item', async () => {
  const f = await readyEditorialHistory(),
    item = await document(f);
  const descriptor = await f.history().getBookEditorialHistory(uid, request(f, item.id));
  for (const index of [-1, item.chunkCount, Number.MAX_SAFE_INTEGER + 1])
    await assert.rejects(() =>
      f.history().readBookEditorialHistoryPart(uid, {
        ...request(f, item.id),
        readToken: descriptor.readToken,
        index,
      }),
    );
  await assert.rejects(() =>
    f.history().readBookEditorialHistoryPart(uid, {
      ...request(f, item.id),
      readToken: 'a'.repeat(64),
      index: 0,
    }),
  );
});

test('recreating the original first version cannot preserve the pending-review basis', async () => {
  const f = await readyEditorialHistory(),
    path = root(f) + '/literaryContractVersions/1';
  await f.history().getBookEditorialRestoreReview(uid, request(f, 'contract'));
  const value = structuredClone(f.records.get(path));
  await f.db.runTransaction((tx) => tx.delete(f.db.doc(path)));
  await f.db.runTransaction((tx) => tx.create(f.db.doc(path), value));
  await assert.rejects(() =>
    f.history().getBookEditorialRestoreReview(uid, request(f, 'contract')),
  );
});

test('source cleanup refuses a replaced metadata witness before removing any remaining source resources', async () => {
  const f = await readyEditorialHistory();
  await f.factory().finalizeBookRestoreMedia(uid, {
    restoreId: f.id,
    jobToken: f.p.jobToken,
    operationId: 'history-witness-media-none',
  });
  const progress = (
    await f.factory().getBookRestoreArchiveCleanup(uid, { restoreId: f.id, jobToken: f.p.jobToken })
  ).progress;
  const path = f.root + '/preparedEditorial/current',
    value = structuredClone(f.records.get(path));
  await f.db.runTransaction((tx) => tx.delete(f.db.doc(path)));
  await f.db.runTransaction((tx) => tx.create(f.db.doc(path), value));
  const before = structuredClone([...f.records]);
  await assert.rejects(() =>
    f.factory().advanceBookRestoreArchiveCleanup(uid, {
      restoreId: f.id,
      jobToken: f.p.jobToken,
      operationId: 'history-witness-cleanup-refused',
      expectedRevision: progress.revision,
    }),
  );
  assert.deepEqual([...f.records], before);
});
