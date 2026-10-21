import test from 'node:test';
import assert from 'node:assert/strict';
import { studioDb } from './helpers/studioDb.mjs';
import { createStudioService } from '../src/studio.mjs';
import { startDeletion, finishDeletion, uid } from './helpers/campaignDeletion.mjs';
import { owned, deletionPhases } from '../src/campaignDeletionContracts.mjs';
const campaignId = 'campaign-preparation-cleanup';
const children = [
  'preparationItems',
  'preparationBodies',
  'preparationState',
  'sessionPreparationLinks',
  'sessionPreparationState',
];
const recovery = ['campaignPreparationOperations', 'campaignPreparationFences'];
async function fixture() {
  const f = studioDb();
  await createStudioService({ db: f.db, now: () => 100 }).createCampaign(uid, {
    operationId: campaignId,
    title: 'Mesa com pistas',
  });
  return f;
}
test('C4 v4 revokes first, purges every new paginated namespace and strips receipts/fences preserving another campaign', async () => {
  const f = await fixture();
  for (const name of children)
    for (let n = 0; n < 27; n++)
      f.records.set(`campaigns/${campaignId}/${name}/resource-${n}`, {
        ownerId: uid,
        campaignId,
        body: 'Texto secreto 🐉',
      });
  for (const name of recovery)
    for (let n = 0; n < 27; n++)
      f.records.set(`users/${uid}/${name}/operation-${n}`, {
        schemaVersion: 1,
        ownerId: uid,
        campaignId,
        fingerprint: 'private-hash',
        request: { body: 'Texto secreto 🐉' },
      });
  for (const name of children)
    f.records.set(`campaigns/other/${name}/preserved`, { body: 'Outra campanha' });
  for (const name of recovery)
    f.records.set(`users/${uid}/${name}/preserved`, {
      schemaVersion: 1,
      ownerId: uid,
      campaignId: 'other',
      fingerprint: 'preserved',
    });
  const d = await startDeletion(f.db, campaignId, 's3-cleanup'),
    path = `users/${uid}/campaignDeletions/${d.result.progress.deletionId}`;
  assert.equal(f.records.get(path).cleanupVersion, 4);
  await finishDeletion(d.service, d.result.progress, 's3-step');
  assert.equal(
    [...f.records.keys()].some((p) => p.startsWith(`campaigns/${campaignId}/`)),
    false,
  );
  for (const name of recovery) {
    const rows = [...f.records.entries()].filter(
      ([p, v]) => p.startsWith(`users/${uid}/${name}/`) && v.campaignId === campaignId,
    );
    assert.equal(rows.length, 27);
    for (const [, value] of rows)
      assert.deepEqual(value, {
        schemaVersion: 1,
        ownerId: uid,
        campaignId,
        deletionId: d.input.operationId,
        state: 'deleted-campaign',
      });
    assert.equal(f.records.get(`users/${uid}/${name}/preserved`).fingerprint, 'preserved');
  }
  for (const name of children)
    assert.equal(f.records.get(`campaigns/other/${name}/preserved`).body, 'Outra campanha');
  assert.equal(JSON.stringify([...f.records.values()]).includes('Texto secreto'), false);
  assert.equal('cleanupVersion' in f.records.get(path), false);
});
test('C4 v1-v4 have exact inventories; resumed v3 boundaries never consume v4-only resources and unknown 5 fails', async () => {
  const f = await fixture(),
    d = await startDeletion(f.db, campaignId, 's3-compat'),
    path = `users/${uid}/campaignDeletions/${d.result.progress.deletionId}`,
    original = structuredClone(f.records.get(path));
  for (const [version, recoveryMax, childrenMax] of [
    [1, 3, 7],
    [2, 4, 9],
    [3, 6, 11],
    [4, 8, 16],
  ])
    for (const [phase, maximum] of [
      ['recovery', recoveryMax],
      ['campaign-children', childrenMax],
      ['controls', 4],
    ]) {
      const row = {
        ...original,
        cleanupVersion: version,
        phase,
        part: maximum,
        certified: deletionPhases.slice(0, deletionPhases.indexOf(phase)),
      };
      assert.equal(owned(row, uid, row.deletionId).part, maximum);
      assert.throws(() => owned({ ...row, part: maximum + 1 }, uid, row.deletionId), {
        code: 'failed-precondition',
      });
    }
  assert.throws(() => owned({ ...original, cleanupVersion: 5 }, uid, original.deletionId), {
    code: 'failed-precondition',
  });
  f.records.set(`users/${uid}/campaignPreparationOperations/preserved-v4`, {
    schemaVersion: 1,
    ownerId: uid,
    campaignId,
    fingerprint: 'v4-only',
  });
  f.records.set(`campaigns/${campaignId}/preparationBodies/preserved-v4`, { body: 'v4-only' });
  for (const [phase, part, next] of [
    ['recovery', 6, 'controls'],
    ['campaign-children', 11, 'activity'],
  ]) {
    f.records.set(path, {
      ...original,
      cleanupVersion: 3,
      phase,
      part,
      certified: deletionPhases.slice(0, deletionPhases.indexOf(phase)),
    });
    const result = await d.service.advanceCampaignDeletion(uid, {
      deletionId: original.deletionId,
      operationId: 'preparation-v3-boundary-' + phase,
      expectedCheckpoint: 0,
    });
    assert.equal(result.progress.phase, next);
    assert.equal(
      f.records.get(`users/${uid}/campaignPreparationOperations/preserved-v4`).fingerprint,
      'v4-only',
    );
    assert.equal(
      f.records.get(`campaigns/${campaignId}/preparationBodies/preserved-v4`).body,
      'v4-only',
    );
  }
});
