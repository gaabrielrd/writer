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
import {
  bookRestoreArtifactBalance,
  preparationProgress,
} from '../src/bookRestoreUploadContracts.mjs';
const root = 'users/' + uid + '/bookRestores/' + id;
async function readyDrain() {
  const data = indexedLoreData({ count: 65 });
  data.details = '\ufeff' + 'x'.repeat(530000);
  delete data.createdAt;
  delete data.updatedAt;
  const f = await ready(data);
  let p = await finishRestoreResources(f.factory, uid, id, await finish(f));
  for (let i = 0; i < 1000; i++) {
    if (p.preparation.counts?.step === 'finish') return { ...f, p };
    p = (await f.factory().advanceBookRestoreCounts(uid, mutation(id, p, id + '-to-drain-' + i)))
      .progress;
  }
  throw Error('No drain boundary');
}
async function step(f, p, suffix) {
  return f.factory().advanceBookRestoreCounts(uid, mutation(id, p, id + '-drain-' + suffix));
}
function stageDocs(f) {
  return [...f.records].filter(([, v]) => Object.hasOwn(v, 'stageKind'));
}
function firstPrivate(f, p) {
  const journals = [...f.records]
    .filter(
      ([path, v]) =>
        path.startsWith(root + '/materializationArtifacts/') && v.kind === 'payload-chunk',
    )
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .slice(0, 8);
  const found = journals.find(
    ([, v]) => f.records.get('books/' + p.bookId + '/bookResourceChunks/' + v.id)?.stageKind,
  );
  assert.ok(found, 'private chunk in first drain batch');
  return {
    journal: found[0],
    data: found[1],
    target: 'books/' + p.bookId + '/bookResourceChunks/' + found[1].id,
  };
}
test('successful drain is bounded, preserves final native bytes and timestamps, and cancellation balances retirement exactly', async () => {
  const f = await readyDrain(),
    before = await logical(f, f.p),
    finals = [...f.records].filter(
      ([path, v]) => path.startsWith('books/' + f.p.bookId + '/') && !Object.hasOwn(v, 'stageKind'),
    ),
    metadata = new Map(finals.map(([path]) => [path, structuredClone(f.metadata.get(path))]));
  assert.ok(stageDocs(f).length > 0);
  let p = f.p,
    first;
  for (let i = 0; i < 1000 && p.preparation.phase !== 'personas'; i++) {
    const request = mutation(id, p, id + '-bounded-drain-' + i),
      answer = await f.factory().advanceBookRestoreCounts(uid, request),
      after = answer.progress,
      deleted = f.commits.at(-1).filter((v) => v.method === 'delete');
    if (!first) first = { request, answer };
    assert.ok(deleted.length <= 16);
    assert.equal(
      (after.preparation.retiredArtifacts ?? 0) - (p.preparation.retiredArtifacts ?? 0),
      deleted.length / 2,
    );
    assert.ok(after.preparation.artifactCount >= p.preparation.artifactCount);
    assert.equal(after.preparation.cleanedArtifacts, 0);
    assert.ok(bookRestoreArtifactBalance(after.preparation) >= 0);
    p = after;
  }
  assert.equal(p.preparation.phase, 'personas');
  assert.equal(p.preparation.loreStaging.step, 'done');
  assert.equal(stageDocs(f).length, 0);
  assert.ok(p.preparation.retiredArtifacts > 0);
  assert.equal(f.records.has('books/' + p.bookId), false);
  for (const [path, value] of finals) {
    assert.deepEqual(f.records.get(path), value, path);
    assert.deepEqual(f.metadata.get(path), metadata.get(path), path);
  }
  assert.deepEqual((await logical(f, p)).data, before.data);
  const done = await cleanupLegacyRestore(f.factory(), uid, id, p, {
    limit: 5,
    prefix: id + '-after-retire-',
  });
  assert.equal(done.state, 'cancelled');
  assert.equal(
    done.preparation.cleanedArtifacts + done.preparation.retiredArtifacts,
    done.preparation.artifactCount,
  );
  assert.equal(
    [...f.records.keys()].some((path) => path.startsWith('books/' + p.bookId + '/')),
    false,
  );
  const snapshot = structuredClone([...f.records]);
  const replay = await f.factory().advanceBookRestoreCounts(uid, first.request);
  assert.deepEqual(replay.receipt, first.answer.receipt);
  assert.deepEqual(replay.progress, done);
  assert.deepEqual([...f.records], snapshot);
});
test('cancellation after one retirement page removes the remaining inventory without double counting', async () => {
  const f = await readyDrain(),
    p = (await step(f, f.p, 'partial')).progress;
  assert.ok(p.preparation.retiredArtifacts > 0);
  assert.equal(p.preparation.loreStaging.step, 'chunks');
  const done = await cleanupLegacyRestore(f.factory(), uid, id, p, {
    limit: 3,
    prefix: id + '-partial-retire-',
  });
  assert.equal(done.state, 'cancelled');
  assert.equal(bookRestoreArtifactBalance(done.preparation), 0);
  assert.equal(
    [...f.records.keys()].some((path) => path.startsWith('books/' + p.bookId + '/')),
    false,
  );
});
for (const kind of ['target', 'journal', 'receipt', 'missing-target'])
  test(
    'retirement refuses original dependency changed by ' +
      kind +
      ' and preserves the uncertain data',
    async () => {
      const f = await readyDrain(),
        item = firstPrivate(f, f.p),
        path =
          kind === 'journal'
            ? item.journal
            : kind === 'receipt'
              ? 'users/' + uid + '/bookRestoreOperations/' + item.data.lastOperationId
              : item.target,
        value = structuredClone(f.records.get(path));
      assert.ok(value);
      f.records.delete(path);
      f.metadata.delete(path);
      if (kind !== 'missing-target')
        await f.db.runTransaction(async (tx) => tx.create(f.db.doc(path), value));
      const before = structuredClone([...f.records]);
      await assert.rejects(() => step(f, f.p, 'bad-' + kind));
      assert.deepEqual([...f.records], before);
    },
  );
test('a missing journal leaves a physical private artifact that blocks final metadata certification', async () => {
  const f = await readyDrain(),
    item = firstPrivate(f, f.p),
    value = structuredClone(f.records.get(item.target));
  f.records.delete(item.journal);
  f.metadata.delete(item.journal);
  await assert.rejects(() => finishRestoreCounts(f.factory, uid, id, f.p, id + '-orphan-journal-'));
  assert.deepEqual(f.records.get(item.target), value);
  assert.equal(f.records.has('books/' + f.p.bookId), false);
});
test('an unknown unjournaled foreign stage artifact is preserved and blocks certification', async () => {
  const f = await readyDrain(),
    path = 'books/' + f.p.bookId + '/bookResourceChunks/' + 'f'.repeat(64) + ':000000000000000',
    value = {
      schemaVersion: 1,
      stageKind: 'restore-lore-unknown',
      ownerId: 'other',
      bookId: f.p.bookId,
    };
  await f.db.runTransaction(async (tx) => tx.create(f.db.doc(path), value));
  await assert.rejects(() => finishRestoreCounts(f.factory, uid, id, f.p, id + '-foreign-stage-'));
  assert.deepEqual(f.records.get(path), value);
  assert.equal(f.records.has('books/' + f.p.bookId), false);
});
test('retirement rollback and automatic callback retry keep one cursor advance and one retirement debit', async () => {
  const f = await readyDrain(),
    item = firstPrivate(f, f.p),
    run = f.db.runTransaction.bind(f.db),
    before = structuredClone([...f.records]),
    failure = new Error('retirement failure');
  let inject = true,
    automatic = false;
  f.db.runTransaction = async (operation) => {
    try {
      return await run(async (tx) => {
        const remove = tx.delete;
        tx.delete = (ref) => {
          if (inject && ref.path === item.target) throw failure;
          return remove(ref);
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
  const request = mutation(id, f.p, id + '-retirement-retry');
  await assert.rejects(
    () => f.factory().advanceBookRestoreCounts(uid, request),
    (error) => error === failure,
  );
  assert.deepEqual([...f.records], before);
  automatic = true;
  const answer = await f.factory().advanceBookRestoreCounts(uid, request);
  assert.equal(answer.progress.checkpoint, f.p.checkpoint + 1);
  assert.ok(answer.progress.preparation.retiredArtifacts > 0);
  const current = structuredClone([...f.records]);
  assert.deepEqual(await f.factory().advanceBookRestoreCounts(uid, request), answer);
  assert.deepEqual([...f.records], current);
});
test('retirement progress rejects negative, unpaired, overdrawn and invalid native cursors', async () => {
  const f = await readyDrain(),
    p = (await step(f, f.p, 'contracts')).progress.preparation;
  for (const change of [
    (v) => {
      v.retiredArtifacts = -1;
    },
    (v) => {
      delete v.retiredArtifacts;
    },
    (v) => {
      v.retiredArtifacts = v.loreStaging.scanned + 1;
    },
    (v) => {
      v.artifactCount = 0;
    },
    (v) => {
      v.loreStaging.after = '../foreign';
    },
    (v) => {
      v.loreStaging.step = 'done';
      v.loreStaging.after = 'a'.repeat(64);
    },
    (v) => {
      v.loreStaging.extra = true;
    },
  ]) {
    const value = structuredClone(p);
    change(value);
    assert.throws(() => preparationProgress(value));
  }
});
