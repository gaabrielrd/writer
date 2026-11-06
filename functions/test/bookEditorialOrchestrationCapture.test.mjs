import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fixture } from './helpers/literaryWorkflowFixtures.mjs';
import { setup, id as sequenceId } from './helpers/literarySequenceFixtures.mjs';
import { createBookEditorialCaptureService } from '../src/bookEditorialCapture.mjs';
import { createBookEditorialRemapper } from '../src/bookEditorialRemap.mjs';
const workflowId = 'workflow-cycle-0001',
  hash = (value) => createHash('sha256').update(value).digest('hex');
async function capture(f, family, id) {
  const api = createBookEditorialCaptureService({ db: f.db }),
    source = await api.getBookEditorialCaptureSource('author', { bookId: 'book' });
  const base = {
    bookId: 'book',
    bookSourceToken: source.bookSourceToken,
    editorialSourceToken: source.editorialSourceToken,
  };
  const page = await api.listBookEditorialCaptureRecords('author', { ...base, family, limit: 50 });
  assert.equal(JSON.stringify(page).includes('PRIVATE'), false);
  const wire = { ...base, family, ...page.items.find((item) => item.id === id) },
    first = await api.readBookEditorialCaptureRecord('author', { ...wire, index: 0 });
  assert.equal(first.chunkCount, 1);
  const bytes = Buffer.from(first.chunkBase64, 'base64');
  assert.equal(hash(bytes), first.contentHash);
  await api.verifyBookEditorialCaptureRecord('author', {
    ...wire,
    projectionToken: first.projectionToken,
  });
  return { artifacts: JSON.parse(bytes.toString('utf8')).artifacts, api, wire, first };
}

test('chapter workflow preserves own settings and limits as historical text without starting a child or generation', async () => {
  const f = await fixture();
  await f.start();
  const before = structuredClone([...f.records]),
    calls = f.calls.length;
  const value = await capture(f, 'workflow-job', workflowId),
    checkpoint = value.artifacts[0];
  assert.equal(checkpoint.content.process, 'workflow');
  assert.equal(checkpoint.content.controlsDisabled, true);
  assert.equal(checkpoint.content.nextAction, null);
  assert.equal(checkpoint.content.currentUnit.state, 'recorded');
  assert.equal(value.artifacts[1].generation.snapshot, 'historical');
  assert.ok(
    value.artifacts[1].content.sections.some(
      (item) => item.label === 'Fases autorizadas no histórico',
    ),
  );
  assert.deepEqual([...f.records], before);
  assert.equal(f.calls.length, calls);
});

test('sequence preserves its fixed chapter order and aggregate counters without advancing a workflow', async () => {
  const f = await setup();
  await f.startSequence();
  const before = structuredClone([...f.records]);
  const value = await capture(f, 'sequence-job', sequenceId),
    checkpoint = value.artifacts[0];
  assert.equal(checkpoint.content.process, 'sequence');
  assert.equal(checkpoint.content.counters.plannedUnits, 2);
  assert.equal(checkpoint.content.counters.completedUnits, 0);
  assert.deepEqual(
    checkpoint.content.references.filter((ref) => ref.kind === 'chapter').map((ref) => ref.id),
    [f.chapterId, f.next.chapterId],
  );
  assert.equal(JSON.stringify(value.artifacts).includes('PRIVATE_SEQUENCE_INSTRUCTION'), true);
  assert.deepEqual([...f.records], before);
});

test('completed sequence membership and reciprocal workflow reference retain exact archival identities', async () => {
  const f = await setup();
  await f.startSequence();
  await f.startFirst();
  const done = await f.until((frame) => frame.job.phase === 'done');
  await f.complete(done.job.jobId);
  const sequence = await capture(f, 'sequence-job', sequenceId),
    workflow = await capture(f, 'workflow-job', done.job.jobId);
  assert.equal(sequence.artifacts[0].content.counters.completedUnits, 1);
  assert.ok(
    sequence.artifacts[0].content.references.some(
      (ref) =>
        ref.kind === 'artifact' && ref.id === workflow.artifacts[0].id && ref.state === 'recorded',
    ),
  );
  assert.ok(
    workflow.artifacts[0].content.references.some(
      (ref) =>
        ref.kind === 'artifact' && ref.id === sequence.artifacts[0].id && ref.state === 'recorded',
    ),
  );
});

test('recreated completed workflow leaves the old sequence pointer unavailable rather than adopting a new birth', async () => {
  const f = await setup();
  await f.startSequence();
  await f.startFirst();
  const done = await f.until((frame) => frame.job.phase === 'done');
  await f.complete(done.job.jobId);
  const before = await capture(f, 'sequence-job', sequenceId),
    pointer = before.artifacts[0].content.references.find(
      (ref) => ref.kind === 'artifact' && ref.state === 'recorded',
    );
  f.metadata.set('books/book/literaryWorkflowJobs/' + done.job.jobId, {
    createdAt: 99999,
    updatedAt: 100000,
  });
  const after = await capture(f, 'sequence-job', sequenceId);
  assert.ok(
    after.artifacts[0].content.references.some(
      (ref) => ref.id === pointer.id && ref.state === 'unavailable',
    ),
  );
});

test('uncompleted child pointers without frozen birth are explicit unavailable provenance', async () => {
  const f = await setup();
  await f.startSequence();
  await f.startFirst();
  const value = await capture(f, 'sequence-job', sequenceId);
  assert.ok(
    value.artifacts[0].content.references.some(
      (ref) => ref.kind === 'artifact' && ref.state === 'unavailable',
    ),
  );
  const workflow = await capture(f, 'workflow-job', workflowId);
  assert.ok(
    workflow.artifacts[0].content.references.some(
      (ref) => ref.kind === 'artifact' && ref.state === 'unavailable',
    ),
  );
});

test('chapter loss keeps own instruction while closing the native resource association', async () => {
  const f = await fixture();
  await f.start();
  f.records.delete('books/book/chapters/' + f.chapterId);
  const before = structuredClone(f.records.get('books/book/literaryWorkflowJobs/' + workflowId)),
    value = await capture(f, 'workflow-job', workflowId);
  assert.equal(value.artifacts[0].content.currentUnit.state, 'unavailable');
  assert.equal(value.artifacts[1].content.sections[0].text, 'Preserve a intenção.');
  assert.deepEqual(f.records.get('books/book/literaryWorkflowJobs/' + workflowId), before);
});

for (const family of ['workflow-job', 'sequence-job'])
  test(
    family + ' rejects wrong actor and recreated root before copying author settings',
    async () => {
      const f = family === 'workflow-job' ? await fixture() : await setup();
      if (family === 'workflow-job') await f.start();
      else await f.startSequence();
      const id = family === 'workflow-job' ? workflowId : sequenceId,
        path =
          'books/book/' +
          (family === 'workflow-job' ? 'literaryWorkflowJobs/' : 'literarySequenceJobs/') +
          id;
      const original = f.records.get(path);
      f.records.set(path, { ...original, actorId: 'other' });
      assert.equal((await capture(f, family, id)).artifacts[0].availability.state, 'unavailable');
      f.records.set(path, original);
      f.metadata.set('books/book', { createdAt: 99999, updatedAt: 100000 });
      assert.equal((await capture(f, family, id)).artifacts[0].availability.state, 'unavailable');
    },
  );

test('workflow self-birth cannot be reused by a recreated job with identical fields', async () => {
  const f = await fixture();
  await f.start();
  f.metadata.set('books/book/literaryWorkflowJobs/' + workflowId, {
    createdAt: 99999,
    updatedAt: 100000,
  });
  assert.equal(
    (await capture(f, 'workflow-job', workflowId)).artifacts[0].availability.state,
    'unavailable',
  );
});

test('unsupported orchestration schema becomes unavailable rather than a runnable checkpoint', async () => {
  const f = await fixture();
  await f.start();
  const path = 'books/book/literaryWorkflowJobs/' + workflowId;
  f.records.set(path, { ...f.records.get(path), schemaVersion: 2 });
  const value = await capture(f, 'workflow-job', workflowId);
  assert.equal(value.artifacts.length, 1);
  assert.equal(value.artifacts[0].availability.reason, 'unsupported-legacy-schema');
});

test('incoherent sequence completion metadata is rejected instead of reporting invented progress', async () => {
  const f = await setup();
  await f.startSequence();
  const path = 'books/book/literarySequenceJobs/' + sequenceId;
  f.records.set(path, { ...f.records.get(path), index: 1 });
  await assert.rejects(capture(f, 'sequence-job', sequenceId), { code: 'failed-precondition' });
});

test('cached labels, native IDs, birth proofs and execution wires stay outside portable content', async () => {
  const f = await fixture();
  await f.start();
  const path = 'books/book/literaryWorkflowJobs/' + workflowId;
  f.records.set(path, {
    ...f.records.get(path),
    bookTitle: 'PRIVATE_CACHED_BOOK_LABEL',
    chapterTitle: 'PRIVATE_CACHED_CHAPTER_LABEL',
  });
  const value = await capture(f, 'workflow-job', workflowId),
    serialized = JSON.stringify(value.artifacts);
  for (const key of [
    'originToken',
    'bookBirth',
    'chapterBirth',
    'workflowBirth',
    'scopeToken',
    'actorId',
    'busyStep',
    'fingerprint',
    'authorizedPhases',
    'limits',
    'maxApplications',
    'currentWorkflowId',
  ])
    assert.equal(serialized.includes('"' + key + '"'), false);
  assert.equal(serialized.includes('PRIVATE_CACHED'), false);
  assert.equal(serialized.includes(workflowId), false);
});

test('final verification rejects authorization loss after a successful metadata capture', async () => {
  const f = await fixture();
  await f.start();
  const value = await capture(f, 'workflow-job', workflowId);
  f.records.set('books/book', { ...f.records.get('books/book'), authorId: 'other' });
  await assert.rejects(
    value.api.verifyBookEditorialCaptureRecord('author', {
      ...value.wire,
      projectionToken: value.first.projectionToken,
    }),
  );
});

test('restored sequence settings remain private history with disabled controls and no next action', async () => {
  const f = await setup();
  await f.startSequence();
  const value = await capture(f, 'sequence-job', sequenceId);
  const map = createBookEditorialRemapper({
    sourceBookId: 'book',
    bookId: 'copy',
    hashBytes: hash,
    mapResource: (kind, id) => 'copy-' + kind + '-' + id,
  });
  const restored = map.artifact(value.artifacts[0]);
  assert.equal(restored.record.content.controlsDisabled, true);
  assert.equal(restored.record.content.nextAction, null);
  assert.equal(restored.restoration.execution, 'disabled');
  assert.equal(restored.restoration.publication, 'private');
});
