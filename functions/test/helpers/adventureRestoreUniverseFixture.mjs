import assert from 'node:assert/strict';
import { emptyAdventureArchive } from './adventureRestoreArchiveFixture.mjs';
import { request, chunkRequest, mutation } from './adventureRestoreTransferFixture.mjs';

export async function prepareUniverseAdventure(
  api,
  uid,
  origin = { kind: 'none' },
  suppliedBytes = null,
) {
  const bytes = suppliedBytes ?? (await emptyAdventureArchive({ universeOrigin: origin }));
  let p = (await api.startAdventureRestore(uid, request(bytes))).progress;
  const req = () => mutation(p, 'universe-fixture-' + String(p.checkpoint).padStart(8, '0'));
  for (let n = 0; n < Math.ceil(bytes.length / 65536); n++)
    p = (await api.appendAdventureRestoreChunk(uid, chunkRequest(p, bytes, n))).progress;
  while (['uploaded', 'checking'].includes(p.state))
    p = (await api.advanceAdventureRestoreIntegrity(uid, { ...req(), limit: 16 })).progress;
  for (let n = 0; ['bytes-verified', 'validating'].includes(p.state); n++) {
    assert.ok(n < 2000);
    p = (await api.advanceAdventureRestoreValidation(uid, req())).progress;
  }
  assert.equal(p.state, 'content-verified');
  const stages = [
    ['structure-ready', 'advanceAdventureRestoreStructure'],
    ['resources-ready', 'advanceAdventureRestoreResources'],
    ['profiles-ready', 'advanceAdventureRestoreProfiles'],
    ['history-ready', 'advanceAdventureRestoreHistory'],
    ['draft-ready', 'finalizeAdventureRestoreDraft'],
  ];
  for (const [phase, method] of stages)
    for (let n = 0; p.staging?.phase !== phase; n++) {
      assert.ok(n < 2000);
      p = (await api[method](uid, req())).progress;
    }
  return p;
}
