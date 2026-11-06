import { createLiteraryProductionService } from '../src/literaryProduction.mjs';
import { emptyEditorialContract } from '../src/literaryContracts.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { studioDb } from './helpers/studioDb.mjs';
import { createLiteraryIntegrationService } from '../src/literaryIntegration.mjs';
import { createBookEditorialCaptureService } from '../src/bookEditorialCapture.mjs';
import { createBookEditorialRemapper } from '../src/bookEditorialRemap.mjs';
import {
  normalizeBookEditorialArtifact,
  bookEditorialArtifactReferences,
} from '../src/bookEditorialProtocol.mjs';
import { createBookEditorialContent } from '../src/bookEditorialContent.mjs';
const target = { kind: 'book', id: 'book' },
  jobId = 'capture-integration-job',
  command = { target, jobId };
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function fixture({ finish = true, audit } = {}) {
  const f = studioDb(),
    fullReads = [];
  f.records.set('books/book', {
    authorId: 'author',
    title: 'Livro',
    createdAt: 1,
    updatedAt: 100,
    wordCount: 12,
    status: 'draft',
  });
  f.records.set('users/author', { credits: 10 });
  for (let index = 0; index < 2; index++)
    f.records.set('books/book/chapters/chapter-' + index, {
      bookId: 'book',
      title: 'Capítulo ' + index,
      order: index,
      content: '<p>Ela recebeu a carta.</p>',
      updatedAt: 100,
    });
  if (audit === 'architecture')
    await createLiteraryProductionService({ db: f.db, now: () => 200 }).saveLiteraryContract(
      'author',
      {
        target,
        operationId: 'capture-integration-contract',
        expectedRevision: 0,
        contract: emptyEditorialContract(),
      },
    );
  const integration = createLiteraryIntegrationService({
    db: f.db,
    now: () => 400,
    generator: async (input) => {
      if (input.scope.phase === 'synthesis')
        return {
          complete: true,
          report: 'PRIVATE_SYNTHESIS',
          findings: [
            {
              severity: 'warning',
              problem: 'PRIVATE_SYNTHESIS_FINDING',
              action: 'Conferir o encadeamento.',
              evidenceIds: input.documents.map((item) => item.id),
            },
          ],
          conclusions: [
            {
              axis: 'causality',
              observation: 'As ações têm consequências.',
              evidenceIds: input.documents.map((item) => item.id),
            },
          ],
        };
      const source = input.documents[0];
      return {
        complete: true,
        report: 'PRIVATE_INTEGRATION_READING',
        findings: [
          {
            severity: 'warning',
            problem: 'Conferir a reação.',
            action: 'Conferir a carta.',
            evidence: [{ sourceId: source.id, quote: source.text.slice(0, 5) }],
          },
        ],
        matrix: [
          {
            axis: 'knowledge',
            subject: 'A personagem',
            observation: 'Ela recebe informação.',
            certainty: 'interpretation',
            evidence: [{ sourceId: source.id, quote: source.text.slice(0, 5) }],
          },
        ],
      };
    },
  });
  await integration.startLiteraryIntegration('author', {
    ...command,
    level: 'book',
    instruction: 'PRIVATE_OWN_INTEGRATION',
    ...(audit ? { audit } : {}),
  });
  if (finish) {
    let done = false;
    for (let step = 0; step < 200; step++) {
      const value = await integration.advanceLiteraryIntegration('author', command);
      if (value.state === 'done') {
        done = true;
        break;
      }
    }
    assert.equal(done, true);
  }
  const db = {
    ...f.db,
    runTransaction: (callback) =>
      f.db.runTransaction((tx) =>
        callback({
          ...tx,
          get: (resource) => {
            if (resource.path) fullReads.push(resource.path);
            return tx.get(resource);
          },
        }),
      ),
  };
  const api = createBookEditorialCaptureService({ db });
  const rows = (collection) =>
    [...f.records]
      .filter(([path]) => path.startsWith('books/book/' + collection + '/'))
      .map(([path, value]) => ({ path, id: path.split('/').at(-1), value }));
  async function wire(family, id) {
    const source = await api.getBookEditorialCaptureSource('author', { bookId: 'book' });
    const base = {
      bookId: 'book',
      bookSourceToken: source.bookSourceToken,
      editorialSourceToken: source.editorialSourceToken,
    };
    const page = await api.listBookEditorialCaptureRecords('author', {
      ...base,
      family,
      limit: 50,
    });
    assert.equal(JSON.stringify(page).includes('PRIVATE'), false);
    return { ...base, family, ...page.items.find((item) => item.id === id) };
  }
  return {
    ...f,
    api,
    rows,
    wire,
    integration,
    fullReads,
    jobPath: 'books/book/literaryIntegrationJobs/' + jobId,
  };
}
async function read(f, family, id) {
  const wire = await f.wire(family, id),
    first = await f.api.readBookEditorialCaptureRecord('author', { ...wire, index: 0 });
  const parts = [Buffer.from(first.chunkBase64, 'base64')];
  for (let index = 1; index < first.chunkCount; index++) {
    const value = await f.api.readBookEditorialCaptureRecord('author', {
      ...wire,
      index,
      projectionToken: first.projectionToken,
    });
    const bytes = Buffer.from(value.chunkBase64, 'base64');
    assert.equal(hash(bytes), value.chunkHash);
    parts.push(bytes);
  }
  const bytes = Buffer.concat(parts);
  assert.equal(hash(bytes), first.contentHash);
  await f.api.verifyBookEditorialCaptureRecord('author', {
    ...wire,
    projectionToken: first.projectionToken,
  });
  return { artifacts: JSON.parse(bytes.toString('utf8')).artifacts, wire, first };
}
const report = (result) => result.artifacts.find((item) => item.kind === 'report');
const request = (f, kind) =>
  f.rows('literaryIntegrationRequests').find((item) => item.value.kind === kind);

test('native integration preserves own input and technical coverage without changing the job', async () => {
  const f = await fixture(),
    before = structuredClone([...f.records]);
  const root = await read(f, 'integration-job', jobId);
  assert.equal(root.artifacts[0].content.controlsDisabled, true);
  assert.equal(root.artifacts[0].content.counters.analyses, f.records.get(f.jobPath).analyses);
  assert.equal(report(root).content.claimedCoverage.scope, 'book');
  assert.equal(report(root).content.claimedCoverage.completed, 2);
  assert.equal(report(root).content.findings.length, 0);
  assert.equal(JSON.stringify(root.artifacts).includes('PRIVATE_OWN_INTEGRATION'), true);
  assert.deepEqual([...f.records], before);
});

test('reading quotes preserve native UTF16 offsets and source context without repeating the manuscript', async () => {
  const f = await fixture(),
    native = request(f, 'reading'),
    value = await read(f, 'integration-request', native.id);
  const evidence = value.artifacts.filter((item) => item.kind === 'evidence'),
    result = f.records.get('books/book/literaryIntegrationResults/' + native.id).result;
  assert.equal(report(value).content.claimedCoverage.scope, 'unit-segment');
  assert.equal(evidence.length, 1);
  assert.equal(evidence[0].content.start, result.findings[0].evidence[0].offset);
  assert.equal(
    evidence[0].content.end - evidence[0].content.start,
    evidence[0].content.quote.length,
  );
  assert.equal(evidence[0].content.source.kind, 'chapter');
  assert.equal(evidence[0].content.context.format, 'plain');
  assert.equal(
    value.artifacts.some((item) => item.kind === 'prose'),
    false,
  );
  assert.equal(report(value).generation.snapshot, 'historical');
});

test('boundary windows never claim full chapters or invent segment coverage', async () => {
  const f = await fixture(),
    native = request(f, 'boundary'),
    value = await read(f, 'integration-request', native.id);
  assert.equal(report(value).content.claimedCoverage.scope, 'chapter-boundary');
  assert.equal(
    report(value).content.observations.some((item) => item.axis === 'Limites técnicos do segmento'),
    false,
  );
});

test('synthesis retains per-finding and per-conclusion report associations without fabricating quote evidence', async () => {
  const f = await fixture(),
    native = request(f, 'synthesis'),
    value = await read(f, 'integration-request', native.id),
    result = report(value);
  assert.equal(result.content.claimedCoverage.scope, 'evidence-synthesis');
  assert.equal(
    value.artifacts.some((item) => item.kind === 'evidence'),
    false,
  );
  const sources = result.content.findings[0].reportSources;
  assert.deepEqual(result.content.findings[0].evidenceIds, []);
  assert.deepEqual(result.content.observations[0].reportSources, sources);
  for (const [index, sourceId] of native.value.evidenceIds.entries()) {
    const original = report(await read(f, 'integration-request', sourceId));
    assert.equal(sources[index].id, original.id);
    assert.equal(sources[index].state, 'recorded');
  }
});

test('a stale job suppresses cached results without mutating state or losing own instruction', async () => {
  const f = await fixture(),
    native = request(f, 'reading');
  f.records.set('books/book', { ...f.records.get('books/book'), updatedAt: 999 });
  const before = structuredClone(f.records.get(f.jobPath));
  f.fullReads.length = 0;
  assert.equal(
    report(await read(f, 'integration-request', native.id)).availability.state,
    'unavailable',
  );
  assert.equal(
    f.fullReads.some((path) => path.includes('/literaryIntegrationResults/')),
    false,
  );
  const root = await read(f, 'integration-job', jobId);
  assert.equal(JSON.stringify(root.artifacts).includes('PRIVATE_OWN_INTEGRATION'), true);
  assert.deepEqual(f.records.get(f.jobPath), before);
});

test('unit composition changes close the request gate before reading cached results', async () => {
  const f = await fixture(),
    native = request(f, 'reading'),
    chapter = native.value.sources[0].chapterId;
  f.records.set('books/book/chapters/' + chapter, {
    ...f.records.get('books/book/chapters/' + chapter),
    title: 'Mudou',
  });
  f.fullReads.length = 0;
  assert.equal(
    report(await read(f, 'integration-request', native.id)).availability.state,
    'unavailable',
  );
  assert.equal(
    f.fullReads.some((path) => path.includes('/literaryIntegrationResults/')),
    false,
  );
});

for (const state of ['running', 'error', 'canceled'])
  test(state + ' keeps a disabled checkpoint without opening a result', async () => {
    const f = await fixture(),
      native = request(f, 'reading');
    f.records.set(native.path, { ...native.value, state });
    f.fullReads.length = 0;
    const result = await read(f, 'integration-request', native.id);
    assert.equal(result.artifacts[0].content.phase, state);
    assert.equal(report(result).availability.reason, 'not-recorded');
    assert.equal(
      f.fullReads.some((path) => path.includes('/literaryIntegrationResults/')),
      false,
    );
  });

test('cancel-before-start captures no fabricated chapter, instruction, model or result', async () => {
  const f = await fixture(),
    id = 'capture-integration-cancel';
  await f.integration.cancelLiteraryIntegration('author', { target, jobId: id });
  const { artifacts } = await read(f, 'integration-job', id);
  assert.equal(artifacts.length, 1);
  assert.equal(artifacts[0].content.phase, 'canceled');
  assert.equal(artifacts[0].content.currentUnit, null);
  assert.deepEqual(artifacts[0].content.references, []);
});

test('legacy association absence never adopts the current job or current source report identity', async () => {
  const f = await fixture(),
    native = request(f, 'synthesis'),
    original = { ...native.value };
  delete original.captureBinding;
  f.records.set(native.path, original);
  const result = report(await read(f, 'integration-request', native.id));
  assert.equal(result.content.references[0].state, 'unavailable');
  assert.equal(
    result.content.findings[0].reportSources.every((item) => item.state === 'unavailable'),
    true,
  );
  assert.equal(result.generation, undefined);
});

test('recreated parent job does not authorize a historical request or replace its parent identity', async () => {
  const f = await fixture(),
    native = request(f, 'reading'),
    before = await read(f, 'integration-request', native.id);
  f.metadata.set(f.jobPath, { createdAt: 99999, updatedAt: 100000 });
  f.fullReads.length = 0;
  const after = await read(f, 'integration-request', native.id);
  assert.equal(
    after.artifacts[0].content.references[0].id,
    before.artifacts[0].content.references[0].id,
  );
  assert.equal(after.artifacts[0].content.references[0].state, 'unavailable');
  assert.equal(report(after).availability.state, 'unavailable');
  assert.equal(
    f.fullReads.some((path) => path.includes('/literaryIntegrationResults/')),
    false,
  );
});

test('recreated child retains the original unavailable synthesis pointer', async () => {
  const f = await fixture(),
    native = request(f, 'synthesis'),
    before = report(await read(f, 'integration-request', native.id));
  f.metadata.set('books/book/literaryIntegrationRequests/' + native.value.evidenceIds[0], {
    createdAt: 99999,
    updatedAt: 100000,
  });
  const after = report(await read(f, 'integration-request', native.id));
  assert.equal(
    after.content.findings[0].reportSources[0].id,
    before.content.findings[0].reportSources[0].id,
  );
  assert.equal(after.content.findings[0].reportSources[0].state, 'unavailable');
});

test('architecture synthesis is hidden while its original job is not complete', async () => {
  const f = await fixture({ audit: 'architecture' }),
    native = request(f, 'synthesis');
  f.records.set(f.jobPath, { ...f.records.get(f.jobPath), state: 'verifying' });
  f.fullReads.length = 0;
  assert.equal(
    report(await read(f, 'integration-request', native.id)).availability.reason,
    'not-recorded',
  );
  assert.equal(
    f.fullReads.some((path) => path.includes('/literaryIntegrationResults/')),
    false,
  );
});

test('partial census explicitly records zero planned units and no whole-manuscript certificate', async () => {
  const f = await fixture({ finish: false }),
    result = report(await read(f, 'integration-job', jobId));
  assert.equal(result.content.claimedCoverage.total, 0);
  assert.ok(result.content.claimedCoverage.limitations.some((item) => item.includes('prefixo')));
});

test('invalid result identity and unsupported schema do not become plausible portable reports', async () => {
  const f = await fixture(),
    native = request(f, 'reading'),
    path = 'books/book/literaryIntegrationResults/' + native.id;
  f.records.set(path, { ...f.records.get(path), requestId: 'another-request' });
  await assert.rejects(read(f, 'integration-request', native.id), { code: 'failed-precondition' });
  f.records.set(native.path, { ...native.value, schemaVersion: 2 });
  f.fullReads.length = 0;
  assert.equal(
    report(await read(f, 'integration-request', native.id)).availability.reason,
    'unsupported-legacy-schema',
  );
  assert.equal(
    f.fullReads.some((item) => item === path),
    false,
  );
});

test('native tokens, bindings, execution pointers and fingerprints are absent from portable content', async () => {
  const f = await fixture(),
    native = request(f, 'synthesis'),
    result = await read(f, 'integration-request', native.id);
  const serialized = JSON.stringify(result.artifacts);
  for (const key of [
    'captureBinding',
    'jobBirth',
    'requestId',
    'jobId',
    'sourceFence',
    'sourceToken',
    'inputHash',
    'fingerprint',
    'pendingRequestId',
  ])
    assert.equal(serialized.includes('"' + key + '"'), false);
});

test('final verification rechecks root authorization and does not accept an earlier observation', async () => {
  const f = await fixture(),
    native = request(f, 'reading'),
    result = await read(f, 'integration-request', native.id);
  f.records.set('books/book', { ...f.records.get('books/book'), authorId: 'other' });
  await assert.rejects(
    f.api.verifyBookEditorialCaptureRecord('author', {
      ...result.wire,
      projectionToken: result.first.projectionToken,
    }),
  );
});

test('synthesis remaps per-row report references and keeps execution disabled', async () => {
  const f = await fixture(),
    native = request(f, 'synthesis'),
    result = await read(f, 'integration-request', native.id);
  const map = createBookEditorialRemapper({
    sourceBookId: 'book',
    bookId: 'copy',
    hashBytes: hash,
    mapResource: (kind, id) => 'copy-' + kind + '-' + id,
  });
  const old = report(result),
    restored = map.artifact(old);
  assert.notEqual(
    restored.record.content.findings[0].reportSources[0].id,
    old.content.findings[0].reportSources[0].id,
  );
  assert.equal(restored.record.content.findings[0].reportSources[0].scope.id, 'copy');
  assert.equal(restored.restoration.execution, 'disabled');
  assert.equal(restored.restoration.publication, 'private');
});

test('semantic traversal requires report targets for synthesis dependencies instead of treating them as quotes', async () => {
  const f = await fixture(),
    native = request(f, 'synthesis'),
    item = report(await read(f, 'integration-request', native.id));
  const content = createBookEditorialContent({ bookId: 'book' }),
    descriptors = content.descriptors('book-editorial-artifact', item);
  const dependencies = descriptors.filter((value) => value.expected === 'report');
  assert.ok(dependencies.length > 0);
  assert.equal(
    dependencies.length,
    item.content.findings[0].reportSources.length +
      item.content.observations[0].reportSources.length,
  );
  await assert.rejects(
    content.validateEdge(
      { kind: 'evidence', revision: null, availability: 'included' },
      { kind: 'report', revision: null },
    ),
  );
  for (const dependency of dependencies)
    assert.ok(
      bookEditorialArtifactReferences(item, 'book').some((ref) => ref.id === dependency.ref.id),
    );
  const corrupt = structuredClone(item);
  corrupt.content.findings[0].reportSources[0].kind = 'chapter';
  assert.throws(() => normalizeBookEditorialArtifact(corrupt));
});

test('large valid historical reports stream in bounded parts and recheck the result identity', async () => {
  const f = await fixture(),
    native = request(f, 'reading'),
    path = 'books/book/literaryIntegrationResults/' + native.id;
  const saved = structuredClone(f.records.get(path)),
    template = saved.result.findings[0];
  saved.result.findings = Array.from({ length: 40 }, (_, index) => ({
    ...template,
    problem: String(index) + 'x'.repeat(1900),
    action: 'y'.repeat(1900),
  }));
  f.records.set(path, saved);
  const value = await read(f, 'integration-request', native.id);
  assert.ok(value.first.chunkCount > 1);
  assert.equal(report(value).content.findings.length, 40);
});

test('canonical JSON evidence keeps its representation and offsets without becoming observed prose', async () => {
  const f = await fixture(),
    native = request(f, 'reading'),
    path = 'books/book/literaryIntegrationResults/' + native.id;
  const saved = structuredClone(f.records.get(path));
  saved.sources[0].format = 'canonical-json';
  f.records.set(path, saved);
  const value = await read(f, 'integration-request', native.id),
    evidence = value.artifacts.find((item) => item.kind === 'evidence');
  assert.equal(evidence.content.context.format, 'canonical-json');
  assert.equal(evidence.content.classification, 'unclassified');
});

test('native architecture reading keeps canonical JSON evidence and cannot claim manuscript truth', async () => {
  const f = await fixture({ audit: 'architecture' }),
    native = request(f, 'architecture');
  assert.ok(native);
  const value = await read(f, 'integration-request', native.id),
    result = report(value);
  assert.equal(result.content.claimedCoverage.scope, 'architecture-segment');
  const evidence = value.artifacts.find((item) => item.kind === 'evidence');
  assert.equal(evidence.content.context.format, 'canonical-json');
  assert.equal(evidence.content.classification, 'unclassified');
  assert.ok(
    result.content.observations.some((item) =>
      item.text.includes('Certeza registrada: interpretation'),
    ),
  );
});
