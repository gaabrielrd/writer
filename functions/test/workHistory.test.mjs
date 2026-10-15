import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkHistoryService } from '../src/workHistory.mjs';
import { createScenesService } from '../src/scenes.mjs';
import { createWorkProgressService } from '../src/workProgress.mjs';
import { digest, CHUNK_BYTES, splitHistoryContent } from '../src/workHistoryContracts.mjs';
import { studioDb } from './helpers/studioDb.mjs';

const target = { kind: 'book', id: 'book' },
  resource = { kind: 'chapter', id: 'chapter' },
  op = (id) => 'history-operation-' + id;
function fixture() {
  const f = studioDb();
  f.records.set('books/book', {
    authorId: 'author',
    title: 'Livro',
    status: 'published',
    wordCount: 99,
    createdAt: 1,
    updatedAt: 100,
  });
  f.records.set('books/book/chapters/chapter', {
    id: 'chapter',
    bookId: 'book',
    title: 'Capítulo',
    order: 1,
    content: '<p>Texto original</p>',
    wordCount: 2,
    createdAt: 1,
    updatedAt: 100,
  });
  f.records.set('users/author', { credits: 7 });
  return {
    ...f,
    api: createWorkHistoryService({ db: f.db, now: () => 500 }),
    progress: createWorkProgressService({ db: f.db, now: () => 600 }),
    scenes: createScenesService({ db: f.db, now: () => 700 }),
  };
}
const source = (f, res = resource) =>
  f.api.getWorkVersionSource('author', { target, resource: res });
async function capture(f, id, res = resource, label) {
  const current = await source(f, res);
  return f.api.createWorkVersion('author', {
    target,
    resource: res,
    operationId: op(id),
    expectedSourceToken: current.sourceToken,
    ...(label ? { label } : {}),
  });
}
async function body(f, versionId) {
  let cursor = null,
    result = '';
  do {
    const page = await f.api.readWorkVersion('author', { target, versionId, cursor });
    result += page.chunks.map((chunk) => chunk.content).join('');
    cursor = page.nextCursor;
  } while (cursor);
  return result;
}
async function save(f, content, id) {
  return f.progress.saveLegacyChapter('author', {
    bookId: 'book',
    chapterId: 'chapter',
    operationId: op(id),
    expectedContentHash: (await source(f)).contentHash,
    content,
  });
}
const versions = (f) =>
  [...f.records.keys()].filter((key) => key.startsWith('books/book/workVersions/'));

test('opening history is read-only; manual capture protects legacy writing without changing prose, dates, count, publication or credits', async () => {
  const f = fixture(),
    before = structuredClone(f.records.get('books/book/chapters/chapter'));
  const initial = await source(f);
  assert.equal(initial.revision, null);
  assert.equal(f.records.get('books/book').hasProgressResources, undefined);
  assert.deepEqual(await f.api.listWorkVersions('author', { target }), {
    items: [],
    nextCursor: null,
  });
  const result = await capture(f, 'manual', resource, ' Primeira ');
  assert.equal(result.version.label, 'Primeira');
  assert.equal(result.version.reason, 'manual');
  assert.equal(result.version.contentHash, digest(before.content));
  assert.equal(f.records.get('books/book').hasProgressResources, true);
  assert.equal(f.records.get('books/book').wordCount, 99);
  assert.equal(f.records.get('books/book').updatedAt, 100);
  assert.equal(f.records.get('books/book').status, 'published');
  assert.deepEqual(f.records.get('books/book/chapters/chapter'), before);
  assert.equal((await source(f)).sourceToken, initial.sourceToken);
  assert.equal(f.records.get('users/author').credits, 7);
  assert.equal(await body(f, result.version.id), before.content);
  assert.equal('content' in result.version, false);
  assert.equal(f.records.get('books/book/workProgress/current').countReady, false);
  assert.equal(versions(f).length, 1);
});

test('precise snapshot tokens distinguish nanoseconds, ABA and metadata changes without depending on unrelated project changes', async () => {
  const f = fixture(),
    path = 'books/book/chapters/chapter';
  f.metadata.set(path, { updatedAt: 20, updatedAtNanoseconds: 1 });
  const first = await source(f);
  f.records.get('books/book').updatedAt = 200;
  assert.equal((await source(f)).sourceToken, first.sourceToken);
  f.metadata.set(path, { updatedAt: 20, updatedAtNanoseconds: 2 });
  assert.notEqual((await source(f)).sourceToken, first.sourceToken);
  await assert.rejects(
    f.api.createWorkVersion('author', {
      target,
      resource,
      operationId: op('stale'),
      expectedSourceToken: first.sourceToken,
    }),
    { code: 'failed-precondition' },
  );
  assert.equal(versions(f).length, 0);
  f.metadata.delete(path);
  const old = await source(f);
  await f.db.runTransaction(async (tx) => {
    tx.update(f.db.doc(path), { content: 'B' });
  });
  await f.db.runTransaction(async (tx) => {
    tx.update(f.db.doc(path), { content: old.content });
  });
  assert.notEqual((await source(f)).sourceToken, old.sourceToken);
  const current = await source(f);
  await f.db.runTransaction(async (tx) => {
    tx.update(f.db.doc(path), { title: 'Outro título' });
  });
  assert.notEqual((await source(f)).sourceToken, current.sourceToken);
});

test('capture retries create one immutable version, validate payload and never regenerate a deleted version', async () => {
  const f = fixture(),
    current = await source(f),
    request = {
      target,
      resource,
      operationId: op('retry'),
      expectedSourceToken: current.sourceToken,
    };
  const [first, second] = await Promise.all([
    f.api.createWorkVersion('author', request),
    f.api.createWorkVersion('author', request),
  ]);
  assert.deepEqual(first, second);
  assert.equal(versions(f).length, 1);
  await save(f, 'Outro texto salvo', 'save');
  assert.deepEqual(await f.api.createWorkVersion('author', request), first);
  await assert.rejects(f.api.createWorkVersion('author', { ...request, label: 'Outro' }), {
    code: 'invalid-argument',
  });
  await f.api.deleteWorkVersion('author', {
    target,
    versionId: first.version.id,
    operationId: op('delete'),
  });
  await assert.rejects(f.api.createWorkVersion('author', request), { code: 'not-found' });
  assert.equal(versions(f).length, 0);
});

test('legacy activation never refreshes a stale source token after another writer commits', async () => {
  const f = fixture(),
    observed = await source(f);
  let inject = true;
  const db = {
    ...f.db,
    runTransaction: async (work) => {
      const value = await f.db.runTransaction(work);
      if (inject && f.records.get('books/book').hasProgressResources) {
        inject = false;
        await f.db.runTransaction(async (tx) => {
          tx.update(f.db.doc('books/book/chapters/chapter'), {
            content: 'Outra gravação',
            updatedAt: 101,
          });
        });
      }
      return value;
    },
  };
  const api = createWorkHistoryService({ db });
  await assert.rejects(
    api.createWorkVersion('author', {
      target,
      resource,
      operationId: op('activation-race'),
      expectedSourceToken: observed.sourceToken,
    }),
    { code: 'failed-precondition' },
  );
  assert.equal(versions(f).length, 0);
  assert.equal((await source(f)).content, 'Outra gravação');
  assert.equal(f.records.get('books/book').wordCount, 99);
});

test('a version cannot be restored into another existing resource in the same project', async () => {
  const f = fixture(),
    { version } = await capture(f, 'scoped');
  f.records.set('books/book/chapters/other', {
    title: 'Outro',
    content: 'Texto particular',
    wordCount: 2,
    order: 2,
    updatedAt: 100,
  });
  const other = { kind: 'chapter', id: 'other' },
    observed = await source(f, other);
  await assert.rejects(
    f.api.restoreWorkVersion('author', {
      target,
      resource: other,
      versionId: version.id,
      operationId: op('wrong-resource'),
      expectedSourceToken: observed.sourceToken,
    }),
    { code: 'invalid-argument' },
  );
  assert.equal((await source(f, other)).content, 'Texto particular');
  assert.equal(versions(f).length, 1);
});

test('legacy restoration copies predecessor and updates ledger atomically; replay never overwrites a later save or charges credits', async () => {
  const f = fixture(),
    { version } = await capture(f, 'a');
  let ready;
  do {
    ready = await f.progress.prepareWorkWordCount('author', {
      target,
      operationId: op('count'),
      limit: 1,
    });
  } while (!ready.complete);
  await save(f, '<p>Texto novo maior</p>', 'b');
  assert.equal(f.records.get('books/book').wordCount, 3);
  const request = {
    target,
    resource,
    versionId: version.id,
    operationId: op('restore'),
    expectedSourceToken: (await source(f)).sourceToken,
  };
  const restored = await f.api.restoreWorkVersion('author', request);
  assert.equal(restored.source.content, '<p>Texto original</p>');
  assert.equal(restored.previousVersion.reason, 'before-restore');
  assert.equal(await body(f, restored.previousVersion.id), '<p>Texto novo maior</p>');
  assert.equal(f.records.get('books/book').wordCount, 2);
  assert.equal(f.records.get('books/book/workProgress/current').wordCount, 2);
  assert.deepEqual(await f.api.restoreWorkVersion('author', request), restored);
  assert.equal(versions(f).length, 2);
  await save(f, 'Uma edição posterior', 'c');
  await assert.rejects(f.api.restoreWorkVersion('author', request), {
    code: 'failed-precondition',
  });
  assert.equal((await source(f)).content, 'Uma edição posterior');
  assert.equal(versions(f).length, 2);
  assert.equal(f.records.get('users/author').credits, 7);
});

test('Unicode chunks and large quoted legacy prose roundtrip and restore without new scene limits or oversized body envelopes', async () => {
  const f = fixture(),
    text = 'á😀"\\\n'.repeat(100000),
    path = 'books/book/chapters/chapter';
  assert.ok(Buffer.byteLength(text) > 800000);
  f.records.get(path).content = text;
  const { version } = await capture(f, 'large');
  assert.ok(version.chunkCount > 8);
  assert.equal(await body(f, version.id), text);
  assert.equal(version.byteLength, Buffer.byteLength(text));
  for (const [key, value] of f.records)
    if (key.startsWith('books/book/workVersionBodies/')) {
      assert.ok(Buffer.byteLength(value.content) <= CHUNK_BYTES);
      assert.ok(Buffer.byteLength(JSON.stringify(value)) <= 900000);
      assert.equal(value.content.includes('\ufffd'), false);
    }
  await save(f, 'Breve', 'brief');
  const restored = await f.api.restoreWorkVersion('author', {
    target,
    resource,
    versionId: version.id,
    operationId: op('large-restore'),
    expectedSourceToken: (await source(f)).sourceToken,
  });
  assert.equal(restored.source.content, text);
  assert.equal(restored.source.contentHash, digest(text));
  assert.equal(await body(f, restored.previousVersion.id), 'Breve');
  assert.deepEqual(splitHistoryContent(''), ['']);
});

test('history listing paginates metadata only and binds account, project, resource and body cursors', async () => {
  const f = fixture();
  for (let i = 0; i < 28; i++) await capture(f, String(i).padStart(3, '0'));
  const first = await f.api.listWorkVersions('author', { target, resource });
  assert.equal(first.items.length, 25);
  assert.ok(first.nextCursor);
  assert.equal('content' in first.items[0], false);
  const next = await f.api.listWorkVersions('author', {
    target,
    resource,
    cursor: first.nextCursor,
  });
  assert.equal(next.items.length, 3);
  assert.equal(next.nextCursor, null);
  assert.equal(new Set([...first.items, ...next.items].map((item) => item.id)).size, 28);
  for (const [uid, patch] of [
    ['other', {}],
    ['author', { resource: undefined }],
    ['author', { resource: { kind: 'chapter', id: 'other' } }],
    ['author', { target: { kind: 'adventure', id: 'adventure' } }],
  ])
    await assert.rejects(
      f.api.listWorkVersions(uid, { target, resource, cursor: first.nextCursor, ...patch }),
      { code: 'invalid-argument' },
    );
  f.records.get('books/book/chapters/chapter').content = '😀'.repeat(40000);
  const { version } = await capture(f, 'multi');
  const page = await f.api.readWorkVersion('author', { target, versionId: version.id, limit: 1 });
  assert.equal(page.chunks.length, 1);
  assert.ok(page.nextCursor);
  for (const [uid, versionId] of [
    ['other', version.id],
    ['author', first.items[0].id],
  ])
    await assert.rejects(
      f.api.readWorkVersion(uid, { target, versionId, cursor: page.nextCursor }),
      { code: 'invalid-argument' },
    );
  assert.ok(
    f.reads
      .filter((read) => read.collectionPath.endsWith('/workVersions'))
      .every((read) => read.maximum <= 51),
  );
});

test('deleted and converted sources retain private versions without implicit recreation or flattening scenes', async () => {
  const f = fixture(),
    { version } = await capture(f, 'removed');
  f.records.delete('books/book/chapters/chapter');
  assert.equal(await source(f), null);
  assert.equal(await body(f, version.id), '<p>Texto original</p>');
  await assert.rejects(
    f.api.restoreWorkVersion('author', {
      target,
      resource,
      versionId: version.id,
      operationId: op('missing-restore'),
      expectedSourceToken: 'a'.repeat(64),
    }),
    { code: 'not-found' },
  );
  assert.equal(f.records.has('books/book/chapters/chapter'), false);
  const g = fixture(),
    captured = await capture(g, 'converted'),
    original = g.records.get('books/book/chapters/chapter');
  await g.scenes.convertChapterToScenes('author', {
    target,
    parentId: 'chapter',
    operationId: op('convert'),
    expectedSourceVersion: digest(original),
  });
  assert.equal(await source(g), null);
  assert.equal(await body(g, captured.version.id), '<p>Texto original</p>');
  await assert.rejects(
    g.api.restoreWorkVersion('author', {
      target,
      resource,
      versionId: captured.version.id,
      operationId: op('convert-restore'),
      expectedSourceToken: 'a'.repeat(64),
    }),
    { code: 'not-found' },
  );
  assert.equal(g.records.get('books/book/chapters/chapter').contentMode, 'scenes');
});

test('scene restoration uses existing assembly/ledger/revision writer and preserves private plans, references, position and archive', async () => {
  const f = fixture(),
    group = await f.scenes.createSceneGroup('author', {
      target,
      operationId: op('group'),
      title: 'Cenas',
    }),
    initial = await f.scenes.createScene('author', {
      target,
      operationId: op('scene'),
      title: 'Cena',
      parentId: group.id,
      content: 'Um texto',
      planning: { objective: 'Segredo' },
    }),
    res = { kind: 'scene', id: initial.scene.id },
    captured = await capture(f, 'scene-version', res);
  const changed = await f.scenes.updateScene('author', {
    target,
    sceneId: res.id,
    operationId: op('scene-edit'),
    expectedRevision: initial.scene.revision,
    patch: { content: 'Um texto novo maior' },
  });
  const before = await f.scenes.getScene('author', { target, sceneId: res.id });
  const result = await f.api.restoreWorkVersion('author', {
    target,
    resource: res,
    versionId: captured.version.id,
    operationId: op('scene-restore'),
    expectedSourceToken: (await source(f, res)).sourceToken,
  });
  assert.equal(result.source.revision, changed.scene.revision + 1);
  const after = await f.scenes.getScene('author', { target, sceneId: res.id });
  assert.equal(after.content, 'Um texto');
  assert.deepEqual(after.planning, before.planning);
  assert.equal(after.parentId, before.parentId);
  assert.equal(after.rank, before.rank);
  assert.equal(after.group.wordCount, 2);
  assert.equal(after.group.assemblyRevision, before.group.assemblyRevision + 1);
  const archived = await f.scenes.archiveScene('author', {
    target,
    sceneId: res.id,
    operationId: op('archive'),
    expectedRevision: after.revision,
    archived: true,
  });
  await f.scenes.updateScene('author', {
    target,
    sceneId: res.id,
    operationId: op('archived-edit'),
    expectedRevision: archived.scene.revision,
    patch: { content: 'Outro texto arquivado' },
  });
  const archivedBefore = await f.scenes.getScene('author', { target, sceneId: res.id });
  await f.api.restoreWorkVersion('author', {
    target,
    resource: res,
    versionId: captured.version.id,
    operationId: op('archived-restore'),
    expectedSourceToken: (await source(f, res)).sourceToken,
  });
  const archivedAfter = await f.scenes.getScene('author', { target, sceneId: res.id });
  assert.equal(archivedAfter.archived, true);
  assert.equal(archivedAfter.group.wordCount, 0);
  assert.equal(archivedAfter.group.assemblyRevision, archivedBefore.group.assemblyRevision);
  assert.equal(archivedAfter.rank, archivedBefore.rank);
});

test('version deletion revokes a preview before resumable bounded cleanup and never duplicates deletion', async () => {
  const f = fixture();
  f.records.get('books/book/chapters/chapter').content = 'x'.repeat(150000);
  const { version } = await capture(f, 'delete-large'),
    request = { target, versionId: version.id, operationId: op('delete-large-op') };
  let fail = true;
  const interrupted = createWorkHistoryService({
    db: {
      ...f.db,
      runTransaction: (work) =>
        f.db.runTransaction((tx) =>
          work({
            ...tx,
            delete: (ref) => {
              if (fail && ref.path.includes('/workVersionBodies/')) {
                fail = false;
                throw new Error('Interrupção');
              }
              tx.delete(ref);
            },
          }),
        ),
    },
  });
  await assert.rejects(interrupted.deleteWorkVersion('author', request), /Interrupção/);
  assert.equal(f.records.get('books/book/workVersions/' + version.id).deleting, true);
  await assert.rejects(body(f, version.id), { code: 'not-found' });
  assert.deepEqual(await f.api.listWorkVersions('author', { target }), {
    items: [],
    nextCursor: null,
  });
  const result = await f.api.deleteWorkVersion('author', request);
  assert.deepEqual(result, { complete: true, processed: version.chunkCount });
  assert.deepEqual(await f.api.deleteWorkVersion('author', request), result);
  assert.equal(
    [...f.records.keys()].some((key) => key.includes('/workVersionBodies/')),
    false,
  );
  await assert.rejects(f.api.deleteWorkVersion('author', { ...request, versionId: 'another' }), {
    code: 'invalid-argument',
  });
});

test('project cleanup removes flat history bodies/manifests before tombstone and cannot recreate through receipts', async () => {
  const f = fixture(),
    { version } = await capture(f, 'project-cleanup');
  f.records.get('books/book').deleting = true;
  let result;
  for (let index = 0; index < 100; index++) {
    result = await f.scenes.deleteSceneBook('author', {
      target,
      operationId: op('delete-project'),
      limit: 1,
    });
    if (result.complete) break;
  }
  assert.equal(result.complete, true);
  assert.equal(
    [...f.records.keys()].some((key) => key.startsWith('books/book/')),
    false,
  );
  await assert.rejects(f.api.readWorkVersion('author', { target, versionId: version.id }), {
    code: 'not-found',
  });
  assert.equal(await source(f), null);
});

test('authorization, closed inputs, cross-resource restore, invalid limits and corruption reject before manuscript writes', async () => {
  const f = fixture(),
    { version } = await capture(f, 'safe'),
    current = await source(f),
    before = structuredClone(f.records.get('books/book/chapters/chapter'));
  assert.equal(await f.api.getWorkVersionSource('other', { target, resource }), null);
  await assert.rejects(f.api.listWorkVersions(null, { target }), { code: 'unauthenticated' });
  for (const patch of [
    { ownerId: 'other' },
    { expectedSourceToken: 'bad' },
    { resource: { kind: 'scene', id: '../bad' } },
    { label: 'x'.repeat(301) },
  ])
    await assert.rejects(
      f.api.createWorkVersion('author', {
        target,
        resource,
        operationId: op('invalid'),
        expectedSourceToken: current.sourceToken,
        ...patch,
      }),
      { code: 'invalid-argument' },
    );
  await assert.rejects(f.api.listWorkVersions('other', { target }), { code: 'not-found' });
  for (const limit of [0, 51, 1.5])
    await assert.rejects(f.api.listWorkVersions('author', { target, limit }), {
      code: 'invalid-argument',
    });
  for (const limit of [0, 9])
    await assert.rejects(
      f.api.readWorkVersion('author', { target, versionId: version.id, limit }),
      { code: 'invalid-argument' },
    );
  const path = [...f.records.keys()].find((key) => key.includes('/workVersionBodies/'));
  f.records.get(path).content = 'CORROMPIDO';
  await assert.rejects(
    f.api.restoreWorkVersion('author', {
      target,
      resource,
      versionId: version.id,
      operationId: op('corrupt'),
      expectedSourceToken: current.sourceToken,
    }),
    { code: 'failed-precondition' },
  );
  assert.deepEqual(f.records.get('books/book/chapters/chapter'), before);
  assert.equal(versions(f).length, 1);
});
