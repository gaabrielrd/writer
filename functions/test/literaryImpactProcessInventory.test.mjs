import test from 'node:test';
import assert from 'node:assert/strict';
import { studioDb } from './helpers/studioDb.mjs';
import { workScope, digest, readWorkMetadata } from '../src/workProgressContracts.mjs';
import { literaryNativeBirth } from '../src/literarySourceOrigins.mjs';
import {
  readLiteraryIntegrationUnitMetadata,
  readLiteraryIntegrationChapter,
} from '../src/literaryIntegrationSources.mjs';
import { readLiteraryPublicationIntegration } from '../src/literaryPublicationContracts.mjs';
import { readLiteraryImpactBookInventoryPage } from '../src/literaryImpactInventory.mjs';
import { verifyLiteraryImpactInventoryLink } from '../src/literaryImpactRecordVerification.mjs';
import { literaryImpactLinkKey } from '../src/literaryImpactProtocol.mjs';
import { literaryImpactPublicationBookToken } from '../src/literaryImpactProcessInventory.mjs';

async function fixture() {
  const f = studioDb();
  f.records.set('books/book', { authorId: 'author', updatedAt: 10, status: 'draft' });
  f.records.set('books/book/chapters/c', {
    bookId: 'book',
    ownerId: 'author',
    title: 'Capítulo',
    order: 0,
    contentMode: 'scenes',
    content: 'PRIVATE MANUSCRIPT',
    structureRevision: 0,
    assemblyRevision: 0,
  });
  const c = workScope(f.db, 'author', { target: { kind: 'book', id: 'book' } }, []);
  const born = (path) =>
    f.db.runTransaction(async (tx) =>
      literaryNativeBirth(await readWorkMetadata(tx, f.db.doc(path), [])),
    );
  const bookBirth = await born('books/book'),
    chapterBirth = await born('books/book/chapters/c');
  const workflow = {
    schemaVersion: 1,
    jobId: 'cycle',
    actorId: 'author',
    bookBirth,
    chapterBirth,
    chapterId: 'c',
    actId: null,
    collaboration: { revision: 1 },
    draftId: 'draft',
    reviewId: 'review',
    firstVersionId: 'first',
    instruction: 'PRIVATE INSTRUCTION',
    authorizedPhases: ['firstVersion'],
    generation: { apiKey: 'PRIVATE KEY' },
  };
  const read = (collection, id) =>
    f.db.runTransaction((tx) =>
      readLiteraryImpactBookInventoryPage(tx, c, { bookId: 'book', collection, recordId: id }),
    );
  const verify = (item, link) =>
    f.db.runTransaction((tx) =>
      verifyLiteraryImpactInventoryLink(tx, c, {
        bookId: 'book',
        collection: item.record.collection,
        recordId: item.record.id,
        recordToken: item.recordToken,
        linkId: digest(literaryImpactLinkKey(link)),
      }),
    );
  const bookToken = literaryImpactPublicationBookToken(c, bookBirth);
  const publication = { schemaVersion: 1, jobId: 'edition', bookToken, policy: 'book' };
  return { ...f, c, born, bookBirth, workflow, read, verify, publication, bookToken };
}

test('workflow origins distinguish native identity from a read or current version of manuscript', async () => {
  const f = await fixture();
  f.records.set('books/book/literaryWorkflowJobs/cycle', f.workflow);
  const item = (await f.read('literaryWorkflowJobs', 'cycle')).items[0];
  const link = item.links.find((value) => value.from.kind === 'chapter');
  const current = await f.verify(item, link);
  assert.equal(current.identityEvidence, 'native-birth-only');
  assert.equal(current.sourceIdentityVerified, true);
  assert.equal(current.versionMatches, null);
  assert.equal(current.status, 'unverified');
  assert.equal(current.manuscriptRead, false);
  assert.equal(current.wholeUnitRead, false);
  assert.equal(current.editorialReview, false);
  assert.equal(current.byteIntegrityChecked, false);
  f.records.get('books/book/chapters/c').content = 'OTHER PRIVATE MANUSCRIPT';
  assert.equal((await f.verify(item, link)).versionMatches, null);
  f.metadata.set('books/book/chapters/c', { createdAt: 5000, updatedAt: 5000 });
  assert.equal((await f.verify(item, link)).status, 'recreated');
  assert.equal(JSON.stringify(item).includes('PRIVATE'), false);
  const projection = f.reads.find(
    (value) => value.collectionPath === 'books/book/literaryWorkflowJobs',
  ).fields;
  for (const forbidden of ['instruction', 'generation', 'authorizedPhases', 'limits', 'busyStep'])
    assert.equal(projection.includes(forbidden), false);
});

test('a native workflow target proves its exact record, without certifying target prose', async () => {
  const f = await fixture();
  f.records.set('books/book/literaryWorkflowJobs/cycle', f.workflow);
  const item = (await f.read('literaryWorkflowJobs', 'cycle')).items[0];
  const link = item.links.find((value) => value.relation === 'target');
  const value = await f.verify(item, link);
  assert.equal(value.identityEvidence, 'native-record-snapshot');
  assert.equal(value.sourceIdentityVerified, true);
  assert.equal(value.manuscriptRead, false);
  f.metadata.set('books/book/literaryWorkflowJobs/cycle', { createdAt: 2000, updatedAt: 2000 });
  assert.equal((await f.verify(item, link)).status, 'record-changed');
});

test('old-book or foreign-author processes become explicit unresolved records, without rebinding', async () => {
  for (const patch of [
    { bookBirth: [9, 0] },
    { actorId: 'other' },
    { chapterId: 'bad/id' },
    { workflowBirth: [9, 0] },
  ]) {
    const f = await fixture();
    f.records.set('books/book/literaryWorkflowJobs/cycle', { ...f.workflow, ...patch });
    const item = (await f.read('literaryWorkflowJobs', 'cycle')).items[0];
    assert.deepEqual(item.links, []);
    assert.deepEqual(item.issues, ['invalid-or-unavailable-dependency-metadata']);
  }
});

test('a full 25-chapter sequence keeps every chapter, act and completed workflow origin', async () => {
  const f = await fixture();
  f.records.set('books/book/literarySequenceJobs/sequence', {
    schemaVersion: 1,
    actorId: 'author',
    jobId: 'sequence',
    bookBirth: f.bookBirth,
    collaboration: { revision: 1 },
    instruction: 'PRIVATE',
    chapters: Array.from({ length: 25 }, (_, index) => ({
      id: 'c' + index,
      title: 'PRIVATE',
      actId: 'a' + index,
      birth: [0, 10000000],
      actBirth: [0, 10000000],
    })),
    completed: Array.from({ length: 25 }, (_, index) => ({
      index,
      workflowId: 'w' + index,
      birth: [0, 10000000],
    })),
    currentWorkflowId: 'pending-cycle',
  });
  const item = (await f.read('literarySequenceJobs', 'sequence')).items[0];
  assert.equal(item.links.filter((value) => value.from.kind === 'chapter').length, 25);
  assert.equal(item.links.filter((value) => value.from.kind === 'act').length, 25);
  assert.equal(item.links.filter((value) => value.from.kind === 'workflow').length, 26);
  assert.ok(item.links.length > 64 && item.links.length <= 128);
  assert.deepEqual(item.issues, ['current-workflow-origin-not-recorded']);
  assert.equal(JSON.stringify(item).includes('PRIVATE'), false);
});

test('inspection retains the exact chapter metadata version and separately checks its identity', async () => {
  const f = await fixture();
  const chapter = await f.db.runTransaction((tx) => readLiteraryIntegrationChapter(tx, f.c, 'c'));
  f.records.set('books/book/literaryPassageInspections/inspection', {
    version: 2,
    actorId: 'author',
    bookBirth: f.bookBirth,
    chapterId: 'c',
    chapter,
    chapterActBirth: null,
    prompt: 'PRIVATE',
  });
  const item = (await f.read('literaryPassageInspections', 'inspection')).items[0];
  const link = item.links.find((value) => value.from.kind === 'chapter');
  assert.equal((await f.verify(item, link)).status, 'current');
  f.metadata.set('books/book/chapters/c', { updatedAt: 3000 });
  const changed = await f.verify(item, link);
  assert.equal(changed.identityMatches, true);
  assert.equal(changed.status, 'changed');
  assert.equal(changed.manuscriptRead, false);
  f.metadata.set('books/book/chapters/c', { createdAt: 4000, updatedAt: 4000 });
  assert.equal((await f.verify(item, link)).status, 'recreated');
});

test('publication parts keep different logical nodes for equal candidate and selected IDs, without reading bodies', async () => {
  const f = await fixture();
  f.records.set('books/book/literaryPublications/edition', f.publication);
  const chapter = await f.db.runTransaction((tx) => readLiteraryIntegrationChapter(tx, f.c, 'c'));
  const values = {
    jobId: 'edition',
    chapterId: 'c',
    identityToken: chapter.identityToken,
    token: chapter.token,
    html: 'PRIVATE BODY',
    content: 'PRIVATE CONTENT',
  };
  f.records.set('books/book/literaryPublicationCandidates/same', values);
  f.records.set('books/book/literaryPublicationChapters/same', values);
  const candidate = (await f.read('literaryPublicationCandidates', 'same')).items[0];
  const selected = (await f.read('literaryPublicationChapters', 'same')).items[0];
  const source = (item) => item.links.find((value) => value.from.kind === 'publicationPart');
  assert.notEqual(source(candidate).from.id, source(selected).from.id);
  assert.equal(
    (await f.verify(selected, source(selected))).identityEvidence,
    'native-record-snapshot',
  );
  assert.equal(
    (
      await f.verify(
        selected,
        selected.links.find((value) => value.from.kind === 'chapter'),
      )
    ).status,
    'current',
  );
  assert.equal(JSON.stringify(selected).includes('PRIVATE'), false);
  for (const read of f.reads.filter((value) =>
    value.collectionPath?.includes('literaryPublication'),
  ))
    assert.ok(!read.fields.includes('html') && !read.fields.includes('content'));
});

test('publication parent scope is reauthorized without adopting a recreated book token', async () => {
  const f = await fixture();
  f.records.set('books/book/literaryPublications/edition', {
    ...f.publication,
    bookToken: 'a'.repeat(64),
  });
  f.records.set('books/book/literaryPublicationBodies/body', {
    jobId: 'edition',
    chapterId: 'c',
    html: 'PRIVATE',
  });
  const item = (await f.read('literaryPublicationBodies', 'body')).items[0];
  assert.deepEqual(item.links, []);
  assert.deepEqual(item.issues, ['invalid-or-unavailable-dependency-metadata']);
});

test('reader guide containment never claims that literal evidence arrays were inventoried', async () => {
  const f = await fixture();
  f.records.set('books/book/literaryPublications/edition', f.publication);
  const raw = { evidence: [{ chapterId: 'c', quote: 'PRIVATE' }], summary: 'PRIVATE' };
  const value = {
    version: 1,
    jobId: 'edition',
    bookToken: f.bookToken,
    id: 'guide',
    revision: 1,
    deleted: false,
    entryHash: digest(raw),
    guide: raw,
  };
  f.records.set('books/book/literaryPublicationGuide/guide', value);
  f.records.set(
    'books/book/literaryPublicationGuideVersions/' +
      digest({ jobId: 'edition', id: 'guide', revision: 1 }),
    value,
  );
  const item = (await f.read('literaryPublicationGuide', 'guide')).items[0];
  assert.deepEqual(item.issues, ['publication-guide-dependencies-not-inventoried']);
  assert.equal(JSON.stringify(item).includes('PRIVATE'), false);
  assert.equal(
    item.links.some((value) => value.from.kind === 'chapter'),
    false,
  );
});

test('exact accepted integration snapshot is checked from metadata, without promoting a later replacement', async () => {
  const f = await fixture();
  f.records.set('books/book/literaryIntegrationJobs/report', {
    jobId: 'report',
    level: 'book',
    state: 'done',
    authorAccepted: true,
    blocking: 0,
    finalRequestId: 'final',
    units: 1,
    verifiedUnits: 1,
    analyses: 1,
    verifiedAnalyses: 1,
    mainUnits: 1,
    mainReadUnits: 1,
    sourceFence: 'a'.repeat(64),
    body: 'PRIVATE',
  });
  const integration = await f.db.runTransaction((tx) =>
    readLiteraryPublicationIntegration(tx, f.c, 'report'),
  );
  f.records.set('books/book/literaryPublications/edition', { ...f.publication, integration });
  const item = (await f.read('literaryPublications', 'edition')).items[0];
  const link = item.links.find((value) => value.from.kind === 'integration');
  assert.equal((await f.verify(item, link)).status, 'current');
  f.metadata.set('books/book/literaryIntegrationJobs/report', { createdAt: 2000, updatedAt: 2000 });
  const replaced = await f.verify(item, link);
  assert.equal(replaced.status, 'changed');
  assert.equal(replaced.identityMatches, null);
  assert.equal(replaced.manuscriptRead, false);
});

test('revoked book ownership denies inventory before returning any process dependencies', async () => {
  const f = await fixture();
  f.records.set('books/book/literaryWorkflowJobs/cycle', f.workflow);
  f.records.get('books/book').authorId = 'other';
  await assert.rejects(f.read('literaryWorkflowJobs', 'cycle'), { code: 'not-found' });
});

async function publishedUnit({ legacy = false } = {}) {
  const f = await fixture();
  f.records.set('books/book/literaryPublications/edition', f.publication);
  if (legacy) f.records.get('books/book/chapters/c').contentMode = 'legacy';
  else
    f.records.set('books/book/scenes/scene', {
      ownerId: 'author',
      parentId: 'c',
      title: 'Cena',
      archived: false,
      revision: 1,
      bodyHash: 'a'.repeat(64),
      rankA: 'a',
      content: 'PRIVATE BODY',
      prompt: 'PRIVATE PROMPT',
    });
  const resource = legacy ? { kind: 'chapter', id: 'c' } : { kind: 'scene', id: 'scene' };
  const metadata = await f.db.runTransaction((tx) =>
    readLiteraryIntegrationUnitMetadata(tx, f.c, { chapterId: 'c', resource }),
  );
  f.records.set('books/book/literaryPublicationUnits/unit', {
    jobId: 'edition',
    identityToken: metadata.identityToken,
    unit: { chapterId: 'c', chapterToken: metadata.chapter.token, resource, token: metadata.token },
    html: 'PRIVATE BODY',
    prompt: 'PRIVATE PROMPT',
  });
  const item = (await f.read('literaryPublicationUnits', 'unit')).items[0];
  const link = item.links.find((value) => value.capture?.scheme === 'integration-unit');
  return { ...f, item, link };
}

test('published scene unit checks its exact canonical metadata token without reading chapter or scene bodies', async () => {
  const f = await publishedUnit();
  const value = await f.verify(f.item, f.link);
  assert.equal(value.status, 'current');
  assert.equal(value.identityEvidence, 'native-integration-unit');
  assert.equal(value.sourceRepresentation, 'metadata-only');
  assert.equal(value.manuscriptRead, false);
  assert.equal(value.wholeUnitRead, false);
  assert.equal(value.byteIntegrityChecked, false);
  assert.equal(f.item.issues.includes('publication-unit-native-identity-not-inventoried'), false);
  assert.equal(JSON.stringify(f.item).includes('PRIVATE'), false);
  for (const read of f.metadataReads.filter(
    (value) => value.path.includes('/scenes/') || value.path.includes('/chapters/'),
  ))
    assert.ok(read.fields && !read.fields.includes('content') && !read.fields.includes('body'));
});

test('published scene metadata distinguishes body revision, chapter composition and scene recreation', async () => {
  for (const change of ['revision', 'composition', 'recreation']) {
    const f = await publishedUnit();
    if (change === 'revision') f.records.get('books/book/scenes/scene').revision++;
    if (change === 'composition') f.records.get('books/book/chapters/c').assemblyRevision++;
    if (change === 'recreation')
      f.metadata.set('books/book/scenes/scene', { createdAt: 9000, updatedAt: 9000 });
    const value = await f.verify(f.item, f.link);
    assert.equal(value.status, change === 'recreation' ? 'recreated' : 'changed');
    assert.equal(value.identityMatches, change !== 'recreation');
    assert.equal(value.manuscriptRead, false);
  }
});

test('a scene removed from its chapter, archived or no longer owned cannot pass published source verification', async () => {
  for (const patch of [{ parentId: 'other' }, { archived: true }, { ownerId: 'other' }]) {
    const f = await publishedUnit();
    Object.assign(f.records.get('books/book/scenes/scene'), patch);
    const value = await f.verify(f.item, f.link);
    assert.equal(value.status, 'unavailable');
    assert.equal(value.sourceIdentityVerified, false);
  }
});

test('legacy published chapter identity remains distinct from its whole-body integrity', async () => {
  const f = await publishedUnit({ legacy: true });
  const value = await f.verify(f.item, f.link);
  assert.equal(value.status, 'current');
  assert.equal(value.manuscriptRead, false);
  assert.equal(value.byteIntegrityChecked, false);
  f.metadata.set('books/book/chapters/c', { updatedAt: 7000 });
  assert.equal((await f.verify(f.item, f.link)).status, 'changed');
});

async function nativeCurrentSequence() {
  const f = await fixture();
  const parentPath = 'books/book/literarySequenceJobs/sequence';
  const sequence = {
    schemaVersion: 1,
    jobId: 'sequence',
    actorId: 'author',
    bookBirth: f.bookBirth,
    birth: null,
    index: 0,
    collaboration: { revision: 1 },
    currentWorkflowId: 'cycle',
    completed: [],
    chapters: [{ id: 'c', birth: f.workflow.chapterBirth, actId: null, actBirth: null }],
  };
  f.records.set(parentPath, sequence);
  sequence.birth = await f.born(parentPath);
  const child = {
    ...f.workflow,
    workflowBirth: null,
    fingerprint: 'f'.repeat(64),
    sequence: { id: 'sequence', birth: sequence.birth, index: 0 },
  };
  f.records.set('books/book/literaryWorkflowJobs/cycle', child);
  child.workflowBirth = await f.born('books/book/literaryWorkflowJobs/cycle');
  const receipt = {
    method: 'startLiteraryWorkflow',
    id: 'cycle',
    actorId: 'author',
    bookBirth: f.bookBirth,
    workflowBirth: child.workflowBirth,
    status: 'done',
    fingerprint: child.fingerprint,
  };
  f.records.set('books/book/literaryOperations/cycle', receipt);
  const item = (await f.read('literarySequenceJobs', 'sequence')).items[0];
  const link = item.links.find((value) => value.capture?.scheme === 'sequence-workflow');
  return { ...f, sequence, child, receipt, item, link };
}

test('current sequence membership derives from its original registration receipt and native reverse binding', async () => {
  const f = await nativeCurrentSequence();
  assert.equal(f.item.issues.includes('current-workflow-origin-not-recorded'), false);
  const value = await f.verify(f.item, f.link);
  assert.equal(value.sourceIdentityVerified, true);
  assert.equal(value.identityEvidence, 'native-registration-membership');
  assert.equal(value.versionMatches, null);
  assert.equal(value.status, 'unverified');
  assert.equal(value.manuscriptRead, false);
  f.records.get('books/book/literaryOperations/cycle').status = 'superseded';
  assert.equal((await f.verify(f.item, f.link)).sourceIdentityVerified, true);
});

test('a recreated child or registration receipt cannot be adopted by the original sequence dependency pointer', async () => {
  for (const path of [
    'books/book/literaryWorkflowJobs/cycle',
    'books/book/literaryOperations/cycle',
  ]) {
    const f = await nativeCurrentSequence();
    f.metadata.set(path, { createdAt: 3000, updatedAt: 3000 });
    const value = await f.verify(f.item, f.link);
    assert.equal(value.recordCurrent, false);
    assert.equal(value.status, 'link-changed');
    assert.equal(value.sourceIdentityVerified, false);
  }
});

test('incomplete registration, changed inverse binding and foreign receipt remain explicit unresolved membership', async () => {
  for (const mutate of [
    (f) => {
      f.receipt.workflowBirth = null;
    },
    (f) => {
      f.child.sequence.index = 1;
    },
    (f) => {
      f.receipt.actorId = 'other';
    },
    (f) => {
      f.receipt.fingerprint = '0'.repeat(64);
    },
  ]) {
    const f = await nativeCurrentSequence();
    mutate(f);
    const item = (await f.read('literarySequenceJobs', 'sequence')).items[0];
    assert.ok(item.issues.includes('current-workflow-origin-not-recorded'));
    assert.equal(
      item.links.some((value) => value.capture?.scheme === 'sequence-workflow'),
      false,
    );
  }
});
