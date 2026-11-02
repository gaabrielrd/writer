import test from 'node:test';
import assert from 'node:assert/strict';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import { loreLogicalFixture, logicalLoreData } from './helpers/bookLoreLogicalFixture.mjs';
import { seedBookLoreRead } from './helpers/bookLoreReadFixture.mjs';
import { seedBookLoreGeneration } from './helpers/bookLoreGenerationFixture.mjs';
import { resourcePayloadChunkPath } from '../src/bookResourcePayloadPaths.mjs';
import { createBookLoreContextReader } from '../src/bookLoreContextRead.mjs';
import { createBookLoreProjectionBudget } from '../src/bookLoreTextProjection.mjs';
const selection = {
  name: null,
  category: null,
  summary: 140,
  details: 2000,
  aliases: { items: 20, characters: 200 },
};
const budget = (overrides) =>
  createBookLoreProjectionBudget({
    bytes: 100_000_000,
    parts: 2000,
    retainedBytes: 1_000_000,
    ...overrides,
  });
function reader(f, id = 'arthur', fields = selection, b = budget(), uid = 'author') {
  return f.db.runTransaction(async (tx) =>
    (await createBookLoreContextReader(tx, f.db, uid, 'book')).read(id, fields, b),
  );
}
function observe(f) {
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
  return seen;
}
async function fixture(options = {}) {
  const f = adventureImportDb({ nativeUpdates: true });
  return { ...f, ...(await loreLogicalFixture(f.db, options)) };
}
for (const mode of ['inline', 'v1', 'v2', 'created'])
  test(
    'context projection reads ' + mode + ' through the current authorized native source',
    async () => {
      const f = await fixture({ mode }),
        before = structuredClone([...f.records]),
        value = await reader(f, f.entityId);
      assert.equal(value.fields.name.value, f.expected.name);
      assert.equal(value.fields.category.value, f.expected.category);
      assert.equal(value.fields.details.value, f.expected.details);
      assert.equal(value.fields.details.truncated, false);
      assert.equal(Object.hasOwn(value.fields, 'summary'), Object.hasOwn(f.expected, 'summary'));
      if (f.expected.aliases) assert.deepEqual(value.fields.aliases.value, f.expected.aliases);
      else assert.equal(Object.hasOwn(value.fields, 'aliases'), false);
      assert.equal(value.sourceToken.length, 64);
      assert.deepEqual([...f.records], before);
    },
  );
test('flat removals stay absent and empty fields stay present without inventing a base', async () => {
  const f = await fixture({
    mode: 'v2',
    noBase: true,
    fields: {
      name: '\ufeffName',
      category: 'other',
      summary: null,
      details: '',
      aliases: [],
      isPublic: false,
    },
  });
  const r = await reader(f);
  assert.equal(Object.hasOwn(r.fields, 'summary'), false);
  assert.deepEqual(r.fields.details, { value: '', truncated: false });
  assert.deepEqual(r.fields.aliases, { value: [], count: 0, omitted: 0, truncated: false });
  assert.deepEqual(r.privacy, { present: true, value: false });
});
test('a v1 base above 8 MiB and 128 parts is certified without retaining its full details or reading relation pages', async () => {
  const f = adventureImportDb({ nativeUpdates: true }),
    data = { ...logicalLoreData(), details: '\ufeff' + '🌙'.repeat(2300000) },
    seed = await seedBookLoreRead(f.db, { id: 'large', data }),
    seen = observe(f),
    b = budget({ retainedBytes: 15000 }),
    r = await reader(f, 'large', selection, b);
  assert.ok(seed.base.prepared.manifest.chunkCount > 128);
  assert.equal(r.fields.details.truncated, true);
  assert.ok(r.fields.details.value.length <= 2000);
  assert.equal(r.fields.details.value.isWellFormed(), true);
  assert.ok(b.used.retainedBytes < 10000);
  const chunks = seen.filter((p) => p.includes('/bookResourceChunks/'));
  assert.equal(chunks.length, seed.base.prepared.manifest.chunkCount);
  assert.equal(
    seen.some((p) => p.includes('/bookLoreSegments/')),
    false,
  );
});
test('unselected flat fields and relation bodies are never fetched', async () => {
  const f = adventureImportDb({ nativeUpdates: true }),
    seed = await seedBookLoreGeneration(f.db, {
      id: 'flat',
      noBase: true,
      fields: {
        name: 'Aria',
        category: 'character',
        details: '🌙'.repeat(2300000),
        structuredDetails: { notes: 'PRIVATE_NOTES_' + 'x'.repeat(150000) },
        aliases: ['A'],
      },
      relations: Array.from({ length: 130 }, () => ({
        targetEntityId: 'target',
        relationType: 'PRIVATE_RELATION',
      })),
    }),
    seen = observe(f),
    b = budget({ bytes: 10000, parts: 10 }),
    r = await reader(
      f,
      'flat',
      { name: null, category: null, aliases: { items: null, characters: null } },
      b,
    );
  assert.equal(r.fields.name.value, 'Aria');
  assert.equal(Object.hasOwn(r.fields, 'details'), false);
  for (const key of ['details', 'structuredDetails']) {
    const bodyId = seed.bodies[key].prepared.manifest.bodyId;
    assert.equal(
      seen.some((p) => p.includes(bodyId)),
      false,
    );
  }
  assert.equal(
    seen.some((p) => p.includes('/bookLoreSegments/')),
    false,
  );
  assert.ok(b.used.bytes < 10000);
  assert.ok(seen.some((p) => p.includes('/bookResourceChunks/')));
});
test('a large superseded base name consumes no retention budget and the effective override is used', async () => {
  const f = adventureImportDb({ nativeUpdates: true });
  await seedBookLoreGeneration(f.db, {
    id: 'overridden',
    baseData: { name: 'x'.repeat(2000000), category: 'other', details: 'base' },
    fields: { name: 'Current' },
  });
  const b = budget({ retainedBytes: 100 });
  const r = await reader(f, 'overridden', { name: null, category: null }, b);
  assert.equal(r.fields.name.value, 'Current');
  assert.ok(b.used.retainedBytes < 100);
});
for (const limits of [{ bytes: 1 }, { parts: 0 }])
  test('I/O budget ' + JSON.stringify(limits) + ' rejects before any payload part', async () => {
    const f = await fixture({ mode: 'v1' }),
      seen = observe(f),
      before = structuredClone([...f.records]);
    await assert.rejects(reader(f, 'arthur', selection, budget(limits)), {
      code: 'resource-exhausted',
    });
    assert.equal(
      seen.some((p) => p.includes('/bookResourceChunks/')),
      false,
    );
    assert.deepEqual([...f.records], before);
  });
test('large empty alias arrays cannot exceed logical retention and publish a partial projection', async () => {
  const f = adventureImportDb({ nativeUpdates: true });
  await seedBookLoreRead(f.db, {
    id: 'many',
    data: { name: 'N', category: 'other', aliases: Array(20000).fill('') },
  });
  await assert.rejects(
    reader(
      f,
      'many',
      { name: null, aliases: { items: null, characters: null } },
      budget({ retainedBytes: 100 }),
    ),
    { code: 'resource-exhausted' },
  );
});
test('prefixes still validate the final part and never expose corrupted trailing bytes', async () => {
  const f = adventureImportDb({ nativeUpdates: true }),
    seed = await seedBookLoreRead(f.db, {
      id: 'bad',
      data: { name: 'N', category: 'other', details: 'x'.repeat(180000) },
    });
  const last = resourcePayloadChunkPath(
    'book',
    seed.base.prepared.manifest.bodyId,
    seed.base.prepared.manifest.chunkCount - 1,
  );
  f.records.get(last).bytes = 'AAAA';
  await assert.rejects(reader(f, 'bad', { details: 2 }));
});
for (const which of ['header', 'part'])
  test('recreated native ' + which + ' is rejected without fallback', async () => {
    const f = adventureImportDb({ nativeUpdates: true }),
      seed = await seedBookLoreRead(f.db, {
        id: 'changed',
        data: { name: 'N', category: 'other' },
      }),
      path =
        which === 'header'
          ? seed.base.path
          : resourcePayloadChunkPath('book', seed.base.prepared.manifest.bodyId, 0),
      data = structuredClone(f.records.get(path));
    await f.db.runTransaction((tx) => tx.delete(f.db.doc(path)));
    await f.db.runTransaction((tx) => tx.create(f.db.doc(path), data));
    await assert.rejects(reader(f, 'changed'));
  });
for (const which of ['owner', 'deleting', 'tombstone', 'missing'])
  test(which + ' cannot authorize a context projection', async () => {
    const f = await fixture({ mode: 'v1' });
    if (which === 'owner') f.records.get('books/book').authorId = 'other';
    else if (which === 'deleting') f.records.get('books/book').deleting = true;
    else if (which === 'tombstone')
      await f.db.runTransaction((tx) =>
        tx.create(f.db.doc('books/book/bookLoreTombstones/arthur'), { removed: true }),
      );
    else f.records.delete('books/book/lore/arthur');
    const seen = observe(f);
    await assert.rejects(reader(f));
    assert.equal(
      seen.some((p) => p.includes('/bookResourceChunks/')),
      false,
    );
  });
test('logical privacy must match an explicit native head flag', async () => {
  const f = await fixture({ mode: 'v1' });
  f.records.get(f.seed.path).isPublic = false;
  await assert.rejects(reader(f));
});
test('the same aggregate budget covers multiple fiches in the transaction', async () => {
  const f = adventureImportDb({ nativeUpdates: true });
  await seedBookLoreRead(f.db, { id: 'one', data: { name: 'N', category: 'other' } });
  await seedBookLoreRead(f.db, { id: 'two', data: { name: 'N', category: 'other' } });
  await assert.rejects(
    f.db.runTransaction(async (tx) => {
      const r = await createBookLoreContextReader(tx, f.db, 'author', 'book'),
        b = budget({ parts: 1 });
      await r.read('one', { name: null }, b);
      await r.read('two', { name: null }, b);
    }),
    { code: 'resource-exhausted' },
  );
});
