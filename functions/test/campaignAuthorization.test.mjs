import { test } from 'node:test';
import assert from 'node:assert/strict';
import { studioDb } from './helpers/studioDb.mjs';
import { createUniverseService } from '../src/universes.mjs';
import {
  readCampaignAuthorization,
  prepareCampaignAuthorization,
} from '../src/campaignAuthorization.mjs';

const uid = 'author';
const path = `users/${uid}/campaignAuthorization/current`;
const entity = { name: 'Heroína', category: 'character', summary: 'Resumo', isPublic: true };

test('authorization clock reads do not initialize and initialization does not count history', async () => {
  const { db, records } = studioDb();
  const absent = await db.runTransaction((tx) => readCampaignAuthorization(tx, db, uid));
  assert.equal(absent.record, null);
  assert.equal(absent.epoch, null);
  assert.equal(records.size, 0);
  await db.runTransaction(async (tx) => {
    const plan = await prepareCampaignAuthorization(tx, db, uid);
    assert.equal(records.size, 0);
    assert.equal(plan.record.epoch, 0);
    plan.commit();
  });
  const initial = structuredClone(records.get(path));
  assert.match(initial.token, /^[a-f0-9]{64}$/);
  await db.runTransaction(async (tx) => (await prepareCampaignAuthorization(tx, db, uid)).commit());
  assert.deepEqual(records.get(path), initial);
  await db.runTransaction(async (tx) =>
    (await prepareCampaignAuthorization(tx, db, uid, { bump: true })).commit(),
  );
  assert.deepEqual(records.get(path), { ...initial, epoch: 1 });
  records.delete(path);
  await db.runTransaction(async (tx) => (await prepareCampaignAuthorization(tx, db, uid)).commit());
  assert.notEqual(records.get(path).token, initial.token);
});

test('all manual canonical writers invalidate the same owner clock across universes', async () => {
  const { db, records } = studioDb();
  const api = createUniverseService({ db });
  const world = { creationId: 'first', name: 'Mundo', description: '' };
  await api.createUniverse(uid, world);
  const token = records.get(path).token;
  assert.equal(records.get(path).epoch, 1);
  await api.createUniverse(uid, world);
  assert.equal(records.get(path).epoch, 1);
  await api.updateUniverse(uid, { id: 'first', name: 'Outro título', description: '' });
  assert.equal(records.get(path).epoch, 1);
  const save = (input, create = false) =>
    api.saveUniverseLore(uid, { universeId: 'first', id: 'hero', input, create });
  await save(entity, true);
  assert.equal(records.get(path).epoch, 2);
  await save(entity, true);
  assert.equal(records.get(path).epoch, 2);
  await save({ ...entity, details: 'Mudança de prosa' });
  assert.equal(records.get(path).epoch, 3);
  await save({ ...entity, isPublic: false });
  assert.equal(records.get(path).epoch, 4);
  await api.deleteUniverseLore(uid, { universeId: 'first', id: 'hero' });
  assert.equal(records.get(path).epoch, 5);
  await api.deleteUniverseLore(uid, { universeId: 'first', id: 'hero' });
  assert.equal(records.get(path).epoch, 5);
  await save(entity, true);
  assert.equal(records.get(path).epoch, 6);
  await api.createUniverse(uid, { ...world, creationId: 'second' });
  assert.equal(records.get(path).epoch, 7);
  await api.deleteUniverse(uid, { id: 'first' });
  assert.equal(records.get(path).epoch, 8);
  assert.equal(records.get(path).token, token);
  await api.createUniverse('another', { ...world, creationId: 'another' });
  assert.equal(records.get(path).epoch, 8);
  assert.notEqual(records.get('users/another/campaignAuthorization/current').token, token);
});

test('invalid or exhausted clocks fail closed before any canonical content changes', async () => {
  const { db, records } = studioDb();
  const api = createUniverseService({ db });
  await api.createUniverse(uid, { creationId: 'world', name: 'Mundo', description: '' });
  const valid = structuredClone(records.get(path));
  const attempts = [
    { ...valid, epoch: -1 },
    { ...valid, epoch: '1' },
    { ...valid, epoch: Number.MAX_SAFE_INTEGER + 1 },
    { ...valid, epoch: Number.MAX_SAFE_INTEGER },
    { ...valid, ownerId: 'another' },
    { ...valid, token: 'invalid' },
    { ...valid, schemaVersion: 2 },
    { ...valid, epoch: undefined },
  ];
  for (const invalid of attempts) {
    records.set(path, invalid);
    const before = structuredClone([...records]);
    await assert.rejects(
      api.saveUniverseLore(uid, { universeId: 'world', id: 'hero', input: entity, create: true }),
      { code: 'failed-precondition' },
    );
    assert.deepEqual([...records], before);
  }
  await assert.rejects(
    db.runTransaction((tx) => readCampaignAuthorization(tx, db, null)),
    {
      code: 'unauthenticated',
    },
  );
});
