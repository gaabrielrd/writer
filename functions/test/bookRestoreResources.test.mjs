import test from 'node:test';
import assert from 'node:assert/strict';
import { createBookRestoreUploadService } from '../src/bookRestoreUpload.mjs';
import {
  BOOK_RESTORE_METHODS,
  requestHash,
  mutationInput,
} from '../src/bookRestoreUploadContracts.mjs';
import { createBookRestoreRemapper } from '../src/bookRestoreRemap.mjs';
import { bookRestoreResourcePath } from '../src/bookRestoreResourcePaths.mjs';
import { digest } from '../src/sceneContracts.mjs';
import { sourceKey } from '../src/narrativeContracts.mjs';
import { sceneLoreLinkId } from '../src/sceneLoreIndex.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import {
  resourcesRestoreFixture,
  finishRestoreResources,
} from './helpers/bookRestoreResourcesFixture.mjs';
import { uploadArchiveRestore } from './helpers/bookRestoreContentFixture.mjs';
import { finishRestoreStructure } from './helpers/bookRestoreStructureFixture.mjs';
import { finishRestoreLore } from './helpers/bookRestoreLoreFixture.mjs';
import { bookLegacyFixture } from './helpers/bookLegacyFixture.mjs';
import {
  uploadLegacyRestore,
  finishLegacyRestore,
  cleanupLegacyRestore,
  legacyMutation as mutation,
} from './helpers/bookLegacyRestoreFixture.mjs';
const uid = 'author',
  id = 'resources-restore01',
  root = 'users/' + uid + '/bookRestores/' + id;
function setup() {
  const f = adventureImportDb({ nativeUpdates: true }),
    factory = () => createBookRestoreUploadService({ db: f.db, now: () => 1000 });
  return { ...f, factory, api: factory() };
}
async function ready(f, records = resourcesRestoreFixture()) {
  const { progress } = await uploadArchiveRestore(f.api, uid, id, records),
    validated = await finishLegacyRestore(f.factory, uid, id, progress),
    structure = await finishRestoreStructure(f.factory, uid, id, validated);
  return finishRestoreLore(f.factory, uid, id, structure);
}
const mapper = (p, sourceBookId = 'book') =>
  createBookRestoreRemapper({
    schemaVersion: 1,
    jobToken: p.jobToken,
    sourceBookId,
    bookId: p.bookId,
  });
test('all scene/narrative resources and native index keys are prepared with exact content and no active root or ready counts', async () => {
  const f = setup(),
    initial = await ready(f),
    lore = [...f.records].find(([k]) => k.startsWith('books/' + initial.bookId + '/lore/')),
    loreMetadata = structuredClone(f.metadata.get(lore[0])),
    p = await finishRestoreResources(f.factory, uid, id, initial),
    m = mapper(p),
    base = 'books/' + p.bookId,
    sceneId = m.identity('scene', 'scene'),
    activeId = m.identity('scene', 'active'),
    arcId = m.identity('arc', 'arc');
  assert.equal(f.records.has(base), false);
  assert.equal(f.records.get(root).cleanupVersion, 7);
  assert.equal(p.preparation.schemaVersion, 3);
  assert.equal(p.preparation.phase, 'resource-counts');
  assert.equal(p.preparation.resourceCounts.scene, 3);
  assert.equal(p.preparation.resourceCounts['scene-body'], 3);
  assert.equal(p.preparation.resourceCounts['scene-reference'], 2);
  assert.equal(p.preparation.resourceCounts['narrative-link'], 3);
  assert.equal(p.preparation.itemIndex, initial.preparation.loreItemIndex + 1);
  assert.equal(f.records.get(base + '/workProgress/current').countReady, false);
  assert.deepEqual(f.metadata.get(lore[0]), loreMetadata);
  const scene = f.records.get(base + '/scenes/' + sceneId),
    body = f.records.get(base + '/scenes/' + sceneId + '/body/current');
  assert.equal(scene.ownerId, uid);
  assert.equal(scene.id, sceneId);
  assert.equal(scene.parentId, m.identity('chapter', 'missing-chapter'));
  assert.equal(scene.archived, true);
  assert.equal(scene.formerParentId, m.identity('chapter', 'chapter'));
  assert.equal(f.records.get(base + '/scenes/' + activeId).rankB, 'X');
  assert.equal(scene.rankA, 'V');
  assert.equal(scene.rankB, 'V');
  assert.equal(scene.createdAt, p.preparation.timestamp);
  assert.equal(scene.updatedAt, p.preparation.timestamp);
  assert.equal(scene.revision, 1);
  assert.equal(scene.wordCount, 0);
  assert.equal(body.content, '\ufeffação 🌙');
  assert.equal(body.hash, scene.bodyHash);
  assert.equal(Buffer.byteLength(body.content), scene.bodyBytes);
  assert.deepEqual(f.records.get(base + '/scenes/' + sceneId + '/planning/current'), {
    objective: '',
    conflict: '',
    pointOfView: '',
  });
  assert.equal(f.records.get(base + '/sceneControls/unassigned').rankSlot, 'B');
  assert.equal(
    f.records.get(base + '/scenes/' + activeId).parentId,
    m.identity('chapter', 'chapter'),
  );
  assert.equal(f.records.get(base + '/scenes/' + m.identity('scene', 'unassigned')).parentId, null);
  const local = { kind: 'book', scopeId: p.bookId, entityId: m.identity('lore', 'entity') },
    external = { kind: 'universe', scopeId: 'gone', entityId: 'secret' };
  for (const [scene, ref] of [
    [activeId, local],
    [sceneId, external],
  ]) {
    assert.deepEqual(f.records.get(base + '/scenes/' + scene + '/references/' + digest(ref)), ref);
    const linkId = sceneLoreLinkId(scene, ref);
    assert.deepEqual(f.records.get(base + '/sceneLoreLinks/' + linkId), {
      id: linkId,
      sceneId: scene,
      reference: ref,
      loreKey: digest(ref),
    });
  }
  const source = f.records.get(base + '/sceneSources/' + m.identity('chapter', 'chapter'));
  assert.equal(source.original.content, 'Original');
  assert.equal(source.original.personaComplement.personaId, m.identity('persona', 'custom-used'));
  assert.equal(source.hash, digest('Original'));
  assert.equal(source.createdAt, p.preparation.timestamp);
  const arc = f.records.get(base + '/arcs/' + arcId),
    milestoneId = m.identity('milestone', 'milestone', 'arc'),
    milestone = f.records.get(base + '/arcs/' + arcId + '/milestones/' + milestoneId),
    event = f.records.get(base + '/timelineEvents/' + m.identity('event', 'event'));
  assert.equal(arc.kind, 'arc');
  assert.equal(arc.ownerId, uid);
  assert.equal(arc.referenceCount, 0);
  assert.equal(milestone.kind, 'milestone');
  assert.equal(milestone.arcId, arcId);
  assert.equal(event.dateLabel, '3º dia do inverno');
  assert.equal(f.records.get(base + '/narrativeControls/' + digest({ kind: 'arc' })).rankSlot, 'B');
  const sourceRef = { kind: 'milestone', id: milestoneId, arcId },
    reference = { kind: 'lore', reference: local },
    linkId = digest({ source: sourceRef, reference }),
    link = f.records.get(base + '/narrativeLinks/' + linkId);
  assert.equal(link.sourceKey, sourceKey(sourceRef));
  assert.equal(link.sourceArcId, arcId);
  assert.equal(link.loreKey, digest(local));
  assert.equal(BOOK_RESTORE_METHODS.includes('advanceBookRestoreResources'), false);
  for (const method of [
    'advanceBookRestoreStructure',
    'advanceBookRestoreLore',
    'advanceBookRestoreResources',
  ])
    await assert.rejects(() => f.api[method](uid, mutation(id, p, 'resources-after-' + method)));
  assert.equal(
    [...f.records.keys()].some((k) => k.startsWith('publicBooks/')),
    false,
  );
});
test('children preceding absent parent headers remain fully discoverable and cancellable', async () => {
  const f = setup(),
    initial = await ready(f),
    first = (
      await f.api.advanceBookRestoreResources(uid, mutation(id, initial, 'resources-child-first01'))
    ).progress,
    m = mapper(first),
    base = 'books/' + first.bookId,
    sceneId = m.identity('scene', 'scene');
  assert.equal(f.records.has(base + '/scenes/' + sceneId), false);
  assert.equal(f.records.has(base + '/scenes/' + sceneId + '/body/current'), true);
  const terminal = await cleanupLegacyRestore(f.api, uid, id, first, { limit: 2 });
  assert.equal(terminal.state, 'cancelled');
  assert.equal(
    [...f.records.keys()].some((k) => k.startsWith(base + '/')),
    false,
  );
});
test('bounded v7 cancellation deletes registered children before parents and preserves source reservations and other books', async () => {
  const f = setup(),
    initial = await ready(f),
    p = await finishRestoreResources(f.factory, uid, id, initial),
    base = 'books/' + p.bookId;
  f.records.set('books/other/scenes/keep/body/current', { content: 'preserve' });
  let q = (await f.api.cancelBookRestore(uid, mutation(id, p, 'resources-cancel01'))).progress,
    unit = 0;
  assert.equal(q.integrity.cleanupPhase, 'resource-children');
  const removed = [];
  while (q.state !== 'cancelled') {
    const start = f.commits.length;
    q = (
      await f.api.advanceBookRestoreCleanup(
        uid,
        mutation(id, q, 'resources-clean-' + unit++, { limit: 2 }),
      )
    ).progress;
    const writes = f.commits.slice(start).flat(),
      native = writes.filter((w) => w.method === 'delete' && w.path.startsWith(base + '/'));
    assert.ok(native.length <= 2);
    removed.push(...native.map((w) => w.path));
    assert.ok(unit < 1000);
  }
  for (const parent of removed.filter((p) => /^books\/[^/]+\/(scenes|arcs)\/[^/]+$/.test(p)))
    for (const child of removed.filter((p) => p.startsWith(parent + '/')))
      assert.ok(removed.indexOf(child) < removed.indexOf(parent));
  assert.equal(
    [...f.records.keys()].some((k) => k.startsWith(base + '/')),
    false,
  );
  assert.equal(q.preparation.cleanedArtifacts, p.preparation.artifactCount);
  assert.equal(f.records.get('books/other/scenes/keep/body/current').content, 'preserve');
  assert.equal(f.records.has('bookRestoreReservations/' + p.bookId), true);
  assert.equal(f.records.has('deletedBooks/' + p.bookId), true);
});
test('duplicate logical links converge to their canonical native key using proven journals', async () => {
  const f = setup(),
    initial = await ready(f, resourcesRestoreFixture({ duplicates: true })),
    p = await finishRestoreResources(f.factory, uid, id, initial),
    base = 'books/' + p.bookId;
  assert.equal(p.preparation.resourceCounts['scene-reference'], 3);
  assert.equal(p.preparation.resourceCounts['narrative-link'], 4);
  assert.equal(
    [...f.records.keys()].filter((k) => k.startsWith(base + '/narrativeLinks/')).length,
    3,
  );
  assert.equal(
    [...f.records.keys()].filter((k) => k.startsWith(base + '/sceneLoreLinks/')).length,
    2,
  );
  for (const [path, value] of f.records) {
    if (
      path.startsWith(root + '/materializationArtifacts/') &&
      ['scene-reference', 'scene-lore-link', 'narrative-link'].includes(value.kind)
    )
      assert.equal(value.lastOperationId, value.createdByOperationId);
  }
  await cleanupLegacyRestore(f.api, uid, id, p, { limit: 7 });
});
for (const version of [1, 2, 3, 4, 5, 6])
  test(
    'legacy v' + version + ' prepares its actual scenes/narrative and stops before personas',
    async () => {
      const f = setup(),
        legacy = bookLegacyFixture(version),
        uploaded = await uploadLegacyRestore(f.api, uid, id, legacy),
        validated = await finishLegacyRestore(f.factory, uid, id, uploaded.progress),
        structure = await finishRestoreStructure(f.factory, uid, id, validated),
        lore = await finishRestoreLore(f.factory, uid, id, structure),
        p = await finishRestoreResources(f.factory, uid, id, lore);
      assert.equal(p.preparation.resourceCounts.scene, version >= 5 ? 1 : 0);
      assert.equal(p.preparation.resourceCounts.arc, version >= 6 ? 1 : 0);
      assert.equal(f.records.has('books/' + p.bookId), false);
      const reader = await f.api.openVerifiedBookRestoreContent(uid, {
        restoreId: id,
        jobToken: p.jobToken,
      });
      assert.ok(
        ['book-persona', 'book-personas'].includes(
          (await reader.readMappedItem(p.preparation.itemIndex)).record.kind,
        ),
      );
      await cleanupLegacyRestore(f.api, uid, id, p, { limit: 7 });
    },
  );
test('replay, historical operation resolver and same-checkpoint contenders never double resource counters', async () => {
  const f = setup(),
    initial = await ready(f),
    request = mutation(id, initial, 'resources-first-0001'),
    first = await f.api.advanceBookRestoreResources(uid, request);
  assert.deepEqual(await f.factory().advanceBookRestoreResources(uid, request), first);
  const results = await Promise.allSettled([
    f.api.advanceBookRestoreResources(uid, mutation(id, first.progress, 'resources-race-0001')),
    f
      .factory()
      .advanceBookRestoreResources(uid, mutation(id, first.progress, 'resources-race-0002')),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const current = await f.api.getBookRestore(uid, { restoreId: id }),
    resolved = await f.api.resolveBookRestoreOperation(uid, {
      restoreId: id,
      jobToken: initial.jobToken,
      operationId: request.operationId,
      requestHash: requestHash('advanceBookRestoreResources', mutationInput(request)),
    });
  assert.deepEqual(resolved.receipt, first.receipt);
  assert.equal(resolved.progress.checkpoint, current.checkpoint);
  await cleanupLegacyRestore(f.api, uid, id, current);
  assert.equal((await f.api.advanceBookRestoreResources(uid, request)).progress.state, 'cancelled');
});
test('unknown native children block parent deletion without erasing the child or its parent journal', async () => {
  for (const collection of ['body', 'planning', 'references', 'milestones']) {
    const f = setup(),
      initial = await ready(f),
      p = await finishRestoreResources(f.factory, uid, id, initial),
      m = mapper(p),
      parent =
        collection === 'milestones'
          ? 'books/' + p.bookId + '/arcs/' + m.identity('arc', 'arc')
          : 'books/' + p.bookId + '/scenes/' + m.identity('scene', 'scene'),
      path = parent + '/' + collection + '/foreign';
    f.records.set(path, { content: 'preserve' });
    let q = (await f.api.cancelBookRestore(uid, mutation(id, p, 'resources-foreign-cancel')))
      .progress;
    await assert.rejects(async () => {
      for (let unit = 0; unit < 100; unit++)
        q = (
          await f.api.advanceBookRestoreCleanup(
            uid,
            mutation(id, q, 'resources-foreign-' + unit, { limit: 50 }),
          )
        ).progress;
    });
    assert.equal(f.records.get(path).content, 'preserve');
    assert.equal(f.records.has(parent), true);
  }
});
test('native addressing rejects traversal, wrong parents, singleton keys and malformed hashes', () => {
  for (const [kind, id] of [
    ['scene', '../other'],
    ['scene-control', 'current'],
    ['scene-body', 'restore-' + 'a'.repeat(64) + ':other'],
    ['scene-reference', 'restore-' + 'a'.repeat(64) + ':../x'],
    ['milestone', 'restore-' + 'a'.repeat(64) + ':' + 'b'.repeat(64)],
    ['narrative-link', 'restore-' + 'a'.repeat(64)],
  ])
    assert.throws(() => bookRestoreResourcePath(kind, id));
  assert.equal(bookRestoreResourcePath('unknown', 'arbitrary'), null);
});

test('existing scene and narrative readers consume prepared native shapes in a synthetic root harness', async () => {
  const f = setup(),
    initial = await ready(f),
    p = await finishRestoreResources(f.factory, uid, id, initial),
    m = mapper(p),
    target = { kind: 'book', id: p.bookId },
    base = 'books/' + p.bookId;
  const { createScenesService } = await import('../src/scenes.mjs'),
    { createNarrativePlanningService } = await import('../src/narrativePlanning.mjs'),
    scenes = createScenesService({ db: f.db }),
    narrative = createNarrativePlanningService({ db: f.db });
  assert.equal(
    await scenes.getScene(uid, { target, sceneId: m.identity('scene', 'active') }),
    null,
  );
  // Test harness only: no production restoration service performs this activation.
  f.records.set(base, {
    authorId: uid,
    title: 'Harness',
    sceneRevision: 1,
    narrativeRevision: 1,
    updatedAt: p.preparation.timestamp,
  });
  const scene = await scenes.getScene(uid, { target, sceneId: m.identity('scene', 'active') });
  assert.equal(scene.content, '\ufeffActive own 🌙');
  assert.equal(scene.stage, 'writing');
  assert.equal(scene.group.id, m.identity('chapter', 'chapter'));
  const source = {
      kind: 'milestone',
      id: m.identity('milestone', 'milestone', 'arc'),
      arcId: m.identity('arc', 'arc'),
    },
    detail = await narrative.getNarrativeItem(uid, { target, source }),
    links = await narrative.listNarrativeReferences(uid, {
      target,
      source,
      cursor: null,
      limit: 10,
    });
  assert.equal(detail.kind, 'milestone');
  assert.equal(detail.rank, 'V');
  assert.equal(links.items.length, 1);
  assert.equal(links.items[0].reference.kind, 'lore');
  assert.equal(links.items[0].reference.reference.scopeId, p.bookId);
  f.records.delete(base);
  await cleanupLegacyRestore(f.api, uid, id, p);
});
test('storage failure and callback retry never consume a source item or duplicate derived indexes', async () => {
  const f = setup(),
    initial = await ready(f),
    run = f.db.runTransaction.bind(f.db),
    before = structuredClone([...f.records]),
    failure = new Error('native resource storage failed');
  let inject = true,
    automatic = false;
  f.db.runTransaction = async (operation) => {
    try {
      return await run(async (tx) => {
        const create = tx.create;
        tx.create = (ref, ...args) => {
          if (inject && ref.path.startsWith('books/')) throw failure;
          return create(ref, ...args);
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
  const request = mutation(id, initial, 'resources-storage-0001');
  await assert.rejects(
    () => f.api.advanceBookRestoreResources(uid, request),
    (e) => e === failure,
  );
  assert.deepEqual([...f.records], before);
  automatic = true;
  const result = await f.api.advanceBookRestoreResources(uid, request);
  assert.equal(result.progress.preparation.itemIndex, initial.preparation.itemIndex + 1);
  assert.equal(result.progress.preparation.resourceCounts['scene-body'], 1);
  assert.equal(result.progress.preparation.artifactCount, initial.preparation.artifactCount + 1);
  assert.deepEqual(await f.api.advanceBookRestoreResources(uid, request), result);
});
test('a stale source read resolves the receipt when the identical twin already prepared the item', async () => {
  const f = setup(),
    initial = await ready(f),
    doc = f.db.doc.bind(f.db),
    request = mutation(id, initial, 'resources-identical-0001');
  let twin;
  f.db.doc = (path) => {
    const ref = doc(path);
    if (
      path ===
      root + '/validationItems/' + String(initial.preparation.itemIndex).padStart(15, '0')
    )
      return {
        ...ref,
        get: async () => {
          const snapshot = await ref.get();
          if (!twin) {
            twin = true;
            twin = await f.factory().advanceBookRestoreResources(uid, request);
          }
          return snapshot;
        },
      };
    return ref;
  };
  assert.deepEqual(await f.api.advanceBookRestoreResources(uid, request), twin);
});
test('cancellation during the source read prevents every new resource and receipt', async () => {
  const f = setup(),
    initial = await ready(f),
    doc = f.db.doc.bind(f.db),
    before = new Set(f.records.keys());
  let intercepted = false;
  f.db.doc = (path) => {
    const ref = doc(path);
    if (
      path ===
      root + '/validationItems/' + String(initial.preparation.itemIndex).padStart(15, '0')
    )
      return {
        ...ref,
        get: async () => {
          const snapshot = await ref.get();
          if (!intercepted) {
            intercepted = true;
            await f.api.cancelBookRestore(uid, mutation(id, initial, 'resources-reading-cancel'));
          }
          return snapshot;
        },
      };
    return ref;
  };
  const request = mutation(id, initial, 'resources-reading-append');
  await assert.rejects(() => f.api.advanceBookRestoreResources(uid, request));
  assert.equal(intercepted, true);
  assert.equal(
    [...f.records.keys()].some((k) => k.startsWith('books/') && !before.has(k)),
    false,
  );
  assert.equal(
    f.records.has('users/' + uid + '/bookRestoreOperations/' + request.operationId),
    false,
  );
});
for (const kind of ['target', 'journal', 'receipt'])
  test(
    'recreated nested ' + kind + ' blocks cleanup instead of removing an unproven child',
    async () => {
      const f = setup(),
        initial = await ready(f),
        p = (
          await f.api.advanceBookRestoreResources(
            uid,
            mutation(id, initial, 'resources-aba-first01'),
          )
        ).progress,
        journal = [...f.records].find(
          ([k, v]) => k.startsWith(root + '/materializationArtifacts/') && v.kind === 'scene-body',
        ),
        target = 'books/' + p.bookId + '/' + bookRestoreResourcePath('scene-body', journal[1].id),
        path =
          kind === 'target'
            ? target
            : kind === 'journal'
              ? journal[0]
              : 'users/' + uid + '/bookRestoreOperations/' + journal[1].lastOperationId,
        value = structuredClone(f.records.get(path));
      await f.db.runTransaction((tx) => tx.delete(f.db.doc(path)));
      await f.db.runTransaction((tx) => tx.create(f.db.doc(path), value));
      const q = (await f.api.cancelBookRestore(uid, mutation(id, p, 'resources-aba-cancel01')))
        .progress;
      const before = structuredClone([...f.records]);
      await assert.rejects(() =>
        f.api.advanceBookRestoreCleanup(
          uid,
          mutation(id, q, 'resources-aba-clean01', { limit: 50 }),
        ),
      );
      assert.deepEqual([...f.records], before);
      assert.equal(f.records.has(target), true);
    },
  );
test('new namespaces are checked before upgrade and again at final cancellation certification', async () => {
  for (const late of [false, true]) {
    const f = setup(),
      initial = await ready(f),
      path = 'books/' + initial.bookId + '/sceneLoreLinks/foreign';
    if (!late) {
      f.records.set(path, { details: 'preserve' });
      const before = structuredClone([...f.records]);
      await assert.rejects(() =>
        f.api.advanceBookRestoreResources(uid, mutation(id, initial, 'resources-existing01')),
      );
      assert.deepEqual([...f.records], before);
    } else {
      const p = await finishRestoreResources(f.factory, uid, id, initial);
      let q = (await f.api.cancelBookRestore(uid, mutation(id, p, 'resources-final-cancel')))
          .progress,
        unit = 0;
      while (q.integrity.cleanupPhase !== 'state') {
        q = (
          await f.api.advanceBookRestoreCleanup(
            uid,
            mutation(id, q, 'resources-final-' + unit++, { limit: 50 }),
          )
        ).progress;
        assert.ok(unit < 100);
      }
      f.records.set(path, { details: 'preserve' });
      await assert.rejects(() =>
        f.api.advanceBookRestoreCleanup(
          uid,
          mutation(id, q, 'resources-final-refuse', { limit: 50 }),
        ),
      );
    }
    assert.equal(f.records.get(path).details, 'preserve');
  }
});

test('v7 nested resources and v5 large frozen chapter bodies cancel through both inventories', async () => {
  const f = setup(),
    legacy = bookLegacyFixture(5);
  legacy.chapters[0].content = '\ufeff' + 'frozen '.repeat(90000);
  const uploaded = await uploadLegacyRestore(f.api, uid, id, legacy),
    validated = await finishLegacyRestore(f.factory, uid, id, uploaded.progress),
    structure = await finishRestoreStructure(f.factory, uid, id, validated);
  assert.equal(f.records.get(root).cleanupVersion, 5);
  const lore = await finishRestoreLore(f.factory, uid, id, structure),
    p = await finishRestoreResources(f.factory, uid, id, lore),
    base = 'books/' + p.bookId;
  assert.equal(
    [...f.records.keys()].some((k) => k.startsWith(base + '/bookTextBodies/')),
    true,
  );
  const terminal = await cleanupLegacyRestore(f.api, uid, id, p, { limit: 3 });
  assert.equal(terminal.preparation.cleanedArtifacts, p.preparation.artifactCount);
  assert.equal(
    [...f.records.keys()].some((k) => k.startsWith(base + '/')),
    false,
  );
});
