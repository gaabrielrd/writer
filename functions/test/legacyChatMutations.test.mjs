import test from 'node:test';
import assert from 'node:assert/strict';
import { studioDb } from './helpers/studioDb.mjs';
import { createLegacyChatMutations } from '../src/legacyChatMutations.mjs';
const uid = 'author',
  data = { bookId: 'book', chapterId: 'chapter', conversationId: 'conversation' },
  base = 'users/author/chapterChats/book/chapters/chapter',
  parent = base + '/conversations/conversation';
function fixture(count = 235) {
  const f = studioDb();
  f.records.set('books/book', { authorId: uid, updatedAt: 1 });
  f.records.set('books/book/chapters/chapter', { bookId: 'book' });
  f.records.set(parent, { draft: 'Rascunho anterior', busy: null, updatedAt: 1 });
  for (let i = 0; i < count; i++)
    f.records.set(parent + '/messages/m' + String(i).padStart(4, '0'), {
      createdAt: i + 1,
      role: i % 2 ? 'assistant' : 'user',
      text: 'PRIVATE MESSAGE ' + i,
    });
  return { ...f, api: createLegacyChatMutations({ db: f.db, now: () => 1000 }) };
}
test('paged edit retains only metadata and resumes without removing older messages or changing credits', async () => {
  const f = fixture(),
    request = { ...data, mutationId: 'edit-job' };
  const started = await f.api.run(uid, request, 'edit', { before: 10, draft: 'Pedido refeito' });
  assert.equal(started.mutation.state, 'running');
  assert.equal(started.mutation.deletedDocuments, 200);
  assert.equal(f.records.get(parent).draft, 'Pedido refeito');
  assert.equal(f.records.get(parent).draftEpoch, 1);
  const job = f.records.get(base + '/mutationJobs/edit-job');
  assert.equal(JSON.stringify(job).includes('PRIVATE'), false);
  assert.equal(JSON.stringify(job).includes('Pedido refeito'), false);
  assert.equal(Object.hasOwn(job, 'draft'), false);
  assert.ok(
    f.reads
      .filter((query) => query.collectionPath.endsWith('/messages'))
      .every(
        (query) =>
          query.maximum === 20 &&
          JSON.stringify(query.fields) ===
            JSON.stringify(['role', 'messageInstance', 'generationAttempt']),
      ),
  );
  const before = f.records.get('books/book').literaryDependencyRevision;
  assert.deepEqual(await f.api.resume(uid, request), {});
  assert.equal(f.records.get(parent).busy, null);
  assert.equal(
    [...f.records.keys()].filter((path) => path.startsWith(parent + '/messages/')).length,
    9,
  );
  assert.equal(f.records.has(parent + '/messages/m0008'), true);
  assert.equal(f.records.has(parent + '/messages/m0009'), false);
  assert.ok(f.records.get('books/book').literaryDependencyRevision > before);
  const snapshot = structuredClone([...f.records]);
  assert.deepEqual(
    await f.api.run(uid, request, 'edit', { before: 10, draft: 'Pedido refeito' }),
    {},
  );
  assert.deepEqual([...f.records], snapshot);
});
test('delete handles absent parents with native flat message children and fences recreation until done', async () => {
  const f = fixture();
  f.records.delete(parent);
  const request = { ...data, mutationId: 'delete-job' };
  const started = await f.api.run(uid, request, 'delete');
  assert.equal(started.mutation.deletedDocuments, 200);
  await assert.rejects(
    f.db.runTransaction((tx) => f.api.creationAvailable(tx, uid, data)),
    { code: 'failed-precondition' },
  );
  await f.api.resume(uid, request);
  assert.equal(
    [...f.records.keys()].some((path) => path === parent || path.startsWith(parent + '/messages/')),
    false,
  );
  await f.db.runTransaction((tx) => f.api.creationAvailable(tx, uid, data));
  f.records.set(parent, { draft: 'Nova conversa', busy: null, updatedAt: 2000 });
  f.metadata.set(parent, { createdAt: 9999 });
  f.records.set(parent + '/messages/new', { text: 'New generation' });
  const snapshot = structuredClone([...f.records]);
  await f.api.run(uid, request, 'delete');
  assert.deepEqual([...f.records], snapshot);
});
test('a replaced execution token or native parent incarnation cannot delete another page', async () => {
  for (const change of ['token', 'birth']) {
    const f = fixture(),
      request = { ...data, mutationId: 'guarded-job' };
    await f.api.run(uid, request, 'edit', { before: 0, draft: 'Pedido' });
    if (change === 'token') f.records.get(parent).chatMutationToken = 'replacement-token';
    else f.metadata.set(parent, { createdAt: 9999 });
    const snapshot = structuredClone([...f.records]);
    await assert.rejects(f.api.resume(uid, request), { code: 'failed-precondition' });
    assert.deepEqual([...f.records], snapshot);
  }
});
test('another command cannot overwrite an unfinished job or adopt its draft', async () => {
  const f = fixture();
  await f.api.run(uid, { ...data, mutationId: 'pending-job' }, 'edit', {
    before: 0,
    draft: 'Original',
  });
  const snapshot = structuredClone([...f.records]);
  await assert.rejects(
    f.api.run(uid, { ...data, mutationId: 'other-job' }, 'edit', { before: 5, draft: 'Another' }),
    { code: 'failed-precondition' },
  );
  assert.deepEqual([...f.records], snapshot);
  assert.equal((await f.api.pending(uid, data)).id, 'pending-job');
});
test('concurrent page callers serialize the same journal without duplicate deletion counts', async () => {
  const f = fixture(500),
    request = { ...data, mutationId: 'concurrent-job' };
  await f.api.run(uid, request, 'delete');
  await Promise.all([f.api.resume(uid, request), f.api.resume(uid, request)]);
  const job = f.records.get(base + '/mutationJobs/concurrent-job');
  assert.equal(job.state, 'completed');
  assert.equal(job.deletedDocuments, 500);
  assert.equal(f.records.has(parent), false);
});
test('changed book owner prevents later pages and journal updates', async () => {
  const f = fixture(),
    request = { ...data, mutationId: 'revoked-job' };
  await f.api.run(uid, request, 'delete');
  f.records.get('books/book').authorId = 'other';
  const snapshot = structuredClone([...f.records]);
  await assert.rejects(f.api.resume(uid, request), { code: 'permission-denied' });
  assert.deepEqual([...f.records], snapshot);
});

test('chapter discovery finds a pending orphan by its current native scope and never borrows a prior incarnation', async () => {
  const f = fixture(),
    request = { ...data, mutationId: 'discover-job' };
  await f.api.run(uid, request, 'delete');
  f.records.delete(parent);
  const chapter = { bookId: data.bookId, chapterId: data.chapterId };
  assert.equal((await f.api.pending(uid, chapter)).id, 'discover-job');
  assert.ok(
    f.reads
      .filter((query) => query.collectionPath.endsWith('/mutationHeads'))
      .every((query) => query.maximum === 1),
  );
  f.metadata.set('books/book/chapters/chapter', { createdAt: 99999 });
  assert.equal(await f.api.pending(uid, chapter), null);
});
