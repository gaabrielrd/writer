import { authorize, closed, integer } from './bookRestoreUploadContracts.mjs';
import {
  applicationPaths,
  applicationRequest,
  reserveApplicationInput,
  applicationConflict as conflict,
  applicationView,
} from './loreAnalysisApplicationContracts.mjs';
import {
  loadApplication,
  replayApplicationOperation,
  reserveApplicationCommit,
  assertApplicationOpening,
} from './loreAnalysisApplicationStore.mjs';
import { applicationWorkflowState } from './loreAnalysisApplicationWorkflowContracts.mjs';
import { authorizeApplicationSource } from './loreAnalysisApplicationSource.mjs';
import { resetApplicationChildPermits } from './loreAnalysisApplicationChildBindings.mjs';
import { produceApplicationMember } from './loreAnalysisApplicationProduction.mjs';
import { cleanupApplicationMember } from './loreAnalysisApplicationCleanup.mjs';
export function applicationUnitRequest(uid, input, body = false) {
  authorize(uid);
  closed(
    input,
    body
      ? ['id', 'text', 'changes', 'jobToken', 'expectedRevision', 'operationId']
      : ['id', 'requestHash', 'jobToken', 'expectedRevision', 'operationId'],
  );
  const original = body
      ? reserveApplicationInput(uid, { id: input.id, text: input.text, changes: input.changes })
      : input,
    r = applicationRequest(
      uid,
      {
        id: input.id,
        requestHash: original.requestHash,
        jobToken: input.jobToken,
        operationId: input.operationId,
      },
      true,
    );
  integer(input.expectedRevision);
  return {
    r: { ...r, expectedRevision: input.expectedRevision },
    changes: body ? original.changes : null,
  };
}
export async function advanceApplicationCleanupInTransaction(tx, l, r) {
  assertApplicationOpening(tx, l);
  const replay = await replayApplicationOperation(
    tx,
    l,
    'advanceLoreAnalysisApplicationCleanup',
    r,
  );
  if (replay) return replay;
  if (
    r.jobToken !== l.token ||
    r.id !== l.c.id ||
    r.requestHash !== l.context.requestHash ||
    r.expectedRevision !== l.state.revision
  )
    conflict();
  if (l.state.phase === 'cancelled') return { receipt: null, progress: applicationView(l) };
  if (l.state.phase !== 'cancelling') conflict();
  const finish = await reserveApplicationCommit(tx, l, 'advanceLoreAnalysisApplicationCleanup', r),
    next = applicationWorkflowState(l);
  await cleanupApplicationMember(tx, l, next, r);
  const plan = finish(next);
  plan.commit();
  return plan.result;
}
export function createLoreAnalysisApplicationPreparationService({ db, now = () => Date.now() }) {
  return {
    async advanceLoreAnalysisApplication(uid, input) {
      const { r, changes } = applicationUnitRequest(uid, input, true),
        c = applicationPaths(db, uid, r.id);
      return db.runTransaction(async (tx) => {
        const l = await loadApplication(tx, c, r);
        if (!l) conflict();
        const replay = await replayApplicationOperation(tx, l, 'advanceLoreAnalysisApplication', r);
        if (replay) return replay;
        if (
          r.expectedRevision !== l.state.revision ||
          !['preparing', 'ready'].includes(l.state.phase)
        )
          conflict();
        if (l.state.phase === 'ready') return { receipt: null, progress: applicationView(l) };
        await authorizeApplicationSource(tx, l, now);
        const finish = await reserveApplicationCommit(tx, l, 'advanceLoreAnalysisApplication', r),
          next = applicationWorkflowState(l);
        resetApplicationChildPermits(tx, l);
        await produceApplicationMember(tx, l, next, r, changes, now);
        const plan = finish(next);
        plan.commit();
        return plan.result;
      });
    },
    async advanceLoreAnalysisApplicationCleanup(uid, input) {
      const { r } = applicationUnitRequest(uid, input),
        c = applicationPaths(db, uid, r.id);
      return db.runTransaction(async (tx) => {
        const l = await loadApplication(tx, c, r);
        if (!l) conflict();
        return advanceApplicationCleanupInTransaction(tx, l, r);
      });
    },
  };
}
