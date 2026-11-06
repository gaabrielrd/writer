import { digest } from '../src/workProgressContracts.mjs';
import { createLiteraryFindingService } from '../src/literaryFindings.mjs';
import {
  literaryArchitectureTargetId,
  readLiteraryArchitectureTargetId,
} from '../src/literaryArchitectureProtocol.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { studioDb } from './helpers/studioDb.mjs';
import { createLiteraryIntegrationService } from '../src/literaryIntegration.mjs';
import { createLiteraryIntegrationRecheckService } from '../src/literaryIntegrationRecheck.mjs';
import { createLiteraryPlanningService } from '../src/literaryPlanning.mjs';
import { emptyEditorialContract } from '../src/literaryContracts.mjs';
import { literaryFindingTargetLink } from '../src/literaryFindingTargets.mjs';
import { sequenceKey } from '../src/narrativeContracts.mjs';
const target = { kind: 'book', id: 'book' },
  jobId = 'global-architecture-job-0001',
  command = { target, jobId };
function fixture({ prose = true, plans = 11, override } = {}) {
  const f = studioDb(),
    calls = [];
  let clock = 10000;
  f.records.set('books/book', {
    authorId: 'author',
    title: 'A carta',
    createdAt: 1,
    updatedAt: 100,
    hasLiteraryResources: true,
    status: 'draft',
    wordCount: 5,
  });
  f.records.set('users/author', { credits: 7 });
  const contract = emptyEditorialContract();
  contract.fields.promise = 'A confiança tem um custo.';
  f.records.set('books/book/literaryProduction/current', { revision: 1, updatedAt: 100, contract });
  f.records.set('books/book/acts/act', { name: 'O porto', order: 1, updatedAt: 100 });
  if (prose)
    f.records.set('books/book/chapters/chapter', {
      bookId: 'book',
      title: 'A carta chega',
      order: 1,
      actId: 'act',
      content: '<p>Ana recebeu a carta. Ela não confiou na assinatura.</p>',
      updatedAt: 100,
    });
  for (let index = 0; index < plans; index++)
    f.records.set('books/book/literaryPlans/plan-' + String(index).padStart(3, '0'), {
      schemaVersion: 1,
      id: 'plan-' + index,
      revision: 1,
      createdAt: 100,
      updatedAt: 100,
      plan: {
        kind: 'chapterBrief',
        title: 'Intenção ' + index,
        status: index === 0 ? 'approved' : 'proposal',
        fields:
          index === plans - 1
            ? {
                function: 'A confiança muda. '.repeat(300),
                decision: 'A decisão custa. '.repeat(300),
                consequence: 'O porto reage. '.repeat(300),
                initialKnowledge: 'Ana ainda espera. '.repeat(300),
                finalKnowledge: 'Ana recebeu uma carta. '.repeat(200),
              }
            : { function: 'A unidade transforma a confiança ' + index },
        references: [],
      },
    });
  f.records.set('books/book/scenes/unassigned', {
    ownerId: 'author',
    title: 'Cena sem capítulo',
    parentId: null,
    archived: false,
    stage: 'planned',
    planning: {
      objective: 'Encontrar a irmã',
      conflict: 'A carta pode mentir',
      pointOfView: 'Ana',
    },
    content: 'UNASSIGNED PROSE MUST NOT BECOME MANUSCRIPT COVERAGE',
    rankA: 'B',
    rankB: 'z',
    updatedAt: 100,
  });
  f.records.set('books/book/arcs/arc', {
    ownerId: 'author',
    title: 'Confiança',
    initialState: 'Dúvida',
    objective: 'Decidir',
    plannedOutcome: 'Custo assumido',
    rankA: 'B',
    rankB: 'z',
    revision: 1,
    updatedAt: 100,
  });
  for (let i = 0; i < 2; i++)
    f.records.set('books/book/arcs/arc/milestones/milestone-' + i, {
      ownerId: 'author',
      title: 'Marco ' + i,
      notes: 'Uma intenção do arco',
      rankA: i ? 'c' : 'B',
      rankB: 'z',
      revision: 1,
      updatedAt: 100,
    });
  f.records.set('books/book/timelineEvents/event', {
    ownerId: 'author',
    title: 'A entrega',
    description: 'A carta é entregue antes da partida',
    dateLabel: 'Três dias antes',
    rankA: 'B',
    rankB: 'z',
    revision: 1,
    updatedAt: 100,
  });
  for (const resource of [{ kind: 'event' }, { kind: 'milestone', arcId: 'arc' }])
    f.records.set('books/book/narrativeControls/' + sequenceKey(resource), {
      resource,
      rankSlot: 'A',
      structureRevision: 1,
      rebalancing: false,
    });
  f.records.set('books/book/sceneLoreLinks/link', {
    sceneId: 'unassigned',
    reference: { kind: 'book', scopeId: 'book', entityId: 'ana' },
  });
  f.records.set('books/book/narrativeLinks/link', {
    source: { kind: 'arc', id: 'arc' },
    reference: { kind: 'scene', sceneId: 'unassigned' },
  });
  const output = (input) =>
    input.scope.phase === 'synthesis'
      ? {
          complete: true,
          report: 'Confronto das evidências e intenções.',
          findings: [],
          conclusions: [
            {
              axis: 'causality',
              observation: 'As intenções exigem conferência contra a prosa.',
              evidenceIds: input.documents.map((doc) => doc.id),
            },
          ],
        }
      : {
          complete: true,
          report: 'Fonte lida como intenção ou evidência no escopo declarado.',
          findings: [],
          matrix: [
            {
              axis: 'knowledge',
              subject: 'Ana',
              observation:
                'A ficha descreve uma intenção; somente a prosa lida comprova o acontecimento.',
              certainty: 'interpretation',
              evidence: [
                { sourceId: input.documents[0].id, quote: input.documents[0].text.slice(0, 40) },
              ],
            },
          ],
        };
  const generator = async (input) => {
    calls.push(structuredClone(input));
    return override ? override(input, output) : output(input);
  };
  const api = createLiteraryIntegrationService({ db: f.db, generator, now: () => clock });
  return {
    ...f,
    api,
    calls,
    advanceHour: () => {
      clock += 3600000;
    },
    output,
    recheck: createLiteraryIntegrationRecheckService({ db: f.db, now: () => clock }),
  };
}
const start = (extra = {}) => ({
  ...command,
  level: 'book',
  actId: null,
  audit: 'architecture',
  instruction: 'Confira a arquitetura inteira e suas divergências.',
  ...extra,
});
async function complete(f, active = command) {
  for (let step = 0; step < 1000; step++) {
    const state = await f.api.advanceLiteraryIntegration('author', active);
    if (state.state === 'done') return state;
    assert.ok(!['attention', 'stale', 'canceled'].includes(state.state), JSON.stringify(state));
  }
  throw new Error('Global audit did not complete');
}
async function toPhase(f, phase) {
  for (let step = 0; step < 1000; step++) {
    const current = f.records.get('books/book/literaryIntegrationJobs/' + jobId);
    if (current.phase === phase) return current;
    await f.api.advanceLiteraryIntegration('author', command);
  }
  throw new Error('Phase not reached: ' + phase);
}
test('global architecture reads more than eight plans, all active structural families and every manuscript unit before proving its separate coverage', async () => {
  const f = fixture(),
    original = structuredClone(f.records.get('books/book/chapters/chapter'));
  await f.api.startLiteraryIntegration('author', start());
  const result = await complete(f);
  assert.equal(result.architecture.sources, 23);
  assert.equal(result.architecture.readSources, 23);
  assert.equal(result.architecture.verifiedSources, 23);
  assert.equal(result.architecture.complete, true);
  assert.equal(result.architecture.inventoryComplete, true);
  assert.ok(
    result.architecture.segments > result.architecture.sources,
    'large intentions are segmented, not shortened',
  );
  assert.equal(result.architecture.referenceBodiesRead, false);
  assert.equal(result.coverage.wholeBook, true);
  assert.equal(result.units, 1);
  assert.equal(result.readUnits, 1);
  assert.equal(result.authorAccepted, false);
  const observed = new Set(
    f.calls
      .filter((call) => call.scope.phase === 'architecture')
      .map((call) => call.documents[0].id),
  );
  assert.equal([...observed].filter((id) => id.startsWith('architecture:plan:')).length, 11);
  assert.ok([...observed].some((id) => id.startsWith('architecture:arcMilestone:')));
  assert.ok([...observed].some((id) => id.startsWith('architecture:sceneLink:')));
  assert.equal(
    f.calls.some((call) => JSON.stringify(call.documents).includes('UNASSIGNED PROSE MUST NOT')),
    false,
  );
  assert.deepEqual(f.records.get('books/book/chapters/chapter'), original);
  assert.equal(f.records.get('users/author').credits, 7);
  const targetPlan = { kind: 'plan', id: 'plan-010', scopeId: 'book' };
  assert.equal(
    f.records.get(
      'books/book/literaryIntegrationSourceLinks/' + literaryFindingTargetLink(jobId, targetPlan),
    ).revision,
    1,
  );
  assert.equal((await f.api.getLiteraryIntegrationSetup('author', command)).audit, 'architecture');
});
test('prewriting audit completes architecture without claiming that an absent manuscript was read', async () => {
  const f = fixture({ prose: false, plans: 2 });
  await f.api.startLiteraryIntegration('author', start());
  const result = await complete(f);
  assert.equal(result.architecture.complete, true);
  assert.equal(result.units, 0);
  assert.equal(result.coverage.wholeBook, false);
  assert.equal(
    f.calls.some((call) => call.scope.phase === 'reading'),
    false,
  );
  await assert.rejects(
    f.api.startLiteraryIntegration(
      'author',
      start({ jobId: 'invalid-subset-global-0001', planIds: [] }),
    ),
    { code: 'invalid-argument' },
  );
  await assert.rejects(
    f.api.startLiteraryIntegration(
      'author',
      start({ jobId: 'invalid-act-global-0001', level: 'act', actId: 'act' }),
    ),
    { code: 'invalid-argument' },
  );
});
test('unavailable plan references stop before the provider sees the dependent plan body', async () => {
  const f = fixture({ plans: 1 });
  const planning = createLiteraryPlanningService({ db: f.db, now: () => 200 });
  const options = await planning.listLiteraryReferences('author', {
    target,
    kind: 'chapter',
    purpose: 'subject',
  });
  f.records.get('books/book/literaryPlans/plan-000').plan.references = [options.items[0].reference];
  await f.db.runTransaction(async (tx) => tx.delete(f.db.doc('books/book/chapters/chapter')));
  await f.db.runTransaction(async (tx) =>
    tx.create(f.db.doc('books/book/chapters/chapter'), {
      bookId: 'book',
      title: 'New identity',
      order: 1,
      content: '<p>Other text.</p>',
      updatedAt: 100,
    }),
  );
  await f.api.startLiteraryIntegration('author', start());
  for (let step = 0; step < 100; step++) {
    const state = await f.api.advanceLiteraryIntegration('author', command);
    if (state.state === 'attention') {
      assert.match(state.message, /Reconcilie/);
      break;
    }
  }
  assert.equal(f.records.get('books/book/literaryIntegrationJobs/' + jobId).state, 'attention');
  assert.equal(
    f.calls.some((call) => call.documents[0].id === 'architecture:plan:plan-000'),
    false,
  );
});
test('native identity changes during architecture generation cannot commit a late result', async () => {
  let reached, release;
  const held = new Promise((resolve) => {
    reached = resolve;
  });
  const f = fixture({
    plans: 1,
    override: async (input, output) => {
      if (input.scope.phase === 'architecture') {
        reached();
        await new Promise((resolve) => {
          release = resolve;
        });
      }
      return output(input);
    },
  });
  await f.api.startLiteraryIntegration('author', start());
  await toPhase(f, 'architectureReading');
  const pending = f.api.advanceLiteraryIntegration('author', command);
  await held;
  const path = 'books/book/literaryProduction/current',
    before = structuredClone(f.records.get(path));
  await f.db.runTransaction(async (tx) => tx.delete(f.db.doc(path)));
  await f.db.runTransaction(async (tx) => tx.create(f.db.doc(path), before));
  release();
  await assert.rejects(pending, { code: 'failed-precondition' });
  assert.equal(
    [...f.records.keys()].some((path) => path.startsWith('books/book/literaryIntegrationResults/')),
    false,
  );
  assert.equal(f.records.get('users/author').credits, 7);
});
test('unverified global synthesis is not exposed before the terminal source checks', async () => {
  const f = fixture({ plans: 1 });
  await f.api.startLiteraryIntegration('author', start());
  await toPhase(f, 'verifyArchitecture');
  const job = f.records.get('books/book/literaryIntegrationJobs/' + jobId);
  assert.deepEqual(
    await f.api.getLiteraryIntegrationResult('author', {
      ...command,
      requestId: job.finalRequestId,
    }),
    { requestId: job.finalRequestId, state: 'running' },
  );
  await complete(f);
  assert.equal(
    (
      await f.api.getLiteraryIntegrationResult('author', {
        ...command,
        requestId: job.finalRequestId,
      })
    ).state,
    'done',
  );
});
test('reconfirmation traverses the full architecture and detects added intentions without laundering the old analysis', async () => {
  const f = fixture({ plans: 2 });
  await f.api.startLiteraryIntegration('author', start());
  const original = await complete(f);
  const planning = createLiteraryPlanningService({ db: f.db, now: () => 500 });
  await planning.saveLiteraryPlan('author', {
    target,
    id: 'added-plan',
    operationId: 'add-plan-after-audit-0001',
    expectedRevision: 0,
    plan: {
      kind: 'bookOverview',
      title: 'Nova promessa',
      status: 'proposal',
      fields: { question: 'Outra intenção' },
      references: [],
    },
  });
  const operationId = 'architecture-recheck-operation-0001';
  await f.recheck.startLiteraryIntegrationRecheck('author', {
    ...command,
    operationId,
    expectedSourceToken: original.sourceToken,
  });
  let result;
  for (let step = 0; step < 1000; step++) {
    result = await f.recheck.advanceLiteraryIntegrationRecheck('author', { target, operationId });
    if (result.state !== 'scanning') break;
  }
  assert.equal(result.state, 'changed');
  assert.equal(result.impact.kind, 'architecture');
  assert.equal(f.records.get('books/book/literaryIntegrationJobs/' + jobId).authorAccepted, false);
});
test('a metadata-only publication change can be rechecked without new generation while architecture coverage stays independently verified', async () => {
  const f = fixture({ plans: 2 });
  await f.api.startLiteraryIntegration('author', start());
  const original = await complete(f),
    calls = f.calls.length;
  f.records.get('books/book').updatedAt = 101;
  f.records.get('books/book').publicRevisionId = 'new-public-edition';
  const operationId = 'architecture-recheck-operation-0002';
  await f.recheck.startLiteraryIntegrationRecheck('author', {
    ...command,
    operationId,
    expectedSourceToken: original.sourceToken,
  });
  let result;
  for (let step = 0; step < 1000; step++) {
    result = await f.recheck.advanceLiteraryIntegrationRecheck('author', { target, operationId });
    if (result.state !== 'scanning') break;
  }
  assert.equal(result.state, 'done');
  assert.ok(result.architectureCompared > 8);
  assert.equal(f.calls.length, calls);
  assert.equal((await f.api.getLiteraryIntegration('author', command)).architecture.complete, true);
});

test('inventory previews are paginated, authorized and exact without provider calls or authorial mutations', async () => {
  const f = fixture();
  await f.api.startLiteraryIntegration('author', start());
  await toPhase(f, 'architectureReading');
  const before = structuredClone([...f.records]),
    items = [];
  let afterIndex = null;
  do {
    const page = await f.api.listLiteraryArchitectureInventory('author', {
      ...command,
      afterIndex,
    });
    assert.equal(page.inventoryComplete, true);
    items.push(...page.items);
    afterIndex = page.nextAfterIndex;
  } while (afterIndex !== null);
  assert.equal(items.length, 23);
  assert.ok(items.every((item) => item.available));
  assert.equal(
    items.some((item) => item.label === 'Intenção 10'),
    true,
  );
  const item = items.find((item) => item.source.kind === 'plan' && item.source.id === 'plan-010');
  const preview = await f.api.previewLiteraryArchitectureSource('author', {
    ...command,
    index: item.index,
    segment: 0,
  });
  assert.equal(preview.state, 'ready');
  assert.ok(preview.segmentCount > 1);
  assert.equal(preview.scope.manuscriptRead, false);
  assert.match(preview.editorial.instruction, /A confiança tem um custo/);
  assert.equal(f.calls.length, 0);
  assert.deepEqual([...f.records], before);
  await assert.rejects(
    f.api.previewLiteraryArchitectureSource('other', { ...command, index: item.index }),
    { code: 'not-found' },
  );
  await assert.rejects(
    f.api.previewLiteraryArchitectureSource('author', { ...command, index: 999 }),
    { code: 'not-found' },
  );
  await assert.rejects(
    f.api.previewLiteraryArchitectureSource('author', {
      ...command,
      index: item.index,
      segment: 999,
    }),
    { code: 'invalid-argument' },
  );
  await complete(f);
  const request = f.calls.find(
    (call) => call.scope.phase === 'architecture' && call.documents[0].id === preview.source.id,
  );
  assert.equal(request.documents[0].text, preview.source.text);
  assert.equal(request.documents[0].offsetBase, preview.source.offsetBase);
});

test('cancellation fences a held architecture provider and keeps its own checkpoint terminal', async () => {
  let reached, release;
  const held = new Promise((resolve) => {
    reached = resolve;
  });
  const f = fixture({
    plans: 1,
    override: async (input, output) => {
      if (input.scope.phase === 'architecture') {
        reached();
        await new Promise((resolve) => {
          release = resolve;
        });
      }
      return output(input);
    },
  });
  await f.api.startLiteraryIntegration('author', start());
  await toPhase(f, 'architectureReading');
  const pending = f.api.advanceLiteraryIntegration('author', command);
  await held;
  assert.equal((await f.api.cancelLiteraryIntegration('author', command)).state, 'canceled');
  release();
  assert.equal((await pending).state, 'canceled');
  assert.equal(
    [...f.records.keys()].some((path) => path.startsWith('books/book/literaryIntegrationResults/')),
    false,
  );
});

test('a recreated arc cannot lend its old milestone to source preview or preserve a fresh label under the old census', async () => {
  const f = fixture({ plans: 1 });
  await f.api.startLiteraryIntegration('author', start());
  await toPhase(f, 'architectureReading');
  const items = [];
  let afterIndex = null;
  do {
    const page = await f.api.listLiteraryArchitectureInventory('author', {
      ...command,
      afterIndex,
    });
    items.push(...page.items);
    afterIndex = page.nextAfterIndex;
  } while (afterIndex !== null);
  const item = items.find((item) => item.source.kind === 'arcMilestone');
  assert.equal(
    (await f.api.previewLiteraryArchitectureSource('author', { ...command, index: item.index }))
      .state,
    'ready',
  );
  const arc = structuredClone(f.records.get('books/book/arcs/arc'));
  await f.db.runTransaction(async (tx) => tx.delete(f.db.doc('books/book/arcs/arc')));
  await f.db.runTransaction(async (tx) => tx.create(f.db.doc('books/book/arcs/arc'), arc));
  await assert.rejects(
    f.api.previewLiteraryArchitectureSource('author', { ...command, index: item.index }),
    { code: 'failed-precondition' },
  );
  const pages = [];
  afterIndex = null;
  do {
    const page = await f.api.listLiteraryArchitectureInventory('author', {
      ...command,
      afterIndex,
    });
    pages.push(...page.items);
    afterIndex = page.nextAfterIndex;
  } while (afterIndex !== null);
  assert.equal(pages.find((row) => row.index === item.index).available, false);
  assert.equal(pages.find((row) => row.index === item.index).label, null);
});

async function reconciledFixture(prepare) {
  const f = fixture({
    plans: 21,
    override(input, output) {
      const result = output(input);
      result.findings =
        input.scope.phase === 'synthesis'
          ? [
              {
                severity: 'warning',
                problem: 'Confronte a intenção com o texto.',
                action: 'Conferir e registrar.',
                evidenceIds: [input.documents[0].id],
              },
            ]
          : [
              {
                severity: 'warning',
                problem: 'Confronte a intenção com o texto.',
                action: 'Conferir e registrar.',
                evidence: [
                  { sourceId: input.documents[0].id, quote: input.documents[0].text.slice(0, 30) },
                ],
              },
            ];
      return result;
    },
  });
  if (prepare) prepare(f);
  f.findings = createLiteraryFindingService({ db: f.db, now: () => 30000 });
  await f.api.startLiteraryIntegration('author', start());
  f.finished = await complete(f);
  f.origin = { target, jobId, requestId: f.finished.finalRequestId, findingIndex: 0 };
  return f;
}
const structuralTarget = (kind, id, arcId = null) => ({
  kind: 'architecture',
  id: literaryArchitectureTargetId({ kind, id, arcId }),
  scopeId: 'book',
});
const saveStructural = (f, correctionTarget) =>
  f.findings.saveLiteraryFindingDecision('author', {
    ...f.origin,
    operationId: 'architecture-correction-plan-0001',
    expectedRevision: 0,
    action: 'correct',
    rationale: 'Conciliar a estrutura com o manuscrito.',
    correctionTarget,
  });
const confirmStructural = (f, id, successorJobId) =>
  f.findings.confirmLiteraryFindingCorrection('author', {
    target,
    id,
    successorJobId,
    expectedRevision: 1,
    operationId: 'architecture-correction-confirm-0001',
    note: 'Alteração estrutural salva e reconferida.',
  });
test('final synthesis offers all read structural targets through bounded pages, distinguishing composed chapter metadata and same-named milestones', async () => {
  const f = await reconciledFixture((f) => {
    f.records.set('books/book/arcs/other', {
      ...f.records.get('books/book/arcs/arc'),
      title: 'Outro arco',
    });
    f.records.set('books/book/arcs/other/milestones/milestone-0', {
      ...f.records.get('books/book/arcs/arc/milestones/milestone-0'),
    });
    f.records.set('books/book/chapters/chapter', {
      ...f.records.get('books/book/chapters/chapter'),
      contentMode: 'scenes',
    });
    const content = '<p>Ana recebeu a carta.</p>';
    f.records.set('books/book/scenes/unassigned', {
      ...f.records.get('books/book/scenes/unassigned'),
      parentId: 'chapter',
      bodyHash: digest(content),
      revision: 1,
    });
    f.records.set('books/book/scenes/unassigned/body/current', { content, hash: digest(content) });
  });
  const all = new Map();
  let after = -1,
    pages = 0;
  do {
    const page = await f.findings.getLiteraryFindingContext('author', {
      ...f.origin,
      afterArchitectureIndex: after,
    });
    assert.equal(page.architectureAudit, true);
    page.options.forEach((option) => all.set(JSON.stringify(option.target), option));
    after = page.nextAfterArchitectureIndex;
    pages++;
  } while (after !== null && pages < 30);
  assert.ok(pages > 3);
  assert.equal(after, null);
  const structural = [...all.values()].filter((x) => x.target.kind === 'architecture');
  const kinds = new Set(structural.map((x) => readLiteraryArchitectureTargetId(x.target.id).kind));
  assert.deepEqual(
    [...kinds].sort(),
    [
      'act',
      'chapter',
      'scene',
      'arc',
      'event',
      'arcMilestone',
      'sceneLink',
      'narrativeLink',
      'narrativeControl',
    ].sort(),
  );
  const homonyms = structural.filter(
    (x) => readLiteraryArchitectureTargetId(x.target.id).id === 'milestone-0',
  );
  assert.equal(homonyms.length, 2);
  assert.notEqual(homonyms[0].target.id, homonyms[1].target.id);
  const chapter = structural.find(
    (x) => readLiteraryArchitectureTargetId(x.target.id).kind === 'chapter',
  );
  const saved = await saveStructural(f, chapter.target);
  const value = await f.findings.getLiteraryFindingDecision('author', { target, id: saved.id });
  assert.equal(value.baseline.proofKind, 'architecture');
  assert.equal(value.state, 'planned');
  assert.equal(value.confirmationCurrent, false);
  await assert.rejects(
    f.findings.getLiteraryFindingContext('author', { ...f.origin, afterArchitectureIndex: 0.5 }),
    { code: 'invalid-argument' },
  );
  await assert.rejects(f.findings.getLiteraryFindingContext('other', f.origin), {
    code: 'not-found',
  });
});
test('a structural correction needs changed semantic metadata and a fully verified global successor, preserving idempotent confirmation', async () => {
  const f = await reconciledFixture();
  const destination = structuralTarget('arcMilestone', 'milestone-0', 'arc');
  const saved = await saveStructural(f, destination);
  await assert.rejects(confirmStructural(f, saved.id, jobId), { code: 'failed-precondition' });
  await f.db.runTransaction(async (tx) =>
    tx.update(f.db.doc('books/book/arcs/arc/milestones/milestone-0'), {
      notes: 'Ana decide depois de receber a carta.',
      updatedAt: 200,
    }),
  );
  const successor = 'architecture-corrected-successor-0001';
  f.advanceHour();
  await f.api.startLiteraryIntegration('author', start({ jobId: successor }));
  await assert.rejects(confirmStructural(f, saved.id, successor), { code: 'failed-precondition' });
  await complete(f, { target, jobId: successor });
  const confirmed = await confirmStructural(f, saved.id, successor);
  assert.equal(confirmed.revision, 2);
  assert.deepEqual(await confirmStructural(f, saved.id, successor), confirmed);
  const value = await f.findings.getLiteraryFindingDecision('author', { target, id: saved.id });
  assert.equal(value.confirmationCurrent, true);
  assert.equal(value.correction.proofKind, 'architecture');
  assert.equal(value.correction.versionId, null);
  assert.equal(value.baseline.target.id, destination.id);
  assert.equal(f.records.get('users/author').credits, 7);
  assert.equal(
    [...f.records.keys()].some((p) => p.startsWith('books/book/workVersions/')),
    false,
  );
  await f.db.runTransaction(async (tx) =>
    tx.update(f.db.doc('books/book/arcs/arc/milestones/milestone-0'), {
      notes: 'Outra escolha posterior',
      updatedAt: 300,
    }),
  );
  assert.equal(
    (await f.findings.getLiteraryFindingDecision('author', { target, id: saved.id }))
      .confirmationCurrent,
    false,
  );
});
test('prose-only changes do not confirm a structural chapter correction, and a nonglobal successor cannot reduce its coverage', async () => {
  const f = await reconciledFixture();
  const saved = await saveStructural(f, structuralTarget('chapter', 'chapter'));
  await f.db.runTransaction(async (tx) =>
    tx.update(f.db.doc('books/book/chapters/chapter'), {
      content: '<p>Outra carta chega.</p>',
      updatedAt: 200,
    }),
  );
  const global = 'architecture-prose-only-successor';
  f.advanceHour();
  await f.api.startLiteraryIntegration('author', start({ jobId: global }));
  await complete(f, { target, jobId: global });
  await assert.rejects(confirmStructural(f, saved.id, global), { code: 'failed-precondition' });
  await f.db.runTransaction(async (tx) =>
    tx.update(f.db.doc('books/book/chapters/chapter'), {
      title: 'A entrega da carta',
      updatedAt: 300,
    }),
  );
  const normal = 'architecture-reduced-successor';
  const input = start({ jobId: normal });
  delete input.audit;
  f.advanceHour();
  await f.api.startLiteraryIntegration('author', input);
  await complete(f, { target, jobId: normal });
  await assert.rejects(confirmStructural(f, saved.id, normal), { code: 'failed-precondition' });
});
test('recreated milestone parents cannot satisfy a structural correction from the old arc incarnation', async () => {
  const f = await reconciledFixture();
  const saved = await saveStructural(f, structuralTarget('arcMilestone', 'milestone-0', 'arc'));
  const row = { ...f.records.get('books/book/arcs/arc') };
  await f.db.runTransaction(async (tx) => tx.delete(f.db.doc('books/book/arcs/arc')));
  await f.db.runTransaction(async (tx) => tx.create(f.db.doc('books/book/arcs/arc'), row));
  await f.db.runTransaction(async (tx) =>
    tx.update(f.db.doc('books/book/arcs/arc/milestones/milestone-0'), { notes: 'Nova origem' }),
  );
  const successor = 'architecture-new-parent-successor';
  f.advanceHour();
  await f.api.startLiteraryIntegration('author', start({ jobId: successor }));
  await complete(f, { target, jobId: successor });
  await assert.rejects(confirmStructural(f, saved.id, successor), { code: 'failed-precondition' });
  const historical = await f.findings.getLiteraryFindingDecision('author', {
    target,
    id: saved.id,
  });
  assert.equal(historical.confirmationCurrent, false);
  assert.equal(historical.targetUnavailable, true);
  assert.equal(historical.baseline.label, null);
});
