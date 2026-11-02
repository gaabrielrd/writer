import test from 'node:test';
import assert from 'node:assert/strict';
import { transferFixture, mutation, cleanup } from './helpers/adventureRestoreTransferFixture.mjs';
import { prepareUniverseAdventure } from './helpers/adventureRestoreUniverseFixture.mjs';
import { createUniverseService } from '../src/universes.mjs';
import { createAdventureRestoreStore } from '../src/adventureRestoreStore.mjs';
import { createVerifiedAdventureRestoreContent } from '../src/adventureRestoreContentRead.mjs';
import { prepareAdventureRestoreUniverseLink } from '../src/adventureRestoreUniverse.mjs';
import { born } from '../src/adventureRestoreContracts.mjs';
import { adventureStageArtifactId } from '../src/adventureRestoreArtifacts.mjs';
const worldPath = 'universes/world';
async function ready(kind = 'reference') {
  const f = transferFixture();
  await createUniverseService({ db: f.db, now: () => 1000 }).createUniverse(f.uid, {
    creationId: 'world',
    name: 'GLOBAL_PRIVATE_NAME',
    description: 'GLOBAL_PRIVATE_TEXT',
  });
  await f.db.runTransaction((tx) =>
    tx.create(f.db.doc(worldPath + '/lore/entity'), { details: 'GLOBAL_PRIVATE_LORE' }),
  );
  const origin =
    kind === 'reference'
      ? { kind, id: 'world', created: born(await f.db.doc(worldPath).get()) }
      : kind === 'none'
        ? { kind }
        : { kind, id: 'world' };
  return { f, origin, p: await prepareUniverseAdventure(f.api, f.uid, origin) };
}
const req = (p) => mutation(p, 'universe-advance-' + String(p.checkpoint).padStart(8, '0'));
const stage = async (f, p) => (await f.api.advanceAdventureRestoreUniverse(f.uid, req(p))).progress;
const worlds = (f) => structuredClone([...f.records].filter(([k]) => k.startsWith('universes/')));
const candidate = (f) => f.records.get(f.path + '/preparedRoot/universe-candidate');
async function context(f, p) {
  const store = createAdventureRestoreStore({ db: f.db, now: () => 3000 }),
    reader = await createVerifiedAdventureRestoreContent({
      db: f.db,
      uid: f.uid,
      restoreId: p.restoreId,
      jobToken: p.jobToken,
    }),
    item = await reader.readItem(f.records.get(f.path).staging.historyStartIndex);
  return { store, item };
}
async function link(f, p, effect = () => {}, supplied = null) {
  const c = supplied ?? (await context(f, p));
  return f.db.runTransaction(async (tx) => {
    const loaded = await c.store.load(tx, f.uid, p.restoreId, p.jobToken),
      plan = await prepareAdventureRestoreUniverseLink(tx, c.store, loaded, c.item);
    await effect(tx, plan);
    return { observed: plan.observed, universeId: plan.universeId };
  });
}

test('own original universe is selected privately without global reads or writes beyond masked authorization', async () => {
  const { f, p, origin } = await ready(),
    before = worlds(f);
  f.metadataReads.length = 0;
  const end = await stage(f, p);
  assert.equal(end.staging.phase, 'universe-ready');
  assert.equal(end.staging.universeOutcome, 'available');
  assert.equal(end.staging.itemIndex, p.staging.itemIndex);
  assert.equal(end.staging.artifactCount, p.staging.artifactCount);
  assert.equal(f.records.get(f.path + '/preparedRoot/current').value.universeId, 'world');
  assert.deepEqual(candidate(f), {
    schemaVersion: 1,
    origin,
    pendingAuthorization: false,
    itemIndex: f.records.get(f.path).staging.historyStartIndex,
    observed: 'available',
  });
  assert.deepEqual(worlds(f), before);
  assert.deepEqual(
    f.metadataReads.filter((v) => v.path.startsWith('universes/')),
    [{ path: worldPath, fields: ['authorId', 'deleting'] }],
  );
  assert.equal(f.records.get('adventures/' + end.adventureId).ownerId, undefined);
  assert.equal(
    f.records.get('adventures/' + end.adventureId + '/workProgress/current').countReady,
    false,
  );
  assert.doesNotMatch(JSON.stringify(end), /GLOBAL_|"created":|sourceToken|universeId/);
  assert.equal((await cleanup(f, end, 50)).state, 'cancelled');
  assert.deepEqual(worlds(f), before);
});

test('none and unavailable origins never query or promote a coincident owned universe', async () => {
  for (const kind of ['none', 'unavailable']) {
    const { f, p } = await ready(kind),
      before = worlds(f);
    f.metadataReads.length = 0;
    const end = await stage(f, p),
      result = await link(f, end);
    assert.equal(end.staging.universeOutcome, kind);
    assert.equal(result.universeId, null);
    assert.equal(f.metadataReads.filter((v) => v.path.startsWith('universes/')).length, 0);
    assert.equal(f.records.get(f.path + '/preparedRoot/current').value.universeId, null);
    assert.deepEqual(worlds(f), before);
  }
});
for (const state of ['missing', 'foreign', 'public-foreign', 'deleting', 'recreated', 'nanosecond'])
  test(state + ' original is unavailable without copying or adopting a replacement', async () => {
    const { f, p } = await ready(),
      value = f.records.get(worldPath);
    if (state === 'missing' || state === 'recreated')
      await f.db.runTransaction((tx) => tx.delete(f.db.doc(worldPath)));
    if (state === 'recreated')
      await f.db.runTransaction((tx) => tx.create(f.db.doc(worldPath), value));
    if (state === 'nanosecond') f.metadata.get(worldPath).createdAtNanoseconds++;
    if (['foreign', 'public-foreign', 'deleting'].includes(state))
      await f.db.runTransaction((tx) =>
        tx.update(
          f.db.doc(worldPath),
          state === 'deleting'
            ? { deleting: true }
            : { authorId: 'other', isPublic: state === 'public-foreign' },
        ),
      );
    const before = worlds(f),
      end = await stage(f, p);
    assert.equal(end.staging.universeOutcome, 'unavailable');
    assert.equal(f.records.get(f.path + '/preparedRoot/current').value.universeId, null);
    assert.deepEqual(worlds(f), before);
  });

test('legitimate edits preserve identity and final native counter/link compose atomically', async () => {
  const { f, p } = await ready();
  await f.db.runTransaction((tx) =>
    tx.update(f.db.doc(worldPath), { name: 'Edited', updatedAt: 2000 }),
  );
  const end = await stage(f, p),
    before = structuredClone([...f.records]),
    abort = new Error('abort');
  await assert.rejects(
    () =>
      link(f, end, (tx, plan) => {
        plan.commit();
        tx.set(f.db.doc('adventures/' + end.adventureId), {
          ownerId: f.uid,
          universeId: plan.universeId,
        });
        throw abort;
      }),
    (e) => e === abort,
  );
  assert.deepEqual([...f.records], before);
  await link(f, end, (tx, plan) => {
    plan.commit();
    // Synthetic activation harness only: production remains private.
    tx.set(f.db.doc('adventures/' + end.adventureId), {
      ownerId: f.uid,
      universeId: plan.universeId,
    });
  });
  assert.equal(f.records.get(worldPath).adventureCount, 1);
  assert.equal(f.records.get(worldPath).bookCount, 0);
  assert.deepEqual(f.records.get(worldPath + '/adventures/' + end.adventureId), {
    adventureId: end.adventureId,
  });
  assert.equal(f.records.get(worldPath + '/lore/entity').details, 'GLOBAL_PRIVATE_LORE');
});
test('final link reauthorizes after available selection, including deletion and recreation', async () => {
  for (const state of ['foreign', 'missing', 'deleting', 'recreated']) {
    const { f, p } = await ready(),
      end = await stage(f, p),
      c = await context(f, end),
      value = f.records.get(worldPath);
    if (['missing', 'recreated'].includes(state))
      await f.db.runTransaction((tx) => tx.delete(f.db.doc(worldPath)));
    if (state === 'recreated')
      await f.db.runTransaction((tx) => tx.create(f.db.doc(worldPath), value));
    if (['foreign', 'deleting'].includes(state))
      await f.db.runTransaction((tx) =>
        tx.update(
          f.db.doc(worldPath),
          state === 'foreign' ? { authorId: 'other' } : { deleting: true },
        ),
      );
    const before = worlds(f),
      result = await link(f, end, (_tx, plan) => plan.commit(), c);
    assert.equal(result.universeId, null);
    assert.equal(result.observed, 'unavailable');
    assert.deepEqual(worlds(f), before);
  }
});
test('final link can regain the same original authorization but never promotes an unavailable descriptor', async () => {
  const { f, p } = await ready();
  await f.db.runTransaction((tx) => tx.update(f.db.doc(worldPath), { authorId: 'other' }));
  const end = await stage(f, p);
  assert.equal(end.staging.universeOutcome, 'unavailable');
  await f.db.runTransaction((tx) => tx.update(f.db.doc(worldPath), { authorId: f.uid }));
  assert.equal((await link(f, end)).universeId, 'world');
});
test('strict activation refuses inconsistent counters and existing native use', async () => {
  for (const patch of [
    { adventureCount: -1 },
    { adventureCount: Number.MAX_SAFE_INTEGER },
    { adventureCount: 0.5 },
  ]) {
    const { f, p } = await ready(),
      end = await stage(f, p);
    await f.db.runTransaction((tx) => tx.update(f.db.doc(worldPath), patch));
    const before = worlds(f);
    await assert.rejects(() => link(f, end));
    assert.deepEqual(worlds(f), before);
  }
  const { f, p } = await ready(),
    end = await stage(f, p);
  await f.db.runTransaction((tx) =>
    tx.create(f.db.doc(worldPath + '/adventures/' + end.adventureId), {
      adventureId: end.adventureId,
    }),
  );
  await assert.rejects(() => link(f, end));
});
test('rollback and repeated requests preserve a single selection; old receipts remain replayable', async () => {
  const { f, p } = await ready(),
    before = structuredClone([...f.records]),
    run = f.db.runTransaction,
    abort = new Error('rollback');
  let armed = true;
  f.db.runTransaction = (fn) =>
    run(async (tx) => {
      const result = await fn(tx);
      if (armed && result?.progress?.staging?.phase === 'universe-ready') {
        armed = false;
        throw abort;
      }
      return result;
    });
  await assert.rejects(
    () => stage(f, p),
    (e) => e === abort,
  );
  f.db.runTransaction = run;
  assert.deepEqual([...f.records], before);
  const results = await Promise.all([stage(f, p), stage(f, p)]);
  assert.deepEqual(results[0], results[1]);
  assert.deepEqual(await stage(f, p), results[0]);
  await assert.rejects(() =>
    f.api.advanceAdventureRestoreUniverse(f.uid, mutation(p, 'universe-competing-request')),
  );
  const cancelled = await cleanup(f, results[0], 50);
  assert.equal(cancelled.state, 'cancelled');
  assert.deepEqual(
    (await f.api.advanceAdventureRestoreUniverse(f.uid, req(p))).receipt,
    (await f.api.advanceAdventureRestoreUniverse(f.uid, req(p))).receipt,
  );
});
test('tampered candidate/root and recreated journals cannot be adopted or deleted', async () => {
  for (const id of ['current', 'universe-candidate']) {
    const { f, p } = await ready(),
      path = f.path + '/preparedRoot/' + id;
    await f.db.runTransaction((tx) => tx.update(f.db.doc(path), { foreign: true }));
    const before = structuredClone([...f.records]);
    await assert.rejects(() => stage(f, p));
    assert.deepEqual([...f.records], before);
    await assert.rejects(() => cleanup(f, p, 50));
    assert.equal(f.records.get(path).foreign, true);
  }
  const { f, p } = await ready(),
    address = { scope: 'job', path: ['preparedRoot', 'universe-candidate'] },
    journal = f.path + '/stagingArtifacts/' + adventureStageArtifactId(address),
    value = f.records.get(journal);
  await f.db.runTransaction((tx) => tx.delete(f.db.doc(journal)));
  await f.db.runTransaction((tx) => tx.create(f.db.doc(journal), value));
  await assert.rejects(() => stage(f, p));
});
test('closed inputs, private metadata and cancellation reject unauthorized advancement', async () => {
  const { f, p } = await ready();
  await assert.rejects(() => f.api.advanceAdventureRestoreUniverse('other', req(p)));
  await assert.rejects(() => f.api.advanceAdventureRestoreUniverse(null, req(p)));
  await assert.rejects(() =>
    f.api.advanceAdventureRestoreUniverse(f.uid, { ...req(p), universeId: 'world' }),
  );
  await f.api.cancelAdventureRestore(f.uid, mutation(p, 'universe-cancel-before-0001'));
  await assert.rejects(() => stage(f, p));
});

test('source pointer changed during preparation cannot produce a selection', async () => {
  const { f, p } = await ready(),
    sourcePath = [...f.records].find(
      ([k, v]) =>
        k.startsWith(f.path + '/validationItems/') &&
        v.index === f.records.get(f.path).staging.historyStartIndex,
    )[0],
    previous = f.records.get(sourcePath);
  await f.db.runTransaction((tx) =>
    tx.update(f.db.doc(sourcePath), { contentHash: 'f'.repeat(64) }),
  );
  const before = structuredClone([...f.records]);
  await assert.rejects(() => stage(f, p));
  assert.deepEqual([...f.records], before);
  assert.equal(candidate(f).pendingAuthorization, true);
  assert.notDeepEqual(f.records.get(sourcePath), previous);
});
test('private outcome metadata rejects inconsistent shape and draft versions remain intact', async () => {
  const { validAdventureStagingMeta, validAdventureStagingView } =
      await import('../src/adventureRestoreStagingMeta.mjs'),
    { f, p } = await ready(),
    end = await stage(f, p),
    job = f.records.get(f.path);
  assert.equal(validAdventureStagingMeta(job.staging, job), true);
  assert.equal(validAdventureStagingView({ ...end.staging, universeOutcome: 'owner' }), false);
  assert.equal(validAdventureStagingView({ ...p.staging, universeOutcome: 'available' }), false);
  assert.equal(validAdventureStagingView({ ...end.staging, draftOutcome: 'version' }), false);
  assert.equal(validAdventureStagingMeta({ ...job.staging, universeId: 'world' }, job), false);
  assert.equal(validAdventureStagingMeta({ ...job.staging, phase: 'draft-ready' }, job), false);
});

test('universe-ready preserves a real recovered draft and its native history metadata', async () => {
  const { historyDraftAdventureArchive } =
      await import('./helpers/adventureRestoreHistoryDraftFixture.mjs'),
    { historyReady, historyFinish } = await import('./helpers/adventureRestoreHistoryFixture.mjs'),
    { readHistoryVersion } = await import('../src/workHistoryContracts.mjs'),
    { f, p: start } = await historyReady(
      await historyDraftAdventureArchive({ draftContent: '<p>Rascunho mantido</p>' }),
    ),
    history = await historyFinish(f, start),
    draft = (
      await f.api.finalizeAdventureRestoreDraft(
        f.uid,
        mutation(history, 'universe-real-draft-final'),
      )
    ).progress,
    before = structuredClone(f.records.get(f.path + '/preparedRoot/current')),
    versionId = f.records.get(f.path + '/preparedRoot/recovered-draft').versionId,
    end = await stage(f, draft),
    version = await f.db.runTransaction((tx) =>
      readHistoryVersion(
        tx,
        f.db,
        {
          target: { kind: 'adventure', id: end.adventureId },
          path: 'adventures/' + end.adventureId,
        },
        versionId,
      ),
    );
  assert.equal(end.staging.phase, 'universe-ready');
  assert.equal(end.staging.draftOutcome, 'version');
  assert.equal(end.staging.draftWordCount, 2);
  assert.equal(version.wordCount, 2);
  assert.equal(
    f.records.get(f.path + '/preparedRoot/current').value.historyRevision,
    before.value.historyRevision,
  );
  assert.equal((await cleanup(f, end, 50)).state, 'cancelled');
});

test('malformed native birth fails with a typed identity error without changing selection', async () => {
  const { f, p } = await ready();
  f.metadata.get(worldPath).createdAt = -1000;
  const before = structuredClone([...f.records]);
  await assert.rejects(
    () => stage(f, p),
    (e) => e.code === 'failed-precondition' && e.details.reason === 'identity-conflict',
  );
  assert.deepEqual([...f.records], before);
});
test('final plan refuses a wrong source position and altered prepared origin', async () => {
  const { f, p } = await ready(),
    end = await stage(f, p),
    c = await context(f, end);
  await assert.rejects(
    () => link(f, end, () => {}, { ...c, item: null }),
    (e) => e.code === 'failed-precondition',
  );
  await assert.rejects(() =>
    link(f, end, () => {}, { ...c, item: { ...c.item, index: c.item.index + 1 } }),
  );
  await assert.rejects(() =>
    link(f, end, () => {}, { ...c, item: { ...c.item, sourceToken: 'f'.repeat(64) } }),
  );
  await assert.rejects(() =>
    link(f, end, () => {}, {
      ...c,
      item: { ...c.item, record: { ...c.item.record, id: 'wrong' } },
    }),
  );
  await f.db.runTransaction((tx) =>
    tx.update(f.db.doc(f.path + '/preparedRoot/universe-candidate'), { origin: { kind: 'none' } }),
  );
  const before = worlds(f);
  await assert.rejects(() => link(f, end, () => {}, c));
  assert.deepEqual(worlds(f), before);
});
