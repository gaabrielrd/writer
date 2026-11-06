import type {
  SequenceFrame,
  SequenceScope,
  StartLiterarySequence,
  AdvanceLiterarySequence,
  ControlLiterarySequence,
} from '../../../src/features/literary-production/services/literarySequenceService';
import { getLiteraryContract } from './literaryProductionService';
import type { LiteraryPendingOperation } from '../../../src/features/literary-production/services/literaryRecoveryStorage';
import {
  finishLiteraryOperation,
  listLiteraryPendingOperations,
} from '../../../src/features/literary-production/services/literaryRecoveryStorage';
import type { SequenceOperation } from '../../../src/features/literary-production/services/literarySequenceService';
export const sequenceRecoveryCallsKey = 'fixture:sequence-recovery-calls';
function record(method: string) {
  const calls = JSON.parse(localStorage.getItem(sequenceRecoveryCallsKey) ?? '[]') as string[];
  localStorage.setItem(sequenceRecoveryCallsKey, JSON.stringify([...calls, method]));
}
export function getLiterarySequenceOperation(
  _bookId: string,
  jobId: string,
): Promise<SequenceOperation> {
  record('lookup');
  const entry = listLiteraryPendingOperations('visual-author', _bookId).find(
    (value) => value.id === jobId,
  );
  return Promise.resolve({
    state: 'running',
    method: 'advanceLiterarySequence',
    id: jobId,
    revision: 4,
    updatedAt: 100,
    requestHash: entry?.wireHash ?? null,
  });
}
export function verifyLiterarySequenceOperation(
  entry: LiteraryPendingOperation,
  outcome: SequenceOperation,
) {
  if (
    outcome.state !== 'unconfirmed' &&
    (outcome.requestHash !== entry.wireHash ||
      outcome.id !== entry.id ||
      outcome.method !== entry.method ||
      outcome.revision !== entry.expectedRevision)
  )
    throw new Error('Confirmação fictícia de outra origem.');
  return outcome;
}
export function resumeLiterarySequenceOperation(
  entry: LiteraryPendingOperation,
  actorId: string,
  stillCurrent: () => boolean,
) {
  if (entry.actorId !== actorId || !stillCurrent()) throw new Error('Sessão fictícia alterada.');
  record('resumeOriginal');
  finishLiteraryOperation(entry);
  return Promise.resolve();
}

let current: SequenceFrame | null = null;
const receipts = new Map<string, string>();
const snapshot = () => {
  if (!current) throw new Error('Sequência fictícia indisponível.');
  return structuredClone(current);
};
export async function getLiterarySequenceScope(
  _bookId: string,
  chapterIds: string[],
): Promise<SequenceScope> {
  record('preview');
  const state = await getLiteraryContract();
  return {
    originToken: 'a'.repeat(64),
    bookTitle: 'O Atlas das Marés Esquecidas',
    chapters: chapterIds.map((id, index) => ({
      id,
      title:
        id === 'chapter-continuous'
          ? 'Capítulo preparado'
          : 'O retorno à enseada e a escolha que permanece em aberto',
      order: index + 1,
      actId: null,
      actOrder: null,
    })),
    collaboration: {
      version: 1,
      mode: state.contract.collaborationPolicy?.mode ?? 'supervised',
      revision: state.revision,
      configured: true,
    },
  };
}
export async function startLiterarySequence(input: StartLiterarySequence): Promise<SequenceFrame> {
  record('register');
  const state = await getLiteraryContract();
  const mode = state.contract.collaborationPolicy?.mode ?? 'supervised';
  current = {
    job: {
      jobId: input.jobId,
      bookTitle: 'O Atlas das Marés Esquecidas',
      originToken: 'b'.repeat(64),
      chapters: input.chapterIds.map((id, index) => ({
        id,
        title:
          id === 'chapter-continuous'
            ? 'Capítulo preparado'
            : 'O retorno à enseada e a escolha que permanece em aberto',
        order: index + 1,
        actId: null,
        actOrder: null,
      })),
      registrationState: 'active',
      revision: 1,
      state: 'active',
      paused: false,
      index: 0,
      currentWorkflowId: null,
      completed: [],
      stop: null,
      busyStep: null,
      limits: structuredClone(input.limits),
      authorizedPhases: [...input.authorizedPhases],
      continueBetweenChapters: input.continueBetweenChapters,
      collaboration: { version: 1, mode, revision: state.revision, configured: true },
      applications: 0,
      credits: 0,
      steps: 0,
      createdAt: 100,
      completedAt: null,
    },
  };
  return snapshot();
}
export const getLiterarySequence = () => Promise.resolve(snapshot());
export const listLiterarySequences = () =>
  Promise.resolve({
    items: current ? [{ ...current.job, chapterCount: current.job.chapters.length }] : [],
    nextAfterId: null,
  });
function check(input: AdvanceLiterarySequence | ControlLiterarySequence) {
  if (!current) throw new Error('Sequência fictícia indisponível.');
  const fingerprint = JSON.stringify(input),
    old = receipts.get(input.operationId);
  if (old) {
    if (old !== fingerprint) throw new Error('Pedido fictício divergente.');
    return false;
  }
  if (
    input.expectedRevision !== current.job.revision ||
    input.expectedOriginToken !== current.job.originToken
  )
    throw new Error('Checkpoint fictício alterado.');
  receipts.set(input.operationId, fingerprint);
  current.job.revision++;
  return true;
}
export function advanceLiterarySequence(input: AdvanceLiterarySequence) {
  record('advance');
  if (!check(input) || !current) return Promise.resolve(snapshot());
  const job = current.job;
  if (job.paused || job.state !== 'active')
    throw new Error('Execução fictícia encerrada ou pausada.');
  if (job.stop === 'nextChapterAuthorization') return Promise.resolve(snapshot());
  if (job.authorizedPhases.length !== 3) {
    job.stop = 'firstVersionAuthorization';
    return Promise.resolve(snapshot());
  }
  const cost = job.index === 0 ? 2 : 1;
  if (
    job.applications + cost > job.limits.maxApplications ||
    job.credits + cost > job.limits.maxCredits
  ) {
    job.stop = 'budget';
    return Promise.resolve(snapshot());
  }
  job.applications += cost;
  job.credits += cost;
  job.steps += 12;
  job.completed.push({ index: job.index, workflowId: 'fixture-sequence-unit-' + job.index });
  job.index++;
  if (job.index === job.chapters.length) {
    job.state = 'done';
    job.stop = null;
    job.completedAt = 200;
  } else job.stop = job.continueBetweenChapters ? null : 'nextChapterAuthorization';
  return Promise.resolve(snapshot());
}
export function setLiterarySequenceControl(input: ControlLiterarySequence) {
  record('control');
  if (!check(input) || !current) return Promise.resolve(snapshot());
  const job = current.job;
  if (input.action === 'pause') job.paused = true;
  if (input.action === 'resume') {
    job.paused = false;
    if (job.stop === 'budget') job.stop = null;
  }
  if (input.action === 'authorizeNext') job.stop = null;
  if (input.action === 'cancel') {
    job.state = 'canceled';
    job.paused = true;
  }
  if (input.limits) job.limits = structuredClone(input.limits);
  if (input.authorizedPhases) job.authorizedPhases = [...input.authorizedPhases];
  return Promise.resolve(snapshot());
}
export function recoverLiterarySequenceStep() {
  record('resumeOriginal');
  return Promise.resolve(snapshot());
}
