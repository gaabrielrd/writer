import assert from 'node:assert/strict';
import { mediaFixture, finishMedia } from './adventureRestoreMediaFixture.mjs';
export async function archiveCleanupFixture(bytes = null) {
  const { f, p, media } = await mediaFixture(bytes);
  const complete = await finishMedia(f, p, media);
  const progress = (
    await f.api.getAdventureRestoreArchiveCleanup(f.uid, {
      restoreId: p.restoreId,
      jobToken: p.jobToken,
    })
  ).progress;
  return { f, p, media: complete, progress };
}
export const archiveRequest = (p, c) => ({
  restoreId: p.restoreId,
  jobToken: p.jobToken,
  expectedCheckpoint: c.checkpoint,
  operationId: 'adventure-archive-step-' + String(c.checkpoint).padStart(8, '0'),
});
export const archiveStep = async (f, p, progress) =>
  f.api.advanceAdventureRestoreArchiveCleanup(f.uid, archiveRequest(p, progress));
export async function finishArchiveCleanup(f, p, progress) {
  for (let n = 0; progress.phase !== 'done'; n++) {
    assert.ok(n < 10000);
    progress = (await archiveStep(f, p, progress)).progress;
  }
  return progress;
}
