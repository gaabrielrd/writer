import assert from 'node:assert/strict';
import { createLiteraryImpactService } from '../../src/literaryImpact.mjs';
export const impactJobId = 'capture-impact-map';
export async function prepareLiteraryImpactCaptureFixture(
  db,
  { finish = true, sourceChapterId = null } = {},
) {
  const target = { kind: 'book', id: 'book' },
    api = createLiteraryImpactService({ db, now: () => 100 });
  const intent = {
    target,
    bookIds: ['book'],
    sources: [
      {
        kind: sourceChapterId ? 'chapter' : 'book',
        id: sourceChapterId ?? 'book',
        scopeKind: 'book',
        scopeId: 'book',
      },
    ],
    prepareIndices: false,
  };
  const scope = await api.getLiteraryImpactScope('author', intent),
    requestHash = 'a'.repeat(64);
  let frame = await api.startLiteraryImpact('author', {
    ...intent,
    jobId: impactJobId,
    expectedScopeToken: scope.scopeToken,
    expectedBookToken: scope.bookToken,
    requestHash,
  });
  let done = false;
  for (let step = 0; step < (finish ? 2000 : 2); step++) {
    if (['done', 'partial'].includes(frame.phase)) {
      done = true;
      break;
    }
    assert.equal(['stale', 'canceled'].includes(frame.phase), false, JSON.stringify(frame));
    frame = await api.advanceLiteraryImpact('author', {
      target,
      jobId: impactJobId,
      operationId: 'capture-impact-step-' + step,
      expectedOriginToken: frame.originToken,
      expectedRevision: frame.revision,
      requestHash,
    });
  }
  if (finish) assert.equal(done || ['done', 'partial'].includes(frame.phase), true);
  return { target, jobId: impactJobId, impact: api, frame };
}
