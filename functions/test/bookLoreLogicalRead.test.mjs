import test from 'node:test';
import assert from 'node:assert/strict';
import { born } from '../src/bookRestoreUploadContracts.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import { loreLogicalFixture, logicalLoreData } from './helpers/bookLoreLogicalFixture.mjs';
import { createBookLoreLogicalBudget } from '../src/bookLoreLogicalRead.mjs';
import { resourcePayloadChunkPath } from '../src/bookResourcePayloadPaths.mjs';
const setup = async (options) => {
  const d = adventureImportDb({ nativeUpdates: true });
  return { ...d, ...(await loreLogicalFixture(d.db, options)) };
};
const credits = (f) => f.records.get('users/author').credits;
const ticket = (f) => 'users/author/loreAnalyses/' + f.request.requestId;
const observeChunks = (f) => {
  const seen = [],
    run = f.db.runTransaction.bind(f.db);
  f.db.runTransaction = (fn) =>
    run((tx) =>
      fn({
        ...tx,
        get: async (ref, ...args) => {
          if (ref.path?.includes('/bookResourceChunks/')) seen.push(ref.path);
          return tx.get(ref, ...args);
        },
      }),
    );
  return seen;
};
for (const mode of ['inline', 'v1', 'v2', 'created'])
  test(
    'logical ' + mode + ' reaches analysis as literal content instead of a physical stub',
    async () => {
      const f = await setup({ mode }),
        before = structuredClone(f.records.get(f.seed.path)),
        logical = await f.read();
      assert.deepEqual(logical.data, f.expected);
      assert.equal(
        logical.mode,
        mode === 'created' ? 'payload' : mode === 'inline' ? 'inline' : 'payload',
      );
      await f.analyze();
      const sent = f.calls[0].lore.find((v) => v.id === f.entityId);
      assert.equal(sent.name, f.expected.name);
      assert.equal(sent.details, f.expected.details);
      assert.deepEqual(sent.aliases, f.expected.aliases ?? []);
      assert.deepEqual(f.records.get(f.seed.path), before);
      assert.equal(credits(f), 5);
      assert.equal(JSON.stringify(f.records.get(ticket(f))).includes('Literal'), false);
    },
  );
test('flat fields preserve removals, empty values, absent dates and explicit privacy without inheriting a fake base', async () => {
  const f = await setup({
    mode: 'v2',
    noBase: true,
    fields: {
      name: '\ufeffName',
      category: 'other',
      summary: null,
      details: '',
      aliases: ['', 'same', 'same'],
      structuredDetails: { notes: '\ufeffNote' },
      isPublic: false,
    },
  });
  const l = await f.read();
  assert.deepEqual(l.data, f.expected);
  assert.equal(Object.hasOwn(l.data, 'createdAt'), false);
  assert.equal(Object.hasOwn(l.data, 'summary'), false);
  assert.equal(Object.hasOwn(l.data, 'relations'), false);
});
for (const relation of [undefined, []])
  test('payload relation presence remains ' + (relation ? 'empty' : 'absent'), async () => {
    const data = logicalLoreData();
    if (relation) data.relations = relation;
    else delete data.relations;
    const f = await setup({ data }),
      l = await f.read();
    assert.equal(Object.hasOwn(l.data, 'relations'), relation !== undefined);
    if (relation) assert.deepEqual(l.data.relations, []);
  });
test('a logical v2 overlay inherits every relation page and preserves untouched optional fields', async () => {
  const f = await setup({
    mode: 'v2',
    fields: { summary: null, details: '\ufeffReplacement', isPublic: false },
  });
  const l = await f.read();
  assert.deepEqual(l.data, f.expected);
  assert.equal(l.data.relations.length, 65);
  assert.deepEqual(l.data.structuredDetails, { notes: '\ufeffPrivate note' });
});
for (const budget of [{ bytes: 20 }, { parts: 0 }, { pages: 0 }])
  test(
    'logical budget ' + JSON.stringify(budget) + ' refuses before any payload chunk is fetched',
    async () => {
      const f = await setup(),
        chunks = observeChunks(f),
        before = structuredClone([...f.records]);
      await assert.rejects(() => f.read(createBookLoreLogicalBudget(budget)), {
        code: 'resource-exhausted',
      });
      assert.equal(chunks.length, 0);
      assert.deepEqual([...f.records], before);
    },
  );
test('UTF-8 compendium and read budgets reject a large body before provider, quota or debit', async () => {
  const data = logicalLoreData();
  data.details = '🌙'.repeat(100000);
  const f = await setup({ data }),
    chunks = observeChunks(f),
    before = structuredClone([...f.records]);
  await assert.rejects(() => f.analyze(), { code: 'resource-exhausted' });
  assert.equal(chunks.length, 0);
  assert.equal(f.calls.length, 0);
  assert.deepEqual([...f.records], before);
  assert.equal(f.records.has(ticket(f)), false);
});
test('analysis pages its collection and refuses 501 records without a partial context', async () => {
  const f = await setup({ mode: 'inline', data: { name: 'Arthur', category: 'other' } });
  await f.db.runTransaction(async (tx) => {
    for (let i = 0; i < 500; i++)
      tx.create(f.db.doc('books/book/lore/entity-' + String(i).padStart(4, '0')), {
        name: 'N' + i,
        category: 'other',
      });
  });
  const before = structuredClone([...f.records]);
  f.reads.length = 0;
  await assert.rejects(() => f.analyze(), { code: 'resource-exhausted' });
  assert.equal(f.calls.length, 0);
  assert.deepEqual([...f.records], before);
  const queries = f.reads.filter((q) => q.collectionPath === 'books/book/lore');
  assert.ok(queries.length > 1);
  assert.ok(queries.every((q) => q.maximum === 16 && q.count <= 16));
});
for (const artifact of ['body', 'part', 'relation'])
  test('recreated ' + artifact + ' is not hydrated or sent to a provider', async () => {
    const f = await setup(),
      path =
        artifact === 'body'
          ? f.seed.base.path
          : artifact === 'part'
            ? resourcePayloadChunkPath(f.bookId, f.seed.base.prepared.manifest.bodyId, 0)
            : f.seed.segments[0].path,
      value = structuredClone(f.records.get(path));
    await f.db.runTransaction((tx) => tx.delete(f.db.doc(path)));
    await f.db.runTransaction((tx) => tx.create(f.db.doc(path), value));
    await assert.rejects(() => f.analyze(), { code: 'failed-precondition' });
    assert.equal(f.calls.length, 0);
    assert.equal(credits(f), 5);
    assert.deepEqual(f.records.get(path), value);
  });
test('full SHA is checked independently of a valid Merkle tree and canonical body', async () => {
  const f = await setup(),
    path = f.seed.base.path,
    header = structuredClone(f.records.get(path));
  header.contentHash = 'f'.repeat(64);
  await f.db.runTransaction((tx) => tx.delete(f.db.doc(path)));
  await f.db.runTransaction((tx) => tx.create(f.db.doc(path), header));
  const s = await f.db.runTransaction((tx) => tx.get(f.db.doc(path))),
    storage = structuredClone(f.seed.storage);
  storage.base.manifest.contentHash = header.contentHash;
  storage.base.expectedBirth = born(s);
  storage.sealBirth = born(s);
  storage.relations.sealBirth = storage.sealBirth;
  await f.db.runTransaction((tx) => tx.update(f.db.doc(f.seed.path), { payloadStorage: storage }));
  await assert.rejects(() => f.read(), { code: 'failed-precondition' });
});
for (const value of ['invalid-category', null, { category: 'other' }])
  test(
    'invalid category body ' + JSON.stringify(value) + ' is rejected as a domain error',
    async () => {
      const f = await setup({ mode: 'v2', fields: { category: value } });
      await assert.rejects(() => f.read(), { code: 'failed-precondition' });
    },
  );
for (const artifact of ['book', 'head', 'global-universe', 'global-lore'])
  test(
    'native recreation of ' + artifact + ' invalidates an otherwise identical analysis revision',
    async () => {
      const f = await setup();
      await f.db.runTransaction((tx) => {
        tx.update(f.db.doc('books/book'), { universeId: 'world' });
        tx.create(f.db.doc('universes/world'), { authorId: f.uid, loreVersion: 1 });
        tx.create(f.db.doc('universes/world/lore/port'), {
          name: 'Port',
          category: 'location',
          updatedAt: 1000,
        });
        tx.create(f.db.doc('books/book/lore/inline'), {
          name: 'Inline',
          category: 'other',
          updatedAt: 1000,
        });
      });
      f.request.loreVersions.push(['inline', 1000], ['universe:world:port', 1000]);
      await f.analyze();
      const path =
          artifact === 'book'
            ? 'books/book'
            : artifact === 'head'
              ? f.seed.path
              : artifact === 'global-universe'
                ? 'universes/world'
                : 'universes/world/lore/port',
        value = structuredClone(f.records.get(path));
      await f.db.runTransaction((tx) => tx.delete(f.db.doc(path)));
      await f.db.runTransaction((tx) => tx.create(f.db.doc(path), value));
      const before = structuredClone([...f.records]);
      await assert.rejects(
        () => f.apply([{ scope: 'local', entityId: 'inline', input: { summary: 'New' } }]),
        { code: 'failed-precondition' },
      );
      assert.deepEqual([...f.records], before);
    },
  );
test('payload apply is refused before writing or charging even after an earlier inline change in the batch', async () => {
  const f = await setup();
  await f.db.runTransaction((tx) =>
    tx.create(f.db.doc('books/book/lore/inline'), {
      name: 'Inline',
      category: 'other',
      details: 'Own',
      updatedAt: 1000,
    }),
  );
  f.request.loreVersions.push(['inline', 1000]);
  await f.analyze();
  const before = structuredClone([...f.records]);
  await assert.rejects(
    () =>
      f.apply([
        { scope: 'local', entityId: 'inline', input: { summary: 'New' } },
        { scope: 'local', entityId: f.entityId, input: { summary: 'New' } },
      ]),
    { code: 'failed-precondition' },
  );
  assert.deepEqual([...f.records], before);
  assert.equal(credits(f), 5);
  const done = await f.apply([{ scope: 'local', entityId: 'inline', input: { summary: 'New' } }]);
  assert.deepEqual(done, { applied: 1, credits: 4 });
  assert.equal(f.records.get('books/book/lore/inline').details, 'Own');
  assert.deepEqual(f.records.get(f.seed.path), before.find(([p]) => p === f.seed.path)[1]);
});

for (const change of ['owner', 'deleting', 'book-recreated', 'lore-clock'])
  test(
    'a provider response is discarded after ' + change + ' and no next chapter chunk is requested',
    async () => {
      const d = adventureImportDb({ nativeUpdates: true });
      const f = {
        ...d,
        ...(await loreLogicalFixture(d.db, {
          onGenerate: async () => {
            if (change === 'book-recreated') {
              const value = structuredClone(d.records.get('books/book'));
              await d.db.runTransaction((tx) => tx.delete(d.db.doc('books/book')));
              await d.db.runTransaction((tx) => tx.create(d.db.doc('books/book'), value));
            } else
              await d.db.runTransaction((tx) =>
                tx.update(
                  d.db.doc('books/book'),
                  change === 'owner'
                    ? { authorId: 'other' }
                    : change === 'deleting'
                      ? { deleting: true }
                      : { localLoreVersion: 1 },
                ),
              );
          },
        })),
      };
      f.request.text = 'Arthur chegou ao porto.' + 'x'.repeat(24000);
      await assert.rejects(() => f.analyze());
      assert.equal(f.calls.length, 1);
      assert.equal(f.records.get(ticket(f)).state, 'failed');
      assert.equal(Object.hasOwn(f.records.get(ticket(f)), 'entities'), false);
      assert.equal(credits(f), 5);
    },
  );
test('ready body replay reauthorizes its source, while applied metadata receipt survives origin loss', async () => {
  const f = await setup({ mode: 'inline' });
  await f.analyze();
  const quota = structuredClone(f.records.get('users/author/loreAnalysisLimits/current'));
  await f.analyze();
  assert.equal(f.calls.length, 1);
  const changes = [{ scope: 'local', entityId: f.entityId, input: { summary: 'Updated' } }];
  const result = await f.apply(changes);
  await f.db.runTransaction((tx) => tx.update(f.db.doc('books/book'), { deleting: true }));
  await assert.rejects(() => f.analyze());
  assert.deepEqual(await f.apply(changes), result);
  assert.equal(credits(f), 4);
  assert.deepEqual(f.records.get('users/author/loreAnalysisLimits/current'), quota);
});
