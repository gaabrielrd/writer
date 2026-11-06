import test from 'node:test';
import assert from 'node:assert/strict';
import { studioDb } from './helpers/studioDb.mjs';
import { createScenesService } from '../src/scenes.mjs';
import { workScope } from '../src/workProgressContracts.mjs';
import {
  listLiteraryIntegrationChapters,
  orderLiteraryIntegrationChapters,
  listLiteraryIntegrationUnits,
  readLiteraryIntegrationUnit,
} from '../src/literaryIntegrationSources.mjs';
const target = { kind: 'book', id: 'book' };
function fixture() {
  const f = studioDb();
  f.records.set('books/book', {
    authorId: 'author',
    title: 'Livro',
    createdAt: 1,
    updatedAt: 100,
    wordCount: 0,
  });
  return { ...f, c: workScope(f.db, 'author', { target }, []) };
}
test('reading order matches acts followed by unassigned chapters without losing orphan links', async () => {
  const f = fixture();
  f.records.set('books/book/acts/late', { name: 'Segundo', order: 2 });
  f.records.set('books/book/acts/early', { name: 'Primeiro', order: 1 });
  for (const [id, order, actId] of [
    ['z', 1, 'late'],
    ['a', 3, 'early'],
    ['b', 1, null],
    ['c', 2, 'missing'],
  ])
    f.records.set('books/book/chapters/' + id, {
      bookId: 'book',
      title: id,
      order,
      actId,
      content: '<p>Texto</p>',
      updatedAt: 100,
    });
  const page = await f.db.runTransaction((tx) =>
    listLiteraryIntegrationChapters(tx, f.c, { level: 'book' }),
  );
  assert.deepEqual(
    orderLiteraryIntegrationChapters(page.items).map((item) => item.id),
    ['a', 'z', 'b', 'c'],
  );
  const act = await f.db.runTransaction((tx) =>
    listLiteraryIntegrationChapters(tx, f.c, { level: 'act', actId: 'early' }),
  );
  assert.deepEqual(
    act.items.map((item) => item.id),
    ['a'],
  );
});
test('a legacy source reads its actual canonical manuscript and refuses version drift', async () => {
  const f = fixture();
  f.records.set('books/book/chapters/legacy', {
    bookId: 'book',
    title: 'A carta',
    order: 1,
    content: '<p>Ela abriu a carta.</p>',
    updatedAt: 100,
  });
  const page = await f.db.runTransaction((tx) =>
    listLiteraryIntegrationChapters(tx, f.c, { level: 'book' }),
  );
  const units = await f.db.runTransaction((tx) =>
    listLiteraryIntegrationUnits(tx, f.c, {
      chapterId: 'legacy',
      chapterToken: page.items[0].token,
    }),
  );
  const body = await f.db.runTransaction((tx) =>
    readLiteraryIntegrationUnit(tx, f.c, units.items[0]),
  );
  assert.equal(body.text.trim(), 'Ela abriu a carta.');
  f.records.set('books/book/chapters/legacy', {
    ...f.records.get('books/book/chapters/legacy'),
    updatedAt: 200,
    content: '<p>Outra versão.</p>',
  });
  f.metadata.set('books/book/chapters/legacy', { createdAt: 10, updatedAt: 200 });
  await assert.rejects(
    f.db.runTransaction((tx) => readLiteraryIntegrationUnit(tx, f.c, units.items[0])),
    { code: 'failed-precondition' },
  );
});
test('a composed chapter reads ordered native scene bodies instead of a conversion source or summary', async () => {
  const f = fixture(),
    scenes = createScenesService({ db: f.db, now: () => 200 });
  const group = await scenes.createSceneGroup('author', {
    target,
    operationId: 'integration-group-0001',
    title: 'A carta',
  });
  const created = await scenes.createScene('author', {
    target,
    parentId: group.id,
    operationId: 'integration-scene-0001',
    title: 'A abertura',
    content: '<p>A carta foi aberta.</p>',
  });
  const page = await f.db.runTransaction((tx) =>
    listLiteraryIntegrationChapters(tx, f.c, { level: 'book' }),
  );
  const units = await f.db.runTransaction((tx) =>
    listLiteraryIntegrationUnits(tx, f.c, {
      chapterId: group.id,
      chapterToken: page.items[0].token,
    }),
  );
  assert.equal(units.items[0].resource.id, created.scene.id);
  const body = await f.db.runTransaction((tx) =>
    readLiteraryIntegrationUnit(tx, f.c, units.items[0]),
  );
  assert.equal(body.text.trim(), 'A carta foi aberta.');
  const scene = await scenes.getScene('author', { target, sceneId: created.scene.id });
  await scenes.archiveScene('author', {
    target,
    sceneId: scene.id,
    operationId: 'integration-scene-0002',
    expectedRevision: scene.revision,
    archived: true,
  });
  f.metadata.set('books/book/chapters/legacy', { createdAt: 10, updatedAt: 200 });
  await assert.rejects(
    f.db.runTransaction((tx) => readLiteraryIntegrationUnit(tx, f.c, units.items[0])),
  );
});
test('empty prose and cross-book chapters cannot be counted as a completed reading', async () => {
  const f = fixture();
  f.records.set('books/book/chapters/empty', {
    bookId: 'book',
    title: 'Vazio',
    order: 1,
    content: '<p></p>',
    updatedAt: 100,
  });
  const page = await f.db.runTransaction((tx) =>
    listLiteraryIntegrationChapters(tx, f.c, { level: 'book' }),
  );
  const units = await f.db.runTransaction((tx) =>
    listLiteraryIntegrationUnits(tx, f.c, {
      chapterId: 'empty',
      chapterToken: page.items[0].token,
    }),
  );
  f.metadata.set('books/book/chapters/legacy', { createdAt: 10, updatedAt: 200 });
  await assert.rejects(
    f.db.runTransaction((tx) => readLiteraryIntegrationUnit(tx, f.c, units.items[0])),
    { code: 'failed-precondition' },
  );
  f.records.set('books/book/chapters/empty', {
    ...f.records.get('books/book/chapters/empty'),
    bookId: 'other',
  });
  await assert.rejects(
    f.db.runTransaction((tx) => listLiteraryIntegrationChapters(tx, f.c, { level: 'book' })),
    { code: 'not-found' },
  );
});
