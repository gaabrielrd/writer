import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiteraryAIService } from '../src/literaryAI.mjs';
import { literaryProseText } from '../src/literaryAIContext.mjs';
import { LITERARY_PLAN_SCHEMA } from '../src/literaryPlanningSchema.mjs';
import { workFixture, book, operation } from './workProgressFixtures.mjs';
function request(n = 1) {
  return {
    target: book,
    operationId: operation(n),
    mode: 'propose',
    expectedRevision: 0,
    sourcePlanIds: [],
    instruction: 'Prepare uma transformação íntima.',
    plan: {
      kind: 'bookOverview',
      title: 'A carta',
      status: 'working',
      fields: { question: 'Quem enviou a carta?' },
      references: [],
    },
  };
}
const answer = () => ({
  plan: {
    title: 'A carta',
    fields: { question: 'O que significa confiar?', transformation: 'Da suspeita à escolha.' },
  },
  rationale: 'Proposta a partir da intenção do autor.',
  findings: [
    {
      sourceId: 'draft',
      quote: 'A carta',
      problem: 'A promessa ainda pode ser especificada.',
      severity: 'suggestion',
      action: 'Explicitar o custo da descoberta.',
    },
  ],
});
test('proposal is recoverable, remains unapproved and does not debit or mutate prose', async () => {
  const f = workFixture();
  let calls = 0;
  const api = createLiteraryAIService({
    db: f.db,
    now: () => 500,
    generator: async () => {
      calls++;
      return answer();
    },
  });
  const result = await api.startLiteraryProposal('author', request());
  assert.equal(result.state, 'done');
  assert.equal(result.result.plan.status, 'proposal');
  assert.equal(result.result.coverage.wholeBook, false);
  assert.equal(f.records.has('books/book/literaryPlans/A carta'), false);
  assert.equal(f.records.get('books/book').wordCount, 999);
  assert.equal(f.records.get('books/book').status, 'published');
  assert.equal(f.records.has('users/author'), false);
  const replay = await api.startLiteraryProposal('author', request());
  assert.equal(replay.state, 'done');
  assert.equal(calls, 1);
  assert.equal(
    (await api.getLiteraryProposal('author', { target: book, operationId: operation(1) })).result
      .plan.status,
    'proposal',
  );
});
test('invented evidence fails the whole analysis and never becomes a saved plan', async () => {
  const f = workFixture();
  const api = createLiteraryAIService({
    db: f.db,
    now: () => 500,
    generator: async () => {
      const result = answer();
      result.findings[0].quote = 'Trecho que nunca existiu';
      return result;
    },
  });
  const result = await api.startLiteraryProposal('author', request());
  assert.equal(result.state, 'error');
  assert.equal('result' in result, false);
  assert.equal(
    [...f.records.keys()].some((path) => path.startsWith('books/book/literaryPlans/')),
    false,
  );
});
test('changed source plans invalidate result retrieval and repeat does not regenerate', async () => {
  const f = workFixture();
  let calls = 0;
  f.records.set('books/book/literaryPlans/source', {
    revision: 1,
    plan: { title: 'Fonte', kind: 'bookOverview', fields: {}, references: [], status: 'working' },
  });
  const api = createLiteraryAIService({
    db: f.db,
    now: () => 500,
    generator: async () => {
      calls++;
      return answer();
    },
  });
  const input = request();
  input.sourcePlanIds = ['source'];
  await api.startLiteraryProposal('author', input);
  f.records.set('books/book/literaryPlans/source', {
    revision: 2,
    plan: {
      title: 'Fonte atual',
      kind: 'bookOverview',
      fields: {},
      references: [],
      status: 'working',
    },
  });
  const result = await api.getLiteraryProposal('author', {
    target: book,
    operationId: input.operationId,
  });
  assert.equal(result.state, 'stale');
  assert.equal('result' in result, false);
  assert.equal(calls, 1);
});
test('an in-flight operation is queried without creating a second producer', async () => {
  const f = workFixture();
  let calls = 0,
    complete,
    claimed;
  const entered = new Promise((resolve) => {
    claimed = resolve;
  });
  const provider = new Promise((resolve) => {
    complete = resolve;
  });
  const api = createLiteraryAIService({
    db: f.db,
    now: () => 500,
    generator: async () => {
      calls++;
      claimed();
      return provider;
    },
  });
  const running = api.startLiteraryProposal('author', request());
  await entered;
  const repeated = await api.startLiteraryProposal('author', request());
  assert.equal(repeated.state, 'running');
  assert.equal(calls, 1);
  complete(answer());
  assert.equal((await running).state, 'done');
});
test('source budget refuses full oversized input instead of certifying a truncated read', async () => {
  const f = workFixture();
  let calls = 0;
  const api = createLiteraryAIService({
    db: f.db,
    now: () => 500,
    generator: async () => {
      calls++;
      return answer();
    },
  });
  for (let i = 0; i < 8; i++)
    f.records.set('books/book/literaryPlans/source-' + i, {
      revision: 1,
      plan: {
        kind: 'actTreatment',
        title: 'Fonte',
        status: 'working',
        references: [],
        fields: Object.fromEntries(
          Object.keys(LITERARY_PLAN_SCHEMA.actTreatment.fields).map((key) => [
            key,
            'A'.repeat(6000),
          ]),
        ),
      },
    });
  const input = request();
  input.sourcePlanIds = Array.from({ length: 8 }, (_, i) => 'source-' + i);
  await assert.rejects(api.startLiteraryProposal('author', input), { code: 'resource-exhausted' });
  assert.equal(calls, 0);
});
test('access is checked for every retrieval and private bodies are absent from listings', async () => {
  const f = workFixture();
  const api = createLiteraryAIService({
    db: f.db,
    now: () => 500,
    generator: async () => answer(),
  });
  await api.startLiteraryProposal('author', request());
  const page = await api.listLiteraryProposals('author', { target: book });
  assert.equal('result' in page.items[0], false);
  assert.equal('snapshot' in page.items[0], false);
  await assert.rejects(
    api.getLiteraryProposal('other', { target: book, operationId: operation(1) }),
    { code: 'not-found' },
  );
});
test('prose projection is inert and preserves literal visible evidence', () => {
  assert.equal(
    literaryProseText('<p>A &amp; B</p><script>segredo()</script><p>Outra linha.</p>'),
    'A & B\nOutra linha.\n',
  );
});

test('cancel fences an absent request and a delayed start cannot create a producer', async () => {
  const f = workFixture();
  let calls = 0;
  const api = createLiteraryAIService({
    db: f.db,
    now: () => 500,
    generator: async () => {
      calls++;
      return answer();
    },
  });
  const input = request();
  assert.equal(
    (await api.cancelLiteraryProposal('author', { target: book, operationId: input.operationId }))
      .state,
    'canceled',
  );
  assert.equal((await api.startLiteraryProposal('author', input)).state, 'canceled');
  assert.equal(calls, 0);
});
test('a canceled in-flight producer cannot publish a late result', async () => {
  const f = workFixture();
  let complete, claimed;
  const entered = new Promise((resolve) => {
    claimed = resolve;
  });
  const provider = new Promise((resolve) => {
    complete = resolve;
  });
  const api = createLiteraryAIService({
    db: f.db,
    now: () => 500,
    generator: async () => {
      claimed();
      return provider;
    },
  });
  const started = api.startLiteraryProposal('author', request());
  await entered;
  await api.cancelLiteraryProposal('author', { target: book, operationId: operation(1) });
  complete(answer());
  assert.equal((await started).state, 'canceled');
  assert.equal(f.records.get('books/book/literaryGenerations/' + operation(1)).state, 'canceled');
});

test('generation dependency metadata excludes source titles and detects a recreated support plan at the same revision', async () => {
  const f = workFixture(),
    input = request(870);
  input.sourcePlanIds = ['source'];
  f.records.set('books/book/literaryPlans/source', {
    revision: 1,
    plan: {
      kind: 'bookOverview',
      title: 'PRIVATE SUPPORT TITLE',
      status: 'working',
      fields: {},
      references: [],
    },
  });
  const api = createLiteraryAIService({
    db: f.db,
    now: () => 500,
    generator: async () => answer(),
  });
  const first = await api.startLiteraryProposal('author', input);
  assert.equal(first.state, 'done');
  const record = f.records.get('books/book/literaryGenerations/' + input.operationId);
  assert.ok(record.dependencies.plans[0].identityToken);
  assert.equal(JSON.stringify(record.dependencies).includes('PRIVATE'), false);
  f.metadata.set('books/book/literaryPlans/source', { createdAt: 700, updatedAt: 700 });
  const current = await api.getLiteraryProposal('author', {
    target: book,
    operationId: input.operationId,
  });
  assert.equal(current.state, 'stale');
  assert.equal('result' in current, false);
});

test('contract inference cannot introduce an operational collaboration permission through provider output', async () => {
  const f = workFixture();
  const api = createLiteraryAIService({
    db: f.db,
    now: () => 500,
    generator: async () => ({
      editorialContract: {
        schemaVersion: 1,
        fields: { premise: 'A carta' },
        decisions: [],
        collaborationPolicy: { version: 1, mode: 'continuous' },
      },
      rationale: 'Inferência',
      findings: [],
    }),
  });
  const result = await api.startLiteraryProposal('author', { ...request(), mode: 'contract' });
  assert.equal(result.state, 'error');
  assert.equal(f.records.has('books/book/literaryProduction/current'), false);
  assert.equal('result' in result, false);
});
