import {
  workProject,
  workId,
  workFail,
  digest,
  readWorkMetadata,
} from './workProgressContracts.mjs';
import { workflowBirth } from './literaryWorkflowOrigins.mjs';
import { readLiteraryCollaboration } from './literaryCollaboration.mjs';
import {
  readLiteraryIntegrationChapter,
  orderLiteraryIntegrationChapters,
} from './literaryIntegrationSources.mjs';
export const SEQUENCE_BATCH_LIMIT = 25;
const fail = (message, reason = 'sequence-origin') =>
  workFail('failed-precondition', message, reason);
export function sequenceChapterIds(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > SEQUENCE_BATCH_LIMIT)
    workFail(
      'invalid-argument',
      'Selecione de um a 25 capítulos por execução. O livro não tem limite de capítulos.',
    );
  const ids = value.map(workId);
  if (new Set(ids).size !== ids.length)
    workFail('invalid-argument', 'Não repita capítulos na execução.');
  return ids;
}
export async function captureLiterarySequenceScope(tx, c, ids) {
  const root = await workProject(tx, c),
    book = await readWorkMetadata(tx, c.ref, []),
    chapters = [];
  for (const id of ids) {
    const chapter = await readLiteraryIntegrationChapter(tx, c, id);
    if (chapter.mode !== 'scenes') fail('Selecione capítulos compostos por cenas.');
    const row = await readWorkMetadata(tx, c.db.doc(c.path + '/chapters/' + id), []),
      act = chapter.actId
        ? await readWorkMetadata(tx, c.db.doc(c.path + '/acts/' + chapter.actId), [])
        : null;
    chapters.push({
      id,
      title: chapter.title,
      order: chapter.order,
      actId: chapter.actId,
      actOrder: chapter.actOrder,
      birth: workflowBirth(row),
      actBirth: act ? workflowBirth(act) : null,
    });
  }
  const ordered = orderLiteraryIntegrationChapters(chapters.map((v) => ({ ...v })));
  if (digest(ordered.map((v) => v.id)) !== digest(ids))
    fail('A execução precisa seguir a ordem nativa de capítulos e atos.');
  const proof = {
    actorId: c.uid,
    target: c.target,
    bookBirth: workflowBirth(book),
    collaboration: await readLiteraryCollaboration(tx, c),
    chapters,
  };
  return {
    ...proof,
    bookTitle: root.title ?? 'Livro',
    originToken: digest({ domain: 'literary-sequence-scope-v1', ...proof }),
  };
}
export function sequenceOrigin(c, snapshot, job) {
  return digest({
    domain: 'literary-sequence-origin-v1',
    actorId: c.uid,
    target: c.target,
    jobId: snapshot.id,
    bookBirth: job.bookBirth,
    birth: workflowBirth(snapshot),
  });
}
export async function readLiterarySequence(tx, c, id) {
  await workProject(tx, c);
  const ref = c.db.doc(c.path + '/literarySequenceJobs/' + workId(id)),
    snapshot = await tx.get(ref),
    job = snapshot.data();
  if (!job || job.actorId !== c.uid) workFail('not-found', 'Execução indisponível.');
  if (
    ![job.applications, job.credits, job.steps, job.revision].every(
      (n) => Number.isSafeInteger(n) && n >= 0,
    ) ||
    !Array.isArray(job.chapters) ||
    job.chapters.length < 1 ||
    job.chapters.length > SEQUENCE_BATCH_LIMIT ||
    !Number.isSafeInteger(job.index) ||
    job.index < 0 ||
    job.index > job.chapters.length ||
    !Array.isArray(job.completed) ||
    job.completed.length !== job.index
  )
    fail('O controle agregado da execução está inconsistente.');
  return { ref, snapshot, job, originToken: sequenceOrigin(c, snapshot, job) };
}
export async function assertLiterarySequenceIdentity(tx, c, context, { closing = false } = {}) {
  const { job, snapshot } = context;
  const book = await readWorkMetadata(tx, c.ref, []);
  if (
    job.jobId !== snapshot.id ||
    job.actorId !== c.uid ||
    job.registrationState !== 'active' ||
    digest(job.birth) !== digest(workflowBirth(snapshot)) ||
    digest(job.bookBirth) !== digest(workflowBirth(book))
  )
    fail('A execução não está ativa ou sua origem foi recriada.');
  if (!closing) {
    const actual = await captureLiterarySequenceScope(
      tx,
      c,
      job.chapters.map((v) => v.id),
    );
    if (actual.originToken !== job.scopeToken)
      fail('O contrato, a ordem ou a origem dos capítulos mudou.');
  }
}
export async function verifySequenceWorkflowMembership(tx, c, workflow) {
  if (!workflow.sequence) return null;
  const binding = workflow.sequence,
    context = await readLiterarySequence(tx, c, binding.id),
    { job } = context;
  await assertLiterarySequenceIdentity(tx, c, context, { closing: true });
  const completed = job.completed.find((item) => item.index === binding.index);
  if (
    digest(binding.birth) !== digest(job.birth) ||
    job.chapters[binding.index]?.id !== workflow.chapterId ||
    !(
      (binding.index === job.index && job.currentWorkflowId === workflow.jobId) ||
      (completed?.workflowId === workflow.jobId &&
        digest(completed.birth) === digest(workflow.workflowBirth))
    )
  )
    fail('O ciclo não pertence à unidade original desta execução.');
  return context;
}
export async function readSequenceWorkflowGrant(tx, c, workflow) {
  const context = await verifySequenceWorkflowMembership(tx, c, workflow);
  if (!context) return null;
  await assertLiterarySequenceIdentity(tx, c, context);
  const { job } = context;
  if (
    job.state !== 'active' ||
    job.paused ||
    workflow.sequence.index !== job.index ||
    job.currentWorkflowId !== workflow.jobId
  )
    fail('A execução está pausada, encerrada ou já passou desta unidade.', 'sequence-paused');
  return context;
}
export async function prepareSequenceApplication(tx, c, workflow, cost, automatic = false) {
  const context = await readSequenceWorkflowGrant(tx, c, workflow);
  if (!context) return { commit() {} };
  const { job, ref } = context;
  if (!Number.isSafeInteger(cost) || cost < 0 || cost > 1) fail('Débito de execução inválido.');
  if (automatic && !job.authorizedPhases.includes('firstVersion'))
    fail('A fase automática foi retirada da execução.', 'sequence-phase');
  if (job.applications >= job.limits.maxApplications || job.credits + cost > job.limits.maxCredits)
    fail('O orçamento total autorizado da execução foi atingido.', 'sequence-budget');
  return {
    commit() {
      tx.update(ref, { applications: job.applications + 1, credits: job.credits + cost });
    },
  };
}
export async function prepareSequenceStep(tx, c, workflow) {
  const context = await readSequenceWorkflowGrant(tx, c, workflow);
  if (!context) return { commit() {} };
  const { job, ref } = context;
  if (
    workflow.authorizedPhases.includes(workflow.phase) &&
    !job.authorizedPhases.includes(workflow.phase)
  )
    fail(
      'A autorização desta fase mudou na execução. Confira o ciclo antes de continuar.',
      'sequence-phase',
    );
  if (job.steps >= job.limits.maxSteps)
    fail('O limite total de passos foi atingido.', 'sequence-budget');
  return {
    commit() {
      tx.update(ref, { steps: job.steps + 1 });
    },
  };
}
export async function checkSequenceWorkflowSettings(tx, c, workflow, limits, phases) {
  const context = await readSequenceWorkflowGrant(tx, c, workflow);
  if (!context) return;
  const { job } = context;
  const draft = (
    await readWorkMetadata(tx, c.db.doc(c.path + '/literaryDraftJobs/' + workflow.draftId), [
      'drafted',
      'chargedCredits',
    ])
  ).data();
  const applications = workflow.priorApplications + (draft?.drafted ?? 0),
    credits = workflow.priorCredits + (draft?.chargedCredits ?? draft?.drafted ?? 0);
  if (
    limits.maxApplications - applications > job.limits.maxApplications - job.applications ||
    limits.maxCredits - credits > job.limits.maxCredits - job.credits ||
    phases.some((phase) => !job.authorizedPhases.includes(phase))
  )
    fail('Amplie o orçamento ou as fases na execução antes de alterar o ciclo.', 'sequence-budget');
}
