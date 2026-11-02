import test from 'node:test';
import assert from 'node:assert/strict';
import {
  profileAdventureArchive,
  loreFirst,
  loreSecond,
  loreDeleted,
} from './helpers/adventureRestoreProfileArchiveFixture.mjs';
import { resourceReady, resourceFinish } from './helpers/adventureRestoreResourcesFixture.mjs';
import { cleanup, mutation } from './helpers/adventureRestoreTransferFixture.mjs';
import { createAdventureRestoreRemapper } from '../src/adventureRestoreRemap.mjs';
import { createVerifiedAdventureRestoreContent } from '../src/adventureRestoreContentRead.mjs';
import { createAdventureRestoreStore } from '../src/adventureRestoreStore.mjs';
import {
  adventureStageArtifactId,
  readAdventureStageArtifact,
} from '../src/adventureRestoreArtifacts.mjs';
import { adventureValidationIndexId } from '../src/adventureRestoreValidationIndex.mjs';
import {
  adventureIdentityToken,
  storedMetadata,
  storedBody,
} from '../src/adventureLoreContracts.mjs';
import { DEFAULT_PERSONAS } from '../src/personaProfile.mjs';
export async function profileReady(options) {
  const bytes = await profileAdventureArchive(options),
    { f, p } = await resourceReady({ bytes });
  return { f, p: await resourceFinish(f, p) };
}
export const profileRequest = (p) =>
  mutation(p, 'profile-step-' + String(p.checkpoint).padStart(8, '0'));
export async function profileStep(f, p) {
  return (await f.api.advanceAdventureRestoreProfiles(f.uid, profileRequest(p))).progress;
}
export async function profileFinish(f, p) {
  for (let n = 0; p.staging.phase !== 'profiles-ready'; n++) {
    assert.ok(n < 1000);
    p = await profileStep(f, p);
  }
  return p;
}
const root = (p) => 'adventures/' + p.adventureId;
const mapper = (f, p) =>
  createAdventureRestoreRemapper({
    schemaVersion: 1,
    jobToken: p.jobToken,
    sourceAdventureId: f.records.get(f.path).validation.summary.sourceAdventureId,
    adventureId: p.adventureId,
  });
async function atKind(f, p, kind) {
  for (let n = 0; n < 1000; n++) {
    const r = await createVerifiedAdventureRestoreContent({
        db: f.db,
        uid: f.uid,
        restoreId: p.restoreId,
        jobToken: p.jobToken,
      }),
      u = await r.readItem(p.staging.itemIndex);
    if (u.record.kind === kind) return p;
    p = await profileStep(f, p);
  }
  throw Error('kind not found');
}
test('native lore pairs and tombstones retain text, identity, remapped relations and deduplicated private personas', async () => {
  const { f, p } = await profileReady(),
    end = await profileFinish(f, p),
    m = mapper(f, p),
    r = root(p),
    definition = f.records.get(f.path + '/preparedRoot/current').value;
  assert.equal(end.staging.itemIndex, p.staging.itemIndex + 9);
  assert.equal(end.staging.resourceIndex, p.staging.resourceIndex);
  assert.deepEqual(
    [
      end.staging.loreHeads,
      end.staging.loreBodies,
      end.staging.personaAdventureBindings,
      end.staging.personaSceneBindings,
      end.staging.personaProfiles,
    ],
    [3, 2, 1, 1, 1],
  );
  const snapshot = await f.db.doc(r).get(),
    token = adventureIdentityToken(f.uid, p.adventureId, snapshot),
    context = {
      uid: f.uid,
      adventureId: p.adventureId,
      adventureToken: token,
      collectionRevision: definition.loreVersion,
    };
  for (const id of [loreFirst, loreSecond, loreDeleted]) {
    const newId = m.identity('lore', id),
      head = f.records.get(r + '/lore/' + newId);
    assert.equal(storedMetadata(head, context, newId).entityId, newId);
    assert.equal(head.revision, 1);
    assert.equal(head.adventureToken, token);
    if (id === loreDeleted) {
      assert.equal(head.deleted, true);
      assert.equal(f.records.has(r + '/loreBodies/' + newId), false);
    } else {
      const body = f.records.get(r + '/loreBodies/' + newId);
      assert.equal(storedBody(body, context, head).details, 'PRIVATE_DETAILS 🌙');
      assert.equal(head.createdAt, 1000);
      assert.equal(head.updatedAt, 1400);
      assert.equal(
        f.metadata.get(r + '/lore/' + newId).createdAtNanoseconds,
        f.metadata.get(r + '/loreBodies/' + newId).createdAtNanoseconds,
      );
    }
  }
  const body = f.records.get(r + '/loreBodies/' + m.identity('lore', loreFirst));
  assert.equal(
    body.relations[0].targetEntityId,
    'adventure:' + p.adventureId + ':' + m.identity('lore', loreSecond),
  );
  assert.equal(
    body.relations[1].targetEntityId,
    'universe:external-universe-0001:external-entity-0001',
  );
  const persona = m.identity('persona', DEFAULT_PERSONAS[0].id),
    profile = f.records.get(f.path + '/preparedRoot/persona-' + persona);
  assert.deepEqual(profile.profile, { ...DEFAULT_PERSONAS[0], id: persona });
  assert.equal(
    [...f.records.keys()].filter((k) => k.startsWith(f.path + '/preparedRoot/binding-')).length,
    2,
  );
  assert.equal(
    [...f.records.keys()].some((k) => k.includes('/aiPersonas/')),
    false,
  );
  assert.equal(f.records.get(r).ownerId, undefined);
  assert.equal(f.records.get(r + '/workProgress/current').countReady, false);
  assert.equal(definition.loreVersion, 3);
  assert.doesNotMatch(JSON.stringify(end), /PRIVATE_|profileHash|sourceToken/);
  const store = createAdventureRestoreStore({ db: f.db });
  for (const path of [...f.records.keys()].filter((k) =>
    k.startsWith(f.path + '/stagingArtifacts/'),
  ))
    await f.db.runTransaction(async (tx) => {
      const loaded = await store.load(tx, f.uid, f.id, p.jobToken);
      await readAdventureStageArtifact(store, tx, loaded, await tx.get(f.db.doc(path)), {
        withValue: true,
      });
    });
});
test('bodies before heads create exact pairs once and cleanup removes every native and private target', async () => {
  const { f, p } = await profileReady({ bodiesFirst: true }),
    first = await profileStep(f, p);
  assert.equal(first.staging.loreBodies, 1);
  assert.equal(first.staging.loreHeads, 0);
  const end = await profileFinish(f, first),
    cancelled = await cleanup(f, end, 50);
  assert.equal(cancelled.staging.cleanedArtifacts, end.staging.artifactCount);
  assert.deepEqual(
    [...f.records.keys()].filter((k) => k.startsWith(root(p) + '/') || k.startsWith(f.path + '/')),
    [],
  );
  assert.equal(f.records.get(root(p)).kind, 'adventure-restore-retired');
});
test('null bindings remain explicit without creating any private or library profile', async () => {
  const { f, p } = await profileReady({ personas: false }),
    end = await profileFinish(f, p),
    bindings = [...f.records.entries()].filter(([k]) =>
      k.startsWith(f.path + '/preparedRoot/binding-'),
    );
  assert.equal(end.staging.personaProfiles, 0);
  assert.equal(bindings.length, 2);
  assert.ok(bindings.every(([, v]) => v.personaId === null && v.profileHash === null));
  assert.equal(
    [...f.records.keys()].some((k) => k.includes('/persona-custom-')),
    false,
  );
});
test('same operation replay and competing checkpoint create the first lore pair only once', async () => {
  const { f, p } = await profileReady(),
    input = profileRequest(p),
    pair = await Promise.all([
      f.api.advanceAdventureRestoreProfiles(f.uid, input),
      f.api.advanceAdventureRestoreProfiles(f.uid, input),
    ]);
  assert.deepEqual(pair[0], pair[1]);
  const next = pair[0].progress,
    race = await Promise.allSettled([
      profileStep(f, next),
      f.api.advanceAdventureRestoreProfiles(f.uid, {
        ...profileRequest(next),
        operationId: 'profile-competitor-0001',
      }),
    ]);
  assert.equal(race.filter((r) => r.status === 'fulfilled').length, 1);
  const replay = await f.api.advanceAdventureRestoreProfiles(f.uid, input);
  assert.equal(replay.progress.checkpoint, p.checkpoint + 2);
  assert.deepEqual(replay.receipt, pair[0].receipt);
  assert.equal([...f.records.keys()].filter((k) => k.startsWith(root(p) + '/lore/')).length, 2);
});
test('failed native pair commit rolls back bodies, root version, journals and receipt before exact retry', async () => {
  const { f, p } = await profileReady(),
    before = structuredClone([...f.records]),
    run = f.db.runTransaction.bind(f.db);
  f.db.runTransaction = (cb) =>
    run((tx) =>
      cb({
        ...tx,
        update(ref, value) {
          if (ref.path === f.path) throw Error('profile commit unavailable');
          return tx.update(ref, value);
        },
      }),
    );
  await assert.rejects(() => profileStep(f, p), /profile commit unavailable/);
  assert.deepEqual([...f.records], before);
  f.db.runTransaction = run;
  assert.equal((await profileStep(f, p)).staging.loreHeads, 1);
});
test('cancellation during source preparation fences all lore and persona writes', async () => {
  const { f, p } = await profileReady(),
    run = f.db.runTransaction.bind(f.db);
  let calls = 0,
    cancelled;
  f.db.runTransaction = async (cb) => {
    if (++calls === 2) {
      f.db.runTransaction = run;
      cancelled = (
        await f.api.cancelAdventureRestore(f.uid, mutation(p, 'profile-cancel-race-0001'))
      ).progress;
    }
    return run(cb);
  };
  await assert.rejects(() => profileStep(f, p));
  assert.equal(
    [...f.records.keys()].some((k) => k.startsWith(root(p) + '/lore/')),
    false,
  );
  assert.equal((await cleanup(f, cancelled, 5)).state, 'cancelled');
});
test('a changed authenticated lore lookup index cannot redirect a body to another unit', async () => {
  const { f, p } = await profileReady(),
    path = f.path + '/validationIndex/' + adventureValidationIndexId(['lore-body', loreFirst]);
  f.records.get(path).sourceItemIndex = 0;
  await assert.rejects(() => profileStep(f, p));
  assert.equal(f.records.get(f.path).checkpoint, p.checkpoint);
  assert.equal(
    [...f.records.keys()].some((k) => k.startsWith(root(p) + '/lore/')),
    false,
  );
});
test('foreign body for a tombstone or private persona cannot be adopted or deleted', async () => {
  for (const mode of ['body', 'persona']) {
    const { f, p } = await profileReady(),
      m = mapper(f, p);
    let point = p,
      path;
    if (mode === 'body') {
      point = await atKind(f, await profileStep(f, await profileStep(f, p)), 'adventure-lore');
      path = root(p) + '/loreBodies/' + m.identity('lore', loreDeleted);
    } else {
      point = await atKind(f, p, 'adventure-persona');
      path = f.path + '/preparedRoot/persona-' + m.identity('persona', DEFAULT_PERSONAS[0].id);
    }
    await f.db.runTransaction((tx) => tx.create(f.db.doc(path), { content: 'FOREIGN' }));
    await assert.rejects(() => profileStep(f, point));
    assert.equal(f.records.get(path).content, 'FOREIGN');
    await assert.rejects(() => cleanup(f, point, 50));
    assert.equal(f.records.get(path).content, 'FOREIGN');
  }
});
test('changed pair body or journal replacement prevents ensure and cleanup without hiding the modification', async () => {
  for (const mode of ['body', 'journal']) {
    const { f, p } = await profileReady(),
      first = await profileStep(f, p),
      m = mapper(f, p),
      target = root(p) + '/loreBodies/' + m.identity('lore', loreFirst);
    const point = await atKind(f, first, 'adventure-lore-body');
    if (mode === 'body')
      await f.db.runTransaction((tx) => tx.update(f.db.doc(target), { details: 'FOREIGN' }));
    else
      f.metadata.set(
        f.path +
          '/stagingArtifacts/' +
          adventureStageArtifactId({
            scope: 'adventure',
            path: ['loreBodies', m.identity('lore', loreFirst)],
          }),
        { createdAt: 9999, updatedAt: 9999 },
      );
    await assert.rejects(() => profileStep(f, point));
    await assert.rejects(() => cleanup(f, point, 50));
    assert.ok(f.records.has(target));
  }
});

test('automatic transaction retry rebuilds pair/root effects without double counting', async () => {
  const { f, p } = await profileReady(),
    run = f.db.runTransaction.bind(f.db);
  let retried = false;
  f.db.runTransaction = async (cb) => {
    try {
      return await run((tx) =>
        cb({
          ...tx,
          update(ref, v) {
            if (ref.path === f.path && !retried) {
              retried = true;
              throw Error('RETRY_PROFILE');
            }
            return tx.update(ref, v);
          },
        }),
      );
    } catch (error) {
      if (error.message !== 'RETRY_PROFILE') throw error;
      return run(cb);
    }
  };
  const next = await profileStep(f, p);
  assert.equal(retried, true);
  assert.equal(next.staging.loreHeads, 1);
  assert.equal(next.checkpoint, p.checkpoint + 1);
  assert.equal(f.records.get(f.path + '/preparedRoot/current').value.loreVersion, 1);
  assert.equal([...f.records.keys()].filter((k) => k.startsWith(root(p) + '/lore/')).length, 1);
});
test('profile counters stay closed, bounded and matched to phase/cursor with old resource receipts preserved', async () => {
  const { f, p } = await profileReady(),
    initial = f.records.get(f.path),
    prior = structuredClone(initial.staging);
  initial.staging.loreHeads = 0;
  await assert.rejects(
    () => f.api.getAdventureRestore(f.uid, { restoreId: p.restoreId, jobToken: p.jobToken }),
    { code: 'failed-precondition' },
  );
  initial.staging = prior;
  await assert.rejects(
    () =>
      f.api.advanceAdventureRestoreProfiles(f.uid, {
        ...profileRequest(p),
        phase: 'profiles-ready',
      }),
    { code: 'invalid-argument' },
  );
  const next = await profileStep(f, p),
    record = f.records.get(f.path),
    valid = structuredClone(record.staging);
  for (const patch of [
    { loreHeads: 999 },
    { personaProfiles: 1 },
    { itemIndex: valid.itemIndex + 1 },
  ]) {
    record.staging = { ...valid, ...patch };
    await assert.rejects(
      () => f.api.getAdventureRestore(f.uid, { restoreId: p.restoreId, jobToken: p.jobToken }),
      { code: 'failed-precondition' },
    );
  }
  record.staging = valid;
  assert.equal(
    (await f.api.getAdventureRestore(f.uid, { restoreId: p.restoreId, jobToken: p.jobToken }))
      .checkpoint,
    next.checkpoint,
  );
});

test('remapping a valid near-limit lore entity fails native compatibility without truncation or partial pair', async () => {
  const { f, p } = await profileReady({ nearNativeLimit: true });
  await assert.rejects(() => profileStep(f, p), {
    code: 'failed-precondition',
    details: { reason: 'native-compatibility' },
  });
  assert.equal(f.records.get(f.path).checkpoint, p.checkpoint);
  assert.equal(
    [...f.records.keys()].some(
      (k) => k.startsWith(root(p) + '/lore/') || k.startsWith(root(p) + '/loreBodies/'),
    ),
    false,
  );
  assert.equal((await cleanup(f, p, 50)).state, 'cancelled');
});

test('unchanged root replacement preserves its previous journal and native version while the checkpoint advances', async () => {
  const { f, p } = await profileReady(),
    point = await atKind(f, p, 'adventure-lore-end'),
    address = { scope: 'job', path: ['preparedRoot', 'current'] },
    path = f.path + '/stagingArtifacts/' + adventureStageArtifactId(address),
    before = structuredClone(f.records.get(path)),
    metadata = structuredClone(f.metadata.get(f.path + '/preparedRoot/current'));
  const next = await profileStep(f, point);
  assert.equal(next.staging.phase, 'personas');
  assert.equal(next.checkpoint, point.checkpoint + 1);
  assert.deepEqual(f.records.get(path), before);
  assert.deepEqual(f.metadata.get(f.path + '/preparedRoot/current'), metadata);
});
