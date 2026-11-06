import { digest, workFail, readWorkMetadata } from './workProgressContracts.mjs';
import { readLiteraryPublicationPolicy } from './literaryPublicationPolicy.mjs';
import { readLiteraryPassageInspection } from './literaryPassageInspection.mjs';
import { literaryNativeBirth } from './literarySourceOrigins.mjs';

const fail = (message) => workFail('failed-precondition', message, 'workflow-publication');
/** Author policy is enforced independently of optional predecessor selection. */
export async function captureLiteraryWorkflowAdmission(
  tx,
  c,
  chapterId,
  inspectionId,
  passage,
  { entered = false } = {},
) {
  const saved = await readLiteraryPublicationPolicy(tx, c),
    policy = saved.policy;
  if (policy?.requirePreviousPublication !== true) return null;
  if (!inspectionId)
    fail('Conclua a inspeção da ordem e publicação antes de registrar este ciclo.');
  const inspection = await readLiteraryPassageInspection(tx, c, inspectionId, chapterId, {
    entered,
  });
  if (passage?.input.inspectionId && passage.input.inspectionId !== inspectionId)
    fail('Use a mesma inspeção na admissão e na passagem selecionada.');
  const previous = inspection.previous;
  let condition = 'firstUnit';
  if (previous) {
    if (!passage || passage.previous.chapterId !== previous.id)
      fail('Conclua e selecione o ciclo da predecessora imediata antes de avançar.');
    const continuingAct =
      policy.unit === 'act' &&
      inspection.chapter.actId !== null &&
      inspection.chapter.actId === previous.actId;
    if (continuingAct) {
      const priorRow = await readWorkMetadata(
          tx,
          c.db.doc(c.path + '/literaryWorkflowJobs/' + passage.input.previousWorkflowId),
          ['actorId', 'chapterId', 'admission', 'admissionEntered'],
        ),
        prior = priorRow.data();
      if (
        !prior ||
        prior.actorId !== c.uid ||
        prior.chapterId !== previous.id ||
        digest(literaryNativeBirth(priorRow)) !== digest(passage.previousWorkflowBirth) ||
        prior.admissionEntered !== true ||
        prior.admission?.policy?.unit !== 'act' ||
        prior.admission.policy.revision !== saved.revision ||
        prior.admission.inspection.chapter.actId !== inspection.chapter.actId ||
        digest(prior.admission.inspection.chapterActBirth) !== digest(inspection.chapterActBirth)
      )
        fail('A continuação do ato exige o ingresso confirmado da predecessora na mesma política.');
      condition = 'continuedAct';
    } else {
      const publication = inspection.publication;
      const expected =
        policy.unit === 'act' && previous.actId !== null
          ? { kind: 'act', id: previous.actId }
          : { kind: 'chapter', id: previous.id };
      if (
        !publication ||
        publication.mode !== policy.unit ||
        digest(publication.scope) !== digest(expected) ||
        publication.count < 1
      )
        fail('Confira a publicação integral da unidade anterior antes de avançar.');
      condition = 'publishedPredecessor';
    }
  } else if (passage) fail('A primeira unidade não usa um ciclo predecessor fictício.');
  return {
    version: 1,
    policy: { unit: policy.unit, revision: saved.revision },
    condition,
    inspection,
  };
}
export async function verifyLiteraryWorkflowAdmission(tx, c, job) {
  const actual = await captureLiteraryWorkflowAdmission(
    tx,
    c,
    job.chapterId,
    job.admission?.inspection.inspectionId ?? null,
    job.passage ?? null,
    { entered: job.admissionEntered === true },
  );
  if (digest(actual) !== digest(job.admission ?? null))
    fail(
      'A política ou a origem da admissão mudou. Preserve este ciclo e registre nova autorização.',
    );
}
