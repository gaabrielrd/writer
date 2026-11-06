import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { studioDb } from './helpers/studioDb.mjs';
import { prepareLiteraryCheckpointFixture } from './helpers/literaryCheckpointCaptureFixture.mjs';
import { createBookEditorialCaptureService } from '../src/bookEditorialCapture.mjs';
import { createBookEditorialRemapper } from '../src/bookEditorialRemap.mjs';
import { digest } from '../src/workProgressContracts.mjs';
const hash = (value) => createHash('sha256').update(value).digest('hex');
async function fixture(options) {
  const f = studioDb(),
    reads = [],
    masks = [];
  f.records.set('books/book', {
    authorId: 'author',
    title: 'Livro',
    status: 'draft',
    createdAt: 1,
    updatedAt: 100,
    wordCount: 0,
  });
  f.records.set('users/author', { credits: 10 });
  const native = await prepareLiteraryCheckpointFixture(f.db, options);
  const db = {
    ...f.db,
    runTransaction: (callback) =>
      f.db.runTransaction((tx) =>
        callback({
          ...tx,
          get: (resource) => {
            if (resource.path) reads.push(resource.path);
            return tx.get(resource);
          },
          getAll: (...args) => {
            for (const ref of args)
              if (ref.path) masks.push({ path: ref.path, fields: args.at(-1).fieldMask });
            return tx.getAll(...args);
          },
        }),
      ),
  };
  const api = createBookEditorialCaptureService({ db });
  async function wire(family, id) {
    const source = await api.getBookEditorialCaptureSource('author', { bookId: 'book' });
    const base = {
      bookId: 'book',
      bookSourceToken: source.bookSourceToken,
      editorialSourceToken: source.editorialSourceToken,
    };
    const page = await api.listBookEditorialCaptureRecords('author', {
      ...base,
      family,
      limit: 50,
    });
    assert.equal(JSON.stringify(page).includes('PRIVATE'), false);
    return { ...base, family, ...page.items.find((item) => item.id === id) };
  }
  return { ...f, ...native, api, wire, reads, masks };
}
async function read(f, family, id) {
  const wire = await f.wire(family, id),
    first = await f.api.readBookEditorialCaptureRecord('author', { ...wire, index: 0 });
  assert.equal(first.chunkCount, 1);
  const bytes = Buffer.from(first.chunkBase64, 'base64');
  assert.equal(hash(bytes), first.contentHash);
  await f.api.verifyBookEditorialCaptureRecord('author', {
    ...wire,
    projectionToken: first.projectionToken,
  });
  return { artifacts: JSON.parse(bytes.toString('utf8')).artifacts, wire, first };
}
const unitId = (jobId) => digest({ jobId, index: 0 });

test('native drafting checkpoints preserve own instruction and exact counters without new prose or charges', async () => {
  const f = await fixture(),
    before = structuredClone([...f.records]);
  f.reads.length = 0;
  const value = await read(f, 'draft-job', f.jobId),
    checkpoint = value.artifacts[0];
  assert.equal(checkpoint.content.process, 'draft');
  assert.equal(checkpoint.content.controlsDisabled, true);
  assert.equal(checkpoint.content.counters.applications, 1);
  assert.equal(checkpoint.content.counters.acceptedUnits, 1);
  assert.equal(checkpoint.content.counters.creditsSpent, 1);
  assert.equal(JSON.stringify(value.artifacts).includes('PRIVATE_OWN_DRAFT_INPUT'), true);
  assert.equal(value.artifacts[1].generation.snapshot, 'historical');
  assert.deepEqual([...f.records], before);
});

test('preservation checkpoint names the technical verification separately from review and quality', async () => {
  const f = await fixture(),
    value = await read(f, 'milestone-job', f.milestoneId);
  assert.equal(value.artifacts[0].content.process, 'preservation');
  assert.equal(value.artifacts[0].content.counters.verifiedUnits, 1);
  assert.equal(value.artifacts[0].content.counters.capturedUnits, 1);
  assert.equal(value.artifacts[0].content.counters.plannedUnits, 1);
  assert.equal(value.artifacts[0].content.currentUnit.state, 'recorded');
  assert.ok(value.artifacts[1].content.sections.some((item) => item.text.includes('não comprova')));
});

test('draft unit points at the exact original prose proposal without opening its cached body', async () => {
  const f = await fixture(),
    native = f.records.get('books/book/literaryDraftUnits/' + unitId(f.jobId));
  f.reads.length = 0;
  const unit = await read(f, 'draft-unit', unitId(f.jobId));
  assert.equal(
    f.reads.some((path) => path.includes('/literaryProseRequests/')),
    false,
  );
  const proposal = await read(f, 'prose', native.requestId);
  assert.ok(
    unit.artifacts[0].content.references.some(
      (ref) =>
        ref.id ===
        proposal.artifacts.find(
          (item) => item.kind === 'prose' && item.content?.role === 'proposal',
        )?.id,
    ),
  );
  assert.equal(unit.artifacts[0].content.currentUnit.state, 'recorded');
  assert.ok(native.captureBinding.request.birth);
  assert.ok(native.captureBinding.jobBirth);
});

test('milestone unit references the exact immutable native history version using metadata only', async () => {
  const f = await fixture(),
    native = f.records.get('books/book/literaryMilestoneUnits/' + unitId(f.milestoneId));
  f.reads.length = 0;
  const value = await read(f, 'milestone-unit', unitId(f.milestoneId)),
    version = value.artifacts[0].content.references.find((ref) => ref.kind === 'historyVersion');
  assert.equal(version.id, native.versionId);
  assert.equal(version.state, 'recorded');
  assert.equal(version.contentHash, native.contentHash);
  assert.equal(
    f.reads.some((path) => /workVersions|workVersionBodies|literaryProseRequests/.test(path)),
    false,
  );
});

test('explicit adoption preserves its original history binding without a generation debit', async () => {
  const f = await fixture({ existing: true }),
    native = f.records.get('books/book/literaryDraftUnits/' + unitId(f.jobId));
  assert.ok(native.captureBinding.history.birth);
  const value = await read(f, 'draft-unit', unitId(f.jobId)),
    history = value.artifacts[0].content.references.find((ref) => ref.kind === 'historyVersion');
  assert.equal(history.state, 'recorded');
  assert.equal(history.id, native.versionId);
  const job = await read(f, 'draft-job', f.jobId);
  assert.equal(job.artifacts[0].content.counters.adoptedUnits, 1);
  assert.equal(job.artifacts[0].content.counters.applications, 0);
  assert.equal(job.artifacts[0].content.counters.creditsSpent, 0);
});

test('legacy units without birth witnesses do not adopt observed parents or versions', async () => {
  const f = await fixture(),
    path = 'books/book/literaryMilestoneUnits/' + unitId(f.milestoneId),
    value = { ...f.records.get(path) };
  delete value.captureBinding;
  f.records.set(path, value);
  const result = await read(f, 'milestone-unit', unitId(f.milestoneId));
  assert.equal(
    result.artifacts[0].content.references.every((ref) => ref.state === 'unavailable'),
    true,
  );
});

test('recreated history version keeps its old reference unavailable even when its ID and hash match', async () => {
  const f = await fixture(),
    native = f.records.get('books/book/literaryMilestoneUnits/' + unitId(f.milestoneId));
  f.metadata.set('books/book/workVersions/' + native.versionId, {
    createdAt: 99999,
    updatedAt: 100000,
  });
  const value = await read(f, 'milestone-unit', unitId(f.milestoneId));
  assert.equal(
    value.artifacts[0].content.references.find((ref) => ref.kind === 'historyVersion').state,
    'unavailable',
  );
});

test('recreated request is checked by birth before reading any grant header or cached content', async () => {
  const f = await fixture(),
    native = f.records.get('books/book/literaryDraftUnits/' + unitId(f.jobId)),
    path = 'books/book/literaryProseRequests/' + native.requestId;
  f.metadata.set(path, { createdAt: 99999, updatedAt: 100000 });
  f.masks.length = 0;
  f.reads.length = 0;
  const value = await read(f, 'draft-unit', unitId(f.jobId));
  assert.equal(value.artifacts[0].content.references.at(-1).state, 'unavailable');
  assert.equal(f.reads.includes(path), false);
  assert.equal(
    f.masks
      .filter((row) => row.path === path)
      .every((row) => row.fields.length === 1 && row.fields[0] === 'schemaVersion'),
    true,
  );
});

test('recreated parent cannot become the original checkpoint association', async () => {
  const f = await fixture(),
    before = await read(f, 'draft-unit', unitId(f.jobId));
  f.metadata.set('books/book/literaryDraftJobs/' + f.jobId, {
    createdAt: 99999,
    updatedAt: 100000,
  });
  const after = await read(f, 'draft-unit', unitId(f.jobId));
  assert.equal(
    after.artifacts[0].content.references[0].id,
    before.artifacts[0].content.references[0].id,
  );
  assert.equal(after.artifacts[0].content.references[0].state, 'unavailable');
});

test('source loss preserves own checkpoint and instruction without inventing a resource grant', async () => {
  const f = await fixture();
  f.records.delete('books/book/chapters/' + f.chapterId);
  const value = await read(f, 'draft-job', f.jobId);
  assert.equal(value.artifacts[0].content.currentUnit.state, 'unavailable');
  assert.equal(JSON.stringify(value.artifacts).includes('PRIVATE_OWN_DRAFT_INPUT'), true);
});

for (const family of ['draft-job', 'milestone-job'])
  test(
    family + ' cancel-before-start has no invented target, instruction or counters',
    async () => {
      const f = await fixture({ finish: false }),
        id = 'cancel-' + family;
      if (family === 'draft-job')
        await f.draft.cancelLiteraryDraft('author', { target: f.target, jobId: id });
      else await f.milestones.cancelLiteraryMilestone('author', { target: f.target, jobId: id });
      const value = await read(f, family, id);
      assert.equal(value.artifacts.length, 1);
      assert.equal(value.artifacts[0].content.currentUnit, null);
      assert.deepEqual(value.artifacts[0].content.counters, {});
      assert.equal(value.artifacts[0].content.controlsDisabled, true);
    },
  );

test('unsupported process schema is unavailable rather than interpreted as a known checkpoint', async () => {
  const f = await fixture(),
    path = 'books/book/literaryDraftJobs/' + f.jobId;
  f.records.set(path, { ...f.records.get(path), schemaVersion: 2 });
  const value = await read(f, 'draft-job', f.jobId);
  assert.equal(value.artifacts.length, 1);
  assert.equal(value.artifacts[0].availability.reason, 'unsupported-legacy-schema');
});

test('native wires, authorizations, tokens and receipts never become portable controls', async () => {
  const f = await fixture(),
    root = await read(f, 'draft-job', f.jobId),
    unit = await read(f, 'draft-unit', unitId(f.jobId)),
    serialized = JSON.stringify([...root.artifacts, ...unit.artifacts]);
  for (const key of [
    'captureBinding',
    'jobBirth',
    'chapterBirth',
    'sourceToken',
    'pendingRequestId',
    'controlRevision',
    'fingerprint',
    'maxApplications',
    'maxCredits',
    'jobId',
    'requestId',
  ])
    assert.equal(serialized.includes('"' + key + '"'), false);
});

test('final verification rejects a changed actor instead of treating a historical checkpoint as a grant', async () => {
  const f = await fixture(),
    result = await read(f, 'milestone-job', f.milestoneId);
  f.records.set('books/book', { ...f.records.get('books/book'), authorId: 'other' });
  await assert.rejects(
    f.api.verifyBookEditorialCaptureRecord('author', {
      ...result.wire,
      projectionToken: result.first.projectionToken,
    }),
  );
});

test('restored checkpoints stay private and disabled, with no next action', async () => {
  const f = await fixture(),
    result = await read(f, 'milestone-job', f.milestoneId);
  const map = createBookEditorialRemapper({
    sourceBookId: 'book',
    bookId: 'copy',
    hashBytes: hash,
    mapResource: (kind, id) => 'copy-' + kind + '-' + id,
  });
  const value = map.artifact(result.artifacts[0]);
  assert.equal(value.record.content.controlsDisabled, true);
  assert.equal(value.record.content.nextAction, null);
  assert.equal(value.restoration.execution, 'disabled');
  assert.equal(value.restoration.publication, 'private');
});
