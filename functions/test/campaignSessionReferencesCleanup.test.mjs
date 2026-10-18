import test from 'node:test';
import assert from 'node:assert/strict';
import { studioDb } from './helpers/studioDb.mjs';
import { createStudioService } from '../src/studio.mjs';
import { startDeletion, finishDeletion, uid } from './helpers/campaignDeletion.mjs';
import { owned, deletionPhases } from '../src/campaignDeletionContracts.mjs';

const campaignId = 'campaign-reference-cleanup',
  children = ['sessionReferences', 'sessionReferenceState'],
  recovery = ['campaignSessionReferenceOperations', 'campaignSessionReferenceFences'];
async function fixture() {
  const f = studioDb();
  await createStudioService({ db: f.db, now: () => 100 }).createCampaign(uid, {
    operationId: campaignId,
    title: 'Mesa com vínculos',
  });
  return f;
}

test('C4 v3 cleans paginated reference namespaces and sanitizes receipts/fences without touching another campaign', async () => {
  const f = await fixture();
  for (const name of children)
    for (let n = 0; n < 27; n++)
      f.records.set(`campaigns/${campaignId}/${name}/reference-${n}`, {
        ownerId: uid,
        campaignId,
        sourceKey: 'private-source-key',
      });
  for (const name of recovery)
    for (let n = 0; n < 27; n++)
      f.records.set(`users/${uid}/${name}/operation-${n}`, {
        schemaVersion: 1,
        ownerId: uid,
        campaignId,
        fingerprint: 'secret-control',
        receipt: { arbitrary: 'not-retained' },
      });
  for (const name of children)
    f.records.set(`campaigns/other/${name}/preserved`, { value: 'another-campaign' });
  for (const name of recovery)
    f.records.set(`users/${uid}/${name}/preserved`, {
      schemaVersion: 1,
      ownerId: uid,
      campaignId: 'other',
      fingerprint: 'another-campaign',
    });
  const deletion = await startDeletion(f.db, campaignId, 'reference-cleanup');
  const path = `users/${uid}/campaignDeletions/${deletion.result.progress.deletionId}`;
  assert.equal(f.records.get(path).cleanupVersion, 3);
  await finishDeletion(deletion.service, deletion.result.progress, 'reference-step');
  assert.equal(
    [...f.records.keys()].some((key) => key.startsWith(`campaigns/${campaignId}/`)),
    false,
  );
  for (const name of recovery) {
    const rows = [...f.records.entries()].filter(
      ([key, value]) => key.startsWith(`users/${uid}/${name}/`) && value.campaignId === campaignId,
    );
    assert.equal(rows.length, 27);
    for (const [, value] of rows)
      assert.deepEqual(value, {
        schemaVersion: 1,
        ownerId: uid,
        campaignId,
        deletionId: deletion.result.progress.deletionId,
        state: 'deleted-campaign',
      });
    assert.equal(f.records.get(`users/${uid}/${name}/preserved`).fingerprint, 'another-campaign');
  }
  for (const name of children)
    assert.equal(f.records.get(`campaigns/other/${name}/preserved`).value, 'another-campaign');
  assert.equal('cleanupVersion' in f.records.get(path), false);
});

test('C4 retains old v1/v2 part boundaries and rejects unknown versions or reinterpreted checkpoints', async () => {
  const f = await fixture(),
    deletion = await startDeletion(f.db, campaignId, 'reference-compatibility'),
    path = `users/${uid}/campaignDeletions/${deletion.result.progress.deletionId}`,
    original = structuredClone(f.records.get(path));
  for (const [version, recoveryMaximum, childrenMaximum] of [
    [1, 3, 7],
    [2, 4, 9],
    [3, 6, 11],
  ]) {
    for (const [phase, maximum] of [
      ['recovery', recoveryMaximum],
      ['campaign-children', childrenMaximum],
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
  }
  for (const version of [null, 0, 4, '3'])
    assert.throws(() => owned({ ...original, cleanupVersion: version }, uid, original.deletionId), {
      code: 'failed-precondition',
    });
  for (const version of [1, 2]) {
    const row = { ...original, cleanupVersion: version };
    f.records.set(path, row);
    const step = await deletion.service.advanceCampaignDeletion(uid, {
      deletionId: row.deletionId,
      operationId: `reference-compatibility-v${version}`,
      expectedCheckpoint: 0,
    });
    assert.equal(f.records.get(path).cleanupVersion, version);
    assert.equal(step.progress.checkpoint, 1);
  }
});

test('a resumed v2 recovery/children boundary advances without consuming v3-only resources', async () => {
  const f = await fixture(),
    deletion = await startDeletion(f.db, campaignId, 'reference-v2-boundary'),
    path = `users/${uid}/campaignDeletions/${deletion.result.progress.deletionId}`,
    original = structuredClone(f.records.get(path));
  f.records.set(`users/${uid}/campaignSessionReferenceOperations/preserved-v3`, {
    schemaVersion: 1,
    ownerId: uid,
    campaignId,
    fingerprint: 'v3-only',
  });
  f.records.set(`campaigns/${campaignId}/sessionReferences/preserved-v3`, { sourceKey: 'v3-only' });
  for (const [phase, part, nextPhase] of [
    ['recovery', 4, 'controls'],
    ['campaign-children', 9, 'activity'],
  ]) {
    f.records.set(path, {
      ...original,
      cleanupVersion: 2,
      phase,
      part,
      certified: deletionPhases.slice(0, deletionPhases.indexOf(phase)),
    });
    const step = await deletion.service.advanceCampaignDeletion(uid, {
      deletionId: original.deletionId,
      operationId: `reference-v2-boundary-${phase}`,
      expectedCheckpoint: 0,
    });
    assert.equal(step.progress.phase, nextPhase);
    assert.equal(
      f.records.get(`users/${uid}/campaignSessionReferenceOperations/preserved-v3`).fingerprint,
      'v3-only',
    );
    assert.equal(
      f.records.get(`campaigns/${campaignId}/sessionReferences/preserved-v3`).sourceKey,
      'v3-only',
    );
  }
});
