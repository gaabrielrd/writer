import test from 'node:test';
import assert from 'node:assert/strict';
import { createBookRestoreUploadService } from '../src/bookRestoreUpload.mjs';
import { createScenesService } from '../src/scenes.mjs';
import { createBookBackupReadService } from '../src/bookBackupRead.mjs';
import { createBookBackupResourceService } from '../src/bookBackupResourceRead.mjs';
import {
  prepareRestoredBookSceneSource,
  readBookSceneSource,
} from '../src/bookSceneSourceText.mjs';
import { digest } from '../src/sceneContracts.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import { largeSceneSourceFixture, sourceText } from './helpers/bookSceneSourceFixture.mjs';
import { readyRestoreCounts, finishRestoreCounts } from './helpers/bookRestoreCountsFixture.mjs';
import { cleanupLegacyRestore } from './helpers/bookLegacyRestoreFixture.mjs';
const uid = 'author',
  id = 'source-text-restore01';
function setup() {
  const f = adventureImportDb({ nativeUpdates: true }),
    factory = () => createBookRestoreUploadService({ db: f.db, now: () => 1000 });
  return { ...f, factory, api: factory(), scenes: createScenesService({ db: f.db }) };
}
const sourceRow = (f, p) =>
  [...f.records].find(([path]) => path.startsWith('books/' + p.bookId + '/sceneSources/'));
async function prepare(f, content = sourceText) {
  const p = await readyRestoreCounts(f.factory, uid, id, largeSceneSourceFixture(content));
  return finishRestoreCounts(f.factory, uid, id, p);
}
async function harness(f, p) {
  await f.db.runTransaction(async (tx) => {
    tx.create(f.db.doc('books/' + p.bookId), {
      authorId: uid,
      title: 'Synthetic source harness',
      sceneRevision: 0,
      createdAt: 1,
      updatedAt: 2,
    });
  });
  const target = { kind: 'book', id: p.bookId },
    page = await f.scenes.listSceneSources(uid, { target, expectedProjectRevision: 0 });
  return { target, page, source: page.items[0] };
}

test('restores and reconciles frozen source above 1 MiB as a pinned chapter generation without a current root', async () => {
  const f = setup(),
    p = await prepare(f),
    [path, source] = sourceRow(f, p),
    descriptor = source.original.contentStorage,
    bodyPath = 'books/' + p.bookId + '/bookTextBodies/' + descriptor.bodyId;
  assert.ok(Buffer.byteLength(sourceText) > 1048576);
  assert.equal(source.original.content, null);
  assert.equal(p.preparation.phase, 'personas');
  assert.equal(f.records.has('books/' + p.bookId), false);
  assert.equal(f.records.get('books/' + p.bookId + '/workProgress/current').countReady, false);
  assert.equal(f.records.get(bodyPath).pins, 1);
  assert.equal(f.records.get(bodyPath).resource.id, path.split('/').at(-1));
  const logical = await f.db.runTransaction((tx) =>
    readBookSceneSource(tx, f.db, {
      uid,
      bookId: p.bookId,
      sourceId: path.split('/').at(-1),
      source,
    }),
  );
  assert.equal(logical.original.content, sourceText);
  assert.equal('contentStorage' in logical.original, false);
  await assert.rejects(() =>
    f.scenes.listSceneSources(uid, {
      target: { kind: 'book', id: p.bookId },
      expectedProjectRevision: 0,
    }),
  );
  f.metadataReads.length = 0;
  const done = await cleanupLegacyRestore(f.api, uid, id, p, { limit: 5 });
  assert.equal(done.state, 'cancelled');
  assert.equal(f.records.has(bodyPath), false);
  assert.equal(
    [...f.records.keys()].some((path) => path.includes('/bookTextBodies/')),
    false,
  );
  assert.ok(
    f.metadataReads
      .filter((r) => r.path.includes('/bookTextBodies/'))
      .every((r) => r.fields.length === 0),
  );
});

test('source reader and portable backup reproduce literal content even after the original chapter is removed', async (t) => {
  const f = setup(),
    p = await prepare(f),
    { target, source } = await harness(f, p);
  await f.db.runTransaction(async (tx) =>
    tx.delete(f.db.doc('books/' + p.bookId + '/chapters/' + source.id)),
  );
  assert.equal(source.content, null);
  assert.equal('contentStorage' in source.original, false);
  const parts = [];
  for (let index = 0; index < source.contentStorage.chunkCount; index++) {
    const page = await f.scenes.readSceneSourceText(uid, {
      target,
      sourceId: source.id,
      expectedProjectRevision: 0,
      sourceToken: source.sourceToken,
      index,
    });
    assert.equal(page.sourceToken, source.sourceToken);
    assert.equal(page.projectRevision, 0);
    assert.ok(Buffer.from(page.chunkBase64, 'base64').length <= 65536);
    parts.push(Buffer.from(page.chunkBase64, 'base64'));
  }
  assert.equal(
    new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(Buffer.concat(parts)),
    sourceText,
  );
  let partReads = 0;
  const run = f.db.runTransaction.bind(f.db);
  f.db.runTransaction = (operation) =>
    run(async (tx) =>
      operation({
        ...tx,
        get: (ref) => {
          if (ref.path?.includes('/bookTextBodies/') && ref.path.includes('/chunks/')) partReads++;
          return tx.get(ref);
        },
      }),
    );
  const backup = createBookBackupReadService({ db: f.db }),
    resources = createBookBackupResourceService({ db: f.db }),
    start = await backup.getBookBackupSource(uid, { bookId: p.bookId }),
    scope = { bookId: p.bookId, kind: 'scene-source', sourceToken: start.sourceToken },
    item = (await resources.listBookBackupResources(uid, scope)).items[0],
    chunks = [];
  let count;
  for (let index = 0; count === undefined || index < count; index++) {
    const result = await resources.readBookBackupResource(uid, { ...scope, ...item, index });
    count = result.chunkCount;
    chunks.push(Buffer.from(result.chunkBase64, 'base64'));
  }
  t.diagnostic(
    'Source backup: ' +
      source.contentStorage.chunkCount +
      ' body parts, ' +
      count +
      ' output pages, ' +
      partReads +
      ' part reads',
  );
  const record = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  assert.equal(record.data.original.content, sourceText);
  assert.equal(record.data.hash, digest(sourceText));
  assert.equal('contentStorage' in record.data.original, false);
});

for (const what of ['root', 'source', 'body', 'revision', 'part'])
  test('source pages reject changed ' + what + ' and never return an empty fallback', async () => {
    const f = setup(),
      p = await prepare(f),
      { target, source } = await harness(f, p),
      input = {
        target,
        sourceId: source.id,
        expectedProjectRevision: 0,
        sourceToken: source.sourceToken,
        index: 0,
      },
      bodyPath = 'books/' + p.bookId + '/bookTextBodies/' + source.contentStorage.bodyId;
    await f.scenes.readSceneSourceText(uid, input);
    if (what === 'revision')
      await f.db.runTransaction(async (tx) =>
        tx.update(f.db.doc('books/' + p.bookId), { sceneRevision: 1 }),
      );
    else if (what === 'part')
      await f.db.runTransaction(async (tx) =>
        tx.update(f.db.doc(bodyPath + '/chunks/000000000000000'), { bytes: Buffer.alloc(65536) }),
      );
    else {
      const path =
          what === 'root'
            ? 'books/' + p.bookId
            : what === 'source'
              ? 'books/' + p.bookId + '/sceneSources/' + source.id
              : bodyPath,
        value = structuredClone(f.records.get(path));
      await f.db.runTransaction(async (tx) => tx.delete(f.db.doc(path)));
      await f.db.runTransaction(async (tx) => tx.create(f.db.doc(path), value));
    }
    await assert.rejects(() => f.scenes.readSceneSourceText(uid, input));
    await assert.rejects(() => f.scenes.readSceneSourceText('other', input));
  });

test('source approaching the 8 MiB logical record budget preserves 128 chunks with no smaller native-document cap', async () => {
  const f = setup(),
    content = '\ufeff' + 'x'.repeat(8 * 1024 * 1024 - 4096),
    p = await prepare(f, content),
    [path, source] = sourceRow(f, p),
    logical = await f.db.runTransaction((tx) =>
      readBookSceneSource(tx, f.db, {
        uid,
        bookId: p.bookId,
        sourceId: path.split('/').at(-1),
        source,
      }),
    );
  assert.equal(source.original.contentStorage.chunkCount, 128);
  assert.equal(logical.original.content, content);
  assert.ok(f.commits.every((writes) => writes.length < 500));
});

test('source preparation preserves absent inline content and refuses mismatched hash or a supplied physical pointer', () => {
  const input = {
    uid,
    bookId: 'book',
    sourceId: 'chapter',
    operationId: 'source-prepare-op01',
    timestamp: 1,
    source: { hash: digest(''), original: { title: 'Chapter', order: 1 } },
  };
  assert.deepEqual(prepareRestoredBookSceneSource(input), { value: input.source, writes: [] });
  assert.throws(() =>
    prepareRestoredBookSceneSource({
      ...input,
      source: {
        ...input.source,
        original: { ...input.source.original, content: null },
      },
    }),
  );
  assert.throws(() =>
    prepareRestoredBookSceneSource({
      ...input,
      source: { ...input.source, hash: digest('changed') },
    }),
  );
  assert.throws(() =>
    prepareRestoredBookSceneSource({
      ...input,
      source: { ...input.source, original: { ...input.source.original, contentStorage: null } },
    }),
  );
});

test('large-source collision and a retried transaction preserve the cursor and create only one immutable generation', async () => {
  const f = setup(),
    records = largeSceneSourceFixture();
  const { uploadArchiveRestore } = await import('./helpers/bookRestoreContentFixture.mjs'),
    { finishLegacyRestore, legacyMutation } =
      await import('./helpers/bookLegacyRestoreFixture.mjs'),
    { finishRestoreStructure } = await import('./helpers/bookRestoreStructureFixture.mjs'),
    { finishRestoreLore } = await import('./helpers/bookRestoreLoreFixture.mjs');
  const uploaded = await uploadArchiveRestore(f.api, uid, id, records),
    validated = await finishLegacyRestore(f.factory, uid, id, uploaded.progress),
    structure = await finishRestoreStructure(f.factory, uid, id, validated);
  let p = await finishRestoreLore(f.factory, uid, id, structure),
    item;
  for (let n = 0; n < 100; n++) {
    const reader = await f.api.openVerifiedBookRestoreContent(uid, {
      restoreId: id,
      jobToken: p.jobToken,
    });
    item = await reader.readMappedItem(p.preparation.itemIndex);
    if (item.record.kind === 'book-scene-source') break;
    p = (
      await f.api.advanceBookRestoreResources(uid, legacyMutation(id, p, 'source-skip-item-' + n))
    ).progress;
  }
  assert.equal(item.record.kind, 'book-scene-source');
  const request = legacyMutation(id, p, 'source-collision-retry01'),
    plan = prepareRestoredBookSceneSource({
      uid,
      bookId: p.bookId,
      sourceId: item.value.id,
      operationId: request.operationId,
      timestamp: p.preparation.timestamp,
      source: item.value.data,
    }),
    bodyId = plan.value.original.contentStorage.bodyId,
    bodyPath = 'books/' + p.bookId + '/bookTextBodies/' + bodyId;
  f.records.set(bodyPath, { keep: true });
  const before = structuredClone([...f.records]);
  await assert.rejects(() => f.api.advanceBookRestoreResources(uid, request));
  assert.deepEqual([...f.records], before);
  f.records.delete(bodyPath);
  const run = f.db.runTransaction.bind(f.db);
  let retry = true;
  f.db.runTransaction = async (operation) => {
    try {
      return await run(async (tx) =>
        operation({
          ...tx,
          create: (ref, ...values) => {
            if (retry && ref.path.startsWith(bodyPath + '/chunks/')) {
              retry = false;
              throw new Error('retry-source-transaction');
            }
            return tx.create(ref, ...values);
          },
        }),
      );
    } catch (error) {
      if (error.message !== 'retry-source-transaction') throw error;
      return run(operation);
    }
  };
  const result = await f.api.advanceBookRestoreResources(uid, request);
  assert.equal(result.progress.preparation.itemIndex, p.preparation.itemIndex + 1);
  assert.equal(result.progress.preparation.resourceCounts['scene-source'], 1);
  assert.equal(
    [...f.records.keys()].filter(
      (path) =>
        path.startsWith('books/' + p.bookId + '/bookTextBodies/') && !path.includes('/chunks/'),
    ).length,
    1,
  );
  assert.deepEqual((await f.api.advanceBookRestoreResources(uid, request)).receipt, result.receipt);
  const done = await cleanupLegacyRestore(f.api, uid, id, result.progress, { limit: 5 });
  assert.equal(done.state, 'cancelled');
});
