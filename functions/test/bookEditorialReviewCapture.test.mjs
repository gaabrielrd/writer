import test from 'node:test';
import assert from 'node:assert/strict';
import { studioDb } from './helpers/studioDb.mjs';
import { createScenesService } from '../src/scenes.mjs';
import { createLiteraryReviewService } from '../src/literaryReview.mjs';
import { createBookEditorialCaptureService } from '../src/bookEditorialCapture.mjs';
import { createBookEditorialRemapper } from '../src/bookEditorialRemap.mjs';
import { createHash } from 'node:crypto';
const target = { kind: 'book', id: 'book' },
  jobId = 'capture-review-job';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function fixture({ finish = true } = {}) {
  const f = studioDb(),
    reads = [],
    masks = [];
  f.records.set('books/book', {
    authorId: 'author',
    title: 'Livro',
    createdAt: 1,
    updatedAt: 10,
    wordCount: 0,
    status: 'draft',
  });
  f.records.set('users/author', { credits: 10 });
  const scenes = createScenesService({ db: f.db, now: () => 100 });
  const chapter = await scenes.createSceneGroup('author', {
    target,
    operationId: 'capture-review-chapter',
    title: 'Carta',
  });
  const ids = [];
  for (let index = 0; index < 2; index++) {
    const value = await scenes.createScene('author', {
      target,
      parentId: chapter.id,
      operationId: 'capture-review-scene-' + index,
      title: 'Cena ' + index,
      content: '<p>Ela recebeu a carta.</p>',
    });
    ids.push(value.scene.id);
  }
  const review = createLiteraryReviewService({
    db: f.db,
    now: () => 200,
    generator: (context) => {
      const source = context.documents.find((item) => item.id === 'manuscript');
      return Promise.resolve({
        text: '',
        complete: true,
        rationale: 'PRIVATE_REVIEW_REASON',
        findings: [
          {
            sourceId: source.id,
            quote: source.text.slice(0, 5),
            problem: 'PRIVATE_REVIEW_FINDING',
            severity: 'warning',
            action: 'Conferir a reação.',
          },
        ],
      });
    },
  });
  await review.startLiteraryReview('author', {
    target,
    jobId,
    chapterId: chapter.id,
    instruction: 'PRIVATE_OWN_REVIEW_INSTRUCTION',
  });
  if (finish) {
    let completed = false;
    for (let step = 0; step < 100; step++) {
      const value = await review.advanceLiteraryReview('author', { target, jobId });
      if (value.state === 'done') {
        completed = true;
        break;
      }
    }
    assert.equal(completed, true);
  }
  const db = {
    ...f.db,
    runTransaction: (callback) =>
      f.db.runTransaction((tx) =>
        callback({
          ...tx,
          get: async (resource) => {
            if (resource.path) reads.push(resource.path);
            return tx.get(resource);
          },
          getAll: (...args) => {
            for (const resource of args)
              if (resource.path)
                masks.push({ path: resource.path, fields: args.at(-1)?.fieldMask ?? null });
            return tx.getAll(...args);
          },
        }),
      ),
  };
  const api = createBookEditorialCaptureService({ db });
  async function wire(family, id) {
    const value = await api.getBookEditorialCaptureSource('author', { bookId: 'book' });
    const source = {
      bookId: 'book',
      bookSourceToken: value.bookSourceToken,
      editorialSourceToken: value.editorialSourceToken,
    };
    const page = await api.listBookEditorialCaptureRecords('author', {
      ...source,
      family,
      limit: 50,
    });
    assert.equal(JSON.stringify(page).includes('PRIVATE'), false);
    return { ...source, family, ...page.items.find((item) => item.id === id) };
  }
  const rows = (collection) =>
    [...f.records]
      .filter(([path]) => path.startsWith('books/book/' + collection + '/'))
      .map(([path, value]) => ({ path, id: path.split('/').at(-1), value }));
  return {
    ...f,
    api,
    wire,
    rows,
    reads,
    masks,
    scenes,
    review,
    sceneIds: ids,
    chapterId: chapter.id,
    jobPath: 'books/book/literaryReviewJobs/' + jobId,
  };
}
async function read(f, family, id) {
  const wire = await f.wire(family, id),
    first = await f.api.readBookEditorialCaptureRecord('author', { ...wire, index: 0 });
  const parts = [Buffer.from(first.chunkBase64, 'base64')];
  for (let index = 1; index < first.chunkCount; index++) {
    const value = await f.api.readBookEditorialCaptureRecord('author', {
      ...wire,
      index,
      projectionToken: first.projectionToken,
    });
    const bytes = Buffer.from(value.chunkBase64, 'base64');
    assert.equal(hash(bytes), value.chunkHash);
    parts.push(bytes);
  }
  const bytes = Buffer.concat(parts);
  assert.equal(hash(bytes), first.contentHash);
  return { wire, first, artifacts: JSON.parse(bytes.toString('utf8')).artifacts };
}
test('native review captures own decisions and technical chapter coverage without mutating state or duplicating prose reports', async () => {
  const f = await fixture(),
    before = structuredClone([...f.records]);
  const root = await read(f, 'review-job', jobId),
    report = root.artifacts.find((item) => item.kind === 'report');
  assert.equal(report.content.claimedCoverage.scope, 'chapter-scenes');
  assert.equal(report.content.claimedCoverage.completed, 2);
  assert.equal(report.content.claimedCoverage.total, 2);
  assert.equal(report.content.findings.length, 0);
  assert.equal(root.artifacts[0].content.controlsDisabled, true);
  assert.equal(root.artifacts[0].content.counters.analyses, 4);
  assert.equal(JSON.stringify(root.artifacts).includes('PRIVATE_OWN_REVIEW_INSTRUCTION'), true);
  const analysis = f.rows('literaryReviewAnalyses')[0],
    unit = f.rows('literaryReviewUnits')[0];
  assert.ok(analysis.value.captureBinding.requestBirth);
  assert.ok(analysis.value.captureBinding.unitBirth);
  assert.ok(unit.value.captureBinding.jobBirth);
  const marker = await read(f, 'review-analysis', analysis.id),
    original = await read(f, 'prose', analysis.value.requestId);
  const sourceReport = original.artifacts.find((item) => item.kind === 'report');
  assert.ok(
    marker.artifacts[0].content.references.some(
      (ref) => ref.id === sourceReport.id && ref.state === 'recorded',
    ),
  );
  assert.equal(JSON.stringify(marker.artifacts).includes('PRIVATE_REVIEW_FINDING'), false);
  const unitMarker = await read(f, 'review-unit', unit.id);
  assert.equal(unitMarker.artifacts[0].content.currentUnit.state, 'recorded');
  assert.deepEqual([...f.records], before);
});
test('planning coverage remains an explicit unfinished census and never asserts a whole chapter', async () => {
  const f = await fixture({ finish: false }),
    { artifacts } = await read(f, 'review-job', jobId);
  const report = artifacts.find((item) => item.kind === 'report');
  assert.equal(report.content.claimedCoverage.completed, 0);
  assert.equal(report.content.claimedCoverage.total, 0);
  assert.ok(
    report.content.claimedCoverage.limitations.some((text) => text.includes('não concluídos')),
  );
  assert.equal(artifacts[0].content.phase, 'planning');
});
test('stale aggregate source does not retire the job during backup or hide independently authorized historical prose', async () => {
  const f = await fixture(),
    analysis = f.rows('literaryReviewAnalyses').find((item) => item.value.unitIndex === 0);
  const scene = f.records.get('books/book/scenes/' + f.sceneIds[0]);
  await f.scenes.updateScene('author', {
    target,
    sceneId: f.sceneIds[0],
    operationId: 'capture-review-edited',
    expectedRevision: scene.revision,
    patch: { content: '<p>Outra reação.</p>' },
  });
  const before = structuredClone([...f.records]),
    root = await read(f, 'review-job', jobId);
  assert.equal(
    root.artifacts.find((item) => item.kind === 'report').availability.state,
    'unavailable',
  );
  assert.equal(f.records.get(f.jobPath).state, 'done');
  assert.deepEqual([...f.records], before);
  const marker = await read(f, 'review-analysis', analysis.id),
    original = await read(f, 'prose', analysis.value.requestId);
  const sourceReport = original.artifacts.find((item) => item.kind === 'report');
  assert.equal(sourceReport.availability.state, 'included');
  assert.ok(
    marker.artifacts[0].content.references.some(
      (ref) => ref.id === sourceReport.id && ref.state === 'recorded',
    ),
  );
});
test('revoked scene makes the source report unavailable while technical metadata survives without quotations', async () => {
  const f = await fixture(),
    analysis = f.rows('literaryReviewAnalyses').find((item) => item.value.unitIndex === 0);
  f.records.delete('books/book/scenes/' + analysis.value.sceneId);
  f.reads.length = 0;
  const { artifacts } = await read(f, 'review-analysis', analysis.id);
  assert.equal(artifacts[0].content.references.at(-1).state, 'unavailable');
  assert.equal(JSON.stringify(artifacts).includes('PRIVATE_REVIEW_REASON'), false);
  assert.equal(
    f.reads.includes('books/book/literaryProseRequests/' + analysis.value.requestId),
    false,
  );
});
test('legacy child bindings remain unknown instead of adopting an observed live parent or request', async () => {
  const f = await fixture(),
    analysis = f.rows('literaryReviewAnalyses')[0],
    unit = f.rows('literaryReviewUnits')[0];
  delete analysis.value.captureBinding;
  delete analysis.value.sceneId;
  delete analysis.value.chapterId;
  f.records.set(analysis.path, analysis.value);
  delete unit.value.captureBinding;
  f.records.set(unit.path, unit.value);
  const marker = await read(f, 'review-analysis', analysis.id);
  assert.ok(marker.artifacts[0].content.references.every((ref) => ref.state === 'unavailable'));
  const unitMarker = await read(f, 'review-unit', unit.id);
  assert.equal(unitMarker.artifacts[0].content.references[0].state, 'unavailable');
});
test('recreated request birth cannot bind old review metadata or expose its instruction', async () => {
  const f = await fixture(),
    analysis = f.rows('literaryReviewAnalyses')[0],
    path = 'books/book/literaryProseRequests/' + analysis.value.requestId;
  const old = await read(f, 'review-analysis', analysis.id),
    pointer = old.artifacts[0].content.references.at(-1).id;
  f.metadata.set(path, { createdAt: 77777, updatedAt: 77778 });
  f.masks.length = 0;
  const next = await read(f, 'review-analysis', analysis.id);
  assert.equal(next.artifacts[0].content.references.at(-1).id, pointer);
  assert.equal(next.artifacts[0].content.references.at(-1).state, 'unavailable');
  assert.ok(
    f.masks
      .filter((value) => value.path === path)
      .every((value) => value.fields?.length === 1 && value.fields[0] === 'schemaVersion'),
  );
});
for (const kind of ['job', 'unit'])
  test('recreated ' + kind + ' does not replace its original checkpoint reference', async () => {
    const f = await fixture(),
      analysis = f.rows('literaryReviewAnalyses')[0];
    const unit = f
      .rows('literaryReviewUnits')
      .find((item) => item.value.index === analysis.value.unitIndex);
    const before = await read(f, 'review-analysis', analysis.id),
      at = kind === 'job' ? 0 : 1;
    f.metadata.set(kind === 'job' ? f.jobPath : unit.path, { createdAt: 88888, updatedAt: 88889 });
    const after = await read(f, 'review-analysis', analysis.id);
    assert.equal(
      after.artifacts[0].content.references[at].id,
      before.artifacts[0].content.references[at].id,
    );
    assert.equal(after.artifacts[0].content.references[at].state, 'unavailable');
  });
test('cancel-before-start contains only a historical checkpoint with no fabricated instruction or chapter', async () => {
  const f = await fixture(),
    id = 'capture-review-cancel';
  await f.review.cancelLiteraryReview('author', { target, jobId: id });
  const { artifacts } = await read(f, 'review-job', id);
  assert.equal(artifacts.length, 1);
  assert.equal(artifacts[0].content.phase, 'canceled');
  assert.equal(artifacts[0].content.currentUnit, null);
  assert.deepEqual(artifacts[0].content.references, []);
});
test('invalid native unit and analysis keys are rejected rather than rebound', async () => {
  const f = await fixture(),
    analysis = f.rows('literaryReviewAnalyses')[0],
    unit = f.rows('literaryReviewUnits')[0];
  f.records.set(analysis.path, { ...analysis.value, requestId: 'another-request' });
  await assert.rejects(read(f, 'review-analysis', analysis.id), { code: 'failed-precondition' });
  f.records.set(unit.path, { ...unit.value, index: unit.value.index + 10 });
  await assert.rejects(read(f, 'review-unit', unit.id), { code: 'failed-precondition' });
});
test('raw tokens, native bindings and execution pointers never become portable fields', async () => {
  const f = await fixture(),
    analysis = f.rows('literaryReviewAnalyses')[0];
  const root = await read(f, 'review-job', jobId),
    marker = await read(f, 'review-analysis', analysis.id);
  const serialized = JSON.stringify([...root.artifacts, ...marker.artifacts]);
  for (const key of [
    'captureBinding',
    'jobBirth',
    'requestBirth',
    'unitBirth',
    'sourceToken',
    'pendingRequestId',
    'jobId',
    'requestId',
    'slot',
    'workflow',
  ])
    assert.equal(serialized.includes('"' + key + '"'), false);
});
test('final verification rechecks the source and actor instead of trusting an earlier coverage observation', async () => {
  const f = await fixture(),
    { wire, first } = await read(f, 'review-job', jobId);
  f.records.delete('books/book/chapters/' + f.chapterId);
  await assert.rejects(
    f.api.verifyBookEditorialCaptureRecord('author', {
      ...wire,
      projectionToken: first.projectionToken,
    }),
  );
  f.records.set('books/book', { ...f.records.get('books/book'), authorId: 'other' });
  await assert.rejects(f.api.readBookEditorialCaptureRecord('author', { ...wire, index: 0 }));
});
test('remapping technical coverage never restores live review control or old native grants', async () => {
  const f = await fixture(),
    { artifacts } = await read(f, 'review-job', jobId);
  const map = createBookEditorialRemapper({
    sourceBookId: 'book',
    bookId: 'copy',
    hashBytes: hash,
    mapResource: (kind, id) => 'copy-' + kind + '-' + id,
  });
  const checkpoint = map.artifact(artifacts[0]);
  assert.equal(checkpoint.record.content.controlsDisabled, true);
  assert.equal(checkpoint.restoration.execution, 'disabled');
  assert.equal(checkpoint.restoration.publication, 'private');
});

test('an explicit missing request witness never adopts a later observed cache', async () => {
  const f = await fixture(),
    analysis = f.rows('literaryReviewAnalyses')[0];
  f.records.set(analysis.path, {
    ...analysis.value,
    captureBinding: { ...analysis.value.captureBinding, requestBirth: null },
  });
  const path = 'books/book/literaryProseRequests/' + analysis.value.requestId;
  f.masks.length = 0;
  const { artifacts } = await read(f, 'review-analysis', analysis.id);
  assert.equal(artifacts[0].content.references.at(-1).state, 'unavailable');
  assert.equal(
    f.masks.some((value) => value.path === path),
    false,
  );
});
