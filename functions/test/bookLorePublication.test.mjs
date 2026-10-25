import test from 'node:test';
import assert from 'node:assert/strict';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import { seedBookLoreRead } from './helpers/bookLoreReadFixture.mjs';
import { seedBookLoreGeneration } from './helpers/bookLoreGenerationFixture.mjs';
import {
  creationAdoptionFixture,
  adoptCreation,
} from './helpers/bookLoreCreationAdoptionFixture.mjs';
import { createBookPublicationService } from '../src/bookLorePublication.mjs';
import { createBookLoreReadService } from '../src/bookLoreRead.mjs';
import { resourcePayloadChunkPath } from '../src/bookResourcePayloadPaths.mjs';
const data = () => ({
  name: ' Name 🌙 ',
  category: 'character',
  summary: 'Literal 🌙',
  aliases: ['', 'Alias', 'Alias'],
  details: 'PRIVATE_DETAILS',
  structuredDetails: { notes: 'PRIVATE_NOTES' },
  isPublic: true,
});
async function fixture(mode = 'v2', patch = {}) {
  const f = adventureImportDb({ nativeUpdates: true }),
    value = { ...data(), ...patch };
  let seed,
    id = 'aria';
  if (mode === 'created') {
    const creation = await creationAdoptionFixture(f.db, {
      changes: Object.entries(value).map(([field, value]) => ({ target: { field }, value })),
    });
    await adoptCreation(creation);
    seed = creation.source.seed;
    id = creation.loreId;
  } else if (mode === 'v2')
    seed = await seedBookLoreGeneration(f.db, { id, noBase: true, fields: value });
  else seed = await seedBookLoreRead(f.db, { id, inline: mode === 'inline', data: value });
  await f.db.runTransaction(async (tx) => {
    const ref = f.db.doc('books/book'),
      book = (await tx.get(ref)).data();
    tx.update(ref, {
      title: 'Book',
      status: 'draft',
      updatedAt: 500,
      hasLoreResources: true,
      localLoreVersion: book.localLoreVersion ?? 0,
    });
    tx.create(f.db.doc('users/author'), { credits: 5 });
  });
  const events = [],
    run = f.db.runTransaction.bind(f.db);
  f.db.runTransaction = (op) =>
    run((tx) =>
      op(
        new Proxy(tx, {
          get(object, key) {
            const fn = object[key];
            if (typeof fn !== 'function') return fn;
            return (...args) => {
              if (args[0]?.path) events.push({ method: key, path: args[0].path });
              return fn.apply(object, args);
            };
          },
        }),
      ),
    );
  const api = createBookPublicationService({ db: f.db }),
    source = await api.getBookPublicationSource('author', { bookId: 'book' }),
    head = await createBookLoreReadService({ db: f.db }).getBookLoreRead('author', {
      bookId: 'book',
      id,
      tokenVersion: 2,
    }),
    control = { bookId: 'book', revisionId: 'revision-first', ...source },
    stage = { ...control, loreId: id, readToken: head.readToken, aliases: ['Alias', 'Alias'] },
    header = {
      createdAt: 3000,
      chapterCount: 1,
      loreCount: 1,
      privacyVersion: source.source.privacyVersion,
      sourceLoreToken: source.source.listToken,
      sourcePublicationToken: source.sourceToken,
      ...(source.source.hasScenes ? { sourceSceneRevision: source.source.sceneRevision } : {}),
      ...(source.source.universeId
        ? {
            universeId: source.source.universeId,
            universePrivacyVersion: source.source.universePrivacyVersion,
          }
        : {}),
    };
  await f.db.runTransaction((tx) =>
    tx.create(f.db.doc('publicBooks/book/revisions/revision-first'), header),
  );
  const copy = () => api.stageBookPublicationLore('author', stage),
    finish = () =>
      api.finalizeBookPublication('author', { ...control, authorName: 'Public Author' });
  events.length = 0;
  return { ...f, seed, id, api, source, stage, control, copy, finish, header, events };
}
const chunks = (f) =>
  f.events.filter((e) => e.method === 'get' && e.path.includes('/bookResourceChunks/'));
for (const mode of ['inline', 'v1', 'v2', 'created'])
  test(
    mode +
      ' stages only certified public fields, activates atomically, and replay preserves the event',
    async () => {
      const f = await fixture(mode),
        path = 'publicBooks/book/revisions/revision-first/lore/' + f.id;
      assert.equal((await f.copy()).status, 'staged');
      assert.deepEqual(f.records.get(path), {
        name: 'Name 🌙',
        aliases: ['Alias', 'Alias'],
        category: 'character',
        summary: 'Literal 🌙',
      });
      assert.equal(JSON.stringify(f.records.get(path)).includes('PRIVATE'), false);
      assert.equal(f.records.has('publicBooks/book'), false);
      const before = structuredClone([...f.records]);
      assert.equal((await f.copy()).status, 'already-staged');
      assert.deepEqual([...f.records], before);
      assert.equal((await f.finish()).status, 'published');
      assert.equal(f.records.get('publicBooks/book').authorName, 'Public Author');
      assert.equal(f.records.get('books/book').status, 'published');
      const published = structuredClone([...f.records]);
      assert.equal((await f.finish()).status, 'already-published');
      assert.deepEqual([...f.records], published);
      assert.equal(f.records.get('users/author').credits, 5);
    },
  );
test('v2 copy does not fetch private details/notes or relations', async () => {
  const f = await fixture('v2', { details: '🌙'.repeat(2300000) });
  await f.copy();
  for (const field of ['details', 'structuredDetails'])
    assert.equal(
      f.events.some((e) => e.path.includes(f.seed.bodies[field].prepared.manifest.bodyId)),
      false,
    );
  assert.equal(
    f.events.some((e) => e.path.includes('/bookLoreSegments/')),
    false,
  );
});
test('v1 larger than 8 MiB and 128 parts certifies its tail while retaining only public fields', async () => {
  const f = await fixture('v1', { details: '🌙'.repeat(2300000) });
  await f.copy();
  assert.ok(f.seed.base.prepared.manifest.chunkCount > 128);
  assert.equal(chunks(f).length, f.seed.base.prepared.manifest.chunkCount);
  assert.equal(
    JSON.stringify(f.records.get('publicBooks/book/revisions/revision-first/lore/' + f.id)).length <
      200,
    true,
  );
});
for (const field of [
  { isPublic: false },
  { isPublic: undefined },
  { name: 'x'.repeat(201) },
  { aliases: undefined },
  { aliases: Array(21).fill('A') },
  { aliases: ['x'.repeat(201)] },
  { summary: undefined },
  { summary: 'x'.repeat(141) },
])
  test(
    'invalid or nonconsenting public source ' +
      JSON.stringify(Object.keys(field)) +
      ' fails without writes',
    async () => {
      const value = { ...data(), ...field };
      for (const key of Object.keys(value)) if (value[key] === undefined) delete value[key];
      const f = await fixture(
        'v2',
        Object.fromEntries(
          Object.keys(data()).map((key) => [key, Object.hasOwn(value, key) ? value[key] : null]),
        ),
      );
      const before = structuredClone([...f.records]);
      await assert.rejects(f.copy());
      assert.deepEqual([...f.records], before);
    },
  );
for (const aliases of [['Unknown'], ['Alias', '', 'Alias'], ['Alias', 'Alias', 'Alias']])
  test(
    'alias selection cannot introduce, reorder or repeat an absent source alias ' +
      JSON.stringify(aliases),
    async () => {
      const f = await fixture(),
        before = structuredClone([...f.records]);
      await assert.rejects(f.api.stageBookPublicationLore('author', { ...f.stage, aliases }));
      assert.deepEqual([...f.records], before);
    },
  );
for (const change of [
  'clock',
  'privacy',
  'scene',
  'date',
  'root-birth',
  'head-birth',
  'tombstone',
  'owner',
])
  test(change + ' after preparation invalidates staging without bytes or writes', async () => {
    const f = await fixture();
    const root = f.records.get('books/book'),
      path = 'books/book/lore/' + f.id;
    if (change === 'clock') root.localLoreVersion++;
    if (change === 'privacy') root.publicationPrivacyVersion = 1;
    if (change === 'scene') root.sceneRevision = 1;
    if (change === 'date') root.updatedAt++;
    if (change === 'root-birth')
      f.metadata.set('books/book', {
        ...f.metadata.get('books/book'),
        createdAtNanoseconds: 99999,
      });
    if (change === 'head-birth')
      f.metadata.set(path, { ...f.metadata.get(path), createdAtNanoseconds: 99999 });
    if (change === 'tombstone')
      f.records.set('books/book/bookLoreTombstones/' + f.id, { removed: true });
    if (change === 'owner') root.authorId = 'other';
    const before = structuredClone([...f.records]);
    await assert.rejects(f.copy());
    assert.deepEqual([...f.records], before);
    assert.equal(chunks(f).length, 0);
  });
test('changed sources, forged proof and changed staged header cannot activate the public pointer', async () => {
  for (const change of ['clock', 'proof', 'header']) {
    const f = await fixture();
    await f.copy();
    if (change === 'clock') f.records.get('books/book').localLoreVersion++;
    if (change === 'header')
      f.records.get('publicBooks/book/revisions/revision-first').sourcePublicationToken =
        '0'.repeat(64);
    const before = structuredClone([...f.records]);
    await assert.rejects(
      change === 'proof'
        ? f.api.finalizeBookPublication('author', {
            ...f.control,
            source: { ...f.source.source, privacyVersion: 99 },
            authorName: 'Author',
          })
        : f.finish(),
    );
    assert.deepEqual([...f.records], before);
    assert.equal(f.records.has('publicBooks/book'), false);
  }
});
test('unpublish is not undone by replay and a changed byline cannot overwrite an activated revision', async () => {
  const f = await fixture();
  await f.copy();
  await f.finish();
  let before = structuredClone([...f.records]);
  await assert.rejects(
    f.api.finalizeBookPublication('author', { ...f.control, authorName: 'Different' }),
  );
  assert.deepEqual([...f.records], before);
  await f.db.runTransaction((tx) => {
    tx.update(f.db.doc('books/book'), { status: 'draft', updatedAt: 4000 });
    tx.delete(f.db.doc('publicBooks/book'));
  });
  before = structuredClone([...f.records]);
  await assert.rejects(f.finish());
  assert.deepEqual([...f.records], before);
});
test('corrupt tail cannot be staged as a valid prefix', async () => {
  const f = await fixture('v1', { details: 'x'.repeat(160000) }),
    m = f.seed.base.prepared.manifest;
  f.records.get(resourcePayloadChunkPath('book', m.bodyId, m.chunkCount - 1)).bytes = 'AAAA';
  const before = structuredClone([...f.records]);
  await assert.rejects(f.copy());
  assert.deepEqual([...f.records], before);
});
test('source and stage controls are closed and author-only before any write', async () => {
  const f = await fixture();
  for (const uid of [null, 'other'])
    await assert.rejects(f.api.getBookPublicationSource(uid, { bookId: 'book' }));
  const before = structuredClone([...f.records]);
  await assert.rejects(
    f.api.stageBookPublicationLore('author', { ...f.stage, details: 'PRIVATE' }),
  );
  await assert.rejects(
    f.api.finalizeBookPublication('author', { ...f.control, authorName: 'A', email: 'private' }),
  );
  assert.deepEqual([...f.records], before);
});

async function worldPublication(f) {
  await f.db.runTransaction((tx) => {
    tx.create(f.db.doc('universes/world'), {
      authorId: 'author',
      loreVersion: 0,
      privacyVersion: 0,
    });
    tx.create(f.db.doc('publicUniversePrivacy/world'), { active: true, version: 0 });
    tx.update(f.db.doc('books/book'), { universeId: 'world' });
  });
  const proof = await f.api.getBookPublicationSource('author', { bookId: 'book' }),
    control = { bookId: 'book', revisionId: 'revision-world', ...proof },
    stage = { ...f.stage, ...control };
  await f.db.runTransaction((tx) =>
    tx.create(f.db.doc('publicBooks/book/revisions/revision-world'), {
      ...f.header,
      sourceLoreToken: proof.source.listToken,
      sourcePublicationToken: proof.sourceToken,
      universeId: 'world',
      universePrivacyVersion: 0,
    }),
  );
  return {
    copy: () => f.api.stageBookPublicationLore('author', stage),
    finish: () =>
      f.api.finalizeBookPublication('author', { ...control, authorName: 'Public Author' }),
  };
}
test('public world source activates only with its current native privacy proof', async () => {
  const f = await fixture(),
    world = await worldPublication(f);
  await world.copy();
  await world.finish();
  assert.equal(f.records.get('publicBooks/book').schemaVersion, 2);
  assert.equal(f.records.get('publicBooks/book').universePrivacyVersion, 0);
});
for (const change of [
  'world-birth',
  'world-stamp',
  'world-owner',
  'world-clock',
  'privacy-birth',
  'privacy-revoked',
])
  test(
    change + ' rejects the original world publication proof without changing staged data',
    async () => {
      const f = await fixture(),
        world = await worldPublication(f);
      await world.copy();
      if (change === 'world-birth')
        f.metadata.set('universes/world', {
          ...f.metadata.get('universes/world'),
          createdAtNanoseconds: 99999,
        });
      if (change === 'world-stamp')
        f.metadata.set('universes/world', {
          ...f.metadata.get('universes/world'),
          updatedAtNanoseconds: 99999,
        });
      if (change === 'world-owner') f.records.get('universes/world').authorId = 'other';
      if (change === 'world-clock') f.records.get('universes/world').loreVersion++;
      if (change === 'privacy-birth')
        f.metadata.set('publicUniversePrivacy/world', {
          ...f.metadata.get('publicUniversePrivacy/world'),
          createdAtNanoseconds: 99999,
        });
      if (change === 'privacy-revoked') f.records.get('publicUniversePrivacy/world').active = false;
      const before = structuredClone([...f.records]);
      await assert.rejects(world.finish());
      assert.deepEqual([...f.records], before);
    },
  );
