import test from 'node:test';
import assert from 'node:assert/strict';
import { studioDb } from './helpers/studioDb.mjs';
import { createBookBackupReadService } from '../src/bookBackupRead.mjs';
import { createBookBackupPersonaService } from '../src/bookBackupPersonaRead.mjs';
import { DEFAULT_PERSONAS } from '../src/personaProfile.mjs';

function fixture() {
  const f = studioDb();
  const profile = {
    ...structuredClone(DEFAULT_PERSONAS[0]),
    id: 'custom-used',
    archived: true,
    apiKey: 'DO NOT COPY',
  };
  profile.traits[0].privateKey = 'DO NOT COPY';
  f.records.set('books/book', {
    authorId: 'author',
    title: 'Book',
    personaId: profile.id,
    createdAt: 1,
    updatedAt: 2,
  });
  f.records.set('users/author/aiPersonas/' + profile.id, profile);
  f.records.set('users/author/aiPersonas/custom-unused', {
    ...profile,
    id: 'custom-unused',
    name: 'UNUSED',
  });
  f.records.set('books/book/chapters/chapter', {
    content: 'HUGE BODY',
    personaComplement: { personaId: profile.id, overrides: [] },
  });
  f.records.set('books/book/chapters/none', { content: 'HUGE BODY' });
  f.records.set('books/book/sceneSources/chapter', {
    original: {
      content: 'HUGE ORIGINAL',
      personaComplement: { personaId: DEFAULT_PERSONAS[1].id, overrides: [] },
    },
  });
  return {
    ...f,
    root: createBookBackupReadService(f),
    api: createBookBackupPersonaService(f),
    profile,
  };
}
const source = (f) => f.root.getBookBackupSource('author', { bookId: 'book' });
const list = (f, pin, kind = 'book', extra = {}, uid = 'author') =>
  f.api.listBookBackupPersonaBindings(uid, {
    bookId: 'book',
    sourceToken: pin.sourceToken,
    kind,
    limit: 50,
    ...extra,
  });
const read = (f, pin, kind, row, extra = {}, uid = 'author') =>
  f.api.readBookBackupPersona(uid, {
    bookId: 'book',
    sourceToken: pin.sourceToken,
    kind,
    id: row.id,
    itemToken: row.itemToken,
    index: 0,
    ...extra,
  });
const decode = (value) => JSON.parse(Buffer.from(value.chunkBase64, 'base64').toString('utf8'));

test('captures only used custom and preset profiles per binding, preserves archive/raw Unicode, and never lists library or reads prose', async () => {
  const f = fixture(),
    pin = await source(f),
    before = structuredClone(f.records);
  const values = [];
  for (const kind of ['book', 'chapter', 'scene-source']) {
    for (const row of (await list(f, pin, kind)).items) {
      if (row.personaId === null) continue;
      const chunk = await read(f, pin, kind, row);
      const value = decode(chunk);
      assert.equal(value.scope, kind);
      assert.equal(value.ownerId, row.id);
      assert.equal(value.personaId, row.personaId);
      assert.equal(value.profile.id, row.personaId);
      values.push(value);
    }
  }
  assert.equal(values.length, 3);
  assert.equal(values[0].profile.archived, true);
  assert.equal(values[0].profile.instructions, f.profile.instructions);
  assert.equal(values[2].profile.id, DEFAULT_PERSONAS[1].id);
  assert.equal(JSON.stringify(values).includes('DO NOT COPY'), false);
  assert.equal(JSON.stringify(values).includes('UNUSED'), false);
  assert.equal(JSON.stringify(values).includes('author'), false);
  assert.ok(
    f.reads.every(
      (r) =>
        !r.collectionPath.includes('aiPersonas') &&
        r.fields.every((key) => !key.includes('content')),
    ),
  );
  assert.ok(f.metadataReads.every((r) => r.fields.every((key) => !key.includes('content'))));
  assert.deepEqual(f.records, before);
});
test('paginates all owners including absent bindings without truncation and cursor scope confusion', async () => {
  const f = fixture();
  for (let i = 0; i < 101; i++)
    f.records.set(
      'books/book/chapters/c' + String(i).padStart(3, '0'),
      i % 2 ? {} : { personaComplement: { personaId: 'custom-used', overrides: [] } },
    );
  const pin = await source(f),
    rows = [];
  let cursor = null,
    first;
  do {
    const page = await list(f, pin, 'chapter', { cursor });
    first ??= page;
    rows.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  assert.equal(rows.length, 103);
  assert.equal(rows.filter((row) => row.personaId === null).length, 51);
  assert.ok(f.reads.every((r) => r.maximum === 51 && r.fields.includes('personaComplement')));
  await assert.rejects(list(f, pin, 'scene-source', { cursor: first.nextCursor }), {
    code: 'invalid-argument',
  });
  await assert.rejects(list(f, pin, 'book', { cursor: first.nextCursor }), {
    code: 'invalid-argument',
  });
});
test('native external profile edit invalidates token despite unchanged book source', async () => {
  const f = fixture(),
    pin = await source(f),
    row = (await list(f, pin)).items[0];
  await f.db.runTransaction(async (tx) =>
    tx.update(f.db.doc('users/author/aiPersonas/custom-used'), { instructions: 'Changed' }),
  );
  assert.deepEqual(await source(f), pin);
  await assert.rejects(read(f, pin, 'book', row), { code: 'failed-precondition' });
  assert.notEqual((await list(f, pin)).items[0].itemToken, row.itemToken);
});
test('same-data profile recreation invalidates native token', async () => {
  const f = fixture(),
    pin = await source(f),
    row = (await list(f, pin)).items[0],
    path = 'users/author/aiPersonas/custom-used';
  await f.db.runTransaction(async (tx) => tx.delete(f.db.doc(path)));
  await f.db.runTransaction(async (tx) => tx.create(f.db.doc(path), f.profile));
  assert.deepEqual(await source(f), pin);
  await assert.rejects(read(f, pin, 'book', row), { code: 'failed-precondition' });
});
test('binding edit or new binding is observed independently of root clock', async () => {
  const f = fixture(),
    pin = await source(f),
    old = (await list(f, pin, 'chapter')).items;
  await f.db.runTransaction(async (tx) =>
    tx.update(f.db.doc('books/book/chapters/chapter'), {
      personaComplement: { personaId: DEFAULT_PERSONAS[0].id, overrides: [] },
    }),
  );
  await assert.rejects(read(f, pin, 'chapter', old[0]), { code: 'failed-precondition' });
  await f.db.runTransaction(async (tx) =>
    tx.update(f.db.doc('books/book/chapters/none'), {
      personaComplement: { personaId: 'custom-used', overrides: [] },
    }),
  );
  const fresh = (await list(f, pin, 'chapter')).items;
  assert.equal(old[1].personaId, null);
  assert.equal(fresh[1].personaId, 'custom-used');
  assert.notEqual(fresh[1].itemToken, old[1].itemToken);
});
test('no binding cannot be read and user cannot supply arbitrary profile/path/scope/index', async () => {
  const f = fixture(),
    pin = await source(f),
    row = (await list(f, pin, 'chapter')).items[1];
  await assert.rejects(read(f, pin, 'chapter', row), { code: 'failed-precondition' });
  for (const extra of [
    { personaId: 'custom-unused' },
    { path: 'users/other/aiPersonas/x' },
    { kind: 'campaign' },
    { id: '../x' },
    { index: -1 },
  ])
    await assert.rejects(read(f, pin, 'chapter', row, extra), { code: 'invalid-argument' });
});
test('own namespace only, missing used profile and unknown preset fail explicitly', async () => {
  const f = fixture(),
    pin = await source(f);
  await assert.rejects(list(f, pin, 'book', {}, 'other'), { code: 'not-found' });
  await assert.rejects(list(f, pin, 'book', {}, ''), { code: 'unauthenticated' });
  const profile = f.records.get('users/author/aiPersonas/custom-used');
  f.records.delete('users/author/aiPersonas/custom-used');
  f.records.set('users/other/aiPersonas/custom-used', profile);
  await assert.rejects(list(f, pin), { code: 'failed-precondition' });
  f.records.set('books/book', { ...f.records.get('books/book'), personaId: 'preset-missing' });
  await assert.rejects(list(f, await source(f)), { code: 'failed-precondition' });
});
test('malformed profiles/complements never silently normalize into an empty backup', async () => {
  for (const change of [{ id: 'custom-wrong' }, { traits: [] }, { instructions: null }]) {
    const f = fixture(),
      pin = await source(f);
    f.records.set('users/author/aiPersonas/custom-used', { ...f.profile, ...change });
    const row = (await list(f, pin)).items[0];
    await assert.rejects(read(f, pin, 'book', row), { code: 'failed-precondition' });
  }
  const f = fixture(),
    pin = await source(f);
  f.records.set('books/book/chapters/chapter', {
    personaComplement: {
      personaId: 'custom-used',
      overrides: [{ traitId: 'sensory', value: 101 }],
    },
  });
  await assert.rejects(list(f, pin, 'chapter'), { code: 'failed-precondition' });
});
test('deleting/rebalancing root or owner and stale origin prevent capture', async () => {
  for (const field of ['deleting', 'rebalancing']) {
    const f = fixture(),
      pin = await source(f);
    f.records.set('books/book/sceneSources/chapter', {
      ...f.records.get('books/book/sceneSources/chapter'),
      [field]: true,
    });
    await assert.rejects(list(f, pin, 'scene-source'), { code: 'failed-precondition' });
  }
  const f = fixture(),
    pin = await source(f);
  await f.db.runTransaction(async (tx) => tx.update(f.db.doc('books/book'), { updatedAt: 3 }));
  await assert.rejects(list(f, pin), { code: 'failed-precondition' });
  f.records.set('books/book', { ...f.records.get('books/book'), deleting: true });
  await assert.rejects(source(f), { code: 'not-found' });
});
