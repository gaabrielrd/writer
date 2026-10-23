import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createBookRestoreUploadService } from '../src/bookRestoreUpload.mjs';
import { readBookResourcePayload } from '../src/bookResourcePayloadRead.mjs';
import { lorePayloadSegmentId } from '../src/bookRestoreLorePayload.mjs';
import { jobShape } from '../src/bookRestoreUploadContracts.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import {
  readyLegacyPrefix,
  prefixEntity,
  prefixData,
  prefixRecords,
  writeLegacyPrefixPage,
  mutation,
} from './helpers/bookRestoreLorePrefixFixture.mjs';
import { finishLargeLore } from './helpers/bookRestoreLorePayloadFixture.mjs';
import { cleanupLegacyRestore } from './helpers/bookLegacyRestoreFixture.mjs';
import {
  readyRestoreSourceIndexes,
  finishRestoreSourceIndexes,
} from './helpers/bookRestoreSourceIndexesFixture.mjs';
const uid = 'author',
  id = 'lore-prefix-job001',
  root = 'users/' + uid + '/bookRestores/' + id;
const sha = (v) => createHash('sha256').update(v).digest('hex');
function setup() {
  const f = adventureImportDb({ nativeUpdates: true }),
    factory = () => createBookRestoreUploadService({ db: f.db, now: () => 1000 });
  return { ...f, factory, api: factory() };
}
for (const [count, pages, prior] of [
  [65, 1, false],
  [128, 1, false],
  [130, 2, false],
  [200, 2, true],
])
  test('migrate prefix ' + pages * 64 + ' of ' + count + ' relations; prior=' + prior, async () => {
    const f = setup(),
      data = prefixData({ count, descriptionBytes: 0, details: '\ufeff' + 'x'.repeat(600000) }),
      old = await readyLegacyPrefix(f.factory, f.db, uid, id, { data, pages, prior }),
      initial = old.progress,
      path = 'books/' + initial.bookId + '/lore/' + prefixEntity(initial),
      original = structuredClone(f.records.get(path)),
      birth = structuredClone(f.metadata.get(path)),
      baseline = initial.preparation.loreRelationCount - pages * 64,
      first = (
        await f.api.advanceBookRestoreLore(uid, mutation(id, initial, 'prefix-migrate-first01'))
      ).progress;
    assert.equal(first.preparation.relationOffset, 0);
    assert.equal(first.preparation.loreRelationCount, initial.preparation.loreRelationCount);
    assert.equal(first.preparation.lorePayload.legacy.relations, pages * 64);
    assert.equal(sha(JSON.stringify(f.records.get(path))), sha(JSON.stringify(original)));
    assert.equal(f.metadata.get(path).updatedAtNanoseconds, birth.updatedAtNanoseconds);
    for (const r of old.receipts) {
      const replay = await f.factory().advanceBookRestoreLore(uid, r.request);
      assert.deepEqual(replay.receipt, r.receipt);
    }
    const done = await finishLargeLore(f.factory, uid, id, first),
      storage = f.records.get(path).payloadStorage;
    assert.equal(done.preparation.loreRelationCount, baseline + count);
    assert.equal(done.preparation.loreCount, 3);
    assert.equal(f.metadata.get(path).createdAtNanoseconds, birth.createdAtNanoseconds);
    const values = [];
    for (let offset = 0; offset < count; offset += 64) {
      const segment = f.records.get(
        'books/' +
          done.bookId +
          '/bookLoreSegments/' +
          lorePayloadSegmentId(storage.generationId, offset),
      );
      values.push(
        ...(await f.db.runTransaction(async (tx) =>
          readBookResourcePayload(tx, f.db, {
            uid,
            bookId: done.bookId,
            resource: { kind: 'lore', parentId: null, id: prefixEntity(done) },
            ...segment.payload,
          }),
        )),
      );
    }
    assert.equal(values.length, count);
    assert.equal(values[0].targetEntityId, prefixEntity(done));
    assert.equal(values[1].targetEntityId, 'universe:gone:external');
    for (const r of old.receipts)
      assert.deepEqual((await f.api.advanceBookRestoreLore(uid, r.request)).receipt, r.receipt);
    const journal = f.records.get(
      root + '/materializationArtifacts/' + sha(JSON.stringify(['lore', prefixEntity(done)])),
    );
    assert.equal(journal.createdByOperationId, old.receipts[0].request.operationId);
    assert.notEqual(journal.lastOperationId, journal.createdByOperationId);
    assert.equal(f.records.has('books/' + done.bookId), false);
    const cancelled = await cleanupLegacyRestore(f.api, uid, id, done, { limit: 3 });
    assert.equal(cancelled.preparation.cleanedArtifacts, cancelled.preparation.artifactCount);
    for (const r of old.receipts)
      assert.deepEqual((await f.api.advanceBookRestoreLore(uid, r.request)).receipt, r.receipt);
  });
test('true over-document relation set migrates a genuine 128-entry prefix and retains exact counters', async () => {
  const f = setup(),
    old = await readyLegacyPrefix(f.factory, f.db, uid, id, { pages: 2 }),
    p = old.progress,
    done = await finishLargeLore(f.factory, uid, id, p);
  assert.equal(done.preparation.loreRelationCount, 200);
  assert.equal(done.preparation.lorePayload, null);
  assert.equal(
    f.records.get('books/' + p.bookId + '/lore/' + prefixEntity(p)).payloadStorage.relations.count,
    200,
  );
});

test('all migration steps keep the prefix untouched, totals monotonic and old receipts resolvable after reload', async () => {
  const f = setup(),
    old = await readyLegacyPrefix(f.factory, f.db, uid, id, {
      pages: 2,
      data: prefixData({ count: 130, descriptionBytes: 0, details: 'x'.repeat(600000) }),
      prior: true,
    });
  let p = old.progress,
    unit = 0;
  const path = 'books/' + p.bookId + '/lore/' + prefixEntity(p),
    before = sha(JSON.stringify(f.records.get(path))),
    native = structuredClone(f.metadata.get(path)),
    floor = p.preparation.loreRelationCount;
  while (p.preparation.phase !== 'scenes') {
    const previous = p;
    p = (
      await f.factory().advanceBookRestoreLore(uid, mutation(id, p, 'prefix-monotonic-' + unit++))
    ).progress;
    assert.ok(p.preparation.loreRelationCount >= previous.preparation.loreRelationCount);
    assert.ok(p.preparation.loreRelationCount >= floor);
    assert.ok(p.preparation.artifactCount >= previous.preparation.artifactCount);
    if (p.preparation.lorePayload) {
      assert.equal(sha(JSON.stringify(f.records.get(path))), before);
      assert.equal(f.metadata.get(path).updatedAtNanoseconds, native.updatedAtNanoseconds);
    }
    for (const r of old.receipts)
      assert.deepEqual(
        (await f.factory().advanceBookRestoreLore(uid, r.request)).receipt,
        r.receipt,
      );
    assert.ok(unit < 1000);
  }
  assert.equal(p.preparation.loreRelationCount, 132);
});
for (const target of ['lore', 'journal', 'first-receipt', 'last-receipt'])
  test(
    'recreated ' + target + ' is rejected before migration and preserved by cleanup',
    async () => {
      const f = setup(),
        old = await readyLegacyPrefix(f.factory, f.db, uid, id, {
          pages: 2,
          data: prefixData({ count: 130, descriptionBytes: 0, details: 'x'.repeat(600000) }),
        }),
        p = old.progress,
        path =
          target === 'lore'
            ? 'books/' + p.bookId + '/lore/' + prefixEntity(p)
            : target === 'journal'
              ? root + '/materializationArtifacts/' + sha(JSON.stringify(['lore', prefixEntity(p)]))
              : 'users/' +
                uid +
                '/bookRestoreOperations/' +
                old.receipts[target === 'first-receipt' ? 0 : 1].request.operationId,
        value = structuredClone(f.records.get(path));
      await f.db.runTransaction(async (tx) => {
        tx.delete(f.db.doc(path));
      });
      await f.db.runTransaction(async (tx) => {
        tx.create(f.db.doc(path), value);
      });
      const stamp = structuredClone(f.metadata.get(path));
      await assert.rejects(() =>
        f.api.advanceBookRestoreLore(uid, mutation(id, p, 'prefix-foreign-start01')),
      );
      assert.equal(f.records.get(root).checkpoint, p.checkpoint);
      assert.equal(f.records.get(root).payloadInventoryVersion, undefined);
      await assert.rejects(() => cleanupLegacyRestore(f.api, uid, id, p, { limit: 3 }));
      assert.equal(f.metadata.get(path).createdAtNanoseconds, stamp.createdAtNanoseconds);
    },
  );
test('a prefix recreated during migration prevents additional writes and remains intact on cancellation', async () => {
  const f = setup(),
    old = await readyLegacyPrefix(f.factory, f.db, uid, id, {
      data: prefixData({ count: 130, descriptionBytes: 0, details: 'x'.repeat(600000) }),
    }),
    first = (
      await f.api.advanceBookRestoreLore(uid, mutation(id, old.progress, 'prefix-live-first01'))
    ).progress,
    path = 'books/' + first.bookId + '/lore/' + prefixEntity(first),
    value = structuredClone(f.records.get(path));
  await f.db.runTransaction(async (tx) => {
    tx.delete(f.db.doc(path));
  });
  await f.db.runTransaction(async (tx) => {
    tx.create(f.db.doc(path), value);
  });
  const stamp = structuredClone(f.metadata.get(path));
  await assert.rejects(() =>
    f.factory().advanceBookRestoreLore(uid, mutation(id, first, 'prefix-live-refuse01')),
  );
  assert.equal(f.records.get(root).checkpoint, first.checkpoint);
  await assert.rejects(() => cleanupLegacyRestore(f.api, uid, id, first, { limit: 2 }));
  assert.equal(f.metadata.get(path).createdAtNanoseconds, stamp.createdAtNanoseconds);
  assert.equal(sha(JSON.stringify(f.records.get(path))), sha(JSON.stringify(value)));
});
test('progress cannot reduce the counted prefix or invent a larger starting total', async () => {
  const f = setup(),
    old = await readyLegacyPrefix(f.factory, f.db, uid, id, {
      pages: 2,
      data: prefixData({ count: 130, descriptionBytes: 0, details: 'x'.repeat(600000) }),
    }),
    first = (
      await f.api.advanceBookRestoreLore(uid, mutation(id, old.progress, 'prefix-count-first01'))
    ).progress,
    saved = structuredClone(f.records.get(root));
  for (const [name, change] of [
    [
      'shorten',
      (j) => {
        j.preparation.lorePayload.legacy.relations = 64;
      },
    ],
    [
      'increase',
      (j) => {
        j.preparation.lorePayload.legacy.counted += 64;
        j.preparation.loreRelationCount += 64;
      },
    ],
    [
      'receipt',
      (j) => {
        j.preparation.lorePayload.legacy.operationId = old.receipts[0].request.operationId;
      },
    ],
  ]) {
    const bad = structuredClone(saved);
    change(bad);
    f.records.set(root, bad);
    await assert.rejects(() =>
      f.api.advanceBookRestoreLore(uid, mutation(id, first, 'prefix-counter-' + name)),
    );
    assert.equal(f.records.get(root).checkpoint, first.checkpoint);
  }
  f.records.set(root, saved);
  for (const change of [
    (j) => {
      j.preparation.lorePayload.legacy.relations = 1;
    },
    (j) => {
      j.preparation.lorePayload.legacy.counted = 0;
    },
    (j) => {
      j.preparation.lorePayload.legacy.extra = true;
    },
    (j) => {
      j.preparation.lorePayload.legacy.birth.seconds = -1;
    },
    (j) => {
      j.preparation.lorePayload.legacy.valueHash = 'wrong';
    },
  ]) {
    const bad = structuredClone(saved);
    change(bad);
    assert.throws(() => jobShape(uid, id, bad));
  }
});
for (const stage of ['before', 'parts', 'header', 'relations', 'ready'])
  test(
    'cancellation at ' + stage + ' accounts for the old lore and every new artifact exactly once',
    async () => {
      const f = setup(),
        old = await readyLegacyPrefix(f.factory, f.db, uid, id, {
          pages: 2,
          data: prefixData({ count: 130, descriptionBytes: 0, details: 'x'.repeat(600000) }),
        });
      let p = old.progress,
        unit = 0;
      const reached = () =>
        stage === 'before' ||
        (stage === 'parts' && p.preparation.lorePayload?.segment?.nextPart > 0) ||
        (stage === 'header' && p.preparation.lorePayload?.segment?.sealed) ||
        (stage === 'relations' && p.preparation.lorePayload?.pages > 0) ||
        (stage === 'ready' &&
          p.preparation.lorePayload?.pages === 3 &&
          p.preparation.lorePayload.segment === null);
      while (!reached()) {
        p = (
          await f
            .factory()
            .advanceBookRestoreLore(uid, mutation(id, p, 'prefix-cancel-prepare-' + unit++))
        ).progress;
        assert.ok(unit < 1000);
      }
      const done = await cleanupLegacyRestore(f.api, uid, id, p, { limit: 2 });
      assert.equal(done.preparation.cleanedArtifacts, done.preparation.artifactCount);
      assert.equal(
        [...f.records.keys()].some((k) => k.startsWith('books/' + p.bookId + '/')),
        false,
      );
      for (const r of old.receipts)
        assert.deepEqual((await f.api.advanceBookRestoreLore(uid, r.request)).receipt, r.receipt);
    },
  );
test('competing migration operations and callback retry retain the original prefix and count it once', async () => {
  const f = setup(),
    old = await readyLegacyPrefix(f.factory, f.db, uid, id, {
      data: prefixData({ count: 130, descriptionBytes: 0, details: 'x'.repeat(600000) }),
    }),
    p = old.progress,
    run = f.db.runTransaction.bind(f.db),
    failure = new Error('retry'),
    request = mutation(id, p, 'prefix-retry-first01');
  let inject = true,
    retries = 0;
  f.db.runTransaction = async (operation) => {
    try {
      return await run(async (tx) =>
        operation({
          ...tx,
          create(ref, value) {
            if (inject && ref.path.includes('/bookResourceChunks/')) throw failure;
            return tx.create(ref, value);
          },
        }),
      );
    } catch (error) {
      if (error !== failure) throw error;
      inject = false;
      retries++;
      return run(operation);
    }
  };
  const first = await f.api.advanceBookRestoreLore(uid, request);
  assert.equal(retries, 1);
  assert.equal(first.progress.preparation.loreRelationCount, p.preparation.loreRelationCount);
  assert.deepEqual(await f.factory().advanceBookRestoreLore(uid, request), first);
  await assert.rejects(() =>
    f.api.advanceBookRestoreLore(uid, mutation(id, p, 'prefix-competing-second01')),
  );
  assert.equal(f.records.get(root).checkpoint, p.checkpoint + 1);
  assert.equal(
    f.records.get('books/' + p.bookId + '/lore/' + prefixEntity(p)).relations.length,
    64,
  );
});

test('failure after staging a new chunk rolls back capability, receipt and cursor without changing the old prefix', async () => {
  const f = setup(),
    old = await readyLegacyPrefix(f.factory, f.db, uid, id, {
      data: prefixData({ count: 130, descriptionBytes: 0, details: 'x'.repeat(600000) }),
    }),
    p = old.progress,
    run = f.db.runTransaction.bind(f.db),
    request = mutation(id, p, 'prefix-atomic-start01'),
    path = 'books/' + p.bookId + '/lore/' + prefixEntity(p),
    prefix = sha(JSON.stringify(f.records.get(path)));
  f.db.runTransaction = (operation) =>
    run(async (tx) =>
      operation({
        ...tx,
        create(ref, value) {
          if (ref.path.includes('/materializationArtifacts/'))
            throw new Error('Injected after target staging');
          return tx.create(ref, value);
        },
      }),
    );
  await assert.rejects(() => f.api.advanceBookRestoreLore(uid, request));
  assert.equal(f.records.get(root).checkpoint, p.checkpoint);
  assert.equal(f.records.get(root).payloadInventoryVersion, undefined);
  assert.equal(
    f.records.has('users/' + uid + '/bookRestoreOperations/' + request.operationId),
    false,
  );
  assert.equal(
    [...f.records.keys()].some((k) => k.includes('/bookResourceChunks/')),
    false,
  );
  assert.equal(sha(JSON.stringify(f.records.get(path))), prefix);
  f.db.runTransaction = run;
  assert.equal(
    (await f.api.advanceBookRestoreLore(uid, request)).progress.checkpoint,
    p.checkpoint + 1,
  );
});
test('failure after staging the final replacement preserves the original prefix until the same request commits', async () => {
  const f = setup(),
    old = await readyLegacyPrefix(f.factory, f.db, uid, id, {
      pages: 2,
      data: prefixData({ count: 130, descriptionBytes: 0, details: 'x'.repeat(600000) }),
    });
  let p = old.progress,
    unit = 0;
  while (!(p.preparation.lorePayload?.pages === 3 && p.preparation.lorePayload.segment === null)) {
    p = (
      await f
        .factory()
        .advanceBookRestoreLore(uid, mutation(id, p, 'prefix-final-prepare-' + unit++))
    ).progress;
    assert.ok(unit < 1000);
  }
  const path = 'books/' + p.bookId + '/lore/' + prefixEntity(p),
    prefix = sha(JSON.stringify(f.records.get(path))),
    native = structuredClone(f.metadata.get(path)),
    run = f.db.runTransaction.bind(f.db),
    journal = root + '/materializationArtifacts/' + sha(JSON.stringify(['lore', prefixEntity(p)])),
    request = mutation(id, p, 'prefix-atomic-final01');
  f.db.runTransaction = (operation) =>
    run(async (tx) =>
      operation({
        ...tx,
        set(ref, value) {
          if (ref.path === journal) throw new Error('Injected after prefix replacement staging');
          return tx.set(ref, value);
        },
      }),
    );
  await assert.rejects(() => f.api.advanceBookRestoreLore(uid, request));
  assert.equal(sha(JSON.stringify(f.records.get(path))), prefix);
  assert.equal(f.metadata.get(path).updatedAtNanoseconds, native.updatedAtNanoseconds);
  assert.equal(f.records.get(root).checkpoint, p.checkpoint);
  assert.equal(
    f.records.has('users/' + uid + '/bookRestoreOperations/' + request.operationId),
    false,
  );
  f.db.runTransaction = run;
  const result = await f.api.advanceBookRestoreLore(uid, request);
  assert.equal(result.progress.preparation.lorePayload, null);
  assert.equal(f.records.get(path).payloadStorage.relations.count, 130);
  assert.equal(f.metadata.get(path).createdAtNanoseconds, native.createdAtNanoseconds);
});
test('two genuinely concurrent migrations commit one batch and preserve the counted prefix', async () => {
  const f = setup(),
    old = await readyLegacyPrefix(f.factory, f.db, uid, id, {
      data: prefixData({ count: 130, descriptionBytes: 0, details: 'x'.repeat(600000) }),
    }),
    p = old.progress,
    results = await Promise.allSettled([
      f.api.advanceBookRestoreLore(uid, mutation(id, p, 'prefix-parallel-one01')),
      f.factory().advanceBookRestoreLore(uid, mutation(id, p, 'prefix-parallel-two01')),
    ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(f.records.get(root).checkpoint, p.checkpoint + 1);
  assert.equal(f.records.get(root).preparation.loreRelationCount, p.preparation.loreRelationCount);
  assert.equal(
    f.records.get('books/' + p.bookId + '/lore/' + prefixEntity(p)).relations.length,
    64,
  );
});

test('an invalid legacy cursor or total is rejected against the original receipt before enabling payload inventory', async () => {
  const f = setup(),
    old = await readyLegacyPrefix(f.factory, f.db, uid, id, {
      pages: 2,
      data: prefixData({ count: 130, descriptionBytes: 0, details: 'x'.repeat(600000) }),
    }),
    p = old.progress,
    saved = structuredClone(f.records.get(root)),
    path = 'books/' + p.bookId + '/lore/' + prefixEntity(p),
    original = sha(JSON.stringify(f.records.get(path)));
  for (const change of [
    (j) => {
      j.preparation.loreRelationCount += 64;
    },
    (j) => {
      j.preparation.relationOffset = 64;
    },
  ]) {
    const bad = structuredClone(saved);
    change(bad);
    f.records.set(root, bad);
    await assert.rejects(() =>
      f.api.advanceBookRestoreLore(uid, mutation(id, p, 'prefix-invalid-initial01')),
    );
    assert.equal(f.records.get(root).checkpoint, p.checkpoint);
    assert.equal(f.records.get(root).payloadInventoryVersion, undefined);
    assert.equal(sha(JSON.stringify(f.records.get(path))), original);
  }
  f.records.set(root, saved);
});
test('a migrated prefix traverses all remaining preparation phases and v14 cancellation with its old receipt intact', async () => {
  const f = setup();
  let old;
  const factory = () =>
    new Proxy(f.factory(), {
      get(target, key) {
        if (key === 'advanceBookRestoreLore')
          return async (actor, input) => {
            if (!old) {
              const p = await target.getBookRestore(actor, { restoreId: id });
              assert.equal(input.expectedCheckpoint, p.checkpoint);
              old = await writeLegacyPrefixPage(f.db, uid, id, p, input.operationId);
              return old;
            }
            return target.advanceBookRestoreLore(actor, input);
          };
        const value = target[key];
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  const p11 = await readyRestoreSourceIndexes(
      factory,
      uid,
      id,
      prefixRecords(prefixData({ count: 130, descriptionBytes: 0, details: 'x'.repeat(600000) })),
    ),
    p = await finishRestoreSourceIndexes(factory, uid, id, p11);
  assert.equal(p.preparation.schemaVersion, 12);
  assert.equal(f.records.get(root).cleanupVersion, 14);
  assert.equal(p.preparation.lorePayload, null);
  assert.equal(p.preparation.loreRelationCount, 130);
  assert.equal(f.records.get(root).payloadInventoryVersion, 1);
  assert.deepEqual(
    (await f.factory().advanceBookRestoreLore(uid, old.request)).receipt,
    old.receipt,
  );
  const done = await cleanupLegacyRestore(f.api, uid, id, p, { limit: 3 });
  assert.equal(done.preparation.cleanedArtifacts, done.preparation.artifactCount);
  assert.deepEqual(
    (await f.factory().advanceBookRestoreLore(uid, old.request)).receipt,
    old.receipt,
  );
  assert.equal(
    [...f.records.keys()].some((k) => k.startsWith('books/' + p.bookId + '/')),
    false,
  );
});
