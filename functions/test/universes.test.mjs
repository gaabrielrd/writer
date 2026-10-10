import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUniverseService, prepareUniverseLink } from '../src/universes.mjs';
import { createImageLibraryService } from '../src/imageLibrary.mjs';

function fixture() {
  const records = new Map();
  let queue = Promise.resolve();
  let cleanupFailure = false;
  const snapshot = (ref) => ({
    exists: records.has(ref.path),
    data: () => structuredClone(records.get(ref.path)),
  });
  const db = {
    doc: (path) => ({ path }),
    runTransaction(operation) {
      const run = queue.then(async () => {
        const writes = [];
        const tx = {
          get: async (ref) => {
            assert.equal(writes.length, 0, 'Reads must precede writes');
            return snapshot(ref);
          },
          set: (ref, value) => writes.push(() => records.set(ref.path, structuredClone(value))),
          create: (ref, value) =>
            writes.push(() => {
              assert.ok(!records.has(ref.path));
              records.set(ref.path, structuredClone(value));
            }),
          update: (ref, value) =>
            writes.push(() => {
              assert.ok(records.has(ref.path));
              records.set(ref.path, { ...records.get(ref.path), ...structuredClone(value) });
            }),
          delete: (ref) => writes.push(() => records.delete(ref.path)),
        };
        const result = await operation(tx);
        writes.forEach((write) => write());
        return result;
      });
      queue = run.catch(() => {});
      return run;
    },
    recursiveDelete: async (ref) => {
      if (cleanupFailure) throw new Error('cleanup failed');
      for (const path of records.keys())
        if (path === ref.path || path.startsWith(ref.path + '/')) records.delete(path);
    },
  };
  const service = createUniverseService({ db, now: () => 100 });
  const books = createImageLibraryService({ db, assets: {}, now: () => 100 });
  return {
    records,
    db,
    service,
    books,
    failCleanup: (value) => {
      cleanupFailure = value;
    },
  };
}
const world = { creationId: 'world', name: 'Atlas', description: 'Fantasia' };
const lore = {
  name: 'Arthur',
  category: 'character',
  summary: 'O rei',
  aliases: ['Rei'],
  isPublic: true,
};
const createBookInput = { creationId: 'book-000000000001', title: 'Livro', universeId: 'world' };

test('universe creation is authenticated, owner-only, validated and idempotent', async () => {
  const { service, records } = fixture();
  await assert.rejects(service.createUniverse(null, world), { code: 'unauthenticated' });
  await assert.rejects(service.createUniverse('author', { ...world, name: ' ' }), {
    code: 'invalid-argument',
  });
  const initial = await service.createUniverse('author', world);
  assert.deepEqual(await service.createUniverse('author', world), initial);
  await assert.rejects(service.createUniverse('other', world), { code: 'permission-denied' });
  assert.equal(records.get('publicUniversePrivacy/world').version, 0);
  const updated = await service.updateUniverse('author', {
    id: 'world',
    name: 'Atlas II',
    description: '',
  });
  assert.equal(updated.name, 'Atlas II');
  await assert.rejects(service.updateUniverse('other', { id: 'world', name: 'Takeover' }), {
    code: 'permission-denied',
  });
});

test('manual and library-cover books attach atomically and retries never increase usage', async () => {
  const { service, books, records } = fixture();
  await service.createUniverse('author', world);
  await books.saveBook('author', createBookInput);
  await books.saveBook('author', createBookInput);
  assert.equal(records.get('universes/world').bookCount, 1);
  records.set('users/author/imageLibrary/image-0000000001', {
    state: 'active',
    url: 'https://example.test/cover',
    useCount: 0,
  });
  await books.saveBook('author', {
    ...createBookInput,
    creationId: 'book-000000000002',
    coverImageId: 'image-0000000001',
  });
  assert.equal(records.get('universes/world').bookCount, 2);
  assert.equal(records.get('users/author/imageLibrary/image-0000000001').useCount, 1);
  await assert.rejects(
    books.saveBook('other', { ...createBookInput, creationId: 'book-000000000003' }),
    { code: 'permission-denied' },
  );
  await assert.rejects(
    books.saveBook('author', {
      ...createBookInput,
      creationId: 'book-000000000004',
      universeId: 'missing',
    }),
    { code: 'permission-denied' },
  );
  await assert.rejects(
    books.saveBook('author', {
      ...createBookInput,
      creationId: 'book-000000000005',
      universeId: 42,
    }),
    { code: 'invalid-argument' },
  );
});

test('switching and detaching preserve manuscripts, covers and local lore and revoke publication', async () => {
  const { service, books, records } = fixture();
  await service.createUniverse('author', world);
  await service.createUniverse('author', { ...world, creationId: 'second' });
  await books.saveBook('author', {
    ...createBookInput,
    coverUrl: 'https://example.test/manual-cover',
  });
  records.set('publicBooks/book-000000000001', { revisionId: 'old' });
  records.set('books/book-000000000001/chapters/one', { content: 'Texto' });
  records.set('books/book-000000000001/lore/local', { name: 'Local' });
  await books.saveBook('author', { bookId: 'book-000000000001', universeId: 'second' });
  assert.equal(
    records.get('books/book-000000000001').coverUrl,
    'https://example.test/manual-cover',
  );
  assert.equal(records.get('books/book-000000000001/chapters/one').content, 'Texto');
  assert.equal(records.get('books/book-000000000001/lore/local').name, 'Local');
  assert.equal(records.has('publicBooks/book-000000000001'), false);
  assert.equal(records.get('universes/world').bookCount, 0);
  assert.equal(records.get('universes/second').bookCount, 1);
  await books.saveBook('author', { bookId: 'book-000000000001', universeId: null });
  assert.equal(records.get('universes/second').bookCount, 0);
  assert.equal(records.get('books/book-000000000001').universeId, null);
});

test('global lore validates relations and revokes all dependent versions atomically', async () => {
  const { service, records } = fixture();
  await service.createUniverse('author', world);
  const first = await service.saveUniverseLore('author', {
    universeId: 'world',
    id: 'arthur',
    create: true,
    input: lore,
  });
  assert.equal(first.id, 'universe:world:arthur');
  await service.saveUniverseLore('author', {
    universeId: 'world',
    id: 'arthur',
    create: true,
    input: lore,
  });
  assert.equal(records.get('universes/world').loreVersion, 1);
  await assert.rejects(
    service.saveUniverseLore('other', { universeId: 'world', id: 'x', create: true, input: lore }),
    { code: 'permission-denied' },
  );
  const save = (relations) =>
    service.saveUniverseLore('author', {
      universeId: 'world',
      id: 'avalon',
      create: true,
      input: { ...lore, relations },
    });
  await assert.rejects(save([{ targetEntityId: 'book-local', relationType: 'Local' }]), {
    code: 'invalid-argument',
  });
  await assert.rejects(
    save([{ targetEntityId: 'universe:world:missing', relationType: 'Local' }]),
    { code: 'failed-precondition' },
  );
  await assert.rejects(save([{ targetEntityId: 'universe:world:avalon', relationType: 'Local' }]), {
    code: 'invalid-argument',
  });
  await save([{ targetEntityId: 'universe:world:arthur', relationType: 'Governado por' }]);
  await service.saveUniverseLore('author', {
    universeId: 'world',
    id: 'arthur',
    input: { ...lore, isPublic: false },
  });
  assert.equal(records.get('publicUniversePrivacy/world').version, 1);
  assert.equal(records.get('universes/world').privacyVersion, 1);
  await service.deleteUniverseLore('author', { universeId: 'world', id: 'avalon' });
  assert.equal(records.get('publicUniversePrivacy/world').version, 2);
  await service.deleteUniverseLore('author', { universeId: 'world', id: 'arthur' });
  assert.equal(records.get('publicUniversePrivacy/world').version, 2);
});

test('exclusion blocks linked universes and safely resumes failed recursive cleanup', async () => {
  const { service, books, records, failCleanup } = fixture();
  await service.createUniverse('author', world);
  await books.saveBook('author', createBookInput);
  await assert.rejects(service.deleteUniverse('author', { id: 'world' }), {
    code: 'failed-precondition',
  });
  await service.detachUniverse('author', 'world', 'book-000000000001');
  await service.detachUniverse('author', 'world', 'book-000000000001');
  assert.equal(records.get('universes/world').bookCount, 0);
  await service.saveUniverseLore('author', {
    universeId: 'world',
    id: 'arthur',
    create: true,
    input: lore,
  });
  failCleanup(true);
  await assert.rejects(service.deleteUniverse('author', { id: 'world' }), /cleanup failed/);
  await assert.rejects(
    books.saveBook('author', { ...createBookInput, creationId: 'book-000000000009' }),
    { code: 'failed-precondition' },
  );
  failCleanup(false);
  await service.deleteUniverse('author', { id: 'world' });
  assert.equal(records.has('universes/world/lore/arthur'), false);
  assert.equal(records.get('publicUniversePrivacy/world').active, false);
  await assert.rejects(service.createUniverse('author', world), { code: 'failed-precondition' });
});

test('concurrent deletion and linking cannot leave an attached book without its universe', async () => {
  const { db, service, records } = fixture();
  await service.createUniverse('author', world);
  const results = await Promise.allSettled([
    db.runTransaction(async (tx) => {
      const link = await prepareUniverseLink(tx, db, 'author', 'book', null, 'world');
      link.commit();
    }),
    service.deleteUniverse('author', { id: 'world' }),
  ]);
  assert.equal(results[0].status, 'fulfilled');
  assert.equal(results[1].status, 'rejected');
  assert.equal(records.get('universes/world').bookCount, 1);
});

test('deleting an absent universe never starts cleanup that could race another author creation', async () => {
  const { service, failCleanup } = fixture();
  failCleanup(true);
  await service.deleteUniverse('other', { id: 'new-world' });
  const created = await service.createUniverse('author', { ...world, creationId: 'new-world' });
  assert.equal(created.authorId, 'author');
});
test('rejects a global record exceeding the document byte limit before persisting', async () => {
  const { service, records } = fixture();
  await service.createUniverse('author', world);
  await assert.rejects(
    service.saveUniverseLore('author', {
      universeId: 'world',
      id: 'large',
      create: true,
      input: {
        ...lore,
        details: '界'.repeat(150000),
        structuredDetails: { appearance: '界'.repeat(150000), personality: '界'.repeat(150000) },
      },
    }),
    { code: 'invalid-argument' },
  );
  assert.equal(records.has('universes/world/lore/large'), false);
});
