import test from 'node:test';
import assert from 'node:assert/strict';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import { createStudioService } from '../src/studio.mjs';
import { createUniverseService } from '../src/universes.mjs';
import { createScenesService } from '../src/scenes.mjs';
import {
  createAdventureDeletionService,
  readAdventureDeletionJob,
} from '../src/adventureDeletion.mjs';
import {
  adventureDeletionPath,
  adventureDeletionOperationPath,
  adventureDeletionFencePath,
} from '../src/adventureDeletionContracts.mjs';
import {
  adventureReservationPath,
  isAdventureDeletionError,
} from '../src/adventureDeletionGuard.mjs';
const uid = 'author',
  id = 'adventure-deletion-start-0001',
  operationId = 'adventure-deletion-operation-0001',
  target = { kind: 'adventure', id },
  path = 'adventures/' + id;
async function fixture({ world = false } = {}) {
  const f = adventureImportDb({ nativeUpdates: true }),
    studio = createStudioService({ db: f.db, now: () => 1000 }),
    universes = createUniverseService({ db: f.db, now: () => 900 });
  if (world) await universes.createUniverse(uid, { creationId: 'world', name: 'Own world' });
  await studio.createAdventure(uid, {
    operationId: id,
    title: 'Own adventure',
    synopsis: 'DO_NOT_HYDRATE_PRIVATE_PROSE',
    ...(world ? { universeId: 'world' } : {}),
  });
  const api = createAdventureDeletionService({ db: f.db, now: () => 2000 }),
    source = await api.getAdventureDeletionSource(uid, { adventureId: id });
  const input = {
    adventureId: id,
    adventureToken: source.adventureToken,
    sourceToken: source.sourceToken,
    expectedRevision: source.revision,
    operationId,
  };
  return { ...f, studio, universes, api, source, input };
}
const read = (f) => f.api.getAdventureDeletion(uid, { adventureId: id });
test('private start reserves and revokes atomically, unlinks only its world use and preserves every content document', async () => {
  const f = await fixture({ world: true }),
    scenes = createScenesService({ db: f.db, now: () => 1001 });
  await scenes.createScene(uid, {
    target,
    operationId: 'deletion-own-scene-0001',
    parentId: null,
    title: 'Scene',
    content: 'Own text',
  });
  const s = await f.api.getAdventureDeletionSource(uid, { adventureId: id });
  Object.assign(f.input, { sourceToken: s.sourceToken, expectedRevision: s.revision });
  const contentBefore = structuredClone([...f.records].filter(([p]) => p.startsWith(path + '/')));
  const initial = await f.api.startAdventureDeletion(uid, f.input);
  assert.equal(initial.receipt.action, 'start');
  assert.equal(initial.receipt.confirmedCheckpoint, 0);
  assert.equal(initial.progress.title, 'Own adventure');
  assert.equal(initial.progress.phase, 'quiescence');
  assert.equal(initial.progress.revoked, true);
  assert.equal(initial.progress.complete, false);
  assert.match(initial.progress.deletionToken, /^[a-f0-9]{64}$/);
  assert.equal(f.records.get(path).deleting, true);
  assert.equal(f.records.get(path).revision, s.revision + 1);
  assert.equal(f.records.get(path).universeId, null);
  assert.equal(f.records.get('universes/world').adventureCount, 0);
  assert.equal(f.records.has('universes/world/adventures/' + id), false);
  assert.deepEqual(
    [...f.records].filter(([p]) => p.startsWith(path + '/')),
    contentBefore,
  );
  assert.equal(await f.studio.getAdventure(uid, { id }), null);
  assert.equal(await f.api.getAdventureDeletionSource(uid, { adventureId: id }), null);
  await assert.rejects(
    () => f.studio.createAdventure(uid, { operationId: id, title: 'Wrong replacement' }),
    isAdventureDeletionError,
  );
  assert.deepEqual((await read(f)).deletion, initial.progress);
  const before = structuredClone(f.records);
  assert.deepEqual(await f.api.startAdventureDeletion(uid, f.input), initial);
  assert.deepEqual(
    await f.api.resolveAdventureDeletionStart(uid, { ...f.input, intent: 'cancel' }),
    initial,
  );
  assert.deepEqual(f.records, before);
});
test('unknown start resolution fences only its exact operation and a delayed start never marks the project', async () => {
  const f = await fixture(),
    before = structuredClone(f.records.get(path));
  const stopped = await f.api.resolveAdventureDeletionStart(uid, { ...f.input, intent: 'cancel' });
  assert.equal(stopped.kind, 'canceled');
  assert.deepEqual(stopped.request, f.input);
  assert.deepEqual(await f.api.startAdventureDeletion(uid, f.input), stopped);
  assert.deepEqual(f.records.get(path), before);
  assert.equal(f.records.has(adventureReservationPath(id)), false);
  assert.equal((await read(f)).deletion, null);
  assert.ok(f.records.has(adventureDeletionFencePath(uid, operationId)));
  await assert.rejects(
    () => f.api.startAdventureDeletion(uid, { ...f.input, expectedRevision: 2 }),
    { code: 'invalid-argument' },
  );
});
test('simultaneous same starts converge and two distinct starts cannot acquire the same adventure', async () => {
  for (const same of [true, false]) {
    const f = await fixture(),
      second = { ...f.input, operationId: same ? operationId : operationId + '-other' };
    const results = await Promise.allSettled([
      f.api.startAdventureDeletion(uid, f.input),
      f.api.startAdventureDeletion(uid, second),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, same ? 2 : 1);
    if (same) assert.deepEqual(results[0].value, results[1].value);
    else {
      assert.ok(isAdventureDeletionError(results.find((r) => r.status === 'rejected').reason));
      assert.equal(
        (await f.api.resolveAdventureDeletionStart(uid, { ...second, intent: 'cancel' })).kind,
        'canceled',
      );
    }
    assert.equal(
      [...f.records.keys()].filter((p) => p.startsWith('users/' + uid + '/adventureDeletions/'))
        .length,
      1,
    );
  }
});
test('native update and recreation invalidate the previously displayed source without changing logical revision', async () => {
  for (const kind of ['update', 'recreate', 'progress']) {
    const f = await fixture(),
      beforeRoot = structuredClone(f.records.get(path));
    if (kind === 'update')
      await f.db.runTransaction((tx) =>
        tx.update(f.db.doc(path), { synopsis: 'New text, same revision' }),
      );
    if (kind === 'recreate') {
      await f.db.runTransaction((tx) => tx.delete(f.db.doc(path)));
      await f.db.runTransaction((tx) => tx.create(f.db.doc(path), beforeRoot));
    }
    if (kind === 'progress')
      await f.db.runTransaction((tx) =>
        tx.create(f.db.doc(path + '/workProgress/current'), { schemaVersion: 1, revision: 0 }),
      );
    const before = structuredClone(f.records);
    await assert.rejects(
      () => f.api.startAdventureDeletion(uid, f.input),
      (e) => e.details?.reason === 'adventure-deletion-source-changed',
    );
    assert.deepEqual(f.records, before);
  }
});
test('atomic failures before each start write preserve content, universe counters and identifiers for exact retry', async () => {
  for (let stop = 1; stop <= 6; stop++) {
    const f = await fixture({ world: true }),
      before = structuredClone(f.records),
      run = f.db.runTransaction.bind(f.db);
    let writes = 0,
      failed = false;
    f.db.runTransaction = (callback) =>
      run((tx) =>
        callback({
          ...tx,
          ...Object.fromEntries(
            ['create', 'set', 'update', 'delete'].map((method) => [
              method,
              (...args) => {
                if (!failed && ++writes === stop) {
                  failed = true;
                  throw Error('Injected start write failure');
                }
                return tx[method](...args);
              },
            ]),
          ),
        }),
      );
    await assert.rejects(
      () => f.api.startAdventureDeletion(uid, f.input),
      /Injected start write failure/,
    );
    assert.deepEqual(f.records, before);
    f.db.runTransaction = run;
    assert.equal((await f.api.startAdventureDeletion(uid, f.input)).progress.revoked, true);
  }
});
test('lost commit acknowledgement resolves from the original identity and never installs a cancellation fence', async () => {
  const f = await fixture(),
    run = f.db.runTransaction.bind(f.db);
  let armed = true;
  f.db.runTransaction = async (callback) => {
    const result = await run(callback);
    if (armed && f.records.has(adventureReservationPath(id))) {
      armed = false;
      throw Error('Lost commit acknowledgement');
    }
    return result;
  };
  await assert.rejects(
    () => f.api.startAdventureDeletion(uid, f.input),
    /Lost commit acknowledgement/,
  );
  f.db.runTransaction = run;
  const answer = await f.api.resolveAdventureDeletionStart(uid, { ...f.input, intent: 'cancel' });
  assert.equal(answer.progress.deletionId, operationId);
  assert.equal(f.records.has(adventureDeletionFencePath(uid, operationId)), false);
  assert.deepEqual(await f.api.startAdventureDeletion(uid, f.input), answer);
});
test('failure of the post-commit metadata read keeps the confirmed start recoverable', async () => {
  const f = await fixture(),
    run = f.db.runTransaction.bind(f.db);
  let calls = 0;
  f.db.runTransaction = (callback) => {
    if (++calls === 2) return Promise.reject(Error('Lost status read'));
    return run(callback);
  };
  await assert.rejects(() => f.api.startAdventureDeletion(uid, f.input), /Lost status read/);
  assert.equal(f.records.get(path).deleting, true);
  f.db.runTransaction = run;
  assert.equal((await f.api.startAdventureDeletion(uid, f.input)).progress.checkpoint, 0);
});
test('foreign accounts get no deletion identity, title or token and cannot start or fence an owned operation', async () => {
  const f = await fixture();
  await assert.rejects(() => f.api.startAdventureDeletion('other', f.input), { code: 'not-found' });
  await f.api.startAdventureDeletion(uid, f.input);
  const foreign = await f.api.getAdventureDeletion('other', { adventureId: id });
  assert.equal(foreign.deletion, null);
  assert.equal(JSON.stringify(foreign).includes(operationId), false);
  assert.deepEqual((await f.api.listAdventureDeletions('other')).items, []);
  await assert.rejects(
    () => f.api.startAdventureDeletion('other', f.input),
    (e) => e.code === 'not-found' && !e.details,
  );
  const canceled = await f.api.resolveAdventureDeletionStart('other', {
    ...f.input,
    intent: 'cancel',
  });
  assert.equal(canceled.kind, 'canceled');
  assert.ok(f.records.has(adventureDeletionPath(uid, operationId)));
});
for (const which of ['job', 'reservation', 'receipt', 'all'])
  test(
    'native identity rejects copied ' + which + ' metadata without rewriting the deletion',
    async () => {
      const f = await fixture();
      await f.api.startAdventureDeletion(uid, f.input);
      const paths = {
        job: adventureDeletionPath(uid, operationId),
        reservation: adventureReservationPath(id),
        receipt: adventureDeletionOperationPath(uid, operationId),
      };
      const targets = which === 'all' ? Object.values(paths) : [paths[which]],
        copies = targets.map((p) => structuredClone(f.records.get(p)));
      await f.db.runTransaction((tx) => targets.forEach((p) => tx.delete(f.db.doc(p))));
      await f.db.runTransaction((tx) =>
        targets.forEach((p, i) => tx.create(f.db.doc(p), copies[i])),
      );
      const before = structuredClone(f.records);
      await assert.rejects(() => read(f), { code: 'failed-precondition' });
      await assert.rejects(() => f.api.startAdventureDeletion(uid, f.input), {
        code: 'failed-precondition',
      });
      assert.deepEqual(f.records, before);
    },
  );
test('changed or recreated source root never authorizes an existing job; a missing root stays reserved', async () => {
  for (const kind of ['changed', 'recreated', 'missing']) {
    const f = await fixture();
    const first = await f.api.startAdventureDeletion(uid, f.input),
      root = structuredClone(f.records.get(path));
    if (kind === 'changed')
      await f.db.runTransaction((tx) => tx.update(f.db.doc(path), { revision: root.revision + 1 }));
    else {
      await f.db.runTransaction((tx) => tx.delete(f.db.doc(path)));
      if (kind === 'recreated') await f.db.runTransaction((tx) => tx.create(f.db.doc(path), root));
    }
    if (kind === 'missing') assert.deepEqual((await read(f)).deletion, first.progress);
    else await assert.rejects(() => read(f), { code: 'failed-precondition' });
    assert.equal(f.records.get(adventureReservationPath(id)).state, 'deleting');
  }
});
test('metadata-only status, bounded catalog and account-bound cursors never hydrate project or job bodies', async () => {
  const f = await fixture(),
    run = f.db.runTransaction.bind(f.db),
    fullReads = [];
  f.db.runTransaction = (callback) =>
    run((tx) =>
      callback({
        ...tx,
        get: (ref) => {
          if (ref.path) fullReads.push(ref.path);
          return tx.get(ref);
        },
      }),
    );
  for (let n = 0; n < 3; n++) {
    const projectId = id + '-' + n;
    await f.studio.createAdventure(uid, { operationId: projectId, title: 'Adventure ' + n });
    fullReads.length = 0;
    const source = await f.api.getAdventureDeletionSource(uid, { adventureId: projectId });
    await f.api.startAdventureDeletion(uid, {
      adventureId: projectId,
      adventureToken: source.adventureToken,
      sourceToken: source.sourceToken,
      expectedRevision: source.revision,
      operationId: operationId + '-' + n,
    });
    assert.equal(fullReads.length, 0);
  }
  let cursor;
  const all = [];
  do {
    const page = await f.api.listAdventureDeletions(uid, {
      limit: 1,
      ...(cursor ? { cursor } : {}),
    });
    all.push(...page.items);
    cursor = page.nextCursor;
    if (cursor)
      await assert.rejects(() => f.api.listAdventureDeletions('other', { limit: 1, cursor }), {
        code: 'invalid-argument',
      });
  } while (cursor);
  assert.equal(all.length, 3);
  assert.equal(new Set(all.map((p) => p.deletionId)).size, 3);
  assert.equal(fullReads.length, 0);
  const operationReads = f.metadataReads.filter((r) =>
    r.path.includes('/adventureDeletionOperations/'),
  );
  assert.ok(operationReads.length > 0);
  assert.ok(
    operationReads.every(
      (r) => !r.fields.includes('receipt') && r.fields.includes('receipt.confirmedCheckpoint'),
    ),
  );
  assert.ok(
    f.reads
      .filter((r) => r.collectionPath === 'users/' + uid + '/adventureDeletions')
      .every((r) => r.maximum === 2 && r.count <= 2),
  );
  assert.equal(JSON.stringify(all).includes('DO_NOT_HYDRATE'), false);
});
test('invalid input, non-integer clock, revision overflow or inconsistent universe leave no partial reservation', async () => {
  const f = await fixture();
  for (const request of [
    { ...f.input, ownerId: uid },
    { ...f.input, expectedRevision: 0 },
    { ...f.input, adventureToken: 'bad' },
    { ...f.input, operationId: '../bad' },
  ])
    await assert.rejects(() => f.api.startAdventureDeletion(uid, request), {
      code: 'invalid-argument',
    });
  await assert.rejects(() => f.api.startAdventureDeletion(null, f.input), {
    code: 'unauthenticated',
  });
  await assert.rejects(
    () => f.api.resolveAdventureDeletionStart(uid, { ...f.input, intent: 'delete' }),
    { code: 'invalid-argument' },
  );
  const world = await fixture({ world: true });
  world.records.get('universes/world').adventureCount = 0;
  const before = structuredClone(world.records);
  await assert.rejects(() => world.api.startAdventureDeletion(uid, world.input), {
    code: 'failed-precondition',
  });
  assert.deepEqual(world.records, before);
  const overflow = await fixture();
  overflow.records.get(path).revision = Number.MAX_SAFE_INTEGER;
  const s = await overflow.api.getAdventureDeletionSource(uid, { adventureId: id }),
    input = { ...overflow.input, sourceToken: s.sourceToken, expectedRevision: s.revision };
  await assert.rejects(() => overflow.api.startAdventureDeletion(uid, input), {
    code: 'failed-precondition',
  });
  assert.equal(overflow.records.has(adventureReservationPath(id)), false);
  const badClock = await fixture();
  const api = createAdventureDeletionService({ db: badClock.db, now: () => 2000.5 });
  await assert.rejects(() => api.startAdventureDeletion(uid, badClock.input), {
    code: 'failed-precondition',
  });
  assert.equal(badClock.records.has(adventureReservationPath(id)), false);
});
test('private reader rejects a port without metadata projection before any body read', async () => {
  const f = await fixture(),
    before = structuredClone(f.records),
    run = f.db.runTransaction.bind(f.db);
  const db = {
    ...f.db,
    runTransaction: (fn) =>
      run((tx) => {
        const raw = { ...tx };
        delete raw.getAll;
        return fn(raw);
      }),
  };
  await assert.rejects(
    () => createAdventureDeletionService({ db }).startAdventureDeletion(uid, f.input),
    { code: 'failed-precondition' },
  );
  assert.deepEqual(f.records, before);
  const ref = f.db.doc(adventureDeletionPath(uid, operationId));
  await assert.rejects(
    () =>
      f.db.runTransaction((tx) =>
        readAdventureDeletionJob(tx, f.db, uid, operationId, {
          ref,
          id: operationId,
          exists: false,
          data: () => undefined,
        }),
      ),
    { code: 'not-found' },
  );
});

test('maximum catalog window returns fifty verified jobs plus a cursor within the transaction budget', async () => {
  const f = await fixture();
  for (let n = 0; n < 51; n++) {
    const adventureId = id + '-maximum-' + String(n).padStart(3, '0');
    await f.studio.createAdventure(uid, { operationId: adventureId, title: 'Private ' + n });
    const s = await f.api.getAdventureDeletionSource(uid, { adventureId });
    await f.api.startAdventureDeletion(uid, {
      adventureId,
      adventureToken: s.adventureToken,
      sourceToken: s.sourceToken,
      expectedRevision: s.revision,
      operationId: operationId + '-maximum-' + String(n).padStart(3, '0'),
    });
  }
  const first = await f.api.listAdventureDeletions(uid, { limit: 50 });
  assert.equal(first.items.length, 50);
  assert.ok(first.nextCursor);
  const last = await f.api.listAdventureDeletions(uid, { limit: 50, cursor: first.nextCursor });
  assert.equal(last.items.length, 1);
  assert.equal(last.nextCursor, null);
  assert.equal(new Set([...first.items, ...last.items].map((p) => p.deletionId)).size, 51);
  assert.ok(
    f.reads
      .filter((r) => r.collectionPath === 'users/' + uid + '/adventureDeletions')
      .every((r) => r.maximum === 51 && r.count <= 51),
  );
});
