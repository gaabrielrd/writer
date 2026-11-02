import test from 'node:test';
import assert from 'node:assert/strict';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import {
  creationUploadFixture,
  creationCleanupControl,
  advanceParent,
  finishCreationUploads,
} from './helpers/bookLoreCreationUploadFixture.mjs';
import {
  uploadAll,
  sealAll,
  appendRequest,
  readSealedField,
} from './helpers/bookLoreFieldUploadFixture.mjs';
import { creationFixture } from './helpers/bookLoreCreationFixture.mjs';
import {
  bookLoreDeletionFixture,
  markBookDeleting,
  finishBookLoreDeletion,
} from './helpers/bookLoreDeletionFixture.mjs';
import {
  resourcePayloadBodyPath,
  resourcePayloadChunkPath,
} from '../src/bookResourcePayloadPaths.mjs';
import { createBookLoreReadService } from '../src/bookLoreRead.mjs';
import { loadCreationReservation } from '../src/bookLoreCreationStore.mjs';
import { advanceCreationCleanupInTransaction } from '../src/bookLoreCreationCleanup.mjs';
const setup = async (options) => {
  const d = adventureImportDb({ nativeUpdates: true }),
    f = await creationUploadFixture(d.db, options);
  return { ...d, ...f };
};
const content = (f) =>
  [...f.records.keys()].filter(
    (p) =>
      p.startsWith('books/' + f.bookId + '/bookResourceBodies/') ||
      p.startsWith('books/' + f.bookId + '/bookResourceChunks/'),
  );
const parentStep = (f, p) => advanceParent(f.parent, p);
const parentCancel = (f) =>
  f.parent.cancel('cancel-creation-with-uploads', f.parentProgress.jobToken);

test('creation fields are uploaded and sealed under a native binding without ever creating a source head', async () => {
  const f = await setup({ value: '\ufeffliteral 🌙\r\n'.repeat(12000) }),
    uploaded = await uploadAll(f),
    sealed = await sealAll(f, uploaded);
  assert.equal(f.records.get(f.c.path).inventoryVersion, 2);
  assert.equal(await readSealedField(f, sealed), f.value);
  assert.equal(f.records.has('books/book/lore/' + f.loreId), false);
  assert.equal(
    await createBookLoreReadService({ db: f.db }).getBookLoreRead(f.uid, {
      bookId: f.bookId,
      id: f.loreId,
    }),
    null,
  );
  assert.equal(Object.hasOwn(f.records.get('books/book'), 'localLoreVersion'), false);
  const binding = f.parent.c.path + '/uploads/' + f.uploadId;
  assert.deepEqual(f.metadata.get(binding), {
    ...f.metadata.get(f.c.path),
    updatedAtNanoseconds: f.metadata.get(binding).updatedAtNanoseconds,
  });
  assert.equal(
    f.metadata.get(binding).createdAtNanoseconds,
    f.metadata.get(f.c.path).createdAtNanoseconds,
  );
  const metadata = JSON.stringify([...f.records].filter(([p]) => p.startsWith(f.parent.c.path)));
  assert.equal(metadata.includes('literal'), false);
  const done = await finishCreationUploads(f.parent, await parentCancel(f));
  assert.equal(done.completedUploads, 1);
  assert.equal(content(f).length, 0);
  assert.equal(f.records.get(f.c.path).phase, 'cancelled');
  assert.equal(f.records.has(f.parent.c.reservationPath), true);
});
test('relation pages retain exact ordered entries and privacy values are certified by the existing parser', async () => {
  const value = [
      { targetEntityId: 'target', relationType: 'knows', description: '\ufeffMoon 🌙' },
      { targetEntityId: 'target', relationType: 'knows', description: '' },
    ],
    f = await setup({ target: { field: 'relations', page: 0, count: 2 }, value }),
    p = await sealAll(f, await uploadAll(f));
  assert.deepEqual(await readSealedField(f, p), value);
  await finishCreationUploads(f.parent);
  assert.equal(content(f).length, 0);
});
test('cancel before the first byte removes SHA state and keeps immutable child bindings and leases', async () => {
  const f = await setup(),
    p = await f.factory().startBookLoreFieldUpload(f.uid, f.intent),
    binding = f.parent.c.path + '/uploads/' + f.uploadId;
  assert.equal(p.nextIndex, 0);
  assert.equal(f.records.has(f.c.stateRef.path), true);
  const requested = await parentCancel(f);
  assert.equal(requested.phase, 'cancelling');
  const done = await finishCreationUploads(f.parent, requested);
  assert.equal(done.phase, 'cancelled');
  assert.equal(f.records.has(f.c.stateRef.path), false);
  assert.equal(f.records.has(binding), true);
  assert.equal(content(f).length, 0);
  assert.ok([...f.records.keys()].some((p) => p.includes('/bookResourceLeases/')));
});
test('cancel request blocks new starts, appends, seals and sealed reads without erasing historical receipts', async () => {
  const f = await setup({ value: 'x'.repeat(200000) }),
    p = await f.factory().startBookLoreFieldUpload(f.uid, f.intent),
    r = appendRequest(f, p),
    first = await f.factory().appendBookLoreFieldUpload(f.uid, r);
  const requested = await parentCancel(f),
    before = structuredClone([...f.records]);
  await assert.rejects(() =>
    f.factory().appendBookLoreFieldUpload(f.uid, appendRequest(f, first.progress)),
  );
  const next = await creationUploadFixture(f.db, {
    parent: f.parent,
    uploadId: 'creation-field-next',
  });
  await assert.rejects(() => next.factory().startBookLoreFieldUpload(next.uid, next.intent));
  const replay = await f.factory().appendBookLoreFieldUpload(f.uid, r);
  assert.deepEqual(replay.receipt, first.receipt);
  assert.deepEqual([...f.records], before);
  const done = await finishCreationUploads(f.parent, requested);
  assert.equal(done.completedUploads, 1);
  assert.equal(content(f).length, 0);
});
test('already sealed creation fields lose read authority immediately after a cancel request', async () => {
  const f = await setup(),
    sealed = await sealAll(f, await uploadAll(f));
  assert.equal(await readSealedField(f, sealed), f.value);
  const p = await parentCancel(f);
  await assert.rejects(() => readSealedField(f, sealed));
  await finishCreationUploads(f.parent, p);
  assert.equal(content(f).length, 0);
});
test('several fields share a parent, preserve another creation and count each terminal child once', async () => {
  const a = await setup({ target: { field: 'name' }, value: 'Name' }),
    b = await creationUploadFixture(a.db, {
      parent: a.parent,
      uploadId: 'category-upload',
      target: { field: 'category' },
      value: 'other',
    }),
    other = await creationUploadFixture(a.db, {
      creationId: 'another-creation-operation',
      uploadId: 'other-upload',
      value: 'KEEP',
    });
  await sealAll(a, await uploadAll(a));
  await sealAll(b, await uploadAll(b));
  const otherP = await sealAll(other, await uploadAll(other)),
    before = structuredClone(a.records.get(other.c.path));
  const done = await finishCreationUploads(a.parent);
  assert.equal(done.completedUploads, 2);
  assert.deepEqual(a.records.get(other.c.path), before);
  assert.equal(await readSealedField(other, otherP), 'KEEP');
  assert.equal((await other.parent.get()).phase, 'preparing');
  await finishCreationUploads(other.parent);
});
for (const change of ['owner', 'deleting', 'absent'])
  test(
    'private cleanup survives ' + change + ' after revocation without reauthorizing source',
    async () => {
      const f = await setup({ value: 'x'.repeat(100000) });
      await uploadAll(f);
      const p = await parentCancel(f);
      await f.db.runTransaction(async (tx) =>
        change === 'absent'
          ? tx.delete(f.db.doc('books/book'))
          : tx.update(
              f.db.doc('books/book'),
              change === 'owner' ? { authorId: 'other' } : { deleting: true },
            ),
      );
      await finishCreationUploads(f.parent, p);
      assert.equal(content(f).length, 0);
    },
  );
test('other lore clocks can advance while the same native creation source remains authorized', async () => {
  const f = await setup({ value: 'x'.repeat(100000) }),
    p = await f.factory().startBookLoreFieldUpload(f.uid, f.intent);
  await f.db.runTransaction(async (tx) =>
    tx.update(f.db.doc('books/book'), { localLoreVersion: 2 }),
  );
  const done = await sealAll(f, await uploadAll(f, p));
  assert.equal(await readSealedField(f, done), f.value);
  await finishCreationUploads(f.parent);
});
for (const artifact of [
  'context',
  'marker',
  'binding',
  'binding-proof',
  'job',
  'lease',
  'part',
  'header',
  'cancel-request',
  'cleanup-state',
  'cleanup-event',
])
  test('recreated ' + artifact + ' cannot be assimilated into a creation cleanup', async () => {
    const f = await setup();
    await sealAll(f, await uploadAll(f));
    await parentCancel(f);
    const body = f.prepared.manifest.bodyId,
      path =
        artifact === 'context'
          ? f.parent.c.path
          : artifact === 'marker'
            ? f.parent.c.reservationPath
            : artifact === 'binding'
              ? f.parent.c.path + '/uploads/' + f.uploadId
              : artifact === 'binding-proof'
                ? f.parent.c.path + '/uploadProofs/' + f.uploadId
                : artifact === 'job'
                  ? f.c.path
                  : artifact === 'lease'
                    ? 'books/book/bookResourceLeases/' + body
                    : artifact === 'part'
                      ? resourcePayloadChunkPath('book', body, 0)
                      : artifact === 'header'
                        ? resourcePayloadBodyPath('book', body)
                        : artifact === 'cancel-request'
                          ? f.parent.c.path + '/cancelRequests/current'
                          : artifact === 'cleanup-state'
                            ? f.parent.c.path + '/cleanup/current'
                            : f.parent.c.path + '/cleanupEvents/0000000000000000',
      value = structuredClone(f.records.get(path));
    await f.db.runTransaction(async (tx) => tx.delete(f.db.doc(path)));
    await f.db.runTransaction(async (tx) => tx.create(f.db.doc(path), value));
    await assert.rejects(async () => finishCreationUploads(f.parent, await f.parent.get()));
    assert.equal(f.records.has(path), true);
    assert.equal(f.records.has('books/book/lore/' + f.loreId), false);
  });
test('unknown lease and unbound upload metadata are preserved and prevent a terminal cancellation', async () => {
  for (const kind of ['lease', 'upload']) {
    const f = await setup();
    await uploadAll(f);
    const path =
        kind === 'lease'
          ? 'books/book/bookResourceLeases/unknown'
          : 'users/author/bookLoreFieldUploads/unknown',
      value =
        kind === 'lease'
          ? { loreId: f.loreId, uploadId: 'missing', startHash: 'a'.repeat(64) }
          : { context: { loreId: f.loreId }, startHash: 'a'.repeat(64) };
    await f.db.runTransaction(async (tx) => tx.create(f.db.doc(path), value));
    await assert.rejects(() => finishCreationUploads(f.parent));
    assert.deepEqual(f.records.get(path), value);
    assert.equal((await f.parent.get()).phase, 'cancelling');
  }
});
test('a recreated book incarnation cannot be cleared through the previous native creation', async () => {
  const f = await setup();
  await uploadAll(f);
  const p = await parentCancel(f),
    root = structuredClone(f.records.get('books/book'));
  await f.db.runTransaction(async (tx) => tx.delete(f.db.doc('books/book')));
  await f.db.runTransaction(async (tx) => tx.create(f.db.doc('books/book'), root));
  await assert.rejects(() => finishCreationUploads(f.parent, p));
  assert.ok(content(f).length > 0);
});
test('binding, job, lease and SHA roll back together if upload start fails', async () => {
  const f = await setup(),
    before = structuredClone([...f.records]),
    run = f.db.runTransaction.bind(f.db);
  f.db.runTransaction = (fn) =>
    run((tx) =>
      fn({
        ...tx,
        create(ref, v) {
          tx.create(ref, v);
          if (ref.path === f.c.path) throw Error('injected creation upload start');
        },
      }),
    );
  await assert.rejects(
    () => f.factory().startBookLoreFieldUpload(f.uid, f.intent),
    /injected creation upload start/,
  );
  assert.deepEqual([...f.records], before);
  f.db.runTransaction = run;
  await uploadAll(f);
  await finishCreationUploads(f.parent);
});
test('child cleanup and parent checkpoint roll back together, and same-request retry advances once', async () => {
  const f = await setup({ value: 'x'.repeat(200000) });
  await uploadAll(f);
  let p = await parentCancel(f);
  p = (await parentStep(f, p)).progress;
  const before = structuredClone([...f.records]),
    run = f.db.runTransaction.bind(f.db);
  f.db.runTransaction = (fn) =>
    run((tx) =>
      fn({
        ...tx,
        update(ref, v) {
          tx.update(ref, v);
          if (ref.path === f.parent.c.path + '/cleanup/current')
            throw Error('injected parent checkpoint');
        },
      }),
    );
  await assert.rejects(() => parentStep(f, p), /injected parent checkpoint/);
  assert.deepEqual([...f.records], before);
  f.db.runTransaction = run;
  const r = creationCleanupControl(f.parent, p),
    api = f.parent.factory(),
    [a, b] = await Promise.all([
      api.advanceBookLoreCreationCleanup(f.uid, r),
      api.advanceBookLoreCreationCleanup(f.uid, r),
    ]);
  assert.deepEqual(a.receipt, b.receipt);
  assert.equal(a.progress.cleanupRevision, p.cleanupRevision + 1);
  await assert.rejects(() =>
    api.advanceBookLoreCreationCleanup(f.uid, { ...r, operationId: 'stale-creation-cleanup' }),
  );
  const done = await finishCreationUploads(f.parent, a.progress),
    old = await api.advanceBookLoreCreationCleanup(f.uid, r);
  assert.deepEqual(old.receipt, a.receipt);
  assert.deepEqual(old.progress, done);
});
test('whole-book deletion drains creation uploads and completes the parent without recreating either root', async () => {
  const f = await setup({ value: 'x'.repeat(200000) });
  await uploadAll(f);
  const book = bookLoreDeletionFixture(f.db);
  await markBookDeleting(book);
  await finishBookLoreDeletion(book);
  assert.equal(f.records.has('books/book'), false);
  assert.equal(content(f).length, 0);
  const done = await f.parent.get();
  assert.equal(done.phase, 'cancelled');
  assert.equal(done.completedUploads, 1);
  assert.deepEqual(await f.parent.start(), done);
  assert.equal(f.records.has(f.parent.c.reservationPath), true);
});
test('large creation fields exceed 128 parts and cleanup deletes at most 16 parts with the header last', async () => {
  const f = await setup({ value: '🌙'.repeat(2300000) }),
    sealed = await sealAll(f, await uploadAll(f)),
    count = f.prepared.manifest.chunkCount,
    header = resourcePayloadBodyPath('book', f.prepared.manifest.bodyId);
  assert.ok(count > 128);
  let p = await parentCancel(f),
    before = count;
  for (let i = 0; i < 10000 && p.phase !== 'cancelled'; i++) {
    p = (await parentStep(f, p)).progress;
    const current = [...f.records.keys()].filter((path) =>
      path.startsWith('books/book/bookResourceChunks/'),
    ).length;
    assert.ok(before - current >= 0 && before - current <= 16);
    if (current) assert.equal(f.records.has(header), true);
    before = current;
  }
  assert.equal(p.phase, 'cancelled');
  assert.equal(content(f).length, 0);
  assert.equal(sealed.prepared, true);
  assert.ok(
    f.metadataReads
      .filter((r) => r.path.includes('/bookResourceChunks/'))
      .every((r) => !r.fields.includes('bytes') && !r.fields.includes('proof')),
  );
});
test('a forged creator reference, foreign lore ID or missing parent cannot start an upload', async () => {
  const f = await setup();
  for (const intent of [
    {
      ...f.intent,
      creation: { ...f.intent.creation, jobToken: 'a'.repeat(64) },
      sourceToken: 'a'.repeat(64),
    },
    { ...f.intent, creation: { ...f.intent.creation, startHash: 'a'.repeat(64) } },
  ])
    await assert.rejects(() => f.factory().startBookLoreFieldUpload(f.uid, intent));
  const other = creationFixture(f.db, { creationId: 'another-creation-id' });
  await other.start();
  await assert.rejects(() => f.factory().startBookLoreFieldUpload('other', f.intent));
  assert.equal(f.records.has(f.c.path), false);
});

test('a valid manifest for another derived lore ID or a missing native parent cannot be borrowed', async () => {
  const f = await setup(),
    other = await creationUploadFixture(f.db, {
      creationId: 'foreign-creation-reference',
      uploadId: 'foreign-field-manifest',
    });
  await assert.rejects(() =>
    f.factory().startBookLoreFieldUpload(f.uid, {
      ...other.intent,
      creation: f.intent.creation,
      sourceToken: f.intent.sourceToken,
    }),
  );
  await assert.rejects(() =>
    f.factory().startBookLoreFieldUpload(f.uid, {
      ...f.intent,
      creation: { ...f.intent.creation, creationId: 'missing-creation-parent' },
    }),
  );
  assert.equal(f.records.has(f.c.path), false);
  assert.equal(f.records.has(other.c.path), false);
});
test('orphan initial cancel proofs cannot reopen starts after the visible cancel documents are lost', async () => {
  const f = await setup({ value: 'x'.repeat(100000) });
  await uploadAll(f);
  await parentCancel(f);
  await f.db.runTransaction(async (tx) => {
    for (const path of [
      '/cancelRequests/current',
      '/cancelRequestProofs/current',
      '/cleanup/current',
    ])
      tx.delete(f.db.doc(f.parent.c.path + path));
  });
  await assert.rejects(() => f.parent.get());
  const other = await creationUploadFixture(f.db, {
    creationId: 'independent-after-orphan',
    uploadId: 'independent-upload',
  });
  await uploadAll(other);
  assert.equal((await other.parent.get()).phase, 'preparing');
  await finishCreationUploads(other.parent);
});

test('native cleanup records reject copied DTOs and reuse in another transaction', async () => {
  const f = await setup();
  await uploadAll(f);
  const p = await parentCancel(f),
    r = creationCleanupControl(f.parent, p);
  let l;
  await f.db.runTransaction(async (tx) => {
    l = await loadCreationReservation(tx, f.parent.c, { jobToken: p.jobToken });
    await assert.rejects(() => advanceCreationCleanupInTransaction(tx, { ...l }, r));
  });
  await f.db.runTransaction(async (tx) =>
    assert.rejects(() => advanceCreationCleanupInTransaction(tx, l, r)),
  );
  const done = await finishCreationUploads(f.parent, p);
  assert.equal(done.completedUploads, 1);
});
test('an unbound payload header stays intact and prevents claiming terminal creation cleanup', async () => {
  const f = await setup();
  await uploadAll(f);
  const path = 'books/book/bookResourceBodies/unknown-unbound',
    value = {
      ownerId: f.uid,
      bookId: f.bookId,
      resource: { kind: 'lore', parentId: null, id: f.loreId },
    };
  await f.db.runTransaction(async (tx) => tx.create(f.db.doc(path), value));
  await assert.rejects(() => finishCreationUploads(f.parent));
  assert.deepEqual(f.records.get(path), value);
  assert.equal((await f.parent.get()).phase, 'cancelling');
});
