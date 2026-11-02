import { born, closed, integer, restoreHash } from './bookRestoreUploadContracts.mjs';
import { digest } from './workProgressContracts.mjs';
import { applicationConflict as conflict } from './loreAnalysisApplicationContracts.mjs';
export const applicationApplyOperation = (token) => digest(['analysis-application-final', token]);
export const applicationAdoptionBatchId = (token) =>
  digest(['analysis-application-adoption-batch', token]);
export function applicationSuccessPaths(c) {
  return {
    record: c.db.doc(c.path + '/applied/current'),
    proof: c.db.doc(c.path + '/appliedProofs/current'),
  };
}
export function validateApplicationResult(result, count) {
  closed(result, ['applied', 'credits']);
  integer(result.applied, 1);
  integer(result.credits);
  if (result.applied !== count) conflict();
}
export function validateApplicationSuccess(l, record) {
  closed(record, [
    'schemaVersion',
    'ownerId',
    'applicationId',
    'applicationToken',
    'contextHash',
    'requestHash',
    'operationId',
    'readyRevision',
    'timestamp',
    'provider',
    'cost',
    'balanceBefore',
    'userBirth',
    'result',
    'localCount',
    'globalCount',
    'localBatch',
    'localLoreVersion',
    'publicationPrivacyVersion',
    'globalVersion',
  ]);
  const c = l.context,
    local = c.members.filter((m) => m.scope === 'local'),
    count = c.members.length;
  if (
    record.schemaVersion !== 1 ||
    record.ownerId !== l.c.uid ||
    record.applicationId !== l.c.id ||
    record.applicationToken !== l.token ||
    record.contextHash !== digest(c) ||
    record.requestHash !== c.requestHash ||
    record.operationId !== applicationApplyOperation(l.token) ||
    record.provider !== c.provider ||
    record.cost !== (c.provider === 'platform' ? 1 : 0) ||
    record.localCount !== local.length ||
    record.globalCount !== count - local.length
  )
    conflict();
  integer(record.readyRevision, 1);
  integer(record.timestamp);
  integer(record.balanceBefore);
  if (!Number.isFinite(new Date(record.timestamp).getTime())) conflict();
  closed(record.userBirth, ['seconds', 'nanoseconds']);
  born({ createTime: record.userBirth });
  validateApplicationResult(record.result, count);
  if (record.balanceBefore - record.cost !== record.result.credits) conflict();
  if (!local.length) {
    if (
      record.localBatch !== null ||
      record.localLoreVersion !== null ||
      record.publicationPrivacyVersion !== null
    )
      conflict();
  } else {
    closed(record.localBatch, ['batchId', 'requests']);
    if (
      record.localBatch.batchId !== applicationAdoptionBatchId(l.token) ||
      !Array.isArray(record.localBatch.requests) ||
      record.localBatch.requests.length !== local.length
    )
      conflict();
    integer(record.localLoreVersion, 1);
    integer(record.publicationPrivacyVersion);
    for (const [i, member] of local.entries()) {
      const request = record.localBatch.requests[i];
      if (
        request?.editId !== member.children.editId ||
        request.operationId !== digest(['analysis-adopt-member', l.token, member.index])
      )
        conflict();
    }
  }
  if (record.globalCount) integer(record.globalVersion, 1);
  else if (record.globalVersion !== null) conflict();
  return record;
}
export function validateAppliedStateSummary(value, count) {
  closed(value, ['operationId', 'receiptHash', 'timestamp', 'result']);
  restoreHash(value.operationId);
  restoreHash(value.receiptHash);
  integer(value.timestamp);
  if (!Number.isFinite(new Date(value.timestamp).getTime())) conflict();
  validateApplicationResult(value.result, count);
}
