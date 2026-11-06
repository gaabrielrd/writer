import test from 'node:test';
import assert from 'node:assert/strict';
import { studioDb } from './helpers/studioDb.mjs';
import { digest, workScope } from '../src/workProgressContracts.mjs';
import { normalizeLiteraryReaderGuide } from '../src/literaryReaderGuideProtocol.mjs';
import {
  readLiteraryPublicationBook,
  literaryPublicationEntryId,
} from '../src/literaryPublicationContracts.mjs';
import {
  createLiteraryGuideDependencyIndex,
  guideDependencyVersionId,
  readLiteraryGuideDependencyIndex,
  readLiteraryGuideDependencyBackfillSource,
  backfillLiteraryGuideDependencyIndex,
} from '../src/literaryPublicationGuideDependencies.mjs';
import { readLiteraryImpactBookInventoryPage } from '../src/literaryImpactInventory.mjs';
import {
  literaryImpactLinkKey,
  normalizeLiteraryImpactNode,
} from '../src/literaryImpactProtocol.mjs';
import { verifyLiteraryImpactInventoryLink } from '../src/literaryImpactRecordVerification.mjs';
const draft = () => ({
  name: 'PRIVATE NAME',
  aliases: [],
  category: 'concept',
  summary: 'PRIVATE SUMMARY',
  certainty: 'uncertain',
  disambiguation: '',
  revealAfterChapterId: 'chapter',
  evidence: [{ chapterId: 'chapter', quote: 'PRIVATE QUOTE' }],
  facts: [
    { text: 'PRIVATE FACT', certainty: 'uncertain', chapterId: 'other', quote: 'PRIVATE QUOTE' },
  ],
  relationships: [
    {
      targetId: 'same-name',
      description: 'PRIVATE RELATION',
      certainty: 'uncertain',
      chapterId: 'chapter',
      quote: 'PRIVATE QUOTE',
    },
  ],
  appearances: [],
});
async function fixture({ legacy = false, deleted = false } = {}) {
  const f = studioDb();
  f.records.set('books/book', { authorId: 'author', status: 'draft', updatedAt: 10 });
  const c = workScope(f.db, 'author', { target: { kind: 'book', id: 'book' } }, []);
  const { bookToken } = await f.db.runTransaction((tx) => readLiteraryPublicationBook(tx, c));
  f.records.set('books/book/literaryPublications/edition', {
    jobId: 'edition',
    bookToken,
    schemaVersion: 1,
  });
  f.records.set('books/book/chapters/chapter', { bookId: 'book', ownerId: 'author' });
  const guide = deleted ? null : normalizeLiteraryReaderGuide(draft());
  const value = {
    version: 1,
    jobId: 'edition',
    id: 'guide',
    bookToken,
    revision: 1,
    entryHash: digest(guide),
    deleted,
    guide,
  };
  const versionId = guideDependencyVersionId(value),
    sourcePath = 'books/book/literaryPublicationGuideVersions/' + versionId,
    indexPath = 'books/book/literaryPublicationGuideDependencies/' + versionId;
  const index = createLiteraryGuideDependencyIndex(value);
  if (!legacy) value.dependencyIndexHash = index.indexHash;
  f.records.set(sourcePath, value);
  f.records.set(
    'books/book/literaryPublicationGuide/' + literaryPublicationEntryId('edition', 'guide'),
    value,
  );
  f.metadata.set(sourcePath, { createdAt: 1000, updatedAt: 1000 });
  if (!legacy) {
    f.records.set(indexPath, index);
    // Simulates native metadata from the atomic create; real SDK coverage below
    // verifies this equality instead of trusting the transaction double.
    f.metadata.set(indexPath, { createdAt: 1000, updatedAt: 1000 });
  }
  const read = () =>
    f.db.runTransaction((tx) => readLiteraryGuideDependencyIndex(tx, c, versionId));
  const preflight = () =>
    f.db.runTransaction((tx) => readLiteraryGuideDependencyBackfillSource(tx, c, versionId));
  const backfill = (expectedSourceToken) =>
    f.db.runTransaction((tx) =>
      backfillLiteraryGuideDependencyIndex(tx, c, { versionId, expectedSourceToken }),
    );
  const sealBackfillMetadata = () => {
    f.metadata.set(sourcePath, { createdAt: 1000, updatedAt: 2000 });
    f.metadata.set(indexPath, { createdAt: 2000, updatedAt: 2000 });
  };
  return {
    ...f,
    c,
    value,
    index,
    sourcePath,
    indexPath,
    versionId,
    read,
    preflight,
    backfill,
    sealBackfillMetadata,
  };
}

test('native index exposes exact typed IDs and rejects body, labels and quoted text from its result', async () => {
  const f = await fixture();
  const result = await f.read();
  assert.deepEqual(result.value.chapterIds, ['chapter', 'other']);
  assert.deepEqual(result.value.targetIds, ['same-name']);
  assert.equal(result.sourceRepresentation, 'native-co-created-index');
  assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
  assert.ok(f.metadataReads.every((value) => !value.fields.includes('guide')));
});

test('an index or source recreated with identical data cannot reuse the original native proof', async () => {
  for (const key of ['sourcePath', 'indexPath']) {
    const f = await fixture();
    f.metadata.set(f[key], { createdAt: 3000, updatedAt: 3000 });
    await assert.rejects(f.read(), { code: 'failed-precondition' });
  }
});

test('editing the supposedly immutable metadata index or its source invalidates the proof', async () => {
  for (const key of ['sourcePath', 'indexPath']) {
    const f = await fixture();
    f.metadata.set(f[key], { createdAt: 1000, updatedAt: 3000 });
    await assert.rejects(f.read(), { code: 'failed-precondition' });
  }
});

test('legacy backfill is explicit, pins the source and can replay a lost reply without a second mutation', async () => {
  const f = await fixture({ legacy: true });
  assert.equal(await f.read(), null);
  assert.equal(f.records.has(f.indexPath), false);
  const pin = await f.preflight();
  const beforeClock = f.records.get('books/book').literaryDependencyRevision ?? 0;
  const first = await f.backfill(pin.sourceToken);
  assert.equal(first.created, true);
  assert.equal(f.records.get('books/book').literaryDependencyRevision, beforeClock + 1);
  assert.equal(f.records.get(f.sourcePath).dependencyIndexHash, first.indexHash);
  f.sealBackfillMetadata();
  const snapshot = structuredClone([...f.records]);
  assert.equal((await f.backfill(pin.sourceToken)).created, false);
  assert.deepEqual([...f.records], snapshot);
  assert.equal((await f.read()).sourceRepresentation, 'explicit-native-backfill');
});

test('a stale preflight and a changed raw guide cannot be silently rebased into a new index', async () => {
  const f = await fixture({ legacy: true });
  const pin = await f.preflight();
  f.metadata.set(f.sourcePath, { createdAt: 1000, updatedAt: 3000 });
  await assert.rejects(f.backfill(pin.sourceToken), { code: 'failed-precondition' });
  assert.equal(f.records.has(f.indexPath), false);
  const fresh = await f.preflight();
  f.records.get(f.sourcePath).guide.summary = 'DIFFERENT PRIVATE SUMMARY';
  await assert.rejects(f.backfill(fresh.sourceToken), { code: 'failed-precondition' });
  assert.equal(f.records.has(f.indexPath), false);
});

test('a missing co-created index cannot be recreated through the legacy backfill path', async () => {
  const f = await fixture();
  const pin = await f.preflight();
  f.records.delete(f.indexPath);
  await assert.rejects(f.backfill(pin.sourceToken), { code: 'failed-precondition' });
  assert.equal(f.records.has(f.indexPath), false);
});

test('deleted guide versions index no citations and preserve their deletion without reviving an entry', async () => {
  const f = await fixture({ deleted: true });
  const result = await f.read();
  assert.deepEqual(result.value.chapterIds, []);
  assert.deepEqual(result.value.targetIds, []);
  assert.equal(f.records.get(f.sourcePath).guide, null);
});

test('guide inventory verifies a registered association while leaving original source identity and prose reading unknown', async () => {
  const f = await fixture();
  const page = await f.db.runTransaction((tx) =>
    readLiteraryImpactBookInventoryPage(tx, f.c, {
      bookId: 'book',
      collection: 'literaryPublicationGuideDependencies',
      recordId: f.versionId,
    }),
  );
  const item = page.items[0],
    link = item.links.find((value) => value.from.kind === 'chapter' && value.from.id === 'chapter');
  assert.deepEqual(item.issues, []);
  const checked = await f.db.runTransaction((tx) =>
    verifyLiteraryImpactInventoryLink(tx, f.c, {
      bookId: 'book',
      collection: item.record.collection,
      recordId: item.record.id,
      recordToken: item.recordToken,
      linkId: digest(literaryImpactLinkKey(link)),
    }),
  );
  assert.equal(checked.dependencyRecordVerified, true);
  assert.equal(checked.identityMatches, null);
  assert.equal(checked.versionMatches, null);
  assert.equal(checked.manuscriptRead, false);
  assert.equal(checked.editorialReview, false);
  assert.equal(JSON.stringify(page).includes('PRIVATE'), false);
});

test('guide logical identities keep edition and long native ID components without conflating homonyms', () => {
  const id = 'g'.repeat(1500);
  const a = normalizeLiteraryImpactNode({
    kind: 'readerGuide',
    id: JSON.stringify(['edition-a', id]),
    scopeKind: 'book',
    scopeId: 'book',
  });
  const b = normalizeLiteraryImpactNode({
    kind: 'readerGuide',
    id: JSON.stringify(['edition-b', id]),
    scopeKind: 'book',
    scopeId: 'book',
  });
  assert.notEqual(a.id, b.id);
  assert.throws(() =>
    normalizeLiteraryImpactNode({ ...a, id: JSON.stringify(['edition-a', 'bad/id']) }),
  );
});

test('ownership revocation denies reads and backfill before guide prose is read or metadata is written', async () => {
  const f = await fixture({ legacy: true });
  const pin = await f.preflight();
  f.records.get('books/book').authorId = 'other';
  const before = structuredClone([...f.records]);
  await assert.rejects(f.backfill(pin.sourceToken), { code: 'not-found' });
  assert.deepEqual([...f.records], before);
  assert.ok(f.metadataReads.every((value) => !value.fields.includes('guide')));
});

test('all bounded guide citations and relations survive a record larger than sixty-four links', async () => {
  const f = await fixture();
  const raw = draft();
  raw.revealAfterChapterId = 'reveal';
  raw.evidence = Array.from({ length: 8 }, (_, i) => ({ chapterId: 'e' + i, quote: 'PRIVATE' }));
  raw.facts = Array.from({ length: 12 }, (_, i) => ({
    text: 'PRIVATE',
    certainty: 'uncertain',
    chapterId: 'f' + i,
    quote: 'PRIVATE',
  }));
  raw.relationships = Array.from({ length: 12 }, (_, i) => ({
    targetId: 't' + i,
    description: 'PRIVATE',
    certainty: 'uncertain',
    chapterId: 'r' + i,
    quote: 'PRIVATE',
  }));
  raw.appearances = Array.from({ length: 24 }, (_, i) => ({
    kind: 'mention',
    chapterId: 'a' + i,
    quote: 'PRIVATE',
  }));
  f.value.guide = normalizeLiteraryReaderGuide(raw);
  f.value.entryHash = digest(f.value.guide);
  const index = createLiteraryGuideDependencyIndex(f.value);
  f.value.dependencyIndexHash = index.indexHash;
  f.records.set(f.indexPath, index);
  const page = await f.db.runTransaction((tx) =>
    readLiteraryImpactBookInventoryPage(tx, f.c, {
      bookId: 'book',
      collection: 'literaryPublicationGuideDependencies',
      recordId: f.versionId,
    }),
  );
  assert.equal(page.items[0].links.filter((value) => value.from.kind === 'chapter').length, 57);
  assert.equal(page.items[0].links.filter((value) => value.from.kind === 'readerGuide').length, 12);
  assert.ok(page.items[0].links.length > 64 && page.items[0].links.length <= 128);
  assert.equal(JSON.stringify(page).includes('PRIVATE'), false);
});
