import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture as ownFixture, uid, op } from './helpers/campaignBackup.mjs';
import { studioDb } from './helpers/studioDb.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import { createStudioService } from '../src/studio.mjs';
import { createCampaignCaptureService } from '../src/campaignCapture.mjs';
import { comparisonFixture } from './helpers/campaignComparison.mjs';
import { adoptionFixture } from './helpers/campaignAdoption.mjs';
import { createCampaignBackupSourceService } from '../src/campaignBackupSource.mjs';
import { createCampaignBackupDerivedSourceService } from '../src/campaignBackupDerivedSource.mjs';
import { createCampaignBaseReadService } from '../src/campaignBaseRead.mjs';
import { createCampaignDeletionService } from '../src/campaignDeletion.mjs';
import { createAdventureDeletionService } from '../src/adventureDeletion.mjs';
import { prepareCampaignAuthorization } from '../src/campaignAuthorization.mjs';
import { campaignIdentityToken } from '../src/campaignIdentity.mjs';
import { loreGuardPath } from '../src/campaignLoreStorage.mjs';

const reason = (value) => (error) => error.details?.reason === value;
const inconsistent = reason('campaign-backup-derived-source-inconsistent'),
  changed = reason('campaign-backup-derived-source-changed');
const forbidden = () => assert.fail('Derived metadata must never query, read prose or write');
function port(f) {
  f.gateReads = [];
  return {
    doc: (path) => {
      const segments = path.split('/');
      assert.ok(
        path === f.path ||
          (path.startsWith(f.path + '/') &&
            segments.length === 4 &&
            [
              'workProgress',
              'noteState',
              'sessionState',
              'preparationState',
              'loreVariantState',
              'loreGenerations',
            ].includes(segments[2])) ||
          path === 'campaignDeletionReservations/' + f.id ||
          path === 'adventureDeletionReservations/' + f.adventureId ||
          path === 'adventures/' + f.adventureId ||
          (segments[0] === 'users' &&
            segments[1] === uid &&
            segments.length === 4 &&
            ['campaignBases', 'campaignAdoptionGuards', 'campaignAuthorization'].includes(
              segments[2],
            )) ||
          (segments[0] === 'universes' && segments.length === 2),
        'Only fixed root/control headers may be read: ' + path,
      );
      return { path, id: segments.at(-1) };
    },
    collection: forbidden,
    runTransaction: (cb) =>
      f.db.runTransaction((tx) =>
        cb({
          ...tx,
          get: forbidden,
          set: forbidden,
          create: forbidden,
          update: forbidden,
          delete: forbidden,
          getAll: (ref, options) => {
            assert.ok(options.fieldMask.length > 0 && options.fieldMask.length <= 12);
            for (const field of options.fieldMask)
              assert.equal(
                /^(title|name|synopsis|snapshot|description|content|summary|details|body|keyBase64|url|path)(\.|$)/.test(
                  field,
                ),
                false,
              );
            f.gateReads.push({ path: ref.path, fields: [...options.fieldMask] });
            return tx.getAll(ref, options);
          },
        }),
      ),
  };
}
async function attach(f) {
  f.id ??= f.campaign.id;
  f.path ??= 'campaigns/' + f.id;
  f.adventureId ??= f.records.get(f.path).provenance.adventureId;
  const db = port(f);
  f.ownBackup = createCampaignBackupSourceService({ db });
  f.derivedBackup = createCampaignBackupDerivedSourceService({ db });
  await refresh(f);
  return f;
}
async function refresh(f) {
  f.ownSource = (await f.ownBackup.getCampaignBackupSource(uid, { campaignId: f.id })).sourceToken;
}
const read = (f, extra = {}, actor = uid) =>
  f.derivedBackup.getCampaignBackupDerivedSource(actor, {
    campaignId: f.id,
    sourceToken: f.ownSource,
    ...extra,
  });
const basePath = (f) => 'users/' + uid + '/campaignBases/' + f.records.get(f.path).activeBaseId;
const rootData = (f) => f.records.get(f.path);
const campaignToken = async (f) => campaignIdentityToken(uid, f.id, await f.db.doc(f.path).get());
async function withWorld(adoption = false) {
  const data = studioDb(),
    domain = await (adoption ? adoptionFixture : comparisonFixture)(data.db);
  return attach({ ...data, ...domain });
}

test('independent metadata reports no base without creating clocks or reading external origins', async () => {
  const f = await attach(await ownFixture()),
    before = structuredClone([...f.records]);
  f.gateReads.length = 0;
  const result = await read(f);
  assert.equal(result.availability, 'none');
  assert.equal(result.base, null);
  assert.deepEqual(Object.keys(result).sort(), [
    'availability',
    'base',
    'campaignId',
    'derivedToken',
    'schemaVersion',
    'sourceToken',
  ]);
  assert.deepEqual(await read(f, { expectedDerivedToken: result.derivedToken }), result);
  assert.match(result.derivedToken, /^[a-f0-9]{64}$/);
  assert.ok(
    f.gateReads.every(
      (row) =>
        row.path === f.path ||
        row.path.startsWith(f.path + '/') ||
        row.path === 'campaignDeletionReservations/' + f.id,
    ),
  );
  assert.deepEqual([...f.records], before);
});

test('real original capture returns only authorized edition metadata, with no snapshot, query or writes', async () => {
  const f = await attach(await ownFixture(true)),
    before = structuredClone([...f.records]),
    result = await read(f);
  assert.equal(result.availability, 'available');
  assert.deepEqual(result.base, {
    id: rootData(f).activeBaseId,
    capturedAt: f.records.get(basePath(f)).capturedAt,
    globalLore: 'none',
  });
  assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
  assert.equal(JSON.stringify(result).includes('adventureId'), false);
  assert.deepEqual(await read(f, { expectedDerivedToken: result.derivedToken }), result);
  assert.deepEqual([...f.records], before);
  assert.equal(f.records.has('users/' + uid + '/campaignAuthorization/current'), false);
});

test('native source text edits preserve the old edition and do not invalidate the metadata authorization token', async () => {
  const f = await attach(await ownFixture(true)),
    before = await read(f),
    captured = structuredClone(f.records.get(basePath(f))),
    originalBirth = (await f.db.doc('adventures/' + f.adventureId).get()).createTime;
  await f.db.runTransaction(async (tx) =>
    tx.update(f.db.doc('adventures/' + f.adventureId), {
      title: 'NEW LIVE TITLE',
      synopsis: 'NEW LIVE SYNOPSIS',
      updatedAt: 999999,
    }),
  );
  const after = await read(f, { expectedDerivedToken: before.derivedToken });
  assert.deepEqual(after, before);
  assert.deepEqual(f.records.get(basePath(f)), captured);
  const ordinary = await createCampaignBaseReadService({ db: f.db, assets: {} }).getCampaignBase(
    uid,
    { campaignId: f.id },
  );
  assert.equal(ordinary.source.title, 'PRIVATE ORIGINAL');
  assert.notEqual(ordinary.source.title, f.records.get('adventures/' + f.adventureId).title);
  assert.equal(
    (await f.db.doc('adventures/' + f.adventureId).get()).createTime.nanoseconds,
    originalBirth.nanoseconds,
  );
});

test('a recreated adventure cannot reauthorize a previous base even when owner and logical dates match', async () => {
  const f = await attach(await ownFixture(true)),
    before = await read(f),
    ref = f.db.doc('adventures/' + f.adventureId),
    old = structuredClone(f.records.get(ref.path));
  await f.db.runTransaction(async (tx) => tx.delete(ref));
  await f.db.runTransaction(async (tx) => tx.set(ref, old));
  const result = await read(f);
  assert.equal(result.availability, 'unavailable');
  assert.equal(result.base, null);
  assert.deepEqual(f.records.get(ref.path), old);
  await assert.rejects(read(f, { expectedDerivedToken: before.derivedToken }), changed);
});

test('origin deletion, denial and a missing base reveal no historical base material', async () => {
  for (const patch of [null, { ownerId: 'other' }, { deleting: true }]) {
    const f = await attach(await ownFixture(true));
    if (patch === null)
      await f.db.runTransaction(async (tx) => tx.delete(f.db.doc('adventures/' + f.adventureId)));
    else
      await f.db.runTransaction(async (tx) =>
        tx.update(f.db.doc('adventures/' + f.adventureId), patch),
      );
    const result = await read(f);
    assert.equal(result.availability, 'unavailable');
    assert.equal(result.base, null);
    assert.equal(JSON.stringify(result).includes(rootData(f).activeBaseId), false);
    assert.equal(JSON.stringify(result).includes(f.adventureId), false);
    assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
  }
  const f = await attach(await ownFixture(true));
  await f.db.runTransaction(async (tx) => tx.delete(f.db.doc(basePath(f))));
  assert.equal((await read(f)).availability, 'unavailable');
});

test('malformed base headers and contradictory root pointers cannot be treated as valid provenance', async () => {
  for (const patch of [
    { schemaVersion: 2 },
    { id: 'wrong' },
    { ownerId: 'other' },
    { campaignId: 'wrong' },
    { adventureId: 'wrong' },
    { state: 'preparing' },
    { sourceToken: 'bad' },
    { capturedAt: -1 },
    { capturedAt: NaN },
    { universeId: '../outside' },
  ]) {
    const f = await attach(await ownFixture(true));
    Object.assign(f.records.get(basePath(f)), patch);
    const before = structuredClone([...f.records]);
    await assert.rejects(read(f), inconsistent);
    assert.deepEqual([...f.records], before);
  }
  for (const patch of [
    { activeBaseId: 'bad' },
    { provenance: { kind: 'edition' } },
    { provenance: { kind: 'original', baseId: 'f'.repeat(64), adventureId: 'x' } },
    {
      provenance: { kind: 'original', baseId: 'f'.repeat(64), adventureId: '../outside' },
      activeBaseId: 'f'.repeat(64),
    },
  ]) {
    const f = await attach(await ownFixture(true));
    Object.assign(rootData(f), patch);
    await assert.rejects(read(f), inconsistent);
  }
});

test('world-backed capture reads current authorization headers but never global lore bodies or names', async () => {
  const f = await withWorld(),
    before = structuredClone([...f.records]),
    result = await read(f);
  assert.equal(result.availability, 'available');
  assert.equal(result.base.globalLore, 'available');
  assert.equal(JSON.stringify(result).includes('Mundo'), false);
  assert.ok(f.gateReads.some((row) => row.path === 'universes/world'));
  assert.ok(f.gateReads.every((row) => !row.path.includes('/lore/')));
  assert.deepEqual([...f.records], before);
});

test('renaming a world leaves the exact captured edition usable without comparing current text updateTime', async () => {
  const f = await withWorld(),
    initial = await read(f);
  await f.universe.updateUniverse(uid, {
    id: 'world',
    name: 'NEW LIVE NAME',
    description: 'NEW DESCRIPTION',
  });
  assert.deepEqual(await read(f, { expectedDerivedToken: initial.derivedToken }), initial);
});

test('revoked, absent or recreated world suspends only global lore, preserving own adventure structure', async () => {
  for (const patch of [null, { authorId: 'other' }, { deleting: true }]) {
    const f = await withWorld(),
      initial = await read(f);
    if (patch === null)
      await f.db.runTransaction(async (tx) => tx.delete(f.db.doc('universes/world')));
    else await f.db.runTransaction(async (tx) => tx.update(f.db.doc('universes/world'), patch));
    const result = await read(f);
    assert.equal(result.availability, 'available');
    assert.equal(result.base.globalLore, 'unavailable');
    assert.equal(result.base.id, initial.base.id);
    await assert.rejects(read(f, { expectedDerivedToken: initial.derivedToken }), changed);
  }
  const f = await withWorld(),
    initial = await read(f),
    old = structuredClone(f.records.get('universes/world'));
  await f.db.runTransaction(async (tx) => tx.delete(f.db.doc('universes/world')));
  await f.db.runTransaction(async (tx) => tx.set(f.db.doc('universes/world'), old));
  const result = await read(f);
  assert.equal(result.availability, 'available');
  assert.equal(result.base.globalLore, 'unavailable');
  await assert.rejects(read(f, { expectedDerivedToken: initial.derivedToken }), changed);
});

test('current lore/privacy clocks invalidate the gate while source text timestamps do not', async () => {
  for (const key of ['loreVersion', 'privacyVersion']) {
    const f = await withWorld(),
      initial = await read(f);
    await f.db.runTransaction(async (tx) =>
      tx.update(f.db.doc('universes/world'), {
        [key]: f.records.get('universes/world')[key] + 1,
      }),
    );
    await assert.rejects(read(f, { expectedDerivedToken: initial.derivedToken }), changed);
    assert.equal((await read(f)).availability, 'available');
  }
  const f = await attach(await ownFixture(true)),
    initial = await read(f);
  await f.db.runTransaction(async (tx) =>
    tx.update(f.db.doc('adventures/' + f.adventureId), { loreVersion: 1 }),
  );
  await assert.rejects(read(f, { expectedDerivedToken: initial.derivedToken }), changed);
});

test('real authorization-clock bump and same-data clock recreation invalidate stale derived tokens', async () => {
  const f = await withWorld(),
    initial = await read(f);
  await f.db.runTransaction(async (tx) => {
    const clock = await prepareCampaignAuthorization(tx, f.db, uid, { bump: true });
    clock.commit();
  });
  await assert.rejects(read(f, { expectedDerivedToken: initial.derivedToken }), changed);
  const current = await read(f),
    ref = f.db.doc('users/' + uid + '/campaignAuthorization/current'),
    old = structuredClone(f.records.get(ref.path));
  await f.db.runTransaction(async (tx) => tx.delete(ref));
  await f.db.runTransaction(async (tx) => tx.set(ref, old));
  await assert.rejects(read(f, { expectedDerivedToken: current.derivedToken }), changed);
});

test('idle admission guard is scoped natively; a same-data recreation or active guard cannot be ignored', async () => {
  const f = await attach(await ownFixture(true)),
    token = await campaignToken(f),
    ref = f.db.doc(loreGuardPath(uid, f.id, token)),
    guard = {
      schemaVersion: 1,
      ownerId: uid,
      campaignId: f.id,
      campaignToken: token,
      admissionEpoch: 0,
      adoptionId: null,
    };
  await f.db.runTransaction(async (tx) => tx.set(ref, guard));
  const initial = await read(f);
  await f.db.runTransaction(async (tx) => tx.delete(ref));
  await f.db.runTransaction(async (tx) => tx.set(ref, guard));
  await assert.rejects(read(f, { expectedDerivedToken: initial.derivedToken }), changed);
  f.records.get(ref.path).campaignToken = 'f'.repeat(64);
  await assert.rejects(read(f), inconsistent);
  f.records.set(ref.path, { ...guard, adoptionId: op('pending') });
  await assert.rejects(read(f), reason('adoption-in-progress'));
});

test('actual C3 preparation blocks the origin gate until the in-flight adoption is ended', async () => {
  const f = await withWorld(true),
    candidate = await f.candidate(),
    started = await f.start(candidate),
    p = started.result.progress;
  assert.equal((await read(f)).availability, 'available');
  await f.step('prepareCampaignAdoption', p);
  await assert.rejects(read(f), reason('campaign-backup-source-changed'));
  await refresh(f);
  f.gateReads.length = 0;
  await assert.rejects(read(f), reason('adoption-in-progress'));
  assert.equal(
    f.gateReads.some((row) => row.path.startsWith('users/' + uid + '/campaignBases/')),
    false,
  );
});

test('actual C3 activation selects the new frozen header/generation with no legacy fallback', async () => {
  const f = await withWorld(true),
    old = await read(f),
    candidate = await f.candidate(),
    started = await f.start(candidate),
    ready = await f.finish(started.result.progress);
  await f.step('activateCampaignAdoption', ready);
  await refresh(f);
  const result = await read(f);
  assert.equal(result.availability, 'available');
  assert.equal(result.base.id, candidate.candidateBaseId);
  assert.notEqual(result.base.id, old.base.id);
  const generation = f.path + '/loreGenerations/' + rootData(f).activeLoreGenerationId,
    header = structuredClone(f.records.get(generation));
  assert.ok(f.gateReads.some((row) => row.path === generation));
  f.records.delete(generation);
  await assert.rejects(read(f), inconsistent);
  f.records.set(generation, { ...header, campaignToken: 'f'.repeat(64) });
  await assert.rejects(read(f), inconsistent);
});

test('declared generations and variant-state base mismatches reject instead of silently using legacy data', async () => {
  const f = await attach(await ownFixture(true));
  rootData(f).activeLoreGenerationId = 'b'.repeat(64);
  await assert.rejects(read(f), inconsistent);
  delete rootData(f).activeLoreGenerationId;
  f.records.set(f.path + '/loreVariantState/current', {
    schemaVersion: 1,
    ownerId: uid,
    campaignId: f.id,
    campaignToken: await campaignToken(f),
    baseId: 'f'.repeat(64),
    revision: 0,
  });
  await refresh(f);
  await assert.rejects(read(f), inconsistent);
});

test('permanent adventure reservation keeps the old base unavailable even if the adventure root reappears', async () => {
  const f = await nativeReservedFixture(),
    api = createAdventureDeletionService({ db: f.db, now: () => 500 }),
    source = await api.getAdventureDeletionSource(uid, { adventureId: f.adventureId }),
    old = structuredClone(f.records.get('adventures/' + f.adventureId));
  await api.startAdventureDeletion(uid, {
    adventureId: f.adventureId,
    adventureToken: source.adventureToken,
    sourceToken: source.sourceToken,
    expectedRevision: source.revision,
    operationId: op('delete-original'),
  });
  f.records.set('adventures/' + f.adventureId, old);
  f.gateReads.length = 0;
  const result = await read(f);
  assert.equal(result.availability, 'unavailable');
  assert.equal(result.base, null);
  assert.equal(
    f.gateReads.some((row) => row.path === 'adventures/' + f.adventureId),
    false,
  );
});

test('campaign C4 and other-account reads stop before any base or origin metadata', async () => {
  const f = await attach(await ownFixture(true));
  f.gateReads.length = 0;
  await assert.rejects(read(f, {}, 'other'), { code: 'not-found' });
  assert.equal(f.gateReads.length, 2);
  const api = createCampaignDeletionService({ db: f.db, now: () => 500 }),
    source = await api.getCampaignDeletionSource(uid, { campaignId: f.id });
  await api.startCampaignDeletion(uid, {
    campaignId: f.id,
    campaignToken: source.campaignToken,
    expectedRevision: source.revision,
    operationId: op('delete-campaign'),
  });
  f.gateReads.length = 0;
  await assert.rejects(read(f), reason('campaign-deleting'));
  assert.equal(f.gateReads.length, 1);
  await assert.rejects(read(f, {}, 'other'), (error) => {
    assert.equal(error.code, 'not-found');
    assert.equal(error.details, undefined);
    return true;
  });
});

test('closed inputs, UID, hashes and metadata-only port requirements fail without fallback', async () => {
  const api = createCampaignBackupDerivedSourceService({
      db: { doc: forbidden, collection: forbidden, runTransaction: forbidden },
    }),
    base = { campaignId: op('campaign'), sourceToken: 'a'.repeat(64) };
  for (const patch of [
    { extra: true },
    { campaignId: '../bad' },
    { sourceToken: undefined },
    { sourceToken: 'A'.repeat(64) },
    { expectedDerivedToken: undefined },
    { expectedDerivedToken: null },
    { expectedDerivedToken: {} },
  ])
    await assert.rejects(api.getCampaignBackupDerivedSource(uid, { ...base, ...patch }), {
      code: 'invalid-argument',
    });
  for (const actor of ['', null, {}, 42])
    await assert.rejects(api.getCampaignBackupDerivedSource(actor, base), {
      code: 'unauthenticated',
    });
  const noMask = createCampaignBackupDerivedSourceService({
    db: { runTransaction: (cb) => cb({ get: forbidden }), doc: forbidden },
  });
  await assert.rejects(
    noMask.getCampaignBackupDerivedSource(uid, base),
    reason('campaign-backup-source-inconsistent'),
  );
});

test('native seconds and nanoseconds define origin incarnation, never logical creation dates', async () => {
  const f = await attach(await ownFixture(true));
  f.records.get('adventures/' + f.adventureId).createdAt = 0;
  f.metadata.set(basePath(f), { createdAt: 1000, updatedAt: 1001, createdAtNanoseconds: 0 });
  f.metadata.set('adventures/' + f.adventureId, {
    createdAt: 1000,
    updatedAt: 1002,
    createdAtNanoseconds: 1,
  });
  assert.equal((await read(f)).availability, 'unavailable');
  f.metadata.set('adventures/' + f.adventureId, {
    createdAt: 1000,
    updatedAt: 1002,
    createdAtNanoseconds: 0,
  });
  assert.equal((await read(f)).availability, 'available');
  f.metadata.set(basePath(f), { createdAt: 0, updatedAt: 1001, createdAtNanoseconds: -1 });
  await assert.rejects(read(f), reason('campaign-backup-source-inconsistent'));
});

test('native header rewrite and frozen request identity cannot be bypassed with a stale derived token', async () => {
  const f = await attach(await ownFixture(true)),
    initial = await read(f),
    ref = f.db.doc(basePath(f)),
    value = structuredClone(f.records.get(ref.path));
  await f.db.runTransaction(async (tx) => tx.set(ref, value));
  await assert.rejects(read(f, { expectedDerivedToken: initial.derivedToken }), changed);
  const current = await read(f),
    db = port(f);
  let release;
  const gate = new Promise((resolve) => {
      release = resolve;
    }),
    api = createCampaignBackupDerivedSourceService({
      db: {
        ...db,
        runTransaction: async (cb) => {
          await gate;
          return db.runTransaction(cb);
        },
      },
    }),
    input = {
      campaignId: f.id,
      sourceToken: f.ownSource,
      expectedDerivedToken: current.derivedToken,
    },
    pending = api.getCampaignBackupDerivedSource(uid, input);
  input.campaignId = 'foreign';
  input.sourceToken = 'f'.repeat(64);
  input.expectedDerivedToken = 'f'.repeat(64);
  release();
  assert.deepEqual(await pending, current);
});

async function nativeReservedFixture() {
  const data = adventureImportDb({ nativeUpdates: true }),
    adventureId = op('reserved-adventure'),
    studio = createStudioService({ db: data.db, now: () => 100 });
  await studio.createAdventure(uid, {
    operationId: adventureId,
    title: 'Own origin',
    universeId: null,
  });
  const capture = createCampaignCaptureService({ db: data.db, assets: {}, now: () => 200 }),
    source = await capture.getCampaignCaptureSource(uid, { adventureId });
  let p = await capture.startCampaignCapture(uid, {
    operationId: op('reserve-capture'),
    adventureId,
    expectedSourceToken: source.sourceToken,
    title: 'Mesa',
    description: '',
    universeId: null,
  });
  for (let count = 0; p.state === 'preparing' && count < 100; count++)
    p = await capture.advanceCampaignCapture(uid, {
      captureId: p.captureId,
      expectedCheckpoint: p.checkpoint,
      operationId: op('reserve-step-' + count),
    });
  assert.equal(p.state, 'prepared');
  const active = await capture.activateCampaignCapture(uid, {
    captureId: p.captureId,
    expectedCheckpoint: p.checkpoint,
    operationId: op('reserve-activate'),
  });
  assert.equal(active.kind, 'activated');
  return attach({ ...data, adventureId, campaign: active.campaign });
}
