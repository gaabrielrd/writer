import test from 'node:test';
import assert from 'node:assert/strict';
import { studioDb } from './helpers/studioDb.mjs';
import { createLiteraryIntegrationService } from '../src/literaryIntegration.mjs';
import { createLiteraryIntegrationRecheckService } from '../src/literaryIntegrationRecheck.mjs';
import { createLiteraryFindingService } from '../src/literaryFindings.mjs';
import { createLiteraryProductionService } from '../src/literaryProduction.mjs';
import { emptyEditorialContract } from '../src/literaryContracts.mjs';
const target = { kind: 'book', id: 'book' },
  jobId = 'finding-integration-00001';
const op = (n) => 'finding-operation-' + String(n).padStart(5, '0');
async function finish(api, id = jobId) {
  for (let step = 0; step < 300; step++) {
    const result = await api.advanceLiteraryIntegration('author', { target, jobId: id });
    if (result.state === 'done') return result;
    assert.equal(['attention', 'stale', 'canceled'].includes(result.state), false);
  }
  throw new Error('Integration did not finish');
}
async function fixture({ contract = false } = {}) {
  const f = studioDb();
  f.records.set('books/book', {
    authorId: 'author',
    title: 'Livro',
    createdAt: 1,
    updatedAt: 100,
    wordCount: 6,
    status: 'draft',
  });
  f.records.set('users/author', { credits: 5 });
  f.records.set('books/book/chapters/one', {
    bookId: 'book',
    title: 'A carta',
    order: 1,
    content: '<p>Uma carta chegou.</p>',
    wordCount: 3,
    createdAt: 1,
    updatedAt: 100,
  });
  f.records.set('books/book/chapters/two', {
    bookId: 'book',
    title: 'A abertura',
    order: 2,
    content: '<p>Ela abriu a carta.</p>',
    wordCount: 4,
    createdAt: 1,
    updatedAt: 100,
  });
  const editorial = createLiteraryProductionService({ db: f.db, now: () => 200 });
  if (contract) {
    const value = emptyEditorialContract();
    value.fields.promise = 'A carta será aberta.';
    await editorial.saveLiteraryContract('author', {
      target,
      operationId: op(100),
      expectedRevision: 0,
      contract: value,
    });
  }
  const api = createLiteraryIntegrationService({
    db: f.db,
    now: () => 400,
    generator: async (input) => {
      if (input.scope.phase === 'synthesis')
        return { complete: true, report: 'Síntese.', findings: [], conclusions: [] };
      const source = input.documents[0];
      return {
        complete: true,
        report: 'Conferência.',
        matrix: [],
        findings:
          input.scope.phase === 'reading' && input.scope.chapterId === 'one'
            ? [
                {
                  severity: 'blocking',
                  problem: 'Conferir a escolha.',
                  action: 'Decidir com as fontes.',
                  evidence: [{ sourceId: source.id, quote: source.text.slice(0, 12) }],
                },
              ]
            : [],
      };
    },
  });
  await api.startLiteraryIntegration('author', {
    target,
    jobId,
    level: 'book',
    instruction: 'Confira a carta.',
  });
  const integrated = await finish(api);
  const sequence = await api.listLiteraryIntegrationResults('author', { target, jobId });
  const requestId = sequence.items.find((item) => item.kind === 'reading').requestId;
  const findings = createLiteraryFindingService({ db: f.db, now: () => 600 });
  const source = { target, jobId, requestId, findingIndex: 0 };
  return { ...f, api, editorial, findings, source, integrated };
}
const save = (f, action = 'retain', n = 1, expectedRevision = 0, correctionTarget = null) => ({
  ...f.source,
  operationId: op(n),
  expectedRevision,
  action,
  rationale: 'Decisão do autor com conferência das evidências.',
  correctionTarget,
});
test('an explicit retain decision is distinct from a correction, preserves raw findings and can be undone with CAS', async () => {
  const f = await fixture();
  assert.equal(f.integrated.blocking, 1);
  const first = save(f),
    receipt = await f.findings.saveLiteraryFindingDecision('author', first);
  const row = await f.findings.getLiteraryFindingDecision('author', { target, id: receipt.id });
  assert.equal(row.state, 'retained');
  assert.equal(row.effectiveRetention, true);
  assert.equal(row.correction, null);
  const progress = await f.api.getLiteraryIntegration('author', { target, jobId });
  assert.equal(progress.blocking, 1);
  assert.equal(progress.retainedBlocking, 1);
  assert.equal(progress.unresolvedBlocking, 0);
  assert.deepEqual(await f.findings.saveLiteraryFindingDecision('author', first), receipt);
  assert.equal(
    (await f.api.getLiteraryIntegration('author', { target, jobId })).retainedBlocking,
    1,
  );
  await f.api.acceptLiteraryIntegration('author', {
    target,
    jobId,
    expectedSourceToken: progress.sourceToken,
  });
  await assert.rejects(
    f.findings.saveLiteraryFindingDecision('author', save(f, 'investigate', 2, 0)),
    { code: 'failed-precondition' },
  );
  await f.findings.saveLiteraryFindingDecision('author', save(f, 'investigate', 2, 1));
  const reopened = await f.api.getLiteraryIntegration('author', { target, jobId });
  assert.equal(reopened.unresolvedBlocking, 1);
  assert.equal(reopened.authorAccepted, false);
  const old = await f.findings.getLiteraryFindingDecisionVersion('author', {
    target,
    id: receipt.id,
    revision: 1,
  });
  assert.equal(old.action, 'retain');
  assert.equal(old.historical, true);
  assert.equal(old.effectiveRetention, false);
});
test('rechecking the same fence still requires renewing specific retain decisions and does not reapply an old receipt', async () => {
  const f = await fixture(),
    input = save(f),
    saved = await f.findings.saveLiteraryFindingDecision('author', input);
  const recheck = createLiteraryIntegrationRecheckService({ db: f.db, now: () => 700 }),
    operationId = op(50);
  await recheck.startLiteraryIntegrationRecheck('author', {
    target,
    jobId,
    operationId,
    expectedSourceToken: f.integrated.sourceToken,
  });
  for (let step = 0; step < 200; step++) {
    const value = await recheck.advanceLiteraryIntegrationRecheck('author', {
      target,
      operationId,
    });
    if (value.state !== 'scanning') {
      assert.equal(value.state, 'done');
      break;
    }
  }
  assert.equal(
    (await f.findings.getLiteraryFindingDecision('author', { target, id: saved.id }))
      .effectiveRetention,
    false,
  );
  await f.findings.saveLiteraryFindingDecision('author', input);
  assert.equal(
    (await f.api.getLiteraryIntegration('author', { target, jobId })).retainedBlocking,
    0,
  );
  await f.findings.saveLiteraryFindingDecision('author', save(f, 'retain', 2, 1));
  assert.equal(
    (await f.api.getLiteraryIntegration('author', { target, jobId })).retainedBlocking,
    1,
  );
});
test('a note, an unchanged text and the original integration do not prove a correction', async () => {
  const f = await fixture(),
    saved = await f.findings.saveLiteraryFindingDecision(
      'author',
      save(f, 'correct', 1, 0, { kind: 'chapter', id: 'one', scopeId: 'book' }),
    );
  await assert.rejects(
    f.findings.confirmLiteraryFindingCorrection('author', {
      target,
      id: saved.id,
      operationId: op(2),
      expectedRevision: 1,
      successorJobId: jobId,
      note: 'Conferi.',
    }),
    { code: 'failed-precondition' },
  );
  assert.equal(
    [...f.records.keys()].filter((path) => path.startsWith('books/book/workVersions/')).length,
    0,
  );
  assert.equal(
    (await f.findings.getLiteraryFindingDecision('author', { target, id: saved.id })).state,
    'planned',
  );
});
test('a saved changed text and a fully read successor preserve a native version, with idempotent confirmation and no credit debit', async () => {
  const f = await fixture(),
    saved = await f.findings.saveLiteraryFindingDecision(
      'author',
      save(f, 'correct', 1, 0, { kind: 'chapter', id: 'one', scopeId: 'book' }),
    );
  await f.db.runTransaction(async (tx) => {
    await tx.get(f.db.doc('books/book'));
    tx.update(f.db.doc('books/book/chapters/one'), {
      content: '<p>Outra carta chegou.</p>',
      updatedAt: 500,
    });
    tx.update(f.db.doc('books/book'), { updatedAt: 500 });
  });
  const nextId = 'finding-integration-00002';
  await f.api.startLiteraryIntegration('author', {
    target,
    jobId: nextId,
    level: 'book',
    instruction: 'Confira a carta.',
  });
  const successor = await finish(f.api, nextId);
  const input = {
    target,
    id: saved.id,
    operationId: op(2),
    expectedRevision: 1,
    successorJobId: nextId,
    note: 'O autor conferiu a alteração salva e sua passagem.',
  };
  const confirmed = await f.findings.confirmLiteraryFindingCorrection('author', input);
  const row = await f.findings.getLiteraryFindingDecision('author', { target, id: saved.id });
  assert.equal(row.state, 'correctionConfirmed');
  assert.equal(row.confirmationCurrent, true);
  assert.ok(row.correction.versionId);
  assert.equal(row.correction.proofKind, 'text');
  assert.equal(f.records.get('users/author').credits, 5);
  assert.deepEqual(await f.findings.confirmLiteraryFindingCorrection('author', input), confirmed);
  assert.equal(
    [...f.records.keys()].filter((path) => path.startsWith('books/book/workVersions/')).length,
    1,
  );
  assert.equal((await f.api.getLiteraryIntegration('author', { target, jobId })).state, 'stale');
  assert.equal(
    successor.blocking,
    1,
    'confirmation does not suppress independent successor findings',
  );
  await assert.rejects(
    f.api.acceptLiteraryIntegration('author', {
      target,
      jobId: nextId,
      expectedSourceToken: successor.sourceToken,
    }),
    { code: 'failed-precondition' },
  );
  await f.db.runTransaction(async (tx) => {
    const root = (await tx.get(f.db.doc('books/book'))).data();
    tx.update(f.db.doc('books/book'), { historyRevision: (root.historyRevision ?? 0) + 1 });
    tx.update(f.db.doc('books/book/workVersions/' + row.correction.versionId), { deleting: true });
  });
  assert.equal(
    (await f.findings.getLiteraryFindingDecision('author', { target, id: saved.id }))
      .confirmationCurrent,
    false,
  );
});
test('an editorial correction must have an immutable changed revision actually included by the successor', async () => {
  const f = await fixture({ contract: true }),
    saved = await f.findings.saveLiteraryFindingDecision(
      'author',
      save(f, 'correct', 1, 0, { kind: 'contract', id: 'current', scopeId: 'book' }),
    );
  const next = emptyEditorialContract();
  next.fields.promise = 'A escolha de abrir a carta cobra um custo.';
  await f.editorial.saveLiteraryContract('author', {
    target,
    operationId: op(101),
    expectedRevision: 1,
    contract: next,
  });
  const successor = 'finding-integration-00003';
  await f.api.startLiteraryIntegration('author', {
    target,
    jobId: successor,
    level: 'book',
    instruction: 'Confira a carta.',
  });
  await finish(f.api, successor);
  await f.findings.confirmLiteraryFindingCorrection('author', {
    target,
    id: saved.id,
    operationId: op(2),
    expectedRevision: 1,
    successorJobId: successor,
    note: 'A orientação foi alterada e incluída na nova conferência.',
  });
  const row = await f.findings.getLiteraryFindingDecision('author', { target, id: saved.id });
  assert.equal(row.confirmationCurrent, true);
  assert.equal(row.correction.proofKind, 'editorial');
  assert.equal(row.correction.versionId, null);
});
test('ownership, source freshness and target scope are checked before any decision or receipt is written', async () => {
  const f = await fixture();
  await assert.rejects(f.findings.saveLiteraryFindingDecision('other', save(f)), {
    code: 'not-found',
  });
  await assert.rejects(
    f.findings.saveLiteraryFindingDecision(
      'author',
      save(f, 'correct', 1, 0, { kind: 'chapter', id: 'one', scopeId: 'other' }),
    ),
    { code: 'permission-denied' },
  );
  await f.db.runTransaction(async (tx) => {
    await tx.get(f.db.doc('books/book'));
    tx.update(f.db.doc('books/book'), { updatedAt: 999 });
  });
  await assert.rejects(f.findings.saveLiteraryFindingDecision('author', save(f)), {
    code: 'failed-precondition',
  });
  assert.equal(
    [...f.records.keys()].filter((path) => path.startsWith('books/book/literaryFindingDecisions/'))
      .length,
    0,
  );
});
