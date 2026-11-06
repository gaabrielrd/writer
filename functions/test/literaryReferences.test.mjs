import test from 'node:test';
import assert from 'node:assert/strict';
import { studioDb } from './helpers/studioDb.mjs';
import { workScope, workProject } from '../src/workProgressContracts.mjs';
import {
  createLiteraryReferenceReader,
  mergeLiteraryReferences,
} from '../src/literaryReferences.mjs';
const hash = 'a'.repeat(64),
  target = { kind: 'book', id: 'book' };
const c = { target },
  root = { universeId: 'world' };
const ref = (scopeId = null, purpose = 'source', kind = 'chapter') => ({
  kind,
  id: 'same',
  scopeId,
  purpose,
  sourceToken: hash,
  revision: 1,
});
test('reference aliases merge once in canonical deterministic scope, retaining distinct source/subject roles', () => {
  const values = mergeLiteraryReferences(c, root, [
    ref(null),
    ref('book'),
    ref(null, 'subject'),
    ref(null, 'source', 'globalLore'),
  ]);
  assert.equal(values.length, 3);
  assert.equal(values.find((r) => r.kind === 'globalLore').scopeId, 'world');
  assert.equal(values.find((r) => r.kind === 'chapter').scopeId, 'book');
  assert.deepEqual(
    mergeLiteraryReferences(c, root, [ref('book'), ref(null)]),
    mergeLiteraryReferences(c, root, [ref(null), ref('book')]),
  );
});
test('contradictory captured grants or revisions cannot be hidden by insertion order', () => {
  for (const patch of [{ revision: 2 }, { sourceToken: 'b'.repeat(64) }]) {
    for (const values of [
      [ref(), { ...ref('book'), ...patch }],
      [{ ...ref('book'), ...patch }, ref()],
    ]) {
      assert.throws(() => mergeLiteraryReferences(c, root, values), {
        code: 'failed-precondition',
      });
    }
  }
  assert.equal(
    mergeLiteraryReferences(c, root, [
      ref(null, 'subject'),
      { ...ref('book', 'subject'), revision: 2 },
    ]).length,
    1,
  );
});
test('native identity reads use metadata projection without chapter bodies or global descriptions', async () => {
  const f = studioDb(),
    context = workScope(f.db, 'author', { target }, []);
  f.records.set('books/book', { authorId: 'author', universeId: 'world' });
  f.records.set('books/book/chapters/c', {
    bookId: 'book',
    updatedAt: 1,
    title: 'PRIVATE TITLE',
    content: 'PRIVATE CHAPTER',
  });
  f.records.set('universes/world', { authorId: 'author', privateNotes: 'PRIVATE WORLD' });
  f.records.set('universes/world/lore/e', {
    name: 'PRIVATE NAME',
    updatedAt: 1,
    details: 'PRIVATE DETAILS',
  });
  const values = await f.db.runTransaction(async (tx) => {
    const root = await workProject(tx, context),
      read = await createLiteraryReferenceReader(tx, context, root);
    return [
      await read({ kind: 'chapter', id: 'c', scopeId: 'book', purpose: 'source' }),
      await read({ kind: 'globalLore', id: 'e', scopeId: 'world', purpose: 'source' }),
    ];
  });
  assert.ok(
    values.every((value) => value.identityToken && value.versionToken && value.label === null),
  );
  assert.equal(JSON.stringify(values).includes('PRIVATE'), false);
  assert.ok(
    f.metadataReads
      .filter((row) => row.path.includes('/chapters/') || row.path.includes('/lore/'))
      .every(
        (row) => !row.fields.some((key) => ['content', 'details', 'name', 'title'].includes(key)),
      ),
  );
});
