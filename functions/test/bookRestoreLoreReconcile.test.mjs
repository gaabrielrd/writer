import test from 'node:test';
import assert from 'node:assert/strict';
import { ready, finish, logical, uid, id } from './helpers/bookRestoreLoreStreamFixture.mjs';
import { indexedLoreData } from './helpers/bookLoreContentFixture.mjs';
import { finishRestoreResources } from './helpers/bookRestoreResourcesFixture.mjs';
import { finishRestoreCounts } from './helpers/bookRestoreCountsFixture.mjs';
import {
  legacyMutation as mutation,
  cleanupLegacyRestore,
} from './helpers/bookLegacyRestoreFixture.mjs';
import { lorePayloadSegmentId } from '../src/bookRestoreLorePayloadContracts.mjs';
import { digest } from '../src/sceneContracts.mjs';
const root = 'users/' + uid + '/bookRestores/' + id;
async function start(data = indexedLoreData({ count: 65 })) {
  if (Buffer.byteLength(JSON.stringify(data)) < 524288) data.details = 'x'.repeat(530000);
  const f = await ready(data),
    p = await finishRestoreResources(f.factory, uid, id, await finish(f));
  return { ...f, p };
}
async function pending(f) {
  let p = f.p,
    request,
    result;
  for (let step = 0; step < 100; step++) {
    request = mutation(id, p, id + '-start-count-' + step);
    result = await f.factory().advanceBookRestoreCounts(uid, request);
    p = result.progress;
    const control = [...f.records].find(([, v]) => v.stageKind === 'restore-lore-reconcile');
    if (control) return { p, control, request, result };
  }
  throw Error('No reconciliation');
}
test('Counts reconciles large fields and huge native relation pages without integral reads or an activated root', async () => {
  const data = indexedLoreData({ count: 130 });
  data.details = '\ufeff' + 'field 🌙'.repeat(1000000);
  data.relations[63].description = '\ufeff' + 'description 🌙'.repeat(700000);
  delete data.createdAt;
  delete data.updatedAt;
  const f = await start(data),
    batches = [],
    run = f.db.runTransaction.bind(f.db);
  f.db.runTransaction = (fn) =>
    run(async (tx) => {
      const parts = new Set();
      const answer = await fn({
        ...tx,
        get(ref) {
          if (ref.path?.includes('/bookResourceChunks/')) parts.add(ref.path);
          return tx.get(ref);
        },
      });
      batches.push(parts.size);
      return answer;
    });
  const p = await finishRestoreCounts(f.factory, uid, id, f.p);
  // The private complete-read oracle is outside the production reconciliation budget.
  f.db.runTransaction = run;
  const result = await logical(f, p),
    expected = structuredClone(data);
  for (let i = 0; i < data.relations.length; i++)
    expected.relations[i] = await f.mapper.mapLoreRelation(data.relations[i], async () => false);
  assert.deepEqual(result.data, expected);
  assert.equal(p.preparation.phase, 'personas');
  assert.equal(p.preparation.counts.step, 'done');
  assert.equal(f.records.has('books/' + p.bookId), false);
  assert.ok(Math.max(...batches) <= 3);
  assert.ok(batches.filter((n) => n > 0).length > 256);
  const controls = [...f.records.values()].filter((v) => v.stageKind === 'restore-lore-reconcile');
  assert.equal(controls.length, 1);
  assert.equal(controls[0].phase, 'done');
  assert.ok(Buffer.byteLength(JSON.stringify(controls[0])) <= 24576);
});
test('Counts replay during reconciliation preserves the checkpoint, counters and native artifacts', async () => {
  const f = await start(),
    s = await pending(f),
    before = structuredClone([...f.records]);
  assert.deepEqual(await f.factory().advanceBookRestoreCounts(uid, s.request), s.result);
  assert.deepEqual([...f.records], before);
  const p = await finishRestoreCounts(f.factory, uid, id, s.p);
  assert.equal(p.preparation.phase, 'personas');
});
test('production cancellation during reconciliation drains the new control and all enrolled resources', async () => {
  const f = await start(),
    s = await pending(f),
    done = await cleanupLegacyRestore(f.factory(), uid, id, s.p, {
      limit: 3,
      prefix: id + '-reconcile-clean-',
    });
  assert.equal(done.state, 'cancelled');
  assert.equal(
    [...f.records.keys()].some((path) => path.startsWith('books/' + s.p.bookId + '/')),
    false,
  );
});
for (const target of ['control', 'head', 'part', 'segment', 'journal', 'receipt'])
  test('Counts refuses and preserves recreated reconciliation dependency ' + target, async () => {
    const f = await start(),
      s = await pending(f),
      headPath = 'books/' + s.p.bookId + '/lore/' + f.mapper.identity('lore', 'entity'),
      head = f.records.get(headPath),
      bodyId = head.payloadStorage.fields.category.manifest.bodyId;
    let path;
    if (target === 'control') path = s.control[0];
    else if (target === 'head') path = headPath;
    else if (target === 'part')
      path = 'books/' + s.p.bookId + '/bookResourceChunks/' + bodyId + ':000000000000000';
    else if (target === 'segment') {
      path =
        'books/' +
        s.p.bookId +
        '/bookLoreSegments/' +
        lorePayloadSegmentId(head.payloadStorage.generationId, 0);
      // Category and fields are checked first; drive until relation page zero is next.
      while (f.records.get(s.control[0]).phase !== 'relations')
        s.p = (
          await f
            .factory()
            .advanceBookRestoreCounts(
              uid,
              mutation(id, s.p, id + '-before-segment-' + s.p.checkpoint),
            )
        ).progress;
    } else if (target === 'journal') {
      const controlId = s.control[0].split('/').at(-1);
      path = root + '/materializationArtifacts/' + digest(['payload-body', controlId]);
    } else {
      const journal = f.records.get(
        root +
          '/materializationArtifacts/' +
          digest(['payload-body', s.control[0].split('/').at(-1)]),
      );
      path = 'users/' + uid + '/bookRestoreOperations/' + journal.lastOperationId;
    }
    assert.ok(f.records.has(path), path);
    const value = structuredClone(f.records.get(path));
    f.records.delete(path);
    f.metadata.delete(path);
    await f.db.runTransaction(async (tx) => tx.create(f.db.doc(path), value));
    await assert.rejects(() =>
      f.factory().advanceBookRestoreCounts(uid, mutation(id, s.p, id + '-reject-' + target)),
    );
    assert.deepEqual(f.records.get(path), value);
    assert.equal(f.records.has('books/' + s.p.bookId), false);
  });
test('Counts rejects a native part with altered bytes even if the double preserves its native metadata', async () => {
  const f = await start(),
    s = await pending(f),
    head = f.records.get('books/' + s.p.bookId + '/lore/' + f.mapper.identity('lore', 'entity')),
    body = head.payloadStorage.fields.category.manifest.bodyId,
    path = 'books/' + s.p.bookId + '/bookResourceChunks/' + body + ':000000000000000',
    part = structuredClone(f.records.get(path));
  part.bytes[0] ^= 1;
  f.records.set(path, part);
  await assert.rejects(() =>
    f.factory().advanceBookRestoreCounts(uid, mutation(id, s.p, id + '-bad-bytes')),
  );
});

test('storage failure and automatic callback retry advance the reconciliation control exactly once', async () => {
  const f = await start(),
    s = await pending(f),
    run = f.db.runTransaction.bind(f.db),
    before = structuredClone([...f.records]),
    failure = new Error('reconcile write failure');
  let inject = true,
    automatic = false;
  f.db.runTransaction = async (operation) => {
    try {
      return await run(async (tx) => {
        const set = tx.set;
        tx.set = (ref, ...args) => {
          if (inject && ref.path === s.control[0]) throw failure;
          return set(ref, ...args);
        };
        return operation(tx);
      });
    } catch (error) {
      if (error === failure && automatic) {
        inject = false;
        return run(operation);
      }
      throw error;
    }
  };
  const request = mutation(id, s.p, id + '-reconcile-retry');
  await assert.rejects(
    () => f.factory().advanceBookRestoreCounts(uid, request),
    (error) => error === failure,
  );
  assert.deepEqual([...f.records], before);
  automatic = true;
  const answer = await f.factory().advanceBookRestoreCounts(uid, request);
  assert.equal(f.records.get(s.control[0]).fieldIndex, 2);
  assert.equal(answer.progress.checkpoint, s.p.checkpoint + 1);
  assert.deepEqual(await f.factory().advanceBookRestoreCounts(uid, request), answer);
});
test('cancellation during indexed source observation prevents a reconciliation receipt', async () => {
  const f = await start(),
    s = await pending(f),
    original = f.db.doc.bind(f.db),
    path = root + '/validationItems/' + String(s.p.preparation.counts.itemIndex).padStart(15, '0'),
    before = [...f.records].filter(([key]) => key.startsWith('books/'));
  let interrupted = false;
  f.db.doc = (key) => {
    const ref = original(key);
    if (key === path)
      return {
        ...ref,
        async get() {
          const snapshot = await ref.get();
          if (!interrupted) {
            interrupted = true;
            await f.factory().cancelBookRestore(uid, mutation(id, s.p, id + '-concurrent-cancel'));
          }
          return snapshot;
        },
      };
    return ref;
  };
  const request = mutation(id, s.p, id + '-interrupted-read');
  await assert.rejects(() => f.factory().advanceBookRestoreCounts(uid, request));
  assert.equal(interrupted, true);
  assert.equal(
    f.records.has('users/' + uid + '/bookRestoreOperations/' + request.operationId),
    false,
  );
  assert.deepEqual(
    [...f.records].filter(([key]) => key.startsWith('books/')),
    before,
  );
});
