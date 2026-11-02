import test from 'node:test';
import assert from 'node:assert/strict';
import {
  personaLibraryFixture,
  finishPersonaLibrary,
  libraryRequest,
} from './helpers/adventureRestorePersonaLibraryFixture.mjs';
import { mutation, cleanup } from './helpers/adventureRestoreTransferFixture.mjs';
import {
  readAvailablePersonaMetadata,
  readPersonaRestoreBatchProof,
} from '../src/personaAvailability.mjs';
import { adventureRestorePersonaOrigin } from '../src/adventureRestorePersonaLibraryBatch.mjs';
import { createAdventureRestoreStore } from '../src/adventureRestoreStore.mjs';
import { adventureStageArtifactId } from '../src/adventureRestoreArtifacts.mjs';
const batchPath = (f, p) => 'users/' + f.uid + '/aiPersonaRestoreBatches/' + p.adventureId;
const profilePath = (f, id) => 'users/' + f.uid + '/aiPersonas/' + id;
const origin = (p) => ({
  schemaVersion: 2,
  target: { kind: 'adventure', id: p.adventureId },
  restoreId: p.restoreId,
  jobToken: p.jobToken,
});
const installed = (f) =>
  [...f.records].filter(
    ([k, v]) => k.startsWith('users/' + f.uid + '/aiPersonas/') && v.restoreOrigin,
  );
const definitions = (f) =>
  [...f.records].filter(
    ([k, v]) => k.startsWith(f.path + '/preparedRoot/') && v.kind === 'adventure-restore-persona',
  );
const step = async (f, p) =>
  (await f.api.advanceAdventureRestorePersonaLibrary(f.uid, libraryRequest(p))).progress;
async function proof(f, p, state) {
  return f.db.runTransaction((tx) =>
    readPersonaRestoreBatchProof(tx, f.db, f.uid, origin(p), state),
  );
}

test('installs exact deduplicated archived snapshots and preserves bindings/overrides without enabling library or root', async () => {
  const { f, p } = await personaLibraryFixture({
      profilePatch: { archived: true, revision: 17, createdAt: 123, updatedAt: 456 },
    }),
    defs = definitions(f),
    originals = new Map([...f.records].filter(([k]) => k.startsWith('adventures/'))),
    end = await finishPersonaLibrary(f, p),
    rows = installed(f);
  assert.equal(defs.length, 1);
  assert.equal(p.staging.personaAdventureBindings + p.staging.personaSceneBindings, 2);
  assert.equal(rows.length, 1);
  assert.equal(end.staging.personaLibraryInstalled, 1);
  assert.deepEqual(rows[0][1], { ...defs[0][1].profile, restoreOrigin: origin(p) });
  assert.equal(rows[0][1].archived, true);
  assert.equal(rows[0][1].revision, 17);
  assert.equal(end.staging.artifactCount, p.staging.artifactCount + 1);
  for (const [k, v] of originals) assert.deepEqual(f.records.get(k), v);
  assert.equal(f.records.get('adventures/' + p.adventureId).ownerId, undefined);
  assert.ok(await proof(f, end, 'preparing'));
  assert.equal(await proof(f, end, 'active'), null);
  assert.equal(
    await f.db.runTransaction((tx) => readAvailablePersonaMetadata(tx, f.db, f.uid, rows[0][1].id)),
    null,
  );
  assert.doesNotMatch(JSON.stringify(end.staging), /After|profileHash|PRIVATE_|target|sourceToken/);
  const cancelled = await cleanup(f, end, 50);
  assert.equal(cancelled.state, 'cancelled');
  assert.equal(installed(f).length, 0);
  assert.equal(f.records.get(batchPath(f, p)).state, 'cancelled');
  assert.ok(await proof(f, cancelled, 'cancelled'));
});
test('one unit writes at most one profile and native batch/receipt/journal together, even with distinct profiles', async () => {
  const { f, p } = await personaLibraryFixture({ distinctSceneProfile: true }),
    defs = definitions(f);
  assert.equal(defs.length, 2);
  const first = await step(f, p),
    batch = f.records.get(batchPath(f, p));
  assert.equal(first.staging.personaLibraryInstalled, 1);
  assert.equal(first.staging.phase, 'persona-library');
  assert.equal(batch.profileCount, 1);
  const writes = f.commits.at(-1);
  assert.equal(
    writes.filter((w) => w.method === 'create' && w.path.includes('/aiPersonas/')).length,
    1,
  );
  const end = await finishPersonaLibrary(f, first);
  assert.equal(end.staging.personaLibraryInstalled, 2);
  assert.equal(installed(f).length, 2);
  assert.equal(end.checkpoint, p.checkpoint + 3);
  assert.ok(await proof(f, end, 'preparing'));
});
test('same-operation replay and competing checkpoint never duplicate a profile or increment the batch twice', async () => {
  const { f, p } = await personaLibraryFixture(),
    input = libraryRequest(p),
    [a, b] = await Promise.all([
      f.api.advanceAdventureRestorePersonaLibrary(f.uid, input),
      f.api.advanceAdventureRestorePersonaLibrary(f.uid, input),
    ]);
  assert.deepEqual(a, b);
  assert.equal(installed(f).length, 1);
  await assert.rejects(() =>
    f.api.advanceAdventureRestorePersonaLibrary(f.uid, mutation(p, 'library-other-operation')),
  );
  assert.deepEqual(
    (await f.api.advanceAdventureRestorePersonaLibrary(f.uid, input)).receipt,
    a.receipt,
  );
});
test('failed commit rolls back batch/profile/journal and automatic retry installs only once', async () => {
  const { f, p } = await personaLibraryFixture(),
    before = structuredClone([...f.records]),
    run = f.db.runTransaction,
    abort = new Error('rollback');
  let once = true;
  f.db.runTransaction = (fn) =>
    run(async (tx) => {
      const result = await fn(tx);
      if (once) {
        once = false;
        throw abort;
      }
      return result;
    });
  await assert.rejects(
    () => step(f, p),
    (e) => e === abort,
  );
  f.db.runTransaction = run;
  assert.deepEqual([...f.records], before);
  let retry = true;
  f.db.runTransaction = async (callback) => {
    if (retry) {
      retry = false;
      await assert.rejects(
        () =>
          run(async (tx) => {
            await callback(tx);
            throw abort;
          }),
        (e) => e === abort,
      );
    }
    return run(callback);
  };
  assert.equal((await step(f, p)).staging.personaLibraryInstalled, 1);
  f.db.runTransaction = run;
  assert.equal(installed(f).length, 1);
});
test('even an identical existing profile is preserved rather than adopted; cancellation preserves unrelated library data', async () => {
  const { f, p } = await personaLibraryFixture(),
    profile = definitions(f)[0][1].profile,
    path = profilePath(f, profile.id),
    manual = 'users/' + f.uid + '/aiPersonas/custom-unrelated';
  await f.db.runTransaction((tx) => {
    tx.create(f.db.doc(path), profile);
    tx.create(f.db.doc(manual), { kept: true });
  });
  const before = structuredClone(f.records.get(path));
  await assert.rejects(() => step(f, p));
  assert.equal(f.records.has(batchPath(f, p)), false);
  assert.deepEqual(f.records.get(path), before);
  assert.equal((await cleanup(f, p, 50)).state, 'cancelled');
  assert.deepEqual(f.records.get(path), before);
  assert.equal(f.records.get(manual).kept, true);
});
test('zero profiles still creates a provable pending batch and follows revocation before cleanup', async () => {
  const { f, p } = await personaLibraryFixture({ personas: false }),
    end = await step(f, p);
  assert.equal(end.staging.phase, 'persona-library-ready');
  assert.equal(end.staging.personaLibraryInstalled, 0);
  assert.ok(await proof(f, end, 'preparing'));
  const cancelled = await cleanup(f, end, 50);
  assert.equal(cancelled.staging.personaLibraryRevoked, true);
  assert.ok(await proof(f, cancelled, 'cancelled'));
});
test('first cleanup unit revokes the batch without deleting any profile; partial cancellation remains unavailable', async () => {
  const { f, p } = await personaLibraryFixture({ distinctSceneProfile: true }),
    first = await step(f, p),
    cancelling = (
      await f.api.cancelAdventureRestore(f.uid, mutation(first, 'library-cancel-partial-001'))
    ).progress,
    before = installed(f).map(([k]) => k),
    revoked = (
      await f.api.advanceAdventureRestoreCleanup(
        f.uid,
        mutation(cancelling, 'library-revoke-first-001', { limit: 1 }),
      )
    ).progress;
  assert.equal(revoked.cleanupPhase, cancelling.cleanupPhase);
  assert.equal(revoked.staging.personaLibraryRevoked, true);
  assert.deepEqual(
    installed(f).map(([k]) => k),
    before,
  );
  assert.ok(await proof(f, revoked, 'cancelled'));
  assert.equal((await cleanup(f, revoked, 1)).state, 'cancelled');
  assert.equal(installed(f).length, 0);
});
for (const target of ['profile', 'journal', 'batch'])
  test(
    'recreated ' + target + ' is preserved and cannot be adopted or cleaned as the old incarnation',
    async () => {
      const { f, p } = await personaLibraryFixture(),
        first = await step(f, p),
        id = installed(f)[0][1].id,
        address = { scope: 'persona', path: ['aiPersonas', id] },
        path =
          target === 'profile'
            ? profilePath(f, id)
            : target === 'batch'
              ? batchPath(f, p)
              : f.path + '/stagingArtifacts/' + adventureStageArtifactId(address),
        value = f.records.get(path);
      await f.db.runTransaction((tx) => tx.delete(f.db.doc(path)));
      await f.db.runTransaction((tx) => tx.create(f.db.doc(path), value));
      if (target === 'batch') await assert.rejects(() => step(f, first));
      await assert.rejects(() => cleanup(f, first, 50));
      assert.deepEqual(f.records.get(path), value);
    },
  );
test('missing prepared definitions and foreign pending batches cannot be adopted', async () => {
  const { f, p } = await personaLibraryFixture(),
    def = definitions(f)[0][0];
  await f.db.runTransaction((tx) => tx.delete(f.db.doc(def)));
  await assert.rejects(() => step(f, p));
  const g = await personaLibraryFixture();
  await g.f.db.runTransaction((tx) =>
    tx.create(g.f.db.doc(batchPath(g.f, g.p)), { foreign: true }),
  );
  await assert.rejects(() => step(g.f, g.p));
  assert.deepEqual(g.f.records.get(batchPath(g.f, g.p)), { foreign: true });
});
test('closed metadata and client inputs reject supplied cursor/counts and other accounts', async () => {
  const { f, p } = await personaLibraryFixture(),
    input = libraryRequest(p),
    { validAdventureStagingMeta, validAdventureStagingView } =
      await import('../src/adventureRestoreStagingMeta.mjs');
  await assert.rejects(() => f.api.advanceAdventureRestorePersonaLibrary('other', input));
  await assert.rejects(() =>
    f.api.advanceAdventureRestorePersonaLibrary(f.uid, { ...input, after: null }),
  );
  const first = await step(f, p),
    job = f.records.get(f.path);
  assert.equal(
    validAdventureStagingView({
      ...p.staging,
      personaLibraryInstalled: 0,
      personaLibraryRevoked: false,
    }),
    false,
  );
  assert.equal(
    validAdventureStagingMeta({ ...job.staging, personaLibraryInstalled: 2 }, job),
    false,
  );
  assert.equal(
    validAdventureStagingMeta({ ...job.staging, personaLibraryRevoked: true }, job),
    false,
  );
  assert.equal(validAdventureStagingMeta({ ...job.staging, phase: 'universe-ready' }, job), false);
  const store = createAdventureRestoreStore({ db: f.db }),
    loaded = await f.db.runTransaction((tx) => store.load(tx, f.uid, p.restoreId, p.jobToken));
  assert.deepEqual(adventureRestorePersonaOrigin(loaded), origin(first));
});

test('altered private snapshot and altered native batch cannot install or authorize further units', async () => {
  const { f, p } = await personaLibraryFixture(),
    [path, definition] = definitions(f)[0];
  await f.db.runTransaction((tx) =>
    tx.update(f.db.doc(path), { profile: { ...definition.profile, name: 'Foreign' } }),
  );
  await assert.rejects(() => step(f, p));
  assert.equal(installed(f).length, 0);
  assert.equal(f.records.has(batchPath(f, p)), false);
  const g = await personaLibraryFixture({ distinctSceneProfile: true }),
    first = await step(g.f, g.p);
  await g.f.db.runTransaction((tx) =>
    tx.update(g.f.db.doc(batchPath(g.f, g.p)), { profileCount: 2 }),
  );
  await assert.rejects(() => step(g.f, first));
  await assert.rejects(() => cleanup(g.f, first, 50));
  assert.equal(installed(g.f).length, 1);
});
test('unknown global profile or batch namespace blocks completion rather than adopting or deleting it', async () => {
  const { f, p } = await personaLibraryFixture({ personas: false }),
    path = 'users/' + f.uid + '/aiPersonas/custom-' + 'f'.repeat(64),
    value = { id: 'custom-' + 'f'.repeat(64), restoreOrigin: origin(p), foreign: true };
  await f.db.runTransaction((tx) => tx.create(f.db.doc(path), value));
  await assert.rejects(() => step(f, p));
  await assert.rejects(() => cleanup(f, p, 50));
  assert.deepEqual(f.records.get(path), value);
});
