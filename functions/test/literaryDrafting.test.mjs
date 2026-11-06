import { emptyEditorialContract } from '../src/literaryContracts.mjs';
import { createLiteraryProductionService } from '../src/literaryProduction.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { studioDb } from './helpers/studioDb.mjs';
import { createScenesService } from '../src/scenes.mjs';
import { createLiteraryProseService } from '../src/literaryProse.mjs';
import { createLiteraryDraftService } from '../src/literaryDrafting.mjs';
import { createLiteraryPlanningService } from '../src/literaryPlanning.mjs';
import { createLiteraryPreparationService } from '../src/literaryPreparation.mjs';
import { LITERARY_GATE_CRITERIA } from '../src/literaryGateProtocol.mjs';
const target = { kind: 'book', id: 'book' },
  op = (n) => 'draft-operation-' + String(n).padStart(4, '0');
const answer = () => ({
  text: 'A filha abriu a carta.\n\nUma decisão mudou a casa.',
  complete: true,
  rationale: 'Uma escolha foi vivida.',
  findings: [],
});
async function fixture({
  existing = false,
  generator = async () => answer(),
  collaboration = 'continuous',
} = {}) {
  const f = studioDb(),
    seen = [];
  f.records.set('books/book', {
    authorId: 'author',
    title: 'Livro',
    status: 'draft',
    createdAt: 1,
    updatedAt: 100,
    wordCount: 0,
  });
  f.records.set('users/author', { credits: 10 });
  const contract = emptyEditorialContract();
  contract.collaborationPolicy = { version: 1, mode: collaboration ?? 'supervised' };
  if (collaboration !== null)
    await createLiteraryProductionService({ db: f.db, now: () => 150 }).saveLiteraryContract(
      'author',
      {
        target,
        operationId: op(1000),
        expectedRevision: 0,
        contract,
      },
    );
  const scenes = createScenesService({ db: f.db, now: () => 200 });
  const chapter = await scenes.createSceneGroup('author', {
      target,
      operationId: op(1),
      title: 'A carta',
    }),
    ids = [];
  for (let i = 0; i < 2; i++) {
    const result = await scenes.createScene('author', {
      target,
      parentId: chapter.id,
      operationId: op(2 + i),
      title: 'Cena ' + i,
      content: existing && i === 0 ? '<p>Texto que o autor já escreveu.</p>' : '',
      planning: { objective: 'Abrir a carta.' },
    });
    ids.push(result.scene.id);
  }
  const planning = createLiteraryPlanningService({ db: f.db, now: () => 300 });
  const refs = await planning.listLiteraryReferences('author', {
    target,
    kind: 'chapter',
    purpose: 'subject',
  });
  const reference = refs.items.find((item) => item.reference.id === chapter.id).reference,
    planIds = ['brief', 'scenes', 'world'];
  for (const [index, kind] of ['chapterBrief', 'scenePreparation', 'localWorldbuilding'].entries())
    await planning.saveLiteraryPlan('author', {
      target,
      id: planIds[index],
      operationId: op(30 + index),
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
  const context = await preparation.getLiteraryPreparationContext('author', {
    target,
    chapterId: chapter.id,
    planIds,
  });
  await preparation.saveLiteraryPreparationGate('author', {
    target,
    chapterId: chapter.id,
    planIds,
    operationId: op(35),
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
  const prose = createLiteraryProseService({
    db: f.db,
    now: () => 400,
    generator: async (input) => {
      seen.push(input);
      return generator(input);
    },
  });
  const api = createLiteraryDraftService({ db: f.db, now: () => 500, prose });
  return { ...f, scenes, prose, api, seen, chapterId: chapter.id, ids };
}
const start = (f) => ({
  target,
  jobId: op(10),
  chapterId: f.chapterId,
  instruction: 'Viva cada escolha.',
});
const advance = { target, jobId: op(10) };
async function until(f, state) {
  for (let index = 0; index < 100; index++) {
    const result = await f.api.advanceLiteraryDraft('author', advance);
    if (result.job.state === state) return result;
    assert.ok(
      !['stale', 'canceled', 'attention'].includes(result.job.state),
      'unexpected stop ' + result.job.state,
    );
  }
  throw new Error('Checkpoint não alcançado.');
}
test('generation waits for explicit acceptance, and acceptance commits native text, credit and checkpoint together', async () => {
  const f = await fixture();
  const initial = await f.api.startLiteraryDraft('author', start(f));
  assert.equal(initial.job.state, 'planning');
  assert.equal(f.seen.length, 0);
  const proposal = await until(f, 'awaitingAcceptance');
  assert.equal(f.records.get('books/book/scenes/' + f.ids[0] + '/body/current').content, '');
  assert.equal(f.records.get('users/author').credits, 10);
  const input = { ...advance, requestId: proposal.proposal.requestId, operationId: op(20) };
  const accepted = await f.api.acceptLiteraryDraftScene('author', input);
  assert.equal(accepted.frame.job.accepted, 1);
  assert.equal(accepted.frame.job.drafted, 1);
  assert.equal(accepted.application.chargedCredits, 1);
  assert.equal(f.records.get('users/author').credits, 9);
  assert.match(
    f.records.get('books/book/scenes/' + f.ids[0] + '/body/current').content,
    /A filha abriu a carta/,
  );
  const replay = await f.api.acceptLiteraryDraftScene('author', input);
  assert.equal(replay.frame.job.accepted, 1);
  assert.equal(f.records.get('users/author').credits, 9);
  const next = await until(f, 'awaitingAcceptance');
  assert.match(
    f.seen[1].documents.find((document) => document.id === 'previousScene').text,
    /A filha abriu a carta/,
  );
  await f.api.acceptLiteraryDraftScene('author', {
    ...advance,
    requestId: next.proposal.requestId,
    operationId: op(21),
  });
  const done = await until(f, 'done');
  assert.equal(done.job.accepted, 2);
  assert.equal(done.job.drafted, 2);
  assert.equal(f.records.get('users/author').credits, 8);
  assert.equal(
    f.records.get('books/book/literaryMilestones/' + done.job.milestoneJobId).state,
    'done',
  );
  assert.equal(f.records.get('books/book').status, 'draft');
});
test('existing prose is never redrafted or billed; adoption is explicit and replayable', async () => {
  const f = await fixture({ existing: true });
  await f.api.startLiteraryDraft('author', start(f));
  const existing = await until(f, 'existingText');
  assert.equal(f.seen.length, 0);
  assert.match(existing.existing.content, /Texto que o autor/);
  const input = {
    ...advance,
    unitIndex: existing.unit.index,
    expectedSourceToken: existing.existing.sourceToken,
  };
  let adopted = await f.api.adoptLiteraryDraftScene('author', input);
  assert.equal(adopted.job.accepted, 1);
  assert.equal(adopted.job.adopted, 1);
  adopted = await f.api.adoptLiteraryDraftScene('author', input);
  assert.equal(adopted.job.accepted, 1);
  assert.equal(adopted.job.adopted, 1);
  assert.equal(f.records.get('users/author').credits, 10);
  assert.equal(
    f.records.get('books/book/scenes/' + f.ids[0] + '/body/current').content,
    '<p>Texto que o autor já escreveu.</p>',
  );
});
test('an external edit stops the flow without overwriting manual work or charging credits', async () => {
  const f = await fixture();
  await f.api.startLiteraryDraft('author', start(f));
  const proposal = await until(f, 'awaitingAcceptance');
  const current = await f.scenes.getScene('author', { target, sceneId: f.ids[0] });
  await f.scenes.updateScene('author', {
    target,
    sceneId: f.ids[0],
    operationId: op(22),
    expectedRevision: current.revision,
    patch: { content: '<p>Uma edição manual posterior.</p>' },
  });
  await assert.rejects(
    f.api.acceptLiteraryDraftScene('author', {
      ...advance,
      requestId: proposal.proposal.requestId,
      operationId: op(20),
    }),
    { code: 'failed-precondition' },
  );
  assert.equal((await f.api.getLiteraryDraft('author', advance)).job.state, 'stale');
  assert.equal(f.records.get('users/author').credits, 10);
  assert.equal(
    f.records.get('books/book/scenes/' + f.ids[0] + '/body/current').content,
    '<p>Uma edição manual posterior.</p>',
  );
});
test('failure of checkpoint preparation rolls back text and credit while preserving the prior native version', async () => {
  const f = await fixture();
  await f.api.startLiteraryDraft('author', start(f));
  const proposal = await until(f, 'awaitingAcceptance'),
    original = f.prose.applyLiteraryProse;
  f.prose.applyLiteraryProse = (uid, input, internal) =>
    original(uid, input, {
      prepareCommit: async (...args) => {
        await internal.prepareCommit(...args);
        throw new Error('Checkpoint unavailable');
      },
    });
  await assert.rejects(
    f.api.acceptLiteraryDraftScene('author', {
      ...advance,
      requestId: proposal.proposal.requestId,
      operationId: op(20),
    }),
    /Checkpoint unavailable/,
  );
  assert.equal(f.records.get('users/author').credits, 10);
  assert.equal(f.records.get('books/book/scenes/' + f.ids[0] + '/body/current').content, '');
  assert.equal(f.records.get('books/book/literaryDraftJobs/' + op(10)).accepted, 0);
  assert.equal(f.records.has('books/book/literaryProseApplications/' + op(20)), false);
  assert.ok([...f.records.keys()].some((key) => key.startsWith('books/book/workVersions/')));
});
test('structural blockers cannot be erased by merely regenerating a proposal', async () => {
  const f = await fixture({
    generator: async () => ({
      ...answer(),
      findings: [
        {
          sourceId: 'scenePlan',
          quote: 'Abrir a carta.',
          severity: 'blocking',
          problem: 'Decisão estrutural pendente.',
          action: 'Resolver e conferir a preparação.',
        },
      ],
    }),
  });
  await f.api.startLiteraryDraft('author', start(f));
  await f.api.advanceLiteraryDraft('author', advance);
  const stopped = await f.api.advanceLiteraryDraft('author', advance);
  assert.equal(stopped.job.state, 'attention');
  await assert.rejects(f.api.regenerateLiteraryDraftScene('author', advance), {
    code: 'failed-precondition',
  });
  assert.equal(f.records.get('users/author').credits, 10);
});
test('canceling the flow prevents a later acceptance and preserves existing text', async () => {
  const f = await fixture();
  await f.api.startLiteraryDraft('author', start(f));
  const proposal = await until(f, 'awaitingAcceptance');
  await f.api.cancelLiteraryDraft('author', advance);
  await assert.rejects(
    f.api.acceptLiteraryDraftScene('author', {
      ...advance,
      requestId: proposal.proposal.requestId,
      operationId: op(20),
    }),
    { code: 'failed-precondition' },
  );
  assert.equal(f.records.get('users/author').credits, 10);
  assert.equal(f.records.get('books/book/scenes/' + f.ids[0] + '/body/current').content, '');
});

const continuous = (maxApplications = 2, maxCredits = 2) => ({
  version: 1,
  mode: 'continuous',
  maxApplications,
  maxCredits,
});
const control = (revision, paused, number, execution) => ({
  ...advance,
  operationId: op(number),
  expectedRevision: revision,
  paused,
  ...(execution ? { execution } : {}),
});
async function checkpoint(f, predicate) {
  for (let step = 0; step < 150; step++) {
    const frame = await f.api.advanceLiteraryDraft('author', advance);
    if (predicate(frame)) return frame;
    assert.ok(
      !['stale', 'canceled', 'attention'].includes(frame.job.state),
      JSON.stringify(frame.job),
    );
  }
  throw new Error('Execution checkpoint not reached');
}
test('continuous draft applies within a frozen total budget and an explicit amendment resumes without repeating work or credit', async () => {
  const f = await fixture();
  const input = { ...start(f), execution: continuous(1, 1) };
  await f.api.startLiteraryDraft('author', input);
  const stopped = await checkpoint(f, (frame) => frame.job.executionStop === 'budget');
  assert.equal(stopped.job.drafted, 1);
  assert.equal(stopped.job.chargedCredits, 1);
  assert.equal(f.seen.length, 1);
  assert.equal(f.records.get('users/author').credits, 9);
  assert.equal(f.records.get('books/book/scenes/' + f.ids[1] + '/body/current').content, '');
  await f.api.advanceLiteraryDraft('author', advance);
  assert.equal(f.seen.length, 1);
  const amendment = control(0, false, 41, continuous(2, 2));
  await f.api.setLiteraryDraftExecution('author', amendment);
  await f.api.setLiteraryDraftExecution('author', amendment);
  const done = await checkpoint(f, (frame) => frame.job.state === 'done');
  assert.equal(done.job.drafted, 2);
  assert.equal(done.job.chargedCredits, 2);
  assert.equal(f.seen.length, 2);
  assert.equal(f.records.get('users/author').credits, 8);
  assert.ok(done.job.milestoneJobId);
  assert.equal(f.records.get('books/book').status, 'draft');
  assert.equal((await f.api.startLiteraryDraft('author', input)).job.execution.maxCredits, 2);
  await assert.rejects(
    f.api.startLiteraryDraft('author', { ...input, execution: continuous(2, 2) }),
    { code: 'invalid-argument' },
  );
  const receipt = await createLiteraryProductionService({ db: f.db }).getLiteraryOperation(
    'author',
    { target, operationId: amendment.operationId },
  );
  assert.equal(receipt.state, 'confirmed');
  assert.equal(receipt.kind, 'draftExecution');
  assert.equal(receipt.revision, 1);
});
test('credit budget is enforced even when the application allowance is larger, and no further provider is called', async () => {
  const f = await fixture();
  await f.api.startLiteraryDraft('author', { ...start(f), execution: continuous(10, 1) });
  const stopped = await checkpoint(f, (frame) => frame.job.executionStop === 'budget');
  assert.equal(stopped.job.drafted, 1);
  assert.equal(stopped.job.chargedCredits, 1);
  assert.equal(f.seen.length, 1);
  await assert.rejects(
    f.api.setLiteraryDraftExecution('author', control(0, false, 42, continuous(1, 0))),
    { code: 'invalid-argument' },
  );
  await assert.rejects(f.api.setLiteraryDraftExecution('other', control(0, false, 43)), {
    code: 'not-found',
  });
  assert.equal(f.records.get('users/author').credits, 9);
});
test('server pause fences a held continuous proposal and old pause replay cannot revoke a newer resume', async () => {
  let release, entered;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const claimed = new Promise((resolve) => {
    entered = resolve;
  });
  const f = await fixture({
    generator: async () => {
      entered();
      return pending;
    },
  });
  await f.api.startLiteraryDraft('author', { ...start(f), execution: continuous() });
  await f.api.advanceLiteraryDraft('author', advance);
  const running = f.api.advanceLiteraryDraft('author', advance);
  await claimed;
  const pause = control(0, true, 44);
  const paused = await f.api.setLiteraryDraftExecution('author', pause);
  assert.equal(paused.job.paused, true);
  release(answer());
  const completed = await running;
  assert.equal(completed.job.paused, true);
  assert.equal(completed.job.drafted, 0);
  assert.equal(completed.proposal.state, 'done');
  assert.equal(f.records.get('users/author').credits, 10);
  assert.equal(f.records.get('books/book/scenes/' + f.ids[0] + '/body/current').content, '');
  await assert.rejects(
    f.api.acceptLiteraryDraftScene('author', {
      ...advance,
      requestId: completed.proposal.requestId,
      operationId: op(45),
    }),
    { code: 'failed-precondition' },
  );
  await f.api.setLiteraryDraftExecution('author', control(1, false, 46));
  const replay = await f.api.setLiteraryDraftExecution('author', pause);
  assert.equal(replay.job.paused, false);
  assert.equal(replay.job.controlRevision, 2);
  const applied = await f.api.advanceLiteraryDraft('author', advance);
  assert.equal(applied.job.drafted, 1);
  assert.equal(applied.job.chargedCredits, 1);
  assert.equal(f.seen.length, 1);
  await assert.rejects(f.api.setLiteraryDraftExecution('author', control(0, true, 47)), {
    code: 'failed-precondition',
  });
});
test('cancellation while a continuous provider waits leaves no applied scene or debit and cannot be rearmed', async () => {
  let release, entered;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const claimed = new Promise((resolve) => {
    entered = resolve;
  });
  const f = await fixture({
    generator: async () => {
      entered();
      return pending;
    },
  });
  await f.api.startLiteraryDraft('author', { ...start(f), execution: continuous() });
  await f.api.advanceLiteraryDraft('author', advance);
  const running = f.api.advanceLiteraryDraft('author', advance);
  await claimed;
  await f.api.cancelLiteraryDraft('author', advance);
  release(answer());
  const result = await running;
  assert.equal(result.job.state, 'canceled');
  assert.equal(f.records.get('users/author').credits, 10);
  assert.equal(f.records.get('books/book/scenes/' + f.ids[0] + '/body/current').content, '');
  await assert.rejects(
    f.api.setLiteraryDraftExecution('author', control(0, false, 48, continuous())),
    { code: 'failed-precondition' },
  );
});
test('continuous mode stops for existing text or a structural blocker rather than adopting or billing it automatically', async () => {
  const existing = await fixture({ existing: true });
  await existing.api.startLiteraryDraft('author', { ...start(existing), execution: continuous() });
  const stopped = await checkpoint(existing, (frame) => frame.job.state === 'existingText');
  assert.equal(stopped.job.adopted, 0);
  assert.equal(existing.seen.length, 0);
  assert.equal(existing.records.get('users/author').credits, 10);
  const blocked = await fixture({
    generator: async () => ({
      ...answer(),
      findings: [
        {
          sourceId: 'scenePlan',
          quote: 'Abrir a carta.',
          severity: 'blocking',
          problem: 'Lacuna estrutural.',
          action: 'Conferir o planejamento.',
        },
      ],
    }),
  });
  await blocked.api.startLiteraryDraft('author', { ...start(blocked), execution: continuous() });
  await blocked.api.advanceLiteraryDraft('author', advance);
  const result = await blocked.api.advanceLiteraryDraft('author', advance);
  assert.equal(result.job.state, 'attention');
  assert.equal(result.job.drafted, 0);
  assert.equal(blocked.records.get('users/author').credits, 10);
});
test('concurrent advances share the proposal and one atomic automatic application', async () => {
  let release, entered;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const claimed = new Promise((resolve) => {
    entered = resolve;
  });
  const f = await fixture({
    generator: async () => {
      entered();
      return pending;
    },
  });
  await f.api.startLiteraryDraft('author', { ...start(f), execution: continuous(1, 1) });
  await f.api.advanceLiteraryDraft('author', advance);
  const first = f.api.advanceLiteraryDraft('author', advance);
  await claimed;
  const second = await f.api.advanceLiteraryDraft('author', advance);
  assert.equal(second.waitingForResult, true);
  release(answer());
  const result = await first;
  assert.equal(result.job.drafted, 1);
  assert.equal(result.job.chargedCredits, 1);
  assert.equal(f.seen.length, 1);
  assert.equal(f.records.get('users/author').credits, 9);
  assert.equal(
    [...f.records.keys()].filter((path) => path.startsWith('books/book/literaryDraftReceipts/'))
      .length,
    1,
  );
});
test('insufficient balance preserves the proposal and an explicit resume uses it once after replenishment', async () => {
  const f = await fixture();
  f.records.set('users/author', { credits: 0 });
  await f.api.startLiteraryDraft('author', { ...start(f), execution: continuous(1, 1) });
  const stopped = await checkpoint(f, (frame) => frame.job.executionStop === 'credits');
  assert.equal(stopped.job.drafted, 0);
  assert.equal(stopped.job.chargedCredits, 0);
  assert.equal(f.seen.length, 1);
  await f.db.runTransaction(async (tx) => tx.update(f.db.doc('users/author'), { credits: 1 }));
  await f.api.setLiteraryDraftExecution('author', control(0, false, 49));
  const applied = await f.api.advanceLiteraryDraft('author', advance);
  assert.equal(applied.job.drafted, 1);
  assert.equal(applied.job.chargedCredits, 1);
  assert.equal(f.seen.length, 1);
});

test('revoking automatic permission after the controller read still fences the atomic application', async () => {
  const f = await fixture();
  await f.api.startLiteraryDraft('author', { ...start(f), execution: continuous() });
  const apply = f.prose.applyLiteraryProse;
  f.prose.applyLiteraryProse = async (uid, input, internal) => {
    await f.api.setLiteraryDraftExecution(
      'author',
      control(0, false, 50, {
        version: 1,
        mode: 'supervised',
        maxApplications: null,
        maxCredits: null,
      }),
    );
    return apply(uid, input, internal);
  };
  await f.api.advanceLiteraryDraft('author', advance);
  const result = await f.api.advanceLiteraryDraft('author', advance);
  assert.equal(result.job.execution.mode, 'supervised');
  assert.equal(result.job.state, 'awaitingAcceptance');
  assert.equal(result.job.drafted, 0);
  assert.equal(f.records.get('users/author').credits, 10);
  assert.equal(f.records.get('books/book/scenes/' + f.ids[0] + '/body/current').content, '');
  f.prose.applyLiteraryProse = apply;
  await f.api.acceptLiteraryDraftScene('author', {
    ...advance,
    requestId: result.proposal.requestId,
    operationId: op(51),
  });
  assert.equal(f.records.get('users/author').credits, 9);
});
test('application failure after preparing its checkpoint rolls back automatic counters, manuscript and debit together', async () => {
  const f = await fixture();
  await f.api.startLiteraryDraft('author', { ...start(f), execution: continuous() });
  const apply = f.prose.applyLiteraryProse;
  f.prose.applyLiteraryProse = (uid, input, internal) =>
    apply(uid, input, {
      prepareCommit: async (...args) => {
        await internal.prepareCommit(...args);
        throw new Error('Atomic checkpoint unavailable');
      },
    });
  await f.api.advanceLiteraryDraft('author', advance);
  await assert.rejects(
    f.api.advanceLiteraryDraft('author', advance),
    /Atomic checkpoint unavailable/,
  );
  assert.equal(f.records.get('users/author').credits, 10);
  assert.equal(f.records.get('books/book/scenes/' + f.ids[0] + '/body/current').content, '');
  assert.equal(f.records.get('books/book/literaryDraftJobs/' + op(10)).drafted, 0);
  assert.equal(f.records.get('books/book/literaryDraftJobs/' + op(10)).chargedCredits, 0);
  f.prose.applyLiteraryProse = apply;
  const repaired = await f.api.advanceLiteraryDraft('author', advance);
  assert.equal(repaired.job.drafted, 1);
  assert.equal(repaired.job.chargedCredits, 1);
  assert.equal(f.seen.length, 1);
});

test('the versioned book mode controls draft registration and cannot be replaced by a per-job grant', async () => {
  for (const collaboration of ['guidance', 'supervised', null]) {
    const f = await fixture({ collaboration });
    await assert.rejects(
      f.api.startLiteraryDraft('author', { ...start(f), execution: continuous() }),
      { code: 'failed-precondition' },
    );
    assert.equal(f.records.has('books/book/literaryDraftJobs/' + op(10)), false);
    assert.equal(f.seen.length, 0);
    assert.equal(f.records.get('users/author').credits, 10);
    if (collaboration !== 'guidance') {
      const result = await f.api.startLiteraryDraft('author', start(f));
      assert.equal(result.job.collaboration.mode, 'supervised');
      await assert.rejects(
        f.api.setLiteraryDraftExecution('author', {
          target,
          jobId: op(10),
          operationId: op(1001),
          expectedRevision: 0,
          paused: false,
          execution: continuous(),
        }),
        { code: 'failed-precondition' },
      );
    }
  }
});

test('changing the contract mode while a provider waits invalidates the captured draft authorization', async () => {
  let release, entered;
  const waiting = new Promise((resolve) => {
    entered = resolve;
  });
  const f = await fixture({
    generator: async () => {
      entered();
      return new Promise((resolve) => {
        release = resolve;
      });
    },
  });
  await f.api.startLiteraryDraft('author', { ...start(f), execution: continuous() });
  await f.api.advanceLiteraryDraft('author', advance); // census
  const running = f.api.advanceLiteraryDraft('author', advance);
  await waiting;
  const contract = emptyEditorialContract();
  contract.collaborationPolicy = { version: 1, mode: 'guidance' };
  await createLiteraryProductionService({ db: f.db, now: () => 600 }).saveLiteraryContract(
    'author',
    {
      target,
      operationId: op(1002),
      expectedRevision: 1,
      contract,
    },
  );
  release(answer());
  const result = await running;
  assert.equal(result.job.state, 'stale');
  assert.equal(f.records.get('users/author').credits, 10);
  assert.equal(f.records.get('books/book/scenes/' + f.ids[0] + '/body/current').content, '');
  assert.equal(f.seen.length, 1);
  const retry = await f.api.advanceLiteraryDraft('author', advance);
  assert.equal(retry.job.state, 'stale');
  assert.equal(f.seen.length, 1);
});
