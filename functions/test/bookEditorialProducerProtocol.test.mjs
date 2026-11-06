import test from 'node:test';
import assert from 'node:assert/strict';
import { studioDb } from './helpers/studioDb.mjs';
import { createBookEditorialCaptureService } from '../src/bookEditorialCapture.mjs';
import {
  BOOK_EDITORIAL_CAPTURE_FAMILIES,
  BOOK_EDITORIAL_CAPTURE_FENCE_COVERAGE,
} from '../src/bookEditorialCaptureCatalog.mjs';
import { createLiteraryProductionService } from '../src/literaryProduction.mjs';
import { emptyEditorialContract } from '../src/literaryContracts.mjs';
import { createLiteraryIntegrationService } from '../src/literaryIntegration.mjs';
import { createLiteraryIntegrationRecheckService } from '../src/literaryIntegrationRecheck.mjs';
import { createLiteraryMilestoneService } from '../src/literaryMilestones.mjs';
function fixture() {
  const f = studioDb();
  f.records.set('books/book', {
    authorId: 'author',
    title: 'Livro',
    status: 'draft',
    createdAt: 1,
    updatedAt: 10,
    wordCount: 0,
  });
  f.records.set('books/book/chapters/chapter', {
    bookId: 'book',
    title: 'Capítulo',
    order: 0,
    content: '<p>Uma carta chegou.</p>',
    updatedAt: 10,
  });
  f.records.set('users/author', { credits: 10 });
  const api = createBookEditorialCaptureService({ db: f.db });
  const source = async () => {
    const value = await api.getBookEditorialCaptureSource('author', { bookId: 'book' });
    return {
      bookId: 'book',
      bookSourceToken: value.bookSourceToken,
      editorialSourceToken: value.editorialSourceToken,
    };
  };
  return { ...f, api, source, target: { kind: 'book', id: 'book' } };
}

test('catalog discovery freezes every saved family and the compiled writer contract under the native source', async () => {
  const f = fixture(),
    source = await f.source(),
    catalog = await f.api.getBookEditorialCaptureCatalog('author', source);
  assert.equal(catalog.catalogVersion, 1);
  assert.deepEqual(catalog.families, [...BOOK_EDITORIAL_CAPTURE_FAMILIES]);
  assert.equal(new Set(catalog.families).size, 37);
  assert.equal(catalog.fenceCoverage, BOOK_EDITORIAL_CAPTURE_FENCE_COVERAGE);
  assert.match(catalog.catalogToken, /^[a-f0-9]{64}$/);
});

test('metadata inspection confirms projections without transporting any body or part fields', async () => {
  const f = fixture();
  await createLiteraryProductionService({ db: f.db, now: () => 100 }).saveLiteraryContract(
    'author',
    {
      target: f.target,
      operationId: 'protocol-contract',
      expectedRevision: 0,
      contract: emptyEditorialContract(),
    },
  );
  const source = await f.source(),
    page = await f.api.listBookEditorialCaptureRecords('author', {
      ...source,
      family: 'contract-current',
      limit: 50,
    });
  assert.equal(page.lastId, 'current');
  const request = { ...source, family: 'contract-current', ...page.items[0] };
  const meta = await f.api.inspectBookEditorialCaptureRecord('author', request),
    first = await f.api.readBookEditorialCaptureRecord('author', { ...request, index: 0 });
  assert.equal(meta.projectionToken, first.projectionToken);
  assert.equal(meta.contentHash, first.contentHash);
  for (const key of ['chunkBase64', 'byteLength', 'index', 'content', 'artifacts'])
    assert.equal(Object.hasOwn(meta, key), false);
});

test('alias inspection preserves head identity and returns no body transport', async () => {
  const f = fixture();
  await createLiteraryProductionService({ db: f.db, now: () => 100 }).saveLiteraryContract(
    'author',
    {
      target: f.target,
      operationId: 'protocol-contract-alias',
      expectedRevision: 0,
      contract: emptyEditorialContract(),
    },
  );
  const source = await f.source(),
    page = await f.api.listBookEditorialCaptureRecords('author', {
      ...source,
      family: 'contract-version',
      limit: 50,
    });
  const value = await f.api.readBookEditorialCaptureRecord('author', {
    ...source,
    family: 'contract-version',
    ...page.items[0],
    index: 0,
  });
  assert.equal(value.state, 'current-alias');
  assert.equal(Object.hasOwn(value, 'chunkBase64'), false);
});

test('root-only contract writers invalidate the same source even before a process marker exists', async () => {
  const f = fixture(),
    source = await f.source();
  await createLiteraryProductionService({ db: f.db, now: () => 100 }).saveLiteraryContract(
    'author',
    {
      target: f.target,
      operationId: 'protocol-root-clock',
      expectedRevision: 0,
      contract: emptyEditorialContract(),
    },
  );
  await assert.rejects(f.api.verifyBookEditorialCaptureSource('author', source));
});

test('a milestone unit reservation invalidates the marker before the external history capture finishes', async () => {
  const f = fixture();
  let started, reject;
  const begun = new Promise((resolve) => {
      started = resolve;
    }),
    pending = new Promise((resolve, fail) => {
      reject = fail;
    });
  const milestone = createLiteraryMilestoneService({
    db: f.db,
    now: () => 100,
    history: {
      createWorkVersion: async () => {
        started();
        return pending;
      },
    },
  });
  const command = { target: f.target, jobId: 'protocol-reserved-unit' };
  await milestone.startLiteraryMilestone('author', {
    ...command,
    chapterId: 'chapter',
    kind: 'revised',
  });
  const source = await f.source(),
    root = structuredClone(f.records.get('books/book')),
    before = f.records.get('books/book/literaryBackupControls/current').writeId;
  const advance = milestone.advanceLiteraryMilestone('author', command);
  try {
    await begun;
    assert.notEqual(f.records.get('books/book/literaryBackupControls/current').writeId, before);
    assert.deepEqual(f.records.get('books/book'), root);
    await assert.rejects(f.api.verifyBookEditorialCaptureSource('author', source));
  } finally {
    reject(Error('fixture history stopped'));
    await assert.rejects(advance, /fixture history stopped/);
  }
});

test('integration recheck updates its captured job and marker atomically without inventing a root change', async () => {
  const f = fixture(),
    integration = createLiteraryIntegrationService({
      db: f.db,
      now: () => 100,
      generator: async (input) =>
        input.scope.phase === 'synthesis'
          ? { complete: true, report: '', findings: [], conclusions: [] }
          : { complete: true, report: '', findings: [], matrix: [] },
    });
  const command = { target: f.target, jobId: 'protocol-integration' };
  await integration.startLiteraryIntegration('author', { ...command, level: 'book' });
  let done;
  for (let step = 0; step < 100; step++) {
    const value = await integration.advanceLiteraryIntegration('author', command);
    if (value.state === 'done') {
      done = value;
      break;
    }
  }
  assert.ok(done);
  const source = await f.source(),
    root = structuredClone(f.records.get('books/book'));
  await createLiteraryIntegrationRecheckService({
    db: f.db,
    now: () => 200,
  }).startLiteraryIntegrationRecheck('author', {
    ...command,
    operationId: 'protocol-recheck',
    expectedSourceToken: done.sourceToken,
  });
  assert.deepEqual(f.records.get('books/book'), root);
  await assert.rejects(f.api.verifyBookEditorialCaptureSource('author', source));
});
