import test from 'node:test';
import assert from 'node:assert/strict';
import { createBookRestoreUploadService } from '../src/bookRestoreUpload.mjs';
import {
  inspectBookRestoreUniverse,
  prepareBookRestoreUniverseLink,
} from '../src/bookRestoreUniverse.mjs';
import {
  BOOK_RESTORE_METHODS,
  born,
  requestHash,
  mutationInput,
  preparationProgress,
} from '../src/bookRestoreUploadContracts.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import {
  readyRestoreUniverse,
  loadUniversePlanItem,
  loadedRestore,
} from './helpers/bookRestoreUniverseFixture.mjs';
import { bookLegacyFixture } from './helpers/bookLegacyFixture.mjs';
import { finishRestoreStructure } from './helpers/bookRestoreStructureFixture.mjs';
import { finishRestoreLore } from './helpers/bookRestoreLoreFixture.mjs';
import { finishRestoreResources } from './helpers/bookRestoreResourcesFixture.mjs';
import { finishRestoreCounts } from './helpers/bookRestoreCountsFixture.mjs';
import { finishRestorePersonas } from './helpers/bookRestorePersonasFixture.mjs';
import {
  uploadLegacyRestore,
  finishLegacyRestore,
  cleanupLegacyRestore,
  legacyMutation as mutation,
} from './helpers/bookLegacyRestoreFixture.mjs';
const uid = 'author',
  id = 'universe-restore01',
  root = 'users/' + uid + '/bookRestores/' + id;
function setup() {
  const f = adventureImportDb({ nativeUpdates: true }),
    factory = () => createBookRestoreUploadService({ db: f.db, now: () => 1000 });
  return { ...f, factory, api: factory() };
}
async function world(f, patch = {}) {
  await f.db.runTransaction((tx) => {
    tx.create(f.db.doc('universes/world'), {
      authorId: uid,
      name: 'GLOBAL NAME DO NOT COPY',
      description: 'GLOBAL BODY DO NOT COPY',
      updatedAt: 2,
      bookCount: 0,
      ...patch,
    });
    tx.create(f.db.doc('universes/world/lore/entity'), { details: 'GLOBAL LORE DO NOT COPY' });
  });
  return { kind: 'reference', id: 'world', created: born(await f.db.doc('universes/world').get()) };
}
const stage = async (f, p, op = 'universe-stage-0001') =>
  (await f.api.advanceBookRestoreUniverse(uid, mutation(id, p, op))).progress;
test('available origin is prepared with exact native birth, masked authorization and no world/link/root writes', async () => {
  const f = setup(),
    origin = await world(f),
    initial = await readyRestoreUniverse(f.factory, uid, id, origin),
    before = structuredClone([...f.records].filter(([k]) => k.startsWith('universes/')));
  f.metadataReads.length = 0;
  const p = await stage(f, initial);
  assert.equal(p.preparation.schemaVersion, 6);
  assert.equal(f.records.get(root).cleanupVersion, 9);
  assert.equal(p.preparation.phase, 'history');
  assert.deepEqual(p.preparation.universe, {
    schemaVersion: 1,
    itemIndex: initial.preparation.itemIndex,
    origin,
    observed: 'available',
  });
  assert.equal(p.preparation.itemIndex, initial.preparation.itemIndex + 1);
  assert.equal(p.preparation.artifactCount, initial.preparation.artifactCount);
  assert.deepEqual(
    [...f.records].filter(([k]) => k.startsWith('universes/')),
    before,
  );
  assert.equal(f.records.has('books/' + p.bookId), false);
  assert.equal(f.records.get('books/' + p.bookId + '/workProgress/current').countReady, false);
  assert.deepEqual(
    f.metadataReads.filter((v) => v.path.startsWith('universes/')),
    [{ path: 'universes/world', fields: ['authorId', 'deleting'] }],
  );
  assert.equal(JSON.stringify(p.preparation.universe).includes('GLOBAL'), false);
  assert.equal(BOOK_RESTORE_METHODS.includes('advanceBookRestoreUniverse'), true);
  const reader = await f.api.openVerifiedBookRestoreContent(uid, {
    restoreId: id,
    jobToken: p.jobToken,
  });
  assert.ok(
    ['work-version', 'work-history'].includes(
      (await reader.readMappedItem(p.preparation.itemIndex)).record.kind,
    ),
  );
  await assert.rejects(() =>
    f.api.advanceBookRestoreUniverse(uid, mutation(id, p, 'universe-after-stage')),
  );
});
test('unavailable and none never query/promote a current universe, even when the same ID is owned', async () => {
  for (const origin of [{ kind: 'none' }, { kind: 'unavailable', id: 'world' }]) {
    const f = setup();
    await world(f);
    const initial = await readyRestoreUniverse(f.factory, uid, id, origin);
    f.metadataReads.length = 0;
    const p = await stage(f, initial),
      item = await loadUniversePlanItem(f.api, uid, id, p);
    const plan = await f.db.runTransaction(async (tx) =>
      prepareBookRestoreUniverseLink(
        tx,
        f.db,
        await loadedRestore(f.db, tx, uid, id, p),
        item,
        () => 1000,
      ),
    );
    assert.equal(plan.universeId, null);
    assert.equal(p.preparation.universe.observed, origin.kind === 'none' ? 'none' : 'unavailable');
    assert.equal(f.metadataReads.filter((v) => v.path.startsWith('universes/')).length, 0);
    assert.equal(f.records.get('universes/world').bookCount, 0);
    assert.equal(f.records.has('universes/world/books/' + p.bookId), false);
  }
});
test('missing, foreign, public foreign, deleting and recreated references are indistinguishably unavailable', async () => {
  const results = [];
  for (const state of ['missing', 'foreign', 'public', 'deleting', 'recreated']) {
    const f = setup(),
      origin = await world(f),
      initial = await readyRestoreUniverse(f.factory, uid, id, origin);
    if (state === 'missing')
      await f.db.runTransaction((tx) => tx.delete(f.db.doc('universes/world')));
    else if (state === 'recreated') {
      const value = f.records.get('universes/world');
      await f.db.runTransaction((tx) => tx.delete(f.db.doc('universes/world')));
      await f.db.runTransaction((tx) => tx.create(f.db.doc('universes/world'), value));
    } else
      await f.db.runTransaction((tx) =>
        tx.update(
          f.db.doc('universes/world'),
          state === 'deleting'
            ? { deleting: true }
            : { authorId: 'other', isPublic: state === 'public' },
        ),
      );
    const p = await stage(f, initial);
    results.push(p.preparation.universe);
    assert.equal(p.preparation.universe.observed, 'unavailable');
  }
  for (const value of results) assert.deepEqual(value, results[0]);
});
test('native birth comparison detects a one-nanosecond mismatch and closes malformed descriptors', async () => {
  const f = setup(),
    origin = await world(f),
    invalid = {
      ...origin,
      created: { ...origin.created, nanoseconds: origin.created.nanoseconds + 1 },
    };
  const value = await f.db.runTransaction((tx) =>
    inspectBookRestoreUniverse(tx, f.db, uid, invalid),
  );
  assert.equal(value.universeId, null);
  for (const input of [
    { kind: 'reference', id: '../other', created: origin.created },
    { ...origin, grant: 'owner' },
    { ...origin, created: { seconds: 1, nanoseconds: 1e9 } },
  ])
    await assert.rejects(() =>
      f.db.runTransaction((tx) => inspectBookRestoreUniverse(tx, f.db, uid, input)),
    );
});
test('activation link plan rereads authorization and composes counter/ref/root atomically in a synthetic harness', async () => {
  const f = setup(),
    origin = await world(f),
    initial = await readyRestoreUniverse(f.factory, uid, id, origin),
    p = await stage(f, initial),
    item = await loadUniversePlanItem(f.api, uid, id, p),
    before = structuredClone([...f.records]),
    failure = new Error('activation harness abort');
  await assert.rejects(
    () =>
      f.db.runTransaction(async (tx) => {
        const plan = await prepareBookRestoreUniverseLink(
          tx,
          f.db,
          await loadedRestore(f.db, tx, uid, id, p),
          item,
          () => 3000,
        );
        assert.equal(plan.universeId, 'world');
        plan.commit();
        tx.create(f.db.doc('books/' + p.bookId), {
          authorId: uid,
          universeId: plan.universeId,
          title: 'Synthetic root',
        });
        throw failure;
      }),
    (e) => e === failure,
  );
  assert.deepEqual([...f.records], before);
  await f.db.runTransaction(async (tx) => {
    const plan = await prepareBookRestoreUniverseLink(
      tx,
      f.db,
      await loadedRestore(f.db, tx, uid, id, p),
      item,
      () => 3000,
    );
    plan.commit();
    // Test harness only: the production restoration does not activate a root yet.
    tx.create(f.db.doc('books/' + p.bookId), {
      authorId: uid,
      universeId: plan.universeId,
      title: 'Synthetic root',
    });
  });
  assert.equal(f.records.get('books/' + p.bookId).universeId, 'world');
  assert.equal(f.records.get('universes/world').bookCount, 1);
  assert.deepEqual(f.records.get('universes/world/books/' + p.bookId), { bookId: p.bookId });
  assert.equal(f.records.get('universes/world').description, 'GLOBAL BODY DO NOT COPY');
  await assert.rejects(() => f.api.cancelBookRestore(uid, mutation(id, p, 'universe-root-cancel')));
});
test('revocation or recreation after observation cannot authorize a final link from a stale available result', async () => {
  for (const state of ['foreign', 'recreated', 'deleting']) {
    const f = setup(),
      origin = await world(f),
      initial = await readyRestoreUniverse(f.factory, uid, id, origin),
      p = await stage(f, initial),
      item = await loadUniversePlanItem(f.api, uid, id, p);
    if (state === 'recreated') {
      const value = f.records.get('universes/world');
      await f.db.runTransaction((tx) => tx.delete(f.db.doc('universes/world')));
      await f.db.runTransaction((tx) => tx.create(f.db.doc('universes/world'), value));
    } else
      await f.db.runTransaction((tx) =>
        tx.update(
          f.db.doc('universes/world'),
          state === 'foreign' ? { authorId: 'other' } : { deleting: true },
        ),
      );
    const before = structuredClone([...f.records].filter(([k]) => k.startsWith('universes/')));
    const plan = await f.db.runTransaction(async (tx) =>
      prepareBookRestoreUniverseLink(tx, f.db, await loadedRestore(f.db, tx, uid, id, p), item),
    );
    assert.equal(plan.universeId, null);
    assert.equal(plan.observed, 'unavailable');
    assert.deepEqual(
      [...f.records].filter(([k]) => k.startsWith('universes/')),
      before,
    );
    assert.equal(p.preparation.universe.observed, 'available');
  }
});
test('inconsistent counters and a preexisting target usage block the strict plan instead of silently unlinking', async () => {
  for (const mode of ['counter', 'usage']) {
    const f = setup(),
      origin = await world(f),
      initial = await readyRestoreUniverse(f.factory, uid, id, origin),
      p = await stage(f, initial),
      item = await loadUniversePlanItem(f.api, uid, id, p);
    if (mode === 'counter')
      f.records.set('universes/world', { ...f.records.get('universes/world'), bookCount: -1 });
    else f.records.set('universes/world/books/' + p.bookId, { bookId: p.bookId });
    const before = structuredClone([...f.records]);
    await assert.rejects(() =>
      f.db.runTransaction(async (tx) =>
        prepareBookRestoreUniverseLink(tx, f.db, await loadedRestore(f.db, tx, uid, id, p), item),
      ),
    );
    assert.deepEqual([...f.records], before);
  }
});
for (const version of [1, 2, 3, 4, 5, 6])
  test(
    'legacy v' + version + ' never promotes an inline or missing universe to a live link',
    async () => {
      const f = setup();
      await world(f);
      const uploaded = await uploadLegacyRestore(f.api, uid, id, bookLegacyFixture(version)),
        validated = await finishLegacyRestore(f.factory, uid, id, uploaded.progress),
        structure = await finishRestoreStructure(f.factory, uid, id, validated),
        lore = await finishRestoreLore(f.factory, uid, id, structure),
        resources = await finishRestoreResources(f.factory, uid, id, lore),
        counts = await finishRestoreCounts(f.factory, uid, id, resources),
        personas = await finishRestorePersonas(f.factory, uid, id, counts);
      f.metadataReads.length = 0;
      const p = await stage(f, personas);
      assert.equal(p.preparation.universe.observed, version === 1 ? 'none' : 'unavailable');
      assert.equal(f.metadataReads.filter((v) => v.path.startsWith('universes/')).length, 0);
      const terminal = await cleanupLegacyRestore(f.api, uid, id, p, { limit: 7 });
      assert.equal(terminal.state, 'cancelled');
      assert.equal(f.records.get('universes/world').bookCount, 0);
    },
  );
test('receipt replay and competing checkpoints do not repeat the availability probe or touch counters', async () => {
  const f = setup(),
    origin = await world(f),
    initial = await readyRestoreUniverse(f.factory, uid, id, origin),
    request = mutation(id, initial, 'universe-race-00001'),
    results = await Promise.allSettled([
      f.api.advanceBookRestoreUniverse(uid, request),
      f.factory().advanceBookRestoreUniverse(uid, mutation(id, initial, 'universe-race-00002')),
    ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const winner = results.findIndex((r) => r.status === 'fulfilled'),
    first = results[winner].value,
    won = winner === 0 ? request : mutation(id, initial, 'universe-race-00002');
  await f.db.runTransaction((tx) => tx.update(f.db.doc('universes/world'), { authorId: 'other' }));
  f.metadataReads.length = 0;
  assert.deepEqual((await f.api.advanceBookRestoreUniverse(uid, won)).receipt, first.receipt);
  const resolved = await f.api.resolveBookRestoreOperation(uid, {
    restoreId: id,
    jobToken: initial.jobToken,
    operationId: won.operationId,
    requestHash: requestHash('advanceBookRestoreUniverse', mutationInput(won)),
  });
  assert.deepEqual(resolved.receipt, first.receipt);
  assert.equal(f.metadataReads.filter((v) => v.path.startsWith('universes/')).length, 0);
  assert.equal(f.records.get('universes/world').bookCount, 0);
});
test('v6 selection and source boundaries reject grants, labels, incompatible observations and forged positions', async () => {
  const f = setup(),
    origin = await world(f),
    initial = await readyRestoreUniverse(f.factory, uid, id, origin),
    p = await stage(f, initial);
  for (const change of [
    (v) => {
      v.universe.name = 'forbidden';
    },
    (v) => {
      v.universe.itemIndex--;
    },
    (v) => {
      v.universe.origin = { kind: 'unavailable', id: 'world' };
      v.universe.observed = 'available';
    },
    (v) => {
      v.universe.origin = { kind: 'none' };
    },
    (v) => {
      v.phase = 'universe';
    },
  ]) {
    const value = structuredClone(p.preparation);
    change(value);
    assert.throws(() => preparationProgress(value));
  }
});

test('stage failure and automatic callback retry preserve the universe cursor and never touch the world', async () => {
  const f = setup(),
    origin = await world(f),
    initial = await readyRestoreUniverse(f.factory, uid, id, origin),
    run = f.db.runTransaction.bind(f.db),
    before = structuredClone([...f.records]),
    failure = new Error('universe stage failure');
  let inject = true,
    automatic = false;
  f.db.runTransaction = async (operation) => {
    try {
      return await run(async (tx) => {
        const update = tx.update;
        tx.update = (ref, ...args) => {
          if (inject && ref.path === root) throw failure;
          return update(ref, ...args);
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
  const request = mutation(id, initial, 'universe-storage-0001');
  await assert.rejects(
    () => f.api.advanceBookRestoreUniverse(uid, request),
    (e) => e === failure,
  );
  assert.deepEqual([...f.records], before);
  automatic = true;
  const first = await f.api.advanceBookRestoreUniverse(uid, request);
  assert.equal(first.progress.preparation.itemIndex, initial.preparation.itemIndex + 1);
  assert.equal(f.records.get('universes/world').bookCount, 0);
  assert.deepEqual(await f.api.advanceBookRestoreUniverse(uid, request), first);
});
test('cancellation during universe pointer read prevents the probe and new receipt', async () => {
  const f = setup(),
    origin = await world(f),
    initial = await readyRestoreUniverse(f.factory, uid, id, origin),
    doc = f.db.doc.bind(f.db);
  let intercepted = false;
  f.db.doc = (path) => {
    const ref = doc(path);
    if (
      path ===
      root + '/validationItems/' + String(initial.preparation.itemIndex).padStart(15, '0')
    )
      return {
        ...ref,
        get: async () => {
          const snapshot = await ref.get();
          if (!intercepted) {
            intercepted = true;
            await f.api.cancelBookRestore(uid, mutation(id, initial, 'universe-reading-cancel'));
          }
          return snapshot;
        },
      };
    return ref;
  };
  f.metadataReads.length = 0;
  const request = mutation(id, initial, 'universe-reading-append');
  await assert.rejects(() => f.api.advanceBookRestoreUniverse(uid, request));
  assert.equal(intercepted, true);
  assert.equal(f.metadataReads.filter((v) => v.path.startsWith('universes/')).length, 0);
  assert.equal(
    f.records.has('users/' + uid + '/bookRestoreOperations/' + request.operationId),
    false,
  );
});
test('a twin universe operation committed during source reading resolves its receipt', async () => {
  const f = setup(),
    origin = await world(f),
    initial = await readyRestoreUniverse(f.factory, uid, id, origin),
    request = mutation(id, initial, 'universe-identical01'),
    doc = f.db.doc.bind(f.db);
  let twin;
  f.db.doc = (path) => {
    const ref = doc(path);
    if (
      path ===
      root + '/validationItems/' + String(initial.preparation.itemIndex).padStart(15, '0')
    )
      return {
        ...ref,
        get: async () => {
          const snapshot = await ref.get();
          if (!twin) {
            twin = true;
            twin = await f.factory().advanceBookRestoreUniverse(uid, request);
          }
          return snapshot;
        },
      };
    return ref;
  };
  assert.deepEqual(await f.api.advanceBookRestoreUniverse(uid, request), twin);
});
test('the final plan rejects a wrong source item and a prepared origin changed away from the validated archive', async () => {
  const f = setup(),
    origin = await world(f),
    initial = await readyRestoreUniverse(f.factory, uid, id, origin),
    p = await stage(f, initial),
    reader = await f.api.openVerifiedBookRestoreContent(uid, {
      restoreId: id,
      jobToken: p.jobToken,
    }),
    wrong = await reader.readMappedItem(0),
    item = await loadUniversePlanItem(f.api, uid, id, p);
  await assert.rejects(() =>
    f.db.runTransaction(async (tx) =>
      prepareBookRestoreUniverseLink(tx, f.db, await loadedRestore(f.db, tx, uid, id, p), wrong),
    ),
  );
  const job = structuredClone(f.records.get(root));
  job.preparation.universe.origin.id = 'another-owned';
  f.records.set(root, job);
  const before = structuredClone([...f.records]);
  await assert.rejects(() =>
    f.db.runTransaction(async (tx) =>
      prepareBookRestoreUniverseLink(tx, f.db, await loadedRestore(f.db, tx, uid, id, p), item),
    ),
  );
  assert.deepEqual([...f.records], before);
});
test('cancelling the prepared link cleans only its copy and preserves all universe data and counters', async () => {
  const f = setup(),
    origin = await world(f),
    initial = await readyRestoreUniverse(f.factory, uid, id, origin),
    p = await stage(f, initial),
    before = structuredClone([...f.records].filter(([k]) => k.startsWith('universes/')));
  const terminal = await cleanupLegacyRestore(f.api, uid, id, p, { limit: 5 });
  assert.equal(terminal.state, 'cancelled');
  assert.equal(terminal.preparation.cleanedArtifacts, p.preparation.artifactCount);
  assert.deepEqual(
    [...f.records].filter(([k]) => k.startsWith('universes/')),
    before,
  );
});
