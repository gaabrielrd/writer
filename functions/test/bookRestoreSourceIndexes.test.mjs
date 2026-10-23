import test from 'node:test';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { createBookRestoreUploadService } from '../src/bookRestoreUpload.mjs';
import { BOOK_RESTORE_METHODS, jobShape } from '../src/bookRestoreUploadContracts.mjs';
import { digest } from '../src/sceneContracts.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import {
  sourceIndexesRecords,
  sourceIndexesLegacyDb,
  readyRestoreSourceIndexes,
  finishRestoreSourceIndexes,
} from './helpers/bookRestoreSourceIndexesFixture.mjs';
import {
  legacyMutation as mutation,
  cleanupLegacyRestore,
} from './helpers/bookLegacyRestoreFixture.mjs';
const uid = 'author',
  id = 'source-index-job01',
  root = 'users/' + uid + '/bookRestores/' + id;
function setup(mode = 'missing') {
  const f = adventureImportDb({ nativeUpdates: true }),
    oldDb = sourceIndexesLegacyDb(f.db, mode),
    oldFactory = () => createBookRestoreUploadService({ db: oldDb, now: () => 1000 }),
    factory = () => createBookRestoreUploadService({ db: f.db, now: () => 1000 });
  return { ...f, oldFactory, factory, api: factory() };
}
const bodyRows = (f, p) =>
  [...f.records].filter(
    ([path]) =>
      path.startsWith('books/' + p.bookId + '/bookTextBodies/') && !path.includes('/chunks/'),
  );
const step = (f, p, op = 'migrate-source-step01') =>
  f.api.advanceBookRestoreSourceIndexes(uid, mutation(id, p, op));
function compact(value) {
  if (value instanceof Uint8Array)
    return {
      type: 'bytes',
      byteLength: value.length,
      sha256: createHash('sha256').update(value).digest('hex'),
    };
  if (Array.isArray(value)) return { type: 'array', items: value.map(compact) };
  if (value && typeof value === 'object')
    return {
      type: 'object',
      fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, compact(item)])),
    };
  return value;
}
const rowsProof = (rows) => rows.map(([path, value]) => [path, digest(compact(value))]);

test('old body born without index is migrated with its journal and receipt, preserving text/parts/pins/counts and no active root', async () => {
  const f = setup(),
    p = await readyRestoreSourceIndexes(f.oldFactory, uid, id),
    [path, before] = bodyRows(f, p)[0],
    original = structuredClone(before),
    sourceRows = structuredClone(
      [...f.records].filter(([path]) => path.startsWith('books/' + p.bookId + '/sceneSources/')),
    ),
    parts = rowsProof(
      [...f.records].filter(
        ([path]) =>
          path.startsWith('books/' + p.bookId + '/bookTextBodies/') && path.includes('/chunks/'),
      ),
    );
  assert.equal('sceneSourceEncoding' in before, false);
  const birth = structuredClone(f.metadata.get(path)),
    result = await step(f, p),
    current = f.records.get(path),
    journalPath =
      root + '/materializationArtifacts/' + digest(['text-body', path.split('/').at(-1)]),
    journal = f.records.get(journalPath),
    receipt = f.records.get(
      'users/' + uid + '/bookRestoreOperations/' + result.receipt.operationId,
    );
  assert.equal(current.sceneSourceEncoding.schemaVersion, 1);
  const { sceneSourceEncoding, ...rest } = current;
  assert.deepEqual(rest, original);
  assert.ok(sceneSourceEncoding.offsets.length > 1);
  assert.deepEqual(
    [...f.records].filter(([path]) => path.startsWith('books/' + p.bookId + '/sceneSources/')),
    sourceRows,
  );
  assert.deepEqual(
    rowsProof(
      [...f.records].filter(
        ([path]) =>
          path.startsWith('books/' + p.bookId + '/bookTextBodies/') && path.includes('/chunks/'),
      ),
    ),
    parts,
  );
  assert.equal(f.metadata.get(path).createdAtNanoseconds, birth.createdAtNanoseconds);
  assert.notEqual(f.metadata.get(path).updatedAtNanoseconds, birth.updatedAtNanoseconds);
  assert.equal(journal.lastOperationId, result.receipt.operationId);
  assert.equal(receipt.receipt.action, 'advanceBookRestoreSourceIndexes');
  assert.equal(result.progress.preparation.schemaVersion, 12);
  assert.equal(result.progress.preparation.artifactCount, p.preparation.artifactCount);
  assert.deepEqual(
    { ...result.progress.preparation.sourceIndexes, after: null },
    { schemaVersion: 1, scanned: 1, backfilled: 1, after: null, complete: false },
  );
  const done = await finishRestoreSourceIndexes(f.factory, uid, id, result.progress);
  assert.equal(done.preparation.sourceIndexes.complete, true);
  assert.equal(done.preparation.itemIndex, p.preparation.itemIndex);
  assert.equal(f.records.has('books/' + p.bookId), false);
  assert.equal(f.records.get('books/' + p.bookId + '/workProgress/current').countReady, false);
  assert.equal(BOOK_RESTORE_METHODS.includes('advanceBookRestoreSourceIndexes'), false);
});
test('a current index is verified without rewriting body or journal', async () => {
  const f = setup('current'),
    p = await readyRestoreSourceIndexes(f.oldFactory, uid, id),
    [path] = bodyRows(f, p)[0],
    journal = root + '/materializationArtifacts/' + digest(['text-body', path.split('/').at(-1)]),
    before = structuredClone([
      f.records.get(path),
      f.metadata.get(path),
      f.records.get(journal),
      f.metadata.get(journal),
    ]),
    done = await finishRestoreSourceIndexes(f.factory, uid, id, p);
  assert.equal(done.preparation.sourceIndexes.scanned, 1);
  assert.equal(done.preparation.sourceIndexes.backfilled, 0);
  assert.deepEqual(
    [f.records.get(path), f.metadata.get(path), f.records.get(journal), f.metadata.get(journal)],
    before,
  );
});
test('multiple sources include inline snapshots and exact total; zero sources completes explicitly', async () => {
  for (const sources of [0, 2]) {
    const f = setup(),
      p = await readyRestoreSourceIndexes(
        f.oldFactory,
        uid,
        id,
        sourceIndexesRecords({ sources, inlineExtra: true }),
      ),
      done = await finishRestoreSourceIndexes(f.factory, uid, id, p);
    assert.equal(done.preparation.sourceIndexes.scanned, sources);
    assert.equal(done.preparation.sourceIndexes.backfilled, sources ? 1 : 0);
    assert.equal(done.preparation.sourceIndexes.complete, true);
  }
});
test('authenticated but malformed existing index fails without being silently repaired', async () => {
  const f = setup('corrupt'),
    p = await readyRestoreSourceIndexes(f.oldFactory, uid, id),
    before = rowsProof([...f.records]);
  await assert.rejects(() => step(f, p));
  assert.deepEqual(rowsProof([...f.records]), before);
});
test('migration retains compatibility with v14 cancellation and never recreates from an old receipt', async () => {
  const f = setup(),
    p = await readyRestoreSourceIndexes(f.oldFactory, uid, id),
    request = mutation(id, p, 'source-index-cancel-step01'),
    migrated = await f.api.advanceBookRestoreSourceIndexes(uid, request),
    current = 'users/' + uid + '/aiPersonas/custom-existing';
  f.records.set(current, { keep: true });
  const done = await cleanupLegacyRestore(f.api, uid, id, migrated.progress, { limit: 5 });
  assert.equal(done.state, 'cancelled');
  assert.equal(bodyRows(f, p).length, 0);
  assert.equal(f.records.get(current).keep, true);
  assert.deepEqual(
    (await f.api.advanceBookRestoreSourceIndexes(uid, request)).receipt,
    migrated.receipt,
  );
  assert.equal(bodyRows(f, p).length, 0);
});
test('same request replay and competing checkpoints never double the backfill count', async () => {
  const f = setup(),
    p = await readyRestoreSourceIndexes(f.oldFactory, uid, id),
    request = mutation(id, p, 'source-index-twin-step01'),
    twins = await Promise.all([
      f.api.advanceBookRestoreSourceIndexes(uid, request),
      f.factory().advanceBookRestoreSourceIndexes(uid, request),
    ]);
  assert.deepEqual(twins[0], twins[1]);
  assert.equal(twins[0].progress.preparation.sourceIndexes.backfilled, 1);
  const progress = twins[0].progress,
    results = await Promise.allSettled([
      step(f, progress, 'source-index-race-one01'),
      step(f, progress, 'source-index-race-two01'),
    ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
});
for (const kind of ['body', 'part', 'body-journal', 'part-journal', 'source', 'receipt'])
  test('recreated ' + kind + ' cannot authorize a migrated index', async () => {
    const f = setup(),
      p = await readyRestoreSourceIndexes(f.oldFactory, uid, id),
      [body] = bodyRows(f, p)[0],
      bodyId = body.split('/').at(-1),
      source = [...f.records.keys()].find((path) =>
        path.startsWith('books/' + p.bookId + '/sceneSources/'),
      ),
      bodyJournal = root + '/materializationArtifacts/' + digest(['text-body', bodyId]),
      part = body + '/chunks/000000000000000',
      partJournal =
        root + '/materializationArtifacts/' + digest(['text-chunk', bodyId + ':000000000000000']),
      receipt =
        'users/' +
        uid +
        '/bookRestoreOperations/' +
        f.records.get(bodyJournal).createdByOperationId,
      path = {
        body,
        part,
        'body-journal': bodyJournal,
        'part-journal': partJournal,
        source,
        receipt,
      }[kind],
      value = structuredClone(f.records.get(path));
    await f.db.runTransaction(async (tx) => tx.delete(f.db.doc(path)));
    await f.db.runTransaction(async (tx) => tx.create(f.db.doc(path), value));
    const before = rowsProof([...f.records]);
    await assert.rejects(() => step(f, p));
    assert.deepEqual(rowsProof([...f.records]), before);
  });
test('closed counters cannot complete early or exceed validated sources', async () => {
  const f = setup(),
    p = await readyRestoreSourceIndexes(
      f.oldFactory,
      uid,
      id,
      sourceIndexesRecords({ sources: 2, inlineExtra: true }),
    ),
    migrated = (await step(f, p)).progress,
    job = f.records.get(root);
  assert.equal(migrated.preparation.sourceIndexes.complete, false);
  for (const mutate of [
    (x) => (x.sourceIndexes.after = null),
    (x) => (x.sourceIndexes.backfilled = 2),
    (x) => (x.sourceIndexes.scanned = Number.MAX_SAFE_INTEGER),
    (x) => (x.sourceIndexes.unknown = true),
    (x) => (x.sourceIndexes.complete = true),
  ]) {
    const value = structuredClone(job);
    mutate(value.preparation);
    assert.throws(() => jobShape(uid, id, value));
  }
});

test('failed index write rolls back the unit and automatic callback retry counts one backfill', async () => {
  const f = setup(),
    p = await readyRestoreSourceIndexes(f.oldFactory, uid, id),
    [body] = bodyRows(f, p)[0],
    before = rowsProof([...f.records]),
    run = f.db.runTransaction.bind(f.db),
    failure = new Error('index write failed');
  let automatic = false,
    inject = true;
  f.db.runTransaction = async (operation) => {
    try {
      return await run(async (tx) =>
        operation({
          ...tx,
          set: (ref, ...args) => {
            if (inject && ref.path === body) throw failure;
            return tx.set(ref, ...args);
          },
        }),
      );
    } catch (error) {
      if (error === failure && automatic) {
        inject = false;
        return run(operation);
      }
      throw error;
    }
  };
  await assert.rejects(
    () => step(f, p),
    (error) => error === failure,
  );
  assert.deepEqual(rowsProof([...f.records]), before);
  automatic = true;
  const result = await step(f, p);
  assert.equal(result.progress.preparation.sourceIndexes.backfilled, 1);
  assert.equal(result.progress.preparation.sourceIndexes.scanned, 1);
  assert.equal(f.records.get(body).sceneSourceEncoding.schemaVersion, 1);
});
test('migration of a near-8 MiB old source authenticates all 128 parts without changing them', async () => {
  const f = setup(),
    p = await readyRestoreSourceIndexes(
      f.oldFactory,
      uid,
      id,
      sourceIndexesRecords({ content: '\ufeff' + 'x'.repeat(8 * 1024 * 1024 - 4096) }),
    ),
    [body] = bodyRows(f, p)[0],
    parts = () => rowsProof([...f.records].filter(([path]) => path.startsWith(body + '/chunks/'))),
    before = parts(),
    done = await finishRestoreSourceIndexes(f.factory, uid, id, p);
  assert.equal(done.preparation.sourceIndexes.backfilled, 1);
  assert.equal(f.records.get(body).sceneSourceEncoding.offsets.length, 129);
  assert.deepEqual(parts(), before);
});
test('missing or unproven source rows block completion without adoption or deletion', async () => {
  for (const kind of ['missing', 'foreign']) {
    const f = setup(),
      p = await readyRestoreSourceIndexes(f.oldFactory, uid, id),
      source = [...f.records.keys()].find((path) =>
        path.startsWith('books/' + p.bookId + '/sceneSources/'),
      );
    if (kind === 'missing') await f.db.runTransaction(async (tx) => tx.delete(f.db.doc(source)));
    else f.records.set('books/' + p.bookId + '/sceneSources/z-foreign', { keep: true });
    await assert.rejects(() => finishRestoreSourceIndexes(f.factory, uid, id, p));
    if (kind === 'foreign')
      assert.equal(f.records.get('books/' + p.bookId + '/sceneSources/z-foreign').keep, true);
    assert.equal(f.records.has('books/' + p.bookId), false);
  }
});
test('pure part validation rejects a snapshot with the wrong native path', async () => {
  const { openBookChapterText, validateBookChapterTextPart } =
      await import('../src/bookChapterText.mjs'),
    f = setup(),
    p = await readyRestoreSourceIndexes(f.oldFactory, uid, id),
    source = [...f.records].find(([path]) =>
      path.startsWith('books/' + p.bookId + '/sceneSources/'),
    );
  await f.db.runTransaction(async (tx) => {
    const opened = await openBookChapterText(tx, f.db, {
        uid,
        bookId: p.bookId,
        chapterId: source[0].split('/').at(-1),
        chapter: source[1].original,
      }),
      snapshot = await tx.get(f.db.doc(opened.path + '/chunks/000000000000000'));
    assert.throws(() =>
      validateBookChapterTextPart(opened, 0, {
        ...snapshot,
        ref: f.db.doc(opened.path + '/chunks/000000000000001'),
      }),
    );
    assert.ok(validateBookChapterTextPart(opened, 0, snapshot).length > 0);
  });
});
