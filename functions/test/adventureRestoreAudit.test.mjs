import assert from 'node:assert/strict';
import test from 'node:test';
import {
  auditFixture,
  auditStep,
  auditRequest,
  finishAudit,
} from './helpers/adventureRestoreAuditFixture.mjs';
import { emptyAdventureArchive } from './helpers/adventureRestoreArchiveFixture.mjs';
import { cleanup } from './helpers/adventureRestoreTransferFixture.mjs';
test('empty native inventory is audited in both directions without enabling the private root', async () => {
  const { f, p } = await auditFixture(await emptyAdventureArchive()),
    before = structuredClone(f.records.get('adventures/' + p.adventureId)),
    ready = await finishAudit(f, p);
  assert.equal(ready.staging.auditJournals, p.staging.artifactCount);
  assert.equal(ready.staging.auditPhysical, p.staging.artifactCount);
  assert.equal(ready.staging.auditMedia, 0);
  assert.deepEqual(f.records.get('adventures/' + p.adventureId), before);
  assert.equal(
    f.records.get('adventures/' + p.adventureId + '/workProgress/current').countReady,
    false,
  );
});
test('native text and PNG generations are certified privately without reading body or frame payloads', async () => {
  const { f, p } = await auditFixture(),
    run = f.db.runTransaction;
  f.db.runTransaction = (cb) =>
    run((tx) =>
      cb(
        new Proxy(tx, {
          get(object, key) {
            if (key === 'get')
              return (ref) => {
                if (
                  ref.path?.endsWith('/body/current') ||
                  ref.path?.includes('/preparedRoot/image-bytes-')
                )
                  throw Error('Full payload read during audit');
                return object.get(ref);
              };
            if (key === 'getAll')
              return (...args) => {
                const mask = args.at(-1)?.fieldMask;
                if (
                  args.some(
                    (v) =>
                      v?.path?.endsWith('/body/current') ||
                      v?.path?.includes('/preparedRoot/image-bytes-'),
                  )
                ) {
                  assert.ok(Array.isArray(mask));
                  assert.equal(mask.includes('content') || mask.includes('bytes'), false);
                }
                return object.getAll(...args);
              };
            return typeof object[key] === 'function' ? object[key].bind(object) : object[key];
          },
        }),
      ),
    );
  const ready = await finishAudit(f, p);
  assert.equal(ready.staging.auditJournals, p.staging.artifactCount);
  assert.equal(ready.staging.auditPhysical, p.staging.artifactCount);
  assert.equal(ready.staging.auditMedia, 1);
  assert.equal(f.records.get('adventures/' + p.adventureId).ownerId, undefined);
  for (const path of f.storage.current.keys()) {
    assert.equal(f.storage.version(path).metadata.metadata.accepted, 'false');
    assert.equal(
      f.storage.version(path).metadata.metadata.firebaseStorageDownloadTokens,
      undefined,
    );
  }
});
test('a physical document without a journal blocks certification and preserves the failing checkpoint', async () => {
  for (const family of ['parts', 'sceneJobs', 'workWordGroups', 'preparedRoot']) {
    const { f, p: start } = await auditFixture(await emptyAdventureArchive());
    let p = start;
    const prefix = family === 'preparedRoot' ? f.path : 'adventures/' + p.adventureId;
    f.records.set(prefix + '/' + family + '/foreign-entry-0001', {
      schemaVersion: 1,
      ownerId: f.uid,
    });
    let rejected = false;
    for (let n = 0; n < 1000; n++) {
      const before = structuredClone([...f.records]);
      try {
        p = await auditStep(f, p);
      } catch {
        rejected = true;
        assert.deepEqual([...f.records], before);
        break;
      }
      assert.notEqual(p.staging.phase, 'audit-ready');
    }
    assert.equal(rejected, true, family);
  }
});
test('changed and recreated target identities cannot be certified by an old journal', async () => {
  for (const recreate of [false, true]) {
    const { f, p } = await auditFixture(),
      path = [...f.records.keys()].find(
        (k) =>
          k.startsWith('adventures/' + p.adventureId + '/scenes/') && k.endsWith('/body/current'),
      );
    if (recreate) f.metadata.set(path, { createdAt: 3000, createdAtNanoseconds: 22 });
    else {
      f.records.set(path, { ...f.records.get(path), content: 'foreign' });
      f.metadata.set(path, { ...f.metadata.get(path), updatedAt: 3000 });
    }
    await assert.rejects(() => finishAudit(f, p));
  }
});
test('replay is historical and stale checkpoints cannot change the frozen audit context', async () => {
  const { f, p } = await auditFixture(),
    request = auditRequest(p),
    first = await f.api.advanceAdventureRestoreAudit(f.uid, request),
    before = structuredClone([...f.records]);
  assert.deepEqual(await f.api.advanceAdventureRestoreAudit(f.uid, request), first);
  await assert.rejects(() =>
    f.api.advanceAdventureRestoreAudit(f.uid, {
      ...request,
      operationId: 'audit-competing-step-0001',
    }),
  );
  assert.deepEqual([...f.records], before);
});

test('unknown child bodies and foreign profiles of this restore cannot hide outside the journal pass', async () => {
  for (const family of ['child', 'persona']) {
    const { f, p } = await auditFixture(),
      prefix = 'adventures/' + p.adventureId,
      scene = [...f.records.keys()].find(
        (k) =>
          k.startsWith(prefix + '/scenes/') &&
          !k.includes('/body/') &&
          !k.includes('/planning/') &&
          !k.includes('/references/'),
      );
    if (family === 'child') f.records.set(scene + '/body/foreign', { content: 'foreign' });
    else
      f.records.set('users/' + f.uid + '/aiPersonas/custom-' + 'a'.repeat(64), {
        restoreOrigin: { schemaVersion: 2, target: { kind: 'adventure', id: p.adventureId } },
      });
    await assert.rejects(() => finishAudit(f, p));
  }
});
test('the previous anchor and preparation writers remain frozen throughout the audit', async () => {
  const { f, p } = await auditFixture(),
    first = await auditStep(f, p),
    stage = f.records.get(f.path).staging,
    a = stage.auditAnchor.address,
    base =
      a.scope === 'job'
        ? f.path
        : a.scope === 'persona'
          ? 'users/' + f.uid
          : 'adventures/' + p.adventureId,
    path = base + '/' + a.path.join('/');
  for (const method of [
    'advanceAdventureRestoreCounts',
    'advanceAdventureRestoreImages',
    'advanceAdventureRestoreResources',
  ]) {
    await assert.rejects(() =>
      f.api[method](f.uid, { ...auditRequest(first), operationId: 'blocked-writer-' + method }),
    );
  }
  const old = f.metadata.get(path);
  f.metadata.set(path, { ...old, updatedAt: 4000, updatedAtNanoseconds: 33 });
  await assert.rejects(() => auditStep(f, first));
});
test('a foreign Storage generation fails before advancing the audit media checkpoint', async () => {
  const { f, p: start } = await auditFixture();
  let p = start;
  while (p.staging.phase !== 'audit-media') p = await auditStep(f, p);
  const before = structuredClone([...f.records]),
    path = [...f.storage.current.keys()][0];
  f.storage.put(path, Buffer.from('foreign'), { metadata: { ownerId: 'other' } });
  await assert.rejects(() => auditStep(f, p));
  assert.deepEqual([...f.records], before);
  assert.equal(f.storage.version(path).bytes.toString(), 'foreign');
});
test('lost Firestore media ACK replays before a second Storage verification', async () => {
  const { f, p: start } = await auditFixture();
  let p = start;
  while (p.staging.phase !== 'audit-media') p = await auditStep(f, p);
  const request = auditRequest(p),
    original = f.db.runTransaction,
    verify = f.assets.verify;
  let once = true,
    calls = 0;
  f.assets.verify = async (...args) => {
    calls++;
    return verify(...args);
  };
  f.db.runTransaction = async (cb) => {
    const value = await original(cb);
    if (once && value?.receipt?.operationId === request.operationId) {
      once = false;
      throw Error('lost audit media ACK');
    }
    return value;
  };
  await assert.rejects(
    () => f.api.advanceAdventureRestoreAudit(f.uid, request),
    /lost audit media ACK/,
  );
  const stored = structuredClone([...f.records]),
    replay = await f.api.advanceAdventureRestoreAudit(f.uid, request);
  assert.equal(replay.progress.staging.auditMedia, 1);
  assert.equal(calls, 1);
  assert.deepEqual([...f.records], stored);
});
test('cancellation during held Storage verification closes the generation and refuses a late audit ACK', async () => {
  const { f, p: start } = await auditFixture();
  let p = start;
  while (p.staging.phase !== 'audit-media') p = await auditStep(f, p);
  let release, signal;
  const held = new Promise((resolve) => {
      release = resolve;
    }),
    started = new Promise((resolve) => {
      signal = resolve;
    }),
    verify = f.assets.verify;
  f.assets.verify = async (...args) => {
    await verify(...args);
    signal();
    await held;
  };
  const pending = auditStep(f, p);
  await started;
  const cancelled = await cleanup(f, p, 50);
  release();
  await assert.rejects(() => pending);
  assert.equal(cancelled.state, 'cancelled');
  assert.equal(cancelled.staging.cleanedArtifacts, p.staging.artifactCount);
  for (const path of f.storage.current.keys())
    assert.equal(f.storage.version(path).bytes.length, 0);
  assert.equal(f.records.get('adventures/' + p.adventureId).ownerId, undefined);
});

test('receipt creation rollback preserves the complete audit checkpoint and retries once', async () => {
  const { f, p } = await auditFixture(),
    request = auditRequest(p),
    before = structuredClone([...f.records]),
    run = f.db.runTransaction;
  f.db.runTransaction = (cb) =>
    run((tx) =>
      cb(
        new Proxy(tx, {
          get(object, key) {
            if (key === 'create')
              return (ref, value) => {
                if (
                  ref.path ===
                  'users/' + f.uid + '/adventureRestoreOperations/' + request.operationId
                )
                  throw Error('audit receipt rollback');
                return object.create(ref, value);
              };
            return typeof object[key] === 'function' ? object[key].bind(object) : object[key];
          },
        }),
      ),
    );
  await assert.rejects(
    () => f.api.advanceAdventureRestoreAudit(f.uid, request),
    /audit receipt rollback/,
  );
  assert.deepEqual([...f.records], before);
  f.db.runTransaction = run;
  const retry = await f.api.advanceAdventureRestoreAudit(f.uid, request);
  assert.equal(retry.progress.checkpoint, p.checkpoint + 1);
  assert.equal(retry.progress.staging.auditJournals, Math.min(8, p.staging.artifactCount));
});
