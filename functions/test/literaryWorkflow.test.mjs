import { fixture, nextChapter } from './helpers/literaryWorkflowFixtures.mjs';
import { createLiteraryIntegrationService } from '../src/literaryIntegration.mjs';
import { createWorkHistoryService } from '../src/workHistory.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyEditorialContract } from '../src/literaryContracts.mjs';
import { createLiteraryProductionService } from '../src/literaryProduction.mjs';
import { createLiteraryDraftService } from '../src/literaryDrafting.mjs';
import { createLiteraryPublicationService } from '../src/literaryPublication.mjs';
import { createLiteraryPublicationGuideService } from '../src/literaryPublicationGuide.mjs';
import { createLiteraryPublicationConfirmationService } from '../src/literaryPublicationConfirmation.mjs';
const target = { kind: 'book', id: 'book' };
const limits = { maxApplications: 2, maxCredits: 2, maxSteps: 200 };
const answer = (mode) => ({
  text: mode.startsWith('review') ? '' : 'A filha abriu a carta. Uma decisão mudou a casa.',
  complete: true,
  rationale: 'A escolha tem consequência.',
  findings: [],
});
test('continuous chapter cycle connects accepted preparation, first version, both review layers and revised version without duplicate debit', async () => {
  const f = await fixture();
  const registered = await f.start();
  assert.equal(registered.job.phase, 'preparation');
  assert.equal(f.calls.length, 0);
  const done = await f.until((frame) => frame.job.phase === 'done');
  assert.equal(f.calls.length, 6);
  assert.equal(f.records.get('users/author').credits, 8);
  assert.equal(done.review.completedUnits, 2);
  assert.equal(done.review.analyses, 4);
  assert.equal(done.review.authorAccepted, true);
  assert.ok(done.job.firstVersionId);
  assert.ok(done.review.revisedMilestoneId);
  assert.notEqual(done.job.firstVersionId, done.review.revisedMilestoneId);
  for (const id of [done.job.firstVersionId, done.review.revisedMilestoneId])
    assert.equal(f.records.get('books/book/literaryMilestones/' + id).state, 'done');
  assert.equal(done.review.preservationCurrent, true);
});
test('a missing preparation gate remains an author decision and never starts drafting', async () => {
  const f = await fixture({ prepare: false });
  await f.start();
  const frame = await f.advance();
  assert.equal(frame.job.stop, 'preparation');
  assert.equal(f.calls.length, 0);
  assert.equal(frame.draft, null);
  await f.prepareGate();
  const resumed = await f.advance();
  assert.equal(resumed.job.phase, 'firstVersion');
  assert.equal(resumed.job.stop, null);
});
test('phase grants stop the cycle at the first-version and review boundaries until explicit current approval', async () => {
  const f = await fixture();
  await f.start({ authorizedPhases: ['firstVersion'] });
  const first = await f.until((x) => x.job.stop === 'firstVersionAcceptance');
  assert.equal(f.calls.length, 2);
  assert.equal(first.review, null);
  await assert.rejects(f.control('acceptFirstVersion', { expectedFirstVersionId: 'other' }), {
    code: 'failed-precondition',
  });
  await f.control('acceptFirstVersion', { expectedFirstVersionId: first.job.firstVersionId });
  const reviewed = await f.until((x) => x.job.stop === 'reviewAcceptance');
  assert.equal(reviewed.review.authorAccepted, false);
  await f.control('acceptReview', { expectedReviewSourceToken: reviewed.review.sourceToken });
  const done = await f.until((x) => x.job.phase === 'done');
  assert.equal(done.review.preservationCurrent, true);
  assert.equal(f.records.get('users/author').credits, 8);
});
test('pause while a provider waits atomically fences child application, and resume reuses the pending proposal', async () => {
  let entered, release;
  const waiting = new Promise((resolve) => {
    entered = resolve;
  });
  let held = true;
  const f = await fixture({
    generator: async (input) => {
      if (held && input.operation === 'draftScene') {
        held = false;
        entered();
        return new Promise((resolve) => {
          release = resolve;
        });
      }
      return answer(input.operation);
    },
  });
  await f.start();
  await f.advance();
  await f.advance();
  await f.advance(); // gate, register, census
  const pending = f.advance();
  await waiting;
  const paused = await f.control('pause');
  assert.equal(paused.job.paused, true);
  assert.equal(paused.draft.job.paused, true);
  release(answer('draftScene'));
  const late = await pending;
  assert.equal(late.job.paused, true);
  assert.equal(late.draft.job.drafted, 0);
  assert.equal(f.records.get('users/author').credits, 10);
  await f.control('resume');
  const resumed = await f.advance();
  assert.equal(resumed.draft.job.drafted, 1);
  assert.equal(f.calls.length, 1);
  assert.equal(f.records.get('users/author').credits, 9);
});
test('a lost parent checkpoint after a saved scene is repaired by replaying the same step, without generating the next scene', async () => {
  const f = await fixture();
  await f.start();
  await f.advance();
  await f.advance();
  await f.advance();
  const native = f.drafts.advanceLiteraryDraft;
  let lose = true;
  f.drafts.advanceLiteraryDraft = async (...args) => {
    const result = await native(...args);
    if (lose) {
      lose = false;
      throw new Error('ACK perdido após salvar');
    }
    return result;
  };
  const before = await f.get(),
    input = {
      target,
      jobId: before.job.jobId,
      operationId: 'workflow-recovery-step-0001',
      expectedRevision: before.job.revision,
      expectedOriginToken: before.job.originToken,
    };
  await assert.rejects(f.api.advanceLiteraryWorkflow('author', input), /ACK perdido/);
  assert.equal(f.records.get('users/author').credits, 9);
  assert.equal(f.calls.length, 1);
  const recovered = await f.api.advanceLiteraryWorkflow('author', input);
  assert.equal(recovered.job.busyStep, null);
  assert.equal(recovered.draft.job.drafted, 1);
  assert.equal(f.calls.length, 1);
  assert.equal(f.records.get('users/author').credits, 9);
  assert.equal(f.records.get('books/book/literaryOperations/' + input.operationId).status, 'done');
});
test('guidance cycles preserve manual first versions and provide the two-layer review without automatic writing', async () => {
  const f = await fixture({ mode: 'guidance' });
  await f.start({ budget: { maxApplications: 0, maxCredits: 0, maxSteps: 200 } });
  const ready = await f.advance();
  assert.equal(ready.job.stop, 'manualConfirmation');
  await f.control('confirmManual', { expectedGateToken: ready.job.gate.stateToken });
  const first = await f.until((x) => x.job.stop === 'firstVersionAcceptance');
  assert.equal(f.calls.length, 0);
  assert.equal(first.draft, null);
  await f.control('acceptFirstVersion', { expectedFirstVersionId: first.job.firstVersionId });
  const reviewed = await f.until((x) => x.job.stop === 'reviewAcceptance');
  assert.equal(f.calls.length, 4);
  await f.control('acceptReview', { expectedReviewSourceToken: reviewed.review.sourceToken });
  const done = await f.until((x) => x.job.phase === 'done');
  assert.equal(done.review.preservationCurrent, true);
  assert.equal(f.records.get('users/author').credits, 10);
  for (const id of f.ids)
    assert.equal(
      f.records.get('books/book/scenes/' + id + '/body/current').content,
      '<p>A filha recebeu a carta.</p>',
    );
});
test('linked child controls cannot expand their standing limits or advance while the cycle is paused', async () => {
  const f = await fixture();
  await f.start();
  await f.advance();
  const frame = await f.advance();
  await assert.rejects(
    f.drafts.setLiteraryDraftExecution('author', {
      target,
      jobId: frame.job.draftId,
      operationId: 'workflow-bypass-0001',
      expectedRevision: 0,
      paused: false,
      execution: { version: 1, mode: 'continuous', maxApplications: 100, maxCredits: 100 },
    }),
    { code: 'failed-precondition' },
  );
  await f.control('pause');
  await assert.rejects(
    f.drafts.advanceLiteraryDraft('author', { target, jobId: frame.job.draftId }),
    { code: 'failed-precondition' },
  );
  assert.equal(f.calls.length, 0);
  assert.equal(f.records.get('users/author').credits, 10);
});
test('step limits checkpoint before more work and an explicit amendment preserves all consumed steps', async () => {
  const f = await fixture();
  await f.start({ budget: { ...limits, maxSteps: 1 } });
  await f.advance();
  const stopped = await f.advance();
  assert.equal(stopped.job.stop, 'budget');
  assert.equal(stopped.job.steps, 1);
  assert.equal(f.calls.length, 0);
  await assert.rejects(f.control('resume', { limits: { ...limits, maxSteps: 0 } }), {
    code: 'invalid-argument',
  });
  const amended = await f.control('resume', { limits: { ...limits, maxSteps: 100 } });
  assert.equal(amended.job.steps, 1);
  const next = await f.advance();
  assert.equal(next.job.steps, 2);
  assert.ok(next.draft);
});

test('supervised cycles retain each scene decision and phase approval', async () => {
  const f = await fixture({ mode: 'supervised' });
  await f.start();
  const ready = await f.advance();
  assert.equal(ready.job.stop, 'firstVersionAuthorization');
  assert.equal(f.calls.length, 0);
  await f.control('startFirstVersion', { expectedGateToken: ready.job.gate.stateToken });
  for (let i = 0; i < 2; i++) {
    const scene = await f.until((x) => x.job.stop === 'scene' && x.draft?.proposal?.applicable);
    await f.drafts.acceptLiteraryDraftScene('author', {
      target,
      jobId: scene.job.draftId,
      requestId: scene.draft.proposal.requestId,
      operationId: 'workflow-author-accept-000' + i,
    });
  }
  const first = await f.until((x) => x.job.stop === 'firstVersionAcceptance');
  await f.control('acceptFirstVersion', { expectedFirstVersionId: first.job.firstVersionId });
  const reviewed = await f.until((x) => x.job.stop === 'reviewAcceptance');
  assert.equal(reviewed.review.authorAccepted, false);
  await f.control('acceptReview', { expectedReviewSourceToken: reviewed.review.sourceToken });
  assert.equal((await f.until((x) => x.job.phase === 'done')).review.preservationCurrent, true);
  assert.equal(f.records.get('users/author').credits, 8);
});
test('cancel during a provider fences late application and cannot be rearmed or replayed into another execution', async () => {
  let entered, release;
  const waiting = new Promise((resolve) => {
    entered = resolve;
  });
  const f = await fixture({
    generator: async (input) => {
      entered();
      return new Promise((resolve) => {
        release = () => resolve(answer(input.operation));
      });
    },
  });
  await f.start();
  await f.advance();
  await f.advance();
  await f.advance();
  const pending = f.advance();
  await waiting;
  const canceled = await f.control('cancel');
  assert.equal(canceled.job.phase, 'canceled');
  release();
  const late = await pending;
  assert.equal(late.job.phase, 'canceled');
  assert.equal(f.records.get('users/author').credits, 10);
  await assert.rejects(f.control('resume'), { code: 'failed-precondition' });
  for (const id of f.ids)
    assert.equal(f.records.get('books/book/scenes/' + id + '/body/current').content, '');
});
test('a completed cycle becomes reconcilable after a manual edit and rereads both layers while retaining the original first version', async () => {
  const f = await fixture();
  await f.start();
  const done = await f.until((x) => x.job.phase === 'done'),
    first = done.job.firstVersionId,
    oldReview = done.job.reviewId;
  const native = await f.scenes.getScene('author', { target, sceneId: f.ids[0] });
  await f.scenes.updateScene('author', {
    target,
    sceneId: f.ids[0],
    operationId: 'workflow-manual-correction-0001',
    expectedRevision: native.revision,
    patch: { content: '<p>A filha escolheu devolver a carta.</p>' },
  });
  const changed = await f.get();
  assert.equal(changed.job.phase, 'review');
  assert.equal(changed.job.stop, 'reconciliation');
  assert.equal(changed.job.firstVersionId, first);
  await f.control('reconcileReview');
  const newer = await f.until((x) => x.job.phase === 'done');
  assert.notEqual(newer.job.reviewId, oldReview);
  assert.equal(newer.job.firstVersionId, first);
  assert.equal(f.records.get('users/author').credits, 8);
  assert.equal(f.calls.length, 10);
  assert.equal(
    f.records.get('books/book/scenes/' + f.ids[0] + '/body/current').content,
    '<p>A filha escolheu devolver a carta.</p>',
  );
});
test('blocking findings stop continuous passage and corrections require a new complete review before preservation', async () => {
  let block = true;
  const f = await fixture({
    generator: async (input) => {
      const result = answer(input.operation);
      if (block && input.operation === 'reviewStructure')
        result.findings = [
          {
            sourceId: 'manuscript',
            quote: 'A filha',
            severity: 'blocking',
            problem: 'Conflito de continuidade.',
            action: 'Confira a decisão.',
          },
        ];
      return result;
    },
  });
  await f.start();
  const stopped = await f.until((x) => x.job.stop === 'corrections');
  assert.ok(stopped.review.blocking > 0);
  assert.equal(stopped.review.authorAccepted, false);
  await assert.rejects(
    f.control('acceptReview', { expectedReviewSourceToken: stopped.review.sourceToken }),
    { code: 'failed-precondition' },
  );
  block = false;
  await f.control('reconcileReview');
  const done = await f.until((x) => x.job.phase === 'done');
  assert.equal(done.review.blocking, 0);
  assert.equal(done.job.firstVersionId, stopped.job.firstVersionId);
});
test('reconciliation preserves applications already charged and never automatically overwrites retained prose', async () => {
  const f = await fixture();
  await f.start();
  const applied = await f.until((x) => x.draft?.job.drafted === 1);
  const oldDraft = applied.job.draftId,
    body = f.records.get('books/book/scenes/' + f.ids[0] + '/body/current').content;
  const reconciled = await f.control('reconcileDraft');
  assert.equal(reconciled.job.priorApplications, 1);
  assert.equal(reconciled.job.priorCredits, 1);
  assert.notEqual(reconciled.job.draftId, oldDraft);
  assert.equal(f.records.get('books/book/literaryDraftJobs/' + oldDraft).state, 'canceled');
  const existing = await f.until((x) => x.job.stop === 'existingText');
  assert.equal(f.records.get('users/author').credits, 9);
  assert.equal(f.records.get('books/book/scenes/' + f.ids[0] + '/body/current').content, body);
  await f.drafts.adoptLiteraryDraftScene('author', {
    target,
    jobId: existing.job.draftId,
    unitIndex: existing.draft.unit.index,
    expectedSourceToken: existing.draft.existing.sourceToken,
  });
  const done = await f.until((x) => x.job.phase === 'done');
  assert.equal(done.job.priorApplications + done.draft.job.drafted, 2);
  assert.equal(f.records.get('users/author').credits, 8);
  assert.equal(f.records.get('books/book/scenes/' + f.ids[0] + '/body/current').content, body);
});
test('workflow reads enforce native origin and keep revoked cycle bodies hidden', async () => {
  const f = await fixture();
  await f.start();
  await assert.rejects(
    f.api.getLiteraryWorkflow('other', { target, jobId: 'workflow-cycle-0001' }),
    { code: 'not-found' },
  );
  await f.advance();
  await f.advance();
  f.metadata.set('books/book/chapters/' + f.chapterId, { createdAt: 999, updatedAt: 999 });
  const stale = await f.get();
  assert.equal(stale.job.phase, 'stale');
  assert.equal('draft' in stale, false);
  assert.equal('review' in stale, false);
});

test('listings expose only the same native book and chapter incarnation, with obsolete contracts clearly stale', async () => {
  const f = await fixture();
  await f.start();
  const input = { target, chapterId: f.chapterId, limit: 25, afterId: null };
  assert.equal((await f.api.listLiteraryWorkflows('author', input)).items.length, 1);
  const contract = emptyEditorialContract();
  contract.collaborationPolicy = { version: 1, mode: 'guidance' };
  await f.production.saveLiteraryContract('author', {
    target,
    operationId: 'workflow-contract-0002',
    expectedRevision: 1,
    contract,
  });
  assert.equal((await f.api.listLiteraryWorkflows('author', input)).items[0].phase, 'stale');
  f.metadata.set('books/book/chapters/' + f.chapterId, { createdAt: 999, updatedAt: 999 });
  assert.equal((await f.api.listLiteraryWorkflows('author', input)).items.length, 0);
});
test('concurrent delivery of the same census step consumes a single workflow step and never duplicates native units', async () => {
  const f = await fixture();
  await f.start();
  await f.advance();
  await f.advance();
  const prior = await f.get(),
    input = {
      target,
      jobId: prior.job.jobId,
      operationId: 'workflow-concurrent-step-0001',
      expectedRevision: prior.job.revision,
      expectedOriginToken: prior.job.originToken,
    };
  const result = await Promise.all([
    f.api.advanceLiteraryWorkflow('author', input),
    f.api.advanceLiteraryWorkflow('author', input),
  ]);
  const current = await f.get();
  assert.equal(current.job.steps, prior.job.steps + 1);
  assert.equal(current.draft.job.units, 2);
  assert.equal(f.calls.length, 0);
  assert.ok(result.every((frame) => frame.job.jobId === prior.job.jobId));
});

test('an unrelated native history checkpoint reuses the accepted review and only reconfirms preserved versions', async () => {
  const f = await fixture();
  await f.start();
  const done = await f.until((x) => x.job.phase === 'done'),
    reviewId = done.job.reviewId,
    first = done.job.firstVersionId;
  const history = createWorkHistoryService({ db: f.db, now: () => 700 }),
    resource = { kind: 'scene', id: f.ids[0] };
  const source = await history.getWorkVersionSource('author', { target, resource });
  await history.createWorkVersion('author', {
    target,
    resource,
    operationId: 'workflow-extra-history-0001',
    expectedSourceToken: source.sourceToken,
    label: 'Checkpoint adicional do autor',
  });
  const changed = await f.get();
  assert.equal(changed.job.phase, 'revisedVersion');
  assert.equal(changed.job.stop, null);
  const refreshed = await f.until((x) => x.job.phase === 'done');
  assert.equal(refreshed.job.reviewId, reviewId);
  assert.equal(refreshed.job.firstVersionId, first);
  assert.equal(f.calls.length, 6);
  assert.equal(f.records.get('users/author').credits, 8);
});

test('lost manual-capture acknowledgement recovers the same native unit without consuming the next capture', async () => {
  const f = await fixture({ mode: 'guidance' });
  await f.start({ budget: { maxApplications: 0, maxCredits: 0, maxSteps: 200 } });
  const ready = await f.advance();
  await f.control('confirmManual', { expectedGateToken: ready.job.gate.stateToken });
  const before = await f.until((frame) => {
    const m = f.records.get('books/book/literaryMilestones/' + frame.job.manualMilestoneId);
    return m?.state === 'capturing' && m.planned === 2 && m.captured === 0;
  });
  const native = f.milestones.advanceLiteraryMilestone;
  let lose = true;
  f.milestones.advanceLiteraryMilestone = async (...args) => {
    const result = await native(...args);
    if (lose) {
      lose = false;
      throw new Error('ACK perdido na captura');
    }
    return result;
  };
  const input = {
    target,
    jobId: before.job.jobId,
    operationId: 'workflow-manual-recovery-0001',
    expectedRevision: before.job.revision,
    expectedOriginToken: before.job.originToken,
  };
  await assert.rejects(f.api.advanceLiteraryWorkflow('author', input), /ACK perdido/);
  assert.equal(
    f.records.get('books/book/literaryMilestones/' + before.job.manualMilestoneId).captured,
    1,
  );
  await f.api.advanceLiteraryWorkflow('author', input);
  assert.equal(
    f.records.get('books/book/literaryMilestones/' + before.job.manualMilestoneId).captured,
    1,
  );
  assert.equal(f.calls.length, 0);
  assert.equal(f.records.get('users/author').credits, 10);
});
test('lost revised-version acknowledgement repairs the same progress checkpoint without capturing another unit', async () => {
  const f = await fixture();
  await f.start();
  const before = await f.until(
    (frame) =>
      frame.job.phase === 'revisedVersion' &&
      frame.review?.preservationProgress?.planned === 2 &&
      frame.review.preservationProgress.captured === 0,
  );
  const native = f.reviews.advanceLiteraryReviewedVersion;
  let lose = true;
  f.reviews.advanceLiteraryReviewedVersion = async (...args) => {
    const result = await native(...args);
    if (lose) {
      lose = false;
      throw new Error('ACK perdido na versão revisada');
    }
    return result;
  };
  const input = {
    target,
    jobId: before.job.jobId,
    operationId: 'workflow-revised-recovery-0001',
    expectedRevision: before.job.revision,
    expectedOriginToken: before.job.originToken,
  };
  await assert.rejects(f.api.advanceLiteraryWorkflow('author', input), /ACK perdido/);
  const captured = f.records.get('books/book/literaryReviewJobs/' + before.job.reviewId)
    .preservationProgress.captured;
  assert.equal(captured, 1);
  await f.api.advanceLiteraryWorkflow('author', input);
  assert.equal(
    f.records.get('books/book/literaryReviewJobs/' + before.job.reviewId).preservationProgress
      .captured,
    captured,
  );
  assert.equal(f.calls.length, 6);
  assert.equal(f.records.get('users/author').credits, 8);
});

test('a frozen registration preview cannot adopt a recreated book or chapter even when the IDs match', async () => {
  for (const resource of ['book', 'chapter']) {
    const f = await fixture(),
      input = await f.startInput();
    f.metadata.set(resource === 'book' ? 'books/book' : 'books/book/chapters/' + f.chapterId, {
      createdAt: 999,
      updatedAt: 999,
    });
    await assert.rejects(f.api.startLiteraryWorkflow('author', input), {
      code: 'failed-precondition',
    });
    assert.equal(f.records.has('books/book/literaryWorkflowJobs/' + input.jobId), false);
    assert.equal(f.calls.length, 0);
  }
});
test('old mutations and receipt confirmations cannot rebind to a recreated workflow document', async () => {
  const f = await fixture(),
    input = await f.startInput();
  const registered = await f.api.startLiteraryWorkflow('author', input);
  const advance = {
    target,
    jobId: input.jobId,
    operationId: 'workflow-old-instance-step-0001',
    expectedRevision: registered.job.revision,
    expectedOriginToken: registered.job.originToken,
  };
  const control = {
    target,
    jobId: input.jobId,
    operationId: 'workflow-old-instance-control-0001',
    expectedRevision: registered.job.revision,
    expectedOriginToken: registered.job.originToken,
    action: 'pause',
  };
  f.metadata.set('books/book/literaryWorkflowJobs/' + input.jobId, {
    createdAt: 999,
    updatedAt: 999,
  });
  await assert.rejects(f.api.advanceLiteraryWorkflow('author', advance), {
    code: 'failed-precondition',
  });
  await assert.rejects(f.api.setLiteraryWorkflowControl('author', control), {
    code: 'failed-precondition',
  });
  await assert.rejects(f.api.startLiteraryWorkflow('author', input), {
    code: 'failed-precondition',
  });
  await assert.rejects(
    f.production.getLiteraryOperation('author', { target, operationId: input.jobId }),
    { code: 'failed-precondition' },
  );
  const current = await f.get();
  assert.equal(current.job.phase, 'stale');
  assert.notEqual(current.job.originToken, registered.job.originToken);
  assert.equal(f.calls.length, 0);
});
test('registration interrupted before native activation is explicitly recoverable without repeating intent or generation', async () => {
  const f = await fixture(),
    input = await f.startInput(),
    original = f.db.runTransaction.bind(f.db);
  let fail = true;
  f.db.runTransaction = async (callback) => {
    if (
      fail &&
      f.records.get('books/book/literaryWorkflowJobs/' + input.jobId)?.registrationState ===
        'registering'
    ) {
      fail = false;
      throw new Error('Registro interrompido antes da ativação');
    }
    return original(callback);
  };
  await assert.rejects(f.api.startLiteraryWorkflow('author', input), /interrompido/);
  f.db.runTransaction = original;
  const pending = await f.get();
  assert.equal(pending.job.registrationState, 'registering');
  assert.equal(f.calls.length, 0);
  assert.deepEqual(
    await f.production.getLiteraryOperation('author', { target, operationId: input.jobId }),
    { state: 'unconfirmed' },
  );
  await assert.rejects(f.advance(), { code: 'failed-precondition' });
  const confirmed = await f.control('confirmRegistration');
  assert.equal(confirmed.job.registrationState, 'active');
  assert.equal(confirmed.job.originToken, pending.job.originToken);
  assert.equal(
    (await f.production.getLiteraryOperation('author', { target, operationId: input.jobId })).state,
    'confirmed',
  );
  await f.until((x) => x.job.phase === 'done');
  assert.equal(f.calls.length, 6);
  assert.equal(f.records.get('users/author').credits, 8);
});
test('an incomplete registration can be canceled after its original contract changes, without activating its grants', async () => {
  const f = await fixture(),
    input = await f.startInput(),
    original = f.db.runTransaction.bind(f.db);
  let fail = true;
  f.db.runTransaction = async (callback) => {
    if (
      fail &&
      f.records.get('books/book/literaryWorkflowJobs/' + input.jobId)?.registrationState ===
        'registering'
    ) {
      fail = false;
      throw new Error('Registro interrompido');
    }
    return original(callback);
  };
  await assert.rejects(f.api.startLiteraryWorkflow('author', input), /interrompido/);
  f.db.runTransaction = original;
  const contract = emptyEditorialContract();
  contract.collaborationPolicy = { version: 1, mode: 'guidance' };
  await f.production.saveLiteraryContract('author', {
    target,
    operationId: 'workflow-changed-registration-0001',
    expectedRevision: 1,
    contract,
  });
  await assert.rejects(f.control('confirmRegistration'), { code: 'failed-precondition' });
  const canceled = await f.control('cancel');
  assert.equal(canceled.job.phase, 'canceled');
  assert.equal(canceled.job.registrationState, 'canceled');
  assert.equal(f.calls.length, 0);
  await assert.rejects(f.api.startLiteraryWorkflow('author', input), {
    code: 'failed-precondition',
  });
  assert.equal(f.records.get('users/author').credits, 10);
});
test('a queued producer cannot apply after its runtime parent is recreated under the same ID', async () => {
  let entered, release;
  const waiting = new Promise((resolve) => {
    entered = resolve;
  });
  const f = await fixture({
    generator: async (input) => {
      entered();
      return new Promise((resolve) => {
        release = () => resolve(answer(input.operation));
      });
    },
  });
  await f.start();
  await f.advance();
  await f.advance();
  await f.advance();
  const running = f.advance();
  await waiting;
  f.metadata.set('books/book/literaryWorkflowJobs/workflow-cycle-0001', {
    createdAt: 999,
    updatedAt: 999,
  });
  release();
  const result = await running;
  assert.equal(result.job.phase, 'stale');
  assert.equal(f.records.get('users/author').credits, 10);
  assert.equal(f.calls.length, 1);
  for (const id of f.ids)
    assert.equal(f.records.get('books/book/scenes/' + id + '/body/current').content, '');
});

test('a changed book owner cannot read the previous actor runtime or discover it through chapter listings', async () => {
  const f = await fixture();
  await f.start();
  f.records.set('books/book', { ...f.records.get('books/book'), authorId: 'other' });
  f.records.set('books/book/chapters/' + f.chapterId, {
    ...f.records.get('books/book/chapters/' + f.chapterId),
    ownerId: 'other',
  });
  await assert.rejects(
    f.api.getLiteraryWorkflow('other', { target, jobId: 'workflow-cycle-0001' }),
    { code: 'not-found' },
  );
  assert.equal(
    (
      await f.api.listLiteraryWorkflows('other', {
        target,
        chapterId: f.chapterId,
        limit: 25,
        afterId: null,
      })
    ).items.length,
    0,
  );
});

async function finishPrior(f) {
  await f.start();
  return f.until((x) => x.job.phase === 'done');
}
async function finishAct(f) {
  const api = createLiteraryIntegrationService({
    db: f.db,
    now: () => 600,
    generator: async (input) =>
      input.scope.phase === 'synthesis'
        ? { complete: true, report: 'Ato conferido.', findings: [], conclusions: [] }
        : { complete: true, report: 'Texto integral conferido.', findings: [], matrix: [] },
  });
  const command = { target, jobId: 'passage-integration-0001' };
  await api.startLiteraryIntegration('author', {
    ...command,
    level: 'act',
    actId: 'first',
    instruction: 'Confira o ato completo.',
  });
  let job;
  for (let i = 0; i < 100; i++) {
    job = await api.advanceLiteraryIntegration('author', command);
    if (job.state === 'done') break;
    assert.equal(['attention', 'stale', 'canceled'].includes(job.state), false);
  }
  assert.equal(job.state, 'done');
  await api.acceptLiteraryIntegration('author', {
    ...command,
    expectedSourceToken: job.sourceToken,
  });
  return { api, command };
}

test('chapter passage requires the native complete cycle, preserves both versions, and continues through its own history writes', async () => {
  const f = await fixture();
  const next = await nextChapter(f);
  await assert.rejects(next.input(), { code: 'failed-precondition' });
  await finishPrior(f);
  const input = await next.input();
  const started = await f.api.startLiteraryWorkflow('author', input);
  assert.equal(started.job.passage.condition, 'revisedChapter');
  assert.equal(started.job.passageEntered, false);
  const entered = await next.advance();
  assert.equal(entered.job.phase, 'firstVersion');
  assert.equal(entered.job.passageEntered, true);
  let result,
    openedPrior = false;
  for (let i = 0; i < 100; i++) {
    result = await next.advance();
    if (result.job.phase === 'review' && !openedPrior) {
      // Opening the previous cycle after a native history write in this chapter
      // requests a history-only recheck there, without changing its accepted prose.
      const refreshed = await f.get();
      assert.equal(refreshed.job.phase, 'revisedVersion');
      openedPrior = true;
    }
    if (result.job.phase === 'done') break;
    assert.notEqual(result.job.phase, 'stale');
  }
  assert.equal(openedPrior, true);
  assert.equal(result.job.phase, 'done');
  assert.equal(f.records.get('users/author').credits, 7);
  assert.notEqual(result.job.firstVersionId, result.review.revisedMilestoneId);
  assert.equal((await f.api.startLiteraryWorkflow('author', input)).job.phase, 'done');
  assert.equal(f.records.get('users/author').credits, 7);
});

test('chapter passage freezes its exact predecessor proof and rejects changed or recreated review after preflight', async () => {
  const f = await fixture();
  const next = await nextChapter(f);
  const prior = await finishPrior(f);
  const input = await next.input();
  const path = 'books/book/literaryReviewJobs/' + prior.job.reviewId;
  await f.db.runTransaction(async (tx) => {
    const ref = f.db.doc(path),
      value = (await tx.get(ref)).data();
    tx.delete(ref);
    tx.create(ref, value);
  });
  await assert.rejects(f.api.startLiteraryWorkflow('author', input), {
    code: 'failed-precondition',
  });
  assert.equal(f.records.has('books/book/literaryWorkflowJobs/' + next.jobId), false);
  assert.equal(f.records.get('users/author').credits, 8);
});

test('an edited predecessor invalidates an active passage before prose and still allows explicit cancellation', async () => {
  const f = await fixture();
  const next = await nextChapter(f);
  await finishPrior(f);
  const started = await f.api.startLiteraryWorkflow('author', await next.input());
  await f.scenes.updateScene('author', {
    target,
    sceneId: f.ids[0],
    operationId: 'passage-edit-0001',
    expectedRevision: f.records.get('books/book/scenes/' + f.ids[0]).revision,
    patch: { content: '<p>A filha recusou a carta.</p>' },
  });
  const changed = await next.get();
  assert.equal(changed.job.phase, 'stale');
  await assert.rejects(next.advance(), { code: 'failed-precondition' });
  const canceled = await f.api.setLiteraryWorkflowControl('author', {
    target,
    jobId: next.jobId,
    operationId: 'passage-cancel-0001',
    action: 'cancel',
    expectedRevision: changed.job.revision,
    expectedOriginToken: started.job.originToken,
  });
  assert.equal(canceled.job.phase, 'canceled');
  assert.equal(f.records.get('users/author').credits, 8);
  assert.equal(f.records.get('books/book/scenes/' + next.sceneId + '/body/current').content, '');
});

test('cross-act passage requires a current complete author-accepted act integration and latches its entry certificate', async () => {
  const f = await fixture({ acts: true });
  const next = await nextChapter(f, { actId: 'second' });
  await finishPrior(f);
  await assert.rejects(next.input(), { code: 'failed-precondition' });
  await finishAct(f);
  const passage = {
    previousWorkflowId: 'workflow-cycle-0001',
    actIntegrationId: 'passage-integration-0001',
  };
  const input = await next.input(passage);
  assert.equal(
    (await f.api.startLiteraryWorkflow('author', input)).job.passage.condition,
    'integratedAct',
  );
  assert.equal((await next.advance()).job.passageEntered, true);
  let result;
  for (let i = 0; i < 100; i++) {
    result = await next.advance();
    if (result.job.phase === 'done') break;
    assert.notEqual(result.job.phase, 'stale');
  }
  assert.equal(result.job.phase, 'done');
  assert.equal(f.records.get('users/author').credits, 7);
});

test('stale act integration cannot authorize a passage even when its final report was accepted', async () => {
  const f = await fixture({ acts: true });
  const next = await nextChapter(f, { actId: 'second' });
  await finishPrior(f);
  await finishAct(f);
  f.records.set('books/book', { ...f.records.get('books/book'), updatedAt: 900 });
  await assert.rejects(
    next.input({
      previousWorkflowId: 'workflow-cycle-0001',
      actIntegrationId: 'passage-integration-0001',
    }),
    { code: 'failed-precondition' },
  );
  assert.equal(f.records.get('users/author').credits, 8);
});

test('backward chapter order and extra client passage grants are rejected without registering or charging', async () => {
  const f = await fixture();
  const next = await nextChapter(f);
  await finishPrior(f);
  f.records.set('books/book/chapters/' + next.chapterId, {
    ...f.records.get('books/book/chapters/' + next.chapterId),
    order: 0,
  });
  f.records.set('books/book/chapters/' + f.chapterId, {
    ...f.records.get('books/book/chapters/' + f.chapterId),
    order: 1,
  });
  await assert.rejects(next.input(), { code: 'failed-precondition' });
  await assert.rejects(
    next.input({ previousWorkflowId: 'workflow-cycle-0001', authorized: true }),
    { code: 'invalid-argument' },
  );
  assert.equal(f.records.has('books/book/literaryWorkflowJobs/' + next.jobId), false);
});

test('a predecessor edit during the next provider call fences the native prose/debit commit', async () => {
  let hold = false,
    entered,
    release;
  const waiting = new Promise((resolve) => {
    entered = resolve;
  });
  const f = await fixture({
    generator: async (input) => {
      if (hold && input.operation === 'draftScene') {
        hold = false;
        entered();
        return new Promise((resolve) => {
          release = resolve;
        });
      }
      return answer(input.operation);
    },
  });
  const next = await nextChapter(f);
  await finishPrior(f);
  await f.api.startLiteraryWorkflow('author', await next.input());
  await next.advance();
  await next.advance();
  hold = true;
  let running;
  for (let i = 0; i < 20; i++) {
    const pending = next.advance();
    const observed = await Promise.race([
      waiting.then(() => 'provider'),
      pending.then(() => 'step'),
    ]);
    if (observed === 'provider') {
      running = pending;
      break;
    }
    await pending;
  }
  assert.ok(running);
  const native = await f.scenes.getScene('author', { target, sceneId: f.ids[0] });
  await f.scenes.updateScene('author', {
    target,
    sceneId: f.ids[0],
    operationId: 'passage-racing-edit-0001',
    expectedRevision: native.revision,
    patch: { content: '<p>A carta foi destruída.</p>' },
  });
  release(answer('draftScene'));
  const stopped = await running;
  assert.equal(stopped.job.phase, 'stale');
  assert.equal(f.records.get('users/author').credits, 8);
  assert.equal(f.records.get('books/book/scenes/' + next.sceneId + '/body/current').content, '');
});

test('removal or recreation of a prerequisite version cannot rearm a passage under the same IDs', async () => {
  for (const kind of ['firstVersionId', 'revisedVersionId', 'previousWorkflowId']) {
    const f = await fixture();
    const next = await nextChapter(f);
    await finishPrior(f);
    const started = await f.api.startLiteraryWorkflow('author', await next.input());
    const proof = started.job.passage;
    const id = kind === 'previousWorkflowId' ? proof.input.previousWorkflowId : proof[kind];
    const path =
      'books/book/' +
      (kind === 'previousWorkflowId' ? 'literaryWorkflowJobs/' : 'literaryMilestones/') +
      id;
    await f.db.runTransaction(async (tx) => {
      const ref = f.db.doc(path),
        value = (await tx.get(ref)).data();
      tx.delete(ref);
      tx.create(ref, value);
    });
    assert.equal((await next.get()).job.phase, 'stale', kind);
    assert.equal(f.records.get('users/author').credits, 8);
  }
});

test('an act report invalidated after cycle registration still cannot cross the entry boundary', async () => {
  const f = await fixture({ acts: true });
  const next = await nextChapter(f, { actId: 'second' });
  await finishPrior(f);
  await finishAct(f);
  const input = await next.input({
    previousWorkflowId: 'workflow-cycle-0001',
    actIntegrationId: 'passage-integration-0001',
  });
  await f.api.startLiteraryWorkflow('author', input);
  f.records.set('books/book', { ...f.records.get('books/book'), updatedAt: 900 });
  const stopped = await next.get();
  assert.equal(stopped.job.phase, 'stale');
  assert.equal(stopped.job.passageEntered, false);
  await assert.rejects(next.advance(), { code: 'failed-precondition' });
  assert.equal(f.records.get('users/author').credits, 8);
});

test('a recreated act cannot inherit an old integration even if its ID and root fence are unchanged', async () => {
  const f = await fixture({ acts: true });
  const next = await nextChapter(f, { actId: 'second' });
  await finishPrior(f);
  await finishAct(f);
  await f.db.runTransaction(async (tx) => {
    const ref = f.db.doc('books/book/acts/first'),
      value = (await tx.get(ref)).data();
    tx.delete(ref);
    tx.create(ref, value);
  });
  await assert.rejects(
    next.input({
      previousWorkflowId: 'workflow-cycle-0001',
      actIntegrationId: 'passage-integration-0001',
    }),
    { code: 'failed-precondition' },
  );
  assert.equal(f.records.has('books/book/literaryWorkflowJobs/' + next.jobId), false);
  assert.equal(f.records.get('users/author').credits, 8);
});

test('cross-chapter cycle discovery is bounded, metadata-only, and retains its cursor on a filtered page', async () => {
  const f = await fixture();
  await f.start();
  const value = structuredClone(
    f.records.get('books/book/literaryWorkflowJobs/workflow-cycle-0001'),
  );
  f.records.set('books/book/literaryWorkflowJobs/aaaa-foreign-0001', {
    ...value,
    jobId: 'aaaa-foreign-0001',
    actorId: 'other',
    instruction: 'PRIVATE BODY',
  });
  const first = await f.api.listLiteraryWorkflows('author', {
    target,
    chapterId: null,
    afterId: null,
    limit: 1,
  });
  assert.equal(first.items.length, 0);
  assert.equal(first.nextAfterId, 'aaaa-foreign-0001');
  const next = await f.api.listLiteraryWorkflows('author', {
    target,
    chapterId: null,
    afterId: first.nextAfterId,
    limit: 1,
  });
  assert.equal(next.items.length, 1);
  assert.equal(next.items[0].chapterTitle, 'A carta');
  assert.equal(next.items[0].actId, null);
  assert.deepEqual(
    Object.keys(next.items[0]).sort(),
    [
      'actId',
      'chapterId',
      'chapterTitle',
      'completedAt',
      'createdAt',
      'jobId',
      'paused',
      'phase',
      'revision',
      'stop',
    ].sort(),
  );
  assert.equal(JSON.stringify([first, next]).includes('PRIVATE BODY'), false);
  await assert.rejects(
    f.api.listLiteraryWorkflows('other', {
      target,
      chapterId: null,
      afterId: null,
      limit: 25,
    }),
    { code: 'not-found' },
  );
  f.metadata.set('books/book/chapters/' + f.chapterId, { createdAt: 900, updatedAt: 900 });
  assert.equal(
    (
      await f.api.listLiteraryWorkflows('author', {
        target,
        chapterId: null,
        afterId: null,
        limit: 25,
      })
    ).items.length,
    0,
  );
});

test('cross-chapter discovery labels current native titles, and marks moved or recreated runtimes stale without exposing bodies', async () => {
  const f = await fixture();
  await f.start();
  f.records.set('books/book/chapters/' + f.chapterId, {
    ...f.records.get('books/book/chapters/' + f.chapterId),
    title: 'Título atual',
    actId: 'new-act',
  });
  const page = await f.api.listLiteraryWorkflows('author', { target, chapterId: null, limit: 25 });
  assert.equal(page.items[0].chapterTitle, 'Título atual');
  assert.equal(page.items[0].phase, 'stale');
  assert.equal(page.items[0].actId, 'new-act');
  f.records.set('books/book/chapters/' + f.chapterId, {
    ...f.records.get('books/book/chapters/' + f.chapterId),
    ownerId: 'other',
  });
  assert.equal(
    (
      await f.api.listLiteraryWorkflows('author', {
        target,
        chapterId: null,
        limit: 25,
      })
    ).items.length,
    0,
  );
});

async function inspectNextOrder(f, chapterId) {
  const inspectionId = 'workflow-order-inspection-' + chapterId;
  const scope = await f.api.getLiteraryPassageInspectionScope('author', { target, chapterId });
  await f.api.startLiteraryPassageInspection('author', {
    target,
    inspectionId,
    chapterId,
    expectedScopeToken: scope.scopeToken,
  });
  let state = await f.api.getLiteraryPassageInspection('author', { target, inspectionId });
  for (let n = 0; n < 50 && state.state !== 'ready'; n++)
    state = await f.api.advanceLiteraryPassageInspection('author', {
      target,
      inspectionId,
      expectedOriginToken: state.originToken,
      expectedRevision: state.revision,
    });
  assert.equal(state.state, 'ready');
  return inspectionId;
}

test('a completed order inspection prevents selecting an older completed cycle to skip a chapter', async () => {
  const f = await fixture();
  const next = await nextChapter(f);
  await finishPrior(f);
  f.records.set('books/book/chapters/' + next.chapterId, {
    ...f.records.get('books/book/chapters/' + next.chapterId),
    order: 100,
  });
  f.records.set('books/book/chapters/middle-chapter', {
    title: 'Ainda não concluído',
    contentMode: 'scenes',
    order: 50,
    bookId: 'book',
    ownerId: 'author',
  });
  const inspectionId = await inspectNextOrder(f, next.chapterId);
  await assert.rejects(next.input({ previousWorkflowId: 'workflow-cycle-0001', inspectionId }), {
    code: 'failed-precondition',
  });
  assert.equal(f.records.has('books/book/literaryWorkflowJobs/' + next.jobId), false);
  assert.equal(f.records.get('users/author').credits, 8);
});

test('an inspected immediate predecessor binds its native certificate to registration and first entry', async () => {
  const f = await fixture();
  const next = await nextChapter(f);
  await finishPrior(f);
  const inspectionId = await inspectNextOrder(f, next.chapterId);
  const input = await next.input({ previousWorkflowId: 'workflow-cycle-0001', inspectionId });
  const started = await f.api.startLiteraryWorkflow('author', input);
  assert.equal(started.job.passage.inspection.inspectionId, inspectionId);
  assert.equal(started.job.passage.inspection.previous.id, f.chapterId);
  const entered = await next.advance();
  assert.equal(entered.job.passageEntered, true);
  assert.equal(entered.job.phase, 'firstVersion');
});

async function requirePreviousPublication(f, unit = 'chapter') {
  const saved = f.records.get('books/book/literaryProduction/current');
  const contract = structuredClone(saved.contract);
  contract.publicationPolicy = { version: 1, unit, requirePreviousPublication: true };
  await createLiteraryProductionService({ db: f.db, now: () => 900 }).saveLiteraryContract(
    'author',
    {
      target,
      operationId: 'require-previous-publication-0001',
      expectedRevision: saved.revision,
      contract,
    },
  );
}

test('required publication policy cannot be bypassed by omitting the optional passage', async () => {
  const f = await fixture();
  await requirePreviousPublication(f);
  const before = structuredClone([...f.records]);
  await assert.rejects(
    f.api.getLiteraryWorkflowScope('author', { target, chapterId: f.chapterId }),
    { code: 'failed-precondition' },
  );
  assert.deepEqual([...f.records], before);
  assert.equal(f.records.has('books/book/literaryWorkflowJobs/workflow-cycle-0001'), false);
  assert.equal(f.calls.length, 0);
  assert.equal(f.records.get('users/author').credits, 10);
});

test('first unit enters by a complete native absence proof and never needs a fictitious predecessor publication', async () => {
  const f = await fixture();
  await requirePreviousPublication(f);
  await f.prepareGate();
  const admissionInspectionId = await inspectNextOrder(f, f.chapterId);
  const source = await f.api.getLiteraryWorkflowScope('author', {
    target,
    chapterId: f.chapterId,
    admissionInspectionId,
  });
  assert.equal(source.admission.condition, 'firstUnit');
  assert.equal(source.admission.inspection.previous, null);
  const frame = await f.api.startLiteraryWorkflow('author', {
    target,
    jobId: 'workflow-cycle-0001',
    chapterId: f.chapterId,
    admissionInspectionId,
    expectedScopeToken: source.originToken,
    instruction: 'Preserve a intenção.',
    limits,
    authorizedPhases: ['firstVersion', 'review', 'revisedVersion'],
  });
  assert.equal(frame.job.admissionEntered, false);
  const entered = await f.advance();
  assert.equal(entered.job.admissionEntered, true);
  assert.equal(entered.job.phase, 'firstVersion');
  assert.equal(f.records.get('users/author').credits, 10);
});

test('standalone first-version drafting cannot bypass a required publication admission', async () => {
  const f = await fixture();
  await requirePreviousPublication(f);
  await f.prepareGate();
  const before = structuredClone([...f.records]);
  const drafts = createLiteraryDraftService({
    db: f.db,
    now: () => 1000,
    generator: async () => assert.fail('No provider call before admission'),
  });
  await assert.rejects(
    drafts.startLiteraryDraft('author', {
      target,
      jobId: 'standalone-without-admission',
      chapterId: f.chapterId,
      instruction: 'Comece.',
    }),
    { code: 'failed-precondition' },
  );
  assert.deepEqual([...f.records], before);
});

async function startFirstAdmitted(f) {
  await f.prepareGate();
  const admissionInspectionId = await inspectNextOrder(f, f.chapterId);
  const source = await f.api.getLiteraryWorkflowScope('author', {
    target,
    chapterId: f.chapterId,
    admissionInspectionId,
  });
  return f.api.startLiteraryWorkflow('author', {
    target,
    jobId: 'workflow-cycle-0001',
    chapterId: f.chapterId,
    admissionInspectionId,
    expectedScopeToken: source.originToken,
    instruction: 'Preserve a intenção.',
    limits,
    authorizedPhases: ['firstVersion', 'review', 'revisedVersion'],
  });
}

test('continuing the admitted act requires the original predecessor admission without republishing between chapters', async () => {
  const f = await fixture({ acts: true });
  const next = await nextChapter(f, { actId: 'first' });
  await requirePreviousPublication(f, 'act');
  await startFirstAdmitted(f);
  await f.until((frame) => frame.job.phase === 'done');
  const inspectionId = await inspectNextOrder(f, next.chapterId);
  const input = await next.input({ previousWorkflowId: 'workflow-cycle-0001', inspectionId });
  const started = await f.api.startLiteraryWorkflow('author', input);
  assert.equal(started.job.admission.condition, 'continuedAct');
  assert.equal(started.job.admission.inspection.publication, undefined);
});

test('cross-act admission uses the exact confirmed publication integration despite the publication date advancing the book fence', async () => {
  const f = await fixture({ acts: true });
  const next = await nextChapter(f, { actId: 'second' });
  await requirePreviousPublication(f, 'act');
  await startFirstAdmitted(f);
  await f.until((frame) => frame.job.phase === 'done');
  await finishAct(f);
  const integrationId = 'passage-integration-0001';
  const report = f.records.get('books/book/literaryIntegrationJobs/' + integrationId);
  const publications = createLiteraryPublicationService({ db: f.db, now: () => 1100 });
  const publicationId = 'workflow-act-publication-0001',
    command = { target, jobId: publicationId };
  let publication = await publications.startLiteraryPublication('author', {
    ...command,
    policy: 'act',
    unitId: 'first',
    integrationId,
    expectedIntegrationToken: report.sourceFence,
    authorName: 'Autora',
    checks: { finalTextReviewed: true, navigationReviewed: true, publicationAuthorized: true },
  });
  for (let n = 0; n < 100 && publication.state !== 'prepared'; n++)
    publication = await publications.advanceLiteraryPublication('author', command);
  assert.equal(publication.state, 'prepared');
  const guide = createLiteraryPublicationGuideService({ db: f.db, now: () => 1200 });
  await guide.startLiteraryPublicationGuideVerification('author', {
    ...command,
    expectedGuideRevision: publication.guideRevision,
    expectedManifestHash: publication.manifestHash,
  });
  for (let n = 0; n < 100 && publication.state !== 'verified'; n++)
    publication = await guide.advanceLiteraryPublicationGuide('author', command);
  assert.equal(publication.state, 'verified');
  await createLiteraryPublicationConfirmationService({
    db: f.db,
    now: () => 1300,
  }).confirmLiteraryPublication('author', {
    ...command,
    operationId: 'workflow-act-confirmation-0001',
    expectedManifestHash: publication.manifestHash,
    expectedGuideHash: publication.guideHash,
    expectedRemovalHash: publication.removalHash,
    checks: {
      wholeTextChecked: true,
      guideChecked: true,
      removalsChecked: true,
      authorizePublicRelease: true,
    },
  });
  const inspectionId = 'workflow-published-inspection-0001';
  const inspectionScope = await f.api.getLiteraryPassageInspectionScope('author', {
    target,
    chapterId: next.chapterId,
  });
  await f.api.startLiteraryPassageInspection('author', {
    target,
    inspectionId,
    chapterId: next.chapterId,
    publicationId,
    expectedScopeToken: inspectionScope.scopeToken,
  });
  let inspection = await f.api.getLiteraryPassageInspection('author', { target, inspectionId });
  for (let n = 0; n < 100 && inspection.state !== 'ready'; n++)
    inspection = await f.api.advanceLiteraryPassageInspection('author', {
      target,
      inspectionId,
      expectedOriginToken: inspection.originToken,
      expectedRevision: inspection.revision,
    });
  assert.equal(inspection.state, 'ready');
  const input = await next.input({
    previousWorkflowId: 'workflow-cycle-0001',
    actIntegrationId: integrationId,
    inspectionId,
  });
  const started = await f.api.startLiteraryWorkflow('author', input);
  assert.equal(started.job.admission.condition, 'publishedPredecessor');
  assert.equal(started.job.admission.inspection.publication.scope.kind, 'act');
  assert.equal(started.job.passage.integration.id, integrationId);
});

test('workflow registration records its private fence and stable reads do not write another marker', async () => {
  const f = await fixture();
  assert.equal(f.records.has('books/book/literaryBackupControls/current'), false);
  await f.start();
  const marker = structuredClone(f.records.get('books/book/literaryBackupControls/current'));
  assert.equal(marker.schemaVersion, 1);
  await f.get();
  await f.get();
  assert.deepEqual(f.records.get('books/book/literaryBackupControls/current'), marker);
});
test('pausing a workflow invalidates its capture marker while preserving manuscript fields and advancing the dependency clock without charging credits', async () => {
  const f = await fixture();
  await f.start();
  const marker = f.records.get('books/book/literaryBackupControls/current').writeId,
    root = structuredClone(f.records.get('books/book')),
    credits = f.records.get('users/author').credits;
  await f.control('pause');
  assert.notEqual(f.records.get('books/book/literaryBackupControls/current').writeId, marker);
  assert.deepEqual(f.records.get('books/book'), {
    ...root,
    literaryDependencyRevision: root.literaryDependencyRevision + 1,
  });
  assert.equal(f.records.get('users/author').credits, credits);
});
test('replaying an already confirmed workflow control preserves its original capture marker', async () => {
  const f = await fixture();
  await f.start();
  const frame = await f.get(),
    request = {
      target,
      jobId: frame.job.jobId,
      operationId: 'workflow-fence-replay',
      expectedRevision: frame.job.revision,
      expectedOriginToken: frame.job.originToken,
      action: 'pause',
    };
  await f.api.setLiteraryWorkflowControl('author', request);
  const marker = structuredClone(f.records.get('books/book/literaryBackupControls/current'));
  await f.api.setLiteraryWorkflowControl('author', request);
  assert.deepEqual(f.records.get('books/book/literaryBackupControls/current'), marker);
});
