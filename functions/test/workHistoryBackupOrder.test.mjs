import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkHistoryService } from '../src/workHistory.mjs';
import { digest } from '../src/workHistoryContracts.mjs';
import { studioDb } from './helpers/studioDb.mjs';
const target = { kind: 'book', id: 'book' };
function fixture() {
  const f = studioDb();
  f.records.set('books/book', { authorId: 'author', title: 'Livro', createdAt: 1, updatedAt: 2 });
  for (let index = 0; index < 58; index++) {
    const id = 'version-' + String(index).padStart(3, '0'),
      resource = { kind: index % 2 ? 'scene' : 'chapter', id: 'removed-' + index };
    f.records.set('books/book/workVersions/' + id, {
      id,
      schemaVersion: 1,
      target,
      resource,
      resourceKey: digest(resource),
      deleting: index === 14,
      createdAt: index,
      reason: 'manual',
      label: null,
      wordCount: 0,
      byteLength: 0,
      chunkCount: 1,
      contentHash: digest(''),
    });
  }
  return { ...f, api: createWorkHistoryService({ db: f.db }) };
}
const list = (f, extra = {}, uid = 'author') =>
  f.api.listWorkVersions(uid, { target, limit: 20, ...extra });
test('ID pages capture the complete selection in ascending ID order with removed resources and no root mutation', async () => {
  const f = fixture(),
    before = structuredClone(f.records),
    source = await f.api.getWorkHistoryBackupSource('author', { target });
  let cursor = null;
  const ids = [];
  do {
    const page = await list(f, { order: 'id', cursor, expectedHistoryToken: source.sourceToken });
    ids.push(...page.items.map((item) => item.id));
    cursor = page.nextCursor;
  } while (cursor);
  assert.equal(ids.length, 57);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids, [...ids].sort());
  assert.equal(ids.includes('version-014'), false);
  assert.deepEqual(f.records, before);
  assert.ok(f.reads.every((value) => value.maximum === 21));
});
test('date order and its cursor remain compatible; crossing order or resource scopes is refused', async () => {
  const f = fixture(),
    datePage = await list(f),
    idPage = await list(f, { order: 'id' });
  assert.deepEqual(
    datePage.items.map((item) => item.id),
    [...datePage.items.map((item) => item.id)].sort().reverse(),
  );
  assert.notEqual(datePage.nextCursor, idPage.nextCursor);
  await assert.rejects(list(f, { order: 'id', cursor: datePage.nextCursor }), {
    code: 'invalid-argument',
  });
  await assert.rejects(list(f, { cursor: idPage.nextCursor }), { code: 'invalid-argument' });
  await assert.rejects(
    list(f, {
      order: 'id',
      cursor: idPage.nextCursor,
      resource: { kind: 'chapter', id: 'removed-0' },
    }),
    { code: 'invalid-argument' },
  );
  const filtered = await list(f, { order: 'id', resource: { kind: 'chapter', id: 'removed-0' } });
  assert.deepEqual(
    filtered.items.map((item) => item.id),
    ['version-000'],
  );
  const decoded = JSON.parse(Buffer.from(idPage.nextCursor, 'base64url').toString());
  decoded.date = 1;
  await assert.rejects(
    list(f, { order: 'id', cursor: Buffer.from(JSON.stringify(decoded)).toString('base64url') }),
    { code: 'invalid-argument' },
  );
});
test('new order keeps authentication, source revision and closed-input gates', async () => {
  const f = fixture(),
    source = await f.api.getWorkHistoryBackupSource('author', { target });
  for (const order of [null, false, 'date', 'desc'])
    await assert.rejects(list(f, { order }), { code: 'invalid-argument' });
  await assert.rejects(list(f, { order: 'id' }, null), { code: 'unauthenticated' });
  await assert.rejects(list(f, { order: 'id' }, 'other'), { code: 'not-found' });
  const page = await list(f, { order: 'id', expectedHistoryToken: source.sourceToken });
  await f.db.runTransaction((tx) => tx.update(f.db.doc('books/book'), { historyRevision: 1 }));
  await assert.rejects(
    list(f, { order: 'id', cursor: page.nextCursor, expectedHistoryToken: source.sourceToken }),
    { details: { reason: 'history-snapshot-changed' } },
  );
});
