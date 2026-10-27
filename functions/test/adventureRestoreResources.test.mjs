import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resourceReady,
  resourceStep,
  resourceFinish,
  resourceRequest,
} from './helpers/adventureRestoreResourcesFixture.mjs';
import {
  sourceScene,
  sourceArc,
  sourceMilestone,
  sourceEvent,
} from './helpers/adventureRestoreResourceArchiveFixture.mjs';
import { cleanup, mutation } from './helpers/adventureRestoreTransferFixture.mjs';
import { createAdventureRestoreRemapper } from '../src/adventureRestoreRemap.mjs';
import { createAdventureRestoreStore } from '../src/adventureRestoreStore.mjs';
import { createVerifiedAdventureRestoreContent } from '../src/adventureRestoreContentRead.mjs';
import {
  readAdventureStageArtifact,
  adventureStageArtifactId,
  prepareAdventureStageArtifacts,
} from '../src/adventureRestoreArtifacts.mjs';
import { digest, sequenceKey } from '../src/narrativeContracts.mjs';
const prefix = (p) => 'adventures/' + p.adventureId;
const map = (f, p) =>
  createAdventureRestoreRemapper({
    schemaVersion: 1,
    jobToken: p.jobToken,
    sourceAdventureId: f.records.get(f.path).validation.summary.sourceAdventureId,
    adventureId: p.adventureId,
  });
async function checkedJournals(f, p) {
  const store = createAdventureRestoreStore({ db: f.db });
  for (const path of [...f.records.keys()].filter((k) =>
    k.startsWith(f.path + '/stagingArtifacts/'),
  ))
    await f.db.runTransaction(async (tx) => {
      const loaded = await store.load(tx, f.uid, f.id, p.jobToken);
      const a = await readAdventureStageArtifact(store, tx, loaded, await tx.get(f.db.doc(path)), {
        withValue: true,
      });
      assert.ok(a.data);
    });
}
test('resources retain native values, derived references and original artifact birth without exposing the root', async () => {
  const { f, p } = await resourceReady(),
    original = structuredClone(f.metadata.get(prefix(p) + '/workProgress/current')),
    end = await resourceFinish(f, p),
    m = map(f, p),
    root = prefix(p);
  assert.equal(end.staging.phase, 'resources-ready');
  assert.equal(end.staging.itemIndex, p.staging.itemIndex);
  assert.equal(end.staging.resourceIndex, end.staging.itemIndex);
  assert.equal(end.staging.resourcesProcessed, 16);
  assert.equal(end.staging.checklistTotal, 1);
  assert.equal(end.staging.checklistCompleted, 1);
  assert.equal(f.records.get(root).ownerId, undefined);
  assert.equal(f.records.get(root + '/workProgress/current').countReady, false);
  assert.equal(f.records.get(root + '/workProgress/current').wordGoal, 12345);
  assert.equal(f.records.get(root + '/workProgress/current').editorialState, 'review');
  assert.equal(f.records.get(root + '/workProgress/current').checklistCompleted, 1);
  assert.equal(
    f.metadata.get(root + '/workProgress/current').createdAtNanoseconds,
    original.createdAtNanoseconds,
  );
  assert.deepEqual(f.records.get(root + '/narrativeControls/entity-scenes'), {
    complete: true,
    processed: 3,
  });
  assert.equal(
    f.records.get(root + '/narrativeControls/' + sequenceKey({ kind: 'arc' })).rankSlot,
    'B',
  );
  assert.equal(f.records.has(root + '/narrativeControls/' + sequenceKey({ kind: 'event' })), false);
  const arc = m.identity('arc', sourceArc),
    scene = m.identity('scene', sourceScene),
    milestone = m.identity('milestone', sourceMilestone, sourceArc);
  assert.equal(f.records.get(root + '/arcs/' + arc).objective, 'Goal');
  assert.equal(
    f.records.get(root + '/arcs/' + arc + '/milestones/' + milestone).notes,
    'PRIVATE_NOTES',
  );
  assert.equal(
    f.records.get(root + '/timelineEvents/' + m.identity('event', sourceEvent)).dateLabel,
    '3º dia do inverno',
  );
  assert.equal(
    f.records.get(root + '/scenes/' + scene + '/planning/current').objective,
    'PRIVATE_OBJECTIVE',
  );
  const links = [...f.records.entries()].filter(([k]) => k.startsWith(root + '/narrativeLinks/'));
  assert.equal(links.length, 1);
  assert.equal(links[0][1].reference.sceneId, scene);
  assert.equal(links[0][1].source.arcId, arc);
  assert.equal(f.records.get(root + '/arcs/' + arc).referenceCount, 0);
  assert.equal(
    [...f.records.keys()].filter((k) => k.startsWith(root + '/sceneLoreLinks/')).length,
    3,
  );
  assert.equal(
    [...f.records.keys()].some((k) => k.startsWith('universes/')),
    false,
  );
  assert.doesNotMatch(JSON.stringify(end), /PRIVATE_|resourceCounts|sourceToken/);
  await checkedJournals(f, end);
});
test('milestone before arc ensures the authenticated parent once, including its first creator receipt', async () => {
  const { f, p } = await resourceReady({ milestoneFirst: true }),
    end = await resourceFinish(f, p),
    m = map(f, p);
  const address = { scope: 'adventure', path: ['arcs', m.identity('arc', sourceArc)] };
  const journal = f.records.get(f.path + '/stagingArtifacts/' + adventureStageArtifactId(address));
  assert.equal(journal.createdByOperationId, journal.updatedByOperationId);
  assert.equal(
    end.staging.artifactCount,
    [...f.records.keys()].filter((k) => k.startsWith(f.path + '/stagingArtifacts/')).length,
  );
  await checkedJournals(f, end);
  assert.equal((await cleanup(f, end, 3)).state, 'cancelled');
});
test('more than fifty scene descendants are removed before parents across bounded cleanup pages', async () => {
  const { f, p } = await resourceReady({ references: 65 }),
    end = await resourceFinish(f, p),
    root = prefix(p);
  assert.equal(f.records.get(root + '/narrativeControls/entity-scenes').processed, 65);
  assert.equal(
    [...f.records.keys()].filter(
      (k) => k.startsWith(root + '/scenes/') && k.includes('/references/'),
    ).length,
    65,
  );
  const start = f.commits.length,
    cancelled = await cleanup(f, end, 50);
  assert.equal(cancelled.staging.cleanedArtifacts, end.staging.artifactCount);
  assert.deepEqual(
    [...f.records.keys()].filter((k) => k.startsWith(root + '/')),
    [],
  );
  const deletions = f.commits
      .slice(start)
      .flat()
      .filter((w) => w.method === 'delete')
      .map((w) => w.path),
    m = map(f, cancelled),
    parent = root + '/scenes/' + m.identity('scene', sourceScene);
  assert.ok(
    deletions.indexOf(parent) >
      Math.max(...deletions.map((k, i) => (k.startsWith(parent + '/references/') ? i : -1))),
  );
  assert.ok(f.reads.every((r) => r.count <= r.maximum));
  assert.ok(
    f.metadataReads
      .filter((r) => r.path.startsWith(root + '/'))
      .every((r) => !r.fields.includes('content')),
  );
});
test('same operation race, competing checkpoint and historic replay never duplicate resource writes', async () => {
  const { f, p } = await resourceReady(),
    input = resourceRequest(p),
    pair = await Promise.all([
      f.api.advanceAdventureRestoreResources(f.uid, input),
      f.api.advanceAdventureRestoreResources(f.uid, input),
    ]);
  assert.deepEqual(pair[0], pair[1]);
  const current = pair[0].progress,
    race = await Promise.allSettled([
      resourceStep(f, current),
      f.api.advanceAdventureRestoreResources(f.uid, {
        ...resourceRequest(current),
        operationId: 'resource-competitor-0001',
      }),
    ]);
  assert.equal(race.filter((v) => v.status === 'fulfilled').length, 1);
  const replay = await f.api.advanceAdventureRestoreResources(f.uid, input);
  assert.equal(replay.progress.checkpoint, p.checkpoint + 2);
  assert.deepEqual(replay.receipt, pair[0].receipt);
});
test('commit failure rolls back updates, new index, journal and receipt and allows exact retry', async () => {
  const { f, p } = await resourceReady(),
    before = structuredClone([...f.records]),
    run = f.db.runTransaction.bind(f.db);
  f.db.runTransaction = (cb) =>
    run((tx) =>
      cb({
        ...tx,
        update(ref, value) {
          if (ref.path === f.path) throw Error('resource commit unavailable');
          return tx.update(ref, value);
        },
      }),
    );
  await assert.rejects(() => resourceStep(f, p), /resource commit unavailable/);
  assert.deepEqual([...f.records], before);
  f.db.runTransaction = run;
  const next = await resourceStep(f, p);
  assert.equal(next.checkpoint, p.checkpoint + 1);
  await checkedJournals(f, next);
});
test('cancel winning a delayed source read prevents every resource effect', async () => {
  const { f, p } = await resourceReady(),
    run = f.db.runTransaction.bind(f.db);
  let calls = 0,
    cancelled;
  f.db.runTransaction = async (cb) => {
    if (++calls === 2) {
      f.db.runTransaction = run;
      cancelled = (
        await f.api.cancelAdventureRestore(f.uid, mutation(p, 'resource-cancel-race-0001'))
      ).progress;
    }
    return run(cb);
  };
  await assert.rejects(() => resourceStep(f, p));
  assert.equal(f.records.has(prefix(p) + '/narrativeControls/entity-scenes'), false);
  assert.equal((await cleanup(f, cancelled, 5)).state, 'cancelled');
});
test('changed prior target, missing target and ABA journal are refused before replacing the private definition', async () => {
  for (const mode of ['changed', 'missing', 'journal']) {
    const { f, p } = await resourceReady(),
      target = f.path + '/preparedRoot/current',
      address = { scope: 'job', path: ['preparedRoot', 'current'] },
      journal = f.path + '/stagingArtifacts/' + adventureStageArtifactId(address);
    if (mode === 'changed') f.records.get(target).injected = 'FOREIGN';
    else if (mode === 'missing') f.records.delete(target);
    else f.metadata.set(journal, { createdAt: 9999, updatedAt: 9999 });
    await assert.rejects(() => resourceStep(f, p));
    assert.equal(f.records.get(f.path).checkpoint, p.checkpoint);
    assert.equal(f.records.has(prefix(p) + '/narrativeControls/entity-scenes'), false);
  }
});
test('foreign descendant blocks parent deletion even beyond fifty valid references', async () => {
  const { f, p } = await resourceReady({ references: 65 }),
    end = await resourceFinish(f, p),
    m = map(f, end),
    parent = prefix(p) + '/scenes/' + m.identity('scene', sourceScene),
    foreign = parent + '/references/foreign';
  await f.db.runTransaction((tx) => tx.create(f.db.doc(foreign), { content: 'FOREIGN' }));
  await assert.rejects(() => cleanup(f, end, 7));
  assert.equal(f.records.get(foreign).content, 'FOREIGN');
  assert.ok(f.records.has(parent));
  assert.equal(f.records.get(f.path).state, 'cancelling');
});
test('absent planning is kept absent and oversized native planning fails without truncation', async () => {
  for (const oversized of [false, true]) {
    const { f, p } = await resourceReady({ planning: oversized, objective: 'x'.repeat(4001) }),
      m = map(f, p),
      target = prefix(p) + '/scenes/' + m.identity('scene', sourceScene) + '/planning/current';
    if (!oversized) {
      await resourceFinish(f, p);
      assert.equal(f.records.has(target), false);
    } else {
      let current = p;
      for (let n = 0; n < 100; n++) {
        const reader = await createVerifiedAdventureRestoreContent({
            db: f.db,
            uid: f.uid,
            restoreId: p.restoreId,
            jobToken: p.jobToken,
          }),
          unit = await reader.readItem(
            current.staging.resourceIndex ?? f.records.get(f.path).staging.resourceStartIndex,
          );
        if (unit.value.kind === 'scene-planning') break;
        current = await resourceStep(f, current);
      }
      await assert.rejects(() => resourceStep(f, current), {
        code: 'failed-precondition',
        details: { reason: 'native-compatibility' },
      });
      assert.equal(f.records.has(target), false);
      assert.equal(f.records.get(f.path).checkpoint, current.checkpoint);
      assert.equal((await cleanup(f, current, 5)).state, 'cancelled');
    }
  }
});
test('replacement removes omitted fields while retaining the original journal creator and native birth', async () => {
  const { f, p } = await resourceReady(),
    store = createAdventureRestoreStore({ db: f.db }),
    target = prefix(p) + '/workProgress/current',
    old = f.records.get(target),
    birth = structuredClone(f.metadata.get(target)),
    request = mutation(p, 'resource-replace-contract-0001');
  const result = await f.db.runTransaction(async (tx) => {
    const loaded = await store.load(tx, f.uid, f.id, p.jobToken),
      a = await prepareAdventureStageArtifacts(
        store,
        tx,
        loaded,
        request.operationId,
        [
          {
            address: { scope: 'adventure', path: ['workProgress', 'current'] },
            mode: 'update',
            update: (data) => {
              delete data.wordGoal;
              return data;
            },
          },
        ],
        'a'.repeat(64),
      );
    assert.equal(a.count, 0);
    const record = store.next(loaded, request, 'advanceAdventureRestoreResources', {});
    a.commit();
    return store.commit(tx, loaded, request, 'advanceAdventureRestoreResources', record, a.effects);
  });
  assert.ok(Object.hasOwn(old, 'wordGoal'));
  assert.equal(Object.hasOwn(f.records.get(target), 'wordGoal'), false);
  assert.equal(f.metadata.get(target).createdAtNanoseconds, birth.createdAtNanoseconds);
  await checkedJournals(f, result.progress);
  assert.equal(
    digest(f.records.get(target)),
    f.records.get(
      f.path +
        '/stagingArtifacts/' +
        adventureStageArtifactId({ scope: 'adventure', path: ['workProgress', 'current'] }),
    ).valueHash,
  );
});

test('automatic transaction callback retry rebuilds resource effects without double counters', async () => {
  const { f, p } = await resourceReady(),
    run = f.db.runTransaction.bind(f.db);
  let retried = false;
  f.db.runTransaction = async (cb) => {
    try {
      return await run((tx) =>
        cb({
          ...tx,
          update(ref, value) {
            if (ref.path === f.path && !retried) {
              retried = true;
              throw Error('RETRY_RESOURCE_CALLBACK');
            }
            return tx.update(ref, value);
          },
        }),
      );
    } catch (error) {
      if (error.message !== 'RETRY_RESOURCE_CALLBACK') throw error;
      return run(cb);
    }
  };
  const next = await resourceStep(f, p);
  assert.equal(retried, true);
  assert.equal(next.checkpoint, p.checkpoint + 1);
  assert.equal(next.staging.resourcesProcessed, 1);
  assert.equal(
    [...f.records.keys()].filter((k) => k === prefix(p) + '/narrativeControls/entity-scenes')
      .length,
    1,
  );
  await checkedJournals(f, next);
});
test('new resource metadata stays closed and external phase/cursor overrides are rejected', async () => {
  const { f, p } = await resourceReady(),
    next = await resourceStep(f, p),
    record = f.records.get(f.path);
  await assert.rejects(
    () =>
      f.api.advanceAdventureRestoreResources(f.uid, { ...resourceRequest(next), resourceIndex: 0 }),
    { code: 'invalid-argument' },
  );
  await assert.rejects(() =>
    f.api.advanceAdventureRestoreResources('stranger', resourceRequest(next)),
  );
  const prior = structuredClone(record.staging);
  for (const patch of [
    { resourceIndex: 0 },
    { resourcesProcessed: 999 },
    { resourceCounts: { ...prior.resourceCounts, foreign: 1 } },
    { checklistTotal: 999 },
  ]) {
    record.staging = { ...prior, ...patch };
    await assert.rejects(
      () => f.api.getAdventureRestore(f.uid, { restoreId: p.restoreId, jobToken: p.jobToken }),
      { code: 'failed-precondition' },
    );
  }
  record.staging = prior;
  assert.equal(
    (await f.api.getAdventureRestore(f.uid, { restoreId: p.restoreId, jobToken: p.jobToken }))
      .checkpoint,
    next.checkpoint,
  );
});

test('an uncreated arc with foreign milestone cannot be adopted or certified by cancellation', async () => {
  const { f, p } = await resourceReady({ milestoneFirst: true }),
    m = map(f, p),
    parent = prefix(p) + '/arcs/' + m.identity('arc', sourceArc),
    foreign = parent + '/milestones/foreign';
  await f.db.runTransaction((tx) => tx.create(f.db.doc(foreign), { notes: 'FOREIGN_MILESTONE' }));
  let current = p;
  for (let n = 0; n < 100; n++) {
    const reader = await createVerifiedAdventureRestoreContent({
      db: f.db,
      uid: f.uid,
      restoreId: p.restoreId,
      jobToken: p.jobToken,
    });
    const unit = await reader.readItem(
      current.staging.resourceIndex ?? f.records.get(f.path).staging.resourceStartIndex,
    );
    if (unit.value.kind === 'milestone') break;
    current = await resourceStep(f, current);
  }
  await assert.rejects(() => resourceStep(f, current));
  assert.equal(f.records.has(parent), false);
  await assert.rejects(() => cleanup(f, current, 50));
  assert.equal(f.records.get(foreign).notes, 'FOREIGN_MILESTONE');
  assert.equal(f.records.get(f.path).state, 'cancelling');
});
