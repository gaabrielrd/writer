import test from 'node:test';
import assert from 'node:assert/strict';
import { workFixture, book, operation } from './workProgressFixtures.mjs';
import { createLiteraryPlanningService } from '../src/literaryPlanning.mjs';
import { createLiteraryPreparationService } from '../src/literaryPreparation.mjs';
import { createLiteraryProductionService } from '../src/literaryProduction.mjs';
import { LITERARY_GATE_CRITERIA } from '../src/literaryGateProtocol.mjs';
async function fixture() {
  const f = workFixture();
  f.records.set('books/book/chapters/chapter', {
    bookId: 'book',
    title: 'A carta',
    content: '<p>Ela abriu a carta.</p>',
    updatedAt: 100,
  });
  f.records.set('books/book/chapters/other', {
    bookId: 'book',
    title: 'Outro capítulo',
    content: '',
    updatedAt: 100,
  });
  const planning = createLiteraryPlanningService({ db: f.db, now: () => 300 });
  const references = await planning.listLiteraryReferences('author', {
    target: book,
    kind: 'chapter',
    purpose: 'subject',
  });
  const reference = references.items.find((item) => item.reference.id === 'chapter').reference;
  const plans = [
    {
      id: 'brief',
      kind: 'chapterBrief',
      fields: { function: 'A carta muda a confiança.', consequence: 'Ela decide partir.' },
    },
    {
      id: 'scenes',
      kind: 'scenePreparation',
      fields: {
        sequence: 'A carta chega; ela decide partir.',
        perception: 'Ela não sabe quem escreveu.',
      },
    },
    {
      id: 'world',
      kind: 'localWorldbuilding',
      fields: {
        sceneUse: 'A porta emperrada atrasa a saída.',
        constraints: 'A travessia depende da maré.',
      },
    },
  ];
  for (let i = 0; i < plans.length; i++) {
    const { id, ...plan } = plans[i];
    await planning.saveLiteraryPlan('author', {
      target: book,
      id,
      operationId: operation(i + 1),
      expectedRevision: 0,
      plan: { ...plan, title: id, status: 'working', references: [reference] },
    });
  }
  return {
    ...f,
    planning,
    api: createLiteraryPreparationService({ db: f.db, now: () => 400 }),
    production: createLiteraryProductionService({ db: f.db }),
    planIds: plans.map((plan) => plan.id),
  };
}
const request = (f) => ({ target: book, chapterId: 'chapter', planIds: f.planIds });
async function prepared(f) {
  const snapshot = await f.api.getLiteraryPreparationContext('author', request(f));
  const gate = {
    notes: 'Preparação conferida pelo autor.',
    authorAccepted: false,
    criteria: Object.keys(LITERARY_GATE_CRITERIA).map((id) => ({
      id,
      result: 'pass',
      rationale: 'A fonte apresenta a transformação.',
      evidence: [{ documentId: 'plan:brief', quote: 'A carta muda a confiança.' }],
    })),
  };
  return {
    ...request(f),
    operationId: operation(10),
    expectedRevision: 0,
    stateToken: snapshot.snapshot.stateToken,
    gate,
  };
}
test('preparation requires three matching documents of the actual chapter', async () => {
  const f = await fixture();
  await assert.rejects(
    f.api.getLiteraryPreparationContext('author', { ...request(f), planIds: ['brief', 'scenes'] }),
    { code: 'invalid-argument' },
  );
  await assert.rejects(
    f.api.getLiteraryPreparationContext('author', { ...request(f), chapterId: 'other' }),
    { code: 'failed-precondition' },
  );
  const value = await f.api.getLiteraryPreparationContext('author', request(f));
  assert.ok(value.documents.some((document) => document.id === 'plan:world'));
  assert.equal(value.snapshot.coverage.wholeBook, false);
});
test('evidence and author acceptance are persisted as distinct states with immutable versions', async () => {
  const f = await fixture(),
    input = await prepared(f);
  const result = await f.api.saveLiteraryPreparationGate('author', input);
  assert.equal(result.revision, 1);
  let current = await f.api.getLiteraryPreparationGate('author', {
    target: book,
    chapterId: 'chapter',
  });
  assert.equal(current.ready, true);
  assert.equal(current.authorAccepted, false);
  assert.equal(current.assessment, 'author');
  const accepted = {
    ...input,
    operationId: operation(11),
    expectedRevision: 1,
    gate: { ...input.gate, authorAccepted: true },
  };
  await f.api.saveLiteraryPreparationGate('author', accepted);
  current = await f.api.getLiteraryPreparationGate('author', {
    target: book,
    chapterId: 'chapter',
  });
  assert.equal(current.authorAccepted, true);
  const old = await f.api.getLiteraryPreparationGate('author', {
    target: book,
    chapterId: 'chapter',
    revision: 1,
  });
  assert.equal(old.gate.authorAccepted, false);
  assert.equal(f.records.get('books/book').status, 'published');
  assert.equal(f.records.get('books/book/chapters/chapter').content, '<p>Ela abriu a carta.</p>');
});
test('uncertain replay returns its original receipt and unchanged saves do not invent versions', async () => {
  const f = await fixture(),
    input = await prepared(f);
  const result = await f.api.saveLiteraryPreparationGate('author', input);
  assert.deepEqual(await f.api.saveLiteraryPreparationGate('author', input), result);
  const next = await f.api.saveLiteraryPreparationGate('author', {
    ...input,
    operationId: operation(12),
    expectedRevision: 1,
  });
  assert.equal(next.revision, 1);
  const outcome = await f.production.getLiteraryOperation('author', {
    target: book,
    operationId: operation(12),
  });
  assert.equal(outcome.kind, 'gate');
  assert.equal(outcome.noOp, true);
  assert.equal(
    (
      await f.api.listLiteraryPreparationGateVersions('author', {
        target: book,
        chapterId: 'chapter',
      })
    ).items.length,
    1,
  );
});
test('stale source vectors and forged quotations cannot be saved', async () => {
  const f = await fixture(),
    input = await prepared(f);
  const forged = structuredClone(input);
  forged.gate.criteria[0].evidence[0].quote = 'Um acontecimento que não existe.';
  await assert.rejects(f.api.saveLiteraryPreparationGate('author', forged), {
    code: 'invalid-argument',
  });
  const stored = await f.planning.getLiteraryPlan('author', { target: book, id: 'brief' });
  await f.planning.saveLiteraryPlan('author', {
    target: book,
    id: 'brief',
    operationId: operation(20),
    expectedRevision: 1,
    plan: { ...stored.plan, fields: { ...stored.plan.fields, consequence: 'Ela decide ficar.' } },
  });
  await assert.rejects(f.api.saveLiteraryPreparationGate('author', input), {
    code: 'failed-precondition',
  });
  assert.equal(f.records.has('books/book/literaryPreparationGates/chapter'), false);
});
test('source changes revoke readiness while keeping the historical assessment readable', async () => {
  const f = await fixture(),
    input = await prepared(f);
  await f.api.saveLiteraryPreparationGate('author', {
    ...input,
    gate: { ...input.gate, authorAccepted: true },
  });
  const stored = await f.planning.getLiteraryPlan('author', { target: book, id: 'brief' });
  await f.planning.saveLiteraryPlan('author', {
    target: book,
    id: 'brief',
    operationId: operation(20),
    expectedRevision: 1,
    plan: { ...stored.plan, fields: { ...stored.plan.fields, consequence: 'Ela decide ficar.' } },
  });
  const value = await f.api.getLiteraryPreparationGate('author', {
    target: book,
    chapterId: 'chapter',
  });
  assert.equal(value.current, false);
  assert.equal(value.ready, false);
  assert.equal(value.authorAccepted, false);
  assert.equal(value.recordedReady, true);
  assert.equal(value.recordedAuthorAccepted, true);
});
test('withdrawn origins are authorized by metadata before quotations are read', async () => {
  const f = await fixture(),
    input = await prepared(f);
  await f.api.saveLiteraryPreparationGate('author', input);
  f.records.delete('books/book/literaryPlans/brief');
  let bodyReads = 0;
  const db = {
    ...f.db,
    runTransaction: (work) =>
      f.db.runTransaction((tx) =>
        work({
          ...tx,
          get: (ref) => {
            if (ref.path === 'books/book/literaryPreparationGates/chapter') bodyReads += 1;
            return tx.get(ref);
          },
        }),
      ),
  };
  const reader = createLiteraryPreparationService({ db });
  await assert.rejects(
    reader.getLiteraryPreparationGate('author', { target: book, chapterId: 'chapter' }),
    { code: 'permission-denied' },
  );
  assert.equal(bodyReads, 0, 'revoked origins must be rejected before any unmasked gate read');
  assert.ok(
    f.metadataReads.some(
      (read) =>
        read.path === 'books/book/literaryPreparationGates/chapter' &&
        !read.fields.includes('gate'),
    ),
  );
});
test('other authors and deleting projects cannot inspect gate content', async () => {
  const f = await fixture();
  await assert.rejects(f.api.getLiteraryPreparationContext('other', request(f)), {
    code: 'not-found',
  });
  f.records.set('books/book', { ...f.records.get('books/book'), deleting: true });
  await assert.rejects(f.api.getLiteraryPreparationContext('author', request(f)), {
    code: 'not-found',
  });
});
