import test from 'node:test';
import assert from 'node:assert/strict';
import { studioDb } from './helpers/studioDb.mjs';
import { createScenesService } from '../src/scenes.mjs';
import { digest, prose } from '../src/sceneContracts.mjs';
import { sceneRankBetween, validSceneRank } from '../src/sceneRanks.mjs';

const target = { kind: 'book', id: 'book' };
const op = (n) => `scene-operation-${String(n).padStart(4, '0')}`;
function fixture() {
  const fixture = studioDb();
  fixture.records.set('books/book', {
    authorId: 'author',
    title: 'Livro',
    status: 'draft',
    createdAt: 1,
    updatedAt: 100,
    wordCount: 2,
  });
  fixture.records.set('books/book/chapters/legacy', {
    title: 'Original',
    content: '<p>Texto original</p>',
    wordCount: 2,
    order: 1,
    updatedAt: 100,
    createdAt: 1,
    customLegacy: { preserve: 'sim' },
  });
  const api = createScenesService({ db: fixture.db, now: () => 200 });
  return { ...fixture, api };
}
async function chapter(api, n = 1) {
  return api.createSceneGroup('author', { target, operationId: op(n), title: 'Capítulo novo' });
}
async function scene(api, parentId = null, n = 2, content = '<p>Um texto</p>') {
  return api.createScene('author', {
    target,
    operationId: op(n),
    parentId,
    title: `Cena ${n}`,
    content,
    planning: { objective: 'segredo' },
  });
}
const finish = async (call) => {
  let result;
  for (let i = 0; i < 100; i++) {
    result = await call();
    if (result.complete) return result;
  }
  assert.fail('Job did not finish');
};

test('creation is typed/private, idempotent, bounded and never attaches implicitly to a legacy chapter', async () => {
  const { api, records } = fixture();
  await assert.rejects(scene(api, 'legacy'), { code: 'failed-precondition' });
  const request = { target, operationId: op(2), title: 'Cena', content: '<p>Um texto</p>' };
  const result = await api.createScene('author', request);
  assert.equal(result.scene.parentId, null);
  assert.equal(result.scene.wordCount, 2);
  assert.equal(records.get('books/book').wordCount, 2);
  assert.deepEqual(await api.createScene('author', request), result);
  assert.equal(
    [...records.keys()].filter((key) => /^books\/book\/scenes\/[^/]+$/.test(key)).length,
    1,
  );
  await assert.rejects(api.createScene('author', { ...request, content: 'Outro' }), {
    code: 'invalid-argument',
  });
  assert.equal('content' in records.get(`users/author/sceneOperations/${op(2)}`), false);
  await assert.rejects(
    api.createScene('author', { ...request, operationId: op(3), ownerId: 'other' }),
    { code: 'invalid-argument' },
  );
});

test('manual edits use scene CAS and preserve body and form after rejected stale retries', async () => {
  const { api, records } = fixture(),
    group = await chapter(api),
    created = await scene(api, group.id);
  const edit = {
    target,
    operationId: op(3),
    sceneId: created.scene.id,
    expectedRevision: 1,
    patch: {
      content: '<p>Três novas palavras</p>',
      planning: { conflict: 'privado' },
      stage: 'writing',
    },
  };
  const saved = await api.updateScene('author', edit);
  assert.equal(saved.scene.wordCount, 3);
  assert.equal(records.get('books/book').wordCount, 5);
  assert.equal(
    (await api.getScene('author', { target, sceneId: saved.scene.id })).planning.objective,
    'segredo',
  );
  assert.deepEqual(await api.updateScene('author', edit), saved);
  await api.updateScene('author', {
    ...edit,
    operationId: op(4),
    expectedRevision: 2,
    patch: { title: 'Novo título' },
  });
  await assert.rejects(
    api.updateScene('author', edit),
    (error) => error.details?.reason === 'revision-conflict',
  );
  assert.equal(
    records.get(`books/book/scenes/${saved.scene.id}/body/current`).content,
    edit.patch.content,
  );
});

test('moving uses observed structural versions and neighbors, preserves prosa/references and updates counts atomically', async () => {
  const { api, records } = fixture(),
    first = await chapter(api),
    second = await chapter(api, 3),
    a = await scene(api, first.id, 2),
    b = await scene(api, second.id, 4);
  const input = {
    target,
    operationId: op(5),
    sceneId: a.scene.id,
    expectedRevision: 1,
    parentId: second.id,
    beforeId: b.scene.id,
    expectedSourceStructureRevision: 1,
    expectedTargetStructureRevision: 1,
  };
  const moved = await api.moveScene('author', input);
  assert.ok(moved.scene.rank < b.scene.rank);
  assert.equal(records.get(`books/book/chapters/${first.id}`).wordCount, 0);
  assert.equal(records.get(`books/book/chapters/${second.id}`).wordCount, 4);
  assert.equal(records.get('books/book').wordCount, 6);
  assert.equal(
    (await api.getScene('author', { target, sceneId: a.scene.id })).content,
    '<p>Um texto</p>',
  );
  await assert.rejects(
    api.moveScene('author', { ...input, operationId: op(6), expectedRevision: 2 }),
    (error) => error.details?.reason === 'revision-conflict',
  );
});

test('archive excludes composition and restores to the end without losing editable archived prose', async () => {
  const { api, records } = fixture(),
    group = await chapter(api),
    first = await scene(api, group.id),
    second = await scene(api, group.id, 3);
  const archived = await api.archiveScene('author', {
    target,
    sceneId: first.scene.id,
    operationId: op(4),
    expectedRevision: 1,
    archived: true,
  });
  assert.equal(records.get('books/book').wordCount, 4);
  const edited = await api.updateScene('author', {
    target,
    sceneId: first.scene.id,
    operationId: op(5),
    expectedRevision: archived.scene.revision,
    patch: { content: '<p>Texto maior com palavras</p>' },
  });
  assert.equal(records.get('books/book').wordCount, 4);
  const restored = await api.archiveScene('author', {
    target,
    sceneId: first.scene.id,
    operationId: op(6),
    expectedRevision: edited.scene.revision,
    archived: false,
  });
  assert.ok(restored.scene.rank > second.scene.rank);
  assert.equal(records.get('books/book').wordCount, 8);
  const assembly = await api.readSceneAssembly('author', {
    target,
    parentId: group.id,
    expectedAssemblyRevision: restored.groups[0].assemblyRevision,
  });
  assert.deepEqual(
    assembly.items.map((item) => item.id),
    [second.scene.id, first.scene.id],
  );
});

test('explicit conversion preserves complete legacy source once and rejects stale source without any mutation', async () => {
  const { api, records } = fixture(),
    original = structuredClone(records.get('books/book/chapters/legacy'));
  const detail = await api.getSceneGroup('author', { target, parentId: 'legacy' });
  await assert.rejects(
    api.convertChapterToScenes('author', {
      target,
      parentId: 'legacy',
      operationId: op(1),
      expectedSourceVersion: digest({}),
    }),
    (error) => error.details?.reason === 'revision-conflict',
  );
  assert.deepEqual(records.get('books/book/chapters/legacy'), original);
  const input = {
    target,
    parentId: 'legacy',
    operationId: op(2),
    expectedSourceVersion: detail.sourceVersion,
  };
  const result = await api.convertChapterToScenes('author', input);
  assert.deepEqual(await api.convertChapterToScenes('author', input), result);
  assert.equal(records.get('books/book').wordCount, 2);
  assert.equal(records.get('books/book/chapters/legacy').content, original.content);
  assert.deepEqual(records.get('books/book/sceneSources/legacy').original, original);
  const sources = await api.listSceneSources('author', {
    target,
    expectedProjectRevision: result.projectRevision,
  });
  assert.deepEqual({ ...sources.items[0].original, content: sources.items[0].content }, original);
  assert.equal('content' in sources.items[0].original, false);
});

test('pages contain summaries only, reject changed revisions and scopes, and preserve missing-order legacy groups', async () => {
  const { api, records } = fixture(),
    group = await chapter(api);
  records.set('books/book/chapters/missing-order', {
    title: 'Sem ordem',
    content: '',
    updatedAt: 1,
  });
  for (let n = 2; n < 5; n++) await scene(api, group.id, n);
  const page = await api.listScenes('author', { target, parentId: group.id, limit: 2 });
  assert.equal(page.items.length, 2);
  assert.ok(page.nextCursor);
  assert.equal('content' in page.items[0], false);
  assert.equal('planning' in page.items[0], false);
  const next = await api.listScenes('author', {
    target,
    parentId: group.id,
    limit: 2,
    cursor: page.nextCursor,
  });
  assert.equal(next.items.length, 1);
  await assert.rejects(
    api.listScenes('author', { target, parentId: null, cursor: page.nextCursor }),
    { code: 'invalid-argument' },
  );
  await api.updateScene('author', {
    target,
    sceneId: page.items[0].id,
    operationId: op(6),
    expectedRevision: 1,
    patch: { title: 'Mudou' },
  });
  await assert.rejects(
    api.listScenes('author', { target, parentId: group.id, cursor: page.nextCursor }),
    (error) => error.details?.reason === 'revision-conflict',
  );
  const groups = await api.listSceneGroups('author', { target });
  assert.ok(groups.items.some((item) => item.id === 'missing-order'));
});

test('legacy group metadata invalidates a cursor without weakening UID, target or filter scope', async () => {
  const { api, records } = fixture();
  await chapter(api);
  const first = await api.listSceneGroups('author', { target, limit: 1 });
  assert.ok(first.nextCursor);
  const original = records.get('books/book');
  records.set('books/book', { ...original, updatedAt: original.updatedAt + 1 });
  await assert.rejects(
    api.listSceneGroups('author', { target, limit: 1, cursor: first.nextCursor }),
    { code: 'failed-precondition', details: { reason: 'revision-conflict' } },
  );
  const refresh = await api.listSceneGroups('author', { target, limit: 1 });
  assert.ok(refresh.nextCursor);
  assert.equal(refresh.projectRevision, first.projectRevision);
  const token = JSON.parse(Buffer.from(first.nextCursor, 'base64url').toString());
  for (const patch of [
    { uid: 'another-author' },
    { target: { kind: 'book', id: 'another-book' } },
    { kind: 'scenes' },
    { stage: 'planned' },
    { updatedAt: 'invalid' },
  ]) {
    const cursor = Buffer.from(
      JSON.stringify({
        ...token,
        context: { ...token.context, ...patch },
      }),
    ).toString('base64url');
    await assert.rejects(api.listSceneGroups('author', { target, cursor }), {
      code: 'invalid-argument',
    });
  }
});

test('the complete persisted body envelope includes revision and rejects create, update and conversion without any writes', async () => {
  const oversized = '\u0000'.repeat(20000) + 'a'.repeat(779906);
  assert.equal(Buffer.byteLength(oversized), 799906);
  assert.equal(Buffer.byteLength(JSON.stringify(prose(oversized).body)), 899994);
  const { api, records } = fixture();
  const beforeCreate = structuredClone([...records]);
  await assert.rejects(scene(api, null, 2, oversized), { code: 'invalid-argument' });
  assert.deepEqual([...records], beforeCreate);
  const created = await scene(api, null, 2, oversized.slice(0, -7));
  assert.equal(
    Buffer.byteLength(
      JSON.stringify(records.get(`books/book/scenes/${created.scene.id}/body/current`)),
    ),
    900000,
  );
  const beforeUpdate = structuredClone([...records]);
  await assert.rejects(
    api.updateScene('author', {
      target,
      sceneId: created.scene.id,
      operationId: op(3),
      expectedRevision: 1,
      patch: { content: oversized },
    }),
    { code: 'invalid-argument' },
  );
  assert.deepEqual([...records], beforeUpdate);
  records.set('books/book/chapters/legacy', {
    ...records.get('books/book/chapters/legacy'),
    content: oversized,
  });
  const detail = await api.getSceneGroup('author', { target, parentId: 'legacy' });
  const beforeConvert = structuredClone([...records]);
  await assert.rejects(
    api.convertChapterToScenes('author', {
      target,
      parentId: 'legacy',
      operationId: op(4),
      expectedSourceVersion: detail.sourceVersion,
    }),
    { code: 'invalid-argument' },
  );
  assert.deepEqual([...records], beforeConvert);
});

test('composition has revision and byte guards, preserves Unicode rich text and excludes private plan', async () => {
  const { api } = fixture(),
    group = await chapter(api);
  for (const n of [2, 3])
    await scene(
      api,
      group.id,
      n,
      `<blockquote><p><strong>${'á'.repeat(280000)}</strong></p></blockquote>`,
    );
  const detail = await api.getSceneGroup('author', { target, parentId: group.id });
  const first = await api.readSceneAssembly('author', {
    target,
    parentId: group.id,
    expectedAssemblyRevision: detail.group.assemblyRevision,
  });
  assert.equal(first.items.length, 1);
  assert.ok(first.nextCursor);
  assert.equal('planning' in first.items[0], false);
  const second = await api.readSceneAssembly('author', {
    target,
    parentId: group.id,
    expectedAssemblyRevision: detail.group.assemblyRevision,
    cursor: first.nextCursor,
  });
  assert.equal(second.items.length, 1);
  assert.equal(second.nextCursor, null);
  await api.updateScene('author', {
    target,
    sceneId: first.items[0].id,
    operationId: op(4),
    expectedRevision: 1,
    patch: { content: 'Outro texto' },
  });
  await assert.rejects(
    api.readSceneAssembly('author', {
      target,
      parentId: group.id,
      expectedAssemblyRevision: detail.group.assemblyRevision,
      cursor: first.nextCursor,
    }),
    (error) => error.details?.reason === 'revision-conflict',
  );
});

test('rebalance is resumable, locks structure, keeps old ranks until atomic slot switch and preserves content', async () => {
  const { api, records } = fixture(),
    group = await chapter(api);
  const scenes = [];
  for (let n = 2; n < 6; n++) scenes.push(await scene(api, group.id, n));
  const initial = scenes.map((item) => item.scene.rank),
    request = { target, parentId: group.id, operationId: op(7), limit: 2 };
  assert.deepEqual(await api.rebalanceSceneRanks('author', request), {
    complete: false,
    processed: 2,
  });
  assert.equal(records.get(`books/book/chapters/${group.id}`).rankSlot, 'A');
  assert.deepEqual(
    scenes.map((item) => records.get(`books/book/scenes/${item.scene.id}`).rankA),
    initial,
  );
  await assert.rejects(scene(api, group.id, 8), { code: 'failed-precondition' });
  await api.updateScene('author', {
    target,
    sceneId: scenes[0].scene.id,
    operationId: op(9),
    expectedRevision: 1,
    patch: { content: 'Continua editável' },
  });
  const completed = await finish(() => api.rebalanceSceneRanks('author', request));
  assert.equal(completed.processed, 4);
  assert.equal(records.get(`books/book/chapters/${group.id}`).rankSlot, 'B');
  const list = await api.listScenes('author', { target, parentId: group.id });
  assert.deepEqual(
    list.items.map((item) => item.id),
    scenes.map((item) => item.scene.id),
  );
  assert.ok(list.items.every((item) => validSceneRank(item.rank)));
});

test('mixed group deletion marks all atomically and resumes bounded detachment, preserving original sources', async () => {
  const { api, records } = fixture(),
    legacy = await api.getSceneGroup('author', { target, parentId: 'legacy' });
  await api.convertChapterToScenes('author', {
    target,
    parentId: 'legacy',
    operationId: op(1),
    expectedSourceVersion: legacy.sourceVersion,
  });
  const second = await chapter(api, 2);
  await scene(api, second.id, 3);
  await scene(api, second.id, 4);
  const selections = ['legacy', second.id].map((id) => ({
    id,
    expectedUpdatedAt: records.get(`books/book/chapters/${id}`).updatedAt,
  }));
  await assert.rejects(
    api.deleteSceneGroups('author', {
      target,
      operationId: op(5),
      groups: selections.map((item, index) => (index ? { ...item, expectedUpdatedAt: 1 } : item)),
    }),
    (error) => error.details?.reason === 'revision-conflict',
  );
  assert.equal(records.get('books/book/chapters/legacy').deleting, undefined);
  const request = { target, operationId: op(6), groups: selections, limit: 1 };
  const started = await api.deleteSceneGroups('author', request);
  assert.equal(started.complete, false);
  assert.equal(records.get(`books/book/chapters/${second.id}`).deleting, true);
  assert.equal(records.get('books/book').wordCount, 0);
  await finish(() => api.deleteSceneGroups('author', request));
  assert.equal(records.has('books/book/chapters/legacy'), false);
  assert.equal(records.has(`books/book/chapters/${second.id}`), false);
  assert.ok(records.has('books/book/sceneSources/legacy'));
  const unassigned = await api.listScenes('author', { target, parentId: null });
  assert.equal(unassigned.items.length, 3);
  assert.ok(unassigned.items.every((item) => item.formerParentId));
});

test('book cleanup is bounded, requires revocation, keeps sentinel until children gone and never recreates on retry', async () => {
  const { api, records } = fixture(),
    group = await chapter(api),
    created = await scene(api, group.id);
  records.set(`books/book/scenes/${created.scene.id}/references/ref`, {
    kind: 'book',
    scopeId: 'book',
    entityId: 'lore',
  });
  const request = { target, operationId: op(7), limit: 1 };
  await assert.rejects(api.deleteSceneBook('author', request), { code: 'failed-precondition' });
  records.set('books/book', { ...records.get('books/book'), deleting: true });
  records.set('publicBooks/book', { revisionId: 'r1' });
  await assert.rejects(api.deleteSceneBook('author', request), { code: 'failed-precondition' });
  records.delete('publicBooks/book');
  const result = await finish(() => api.deleteSceneBook('author', request));
  assert.equal(records.has('books/book'), false);
  assert.ok(records.has('deletedBooks/book'));
  assert.equal([...records.keys()].filter((key) => key.startsWith('books/book/')).length, 0);
  assert.deepEqual(await api.deleteSceneBook('author', request), result);
});

test('references authorize exact identities and remain unavailable after removal without names or content', async () => {
  const { api, records } = fixture(),
    created = await scene(api);
  records.set('books/book/lore/entity', { name: 'NPC', category: 'character', details: 'Privado' });
  const request = {
    target,
    sceneId: created.scene.id,
    operationId: op(3),
    expectedRevision: 1,
    reference: { kind: 'book', scopeId: 'book', entityId: 'entity' },
  };
  await api.setSceneReference('author', request);
  let page = await api.listSceneReferences('author', { target, sceneId: created.scene.id });
  assert.equal(page.items[0].name, 'NPC');
  assert.equal('details' in page.items[0], false);
  records.delete('books/book/lore/entity');
  page = await api.listSceneReferences('author', { target, sceneId: created.scene.id });
  assert.equal(page.items[0].available, false);
  assert.equal('name' in page.items[0], false);
  await assert.rejects(
    api.setSceneReference('author', {
      ...request,
      operationId: op(4),
      expectedRevision: 2,
      reference: { ...request.reference, scopeId: 'other' },
    }),
    { code: 'permission-denied' },
  );
});

test('adventure parts/scenes are real resources, not books, and ownership is uniform on detail gets', async () => {
  const { api, records } = fixture(),
    adventure = { kind: 'adventure', id: 'adventure' };
  records.set('adventures/adventure', { ownerId: 'author', title: 'Aventura', updatedAt: 1 });
  const part = await api.createSceneGroup('author', {
    target: adventure,
    operationId: op(1),
    title: 'Parte um',
  });
  const created = await api.createScene('author', {
    target: adventure,
    operationId: op(2),
    title: 'Encontro',
    parentId: part.id,
    content: 'Texto da aventura',
  });
  assert.equal(
    (await api.getScene('author', { target: adventure, sceneId: created.scene.id })).project.kind,
    'adventure',
  );
  assert.equal(await api.getScene('other', { target: adventure, sceneId: created.scene.id }), null);
  assert.equal(await api.getSceneGroup('other', { target: adventure, parentId: part.id }), null);
  assert.equal(
    [...records.keys()].filter((key) => key.startsWith('books/') && key.includes(op(2))).length,
    0,
  );
});

test('native fractional ranks admit ordered insertions and fail explicitly at the bounded index budget', () => {
  let lower = null;
  const ranks = [];
  for (let n = 0; n < 50; n++) {
    lower = sceneRankBetween(lower);
    ranks.push(lower);
  }
  assert.deepEqual([...ranks].sort(), ranks);
  assert.ok(sceneRankBetween(ranks[0], ranks[1]) > ranks[0]);
  assert.throws(() => sceneRankBetween('V'.repeat(128), 'V'.repeat(128) + 'V'), {
    code: 'failed-precondition',
  });
  assert.throws(() => prose('😀'.repeat(200001)), { code: 'invalid-argument' });
  assert.throws(() => prose('\\'.repeat(600000)), { code: 'invalid-argument' });
});

test('private job discovery permits reload and new book operation IDs adopt the same cleanup checkpoint', async () => {
  const { api, records } = fixture(),
    grouping = await chapter(api),
    created = await scene(api, grouping.id);
  const request = { target, parentId: grouping.id, operationId: op(4), limit: 1 };
  await api.rebalanceSceneRanks('author', request);
  const detail = await api.getSceneGroup('author', { target, parentId: grouping.id });
  assert.equal(detail.group.rebalanceOperationId, request.operationId);
  const job = await api.getSceneJob('author', { target, operationId: request.operationId });
  assert.deepEqual(job.input, { target, parentId: grouping.id, operationId: request.operationId });
  assert.equal(job.kind, 'rebalance');
  assert.equal(await api.getSceneJob('other', { target, operationId: request.operationId }), null);
  assert.equal(
    await api.getSceneJob('author', {
      target: { kind: 'book', id: 'other' },
      operationId: request.operationId,
    }),
    null,
  );
  records.set('books/book', { ...records.get('books/book'), deleting: true });
  await api.deleteSceneBook('author', { target, operationId: op(5), limit: 1 });
  const checkpoint = records.get('books/book').sceneDeletionOperationId;
  assert.equal(checkpoint, op(5));
  const finished = await finish(() =>
    api.deleteSceneBook('author', { target, operationId: op(6), limit: 1 }),
  );
  assert.equal(finished.complete, true);
  assert.equal(records.get(`users/author/sceneOperations/${op(6)}`).checkpointId, checkpoint);
  assert.deepEqual(await api.deleteSceneBook('author', { target, operationId: op(6) }), finished);
  assert.equal(records.has(`books/book/scenes/${created.scene.id}`), false);
});

test('Unicode references, inline boundaries and source pages retain exact identities and do not invent words', async () => {
  assert.equal(prose('<p><strong>abra</strong>cadabra A&amp;B &#32; C</p>').wordCount, 3);
  assert.equal(prose('<p>Um</p><p>texto</p>').wordCount, 2);
  const { api, records } = fixture(),
    id = 'á'.repeat(300);
  records.set(`books/book/chapters/${id}`, { title: 'Longo ID', content: '', updatedAt: 1 });
  records.set('books/book/chapters/zzzz', { title: 'Depois', content: '', updatedAt: 1 });
  const first = await api.listSceneGroups('author', { target, limit: 1 });
  const second = await api.listSceneGroups('author', {
    target,
    limit: 1,
    cursor: first.nextCursor,
  });
  const third = await api.listSceneGroups('author', {
    target,
    limit: 1,
    cursor: second.nextCursor,
  });
  assert.equal(third.items[0].id, id);
});

test('legacy missing dates are explicit version zero for observed deletion, and sources paginate by bytes after parents are removed', async () => {
  const { api, records } = fixture();
  records.set('books/book/chapters/undated', { title: 'Legado sem data', content: '' });
  const detail = await api.getSceneGroup('author', { target, parentId: 'undated' });
  assert.equal(detail.group.updatedAt, 0);
  await finish(() =>
    api.deleteSceneGroup('author', {
      target,
      parentId: 'undated',
      expectedUpdatedAt: detail.group.updatedAt,
      operationId: op(10),
      limit: 1,
    }),
  );
  assert.equal(records.has('books/book/chapters/undated'), false);
  for (const [index, id] of ['large-a', 'large-b'].entries()) {
    records.set(`books/book/chapters/${id}`, {
      title: id,
      content: 'a'.repeat(550000),
      updatedAt: 1,
      preserved: { id },
    });
    const source = await api.getSceneGroup('author', { target, parentId: id });
    await api.convertChapterToScenes('author', {
      target,
      parentId: id,
      operationId: op(20 + index),
      expectedSourceVersion: source.sourceVersion,
    });
  }
  const expectedProjectRevision = records.get('books/book').sceneRevision;
  const first = await api.listSceneSources('author', { target, expectedProjectRevision });
  assert.equal(first.items.length, 1);
  assert.ok(first.nextCursor);
  const second = await api.listSceneSources('author', {
    target,
    expectedProjectRevision,
    cursor: first.nextCursor,
  });
  assert.equal(second.items.length, 1);
  assert.equal(second.nextCursor, null);
  assert.equal(first.items[0].content.length, 550000);
  await chapter(api, 30);
  await assert.rejects(
    api.listSceneSources('author', { target, expectedProjectRevision, cursor: first.nextCursor }),
    (error) => error.details?.reason === 'revision-conflict',
  );
});
