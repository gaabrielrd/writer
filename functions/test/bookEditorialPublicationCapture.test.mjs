import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { studioDb } from './helpers/studioDb.mjs';
import { createLiteraryIntegrationService } from '../src/literaryIntegration.mjs';
import { createLiteraryPublicationService } from '../src/literaryPublication.mjs';
import { createLiteraryPublicationGuideService } from '../src/literaryPublicationGuide.mjs';
import { literaryPublicationEntryId } from '../src/literaryPublicationContracts.mjs';
import { createBookEditorialCaptureService } from '../src/bookEditorialCapture.mjs';
import { createBookEditorialRemapper } from '../src/bookEditorialRemap.mjs';
import {
  normalizeBookEditorialArtifact,
  bookEditorialArtifactReferences,
} from '../src/bookEditorialProtocol.mjs';
import {
  createBookEditorialContent,
  createBookEditorialContentState,
} from '../src/bookEditorialContent.mjs';
import { digest } from '../src/workProgressContracts.mjs';
const target = { kind: 'book', id: 'book' },
  jobId = 'capture-publication-job',
  integrationId = 'capture-publication-integration';
const hash = (value) => createHash('sha256').update(value).digest('hex');
const draft = (patch = {}) => ({
  name: 'A carta',
  aliases: ['Carta'],
  category: 'concept',
  summary: 'Uma carta recebida.',
  certainty: 'uncertain',
  disambiguation: '',
  revealAfterChapterId: 'chapter-1',
  evidence: [{ chapterId: 'chapter-1', quote: 'Ela recebeu a carta.' }],
  facts: [
    {
      text: 'A carta chegou.',
      certainty: 'fact',
      chapterId: 'chapter-1',
      quote: 'Ela recebeu a carta.',
    },
  ],
  relationships: [
    {
      targetId: 'other-entry',
      description: 'Uma relação incerta.',
      certainty: 'uncertain',
      chapterId: 'chapter-1',
      quote: 'Ela recebeu a carta.',
    },
  ],
  appearances: [{ kind: 'mention', chapterId: 'chapter-1', quote: 'Ela recebeu a carta.' }],
  ...patch,
});
async function fixture({ removals = false, save = true } = {}) {
  const f = studioDb(),
    reads = [];
  f.records.set('books/book', {
    authorId: 'author',
    title: 'Livro',
    status: removals ? 'published' : 'draft',
    createdAt: 1,
    updatedAt: 100,
    wordCount: 0,
  });
  f.records.set('users/author', { credits: 10 });
  for (let index = 1; index <= (removals ? 2 : 1); index++)
    f.records.set('books/book/chapters/chapter-' + index, {
      bookId: 'book',
      title: 'Capítulo ' + index,
      order: index,
      updatedAt: 100,
      content: '<p>Ela recebeu a carta.</p>',
    });
  if (removals) {
    f.records.set('publicBooks/book', {
      schemaVersion: 1,
      revisionId: 'old-edition',
      title: 'Livro',
      authorName: 'Autor',
      publishedAt: 1,
    });
    f.records.set('publicBooks/book/revisions/old-edition', {
      chapterCount: 2,
      loreCount: 0,
      privacyVersion: 0,
      createdAt: 1,
    });
    for (let index = 1; index <= 2; index++)
      f.records.set('publicBooks/book/revisions/old-edition/chapters/chapter-' + index, {
        title: 'Capítulo ' + index,
        order: index,
        content: '<p>Ela recebeu a carta.</p>',
      });
  }
  const integration = createLiteraryIntegrationService({
    db: f.db,
    now: () => 200,
    generator: async (input) =>
      input.scope.phase === 'synthesis'
        ? { complete: true, report: 'Síntese.', findings: [], conclusions: [] }
        : { complete: true, report: 'Leitura.', findings: [], matrix: [] },
  });
  await integration.startLiteraryIntegration('author', {
    target,
    jobId: integrationId,
    level: 'book',
  });
  let accepted;
  for (let step = 0; step < 200; step++) {
    const value = await integration.advanceLiteraryIntegration('author', {
      target,
      jobId: integrationId,
    });
    if (value.state === 'done') {
      accepted = value;
      break;
    }
  }
  assert.ok(accepted);
  await integration.acceptLiteraryIntegration('author', {
    target,
    jobId: integrationId,
    expectedSourceToken: accepted.sourceToken,
  });
  const publication = createLiteraryPublicationService({ db: f.db, now: () => 300 });
  await publication.startLiteraryPublication('author', {
    target,
    jobId,
    integrationId,
    expectedIntegrationToken: accepted.sourceToken,
    policy: removals ? 'chapter' : 'book',
    unitId: removals ? 'chapter-1' : null,
    authorName: 'PRIVATE_OWN_AUTHOR',
    checks: { finalTextReviewed: true, navigationReviewed: true, publicationAuthorized: true },
  });
  let prepared;
  for (let step = 0; step < 250; step++) {
    const value = await publication.advanceLiteraryPublication('author', { target, jobId });
    if (value.state === 'prepared') {
      prepared = value;
      break;
    }
  }
  assert.ok(prepared);
  const guides = createLiteraryPublicationGuideService({ db: f.db, now: () => 400 });
  let sequence = 0;
  async function saveGuide(id = 'main-entry', revision = 0, guide = draft()) {
    return guides.saveLiteraryPublicationGuideEntry('author', {
      target,
      jobId,
      id,
      expectedRevision: revision,
      operationId: 'capture-save-guide-' + ++sequence,
      expectedManifestHash: prepared.manifestHash,
      guide,
    });
  }
  if (save) {
    await saveGuide('other-entry', 0, draft({ name: 'Outra entrada', relationships: [] }));
    await saveGuide();
  }
  const db = {
    ...f.db,
    runTransaction: (callback) =>
      f.db.runTransaction((tx) =>
        callback({
          ...tx,
          get: (resource) => {
            if (resource.path) reads.push(resource.path);
            return tx.get(resource);
          },
        }),
      ),
  };
  const api = createBookEditorialCaptureService({ db });
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
    wire,
    reads,
    guides,
    publication,
    saveGuide,
    prepared,
    jobPath: 'books/book/literaryPublications/' + jobId,
    guidePath:
      'books/book/literaryPublicationGuide/' + literaryPublicationEntryId(jobId, 'main-entry'),
  };
}
async function read(f, family, id) {
  const wire = await f.wire(family, id),
    first = await f.api.readBookEditorialCaptureRecord('author', { ...wire, index: 0 });
  if (first.state === 'current-alias') {
    await f.api.verifyBookEditorialCaptureRecord('author', {
      ...wire,
      projectionToken: first.projectionToken,
    });
    return { artifacts: [], wire, first };
  }
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
  await f.api.verifyBookEditorialCaptureRecord('author', {
    ...wire,
    projectionToken: first.projectionToken,
  });
  return { artifacts: JSON.parse(bytes.toString('utf8')).artifacts, first, wire };
}
const current = (f) =>
  read(f, 'reader-guide-current', literaryPublicationEntryId(jobId, 'main-entry'));
const document = (result) => result.artifacts.find((item) => item.kind === 'document');

test('native reader guide preserves reveal gates, facts, relations and appearances with explicit citation links', async () => {
  const f = await fixture(),
    before = structuredClone([...f.records]),
    value = await current(f),
    entry = document(value).content.readerGuide.entry;
  assert.equal(entry.name, 'A carta');
  assert.equal(entry.facts[0].certainty, 'fact');
  assert.equal(entry.appearances[0].kind, 'mention');
  assert.equal(entry.revealAfter.id, 'chapter-1');
  assert.equal(entry.evidenceIds.length, 1);
  assert.equal(value.artifacts.filter((item) => item.kind === 'evidence').length, 4);
  const ids = new Set(value.artifacts.map((item) => item.id));
  for (const row of [...entry.facts, ...entry.relationships, ...entry.appearances])
    assert.ok(ids.has(row.evidenceId));
  const other = document(
    await read(f, 'reader-guide-current', literaryPublicationEntryId(jobId, 'other-entry')),
  );
  assert.equal(entry.relationships[0].targetKey, other.content.readerGuide.key);
  assert.deepEqual([...f.records], before);
});

test('guide quotations have no invented offsets or observed-fact classification', async () => {
  const f = await fixture(),
    value = await current(f);
  for (const item of value.artifacts.filter((item) => item.kind === 'evidence')) {
    assert.equal(item.content.start, null);
    assert.equal(item.content.end, null);
    assert.equal(item.content.offsetUnit, 'not-recorded');
    assert.equal(item.content.classification, 'unclassified');
    assert.equal(item.content.quote, 'Ela recebeu a carta.');
  }
});

test('current guide and matching version alias use identical archival IDs and evidence links', async () => {
  const f = await fixture(),
    head = await current(f),
    version = await read(
      f,
      'reader-guide-version',
      digest({ jobId, id: 'main-entry', revision: 1 }),
    );
  assert.equal(version.first.state, 'current-alias');
  assert.equal(version.first.artifactId, document(head).id);
  assert.equal(version.first.recordCount, head.artifacts.length);
  assert.equal(version.artifacts.length, 0);
  assert.equal(document(head).lineage.role, 'current');
});

test('older versions retain their own text after a new guide revision', async () => {
  const f = await fixture();
  await f.saveGuide('main-entry', 1, draft({ summary: 'Outra síntese.' }));
  const old = await read(
    f,
    'reader-guide-version',
    digest({ jobId, id: 'main-entry', revision: 1 }),
  );
  assert.equal(old.first.state, 'artifact');
  assert.equal(document(old).content.readerGuide.entry.summary, 'Uma carta recebida.');
  assert.equal(document(await current(f)).content.readerGuide.entry.summary, 'Outra síntese.');
});

test('withdrawn guide retains a tombstone and its previous versions without recreating the current entry', async () => {
  const f = await fixture();
  await f.saveGuide('main-entry', 1, null);
  const head = await current(f);
  assert.equal(document(head).content.readerGuide.entry, null);
  assert.equal(head.artifacts.length, 1);
  const old = await read(
    f,
    'reader-guide-version',
    digest({ jobId, id: 'main-entry', revision: 1 }),
  );
  assert.equal(document(old).content.readerGuide.entry.name, 'A carta');
  assert.equal(f.records.get(f.guidePath).guide, null);
});

test('own guide history survives source drift while no current prose verification is claimed', async () => {
  const f = await fixture();
  f.records.set('books/book/chapters/chapter-1', {
    ...f.records.get('books/book/chapters/chapter-1'),
    content: '<p>Outro texto.</p>',
  });
  const before = structuredClone(f.records.get(f.jobPath)),
    native = await f.guides.getLiteraryPublicationGuideEntry('author', {
      target,
      jobId,
      id: 'main-entry',
    });
  assert.equal(native.guide.name, 'A carta');
  const value = await current(f);
  assert.equal(document(value).content.readerGuide.entry.summary, 'Uma carta recebida.');
  assert.equal(value.artifacts[1].content.quote, 'Ela recebeu a carta.');
  assert.deepEqual(f.records.get(f.jobPath), before);
});

test('recreated or absent chapter makes source references unavailable without losing own guide text', async () => {
  const f = await fixture();
  f.metadata.set('books/book/chapters/chapter-1', { createdAt: 99999, updatedAt: 100000 });
  let value = await current(f);
  assert.equal(document(value).content.readerGuide.entry.revealAfter.state, 'unavailable');
  f.records.delete('books/book/chapters/chapter-1');
  value = await current(f);
  assert.equal(value.artifacts[1].content.source.state, 'unavailable');
  assert.equal(document(value).content.readerGuide.entry.name, 'A carta');
});

test('recreated book origin closes the guide body before any cached author content is read', async () => {
  const f = await fixture();
  f.metadata.set('books/book', { createdAt: 99999, updatedAt: 100000 });
  f.reads.length = 0;
  const value = await current(f);
  assert.equal(document(value).availability.state, 'unavailable');
  assert.equal(f.reads.includes(f.guidePath), false);
});

test('missing or wrong-incarnation parent closes the native guide gate', async () => {
  const f = await fixture();
  f.records.set(f.jobPath, { ...f.records.get(f.jobPath), bookToken: 'f'.repeat(64) });
  f.reads.length = 0;
  assert.equal(document(await current(f)).availability.state, 'unavailable');
  assert.equal(f.reads.includes(f.guidePath), false);
  f.records.delete(f.jobPath);
  assert.equal(document(await current(f)).availability.state, 'unavailable');
});

test('guide entry hash, native keys and alias metadata must agree before serialization', async () => {
  const f = await fixture(),
    raw = f.records.get(f.guidePath);
  f.records.set(f.guidePath, { ...raw, entryHash: 'f'.repeat(64) });
  await assert.rejects(current(f), { code: 'failed-precondition' });
  f.records.set(f.guidePath, { ...raw, id: 'different-entry' });
  await assert.rejects(current(f), { code: 'failed-precondition' });
});

test('unsupported guide schema does not open a body or fabricate content', async () => {
  const f = await fixture();
  f.records.set(f.guidePath, { ...f.records.get(f.guidePath), version: 2 });
  f.reads.length = 0;
  assert.equal(document(await current(f)).availability.reason, 'unsupported-legacy-schema');
  assert.equal(f.reads.includes(f.guidePath), false);
});

test('manifest and reader guide share only a portable historical edition key', async () => {
  const f = await fixture(),
    root = await read(f, 'publication-job', jobId),
    guide = await current(f);
  assert.equal(root.artifacts[0].content.controlsDisabled, true);
  assert.equal(document(root).content.editionKey, document(guide).content.editionKey);
  assert.equal(JSON.stringify(root.artifacts).includes('PRIVATE_OWN_AUTHOR'), true);
  assert.equal(
    document(root).content.sections.find(
      (row) => row.label === 'Declaração autoral histórica: publicationAuthorized',
    ).text,
    'sim',
  );
  assert.equal(f.records.get('books/book').status, 'draft');
  assert.equal(f.records.has('publicBooks/book'), false);
});

test('manifest chapters preserve captured position and compilation without copying prepared prose', async () => {
  const f = await fixture(),
    value = await read(f, 'publication-chapter', literaryPublicationEntryId(jobId, 'chapter-1'));
  assert.equal(document(value).content.role, 'publicationManifest');
  assert.equal(
    document(value).content.sections.find((row) => row.label === 'Posição no manifesto').text,
    '0',
  );
  assert.equal(
    document(value).content.sections.find((row) => row.label === 'Compilação registrada').text,
    'sim',
  );
  assert.equal(
    value.artifacts.some((item) => item.kind === 'prose'),
    false,
  );
});

test('manifest removals are historical intent and never remove the manuscript chapter', async () => {
  const f = await fixture({ removals: true }),
    value = await read(f, 'publication-removal', literaryPublicationEntryId(jobId, 'chapter-2'));
  assert.ok(document(value).content.sections.some((row) => row.label === 'Retirada registrada'));
  assert.equal(f.records.has('books/book/chapters/chapter-2'), true);
  assert.equal(JSON.stringify(value.artifacts).includes('old-edition'), false);
  const root = document(await read(f, 'publication-job', jobId));
  assert.equal(document(value).content.previousEditionKey, root.content.previousEditionKey);
  assert.match(root.content.previousEditionKey, /^[a-f0-9]{64}$/);
});

test('cancel-before-start contains only a disabled publication checkpoint', async () => {
  const f = await fixture({ save: false }),
    id = 'capture-publication-cancel';
  await f.publication.cancelLiteraryPublication('author', { target, jobId: id });
  const value = await read(f, 'publication-job', id);
  assert.equal(value.artifacts.length, 1);
  assert.equal(value.artifacts[0].content.phase, 'canceled');
  assert.equal(value.artifacts[0].content.currentUnit, null);
  assert.deepEqual(value.artifacts[0].content.references, []);
});

test('native origins, public hashes, controls and raw edition IDs never become portable fields', async () => {
  const f = await fixture(),
    value = await current(f),
    root = await read(f, 'publication-job', jobId),
    serialized = JSON.stringify([...value.artifacts, ...root.artifacts]);
  for (const key of [
    'bookToken',
    'jobId',
    'sourceFence',
    'manifestHash',
    'projectionHash',
    'entryHash',
    'fingerprint',
    'publicPointer',
    'previousRevisionId',
  ])
    assert.equal(serialized.includes('"' + key + '"'), false);
  assert.equal(serialized.includes(jobId), false);
});

test('final verification detects loss of root authorization after the first guide part', async () => {
  const f = await fixture(),
    value = await current(f);
  f.records.set('books/book', { ...f.records.get('books/book'), authorId: 'other' });
  await assert.rejects(
    f.api.verifyBookEditorialCaptureRecord('author', {
      ...value.wire,
      projectionToken: value.first.projectionToken,
    }),
  );
});

test('remapping preserves guide relationships and edition grouping with new private identities', async () => {
  const f = await fixture(),
    head = document(await current(f)),
    other = document(
      await read(f, 'reader-guide-current', literaryPublicationEntryId(jobId, 'other-entry')),
    ),
    root = document(await read(f, 'publication-job', jobId));
  const map = createBookEditorialRemapper({
    sourceBookId: 'book',
    bookId: 'copy',
    hashBytes: hash,
    mapResource: (kind, id) => 'copy-' + kind + '-' + id,
  });
  const restored = map.artifact(head),
    target = map.artifact(other),
    manifest = map.artifact(root);
  assert.equal(
    restored.record.content.readerGuide.entry.relationships[0].targetKey,
    target.record.content.readerGuide.key,
  );
  assert.equal(restored.record.content.editionKey, manifest.record.content.editionKey);
  assert.notEqual(restored.record.content.editionKey, head.content.editionKey);
  assert.equal(restored.restoration.execution, 'disabled');
  assert.equal(restored.restoration.publication, 'private');
});

function semantic() {
  const index = new Map(),
    rows = [],
    warnings = { editorialUnavailable: 0 },
    totals = { editorialArtifacts: 0, editorialLinks: 0 },
    state = createBookEditorialContentState();
  const api = createBookEditorialContent({
    state,
    bookId: 'book',
    add: async (key, value) => {
      const id = JSON.stringify(key);
      assert.equal(index.has(id), false);
      index.set(id, value);
    },
    get: async (key) => index.get(JSON.stringify(key)),
    row: async (value) => rows.push(value),
    hashJSON: (value) => hash(JSON.stringify(value)),
    warnings,
    totals,
  });
  return { api, rows, warnings };
}

test('semantic traversal distinguishes chapter references from evidence links throughout the structured guide', async () => {
  const f = await fixture(),
    value = await current(f),
    doc = document(value),
    { api } = semantic();
  const refs = bookEditorialArtifactReferences(doc, 'book'),
    descriptors = api.descriptors('book-editorial-artifact', doc);
  assert.equal(refs.length, descriptors.length);
  assert.equal(descriptors.filter((item) => item.expected === 'evidence').length, 4);
  assert.equal(
    descriptors
      .filter((item) => item.expected === 'evidence')
      .every((item) => item.ref.kind === 'artifact'),
    true,
  );
  const bad = structuredClone(doc);
  bad.content.readerGuide.entry.facts[0].chapter.kind = 'scene';
  assert.throws(() => normalizeBookEditorialArtifact(bad));
});

test('semantic guide keys cannot merge different lineages and edition boundaries', async () => {
  const f = await fixture(),
    doc = document(await current(f)),
    { api } = semantic();
  await api.accept('book-editorial-artifact', { id: doc.id }, doc);
  const duplicate = structuredClone(doc);
  duplicate.id = 'f'.repeat(64);
  duplicate.lineage.id = 'e'.repeat(64);
  await assert.rejects(api.accept('book-editorial-artifact', { id: duplicate.id }, duplicate));
});

test('missing historical relationship targets are explicit warnings rather than invented entries', async () => {
  const f = await fixture(),
    doc = document(await current(f)),
    { api, rows, warnings } = semantic();
  await api.accept('book-editorial-artifact', { id: doc.id }, doc);
  const relation = rows.find((row) => row.kind === 'editorial-reader-guide-link');
  assert.ok(relation);
  await api.oneRow(relation);
  assert.equal(warnings.editorialUnavailable, 1);
});

test('full-size authored guides retain all 56 citations in bounded capture parts without claiming literal verification', async () => {
  const f = await fixture(),
    quote = 'q'.repeat(1500),
    citation = { chapterId: 'chapter-1', quote };
  await f.saveGuide(
    'main-entry',
    1,
    draft({
      evidence: Array.from({ length: 8 }, () => ({ ...citation })),
      facts: Array.from({ length: 12 }, () => ({
        ...citation,
        text: 'Declaração própria.',
        certainty: 'uncertain',
      })),
      relationships: Array.from({ length: 12 }, () => ({
        ...citation,
        targetId: 'other-entry',
        description: 'Relação própria.',
        certainty: 'uncertain',
      })),
      appearances: Array.from({ length: 24 }, () => ({ ...citation, kind: 'uncertain' })),
    }),
  );
  const value = await current(f);
  assert.equal(value.artifacts.length, 57);
  assert.ok(value.first.chunkCount > 1);
  assert.equal(
    value.artifacts
      .filter((item) => item.kind === 'evidence')
      .every((item) => item.content.classification === 'unclassified'),
    true,
  );
});

test('known reader guide targets from another edition are rejected instead of joined across editions', async () => {
  const f = await fixture(),
    doc = document(await current(f)),
    target = document(
      await read(f, 'reader-guide-current', literaryPublicationEntryId(jobId, 'other-entry')),
    ),
    { api, rows } = semantic();
  target.content.editionKey = 'f'.repeat(64);
  await api.accept('book-editorial-artifact', { id: doc.id }, doc);
  await api.accept('book-editorial-artifact', { id: target.id }, target);
  await assert.rejects(api.oneRow(rows.find((row) => row.kind === 'editorial-reader-guide-link')));
});
