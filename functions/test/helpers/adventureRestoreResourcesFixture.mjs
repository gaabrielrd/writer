import assert from 'node:assert/strict';
import { transferFixture, upload, verify, mutation } from './adventureRestoreTransferFixture.mjs';
import { resourceAdventureArchive } from './adventureRestoreResourceArchiveFixture.mjs';
export const resourceRequest = (p) =>
  mutation(p, 'resource-step-' + String(p.checkpoint).padStart(8, '0'));
export async function resourceReady(options) {
  const f = transferFixture(await resourceAdventureArchive(options));
  let p = await verify(f, await upload(f), 16);
  for (let n = 0; ['bytes-verified', 'validating'].includes(p.state); n++) {
    assert.ok(n < 2000);
    p = (
      await f.api.advanceAdventureRestoreValidation(
        f.uid,
        mutation(p, 'resource-validation-' + String(n).padStart(6, '0')),
      )
    ).progress;
  }
  assert.equal(p.state, 'content-verified');
  for (let n = 0; !p.staging || p.staging.phase === 'structure'; n++) {
    assert.ok(n < 2000);
    p = (
      await f.api.advanceAdventureRestoreStructure(
        f.uid,
        mutation(p, 'resource-structure-' + String(n).padStart(6, '0')),
      )
    ).progress;
  }
  return { f, p };
}
export async function resourceStep(f, p) {
  return (await f.api.advanceAdventureRestoreResources(f.uid, resourceRequest(p))).progress;
}
export async function resourceFinish(f, p) {
  for (let n = 0; p.staging.phase !== 'resources-ready'; n++) {
    assert.ok(n < 2000);
    p = await resourceStep(f, p);
  }
  return p;
}
