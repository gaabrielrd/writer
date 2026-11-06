import test from 'node:test';
import assert from 'node:assert/strict';
import { studioDb } from './helpers/studioDb.mjs';
import { createScenesService } from '../src/scenes.mjs';
import { createLiteraryProseService } from '../src/literaryProse.mjs';
import { createLiteraryProductionService } from '../src/literaryProduction.mjs';
import { createLiteraryPlanningService } from '../src/literaryPlanning.mjs';
import { createLiteraryPreparationService } from '../src/literaryPreparation.mjs';
import { LITERARY_GATE_CRITERIA } from '../src/literaryGateProtocol.mjs';
import { emptyEditorialContract } from '../src/literaryContracts.mjs';
import { digest } from '../src/workProgressContracts.mjs';
const target = { kind: 'book', id: 'book' };
const op = (n) => 'prose-operation-' + String(n).padStart(4, '0');
const answer = (mode = 'reviseScene') => ({
  text: mode.startsWith('review') ? '' : 'Ela abriu a carta.\n\nA decisão mudou a casa.',
  complete: true,
  rationale: 'A mudança tem uma consequência vivida.',
  findings: [],
});
async function fixture({
  content = '<p>Ela recebeu a carta.</p>',
  generator = async (context) => answer(context.operation),
} = {}) {
  const f = studioDb();
  f.records.set('books/book', {
    authorId: 'author',
    title: 'Livro',
    status: 'draft',
    createdAt: 1,
    updatedAt: 100,
    wordCount: 0,
  });
  f.records.set('users/author', { credits: 5 });
  const scenes = createScenesService({ db: f.db, now: () => 200 });
  const chapter = await scenes.createSceneGroup('author', {
    target,
    operationId: op(1),
    title: 'A carta',
  });
  const result = await scenes.createScene('author', {
    target,
    parentId: chapter.id,
    operationId: op(2),
    title: 'A decisão',
    content,
    planning: {
      objective: 'Decidir se abre a carta.',
      conflict: 'Ela teme o remetente.',
      pointOfView: 'A filha.',
    },
  });
  const api = createLiteraryProseService({ db: f.db, now: () => 400, generator });
  const info = await api.getLiteraryProseSourceInfo('author', {
    target,
    chapterId: chapter.id,
    sceneId: result.scene.id,
  });
  return { ...f, scenes, chapterId: chapter.id, sceneId: result.scene.id, api, info };
}
const input = (f, mode = 'reviseScene', n = 10) => ({
  target,
  requestId: op(n),
  chapterId: f.chapterId,
  sceneId: f.sceneId,
  mode,
  segment: 0,
  instruction: 'Preserve o acontecimento.',
  expectedSourceToken: f.info.sourceToken,
});
async function preparation(f) {
  const planning = createLiteraryPlanningService({ db: f.db, now: () => 300 });
  const refs = await planning.listLiteraryReferences('author', {
    target,
    kind: 'chapter',
    purpose: 'subject',
  });
  const reference = refs.items.find((item) => item.reference.id === f.chapterId).reference,
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
  const api = createLiteraryPreparationService({ db: f.db, now: () => 350 });
  const context = await api.getLiteraryPreparationContext('author', {
    target,
    chapterId: f.chapterId,
    planIds,
  });
  await api.saveLiteraryPreparationGate('author', {
    target,
    chapterId: f.chapterId,
    planIds,
    operationId: op(35),
    expectedRevision: 0,
    stateToken: context.snapshot.stateToken,
    gate: {
      notes: 'Preparação aceita.',
      authorAccepted: true,
      criteria: Object.keys(LITERARY_GATE_CRITERIA).map((id) => ({
        id,
        result: 'pass',
        rationale: 'A intenção está sustentada.',
        evidence: [{ documentId: 'plan:brief', quote: 'A carta muda a confiança.' }],
      })),
    },
  });
}
test('draft generation requires the accepted preparation and never writes the proposal automatically', async () => {
  const f = await fixture({ content: '' });
  await assert.rejects(f.api.startLiteraryProse('author', input(f, 'draftScene')), {
    code: 'failed-precondition',
  });
  await preparation(f);
  const result = await f.api.startLiteraryProse('author', input(f, 'draftScene', 11));
  assert.equal(result.state, 'done');
  assert.equal(result.applicable, true);
  assert.equal(f.records.get('books/book/scenes/' + f.sceneId + '/body/current').content, '');
  assert.equal(f.records.get('users/author').credits, 5);
});
test('rewrite application preserves history and atomically updates native prose, credit and receipt', async () => {
  const f = await fixture(),
    request = input(f);
  assert.equal((await f.api.startLiteraryProse('author', request)).state, 'done');
  const application = { target, requestId: request.requestId, operationId: op(20) };
  const receipt = await f.api.applyLiteraryProse('author', application);
  assert.equal(receipt.chargedCredits, 1);
  assert.equal(receipt.credits, 4);
  assert.equal(
    f.records.get('books/book/scenes/' + f.sceneId + '/body/current').hash,
    receipt.contentHash,
  );
  assert.equal(f.records.get('users/author').credits, 4);
  assert.equal(
    f.records.get('books/book/workVersions/' + receipt.previousVersionId).contentHash,
    digest('<p>Ela recebeu a carta.</p>'),
  );
  assert.deepEqual(await f.api.applyLiteraryProse('author', application), receipt);
  assert.equal(f.records.get('users/author').credits, 4);
  const recovery = await createLiteraryProductionService({ db: f.db }).getLiteraryOperation(
    'author',
    { target, operationId: op(20) },
  );
  assert.equal(recovery.kind, 'proseApply');
  assert.equal(recovery.revision, receipt.revision);
});
test('reviews report segment coverage and cannot be applied as manuscript', async () => {
  const f = await fixture({ content: '<p>' + 'Ela abriu a carta. '.repeat(2200) + '</p>' });
  assert.ok(f.info.segments.length > 1);
  const request = { ...input(f, 'reviewStructure'), segment: 1 };
  const result = await f.api.startLiteraryProse('author', request);
  assert.equal(result.state, 'done');
  assert.equal(result.applicable, false);
  assert.equal(result.coverage.segment, 1);
  assert.equal(result.coverage.wholeChapter, false);
  assert.equal(result.coverage.completeScene, false);
  await assert.rejects(
    f.api.applyLiteraryProse('author', {
      target,
      requestId: request.requestId,
      operationId: op(21),
    }),
    { code: 'failed-precondition' },
  );
  assert.equal(f.records.get('users/author').credits, 5);
});
test('a new editorial contract invalidates a proposal captured without a guide', async () => {
  const f = await fixture(),
    request = input(f);
  await f.api.startLiteraryProse('author', request);
  await createLiteraryProductionService({ db: f.db, now: () => 500 }).saveLiteraryContract(
    'author',
    {
      target,
      operationId: op(25),
      expectedRevision: 0,
      contract: emptyEditorialContract(),
    },
  );
  const value = await f.api.getLiteraryProse('author', { target, requestId: request.requestId });
  assert.equal(value.state, 'stale');
  assert.equal(value.historical, true);
  assert.ok(value.result);
  await assert.rejects(
    f.api.applyLiteraryProse('author', {
      target,
      requestId: request.requestId,
      operationId: op(21),
    }),
    { code: 'failed-precondition' },
  );
});
test('changed saved prose cannot be overwritten by an old proposal', async () => {
  const f = await fixture(),
    request = input(f);
  await f.api.startLiteraryProse('author', request);
  const scene = await f.scenes.getScene('author', { target, sceneId: f.sceneId });
  await f.scenes.updateScene('author', {
    target,
    sceneId: f.sceneId,
    operationId: op(22),
    expectedRevision: scene.revision,
    patch: { content: '<p>Alteração manual posterior.</p>' },
  });
  await assert.rejects(
    f.api.applyLiteraryProse('author', {
      target,
      requestId: request.requestId,
      operationId: op(21),
    }),
    { code: 'failed-precondition' },
  );
  assert.equal(
    f.records.get('books/book/scenes/' + f.sceneId + '/body/current').content,
    '<p>Alteração manual posterior.</p>',
  );
  assert.equal(f.records.get('users/author').credits, 5);
});
test('incomplete provider output never becomes applicable', async () => {
  const f = await fixture({
    generator: async () => ({ ...answer('reviewProse'), complete: false }),
  });
  const value = await f.api.startLiteraryProse('author', input(f, 'reviewProse'));
  assert.equal(value.state, 'error');
  assert.equal(value.result, undefined);
  assert.equal(f.records.get('users/author').credits, 5);
});
test('cancel fences prevent a late producer from reopening a request', async () => {
  let finish, entered;
  const waiting = new Promise((resolve) => {
      finish = resolve;
    }),
    started = new Promise((resolve) => {
      entered = resolve;
    });
  const f = await fixture({
      generator: async () => {
        entered();
        return waiting;
      },
    }),
    request = input(f);
  const generation = f.api.startLiteraryProse('author', request);
  await started;
  await f.api.cancelLiteraryProse('author', { target, requestId: request.requestId });
  finish(answer());
  assert.equal((await generation).state, 'canceled');
  assert.equal(
    (await f.api.getLiteraryProse('author', { target, requestId: request.requestId })).state,
    'canceled',
  );
});
test('withdrawn origins hide derived text while preserving the authored instruction', async () => {
  const f = await fixture(),
    request = input(f);
  await f.api.startLiteraryProse('author', request);
  f.records.delete('books/book/scenes/' + f.sceneId);
  const value = await f.api.getLiteraryProse('author', { target, requestId: request.requestId });
  assert.equal(value.state, 'revoked');
  assert.equal(value.instruction, request.instruction);
  assert.equal(value.result, undefined);
  assert.equal(value.documents, undefined);
});

test('a rewrite with blocking findings cannot bypass an unresolved structural decision', async () => {
  const f = await fixture({
    generator: async () => ({
      ...answer(),
      findings: [
        {
          sourceId: 'manuscript',
          quote: 'Ela recebeu a carta.',
          problem: 'A origem da carta contradiz a reserva.',
          severity: 'blocking',
          action: 'Resolver a decisão antes da aplicação.',
        },
      ],
    }),
  });
  const request = input(f),
    result = await f.api.startLiteraryProse('author', request);
  assert.equal(result.state, 'done');
  assert.equal(result.hasBlockingFindings, true);
  assert.equal(result.applicable, false);
  await assert.rejects(
    f.api.applyLiteraryProse('author', {
      target,
      requestId: request.requestId,
      operationId: op(21),
    }),
    { code: 'failed-precondition' },
  );
  assert.equal(f.records.get('users/author').credits, 5);
});
test('an empty scene cannot bypass preparation by being called a revision', async () => {
  const f = await fixture({ content: '' });
  await assert.rejects(f.api.startLiteraryProse('author', input(f, 'reviseScene')), {
    code: 'failed-precondition',
  });
  await assert.rejects(f.api.startLiteraryProse('author', input(f, 'reviewProse', 12)), {
    code: 'failed-precondition',
  });
});

async function collaboration(f, mode, expectedRevision = 0, n = 1000) {
  const contract = emptyEditorialContract();
  contract.collaborationPolicy = { version: 1, mode };
  return createLiteraryProductionService({ db: f.db, now: () => 500 + n }).saveLiteraryContract(
    'author',
    {
      target,
      operationId: op(n),
      expectedRevision,
      contract,
    },
  );
}
test('guidance provides actual text analyses and suggestions without allowing manuscript application', async () => {
  const f = await fixture();
  await collaboration(f, 'guidance');
  const info = await f.api.getLiteraryProseSourceInfo('author', {
    target,
    chapterId: f.chapterId,
    sceneId: f.sceneId,
  });
  assert.equal(info.collaboration.mode, 'guidance');
  assert.equal(info.collaboration.revision, 1);
  const review = await f.api.startLiteraryProse('author', input(f, 'reviewStructure'));
  assert.equal(review.state, 'done');
  assert.equal(review.applicable, false);
  const suggestion = await f.api.startLiteraryProse('author', input(f, 'reviseScene', 11));
  assert.equal(suggestion.state, 'done');
  assert.equal(suggestion.applicable, false);
  assert.equal(suggestion.collaboration.mode, 'guidance');
  assert.ok(suggestion.result.text);
  await assert.rejects(
    f.api.applyLiteraryProse('author', { target, requestId: op(11), operationId: op(20) }),
    { code: 'failed-precondition' },
  );
  assert.equal(f.records.get('users/author').credits, 5);
  assert.equal(
    f.records.get('books/book/scenes/' + f.sceneId + '/body/current').content,
    '<p>Ela recebeu a carta.</p>',
  );
  assert.equal(f.records.has('books/book/literaryApplications/' + op(20)), false);
  const scene = await f.scenes.getScene('author', { target, sceneId: f.sceneId });
  await f.scenes.updateScene('author', {
    target,
    sceneId: f.sceneId,
    operationId: op(22),
    expectedRevision: scene.revision,
    patch: { content: '<p>Escrita manual do autor.</p>' },
  });
  assert.equal(
    f.records.get('books/book/scenes/' + f.sceneId + '/body/current').content,
    '<p>Escrita manual do autor.</p>',
  );
  assert.equal(f.records.get('users/author').credits, 5);
});
test('changing collaboration between history capture and application cannot write or debit; confirmed receipt remains recoverable', async () => {
  const f = await fixture();
  await collaboration(f, 'supervised');
  await f.api.startLiteraryProse('author', input(f));
  const original = f.db.runTransaction.bind(f.db);
  const versions = () =>
    [...f.records.keys()].filter((path) => path.startsWith('books/book/workVersions/')).length;
  const before = versions();
  let changed = false;
  f.db.runTransaction = async (cb) => {
    // Change policy only after the real native history transaction committed.
    if (!changed && versions() > before) {
      changed = true;
      await collaboration(f, 'guidance', 1, 1001);
    }
    return original(cb);
  };
  await assert.rejects(
    f.api.applyLiteraryProse('author', { target, requestId: op(10), operationId: op(20) }),
    { code: 'failed-precondition' },
  );
  f.db.runTransaction = original;
  assert.equal(changed, true);
  assert.ok(
    versions() > before,
    'native pre-application history was committed before policy revocation',
  );
  assert.equal(f.records.get('users/author').credits, 5);
  assert.equal(
    f.records.get('books/book/scenes/' + f.sceneId + '/body/current').content,
    '<p>Ela recebeu a carta.</p>',
  );
  assert.equal(
    (await f.api.getLiteraryProse('author', { target, requestId: op(10) })).state,
    'stale',
  );
  await collaboration(f, 'supervised', 2, 1002);
  await f.api.startLiteraryProse('author', input(f, 'reviseScene', 12));
  const apply = { target, requestId: op(12), operationId: op(21) };
  const receipt = await f.api.applyLiteraryProse('author', apply);
  await collaboration(f, 'guidance', 3, 1003);
  assert.deepEqual(await f.api.applyLiteraryProse('author', apply), receipt);
  assert.equal(f.records.get('users/author').credits, 4);
});
