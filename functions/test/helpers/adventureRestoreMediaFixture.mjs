import assert from 'node:assert/strict';
import { activationFixture, activationRequest } from './adventureRestoreActivationFixture.mjs';
export async function mediaFixture(bytes = null) {
  const { f, p } = await activationFixture(bytes),
    { request } = await activationRequest(f, p);
  const activated = await f.api.activateAdventureRestore(f.uid, request);
  const media = (
    await f.api.getAdventureRestoreMediaState(f.uid, {
      restoreId: p.restoreId,
      jobToken: p.jobToken,
    })
  ).media;
  return { f, p: activated.progress, media };
}
export const mediaRequest = (
  p,
  m,
  operationId = 'adventure-media-step-' + String(m.checkpoint).padStart(8, '0'),
) => ({
  restoreId: p.restoreId,
  jobToken: p.jobToken,
  operationId,
  expectedCheckpoint: m.checkpoint,
});
export async function finishMedia(f, p, media) {
  for (let n = 0; !media.complete; n++) {
    assert.ok(n < 10000);
    media = (await f.api.advanceAdventureRestoreMedia(f.uid, mediaRequest(p, media))).media;
  }
  return media;
}
