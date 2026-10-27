import assert from 'node:assert/strict';
import { resourceReady, resourceFinish } from './adventureRestoreResourcesFixture.mjs';
import { mutation } from './adventureRestoreTransferFixture.mjs';
export const historyRequest = (p) =>
  mutation(p, 'history-step-' + String(p.checkpoint).padStart(8, '0'));
export async function historyReady(bytes) {
  const { f, p } = await resourceReady({ bytes });
  let current = await resourceFinish(f, p);
  for (let n = 0; current.staging.phase !== 'profiles-ready'; n++) {
    assert.ok(n < 2000);
    current = (
      await f.api.advanceAdventureRestoreProfiles(
        f.uid,
        mutation(current, 'history-profiles-' + String(n).padStart(6, '0')),
      )
    ).progress;
  }
  return { f, p: current };
}
export async function historyStep(f, p) {
  return (await f.api.advanceAdventureRestoreHistory(f.uid, historyRequest(p))).progress;
}
export async function historyFinish(f, p) {
  for (let n = 0; p.staging.phase !== 'history-ready'; n++) {
    assert.ok(n < 20000);
    p = await historyStep(f, p);
  }
  return p;
}
