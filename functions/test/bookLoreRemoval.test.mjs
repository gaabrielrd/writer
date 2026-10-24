import test from 'node:test';
import assert from 'node:assert/strict';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import {
  removalFixture,
  removalControl,
  finishRemoval,
} from './helpers/bookLoreRemovalFixture.mjs';
import { adoptionFixture, adoptFixture } from './helpers/bookLoreEditAdoptionFixture.mjs';
import {
  compilationFixture,
  advanceCompilation,
} from './helpers/bookLoreEditCompilationFixture.mjs';
import {
  sourceInspectionFixture,
  inspectionControl,
} from './helpers/bookLoreSourceInspectionFixture.mjs';
import { fieldUploadFixture, uploadAll } from './helpers/bookLoreFieldUploadFixture.mjs';
import { getEditReservation } from './helpers/bookLoreEditReservationFixture.mjs';
import { seedBookLoreRead } from './helpers/bookLoreReadFixture.mjs';
import {
  bookLoreDeletionFixture,
  markBookDeleting,
  finishBookLoreDeletion,
} from './helpers/bookLoreDeletionFixture.mjs';
import { resourcePayloadChunkPath } from '../src/bookResourcePayloadPaths.mjs';
import { createBookLoreReadService } from '../src/bookLoreRead.mjs';
import { loadBookLoreRemoval, openBookLoreRemovalCleanup } from '../src/bookLoreRemovalStore.mjs';
import { removalPaths } from '../src/bookLoreRemovalContracts.mjs';
import { assertLoreCleanupOpening } from '../src/bookLoreCleanupScope.mjs';
import { createBookLoreResourceInventoryService } from '../src/bookLoreResourceInventory.mjs';
const state = (f) => f.records.get(f.path + '/state/current').cleanup;
async function fixture(options = {}) {
  const d = adventureImportDb({ nativeUpdates: true }),
    f = await removalFixture(d.db, options);
  return { ...d, ...f };
}
async function adopted(options = {}) {
  const d = adventureImportDb({ nativeUpdates: true }),
    base = await adoptionFixture(d.db, { mode: 'inline', ...options });
  await adoptFixture(base);
  const source = await sourceInspectionFixture(d.db, {
      inspectionId: 'removal-inspection',
      existingSeed: base.source.seed,
    }),
    f = await removalFixture(d.db, { source });
  return { ...d, ...f, adopted: base };
}
async function until(f, condition) {
  let p = await f.start();
  for (let i = 0; i < 10000 && !condition(state(f)); i++) p = (await f.step(p)).progress;
  assert.ok(condition(state(f)));
  return p;
}
const contentPaths = (f) =>
  [...f.records.keys()].filter((p) =>
    ['lore', 'bookLoreSegments', 'bookResourceBodies', 'bookResourceChunks'].some((n) =>
      p.startsWith('books/' + f.bookId + '/' + n + '/'),
    ),
  );
for (const mode of ['inline', 'v1', 'v2'])
  test(
    'remove ' + mode + ' lore with a permanent native tombstone, preserving the book and replay',
    async () => {
      const f = await fixture({ mode }),
        before = f.records.get('books/book').localLoreVersion,
        p = await f.start(),
        context = f.records.get(f.path);
      assert.equal(p.removed, true);
      assert.equal(f.records.has(f.source.seed.path), false);
      assert.equal(f.records.get('books/book').localLoreVersion, before + 1);
      for (const path of [f.path + '/state/current', f.tombstonePath]) {
        assert.deepEqual(f.metadata.get(path), f.metadata.get(f.path));
      }
      const done = await finishRemoval(f, p);
      assert.equal(done.complete, true);
      assert.deepEqual(contentPaths(f), []);
      assert.equal(f.records.has('books/book'), true);
      assert.equal(f.records.get('books/book').localLoreVersion, before + 1);
      assert.deepEqual(await f.start(), done);
      assert.deepEqual(f.records.get(f.path), context);
    },
  );
for (const privacy of [undefined, false, true])
  test(
    'logical privacy ' +
      String(privacy) +
      ' determines publication revocation without a visual default',
    async () => {
      const f = await fixture({
        data: {
          name: 'N',
          category: 'other',
          ...(privacy === undefined ? {} : { isPublic: privacy }),
          createdAt: 1000,
          updatedAt: 5000,
        },
      });
      await f.db.runTransaction(async (tx) => {
        tx.update(f.db.doc('books/book'), {
          status: 'published',
          createdAt: 500,
          updatedAt: 6000,
          publicationPrivacyVersion: 4,
        });
        tx.create(f.db.doc('publicBooks/book'), { revisionId: 'old' });
      });
      await f.start();
      const book = f.records.get('books/book');
      assert.equal(book.createdAt, 500);
      assert.equal(book.updatedAt, 6001);
      assert.equal(book.status, privacy === true ? 'draft' : 'published');
      assert.equal(book.publicationPrivacyVersion, privacy === true ? 5 : 4);
      assert.equal(f.records.has('publicBooks/book'), privacy !== true);
    },
  );
test('adopted generations and leases become historical fences while all assigned bytes are cleaned', async () => {
  const f = await adopted(),
    parentPath = f.adopted.c.path;
  await finishRemoval(f);
  assert.equal((await getEditReservation(f.adopted)).phase, 'adopted');
  assert.equal(contentPaths(f).length, 0);
  assert.ok([...f.records.keys()].some((p) => p.includes('/bookResourceLeases/')));
  assert.ok([...f.records.keys()].some((p) => p.includes('/bookResourceInventory/')));
  assert.equal(f.records.has(parentPath), true);
});
test('partial inline work, standalone upload and pending source inspection are cancelled after head withdrawal', async () => {
  const d = adventureImportDb({ nativeUpdates: true }),
    base = await compilationFixture(d.db, {
      mode: 'inline',
      changes: [],
      removals: ['summary'],
      sourceOptions: { data: { name: 'N', category: 'other', details: 'x'.repeat(100000) } },
    });
  let p = base.progress;
  for (let i = 0; i < 1000; i++) {
    const w = d.records.get(base.c.path).compilation?.inlineWork,
      child = w ? d.records.get('users/author/bookLoreFieldUploads/' + w.uploadId) : null;
    if (w?.target.field === 'details' && child?.nextIndex > 0 && child.phase === 'uploading') break;
    p = (await advanceCompilation(base, p)).progress;
  }
  const ordinary = await fieldUploadFixture(d.db, { loreId: 'extra', uploadId: 'ordinary-upload' });
  await uploadAll(ordinary);
  const pending = await sourceInspectionFixture(d.db, {
      inspectionId: 'pending-source',
      existingSeed: base.source.seed,
    }),
    started = await pending.factory().startBookLoreSourceInspection(pending.uid, pending.intent);
  await pending
    .factory()
    .advanceBookLoreSourceInspection(pending.uid, inspectionControl(pending, started));
  const source = await sourceInspectionFixture(d.db, {
      inspectionId: 'removal-inspection',
      existingSeed: base.source.seed,
    }),
    f = { ...d, ...(await removalFixture(d.db, { source })) };
  // A standalone upload for the same source, without creating a replacement head.
  const extraPath = ordinary.c.path,
    originalExtra = structuredClone(d.records.get(extraPath));
  await finishRemoval(f);
  assert.equal((await getEditReservation(base)).phase, 'cancelled');
  assert.equal(d.records.get(pending.c.path).phase, 'cancelled');
  assert.equal(d.records.has(pending.c.stateRef.path), false);
  assert.deepEqual(d.records.get(extraPath), originalExtra);
  assert.equal(d.records.has('books/book/lore/extra'), true);
});
test('a standalone upload for the withdrawn source is cancelled with its payload', async () => {
  const d = adventureImportDb({ nativeUpdates: true }),
    upload = await fieldUploadFixture(d.db, { value: 'x'.repeat(100000) });
  await uploadAll(upload);
  const source = await sourceInspectionFixture(d.db, {
      mode: 'inline',
      inspectionId: 'removal-inspection',
      existingSeed: {
        uid: upload.uid,
        bookId: upload.bookId,
        id: upload.loreId,
        path: 'books/book/lore/entity',
        bookPath: 'books/book',
      },
    }),
    f = { ...d, ...(await removalFixture(d.db, { source })) };
  await finishRemoval(f);
  assert.equal(d.records.get(upload.c.path).phase, 'cancelled');
  assert.equal(contentPaths(f).length, 0);
});
test('another lore and preparations born after the removal cutoff remain untouched', async () => {
  const f = await adopted();
  await f.start();
  const other = await fieldUploadFixture(f.db, {
    loreId: 'another',
    uploadId: 'another-upload',
    value: 'x'.repeat(100000),
  });
  await uploadAll(other);
  const kept = structuredClone(
    [...f.records].filter(([p]) => p.startsWith(other.c.path) || p === 'books/book/lore/another'),
  );
  await finishRemoval(f);
  for (const [path, value] of kept) assert.deepEqual(f.records.get(path), value);
  assert.ok([...f.records.keys()].some((p) => p.startsWith('books/book/bookResourceChunks/')));
});
test('legacy source above 128 parts is collected by metadata batches, keeping the header last', async () => {
  const f = await fixture({
      mode: 'v1',
      data: { name: 'N', category: 'other', details: '🌙'.repeat(2300000) },
    }),
    header = f.source.seed.base.path,
    count = f.source.seed.base.prepared.manifest.chunkCount;
  assert.ok(count > 128);
  let p = await f.start(),
    before = count;
  for (let i = 0; i < 1000 && !p.complete; i++) {
    p = (await f.step(p)).progress;
    const parts = [...f.records.keys()].filter((path) =>
      path.startsWith('books/book/bookResourceChunks/'),
    ).length;
    assert.ok(before - parts <= 16);
    if (parts) assert.equal(f.records.has(header), true);
    before = parts;
  }
  assert.equal(p.complete, true);
  assert.equal(contentPaths(f).length, 0);
  const reads = f.metadataReads.filter((r) => r.path.includes('/bookResourceChunks/'));
  assert.ok(reads.length > 128);
  assert.ok(reads.every((r) => !r.fields.includes('bytes') && !r.fields.includes('proof')));
});
for (const artifact of ['book', 'context', 'state', 'tombstone', 'body', 'part', 'inventory'])
  test('recreated ' + artifact + ' does not inherit the original removal capability', async () => {
    const f = await adopted();
    await until(f, (s) => s.phase === 'bodies' && s.body !== null);
    const b = state(f).body,
      path =
        artifact === 'book'
          ? 'books/book'
          : artifact === 'context'
            ? f.path
            : artifact === 'state'
              ? f.path + '/state/current'
              : artifact === 'tombstone'
                ? f.tombstonePath
                : artifact === 'body'
                  ? 'books/book/bookResourceBodies/' + b.bodyId
                  : artifact === 'inventory'
                    ? 'books/book/bookResourceInventory/' + b.bodyId
                    : resourcePayloadChunkPath('book', b.bodyId, b.index),
      value = structuredClone(f.records.get(path)),
      p = await f.get();
    await f.db.runTransaction(async (tx) => tx.delete(f.db.doc(path)));
    await f.db.runTransaction(async (tx) => tx.create(f.db.doc(path), value));
    await assert.rejects(() => f.step(p));
    assert.equal(f.records.has(path), true);
    assert.equal(f.records.has('books/book'), true);
  });
test('start rollback preserves head, root, public access and leaves no tombstone or job', async () => {
  const f = await fixture({ data: { name: 'N', category: 'other', isPublic: true } }),
    before = structuredClone([...f.records]),
    run = f.db.runTransaction.bind(f.db);
  f.db.runTransaction = (fn) =>
    run((tx) =>
      fn({
        ...tx,
        update(ref, v) {
          tx.update(ref, v);
          if (ref.path === 'books/book') throw Error('injected start failure');
        },
      }),
    );
  await assert.rejects(() => f.start(), /injected start failure/);
  assert.deepEqual([...f.records], before);
  f.db.runTransaction = run;
  await finishRemoval(f);
  assert.equal(contentPaths(f).length, 0);
});
test('cleanup rollback keeps bytes, inventory and receipt/checkpoint together', async () => {
  const f = await adopted(),
    p = await until(f, (s) => s.phase === 'bodies' && s.body !== null),
    before = structuredClone([...f.records]),
    run = f.db.runTransaction.bind(f.db);
  f.db.runTransaction = (fn) =>
    run((tx) =>
      fn({
        ...tx,
        update(ref, v) {
          tx.update(ref, v);
          if (ref.path === f.path + '/state/current') throw Error('injected cleanup failure');
        },
      }),
    );
  await assert.rejects(() => f.step(p), /injected cleanup failure/);
  assert.deepEqual([...f.records], before);
  f.db.runTransaction = run;
  await finishRemoval(f, p);
  assert.equal(contentPaths(f).length, 0);
});
test('CAS, concurrent same-request retry and historical receipts do not advance twice', async () => {
  const f = await fixture(),
    p = await f.start(),
    r = removalControl(f, p),
    [a, b] = await Promise.all([
      f.removalFactory().advanceBookLoreRemoval(f.uid, r),
      f.removalFactory().advanceBookLoreRemoval(f.uid, r),
    ]);
  assert.deepEqual(a.receipt, b.receipt);
  assert.equal(state(f).revision, 1);
  await assert.rejects(() =>
    f.removalFactory().advanceBookLoreRemoval(f.uid, { ...r, operationId: 'stale-removal-step' }),
  );
  const done = await finishRemoval(f, a.progress),
    replay = await f.removalFactory().advanceBookLoreRemoval(f.uid, r);
  assert.deepEqual(replay.receipt, a.receipt);
  assert.deepEqual(replay.progress, done);
});
test('whole-book deletion takes over native removal cleanup and resolves it after root removal', async () => {
  const f = await adopted(),
    p = await until(f, (s) => s.phase === 'bodies' && s.body !== null),
    book = bookLoreDeletionFixture(f.db);
  await markBookDeleting(book);
  await assert.rejects(() => f.step(p));
  for (let i = 0; i < 1000 && !f.records.get(f.path + '/state/current').handoff; i++)
    await book.step();
  assert.equal((await f.get()).phase, 'handed-off');
  assert.equal((await f.get()).complete, false);
  await finishBookLoreDeletion(book);
  const done = await f.get();
  assert.equal(done.complete, true);
  assert.equal(contentPaths(f).length, 0);
  assert.equal(f.records.has('books/book'), false);
  assert.deepEqual(await f.start(), done);
  assert.equal(f.records.has(f.tombstonePath), true);
});
test('a recreated whole-book handoff context cannot confirm cleanup of the original removal', async () => {
  const f = await adopted(),
    book = bookLoreDeletionFixture(f.db);
  await f.start();
  await markBookDeleting(book);
  await finishBookLoreDeletion(book);
  const path = 'users/author/bookLoreDeletions/book',
    value = structuredClone(f.records.get(path));
  await f.db.runTransaction(async (tx) => tx.delete(f.db.doc(path)));
  await f.db.runTransaction(async (tx) => tx.create(f.db.doc(path), value));
  await assert.rejects(() => f.get());
  assert.equal(f.records.has('books/book'), false);
});
test('a recreated head is preserved and rejected by both cleanup and full readers', async () => {
  const f = await fixture(),
    old = structuredClone(f.records.get(f.source.seed.path)),
    p = await f.start();
  await f.db.runTransaction(async (tx) => tx.create(f.db.doc(f.source.seed.path), old));
  await assert.rejects(() => f.step(p));
  await assert.rejects(() =>
    createBookLoreReadService({ db: f.db }).getBookLoreRead(f.uid, {
      bookId: f.bookId,
      id: f.loreId,
    }),
  );
  assert.deepEqual(f.records.get(f.source.seed.path), old);
});
test('source edit after inspection blocks start and preserves the active head', async () => {
  const f = await fixture();
  await f.db.runTransaction(async (tx) =>
    tx.update(f.db.doc(f.source.seed.path), { summary: 'changed' }),
  );
  await assert.rejects(() => f.start());
  assert.equal(f.records.has(f.tombstonePath), false);
  assert.equal(f.records.has(f.path), false);
});
for (const [key, value] of [
  ['localLoreVersion', Number.MAX_SAFE_INTEGER],
  ['publicationPrivacyVersion', Number.MAX_SAFE_INTEGER],
  ['publicationPrivacyVersion', '1'],
  ['updatedAt', Number.MAX_SAFE_INTEGER],
])
  test(
    'invalid/exhausted ' + key + ' ' + String(value) + ' cannot partially withdraw a source',
    async () => {
      const f = await fixture({ data: { name: 'N', category: 'other', isPublic: true } });
      await f.db.runTransaction(async (tx) => tx.update(f.db.doc('books/book'), { [key]: value }));
      // Root version changes invalidate the earlier inspection as well; either invariant must stop all writes.
      await assert.rejects(() => f.start());
      assert.equal(f.records.has(f.source.seed.path), true);
      assert.equal(f.records.has(f.tombstonePath), false);
    },
  );
test('an unknown lease preserves the legacy payload and prevents completion', async () => {
  const f = await fixture({ mode: 'v1' }),
    id = f.source.seed.base.prepared.manifest.bodyId;
  await f.db.runTransaction(async (tx) =>
    tx.create(f.db.doc('books/book/bookResourceLeases/' + id), { phase: 'retired' }),
  );
  await assert.rejects(() => finishRemoval(f));
  assert.equal(f.records.has(f.source.seed.base.path), true);
  assert.equal(f.records.has(resourcePayloadChunkPath('book', id, 0)), true);
  assert.equal(state(f).complete, false);
});
test('native individual cleanup openings reject cloned DTOs and another transaction', async () => {
  const f = await fixture(),
    p = await f.start();
  let l;
  await f.db.runTransaction(async (tx) => {
    l = await loadBookLoreRemoval(tx, removalPaths(f.db, f.uid, f.intent.removalId), {
      startHash: f.startHash,
      jobToken: p.jobToken,
    });
    await openBookLoreRemovalCleanup(tx, l);
    assertLoreCleanupOpening(tx, l);
    assert.throws(() => assertLoreCleanupOpening(tx, { ...l }));
  });
  await f.db.runTransaction(async (tx) => assert.throws(() => assertLoreCleanupOpening(tx, l)));
});

test('retired relation pages from multiple generations are removed without touching another lore', async () => {
  const relations = Array.from({ length: 65 }, (_, i) => ({
      targetEntityId: 'target-' + i,
      relationType: 'knows',
    })),
    f = await adopted({
      mode: 'v1',
      sourceOptions: { data: { name: 'N', category: 'other', relations } },
      relations: { present: true, count: 65 },
    });
  await seedBookLoreRead(f.db, {
    id: 'preserved',
    inline: true,
    data: { name: 'Other', category: 'other', details: 'own' },
  });
  await finishRemoval(f);
  assert.deepEqual(f.records.get('books/book/lore/preserved'), {
    bookId: 'book',
    name: 'Other',
    category: 'other',
    details: 'own',
  });
  assert.equal(
    [...f.records.keys()].some((p) => p.startsWith('books/book/bookLoreSegments/')),
    false,
  );
});

test('a recreated descriptor is preserved and blocks scoped cleanup', async () => {
  const relations = [{ targetEntityId: 'target', relationType: 'knows' }],
    f = await fixture({ mode: 'v1', data: { name: 'N', category: 'other', relations } });
  const p = await until(f, (s) => s.phase === 'segments'),
    path = f.source.seed.segments[0].path,
    value = structuredClone(f.records.get(path));
  await f.db.runTransaction(async (tx) => tx.delete(f.db.doc(path)));
  await f.db.runTransaction(async (tx) => tx.create(f.db.doc(path), value));
  await assert.rejects(() => f.step(p));
  assert.deepEqual(f.records.get(path), value);
});

test('an extra part on a known body prevents header removal', async () => {
  const f = await fixture({ mode: 'v1' }),
    base = f.source.seed.base,
    id = base.prepared.manifest.bodyId,
    index = base.prepared.manifest.chunkCount;
  await f.db.runTransaction(async (tx) =>
    tx.create(f.db.doc(resourcePayloadChunkPath('book', id, index)), {
      schemaVersion: 1,
      ownerId: 'author',
      bookId: 'book',
      bodyId: id,
      index,
    }),
  );
  await assert.rejects(() => finishRemoval(f));
  assert.equal(f.records.has(base.path), true);
});

test('another owner and unknown request fields cannot claim a removal', async () => {
  const f = await fixture();
  await assert.rejects(() => f.removalFactory().startBookLoreRemoval('other', f.intent));
  await assert.rejects(() =>
    f.removalFactory().startBookLoreRemoval(f.uid, { ...f.intent, grant: true }),
  );
  assert.equal(f.records.has(f.tombstonePath), false);
  const p = await f.start();
  assert.equal(
    await f.removalFactory().getBookLoreRemoval('other', {
      removalId: f.intent.removalId,
      startHash: f.startHash,
      jobToken: p.jobToken,
    }),
    null,
  );
  await assert.rejects(() =>
    f.removalFactory().startBookLoreRemoval(f.uid, { ...f.intent, sourceToken: 'a'.repeat(64) }),
  );
  assert.equal(f.records.get('books/book').localLoreVersion, 1);
});

test('generic collector defers to the permanent individual-removal fence', async () => {
  const f = await adopted(),
    path = [...f.records.keys()].find((p) => /^books\/book\/bookResourceInventory\/[^/]+$/.test(p)),
    bodyId = path.split('/').at(-1),
    api = createBookLoreResourceInventoryService({ db: f.db }),
    request = { bookId: f.bookId, bodyId };
  assert.equal((await api.collectBookLoreInventoryBody(f.uid, request)).reason, 'active-head');
  await f.start();
  const before = structuredClone([...f.records]);
  assert.equal((await api.collectBookLoreInventoryBody(f.uid, request)).reason, 'lore-removal');
  assert.deepEqual([...f.records], before);
  await finishRemoval(f);
  assert.equal(contentPaths(f).length, 0);
});
