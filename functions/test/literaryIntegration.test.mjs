import test from 'node:test';
import assert from 'node:assert/strict';
import { studioDb } from './helpers/studioDb.mjs';
import { createLiteraryIntegrationService } from '../src/literaryIntegration.mjs';
const target = { kind: 'book', id: 'book' },
  jobId = 'integration-operation-0001';
const command = { target, jobId };
function fixture({ blocking = false, long = false } = {}) {
  const f = studioDb(),
    calls = [];
  f.records.set('books/book', {
    authorId: 'author',
    title: 'Livro',
    createdAt: 1,
    updatedAt: 100,
    wordCount: 12,
    status: 'draft',
  });
  f.records.set('users/author', { credits: 5 });
  f.records.set('books/book/acts/one', { name: 'Primeiro', order: 1 });
  f.records.set('books/book/acts/two', { name: 'Segundo', order: 2 });
  for (const [id, order, actId, text] of [
    ['previous', 1, 'one', 'Ela guardou a carta.'],
    ['first', 1, 'two', long ? 'O caminho mudou. '.repeat(1500) : 'A carta chegou.'],
    ['second', 2, 'two', 'Ela abriu a carta.'],
  ])
    f.records.set('books/book/chapters/' + id, {
      bookId: 'book',
      title: id,
      order,
      actId,
      content: '<p>' + text + '</p>',
      updatedAt: 100,
    });
  const generator = async (input) => {
    calls.push(structuredClone(input));
    if (input.scope.phase === 'synthesis')
      return {
        complete: true,
        report: 'Síntese com rastreio.',
        findings: [],
        conclusions: [
          {
            axis: 'causality',
            observation: 'As ações têm consequências.',
            evidenceIds: input.documents.map((doc) => doc.id),
          },
        ],
      };
    const source = input.documents[0],
      quote = source.text.slice(0, Math.min(40, source.text.length));
    return {
      complete: true,
      report: 'Conferência das fontes.',
      findings: blocking
        ? [
            {
              severity: 'blocking',
              problem: 'Conferir mudança de conhecimento.',
              action: 'Decidir a correção com as fontes.',
              evidence: [{ sourceId: source.id, quote }],
            },
          ]
        : [],
      matrix: [
        {
          axis: 'knowledge',
          subject: 'A personagem',
          observation: 'A informação muda com a ação.',
          certainty: 'interpretation',
          evidence: [{ sourceId: source.id, quote }],
        },
      ],
    };
  };
  const api = createLiteraryIntegrationService({ db: f.db, generator, now: () => 400 });
  return { ...f, api, calls, generator };
}
const start = (level = 'book') => ({
  ...command,
  level,
  actId: level === 'act' ? 'two' : null,
  instruction: 'Confira promessa e continuidade.',
});
async function finish(f) {
  for (let step = 0; step < 500; step++) {
    const state = await f.api.advanceLiteraryIntegration('author', command);
    if (state.state === 'done') return state;
    assert.equal(
      ['stale', 'attention', 'canceled'].includes(state.state),
      false,
      JSON.stringify(state),
    );
  }
  throw new Error('Integration did not reach complete verified coverage');
}
test('a book integration actually reads every unit, every core segment and every chapter boundary before synthesis and acceptance', async () => {
  const f = fixture({ long: true });
  const before = structuredClone([...f.records.entries()]);
  const registered = await f.api.startLiteraryIntegration('author', start());
  assert.equal(registered.coverage.wholeBook, false);
  assert.equal(f.calls.length, 0);
  const result = await finish(f);
  assert.equal(result.chapters, 3);
  assert.equal(result.units, 3);
  assert.equal(result.readUnits, 3);
  assert.equal(result.boundaries, 2);
  assert.equal(result.coverage.wholeBook, true);
  assert.equal(result.coverage.verifiedUnits, 3);
  assert.equal(result.coverage.verifiedAnalyses, result.analyses);
  assert.equal(result.authorAccepted, false);
  assert.ok(f.calls.some((call) => call.scope.phase === 'synthesis'));
  assert.ok(
    f.calls.filter((call) => call.scope.phase === 'reading').length > 3,
    'large prose was segmented, not truncated',
  );
  const accepted = await f.api.acceptLiteraryIntegration('author', {
    ...command,
    expectedSourceToken: result.sourceToken,
  });
  assert.equal(accepted.authorAccepted, true);
  assert.equal(f.records.get('users/author').credits, 5);
  for (const [path, value] of before.filter(([path]) => path.includes('/chapters/')))
    assert.deepEqual(f.records.get(path), value);
  const callCount = f.calls.length;
  assert.equal((await f.api.advanceLiteraryIntegration('author', command)).authorAccepted, true);
  assert.equal(f.calls.length, callCount);
});
test('act integration reads the preceding chapter as passage context and proves only the selected act', async () => {
  const f = fixture();
  await f.api.startLiteraryIntegration('author', start('act'));
  const result = await finish(f);
  assert.equal(result.chapters, 2);
  assert.equal(result.contextChapters, 1);
  assert.equal(result.units, 2);
  assert.equal(result.readUnits, 2);
  assert.equal(result.boundaries, 2);
  assert.equal(result.coverage.wholeAct, true);
  assert.equal(result.coverage.wholeBook, false);
  assert.ok(
    f.calls.some((call) => call.documents.some((doc) => doc.text.includes('Ela guardou a carta.'))),
  );
});
test('matrix and synthesis form a navigable chain to the actual quoted text', async () => {
  const f = fixture();
  await f.api.startLiteraryIntegration('author', start());
  const result = await finish(f);
  const root = await f.api.getLiteraryIntegrationResult('author', {
    ...command,
    requestId: result.finalRequestId,
  });
  assert.equal(root.kind, 'synthesis');
  assert.ok(root.result.conclusions[0].evidenceIds.length);
  let id = root.result.conclusions[0].evidenceIds[0],
    leaf;
  for (let depth = 0; depth < 20; depth++) {
    const node = await f.api.getLiteraryIntegrationResult('author', { ...command, requestId: id });
    if (node.kind !== 'synthesis') {
      leaf = node;
      break;
    }
    id = node.result.conclusions[0].evidenceIds[0];
  }
  assert.ok(leaf.result.matrix[0].evidence[0].quote);
  assert.equal(leaf.result.coverage.wholeBook, false);
});
test('blocking findings do not disappear when the complete reading is summarized', async () => {
  const f = fixture({ blocking: true });
  await f.api.startLiteraryIntegration('author', start());
  const result = await finish(f);
  assert.ok(result.blocking > 0);
  await assert.rejects(
    f.api.acceptLiteraryIntegration('author', {
      ...command,
      expectedSourceToken: result.sourceToken,
    }),
    { code: 'failed-precondition' },
  );
});
test('source drift revokes current coverage and hides derived body instead of claiming that an old result is current', async () => {
  const f = fixture();
  await f.api.startLiteraryIntegration('author', start());
  const result = await finish(f);
  await f.db.runTransaction(async (tx) => {
    await tx.get(f.db.doc('books/book'));
    tx.update(f.db.doc('books/book'), { updatedAt: 500 });
    tx.update(f.db.doc('books/book/chapters/first'), {
      content: '<p>Uma nova decisão.</p>',
      updatedAt: 500,
    });
  });
  assert.equal((await f.api.getLiteraryIntegration('author', command)).state, 'stale');
  const response = await f.api.getLiteraryIntegrationResult('author', {
    ...command,
    requestId: result.finalRequestId,
  });
  assert.equal(response.state, 'stale');
  assert.equal('result' in response, false);
});
test('an interrupted provider needs explicit retry and keeps the previous checkpoints', async () => {
  const f = fixture();
  let fail = true;
  const api = createLiteraryIntegrationService({
    db: f.db,
    now: () => 400,
    generator: async (input) => {
      if (fail) {
        fail = false;
        throw new Error('Provider failed');
      }
      return f.generator(input);
    },
  });
  f.api = api;
  await api.startLiteraryIntegration('author', start());
  let state;
  for (let index = 0; index < 100; index++) {
    state = await api.advanceLiteraryIntegration('author', command);
    if (state.state === 'attention') break;
  }
  assert.equal(state.state, 'attention');
  assert.ok(state.pendingRequestId);
  assert.equal((await api.advanceLiteraryIntegration('author', command)).state, 'attention');
  await api.retryLiteraryIntegrationAnalysis('author', command);
  assert.equal((await finish(f)).state, 'done');
});
test('cancel-before-start permanently fences a late registration', async () => {
  const f = fixture();
  await f.api.cancelLiteraryIntegration('author', command);
  assert.equal((await f.api.startLiteraryIntegration('author', start())).state, 'canceled');
  assert.equal((await f.api.advanceLiteraryIntegration('author', command)).state, 'canceled');
  assert.equal(f.calls.length, 0);
});
test('a late provider cannot commit its result after cancellation', async () => {
  const f = fixture();
  let release, entered;
  const waiting = new Promise((resolve) => {
      release = resolve;
    }),
    started = new Promise((resolve) => {
      entered = resolve;
    });
  const api = createLiteraryIntegrationService({
    db: f.db,
    now: () => 400,
    generator: async (input) => {
      entered();
      await waiting;
      return f.generator(input);
    },
  });
  await api.startLiteraryIntegration('author', start());
  // Advance metadata only until reading is reached.
  for (let index = 0; index < 100; index++) {
    const state = await api.getLiteraryIntegration('author', command);
    if (state.state === 'reading') break;
    await api.advanceLiteraryIntegration('author', command);
  }
  const running = api.advanceLiteraryIntegration('author', command);
  await started;
  await api.cancelLiteraryIntegration('author', command);
  release();
  assert.equal((await running).state, 'canceled');
  assert.equal(
    [...f.records.keys()].filter((path) => path.includes('/literaryIntegrationResults/')).length,
    0,
  );
});

test('every endpoint rechecks book ownership before exposing integration data', async () => {
  const f = fixture();
  await f.api.startLiteraryIntegration('author', start());
  const done = await finish(f);
  await assert.rejects(f.api.getLiteraryIntegration('other', command), { code: 'not-found' });
  await assert.rejects(
    f.api.getLiteraryIntegrationResult('other', { ...command, requestId: done.finalRequestId }),
    { code: 'not-found' },
  );
  await assert.rejects(f.api.listLiteraryIntegrationResults('other', command), {
    code: 'not-found',
  });
});
