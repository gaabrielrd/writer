import test from 'node:test';
import assert from 'node:assert/strict';
import {
  archiveCleanupFixture,
  archiveRequest,
  archiveStep,
  finishArchiveCleanup,
} from './helpers/adventureRestoreArchiveCleanupFixture.mjs';
import { ARCHIVE_NAMES } from '../src/adventureRestoreArchiveContracts.mjs';
import { emptyAdventureArchive } from './helpers/adventureRestoreArchiveFixture.mjs';
test('collection removes only private source namespaces while keeping native project, library, personas and frozen receipts', async () => {
  const { f, p, progress } = await archiveCleanupFixture(),
    parent = structuredClone(f.records.get(f.path)),
    preserved = structuredClone(
      [...f.records].filter(
        ([k]) =>
          !k.includes('/adventureRestoreRecoveryKeys/') &&
          !ARCHIVE_NAMES.some((name) => k.startsWith(f.path + '/' + name + '/')),
      ),
    );
  const done = await finishArchiveCleanup(f, p, progress);
  assert.equal(done.removed.journals, parent.staging.artifactCount);
  assert.equal(done.removed.chunks, parent.uploadedChunks);
  assert.equal(done.removed.proofs, parent.checkedChunks);
  assert.equal(done.removed.index, parent.validation.indexEntries);
  assert.equal(done.removed.items, parent.validation.items);
  assert.equal(done.removed.validationStates, 1);
  assert.deepEqual(f.records.get(f.path), parent);
  for (const name of ARCHIVE_NAMES)
    assert.equal(
      [...f.records.keys()].some((k) => k.startsWith(f.path + '/' + name + '/')),
      false,
    );
  for (const [key, value] of preserved) assert.deepEqual(f.records.get(key), value);
});
test('the minimal archive completes and exact receipts replay after the source is gone', async () => {
  const { f, p, progress } = await archiveCleanupFixture(await emptyAdventureArchive()),
    request = archiveRequest(p, progress),
    first = await archiveStep(f, p, progress),
    done = await finishArchiveCleanup(f, p, first.progress),
    before = structuredClone([...f.records]);
  const replay = await f.api.advanceAdventureRestoreArchiveCleanup(f.uid, request);
  assert.deepEqual(replay.receipt, first.receipt);
  assert.deepEqual(replay.progress, done);
  assert.deepEqual([...f.records], before);
  assert.equal(
    (await f.api.getAdventureRestore(f.uid, { restoreId: p.restoreId, jobToken: p.jobToken }))
      .state,
    'activated',
  );
});

async function phase(f, p, current, target) {
  for (let n = 0; current.phase !== target; n++) {
    assert.ok(n < 10000);
    current = (await archiveStep(f, p, current)).progress;
  }
  return current;
}
test('collection waits for the final empty media unit and refuses premature or foreign requests', async () => {
  const { mediaFixture } = await import('./helpers/adventureRestoreMediaFixture.mjs');
  const { f, p } = await mediaFixture(await emptyAdventureArchive()),
    before = structuredClone([...f.records]);
  assert.equal(
    (
      await f.api.getAdventureRestoreArchiveCleanup(f.uid, {
        restoreId: p.restoreId,
        jobToken: p.jobToken,
      })
    ).progress.phase,
    'waiting-for-media',
  );
  const request = archiveRequest(p, { checkpoint: 0 });
  for (const [uid, patch] of [
    [f.uid, {}],
    ['other', {}],
    [null, {}],
    [f.uid, { jobToken: 'e'.repeat(64) }],
    [f.uid, { limit: 50 }],
  ]) {
    await assert.rejects(() =>
      f.api.advanceAdventureRestoreArchiveCleanup(uid, { ...request, ...patch }),
    );
    assert.deepEqual([...f.records], before);
  }
});
test('each deletion/control/receipt rollback keeps the entire page and checkpoint for exact retry', async () => {
  for (const boundary of ['journal', 'private', 'control', 'receipt']) {
    const { f, p, progress } = await archiveCleanupFixture(),
      run = f.db.runTransaction;
    let current = progress,
      failed = false;
    f.db.runTransaction = (cb) =>
      run((tx) =>
        cb(
          new Proxy(tx, {
            get(object, method) {
              if (['delete', 'create', 'update'].includes(method))
                return (...args) => {
                  const path = args[0].path,
                    stop =
                      boundary === 'journal'
                        ? method === 'delete' && path.includes('/stagingArtifacts/')
                        : boundary === 'private'
                          ? method === 'delete' && path.includes('/preparedRoot/')
                          : boundary === 'control'
                            ? path.endsWith('/archiveCleanup/current')
                            : path.includes('/adventureRestoreArchiveOperations/');
                  if (stop) {
                    failed = true;
                    throw Error('archive rollback');
                  }
                  return object[method](...args);
                };
              return typeof object[method] === 'function'
                ? object[method].bind(object)
                : object[method];
            },
          }),
        ),
      );
    for (let n = 0; !failed; n++) {
      assert.ok(n < 100);
      const before = structuredClone([...f.records]);
      try {
        current = (await archiveStep(f, p, current)).progress;
      } catch (error) {
        assert.match(error.message, /archive rollback/);
        assert.deepEqual([...f.records], before);
      }
    }
    f.db.runTransaction = run;
    assert.equal((await finishArchiveCleanup(f, p, current)).phase, 'done');
  }
});
test('lost commit acknowledgement replays before reading already deleted journals or targets', async () => {
  const { f, p, progress } = await archiveCleanupFixture(),
    run = f.db.runTransaction,
    request = archiveRequest(p, progress);
  let once = true;
  f.db.runTransaction = async (cb) => {
    const result = await run(cb);
    if (once && result?.receipt?.lastOperationId === request.operationId) {
      once = false;
      throw Error('lost archive ACK');
    }
    return result;
  };
  await assert.rejects(
    () => f.api.advanceAdventureRestoreArchiveCleanup(f.uid, request),
    /lost archive ACK/,
  );
  const before = structuredClone([...f.records]);
  const replay = await f.api.advanceAdventureRestoreArchiveCleanup(f.uid, request);
  assert.equal(replay.progress.checkpoint, 1);
  assert.deepEqual([...f.records], before);
});
test('recreated private journals, definitions, chunks, proofs, index, items and state are preserved instead of adopted', async () => {
  for (const [target, name] of [
    ['journals', 'stagingArtifacts'],
    ['journals', 'preparedRoot'],
    ['chunks', 'chunks'],
    ['chunks', 'integrityProofs'],
    ['validation-index', 'validationIndex'],
    ['validation-items', 'validationItems'],
    ['validation-state', 'validationState'],
  ]) {
    const { f, p, progress } = await archiveCleanupFixture(await emptyAdventureArchive()),
      current = target === 'journals' ? progress : await phase(f, p, progress, target),
      path = [...f.records.keys()].find((k) => k.startsWith(f.path + '/' + name + '/'));
    assert.ok(path);
    f.metadata.get(path).createdAtNanoseconds += 70000;
    let rejected = false,
      c = current;
    for (let n = 0; !rejected; n++) {
      assert.ok(n < 100);
      const before = structuredClone([...f.records]);
      try {
        c = (await archiveStep(f, p, c)).progress;
      } catch {
        rejected = true;
        assert.deepEqual([...f.records], before);
      }
    }
    assert.equal(f.records.has(path), true);
  }
});
test('unexpected private definitions and records reappearing behind the cursor block final certification', async () => {
  for (const behind of [false, true]) {
    const { f, p, progress } = await archiveCleanupFixture(await emptyAdventureArchive());
    let current = progress,
      path;
    if (behind) {
      const first = [...f.records].find(([k]) => k.startsWith(f.path + '/stagingArtifacts/'));
      current = await phase(f, p, current, 'verify');
      path = first[0];
      f.records.set(path, first[1]);
    } else {
      path = f.path + '/preparedRoot/unregistered-private-data';
      f.records.set(path, { ownUserData: 'preserve' });
      current = await phase(f, p, current, 'prepared-root');
    }
    const before = structuredClone([...f.records]);
    await assert.rejects(() => archiveStep(f, p, current));
    assert.deepEqual([...f.records], before);
    assert.equal(f.records.has(path), true);
  }
});
test('a pending server recovery key blocks completion without reading or deleting key material', async () => {
  const { f, p, progress } = await archiveCleanupFixture(await emptyAdventureArchive()),
    current = await phase(f, p, progress, 'verify'),
    path = 'users/' + f.uid + '/adventureRestoreRecoveryKeys/' + p.restoreId;
  f.records.set(path, { restoreId: p.restoreId, privateKeyMaterial: 'never read' });
  f.metadataReads.length = 0;
  const before = structuredClone([...f.records]);
  await assert.rejects(() => archiveStep(f, p, current));
  assert.deepEqual([...f.records], before);
  // The filtered presence query can reject before even a masked point read.
  assert.equal(
    f.metadataReads.some((v) => v.path === path && v.fields.length > 0),
    false,
  );
  f.records.delete(path);
  assert.equal((await finishArchiveCleanup(f, p, current)).phase, 'done');
});
test('the activated root can be edited, removed or recreated without being read or granted by collection', async () => {
  for (const kind of ['edited', 'removed', 'recreated']) {
    const { f, p, progress } = await archiveCleanupFixture(),
      root = 'adventures/' + p.adventureId;
    if (kind === 'edited')
      await f.db.runTransaction((tx) => tx.update(f.db.doc(root), { title: 'My actual edit' }));
    else {
      await f.db.runTransaction((tx) => tx.delete(f.db.doc(root)));
      if (kind === 'recreated')
        await f.db.runTransaction((tx) =>
          tx.create(f.db.doc(root), { ownerId: 'other', title: 'Replacement' }),
        );
    }
    const before = f.records.get(root);
    f.reads.length = 0;
    f.metadataReads.length = 0;
    assert.equal((await finishArchiveCleanup(f, p, progress)).phase, 'done');
    assert.deepEqual(f.records.get(root), before);
    assert.equal(
      f.metadataReads.some((r) => r.path.startsWith('adventures/')),
      false,
    );
    assert.equal(
      f.reads.some((r) => (r.path ?? '').startsWith('adventures/')),
      false,
    );
  }
});
test('competing checkpoints commit a page once and historical status detects control or receipt ABA', async () => {
  const { f, p, progress } = await archiveCleanupFixture(),
    request = archiveRequest(p, progress);
  const results = await Promise.allSettled([
    f.api.advanceAdventureRestoreArchiveCleanup(f.uid, request),
    f.api.advanceAdventureRestoreArchiveCleanup(f.uid, {
      ...request,
      operationId: 'competing-archive-op-0001',
    }),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter((r) => r.status === 'rejected').length, 1);
  const c = f.records.get(f.path + '/archiveCleanup/current'),
    path = 'users/' + f.uid + '/adventureRestoreArchiveOperations/' + c.lastOperationId;
  f.metadata.get(path).createdAtNanoseconds += 90000;
  await assert.rejects(() =>
    f.api.getAdventureRestoreArchiveCleanup(f.uid, {
      restoreId: p.restoreId,
      jobToken: p.jobToken,
    }),
  );
});
test('large historical source removes SHA states and chunks by metadata while preserving every native history body', async () => {
  const { historyAdventureArchive } =
    await import('./helpers/adventureRestoreHistoryArchiveFixture.mjs');
  const { f, p, progress } = await archiveCleanupFixture(
      await historyAdventureArchive({ content: 'a'.repeat(1200000) }),
    ),
    job = f.records.get(f.path),
    history = structuredClone(
      [...f.records].filter(([k]) => k.startsWith('adventures/' + p.adventureId + '/workVersion')),
    );
  assert.ok(job.writtenStates > 0);
  assert.ok(job.uploadedChunks > 16);
  f.reads.length = 0;
  f.metadataReads.length = 0;
  const done = await finishArchiveCleanup(f, p, progress);
  assert.equal(done.removed.integrityStates, job.writtenStates);
  assert.equal(done.removed.bytes, job.uploadedBytes);
  assert.deepEqual(
    [...f.records].filter(([k]) => k.startsWith('adventures/' + p.adventureId + '/workVersion')),
    history,
  );
  const forbidden = ['chunkBase64', 'hashState', 'stateJSON', 'pointerJSON', 'valueJSON'];
  for (const query of f.reads.filter((r) =>
    ARCHIVE_NAMES.some((name) => r.collectionPath === f.path + '/' + name),
  )) {
    assert.ok(Array.isArray(query.fields));
    assert.equal(
      query.fields.some((k) => forbidden.includes(k)),
      false,
    );
    assert.ok(query.maximum <= 8);
  }
  for (const read of f.metadataReads)
    assert.equal(
      read.fields.some((k) => forbidden.includes(k)),
      false,
    );
});

test('an adapter without field masks is refused before any private read or deletion', async () => {
  const { f, p, progress } = await archiveCleanupFixture(await emptyAdventureArchive()),
    run = f.db.runTransaction,
    before = structuredClone([...f.records]);
  f.reads.length = 0;
  f.metadataReads.length = 0;
  f.db.runTransaction = (cb) =>
    run((tx) =>
      cb(
        new Proxy(tx, {
          get(object, key) {
            if (key === 'getAll') return undefined;
            return typeof object[key] === 'function' ? object[key].bind(object) : object[key];
          },
        }),
      ),
    );
  await assert.rejects(() =>
    f.api.getAdventureRestoreArchiveCleanup(f.uid, {
      restoreId: p.restoreId,
      jobToken: p.jobToken,
    }),
  );
  await assert.rejects(() => archiveStep(f, p, progress));
  assert.deepEqual([...f.records], before);
  assert.deepEqual(f.reads, []);
  assert.deepEqual(f.metadataReads, []);
});

test('a malformed recovery key at the canonical path blocks collection with a nonempty metadata mask', async () => {
  const { f, p, progress } = await archiveCleanupFixture(await emptyAdventureArchive()),
    current = await phase(f, p, progress, 'verify'),
    path = 'users/' + f.uid + '/adventureRestoreRecoveryKeys/' + p.restoreId;
  f.records.set(path, { privateKeyMaterial: 'never hydrate even without a restoreId field' });
  f.metadataReads.length = 0;
  const before = structuredClone([...f.records]);
  await assert.rejects(() => archiveStep(f, p, current));
  assert.deepEqual([...f.records], before);
  assert.deepEqual(f.metadataReads.find((r) => r.path === path).fields, ['restoreId']);
});
