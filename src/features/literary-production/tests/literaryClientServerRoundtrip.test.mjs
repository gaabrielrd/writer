import { createLiteraryWorkflowService } from '../../../../functions/src/literaryWorkflow.mjs';
import * as workflowClient from '../services/literaryWorkflowService';
import { createLiteraryProseService } from '../../../../functions/src/literaryProse.mjs';
import * as proseClient from '../services/literaryProseService';
import { createLiteraryDraftService } from '../../../../functions/src/literaryDrafting.mjs';
import { createLiteraryPreparationService } from '../../../../functions/src/literaryPreparation.mjs';
import { createScenesService } from '../../../../functions/src/scenes.mjs';
import { LITERARY_GATE_CRITERIA } from '../../../../functions/src/literaryGateProtocol.mjs';
import * as draftClient from '../services/literaryDraftService';
import * as preparationClient from '../services/literaryPreparationService';
import { createLiteraryFindingService } from '../../../../functions/src/literaryFindings.mjs';
import * as findingClient from '../services/literaryFindingService';
import { createLiteraryIntegrationService } from '../../../../functions/src/literaryIntegration.mjs';
import * as integrationClient from '../services/literaryIntegrationService';
import { createLiteraryBookMapService } from '../../../../functions/src/literaryBookMap.mjs';
import * as mapClient from '../services/literaryBookMapService';
import { beforeEach, expect, it, vi } from 'vitest';
import { createDomainHandler } from '../../../../functions/src/domainCallable.mjs';
import { FUNCTION_DOMAINS } from '../../../../functions/src/functionDomains.mjs';
import { createLiteraryProductionService } from '../../../../functions/src/literaryProduction.mjs';
import { createLiteraryPlanningService } from '../../../../functions/src/literaryPlanning.mjs';
import { emptyEditorialContract } from '../../../../functions/src/literaryContracts.mjs';
import { studioDb } from '../../../../functions/test/helpers/studioDb.mjs';
import * as contractClient from '../services/literaryProductionService';
import * as planningClient from '../services/literaryPlanningService';
import { listLiteraryPendingOperations } from '../services/literaryRecoveryStorage';
const wire = vi.hoisted(() => ({ dispatch: null, uid: 'author', loseNextAcknowledgement: false }));
vi.mock('@/shared/api/domainCallable', () => ({
  getFunctions: vi.fn(),
  httpsCallable: (_functions, action) => async (payload) => {
    let data;
    try {
      data = await wire.dispatch({
        auth: { uid: wire.uid },
        app: { appId: 'demo' },
        data: { version: 1, action, payload },
      });
    } catch (cause) {
      throw Object.assign(new Error(action + ': ' + cause.message), {
        code: 'functions/' + cause.code,
      });
    }
    if (wire.loseNextAcknowledgement) {
      wire.loseNextAcknowledgement = false;
      throw new Error('Acknowledgement lost after the native commit');
    }
    return { data };
  },
}));
vi.mock('@/shared/lib', async (original) => ({ ...(await original()), getFirebaseApp: vi.fn() }));
let database;
const target = { kind: 'book', id: 'book' };
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  wire.uid = 'author';
  wire.loseNextAcknowledgement = false;
  database = studioDb();
  database.records.set('books/book', {
    authorId: 'author',
    title: 'Livro',
    status: 'draft',
    updatedAt: 10,
    createdAt: 1,
    wordCount: 2,
  });
  database.records.set('users/author', { credits: 7 });
  database.records.set('books/book/chapters/chapter', {
    bookId: 'book',
    title: 'A carta',
    order: 1,
    content: '<p>Texto preservado.</p>',
    updatedAt: 10,
    createdAt: 1,
  });
  const api = {
    ...createLiteraryDraftService({
      db: database.db,
      now: () => 300,
      generator: async () => ({
        complete: true,
        text: 'A carta abriu uma nova escolha.',
        rationale: 'A decisão foi vivida.',
        findings: [],
      }),
    }),
    ...createLiteraryProseService({
      db: database.db,
      now: () => 300,
      generator: async (input) => ({
        complete: true,
        text: input.operation.startsWith('review') ? '' : 'A carta trouxe uma escolha.',
        rationale: 'Conferência da intenção.',
        findings: [],
      }),
    }),
    ...createLiteraryWorkflowService({
      db: database.db,
      now: () => 300,
      generator: async (input) => ({
        complete: true,
        text: input.operation.startsWith('review') ? '' : 'A carta trouxe uma escolha.',
        rationale: 'Conferência do capítulo.',
        findings: [],
      }),
    }),
    ...createLiteraryPreparationService({ db: database.db, now: () => 250 }),
    ...createLiteraryFindingService({ db: database.db, now: () => 200 }),
    ...createLiteraryIntegrationService({
      db: database.db,
      now: () => 100,
      generator: async (input) =>
        input.scope.phase === 'synthesis'
          ? {
              complete: true,
              report: 'Síntese',
              findings: [
                {
                  severity: 'warning',
                  problem: 'Conferir estrutura',
                  action: 'Conciliar',
                  evidenceIds: [input.documents[0].id],
                },
              ],
              conclusions: [],
            }
          : {
              complete: true,
              report: 'Leitura',
              findings: [
                {
                  severity: 'warning',
                  problem: 'Conferir estrutura',
                  action: 'Conciliar',
                  evidence: [
                    {
                      sourceId: input.documents[0].id,
                      quote: input.documents[0].text.slice(0, 10),
                    },
                  ],
                },
              ],
              matrix: [],
            },
    }),
    ...createLiteraryBookMapService({ db: database.db }),
    ...createLiteraryProductionService({ db: database.db, now: () => 100 }),
    ...createLiteraryPlanningService({ db: database.db, now: () => 100 }),
  };
  const sectors = Object.entries(FUNCTION_DOMAINS).map(([name, domain]) => ({
    domain,
    handler: createDomainHandler({
      name,
      domain,
      invoke: (method, request) => {
        if (!Object.hasOwn(api, method))
          throw new Error('Endpoint missing from the real services: ' + method);
        return api[method](request.auth.uid, request.data);
      },
    }),
  }));
  wire.dispatch = (request) => {
    const sector = sectors.find(({ domain }) => Object.hasOwn(domain.actions, request.data.action));
    if (!sector) throw new Error('Unregistered action: ' + request.data.action);
    return sector.handler(request);
  };
});
const overview = () => ({
  kind: 'bookOverview',
  title: 'Visão do livro',
  status: 'working',
  fields: { question: 'O custo de confiar.' },
  references: [],
});
const planInput = () => ({
  target,
  id: 'overview',
  operationId: 'save-native-plan-000001',
  expectedRevision: 0,
  plan: overview(),
});
const count = (prefix) =>
  [...database.records.keys()].filter((path) => path.startsWith(prefix)).length;
it('client contract saves preserve versions and explicit decisions through the actual sector handler without affecting prose or credits', async () => {
  const original = structuredClone(database.records.get('books/book/chapters/chapter'));
  const contract = emptyEditorialContract();
  contract.fields.premise = 'Uma carta transforma a confiança.';
  contract.decisions.push({
    id: 'decision',
    text: 'A dúvida permanece hipótese.',
    category: 'hypothesis',
    status: 'approved',
    source: 'Autora',
    supersedes: null,
  });
  expect((await contractClient.getLiteraryContract('book')).revision).toBe(0);
  const input = { target, operationId: 'save-native-contract-001', expectedRevision: 0, contract };
  expect((await contractClient.saveLiteraryContract(input, 'author')).revision).toBe(1);
  expect((await contractClient.getLiteraryContractVersion('book', 1)).contract).toEqual(contract);
  expect((await contractClient.listLiteraryContractVersions('book')).items).toHaveLength(1);
  await contractClient.saveLiteraryContract(
    { ...input, operationId: 'save-native-contract-002', expectedRevision: 1 },
    'author',
  );
  expect((await contractClient.listLiteraryContractVersions('book')).items).toHaveLength(1);
  expect(
    await contractClient.getLiteraryOperation('book', 'save-native-contract-002'),
  ).toMatchObject({ state: 'confirmed', kind: 'contract', noOp: true, revision: 1 });
  expect(database.records.get('books/book/chapters/chapter')).toEqual(original);
  expect(database.records.get('users/author').credits).toBe(7);
  expect(listLiteraryPendingOperations('author', 'book')).toEqual([]);
});
it('lost acknowledgement after a native plan commit recovers the same accepted version after a successor without overwriting it', async () => {
  const first = planInput();
  wire.loseNextAcknowledgement = true;
  await expect(planningClient.saveLiteraryPlan(first, 'author')).rejects.toThrow(
    'Acknowledgement lost',
  );
  const pending = listLiteraryPendingOperations('author', 'book');
  expect(pending).toHaveLength(1);
  expect(JSON.stringify(pending)).not.toContain('O custo de confiar.');
  expect(await contractClient.getLiteraryOperation('book', first.operationId)).toMatchObject({
    state: 'confirmed',
    kind: 'plan',
    id: first.id,
    revision: 1,
  });
  await planningClient.saveLiteraryPlan(
    {
      ...first,
      operationId: 'save-native-plan-000002',
      expectedRevision: 1,
      plan: { ...first.plan, fields: { question: 'Uma revisão posterior.' } },
    },
    'author',
  );
  const after = structuredClone([...database.records]);
  expect(await planningClient.saveLiteraryPlan(first, 'author')).toMatchObject({ revision: 1 });
  expect([...database.records]).toEqual(after);
  expect((await planningClient.getLiteraryPlan('book', first.id)).plan.fields.question).toBe(
    'Uma revisão posterior.',
  );
  expect(
    (await planningClient.getLiteraryPlanVersion('book', first.id, 1)).plan.fields.question,
  ).toBe('O custo de confiar.');
  expect((await planningClient.listLiteraryPlanVersions('book', first.id)).items).toHaveLength(2);
  expect((await planningClient.listLiteraryPlans('book')).items).toHaveLength(1);
  expect(listLiteraryPendingOperations('author', 'book')).toEqual([]);
});
it('native subject identity survives prose edits while a consumed source becomes changed, and a recreated chapter never supplies its old grant', async () => {
  const subject = await planningClient.listLiteraryReferences('book', 'chapter', null, 'subject');
  const source = await planningClient.listLiteraryReferences('book', 'chapter', null, 'source');
  expect(subject.items).toHaveLength(1);
  expect(source.items).toHaveLength(1);
  const subjectReference = subject.items[0].reference,
    sourceReference = source.items[0].reference;
  const input = planInput();
  await planningClient.saveLiteraryPlan(
    { ...input, plan: { ...input.plan, references: [subjectReference] } },
    'author',
  );
  await planningClient.saveLiteraryPlan(
    {
      ...input,
      id: 'source-plan',
      operationId: 'save-source-plan-000001',
      plan: { ...input.plan, references: [sourceReference] },
    },
    'author',
  );
  await database.db.runTransaction((tx) =>
    tx.update(database.db.doc('books/book/chapters/chapter'), {
      content: '<p>Texto editado.</p>',
      updatedAt: 20,
    }),
  );
  const subjectView = await planningClient.getLiteraryPlan('book', input.id),
    sourceView = await planningClient.getLiteraryPlan('book', 'source-plan');
  expect(subjectView.sources[0]).toMatchObject({ available: true, changed: false });
  expect(sourceView.sources[0]).toMatchObject({ available: true, changed: true });
  await database.db.runTransaction((tx) => {
    tx.delete(database.db.doc('books/book/chapters/chapter'));
  });
  await database.db.runTransaction((tx) => {
    tx.create(database.db.doc('books/book/chapters/chapter'), {
      bookId: 'book',
      title: 'Outro capítulo',
      order: 1,
      content: '<p>Outro texto.</p>',
      updatedAt: 20,
    });
  });
  expect((await planningClient.getLiteraryPlan('book', input.id)).sources[0]).toMatchObject({
    available: false,
    currentReference: null,
  });
});
it('a definitive CAS failure retires only its own journal, preserves the server version and never emits a duplicate version', async () => {
  const input = planInput();
  await planningClient.saveLiteraryPlan(input, 'author');
  const before = structuredClone([...database.records]),
    versions = count('books/book/literaryPlanVersions/');
  await expect(
    planningClient.saveLiteraryPlan(
      { ...input, operationId: 'save-native-plan-stale01' },
      'author',
    ),
  ).rejects.toMatchObject({ code: 'functions/failed-precondition' });
  expect([...database.records]).toEqual(before);
  expect(count('books/book/literaryPlanVersions/')).toBe(versions);
  expect(listLiteraryPendingOperations('author', 'book')).toEqual([]);
  wire.uid = 'other';
  await expect(planningClient.getLiteraryPlan('book', input.id)).rejects.toMatchObject({
    code: 'functions/not-found',
  });
  expect([...database.records]).toEqual(before);
});

it('map client crosses the real sector boundary without body reads or journals and rejects a changed or foreign source', async () => {
  const before = structuredClone([...database.records]);
  const chapters = await mapClient.readLiteraryBookMapPage('book', 'chapters', null, null);
  expect(chapters.items).toHaveLength(1);
  expect(chapters.items[0].title).toBe('A carta');
  expect(chapters.items[0]).not.toHaveProperty('content');
  expect(chapters.coverage.manuscriptRead).toBe(false);
  const plans = await mapClient.readLiteraryBookMapPage('book', 'plans', chapters.fence, null);
  expect(plans.fence).toBe(chapters.fence);
  expect([...database.records]).toEqual(before);
  expect(listLiteraryPendingOperations('author', 'book')).toEqual([]);
  await database.db.runTransaction(async (tx) =>
    tx.update(database.db.doc('books/book'), { title: 'Nome alterado' }),
  );
  await expect(
    mapClient.readLiteraryBookMapPage('book', 'events', chapters.fence, null),
  ).rejects.toMatchObject({ code: 'functions/failed-precondition' });
  wire.uid = 'other';
  await expect(
    mapClient.readLiteraryBookMapPage('book', 'chapters', null, null),
  ).rejects.toMatchObject({ code: 'functions/not-found' });
  expect(database.records.get('users/author').credits).toBe(7);
});

it('global audit and preview clients use the registered sector and recover a lost registration without sending context to another account', async () => {
  const request = {
    target,
    jobId: 'native-global-audit-client-0001',
    level: 'book',
    actId: null,
    audit: 'architecture',
    instruction: 'A intenção deve ser confrontada com a carta.',
  };
  wire.loseNextAcknowledgement = true;
  await expect(integrationClient.startLiteraryIntegration(request, 'author')).rejects.toThrow(
    'Acknowledgement lost',
  );
  expect(listLiteraryPendingOperations('author', 'book')).toHaveLength(1);
  const registered = await integrationClient.startLiteraryIntegration(request, 'author');
  expect(registered.audit).toBe('architecture');
  expect(listLiteraryPendingOperations('author', 'book')).toEqual([]);
  let current = registered;
  for (let step = 0; step < 100 && !current.architecture.inventoryComplete; step++)
    current = await integrationClient.advanceLiteraryIntegration('book', request.jobId);
  const inventory = await integrationClient.listLiteraryArchitectureInventory(
    'book',
    request.jobId,
  );
  expect(inventory.items[0].label).toBe('A carta');
  const preview = await integrationClient.previewLiteraryArchitectureSource(
    'book',
    request.jobId,
    0,
  );
  expect(preview.state).toBe('ready');
  expect(preview.scope.manuscriptRead).toBe(false);
  expect(preview.source.text).not.toContain('Texto preservado');
  wire.uid = 'other';
  await expect(
    integrationClient.previewLiteraryArchitectureSource('book', request.jobId, 0),
  ).rejects.toMatchObject({ code: 'functions/not-found' });
  expect(database.records.get('users/author').credits).toBe(7);
});

it('structural reconciliation passes through actual sector handlers and recovers the same confirmation receipt without applying prose or debiting credits', async () => {
  const run = async (jobId) => {
    await integrationClient.startLiteraryIntegration(
      {
        target,
        jobId,
        level: 'book',
        actId: null,
        audit: 'architecture',
        instruction: 'Confronte estrutura e texto.',
      },
      'author',
    );
    for (let step = 0; step < 150; step++) {
      const result = await integrationClient.advanceLiteraryIntegration('book', jobId);
      if (result.state === 'done') return result;
    }
    throw new Error('Audit did not finish');
  };
  const original = await run('client-architecture-original-001');
  const source = { jobId: original.jobId, requestId: original.finalRequestId, index: 0 };
  const context = await findingClient.getLiteraryFindingContext('book', source, -1);
  expect(context.architectureAudit).toBe(true);
  const destination = context.options.find(
    (option) => option.target.kind === 'architecture',
  ).target;
  expect(JSON.parse(destination.id)).toEqual(['chapter', null, 'chapter']);
  const decisionInput = {
    target,
    ...source,
    findingIndex: 0,
    operationId: 'client-structure-plan-001',
    expectedRevision: 0,
    action: 'correct',
    rationale: 'A ordem deve acompanhar a carta.',
    targetResource: destination,
  };
  wire.loseNextAcknowledgement = true;
  await expect(findingClient.saveLiteraryFindingDecision(decisionInput, 'author')).rejects.toThrow(
    'Acknowledgement lost',
  );
  expect(listLiteraryPendingOperations('author', 'book')).toHaveLength(1);
  const saved = await findingClient.saveLiteraryFindingDecision(decisionInput, 'author');
  expect(listLiteraryPendingOperations('author', 'book')).toEqual([]);
  expect(
    (await findingClient.getLiteraryFindingDecision('book', saved.id)).baseline.proofKind,
  ).toBe('architecture');
  await database.db.runTransaction(async (tx) =>
    tx.update(database.db.doc('books/book/chapters/chapter'), {
      title: 'A entrega da carta',
      updatedAt: 20,
    }),
  );
  const successor = await run('client-architecture-successor-001');
  const input = {
    target,
    id: saved.id,
    operationId: 'client-structure-confirm-001',
    expectedRevision: 1,
    successorJobId: successor.jobId,
    note: 'A estrutura salva foi conferida.',
  };
  wire.loseNextAcknowledgement = true;
  await expect(findingClient.confirmLiteraryFindingCorrection(input, 'author')).rejects.toThrow(
    'Acknowledgement lost',
  );
  expect(listLiteraryPendingOperations('author', 'book')).toHaveLength(1);
  await findingClient.confirmLiteraryFindingCorrection(input, 'author');
  expect(listLiteraryPendingOperations('author', 'book')).toEqual([]);
  const confirmed = await findingClient.getLiteraryFindingDecision('book', saved.id);
  expect(confirmed).toMatchObject({
    revision: 2,
    confirmationCurrent: true,
    correction: { proofKind: 'architecture', versionId: null },
  });
  expect(database.records.get('books/book/chapters/chapter').content).toBe(
    '<p>Texto preservado.</p>',
  );
  expect(database.records.get('users/author').credits).toBe(7);
  expect(count('books/book/literaryFindingDecisionVersions/')).toBe(2);
});

it('cross-volume source selection uses the actual planning sector and preserves its source book through save, acknowledgement recovery and revocation', async () => {
  database.records.set('books/previous', {
    authorId: 'author',
    title: 'Volume anterior',
    createdAt: 1,
    updatedAt: 10,
    status: 'draft',
  });
  database.records.set('books/previous/chapters/chapter', {
    bookId: 'previous',
    title: 'A carta antiga',
    order: 1,
    content: '<p>Fonte do volume anterior.</p>',
    updatedAt: 10,
  });
  const books = await planningClient.listLiteraryVolumeBooks('book');
  expect(books.items).toContainEqual({ id: 'previous', title: 'Volume anterior' });
  expect(books.items.some((item) => item.id === 'book')).toBe(false);
  const sources = await planningClient.listLiteraryReferences(
    'book',
    'volumeUnit',
    null,
    'source',
    { bookId: 'previous', kind: 'chapter' },
  );
  const selected = sources.items[0].reference;
  expect(JSON.parse(selected.id)).toEqual(['previous', 'chapter', 'chapter']);
  expect(selected.scopeId).toBe('previous');
  const input = {
    target,
    id: 'series-bridge',
    operationId: 'client-volume-bridge-0001',
    expectedRevision: 0,
    plan: {
      kind: 'seriesBridge',
      title: 'Passagem dos volumes',
      status: 'working',
      fields: { inherited: 'Uma carta permaneceu sem resposta.' },
      references: [selected],
    },
  };
  wire.loseNextAcknowledgement = true;
  await expect(planningClient.saveLiteraryPlan(input, 'author')).rejects.toThrow(
    'Acknowledgement lost',
  );
  await planningClient.saveLiteraryPlan(input, 'author');
  expect(listLiteraryPendingOperations('author', 'book')).toEqual([]);
  const saved = await planningClient.getLiteraryPlan('book', 'series-bridge');
  expect(saved.plan.references).toEqual([selected]);
  expect(saved.sources[0].available).toBe(true);
  await database.db.runTransaction(async (tx) =>
    tx.update(database.db.doc('books/previous'), { authorId: 'other' }),
  );
  const revoked = await planningClient.getLiteraryPlan('book', 'series-bridge');
  expect(revoked.sources[0]).toMatchObject({
    available: false,
    label: null,
    currentReference: null,
  });
  await expect(
    planningClient.listLiteraryReferences('book', 'volumeUnit', null, 'source', {
      bookId: 'previous',
      kind: 'chapter',
    }),
  ).rejects.toMatchObject({ code: 'functions/not-found' });
  expect(database.records.get('books/book/chapters/chapter').content).toBe(
    '<p>Texto preservado.</p>',
  );
  expect(database.records.get('users/author').credits).toBe(7);
});

it('continuous authorization, lost pause acknowledgement and amended total limits use actual server handlers without repeating debit', async () => {
  const collaborationContract = emptyEditorialContract();
  collaborationContract.collaborationPolicy = { version: 1, mode: 'continuous' };
  await contractClient.saveLiteraryContract(
    {
      target,
      operationId: 'continuous-client-contract-0001',
      expectedRevision: 0,
      contract: collaborationContract,
    },
    'author',
  );
  const scenes = createScenesService({ db: database.db, now: () => 100 });
  const chapter = await scenes.createSceneGroup('author', {
    target,
    operationId: 'continuous-client-group-0001',
    title: 'Capítulo contínuo',
  });
  for (let index = 0; index < 2; index++)
    await scenes.createScene('author', {
      target,
      parentId: chapter.id,
      operationId: 'continuous-client-scene-000' + index,
      title: 'Cena ' + index,
      content: '',
      planning: { objective: 'A carta muda a confiança.' },
    });
  const reference = (
    await planningClient.listLiteraryReferences('book', 'chapter', null, 'subject')
  ).items.find((x) => x.reference.id === chapter.id).reference;
  const planIds = ['continuous-brief', 'continuous-scenes', 'continuous-world'];
  for (const [index, kind] of ['chapterBrief', 'scenePreparation', 'localWorldbuilding'].entries())
    await planningClient.saveLiteraryPlan(
      {
        target,
        id: planIds[index],
        operationId: 'continuous-client-plan-000' + index,
        expectedRevision: 0,
        plan: {
          kind,
          title: kind,
          status: 'working',
          fields: kind === 'chapterBrief' ? { function: 'A carta muda a confiança.' } : {},
          references: [reference],
        },
      },
      'author',
    );
  const context = await preparationClient.getLiteraryPreparationContext(
    'book',
    chapter.id,
    planIds,
  );
  await preparationClient.saveLiteraryPreparationGate(
    {
      target,
      chapterId: chapter.id,
      planIds,
      stateToken: context.snapshot.stateToken,
      operationId: 'continuous-client-gate-0001',
      expectedRevision: 0,
      gate: {
        notes: 'Preparação conferida.',
        authorAccepted: true,
        criteria: Object.keys(LITERARY_GATE_CRITERIA).map((id) => ({
          id,
          result: 'pass',
          rationale: 'Sustentado.',
          evidence: [{ documentId: 'plan:continuous-brief', quote: 'A carta muda a confiança.' }],
        })),
      },
    },
    'author',
  );
  const jobId = 'continuous-client-draft-0001';
  await draftClient.startLiteraryDraft(
    {
      target,
      jobId,
      chapterId: chapter.id,
      instruction: 'Viva a decisão.',
      execution: { version: 1, mode: 'continuous', maxApplications: 1, maxCredits: 1 },
    },
    'author',
  );
  let frame;
  for (let step = 0; step < 50; step++) {
    frame = await draftClient.advanceLiteraryDraft('book', jobId);
    if (frame.job.executionStop === 'budget') break;
  }
  expect(frame.job).toMatchObject({ drafted: 1, chargedCredits: 1, executionStop: 'budget' });
  expect(database.records.get('users/author').credits).toBe(6);
  const pause = {
    target,
    jobId,
    operationId: 'continuous-client-pause-0001',
    expectedRevision: 0,
    paused: true,
  };
  wire.loseNextAcknowledgement = true;
  await expect(draftClient.setLiteraryDraftExecution(pause, 'author')).rejects.toThrow(
    'Acknowledgement lost',
  );
  expect(listLiteraryPendingOperations('author', 'book')).toEqual([
    expect.objectContaining({ kind: 'draftExecution', id: jobId }),
  ]);
  expect(await contractClient.getLiteraryOperation('book', pause.operationId)).toMatchObject({
    state: 'confirmed',
    kind: 'draftExecution',
    revision: 1,
  });
  await draftClient.setLiteraryDraftExecution(pause, 'author');
  expect(listLiteraryPendingOperations('author', 'book')).toEqual([]);
  await draftClient.setLiteraryDraftExecution(
    {
      target,
      jobId,
      operationId: 'continuous-client-resume-0001',
      expectedRevision: 1,
      paused: false,
      execution: { version: 1, mode: 'continuous', maxApplications: 2, maxCredits: 2 },
    },
    'author',
  );
  for (let step = 0; step < 100; step++) {
    frame = await draftClient.advanceLiteraryDraft('book', jobId);
    if (frame.job.state === 'done') break;
  }
  expect(frame.job).toMatchObject({ state: 'done', drafted: 2, chargedCredits: 2 });
  expect(database.records.get('users/author').credits).toBe(5);
  expect(database.records.get('books/book/chapters/chapter').content).toBe(
    '<p>Texto preservado.</p>',
  );
  expect(count('books/book/literaryDraftReceipts/')).toBe(2);
});

it('the author-selected guidance mode survives lost acknowledgement and controls actual prose handlers without preventing manual writing', async () => {
  const scenes = createScenesService({ db: database.db, now: () => 100 });
  const chapter = await scenes.createSceneGroup('author', {
    target,
    operationId: 'guidance-client-group-0001',
    title: 'Capítulo em orientação',
  });
  const native = await scenes.createScene('author', {
    target,
    parentId: chapter.id,
    operationId: 'guidance-client-scene-0001',
    title: 'Cena autoral',
    content: '<p>Ela recebeu a carta.</p>',
  });
  const contract = emptyEditorialContract();
  contract.collaborationPolicy = { version: 1, mode: 'guidance' };
  const saved = {
    target,
    operationId: 'guidance-client-contract-0001',
    expectedRevision: 0,
    contract,
  };
  wire.loseNextAcknowledgement = true;
  await expect(contractClient.saveLiteraryContract(saved, 'author')).rejects.toThrow();
  expect(await contractClient.getLiteraryOperation('book', saved.operationId)).toMatchObject({
    state: 'confirmed',
    kind: 'contract',
    revision: 1,
  });
  expect(
    (await contractClient.saveLiteraryContract(saved, 'author')).contract.collaborationPolicy,
  ).toEqual({ version: 1, mode: 'guidance' });
  expect(count('books/book/literaryContractVersions/')).toBe(1);
  const source = await proseClient.getLiteraryProseSourceInfo('book', chapter.id, native.scene.id);
  expect(source.collaboration).toMatchObject({ revision: 1, mode: 'guidance', configured: true });
  const proposal = await proseClient.startLiteraryProse(
    {
      target,
      chapterId: chapter.id,
      sceneId: native.scene.id,
      requestId: 'guidance-client-prose-0001',
      mode: 'reviseScene',
      segment: 0,
      instruction: 'Sugira sem alterar o texto.',
      expectedSourceToken: source.sourceToken,
    },
    'author',
  );
  expect(proposal.state).toBe('done');
  expect(proposal.applicable).toBe(false);
  await expect(
    proseClient.applyLiteraryProse(
      {
        target,
        requestId: proposal.requestId,
        operationId: 'guidance-client-apply-0001',
        expectedRevision: native.scene.revision,
      },
      'author',
    ),
  ).rejects.toThrow();
  expect(database.records.get('users/author').credits).toBe(7);
  expect(
    database.records.get('books/book/scenes/' + native.scene.id + '/body/current').content,
  ).toBe('<p>Ela recebeu a carta.</p>');
  await scenes.updateScene('author', {
    target,
    sceneId: native.scene.id,
    operationId: 'guidance-client-manual-0001',
    expectedRevision: native.scene.revision,
    patch: { content: '<p>A autora escreveu a consequência.</p>' },
  });
  expect(
    database.records.get('books/book/scenes/' + native.scene.id + '/body/current').content,
  ).toBe('<p>A autora escreveu a consequência.</p>');
});

it('the actual chapter-cycle client crosses phase boundaries and recovers a lost post-application acknowledgement without duplicate generation or credits', async () => {
  const contract = emptyEditorialContract();
  contract.collaborationPolicy = { version: 1, mode: 'continuous' };
  await contractClient.saveLiteraryContract(
    { target, operationId: 'cycle-client-contract-0001', expectedRevision: 0, contract },
    'author',
  );
  const scenes = createScenesService({ db: database.db, now: () => 100 });
  const chapter = await scenes.createSceneGroup('author', {
    target,
    operationId: 'cycle-client-chapter-0001',
    title: 'Capítulo do ciclo',
  });
  for (let i = 0; i < 2; i++)
    await scenes.createScene('author', {
      target,
      parentId: chapter.id,
      operationId: 'cycle-client-scene-000' + i,
      title: 'Cena ' + i,
      content: '',
    });
  const nextChapter = await scenes.createSceneGroup('author', {
    target,
    operationId: 'cycle-client-next-chapter-0001',
    title: 'A resposta',
  });
  await scenes.createScene('author', {
    target,
    parentId: nextChapter.id,
    operationId: 'cycle-client-next-scene-0001',
    title: 'A resposta muda o caminho',
    content: '',
  });
  const references = await planningClient.listLiteraryReferences(
      'book',
      'chapter',
      null,
      'subject',
    ),
    reference = references.items.find((item) => item.reference.id === chapter.id).reference;
  const planIds = ['cycle-brief', 'cycle-scenes', 'cycle-world'];
  for (const [i, kind] of ['chapterBrief', 'scenePreparation', 'localWorldbuilding'].entries())
    await planningClient.saveLiteraryPlan(
      {
        target,
        id: planIds[i],
        operationId: 'cycle-client-plan-000' + i,
        expectedRevision: 0,
        plan: {
          kind,
          title: kind,
          status: 'working',
          fields: kind === 'chapterBrief' ? { function: 'A carta muda a confiança.' } : {},
          references: [reference],
        },
      },
      'author',
    );
  const nextReference = references.items.find(
    (item) => item.reference.id === nextChapter.id,
  ).reference;
  const nextPlanIds = ['next-cycle-brief', 'next-cycle-scenes', 'next-cycle-world'];
  for (const [i, kind] of ['chapterBrief', 'scenePreparation', 'localWorldbuilding'].entries())
    await planningClient.saveLiteraryPlan(
      {
        target,
        id: nextPlanIds[i],
        operationId: 'cycle-client-next-plan-000' + i,
        expectedRevision: 0,
        plan: {
          kind,
          title: kind,
          status: 'working',
          fields: kind === 'chapterBrief' ? { function: 'A resposta muda a confiança.' } : {},
          references: [nextReference],
        },
      },
      'author',
    );
  const nextPreparation = await preparationClient.getLiteraryPreparationContext(
    'book',
    nextChapter.id,
    nextPlanIds,
  );
  await preparationClient.saveLiteraryPreparationGate(
    {
      target,
      chapterId: nextChapter.id,
      planIds: nextPlanIds,
      operationId: 'cycle-client-next-gate-0001',
      expectedRevision: 0,
      stateToken: nextPreparation.snapshot.stateToken,
      gate: {
        notes: 'Preparação da passagem aceita.',
        authorAccepted: true,
        criteria: Object.keys(LITERARY_GATE_CRITERIA).map((id) => ({
          id,
          result: 'pass',
          rationale: 'A passagem mantém a consequência.',
          evidence: [
            { documentId: 'plan:next-cycle-brief', quote: 'A resposta muda a confiança.' },
          ],
        })),
      },
    },
    'author',
  );
  const context = await preparationClient.getLiteraryPreparationContext(
    'book',
    chapter.id,
    planIds,
  );
  await preparationClient.saveLiteraryPreparationGate(
    {
      target,
      chapterId: chapter.id,
      planIds,
      operationId: 'cycle-client-gate-0001',
      expectedRevision: 0,
      stateToken: context.snapshot.stateToken,
      gate: {
        notes: 'Preparação aceita.',
        authorAccepted: true,
        criteria: Object.keys(LITERARY_GATE_CRITERIA).map((id) => ({
          id,
          result: 'pass',
          rationale: 'Intenção sustentada.',
          evidence: [{ documentId: 'plan:cycle-brief', quote: 'A carta muda a confiança.' }],
        })),
      },
    },
    'author',
  );
  const source = await workflowClient.getLiteraryWorkflowScope('book', chapter.id);
  const start = {
    expectedScopeToken: source.originToken,
    target,
    jobId: 'cycle-client-workflow-0001',
    chapterId: chapter.id,
    instruction: 'PRIVATE_CYCLE_GUIDANCE',
    limits: { maxApplications: 2, maxCredits: 2, maxSteps: 100 },
    authorizedPhases: ['firstVersion', 'review', 'revisedVersion'],
  };
  let frame = await workflowClient.startLiteraryWorkflow(start, 'author'),
    n = 0,
    lost = false;
  for (let i = 0; i < 120 && frame.job.phase !== 'done'; i++) {
    const step = {
      target,
      jobId: start.jobId,
      operationId: 'cycle-client-step-' + String(++n).padStart(4, '0'),
      expectedRevision: frame.job.revision,
      expectedOriginToken: frame.job.originToken,
    };
    if (!lost && frame.draft?.job.state === 'writing' && frame.draft.job.drafted === 0) {
      wire.loseNextAcknowledgement = true;
      await expect(workflowClient.advanceLiteraryWorkflow(step, 'author')).rejects.toThrow();
      expect(database.records.get('users/author').credits).toBe(6);
      expect(JSON.stringify(localStorage)).not.toContain('PRIVATE_CYCLE_GUIDANCE');
      expect(await contractClient.getLiteraryOperation('book', step.operationId)).toMatchObject({
        state: 'confirmed',
        kind: 'workflow',
        id: start.jobId,
        revision: step.expectedRevision + 1,
      });
      frame = await workflowClient.advanceLiteraryWorkflow(step, 'author');
      expect(database.records.get('users/author').credits).toBe(6);
      lost = true;
    } else frame = await workflowClient.advanceLiteraryWorkflow(step, 'author');
    expect(['attention', 'reconciliation', 'corrections'].includes(frame.job.stop)).toBe(false);
  }
  expect(lost).toBe(true);
  expect(frame.job.phase).toBe('done');
  expect(frame.review.analyses).toBe(4);
  expect(frame.review.preservationCurrent).toBe(true);
  expect(frame.review.revisedMilestoneId).not.toBe(frame.job.firstVersionId);
  expect(database.records.get('users/author').credits).toBe(5);
  expect(database.records.get('books/book/chapters/chapter').content).toBe(
    '<p>Texto preservado.</p>',
  );
  const candidates = await workflowClient.listLiteraryWorkflows('book', null);
  expect(candidates.items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        jobId: start.jobId,
        chapterTitle: 'Capítulo do ciclo',
        phase: 'done',
      }),
    ]),
  );
  const passage = { previousWorkflowId: start.jobId, actIntegrationId: null };
  const nextScope = await workflowClient.getLiteraryWorkflowScope('book', nextChapter.id, passage);
  const nextStart = {
    ...start,
    passage,
    jobId: 'cycle-client-next-workflow-0001',
    chapterId: nextChapter.id,
    expectedScopeToken: nextScope.originToken,
    limits: { maxApplications: 1, maxCredits: 1, maxSteps: 100 },
  };
  wire.loseNextAcknowledgement = true;
  await expect(workflowClient.startLiteraryWorkflow(nextStart, 'author')).rejects.toThrow();
  expect(JSON.stringify(localStorage)).not.toContain(passage.previousWorkflowId);
  expect(database.records.get('users/author').credits).toBe(5);
  expect(await contractClient.getLiteraryOperation('book', nextStart.jobId)).toMatchObject({
    state: 'confirmed',
    kind: 'workflow',
    id: nextStart.jobId,
  });
  let nextFrame = await workflowClient.startLiteraryWorkflow(nextStart, 'author');
  expect(nextFrame.job.passage.input).toEqual(passage);
  expect(nextFrame.job.passage.previous.title).toBe('Capítulo do ciclo');
  for (let i = 0; i < 100 && nextFrame.job.phase !== 'done'; i++) {
    nextFrame = await workflowClient.advanceLiteraryWorkflow(
      {
        target,
        jobId: nextStart.jobId,
        operationId: 'cycle-client-next-step-' + String(i).padStart(4, '0'),
        expectedRevision: nextFrame.job.revision,
        expectedOriginToken: nextFrame.job.originToken,
      },
      'author',
    );
    expect(nextFrame.job.phase).not.toBe('stale');
  }
  expect(nextFrame.job.phase).toBe('done');
  expect(nextFrame.job.passageEntered).toBe(true);
  expect(database.records.get('users/author').credits).toBe(4);
});
