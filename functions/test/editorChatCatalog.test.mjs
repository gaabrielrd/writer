import test from 'node:test';
import assert from 'node:assert/strict';
import { studioDb } from './helpers/studioDb.mjs';
import {
  readEditorChatCatalogFence,
  prepareEditorChatCatalogUpdate,
} from '../src/editorChatCatalog.mjs';
import { workScope } from '../src/workProgressContracts.mjs';
import { readLiteraryImpactFence } from '../src/literaryImpactFence.mjs';
import { readLiteraryIntegrationFence } from '../src/literaryIntegrationSources.mjs';
test('native catalog fence detects revision and incarnation without entering semantic integration tokens', async () => {
  const f = studioDb(),
    target = { kind: 'book', id: 'book' };
  f.records.set('books/book', { authorId: 'author', updatedAt: 1 });
  const c = workScope(f.db, 'author', { target }, []),
    path = 'users/author/editorChatCatalogs/current';
  const impact = () =>
    f.db.runTransaction((tx) => readLiteraryImpactFence(tx, c, { bookIds: ['book'] }));
  const integration = () => f.db.runTransaction((tx) => readLiteraryIntegrationFence(tx, c));
  const before = await impact(),
    semantic = await integration();
  await f.db.runTransaction(async (tx) => {
    const write = await prepareEditorChatCatalogUpdate(tx, f.db, 'author', 100);
    write.commit();
  });
  const created = await impact();
  assert.notEqual(created.token, before.token);
  assert.equal((await integration()).token, semantic.token);
  f.metadata.set(path, { createdAt: 999 });
  assert.notEqual((await impact()).token, created.token);
  assert.equal((await integration()).token, semantic.token);
});
test('missing, foreign and malformed native catalog controls never certify a source census', async () => {
  for (const data of [
    null,
    { schemaVersion: 1, ownerId: 'other', revision: 1, updatedAt: 1 },
    { schemaVersion: 1, ownerId: 'author', revision: 1, updatedAt: 1, prompt: 'PRIVATE' },
    { schemaVersion: 1, ownerId: 'author', revision: -1, updatedAt: 1 },
  ]) {
    const f = studioDb();
    if (data) f.records.set('users/author/editorChatCatalogs/current', data);
    else f.records.set('users/author/editorChats/conversation', { summary: { title: 'PRIVATE' } });
    await assert.rejects(
      f.db.runTransaction((tx) => readEditorChatCatalogFence(tx, f.db, 'author')),
    );
  }
});
test('each native catalog transaction attempt reads again and advances its actual stored revision', async () => {
  const f = studioDb(),
    path = 'users/author/editorChatCatalogs/current';
  for (let revision = 1; revision <= 2; revision++) {
    await f.db.runTransaction(async (tx) => {
      const write = await prepareEditorChatCatalogUpdate(tx, f.db, 'author', 100);
      assert.equal(write.revision, revision);
      write.commit();
    });
  }
  assert.equal(f.records.get(path).revision, 2);
});
