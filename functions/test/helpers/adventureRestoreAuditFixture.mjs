import assert from 'node:assert/strict';
import { mutation } from './adventureRestoreTransferFixture.mjs';
import { countFixture, finishCounts } from './adventureRestoreCountsFixture.mjs';
export const auditRequest = (p) =>
  mutation(p, 'adventure-audit-' + String(p.checkpoint).padStart(8, '0'));
export const auditStep = async (f, p) =>
  (await f.api.advanceAdventureRestoreAudit(f.uid, auditRequest(p))).progress;
export async function auditFixture(bytes = null) {
  const { f, p } = await countFixture(bytes);
  return { f, p: await finishCounts(f, p) };
}
export async function finishAudit(f, p) {
  for (let n = 0; p.staging.phase !== 'audit-ready'; n++) {
    assert.ok(n < 10000);
    p = await auditStep(f, p);
  }
  return p;
}
