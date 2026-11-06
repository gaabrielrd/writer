import test from 'node:test';
import assert from 'node:assert/strict';
import { studioDb } from './helpers/studioDb.mjs';
import { createLiteraryImpactService } from '../src/literaryImpact.mjs';
import {
  createLiteraryGuideDependencyIndex,
  guideDependencyVersionId,
} from '../src/literaryPublicationGuideDependencies.mjs';
import { normalizeLiteraryReaderGuide } from '../src/literaryReaderGuideProtocol.mjs';
import { readLiteraryPublicationBook } from '../src/literaryPublicationContracts.mjs';
import { workScope, digest } from '../src/workProgressContracts.mjs';
const uid = 'author',
  target = { kind: 'book', id: 'book' },
  jobId = 'impact-map-000001',
  requestHash = 'a'.repeat(64);
const seed = { kind: 'book', id: 'book', scopeKind: 'book', scopeId: 'book' };
async function fixture({ prepareIndices = false, legacyGap = true } = {}) {
  const f = studioDb({ sharedBirth: true });
  f.records.set('books/book', {
    authorId: uid,
    title: 'PRIVATE BOOK',
    updatedAt: 10,
    status: 'draft',
  });
  f.records.set('books/book/chapters/chapter', {
    bookId: 'book',
    ownerId: uid,
    title: 'PRIVATE CHAPTER',
    order: 0,
    contentMode: 'legacy',
    content: 'PRIVATE BODY',
  });
  if (legacyGap)
    f.records.set(
      'users/author/chapterChats/book/chapters/chapter/conversations/legacy/messages/old',
      { id: 'old', role: 'assistant', state: 'done', answer: 'PRIVATE OLD ANSWER' },
    );
  const api = createLiteraryImpactService({ db: f.db, now: () => 100 });
  const intent = { target, bookIds: ['book'], sources: [seed], prepareIndices };
  const scope = await api.getLiteraryImpactScope(uid, intent);
  const start = {
    ...intent,
    jobId,
    expectedBookToken: scope.bookToken,
    expectedScopeToken: scope.scopeToken,
    requestHash,
  };
  let sequence = 0;
  const get = () => api.getLiteraryImpact(uid, { target, jobId });
  const wire = async () => {
    const frame = await get();
    return {
      target,
      jobId,
      operationId: 'impact-step-' + String(++sequence).padStart(8, '0'),
      expectedOriginToken: frame.originToken,
      expectedRevision: frame.revision,
      requestHash,
    };
  };
  const advance = async () => api.advanceLiteraryImpact(uid, await wire());
  const until = async (predicate) => {
    for (let n = 0; n < 2000; n++) {
      const frame = await get();
      if (predicate(frame)) return frame;
      await advance();
    }
    throw new Error('Fixture map did not reach its checkpoint');
  };
  const page = async (kind, extra = {}) =>
    api.readLiteraryImpactPage(uid, {
      target,
      jobId,
      expectedOriginToken: (await get()).originToken,
      kind,
      ...extra,
    });
  return { ...f, api, intent, start, get, wire, advance, until, page };
}

test('preflight is read-only and start freezes explicit scope without reading chapter prose', async () => {
  const f = await fixture();
  const before = structuredClone([...f.records]);
  await f.api.getLiteraryImpactScope(uid, f.intent);
  assert.deepEqual([...f.records], before);
  const started = await f.api.startLiteraryImpact(uid, f.start);
  assert.equal(started.phase, 'freezing');
  assert.equal(started.publicationReady, false);
  const snapshot = structuredClone([...f.records]);
  await f.api.startLiteraryImpact(uid, f.start);
  assert.deepEqual([...f.records], snapshot);
  assert.equal(JSON.stringify(started).includes('PRIVATE'), false);
  assert.equal(f.records.has('books/book/literaryImpactJobs/' + jobId), false);
});

test('registered census is collected, reconfirmed, traversed and checked again with historical gaps explicit', async () => {
  const f = await fixture();
  await f.api.startLiteraryImpact(uid, f.start);
  const phases = new Set();
  const done = await f.until((frame) => {
    phases.add(frame.phase);
    return ['done', 'partial'].includes(frame.phase);
  });
  assert.equal(done.phase, 'partial');
  assert.equal(done.coverage.complete, false);
  assert.ok(
    done.coverage.unsupported.some((row) => row.inventory.includes('unindexed-origin-coverage')),
  );
  assert.ok(
    phases.has('collecting') &&
      phases.has('confirming') &&
      phases.has('traversing') &&
      phases.has('final-census'),
  );
  assert.equal(done.graph.propagationComplete, true);
  assert.equal(done.semanticCompleteness, false);
  assert.equal(done.authorAccepted, false);
  const nodes = await f.page('nodes');
  assert.equal(JSON.stringify(nodes).includes('PRIVATE BODY'), false);
  assert.equal(nodes.items.find((row) => row.node.kind === 'book').label, 'PRIVATE BOOK');
  assert.equal(nodes.labelsAreCurrent, true);
  assert.ok(nodes.items.some((row) => row.node.kind === 'book'));
});

test('advance replay returns its original result and cannot consume the next checkpoint', async () => {
  const f = await fixture();
  await f.api.startLiteraryImpact(uid, f.start);
  const original = await f.wire(),
    first = await f.api.advanceLiteraryImpact(uid, original),
    snapshot = structuredClone([...f.records]);
  assert.deepEqual(await f.api.advanceLiteraryImpact(uid, original), first);
  assert.deepEqual([...f.records], snapshot);
  await assert.rejects(
    f.api.advanceLiteraryImpact(uid, {
      ...original,
      expectedRevision: original.expectedRevision + 1,
    }),
    { code: 'invalid-argument' },
  );
  const outcome = await f.api.getLiteraryImpactOperation(uid, {
    target,
    jobId,
    operationId: original.operationId,
    requestHash,
    expectedBookToken: f.start.expectedBookToken,
  });
  assert.equal(outcome.status, 'done');
  assert.deepEqual(outcome.result, first);
});

test('simultaneous different steps at the same revision cannot both advance', async () => {
  const f = await fixture();
  await f.api.startLiteraryImpact(uid, f.start);
  const a = await f.wire(),
    b = { ...a, operationId: 'impact-race-00000001' };
  const results = await Promise.allSettled([
    f.api.advanceLiteraryImpact(uid, a),
    f.api.advanceLiteraryImpact(uid, b),
  ]);
  assert.equal(results.filter((value) => value.status === 'fulfilled').length, 1);
  assert.equal((await f.get()).revision, a.expectedRevision + 1);
});

test('native root changes invalidate the frozen fence even if semantic counters and updatedAt were not advanced', async () => {
  const f = await fixture();
  await f.api.startLiteraryImpact(uid, f.start);
  await f.advance();
  await f.db.runTransaction(async (tx) => {
    await tx.get(f.db.doc('books/book'));
    tx.update(f.db.doc('books/book'), { title: 'Changed' });
  });
  assert.equal((await f.get()).current, false);
  assert.equal((await f.advance()).phase, 'stale');
  await assert.rejects(f.page('nodes'), { code: 'failed-precondition' });
});

test('a consumer record changed between observations becomes stale without silently restarting the scan', async () => {
  const f = await fixture();
  f.records.set('books/book/acts/act', { name: 'Ato', order: 0 });
  f.records.get('books/book/chapters/chapter').actId = 'act';
  await f.api.startLiteraryImpact(uid, f.start);
  await f.until(
    () =>
      f.records.get('books/book/literaryImpactControls/' + jobId)?.pendingRecord?.id === 'chapter',
  );
  await f.db.runTransaction(async (tx) => {
    const row = f.db.doc('books/book/chapters/chapter');
    await tx.get(row);
    tx.update(row, { actId: 'moved' });
  });
  const stopped = await f.advance();
  assert.equal(stopped.phase, 'stale');
  assert.equal(stopped.reason, 'record-changed');
});

test('the original book or controller incarnation cannot be substituted after recreation', async () => {
  for (const path of ['books/book', 'books/book/literaryImpactControls/' + jobId]) {
    const f = await fixture();
    await f.api.startLiteraryImpact(uid, f.start);
    const wire = await f.wire();
    f.metadata.set(path, { createdAt: 8000, updatedAt: 8000 });
    await assert.rejects(f.api.advanceLiteraryImpact(uid, wire), { code: 'failed-precondition' });
  }
});

test('canceling an unobserved start reserves a permanent closed intent and a late start cannot activate it', async () => {
  const f = await fixture();
  await f.api.cancelLiteraryImpact(uid, {
    target,
    jobId,
    operationId: 'impact-cancel-000001',
    start: f.start,
    requestHash,
  });
  const late = await f.api.startLiteraryImpact(uid, f.start);
  assert.equal(late.phase, 'canceled');
  assert.equal(f.records.has('books/book/literaryImpactJobs/' + jobId), false);
  assert.equal(
    [...f.records.keys()].some((path) => path.includes('literaryPublicationGuideDependencies/')),
    false,
  );
});

test('cancellation remains available after a selected volume is revoked and receipts cannot be adopted by another intent', async () => {
  const f = await fixture();
  f.records.set('books/other', { authorId: uid, updatedAt: 10 });
  const intent = { ...f.intent, bookIds: ['book', 'other'] },
    scope = await f.api.getLiteraryImpactScope(uid, intent);
  await f.api.startLiteraryImpact(uid, {
    ...intent,
    jobId,
    requestHash,
    expectedBookToken: scope.bookToken,
    expectedScopeToken: scope.scopeToken,
  });
  const frame = await f.get();
  f.records.get('books/other').authorId = 'other';
  assert.equal((await f.get()).current, false);
  const input = {
    target,
    jobId,
    operationId: 'impact-cancel-000001',
    expectedOriginToken: frame.originToken,
    requestHash,
  };
  const closed = await f.api.cancelLiteraryImpact(uid, input);
  assert.equal(closed.phase, 'canceled');
  assert.deepEqual(await f.api.cancelLiteraryImpact(uid, input), closed);
  await assert.rejects(f.api.cancelLiteraryImpact(uid, { ...input, requestHash: 'b'.repeat(64) }), {
    code: 'invalid-argument',
  });
});

test('old page pointers cannot silently read a different native control', async () => {
  const f = await fixture();
  await f.api.startLiteraryImpact(uid, f.start);
  await assert.rejects(
    f.api.readLiteraryImpactPage(uid, {
      target,
      jobId,
      expectedOriginToken: '0'.repeat(64),
      kind: 'nodes',
    }),
    { code: 'failed-precondition' },
  );
});

test('manual resolution requires the observed check, rationale and evidence, then preserves revision history without publication grants', async () => {
  const f = await fixture();
  await f.api.startLiteraryImpact(uid, f.start);
  await f.until((frame) => frame.phase === 'partial');
  const frame = await f.get(),
    check = (await f.page('checks')).items[0];
  const input = {
    target,
    jobId,
    operationId: 'impact-resolve-000001',
    expectedOriginToken: frame.originToken,
    expectedRevision: frame.revision,
    checkId: check.id,
    observationToken: check.observationToken,
    expectedDecisionRevision: 0,
    status: 'reviewed',
    rationale: 'Conferi o escopo.',
    evidence: [{ note: 'A composição foi comparada pelo autor.' }],
    requestHash,
  };
  const result = await f.api.resolveLiteraryImpact(uid, input);
  assert.equal(result.decisionRevision, 1);
  assert.equal(result.publicationReady, false);
  const snapshot = structuredClone([...f.records]);
  assert.deepEqual(await f.api.resolveLiteraryImpact(uid, input), result);
  assert.deepEqual([...f.records], snapshot);
  assert.equal((await f.page('decisions')).items[0].rationale, input.rationale);
  assert.ok(
    [...f.records.keys()].some((path) => path.includes('/literaryImpactDecisionVersions/')),
  );
});

test('resolution cannot accept an unknown check proof or omit evidence for dismissal', async () => {
  const f = await fixture();
  await f.api.startLiteraryImpact(uid, f.start);
  await f.until((frame) => frame.phase === 'partial');
  const frame = await f.get(),
    check = (await f.page('checks')).items[0];
  const input = {
    target,
    jobId,
    operationId: 'impact-resolve-000001',
    expectedOriginToken: frame.originToken,
    expectedRevision: frame.revision,
    checkId: check.id,
    observationToken: '0'.repeat(64),
    expectedDecisionRevision: 0,
    status: 'dismissed',
    rationale: 'Conferido',
    evidence: [{ note: 'Conferido' }],
    requestHash,
  };
  await assert.rejects(f.api.resolveLiteraryImpact(uid, input), { code: 'failed-precondition' });
  await assert.rejects(f.api.resolveLiteraryImpact(uid, { ...input, evidence: [] }), {
    code: 'invalid-argument',
  });
});

test('guide index preparation uses a persisted preflight and never runs from a read or a start without consent', async () => {
  const f = await fixture({ prepareIndices: true });
  const c = workScope(f.db, uid, { target }, []);
  const { bookToken } = await f.db.runTransaction((tx) => readLiteraryPublicationBook(tx, c));
  const guide = normalizeLiteraryReaderGuide({
    name: 'N',
    aliases: [],
    category: 'concept',
    summary: 'S',
    certainty: 'uncertain',
    disambiguation: '',
    revealAfterChapterId: 'chapter',
    evidence: [{ chapterId: 'chapter', quote: 'PRIVATE' }],
    facts: [],
    relationships: [],
    appearances: [],
  });
  const value = {
      version: 1,
      jobId: 'edition',
      id: 'guide',
      revision: 1,
      bookToken,
      deleted: false,
      guide,
      entryHash: digest(guide),
    },
    versionId = guideDependencyVersionId(value);
  f.records.set('books/book/literaryPublications/edition', {
    schemaVersion: 1,
    jobId: 'edition',
    bookToken,
  });
  f.records.set('books/book/literaryPublicationGuideVersions/' + versionId, value);
  assert.equal(createLiteraryGuideDependencyIndex(value).mode, 'co-created');
  await f.api.startLiteraryImpact(uid, f.start);
  await f.get();
  assert.equal(
    f.records.has('books/book/literaryPublicationGuideDependencies/' + versionId),
    false,
  );
  const pending = await f.advance();
  assert.equal(pending.pendingIndex.versionId, versionId);
  const prepared = await f.advance();
  assert.equal(prepared.pendingIndex, null);
  assert.ok(f.records.has('books/book/literaryPublicationGuideDependencies/' + versionId));
  await f.until((frame) => frame.phase === 'partial');
  assert.equal((await f.get()).current, true);
});

test('public inputs cannot supply links, census, fence tokens or backfill bodies as execution grants', async () => {
  const f = await fixture();
  for (const key of ['links', 'census', 'sourceFence', 'guide'])
    await assert.rejects(f.api.startLiteraryImpact(uid, { ...f.start, [key]: [] }), {
      code: 'invalid-argument',
    });
  await assert.rejects(f.api.getLiteraryImpactScope('other', f.intent), { code: 'not-found' });
});

test('a graph recreated under the same ID and source fence cannot inherit an existing control', async () => {
  const f = await fixture();
  await f.api.startLiteraryImpact(uid, f.start);
  await f.advance();
  f.metadata.set('books/book/literaryImpactJobs/' + jobId, { createdAt: 9000, updatedAt: 9000 });
  assert.equal((await f.get()).current, false);
  assert.equal((await f.advance()).phase, 'stale');
});

test('an explicit operation fence cancels an unobserved advance and its late retry cannot consume a step', async () => {
  const f = await fixture();
  await f.api.startLiteraryImpact(uid, f.start);
  const input = await f.wire(),
    before = await f.get();
  const close = {
    target,
    jobId,
    operationId: input.operationId,
    method: 'advanceLiteraryImpact',
    requestHash: input.requestHash,
    expectedOriginToken: input.expectedOriginToken,
  };
  const result = await f.api.cancelLiteraryImpactOperation(uid, close);
  assert.equal(result.status, 'canceled');
  assert.deepEqual(await f.api.cancelLiteraryImpactOperation(uid, close), result);
  assert.deepEqual(await f.api.advanceLiteraryImpact(uid, input), result.result);
  assert.equal((await f.get()).revision, before.revision);
  assert.equal(f.records.has('books/book/literaryImpactJobs/' + jobId), false);
  assert.equal(
    (
      await f.api.getLiteraryImpactOperation(uid, {
        target,
        jobId,
        operationId: input.operationId,
        requestHash: input.requestHash,
        expectedBookToken: before.bookToken,
      })
    ).status,
    'canceled',
  );
});
test('closing an already applied step returns its original receipt without advancing or canceling the whole map', async () => {
  const f = await fixture();
  await f.api.startLiteraryImpact(uid, f.start);
  const input = await f.wire(),
    first = await f.api.advanceLiteraryImpact(uid, input);
  const result = await f.api.cancelLiteraryImpactOperation(uid, {
    target,
    jobId,
    operationId: input.operationId,
    method: 'advanceLiteraryImpact',
    requestHash: input.requestHash,
    expectedOriginToken: input.expectedOriginToken,
  });
  assert.equal(result.status, 'done');
  assert.deepEqual(result.result, first);
  assert.equal((await f.get()).revision, first.revision);
  assert.notEqual((await f.get()).phase, 'canceled');
});
test('a closed resolution cannot save private notes on a late retry even when the map later becomes reviewable', async () => {
  const f = await fixture();
  await f.api.startLiteraryImpact(uid, f.start);
  const frame = await f.get(),
    operationId = 'impact-resolve-closed';
  const close = {
    target,
    jobId,
    operationId,
    method: 'resolveLiteraryImpact',
    requestHash,
    expectedOriginToken: frame.originToken,
  };
  const result = await f.api.cancelLiteraryImpactOperation(uid, close);
  const retried = await f.api.resolveLiteraryImpact(uid, {
    target,
    jobId,
    operationId,
    expectedOriginToken: frame.originToken,
    expectedRevision: frame.revision,
    requestHash,
    checkId: 'c'.repeat(64),
    observationToken: 'f'.repeat(64),
    expectedDecisionRevision: 0,
    status: 'reviewed',
    rationale: 'PRIVATE LATE NOTE',
    evidence: [{ note: 'PRIVATE LATE EVIDENCE' }],
  });
  assert.deepEqual(retried, result.result);
  assert.equal(JSON.stringify([...f.records]).includes('PRIVATE LATE'), false);
});
test('operation fences bind actor, native control, method and original request hash', async () => {
  const f = await fixture();
  await f.api.startLiteraryImpact(uid, f.start);
  const input = await f.wire();
  const close = {
    target,
    jobId,
    operationId: input.operationId,
    method: 'advanceLiteraryImpact',
    requestHash,
    expectedOriginToken: input.expectedOriginToken,
  };
  await f.api.cancelLiteraryImpactOperation(uid, close);
  await assert.rejects(
    f.api.cancelLiteraryImpactOperation(uid, { ...close, requestHash: 'b'.repeat(64) }),
    { code: 'invalid-argument' },
  );
  await assert.rejects(
    f.api.cancelLiteraryImpactOperation(uid, { ...close, method: 'resolveLiteraryImpact' }),
    { code: 'invalid-argument' },
  );
  await assert.rejects(
    f.api.cancelLiteraryImpactOperation(uid, { ...close, expectedOriginToken: 'f'.repeat(64) }),
    { code: 'failed-precondition' },
  );
  await assert.rejects(f.api.cancelLiteraryImpactOperation('other', close), { code: 'not-found' });
  await assert.rejects(f.api.cancelLiteraryImpactOperation(uid, { ...close, operationId: jobId }), {
    code: 'invalid-argument',
  });
});
test('an operation fence receipt cannot masquerade as a whole-map cancellation receipt', async () => {
  const f = await fixture();
  await f.api.startLiteraryImpact(uid, f.start);
  const input = await f.wire();
  await f.api.cancelLiteraryImpactOperation(uid, {
    target,
    jobId,
    operationId: input.operationId,
    method: 'advanceLiteraryImpact',
    requestHash,
    expectedOriginToken: input.expectedOriginToken,
  });
  await assert.rejects(
    f.api.cancelLiteraryImpact(uid, {
      target,
      jobId,
      operationId: input.operationId,
      requestHash,
      expectedOriginToken: input.expectedOriginToken,
    }),
    { code: 'failed-precondition' },
  );
  assert.notEqual((await f.get()).phase, 'canceled');
});

test('a gap-free book can finish the registered census without claiming historical or semantic completeness', async () => {
  const f = await fixture({ legacyGap: false });
  await f.api.startLiteraryImpact(uid, f.start);
  const complete = await f.until((frame) => ['done', 'partial'].includes(frame.phase));
  assert.equal(complete.phase, 'done');
  assert.equal(complete.coverage.complete, true);
  assert.equal(complete.coverage.scope, 'registered-dependencies');
  assert.equal(complete.semanticCompleteness, false);
  assert.equal(complete.publicationReady, false);
  assert.equal(complete.authorAccepted, false);
});
test('an unindexed native record introduced without a clock during confirmation changes the census instead of certifying absence', async () => {
  const f = await fixture({ legacyGap: false });
  await f.api.startLiteraryImpact(uid, f.start);
  await f.until((frame) => frame.phase === 'confirming');
  f.records.set(
    'users/author/chapterChats/book/chapters/removed/conversations/removed/messages/late',
    { id: 'late', role: 'assistant', state: 'done', answer: 'PRIVATE LATE BODY' },
  );
  const stopped = await f.until((frame) => ['done', 'partial', 'stale'].includes(frame.phase));
  assert.equal(stopped.phase, 'stale');
  assert.equal(stopped.publicationReady, false);
});

test('impact can audit an old private conversation without granting or repairing its missing native catalog', async () => {
  const f = await fixture({ legacyGap: false });
  f.records.set('users/author/editorChats/old', {
    schemaVersion: 1,
    ownerId: uid,
    conversationId: 'old',
    summary: {
      target,
      resource: { kind: 'scene', id: 'scene' },
      conversationToken: 'a'.repeat(64),
      state: 'open',
    },
    cleanupId: null,
  });
  await f.api.startLiteraryImpact(uid, f.start);
  const result = await f.until((frame) => ['done', 'partial'].includes(frame.phase));
  assert.equal(result.phase, 'partial');
  assert.ok(result.unsupported > 0);
  assert.equal(f.records.has('users/author/editorChatCatalogs/current'), false);
  assert.ok(
    (await f.page('checks')).items.some(
      (row) => row.facts.reason === 'native-chat-catalog-missing',
    ),
  );
});
