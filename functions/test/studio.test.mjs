import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStudioService } from '../src/studio.mjs';
import { createUniverseService } from '../src/universes.mjs';
import { studioDb } from './helpers/studioDb.mjs';

const operationId = 'studio-operation-00001';
const creation = { operationId, title: ' A aldeia ', synopsis: ' Uma aventura ' };
function fixture() {
  const data = studioDb();
  return { ...data, service: createStudioService({ db: data.db, now: () => 100 }) };
}
const rejection = (promise, code) => assert.rejects(promise, { code });

test('creates independent domains with trusted ownership, dates and closed private DTOs', async () => {
  const { service, records } = fixture();
  const adventure = await service.createAdventure('author', creation);
  assert.deepEqual(adventure, {
    id: operationId,
    ownerId: 'author',
    schemaVersion: 1,
    revision: 1,
    title: 'A aldeia',
    synopsis: 'Uma aventura',
    language: 'pt-BR',
    origin: { kind: 'authored' },
    status: 'draft',
    universeId: null,
    createdAt: 100,
    updatedAt: 100,
  });
  const campaign = await service.createCampaign('author', {
    operationId: operationId + '-campaign',
    title: 'Mesa',
  });
  assert.equal(campaign.description, '');
  assert.deepEqual(campaign.provenance, { kind: 'independent' });
  assert.equal(campaign.status, 'planning');
  assert.equal(campaign.universeId, null);
  assert.equal('synopsis' in campaign, false);
  assert.equal(records.size, 4);
  assert.ok(
    ![...records.keys()].some((path) => path.startsWith('books/') || path.includes('/sessions/')),
  );
});

test('validates authentication, fields, types and exact title/brief limits before writes', async () => {
  const { service, records } = fixture();
  await rejection(service.createAdventure(null, creation), 'unauthenticated');
  for (const patch of [
    { title: ' ' },
    { title: 'x'.repeat(301) },
    { synopsis: 'x'.repeat(4001) },
    { operationId: '../invalid' },
    { ownerId: 'other' },
    { createdAt: 1 },
    { revision: 5 },
    { status: 'ready' },
    { origin: { kind: 'imported' } },
    { universeId: 42 },
    { language: 'en' },
  ])
    await rejection(
      service.createAdventure('author', { ...creation, ...patch }),
      'invalid-argument',
    );
  await rejection(
    service.createCampaign('author', { operationId, title: 'Mesa', description: 'x'.repeat(4001) }),
    'invalid-argument',
  );
  assert.equal(records.size, 0);
  const result = await service.createAdventure('author', {
    operationId,
    title: 'x'.repeat(300),
    synopsis: 'x'.repeat(4000),
  });
  assert.equal(result.title.length, 300);
  assert.equal(result.synopsis.length, 4000);
});

test('retries normalize input, never duplicate links, and reject changed payload or domain', async () => {
  const { service, records, db } = fixture();
  records.set('universes/world', { authorId: 'author', bookCount: 0 });
  const request = { ...creation, universeId: 'world' };
  const results = await Promise.all([
    service.createAdventure('author', request),
    service.createAdventure('author', request),
  ]);
  assert.deepEqual(results[0], results[1]);
  assert.deepEqual(
    await service.createAdventure('author', { ...request, title: 'A aldeia' }),
    results[0],
  );
  assert.equal(records.get('universes/world').adventureCount, 1);
  assert.deepEqual(records.get(`universes/world/adventures/${operationId}`), {
    adventureId: operationId,
  });
  await rejection(
    service.createAdventure('author', { ...request, title: 'Outro' }),
    'invalid-argument',
  );
  await rejection(
    service.createCampaign('author', { operationId, title: 'Mesa' }),
    'invalid-argument',
  );
  await rejection(service.createAdventure('other', request), 'permission-denied');
  records.set(`adventures/${operationId}`, {
    ...records.get(`adventures/${operationId}`),
    ownerId: 'other',
  });
  await rejection(service.createAdventure('author', request), 'failed-precondition');
  records.delete(`adventures/${operationId}`);
  await rejection(service.createAdventure('author', request), 'failed-precondition');
  assert.equal((await db.doc(`adventures/${operationId}`).get()).exists, false);
});

test('unavailable universes leave no project, receipt or reference', async () => {
  const { service, records } = fixture();
  records.set('universes/foreign', { authorId: 'other' });
  records.set('universes/removing', { authorId: 'author', deleting: true });
  for (const universeId of ['absent', 'foreign'])
    await rejection(
      service.createCampaign('author', { operationId, title: 'Mesa', universeId }),
      'permission-denied',
    );
  await rejection(
    service.createAdventure('author', { ...creation, universeId: 'removing' }),
    'failed-precondition',
  );
  assert.equal(records.size, 2);
});

test('gets do not distinguish foreign, deleted and absent resources or expose internal fields', async () => {
  const { service, records } = fixture();
  await service.createAdventure('author', creation);
  records.get(`adventures/${operationId}`).internal = 'not in DTO';
  assert.equal('internal' in (await service.getAdventure('author', { id: operationId })), false);
  assert.equal(await service.getAdventure('other', { id: operationId }), null);
  assert.equal(await service.getAdventure('author', { id: operationId + '-absent' }), null);
  records.get(`adventures/${operationId}`).deleting = true;
  assert.equal(await service.getAdventure('author', { id: operationId }), null);
  await rejection(service.getCampaign(null, { id: operationId }), 'unauthenticated');
  await rejection(service.getCampaign('author', { id: 'bad' }), 'invalid-argument');
});

test('book preparation is bounded, resumable and repairs dates from actual snapshot metadata', async () => {
  const { service, records, metadata, reads } = fixture();
  records.set('books/a', {
    authorId: 'author',
    title: 'Antigo',
    content: 'PROSA',
    coverUrl: 'CAPA',
    universeId: 'world',
  });
  records.set('books/b', {
    authorId: 'author',
    title: 'Atual',
    status: 'published',
    createdAt: 1,
    updatedAt: 2,
  });
  records.set('books/c', { authorId: 'other', title: 'Outro' });
  metadata.set('books/a', { createdAt: 123.5, updatedAt: 234.5 });
  await rejection(service.listStudioProjects('author', { kind: 'book' }), 'failed-precondition');
  assert.deepEqual(await service.prepareStudioBooks('author', { limit: 1 }), {
    complete: false,
    processed: 1,
  });
  assert.deepEqual(records.get('books/a'), {
    authorId: 'author',
    title: 'Antigo',
    content: 'PROSA',
    coverUrl: 'CAPA',
    universeId: 'world',
    createdAt: 123.5,
    updatedAt: 234.5,
    status: 'draft',
  });
  records.get('books/b').updatedAt = 300;
  assert.deepEqual(await service.prepareStudioBooks('author', { limit: 1 }), {
    complete: false,
    processed: 2,
  });
  assert.equal(records.get('books/b').updatedAt, 300);
  assert.deepEqual(await service.prepareStudioBooks('author'), { complete: true, processed: 2 });
  const count = reads.length;
  assert.deepEqual(await service.prepareStudioBooks('author'), { complete: true, processed: 2 });
  assert.equal(reads.length, count);
  assert.equal(records.get('books/c').updatedAt, undefined);
  assert.deepEqual(
    (await service.listStudioProjects('author', { kind: 'book' })).items.map((item) => item.id),
    ['b', 'a'],
  );
  await rejection(service.prepareStudioBooks('author', { cursor: 'b' }), 'invalid-argument');
});

test('malformed state or unavailable timestamp aborts the entire preparation batch', async () => {
  const { service, records, metadata } = fixture();
  records.set('books/a', { authorId: 'author' });
  records.set('books/b', { authorId: 'author', status: 'unknown' });
  await rejection(service.prepareStudioBooks('author'), 'failed-precondition');
  assert.equal(records.get('books/a').updatedAt, undefined);
  assert.equal(records.has('users/author/studioPreparation/books-v1'), false);
  records.get('books/b').status = 'draft';
  metadata.set('books/a', { createdAt: NaN, updatedAt: 4 });
  await rejection(service.prepareStudioBooks('author'), 'failed-precondition');
  assert.equal(records.has('users/author/studioPreparation/books-v1'), false);
  metadata.set('books/a', { createdAt: 3, updatedAt: 4 });
  assert.deepEqual(await service.prepareStudioBooks('author'), { complete: true, processed: 2 });
});

test('legacy dates beyond JavaScript range repair from metadata and cannot enter cursors', async () => {
  const { service, records, metadata } = fixture();
  records.set('books/too-far', {
    authorId: 'author',
    title: 'Antigo',
    status: 'draft',
    createdAt: 9_000_000_000_000_000,
    updatedAt: 9_000_000_000_000_000,
  });
  metadata.set('books/too-far', { createdAt: 123.5, updatedAt: 234.5 });
  await service.prepareStudioBooks('author');
  const book = (await service.listStudioProjects('author', { kind: 'book' })).items[0];
  assert.equal(book.createdAt, 123.5);
  assert.equal(book.updatedAt, 234.5);
  assert.doesNotThrow(() => new Date(book.updatedAt).toISOString());
  const forged = Buffer.from(
    JSON.stringify({
      version: 1,
      uid: 'author',
      kind: 'book',
      status: 'all',
      updatedAt: 9_000_000_000_000_000,
      id: book.id,
    }),
  ).toString('base64url');
  await rejection(
    service.listStudioProjects('author', { kind: 'book', cursor: forged }),
    'invalid-argument',
  );
});

test('pagination is deterministic by update/id, filtered, private, and reads only limit plus one', async () => {
  const { service, records, reads } = fixture();
  for (const [id, status, updatedAt, ownerId] of [
    ['a', 'draft', 100, 'author'],
    ['b', 'draft', 100, 'author'],
    ['c', 'ready', 200, 'author'],
    ['d', 'draft', 500, 'other'],
  ])
    records.set(`adventures/${id}`, {
      ownerId,
      status,
      title: id,
      createdAt: 1,
      updatedAt,
      revision: 1,
      synopsis: 'SECRET',
    });
  const first = await service.listStudioProjects('author', { kind: 'adventure', limit: 2 });
  assert.deepEqual(
    first.items.map((item) => item.id),
    ['c', 'b'],
  );
  assert.ok(first.nextCursor);
  assert.equal('synopsis' in first.items[0], false);
  const next = await service.listStudioProjects('author', {
    kind: 'adventure',
    limit: 2,
    cursor: first.nextCursor,
  });
  assert.deepEqual(
    next.items.map((item) => item.id),
    ['a'],
  );
  assert.equal(next.nextCursor, null);
  assert.deepEqual(
    reads.map((read) => read.maximum),
    [3, 3],
  );
  const draft = await service.listStudioProjects('author', {
    kind: 'adventure',
    status: 'draft',
    limit: 1,
  });
  assert.equal(draft.items[0].id, 'b');
  for (const request of [
    { kind: 'campaign', cursor: first.nextCursor },
    { kind: 'adventure', status: 'draft', cursor: first.nextCursor },
    { kind: 'adventure', cursor: 'broken' },
    { kind: '__proto__' },
    { kind: 'adventure', status: 'planning' },
    { kind: 'adventure', limit: 51 },
    { kind: 'book', limit: 0 },
  ])
    await rejection(service.listStudioProjects('author', request), 'invalid-argument');
  await rejection(
    service.listStudioProjects('other', { kind: 'adventure', cursor: first.nextCursor }),
    'invalid-argument',
  );
});

test('default 25 and maximum 50 pages preserve optional book metadata without extra reads', async () => {
  const { service, records, reads } = fixture();
  for (let i = 0; i < 60; i++)
    records.set(`campaigns/${String(i).padStart(3, '0')}`, {
      ownerId: 'author',
      title: String(i),
      status: 'planning',
      updatedAt: i,
      createdAt: 1,
    });
  assert.equal((await service.listStudioProjects('author', { kind: 'campaign' })).items.length, 25);
  assert.equal(
    (await service.listStudioProjects('author', { kind: 'campaign', limit: 50 })).items.length,
    50,
  );
  assert.deepEqual(
    reads.map((read) => read.maximum),
    [26, 51],
  );
  records.set('books/legacy_id', {
    authorId: 'author',
    title: 'Livro',
    genre: 'Fantasia',
    synopsis: 'Sinopse',
    status: 'draft',
    updatedAt: 5,
    createdAt: 1,
  });
  await service.prepareStudioBooks('author');
  const book = (await service.listStudioProjects('author', { kind: 'book', status: 'draft' }))
    .items[0];
  assert.equal(book.id, 'legacy_id');
  assert.equal(book.genre, 'Fantasia');
  assert.equal(book.synopsis, 'Sinopse');
  assert.equal(book.revision, 0);
});

test('editorial filtering uses current private state and preserves independent legacy status', async () => {
  const { service, records } = fixture();
  for (const [id, status, editorialState] of [
    ['a', 'ready', 'draft'],
    ['b', 'draft', 'review'],
    ['c', 'draft', 'ready'],
    ['d', 'ready', undefined],
    ['e', 'ready', 'invalid'],
    ['f', 'archived', undefined],
  ])
    records.set(`adventures/${id}`, {
      ownerId: 'author',
      title: id,
      status,
      editorialState,
      createdAt: 1,
      updatedAt: 100,
    });
  const drafts = await service.listStudioProjects('author', {
    kind: 'adventure',
    editorialState: 'draft',
  });
  assert.deepEqual(
    drafts.items.map(({ id, status, editorialState }) => [id, status, editorialState]),
    [
      ['f', 'archived', 'draft'],
      ['a', 'ready', 'draft'],
    ],
  );
  const reviews = await service.listStudioProjects('author', {
    kind: 'adventure',
    editorialState: 'review',
  });
  assert.deepEqual(
    reviews.items.map((item) => item.id),
    ['b'],
  );
  const ready = await service.listStudioProjects('author', {
    kind: 'adventure',
    editorialState: 'ready',
  });
  assert.deepEqual(
    ready.items.map((item) => item.id),
    ['e', 'd', 'c'],
  );
  const combined = await service.listStudioProjects('author', {
    kind: 'adventure',
    status: 'ready',
    editorialState: 'draft',
  });
  assert.deepEqual(
    combined.items.map((item) => item.id),
    ['a'],
  );
  assert.equal(records.get('adventures/a').status, 'ready');
  for (const [id, status, editorialState] of [
    ['legacy', 'published', undefined],
    ['review', 'draft', 'review'],
    ['ready', 'draft', 'ready'],
  ])
    records.set(`books/${id}`, {
      authorId: 'author',
      title: id,
      status,
      editorialState,
      createdAt: 1,
      updatedAt: 100,
    });
  await service.prepareStudioBooks('author');
  for (const [editorialState, id] of [
    ['draft', 'legacy'],
    ['review', 'review'],
    ['ready', 'ready'],
  ]) {
    const page = await service.listStudioProjects('author', { kind: 'book', editorialState });
    assert.deepEqual(
      page.items.map((item) => item.id),
      [id],
    );
    assert.equal(page.items[0].editorialState, editorialState);
  }
});

test('editorial pages scan bounded metadata windows and advance past unmatched rows', async () => {
  const { service, records, reads } = fixture();
  for (const [id, editorialState] of [
    ['f', 'ready'],
    ['e', 'review'],
    ['d', 'draft'],
    ['c', 'ready'],
    ['b', 'review'],
    ['a', 'ready'],
  ])
    records.set(`adventures/${id}`, {
      ownerId: 'author',
      title: id,
      status: 'ready',
      editorialState,
      updatedAt: 100,
      content: 'BODY',
      synopsis: 'SECRET',
    });
  const request = { kind: 'adventure', editorialState: 'draft', limit: 2 };
  const first = await service.listStudioProjects('author', request);
  assert.deepEqual(first.items, []);
  assert.ok(first.nextCursor);
  const second = await service.listStudioProjects('author', {
    ...request,
    cursor: first.nextCursor,
  });
  assert.deepEqual(
    second.items.map((item) => item.id),
    ['d'],
  );
  assert.equal(JSON.parse(Buffer.from(second.nextCursor, 'base64url').toString()).id, 'c');
  const last = await service.listStudioProjects('author', {
    ...request,
    cursor: second.nextCursor,
  });
  assert.deepEqual(last, { items: [], nextCursor: null });
  assert.equal(reads.length, 3);
  for (const read of reads) {
    assert.equal(read.maximum, 3);
    assert.ok(read.count <= 3);
    assert.ok(read.fields.includes('editorialState'));
    assert.ok(!read.fields.includes('content'));
    assert.ok(!read.fields.includes('synopsis'));
  }
  assert.equal('content' in second.items[0], false);
  assert.equal('synopsis' in second.items[0], false);
});

test('editorial cursors bind account, type and both filters while preserving unfiltered old cursors', async () => {
  const { service, records } = fixture();
  for (const id of ['a', 'b'])
    records.set(`adventures/${id}`, {
      ownerId: 'author',
      title: id,
      status: 'ready',
      updatedAt: 1,
    });
  const first = await service.listStudioProjects('author', { kind: 'adventure', limit: 1 });
  const decoded = JSON.parse(Buffer.from(first.nextCursor, 'base64url').toString());
  assert.equal(decoded.editorialState, 'all');
  delete decoded.editorialState;
  const legacy = Buffer.from(JSON.stringify(decoded)).toString('base64url');
  for (const editorialState of [undefined, 'all']) {
    const next = await service.listStudioProjects('author', {
      kind: 'adventure',
      editorialState,
      cursor: legacy,
    });
    assert.deepEqual(
      next.items.map((item) => item.id),
      ['a'],
    );
  }
  const filtered = await service.listStudioProjects('author', {
    kind: 'adventure',
    editorialState: 'ready',
    limit: 1,
  });
  for (const [uid, request] of [
    ['author', { kind: 'adventure', editorialState: 'ready', cursor: legacy }],
    ['author', { kind: 'adventure', editorialState: 'draft', cursor: filtered.nextCursor }],
    ['author', { kind: 'adventure', cursor: filtered.nextCursor }],
    [
      'author',
      { kind: 'adventure', status: 'ready', editorialState: 'ready', cursor: filtered.nextCursor },
    ],
    ['author', { kind: 'book', editorialState: 'ready', cursor: filtered.nextCursor }],
    ['other', { kind: 'adventure', editorialState: 'ready', cursor: filtered.nextCursor }],
  ])
    await rejection(service.listStudioProjects(uid, request), 'invalid-argument');
});

test('editorial filter rejects malformed values and does not alter campaign lifecycle', async () => {
  const { service, records } = fixture();
  for (const editorialState of [null, '', 'published', 'archived', {}, [], 1, true])
    await rejection(
      service.listStudioProjects('author', { kind: 'adventure', editorialState }),
      'invalid-argument',
    );
  for (const editorialState of ['draft', 'review', 'ready'])
    await rejection(
      service.listStudioProjects('author', { kind: 'campaign', editorialState }),
      'invalid-argument',
    );
  records.set('campaigns/table', {
    ownerId: 'author',
    title: 'Mesa',
    status: 'active',
    editorialState: 'ready',
    updatedAt: 1,
  });
  const page = await service.listStudioProjects('author', {
    kind: 'campaign',
    status: 'active',
    editorialState: 'all',
  });
  assert.equal(page.items[0].status, 'active');
  assert.equal('editorialState' in page.items[0], false);
});

test('universe deletion checks new counters and bounded references even if counters drift', async () => {
  const { db, records } = fixture();
  const universes = createUniverseService({ db });
  for (const kind of ['adventures', 'campaigns', 'books']) {
    records.set('universes/world', { authorId: 'author', bookCount: 0, privacyVersion: 0 });
    records.set(`universes/world/${kind}/project`, {});
    await rejection(universes.deleteUniverse('author', { id: 'world' }), 'failed-precondition');
    assert.equal(records.get('universes/world').deleting, undefined);
    records.delete(`universes/world/${kind}/project`);
  }
  for (const counter of ['adventureCount', 'campaignCount']) {
    records.set('universes/world', { authorId: 'author', bookCount: 0, [counter]: 1 });
    await rejection(universes.deleteUniverse('author', { id: 'world' }), 'failed-precondition');
  }
});
