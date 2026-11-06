import test from 'node:test';
import assert from 'node:assert/strict';
import { workFixture, book, operation } from './workProgressFixtures.mjs';
import { createLiteraryMilestoneService } from '../src/literaryMilestones.mjs';
import { createWorkHistoryService } from '../src/workHistory.mjs';
import { digest } from '../src/workProgressContracts.mjs';
function fixture(count = 0) {
  const f = workFixture();
  f.records.set('books/book', { ...f.records.get('books/book'), hasProgressResources: true });
  f.records.set('books/book/chapters/chapter', {
    bookId: 'book',
    title: 'A carta',
    content: '<p>Uma carta chega.</p>',
    ...(count ? { contentMode: 'scenes', rankSlot: 'A', assemblyRevision: 1 } : {}),
    updatedAt: 100,
  });
  for (let index = 0; index < count; index++) {
    const id = 'scene-' + String(index).padStart(3, '0'),
      content = '<p>Cena ' + index + ': uma escolha.</p>';
    f.records.set('books/book/scenes/' + id, {
      id,
      ownerId: 'author',
      parentId: 'chapter',
      archived: false,
      revision: 1,
      rankA: String(index).padStart(4, '0'),
      title: id,
      bodyHash: digest(content),
      wordCount: 4,
      updatedAt: 100,
    });
    f.records.set('books/book/scenes/' + id + '/body/current', { content, hash: digest(content) });
  }
  return { ...f, api: createLiteraryMilestoneService({ db: f.db, now: () => 300 }) };
}
const start = (kind = 'firstDraft') => ({
  target: book,
  jobId: operation(40),
  chapterId: 'chapter',
  kind,
});
const advance = { target: book, jobId: operation(40) };
async function finish(f) {
  for (let index = 0; index < 150; index++) {
    const value = await f.api.advanceLiteraryMilestone('author', advance);
    if (value.state === 'done') return value;
    assert.ok(!['stale', 'canceled'].includes(value.state));
  }
  throw new Error('Captura não concluiu dentro do cenário.');
}
test('legacy chapter preservation uses native immutable history without rewriting prose', async () => {
  const f = fixture();
  await f.api.startLiteraryMilestone('author', start());
  const result = await finish(f);
  assert.equal(result.captured, 1);
  assert.equal(result.verified, 1);
  const page = await f.api.listLiteraryMilestoneVersions('author', advance);
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].version.resource.kind, 'chapter');
  assert.equal(page.items[0].version.contentHash, digest('<p>Uma carta chega.</p>'));
  assert.equal(f.records.get('books/book/chapters/chapter').content, '<p>Uma carta chega.</p>');
  assert.equal(f.records.get('books/book').status, 'published');
  assert.deepEqual(await f.api.advanceLiteraryMilestone('author', advance), result);
  assert.equal(
    [...f.records.keys()].filter((key) => key.startsWith('books/book/workVersions/')).length,
    1,
  );
});
test('a composed chapter is enumerated and captured in bounded pages without imposing a scene count', async () => {
  const f = fixture(27);
  await f.api.startLiteraryMilestone('author', start());
  let value = await f.api.advanceLiteraryMilestone('author', advance);
  assert.equal(value.planned, 25);
  assert.equal(value.state, 'planning');
  value = await f.api.advanceLiteraryMilestone('author', advance);
  assert.equal(value.planned, 27);
  assert.equal(value.state, 'capturing');
  const done = await finish(f);
  assert.equal(done.captured, 27);
  assert.equal(done.verified, 27);
  const first = await f.api.listLiteraryMilestoneVersions('author', advance);
  assert.equal(first.items.length, 20);
  const second = await f.api.listLiteraryMilestoneVersions('author', {
    ...advance,
    afterIndex: first.nextAfterIndex,
  });
  assert.equal(second.items.length, 7);
  assert.equal(
    [...first.items, ...second.items].every((item) => item.version.resource.kind === 'scene'),
    true,
  );
});
test('source drift interrupts capture while preserving native versions already captured', async () => {
  const f = fixture(2);
  await f.api.startLiteraryMilestone('author', start());
  await f.api.advanceLiteraryMilestone('author', advance);
  await f.api.advanceLiteraryMilestone('author', advance);
  f.metadata.set('books/book/chapters/chapter', { updatedAt: 500 });
  const value = await f.api.advanceLiteraryMilestone('author', advance);
  assert.equal(value.state, 'stale');
  assert.equal(value.captured, 1);
  assert.equal(
    [...f.records.keys()].filter((key) => key.startsWith('books/book/workVersions/')).length,
    1,
  );
});
test('canceling an absent start fences a late start without creating versions', async () => {
  const f = fixture();
  assert.equal((await f.api.cancelLiteraryMilestone('author', advance)).state, 'canceled');
  assert.equal((await f.api.startLiteraryMilestone('author', start())).state, 'canceled');
  assert.equal(
    [...f.records.keys()].filter((key) => key.startsWith('books/book/workVersions/')).length,
    0,
  );
});
test('a late native capture cannot reopen a canceled checkpoint', async () => {
  const f = fixture(),
    native = createWorkHistoryService({ db: f.db, now: () => 300 });
  let resume, started;
  const waiting = new Promise((resolve) => {
    resume = resolve;
  });
  const claimed = new Promise((resolve) => {
    started = resolve;
  });
  const api = createLiteraryMilestoneService({
    db: f.db,
    now: () => 300,
    history: {
      createWorkVersion: async (...args) => {
        started();
        await waiting;
        return native.createWorkVersion(...args);
      },
    },
  });
  await api.startLiteraryMilestone('author', start());
  const active = api.advanceLiteraryMilestone('author', advance);
  await claimed;
  await api.cancelLiteraryMilestone('author', advance);
  resume();
  const result = await active;
  assert.equal(result.state, 'canceled');
  assert.equal(result.captured, 0);
  assert.equal((await api.getLiteraryMilestone('author', advance)).state, 'canceled');
});
test('capture permission is bound to the owning active book', async () => {
  const f = fixture();
  await assert.rejects(f.api.startLiteraryMilestone('other', start()), { code: 'not-found' });
  await f.api.startLiteraryMilestone('author', start('revised'));
  f.records.set('books/book', { ...f.records.get('books/book'), deleting: true });
  await assert.rejects(f.api.advanceLiteraryMilestone('author', advance), { code: 'not-found' });
});

test('a completed milestone rechecks versions after history mutation and detects a missing version', async () => {
  const f = fixture();
  await f.api.startLiteraryMilestone('author', start());
  await finish(f);
  const page = await f.api.listLiteraryMilestoneVersions('author', advance);
  const versionId = page.items[0].version.id;
  await f.db.runTransaction(async (tx) => {
    const root = (await tx.get(f.db.doc('books/book'))).data();
    tx.update(f.db.doc('books/book'), { historyRevision: (root.historyRevision ?? 0) + 1 });
    tx.update(f.db.doc('books/book/workVersions/' + versionId), { deleting: true });
  });
  assert.equal((await f.api.recheckLiteraryMilestone('author', advance)).state, 'verifying');
  const result = await f.api.advanceLiteraryMilestone('author', advance);
  assert.equal(result.state, 'stale');
});
