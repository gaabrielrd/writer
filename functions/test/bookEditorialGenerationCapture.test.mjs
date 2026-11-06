import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { studioDb } from './helpers/studioDb.mjs';
import { createLiteraryAIService } from '../src/literaryAI.mjs';
import { createLiteraryPlanningService } from '../src/literaryPlanning.mjs';
import { emptyEditorialContract } from '../src/literaryContracts.mjs';
import { createBookEditorialCaptureService } from '../src/bookEditorialCapture.mjs';
import { createBookEditorialRemapper } from '../src/bookEditorialRemap.mjs';
import { normalizeBookEditorialArtifact } from '../src/bookEditorialProtocol.mjs';
import { LITERARY_PLAN_SCHEMA } from '../src/literaryPlanFields.mjs';
const target = { kind: 'book', id: 'book' },
  operationId = 'capture-generation-request';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function fixture({
  mode = 'propose',
  external = false,
  support = false,
  long = false,
  chapter = false,
  aliases = false,
} = {}) {
  const f = studioDb(),
    reads = [];
  f.records.set('books/book', {
    authorId: 'author',
    title: 'Livro',
    status: 'draft',
    createdAt: 1,
    updatedAt: 10,
    wordCount: 0,
    ...(external ? { universeId: 'old-world' } : {}),
  });
  f.records.set('users/author', { credits: 10 });
  const planning = createLiteraryPlanningService({ db: f.db, now: () => 100 });
  const references = [];
  if (external) {
    f.records.set('universes/old-world', { authorId: 'author' });
    f.records.set('universes/old-world/lore/entity', {
      name: 'PRIVATE_EXTERNAL_LABEL',
      details: 'PRIVATE_EXTERNAL_BODY',
      revision: 1,
    });
    const page = await planning.listLiteraryReferences('author', { target, kind: 'globalLore' });
    references.push({ ...page.items[0].reference, scopeId: null });
  }
  if (chapter) {
    f.records.set('books/book/chapters/chapter', {
      bookId: 'book',
      title: 'A carta',
      content: '<p>PRIVATE_SOURCE_STORY mudou a casa.</p>',
      wordCount: 5,
      createdAt: 1,
      updatedAt: 10,
      order: 0,
    });
    const page = await planning.listLiteraryReferences('author', { target, kind: 'chapter' });
    const selected = page.items.find((item) => item.reference.id === 'chapter').reference;
    references.push(selected);
    if (aliases) references.push({ ...selected, scopeId: null });
  }
  if (support)
    await planning.saveLiteraryPlan('author', {
      target,
      id: 'support',
      operationId: 'capture-generation-support',
      expectedRevision: 0,
      plan: {
        kind: 'bookOverview',
        title: 'Apoio',
        status: 'working',
        fields: { question: 'Quem decide?' },
        references: [],
      },
    });
  const ai = createLiteraryAIService({
    db: f.db,
    now: () => 200,
    generator: (context) => {
      const source =
        mode === 'contract'
          ? context.documents.find((document) => document.id !== 'draft')
          : context.documents.find((document) => document.id === 'draft');
      const contract = emptyEditorialContract();
      contract.fields.premise = 'PRIVATE_INFERRED_PREMISE';
      contract.decisions = [
        { text: 'PRIVATE_PROPOSED_DECISION', category: 'hypothesis', status: 'proposal' },
      ];
      return Promise.resolve({
        plan: {
          title: 'PRIVATE_PROPOSED_TITLE',
          fields: { question: 'PRIVATE_PROPOSED_QUESTION' },
        },
        editorialContract: {
          schemaVersion: 1,
          fields: contract.fields,
          decisions: contract.decisions,
        },
        rationale: 'PRIVATE_AI_RATIONALE',
        findings: [
          {
            sourceId: source.id,
            quote: mode === 'contract' ? source.text.slice(0, 12) : 'A carta',
            problem: 'PRIVATE_AI_FINDING',
            action: 'Conferir a intenção.',
            severity: 'suggestion',
          },
        ],
      });
    },
  });
  const fields = long
    ? Object.fromEntries(
        Object.keys(LITERARY_PLAN_SCHEMA.bookOverview.fields).map((key) => [
          key,
          '\uFEFF' + '🕯'.repeat(2800) + '\r\n',
        ]),
      )
    : { question: 'A carta: PRIVATE_OWN_QUESTION' };
  const input = {
    target,
    operationId,
    mode,
    expectedRevision: 0,
    sourcePlanIds: support ? ['support'] : [],
    instruction: 'PRIVATE_OWN_INSTRUCTION',
    plan: { kind: 'bookOverview', title: 'A carta', status: 'working', fields, references },
  };
  const response = await ai.startLiteraryProposal('author', input);
  assert.equal(response.state, 'done');
  const db = {
    ...f.db,
    runTransaction: (callback) =>
      f.db.runTransaction((tx) =>
        callback({
          ...tx,
          get: async (resource) => {
            if (resource.path) reads.push(resource.path);
            return tx.get(resource);
          },
        }),
      ),
  };
  const api = createBookEditorialCaptureService({ db });
  async function wire(id = operationId) {
    const value = await api.getBookEditorialCaptureSource('author', { bookId: 'book' });
    const source = {
      bookId: 'book',
      bookSourceToken: value.bookSourceToken,
      editorialSourceToken: value.editorialSourceToken,
    };
    const page = await api.listBookEditorialCaptureRecords('author', {
      ...source,
      family: 'generation',
      limit: 20,
    });
    assert.equal(JSON.stringify(page).includes('PRIVATE'), false);
    return { ...source, family: 'generation', ...page.items.find((item) => item.id === id) };
  }
  return {
    ...f,
    reads,
    api,
    ai,
    planning,
    wire,
    input,
    path: 'books/book/literaryGenerations/' + operationId,
  };
}
async function read(f, wire) {
  const first = await f.api.readBookEditorialCaptureRecord('author', { ...wire, index: 0 });
  const parts = [Buffer.from(first.chunkBase64, 'base64')];
  for (let index = 1; index < first.chunkCount; index++) {
    const result = await f.api.readBookEditorialCaptureRecord('author', {
      ...wire,
      index,
      projectionToken: first.projectionToken,
    });
    const bytes = Buffer.from(result.chunkBase64, 'base64');
    assert.equal(hash(bytes), result.chunkHash);
    parts.push(bytes);
  }
  const bytes = Buffer.concat(parts);
  assert.equal(hash(bytes), first.contentHash);
  assert.equal(bytes.length, first.byteLength);
  return { first, bundle: JSON.parse(bytes.toString('utf8')) };
}
test('generation captures own input, unadopted proposal, selected-source report and quotes without changing the project or credits', async () => {
  const f = await fixture(),
    before = structuredClone([...f.records]);
  const { first, bundle } = await read(f, await f.wire()),
    artifacts = bundle.artifacts;
  assert.deepEqual([...f.records], before);
  assert.equal(first.recordCount, 6);
  const input = artifacts.find((item) => item.kind === 'plan' && item.provenance === 'author');
  const proposal = artifacts.find((item) => item.kind === 'plan' && item.provenance === 'ai');
  const report = artifacts.find((item) => item.kind === 'report'),
    evidence = artifacts.find((item) => item.kind === 'evidence');
  assert.equal(input.content.fields.question, 'A carta: PRIVATE_OWN_QUESTION');
  assert.equal(proposal.content.status, 'proposal');
  assert.equal(proposal.revision, null);
  assert.equal(proposal.lineage, undefined);
  assert.equal(proposal.generation.snapshot, 'historical');
  assert.equal(report.content.claimedCoverage.scope, 'selected-sources');
  assert.equal(
    report.content.claimedCoverage.total,
    f.records.get(f.path).snapshot.documents.length,
  );
  assert.equal(evidence.content.start, null);
  assert.equal(evidence.content.end, null);
  assert.equal(evidence.content.offsetUnit, 'not-recorded');
  assert.equal(evidence.content.context.offsetBase, null);
  assert.equal(evidence.content.context.documentId, 'draft');
  assert.equal(evidence.content.source.id, input.id);
  assert.equal(report.content.findings[0].evidenceIds[0], evidence.id);
  const checkpoint = artifacts.find((item) => item.kind === 'checkpoint');
  assert.equal(checkpoint.content.process, 'planning');
  assert.equal(checkpoint.content.controlsDisabled, true);
  assert.ok(
    checkpoint.content.references.some(
      (ref) => ref.id === proposal.id && ref.purpose === 'subject',
    ),
  );
});
test('audit preserves its input once and never fabricates a proposed replacement or active plan lineage', async () => {
  const f = await fixture({ mode: 'audit' }),
    { bundle } = await read(f, await f.wire());
  assert.equal(bundle.artifacts.filter((item) => item.kind === 'plan').length, 1);
  const input = bundle.artifacts.find((item) => item.kind === 'plan'),
    report = bundle.artifacts.find((item) => item.kind === 'report');
  assert.equal(input.lineage, undefined);
  assert.equal(input.revision, null);
  assert.ok(
    report.content.references.some((ref) => ref.id === input.id && ref.purpose === 'subject'),
  );
});
test('contract inference remains an unadopted contract containing only proposed decisions and no operational policies', async () => {
  const f = await fixture({ mode: 'contract' }),
    value = f.records.get(f.path);
  value.result.contractProposal.publicationPolicy = { bypass: true };
  value.result.contractProposal.collaborationPolicy = { autoApply: true };
  f.records.set(f.path, value);
  const { bundle } = await read(f, await f.wire()),
    contract = bundle.artifacts.find((item) => item.kind === 'contract');
  assert.equal(contract.content.fields.premise, 'PRIVATE_INFERRED_PREMISE');
  assert.equal(contract.revision, null);
  assert.equal(contract.lineage, undefined);
  assert.equal(contract.content.decisions[0].status, 'proposal');
  assert.equal(Object.hasOwn(contract.content, 'publicationPolicy'), false);
  assert.equal(Object.hasOwn(contract.content, 'collaborationPolicy'), false);
});
test('changed manuscript follows the same stale rule as native retrieval and never opens the original generation body', async () => {
  const f = await fixture({ chapter: true });
  f.records.set('books/book/chapters/chapter', {
    ...f.records.get('books/book/chapters/chapter'),
    content: '<p>Outro texto.</p>',
    updatedAt: 11,
  });
  const native = await f.ai.getLiteraryProposal('author', { target, operationId });
  assert.equal(native.state, 'stale');
  const wire = await f.wire();
  f.reads.length = 0;
  const { bundle } = await read(f, wire);
  assert.equal(f.reads.includes(f.path), false);
  assert.equal(JSON.stringify(bundle).includes('PRIVATE_OWN_INSTRUCTION'), true);
  assert.equal(JSON.stringify(bundle).includes('PRIVATE_AI_RATIONALE'), false);
  assert.equal(
    bundle.artifacts.find((item) => item.kind === 'report').availability.state,
    'unavailable',
  );
});
test('changed support plan preserves the author input but not its cached analysis', async () => {
  const f = await fixture({ support: true });
  await f.planning.saveLiteraryPlan('author', {
    target,
    id: 'support',
    operationId: 'capture-generation-support-new',
    expectedRevision: 1,
    plan: {
      kind: 'bookOverview',
      title: 'Outro apoio',
      status: 'working',
      fields: { question: 'Outra pergunta.' },
      references: [],
    },
  });
  const wire = await f.wire();
  f.reads.length = 0;
  const { bundle } = await read(f, wire);
  assert.equal(f.reads.includes(f.path), false);
  assert.equal(JSON.stringify(bundle).includes('PRIVATE_OWN_QUESTION'), true);
  assert.equal(JSON.stringify(bundle).includes('PRIVATE_PROPOSED_TITLE'), false);
});
test('revoked global context does not expose cached proposal, quotes or source labels', async () => {
  const f = await fixture({ external: true });
  f.records.set('universes/old-world', { authorId: 'other' });
  const wire = await f.wire();
  f.reads.length = 0;
  const { bundle } = await read(f, wire);
  assert.equal(f.reads.includes(f.path), false);
  const serialized = JSON.stringify(bundle);
  assert.equal(serialized.includes('PRIVATE_OWN_INSTRUCTION'), true);
  for (const secret of [
    'PRIVATE_AI_RATIONALE',
    'PRIVATE_AI_FINDING',
    'PRIVATE_EXTERNAL_BODY',
    'PRIVATE_EXTERNAL_LABEL',
  ])
    assert.equal(serialized.includes(secret), false);
});
for (const legacy of [false, true])
  test(
    'original universe scope survives link replacement without rebasing' +
      (legacy ? ' with legacy absent metadata' : ''),
    async () => {
      const f = await fixture({ external: true });
      f.records.set('books/book', { ...f.records.get('books/book'), universeId: 'new-world' });
      f.records.set('universes/new-world', { authorId: 'author' });
      f.records.set('universes/new-world/lore/entity', {
        name: 'New',
        details: 'Different',
        revision: 1,
      });
      if (legacy) {
        const value = f.records.get(f.path);
        delete value.dependencies;
        f.records.set(f.path, value);
      }
      const { bundle } = await read(f, await f.wire());
      const input = bundle.artifacts.find(
        (item) => item.kind === 'plan' && item.provenance === 'author',
      );
      assert.equal(input.content.references[0].scope.id, legacy ? null : 'old-world');
      assert.equal(input.content.references[0].state, 'unavailable');
    },
  );
for (const state of ['running', 'error', 'stale', 'canceled'])
  test(state + ' keeps only own inputs and disabled historical state', async () => {
    const f = await fixture();
    f.records.set(f.path, { ...f.records.get(f.path), state });
    const wire = await f.wire();
    f.reads.length = 0;
    const { bundle } = await read(f, wire);
    assert.equal(f.reads.includes(f.path), false);
    assert.equal(bundle.artifacts.find((item) => item.kind === 'checkpoint').content.phase, state);
    assert.equal(JSON.stringify(bundle).includes('PRIVATE_OWN_QUESTION'), true);
    assert.equal(JSON.stringify(bundle).includes('PRIVATE_AI_RATIONALE'), false);
  });
test('cancel-before-start produces only a historical planning marker with no invented draft', async () => {
  const f = await fixture(),
    id = 'capture-generation-cancel-stub';
  await f.ai.cancelLiteraryProposal('author', { target, operationId: id });
  const { bundle } = await read(f, await f.wire(id));
  assert.equal(bundle.artifacts.length, 1);
  assert.equal(bundle.artifacts[0].kind, 'checkpoint');
  assert.equal(bundle.artifacts[0].content.process, 'planning');
  assert.equal(bundle.artifacts[0].content.phase, 'canceled');
  assert.equal(bundle.artifacts[0].content.currentUnit, null);
  assert.deepEqual(bundle.artifacts[0].content.references, []);
});
test('unknown generation schema preserves own fields and emits explicit unsupported output without opening the cache', async () => {
  const f = await fixture();
  f.records.set(f.path, { ...f.records.get(f.path), schemaVersion: 99 });
  const wire = await f.wire();
  f.reads.length = 0;
  const { bundle } = await read(f, wire);
  assert.equal(f.reads.includes(f.path), false);
  assert.equal(JSON.stringify(bundle).includes('PRIVATE_OWN_QUESTION'), true);
  assert.equal(
    bundle.artifacts.find((item) => item.kind === 'report').availability.reason,
    'unsupported-legacy-schema',
  );
});
test('bounded transfers retain Unicode BOM and CRLF own fields and stop after source revocation', async () => {
  const f = await fixture({ long: true, external: true }),
    wire = await f.wire();
  const { first, bundle } = await read(f, wire);
  assert.ok(first.chunkCount > 1);
  const input = bundle.artifacts.find(
    (item) => item.kind === 'plan' && item.provenance === 'author',
  );
  assert.equal(input.content.fields.question, f.records.get(f.path).request.plan.fields.question);
  f.records.set('universes/old-world', { authorId: 'other' });
  await assert.rejects(
    f.api.readBookEditorialCaptureRecord('author', {
      ...wire,
      index: 1,
      projectionToken: first.projectionToken,
    }),
  );
  await assert.rejects(
    f.api.verifyBookEditorialCaptureRecord('author', {
      ...wire,
      projectionToken: first.projectionToken,
    }),
  );
});
test('a corrupt quote cannot become archived evidence', async () => {
  const f = await fixture(),
    value = f.records.get(f.path);
  value.result.findings[0].quote = 'Never supplied';
  f.records.set(f.path, value);
  await assert.rejects(read(f, await f.wire()), { code: 'failed-precondition' });
});
test('contract-mode draft citations and approved inferred decisions are rejected rather than upgraded', async () => {
  for (const kind of ['draft-evidence', 'approved']) {
    const f = await fixture({ mode: 'contract' }),
      value = f.records.get(f.path);
    if (kind === 'draft-evidence')
      value.result.findings[0] = {
        ...value.result.findings[0],
        sourceId: 'draft',
        quote: 'A carta',
      };
    else value.result.contractProposal.decisions[0].status = 'approved';
    f.records.set(f.path, value);
    await assert.rejects(read(f, await f.wire()), { code: 'failed-precondition' });
  }
});
test('unknown offsets remain null even for repeated quotations or a spurious cached offset', async () => {
  const f = await fixture(),
    value = f.records.get(f.path);
  value.result.findings[0].offset = 999;
  f.records.set(f.path, value);
  const { bundle } = await read(f, await f.wire()),
    evidence = bundle.artifacts.find((item) => item.kind === 'evidence');
  assert.equal(evidence.content.start, null);
  assert.equal(evidence.content.context.offsetBase, null);
  assert.equal(normalizeBookEditorialArtifact(evidence).content.offsetUnit, 'not-recorded');
  assert.throws(() =>
    normalizeBookEditorialArtifact({
      ...evidence,
      content: { ...evidence.content, context: { ...evidence.content.context, offsetBase: 0 } },
    }),
  );
});
test('credentials, source proofs and operational fields never enter the bundle', async () => {
  const f = await fixture(),
    value = f.records.get(f.path);
  value.request.generation.apiKey = 'PRIVATE_KEY';
  value.message = 'PRIVATE_DIAGNOSTIC';
  f.records.set(f.path, value);
  const { bundle } = await read(f, await f.wire()),
    serialized = JSON.stringify(bundle);
  for (const forbidden of [
    'PRIVATE_KEY',
    'PRIVATE_DIAGNOSTIC',
    '"proofToken"',
    '"sourceToken"',
    '"identityToken"',
    '"bodyToken"',
    '"expectedRevision"',
    '"operationId"',
    '"fingerprint"',
  ])
    assert.equal(serialized.includes(forbidden), false);
});
test('another owner cannot inspect the generation header or original cache', async () => {
  const f = await fixture(),
    wire = await f.wire();
  f.records.set('books/book', { ...f.records.get('books/book'), authorId: 'other' });
  f.reads.length = 0;
  await assert.rejects(read(f, wire));
  assert.equal(f.reads.includes(f.path), false);
});
test('recreated generation records have distinct portable identities', async () => {
  const f = await fixture(),
    before = await read(f, await f.wire());
  f.metadata.set(f.path, { createdAt: 33333, updatedAt: 33334 });
  const after = await read(f, await f.wire());
  assert.notEqual(before.bundle.artifacts[0].id, after.bundle.artifacts[0].id);
});
test('restored analysis remaps its evidence and proposal while remaining private and disabled', async () => {
  const f = await fixture(),
    { bundle } = await read(f, await f.wire());
  const mapper = createBookEditorialRemapper({
    sourceBookId: 'book',
    bookId: 'copy',
    hashBytes: hash,
    mapResource: (kind, id) => 'copy-' + kind + '-' + id,
  });
  const report = bundle.artifacts.find((item) => item.kind === 'report'),
    evidence = bundle.artifacts.find((item) => item.kind === 'evidence');
  const mapped = mapper.artifact(report),
    next = mapper.artifact(evidence);
  assert.equal(mapped.record.content.findings[0].evidenceIds[0], next.record.id);
  assert.deepEqual(next.record.content.context, evidence.content.context);
  assert.equal(mapped.restoration.execution, 'disabled');
  assert.equal(mapped.restoration.publication, 'private');
});

test('only exact nullable/current-book aliases are consolidated after resolving original scope', async () => {
  const f = await fixture({ chapter: true, aliases: true });
  assert.equal(f.records.get(f.path).request.plan.references.length, 2);
  const { bundle } = await read(f, await f.wire());
  const input = bundle.artifacts.find(
    (item) => item.kind === 'plan' && item.provenance === 'author',
  );
  assert.equal(input.content.references.length, 1);
  assert.equal(input.content.references[0].scope.id, 'book');
});
test('a replaced root birth cannot relabel original support-plan identities as resources of the new incarnation', async () => {
  const f = await fixture({ support: true }),
    before = await read(f, await f.wire());
  const original = before.bundle.artifacts.find((item) => item.kind === 'document').content
    .references[1];
  f.metadata.set('books/book', { createdAt: 44444, updatedAt: 44445 });
  const { bundle } = await read(f, await f.wire());
  const preserved = bundle.artifacts.find((item) => item.kind === 'document').content.references[1];
  assert.equal(preserved.id, original.id);
  assert.equal(preserved.state, 'unavailable');
  assert.equal(
    bundle.artifacts.find((item) => item.kind === 'report').availability.state,
    'unavailable',
  );
});

test('an absent legacy source proof preserves own inputs but cannot authorize opening the original cache', async () => {
  const f = await fixture(),
    value = f.records.get(f.path);
  delete value.snapshot.proofToken;
  f.records.set(f.path, value);
  const wire = await f.wire();
  f.reads.length = 0;
  const { bundle } = await read(f, wire);
  assert.equal(f.reads.includes(f.path), false);
  assert.equal(JSON.stringify(bundle).includes('PRIVATE_OWN_QUESTION'), true);
  assert.equal(
    bundle.artifacts.find((item) => item.kind === 'report').availability.reason,
    'unsupported-legacy-schema',
  );
});
