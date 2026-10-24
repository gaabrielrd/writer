import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { before, beforeEach, after, test } from 'node:test';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
  loreLogicalFixture,
  logicalLoreData,
} from '../../functions/test/helpers/bookLoreLogicalFixture.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-lore-logical-analysis';
let admin, env;
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127[.]0[.]0[.]1:[0-9]+$/.test(address ?? ''))
    throw Error('Dedicated loopback emulator required');
  const [host, port] = address.split(':');
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      host,
      port: Number(port),
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
  });
  admin = new Firestore({ projectId, host: address, ssl: false, universeDomain: 'googleapis.com' });
});
beforeEach(async () => env.clearFirestore());
after(async () => {
  await admin?.terminate();
  await env?.cleanup();
});
const data = async (path) => (await admin.doc(path).get()).data();
for (const mode of ['v1', 'v2'])
  test(
    'SDK logical analysis hydrates ' +
      mode +
      ' fields and relation pages, preserves sources and refuses mixed payload writes without debit',
    async () => {
      const initial = logicalLoreData();
      initial.details = '\ufeffOriginal 🌙'.repeat(5000);
      const f = await loreLogicalFixture(admin, {
        mode,
        data: initial,
        fields:
          mode === 'v2'
            ? { details: '\ufeffChanged 🌙'.repeat(5000), summary: null, isPublic: false }
            : {},
      });
      await admin
        .doc('books/book/lore/inline')
        .create({ name: 'Inline', category: 'other', details: 'Own', updatedAt: 1000 });
      f.request.loreVersions.push(['inline', 1000]);
      const before = await data(f.seed.path),
        logical = await f.read();
      assert.deepEqual(logical.data, f.expected);
      assert.equal(logical.data.relations.length, 65);
      await f.analyze();
      const sent = f.calls[0].lore.find((v) => v.id === f.entityId);
      assert.equal(sent.details, f.expected.details);
      assert.equal(sent.name, f.expected.name);
      assert.equal((await data('users/author')).credits, 5);
      assert.equal(
        JSON.stringify(await data('users/author/loreAnalyses/' + f.request.requestId)).includes(
          'Original',
        ),
        false,
      );
      await assert.rejects(
        () =>
          f.apply([
            { scope: 'local', entityId: 'inline', input: { summary: 'Changed' } },
            { scope: 'local', entityId: f.entityId, input: { summary: 'Changed' } },
          ]),
        { code: 'failed-precondition' },
      );
      assert.equal(Object.hasOwn(await data('books/book/lore/inline'), 'summary'), false);
      assert.equal((await data('users/author')).credits, 5);
      assert.deepEqual(await data(f.seed.path), before);
      const changes = [{ scope: 'local', entityId: 'inline', input: { summary: 'Changed' } }],
        result = await f.apply(changes);
      assert.deepEqual(result, { applied: 1, credits: 4 });
      assert.equal((await data('books/book/lore/inline')).details, 'Own');
      await admin.doc('books/book').update({ deleting: true });
      await assert.rejects(() => f.analyze());
      assert.deepEqual(await f.apply(changes), result);
      assert.deepEqual(await data(f.seed.path), before);
    },
  );
test('SDK oversized context is rejected before any chunk, provider, ticket or quota write', async () => {
  const initial = logicalLoreData();
  initial.details = '🌙'.repeat(100000);
  const f = await loreLogicalFixture(admin, { data: initial }),
    run = admin.runTransaction.bind(admin),
    chunks = [];
  admin.runTransaction = (fn) =>
    run((tx) =>
      fn(
        new Proxy(tx, {
          get(target, key) {
            if (key === 'get')
              return (ref, ...args) => {
                if (ref.path?.includes('/bookResourceChunks/')) chunks.push(ref.path);
                return target.get(ref, ...args);
              };
            const method = target[key];
            return typeof method === 'function' ? method.bind(target) : method;
          },
        }),
      ),
    );
  try {
    await assert.rejects(() => f.analyze(), { code: 'resource-exhausted' });
  } finally {
    admin.runTransaction = run;
  }
  assert.equal(chunks.length, 0);
  assert.equal(f.calls.length, 0);
  assert.equal((await data('users/author')).credits, 5);
  assert.equal(
    (await admin.doc('users/author/loreAnalyses/' + f.request.requestId).get()).exists,
    false,
  );
  assert.equal((await admin.doc('users/author/loreAnalysisLimits/current').get()).exists, false);
});
test('SDK revocation during provider I/O discards the response before a second chunk or credit change', async () => {
  const f = await loreLogicalFixture(admin, {
    onGenerate: async () => admin.doc('books/book').update({ authorId: 'other' }),
  });
  f.request.text += 'x'.repeat(24000);
  await assert.rejects(() => f.analyze(), { code: 'permission-denied' });
  assert.equal(f.calls.length, 1);
  const record = await data('users/author/loreAnalyses/' + f.request.requestId);
  assert.equal(record.state, 'failed');
  assert.equal(Object.hasOwn(record, 'entities'), false);
  assert.equal((await data('users/author')).credits, 5);
});
test('SDK native global lore recreation invalidates a ready response even with identical bytes and version counters', async () => {
  const f = await loreLogicalFixture(admin);
  await admin.doc('books/book').update({ universeId: 'world' });
  await admin.doc('universes/world').create({ authorId: 'author', loreVersion: 1 });
  const path = 'universes/world/lore/port',
    value = { name: 'Port', category: 'location', updatedAt: 1000 };
  await admin.doc(path).create(value);
  f.request.loreVersions.push(['universe:world:port', 1000]);
  await f.analyze();
  await admin.doc(path).delete();
  await admin.doc(path).create(value);
  await assert.rejects(() => f.analyze(), { code: 'failed-precondition' });
  await assert.rejects(
    () => f.apply([{ scope: 'local', input: { name: 'New', category: 'other', summary: 'New' } }]),
    { code: 'failed-precondition' },
  );
  assert.equal((await data('users/author')).credits, 5);
  assert.equal((await data('universes/world')).loreVersion, 1);
  assert.deepEqual(await data(path), value);
});
test('SDK a natively activated creation is analyzed through its original head proof without copying its payload into the ticket', async () => {
  const f = await loreLogicalFixture(admin, { mode: 'created' }),
    before = await data(f.seed.path);
  assert.deepEqual((await f.read()).data, f.expected);
  await f.analyze();
  assert.equal(f.calls[0].lore[0].details, f.expected.details);
  assert.equal((await data('users/author')).credits, 5);
  await assert.rejects(
    () =>
      f.apply([{ scope: 'local', entityId: f.entityId, input: { summary: 'No inline write' } }]),
    { code: 'failed-precondition' },
  );
  assert.deepEqual(await data(f.seed.path), before);
});
