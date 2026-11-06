import { studioDb } from './studioDb.mjs';
import { createLiteraryMilestoneService } from '../../src/literaryMilestones.mjs';
import { createScenesService } from '../../src/scenes.mjs';
import { createLiteraryProductionService } from '../../src/literaryProduction.mjs';
import { emptyEditorialContract } from '../../src/literaryContracts.mjs';
import { createLiteraryPlanningService } from '../../src/literaryPlanning.mjs';
import { createLiteraryPreparationService } from '../../src/literaryPreparation.mjs';
import { LITERARY_GATE_CRITERIA } from '../../src/literaryGateProtocol.mjs';
import { createLiteraryWorkflowService } from '../../src/literaryWorkflow.mjs';
import { createLiteraryDraftService } from '../../src/literaryDrafting.mjs';
import { createLiteraryReviewService } from '../../src/literaryReview.mjs';
import assert from 'node:assert/strict';
export const target = { kind: 'book', id: 'book' };
export const limits = { maxApplications: 2, maxCredits: 2, maxSteps: 200 };
export const phases = ['firstVersion', 'review', 'revisedVersion'];
export const answer = (mode) => ({
  text: mode.startsWith('review') ? '' : 'A filha abriu a carta. Uma decisão mudou a casa.',
  complete: true,
  rationale: 'A escolha tem consequência.',
  findings: [],
});
export async function fixture({
  mode = 'continuous',
  generator = async (input) => answer(input.operation),
  prepare = true,
  acts = false,
} = {}) {
  const f = studioDb(),
    calls = [];
  f.records.set('books/book', {
    authorId: 'author',
    title: 'Livro',
    status: 'draft',
    updatedAt: 100,
    createdAt: 1,
    wordCount: 0,
  });
  f.records.set('users/author', { credits: 10 });
  if (acts) {
    f.records.set('books/book/acts/first', { name: 'Primeiro ato', order: 1 });
    f.records.set('books/book/acts/second', { name: 'Segundo ato', order: 2 });
  }
  const production = createLiteraryProductionService({ db: f.db, now: () => 150 }),
    contract = emptyEditorialContract();
  contract.collaborationPolicy = { version: 1, mode };
  await production.saveLiteraryContract('author', {
    target,
    operationId: 'workflow-contract-0001',
    expectedRevision: 0,
    contract,
  });
  const scenes = createScenesService({ db: f.db, now: () => 200 });
  const chapter = await scenes.createSceneGroup('author', {
      target,
      operationId: 'workflow-chapter-0001',
      title: 'A carta',
      ...(acts ? { actId: 'first' } : {}),
    }),
    ids = [];
  for (let i = 0; i < 2; i++) {
    const native = await scenes.createScene('author', {
      target,
      parentId: chapter.id,
      operationId: 'workflow-scene-000' + i,
      title: 'Cena ' + i,
      content: mode === 'guidance' ? '<p>A filha recebeu a carta.</p>' : '',
    });
    ids.push(native.scene.id);
  }
  const planning = createLiteraryPlanningService({ db: f.db, now: () => 300 }),
    reference = (
      await planning.listLiteraryReferences('author', {
        target,
        kind: 'chapter',
        purpose: 'subject',
      })
    ).items.find((i) => i.reference.id === chapter.id).reference,
    planIds = ['brief', 'scenes', 'world'];
  for (const [i, kind] of ['chapterBrief', 'scenePreparation', 'localWorldbuilding'].entries())
    await planning.saveLiteraryPlan('author', {
      target,
      id: planIds[i],
      operationId: 'workflow-plan-000' + i,
      expectedRevision: 0,
      plan: {
        kind,
        title: kind,
        status: 'working',
        fields: kind === 'chapterBrief' ? { function: 'A carta muda a confiança.' } : {},
        references: [reference],
      },
    });
  const preparation = createLiteraryPreparationService({ db: f.db, now: () => 350 });
  let gateRevision = 0,
    gateAttempt = 0;
  async function prepareGate() {
    const context = await preparation.getLiteraryPreparationContext('author', {
      target,
      chapterId: chapter.id,
      planIds,
    });
    const saved = await preparation.saveLiteraryPreparationGate('author', {
      target,
      chapterId: chapter.id,
      planIds,
      operationId: 'workflow-gate-000' + ++gateAttempt,
      expectedRevision: gateRevision,
      stateToken: context.snapshot.stateToken,
      gate: {
        authorAccepted: true,
        notes: 'Preparação aceita.',
        criteria: Object.keys(LITERARY_GATE_CRITERIA).map((id) => ({
          id,
          result: 'pass',
          rationale: 'Intenção sustentada.',
          evidence: [{ documentId: 'plan:brief', quote: 'A carta muda a confiança.' }],
        })),
      },
    });
    gateRevision = saved.revision;
  }
  if (prepare) await prepareGate();
  const generate = async (input) => {
    calls.push(input);
    return generator(input);
  };
  const drafts = createLiteraryDraftService({ db: f.db, generator: generate, now: () => 500 }),
    reviews = createLiteraryReviewService({ db: f.db, generator: generate, now: () => 500 });
  const milestones = createLiteraryMilestoneService({ db: f.db, now: () => 500 });
  const api = createLiteraryWorkflowService({
    db: f.db,
    generator: generate,
    now: () => 500,
    drafts,
    reviews,
    milestones,
  });
  let n = 0;
  const startInput = async ({
    authorizedPhases = mode === 'continuous' ? phases : [],
    budget = limits,
  } = {}) => {
    const source = await api.getLiteraryWorkflowScope('author', { target, chapterId: chapter.id });
    return {
      target,
      jobId: 'workflow-cycle-0001',
      chapterId: chapter.id,
      expectedScopeToken: source.originToken,
      instruction: 'Preserve a intenção.',
      authorizedPhases,
      limits: budget,
    };
  };
  const start = async (options) => api.startLiteraryWorkflow('author', await startInput(options));
  const get = () => api.getLiteraryWorkflow('author', { target, jobId: 'workflow-cycle-0001' });
  const advance = async () => {
    const frame = await get();
    return api.advanceLiteraryWorkflow('author', {
      target,
      jobId: frame.job.jobId,
      operationId: 'workflow-step-' + String(++n).padStart(5, '0'),
      expectedRevision: frame.job.revision,
      expectedOriginToken: frame.job.originToken,
    });
  };
  const control = async (action, extra = {}) => {
    const frame = await get();
    return api.setLiteraryWorkflowControl('author', {
      target,
      jobId: frame.job.jobId,
      operationId: 'workflow-control-' + String(++n).padStart(5, '0'),
      expectedRevision: frame.job.revision,
      expectedOriginToken: frame.job.originToken,
      action,
      ...extra,
    });
  };
  async function until(predicate, max = 150) {
    let frame = await get();
    for (let i = 0; i < max && !predicate(frame); i++) frame = await advance();
    assert.ok(predicate(frame), JSON.stringify(frame.job));
    return frame;
  }
  return {
    ...f,
    api,
    drafts,
    reviews,
    milestones,
    production,
    scenes,
    ids,
    chapterId: chapter.id,
    calls,
    start,
    startInput,
    get,
    advance,
    control,
    until,
    prepareGate,
  };
}
export async function nextChapter(f, { actId = null } = {}) {
  const chapter = await f.scenes.createSceneGroup('author', {
    target,
    operationId: 'passage-chapter-0001',
    title: 'A resposta',
    actId,
  });
  const scene = await f.scenes.createScene('author', {
    target,
    parentId: chapter.id,
    operationId: 'passage-scene-0001',
    title: 'A decisão',
    content: '',
  });
  const planning = createLiteraryPlanningService({ db: f.db, now: () => 300 });
  const reference = (
    await planning.listLiteraryReferences('author', {
      target,
      kind: 'chapter',
      purpose: 'subject',
    })
  ).items.find((i) => i.reference.id === chapter.id).reference;
  const planIds = ['next-brief', 'next-scenes', 'next-world'];
  for (const [i, kind] of ['chapterBrief', 'scenePreparation', 'localWorldbuilding'].entries())
    await planning.saveLiteraryPlan('author', {
      target,
      id: planIds[i],
      operationId: 'passage-plan-000' + i,
      expectedRevision: 0,
      plan: {
        kind,
        title: kind,
        status: 'working',
        fields: kind === 'chapterBrief' ? { function: 'A resposta muda a confiança.' } : {},
        references: [reference],
      },
    });
  const prep = createLiteraryPreparationService({ db: f.db, now: () => 350 });
  const context = await prep.getLiteraryPreparationContext('author', {
    target,
    chapterId: chapter.id,
    planIds,
  });
  await prep.saveLiteraryPreparationGate('author', {
    target,
    chapterId: chapter.id,
    planIds,
    operationId: 'passage-gate-0001',
    expectedRevision: 0,
    stateToken: context.snapshot.stateToken,
    gate: {
      authorAccepted: true,
      notes: 'Preparação aceita.',
      criteria: Object.keys(LITERARY_GATE_CRITERIA).map((id) => ({
        id,
        result: 'pass',
        rationale: 'Passagem com consequência.',
        evidence: [{ documentId: 'plan:next-brief', quote: 'A resposta muda a confiança.' }],
      })),
    },
  });
  await f.prepareGate();
  const jobId = 'passage-cycle-0001';
  let step = 0;
  const get = () => f.api.getLiteraryWorkflow('author', { target, jobId });
  const advance = async () => {
    const frame = await get();
    return f.api.advanceLiteraryWorkflow('author', {
      target,
      jobId,
      operationId: 'passage-step-' + String(++step).padStart(5, '0'),
      expectedRevision: frame.job.revision,
      expectedOriginToken: frame.job.originToken,
    });
  };
  const input = async (passage = { previousWorkflowId: 'workflow-cycle-0001' }) => {
    const scope = await f.api.getLiteraryWorkflowScope('author', {
      target,
      chapterId: chapter.id,
      passage,
    });
    return {
      target,
      jobId,
      chapterId: chapter.id,
      passage,
      expectedScopeToken: scope.originToken,
      instruction: 'Continue a consequência.',
      limits,
      authorizedPhases: phases,
    };
  };
  return { chapterId: chapter.id, sceneId: scene.scene.id, jobId, get, advance, input };
}
