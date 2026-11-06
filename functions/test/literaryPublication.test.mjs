import test from 'node:test';
import assert from 'node:assert/strict';
import { studioDb } from './helpers/studioDb.mjs';
import { workScope, digest } from '../src/workProgressContracts.mjs';
import { createScenesService } from '../src/scenes.mjs';
import { createLiteraryPublicationService } from '../src/literaryPublication.mjs';
import { createLiteraryProductionService } from '../src/literaryProduction.mjs';
import { captureLiteraryPublicationPassage } from '../src/literaryPublicationPassage.mjs';
import {
  createLiteraryPassageInspectionService,
  readLiteraryPassageInspection,
} from '../src/literaryPassageInspection.mjs';
import { emptyEditorialContract } from '../src/literaryContracts.mjs';
import {
  readLiteraryIntegrationFence,
  readLiteraryIntegrationChapter,
  listLiteraryIntegrationUnits,
} from '../src/literaryIntegrationSources.mjs';
const uid = 'author',
  target = { kind: 'book', id: 'book' },
  jobId = 'publication-job-0001',
  integrationId = 'accepted-integration';
const command = { target, jobId };
async function fixture({ chapters = 1, scenes = false, previous = false, acts = false } = {}) {
  const f = studioDb(),
    chapterIds = [];
  f.records.set('books/book', {
    authorId: uid,
    title: 'Livro completo',
    status: previous ? 'published' : 'draft',
    createdAt: 1,
    updatedAt: 10,
    wordCount: 0,
  });
  f.records.set('users/author', { credits: 7, email: 'PRIVATE EMAIL' });
  if (acts) {
    f.records.set('books/book/acts/first', { name: 'Primeiro ato', order: 1 });
    f.records.set('books/book/acts/second', { name: 'Segundo ato', order: 2 });
  }
  if (scenes) {
    const api = createScenesService({ db: f.db, now: () => 100 });
    const chapter = await api.createSceneGroup(uid, {
      target,
      operationId: 'make-chapter-000001',
      title: 'Capítulo',
    });
    await api.createScene(uid, {
      target,
      operationId: 'make-scene-one-000001',
      parentId: chapter.id,
      title: 'PRIVATE SCENE ONE',
      content: '<p>Primeira cena.</p>',
    });
    await api.createScene(uid, {
      target,
      operationId: 'make-scene-two-000001',
      parentId: chapter.id,
      title: 'PRIVATE SCENE TWO',
      content: '<p>Segunda <em>cena</em>.</p>',
    });
    chapterIds.push(chapter.id);
  } else
    for (let n = 1; n <= chapters; n++) {
      const id = 'chapter-' + n;
      chapterIds.push(id);
      f.records.set('books/book/chapters/' + id, {
        ...(acts ? { actId: n <= Math.floor(chapters / 2) ? 'first' : 'second' } : {}),
        bookId: 'book',
        title: 'Capítulo ' + n,
        order: n,
        updatedAt: 10,
        content: '<p data-note="PRIVATE ATTRIBUTE">Texto <strong>final</strong> ' + n + '.</p>',
      });
    }
  if (previous) {
    f.records.set('publicBooks/book', {
      schemaVersion: 1,
      title: 'Livro completo',
      authorName: 'Autor',
      revisionId: 'old-edition',
      publishedAt: 1,
    });
    f.records.set('publicBooks/book/revisions/old-edition', {
      chapterCount: chapters,
      loreCount: 0,
      privacyVersion: 0,
      createdAt: 1,
    });
    for (let n = 1; n <= chapters; n++)
      f.records.set('publicBooks/book/revisions/old-edition/chapters/chapter-' + n, {
        title: 'Capítulo ' + n,
        order: n,
        content: '<p>Texto <strong>final</strong> ' + n + '.</p>',
      });
  }
  const c = workScope(f.db, uid, { target }, []);
  let index = 0;
  for (const chapterId of chapterIds) {
    const chapter = await f.db.runTransaction((tx) =>
      readLiteraryIntegrationChapter(tx, c, chapterId),
    );
    const page = await f.db.runTransaction((tx) =>
      listLiteraryIntegrationUnits(tx, c, { chapterId, chapterToken: chapter.token }),
    );
    for (const unit of page.items) {
      f.records.set(
        c.path + '/literaryIntegrationUnits/' + digest({ jobId: integrationId, index }),
        {
          ...unit,
          jobId: integrationId,
          index,
          role: 'main',
          coverage: { complete: true, sourceToken: unit.token },
        },
      );
      f.records.set(
        c.path +
          '/literaryIntegrationUnitLinks/' +
          digest({ jobId: integrationId, kind: unit.resource.kind, id: unit.resource.id }),
        {
          jobId: integrationId,
          resource: unit.resource,
          unitIndex: index,
          chapterId,
          role: 'main',
        },
      );
      index++;
    }
  }
  const fence = await f.db.runTransaction((tx) => readLiteraryIntegrationFence(tx, c));
  f.records.set(c.path + '/literaryIntegrationJobs/' + integrationId, {
    jobId: integrationId,
    state: 'done',
    level: 'book',
    actId: null,
    authorAccepted: true,
    sourceFence: fence.token,
    blocking: 0,
    dismissedBlocking: 0,
    finalRequestId: 'analysis',
    units: index,
    verifiedUnits: index,
    mainUnits: index,
    mainReadUnits: index,
    analyses: 1,
    verifiedAnalyses: 1,
    completedAt: 200,
  });
  const input = {
      ...command,
      policy: 'book',
      unitId: null,
      integrationId,
      expectedIntegrationToken: fence.token,
      authorName: 'Autor escolhido',
      checks: { finalTextReviewed: true, navigationReviewed: true, publicationAuthorized: true },
    },
    api = createLiteraryPublicationService({ db: f.db, now: () => 300 });
  return { ...f, c, api, input, chapterIds };
}
async function until(f, predicate) {
  let result = await f.api.getLiteraryPublication(uid, command);
  for (let step = 0; step < 250 && !predicate(result); step++) {
    assert.equal(['stale', 'canceled'].includes(result.state), false, JSON.stringify(result));
    result = await f.api.advanceLiteraryPublication(uid, command);
  }
  assert.equal(predicate(result), true, JSON.stringify(result));
  return result;
}
test('compiled prose has a versioned, fully checked manifest while public confirmation remains pending', async () => {
  const f = await fixture();
  await f.api.startLiteraryPublication(uid, f.input);
  const result = await until(f, (job) => job.state === 'prepared');
  assert.equal(result.chapterCount, 1);
  assert.equal(result.verifiedChapters, 1);
  assert.equal(result.verifiedUnits, 1);
  assert.equal(result.publicationConfirmed, false);
  assert.equal(result.publishedAt, null);
  assert.equal(result.publicationUrl, null);
  const chapter = f.records.get('publicBooks/book/revisions/' + jobId + '/chapters/chapter-1');
  assert.equal(chapter.content, '<p>Texto <strong>final</strong> 1.</p>');
  assert.equal(JSON.stringify(chapter).includes('PRIVATE'), false);
  assert.equal(f.records.has('publicBooks/book'), false);
  assert.equal(f.records.has('publicBooks/book/revisions/' + jobId), false);
  assert.equal(f.records.get('books/book').status, 'draft');
  assert.equal(f.records.get('users/author').credits, 7);
  assert.equal(f.records.get('books/book').hasLiteraryPublications, true);
  const production = createLiteraryProductionService({ db: f.db });
  const receipt = await production.getLiteraryOperation(uid, { target, operationId: jobId });
  assert.equal(receipt.kind, 'publication');
  assert.equal(receipt.state, 'confirmed');
});
test('scene composition publishes every canonical scene in order without production headings', async () => {
  const f = await fixture({ scenes: true });
  await f.api.startLiteraryPublication(uid, f.input);
  const result = await until(f, (job) => job.state === 'prepared');
  assert.equal(result.unitCount, 2);
  assert.equal(result.verifiedUnits, 2);
  const projected = f.records.get(
    'publicBooks/book/revisions/' + jobId + '/chapters/' + f.chapterIds[0],
  );
  assert.equal(projected.content, '<p>Primeira cena.</p>\n<p>Segunda <em>cena</em>.</p>');
  assert.equal(JSON.stringify(projected).includes('PRIVATE'), false);
});
test('a done integration header is insufficient without the approved version of each manuscript unit', async () => {
  const f = await fixture();
  await f.api.startLiteraryPublication(uid, f.input);
  await until(f, (job) => job.phase === 'building');
  const key = [...f.records.keys()].find((path) =>
    path.startsWith('books/book/literaryIntegrationUnitLinks/'),
  );
  f.records.delete(key);
  const before = structuredClone([...f.records]);
  await assert.rejects(f.api.advanceLiteraryPublication(uid, command), {
    code: 'failed-precondition',
  });
  assert.deepEqual([...f.records], before);
  assert.equal(f.records.has('publicBooks/book'), false);
});
test('staged text tampering is detected before a manifest can become prepared', async () => {
  const f = await fixture();
  await f.api.startLiteraryPublication(uid, f.input);
  await until(f, (job) => job.phase === 'verifyChapters');
  f.records.get('publicBooks/book/revisions/' + jobId + '/chapters/chapter-1').content =
    '<p>Texto cortado.</p>';
  const before = structuredClone([...f.records]);
  await assert.rejects(f.api.advanceLiteraryPublication(uid, command), {
    code: 'failed-precondition',
  });
  assert.deepEqual([...f.records], before);
});
test('chapter policy exposes removals in the manifest and preserves the current public pointer', async () => {
  const f = await fixture({ chapters: 2, previous: true }),
    input = { ...f.input, policy: 'chapter', unitId: 'chapter-1' };
  await f.api.startLiteraryPublication(uid, input);
  const result = await until(f, (job) => job.state === 'prepared');
  assert.equal(result.chapterCount, 1);
  assert.equal(result.removalCount, 1);
  assert.match(result.removalHash, /^[a-f0-9]{64}$/);
  const removed = await f.api.listLiteraryPublicationRemovals(uid, command);
  assert.equal(removed.items[0].chapterId, 'chapter-2');
  assert.equal(f.records.get('publicBooks/book').revisionId, 'old-edition');
  assert.equal(f.records.has('publicBooks/book/revisions/old-edition/chapters/chapter-2'), true);
});
test('changed manuscript or public edition invalidates compilation; native book recreation cannot inherit a job', async () => {
  for (const change of ['manuscript', 'pointer', 'birth']) {
    const f = await fixture();
    await f.api.startLiteraryPublication(uid, f.input);
    if (change === 'manuscript') f.records.get('books/book').updatedAt = 500;
    if (change === 'pointer') {
      f.records.set('publicBooks/book', { revisionId: 'other-edition' });
      f.records.set('publicBooks/book/revisions/other-edition', { chapterCount: 0 });
    }
    if (change === 'birth') {
      f.metadata.set('books/book', { createdAt: 9999 });
      await assert.rejects(f.api.getLiteraryPublication(uid, command), {
        code: 'failed-precondition',
      });
    } else assert.equal((await f.api.advanceLiteraryPublication(uid, command)).state, 'stale');
    assert.equal(f.records.has('publicBooks/book/revisions/' + jobId), false);
  }
});
test('start is idempotent, cancellation wins before start and foreign actors cannot inspect metadata', async () => {
  const f = await fixture();
  await f.api.startLiteraryPublication(uid, f.input);
  const before = structuredClone([...f.records]);
  await f.api.startLiteraryPublication(uid, f.input);
  assert.deepEqual([...f.records], before);
  await assert.rejects(f.api.getLiteraryPublication('other', command), { code: 'not-found' });
  await assert.rejects(
    f.api.startLiteraryPublication(uid, { ...f.input, authorName: 'Outro nome' }),
    { code: 'invalid-argument' },
  );
  const canceled = await fixture();
  await canceled.api.cancelLiteraryPublication(uid, command);
  const result = await canceled.api.startLiteraryPublication(uid, canceled.input);
  assert.equal(result.state, 'canceled');
  assert.equal(canceled.records.has('publicBooks/book'), false);
});

test('a final paged census detects a chapter added without a compliant structure clock', async () => {
  const f = await fixture();
  await f.api.startLiteraryPublication(uid, f.input);
  await until(f, (job) => job.phase === 'verifyCandidates');
  f.records.set('books/book/chapters/new-chapter', {
    bookId: 'book',
    title: 'Novo capítulo',
    order: 2,
    content: '<p>Texto novo.</p>',
  });
  await assert.rejects(f.api.advanceLiteraryPublication(uid, command), {
    code: 'failed-precondition',
  });
  assert.equal(f.records.has('publicBooks/book'), false);
});
test('a dangling act is preserved for correction instead of silently changing publication order', async () => {
  const f = await fixture();
  f.records.get('books/book/chapters/chapter-1').actId = 'missing-act';
  await f.api.startLiteraryPublication(uid, f.input);
  await assert.rejects(f.api.advanceLiteraryPublication(uid, command), {
    code: 'failed-precondition',
  });
});

// Explicit public guide and release use the same frozen manuscript fixture.
import { createLiteraryPublicationGuideService } from '../src/literaryPublicationGuide.mjs';
import { createLiteraryPublicationConfirmationService } from '../src/literaryPublicationConfirmation.mjs';
const guideDraft = (patch = {}) => ({
  name: 'Texto',
  aliases: ['Texto'],
  category: 'concept',
  summary: 'Texto final.',
  certainty: 'uncertain',
  disambiguation: '',
  revealAfterChapterId: 'chapter-1',
  evidence: [{ chapterId: 'chapter-1', quote: 'Texto final 1.' }],
  facts: [],
  relationships: [],
  appearances: [],
  ...patch,
});
async function preparedGuide() {
  const f = await fixture();
  await f.api.startLiteraryPublication(uid, f.input);
  const prepared = await until(f, (value) => value.state === 'prepared');
  return {
    ...f,
    prepared,
    guide: createLiteraryPublicationGuideService({ db: f.db, now: () => 400 }),
    confirmation: createLiteraryPublicationConfirmationService({ db: f.db, now: () => 500 }),
  };
}
const saveGuide = (f, patch = {}) => ({
  ...command,
  id: 'public-identity',
  operationId: 'save-public-guide-0001',
  expectedRevision: 0,
  expectedManifestHash: f.prepared.manifestHash,
  guide: guideDraft(),
  ...patch,
});
async function verifyGuide(f) {
  const job = await f.api.getLiteraryPublication(uid, command);
  await f.guide.startLiteraryPublicationGuideVerification(uid, {
    ...command,
    expectedGuideRevision: job.guideRevision,
    expectedManifestHash: job.manifestHash,
  });
  for (let index = 0; index < 40; index++) {
    const result = await f.guide.advanceLiteraryPublicationGuide(uid, command);
    if (result.state === 'verified') return result;
  }
  assert.fail('Guide did not finish verification');
}
const release = (job) => ({
  ...command,
  operationId: 'release-public-edition-0001',
  expectedManifestHash: job.manifestHash,
  expectedGuideHash: job.guideHash,
  expectedRemovalHash: job.removalHash,
  checks: {
    wholeTextChecked: true,
    guideChecked: true,
    removalsChecked: true,
    authorizePublicRelease: true,
  },
});
test('public guide CAS and historical save replay preserve exact accepted revision without overwriting a successor', async () => {
  const f = await preparedGuide(),
    input = saveGuide(f);
  const first = await f.guide.saveLiteraryPublicationGuideEntry(uid, input);
  assert.equal(first.revision, 1);
  const second = await f.guide.saveLiteraryPublicationGuideEntry(uid, {
    ...input,
    operationId: 'save-public-guide-0002',
    expectedRevision: 1,
    guide: guideDraft({ summary: 'Versão posterior.' }),
  });
  assert.equal(second.revision, 2);
  const before = structuredClone([...f.records]);
  assert.deepEqual(await f.guide.saveLiteraryPublicationGuideEntry(uid, input), first);
  assert.deepEqual([...f.records], before);
  await assert.rejects(
    f.guide.saveLiteraryPublicationGuideEntry(uid, {
      ...input,
      operationId: 'save-public-guide-stale',
    }),
    { code: 'failed-precondition' },
  );
  await assert.rejects(f.guide.saveLiteraryPublicationGuideEntry('other', input), {
    code: 'not-found',
  });
  assert.equal(
    (await f.guide.getLiteraryPublicationGuideEntry(uid, { ...command, id: input.id })).guide
      .summary,
    'Versão posterior.',
  );
  assert.equal(f.records.get('users/author').credits, 7);
});
test('literal evidence verification rejects invented citations and never makes the private edition publicly addressable', async () => {
  const f = await preparedGuide();
  await f.guide.saveLiteraryPublicationGuideEntry(
    uid,
    saveGuide(f, {
      guide: guideDraft({ evidence: [{ chapterId: 'chapter-1', quote: 'Citação inventada.' }] }),
    }),
  );
  await assert.rejects(verifyGuide(f), { code: 'failed-precondition' });
  assert.equal(f.records.has('publicBooks/book'), false);
  assert.equal(f.records.has('publicBooks/book/revisions/' + jobId), false);
  assert.equal(f.records.get('books/book').status, 'draft');
  assert.equal(f.records.get('users/author').credits, 7);
});
test('guide verification preserves uncertainty but projects no private evidence, author data or editorial metadata', async () => {
  const f = await preparedGuide();
  await f.guide.saveLiteraryPublicationGuideEntry(uid, saveGuide(f));
  const verified = await verifyGuide(f);
  assert.equal(verified.verifiedGuideEntries, 1);
  assert.match(verified.guideHash, /^[a-f0-9]{64}$/);
  const publicEntry = f.records.get(
    'publicBooks/book/revisions/' + jobId + '/lore/public-identity',
  );
  assert.equal(publicEntry.certainty, 'uncertain');
  assert.deepEqual(publicEntry.readerGuide, {
    version: 1,
    bookId: 'book',
    revisionId: jobId,
    chapterId: 'chapter-1',
  });
  for (const forbidden of [
    'evidence',
    'quote',
    'entryHash',
    'proofHash',
    'bookToken',
    'operationId',
    'updatedAt',
  ])
    assert.equal(Object.hasOwn(publicEntry, forbidden), false, forbidden);
  assert.equal(JSON.stringify(publicEntry).includes('PRIVATE'), false);
  assert.equal(f.records.has('publicBooks/book'), false);
});
test('publication requires all explicit checks and current hashes; accepted release and historical replay never republish a withdrawn edition', async () => {
  const f = await preparedGuide();
  await f.guide.saveLiteraryPublicationGuideEntry(uid, saveGuide(f));
  const verified = await verifyGuide(f),
    input = release(verified);
  for (const key of Object.keys(input.checks)) {
    const before = structuredClone([...f.records]);
    await assert.rejects(
      f.confirmation.confirmLiteraryPublication(uid, {
        ...input,
        checks: { ...input.checks, [key]: false },
      }),
      { code: 'invalid-argument' },
    );
    assert.deepEqual([...f.records], before);
  }
  await assert.rejects(
    f.confirmation.confirmLiteraryPublication(uid, { ...input, expectedGuideHash: 'f'.repeat(64) }),
    { code: 'failed-precondition' },
  );
  const result = await f.confirmation.confirmLiteraryPublication(uid, input);
  assert.equal(result.publicationConfirmed, true);
  assert.equal(result.currentPointerMatches, true);
  assert.equal(f.records.get('publicBooks/book').revisionId, jobId);
  assert.equal(f.records.get('books/book').status, 'published');
  assert.equal(f.records.get('users/author').credits, 7);
  f.records.delete('publicBooks/book');
  f.records.get('books/book').status = 'draft';
  const before = structuredClone([...f.records]);
  const replay = await f.confirmation.confirmLiteraryPublication(uid, input);
  assert.equal(replay.currentPointerMatches, false);
  assert.equal(replay.editionHash, result.editionHash);
  assert.deepEqual([...f.records], before);
});

const setPublicationUnit = (f, unit, revision = 1) => {
  f.records.set('books/book/literaryProduction/current', {
    revision,
    updatedAt: 250 + revision,
    contract: {
      schemaVersion: 1,
      fields: {},
      decisions: [],
      publicationPolicy: { version: 1, unit },
    },
  });
};
test('new publication must match the typed contract unit without writing or charging on mismatch', async () => {
  const f = await fixture();
  setPublicationUnit(f, 'chapter');
  const before = structuredClone([...f.records]);
  await assert.rejects(f.api.startLiteraryPublication(uid, f.input), {
    code: 'failed-precondition',
  });
  assert.deepEqual([...f.records], before);
  assert.equal(f.records.has('books/book/literaryPublications/' + jobId), false);
});
test('matching saved unit is accepted while historical registration replay retains its original scope', async () => {
  const f = await fixture();
  setPublicationUnit(f, 'book');
  const first = await f.api.startLiteraryPublication(uid, f.input);
  setPublicationUnit(f, 'chapter', 2);
  const replay = await f.api.startLiteraryPublication(uid, f.input);
  assert.equal(replay.jobId, first.jobId);
  assert.equal(replay.policy, 'book');
  const before = structuredClone([...f.records]);
  await assert.rejects(
    f.api.startLiteraryPublication(uid, { ...f.input, jobId: 'another-publication-0001' }),
    { code: 'failed-precondition' },
  );
  assert.deepEqual([...f.records], before);
});
test('final confirmation checks the contract unit even when an out-of-protocol writer omitted its root clock', async () => {
  const f = await preparedGuide();
  const job = await verifyGuide(f);
  setPublicationUnit(f, 'act');
  const before = structuredClone([...f.records]);
  await assert.rejects(f.confirmation.confirmLiteraryPublication(uid, release(job)), {
    code: 'failed-precondition',
  });
  assert.deepEqual([...f.records], before);
  assert.equal(f.records.has('publicBooks/book'), false);
});
test('a confirmed edition remains resolvable after a publication policy change without publishing again', async () => {
  const f = await preparedGuide();
  const job = await verifyGuide(f);
  const input = release(job);
  const first = await f.confirmation.confirmLiteraryPublication(uid, input);
  setPublicationUnit(f, 'chapter');
  const before = structuredClone([...f.records]);
  const replay = await f.confirmation.confirmLiteraryPublication(uid, input);
  assert.equal(replay.editionHash, first.editionHash);
  assert.deepEqual([...f.records], before);
});

const publicationPassage = (f, options) =>
  f.db.runTransaction((tx) =>
    captureLiteraryPublicationPassage(
      tx,
      workScope(f.db, uid, { target }, []),
      jobId,
      f.chapterIds[0],
      options,
    ),
  );

test('a prepared edition cannot prove publication passage, even if the root status is published', async () => {
  const f = await preparedGuide();
  f.records.set('books/book', { ...f.records.get('books/book'), status: 'published' });
  const before = structuredClone([...f.records]);
  await assert.rejects(publicationPassage(f), { code: 'failed-precondition' });
  assert.deepEqual([...f.records], before);
});

test('publication passage binds the confirmed edition and actual chapter projection without writing', async () => {
  const f = await preparedGuide();
  const verified = await verifyGuide(f);
  const result = await f.confirmation.confirmLiteraryPublication(uid, release(verified));
  const before = structuredClone([...f.records]);
  const proof = await publicationPassage(f);
  assert.equal(proof.editionHash, result.editionHash);
  assert.equal(proof.publicationId, jobId);
  assert.equal(proof.chapterId, f.chapterIds[0]);
  assert.equal(Object.hasOwn(proof, 'content'), false);
  assert.deepEqual([...f.records], before);
});

test('withdrawn or replaced public pointer prevents new entry but does not revoke an entry already passed', async () => {
  const f = await preparedGuide();
  await f.confirmation.confirmLiteraryPublication(uid, release(await verifyGuide(f)));
  const proof = await publicationPassage(f);
  f.records.delete('publicBooks/book');
  f.records.set('books/book', { ...f.records.get('books/book'), status: 'draft' });
  await assert.rejects(publicationPassage(f), { code: 'failed-precondition' });
  assert.deepEqual(await publicationPassage(f, { entered: true }), proof);
});

test('a changed public projection or manuscript cannot reuse the publication entry certificate', async () => {
  for (const source of ['projection', 'manuscript']) {
    const f = await preparedGuide();
    await f.confirmation.confirmLiteraryPublication(uid, release(await verifyGuide(f)));
    await publicationPassage(f);
    const path =
      source === 'projection'
        ? 'publicBooks/book/revisions/' + jobId + '/chapters/' + f.chapterIds[0]
        : 'books/book/chapters/' + f.chapterIds[0];
    await f.db.runTransaction(async (tx) => {
      const ref = f.db.doc(path);
      await tx.get(ref);
      tx.update(ref, { content: '<p>Texto alterado depois da confirmação.</p>' });
    });
    await assert.rejects(publicationPassage(f, { entered: true }), { code: 'failed-precondition' });
  }
});

test('recreating a public chapter with identical bytes changes the native entry proof', async () => {
  const f = await preparedGuide();
  await f.confirmation.confirmLiteraryPublication(uid, release(await verifyGuide(f)));
  const proof = await publicationPassage(f);
  const ref = f.db.doc('publicBooks/book/revisions/' + jobId + '/chapters/' + f.chapterIds[0]);
  let copy;
  await f.db.runTransaction(async (tx) => {
    copy = (await tx.get(ref)).data();
    tx.delete(ref);
  });
  await f.db.runTransaction(async (tx) => {
    await tx.get(ref);
    tx.create(ref, copy);
  });
  const recreated = await publicationPassage(f, { entered: true });
  assert.equal(recreated.projectionHash, proof.projectionHash);
  assert.notDeepEqual(recreated.publicChapterBirth, proof.publicChapterBirth);
  assert.notEqual(digest(recreated), digest(proof));
});

async function confirmedActInspectionFixture() {
  const base = await fixture({ chapters: 14, acts: true });
  await base.api.startLiteraryPublication(uid, base.input);
  const prepared = await until(base, (value) => value.state === 'prepared');
  const f = {
    ...base,
    prepared,
    guide: createLiteraryPublicationGuideService({ db: base.db, now: () => 400 }),
    confirmation: createLiteraryPublicationConfirmationService({ db: base.db, now: () => 500 }),
  };
  await f.confirmation.confirmLiteraryPublication(uid, release(await verifyGuide(f)));
  const contract = emptyEditorialContract();
  contract.publicationPolicy = { version: 1, unit: 'act', requirePreviousPublication: true };
  await createLiteraryProductionService({ db: f.db, now: () => 600 }).saveLiteraryContract(uid, {
    target,
    operationId: 'act-publication-policy-0001',
    expectedRevision: 0,
    contract,
  });
  const inspection = createLiteraryPassageInspectionService({ db: f.db, now: () => 700 });
  const inspectionId = 'act-publication-inspection-0001',
    chapterId = 'chapter-8';
  const source = await inspection.getLiteraryPassageInspectionScope(uid, { target, chapterId });
  await inspection.startLiteraryPassageInspection(uid, {
    target,
    inspectionId,
    chapterId,
    publicationId: jobId,
    expectedScopeToken: source.scopeToken,
  });
  let state = await inspection.getLiteraryPassageInspection(uid, { target, inspectionId });
  async function advance() {
    state = await inspection.advanceLiteraryPassageInspection(uid, {
      target,
      inspectionId,
      expectedOriginToken: state.originToken,
      expectedRevision: state.revision,
    });
    return state;
  }
  return { ...f, inspection, inspectionId, chapterId, advance, state: () => state };
}

test('crossing an act verifies every published chapter through bounded pages before issuing its certificate', async () => {
  const f = await confirmedActInspectionFixture();
  for (let n = 0; n < 50 && f.state().state !== 'publication'; n++) await f.advance();
  assert.equal(f.state().state, 'publication');
  assert.equal(f.state().publication, null);
  for (let n = 0; n < 50 && f.state().state !== 'ready'; n++) await f.advance();
  assert.equal(f.state().state, 'ready');
  assert.equal(f.state().publication.count, 7);
  assert.deepEqual(f.state().publication.scope, { kind: 'act', id: 'first' });
  const proof = await f.db.runTransaction((tx) =>
    readLiteraryPassageInspection(tx, f.c, f.inspectionId, f.chapterId),
  );
  assert.equal(proof.publication.count, 7);
  assert.equal(proof.publication.censusCount, 14);
});

test('an unavailable chapter anywhere in the preceding act prevents ready even when its last chapter is published', async () => {
  const f = await confirmedActInspectionFixture();
  f.records.delete('publicBooks/book/revisions/' + jobId + '/chapters/chapter-1');
  await assert.rejects(
    (async () => {
      for (let n = 0; n < 50 && f.state().state !== 'ready'; n++) await f.advance();
    })(),
    { code: 'failed-precondition' },
  );
  assert.notEqual(f.state().state, 'ready');
  await assert.rejects(
    f.db.runTransaction((tx) =>
      readLiteraryPassageInspection(tx, f.c, f.inspectionId, f.chapterId),
    ),
    { code: 'failed-precondition' },
  );
});

test('saving a guide creates its prose-free dependency index and immutable version in the same transaction', async () => {
  const f = await preparedGuide();
  const before = f.records.get('books/book').literaryDependencyRevision ?? 0;
  await f.guide.saveLiteraryPublicationGuideEntry(uid, saveGuide(f));
  const versionId = digest({ jobId, id: 'public-identity', revision: 1 });
  const value = f.records.get('books/book/literaryPublicationGuideVersions/' + versionId);
  const index = f.records.get('books/book/literaryPublicationGuideDependencies/' + versionId);
  assert.equal(index.versionId, versionId);
  assert.equal(value.dependencyIndexHash, index.indexHash);
  assert.deepEqual(index.chapterIds, ['chapter-1']);
  assert.deepEqual(index.targetIds, []);
  assert.equal(index.mode, 'co-created');
  assert.equal(Object.hasOwn(index, 'guide'), false);
  assert.equal(Object.hasOwn(index, 'quote'), false);
  assert.equal(JSON.stringify(index).includes('Texto final'), false);
  assert.equal(f.records.get('books/book').literaryDependencyRevision, before + 1);
  const snapshot = structuredClone([...f.records]);
  await f.guide.saveLiteraryPublicationGuideEntry(uid, saveGuide(f));
  assert.deepEqual([...f.records], snapshot);
});
