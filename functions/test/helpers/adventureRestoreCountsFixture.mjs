import assert from 'node:assert/strict';
import { transferFixture, mutation } from './adventureRestoreTransferFixture.mjs';
import { imageStorageFixture, finishImageStorage } from './adventureRestoreImageStorageFixture.mjs';
import { prepareAdventureImages, finishImages } from './adventureRestoreImageFixture.mjs';
export const countRequest = (p) =>
  mutation(p, 'adventure-count-' + String(p.checkpoint).padStart(8, '0'));
export async function countStep(f, p) {
  return (await f.api.advanceAdventureRestoreCounts(f.uid, countRequest(p))).progress;
}
export async function finishCounts(f, p) {
  for (let n = 0; p.staging.phase !== 'counts-ready'; n++) {
    assert.ok(n < 10000);
    p = await countStep(f, p);
  }
  return p;
}
export async function countFixture(bytes = null) {
  if (bytes === null) {
    const { f, p } = await imageStorageFixture();
    return { f, p: await finishImageStorage(f, p) };
  }
  const f = transferFixture();
  let p = await prepareAdventureImages(f.api, f.uid, bytes);
  p = await finishImages(f, p);
  return { f, p: await finishImageStorage(f, p) };
}
