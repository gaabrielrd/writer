import test from 'node:test';
import assert from 'node:assert/strict';
import { studioDb } from './helpers/studioDb.mjs';
import { workScope } from '../src/workProgressContracts.mjs';
import { readLiteraryImpactFence } from '../src/literaryImpactFence.mjs';
import { readLiteraryIntegrationFence } from '../src/literaryIntegrationSources.mjs';
import { prepareLiteraryDependencyWrite } from '../src/literaryDependencyClock.mjs';
const target = { kind: 'book', id: 'one' };
function fixture() {
  const f = studioDb();
  f.records.set('books/one', { authorId: 'author', updatedAt: 10, universeId: null });
  const c = workScope(f.db, 'author', { target }, []);
  const read = (bookIds = ['one']) =>
    f.db.runTransaction((tx) => readLiteraryImpactFence(tx, c, { bookIds }));
  return { ...f, c, read };
}
test('metadata topology edits change the impact fence without invalidating integration sources', async () => {
  const f = fixture(),
    before = await f.read();
  const integrationBefore = await f.db.runTransaction((tx) =>
    readLiteraryIntegrationFence(tx, f.c),
  );
  await f.db.runTransaction(async (tx) => {
    const write = await prepareLiteraryDependencyWrite(tx, f.c);
    tx.create(f.db.doc('books/one/literaryReviewJobs/new'), { chapterId: 'c' });
    write.commit();
  });
  assert.notEqual((await f.read()).token, before.token);
  const integrationAfter = await f.db.runTransaction((tx) => readLiteraryIntegrationFence(tx, f.c));
  assert.equal(integrationAfter.token, integrationBefore.token);
});
test('the fence includes every selected volume and each distinct linked universe', async () => {
  const f = fixture();
  f.records.set('books/one', { authorId: 'author', updatedAt: 10, universeId: 'first-world' });
  f.records.set('books/two', { authorId: 'author', updatedAt: 10, universeId: 'second-world' });
  for (const id of ['first-world', 'second-world'])
    f.records.set('universes/' + id, { authorId: 'author', privateNotes: 'Never project this' });
  const before = await f.read(['two', 'one']);
  assert.deepEqual(before.bookIds, ['one', 'two']);
  assert.deepEqual(before.universeIds, ['first-world', 'second-world']);
  assert.equal((await f.read(['one', 'two'])).token, before.token);
  await f.db.runTransaction(async (tx) => {
    await tx.get(f.db.doc('universes/second-world'));
    tx.update(f.db.doc('universes/second-world'), { loreVersion: 2 });
  });
  assert.notEqual((await f.read(['one', 'two'])).token, before.token);
  assert.ok(
    f.metadataReads
      .filter((row) => row.path.startsWith('universes/'))
      .every((row) => !row.fields.includes('privateNotes')),
  );
});
test('removed ownership or deleting state of any volume/universe prevents fence delivery', async () => {
  for (const path of ['books/two', 'universes/world']) {
    const f = fixture();
    f.records.set('books/two', { authorId: 'author', updatedAt: 10, universeId: 'world' });
    f.records.set('universes/world', { authorId: 'author' });
    f.records.set(path, { ...f.records.get(path), authorId: 'other' });
    await assert.rejects(f.read(['one', 'two']), { code: 'permission-denied' });
  }
});
test('recreated identities cannot preserve a fence by reusing fields and IDs', async () => {
  const f = fixture(),
    before = await f.read();
  f.metadata.set('books/one', { createdAt: 30, updatedAt: 10 });
  assert.notEqual((await f.read()).token, before.token);
});
test('native root updates and semantic source changes invalidate the impact fence', async () => {
  const f = fixture(),
    before = await f.read();
  await f.db.runTransaction(async (tx) => {
    await tx.get(f.c.ref);
    tx.update(f.c.ref, { hasLiteraryResources: true });
  });
  assert.notEqual((await f.read()).token, before.token);
  for (const field of [
    'sceneRevision',
    'narrativeRevision',
    'literaryRevision',
    'literaryContextRevision',
    'localLoreVersion',
    'loreVersion',
    'historyRevision',
  ]) {
    const previous = await f.read();
    await f.db.runTransaction(async (tx) => {
      await tx.get(f.c.ref);
      tx.update(f.c.ref, { [field]: 1 });
    });
    assert.notEqual((await f.read()).token, previous.token);
  }
});
