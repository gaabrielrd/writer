import test from 'node:test';
import assert from 'node:assert/strict';
import { createBookRestoreUploadService } from '../src/bookRestoreUpload.mjs';
import {
  BOOK_RESTORE_METHODS,
  requestHash,
  mutationInput,
} from '../src/bookRestoreUploadContracts.mjs';
import { countVisibleWords } from '../src/visibleWordCount.mjs';
import { workGroupKey, workSourceKey } from '../src/workProgressLedger.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import { uploadArchiveRestore } from './helpers/bookRestoreContentFixture.mjs';
import {
  finishLegacyRestore,
  cleanupLegacyRestore,
  legacyMutation as mutation,
  uploadLegacyRestore,
} from './helpers/bookLegacyRestoreFixture.mjs';
import {
  structureRestoreFixture,
  finishRestoreStructure,
} from './helpers/bookRestoreStructureFixture.mjs';
import { bookLegacyFixture } from './helpers/bookLegacyFixture.mjs';
const uid = 'author',
  id = 'structure-restore01',
  root = 'users/' + uid + '/bookRestores/' + id;
function setup() {
  const f = adventureImportDb({ nativeUpdates: true }),
    factory = () => createBookRestoreUploadService({ db: f.db, now: () => 1000 });
  return { ...f, factory, api: factory() };
}
async function ready(f, records = structureRestoreFixture()) {
  const { progress } = await uploadArchiveRestore(f.api, uid, id, records),
    done = await finishLegacyRestore(f.factory, uid, id, progress);
  assert.equal(done.state, 'content-verified');
  return done;
}
test('native structure uses mapped IDs, exact prose, fresh dates/revisions and the shared word ledger without a root', async () => {
  const f = setup(),
    validated = await ready(f),
    snapshot = structuredClone(f.records.get(root + '/validationState/current')),
    p = await finishRestoreStructure(f.factory, uid, id, validated),
    base = 'books/' + p.bookId;
  assert.equal(f.records.has(base), false);
  assert.equal(p.state, 'content-verified');
  assert.equal(p.preparation.phase, 'resources');
  assert.equal(p.preparation.actCount, 1);
  assert.equal(p.preparation.chapterCount, 2);
  assert.equal(p.preparation.artifactCount, 8);
  assert.equal(p.preparation.itemIndex, 4);
  assert.equal(f.records.get(root).validationCheckpoint, validated.checkpoint);
  assert.deepEqual(f.records.get(root + '/validationState/current'), snapshot);
  const chapters = [...f.records]
      .filter(([k]) => k.startsWith(base + '/chapters/'))
      .map(([, v]) => v),
    chapter = chapters.find((c) => c.contentMode === 'legacy'),
    scenes = chapters.find((c) => c.contentMode === 'scenes');
  assert.equal(chapter.content, '\ufeffOne two 🌙');
  assert.equal(chapter.wordCount, countVisibleWords(chapter.content));
  assert.equal(chapter.bookId, p.bookId);
  assert.equal(chapter.ownerId, uid);
  assert.equal(chapter.createdAt, p.preparation.timestamp);
  assert.equal(chapter.updatedAt, p.preparation.timestamp);
  assert.equal(chapter.revision, 1);
  assert.equal(chapter.assemblyRevision, 0);
  assert.equal(scenes.wordCount, 0);
  assert.equal(scenes.rankSlot, 'A');
  const target = { kind: 'book', id: p.bookId },
    control = f.records.get(base + '/workProgress/current'),
    group = f.records.get(base + '/workWordGroups/' + workGroupKey(target, chapter.id)),
    source = f.records.get(base + '/workWordSources/' + workSourceKey('chapter', chapter.id));
  assert.equal(group.words, chapter.wordCount);
  assert.equal(group.enabled, true);
  assert.equal(source.words, chapter.wordCount);
  assert.equal(source.groupId, chapter.id);
  assert.equal(control.wordCount, chapter.wordCount);
  assert.equal(control.countReady, false);
  assert.equal(p.preparation.wordCount, chapter.wordCount);
  assert.equal(BOOK_RESTORE_METHODS.includes('advanceBookRestoreStructure'), true);
  const reader = await f
    .factory()
    .openVerifiedBookRestoreContent(uid, { restoreId: id, jobToken: p.jobToken });
  assert.equal((await reader.readMappedItem(0)).value.book.title, 'Livro');
  await assert.rejects(
    () => f.api.advanceBookRestoreStructure(uid, mutation(id, p, 'structure-too-far01')),
    (e) => e.details?.reason === 'structure-complete',
  );
});
test('receipt retry, historical resolver and competing operations cannot duplicate native artifacts', async () => {
  const f = setup(),
    p = await ready(f),
    request = mutation(id, p, 'structure-replay01'),
    a = await f.api.advanceBookRestoreStructure(uid, request),
    again = await f.factory().advanceBookRestoreStructure(uid, request);
  assert.deepEqual(again, a);
  const raced = await Promise.allSettled([
    f.api.advanceBookRestoreStructure(uid, mutation(id, a.progress, 'structure-race001')),
    f.factory().advanceBookRestoreStructure(uid, mutation(id, a.progress, 'structure-race002')),
  ]);
  assert.equal(raced.filter((r) => r.status === 'fulfilled').length, 1);
  const current = await f.api.getBookRestore(uid, { restoreId: id });
  const resolved = await f.api.resolveBookRestoreOperation(uid, {
    restoreId: id,
    jobToken: p.jobToken,
    operationId: request.operationId,
    requestHash: requestHash('advanceBookRestoreStructure', mutationInput(request)),
  });
  assert.deepEqual(resolved.receipt, a.receipt);
  assert.equal(resolved.progress.checkpoint, current.checkpoint);
  assert.equal(current.preparation.artifactCount, 2);
  assert.equal(
    [...f.records.keys()].filter((k) => k.startsWith(root + '/materializationArtifacts/')).length,
    2,
  );
});
test('v4 cancellation cleans actual artifact pairs in bounded pages, certifies all namespaces and preserves other books', async () => {
  const f = setup(),
    validated = await ready(f),
    p = await finishRestoreStructure(f.factory, uid, id, validated),
    base = 'books/' + p.bookId;
  f.records.set('books/other/chapters/keep', { content: 'preserve' });
  let progress = (await f.api.cancelBookRestore(uid, mutation(id, p, 'structure-cancel01')))
    .progress;
  assert.equal(progress.integrity.cleanupPhase, 'artifacts');
  await assert.rejects(() =>
    f.api.advanceBookRestoreStructure(uid, mutation(id, progress, 'structure-late01')),
  );
  let unit = 0;
  while (progress.state !== 'cancelled') {
    const request = mutation(id, progress, 'structure-clean-' + unit++, { limit: 2 }),
      result = await f.api.advanceBookRestoreCleanup(uid, request);
    assert.deepEqual(await f.api.advanceBookRestoreCleanup(uid, request), result);
    progress = result.progress;
    assert.ok(unit < 200);
  }
  assert.equal(progress.preparation.cleanedArtifacts, 8);
  assert.equal(
    [...f.records.keys()].some((k) => k.startsWith(base + '/')),
    false,
  );
  assert.equal(
    [...f.records.keys()].some((k) => k.startsWith(root + '/')),
    false,
  );
  assert.equal(f.records.get('books/other/chapters/keep').content, 'preserve');
  assert.equal(f.records.has('deletedBooks/' + p.bookId), true);
});
for (const mode of ['target', 'journal', 'receipt'])
  test('cleanup refuses recreated ' + mode + ' without deleting its paired artifact', async () => {
    const f = setup(),
      p0 = await ready(f),
      p = (await f.api.advanceBookRestoreStructure(uid, mutation(id, p0, 'structure-first01')))
        .progress,
      journal = [...f.records].find(([k]) => k.startsWith(root + '/materializationArtifacts/')),
      target = 'books/' + p.bookId + '/workProgress/current',
      path =
        mode === 'target'
          ? target
          : mode === 'journal'
            ? journal[0]
            : 'users/' + uid + '/bookRestoreOperations/' + journal[1].lastOperationId,
      value = structuredClone(f.records.get(path));
    await f.db.runTransaction((tx) => {
      tx.delete(f.db.doc(path));
    });
    await f.db.runTransaction((tx) => {
      tx.create(f.db.doc(path), value);
    });
    const cancelled = (await f.api.cancelBookRestore(uid, mutation(id, p, 'structure-cancel02')))
        .progress,
      before = structuredClone([...f.records]);
    await assert.rejects(() =>
      f.api.advanceBookRestoreCleanup(
        uid,
        mutation(id, cancelled, 'structure-clean-bad', { limit: 5 }),
      ),
    );
    assert.deepEqual([...f.records], before);
    assert.equal(f.records.has(target), true);
    assert.equal(f.records.has(journal[0]), true);
  });
test('unknown/foreign/unregistered native data and a present root block ownership or cleanup instead of being overwritten', async () => {
  for (const mode of ['before-start', 'unregistered', 'root']) {
    const f = setup(),
      p0 = await ready(f),
      base = 'books/' + p0.bookId;
    if (mode === 'before-start') {
      f.records.set(base + '/acts/foreign', { name: 'preserve' });
      await assert.rejects(() =>
        f.api.advanceBookRestoreStructure(uid, mutation(id, p0, 'structure-startbad')),
      );
      assert.equal(f.records.get(root).cleanupVersion, 3);
    } else {
      const p = (
        await f.api.advanceBookRestoreStructure(uid, mutation(id, p0, 'structure-first02'))
      ).progress;
      if (mode === 'unregistered')
        f.records.set(base + '/chapters/foreign', { content: 'preserve' });
      else f.records.set(base, { authorId: uid, title: 'Unexpected' });
      if (mode === 'root')
        await assert.rejects(() =>
          f.api.cancelBookRestore(uid, mutation(id, p, 'structure-cancel03')),
        );
      else {
        const cancelled = (
          await f.api.cancelBookRestore(uid, mutation(id, p, 'structure-cancel04'))
        ).progress;
        const first = (
          await f.api.advanceBookRestoreCleanup(
            uid,
            mutation(id, cancelled, 'structure-clean01', { limit: 50 }),
          )
        ).progress;
        await assert.rejects(() =>
          f.api.advanceBookRestoreCleanup(
            uid,
            mutation(id, first, 'structure-clean02', { limit: 50 }),
          ),
        );
        assert.equal(f.records.get(base + '/chapters/foreign').content, 'preserve');
      }
    }
  }
});
test('a storage failure rolls back native writes, cursor and receipt and permits the original operation retry', async () => {
  const f = setup(),
    p = await ready(f),
    run = f.db.runTransaction.bind(f.db),
    before = structuredClone([...f.records]),
    failure = new Error('native storage failure');
  f.db.runTransaction = (fn) =>
    run(async (tx) => {
      const create = tx.create;
      tx.create = (ref, ...args) => {
        if (ref.path.startsWith('books/')) throw failure;
        return create(ref, ...args);
      };
      return fn(tx);
    });
  const request = mutation(id, p, 'structure-uncertain01');
  await assert.rejects(
    () => f.api.advanceBookRestoreStructure(uid, request),
    (e) => e === failure,
  );
  assert.deepEqual([...f.records], before);
  f.db.runTransaction = run;
  const result = await f.api.advanceBookRestoreStructure(uid, request);
  assert.equal(result.progress.preparation.artifactCount, 1);
});
for (const version of [1, 2, 3, 4, 5, 6])
  test(
    'legacy v' + version + ' stages its actual structure and remains fully cancellable',
    async () => {
      const f = setup(),
        legacy = bookLegacyFixture(version);
      legacy.chapters[0].content =
        version < 5 ? '\ufeffOwn saved text' : '<p>Rendered scene 🌙</p>';
      const { progress } = await uploadLegacyRestore(f.api, uid, id, legacy),
        validated = await finishLegacyRestore(f.factory, uid, id, progress),
        p = await finishRestoreStructure(f.factory, uid, id, validated);
      assert.equal(p.preparation.chapterCount, 1);
      assert.equal(p.preparation.actCount, version >= 4 ? 1 : 0);
      assert.equal(f.records.has('books/' + p.bookId), false);
      const terminal = await cleanupLegacyRestore(f.api, uid, id, p, { limit: 7 });
      assert.equal(terminal.state, 'cancelled');
    },
  );

test('cancellation between pointer read and preparation prevents every native write', async () => {
  const f = setup(),
    p = await ready(f),
    doc = f.db.doc.bind(f.db);
  let intercepted = false;
  f.db.doc = (path) => {
    const ref = doc(path);
    if (path === root + '/validationItems/000000000000000')
      return {
        ...ref,
        get: async () => {
          const snapshot = await ref.get();
          if (!intercepted) {
            intercepted = true;
            await f.api.cancelBookRestore(uid, mutation(id, p, 'structure-race-cancel01'));
          }
          return snapshot;
        },
      };
    return ref;
  };
  await assert.rejects(() =>
    f.api.advanceBookRestoreStructure(uid, mutation(id, p, 'structure-race-late01')),
  );
  assert.equal(intercepted, true);
  assert.equal(f.records.get(root).state, 'cancelling');
  assert.equal(
    [...f.records.keys()].some((k) => k.startsWith('books/' + p.bookId + '/')),
    false,
  );
  assert.equal(
    [...f.records.keys()].some((k) => k.startsWith(root + '/materializationArtifacts/')),
    false,
  );
});
test('final cleanup refuses a reappearing native child after artifacts were certified empty', async () => {
  const f = setup(),
    validated = await ready(f),
    p = await finishRestoreStructure(f.factory, uid, id, validated);
  let current = (await f.api.cancelBookRestore(uid, mutation(id, p, 'structure-final-cancel01')))
      .progress,
    unit = 0;
  while (current.integrity.cleanupPhase !== 'state') {
    current = (
      await f.api.advanceBookRestoreCleanup(
        uid,
        mutation(id, current, 'structure-final-clean-' + unit++, { limit: 50 }),
      )
    ).progress;
    assert.ok(unit < 100);
  }
  const path = 'books/' + p.bookId + '/acts/foreign';
  f.records.set(path, { name: 'preserve' });
  await assert.rejects(() =>
    f.api.advanceBookRestoreCleanup(
      uid,
      mutation(id, current, 'structure-final-refuse01', { limit: 50 }),
    ),
  );
  assert.equal(f.records.get(root).state, 'cancelling');
  assert.equal(f.records.get(path).name, 'preserve');
});

test('automatic transaction callback retry starts from the same frozen cursor and counters', async () => {
  const f = setup(),
    p = await ready(f),
    run = f.db.runTransaction.bind(f.db),
    abort = new Error('retry transaction');
  let retried = false;
  f.db.runTransaction = async (operation) => {
    try {
      return await run(async (tx) => {
        let nativeWrite = false;
        const create = tx.create;
        tx.create = (ref, ...args) => {
          nativeWrite ||= ref.path.startsWith('books/');
          return create(ref, ...args);
        };
        const result = await operation(tx);
        if (nativeWrite && !retried) {
          retried = true;
          throw abort;
        }
        return result;
      });
    } catch (error) {
      if (error === abort) return run(operation);
      throw error;
    }
  };
  const result = await f.api.advanceBookRestoreStructure(
    uid,
    mutation(id, p, 'structure-autoretry01'),
  );
  assert.equal(retried, true);
  assert.equal(result.progress.preparation.itemIndex, 1);
  assert.equal(result.progress.preparation.artifactCount, 1);
  assert.equal(
    [...f.records.keys()].filter((k) => k.startsWith(root + '/materializationArtifacts/')).length,
    1,
  );
});
