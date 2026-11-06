import { createLiteraryIntegrationService } from '../src/literaryIntegration.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, id } from './helpers/literarySequenceFixtures.mjs';
import { target, answer } from './helpers/literaryWorkflowFixtures.mjs';
import { createLiterarySequenceDriver } from '../src/literarySequenceDriver.mjs';
async function fixture(options = {}) {
  const f = await setup(options),
    driver = createLiterarySequenceDriver({
      db: f.db,
      sequences: f.sequence,
      workflows: f.api,
      now: () => 700,
    });
  const get = () => driver.getLiterarySequence('author', { target, jobId: id });
  let n = 0;
  const input = async (extra = {}) => {
    const { job } = await get();
    return {
      target,
      jobId: id,
      operationId: 'sequence-driver-step-' + String(++n).padStart(4, '0'),
      expectedRevision: job.revision,
      expectedOriginToken: job.originToken,
      ...extra,
    };
  };
  const advance = async (extra = {}) =>
    driver.advanceLiterarySequence('author', await input(extra));
  const controlInput = async (action, extra = {}) => {
    const wire = await input();
    return {
      ...wire,
      operationId: 'sequence-driver-control-' + String(++n).padStart(4, '0'),
      action,
      ...extra,
    };
  };
  const control = async (action, extra = {}) =>
    driver.setLiterarySequenceControl('author', await controlInput(action, extra));
  async function until(predicate, max = 300) {
    let frame = await get();
    for (let i = 0; i < max && !predicate(frame); i++) frame = await advance();
    assert.ok(predicate(frame), JSON.stringify(frame.job));
    return frame;
  }
  const outcome = (operationId) =>
    driver.getLiterarySequenceOperation('author', { target, jobId: id, operationId });
  return {
    ...f,
    driver,
    getRun: get,
    nextInput: input,
    advanceRun: advance,
    controlInput,
    controlRun: control,
    untilRun: until,
    outcome,
    register: () => driver.startLiterarySequence('author', f.input),
  };
}
test('the serial driver completes exactly the selected chapters with one shared native ledger and no extra book/unit', async () => {
  const f = await fixture();
  const registered = await f.register();
  assert.equal(registered.job.currentWorkflowId, null);
  assert.equal(f.calls.length, 0);
  const done = await f.untilRun((v) => v.job.state === 'done');
  assert.equal(done.job.index, 2);
  assert.equal(done.job.completed.length, 2);
  assert.equal(done.job.applications, 3);
  assert.equal(done.job.credits, 3);
  assert.equal(done.job.busyStep, null);
  assert.equal(f.records.get('users/author').credits, 7);
  assert.equal(
    [...f.records.keys()].filter((v) => /literaryWorkflowJobs\/[^/]+$/.test(v)).length,
    2,
  );
  await assert.rejects(f.advanceRun(), { code: 'failed-precondition' });
  const start = await f.outcome(id);
  assert.equal(start.state, 'confirmed');
  assert.equal(start.method, 'startLiterarySequence');
  assert.equal(JSON.stringify(start).includes('PRIVATE_SEQUENCE_INSTRUCTION'), false);
});
test('explicit metadata recovery of a lost child-start acknowledgement reuses the frozen wire without another capture or child', async () => {
  const f = await fixture();
  await f.register();
  const nativeStart = f.api.startLiteraryWorkflow,
    nativeScope = f.api.getLiteraryWorkflowScope;
  let lost = false,
    reads = 0;
  f.api.getLiteraryWorkflowScope = async (...args) => {
    reads++;
    return nativeScope(...args);
  };
  f.api.startLiteraryWorkflow = async (...args) => {
    const value = await nativeStart(...args);
    if (!lost) {
      lost = true;
      throw new Error('ACK lost after child registration');
    }
    return value;
  };
  const wire = await f.nextInput();
  await assert.rejects(f.driver.advanceLiterarySequence('author', wire), /ACK lost/);
  assert.equal((await f.outcome(wire.operationId)).state, 'running');
  assert.equal((await f.getRun()).job.busyStep, wire.operationId);
  await assert.rejects(f.advanceRun(), { code: 'failed-precondition' });
  const recovered = await f.driver.resumeLiterarySequenceOperation('author', {
    target,
    jobId: id,
    operationId: wire.operationId,
  });
  assert.equal(recovered.job.busyStep, null);
  assert.equal(reads, 1);
  assert.equal((await f.outcome(wire.operationId)).state, 'confirmed');
  assert.equal(
    [...f.records.keys()].filter((v) => /literaryWorkflowJobs\/[^/]+$/.test(v)).length,
    1,
  );
  assert.equal(f.calls.length, 0);
  assert.equal(f.records.get('users/author').credits, 10);
});
test('a lost acknowledgement after a scene commit recovers the same child step without generating the next scene', async () => {
  const f = await fixture();
  await f.register();
  const native = f.api.advanceLiteraryWorkflow;
  let lost = false,
    failedWire;
  f.api.advanceLiteraryWorkflow = async (...args) => {
    const before = f.records.get('users/author').credits,
      value = await native(...args);
    if (!lost && before === 10 && f.records.get('users/author').credits === 9) {
      lost = true;
      throw new Error('ACK lost after native scene/debit');
    }
    return value;
  };
  for (let i = 0; i < 40; i++) {
    const wire = await f.nextInput();
    try {
      await f.driver.advanceLiterarySequence('author', wire);
    } catch (cause) {
      assert.match(cause.message, /ACK lost/);
      failedWire = wire;
      break;
    }
  }
  assert.ok(failedWire);
  const calls = f.calls.length;
  const recovered = await f.driver.resumeLiterarySequenceOperation('author', {
    target,
    jobId: id,
    operationId: failedWire.operationId,
  });
  assert.equal(recovered.job.applications, 1);
  assert.equal(recovered.job.credits, 1);
  assert.equal(f.calls.length, calls);
  assert.equal(f.records.get('users/author').credits, 9);
  assert.equal(f.records.get('books/book/scenes/' + f.ids[1] + '/body/current').content, '');
  assert.equal((await f.outcome(failedWire.operationId)).state, 'confirmed');
});
test('a completed-unit receipt is atomic with moving the cursor and replay cannot enter the next chapter', async () => {
  const f = await fixture();
  await f.register();
  await f.untilRun((v) => v.workflow?.job.phase === 'done');
  const wire = await f.nextInput();
  const [a, b] = await Promise.all([
    f.driver.advanceLiterarySequence('author', wire),
    f.driver.advanceLiterarySequence('author', wire),
  ]);
  assert.equal(a.job.index, 1);
  assert.equal(b.job.index, 1);
  assert.equal((await f.getRun()).job.completed.length, 1);
  assert.equal((await f.getRun()).job.currentWorkflowId, null);
  assert.equal((await f.outcome(wire.operationId)).result.disposition, 'completedUnit');
  await f.driver.advanceLiterarySequence('author', wire);
  assert.equal((await f.getRun()).job.currentWorkflowId, null);
  assert.equal(
    [...f.records.keys()].filter((v) => /literaryWorkflowJobs\/[^/]+$/.test(v)).length,
    1,
  );
});
test('controls are idempotent by operation and a different stale decision is never inferred from the current value', async () => {
  const f = await fixture();
  await f.register();
  await f.advanceRun();
  const wire = await f.controlInput('pause');
  const first = await f.driver.setLiterarySequenceControl('author', wire);
  const replay = await f.driver.setLiterarySequenceControl('author', wire);
  assert.equal(replay.job.revision, first.job.revision);
  assert.equal(replay.job.paused, true);
  assert.equal((await f.outcome(wire.operationId)).result.disposition, 'controlled');
  await assert.rejects(
    f.driver.setLiterarySequenceControl('author', { ...wire, action: 'resume' }),
    { code: 'invalid-argument' },
  );
  await assert.rejects(
    f.driver.setLiterarySequenceControl('author', {
      ...wire,
      operationId: 'sequence-other-pause-0001',
    }),
    { code: 'failed-precondition' },
  );
  assert.equal((await f.outcome('sequence-other-pause-0001')).state, 'unconfirmed');
});
test('pause during a provider supersedes the exact parent step and its late response cannot repaint or debit', async () => {
  let entered,
    release,
    hold = true;
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
  await f.register();
  let running, original;
  for (let i = 0; i < 30; i++) {
    const wire = await f.nextInput(),
      pending = f.driver.advanceLiterarySequence('author', wire);
    if (await Promise.race([waiting.then(() => true), pending.then(() => false)])) {
      running = pending;
      original = wire;
      break;
    }
    await pending;
  }
  assert.ok(running);
  const paused = await f.controlRun('pause');
  assert.equal(paused.job.paused, true);
  assert.equal(paused.job.busyStep, null);
  assert.equal((await f.outcome(original.operationId)).state, 'superseded');
  release(answer('draftScene'));
  const late = await running;
  assert.equal(late.job.paused, true);
  assert.equal(late.job.applications, 0);
  assert.equal(f.records.get('users/author').credits, 10);
  const replay = await f.driver.advanceLiterarySequence('author', original);
  assert.equal(replay.job.paused, true);
});
test('driver outcomes and old steps reject recreated sequence or book origins even when the IDs match', async () => {
  for (const path of ['books/book', 'books/book/literarySequenceJobs/' + id]) {
    const f = await fixture();
    await f.register();
    const wire = await f.nextInput();
    await f.driver.advanceLiterarySequence('author', wire);
    await f.db.runTransaction(async (tx) => {
      const ref = f.db.doc(path),
        value = (await tx.get(ref)).data();
      tx.delete(ref);
      tx.create(ref, value);
    });
    await assert.rejects(f.driver.advanceLiterarySequence('author', wire), {
      code: 'failed-precondition',
    });
    await assert.rejects(f.outcome(wire.operationId), { code: 'failed-precondition' });
    assert.equal(f.records.get('users/author').credits, 10);
  }
});

test('the driver resumes an explicitly amended aggregate budget inside the same chapter without resetting consumption', async () => {
  const f = await fixture();
  f.input.limits.maxApplications = 1;
  f.input.limits.maxCredits = 1;
  await f.register();
  const limited = await f.untilRun((v) => v.job.stop === 'budget');
  assert.equal(limited.job.applications, 1);
  assert.equal(limited.job.index, 0);
  const workflowId = limited.job.currentWorkflowId;
  await f.controlRun('resume', { limits: { maxApplications: 3, maxCredits: 3, maxSteps: 1000 } });
  const amended = await f.advanceRun();
  assert.equal(amended.job.currentWorkflowId, workflowId);
  assert.equal(amended.job.applications, 1);
  assert.equal(amended.workflow.job.limits.maxApplications, 3);
  const done = await f.untilRun((v) => v.job.state === 'done');
  assert.equal(done.job.applications, 3);
  assert.equal(done.job.credits, 3);
  assert.equal(f.records.get('users/author').credits, 7);
});
test('a chapter boundary with no automatic transition stops until an explicit idempotent author decision', async () => {
  const f = await fixture();
  f.input.continueBetweenChapters = false;
  await f.register();
  const boundary = await f.untilRun((v) => v.job.stop === 'nextChapterAuthorization');
  assert.equal(boundary.job.index, 1);
  assert.equal(boundary.job.currentWorkflowId, null);
  await f.advanceRun();
  assert.equal((await f.getRun()).job.currentWorkflowId, null);
  const wire = await f.controlInput('authorizeNext');
  await f.driver.setLiterarySequenceControl('author', wire);
  await f.driver.setLiterarySequenceControl('author', wire);
  const done = await f.untilRun((v) => v.job.state === 'done');
  assert.equal(done.job.completed.length, 2);
  assert.equal(f.records.get('users/author').credits, 7);
});
async function integrateAct(f) {
  const api = createLiteraryIntegrationService({
    db: f.db,
    now: () => 800,
    generator: async (input) =>
      input.scope.phase === 'synthesis'
        ? { complete: true, report: 'Ato integral conferido.', findings: [], conclusions: [] }
        : { complete: true, report: 'Unidade conferida.', findings: [], matrix: [] },
  });
  const command = { target, jobId: 'sequence-driver-integration-0001' };
  await api.startLiteraryIntegration('author', {
    ...command,
    level: 'act',
    actId: 'first',
    instruction: 'Confira todas as cenas.',
  });
  let job;
  for (let i = 0; i < 100; i++) {
    job = await api.advanceLiteraryIntegration('author', command);
    if (job.state === 'done') break;
  }
  assert.equal(job.state, 'done');
  await api.acceptLiteraryIntegration('author', {
    ...command,
    expectedSourceToken: job.sourceToken,
  });
  return command.jobId;
}
test('crossing an act waits for its native integration and never replaces the report inside a replayed operation', async () => {
  const f = await fixture({ acts: true });
  await f.register();
  const boundary = await f.untilRun((v) => v.job.stop === 'actIntegration');
  assert.equal(boundary.job.currentWorkflowId, null);
  assert.equal(boundary.job.applications, 2);
  const bad = await f.nextInput({ actIntegrationId: 'sequence-missing-report-0001' });
  const stopped = await f.driver.advanceLiterarySequence('author', bad);
  assert.equal(stopped.job.currentWorkflowId, null);
  const reportId = await integrateAct(f);
  await assert.rejects(
    f.driver.advanceLiterarySequence('author', { ...bad, actIntegrationId: reportId }),
    { code: 'invalid-argument' },
  );
  const bound = await f.advanceRun({ actIntegrationId: reportId });
  assert.ok(bound.job.currentWorkflowId);
  assert.equal(bound.workflow.job.passage.input.actIntegrationId, reportId);
  const done = await f.untilRun((v) => v.job.state === 'done');
  assert.equal(done.job.applications, 3);
  assert.equal(f.records.get('users/author').credits, 7);
});
test('an interrupted child activation is explicitly repaired after parent pause without another child or provider call', async () => {
  const f = await fixture();
  await f.register();
  let paused = false;
  const run = f.db.runTransaction;
  f.db.runTransaction = async (operation) => {
    const child = [...f.records.entries()].find(([path]) =>
      /literaryWorkflowJobs\/[^/]+$/.test(path),
    )?.[1];
    if (!paused && child?.registrationState === 'registering') {
      paused = true;
      f.db.runTransaction = run;
      await f.controlRun('pause');
    }
    return run(operation);
  };
  await f.advanceRun();
  f.db.runTransaction = run;
  assert.equal((await f.getRun()).job.paused, true);
  await f.controlRun('resume');
  const repaired = await f.advanceRun();
  assert.equal(repaired.workflow.job.registrationState, 'active');
  assert.equal(
    [...f.records.keys()].filter((v) => /literaryWorkflowJobs\/[^/]+$/.test(v)).length,
    1,
  );
  assert.equal(f.calls.length, 0);
  assert.equal(f.records.get('users/author').credits, 10);
});
test('a completed child acknowledgement failure is reconciled from its own receipt without entering another unit', async () => {
  const f = await fixture();
  await f.register();
  await f.untilRun((v) => v.workflow?.job.phase === 'done');
  const native = f.sequence.completeLiterarySequenceChapter;
  let lost = false;
  f.sequence.completeLiterarySequenceChapter = async (...args) => {
    const value = await native(...args);
    if (!lost) {
      lost = true;
      throw new Error('Completion ACK lost');
    }
    return value;
  };
  const wire = await f.nextInput();
  const moved = await f.driver.advanceLiterarySequence('author', wire);
  assert.equal(moved.job.index, 1);
  assert.equal(moved.job.currentWorkflowId, null);
  assert.equal((await f.outcome(wire.operationId)).result.disposition, 'completedUnit');
  await f.driver.advanceLiterarySequence('author', wire);
  assert.equal((await f.getRun()).job.currentWorkflowId, null);
});

test('duplicate delivery of a pending provider step never produces two proposals or skips the registered scene', async () => {
  let entered,
    release,
    hold = true;
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
  await f.register();
  let running, wire;
  for (let i = 0; i < 30; i++) {
    const input = await f.nextInput(),
      pending = f.driver.advanceLiterarySequence('author', input);
    if (await Promise.race([waiting.then(() => true), pending.then(() => false)])) {
      running = pending;
      wire = input;
      break;
    }
    await pending;
  }
  const duplicate = await f.driver.advanceLiterarySequence('author', wire);
  assert.equal(duplicate.waitingForResult, true);
  assert.equal(f.calls.length, 1);
  assert.equal(f.records.get('users/author').credits, 10);
  release(answer('draftScene'));
  await running;
  assert.equal((await f.getRun()).job.applications, 1);
  const calls = f.calls.length;
  await f.driver.advanceLiterarySequence('author', wire);
  assert.equal(f.calls.length, calls);
  assert.equal(f.records.get('books/book/scenes/' + f.ids[1] + '/body/current').content, '');
});
test('cancel closes a running sequence step permanently and recovery cannot revive its registered producer', async () => {
  const f = await fixture();
  await f.register();
  const native = f.api.startLiteraryWorkflow;
  let lost = false;
  f.api.startLiteraryWorkflow = async (...args) => {
    const value = await native(...args);
    if (!lost) {
      lost = true;
      throw new Error('Lost start response');
    }
    return value;
  };
  const wire = await f.nextInput();
  await assert.rejects(f.driver.advanceLiterarySequence('author', wire), /Lost/);
  const canceled = await f.controlRun('cancel');
  assert.equal(canceled.job.state, 'canceled');
  assert.equal((await f.outcome(wire.operationId)).state, 'superseded');
  const replay = await f.driver.advanceLiterarySequence('author', wire);
  assert.equal(replay.job.state, 'canceled');
  await assert.rejects(f.controlRun('resume'), { code: 'failed-precondition' });
  assert.equal(f.calls.length, 0);
  assert.equal(f.records.get('users/author').credits, 10);
});
test('irrelevant act grants and changed operation payloads fail closed before creating any workflow', async () => {
  const f = await fixture();
  await f.register();
  await assert.rejects(f.advanceRun({ actIntegrationId: 'sequence-wrong-act-0001' }), {
    code: 'invalid-argument',
  });
  assert.equal((await f.getRun()).job.currentWorkflowId, null);
  const wire = await f.nextInput();
  await f.driver.advanceLiterarySequence('author', wire);
  await assert.rejects(
    f.driver.advanceLiterarySequence('author', {
      ...wire,
      expectedRevision: wire.expectedRevision + 1,
    }),
    { code: 'invalid-argument' },
  );
  assert.equal(f.calls.length, 0);
});

test('an interrupted start retains its original receipt revision after explicit confirmation, and cancellation never confirms activation', async () => {
  for (const action of ['confirmRegistration', 'cancel']) {
    const f = await fixture(),
      run = f.db.runTransaction;
    let interrupted = false;
    f.db.runTransaction = async (operation) => {
      if (
        !interrupted &&
        f.records.get('books/book/literarySequenceJobs/' + id)?.registrationState === 'registering'
      ) {
        interrupted = true;
        throw new Error('Start binding interrupted');
      }
      return run(operation);
    };
    await assert.rejects(f.register(), /interrupted/);
    f.db.runTransaction = run;
    assert.equal((await f.outcome(id)).state, 'unconfirmed');
    const wire = await f.controlInput(action);
    const changed = await f.driver.setLiterarySequenceControl('author', wire);
    const start = await f.outcome(id),
      control = await f.outcome(wire.operationId);
    assert.equal(start.state, action === 'cancel' ? 'superseded' : 'confirmed');
    assert.equal(start.revision, 1);
    assert.equal(control.revision, 2);
    assert.equal(changed.job.registrationState, action === 'cancel' ? 'canceled' : 'active');
    assert.equal(f.calls.length, 0);
  }
});
test('a native parent pause also closes the driver ticket instead of stranding its recovery pointer', async () => {
  const f = await fixture();
  await f.register();
  const native = f.api.startLiteraryWorkflow;
  f.api.startLiteraryWorkflow = async (...args) => {
    await native(...args);
    throw new Error('Lost start');
  };
  const wire = await f.nextInput();
  await assert.rejects(f.driver.advanceLiterarySequence('author', wire), /Lost/);
  await f.sequenceControl('pause');
  assert.equal((await f.getRun()).job.busyStep, null);
  assert.equal((await f.outcome(wire.operationId)).state, 'superseded');
  await f.sequenceControl('resume');
  assert.equal((await f.getRun()).job.paused, false);
  const recovered = await f.driver.advanceLiterarySequence('author', wire);
  assert.equal(recovered.job.currentWorkflowId, (await f.getRun()).job.currentWorkflowId);
  assert.equal(f.calls.length, 0);
});

test('a lost local freeze acknowledgement recovers the stored start wire without repeating its source preflight', async () => {
  const f = await fixture();
  await f.register();
  const wire = await f.nextInput(),
    path = 'books/book/literaryOperations/' + wire.operationId;
  const run = f.db.runTransaction,
    readScope = f.api.getLiteraryWorkflowScope;
  let interrupted = false,
    captures = 0;
  f.api.getLiteraryWorkflowScope = async (...args) => {
    captures++;
    return readScope(...args);
  };
  f.db.runTransaction = async (operation) => {
    const before = f.records.get(path)?.action?.kind;
    const value = await run(operation);
    if (
      !interrupted &&
      before === 'prepareWorkflow' &&
      f.records.get(path)?.action?.kind === 'startWorkflow'
    ) {
      interrupted = true;
      throw new Error('Frozen wire ACK lost');
    }
    return value;
  };
  await assert.rejects(f.driver.advanceLiterarySequence('author', wire), /ACK lost/);
  f.db.runTransaction = run;
  assert.equal(f.calls.length, 0);
  assert.equal(
    [...f.records.keys()].some((v) => v.includes('/literaryWorkflowJobs/')),
    false,
  );
  assert.equal((await f.outcome(wire.operationId)).state, 'running');
  const recovered = await f.driver.advanceLiterarySequence('author', wire);
  assert.ok(recovered.job.currentWorkflowId);
  assert.equal(captures, 1);
  assert.equal(f.calls.length, 0);
  assert.equal(f.records.get('users/author').credits, 10);
  assert.equal(
    JSON.stringify(await f.outcome(wire.operationId)).includes('PRIVATE_SEQUENCE_INSTRUCTION'),
    false,
  );
});

test('discovery paginates the scanned metadata even when a page has no available sequence', async () => {
  const f = await fixture();
  await f.register();
  const job = f.records.get('books/book/literarySequenceJobs/' + id);
  f.records.set('books/book/literarySequenceJobs/000-foreign', {
    ...job,
    jobId: '000-foreign',
    actorId: 'other',
  });
  f.records.set('books/book/literarySequenceJobs/001-old-book', {
    ...job,
    jobId: '001-old-book',
    bookBirth: {},
  });
  let page = await f.driver.listLiterarySequences('author', { target, limit: 1 });
  assert.deepEqual(page.items, []);
  assert.equal(page.nextAfterId, '000-foreign');
  page = await f.driver.listLiterarySequences('author', {
    target,
    limit: 1,
    afterId: page.nextAfterId,
  });
  assert.deepEqual(page.items, []);
  assert.equal(page.nextAfterId, '001-old-book');
  page = await f.driver.listLiterarySequences('author', {
    target,
    limit: 1,
    afterId: page.nextAfterId,
  });
  assert.equal(page.items[0].jobId, id);
  assert.equal(page.items[0].chapterCount, 2);
  assert.equal(page.items[0].state, 'active');
  assert.equal(JSON.stringify(page).includes('PRIVATE_SEQUENCE_INSTRUCTION'), false);
  const query = f.reads.filter((v) => v.collectionPath.endsWith('/literarySequenceJobs')).at(-1);
  assert.equal(query.maximum, 1);
  for (const hidden of ['instruction', 'generation', 'effectiveGeneration', 'scopeToken'])
    assert.equal(query.fields.includes(hidden), false);
  const end = await f.driver.listLiterarySequences('author', {
    target,
    limit: 1,
    afterId: page.nextAfterId,
  });
  assert.equal(end.nextAfterId, null);
  assert.deepEqual(end.items, []);
  assert.equal(f.calls.length, 0);
});

test('discovery labels a recreated sequence stale and reauthorizes the actual book on every page', async () => {
  const f = await fixture();
  await f.register();
  await f.db.runTransaction(async (tx) => {
    const ref = f.db.doc('books/book/literarySequenceJobs/' + id),
      value = (await tx.get(ref)).data();
    tx.delete(ref);
    tx.create(ref, value);
  });
  assert.equal(
    (await f.driver.listLiterarySequences('author', { target })).items[0].state,
    'stale',
  );
  await assert.rejects(f.driver.listLiterarySequences('other', { target }), { code: 'not-found' });
  await assert.rejects(f.driver.listLiterarySequences('author', { target, limit: 51 }), {
    code: 'invalid-argument',
  });
  await f.db.runTransaction(async (tx) => {
    const ref = f.db.doc('books/book'),
      value = (await tx.get(ref)).data();
    tx.delete(ref);
    tx.create(ref, value);
  });
  assert.deepEqual((await f.driver.listLiterarySequences('author', { target })).items, []);
});

test('an explicit resume after pause or cancel never rearms the superseded action', async () => {
  for (const action of ['pause', 'cancel']) {
    const f = await fixture();
    await f.register();
    const wire = await f.nextInput(),
      native = f.api.startLiteraryWorkflow;
    f.api.startLiteraryWorkflow = async (...args) => {
      await native(...args);
      throw new Error('Lost reply');
    };
    await assert.rejects(f.driver.advanceLiterarySequence('author', wire), /Lost reply/);
    await f.controlRun(action);
    const calls = f.calls.length;
    const recovered = await f.driver.resumeLiterarySequenceOperation('author', {
      target,
      jobId: id,
      operationId: wire.operationId,
    });
    assert.equal(recovered.job.paused, true);
    assert.equal(recovered.job.busyStep, null);
    assert.equal((await f.outcome(wire.operationId)).state, 'superseded');
    assert.equal(f.calls.length, calls);
  }
});

test('metadata recovery refuses missing or changed native requests and payload-selected producer arguments', async () => {
  for (const corrupt of [
    () => undefined,
    (value) => ({ ...value, actIntegrationId: 'changed-report' }),
  ]) {
    const f = await fixture();
    await f.register();
    f.api.startLiteraryWorkflow = async () => {
      throw new Error('Held producer');
    };
    const wire = await f.nextInput();
    await assert.rejects(f.driver.advanceLiterarySequence('author', wire), /Held producer/);
    const receipt = f.records.get('books/book/literaryOperations/' + wire.operationId);
    receipt.request = corrupt(receipt.request);
    await assert.rejects(
      f.driver.resumeLiterarySequenceOperation('author', {
        target,
        jobId: id,
        operationId: wire.operationId,
      }),
      { code: 'failed-precondition' },
    );
    assert.equal((await f.outcome(wire.operationId)).state, 'running');
    await assert.rejects(
      f.driver.resumeLiterarySequenceOperation('author', {
        target,
        jobId: id,
        operationId: wire.operationId,
        instruction: 'injected',
      }),
      { code: 'invalid-argument' },
    );
    assert.equal(f.calls.length, 0);
  }
});

test('metadata recovery never creates an unregistered step or promotes registration/control to advancement', async () => {
  const f = await fixture();
  await f.register();
  await assert.rejects(
    f.driver.resumeLiterarySequenceOperation('author', {
      target,
      jobId: id,
      operationId: 'unregistered-step-0001',
    }),
    { code: 'failed-precondition' },
  );
  await assert.rejects(
    f.driver.resumeLiterarySequenceOperation('author', { target, jobId: id, operationId: id }),
    { code: 'failed-precondition' },
  );
  const wire = await f.controlInput('pause');
  await f.driver.setLiterarySequenceControl('author', wire);
  await assert.rejects(
    f.driver.resumeLiterarySequenceOperation('author', {
      target,
      jobId: id,
      operationId: wire.operationId,
    }),
    { code: 'failed-precondition' },
  );
  assert.equal(f.calls.length, 0);
  assert.equal((await f.getRun()).job.index, 0);
});

test('metadata recovery refuses native book/sequence recreation before touching its frozen action', async () => {
  for (const path of ['books/book', 'books/book/literarySequenceJobs/' + id]) {
    const f = await fixture();
    await f.register();
    f.api.startLiteraryWorkflow = async () => {
      throw new Error('Interrupted');
    };
    const wire = await f.nextInput();
    await assert.rejects(f.driver.advanceLiterarySequence('author', wire), /Interrupted/);
    await f.db.runTransaction(async (tx) => {
      const ref = f.db.doc(path),
        value = (await tx.get(ref)).data();
      tx.delete(ref);
      tx.create(ref, value);
    });
    await assert.rejects(
      f.driver.resumeLiterarySequenceOperation('author', {
        target,
        jobId: id,
        operationId: wire.operationId,
      }),
      { code: 'failed-precondition' },
    );
    assert.equal(f.calls.length, 0);
  }
});

test('client correlation hashes are frozen in registration, advancement and control receipts without changing hash-less native replay', async () => {
  const f = await fixture();
  const start = { ...f.input, requestHash: 'a'.repeat(64) };
  await f.driver.startLiterarySequence('author', start);
  assert.equal((await f.outcome(id)).requestHash, start.requestHash);
  await assert.rejects(
    f.driver.startLiterarySequence('author', { ...start, requestHash: 'b'.repeat(64) }),
    { code: 'invalid-argument' },
  );
  const wire = { ...(await f.nextInput()), requestHash: 'c'.repeat(64) };
  await f.driver.advanceLiterarySequence('author', wire);
  assert.equal((await f.outcome(wire.operationId)).requestHash, wire.requestHash);
  await assert.rejects(
    f.driver.advanceLiterarySequence('author', { ...wire, requestHash: 'd'.repeat(64) }),
    { code: 'invalid-argument' },
  );
  const control = { ...(await f.controlInput('pause')), requestHash: 'e'.repeat(64) };
  await f.driver.setLiterarySequenceControl('author', control);
  assert.equal((await f.outcome(control.operationId)).requestHash, control.requestHash);
  await assert.rejects(
    f.driver.setLiterarySequenceControl('author', { ...control, requestHash: 'f'.repeat(64) }),
    { code: 'invalid-argument' },
  );
  assert.equal((await f.getRun()).job.paused, true);
  assert.equal(f.calls.length, 0);
});

async function inspectSequenceChapter(f, chapterId) {
  const inspectionId = 'sequence-admission-inspection-0001';
  const source = await f.api.getLiteraryPassageInspectionScope('author', { target, chapterId });
  await f.api.startLiteraryPassageInspection('author', {
    target,
    inspectionId,
    chapterId,
    expectedScopeToken: source.scopeToken,
  });
  let state = await f.api.getLiteraryPassageInspection('author', { target, inspectionId });
  for (let n = 0; n < 100 && state.state !== 'ready'; n++)
    state = await f.api.advanceLiteraryPassageInspection('author', {
      target,
      inspectionId,
      expectedOriginToken: state.originToken,
      expectedRevision: state.revision,
    });
  assert.equal(state.state, 'ready');
  return inspectionId;
}
const requiredPublication = { version: 1, unit: 'chapter', requirePreviousPublication: true };

test('required publication has its own sequence stop without creating a child, generating or charging', async () => {
  const f = await fixture({ publicationPolicy: requiredPublication });
  await f.register();
  const stopped = await f.advanceRun();
  assert.equal(stopped.job.stop, 'publication');
  assert.equal(stopped.job.currentWorkflowId, null);
  assert.equal(f.calls.length, 0);
  assert.equal(f.records.get('users/author').credits, 10);
  assert.equal(
    [...f.records.keys()].filter((path) => path.startsWith('books/book/literaryWorkflowJobs/'))
      .length,
    0,
  );
});

test('sequence admits its first unit by the selected native census and cannot replace it in a replay', async () => {
  const f = await fixture({ publicationPolicy: requiredPublication });
  await f.register();
  const admissionInspectionId = await inspectSequenceChapter(f, f.chapterId);
  const wire = await f.nextInput({ admissionInspectionId });
  const first = await f.driver.advanceLiterarySequence('author', wire);
  assert.equal(first.workflow.job.admission.condition, 'firstUnit');
  assert.equal(first.workflow.job.admission.inspection.inspectionId, admissionInspectionId);
  const replay = await f.driver.advanceLiterarySequence('author', wire);
  assert.equal(replay.job.currentWorkflowId, first.job.currentWorkflowId);
  await assert.rejects(
    f.driver.advanceLiterarySequence('author', {
      ...wire,
      admissionInspectionId: 'different-inspection-0001',
    }),
    { code: 'invalid-argument' },
  );
  assert.equal(f.records.get('users/author').credits, 10);
  assert.equal(f.calls.length, 0);
});

test('a lost child registration ACK recovers the same frozen admission without reconstructing selectors from current UI', async () => {
  const f = await fixture({ publicationPolicy: requiredPublication });
  await f.register();
  const admissionInspectionId = await inspectSequenceChapter(f, f.chapterId);
  const original = f.api.startLiteraryWorkflow;
  let lose = true;
  f.api.startLiteraryWorkflow = async (...args) => {
    const result = await original(...args);
    if (lose) {
      lose = false;
      throw Object.assign(new Error('Lost ACK'), { code: 'unavailable' });
    }
    return result;
  };
  const wire = await f.nextInput({ admissionInspectionId });
  await assert.rejects(f.driver.advanceLiterarySequence('author', wire), { code: 'unavailable' });
  const saved = f.records.get('books/book/literaryOperations/' + wire.operationId);
  assert.equal(saved.request.admissionInspectionId, admissionInspectionId);
  assert.equal(saved.action.wire.admissionInspectionId, admissionInspectionId);
  const recovered = await f.driver.resumeLiterarySequenceOperation('author', {
    target,
    jobId: id,
    operationId: wire.operationId,
  });
  assert.equal(recovered.workflow.job.admission.inspection.inspectionId, admissionInspectionId);
  assert.equal(
    [...f.records.keys()].filter((path) => path.startsWith('books/book/literaryWorkflowJobs/'))
      .length,
    1,
  );
  assert.equal(f.calls.length, 0);
  assert.equal(f.records.get('users/author').credits, 10);
});

test('a sequence starting later in the book can bind an explicitly selected external predecessor cycle', async () => {
  const f = await fixture();
  await f.start();
  await f.until((value) => value.job.phase === 'done');
  const scope = await f.sequence.getLiterarySequenceScope('author', {
    target,
    chapterIds: [f.next.chapterId],
  });
  f.input.chapterIds = [f.next.chapterId];
  f.input.expectedScopeToken = scope.originToken;
  await f.register();
  const beforeCalls = f.calls.length;
  const result = await f.advanceRun({ previousWorkflowId: 'workflow-cycle-0001' });
  assert.equal(result.workflow.job.passage.previous.chapterId, f.chapterId);
  assert.equal(result.job.index, 0);
  assert.equal(f.calls.length, beforeCalls);
  assert.equal(f.records.get('users/author').credits, 8);
});
