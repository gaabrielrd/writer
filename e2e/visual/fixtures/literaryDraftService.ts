import type {
  LiteraryDraftFrame,
  StartLiteraryDraft,
  SetLiteraryDraftExecution,
} from '../../../src/features/literary-production/services/literaryDraftService';
let current: LiteraryDraftFrame | null = null;
const snapshot = () => {
  if (!current) throw new Error('Redação indisponível.');
  return structuredClone(current);
};
export const startLiteraryDraft = (input: StartLiteraryDraft) => {
  current = {
    job: {
      jobId: input.jobId,
      chapterId: input.chapterId,
      state: 'planning',
      units: 2,
      accepted: 0,
      drafted: 0,
      adopted: 0,
      pendingRequestId: null,
      milestoneJobId: null,
      createdAt: 1,
      completedAt: null,
      note: 'Primeira versão não equivale a revisão ou publicação.',
      execution: input.execution ?? {
        version: 1,
        mode: 'supervised',
        maxApplications: null,
        maxCredits: null,
      },
      paused: false,
      controlRevision: 0,
      chargedCredits: 0,
      executionStop: null,
    },
  };
  return Promise.resolve(snapshot());
};
export const advanceLiteraryDraft = () => {
  if (!current) return Promise.reject(new Error('Registre a redação.'));
  const job = current.job;
  if (job.paused || job.executionStop || job.state === 'done') return Promise.resolve(snapshot());
  if (job.state === 'planning') job.state = 'writing';
  else if (job.state === 'preserving') {
    job.state = 'done';
    job.milestoneJobId = 'fixture-first-version';
    job.completedAt = 2;
  } else if (
    job.drafted >= Number(job.execution?.maxApplications) ||
    (job.chargedCredits ?? 0) >= Number(job.execution?.maxCredits)
  )
    job.executionStop = 'budget';
  else {
    job.drafted += 1;
    job.accepted += 1;
    job.chargedCredits = (job.chargedCredits ?? 0) + 1;
    if (job.accepted === job.units) job.state = 'preserving';
  }
  return Promise.resolve(snapshot());
};
export const getLiteraryDraft = () => Promise.resolve(snapshot());
const controls = new Map<string, string>();
export const setLiteraryDraftExecution = (input: SetLiteraryDraftExecution) => {
  if (!current) return Promise.reject(new Error('Redação indisponível.'));
  const prior = controls.get(input.operationId),
    fingerprint = JSON.stringify(input);
  if (prior) {
    if (prior !== fingerprint) return Promise.reject(new Error('Outro controle usa este pedido.'));
    return Promise.resolve(snapshot());
  }
  if ((current.job.controlRevision ?? 0) !== input.expectedRevision)
    return Promise.reject(new Error('Controle mudou.'));
  current.job.paused = input.paused;
  current.job.controlRevision = input.expectedRevision + 1;
  current.job.executionStop = null;
  if (input.execution) current.job.execution = input.execution;
  controls.set(input.operationId, fingerprint);
  return Promise.resolve(snapshot());
};
export const cancelLiteraryDraft = () => {
  if (current) current.job.state = 'canceled';
  return Promise.resolve(snapshot());
};
export const cancelPendingLiteraryDraft = cancelLiteraryDraft;
export const acceptLiteraryDraftScene = () =>
  Promise.reject(new Error('Esta fixture usa execução contínua.'));
export const adoptLiteraryDraftScene = () => Promise.resolve(snapshot());
export const regenerateLiteraryDraftScene = () => Promise.resolve(snapshot());
export const restartLiteraryDraftPreservation = () => Promise.resolve(snapshot());
export const listLiteraryDrafts = () =>
  Promise.resolve({ items: current ? [structuredClone(current.job)] : [], nextAfterId: null });
