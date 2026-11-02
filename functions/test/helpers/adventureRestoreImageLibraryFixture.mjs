import assert from 'node:assert/strict';
import { auditFixture, finishAudit } from './adventureRestoreAuditFixture.mjs';
import { mutation } from './adventureRestoreTransferFixture.mjs';
export const libraryRequest = (p) =>
  mutation(p, 'adventure-image-library-' + String(p.checkpoint).padStart(8, '0'));
export const libraryStep = async (f, p) =>
  (await f.api.advanceAdventureRestoreImageLibrary(f.uid, libraryRequest(p))).progress;
export async function libraryFixture(bytes = null) {
  const { f, p } = await auditFixture(bytes);
  return { f, p: await finishAudit(f, p) };
}
export async function finishImageLibrary(f, p) {
  for (let n = 0; p.staging.phase !== 'image-library-ready'; n++) {
    assert.ok(n < 10000);
    p = await libraryStep(f, p);
  }
  return p;
}
