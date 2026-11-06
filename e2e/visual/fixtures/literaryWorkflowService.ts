import type {
  WorkflowFrame,
  StartLiteraryWorkflow,
  AdvanceLiteraryWorkflow,
  ControlLiteraryWorkflow,
  WorkflowPassageInput,
  WorkflowListItem,
} from '../../../src/features/literary-production/services/literaryWorkflowService';
import { getLiteraryContract } from './literaryProductionService';
let current: WorkflowFrame | null = null;
const operations = new Map<string, string>();
const snapshot = () => {
  if (!current) throw new Error('Ciclo indisponível.');
  return structuredClone(current);
};
function check(input: AdvanceLiteraryWorkflow) {
  if (!current) throw new Error('Ciclo indisponível.');
  const hash = JSON.stringify(input),
    old = operations.get(input.operationId);
  if (old) {
    if (old !== hash) throw new Error('Operação diferente.');
    return false;
  }
  if (current.job.revision !== input.expectedRevision) throw new Error('Revisão alterada.');
  operations.set(input.operationId, hash);
  current.job.revision++;
  return true;
}
const passageTitle = 'Da enseada abandonada ao retorno das marés: a escolha que deixou uma dívida';
export const getLiteraryWorkflowScope = (
  _bookId: string,
  chapterId: string,
  passage?: WorkflowPassageInput,
) => {
  if (
    passage &&
    (passage.previousWorkflowId !== 'fixture-previous-cycle' ||
      passage.actIntegrationId !== 'fixture-previous-act-integration')
  )
    return Promise.reject(new Error('Confira as condições escolhidas.'));
  return Promise.resolve({
    originToken: (passage ? 'd' : 'e').repeat(64),
    chapterId,
    actId: new URLSearchParams(window.location.search).has('literaryPassage')
      ? 'fixture-next-act'
      : null,
    bookTitle: 'O Atlas das Marés Esquecidas',
    chapterTitle: 'Capítulo preparado',
    collaboration: {
      version: 1 as const,
      mode: 'continuous' as const,
      revision: 1,
      configured: true,
    },
  });
};
export const startLiteraryWorkflow = async (input: StartLiteraryWorkflow) => {
  const scope = await getLiteraryWorkflowScope(input.target.id, input.chapterId, input.passage);
  if (scope.originToken !== input.expectedScopeToken) throw new Error('Origem alterada.');
  const state = await getLiteraryContract(),
    mode = state.contract.collaborationPolicy?.mode ?? 'supervised';
  current = {
    job: {
      ...(input.passage
        ? {
            passage: {
              input: structuredClone(input.passage),
              condition: 'integratedAct' as const,
              previous: {
                chapterId: 'fixture-prior-chapter',
                title: passageTitle,
                actId: 'fixture-prior-act',
              },
            },
            passageEntered: false,
          }
        : {}),
      jobId: input.jobId,
      originToken: 'f'.repeat(64),
      bookTitle: 'O Atlas das Marés Esquecidas',
      chapterTitle: 'Capítulo preparado',
      registrationState: 'active',
      chapterId: input.chapterId,
      revision: 1,
      phase: 'preparation',
      stop: null,
      paused: false,
      steps: 0,
      limits: structuredClone(input.limits),
      authorizedPhases: [...input.authorizedPhases],
      collaboration: { version: 1, mode, revision: state.revision, configured: true },
      draftId: 'cycle-draft-visual',
      reviewId: 'cycle-review-visual',
      manualMilestoneId: 'cycle-manual-visual',
      firstVersionId: null,
      priorApplications: 0,
      priorCredits: 0,
      createdAt: 100,
      completedAt: null,
      busyStep: null,
      errorCode: null,
      gate: { revision: 1, stateToken: 'a'.repeat(64) },
    },
    draft: null,
    review: null,
  };
  return snapshot();
};
export const getLiteraryWorkflow = () => Promise.resolve(snapshot());
export const listLiteraryWorkflows = (
  _bookId: string,
  chapterId: string | null,
  afterId: string | null = null,
) => {
  if (chapterId === null && new URLSearchParams(window.location.search).has('literaryPassage'))
    return Promise.resolve({
      items: afterId
        ? [
            {
              jobId: 'fixture-previous-cycle',
              chapterId: 'fixture-prior-chapter',
              chapterTitle: passageTitle,
              actId: 'fixture-prior-act',
              phase: 'done' as const,
              stop: null,
              paused: false,
              revision: 30,
              createdAt: 1730000000000,
              completedAt: 1730000000001,
            },
          ]
        : [],
      nextAfterId: afterId ? null : 'fixture-cycle-page-two',
    });
  const items: WorkflowListItem[] = current ? [{ ...current.job, actId: null }] : [];
  return Promise.resolve({ items, nextAfterId: null });
};
export const advanceLiteraryWorkflow = (input: AdvanceLiteraryWorkflow) => {
  if (!check(input) || !current) return Promise.resolve(snapshot());
  const job = current.job;
  if (job.paused || job.phase === 'done' || job.phase === 'canceled')
    return Promise.resolve(snapshot());
  if (job.steps >= job.limits.maxSteps) {
    job.stop = 'budget';
    return Promise.resolve(snapshot());
  }
  job.steps++;
  if (job.phase === 'preparation') {
    if (job.passage) job.passageEntered = true;
    job.phase = 'firstVersion';
    job.stop =
      job.collaboration.mode === 'guidance'
        ? 'manualConfirmation'
        : job.authorizedPhases.includes('firstVersion')
          ? null
          : 'firstVersionAuthorization';
  } else if (job.phase === 'firstVersion' && !job.stop) {
    if (job.limits.maxApplications < 2 || job.limits.maxCredits < 2) {
      job.stop = 'budget';
      return Promise.resolve(snapshot());
    }
    current.draft = {
      job: {
        jobId: job.draftId,
        chapterId: job.chapterId,
        state: 'done',
        units: 2,
        accepted: 2,
        drafted: 2,
        adopted: 0,
        pendingRequestId: null,
        milestoneJobId: 'cycle-first-version-visual',
        createdAt: 100,
        completedAt: 101,
        execution: { version: 1, mode: 'continuous', maxApplications: 2, maxCredits: 2 },
        controlRevision: 0,
        paused: false,
        chargedCredits: 2,
        executionStop: null,
        note: 'Dados fictícios.',
      },
    };
    job.firstVersionId = 'cycle-first-version-visual';
    job.phase = 'review';
    job.stop = job.authorizedPhases.includes('review') ? null : 'firstVersionAcceptance';
  } else if (job.phase === 'review' && !job.stop) {
    current.review = {
      jobId: job.reviewId,
      chapterId: job.chapterId,
      sourceToken: 'b'.repeat(64),
      state: 'done',
      units: 2,
      completedUnits: 2,
      analyses: 4,
      blocking: 0,
      warnings: 0,
      suggestions: 0,
      pendingRequestId: null,
      createdAt: 100,
      completedAt: 101,
      authorAccepted: false,
      preservationState: 'unrecorded',
      preservationCurrent: false,
      coverage: {
        scope: 'chapter-scenes',
        wholeChapter: true,
        wholeBook: false,
        layers: ['reviewStructure', 'reviewProse'],
        units: 2,
        completedUnits: 2,
      },
    };
    if (job.authorizedPhases.includes('review')) {
      current.review.authorAccepted = true;
      job.phase = 'revisedVersion';
      job.stop = job.authorizedPhases.includes('revisedVersion')
        ? null
        : 'revisedVersionAuthorization';
    } else job.stop = 'reviewAcceptance';
  } else if (job.phase === 'revisedVersion' && !job.stop) {
    job.phase = 'done';
    job.completedAt = 103;
    if (current.review) {
      current.review.preservationState = 'done';
      current.review.preservationCurrent = true;
      current.review.revisedMilestoneId = 'cycle-revised-version-visual';
    }
  }
  return Promise.resolve(snapshot());
};
export const setLiteraryWorkflowControl = (input: ControlLiteraryWorkflow) => {
  if (!check(input) || !current) return Promise.resolve(snapshot());
  const job = current.job;
  if (input.limits) job.limits = structuredClone(input.limits);
  if (input.authorizedPhases) job.authorizedPhases = [...input.authorizedPhases];
  if (input.action === 'pause') job.paused = true;
  else if (input.action === 'resume') {
    job.paused = false;
    if (['budget', 'attention', 'scene'].includes(job.stop ?? '')) job.stop = null;
  } else if (input.action === 'cancel') {
    job.phase = 'canceled';
    job.paused = true;
  } else if (input.action === 'acceptReview') {
    if (current.review) current.review.authorAccepted = true;
    job.phase = 'revisedVersion';
    job.stop = null;
  } else if (input.action === 'reconcileReview') {
    job.phase = 'review';
    job.stop = null;
    current.review = null;
  } else if (input.action === 'reconcileDraft') {
    job.phase = 'preparation';
    job.stop = null;
  } else job.stop = null;
  return Promise.resolve(snapshot());
};
