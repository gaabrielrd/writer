import assert from 'node:assert/strict';
import test from 'node:test';
import {
  countFixture,
  countStep,
  countRequest,
  finishCounts,
} from './helpers/adventureRestoreCountsFixture.mjs';
import { emptyAdventureArchive } from './helpers/adventureRestoreArchiveFixture.mjs';
import { cleanup } from './helpers/adventureRestoreTransferFixture.mjs';
test('reconciliation preserves unassigned text, counts direct narrative links and keeps the root private', async () => {
  const { f, p } = await countFixture(),
    rootBefore = structuredClone(f.records.get('adventures/' + p.adventureId)),
    bodyBefore = structuredClone([...f.records].filter(([k]) => k.includes('/body/'))),
    ready = await finishCounts(f, p),
    prefix = 'adventures/' + p.adventureId + '/',
    control = f.records.get(prefix + 'workProgress/current'),
    rows = [...f.records].filter(([k]) => k.startsWith(prefix)),
    milestone = rows.find(([k]) => k.includes('/milestones/'))?.[1],
    arc = rows.find(([k]) => k.includes('/arcs/') && !k.includes('/milestones/'))?.[1];
  assert.equal(ready.staging.countScenes, p.staging.scenes);
  assert.equal(ready.staging.countBlocks, p.staging.blocks);
  assert.equal(control.wordCount, 0);
  assert.equal(control.countReady, false);
  assert.equal(control.phase, 'done');
  assert.equal(control.processed, p.staging.scenes);
  assert.equal(control.cursor, null);
  assert.ok(rows.some(([k]) => k.includes('/workWordSources/')));
  assert.equal(milestone.referenceCount, 1);
  assert.equal(arc.referenceCount, 0);
  assert.deepEqual(f.records.get('adventures/' + p.adventureId), rootBefore);
  assert.deepEqual(
    [...f.records].filter(([k]) => k.includes('/body/')),
    bodyBefore,
  );
  assert.equal(
    [...f.records.keys()].some((k) => k.startsWith('users/' + f.uid + '/imageLibrary/')),
    false,
  );
  const cancelled = await cleanup(f, ready, 20);
  assert.equal(cancelled.state, 'cancelled');
  assert.equal(cancelled.staging.cleanedArtifacts, ready.staging.artifactCount);
  assert.equal(
    [...f.records.keys()].some((k) => k.startsWith(prefix)),
    false,
  );
});
test('a zero-resource archive reconciles without fabricating sources or publishing a root', async () => {
  const { f, p } = await countFixture(await emptyAdventureArchive()),
    ready = await finishCounts(f, p);
  assert.equal(ready.staging.countWordCount, 0);
  assert.equal(ready.staging.countScenes, 0);
  assert.equal(ready.staging.countBlocks, 0);
  assert.equal(ready.staging.countLinks, 0);
  assert.equal(
    f.records.get('adventures/' + p.adventureId + '/workProgress/current').countReady,
    false,
  );
  assert.equal(
    [...f.records.keys()].some((k) => k.includes('/workWordSources/')),
    false,
  );
});
test('replay precedes source reads and a competing stale checkpoint cannot add a block or source twice', async () => {
  const { f, p } = await countFixture(),
    request = countRequest(p),
    first = await f.api.advanceAdventureRestoreCounts(f.uid, request),
    before = structuredClone([...f.records]);
  assert.deepEqual(await f.api.advanceAdventureRestoreCounts(f.uid, request), first);
  assert.deepEqual([...f.records], before);
  await assert.rejects(() =>
    f.api.advanceAdventureRestoreCounts(f.uid, {
      ...request,
      operationId: 'competing-count-request-0001',
    }),
  );
  assert.deepEqual([...f.records], before);
  assert.equal((await countStep(f, first.progress)).staging.phase, 'counts-blocks');
});

test('an uncertain commit replays the exact receipt instead of adding a scene contribution twice', async () => {
  const { f, p: start } = await countFixture();
  let p = start;
  while (p.staging.phase !== 'counts-scenes') p = await countStep(f, p);
  const request = countRequest(p),
    original = f.db.runTransaction;
  let once = true;
  f.db.runTransaction = async (cb) => {
    const value = await original(cb);
    if (once && value?.receipt?.operationId === request.operationId) {
      once = false;
      throw Error('lost count ACK');
    }
    return value;
  };
  await assert.rejects(() => f.api.advanceAdventureRestoreCounts(f.uid, request), /lost count ACK/);
  const stored = structuredClone([...f.records]),
    replay = await f.api.advanceAdventureRestoreCounts(f.uid, request);
  assert.equal(replay.receipt.operationId, request.operationId);
  assert.deepEqual([...f.records], stored);
  assert.equal((await finishCounts(f, replay.progress)).staging.countScenes, 1);
});
test('a transaction rollback at the journal preserves every aggregate and its checkpoint', async () => {
  const { f, p: start } = await countFixture();
  let p = start;
  const original = f.db.runTransaction;
  while (true) {
    const before = structuredClone([...f.records]);
    let failed = false;
    f.db.runTransaction = (cb) =>
      original((tx) =>
        cb(
          new Proxy(tx, {
            get(object, key) {
              if (['set', 'update'].includes(key))
                return (ref, value) => {
                  if (ref.path.includes('/stagingArtifacts/')) {
                    failed = true;
                    throw Error('count journal rollback');
                  }
                  return object[key](ref, value);
                };
              return typeof object[key] === 'function' ? object[key].bind(object) : object[key];
            },
          }),
        ),
      );
    try {
      p = await countStep(f, p);
    } catch (error) {
      assert.match(error.message, /count journal rollback/);
      assert.equal(failed, true);
      assert.deepEqual([...f.records], before);
      break;
    }
    assert.notEqual(p.staging.phase, 'counts-ready');
  }
  f.db.runTransaction = original;
  assert.equal((await finishCounts(f, p)).staging.countScenes, 1);
});
test('changed or recreated staged bodies block reconciliation without consuming a checkpoint', async () => {
  for (const recreate of [false, true]) {
    const { f, p: start } = await countFixture();
    let p = start;
    // Finish blocks, then advance to the scene unit using the authenticated index.
    while (p.staging.phase !== 'counts-scenes') p = await countStep(f, p);
    const bodyPath = [...f.records.keys()].find(
      (k) =>
        k.startsWith('adventures/' + p.adventureId + '/scenes/') && k.endsWith('/body/current'),
    );
    if (recreate) f.metadata.set(bodyPath, { createdAt: 3333, createdAtNanoseconds: 55 });
    else f.records.set(bodyPath, { ...f.records.get(bodyPath), content: 'changed text' });
    let rejected = false;
    for (let n = 0; n < 100; n++) {
      const before = structuredClone([...f.records]);
      try {
        p = await countStep(f, p);
      } catch {
        rejected = true;
        assert.deepEqual([...f.records], before);
        break;
      }
    }
    assert.equal(rejected, true);
  }
});
test('cancellation in each reconciliation phase cleans only registered artifacts and closes image paths first', async () => {
  for (const phase of ['counts-blocks', 'counts-scenes', 'counts-links', 'counts-ready']) {
    const { f, p: start } = await countFixture();
    let p = start;
    while (p.staging.phase !== phase) p = await countStep(f, p);
    const prefix = 'adventures/' + p.adventureId + '/',
      paths = [...f.storage.current.keys()],
      cancelled = await cleanup(f, p, 20);
    assert.equal(cancelled.state, 'cancelled');
    assert.equal(cancelled.staging.storageFenced, p.staging.storageIntents);
    assert.equal(
      [...f.records.keys()].some((k) => k.startsWith(prefix)),
      false,
    );
    for (const path of paths) {
      assert.equal(f.storage.version(path).bytes.length, 0);
      assert.equal(f.storage.versions.get(path).size, 1);
    }
  }
});
