import test from 'node:test';
import assert from 'node:assert/strict';
import { studioDb } from './helpers/studioDb.mjs';
import { createLoreAnalysisService } from '../src/loreAnalysis.mjs';
import { emptyEditorialContract } from '../src/literaryContracts.mjs';

function fixture() {
  const f = studioDb();
  f.records.set('books/book', {
    authorId: 'author',
    title: 'Livro',
    createdAt: 1,
    updatedAt: 1,
    literaryContextRevision: 1,
  });
  f.records.set('books/book/chapters/chapter', {
    bookId: 'book',
    ownerId: 'author',
    content: '<p>Arthur chegou.</p>',
  });
  f.records.set('users/author', { credits: 5 });
  const contract = emptyEditorialContract();
  contract.fields.narrator = 'Terceira pessoa limitada.';
  f.records.set('books/book/literaryProduction/current', { revision: 1, updatedAt: 1, contract });
  const calls = [];
  const api = createLoreAnalysisService({
    db: f.db,
    now: () => 100,
    generator: async (context) => {
      calls.push(context);
      return '{"entities":[]}';
    },
  });
  return { ...f, api, calls };
}
const request = {
  bookId: 'book',
  chapterId: 'chapter',
  requestId: 'editorial-lore-analysis-0001',
  text: 'Arthur chegou.',
  content: '<p>Arthur chegou.</p>',
  loreVersions: [],
};
const source = (f) =>
  f.api.getLoreAnalysisEditorialContext('author', { bookId: 'book', chapterId: 'chapter' });

test('native recreation of an identical guide cannot inherit an earlier lore response or context token', async () => {
  const f = fixture();
  const original = await source(f);
  await f.api.analyzeChapterLore('author', {
    ...request,
    editorialContextToken: original.contextToken,
  });
  const ref = f.db.doc('books/book/literaryProduction/current');
  let copy;
  await f.db.runTransaction(async (tx) => {
    copy = (await tx.get(ref)).data();
    tx.delete(ref);
  });
  await f.db.runTransaction(async (tx) => {
    await tx.get(ref);
    tx.create(ref, copy);
  });
  const recreated = await source(f);
  assert.equal(recreated.instruction, original.instruction);
  assert.equal(recreated.revision, original.revision);
  assert.notEqual(recreated.contextToken, original.contextToken);
  await assert.rejects(
    f.api.analyzeChapterLore('author', {
      ...request,
      editorialContextToken: original.contextToken,
    }),
    { code: 'failed-precondition' },
  );
  assert.equal(f.calls.length, 1);
  assert.equal(f.records.get('users/author').credits, 5);
});

test('removing a guide is an explicit new absence and does not preserve a former context grant', async () => {
  const f = fixture();
  const original = await source(f);
  f.records.delete('books/book/literaryProduction/current');
  f.records.set('books/book', { ...f.records.get('books/book'), literaryContextRevision: 2 });
  const removed = await source(f);
  assert.equal(removed.present, false);
  assert.equal(removed.instruction, '');
  assert.notEqual(removed.contextToken, original.contextToken);
  const before = structuredClone([...f.records]);
  await assert.rejects(
    f.api.prepareBYOKLore('author', {
      ...request,
      editorialContextToken: original.contextToken,
      entities: [],
    }),
    { code: 'failed-precondition' },
  );
  assert.deepEqual([...f.records], before);
});

test('foreign actors and deleting books cannot obtain the private editorial context', async () => {
  const f = fixture();
  await assert.rejects(
    f.api.getLoreAnalysisEditorialContext('other', { bookId: 'book', chapterId: 'chapter' }),
    { code: 'permission-denied' },
  );
  f.records.set('books/book', { ...f.records.get('books/book'), deleting: true });
  await assert.rejects(source(f), { code: 'permission-denied' });
  assert.equal(f.calls.length, 0);
});

test('a native scene clock change invalidates analysis even if the legacy chapter cache and guide stay identical', async () => {
  const f = fixture();
  f.records.set('books/book/chapters/chapter', {
    ...f.records.get('books/book/chapters/chapter'),
    contentMode: 'scenes',
    assemblyRevision: 1,
    structureRevision: 1,
  });
  f.records.set('books/book', {
    ...f.records.get('books/book'),
    hasSceneResources: true,
    sceneRevision: 1,
  });
  const before = await source(f);
  await f.api.analyzeChapterLore('author', {
    ...request,
    editorialContextToken: before.contextToken,
  });
  f.records.set('books/book', { ...f.records.get('books/book'), sceneRevision: 2 });
  const changed = await source(f);
  assert.equal(changed.instruction, before.instruction);
  assert.notEqual(changed.contextToken, before.contextToken);
  await assert.rejects(
    f.api.analyzeChapterLore('author', { ...request, editorialContextToken: before.contextToken }),
    { code: 'failed-precondition' },
  );
  assert.equal(f.calls.length, 1);
});
