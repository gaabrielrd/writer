import assert from 'node:assert/strict';
import { createLiteraryProductionService } from '../../src/literaryProduction.mjs';
import { emptyEditorialContract } from '../../src/literaryContracts.mjs';
import { createScenesService } from '../../src/scenes.mjs';
import { createLiteraryPlanningService } from '../../src/literaryPlanning.mjs';
import { createLiteraryPreparationService } from '../../src/literaryPreparation.mjs';
import { LITERARY_GATE_CRITERIA } from '../../src/literaryGateProtocol.mjs';
import { createLiteraryDraftService } from '../../src/literaryDrafting.mjs';
import { createLiteraryMilestoneService } from '../../src/literaryMilestones.mjs';
const target = { kind: 'book', id: 'book' };
/** Native services only; caller supplies its isolated root/account fixture. No test executes at import. */
export async function prepareLiteraryCheckpointFixture(
  db,
  { existing = false, finish = true } = {},
) {
  const contract = emptyEditorialContract();
  contract.collaborationPolicy = { version: 1, mode: 'supervised' };
  await createLiteraryProductionService({ db, now: () => 150 }).saveLiteraryContract('author', {
    target,
    operationId: 'checkpoint-contract',
    expectedRevision: 0,
    contract,
  });
  const scenes = createScenesService({ db, now: () => 200 });
  const chapter = await scenes.createSceneGroup('author', {
    target,
    operationId: 'checkpoint-chapter',
    title: 'A carta',
  });
  const created = await scenes.createScene('author', {
    target,
    operationId: 'checkpoint-scene',
    parentId: chapter.id,
    title: 'Cena',
    content: existing ? '<p>Texto que o autor já escreveu.</p>' : '',
    planning: { objective: 'Abrir a carta.' },
  });
  const planning = createLiteraryPlanningService({ db, now: () => 300 });
  const page = await planning.listLiteraryReferences('author', {
    target,
    kind: 'chapter',
    purpose: 'subject',
  });
  const reference = page.items.find((item) => item.reference.id === chapter.id).reference;
  const kinds = ['chapterBrief', 'scenePreparation', 'localWorldbuilding'],
    planIds = ['brief', 'scene-plan', 'world'];
  for (const [index, kind] of kinds.entries())
    await planning.saveLiteraryPlan('author', {
      target,
      id: planIds[index],
      operationId: 'checkpoint-plan-' + index,
      expectedRevision: 0,
      plan: {
        kind,
        title: kind,
        status: 'working',
        fields: kind === 'chapterBrief' ? { function: 'A carta muda a confiança.' } : {},
        references: [reference],
      },
    });
  const preparation = createLiteraryPreparationService({ db, now: () => 350 });
  const context = await preparation.getLiteraryPreparationContext('author', {
    target,
    chapterId: chapter.id,
    planIds,
  });
  await preparation.saveLiteraryPreparationGate('author', {
    target,
    chapterId: chapter.id,
    planIds,
    operationId: 'checkpoint-ready',
    expectedRevision: 0,
    stateToken: context.snapshot.stateToken,
    gate: {
      notes: 'Aceito.',
      authorAccepted: true,
      criteria: Object.keys(LITERARY_GATE_CRITERIA).map((id) => ({
        id,
        result: 'pass',
        rationale: 'A intenção está sustentada.',
        evidence: [{ documentId: 'plan:brief', quote: 'A carta muda a confiança.' }],
      })),
    },
  });
  const draft = createLiteraryDraftService({
    db,
    now: () => 500,
    generator: async () => ({
      text: 'A filha abriu a carta. Uma decisão mudou a casa.',
      complete: true,
      rationale: 'Uma escolha foi vivida.',
      findings: [],
    }),
  });
  const jobId = 'checkpoint-draft-job';
  await draft.startLiteraryDraft('author', {
    target,
    jobId,
    chapterId: chapter.id,
    instruction: 'PRIVATE_OWN_DRAFT_INPUT',
  });
  let final;
  if (finish)
    for (let step = 0; step < 200; step++) {
      const frame = await draft.advanceLiteraryDraft('author', { target, jobId });
      if (frame.job.state === 'done') {
        final = frame;
        break;
      }
      assert.equal(
        ['stale', 'canceled', 'attention'].includes(frame.job.state),
        false,
        JSON.stringify(frame.job),
      );
      if (frame.job.state === 'awaitingAcceptance')
        await draft.acceptLiteraryDraftScene('author', {
          target,
          jobId,
          requestId: frame.proposal.requestId,
          operationId: 'checkpoint-accept-' + step,
        });
      if (frame.job.state === 'existingText')
        await draft.adoptLiteraryDraftScene('author', {
          target,
          jobId,
          unitIndex: frame.unit.index,
          expectedSourceToken: frame.existing.sourceToken,
        });
    }
  if (finish) assert.ok(final);
  const milestones = createLiteraryMilestoneService({ db, now: () => 600 }),
    milestoneId = 'checkpoint-preserve-job';
  await milestones.startLiteraryMilestone('author', {
    target,
    jobId: milestoneId,
    chapterId: chapter.id,
    kind: 'revised',
  });
  if (finish) {
    let preserved = false;
    for (let step = 0; step < 100; step++) {
      const value = await milestones.advanceLiteraryMilestone('author', {
        target,
        jobId: milestoneId,
      });
      if (value.state === 'done') {
        preserved = true;
        break;
      }
    }
    assert.equal(preserved, true);
  }
  return {
    target,
    jobId,
    milestoneId,
    chapterId: chapter.id,
    sceneId: created.scene.id,
    draft,
    milestones,
    scenes,
  };
}
