import test from 'node:test';
import assert from 'node:assert/strict';
import { studioDb } from './helpers/studioDb.mjs';
import { createLiteraryIntegrationService } from '../src/literaryIntegration.mjs';
import { createLiteraryIntegrationRecheckService } from '../src/literaryIntegrationRecheck.mjs';
const target = { kind: 'book', id: 'book' },
  jobId = 'integration-original-00001',
  operationId = 'integration-recheck-00001';
const command = { target, jobId };
async function fixture() {
  const f = studioDb(),
    calls = [];
  f.records.set('books/book', {
    authorId: 'author',
    title: 'Livro',
    createdAt: 1,
    updatedAt: 100,
    wordCount: 6,
    status: 'draft',
  });
  f.records.set('users/author', { credits: 5 });
  for (const [id, order, text] of [
    ['one', 1, 'Uma carta chegou.'],
    ['two', 2, 'Ela abriu a carta.'],
  ])
    f.records.set('books/book/chapters/' + id, {
      bookId: 'book',
      title: id,
      order,
      content: '<p>' + text + '</p>',
      updatedAt: 100,
    });
  const generator = async (input) => {
    calls.push(input);
    if (input.scope.phase === 'synthesis')
      return {
        complete: true,
        report: 'Síntese.',
        findings: [],
        conclusions: [
          {
            axis: 'causality',
            observation: 'As escolhas têm consequências.',
            evidenceIds: input.documents.map((item) => item.id),
          },
        ],
      };
    const source = input.documents[0];
    return {
      complete: true,
      report: 'Conferência.',
      findings: [],
      matrix: [
        {
          axis: 'knowledge',
          subject: 'A personagem',
          observation: 'A carta permite uma descoberta.',
          certainty: 'interpretation',
          evidence: [{ sourceId: source.id, quote: source.text.slice(0, 12) }],
        },
      ],
    };
  };
  const api = createLiteraryIntegrationService({ db: f.db, generator, now: () => 400 });
  const recheck = createLiteraryIntegrationRecheckService({ db: f.db, now: () => 600 });
  await api.startLiteraryIntegration('author', {
    ...command,
    level: 'book',
    instruction: 'Confira a carta.',
  });
  let original;
  for (let step = 0; step < 200; step++) {
    original = await api.advanceLiteraryIntegration('author', command);
    if (original.state === 'done') break;
  }
  assert.equal(original.state, 'done');
  return { ...f, api, recheck, calls, original };
}
async function finish(f) {
  for (let step = 0; step < 200; step++) {
    const value = await f.recheck.advanceLiteraryIntegrationRecheck('author', {
      target,
      operationId,
    });
    if (value.state !== 'scanning') return value;
  }
  throw new Error('Recheck did not finish');
}
test('publication metadata can be reconfirmed without regenerating text or analyses, with author acceptance kept separate', async () => {
  const f = await fixture(),
    count = f.calls.length;
  await f.api.acceptLiteraryIntegration('author', {
    ...command,
    expectedSourceToken: f.original.sourceToken,
  });
  await f.db.runTransaction(async (tx) => {
    await tx.get(f.db.doc('books/book'));
    tx.update(f.db.doc('books/book'), { status: 'published', updatedAt: 500 });
  });
  assert.equal((await f.api.getLiteraryIntegration('author', command)).state, 'stale');
  await f.recheck.startLiteraryIntegrationRecheck('author', {
    ...command,
    operationId,
    expectedSourceToken: f.original.sourceToken,
  });
  const result = await finish(f);
  assert.equal(result.state, 'done');
  const current = await f.api.getLiteraryIntegration('author', command);
  assert.equal(current.state, 'done');
  assert.equal(current.authorAccepted, false);
  assert.notEqual(current.sourceToken, f.original.sourceToken);
  assert.equal(current.finalRequestId, f.original.finalRequestId);
  assert.equal(f.calls.length, count);
  assert.equal(f.records.get('users/author').credits, 5);
  const historical = f.records.get('books/book/literaryIntegrationRechecks/' + operationId);
  assert.ok(historical.previousAcceptedAt);
  assert.deepEqual(
    await f.recheck.advanceLiteraryIntegrationRecheck('author', { target, operationId }),
    result,
  );
});
test('changed chapter text is an impact to re-evaluate and cannot be blessed by refreshing the fence', async () => {
  const f = await fixture(),
    count = f.calls.length;
  await f.db.runTransaction(async (tx) => {
    await tx.get(f.db.doc('books/book'));
    tx.update(f.db.doc('books/book'), { updatedAt: 500 });
    tx.update(f.db.doc('books/book/chapters/one'), {
      content: '<p>Ela queimou a carta.</p>',
      updatedAt: 500,
    });
  });
  await f.recheck.startLiteraryIntegrationRecheck('author', {
    ...command,
    operationId,
    expectedSourceToken: f.original.sourceToken,
  });
  const result = await finish(f);
  assert.equal(result.state, 'changed');
  assert.equal(result.impact.chapterId, 'one');
  assert.equal(f.calls.length, count);
  assert.equal((await f.api.getLiteraryIntegration('author', command)).state, 'stale');
  const blocked = await f.api.acceptLiteraryIntegration('author', {
    ...command,
    expectedSourceToken: f.original.sourceToken,
  });
  assert.equal(blocked.state, 'stale');
  assert.equal(blocked.authorAccepted, false);
});
test('changed organization and a concurrent mutation interrupt reconfirmation without discarding previous evidence', async () => {
  const f = await fixture();
  const started = await f.recheck.startLiteraryIntegrationRecheck('author', {
    ...command,
    operationId,
    expectedSourceToken: f.original.sourceToken,
  });
  assert.equal(started.state, 'scanning');
  await f.db.runTransaction(async (tx) => {
    await tx.get(f.db.doc('books/book'));
    tx.update(f.db.doc('books/book'), { updatedAt: 900 });
  });
  const stopped = await f.recheck.advanceLiteraryIntegrationRecheck('author', {
    target,
    operationId,
  });
  assert.equal(stopped.state, 'changed');
  assert.equal(stopped.impact.kind, 'concurrent');
  assert.ok(f.records.get('books/book/literaryIntegrationResults/' + f.original.finalRequestId));
});
test('cancel-before-start fences a late recheck and a second active recheck cannot replace the first', async () => {
  const f = await fixture();
  await f.recheck.cancelLiteraryIntegrationRecheck('author', { target, operationId });
  assert.equal(
    (
      await f.recheck.startLiteraryIntegrationRecheck('author', {
        ...command,
        operationId,
        expectedSourceToken: f.original.sourceToken,
      })
    ).state,
    'canceled',
  );
  const second = 'integration-recheck-00002';
  await f.recheck.startLiteraryIntegrationRecheck('author', {
    ...command,
    operationId: second,
    expectedSourceToken: f.original.sourceToken,
  });
  await assert.rejects(
    f.recheck.startLiteraryIntegrationRecheck('author', {
      ...command,
      operationId: 'integration-recheck-00003',
      expectedSourceToken: f.original.sourceToken,
    }),
    { code: 'failed-precondition' },
  );
});
test('a successor reuses unchanged requests and generates changed readings and a new synthesis', async () => {
  const f = await fixture(),
    count = f.calls.length,
    newId = 'integration-successor-0001';
  await f.db.runTransaction(async (tx) => {
    await tx.get(f.db.doc('books/book'));
    tx.update(f.db.doc('books/book'), { updatedAt: 500 });
    tx.update(f.db.doc('books/book/chapters/one'), {
      content: '<p>Outra carta chegou.</p>',
      updatedAt: 500,
    });
  });
  const setup = await f.api.getLiteraryIntegrationSetup('author', command);
  await f.api.startLiteraryIntegration('author', { target, jobId: newId, ...setup });
  let result;
  for (let step = 0; step < 200; step++) {
    result = await f.api.advanceLiteraryIntegration('author', { target, jobId: newId });
    if (result.state === 'done') break;
  }
  assert.equal(result.state, 'done');
  assert.ok(result.reusedAnalyses >= 1);
  assert.equal(result.authorAccepted, false);
  const requests = [...f.records.values()].filter(
    (value) => value.jobId === newId && value.reusedFrom,
  );
  assert.ok(requests.length);
  assert.equal(f.calls.slice(count).filter((input) => input.scope.phase === 'reading').length, 1);
  assert.ok(f.calls.slice(count).some((input) => input.scope.phase === 'boundary'));
  assert.ok(f.calls.slice(count).some((input) => input.scope.phase === 'synthesis'));
});
test('recreated source IDs with identical text do not reuse another origin’s analysis', async () => {
  const f = await fixture(),
    newId = 'integration-successor-0002',
    count = f.calls.length;
  const old = structuredClone(f.records.get('books/book/chapters/one'));
  await f.db.runTransaction(async (tx) => {
    await tx.get(f.db.doc('books/book'));
    tx.delete(f.db.doc('books/book/chapters/one'));
    tx.update(f.db.doc('books/book'), { updatedAt: 500 });
  });
  await f.db.runTransaction(async (tx) => {
    await tx.get(f.db.doc('books/book'));
    tx.create(f.db.doc('books/book/chapters/one'), old);
  });
  const setup = await f.api.getLiteraryIntegrationSetup('author', command);
  await f.api.startLiteraryIntegration('author', { target, jobId: newId, ...setup });
  for (let step = 0; step < 200; step++) {
    const result = await f.api.advanceLiteraryIntegration('author', { target, jobId: newId });
    if (result.state === 'done') break;
  }
  assert.equal(
    f.calls
      .slice(count)
      .filter((input) => input.scope.phase === 'reading' && input.scope.chapterId === 'one').length,
    1,
  );
});
