import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import {
  fieldUploadFixture,
  control,
  appendRequest,
  uploadAll,
  sealAll,
  cancelAll,
  readSealedField,
} from './helpers/bookLoreFieldUploadFixture.mjs';
import {
  resourcePayloadBodyPath,
  resourcePayloadChunkPath,
} from '../src/bookResourcePayloadPaths.mjs';
import { fieldUploadIntent, fieldUploadStartHash } from '../src/bookLoreFieldUploadContracts.mjs';
const sha = (v) => createHash('sha256').update(v).digest('hex');
async function setup(options) {
  const db = adventureImportDb({ nativeUpdates: true });
  return { ...db, ...(await fieldUploadFixture(db.db, options)) };
}
const source = (f) => f.records.get('books/' + f.bookId + '/lore/' + f.loreId);
const partPath = (f, index = 0) =>
  resourcePayloadChunkPath(f.bookId, f.prepared.manifest.bodyId, index);
const headerPath = (f) => resourcePayloadBodyPath(f.bookId, f.prepared.manifest.bodyId);
const get = (f) =>
  f.factory().getBookLoreFieldUpload(f.uid, { uploadId: f.uploadId, startHash: f.startHash });
const recreate = async (f, path) => {
  const data = structuredClone(f.records.get(path));
  await f.db.runTransaction(async (tx) => tx.delete(f.db.doc(path)));
  await f.db.runTransaction(async (tx) => tx.create(f.db.doc(path), data));
};

test('upload, verify, seal and read preserve a complete literal field while source/clock stay unchanged', async () => {
  const f = await setup(),
    before = structuredClone(source(f)),
    root = structuredClone(f.records.get('books/book')),
    p = await uploadAll(f);
  assert.equal(p.phase, 'verifying');
  assert.equal(f.records.has(headerPath(f)), false);
  assert.equal(f.records.has(f.c.stateRef.path), false);
  const sealed = await sealAll(f, p);
  assert.equal(sealed.phase, 'sealed');
  assert.equal(await readSealedField(f, sealed), f.value);
  assert.deepEqual(source(f), before);
  assert.deepEqual(f.records.get('books/book'), root);
  for (const key of [
    'hashState',
    'parserState',
    'manifest',
    'expectedBirth',
    'partSealBirth',
    'value',
  ])
    assert.equal(Object.hasOwn(sealed, key), false);
  const final = await cancelAll(f, sealed);
  assert.equal(final.phase, 'cancelled');
  assert.equal(final.cleanedCount, 2);
  assert.equal(f.records.has(headerPath(f)), false);
  assert.equal(f.records.has(partPath(f)), false);
  assert.deepEqual(source(f), before);
  assert.ok(f.records.has('books/book/bookResourceLeases/' + f.prepared.manifest.bodyId));
});
test('more than 8 MiB/128 parts survive reloaded services and bounded metadata-only cleanup', async () => {
  const value = '\ufeff' + String.fromCodePoint(0x1f319).repeat(2300000),
    f = await setup({ value }),
    p = await sealAll(f, await uploadAll(f));
  assert.ok(p.totalParts > 128);
  assert.equal(sha(await readSealedField(f, p)), sha(value));
  f.metadataReads.length = 0;
  f.reads.length = 0;
  const cleaned = await cancelAll(f, p);
  assert.equal(cleaned.cleanedCount, p.totalParts + 1);
  assert.ok(
    f.metadataReads.every((row) => !row.fields.includes('bytes') && !row.fields.includes('proof')),
  );
  assert.ok(f.reads.every((row) => row.maximum === 1 && row.fields.length === 0));
  assert.equal(
    [...f.records.keys()].some((path) =>
      path.startsWith('books/book/bookResourceChunks/' + f.prepared.manifest.bodyId),
    ),
    false,
  );
});
for (const [target, value] of [
  [{ field: 'name' }, ' exact '],
  [{ field: 'category' }, 'character'],
  [{ field: 'summary' }, 'summary'],
  [{ field: 'isPublic' }, false],
  [{ field: 'aliases' }, ['', 'same', 'same', '🌙']],
  [{ field: 'structuredDetails' }, { notes: 'secret', history: '' }],
  [
    { field: 'relations', page: 2, count: 2 },
    [
      { targetEntityId: 'local', relationType: 'same' },
      { targetEntityId: 'universe:w:id', relationType: '', description: '🌙' },
    ],
  ],
])
  test('typed field upload validates and preserves ' + target.field, async () => {
    const f = await setup({ target, value }),
      p = await sealAll(f, await uploadAll(f));
    assert.deepEqual(await readSealedField(f, p), value);
  });
test('idempotent starts/append/seal acknowledge old receipts after cancellation without resurrecting data', async () => {
  const f = await setup(),
    start = await f.factory().startBookLoreFieldUpload(f.uid, f.intent);
  assert.deepEqual(await f.factory().startBookLoreFieldUpload(f.uid, f.intent), start);
  const request = appendRequest(f, start),
    first = await f.factory().appendBookLoreFieldUpload(f.uid, request);
  assert.deepEqual(await f.factory().appendBookLoreFieldUpload(f.uid, request), first);
  const seal = control(f, first.progress, 'seal-0'),
    sealed = await f.factory().advanceBookLoreFieldSeal(f.uid, seal);
  assert.deepEqual(await f.factory().advanceBookLoreFieldSeal(f.uid, seal), sealed);
  const final = await cancelAll(f, sealed.progress),
    old = await f.factory().appendBookLoreFieldUpload(f.uid, request);
  assert.deepEqual(old.receipt, first.receipt);
  assert.deepEqual(old.progress, final);
  assert.equal((await f.factory().startBookLoreFieldUpload(f.uid, f.intent)).phase, 'cancelled');
  assert.equal(f.records.has(partPath(f)), false);
});
test('cancel before an uncertain start creates a permanent intent fence', async () => {
  const f = await setup(),
    r = { uploadId: f.uploadId, startHash: f.startHash, operationId: 'early-cancel' };
  const cancelled = await f.factory().cancelBookLoreFieldUpload(f.uid, r);
  assert.equal(cancelled.progress.phase, 'cancelled');
  assert.equal(cancelled.progress.jobToken, null);
  assert.deepEqual(await f.factory().startBookLoreFieldUpload(f.uid, f.intent), cancelled.progress);
  assert.equal(f.records.has(partPath(f)), false);
  assert.equal(f.records.has(f.c.stateRef.path), false);
});
for (const phase of ['empty', 'partial', 'verifying', 'sealed'])
  test('cancellation drains ' + phase + ' preparation and removes private SHA state', async () => {
    const f = await setup({ value: 'x'.repeat(150000) });
    let p = await f.factory().startBookLoreFieldUpload(f.uid, f.intent);
    if (phase === 'partial')
      p = (await f.factory().appendBookLoreFieldUpload(f.uid, appendRequest(f, p))).progress;
    if (['verifying', 'sealed'].includes(phase)) p = await uploadAll(f, p);
    if (phase === 'sealed') p = await sealAll(f, p);
    const final = await cancelAll(f, p);
    assert.equal(final.phase, 'cancelled');
    assert.equal(f.records.has(f.c.stateRef.path), false);
    assert.equal(f.records.has(partPath(f)), false);
    assert.equal(f.records.has(headerPath(f)), false);
  });
test('new units reject stale CAS/index/operation reuse without partial writes', async () => {
  const f = await setup({ value: 'x'.repeat(90000) }),
    p = await f.factory().startBookLoreFieldUpload(f.uid, f.intent),
    r = appendRequest(f, p),
    after = (await f.factory().appendBookLoreFieldUpload(f.uid, r)).progress,
    before = structuredClone([...f.records]);
  await assert.rejects(() =>
    f.factory().appendBookLoreFieldUpload(f.uid, appendRequest(f, p, 1, 'stale')),
  );
  await assert.rejects(() =>
    f
      .factory()
      .appendBookLoreFieldUpload(f.uid, { ...appendRequest(f, after), operationId: r.operationId }),
  );
  assert.deepEqual([...f.records], before);
});
for (const change of ['clock', 'owner', 'lore', 'book-recreate'])
  test(
    'new units reauthorize ' +
      change +
      ' while old receipts and own cancellation remain metadata-only',
    async () => {
      const f = await setup({ value: 'x'.repeat(90000) }),
        p = await f.factory().startBookLoreFieldUpload(f.uid, f.intent),
        r = appendRequest(f, p),
        first = (await f.factory().appendBookLoreFieldUpload(f.uid, r)).progress;
      if (change === 'book-recreate') await recreate(f, 'books/book');
      else
        await f.db.runTransaction(async (tx) =>
          tx.update(
            f.db.doc(change === 'lore' ? 'books/book/lore/entity' : 'books/book'),
            change === 'clock'
              ? { localLoreVersion: 1 }
              : change === 'owner'
                ? { authorId: 'other' }
                : { name: 'changed' },
          ),
        );
      await assert.rejects(() =>
        f.factory().appendBookLoreFieldUpload(f.uid, appendRequest(f, first)),
      );
      assert.equal((await f.factory().appendBookLoreFieldUpload(f.uid, r)).receipt.nextIndex, 1);
      if (change !== 'book-recreate') assert.equal((await cancelAll(f, first)).phase, 'cancelled');
      else {
        const cancelled = await f.factory().cancelBookLoreFieldUpload(f.uid, {
          uploadId: f.uploadId,
          startHash: f.startHash,
          operationId: 'cancel-new-root',
        });
        await assert.rejects(() =>
          f
            .factory()
            .advanceBookLoreFieldCleanup(f.uid, control(f, cancelled.progress, 'clean-new-root')),
        );
        assert.ok(f.records.has(partPath(f)));
      }
    },
  );
for (const target of [
  'job',
  'lease',
  'state',
  'receipt',
  'receipt-proof',
  'artifact',
  'chunk',
  'header',
])
  test('recreated ' + target + ' is never adopted or deleted by its old operation', async () => {
    const f = await setup(),
      p = await f.factory().startBookLoreFieldUpload(f.uid, f.intent),
      request = appendRequest(f, p),
      after = await f.factory().appendBookLoreFieldUpload(f.uid, request);
    if (target === 'header') await sealAll(f, after.progress);
    const path =
      target === 'job'
        ? f.c.path
        : target === 'lease'
          ? 'books/book/bookResourceLeases/' + f.prepared.manifest.bodyId
          : target === 'state'
            ? null
            : target === 'receipt'
              ? f.c.path + '/operations/' + request.operationId
              : target === 'receipt-proof'
                ? f.c.path + '/operationProofs/' + request.operationId
                : target === 'artifact'
                  ? f.c.path + '/artifacts/chunk-000000000000000'
                  : target === 'chunk'
                    ? partPath(f)
                    : headerPath(f);
    if (target === 'state') {
      const g = await setup({ uploadId: 'other-state', value: 'x'.repeat(90000) }),
        start = await g.factory().startBookLoreFieldUpload(g.uid, g.intent);
      await recreate(g, g.c.stateRef.path);
      await assert.rejects(() =>
        g.factory().appendBookLoreFieldUpload(g.uid, appendRequest(g, start)),
      );
      return;
    }
    await recreate(f, path);
    const version = f.metadata.get(path)?.createdAtNanoseconds;
    await assert.rejects(async () => {
      let p = (
        await f.factory().cancelBookLoreFieldUpload(f.uid, {
          uploadId: f.uploadId,
          startHash: f.startHash,
          operationId: 'cancel-recreated',
        })
      ).progress;
      while (p.phase === 'cancelling')
        p = (
          await f
            .factory()
            .advanceBookLoreFieldCleanup(f.uid, control(f, p, 'cleanup-recreated-' + p.revision))
        ).progress;
    });
    assert.ok(f.records.has(path));
    assert.equal(f.metadata.get(path)?.createdAtNanoseconds, version);
  });
test('a chunk recreated after its seal batch is rejected by partSealBirth, even before header birth', async () => {
  const f = await setup({ value: 'x'.repeat(17 * 65536) }),
    p = await uploadAll(f),
    first = (await f.factory().advanceBookLoreFieldSeal(f.uid, control(f, p, 'first-seal')))
      .progress;
  assert.equal(first.sealIndex, 16);
  await recreate(f, partPath(f, 0));
  const sealed = await sealAll(f, first);
  assert.equal(sealed.phase, 'sealed');
  await assert.rejects(() => readSealedField(f, sealed));
});
test('malformed field JSON and a false full SHA never produce a header or advance the failing unit', async () => {
  const invalid = await setup({ value: 123 }),
    p = await invalid.factory().startBookLoreFieldUpload(invalid.uid, invalid.intent);
  await assert.rejects(() =>
    invalid.factory().appendBookLoreFieldUpload(invalid.uid, appendRequest(invalid, p)),
  );
  assert.equal((await get(invalid)).nextIndex, 0);
  assert.equal(invalid.records.has(headerPath(invalid)), false);
  const f = await setup(),
    m = { ...f.intent.manifest, contentHash: 'a'.repeat(64) };
  // Correctly scoped body ID for an intentionally false full-content SHA.
  const { resourcePayloadBodyId } = await import('../src/bookResourcePayload.mjs');
  m.bodyId = resourcePayloadBodyId(
    { uid: f.uid, bookId: f.bookId, resource: { kind: 'lore', parentId: null, id: f.loreId } },
    {
      operationId: (await import('../src/bookLoreFieldUploadContracts.mjs')).fieldUploadOperationId(
        f.uid,
        f.bookId,
        f.loreId,
        f.uploadId,
        f.target,
      ),
      ...m,
    },
  );
  f.intent = fieldUploadIntent(f.uid, { ...f.intent, manifest: m });
  f.startHash = fieldUploadStartHash(f.intent);
  const start = await f.factory().startBookLoreFieldUpload(f.uid, f.intent);
  await assert.rejects(() => f.factory().appendBookLoreFieldUpload(f.uid, appendRequest(f, start)));
  assert.equal((await get(f)).nextIndex, 0);
});
test('colliding bodies or orphan chunks prevent any upload reservation or byte write', async () => {
  for (const kind of ['header', 'chunk']) {
    const f = await setup(),
      path = kind === 'header' ? headerPath(f) : partPath(f);
    await f.db.runTransaction(async (tx) =>
      tx.create(
        f.db.doc(path),
        kind === 'header'
          ? { foreign: true }
          : { bodyId: f.prepared.manifest.bodyId, foreign: true },
      ),
    );
    await assert.rejects(() => f.factory().startBookLoreFieldUpload(f.uid, f.intent));
    assert.equal(f.records.has(f.c.path), false);
  }
});
test('unknown extra chunks block final cleanup and preserve the header', async () => {
  const f = await setup();
  await sealAll(f, await uploadAll(f));
  await f.db.runTransaction(async (tx) =>
    tx.create(f.db.doc(partPath(f, 99)), { bodyId: f.prepared.manifest.bodyId, foreign: true }),
  );
  const cancelled = (
      await f.factory().cancelBookLoreFieldUpload(f.uid, {
        uploadId: f.uploadId,
        startHash: f.startHash,
        operationId: 'cancel-orphan',
      })
    ).progress,
    first = (
      await f.factory().advanceBookLoreFieldCleanup(f.uid, control(f, cancelled, 'cleanup-parts'))
    ).progress;
  await assert.rejects(() =>
    f.factory().advanceBookLoreFieldCleanup(f.uid, control(f, first, 'cleanup-header')),
  );
  assert.ok(f.records.has(headerPath(f)));
  assert.ok(f.records.has(partPath(f, 99)));
});
test('an absent source rejects start while metadata resolution of unknown jobs stays null', async () => {
  const f = await setup();
  await f.db.runTransaction(async (tx) => tx.delete(f.db.doc('books/book')));
  await assert.rejects(() => f.factory().startBookLoreFieldUpload(f.uid, f.intent));
  assert.equal(await get(f), null);
});
test('anonymous actors, unknown keys, changed target/body scope and malformed parts fail closed', async () => {
  const f = await setup();
  await assert.rejects(() => f.factory().startBookLoreFieldUpload('', f.intent));
  for (const intent of [
    { ...f.intent, extra: true },
    { ...f.intent, target: { field: 'createdAt' } },
    { ...f.intent, loreId: 'other' },
  ])
    await assert.rejects(() => f.factory().startBookLoreFieldUpload(f.uid, intent));
  const p = await f.factory().startBookLoreFieldUpload(f.uid, f.intent),
    r = appendRequest(f, p);
  for (const changed of [
    { chunkBase64: '?' },
    { proof: [] },
    { index: -1 },
    { jobToken: 'a'.repeat(64) },
    { extra: true },
  ])
    if (!(changed.proof && r.proof.length === 0))
      await assert.rejects(() =>
        f.factory().appendBookLoreFieldUpload(f.uid, { ...r, ...changed }),
      );
  assert.equal((await get(f)).nextIndex, 0);
});

test('retry after preparing every write resets SHA/parser and commits one batch', async () => {
  const f = await setup(),
    p = await f.factory().startBookLoreFieldUpload(f.uid, f.intent),
    run = f.db.runTransaction.bind(f.db),
    retry = new Error('injected retry');
  let once = true;
  f.db.runTransaction = (fn) => {
    if (!once) return run(fn);
    once = false;
    return run(async (tx) => {
      await fn(tx);
      throw retry;
    }).catch((error) => {
      if (error !== retry) throw error;
      return run(fn);
    });
  };
  const result = await f.factory().appendBookLoreFieldUpload(f.uid, appendRequest(f, p));
  assert.equal(result.progress.nextIndex, 1);
  assert.equal(result.progress.phase, 'verifying');
  assert.equal(result.progress.revision, 1);
  assert.equal(f.records.has(partPath(f)), true);
  assert.equal((await get(f)).nextIndex, 1);
});
test('a failure after artifact writes were prepared rolls back bytes, state and receipts together', async () => {
  const f = await setup(),
    p = await f.factory().startBookLoreFieldUpload(f.uid, f.intent),
    before = structuredClone([...f.records]),
    run = f.db.runTransaction.bind(f.db);
  f.db.runTransaction = (fn) =>
    run((tx) =>
      fn({
        ...tx,
        create(ref, value) {
          tx.create(ref, value);
          if (ref.path.includes('/artifacts/')) throw new Error('injected write failure');
        },
      }),
    );
  await assert.rejects(
    () => f.factory().appendBookLoreFieldUpload(f.uid, appendRequest(f, p)),
    /injected write failure/,
  );
  assert.deepEqual([...f.records], before);
});
test('concurrent different append operations commit one cursor and same-operation retries resolve the receipt', async () => {
  const f = await setup(),
    p = await f.factory().startBookLoreFieldUpload(f.uid, f.intent),
    first = appendRequest(f, p, 0, 'concurrent-a'),
    second = appendRequest(f, p, 0, 'concurrent-b'),
    results = await Promise.allSettled([
      f.factory().appendBookLoreFieldUpload(f.uid, first),
      f.factory().appendBookLoreFieldUpload(f.uid, second),
    ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal((await get(f)).nextIndex, 1);
  const accepted = results[0].status === 'fulfilled' ? first : second;
  const repeated = await Promise.all([
    f.factory().appendBookLoreFieldUpload(f.uid, accepted),
    f.factory().appendBookLoreFieldUpload(f.uid, accepted),
  ]);
  assert.deepEqual(repeated[0], repeated[1]);
  assert.equal(repeated[0].progress.revision, 1);
});
test('cleanup remains authorized for own temporary bytes when the source root was removed', async () => {
  const f = await setup(),
    p = await sealAll(f, await uploadAll(f));
  await f.db.runTransaction(async (tx) => tx.delete(f.db.doc('books/book')));
  assert.equal((await cancelAll(f, p)).phase, 'cancelled');
  assert.equal(f.records.has(headerPath(f)), false);
});
test('lease adoption blocks cancellation and preserves prepared bytes', async () => {
  const f = await setup(),
    p = await sealAll(f, await uploadAll(f));
  await f.db.runTransaction(async (tx) =>
    tx.update(f.db.doc('books/book/bookResourceLeases/' + f.prepared.manifest.bodyId), {
      phase: 'adopted',
    }),
  );
  await assert.rejects(() =>
    f.factory().cancelBookLoreFieldUpload(f.uid, {
      uploadId: f.uploadId,
      startHash: f.startHash,
      operationId: 'cancel-adopted',
    }),
  );
  assert.ok(f.records.has(headerPath(f)));
  assert.ok(f.records.has(partPath(f)));
  assert.equal(p.prepared, true);
});
test('the extracted body identity preserves the pre-upload codec formula exactly', async () => {
  const f = await setup(),
    operationId = (await import('../src/bookLoreFieldUploadContracts.mjs')).fieldUploadOperationId(
      f.uid,
      f.bookId,
      f.loreId,
      f.uploadId,
      f.target,
    ),
    { digest } = await import('../src/sceneContracts.mjs'),
    m = f.prepared.manifest;
  assert.equal(
    m.bodyId,
    digest({
      domain: 'writer-book-resource-payload',
      schemaVersion: 1,
      uid: f.uid,
      bookId: f.bookId,
      resource: { kind: 'lore', parentId: null, id: f.loreId },
      operationId,
      contentHash: m.contentHash,
      merkleRoot: m.merkleRoot,
    }),
  );
});

test('an existing payload source accepts a new field without changing its active storage or logical value', async () => {
  const f = await setup({ inline: false }),
    before = structuredClone(source(f)),
    p = await sealAll(f, await uploadAll(f));
  assert.equal(await readSealedField(f, p), f.value);
  assert.deepEqual(source(f), before);
  assert.ok(source(f).payloadStorage);
  assert.equal((await cancelAll(f, p)).phase, 'cancelled');
});
test('page count mismatch and corrupted Merkle bytes cannot advance or write a unit', async () => {
  const wrong = await setup({
      target: { field: 'relations', page: 0, count: 2 },
      value: [{ targetEntityId: 'x', relationType: '' }],
    }),
    start = await wrong.factory().startBookLoreFieldUpload(wrong.uid, wrong.intent);
  await assert.rejects(() =>
    wrong.factory().appendBookLoreFieldUpload(wrong.uid, appendRequest(wrong, start)),
  );
  assert.equal((await get(wrong)).nextIndex, 0);
  assert.equal(wrong.records.has(partPath(wrong)), false);
  const f = await setup({ value: 'x'.repeat(90000) }),
    p = await f.factory().startBookLoreFieldUpload(f.uid, f.intent),
    r = appendRequest(f, p),
    bytes = Buffer.from(r.chunkBase64, 'base64');
  bytes[0] = 120;
  await assert.rejects(() =>
    f.factory().appendBookLoreFieldUpload(f.uid, { ...r, chunkBase64: bytes.toString('base64') }),
  );
  assert.equal((await get(f)).nextIndex, 0);
  assert.equal((await f.factory().appendBookLoreFieldUpload(f.uid, r)).progress.nextIndex, 1);
});
test('cleanup rollback keeps the cursor, lease and bytes together', async () => {
  const f = await setup(),
    p = await sealAll(f, await uploadAll(f)),
    cancelled = (
      await f.factory().cancelBookLoreFieldUpload(f.uid, {
        uploadId: f.uploadId,
        startHash: f.startHash,
        operationId: 'cancel-rollback',
        jobToken: p.jobToken,
      })
    ).progress,
    before = structuredClone([...f.records]),
    run = f.db.runTransaction.bind(f.db);
  f.db.runTransaction = (fn) =>
    run((tx) =>
      fn({
        ...tx,
        update(ref, value) {
          tx.update(ref, value);
          if (ref.path === f.c.path) throw new Error('injected cleanup failure');
        },
      }),
    );
  await assert.rejects(
    () => f.factory().advanceBookLoreFieldCleanup(f.uid, control(f, cancelled, 'cleanup-rollback')),
    /injected cleanup failure/,
  );
  assert.deepEqual([...f.records], before);
});

test('a large relation page is streamed without retaining descriptions in job metadata', async () => {
  const secret = 'PRIVATE_RELATION_DESCRIPTION',
    value = Array.from({ length: 64 }, (_, index) => ({
      targetEntityId: 'target-' + index,
      relationType: 'same',
      description: (secret + 'ðŸŒ™').repeat(1300),
    })),
    f = await setup({ target: { field: 'relations', page: 1, count: 64 }, value }),
    p = await sealAll(f, await uploadAll(f));
  assert.ok(p.byteLength > 1024 * 1024);
  assert.equal(p.nextIndex, f.prepared.manifest.chunkCount);
  const actual = await readSealedField(f, p);
  assert.equal(sha(JSON.stringify(actual)), sha(JSON.stringify(value)));
  for (const [path, record] of f.records)
    if (path.startsWith(f.c.path) && path !== f.c.stateRef.path)
      assert.equal(JSON.stringify(record).includes(secret), false);
  assert.equal(f.records.has(f.c.stateRef.path), false);
  assert.equal((await cancelAll(f, p)).phase, 'cancelled');
});

test('a receipt and anchor recreated together after the latest job state cannot confirm an old operation', async () => {
  const f = await setup(),
    start = await f.factory().startBookLoreFieldUpload(f.uid, f.intent),
    request = appendRequest(f, start),
    uploaded = (await f.factory().appendBookLoreFieldUpload(f.uid, request)).progress;
  await sealAll(f, uploaded);
  const receiptPath = f.c.path + '/operations/' + request.operationId,
    anchorPath = f.c.path + '/operationProofs/' + request.operationId,
    receipt = structuredClone(f.records.get(receiptPath)),
    anchor = structuredClone(f.records.get(anchorPath));
  await f.db.runTransaction(async (tx) => {
    tx.delete(f.db.doc(receiptPath));
    tx.delete(f.db.doc(anchorPath));
  });
  await f.db.runTransaction(async (tx) => {
    tx.create(f.db.doc(receiptPath), receipt);
    tx.create(f.db.doc(anchorPath), anchor);
  });
  await assert.rejects(() => f.factory().appendBookLoreFieldUpload(f.uid, request));
  assert.ok(f.records.has(headerPath(f)));
  assert.ok(f.records.has(partPath(f)));
});
