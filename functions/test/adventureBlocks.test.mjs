import test from 'node:test';
import assert from 'node:assert/strict';
import { studioDb } from './helpers/studioDb.mjs';
import { createAdventureBlocksService } from '../src/adventureBlocks.mjs';
import { createScenesService } from '../src/scenes.mjs';
import { createWorkHistoryService } from '../src/workHistory.mjs';
import { createWorkProgressService } from '../src/workProgress.mjs';
import { digest } from '../src/sceneContracts.mjs';

const target = { kind: 'adventure', id: 'adventure' },
  path = 'adventures/adventure';
const op = (id) => 'adventure-block-operation-' + id;
const conflict = (error) => error.details?.reason === 'revision-conflict';
async function fixture() {
  const f = studioDb();
  f.records.set(path, {
    ownerId: 'author',
    title: 'Aventura',
    status: 'draft',
    createdAt: 1,
    updatedAt: 100,
  });
  const scenes = createScenesService({ db: f.db, now: () => 200 });
  const group = await scenes.createSceneGroup('author', {
    target,
    operationId: op('part'),
    title: 'Parte',
  });
  const created = await scenes.createScene('author', {
    target,
    operationId: op('scene'),
    parentId: group.id,
    title: 'Cena privada',
    content: '<p>Texto principal</p>',
    planning: { objective: 'Segredo autoral' },
  });
  return {
    ...f,
    scenes,
    group,
    sceneId: created.scene.id,
    api: createAdventureBlocksService({ db: f.db, now: () => 300 }),
    history: createWorkHistoryService({ db: f.db, now: () => 400 }),
    progress: createWorkProgressService({ db: f.db, now: () => 500 }),
  };
}
const sceneRecord = (f) => f.records.get(path + '/scenes/' + f.sceneId);
const main = (f) => ({ kind: 'scene', id: f.sceneId });
async function create(f, id, fields = {}) {
  return f.api.createAdventureBlock('author', {
    adventureId: target.id,
    sceneId: f.sceneId,
    operationId: op(id),
    title: 'Bloco ' + id,
    content: '<p>Mais duas palavras</p>',
    ...fields,
  });
}
async function update(f, resource, revision, id, patch) {
  return f.api.updateAdventureBlock('author', {
    adventureId: target.id,
    resource,
    expectedRevision: revision,
    operationId: op(id),
    patch,
  });
}
async function prepare(f, id = 'prepare') {
  for (let i = 0; i < 20; i++) {
    const result = await f.progress.prepareWorkWordCount('author', {
      target,
      operationId: op(id),
      limit: 1,
    });
    if (result.complete) return result;
  }
  assert.fail('Preparation did not finish');
}
const count = async (f) =>
  (await f.progress.getWorkProgress('author', { target })).manuscript.wordCount;

test('legacy principal stays private and read-only; books do not gain adventure metadata', async () => {
  const f = await fixture(),
    before = structuredClone([...f.records]);
  const page = await f.api.listAdventureBlocks('author', {
    adventureId: target.id,
    sceneId: f.sceneId,
  });
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].audience, 'creator');
  assert.equal(page.items[0].title, 'Texto principal');
  assert.equal(page.items[0].wordCount, 2);
  assert.equal(page.sceneWordCount, 2);
  assert.equal(page.mainBodyHash, digest('<p>Texto principal</p>'));
  assert.equal(page.structureRevision, 0);
  assert.deepEqual([...f.records], before);
  assert.equal(
    f.reads.some((read) => read.path?.endsWith('/body/current')),
    false,
  );
  f.records.set('books/book', { authorId: 'author', title: 'Livro', wordCount: 0 });
  const book = await f.scenes.createScene('author', {
    target: { kind: 'book', id: 'book' },
    operationId: op('book'),
    title: 'Livro',
  });
  assert.equal('mainWordCount' in book.scene, false);
  await assert.rejects(
    f.history.getWorkVersionSource('author', {
      target: { kind: 'book', id: 'book' },
      resource: { kind: 'block', id: 'x' },
    }),
    { code: 'invalid-argument' },
  );
});

test('creation, updates and replay use server counts, private defaults, strict CAS and owner scope', async () => {
  const f = await fixture(),
    a = await create(f, 'a');
  assert.equal(a.block.audience, 'creator');
  assert.equal(a.block.narrativeType, 'scene');
  assert.equal(a.sceneWordCount, 5);
  assert.equal(a.block.wordCount, 3);
  assert.deepEqual(await create(f, 'a'), a);
  await assert.rejects(create(f, 'a', { audience: 'players' }), { code: 'invalid-argument' });
  const b = await update(f, a.block.resource, a.block.revision, 'edit', {
    content: 'Uma palavra',
    audience: 'gm',
    narrativeType: 'clue',
  });
  assert.equal(b.sceneWordCount, 4);
  assert.equal(b.block.wordCount, 2);
  assert.equal(b.block.audience, 'gm');
  assert.deepEqual(
    await update(f, a.block.resource, a.block.revision, 'edit', {
      content: 'Uma palavra',
      audience: 'gm',
      narrativeType: 'clue',
    }),
    b,
  );
  assert.equal(f.records.get(path + '/parts/' + f.group.id).wordCount, 4);
  await assert.rejects(
    update(f, a.block.resource, a.block.revision, 'stale', { content: 'Perdido' }),
    conflict,
  );
  await assert.rejects(create(f, 'a'), conflict);
  assert.equal(
    await f.api.getAdventureBlock('stranger', {
      adventureId: target.id,
      resource: b.block.resource,
    }),
    null,
  );
  await assert.rejects(
    f.api.createAdventureBlock('stranger', {
      adventureId: target.id,
      sceneId: f.sceneId,
      operationId: op('foreign'),
      title: 'x',
    }),
    { code: 'not-found' },
  );
  await assert.rejects(create(f, 'injected', { wordCount: 999 }), { code: 'invalid-argument' });
  await assert.rejects(create(f, 'enum', { audience: 'public' }), { code: 'invalid-argument' });
  await assert.rejects(create(f, 'oversize', { content: 'é'.repeat(400001) }), {
    code: 'invalid-argument',
  });
  const receipt = JSON.stringify(
    f.records.get('users/author/adventureBlockOperations/' + op('edit')),
  );
  assert.ok(!receipt.includes('palavra') && !receipt.includes('content'));
});

test('principal edits preserve additional prose and totals through both existing and block writers', async () => {
  const f = await fixture(),
    a = await create(f, 'a');
  const principal = await update(f, main(f), a.sceneRevision, 'main', {
    content: 'Novo principal com quatro',
    title: 'Abertura',
    audience: 'players',
    narrativeType: 'introduction',
  });
  assert.equal(principal.sceneWordCount, 7);
  assert.equal(principal.block.wordCount, 4);
  assert.equal(principal.block.title, 'Abertura');
  const saved = await f.scenes.updateScene('author', {
    target,
    sceneId: f.sceneId,
    expectedRevision: principal.sceneRevision,
    operationId: op('autosave'),
    patch: { content: 'Curto' },
  });
  assert.equal(saved.scene.wordCount, 4);
  assert.equal(saved.scene.mainWordCount, 1);
  assert.equal(saved.scene.blockWordCount, 3);
  assert.equal(saved.scene.mainBlockAudience, 'players');
  assert.equal(
    (
      await f.api.getAdventureBlock('author', {
        adventureId: target.id,
        resource: a.block.resource,
      })
    ).content,
    '<p>Mais duas palavras</p>',
  );
  const child = await update(f, a.block.resource, 1, 'child-after-other-main', {
    content: 'Filho maior agora mudou',
  });
  assert.equal(child.mainBodyHash, digest('Curto'));
  assert.equal(child.sceneWordCount, 5);
});

test('bounded pagination emits principal once at moved page boundaries and rejects changed scope/revision', async () => {
  const f = await fixture();
  for (let i = 0; i < 5; i++) await create(f, 'page' + i);
  for (let i = 0; i < 3; i++) {
    const s = sceneRecord(f);
    await f.api.moveAdventureBlock('author', {
      adventureId: target.id,
      resource: main(f),
      operationId: op('move-main-' + i),
      expectedRevision: s.revision,
      expectedStructureRevision: s.blocksStructureRevision,
      direction: 'down',
    });
  }
  const items = [];
  let cursor, first;
  do {
    const page = await f.api.listAdventureBlocks('author', {
      adventureId: target.id,
      sceneId: f.sceneId,
      limit: 2,
      ...(cursor ? { cursor } : {}),
    });
    first ??= page;
    items.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  assert.equal(items.length, 6);
  assert.equal(new Set(items.map((item) => item.resource.id)).size, 6);
  assert.equal(items[3].resource.kind, 'scene');
  assert.deepEqual(
    items.map((item) => item.order),
    [0, 1, 2, 3, 4, 5],
  );
  const queryReads = f.reads.filter((read) => read.collectionPath?.endsWith('/sceneBlocks'));
  assert.ok(queryReads.length > 0);
  assert.ok(queryReads.every((read) => read.maximum <= 3));
  await assert.rejects(
    f.api.listAdventureBlocks('author', {
      adventureId: target.id,
      sceneId: f.sceneId,
      archived: true,
      cursor: first.nextCursor,
    }),
    { code: 'invalid-argument' },
  );
  await create(f, 'invalidate');
  await assert.rejects(
    f.api.listAdventureBlocks('author', {
      adventureId: target.id,
      sceneId: f.sceneId,
      cursor: first.nextCursor,
    }),
    { code: 'invalid-argument' },
  );
});

test('duplicate snapshots exact body and audience into one new block; movement requires observed structure', async () => {
  const f = await fixture(),
    a = await create(f, 'a', {
      content: 'Segredo do mestre',
      audience: 'gm',
      narrativeType: 'preparation',
    });
  const request = {
    adventureId: target.id,
    resource: a.block.resource,
    operationId: op('duplicate'),
    expectedRevision: 1,
  };
  const copy = await f.api.duplicateAdventureBlock('author', request);
  assert.equal(copy.block.audience, 'gm');
  assert.equal(copy.block.narrativeType, 'preparation');
  assert.equal(copy.sceneWordCount, 8);
  assert.deepEqual(await f.api.duplicateAdventureBlock('author', request), copy);
  assert.equal(
    (
      await f.api.getAdventureBlock('author', {
        adventureId: target.id,
        resource: copy.block.resource,
      })
    ).content,
    'Segredo do mestre',
  );
  await assert.rejects(
    f.api.moveAdventureBlock('author', {
      adventureId: target.id,
      resource: a.block.resource,
      operationId: op('bad-move'),
      expectedRevision: 1,
      expectedStructureRevision: a.structureRevision,
      direction: 'down',
    }),
    conflict,
  );
  const moved = await f.api.moveAdventureBlock('author', {
    adventureId: target.id,
    resource: copy.block.resource,
    operationId: op('move-copy'),
    expectedRevision: 1,
    expectedStructureRevision: copy.structureRevision,
    direction: 'up',
  });
  assert.equal(moved.block.order, a.block.order);
  assert.equal(moved.sceneWordCount, 8);
  assert.equal(f.records.get(path + '/sceneBlocks/' + a.block.resource.id).revision, 2);
});

test('ledger preparation includes additional aggregate; archive, move and parent removal keep children and count once', async () => {
  const f = await fixture(),
    a = await create(f, 'a');
  assert.equal((await prepare(f)).wordCount, 5);
  assert.equal(await count(f), 5);
  const archived = await f.api.archiveAdventureBlock('author', {
    adventureId: target.id,
    blockId: a.block.resource.id,
    operationId: op('archive'),
    expectedRevision: 1,
    archived: true,
  });
  assert.equal(archived.sceneWordCount, 2);
  assert.equal(await count(f), 2);
  assert.deepEqual(
    (
      await f.api.listAdventureBlocks('author', {
        adventureId: target.id,
        sceneId: f.sceneId,
        archived: true,
      })
    ).items.map((x) => x.resource),
    [a.block.resource],
  );
  const restored = await f.api.archiveAdventureBlock('author', {
    adventureId: target.id,
    blockId: a.block.resource.id,
    operationId: op('unarchive'),
    expectedRevision: archived.block.revision,
    archived: false,
  });
  assert.equal(restored.sceneWordCount, 5);
  assert.equal(await count(f), 5);
  const sceneArchived = await f.scenes.archiveScene('author', {
    target,
    sceneId: f.sceneId,
    operationId: op('scene-archive'),
    expectedRevision: restored.sceneRevision,
    archived: true,
  });
  assert.equal(await count(f), 0);
  const childEdit = await update(
    f,
    a.block.resource,
    restored.block.revision,
    'archived-parent-edit',
    { content: 'Agora mais quatro palavras' },
  );
  assert.equal(childEdit.sceneWordCount, 6);
  assert.equal(await count(f), 0);
  await f.scenes.archiveScene('author', {
    target,
    sceneId: f.sceneId,
    operationId: op('scene-unarchive'),
    expectedRevision: childEdit.sceneRevision,
    archived: false,
  });
  assert.equal(await count(f), 6);
  const other = await f.scenes.createSceneGroup('author', {
    target,
    operationId: op('other-part'),
    title: 'Outra',
  });
  const scene = sceneRecord(f);
  await f.scenes.moveScene('author', {
    target,
    sceneId: f.sceneId,
    operationId: op('move-scene'),
    expectedRevision: scene.revision,
    parentId: other.id,
    expectedSourceStructureRevision: f.records.get(path + '/parts/' + f.group.id).structureRevision,
    expectedTargetStructureRevision: other.structureRevision,
  });
  assert.equal(await count(f), 6);
  assert.equal(f.records.get(path + '/sceneBlocks/' + a.block.resource.id).sceneId, f.sceneId);
  const parent = f.records.get(path + '/parts/' + other.id);
  const request = {
    target,
    operationId: op('remove-part'),
    groups: [{ id: other.id, expectedUpdatedAt: parent.updatedAt }],
  };
  const deleted = await f.scenes.deleteSceneGroups('author', request);
  assert.equal(deleted.complete, true);
  assert.equal(await count(f), 0);
  assert.equal(sceneRecord(f).parentId, null);
  assert.ok(f.records.has(path + '/sceneBlocks/' + a.block.resource.id + '/body/current'));
  assert.equal(sceneArchived.scene.wordCount, 5);
});

test('history restores child text with predecessor and canonical totals; principal restoration preserves extras', async () => {
  const f = await fixture(),
    a = await create(f, 'a', { audience: 'gm' });
  await prepare(f);
  const source = async (resource) => f.history.getWorkVersionSource('author', { target, resource });
  const initial = await source(a.block.resource);
  assert.equal(initial.sceneWordCount, 5);
  const version = await f.history.createWorkVersion('author', {
    target,
    resource: a.block.resource,
    operationId: op('capture-child'),
    expectedSourceToken: initial.sourceToken,
  });
  const mainSource = await source(main(f));
  const mainVersion = await f.history.createWorkVersion('author', {
    target,
    resource: main(f),
    operationId: op('capture-main'),
    expectedSourceToken: mainSource.sourceToken,
  });
  await update(f, a.block.resource, 1, 'edit-child', {
    content: 'Curto',
    audience: 'players',
    title: 'Público',
  });
  const restore = {
    target,
    resource: a.block.resource,
    versionId: version.version.id,
    operationId: op('restore-child'),
    expectedSourceToken: (await source(a.block.resource)).sourceToken,
  };
  const restored = await f.history.restoreWorkVersion('author', restore);
  assert.equal(restored.source.content, initial.content);
  assert.equal(restored.source.sceneWordCount, 5);
  assert.equal(restored.source.revision, 3);
  assert.equal(restored.previousVersion.reason, 'before-restore');
  assert.equal(
    (
      await f.api.getAdventureBlock('author', {
        adventureId: target.id,
        resource: a.block.resource,
      })
    ).audience,
    'players',
  );
  assert.equal(await count(f), 5);
  assert.deepEqual(await f.history.restoreWorkVersion('author', restore), restored);
  await update(f, main(f), sceneRecord(f).revision, 'edit-main', { content: 'Uma' });
  const mainRestored = await f.history.restoreWorkVersion('author', {
    target,
    resource: main(f),
    versionId: mainVersion.version.id,
    operationId: op('restore-main'),
    expectedSourceToken: (await source(main(f))).sourceToken,
  });
  assert.equal(mainRestored.source.sceneWordCount, 5);
  assert.equal(sceneRecord(f).blockWordCount, 3);
  assert.equal(await count(f), 5);
  f.metadata.set(path + '/sceneBlocks/' + a.block.resource.id, {
    updatedAt: 20,
    updatedAtNanoseconds: 999,
  });
  assert.notEqual((await source(a.block.resource)).sourceToken, restored.source.sourceToken);
  await assert.rejects(
    f.history.createWorkVersion('author', {
      target,
      resource: a.block.resource,
      operationId: op('stale-nanoseconds'),
      expectedSourceToken: restored.source.sourceToken,
    }),
    conflict,
  );
});

test('deletion subtracts once, clears bounded bodies and retains project history without implicit recreation', async () => {
  const f = await fixture(),
    a = await create(f, 'a');
  await prepare(f);
  const source = await f.history.getWorkVersionSource('author', {
    target,
    resource: a.block.resource,
  });
  const captured = await f.history.createWorkVersion('author', {
    target,
    resource: a.block.resource,
    operationId: op('version'),
    expectedSourceToken: source.sourceToken,
  });
  for (let i = 0; i < 27; i++)
    f.records.set(path + '/sceneBlocks/' + a.block.resource.id + '/body/extra-' + i, {
      content: 'old',
    });
  const request = {
    adventureId: target.id,
    blockId: a.block.resource.id,
    operationId: op('delete'),
    expectedRevision: 1,
  };
  const partial = await f.api.deleteAdventureBlock('author', request);
  assert.equal(partial.complete, false);
  assert.equal(partial.processed, 25);
  assert.equal(partial.sceneWordCount, 2);
  assert.equal(await count(f), 2);
  assert.equal(
    await f.api.getAdventureBlock('author', { adventureId: target.id, resource: a.block.resource }),
    null,
  );
  const done = await f.api.deleteAdventureBlock('author', request);
  assert.equal(done.complete, true);
  assert.equal(done.processed, 28);
  assert.deepEqual(await f.api.deleteAdventureBlock('author', request), done);
  assert.equal(f.records.has(path + '/sceneBlocks/' + a.block.resource.id), false);
  const page = await f.history.readWorkVersion('author', {
    target,
    versionId: captured.version.id,
  });
  assert.equal(page.chunks[0].content, source.content);
  await assert.rejects(
    f.history.restoreWorkVersion('author', {
      target,
      resource: a.block.resource,
      versionId: captured.version.id,
      operationId: op('restore-deleted'),
      expectedSourceToken: source.sourceToken,
    }),
    { code: 'not-found' },
  );
});

test('metadata verification repairs aggregate only on final original-revision checkpoint, without fetching child bodies', async () => {
  const f = await fixture();
  await create(f, 'a');
  await create(f, 'b');
  await create(f, 'c');
  await prepare(f);
  const scene = sceneRecord(f);
  f.records.set(path + '/scenes/' + f.sceneId, {
    ...scene,
    blockWordCount: null,
    blockCount: null,
  });
  await assert.rejects(
    f.api.listAdventureBlocks('author', { adventureId: target.id, sceneId: f.sceneId }),
    { code: 'failed-precondition' },
  );
  const request = {
    adventureId: target.id,
    sceneId: f.sceneId,
    operationId: op('verify'),
    expectedSceneRevision: scene.revision,
    limit: 1,
  };
  f.reads.length = 0;
  const partial = await f.api.verifyAdventureBlockCount('author', request);
  assert.equal(partial.complete, false);
  assert.equal(partial.sceneWordCount, null);
  assert.equal(sceneRecord(f).blockWordCount, null);
  assert.equal(
    f.reads.some((read) => read.path?.includes('/sceneBlocks/') && read.path?.includes('/body/')),
    false,
  );
  const next = await f.api.verifyAdventureBlockCount('author', request);
  assert.equal(next.complete, false);
  const done = await f.api.verifyAdventureBlockCount('author', request);
  assert.equal(done.complete, true);
  assert.equal(done.sceneWordCount, 11);
  assert.equal(done.processed, 3);
  assert.equal(await count(f), 11);
  assert.deepEqual(await f.api.verifyAdventureBlockCount('author', request), done);
  await create(f, 'after-repair');
  await assert.rejects(f.api.verifyAdventureBlockCount('author', request), conflict);
  const reads = f.reads.filter((read) => read.collectionPath?.endsWith('/sceneBlocks'));
  assert.ok(
    reads.every((read) => read.maximum === 2 && read.fields && !read.fields.includes('content')),
  );
});

test('verification conflicts preserve current total; invalid principal never yields a false complete', async () => {
  const f = await fixture();
  await create(f, 'a');
  await create(f, 'b');
  const request = {
    adventureId: target.id,
    sceneId: f.sceneId,
    operationId: op('verify'),
    expectedSceneRevision: sceneRecord(f).revision,
    limit: 1,
  };
  await f.api.verifyAdventureBlockCount('author', request);
  const current = await create(f, 'concurrent');
  await assert.rejects(f.api.verifyAdventureBlockCount('author', request), conflict);
  assert.equal(sceneRecord(f).wordCount, current.sceneWordCount);
  const scene = sceneRecord(f);
  f.records.set(path + '/scenes/' + f.sceneId, { ...scene, mainWordCount: undefined });
  await assert.rejects(
    f.api.verifyAdventureBlockCount('author', {
      ...request,
      operationId: op('invalid-main'),
      expectedSceneRevision: scene.revision,
    }),
    { code: 'failed-precondition' },
  );
});

test('count status recovers malformed aggregate without cache, bodies or migration and refuses irreparable principal', async () => {
  const f = await fixture();
  await create(f, 'a');
  await create(f, 'b');
  const request = { adventureId: target.id, sceneId: f.sceneId };
  assert.equal(
    (await f.api.getAdventureBlockCountStatus('author', request)).needsVerification,
    false,
  );
  const scene = sceneRecord(f);
  f.records.set(path + '/scenes/' + f.sceneId, { ...scene, blockWordCount: null });
  await assert.rejects(f.scenes.getScene('author', { target, sceneId: f.sceneId }), {
    code: 'failed-precondition',
  });
  const before = structuredClone([...f.records]);
  f.reads.length = 0;
  const status = await f.api.getAdventureBlockCountStatus('author', request);
  assert.deepEqual(status, {
    sceneRevision: scene.revision,
    mainBodyHash: scene.bodyHash,
    structureRevision: scene.blocksStructureRevision,
    sceneWordCount: null,
    needsVerification: true,
    repairable: true,
  });
  assert.deepEqual([...f.records], before);
  assert.equal(
    f.reads.some((read) => read.path?.includes('/body/')),
    false,
  );
  assert.equal(await f.api.getAdventureBlockCountStatus('other', request), null);
  assert.equal(
    await f.api.getAdventureBlockCountStatus('author', { ...request, sceneId: 'absent' }),
    null,
  );
  const verify = {
    ...request,
    operationId: op('recover-without-cache'),
    expectedSceneRevision: status.sceneRevision,
  };
  assert.equal((await f.api.verifyAdventureBlockCount('author', verify)).complete, true);
  assert.equal((await f.scenes.getScene('author', { target, sceneId: f.sceneId })).wordCount, 8);
  assert.equal(
    (await f.api.getAdventureBlockCountStatus('author', request)).needsVerification,
    false,
  );
  f.records.set(path + '/scenes/' + f.sceneId, { ...sceneRecord(f), mainWordCount: null });
  assert.equal((await f.api.getAdventureBlockCountStatus('author', request)).repairable, false);
  assert.equal((await f.api.getAdventureBlockCountStatus('author', request)).sceneWordCount, null);
  f.records.set(path + '/scenes/' + f.sceneId, {
    ...sceneRecord(f),
    mainWordCount: 2,
    nextBlockOrder: -1,
  });
  assert.equal((await f.api.getAdventureBlockCountStatus('author', request)).repairable, false);
  f.records.set(path + '/scenes/' + f.sceneId, { ...sceneRecord(f), bodyHash: 'invalid' });
  await assert.rejects(f.api.getAdventureBlockCountStatus('author', request), {
    code: 'failed-precondition',
  });
});
