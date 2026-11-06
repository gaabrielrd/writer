import {
  workClosed,
  workId,
  workFail,
  digest,
  readWorkMetadata,
} from './workProgressContracts.mjs';
import { validateId as validateInspectionId } from './generation.mjs';
import { readLiteraryCollaboration } from './literaryCollaboration.mjs';
import { readLiteraryReviewSource } from './literaryReviewSource.mjs';
import { readWorkHistoryRevision } from './workHistorySnapshot.mjs';
import { workflowBirth } from './literaryWorkflowOrigins.mjs';
import {
  readLiteraryIntegrationChapter,
  orderLiteraryIntegrationChapters,
  readLiteraryIntegrationFence,
} from './literaryIntegrationSources.mjs';
import { authorizeLiteraryIntegrationRequest } from './literaryIntegrationRequestRead.mjs';
import { captureLiteraryPublicationPassage } from './literaryPublicationPassage.mjs';
import { readLiteraryPassageInspection } from './literaryPassageInspection.mjs';
import { readLiteraryPublicationIntegration } from './literaryPublicationContracts.mjs';

const fail = (message) => workFail('failed-precondition', message, 'workflow-passage');
export function workflowPassageInput(value) {
  if (value === undefined || value === null) return null;
  workClosed(value, ['previousWorkflowId', 'actIntegrationId', 'publicationId', 'inspectionId']);
  return {
    previousWorkflowId: workId(value.previousWorkflowId),
    actIntegrationId: value.actIntegrationId == null ? null : workId(value.actIntegrationId),
    ...(value.publicationId == null ? {} : { publicationId: workId(value.publicationId) }),
    ...(value.inspectionId == null
      ? {}
      : { inspectionId: validateInspectionId(value.inspectionId) }),
  };
}
async function record(tx, c, collection, id) {
  const snapshot = await tx.get(c.db.doc(c.path + '/' + collection + '/' + workId(id)));
  if (!snapshot.exists) fail('Uma fonte da passagem foi removida.');
  return { value: snapshot.data(), birth: workflowBirth(snapshot) };
}
async function position(tx, c, chapter) {
  const act = chapter.actId
    ? await readWorkMetadata(tx, c.db.doc(c.path + '/acts/' + chapter.actId), [])
    : null;
  return {
    chapterId: chapter.id,
    title: chapter.title,
    order: chapter.order,
    actId: chapter.actId,
    actOrder: chapter.actOrder,
    actBirth: act ? workflowBirth(act) : null,
  };
}
/** Capture only native, author-selected prerequisites; no prose or provider output is stored. */
export async function captureLiteraryWorkflowPassage(
  tx,
  c,
  chapterId,
  input,
  { entered = false } = {},
) {
  if (!input) return null;
  const prior = await record(tx, c, 'literaryWorkflowJobs', input.previousWorkflowId),
    job = prior.value;
  if (
    job.jobId !== input.previousWorkflowId ||
    job.actorId !== c.uid ||
    job.registrationState !== 'active' ||
    !(
      job.phase === 'done' ||
      (entered && job.phase === 'revisedVersion' && job.completedAt != null)
    ) ||
    digest(job.workflowBirth) !== digest(prior.birth) ||
    job.chapterId === chapterId ||
    digest(job.collaboration) !== digest(await readLiteraryCollaboration(tx, c))
  )
    fail('Conclua o ciclo original do capítulo anterior antes de seguir.');
  const book = await readWorkMetadata(tx, c.ref, []),
    chapter = await readWorkMetadata(
      tx,
      c.db.doc(c.path + '/chapters/' + workId(job.chapterId)),
      [],
    );
  if (
    !chapter.exists ||
    digest(job.bookBirth) !== digest(workflowBirth(book)) ||
    digest(job.chapterBirth) !== digest(workflowBirth(chapter))
  )
    fail('O livro ou capítulo anterior foi recriado.');
  const previous = await readLiteraryIntegrationChapter(tx, c, job.chapterId),
    next = await readLiteraryIntegrationChapter(tx, c, chapterId);
  if (
    previous.actId !== job.actId ||
    orderLiteraryIntegrationChapters([previous, next])[0].id !== previous.id
  )
    fail('A passagem precisa seguir a ordem atual dos capítulos e atos.');
  const inspection = input.inspectionId
    ? await readLiteraryPassageInspection(tx, c, input.inspectionId, chapterId, { entered })
    : null;
  if (inspection && inspection.previous?.id !== previous.id)
    fail('Escolha o ciclo da predecessora imediata conferida no inventário do livro.');
  const review = await record(tx, c, 'literaryReviewJobs', job.reviewId),
    source = await readLiteraryReviewSource(tx, c, job.chapterId),
    value = review.value;
  if (
    value.jobId !== job.reviewId ||
    value.workflow?.id !== input.previousWorkflowId ||
    digest(value.workflow?.birth ?? null) !== digest(prior.birth) ||
    value.chapterId !== job.chapterId ||
    value.state !== 'done' ||
    !value.authorAccepted ||
    value.blocking !== 0 ||
    value.units < 1 ||
    value.completedUnits !== value.units ||
    value.sourceToken !== source.token ||
    value.preservationState !== 'done' ||
    (!entered && value.preservedHistoryRevision !== readWorkHistoryRevision(source.root))
  )
    fail('Confira e preserve a revisão integral atual do capítulo anterior.');
  const first = await record(tx, c, 'literaryMilestones', job.firstVersionId),
    revised = await record(tx, c, 'literaryMilestones', value.revisedMilestoneId);
  if (
    job.firstVersionId === value.revisedMilestoneId ||
    first.value.jobId !== job.firstVersionId ||
    revised.value.jobId !== value.revisedMilestoneId ||
    first.value.chapterId !== job.chapterId ||
    first.value.kind !== 'firstDraft' ||
    first.value.state !== 'done' ||
    revised.value.chapterId !== job.chapterId ||
    revised.value.kind !== 'revised' ||
    revised.value.state !== 'done' ||
    revised.value.sourceToken !== source.manuscriptToken ||
    revised.value.planned !== value.units ||
    revised.value.captured !== value.units ||
    revised.value.verified !== value.units
  )
    fail('As duas versões completas do capítulo anterior precisam estar preservadas.');
  const crossesAct = previous.actId !== next.actId && previous.actId !== null;
  if (crossesAct && !input.actIntegrationId)
    fail('Conclua e aceite a integração do ato anterior para atravessar sua fronteira.');
  if (!crossesAct && input.actIntegrationId)
    fail('Escolha integração de ato somente ao sair de um ato.');
  let integration = null;
  if (crossesAct && !entered) {
    const row = await record(tx, c, 'literaryIntegrationJobs', input.actIntegrationId),
      report = row.value,
      current = await readLiteraryIntegrationFence(tx, c);
    let publicationBridge = false;
    const publication = inspection?.publication;
    if (
      report.sourceFence !== current.token &&
      publication?.scope.kind === 'act' &&
      publication.scope.id === previous.actId &&
      publication.anchor.integration?.id === input.actIntegrationId &&
      publication.anchor.integration.sourceFence === report.sourceFence
    ) {
      // Publication changes updatedAt. A fresh complete publication inspection can
      // connect that confirmed edition to its exact native accepted integration.
      const actualIntegration = await readLiteraryPublicationIntegration(
        tx,
        c,
        input.actIntegrationId,
      );
      publicationBridge = digest(actualIntegration) === digest(publication.anchor.integration);
    }
    if (
      report.level !== 'act' ||
      report.actId !== previous.actId ||
      report.state !== 'done' ||
      !report.authorAccepted ||
      report.mainUnits < 1 ||
      report.mainReadUnits !== report.mainUnits ||
      report.verifiedUnits !== report.units ||
      report.verifiedAnalyses !== report.analyses ||
      report.blocking > (report.dismissedBlocking ?? 0) ||
      !report.finalRequestId ||
      (report.sourceFence !== current.token && !publicationBridge) ||
      (report.audit === 'architecture' &&
        (!report.architectureInventoryComplete ||
          report.architectureVerifiedSources !== report.architectureSources))
    )
      fail('A integração integral aceita do ato anterior está incompleta ou desatualizada.');
    // The native chapter proof also fixes the act incarnation observed during
    // integration. The root's conservative fence alone cannot prove act identity.
    const coveredChapter = await record(
      tx,
      c,
      'literaryIntegrationChapters',
      digest({ jobId: input.actIntegrationId, chapterId: previous.id }),
    );
    if (
      coveredChapter.value.jobId !== input.actIntegrationId ||
      coveredChapter.value.chapterId !== previous.id ||
      coveredChapter.value.token !== previous.token
    )
      fail('A integração não comprova a origem atual do capítulo e do ato anteriores.');
    const result = await record(tx, c, 'literaryIntegrationRequests', report.finalRequestId);
    if (result.value.state !== 'done' || result.value.jobId !== input.actIntegrationId)
      fail('A síntese final da integração não está confirmada.');
    await authorizeLiteraryIntegrationRequest(tx, c, result.value);
    integration = {
      id: input.actIntegrationId,
      birth: row.birth,
      sourceToken: report.sourceFence,
      finalRequestId: report.finalRequestId,
      finalRequestBirth: result.birth,
      acceptedAt: report.acceptedAt,
    };
  }
  return {
    version: 1,
    input,
    condition: crossesAct ? 'integratedAct' : 'revisedChapter',
    previousWorkflowBirth: prior.birth,
    previousChapterBirth: workflowBirth(chapter),
    previous: await position(tx, c, previous),
    next: await position(tx, c, next),
    reviewId: job.reviewId,
    reviewBirth: review.birth,
    reviewSourceToken: source.token,
    firstVersionId: job.firstVersionId,
    firstVersionBirth: first.birth,
    revisedVersionId: value.revisedMilestoneId,
    revisedVersionBirth: revised.birth,
    ...(inspection ? { inspection } : {}),
    ...(input.publicationId
      ? {
          publication: await captureLiteraryPublicationPassage(
            tx,
            c,
            input.publicationId,
            previous.id,
            { entered },
          ),
        }
      : {}),
    integration,
  };
}
export async function verifyLiteraryWorkflowPassage(tx, c, job) {
  if (!job.passage) return;
  const actual = await captureLiteraryWorkflowPassage(tx, c, job.chapterId, job.passage.input, {
    entered: job.passageEntered === true,
  });
  // The act integration is an entry certificate. Writes in the next chapter may
  // advance the conservative whole-book fence; that cannot revoke an entry already passed.
  if (job.passageEntered === true) actual.integration = job.passage.integration;
  if (digest(actual) !== digest(job.passage))
    fail('As condições observadas da passagem mudaram. Confira as fontes e registre novo ciclo.');
}
