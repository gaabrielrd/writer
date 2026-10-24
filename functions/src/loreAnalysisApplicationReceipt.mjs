import { bornEqual, closed } from './bookRestoreUploadContracts.mjs';
import { digest } from './workProgressContracts.mjs';
import { applicationConflict as conflict } from './loreAnalysisApplicationContracts.mjs';
import {
  applicationSuccessPaths,
  validateApplicationSuccess,
} from './loreAnalysisApplicationApplyContracts.mjs';
import { adoptionBatchScope, readAdoptionBatch } from './bookLoreEditAdoptionBatch.mjs';
import { prepareBookLoreEditAdoptionBatch } from './bookLoreEditAdoption.mjs';
const immutable = (s) => s.exists && bornEqual(s, { createTime: s.updateTime });
/** Historical metadata proof only: never reads a live source or commits an adoption. */
export async function readApplicationSuccess(tx, l, event) {
  const at = applicationSuccessPaths(l.c),
    record = await tx.get(at.record),
    proof = await tx.get(at.proof);
  if (
    !immutable(record) ||
    !immutable(proof) ||
    !bornEqual(record, proof) ||
    !bornEqual(record, event.snapshot) ||
    !bornEqual(record, { createTime: l.stateSnapshot.updateTime })
  )
    conflict();
  const value = validateApplicationSuccess(l, record.data()),
    anchor = proof.data(),
    summary = l.state.application;
  closed(anchor, ['schemaVersion', 'receiptHash']);
  if (
    anchor.schemaVersion !== 1 ||
    anchor.receiptHash !== digest(value) ||
    summary.receiptHash !== digest(value) ||
    summary.operationId !== value.operationId ||
    summary.timestamp !== value.timestamp ||
    digest(summary.result) !== digest(value.result) ||
    l.state.revision !== value.readyRevision + 1 ||
    event.record.method !== 'applyLoreAnalysisApplication' ||
    event.record.operationId !== value.operationId ||
    event.record.requestHash !==
      digest({
        id: l.c.id,
        requestHash: l.context.requestHash,
        jobToken: l.token,
        operationId: value.operationId,
        expectedRevision: value.readyRevision,
      })
  )
    conflict();
  if (value.localBatch) {
    const scope = adoptionBatchScope(l.c.db, l.c.uid, value.localBatch),
      batch = await readAdoptionBatch(tx, scope);
    // Require the original group before invoking its metadata replay path.
    if (!batch || !bornEqual(batch.snapshot, record)) conflict();
    const replay = await prepareBookLoreEditAdoptionBatch(
        tx,
        { db: l.c.db },
        l.c.uid,
        value.localBatch,
      ),
      result = replay.result;
    if (
      result.timestamp !== value.timestamp ||
      result.localLoreVersion !== value.localLoreVersion ||
      result.publicationPrivacyVersion !== value.publicationPrivacyVersion ||
      result.items.length !== value.localCount
    )
      conflict();
  }
  return { snapshot: record, record: value };
}
