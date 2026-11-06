import { createLiteraryProductionService } from '../src/literaryProduction.mjs';
import { createLiteraryPlanningService } from '../src/literaryPlanning.mjs';
import { emptyEditorialContract } from '../src/literaryContracts.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { studioDb } from './helpers/studioDb.mjs';
import { createScenesService } from '../src/scenes.mjs';
import { createLiteraryProseService } from '../src/literaryProse.mjs';
import { createBookEditorialCaptureService } from '../src/bookEditorialCapture.mjs';
import {
  normalizeBookEditorialArtifact,
  normalizeBookEditorialReading,
} from '../src/bookEditorialProtocol.mjs';
import { createBookEditorialRemapper } from '../src/bookEditorialRemap.mjs';
const target = { kind: 'book', id: 'book' },
  requestId = 'capture-prose-request';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function fixture({
  mode = 'reviseScene',
  content = '<p>Ela recebeu a carta. 🌙</p>',
  segment = 0,
  findings = true,
  previous = false,
  external = false,
  findingSource = 'manuscript',
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
  });
  f.records.set('users/author', { credits: 10 });
  const scenes = createScenesService({ db: f.db, now: () => 100 });
  const chapter = await scenes.createSceneGroup('author', {
    target,
    operationId: 'capture-prose-chapter',
    title: 'Carta',
  });
  const prior = previous
    ? await scenes.createScene('author', {
        target,
        parentId: chapter.id,
        operationId: 'capture-prose-previous',
        title: 'Anterior',
        content: '<p>PRIVATE_PREVIOUS_SOURCE</p>',
        planning: {},
      })
    : null;
  const created = await scenes.createScene('author', {
    target,
    parentId: chapter.id,
    operationId: 'capture-prose-scene',
    title: 'Decisão',
    content,
    planning: {},
  });
  if (external) {
    f.records.set('books/book', { ...f.records.get('books/book'), universeId: 'world' });
    f.records.set('universes/world', { authorId: 'author' });
    f.records.set('universes/world/lore/entity', {
      name: 'PRIVATE_EXTERNAL_LABEL',
      details: 'PRIVATE_EXTERNAL_BODY',
      revision: 1,
    });
    await createLiteraryProductionService({ db: f.db, now: () => 120 }).saveLiteraryContract(
      'author',
      {
        target,
        operationId: 'capture-prose-contract',
        expectedRevision: 0,
        contract: emptyEditorialContract(),
      },
    );
    const planning = createLiteraryPlanningService({ db: f.db, now: () => 130 });
    const references = await planning.listLiteraryReferences('author', {
      target,
      kind: 'globalLore',
    });
    await planning.saveLiteraryPlan('author', {
      target,
      id: 'linked',
      operationId: 'capture-prose-plan',
      expectedRevision: 0,
      plan: {
        kind: 'chapterBrief',
        title: 'Intenção própria',
        status: 'working',
        fields: { function: 'Revelação e consequência.' },
        references: [references.items[0].reference],
      },
    });
  }
  const prose = createLiteraryProseService({
    db: f.db,
    now: () => 200,
    generator: (context) => {
      const source = context.documents.find((document) => document.id === findingSource);
      return Promise.resolve({
        complete: true,
        text: mode.startsWith('review') ? '' : 'Ela abriu a carta. 🌙',
        rationale: 'PRIVATE_REPORT_REASON',
        findings: findings
          ? [
              {
                sourceId: findingSource,
                quote: source.text.slice(0, 12),
                problem: 'PRIVATE_FINDING',
                severity: 'warning',
                action: 'Conferir intenção.',
              },
            ]
          : [],
      });
    },
  });
  const info = await prose.getLiteraryProseSourceInfo('author', {
    target,
    chapterId: chapter.id,
    sceneId: created.scene.id,
  });
  await prose.startLiteraryProse('author', {
    target,
    requestId,
    chapterId: chapter.id,
    sceneId: created.scene.id,
    expectedSourceToken: info.sourceToken,
    mode,
    segment,
    instruction: 'PRIVATE_AUTHOR_INSTRUCTION',
    ...(external ? { planIds: ['linked'] } : {}),
  });
  const db = {
    ...f.db,
    runTransaction(callback) {
      return f.db.runTransaction((tx) =>
        callback({
          ...tx,
          get: async (resource) => {
            if (resource.path) reads.push(resource.path);
            return tx.get(resource);
          },
        }),
      );
    },
  };
  const api = createBookEditorialCaptureService({ db });
  const source = async () => {
    const value = await api.getBookEditorialCaptureSource('author', { bookId: 'book' });
    return {
      bookId: 'book',
      bookSourceToken: value.bookSourceToken,
      editorialSourceToken: value.editorialSourceToken,
    };
  };
  const wire = async (id = requestId) => {
    const origin = await source(),
      page = await api.listBookEditorialCaptureRecords('author', {
        ...origin,
        family: 'prose',
        limit: 10,
      });
    assert.equal(JSON.stringify(page).includes('PRIVATE'), false);
    return { ...origin, family: 'prose', ...page.items.find((item) => item.id === id) };
  };
  return {
    ...f,
    api,
    prose,
    scenes,
    reads,
    wire,
    source,
    chapterId: chapter.id,
    sceneId: created.scene.id,
    previousSceneId: prior?.scene.id ?? null,
    path: 'books/book/literaryProseRequests/' + requestId,
  };
}
async function read(f, wire) {
  const first = await f.api.readBookEditorialCaptureRecord('author', { ...wire, index: 0 });
  const parts = [Buffer.from(first.chunkBase64, 'base64')];
  for (let index = 1; index < first.chunkCount; index++) {
    const part = await f.api.readBookEditorialCaptureRecord('author', {
      ...wire,
      index,
      projectionToken: first.projectionToken,
    });
    const bytes = Buffer.from(part.chunkBase64, 'base64');
    assert.equal(hash(bytes), part.chunkHash);
    parts.push(bytes);
  }
  const bytes = Buffer.concat(parts);
  assert.equal(hash(bytes), first.contentHash);
  return { first, bundle: JSON.parse(bytes.toString('utf8')) };
}
test('native prose capture preserves own instruction, original source, proposal, report and exact evidence without changing manuscript or credits', async () => {
  const f = await fixture();
  f.records.set(f.path, {
    ...f.records.get(f.path),
    paid: true,
    executionBinding: { secret: 'PRIVATE_CONTROL' },
    generation: { ...f.records.get(f.path).generation, apiKey: 'PRIVATE_CREDENTIAL' },
  });
  const wire = await f.wire(),
    before = structuredClone([...f.records]);
  const { first, bundle } = await read(f, wire),
    artifacts = bundle.artifacts;
  assert.equal(first.payload, 'editorial-bundle');
  assert.equal(first.recordCount, 6);
  assert.deepEqual([...f.records], before);
  assert.equal(
    artifacts.find((item) => item.kind === 'document').content.sections[1].text,
    'PRIVATE_AUTHOR_INSTRUCTION',
  );
  assert.equal(
    artifacts.find((item) => item.kind === 'prose' && item.content.role === 'saved-copy').content
      .text,
    f.records.get(f.path).sourceText,
  );
  const proposal = artifacts.find(
    (item) => item.kind === 'prose' && item.content.role === 'proposal',
  );
  assert.equal(proposal.content.text, 'Ela abriu a carta. 🌙');
  assert.equal(proposal.generation.snapshot, 'historical');
  const report = artifacts.find((item) => item.kind === 'report'),
    evidence = artifacts.find((item) => item.kind === 'evidence');
  assert.equal(report.content.findings[0].evidenceIds[0], evidence.id);
  assert.equal(evidence.content.start, f.records.get(f.path).result.findings[0].offset);
  assert.equal(evidence.content.end, evidence.content.start + evidence.content.quote.length);
  assert.deepEqual(evidence.content.context, {
    format: 'plain',
    documentId: 'manuscript',
    offsetBase: 0,
  });
  assert.equal(evidence.content.classification, 'unclassified');
  assert.equal(report.content.claimedCoverage.scope, 'unit');
  const checkpoint = artifacts.find((item) => item.kind === 'checkpoint');
  assert.equal(checkpoint.content.controlsDisabled, true);
  assert.ok(
    checkpoint.content.references.some(
      (reference) => reference.id === proposal.id && reference.purpose === 'subject',
    ),
  );
  assert.ok(report.content.references.some((reference) => reference.id === proposal.id));
  assert.ok(checkpoint.content.references.some((reference) => reference.id === artifacts[0].id));
  const serialized = JSON.stringify(bundle);
  for (const field of [
    'sourceToken',
    'originToken',
    'assemblyToken',
    'paid',
    'applyCost',
    'applicable',
    'maxCredits',
    'apiKey',
    'executionBinding',
  ])
    assert.equal(serialized.includes('"' + field + '"'), false);
});
test('a review of one later segment preserves absolute offsets and never claims the entire scene chapter or book', async () => {
  const f = await fixture({
    mode: 'reviewStructure',
    content: '<p>' + 'Uma carta muda a casa. '.repeat(1800) + '</p>',
    segment: 1,
  });
  const { bundle } = await read(f, await f.wire()),
    report = bundle.artifacts.find((item) => item.kind === 'report');
  assert.equal(report.content.claimedCoverage.scope, 'excerpt');
  assert.equal(report.content.reading.segment, 1);
  assert.equal(report.content.reading.completeScene, false);
  assert.ok(report.content.reading.start > 0);
  assert.equal(report.content.claimedCoverage.total, f.records.get(f.path).coverage.segmentCount);
  assert.equal(
    bundle.artifacts.some((item) => item.kind === 'prose' && item.content?.role === 'proposal'),
    false,
  );
  const evidence = bundle.artifacts.find((item) => item.kind === 'evidence');
  assert.ok(evidence.content.start >= report.content.reading.start);
  assert.equal(evidence.content.context.offsetBase, report.content.reading.start);
});
test('a revoked scene keeps the author instruction but never opens or exports the cached protected response', async () => {
  const f = await fixture();
  f.records.delete('books/book/scenes/' + f.sceneId);
  const wire = await f.wire();
  f.reads.length = 0;
  const { bundle } = await read(f, wire),
    serialized = JSON.stringify(bundle);
  assert.equal(f.reads.includes(f.path), false);
  assert.equal(serialized.includes('PRIVATE_AUTHOR_INSTRUCTION'), true);
  assert.equal(serialized.includes('PRIVATE_REPORT_REASON'), false);
  assert.equal(serialized.includes('PRIVATE_FINDING'), false);
  assert.equal(
    bundle.artifacts.find((item) => item.kind === 'report').availability.reason,
    'source-revoked',
  );
  const checkpoint = bundle.artifacts.find((item) => item.kind === 'checkpoint');
  const redactedProse = bundle.artifacts.filter((item) => item.kind === 'prose');
  assert.equal(redactedProse.length, 2);
  const roles = redactedProse
    .map(
      (item) => checkpoint.content.references.find((reference) => reference.id === item.id).purpose,
    )
    .sort();
  assert.deepEqual(roles, ['source', 'subject']);
});
test('unknown manifests remain explicit and do not open the cached source even when its owned instruction survives', async () => {
  const f = await fixture(),
    record = f.records.get(f.path);
  f.records.set(f.path, { ...record, manifest: { ...record.manifest, version: 99 } });
  const wire = await f.wire();
  f.reads.length = 0;
  const { bundle } = await read(f, wire);
  assert.equal(f.reads.includes(f.path), false);
  assert.equal(
    bundle.artifacts.find((item) => item.kind === 'report').availability.reason,
    'unsupported-legacy-schema',
  );
});
test('a changed source version preserves the historical proposal without rebasing its reference onto the new manuscript', async () => {
  const f = await fixture();
  const path = 'books/book/scenes/' + f.sceneId,
    value = f.records.get(path);
  f.records.set(path, { ...value, revision: value.revision + 1 });
  const { bundle } = await read(f, await f.wire());
  const original = bundle.artifacts.find(
    (item) => item.kind === 'prose' && item.content.role === 'saved-copy',
  );
  assert.equal(original.content.source.state, 'unavailable');
  assert.equal(original.content.source.revision, value.revision);
  assert.equal(
    bundle.artifacts.find((item) => item.kind === 'prose' && item.content.role === 'proposal')
      .content.text,
    'Ela abriu a carta. 🌙',
  );
});
for (const state of ['running', 'canceled', 'stale', 'revoked'])
  test('historical ' + state + ' never revives result bodies or execution controls', async () => {
    const f = await fixture();
    f.records.set(f.path, { ...f.records.get(f.path), state });
    const wire = await f.wire();
    f.reads.length = 0;
    const { bundle } = await read(f, wire);
    assert.equal(f.reads.includes(f.path), false);
    assert.equal(bundle.artifacts.find((item) => item.kind === 'checkpoint').content.phase, state);
    assert.equal(JSON.stringify(bundle).includes('PRIVATE_REPORT_REASON'), false);
  });
test('an error without a generated result retains the authorized original segment and an explicit unavailable report', async () => {
  const f = await fixture(),
    value = f.records.get(f.path);
  delete value.result;
  f.records.set(f.path, { ...value, state: 'error', message: 'PRIVATE_ERROR_DIAGNOSTIC' });
  const { bundle } = await read(f, await f.wire());
  assert.equal(
    bundle.artifacts.find((item) => item.kind === 'report').availability.reason,
    'not-recorded',
  );
  assert.ok(
    bundle.artifacts.some((item) => item.kind === 'prose' && item.content?.role === 'saved-copy'),
  );
  assert.equal(JSON.stringify(bundle).includes('PRIVATE_ERROR_DIAGNOSTIC'), false);
});
test('corrupt cached offsets cannot be recast as valid historical quotations', async () => {
  const f = await fixture(),
    value = f.records.get(f.path);
  value.result.findings[0].offset += 1;
  f.records.set(f.path, value);
  await assert.rejects(read(f, await f.wire()), { code: 'failed-precondition' });
});
test('the next bounded part and final verification reject revoked origins instead of trusting an earlier projection', async () => {
  const f = await fixture({
    content: '<p>' + 'Literal 🌙 '.repeat(5000) + '</p>',
    findings: false,
  });
  const wire = await f.wire(),
    first = await f.api.readBookEditorialCaptureRecord('author', { ...wire, index: 0 });
  assert.ok(first.chunkCount > 1);
  f.records.delete('books/book/scenes/' + f.sceneId);
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
test('recreating the source under the same ID does not authorize the old proposal', async () => {
  const f = await fixture();
  f.metadata.set('books/book/scenes/' + f.sceneId, { createdAt: 123456, updatedAt: 123457 });
  const { bundle } = await read(f, await f.wire());
  assert.equal(
    bundle.artifacts.find((item) => item.kind === 'report').availability.reason,
    'source-revoked',
  );
});
test('the private root is reauthorized before inspecting a prose header or body', async () => {
  const f = await fixture(),
    wire = await f.wire();
  f.records.set('books/book', { ...f.records.get('books/book'), authorId: 'other' });
  f.reads.length = 0;
  await assert.rejects(read(f, wire));
  assert.equal(f.reads.includes(f.path), false);
});
const covered = {
  unit: 'scene',
  sourceCharacters: 40,
  segment: 1,
  segmentCount: 2,
  start: 12,
  coreStart: 14,
  coreEnd: 22,
  end: 24,
  completeScene: false,
  previousSceneIncluded: false,
};
test('portable reading rejects tokens and incoherent bounds, segments, booleans and completeness', () => {
  assert.deepEqual(normalizeBookEditorialReading(covered), covered);
  for (const patch of [
    { sourceToken: 'a'.repeat(64) },
    { start: 15 },
    { end: 41 },
    { coreEnd: 30 },
    { segment: 2 },
    { segmentCount: 0 },
    { coreStart: 22 },
    { previousSceneIncluded: 1 },
    { completeScene: true },
    { unit: 'book' },
  ])
    assert.throws(() => normalizeBookEditorialReading({ ...covered, ...patch }));
});
test('saved segment text preserves UTF8 BOM and CRLF with UTF16 lengths while rejecting incompatible extents', () => {
  const text = '\uFEFFliteral 🌙\r\n',
    reading = {
      ...covered,
      start: 0,
      coreStart: 0,
      coreEnd: text.length,
      end: text.length,
      sourceCharacters: text.length,
      completeScene: true,
      segment: 0,
      segmentCount: 1,
    };
  const artifact = {
    schemaVersion: 1,
    id: 'a'.repeat(64),
    kind: 'prose',
    revision: null,
    createdAt: null,
    updatedAt: null,
    provenance: 'unknown',
    availability: { state: 'included' },
    content: { role: 'saved-copy', format: 'plain', text, rationale: '', source: null, reading },
  };
  assert.equal(normalizeBookEditorialArtifact(artifact).content.text, text);
  assert.throws(() =>
    normalizeBookEditorialArtifact({
      ...artifact,
      content: { ...artifact.content, reading: covered },
    }),
  );
});

test('reading metadata cannot promote a segmented report into a claim of chapter or book coverage', async () => {
  const f = await fixture(),
    { bundle } = await read(f, await f.wire());
  const report = bundle.artifacts.find((item) => item.kind === 'report');
  for (const scope of ['chapter', 'book', 'act', 'unknown'])
    assert.throws(() =>
      normalizeBookEditorialArtifact({
        ...report,
        content: {
          ...report.content,
          claimedCoverage: { ...report.content.claimedCoverage, scope },
        },
      }),
    );
});
test('a copied proposal report remaps its own evidence and keeps segment bounds with all execution disabled', async () => {
  const f = await fixture(),
    { bundle } = await read(f, await f.wire());
  const mapper = createBookEditorialRemapper({
    sourceBookId: 'book',
    bookId: 'copy',
    hashBytes: hash,
    mapResource: (kind, id) => 'copy-' + kind + '-' + id,
  });
  const evidence = bundle.artifacts.find((item) => item.kind === 'evidence'),
    report = bundle.artifacts.find((item) => item.kind === 'report');
  const next = mapper.artifact(report),
    mappedEvidence = mapper.artifact(evidence);
  assert.deepEqual(next.record.content.reading, report.content.reading);
  assert.equal(next.record.content.findings[0].evidenceIds[0], mappedEvidence.record.id);
  assert.deepEqual(mappedEvidence.record.content.context, evidence.content.context);
  assert.deepEqual(next.restoration, {
    execution: 'disabled',
    publication: 'private',
    review: 'required',
    historical: true,
  });
});
test('recreated requests obtain distinct portable artifact identities instead of inheriting the old archival record', async () => {
  const f = await fixture(),
    original = await read(f, await f.wire());
  f.metadata.set(f.path, { createdAt: 876543, updatedAt: 876544 });
  const next = await read(f, await f.wire());
  assert.notEqual(original.bundle.artifacts[0].id, next.bundle.artifacts[0].id);
});

test('revocation of an original global source hides its derived proposal even when the scene remains owned', async () => {
  const f = await fixture({ external: true });
  f.records.set('universes/world', { authorId: 'other' });
  const wire = await f.wire();
  f.reads.length = 0;
  const { bundle } = await read(f, wire);
  assert.equal(f.reads.includes(f.path), false);
  assert.equal(JSON.stringify(bundle).includes('PRIVATE_AUTHOR_INSTRUCTION'), true);
  assert.equal(JSON.stringify(bundle).includes('PRIVATE_REPORT_REASON'), false);
  assert.equal(
    bundle.artifacts.find((item) => item.kind === 'report').availability.reason,
    'source-revoked',
  );
});
test('a plan quotation uses its original typed archival identity without exporting the frozen global document', async () => {
  const f = await fixture({ external: true, findingSource: 'plan:linked' });
  const { bundle } = await read(f, await f.wire()),
    evidence = bundle.artifacts.find((item) => item.kind === 'evidence');
  assert.equal(evidence.content.source.kind, 'artifact');
  assert.equal(evidence.content.source.state, 'recorded');
  assert.equal(evidence.content.context.documentId, 'plan:linked');
  assert.equal(evidence.content.context.offsetBase, 0);
  assert.equal(evidence.content.source.revision, 1);
  assert.equal(evidence.content.source.contentHash, null);
  assert.equal(JSON.stringify(bundle).includes('PRIVATE_EXTERNAL_BODY'), false);
});
test('a revoked previous scene hides the result whose frozen context included that scene', async () => {
  const f = await fixture({ previous: true });
  assert.ok(f.previousSceneId);
  f.records.delete('books/book/scenes/' + f.previousSceneId);
  const wire = await f.wire();
  f.reads.length = 0;
  const { bundle } = await read(f, wire);
  assert.equal(f.reads.includes(f.path), false);
  assert.equal(JSON.stringify(bundle).includes('PRIVATE_REPORT_REASON'), false);
  assert.equal(
    bundle.artifacts.find((item) => item.kind === 'report').availability.reason,
    'source-revoked',
  );
});
test('removing the original chapter prevents reading the derived result under an otherwise owned scene ID', async () => {
  const f = await fixture();
  f.records.delete('books/book/chapters/' + f.chapterId);
  const wire = await f.wire();
  f.reads.length = 0;
  const { bundle } = await read(f, wire);
  assert.equal(f.reads.includes(f.path), false);
  assert.equal(
    bundle.artifacts.find((item) => item.kind === 'report').availability.reason,
    'source-revoked',
  );
});

test('evidence context cannot add grants, HTML offsets or a base after the quoted supplied text', () => {
  const value = {
    schemaVersion: 1,
    id: 'b'.repeat(64),
    kind: 'evidence',
    revision: null,
    createdAt: null,
    updatedAt: null,
    provenance: 'ai',
    availability: { state: 'included' },
    content: {
      source: {
        kind: 'scene',
        id: 'scene',
        parentId: null,
        scope: { kind: 'book', id: 'book' },
        revision: 1,
        contentHash: null,
        state: 'unavailable',
        purpose: 'source',
      },
      quote: 'carta',
      start: 12,
      end: 17,
      offsetUnit: 'utf16',
      classification: 'unclassified',
      rationale: 'Conferir a leitura.',
      context: { format: 'plain', documentId: 'manuscript', offsetBase: 10 },
    },
  };
  assert.deepEqual(normalizeBookEditorialArtifact(value).content.context, value.content.context);
  for (const patch of [
    { apiKey: 'PRIVATE' },
    { grant: true },
    { format: 'html' },
    { offsetBase: 13 },
    { documentId: '' },
  ])
    assert.throws(() =>
      normalizeBookEditorialArtifact({
        ...value,
        content: { ...value.content, context: { ...value.content.context, ...patch } },
      }),
    );
});

test('native cancel-before-start archives only the historical marker and never invents an input or scene', async () => {
  const f = await fixture(),
    id = 'capture-prose-cancel-stub';
  await f.prose.cancelLiteraryProse('author', { target, requestId: id });
  const wire = await f.wire(id);
  f.reads.length = 0;
  const { bundle } = await read(f, wire);
  assert.equal(bundle.artifacts.length, 1);
  assert.equal(bundle.artifacts[0].kind, 'checkpoint');
  assert.equal(bundle.artifacts[0].content.process, 'text-assistance');
  assert.equal(bundle.artifacts[0].content.phase, 'canceled');
  assert.equal(bundle.artifacts[0].content.currentUnit, null);
  assert.equal(bundle.artifacts[0].content.controlsDisabled, true);
  assert.deepEqual(bundle.artifacts[0].content.references, []);
  assert.equal(f.reads.includes('books/book/literaryProseRequests/' + id), false);
  assert.equal(JSON.stringify(bundle).includes('PRIVATE_AUTHOR_INSTRUCTION'), false);
});
