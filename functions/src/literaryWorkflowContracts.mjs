import {
  verifySequenceWorkflowMembership,
  readSequenceWorkflowGrant,
} from './literarySequenceContracts.mjs';
import { workFail, digest, readWorkMetadata, workProject } from './workProgressContracts.mjs';
import { workflowBirth } from './literaryWorkflowOrigins.mjs';
export { workflowBirth } from './literaryWorkflowOrigins.mjs';
import { verifyLiteraryWorkflowPassage } from './literaryWorkflowPassage.mjs';
import { verifyLiteraryWorkflowAdmission } from './literaryWorkflowAdmission.mjs';
import { readLiteraryCollaboration } from './literaryCollaboration.mjs';
export { WORKFLOW_PHASES, workflowLimits, workflowPhases } from './literaryExecutionContracts.mjs';
export function workflowChildMarker(job) {
  return digest(
    Object.fromEntries(
      [
        'state',
        'cursor',
        'units',
        'accepted',
        'drafted',
        'completedUnits',
        'pendingRequestId',
        'sourceToken',
        'controlRevision',
        'preservationState',
        'preservedHistoryRevision',
        'planned',
        'captured',
        'verified',
        'wordCount',
        'preservationProgress',
        'preservationAttempt',
        'revisedMilestoneId',
        'authorAccepted',
      ].map((k) => [k, job?.[k] ?? null]),
    ),
  );
}
export async function workflowIdentity(tx, c, job, { ignorePassage = false } = {}) {
  await workProject(tx, c);
  const native = await readWorkMetadata(
    tx,
    c.db.doc(c.path + '/literaryWorkflowJobs/' + job.jobId),
    [],
  );
  if (
    job.actorId !== c.uid ||
    job.registrationState !== 'active' ||
    !native.exists ||
    digest(job.workflowBirth) !== digest(workflowBirth(native))
  )
    workFail('failed-precondition', 'O ciclo foi recriado ou não está ativo.', 'workflow-origin');
  const book = await readWorkMetadata(tx, c.ref, []);
  const chapter = await readWorkMetadata(tx, c.db.doc(c.path + '/chapters/' + job.chapterId), [
    'bookId',
    'ownerId',
    'deleting',
    'contentMode',
    'actId',
  ]);
  const value = chapter.data();
  if (
    !value ||
    value.deleting ||
    value.contentMode !== 'scenes' ||
    (value.bookId && value.bookId !== c.target.id) ||
    (value.ownerId && value.ownerId !== c.uid) ||
    digest(workflowBirth(book)) !== digest(job.bookBirth) ||
    digest(workflowBirth(chapter)) !== digest(job.chapterBirth) ||
    (value.actId ?? null) !== job.actId
  )
    workFail(
      'failed-precondition',
      'O livro ou capítulo do ciclo foi alterado ou recriado.',
      'workflow-origin',
    );
  if (digest(await readLiteraryCollaboration(tx, c)) !== digest(job.collaboration))
    workFail(
      'failed-precondition',
      'O contrato do ciclo mudou. Registre nova autorização.',
      'workflow-contract',
    );
  if (!ignorePassage) {
    await verifyLiteraryWorkflowPassage(tx, c, job);
    await verifyLiteraryWorkflowAdmission(tx, c, job);
  }
  await verifySequenceWorkflowMembership(tx, c, job);
}
export async function readWorkflowChildGrant(tx, c, binding, kind, id) {
  if (!binding) return null;
  const ref = c.db.doc(c.path + '/literaryWorkflowJobs/' + binding.id);
  const snapshot = await tx.get(ref),
    job = snapshot.data();
  if (!job || digest(workflowBirth(snapshot)) !== digest(binding.birth))
    workFail('failed-precondition', 'O ciclo foi retirado ou recriado.', 'workflow-origin');
  await workflowIdentity(tx, c, job);
  await readSequenceWorkflowGrant(tx, c, job);
  const phases =
    kind === 'draft'
      ? ['firstVersion']
      : kind === 'review'
        ? ['review', 'revisedVersion']
        : ['firstVersion'];
  const child =
    kind === 'draft' ? job.draftId : kind === 'review' ? job.reviewId : job.manualMilestoneId;
  if (job.paused || !phases.includes(job.phase) || child !== id)
    workFail(
      'failed-precondition',
      'O ciclo está pausado ou não autoriza esta etapa.',
      'workflow-paused',
    );
  return job;
}
export function checkWorkflowDraftLimits(grant, execution) {
  if (!grant) return;
  if (
    execution.mode === 'continuous' &&
    (grant.collaboration.mode !== 'continuous' ||
      !grant.authorizedPhases.includes('firstVersion') ||
      execution.maxApplications > grant.limits.maxApplications - grant.priorApplications ||
      execution.maxCredits > grant.limits.maxCredits - grant.priorCredits)
  )
    workFail(
      'failed-precondition',
      'Os limites e o modo precisam ser autorizados no ciclo.',
      'workflow-budget',
    );
}
