import test from 'node:test';
import assert from 'node:assert/strict';
import { studioDb } from './helpers/studioDb.mjs';
import { createScenesService } from '../src/scenes.mjs';
import { createLiteraryProseService } from '../src/literaryProse.mjs';
import { createLiteraryReviewService } from '../src/literaryReview.mjs';
import { literaryProseText } from '../src/literaryAIContext.mjs';
const target = { kind: 'book', id: 'book' };
const op = (n) => 'review-operation-' + String(n).padStart(4, '0');
async function fixture({
  long = false,
  blocking = false,
  failFirst = false,
  badCoverage = false,
} = {}) {
  const f = studioDb();
  f.records.set('books/book', {
    authorId: 'author',
    title: 'Livro',
    status: 'draft',
    updatedAt: 100,
    createdAt: 1,
    wordCount: 0,
  });
  const scenes = createScenesService({ db: f.db, now: () => 200 });
  const chapter = await scenes.createSceneGroup('author', {
    target,
    operationId: op(1),
    title: 'A carta',
  });
  const ids = [];
  for (let index = 0; index < 2; index++) {
    const result = await scenes.createScene('author', {
      target,
      parentId: chapter.id,
      operationId: op(2 + index),
      title: 'Cena ' + index,
      content:
        '<p>' +
        (long && index === 1 ? 'A escolha mudou a casa. '.repeat(1800) : 'Ela recebeu a carta.') +
        '</p>',
    });
    ids.push(result.scene.id);
  }
  const native = createLiteraryProseService({
    db: f.db,
    generator: async () => {
      throw new Error('No provider in workflow tests');
    },
  });
  const requests = new Map(),
    calls = [];
  let shouldFail = failFirst;
  const prose = {
    getLiteraryProseSourceInfo: (uid, input) => native.getLiteraryProseSourceInfo(uid, input),
    getLiteraryProse: async (uid, { requestId }) =>
      structuredClone(requests.get(requestId) ?? { requestId, state: 'unconfirmed' }),
    cancelLiteraryProse: async (uid, { requestId }) => {
      const result = { requestId, state: 'canceled' };
      requests.set(requestId, result);
      return result;
    },
    startLiteraryProse: async (uid, input) => {
      calls.push(structuredClone(input));
      if (shouldFail) {
        shouldFail = false;
        const result = { requestId: input.requestId, state: 'error' };
        requests.set(input.requestId, result);
        return result;
      }
      const info = await native.getLiteraryProseSourceInfo(uid, {
          target: input.target,
          chapterId: input.chapterId,
          sceneId: input.sceneId,
        }),
        part = info.segments[input.segment];
      const text = literaryProseText(
        f.records.get('books/book/scenes/' + input.sceneId + '/body/current').content,
      );
      const result = {
        requestId: input.requestId,
        state: 'done',
        current: true,
        sceneId: input.sceneId,
        chapterId: chapter.id,
        mode: input.mode,
        coverage: {
          scope: 'scene-segment',
          wholeChapter: false,
          wholeBook: false,
          sourceToken: info.sourceToken,
          sourceCharacters: text.length,
          segment: input.segment,
          segmentCount: info.segments.length,
          ...part,
          coreStart: badCoverage ? part.coreStart + 1 : part.coreStart,
        },
        result: {
          text: '',
          complete: true,
          rationale: 'Análise do segmento.',
          findings:
            blocking && input.segment === 0
              ? [
                  {
                    sourceId: 'manuscript',
                    quote: text.slice(part.start, part.start + 10),
                    offset: part.start,
                    severity: 'blocking',
                    problem: 'Decisão a resolver.',
                    action: 'Conferir a fonte.',
                  },
                ]
              : [],
        },
      };
      requests.set(input.requestId, result);
      return result;
    },
  };
  const api = createLiteraryReviewService({ db: f.db, now: () => 400, prose });
  return { ...f, api, scenes, chapterId: chapter.id, ids, native, prose, requests, calls };
}
const start = (f) => ({
  target,
  jobId: op(10),
  chapterId: f.chapterId,
  instruction: 'Confira causalidade e voz.',
});
const advance = { target, jobId: op(10) };
async function finish(f) {
  for (let index = 0; index < 200; index++) {
    const value = await f.api.advanceLiteraryReview('author', advance);
    if (value.state === 'done') return value;
    assert.equal(['stale', 'attention', 'canceled'].includes(value.state), false);
  }
  throw new Error('Workflow did not reach complete coverage');
}
test('every scene and every segment is read in both layers before chapter coverage is complete', async () => {
  const f = await fixture({ long: true });
  const started = await f.api.startLiteraryReview('author', start(f));
  assert.equal(started.coverage.wholeChapter, false);
  const result = await finish(f);
  let expected = 0;
  for (const sceneId of f.ids)
    expected +=
      (
        await f.native.getLiteraryProseSourceInfo('author', {
          target,
          chapterId: f.chapterId,
          sceneId,
        })
      ).segments.length * 2;
  assert.equal(result.analyses, expected);
  assert.equal(result.completedUnits, 2);
  assert.equal(result.coverage.wholeChapter, true);
  assert.equal(result.coverage.wholeBook, false);
  assert.equal(result.authorAccepted, false);
  assert.equal(new Set(f.calls.map((request) => request.requestId)).size, f.calls.length);
  const accepted = await f.api.acceptLiteraryReview('author', {
    ...advance,
    expectedSourceToken: result.sourceToken,
  });
  assert.equal(accepted.authorAccepted, true);
});
test('replaying an advance after completion neither generates again nor increments coverage', async () => {
  const f = await fixture();
  await f.api.startLiteraryReview('author', start(f));
  const result = await finish(f),
    count = f.calls.length;
  assert.deepEqual(await f.api.advanceLiteraryReview('author', advance), result);
  assert.equal(f.calls.length, count);
});
test('a change to actual prose revokes both chapter coverage and author acceptance', async () => {
  const f = await fixture();
  await f.api.startLiteraryReview('author', start(f));
  const result = await finish(f);
  await f.api.acceptLiteraryReview('author', {
    ...advance,
    expectedSourceToken: result.sourceToken,
  });
  const scene = await f.scenes.getScene('author', { target, sceneId: f.ids[0] });
  await f.scenes.updateScene('author', {
    target,
    sceneId: scene.id,
    operationId: op(30),
    expectedRevision: scene.revision,
    patch: { content: '<p>Uma alteração posterior.</p>' },
  });
  const stale = await f.api.getLiteraryReview('author', advance);
  assert.equal(stale.state, 'stale');
  assert.equal(stale.authorAccepted, false);
  assert.equal(stale.coverage.wholeChapter, false);
  assert.ok(
    (await f.api.listLiteraryReviewAnalyses('author', advance)).items.length > 0,
    'historical metadata remains locatable',
  );
});
test('blocking findings remain distinct from complete reading and prevent author-ready acceptance', async () => {
  const f = await fixture({ blocking: true });
  await f.api.startLiteraryReview('author', start(f));
  const result = await finish(f);
  assert.equal(result.coverage.wholeChapter, true);
  assert.ok(result.blocking > 0);
  await assert.rejects(
    f.api.acceptLiteraryReview('author', { ...advance, expectedSourceToken: result.sourceToken }),
    { code: 'failed-precondition' },
  );
});
test('an interrupted analysis only gets a new request after explicit regeneration', async () => {
  const f = await fixture({ failFirst: true });
  await f.api.startLiteraryReview('author', start(f));
  await f.api.advanceLiteraryReview('author', advance);
  assert.equal((await f.api.advanceLiteraryReview('author', advance)).state, 'attention');
  const original = f.calls[0].requestId;
  await f.api.retryLiteraryReviewAnalysis('author', advance);
  await finish(f);
  assert.notEqual(f.calls[1].requestId, original);
  assert.equal(f.calls.filter((request) => request.requestId === original).length, 1);
});
test('gaps in core ranges cannot be counted as covered text', async () => {
  const f = await fixture({ badCoverage: true });
  await f.api.startLiteraryReview('author', start(f));
  await f.api.advanceLiteraryReview('author', advance);
  await assert.rejects(f.api.advanceLiteraryReview('author', advance), {
    code: 'failed-precondition',
  });
  const state = await f.api.getLiteraryReview('author', advance);
  assert.equal(state.analyses, 0);
  assert.equal(state.coverage.wholeChapter, false);
});
test('cancellation before start prevents a late start from generating anything', async () => {
  const f = await fixture();
  await f.api.cancelLiteraryReview('author', advance);
  assert.equal((await f.api.startLiteraryReview('author', start(f))).state, 'canceled');
  assert.equal(f.calls.length, 0);
});

test('publication metadata alone does not revoke a review of unchanged manuscript and sources', async () => {
  const f = await fixture();
  await f.api.startLiteraryReview('author', start(f));
  await finish(f);
  await f.db.runTransaction(async (tx) => {
    await tx.get(f.db.doc('books/book'));
    tx.update(f.db.doc('books/book'), { status: 'published', updatedAt: 9999 });
  });
  const current = await f.api.getLiteraryReview('author', advance);
  assert.equal(current.state, 'done');
  assert.equal(current.coverage.wholeChapter, true);
});
test('a pending child can be canceled and regenerated without losing already completed analyses', async () => {
  const f = await fixture();
  const original = f.prose.startLiteraryProse;
  let pendingId;
  f.prose.startLiteraryProse = async (uid, input) => {
    pendingId = input.requestId;
    const value = { requestId: pendingId, state: 'running' };
    f.requests.set(pendingId, value);
    return value;
  };
  await f.api.startLiteraryReview('author', start(f));
  await f.api.advanceLiteraryReview('author', advance);
  const waiting = await f.api.advanceLiteraryReview('author', advance);
  assert.equal(waiting.waitingForResult, true);
  assert.equal(waiting.analyses, 0);
  const stopped = await f.api.cancelPendingLiteraryReviewAnalysis('author', advance);
  assert.equal(stopped.state, 'attention');
  assert.equal(f.requests.get(pendingId).state, 'canceled');
  await f.api.retryLiteraryReviewAnalysis('author', advance);
  f.prose.startLiteraryProse = original;
  const result = await finish(f);
  assert.equal(result.state, 'done');
  assert.equal(result.analyses, 4);
});

async function preserveReviewed(f, sourceToken) {
  for (let step = 0; step < 100; step++) {
    const value = await f.api.advanceLiteraryReviewedVersion('author', {
      ...advance,
      expectedSourceToken: sourceToken,
    });
    if (value.preservationCurrent) return value;
    assert.equal(value.preservationState, 'capturing');
  }
  throw new Error('Reviewed preservation did not complete');
}
test('an accepted complete review preserves the exact current chapter as native revised versions', async () => {
  const f = await fixture();
  await f.api.startLiteraryReview('author', start(f));
  const reviewed = await finish(f),
    before = f.ids.map((id) => f.records.get('books/book/scenes/' + id + '/body/current').content);
  await assert.rejects(
    f.api.advanceLiteraryReviewedVersion('author', {
      ...advance,
      expectedSourceToken: reviewed.sourceToken,
    }),
    { code: 'failed-precondition' },
  );
  await f.api.acceptLiteraryReview('author', {
    ...advance,
    expectedSourceToken: reviewed.sourceToken,
  });
  const result = await preserveReviewed(f, reviewed.sourceToken);
  assert.equal(result.preservationState, 'done');
  assert.equal(result.preservationCurrent, true);
  assert.deepEqual(result.preservationProgress, { planned: 2, captured: 2, verified: 2 });
  assert.ok(result.revisedMilestoneId);
  assert.deepEqual(
    f.ids.map((id) => f.records.get('books/book/scenes/' + id + '/body/current').content),
    before,
  );
  const count = [...f.records.keys()].filter((path) =>
    path.startsWith('books/book/workVersions/'),
  ).length;
  assert.equal(count, 2);
  const replay = await f.api.advanceLiteraryReviewedVersion('author', {
    ...advance,
    expectedSourceToken: reviewed.sourceToken,
  });
  assert.equal(replay.preservationCurrent, true);
  assert.equal(
    [...f.records.keys()].filter((path) => path.startsWith('books/book/workVersions/')).length,
    count,
  );
  assert.equal(f.calls.length, 4, 'preservation does not generate or review the manuscript again');
});
test('a changed manuscript cannot be marked preserved from an earlier accepted review', async () => {
  const f = await fixture();
  await f.api.startLiteraryReview('author', start(f));
  const reviewed = await finish(f);
  await f.api.acceptLiteraryReview('author', {
    ...advance,
    expectedSourceToken: reviewed.sourceToken,
  });
  await f.api.advanceLiteraryReviewedVersion('author', {
    ...advance,
    expectedSourceToken: reviewed.sourceToken,
  });
  const scene = await f.scenes.getScene('author', { target, sceneId: f.ids[0] });
  await f.scenes.updateScene('author', {
    target,
    sceneId: scene.id,
    operationId: op(41),
    expectedRevision: scene.revision,
    patch: { content: '<p>Uma nova escolha.</p>' },
  });
  const result = await f.api.advanceLiteraryReviewedVersion('author', {
    ...advance,
    expectedSourceToken: reviewed.sourceToken,
  });
  assert.equal(result.state, 'stale');
  assert.equal(result.authorAccepted, false);
  assert.equal(result.preservationCurrent, false);
});
test('history changes require reconfirming preserved versions without generating new prose', async () => {
  const f = await fixture();
  await f.api.startLiteraryReview('author', start(f));
  const reviewed = await finish(f);
  await f.api.acceptLiteraryReview('author', {
    ...advance,
    expectedSourceToken: reviewed.sourceToken,
  });
  const preserved = await preserveReviewed(f, reviewed.sourceToken);
  await f.db.runTransaction(async (tx) => {
    const root = (await tx.get(f.db.doc('books/book'))).data();
    tx.update(f.db.doc('books/book'), { historyRevision: (root.historyRevision ?? 0) + 1 });
  });
  const uncertain = await f.api.getLiteraryReview('author', advance);
  assert.equal(uncertain.preservationCurrent, false);
  assert.equal(uncertain.coverage.wholeChapter, true);
  const confirmed = await preserveReviewed(f, reviewed.sourceToken);
  assert.equal(confirmed.revisedMilestoneId, preserved.revisedMilestoneId);
  assert.equal(f.calls.length, 4);
});
test('writing another chapter does not discard a review of unchanged chapter prose', async () => {
  const f = await fixture();
  await f.api.startLiteraryReview('author', start(f));
  const reviewed = await finish(f);
  await f.api.acceptLiteraryReview('author', {
    ...advance,
    expectedSourceToken: reviewed.sourceToken,
  });
  const other = await f.scenes.createSceneGroup('author', {
    target,
    operationId: op(51),
    title: 'Outro capítulo',
  });
  await f.scenes.createScene('author', {
    target,
    parentId: other.id,
    operationId: op(52),
    title: 'Outra cena',
    content: '<p>Outro dia começou.</p>',
  });
  const retained = await f.api.getLiteraryReview('author', advance);
  assert.equal(retained.state, 'done');
  assert.equal(retained.authorAccepted, true);
  assert.equal(retained.sourceToken, reviewed.sourceToken);
});
