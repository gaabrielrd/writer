import test from 'node:test';
import assert from 'node:assert/strict';
import { createBookRestoreUploadService } from '../src/bookRestoreUpload.mjs';
import {
  BOOK_RESTORE_METHODS,
  requestHash,
  mutationInput,
} from '../src/bookRestoreUploadContracts.mjs';
import { createBookRestoreRemapper } from '../src/bookRestoreRemap.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import { uploadArchiveRestore } from './helpers/bookRestoreContentFixture.mjs';
import { bookLegacyFixture } from './helpers/bookLegacyFixture.mjs';
import {
  uploadLegacyRestore,
  finishLegacyRestore,
  cleanupLegacyRestore,
  legacyMutation as rawMutation,
} from './helpers/bookLegacyRestoreFixture.mjs';
import { finishRestoreStructure } from './helpers/bookRestoreStructureFixture.mjs';
import { loreRestoreFixture, finishRestoreLore } from './helpers/bookRestoreLoreFixture.mjs';
const mutation = (id, p, operationId, extra) =>
  rawMutation(id, p, operationId.padStart(20, '0'), extra);
const uid = 'author',
  id = 'lore-restore-0001',
  root = 'users/' + uid + '/bookRestores/' + id;
function setup() {
  const f = adventureImportDb({ nativeUpdates: true }),
    factory = () => createBookRestoreUploadService({ db: f.db, now: () => 1000 });
  return { ...f, factory, api: factory() };
}
async function ready(f, records = loreRestoreFixture()) {
  const { progress } = await uploadArchiveRestore(f.api, uid, id, records),
    validated = await finishLegacyRestore(f.factory, uid, id, progress);
  return finishRestoreStructure(f.factory, uid, id, validated);
}
const mapper = (p) =>
  createBookRestoreRemapper({
    schemaVersion: 1,
    jobToken: p.jobToken,
    sourceBookId: 'book',
    bookId: p.bookId,
  });
test('lore uses bounded relation pages, remaps own targets and retains external literals, fields and absent/empty relations', async () => {
  const f = setup(),
    before = await ready(f),
    originalIndex = before.preparation.itemIndex,
    request = mutation(id, before, 'lore-first-0001'),
    first = await f.api.advanceBookRestoreLore(uid, request),
    p = first.progress,
    map = mapper(p),
    path = 'books/' + p.bookId + '/lore/' + map.identity('lore', 'entity'),
    value = f.records.get(path);
  assert.equal(value.relations.length, 64);
  assert.equal(value.bookId, p.bookId);
  assert.equal(value.details, '\ufeffOwn entity text 🌙');
  assert.equal(value.structuredDetails.notes, 'Literal universe:gone:secret');
  assert.equal(value.isPublic, true);
  assert.equal(value.createdAt, p.preparation.timestamp);
  assert.equal(value.updatedAt, p.preparation.timestamp);
  assert.equal(value.relations[0].targetEntityId, map.identity('lore', 'entity'));
  assert.equal(value.relations[1].targetEntityId, map.identity('lore', 'missing-lore'));
  assert.equal(value.relations[2].targetEntityId, 'universe:gone:secret');
  assert.equal(value.relations[0].description, 'Literal entity book 0');
  assert.equal(p.preparation.relationOffset, 64);
  assert.equal(p.preparation.loreCount, 0);
  assert.equal(p.preparation.loreItemIndex, originalIndex);
  assert.equal(p.preparation.itemIndex, originalIndex);
  assert.equal(f.records.get(root).cleanupVersion, 6);
  assert.equal(f.records.has('books/' + p.bookId), false);
  assert.deepEqual(await f.factory().advanceBookRestoreLore(uid, request), first);
  const second = (
    await f.factory().advanceBookRestoreLore(uid, mutation(id, p, 'lore-second-0001'))
  ).progress;
  assert.equal(second.preparation.relationOffset, 128);
  const third = (
    await f.factory().advanceBookRestoreLore(uid, mutation(id, second, 'lore-third-0001'))
  ).progress;
  assert.equal(third.preparation.relationOffset, 0);
  assert.equal(third.preparation.loreCount, 1);
  assert.equal(third.preparation.loreRelationCount, 130);
  const done = await finishRestoreLore(f.factory, uid, id, third);
  assert.equal(done.preparation.loreCount, 3);
  assert.equal(done.preparation.loreRelationCount, 130);
  assert.equal(done.preparation.itemIndex, originalIndex);
  assert.ok(done.preparation.loreItemIndex > originalIndex);
  assert.equal(done.preparation.artifactCount, before.preparation.artifactCount + 3);
  assert.equal(f.records.get(path).relations.length, 130);
  assert.equal(
    Object.hasOwn(
      f.records.get('books/' + p.bookId + '/lore/' + map.identity('lore', 'absent')),
      'relations',
    ),
    false,
  );
  assert.deepEqual(
    f.records.get('books/' + p.bookId + '/lore/' + map.identity('lore', 'empty')).relations,
    [],
  );
  assert.equal(BOOK_RESTORE_METHODS.includes('advanceBookRestoreLore'), true);
  assert.equal(
    [...f.records.keys()].some((k) => k.startsWith('publicBooks/')),
    false,
  );
  assert.equal(
    [...f.records.keys()].some((k) => k.startsWith('universes/')),
    false,
  );
  for (const method of ['advanceBookRestoreStructure', 'advanceBookRestoreLore'])
    await assert.rejects(() =>
      f.api[method](uid, mutation(id, done, 'lore-after-phase-' + method)),
    );
  const resolved = await f.api.resolveBookRestoreOperation(uid, {
    restoreId: id,
    jobToken: p.jobToken,
    operationId: request.operationId,
    requestHash: requestHash('advanceBookRestoreLore', mutationInput(request)),
  });
  assert.deepEqual(resolved.receipt, first.receipt);
  assert.equal(resolved.progress.checkpoint, done.checkpoint);
});
test('cancellation drains v6 lore/body journals through limited masked pages and preserves historical receipts and other books', async () => {
  const f = setup(),
    p0 = await ready(f),
    request = mutation(id, p0, 'lore-cancel-first01'),
    first = await f.api.advanceBookRestoreLore(uid, request),
    p = await finishRestoreLore(f.factory, uid, id, first.progress),
    base = 'books/' + p.bookId;
  f.records.set('books/other/lore/keep', { details: 'preserve' });
  let current = (await f.api.cancelBookRestore(uid, mutation(id, p, 'lore-cancel-0001'))).progress,
    unit = 0;
  assert.equal(current.integrity.cleanupPhase, 'body-artifacts');
  f.reads.length = 0;
  while (current.state !== 'cancelled') {
    const start = f.commits.length;
    current = (
      await f.api.advanceBookRestoreCleanup(
        uid,
        mutation(id, current, 'lore-clean-' + unit++, { limit: 2 }),
      )
    ).progress;
    const deletes = f.commits
      .slice(start)
      .flat()
      .filter(
        (w) =>
          w.method === 'delete' &&
          (w.path.startsWith(base + '/') || w.path.startsWith(root + '/materializationArtifacts/')),
      );
    assert.ok(deletes.length <= 4);
    assert.ok(unit < 1000);
  }
  assert.equal(
    [...f.records.keys()].some((k) => k.startsWith(base + '/')),
    false,
  );
  assert.equal(current.preparation.cleanedArtifacts, p.preparation.artifactCount);
  assert.equal(f.records.get('books/other/lore/keep').details, 'preserve');
  assert.equal(f.records.has('bookRestoreReservations/' + p.bookId), true);
  assert.equal(f.records.has('deletedBooks/' + p.bookId), true);
  assert.equal((await f.api.advanceBookRestoreLore(uid, request)).progress.state, 'cancelled');
  assert.ok(
    f.reads.filter((r) => r.collectionPath === base + '/lore').every((r) => r.fields !== null),
  );
});
test('v5 external chapter bodies and v6 lore share cancellation without lost artifacts', async () => {
  const f = setup(),
    legacy = bookLegacyFixture(1);
  legacy.chapters[0].content = '🌙'.repeat(150000);
  const uploaded = await uploadLegacyRestore(f.api, uid, id, legacy),
    validated = await finishLegacyRestore(f.factory, uid, id, uploaded.progress),
    p = await finishRestoreStructure(f.factory, uid, id, validated);
  assert.equal(f.records.get(root).cleanupVersion, 5);
  const done = await finishRestoreLore(f.factory, uid, id, p);
  assert.equal(f.records.get(root).cleanupVersion, 6);
  await cleanupLegacyRestore(f.api, uid, id, done, { limit: 7 });
  assert.equal(
    [...f.records.keys()].some((k) => k.startsWith('books/' + p.bookId + '/')),
    false,
  );
});
for (const version of [1, 2, 3, 4, 5, 6])
  test(
    'legacy v' + version + ' retains own lore and leaves remaining resources pending',
    async () => {
      const f = setup(),
        legacy = bookLegacyFixture(version),
        uploaded = await uploadLegacyRestore(f.api, uid, id, legacy),
        validated = await finishLegacyRestore(f.factory, uid, id, uploaded.progress),
        structure = await finishRestoreStructure(f.factory, uid, id, validated),
        p = await finishRestoreLore(f.factory, uid, id, structure),
        lore = [...f.records].filter(([k]) => k.startsWith('books/' + p.bookId + '/lore/'));
      assert.equal(lore.length, 1);
      assert.equal(lore[0][1].details, 'Own prose');
      assert.deepEqual(lore[0][1].relations, []);
      assert.equal(p.preparation.itemIndex, structure.preparation.itemIndex);
      assert.equal(f.records.has('books/' + p.bookId), false);
      await cleanupLegacyRestore(f.api, uid, id, p, { limit: 7 });
    },
  );
test('no lore transitions only after checking the manifest and does not consume a pending resource', async () => {
  const f = setup(),
    legacy = bookLegacyFixture(6);
  legacy.lore = [];
  const uploaded = await uploadLegacyRestore(f.api, uid, id, legacy),
    validated = await finishLegacyRestore(f.factory, uid, id, uploaded.progress),
    structure = await finishRestoreStructure(f.factory, uid, id, validated),
    p = await finishRestoreLore(f.factory, uid, id, structure);
  assert.equal(p.preparation.loreCount, 0);
  assert.equal(p.preparation.itemIndex, structure.preparation.itemIndex);
  assert.equal(
    [...f.records.keys()].some((k) => k.startsWith('books/' + p.bookId + '/lore/')),
    false,
  );
  await cleanupLegacyRestore(f.api, uid, id, p);
});
for (const mode of ['target', 'journal', 'receipt'])
  test(
    'a recreated ' + mode + ' blocks relation continuation and cleanup without overwriting data',
    async () => {
      const f = setup(),
        start = await ready(f),
        p = (await f.api.advanceBookRestoreLore(uid, mutation(id, start, 'lore-birth-0001')))
          .progress,
        journal = [...f.records].find(
          ([k, v]) => k.startsWith(root + '/materializationArtifacts/') && v.kind === 'lore',
        ),
        target = 'books/' + p.bookId + '/lore/' + journal[1].id,
        path =
          mode === 'target'
            ? target
            : mode === 'journal'
              ? journal[0]
              : 'users/' + uid + '/bookRestoreOperations/' + journal[1].lastOperationId,
        value = structuredClone(f.records.get(path));
      await f.db.runTransaction((tx) => tx.delete(f.db.doc(path)));
      await f.db.runTransaction((tx) => tx.create(f.db.doc(path), value));
      const before = structuredClone([...f.records]);
      await assert.rejects(() =>
        f.api.advanceBookRestoreLore(uid, mutation(id, p, 'lore-reborn-0001')),
      );
      assert.deepEqual([...f.records], before);
      const cancelled = (await f.api.cancelBookRestore(uid, mutation(id, p, 'lore-reborn-cancel')))
        .progress;
      await assert.rejects(async () => {
        let q = cancelled;
        for (let unit = 0; unit < 10; unit++)
          q = (
            await f.api.advanceBookRestoreCleanup(
              uid,
              mutation(id, q, 'lore-reborn-clean-' + unit, { limit: 50 }),
            )
          ).progress;
      });
      assert.equal(f.records.has(target), true);
    },
  );
test('preexisting or late unjournaled lore blocks upgrade or final cleanup certification', async () => {
  for (const late of [false, true]) {
    const f = setup(),
      start = await ready(f),
      path = 'books/' + start.bookId + '/lore/foreign';
    let p = start;
    if (late) p = await finishRestoreLore(f.factory, uid, id, start);
    f.records.set(path, { details: 'preserve' });
    if (!late)
      await assert.rejects(() =>
        f.api.advanceBookRestoreLore(uid, mutation(id, p, 'lore-foreign-0001')),
      );
    else {
      let q = (await f.api.cancelBookRestore(uid, mutation(id, p, 'lore-late-cancel'))).progress;
      await assert.rejects(async () => {
        for (let unit = 0; unit < 100; unit++)
          q = (
            await f.api.advanceBookRestoreCleanup(
              uid,
              mutation(id, q, 'lore-late-clean-' + unit, { limit: 50 }),
            )
          ).progress;
      });
    }
    assert.equal(f.records.get(path).details, 'preserve');
  }
});
test('storage failure and automatic callback retry retain one source cursor and one relation page', async () => {
  const f = setup(),
    start = await ready(f),
    run = f.db.runTransaction.bind(f.db),
    before = structuredClone([...f.records]),
    failure = new Error('storage failure');
  let inject = true,
    autoRetry = false;
  f.db.runTransaction = async (operation) => {
    try {
      return await run(async (tx) => {
        const set = tx.set,
          create = tx.create;
        for (const [name, original] of [
          ['set', set],
          ['create', create],
        ])
          tx[name] = (ref, ...args) => {
            if (inject && ref.path.includes('/lore/')) throw failure;
            return original(ref, ...args);
          };
        return operation(tx);
      });
    } catch (e) {
      if (e === failure && autoRetry) {
        inject = false;
        return run(operation);
      }
      throw e;
    }
  };
  const request = mutation(id, start, 'lore-storage-0001');
  await assert.rejects(
    () => f.api.advanceBookRestoreLore(uid, request),
    (e) => e === failure,
  );
  assert.deepEqual([...f.records], before);
  autoRetry = true;
  const first = await f.api.advanceBookRestoreLore(uid, request);
  assert.equal(first.progress.preparation.relationOffset, 64);
  assert.equal(first.progress.preparation.loreRelationCount, 64);
  assert.equal(first.progress.preparation.artifactCount, start.preparation.artifactCount + 1);
  assert.deepEqual(await f.api.advanceBookRestoreLore(uid, request), first);
});
test('competing operations at the same checkpoint create a single relation page', async () => {
  const f = setup(),
    p = await ready(f),
    result = await Promise.allSettled([
      f.api.advanceBookRestoreLore(uid, mutation(id, p, 'lore-race-0001')),
      f.factory().advanceBookRestoreLore(uid, mutation(id, p, 'lore-race-0002')),
    ]);
  assert.equal(result.filter((r) => r.status === 'fulfilled').length, 1);
  const current = await f.api.getBookRestore(uid, { restoreId: id });
  assert.equal(current.preparation.loreRelationCount, 64);
});

test('cancellation between verified item read and materialization prevents lore and receipt creation', async () => {
  const f = setup(),
    p = await ready(f),
    doc = f.db.doc.bind(f.db);
  let intercepted = false;
  f.db.doc = (path) => {
    const ref = doc(path);
    if (path === root + '/validationItems/' + String(p.preparation.itemIndex).padStart(15, '0'))
      return {
        ...ref,
        get: async () => {
          const snap = await ref.get();
          if (!intercepted) {
            intercepted = true;
            await f.api.cancelBookRestore(uid, mutation(id, p, 'lore-reading-cancel01'));
          }
          return snap;
        },
      };
    return ref;
  };
  const request = mutation(id, p, 'lore-reading-append01');
  await assert.rejects(() => f.api.advanceBookRestoreLore(uid, request));
  assert.equal(intercepted, true);
  assert.equal(f.records.get(root).state, 'cancelling');
  assert.equal(
    [...f.records.keys()].some((k) => k.startsWith('books/' + p.bookId + '/lore/')),
    false,
  );
  assert.equal(
    f.records.has('users/' + uid + '/bookRestoreOperations/' + request.operationId),
    false,
  );
});

test('a newly appearing relation target invalidates the page proof without writing lore', async () => {
  const f = setup(),
    p = await ready(f),
    doc = f.db.doc.bind(f.db);
  const { digest } = await import('../src/sceneContracts.mjs');
  const path = root + '/validationIndex/' + digest(['node', 'lore', '', 'universe:gone:secret']);
  let intercepted = false;
  f.db.doc = (name) => {
    const ref = doc(name);
    if (name === path)
      return {
        ...ref,
        get: async () => {
          const snapshot = await ref.get();
          if (!intercepted) {
            intercepted = true;
            await f.db.runTransaction((tx) => tx.create(ref, { unexpected: true }));
          }
          return snapshot;
        },
      };
    return ref;
  };
  const request = mutation(id, p, 'lore-index-proof01');
  await assert.rejects(() => f.api.advanceBookRestoreLore(uid, request));
  assert.equal(intercepted, true);
  assert.equal(f.records.get(root).checkpoint, p.checkpoint);
  assert.equal(
    [...f.records.keys()].some((k) => k.startsWith('books/' + p.bookId + '/lore/')),
    false,
  );
  assert.equal(
    f.records.has('users/' + uid + '/bookRestoreOperations/' + request.operationId),
    false,
  );
});
test('an identical twin commit during source read resolves its receipt instead of failing or duplicating a page', async () => {
  const f = setup(),
    p = await ready(f),
    doc = f.db.doc.bind(f.db),
    request = mutation(id, p, 'lore-identical-twin01');
  let twin;
  f.db.doc = (path) => {
    const ref = doc(path);
    if (path === root + '/validationItems/' + String(p.preparation.itemIndex).padStart(15, '0'))
      return {
        ...ref,
        get: async () => {
          const snapshot = await ref.get();
          if (!twin) {
            twin = true;
            twin = await f.factory().advanceBookRestoreLore(uid, request);
          }
          return snapshot;
        },
      };
    return ref;
  };
  const result = await f.api.advanceBookRestoreLore(uid, request);
  assert.deepEqual(result, twin);
  assert.equal(result.progress.preparation.loreRelationCount, 64);
  assert.equal(result.progress.preparation.artifactCount, p.preparation.artifactCount + 1);
});

test('cancelling a partially written relation list removes exactly the one owned lore artifact', async () => {
  const f = setup(),
    initial = await ready(f),
    partial = (
      await f.api.advanceBookRestoreLore(uid, mutation(id, initial, 'lore-partial-first01'))
    ).progress,
    terminal = await cleanupLegacyRestore(f.api, uid, id, partial, { limit: 5 });
  assert.equal(partial.preparation.loreCount, 0);
  assert.equal(partial.preparation.relationOffset, 64);
  assert.equal(terminal.preparation.cleanedArtifacts, initial.preparation.artifactCount + 1);
  assert.equal(
    [...f.records.keys()].some((k) => k.startsWith('books/' + partial.bookId + '/')),
    false,
  );
});
test('final v6 certification refuses lore reappearing after artifact cleanup', async () => {
  const f = setup(),
    initial = await ready(f),
    p = await finishRestoreLore(f.factory, uid, id, initial);
  let q = (await f.api.cancelBookRestore(uid, mutation(id, p, 'lore-final-cancel01'))).progress,
    unit = 0;
  while (q.integrity.cleanupPhase !== 'state') {
    q = (
      await f.api.advanceBookRestoreCleanup(
        uid,
        mutation(id, q, 'lore-final-clean-' + unit++, { limit: 50 }),
      )
    ).progress;
    assert.ok(unit < 100);
  }
  const path = 'books/' + p.bookId + '/lore/reappearing';
  f.records.set(path, { details: 'preserve' });
  await assert.rejects(() =>
    f.api.advanceBookRestoreCleanup(uid, mutation(id, q, 'lore-final-refuse01', { limit: 50 })),
  );
  assert.equal(f.records.get(path).details, 'preserve');
  assert.equal(f.records.get(root).state, 'cancelling');
});
