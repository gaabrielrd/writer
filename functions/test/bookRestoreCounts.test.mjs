import test from 'node:test';
import assert from 'node:assert/strict';
import { createBookRestoreUploadService } from '../src/bookRestoreUpload.mjs';
import {
  BOOK_RESTORE_METHODS,
  requestHash,
  mutationInput,
  preparationProgress,
} from '../src/bookRestoreUploadContracts.mjs';
import { createBookRestoreRemapper } from '../src/bookRestoreRemap.mjs';
import { workGroupKey, workSourceKey } from '../src/workProgressLedger.mjs';
import { countVisibleWords } from '../src/visibleWordCount.mjs';
import { digest } from '../src/sceneContracts.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import { readyRestoreCounts, finishRestoreCounts } from './helpers/bookRestoreCountsFixture.mjs';
import { bookLegacyFixture } from './helpers/bookLegacyFixture.mjs';
import { finishRestoreStructure } from './helpers/bookRestoreStructureFixture.mjs';
import { finishRestoreLore } from './helpers/bookRestoreLoreFixture.mjs';
import { finishRestoreResources } from './helpers/bookRestoreResourcesFixture.mjs';
import {
  uploadLegacyRestore,
  finishLegacyRestore,
  cleanupLegacyRestore,
  legacyMutation as mutation,
} from './helpers/bookLegacyRestoreFixture.mjs';
const uid = 'author',
  id = 'counts-restore-0001',
  root = 'users/' + uid + '/bookRestores/' + id;
function setup() {
  const f = adventureImportDb({ nativeUpdates: true }),
    factory = () => createBookRestoreUploadService({ db: f.db, now: () => 1000 });
  return { ...f, factory, api: factory() };
}
const mapper = (p) =>
  createBookRestoreRemapper({
    schemaVersion: 1,
    jobToken: p.jobToken,
    sourceBookId: 'book',
    bookId: p.bookId,
  });
test('reconciliation derives scene/group totals and canonical manuscript words while retaining archived, unassigned and missing-parent prose', async () => {
  const f = setup(),
    initial = await readyRestoreCounts(f.factory, uid, id),
    p = await finishRestoreCounts(f.factory, uid, id, initial),
    m = mapper(p),
    base = 'books/' + p.bookId,
    target = { kind: 'book', id: p.bookId },
    legacyWords = countVisibleWords('\ufeffOne two 🌙'),
    activeWords = countVisibleWords('\ufeffActive own 🌙'),
    expected = legacyWords + activeWords;
  assert.equal(f.records.has(base), false);
  assert.equal(f.records.get(root).cleanupVersion, 8);
  assert.equal(p.preparation.schemaVersion, 4);
  assert.equal(p.preparation.phase, 'personas');
  assert.equal(p.preparation.itemIndex, initial.preparation.itemIndex);
  assert.equal(p.preparation.counts.step, 'done');
  assert.equal(p.preparation.counts.sceneCount, 6);
  assert.equal(p.preparation.counts.linkCount, 4);
  assert.equal(p.preparation.wordCount, expected);
  const chapterId = m.identity('chapter', 'chapter'),
    chapter = f.records.get(base + '/chapters/' + chapterId),
    control = f.records.get(base + '/workProgress/current'),
    group = f.records.get(base + '/workWordGroups/' + workGroupKey(target, chapterId));
  assert.equal(chapter.sceneCount, 3);
  assert.equal(chapter.wordCount, activeWords);
  assert.equal(chapter.assemblyRevision, 1);
  assert.equal(chapter.structureRevision, 1);
  assert.equal(group.words, activeWords);
  assert.equal(group.enabled, true);
  assert.equal(control.wordCount, expected);
  assert.equal(control.countReady, false);
  assert.equal(f.records.get(base + '/sceneControls/unassigned').sceneCount, 1);
  assert.equal(
    f.records.get(base + '/sceneControls/unassigned').wordCount,
    countVisibleWords('Unassigned own prose'),
  );
  assert.equal(f.records.get(base + '/sceneControls/unassigned').rankSlot, 'B');
  for (const [oldId, words] of [
    ['active', activeWords],
    ['archived-attached', countVisibleWords('Archived prose remains')],
    ['unassigned', countVisibleWords('Unassigned own prose')],
    ['orphan', countVisibleWords('Orphan words remain')],
    ['empty', 0],
  ]) {
    const sceneId = m.identity('scene', oldId),
      scene = f.records.get(base + '/scenes/' + sceneId),
      source = f.records.get(base + '/workWordSources/' + workSourceKey('scene', sceneId));
    assert.equal(scene.wordCount, words);
    assert.equal(source.words, oldId === 'active' ? activeWords : 0);
  }
  assert.equal(
    f.records.has(base + '/chapters/' + m.identity('chapter', 'removed-chapter')),
    false,
  );
  assert.equal(
    f.records.has(base + '/chapters/' + m.identity('chapter', 'missing-chapter')),
    false,
  );
  const arcId = m.identity('arc', 'arc'),
    milestoneId = m.identity('milestone', 'milestone', 'arc');
  assert.equal(f.records.get(base + '/arcs/' + arcId).referenceCount, 1);
  assert.equal(
    f.records.get(base + '/arcs/' + arcId + '/milestones/' + milestoneId).referenceCount,
    1,
  );
  assert.equal(
    f.records.get(base + '/timelineEvents/' + m.identity('event', 'event')).referenceCount,
    1,
  );
  assert.equal(f.records.has(base + '/arcs/' + m.identity('arc', 'missing-arc')), false);
  assert.equal(f.records.get(base + '/narrativeControls/' + digest({ kind: 'arc' })).rankSlot, 'B');
  assert.equal(
    f.records.get(base + '/narrativeControls/' + digest({ kind: 'arc' })).structureRevision,
    1,
  );
  assert.equal(f.records.get(base + '/narrativeControls/entity-scenes').complete, true);
  assert.equal(BOOK_RESTORE_METHODS.includes('advanceBookRestoreCounts'), true);
  const reader = await f.api.openVerifiedBookRestoreContent(uid, {
    restoreId: id,
    jobToken: p.jobToken,
  });
  assert.ok(
    ['book-persona', 'book-personas'].includes(
      (await reader.readMappedItem(p.preparation.itemIndex)).record.kind,
    ),
  );
});
test('v8 cancellation drains all derived counts, new controls and original resources with historical replay', async () => {
  const f = setup(),
    initial = await readyRestoreCounts(f.factory, uid, id),
    request = mutation(id, initial, 'counts-first-00001'),
    first = await f.api.advanceBookRestoreCounts(uid, request),
    p = await finishRestoreCounts(f.factory, uid, id, first.progress),
    base = 'books/' + p.bookId;
  f.records.set('books/other/narrativeControls/entity-scenes', { complete: true });
  const terminal = await cleanupLegacyRestore(f.api, uid, id, p, { limit: 3 });
  assert.equal(terminal.preparation.cleanedArtifacts, p.preparation.artifactCount);
  assert.equal(
    [...f.records.keys()].some((k) => k.startsWith(base + '/')),
    false,
  );
  assert.equal(f.records.get('books/other/narrativeControls/entity-scenes').complete, true);
  assert.deepEqual((await f.api.advanceBookRestoreCounts(uid, request)).receipt, first.receipt);
});
for (const version of [1, 2, 3, 4, 5, 6])
  test(
    'legacy v' + version + ' reconciles without inventing resources or consuming personas',
    async () => {
      const f = setup(),
        legacy = bookLegacyFixture(version),
        uploaded = await uploadLegacyRestore(f.api, uid, id, legacy),
        validated = await finishLegacyRestore(f.factory, uid, id, uploaded.progress),
        structure = await finishRestoreStructure(f.factory, uid, id, validated),
        lore = await finishRestoreLore(f.factory, uid, id, structure),
        resources = await finishRestoreResources(f.factory, uid, id, lore),
        p = await finishRestoreCounts(f.factory, uid, id, resources);
      assert.equal(p.preparation.counts.sceneCount, version >= 5 ? 1 : 0);
      assert.equal(
        p.preparation.wordCount,
        version >= 5 ? countVisibleWords('\ufeffCanonical scene 🌙') : 0,
      );
      assert.equal(f.records.has('books/' + p.bookId), false);
      await cleanupLegacyRestore(f.api, uid, id, p, { limit: 7 });
    },
  );
test('historical resolver and same-checkpoint contenders only consume one reconciliation item', async () => {
  const f = setup(),
    initial = await readyRestoreCounts(f.factory, uid, id),
    request = mutation(id, initial, 'counts-replay-0001'),
    first = await f.api.advanceBookRestoreCounts(uid, request);
  assert.deepEqual(await f.api.advanceBookRestoreCounts(uid, request), first);
  const results = await Promise.allSettled([
    f.api.advanceBookRestoreCounts(uid, mutation(id, first.progress, 'counts-race-00001')),
    f.factory().advanceBookRestoreCounts(uid, mutation(id, first.progress, 'counts-race-00002')),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const resolved = await f.api.resolveBookRestoreOperation(uid, {
    restoreId: id,
    jobToken: initial.jobToken,
    operationId: request.operationId,
    requestHash: requestHash('advanceBookRestoreCounts', mutationInput(request)),
  });
  assert.deepEqual(resolved.receipt, first.receipt);
  assert.equal(
    resolved.progress.preparation.counts.itemIndex,
    initial.preparation.resourceStartIndex + 2,
  );
});
test('closed reconciliation progress rejects forged cursor, counts, phases and unknown fields', async () => {
  const f = setup(),
    initial = await readyRestoreCounts(f.factory, uid, id),
    p = (await f.api.advanceBookRestoreCounts(uid, mutation(id, initial, 'counts-contract-0001')))
      .progress;
  for (const change of [
    (v) => {
      v.counts.linkCursor = 'a'.repeat(64);
    },
    (v) => {
      v.counts.sceneCount = 999;
    },
    (v) => {
      v.counts.step = 'done';
    },
    (v) => {
      v.phase = 'personas';
    },
    (v) => {
      v.counts.itemIndex = 0;
    },
    (v) => {
      v.counts.text = 'forbidden';
    },
    (v) => {
      v.schemaVersion = 99;
    },
  ]) {
    const value = structuredClone(p.preparation);
    change(value);
    assert.throws(() => preparationProgress(value));
  }
});

async function atScene(f, p) {
  for (let unit = 0; unit < 100; unit++) {
    const index = p.preparation.counts?.itemIndex ?? p.preparation.resourceStartIndex,
      reader = await f.api.openVerifiedBookRestoreContent(uid, {
        restoreId: id,
        jobToken: p.jobToken,
      });
    if ((await reader.readMappedItem(index)).record.kind === 'book-scene') return p;
    p = (await f.api.advanceBookRestoreCounts(uid, mutation(id, p, 'counts-before-scene-' + unit)))
      .progress;
  }
  throw new Error('No scene');
}
test('storage failure and SDK callback retry keep the same source cursor, group totals and ledger delta', async () => {
  const f = setup(),
    initial = await readyRestoreCounts(f.factory, uid, id),
    p = await atScene(f, initial),
    run = f.db.runTransaction.bind(f.db),
    before = structuredClone([...f.records]),
    failure = new Error('counts storage failure');
  let inject = true,
    automatic = false;
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
            if (inject && ref.path.includes('/workWordSources/')) throw failure;
            return original(ref, ...args);
          };
        return operation(tx);
      });
    } catch (error) {
      if (error === failure && automatic) {
        inject = false;
        return run(operation);
      }
      throw error;
    }
  };
  const request = mutation(id, p, 'counts-storage-0001');
  await assert.rejects(
    () => f.api.advanceBookRestoreCounts(uid, request),
    (e) => e === failure,
  );
  assert.deepEqual([...f.records], before);
  automatic = true;
  const result = await f.api.advanceBookRestoreCounts(uid, request);
  assert.equal(result.progress.preparation.counts.sceneCount, 1);
  assert.equal(result.progress.preparation.counts.itemIndex, p.preparation.counts.itemIndex + 1);
  assert.deepEqual(await f.api.advanceBookRestoreCounts(uid, request), result);
});
for (const part of ['target', 'journal', 'receipt'])
  test(
    'recreated prepared ' + part + ' blocks reconciliation before any derived write',
    async () => {
      const f = setup(),
        initial = await readyRestoreCounts(f.factory, uid, id),
        journal = [...f.records].find(
          ([k, v]) => k.startsWith(root + '/materializationArtifacts/') && v.kind === 'scene-body',
        ),
        target =
          'books/' + initial.bookId + '/scenes/' + journal[1].id.split(':')[0] + '/body/current',
        path =
          part === 'target'
            ? target
            : part === 'journal'
              ? journal[0]
              : 'users/' + uid + '/bookRestoreOperations/' + journal[1].lastOperationId,
        value = structuredClone(f.records.get(path));
      await f.db.runTransaction((tx) => tx.delete(f.db.doc(path)));
      await f.db.runTransaction((tx) => tx.create(f.db.doc(path), value));
      const before = structuredClone([...f.records]);
      await assert.rejects(() =>
        f.api.advanceBookRestoreCounts(uid, mutation(id, initial, 'counts-recreated-0001')),
      );
      assert.deepEqual([...f.records], before);
    },
  );
test('cancellation while source JSON is being read prevents a reconciliation receipt', async () => {
  const f = setup(),
    initial = await readyRestoreCounts(f.factory, uid, id),
    doc = f.db.doc.bind(f.db),
    before = [...f.records].filter(([k]) => k.startsWith('books/'));
  let intercepted = false;
  f.db.doc = (path) => {
    const ref = doc(path);
    if (
      path ===
      root + '/validationItems/' + String(initial.preparation.resourceStartIndex).padStart(15, '0')
    )
      return {
        ...ref,
        get: async () => {
          const snapshot = await ref.get();
          if (!intercepted) {
            intercepted = true;
            await f.api.cancelBookRestore(uid, mutation(id, initial, 'counts-reading-cancel'));
          }
          return snapshot;
        },
      };
    return ref;
  };
  const request = mutation(id, initial, 'counts-reading-append');
  await assert.rejects(() => f.api.advanceBookRestoreCounts(uid, request));
  assert.equal(intercepted, true);
  assert.deepEqual(
    [...f.records].filter(([k]) => k.startsWith('books/')),
    before,
  );
  assert.equal(
    f.records.has('users/' + uid + '/bookRestoreOperations/' + request.operationId),
    false,
  );
});
test('the same operation committed during a stale source read resolves its historical receipt', async () => {
  const f = setup(),
    initial = await readyRestoreCounts(f.factory, uid, id),
    doc = f.db.doc.bind(f.db),
    request = mutation(id, initial, 'counts-identical-0001');
  let twin;
  f.db.doc = (path) => {
    const ref = doc(path);
    if (
      path ===
      root + '/validationItems/' + String(initial.preparation.resourceStartIndex).padStart(15, '0')
    )
      return {
        ...ref,
        get: async () => {
          const snapshot = await ref.get();
          if (!twin) {
            twin = true;
            twin = await f.factory().advanceBookRestoreCounts(uid, request);
          }
          return snapshot;
        },
      };
    return ref;
  };
  assert.deepEqual(await f.api.advanceBookRestoreCounts(uid, request), twin);
});
test('a new unjournaled ledger source cannot be adopted as a previous contribution', async () => {
  const f = setup(),
    initial = await readyRestoreCounts(f.factory, uid, id),
    p = await atScene(f, initial),
    reader = await f.api.openVerifiedBookRestoreContent(uid, {
      restoreId: id,
      jobToken: p.jobToken,
    }),
    item = await reader.readMappedItem(p.preparation.counts.itemIndex),
    path = 'books/' + p.bookId + '/workWordSources/' + workSourceKey('scene', item.value.id);
  f.records.set(path, { words: 999, groupId: item.value.data.parentId });
  const before = structuredClone([...f.records]);
  await assert.rejects(() =>
    f.api.advanceBookRestoreCounts(uid, mutation(id, p, 'counts-unowned-ledger')),
  );
  assert.deepEqual([...f.records], before);
});
test('link cursor resumes only while its native anchor still has the proven birth', async () => {
  const f = setup(),
    initial = await readyRestoreCounts(f.factory, uid, id);
  let p = initial,
    unit = 0;
  while (!(p.preparation.counts?.linkCount > 0)) {
    p = (await f.api.advanceBookRestoreCounts(uid, mutation(id, p, 'counts-link-start-' + unit++)))
      .progress;
    assert.ok(unit < 100);
  }
  const path = 'books/' + p.bookId + '/narrativeLinks/' + p.preparation.counts.linkId,
    value = structuredClone(f.records.get(path));
  await f.db.runTransaction((tx) => tx.delete(f.db.doc(path)));
  await f.db.runTransaction((tx) => tx.create(f.db.doc(path), value));
  const before = structuredClone([...f.records]);
  await assert.rejects(() =>
    f.api.advanceBookRestoreCounts(uid, mutation(id, p, 'counts-link-recreated')),
  );
  assert.deepEqual([...f.records], before);
});
test('index preexistence blocks migration and a late foreign control blocks completion', async () => {
  for (const late of [false, true]) {
    const f = setup(),
      initial = await readyRestoreCounts(f.factory, uid, id);
    let p = initial,
      unit = 0;
    if (late)
      while (p.preparation.counts?.step !== 'finish') {
        p = (
          await f.api.advanceBookRestoreCounts(
            uid,
            mutation(id, p, 'counts-before-finish-' + unit++),
          )
        ).progress;
        assert.ok(unit < 100);
      }
    const path = 'books/' + p.bookId + '/narrativeControls/entity-scenes';
    f.records.set(path, { complete: true, foreign: true });
    const before = structuredClone([...f.records]);
    await assert.rejects(() =>
      f.api.advanceBookRestoreCounts(uid, mutation(id, p, 'counts-index-foreign')),
    );
    assert.deepEqual([...f.records], before);
  }
});
test('normal readers observe the reconciled counts and entity index only in a synthetic authorized-root harness', async () => {
  const f = setup(),
    initial = await readyRestoreCounts(f.factory, uid, id),
    p = await finishRestoreCounts(f.factory, uid, id, initial),
    m = mapper(p),
    base = 'books/' + p.bookId,
    target = { kind: 'book', id: p.bookId },
    { createScenesService } = await import('../src/scenes.mjs'),
    { createNarrativePlanningService } = await import('../src/narrativePlanning.mjs'),
    scenes = createScenesService({ db: f.db }),
    narrative = createNarrativePlanningService({ db: f.db });
  assert.equal(
    await scenes.getScene(uid, { target, sceneId: m.identity('scene', 'active') }),
    null,
  );
  // Contract harness only. The restoration writer never creates the root.
  f.records.set(base, {
    authorId: uid,
    title: 'Harness',
    hasNarrativeResources: true,
    sceneRevision: 1,
    narrativeRevision: 1,
    updatedAt: p.preparation.timestamp,
  });
  const detail = await scenes.getScene(uid, { target, sceneId: m.identity('scene', 'active') }),
    context = await narrative.getNarrativeContext(uid, { target }),
    linked = await narrative.listEntityScenes(uid, {
      target,
      reference: { kind: 'book', scopeId: p.bookId, entityId: m.identity('lore', 'entity') },
      cursor: null,
      limit: 10,
    });
  assert.equal(detail.group.wordCount, countVisibleWords(detail.content));
  assert.equal(detail.group.sceneCount, 3);
  assert.equal(context.entityIndexReady, true);
  assert.equal(linked.items.length, 1);
  assert.equal(linked.items[0].available, true);
  f.records.delete(base);
});

test('reconciliation preserves a large frozen chapter body and pins while counting only canonical scene prose', async () => {
  const f = setup(),
    legacy = bookLegacyFixture(5);
  legacy.chapters[0].content = '\ufeff' + 'Frozen original '.repeat(40000);
  const uploaded = await uploadLegacyRestore(f.api, uid, id, legacy),
    validated = await finishLegacyRestore(f.factory, uid, id, uploaded.progress),
    structure = await finishRestoreStructure(f.factory, uid, id, validated),
    base = 'books/' + structure.bookId,
    chapterEntry = [...f.records].find(([k]) => k.startsWith(base + '/chapters/')),
    pointer = structuredClone(chapterEntry[1].contentStorage),
    body = structuredClone(f.records.get(base + '/bookTextBodies/' + pointer.bodyId)),
    lore = await finishRestoreLore(f.factory, uid, id, structure),
    resources = await finishRestoreResources(f.factory, uid, id, lore),
    p = await finishRestoreCounts(f.factory, uid, id, resources);
  assert.deepEqual(f.records.get(chapterEntry[0]).contentStorage, pointer);
  assert.equal(f.records.get(chapterEntry[0]).content, null);
  assert.deepEqual(f.records.get(base + '/bookTextBodies/' + pointer.bodyId), body);
  assert.equal(body.pins, 1);
  assert.equal(p.preparation.wordCount, countVisibleWords('\ufeffCanonical scene 🌙'));
  const terminal = await cleanupLegacyRestore(f.api, uid, id, p, { limit: 3 });
  assert.equal(terminal.preparation.cleanedArtifacts, p.preparation.artifactCount);
  assert.equal(
    [...f.records.keys()].some((k) => k.startsWith(base + '/')),
    false,
  );
});
test('unassigned scenes without a portable control get a derived default group without entering the manuscript', async () => {
  const { countsRestoreFixture } = await import('./helpers/bookRestoreCountsFixture.mjs'),
    { record } = await import('./helpers/bookContentFixture.mjs'),
    records = countsRestoreFixture().filter((r) => r.kind !== 'book-scene-control'),
    at = records.findIndex((r) => r.kind === 'book-resources'),
    manifest = JSON.parse(new TextDecoder().decode(records[at].payload));
  manifest.counts['scene-control'] = 0;
  records[at] = record('book-resources', 'book', manifest);
  const f = setup(),
    initial = await readyRestoreCounts(f.factory, uid, id, records),
    p = await finishRestoreCounts(f.factory, uid, id, initial),
    control = f.records.get('books/' + p.bookId + '/sceneControls/unassigned');
  assert.equal(control.rankSlot, 'A');
  assert.equal(control.sceneCount, 1);
  assert.equal(control.wordCount, countVisibleWords('Unassigned own prose'));
  assert.equal(
    p.preparation.wordCount,
    countVisibleWords('\ufeffOne two 🌙') + countVisibleWords('\ufeffActive own 🌙'),
  );
  await cleanupLegacyRestore(f.api, uid, id, p);
});
