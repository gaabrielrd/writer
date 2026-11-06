import { setup } from './helpers/literarySequenceFixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { target, limits, phases, answer } from './helpers/literaryWorkflowFixtures.mjs';
import { createLiteraryProseService } from '../src/literaryProse.mjs';
const id = 'sequence-native-0001';
async function finishNext(f) {
  let frame;
  for (let i = 0; i < 120; i++) {
    frame = await f.next.advance();
    if (frame.job.phase === 'done') return frame;
    assert.notEqual(frame.job.phase, 'stale');
  }
  assert.fail('O próximo capítulo não foi concluído.');
}
test('selected native chapter cycles share one atomic application/credit ledger and stop at the exact authorized last unit', async () => {
  const f = await setup();
  const initial = await f.startSequence();
  assert.equal(initial.currentWorkflowId, null);
  assert.equal(initial.applications, 0);
  assert.equal(f.calls.length, 0);
  assert.equal(JSON.stringify(initial).includes('PRIVATE_SEQUENCE_INSTRUCTION'), false);
  await f.startFirst();
  const first = await f.until((x) => x.job.phase === 'done');
  assert.equal((await f.getSequence()).applications, 2);
  assert.equal((await f.getSequence()).credits, 2);
  assert.equal(f.records.get('users/author').credits, 8);
  const moved = await f.complete(first.job.jobId);
  assert.equal(moved.index, 1);
  assert.equal(moved.state, 'active');
  await f.startNext();
  const last = await finishNext(f);
  const done = await f.complete(last.job.jobId);
  assert.equal(done.state, 'done');
  assert.equal(done.index, 2);
  assert.equal(done.completed.length, 2);
  assert.equal(done.currentWorkflowId, null);
  assert.equal(done.applications, 3);
  assert.equal(done.credits, 3);
  assert.equal(f.records.get('users/author').credits, 7);
  assert.ok(done.steps > 0);
  assert.equal((await f.startSequence()).state, 'done');
  assert.equal((await f.get()).job.phase, 'revisedVersion');
  assert.equal(f.records.get('users/author').credits, 7);
});
test('the aggregate budget cannot be expanded through a linked workflow or bypassed through direct prose application', async () => {
  const f = await setup();
  f.input.limits = { ...f.input.limits, maxApplications: 2, maxCredits: 2 };
  await f.startSequence();
  await f.startFirst();
  const first = await f.until((x) => x.job.phase === 'done');
  await f.complete(first.job.jobId);
  const next = await f.startNext();
  assert.equal(next.job.limits.maxApplications, 0);
  let frame;
  for (let i = 0; i < 5; i++) {
    frame = await f.next.advance();
    if (frame.job.stop === 'budget') break;
  }
  assert.equal(frame.job.stop, 'budget');
  await assert.rejects(
    f.api.setLiteraryWorkflowControl('author', {
      target,
      jobId: frame.job.jobId,
      operationId: 'sequence-bypass-control-0001',
      expectedRevision: frame.job.revision,
      expectedOriginToken: frame.job.originToken,
      action: 'resume',
      limits,
      authorizedPhases: phases,
    }),
    { code: 'failed-precondition' },
  );
  assert.equal((await f.getSequence()).applications, 2);
  assert.equal(f.records.get('users/author').credits, 8);
});
test('direct proposal application cannot bypass its sequence owner and a replay never consumes the ledger twice', async () => {
  const f = await setup();
  await f.startSequence();
  await f.startFirst();
  // Supervise this child while preserving the parent's larger standing grant.
  const native = await f.get();
  await f.api.setLiteraryWorkflowControl('author', {
    target,
    jobId: native.job.jobId,
    operationId: 'sequence-local-supervise-0001',
    expectedRevision: native.job.revision,
    expectedOriginToken: native.job.originToken,
    action: 'resume',
    authorizedPhases: [],
  });
  let frame = await f.until((x) => x.job.stop === 'firstVersionAuthorization');
  await f.control('startFirstVersion', { expectedGateToken: frame.job.gate.stateToken });
  frame = await f.until((x) => x.job.stop === 'scene' && x.draft?.proposal?.applicable);
  const requestId = frame.draft.proposal.requestId;
  const prose = createLiteraryProseService({ db: f.db });
  await assert.rejects(
    prose.applyLiteraryProse('author', {
      target,
      requestId,
      operationId: 'sequence-direct-prose-0001',
    }),
    { code: 'failed-precondition' },
  );
  assert.equal((await f.getSequence()).applications, 0);
  assert.equal(f.records.get('users/author').credits, 10);
  const command = {
    target,
    jobId: frame.job.draftId,
    requestId,
    operationId: 'sequence-native-apply-0001',
  };
  await f.drafts.acceptLiteraryDraftScene('author', command);
  await f.drafts.acceptLiteraryDraftScene('author', command);
  assert.equal((await f.getSequence()).applications, 1);
  assert.equal((await f.getSequence()).credits, 1);
  assert.equal(f.records.get('users/author').credits, 9);
});
test('aggregate pause during a provider fences the prose/credit commit and closes the current workflow and draft atomically', async () => {
  let entered,
    release,
    hold = true;
  const waiting = new Promise((resolve) => {
    entered = resolve;
  });
  const f = await setup({
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
  await f.startSequence();
  await f.startFirst();
  await f.advance();
  await f.advance();
  let running;
  for (let i = 0; i < 20; i++) {
    const pending = f.advance();
    if (await Promise.race([waiting.then(() => true), pending.then(() => false)])) {
      running = pending;
      break;
    }
    await pending;
  }
  assert.ok(running);
  const paused = await f.sequenceControl('pause');
  assert.equal(paused.paused, true);
  const parent = f.records.get('books/book/literaryWorkflowJobs/workflow-cycle-0001');
  assert.equal(parent.paused, true);
  assert.equal(f.records.get('books/book/literaryDraftJobs/' + parent.draftId).paused, true);
  release(answer('draftScene'));
  await running;
  assert.equal((await f.getSequence()).applications, 0);
  assert.equal(f.records.get('users/author').credits, 10);
  await assert.rejects(f.advance(), { code: 'failed-precondition' });
  await f.sequenceControl('resume');
  const done = await f.until((x) => x.job.phase === 'done');
  assert.equal(done.job.phase, 'done');
  assert.equal((await f.getSequence()).applications, 2);
  assert.equal(f.records.get('users/author').credits, 8);
});
test('supervised entry to the next selected chapter remains a separate author decision', async () => {
  const f = await setup();
  f.input.continueBetweenChapters = false;
  await f.startSequence();
  await f.startFirst();
  const first = await f.until((x) => x.job.phase === 'done');
  const blocked = await f.complete(first.job.jobId);
  assert.equal(blocked.stop, 'nextChapterAuthorization');
  await assert.rejects(f.startNext(), { code: 'failed-precondition' });
  await f.sequenceControl('authorizeNext');
  assert.equal((await f.startNext()).job.chapterId, f.next.chapterId);
  assert.equal((await f.getSequence()).applications, 2);
});
test('native sequence recreation, order changes and actors cannot adopt the original workflow authorization', async () => {
  const f = await setup();
  const initial = await f.startSequence();
  await f.startFirst();
  await assert.rejects(f.sequence.getLiterarySequence('other', { target, jobId: id }), {
    code: 'not-found',
  });
  const path = 'books/book/literarySequenceJobs/' + id;
  await f.db.runTransaction(async (tx) => {
    const ref = f.db.doc(path),
      value = (await tx.get(ref)).data();
    tx.delete(ref);
    tx.create(ref, value);
  });
  await assert.rejects(f.advance(), { code: 'failed-precondition' });
  await assert.rejects(f.startSequence(), { code: 'failed-precondition' });
  await assert.rejects(
    f.sequence.setLiterarySequenceControl('author', {
      target,
      jobId: id,
      action: 'resume',
      expectedRevision: initial.revision,
      expectedOriginToken: initial.originToken,
    }),
    { code: 'failed-precondition' },
  );
  assert.equal(f.records.get('users/author').credits, 10);
});
test('only selected ordered scene chapters can be bound and the batch bound does not impose a book structure', async () => {
  const f = await setup();
  await assert.rejects(
    f.sequence.getLiterarySequenceScope('author', {
      target,
      chapterIds: [f.next.chapterId, f.chapterId],
    }),
    { code: 'failed-precondition' },
  );
  await assert.rejects(
    f.sequence.getLiterarySequenceScope('author', {
      target,
      chapterIds: Array(26).fill(f.chapterId),
    }),
    { code: 'invalid-argument' },
  );
  await f.startSequence();
  const wrong = await f.next.input().catch(() => null);
  assert.equal(wrong, null);
  await f.startFirst();
  const first = await f.until((x) => x.job.phase === 'done');
  await assert.rejects(f.complete('some-other-workflow'), { code: 'failed-precondition' });
  assert.equal((await f.getSequence()).index, 0);
  assert.equal(first.job.phase, 'done');
});

test('sequence step limits are shared and replay of a recorded workflow step cannot consume another step', async () => {
  const f = await setup();
  f.input.limits.maxSteps = 2;
  await f.startSequence();
  const child = await f.startFirst();
  await f.advance();
  await f.advance();
  assert.equal((await f.getSequence()).steps, 2);
  const replay = await f.api.advanceLiteraryWorkflow('author', {
    target,
    jobId: child.job.jobId,
    operationId: 'workflow-step-00001',
    expectedRevision: child.job.revision,
    expectedOriginToken: child.job.originToken,
  });
  assert.ok(replay.job);
  assert.equal((await f.getSequence()).steps, 2);
  assert.equal((await f.advance()).job.stop, 'budget');
  const draft = await f.get();
  await assert.rejects(
    f.drafts.advanceLiteraryDraft('author', { target, jobId: draft.job.draftId }),
    { code: 'failed-precondition' },
  );
  assert.equal(f.calls.length, 0);
  assert.equal((await f.getSequence()).steps, 2);
  await assert.rejects(
    f.sequenceControl('resume', { limits: { maxApplications: 3, maxCredits: 3, maxSteps: 1 } }),
    { code: 'invalid-argument' },
  );
});
test('cancel keeps all aggregate expenditure and neither the child nor a lost original record can rearm its grant', async () => {
  const f = await setup();
  await f.startSequence();
  await f.startFirst();
  const applied = await f.until((x) => (x.draft?.job.drafted ?? 0) === 1);
  const canceled = await f.sequenceControl('cancel');
  assert.equal(canceled.state, 'canceled');
  assert.equal(canceled.applications, 1);
  assert.equal(canceled.credits, 1);
  await assert.rejects(f.control('resume'), { code: 'failed-precondition' });
  assert.equal(
    f.records.get('books/book/literaryWorkflowJobs/' + applied.job.jobId).phase,
    'canceled',
  );
  assert.equal(f.records.get('users/author').credits, 9);
  f.records.delete('books/book/literarySequenceJobs/' + id);
  await assert.rejects(f.startSequence(), { code: 'failed-precondition' });
  assert.equal(f.records.has('books/book/literarySequenceJobs/' + id), false);
  assert.equal(f.records.get('users/author').credits, 9);
});

test('an interrupted aggregate registration can only confirm its frozen source or cancel without activating children', async () => {
  const f = await setup();
  const run = f.db.runTransaction;
  let held = true;
  f.db.runTransaction = async (operation) => {
    if (
      held &&
      f.records.get('books/book/literarySequenceJobs/' + id)?.registrationState === 'registering'
    ) {
      held = false;
      throw new Error('Binding acknowledgement interrupted');
    }
    return run(operation);
  };
  await assert.rejects(f.startSequence(), /interrupted/);
  f.db.runTransaction = run;
  const interrupted = await f.getSequence();
  assert.equal(interrupted.registrationState, 'registering');
  assert.equal(interrupted.currentWorkflowId, null);
  await f.sequenceControl('confirmRegistration');
  assert.equal((await f.getSequence()).registrationState, 'active');
  assert.equal(f.calls.length, 0);
  await f.startFirst();
  assert.equal((await f.getSequence()).currentWorkflowId, 'workflow-cycle-0001');
});
test('deleting a linked native workflow header cannot recreate its grant from a replayed start request', async () => {
  const f = await setup();
  await f.startSequence();
  await f.startFirst();
  f.records.delete('books/book/literaryWorkflowJobs/workflow-cycle-0001');
  await assert.rejects(f.startFirst(), { code: 'failed-precondition' });
  assert.equal(f.records.has('books/book/literaryWorkflowJobs/workflow-cycle-0001'), false);
  assert.equal((await f.getSequence()).applications, 0);
});

test('linked cycles cannot replace the frozen sequence instruction or generation snapshot', async () => {
  const f = await setup();
  const seq = await f.startSequence();
  const wire = await f.startInput();
  await assert.rejects(
    f.api.startLiteraryWorkflow(
      'author',
      wire,
      f.sequence.workflowHooks('author', {
        target,
        jobId: id,
        expectedOriginToken: seq.originToken,
      }),
    ),
    { code: 'failed-precondition' },
  );
  assert.equal((await f.getSequence()).currentWorkflowId, null);
  assert.equal(f.records.has('books/book/literaryWorkflowJobs/workflow-cycle-0001'), false);
  assert.equal(f.calls.length, 0);
  await f.startFirst();
  assert.equal((await f.getSequence()).currentWorkflowId, 'workflow-cycle-0001');
});

test('revoking a parent automatic phase blocks the old child grant before another generation step', async () => {
  const f = await setup();
  await f.startSequence();
  await f.startFirst();
  await f.advance();
  await f.sequenceControl('pause', { authorizedPhases: [] });
  await f.sequenceControl('resume');
  await assert.rejects(f.advance(), { code: 'failed-precondition' });
  assert.equal(f.calls.length, 0);
  assert.equal((await f.getSequence()).applications, 0);
  await f.control('resume', { authorizedPhases: [] });
  const supervised = await f.advance();
  assert.equal(supervised.draft.job.execution.mode, 'supervised');
  assert.equal(f.records.get('users/author').credits, 10);
});

test('malformed aggregate counts never become an invented zero or authorize a native application', async () => {
  const f = await setup();
  await f.startSequence();
  await f.startFirst();
  const path = 'books/book/literarySequenceJobs/' + id;
  f.records.set(path, { ...f.records.get(path), credits: null });
  await assert.rejects(f.advance(), { code: 'failed-precondition' });
  assert.equal(f.calls.length, 0);
  assert.equal(f.records.get(path).credits, null);
  assert.equal(f.records.get('users/author').credits, 10);
});
