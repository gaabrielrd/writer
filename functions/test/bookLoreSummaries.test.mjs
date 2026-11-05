import test from 'node:test';
import assert from 'node:assert/strict';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import { loreLogicalFixture } from './helpers/bookLoreLogicalFixture.mjs';
import { seedBookLoreRead } from './helpers/bookLoreReadFixture.mjs';
import { seedBookLoreGeneration } from './helpers/bookLoreGenerationFixture.mjs';
import { createBookLoreReadService } from '../src/bookLoreRead.mjs';

const request = { bookId: 'book', tokenVersion: 2, projection: 'summary' };
function fixture() {
  const f = adventureImportDb({ nativeUpdates: true });
  const seen = [],
    run = f.db.runTransaction.bind(f.db);
  f.db.runTransaction = (fn) =>
    run((tx) =>
      fn({
        ...tx,
        get(ref, ...args) {
          if (ref.path) seen.push(ref.path);
          return tx.get(ref, ...args);
        },
      }),
    );
  return { ...f, seen, api: createBookLoreReadService({ db: f.db }) };
}
for (const mode of ['inline', 'v1', 'v2', 'created'])
  test(
    'summary lists ' + mode + ' without exposing full content or physical pointers',
    async () => {
      const f = fixture(),
        seed = await loreLogicalFixture(f.db, { mode });
      f.seen.length = 0;
      const page = await f.api.listBookLoreRead('author', request),
        row = page.items[0];
      assert.equal(page.schemaVersion, 2);
      assert.deepEqual(
        Object.keys(row).sort(),
        [
          'id',
          'readToken',
          'name',
          'category',
          'aliases',
          'summary',
          'isPublic',
          'relationCount',
        ].sort(),
      );
      assert.equal(row.id, seed.entityId);
      assert.equal(row.name, seed.expected.name);
      assert.equal(row.category, seed.expected.category);
      assert.deepEqual(row.aliases, seed.expected.aliases ?? []);
      assert.equal(row.summary, seed.expected.summary ?? '');
      assert.equal(row.isPublic, seed.expected.isPublic === true);
      assert.equal(row.relationCount, seed.expected.relations?.length ?? 0);
      assert.equal(
        f.seen.some((path) => path.includes('/bookLoreSegments/')),
        false,
      );
      const view = await f.api.getBookLoreRead('author', {
        bookId: 'book',
        id: row.id,
        readToken: row.readToken,
      });
      assert.equal(view.readToken, row.readToken);
    },
  );

test('flat generations do not read detail or structured detail bodies or relation pages', async () => {
  const f = fixture(),
    seed = await seedBookLoreGeneration(f.db, {
      noBase: true,
      fields: {
        name: 'Literal 🌙',
        category: 'character',
        aliases: ['', 'same', 'same'],
        summary: ' exact summary ',
        details: 'private'.repeat(20000),
        structuredDetails: { notes: 'secret notes' },
        isPublic: true,
      },
      relations: [
        { targetEntityId: 'other', relationType: 'knows', description: 'secret relation' },
      ],
    });
  f.seen.length = 0;
  const page = await f.api.listBookLoreRead('author', request);
  assert.equal(page.items[0].summary, ' exact summary ');
  assert.equal(page.items[0].relationCount, 1);
  for (const field of ['details', 'structuredDetails']) {
    const bodyId = seed.bodies[field].prepared.manifest.bodyId;
    assert.equal(
      f.seen.some((path) => path.includes(bodyId)),
      false,
    );
  }
  assert.equal(
    f.seen.some((path) => path.includes('/bookLoreSegments/')),
    false,
  );
});

test('summary pages preserve IDs, cursors and v2 tokens and reject changed list clocks', async () => {
  const f = fixture();
  for (let n = 0; n < 17; n++)
    await seedBookLoreRead(f.db, {
      id: 'id-' + String(n).padStart(2, '0'),
      inline: true,
      data: { name: 'Name ' + n, category: 'other' },
    });
  let cursor, listToken;
  const items = [];
  do {
    const page = await f.api.listBookLoreRead('author', {
      ...request,
      limit: 5,
      ...(cursor ? { cursor, listToken } : {}),
    });
    cursor = page.nextCursor;
    listToken = page.listToken;
    items.push(...page.items);
  } while (cursor);
  const metadata = await f.api.listBookLoreRead('author', { bookId: 'book', tokenVersion: 2 });
  assert.deepEqual(
    items.map(({ id, readToken }) => ({ id, readToken })),
    metadata.items,
  );
  await f.db.runTransaction(async (tx) =>
    tx.update(f.db.doc('books/book'), { localLoreVersion: 1 }),
  );
  await assert.rejects(f.api.listBookLoreRead('author', { ...request, listToken }), /mudou/);
});

test('summary never bypasses current authorization, tombstones or deletion', async () => {
  const f = fixture();
  await seedBookLoreRead(f.db, { inline: true, data: { name: 'A', category: 'other' } });
  await assert.rejects(f.api.listBookLoreRead('another', request));
  await assert.rejects(f.api.listBookLoreRead('', request));
  await assert.rejects(f.api.listBookLoreRead('author', { ...request, tokenVersion: 1 }));
  await assert.rejects(f.api.listBookLoreRead('author', { ...request, projection: 'full' }));
  await f.db.runTransaction(async (tx) =>
    tx.create(f.db.doc('books/book/bookLoreTombstones/entity'), {}),
  );
  await assert.rejects(f.api.listBookLoreRead('author', request));
  await f.db.runTransaction(async (tx) => tx.update(f.db.doc('books/book'), { deleting: true }));
  await assert.rejects(f.api.listBookLoreRead('author', request));
});
