import test from 'node:test';
import assert from 'node:assert/strict';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import { analysisApplicationFixture } from './helpers/loreAnalysisApplicationFixture.mjs';
import {
  applicationChildPaths,
  applicationPaths,
} from '../src/loreAnalysisApplicationContracts.mjs';
import { born } from '../src/bookRestoreUploadContracts.mjs';
import { digest } from '../src/workProgressContracts.mjs';
import { createLoreAnalysisApplicationService } from '../src/loreAnalysisApplication.mjs';
import {
  bookLoreDeletionFixture,
  markBookDeleting,
  finishBookLoreDeletion,
} from './helpers/bookLoreDeletionFixture.mjs';
async function setup(options) {
  const d = adventureImportDb({ nativeUpdates: true });
  return { ...d, ...(await analysisApplicationFixture(d.db, options)) };
}
const all = (f) => structuredClone([...f.records]);
const context = (f) => f.records.get(f.path);
const childPaths = (f) =>
  applicationChildPaths(applicationPaths(f.db, f.uid, f.control.id), context(f));
const read = (f, path) => f.db.runTransaction((tx) => tx.get(f.db.doc(path)));
for (const mode of ['inline', 'v1', 'v2', 'created'])
  test(
    'reserve ' + mode + ' from the native analysis without bytes, head writes, clocks or debit',
    async () => {
      const f = await setup({ mode }),
        head = structuredClone(f.records.get(f.seed.path)),
        book = structuredClone(f.records.get('books/book')),
        bytes = [...f.records].filter(([path]) =>
          /bookResource(Bodies|Chunks)|bookLoreSegments/.test(path),
        ),
        result = await f.reserve(),
        c = context(f);
      assert.equal(result.phase, 'preparing');
      assert.equal(result.memberCount, 1);
      assert.equal(c.members[0].source.id, f.entityId);
      assert.equal(c.members[0].patchHash, digest(f.input.changes[0].input));
      assert.deepEqual(c.members[0].fields, ['summary']);
      assert.equal(c.members[0].children.creationId, null);
      assert.ok(c.members[0].children.inspectionId);
      assert.deepEqual(f.records.get(f.seed.path), head);
      assert.equal(f.records.get('books/book').localLoreVersion, book.localLoreVersion);
      assert.equal(f.records.get('books/book').hasLoreResources, true);
      assert.equal(f.records.get('users/author').credits, 5);
      assert.deepEqual(
        [...f.records].filter(([path]) =>
          /bookResource(Bodies|Chunks)|bookLoreSegments/.test(path),
        ),
        bytes,
      );
      assert.ok(!JSON.stringify(c).includes('Literal'));
      assert.ok(!JSON.stringify(c).includes('Confirmed'));
      for (const path of childPaths(f)) assert.equal(f.records.has(path), false);
      const snapshot = await read(f, f.path),
        state = await read(f, f.path + '/state/current'),
        event = await read(f, f.path + '/events/0000000000000000'),
        proof = await read(f, f.path + '/proofs/0000000000000000');
      for (const s of [state, event, proof]) assert.deepEqual(born(s), born(snapshot));
      assert.deepEqual(
        c.analysisBirth,
        born(await read(f, 'users/author/loreAnalyses/' + f.control.id)),
      );
      assert.deepEqual(await f.reserve(), result);
    },
  );
test('50 local/global/existing/new targets reserve one complete metadata manifest with distinct child identities', async () => {
  const changes = [
      { scope: 'local', entityId: 'arthur', input: { summary: 'Local updated' } },
      { scope: 'global', entityId: 'universe:world:global', input: { summary: 'Global updated' } },
      ...Array.from({ length: 48 }, (_, i) => ({
        scope: i % 2 ? 'global' : 'local',
        input: { name: 'New ' + i, category: 'other', summary: 'New summary ' + i },
      })),
    ],
    f = await setup({ globals: true, changes }),
    result = await f.reserve(),
    c = context(f);
  assert.equal(result.memberCount, 50);
  assert.equal(c.universeId, 'world');
  const paths = childPaths(f);
  assert.equal(new Set(paths).size, paths.length);
  assert.ok(paths.length > 100);
  assert.equal(c.members[0].source.id, 'arthur');
  assert.equal(c.members[1].source.id, 'universe:world:global');
  assert.ok(c.members[2].children.creationId);
  assert.equal(c.members[3].children.creationId, null);
  assert.deepEqual(c.members[2].fields, [
    'name',
    'category',
    'summary',
    'details',
    'aliases',
    'isPublic',
  ]);
  assert.equal(f.records.get('books/book').localLoreVersion, 0);
  assert.equal(f.records.get('universes/world').loreVersion, 0);
  assert.equal(f.records.get('users/author').credits, 5);
  assert.equal((await f.cancel()).phase, 'cancelled');
});
test('concurrent exact reservation returns one token and changed intent never reuses its manifest', async () => {
  const f = await setup(),
    [a, b] = await Promise.all([f.reserve(), f.reserve()]);
  assert.deepEqual(a, b);
  const before = all(f);
  await assert.rejects(() =>
    f.service.reserveLoreAnalysisApplication(f.uid, {
      ...f.input,
      changes: [{ scope: 'local', entityId: f.entityId, input: { details: 'different' } }],
    }),
  );
  assert.deepEqual(all(f), before);
});
test('cancel-before-start fences a delayed reservation without needing a live book or analysis', async () => {
  const f = await setup(),
    result = await f.cancel();
  assert.equal(result.phase, 'cancelled');
  assert.equal(result.memberCount, 0);
  assert.equal(result.bookId, null);
  const before = all(f);
  assert.deepEqual(await f.reserve(), result);
  assert.deepEqual(await f.cancel(), result);
  assert.deepEqual(all(f), before);
});
test('metadata retries and cancellation remain available after revocation and expiration without giving body access', async () => {
  const f = await setup(),
    reserved = await f.reserve();
  await f.db.runTransaction((tx) => {
    tx.update(f.db.doc('books/book'), { authorId: 'other', deleting: true });
    tx.delete(f.db.doc('users/author/loreAnalyses/' + f.control.id));
  });
  assert.deepEqual(await f.reserve(), reserved);
  assert.deepEqual(await f.get(), reserved);
  const late = createLoreAnalysisApplicationService({ db: f.db, now: () => 999999999 });
  assert.equal(
    (await late.cancelLoreAnalysisApplication(f.uid, { ...f.control, operationId: 'late-cancel' }))
      .phase,
    'cancelled',
  );
  assert.equal(f.records.get('users/author').credits, 5);
  assert.equal(Object.hasOwn(await f.get(), 'members'), false);
});
for (const defect of [
  'book-owner',
  'book-deleting',
  'book-absent',
  'chapter-text',
  'head-update',
  'head-recreated',
  'lore-clock',
  'expired',
  'not-ready',
])
  test(defect + ' prevents the first reservation atomically', async () => {
    const f = await setup();
    await f.db.runTransaction((tx) => {
      if (defect === 'book-owner') tx.update(f.db.doc('books/book'), { authorId: 'other' });
      if (defect === 'book-deleting') tx.update(f.db.doc('books/book'), { deleting: true });
      if (defect === 'book-absent') tx.delete(f.db.doc('books/book'));
      if (defect === 'chapter-text')
        tx.update(f.db.doc('books/book/chapters/chapter'), { content: 'Changed' });
      if (defect === 'head-update') tx.update(f.db.doc(f.seed.path), { updatedAt: 9000 });
      if (defect === 'head-recreated') tx.delete(f.db.doc(f.seed.path));
      if (defect === 'lore-clock') tx.update(f.db.doc('books/book'), { localLoreVersion: 1 });
      if (defect === 'expired')
        tx.update(f.db.doc('users/author/loreAnalyses/' + f.control.id), { expiresAt: 1 });
      if (defect === 'not-ready')
        tx.update(f.db.doc('users/author/loreAnalyses/' + f.control.id), { state: 'failed' });
    });
    const before = all(f);
    await assert.rejects(() => f.reserve());
    assert.deepEqual(all(f), before);
    assert.equal(f.records.has(f.path), false);
  });
for (const defect of [
  'empty',
  '51',
  'duplicate-target',
  'duplicate-name',
  'no-op',
  'unknown-field',
  'wrong-scope',
  'missing-new-fields',
])
  test('invalid ' + defect + ' batch never creates a reservation', async () => {
    const f = await setup();
    const changes =
      defect === 'empty'
        ? []
        : defect === '51'
          ? Array(51).fill(f.input.changes[0])
          : defect === 'duplicate-target'
            ? [f.input.changes[0], f.input.changes[0]]
            : defect === 'duplicate-name'
              ? [
                  {
                    scope: 'local',
                    input: { name: 'Ａｒｔｈｕｒ', category: 'other', summary: 'Summary' },
                  },
                ]
              : defect === 'no-op'
                ? [{ scope: 'local', entityId: f.entityId, input: { name: f.expected.name } }]
                : defect === 'unknown-field'
                  ? [{ scope: 'local', entityId: f.entityId, input: { isPublic: false } }]
                  : defect === 'wrong-scope'
                    ? [{ scope: 'global', entityId: f.entityId, input: { summary: 'Changed' } }]
                    : [{ scope: 'local', input: { name: 'Missing' } }];
    const before = all(f);
    await assert.rejects(() =>
      f.service.reserveLoreAnalysisApplication(f.uid, { ...f.input, changes }),
    );
    assert.deepEqual(all(f), before);
  });
for (const pathKind of ['context', 'state', 'event', 'proof', 'event-and-proof'])
  test(
    'recreated ' + pathKind + ' cannot confirm metadata or cancel the original reservation',
    async () => {
      const f = await setup();
      await f.reserve();
      const paths =
          pathKind === 'context'
            ? [f.path]
            : pathKind === 'state'
              ? [f.path + '/state/current']
              : pathKind === 'event-and-proof'
                ? [f.path + '/events/0000000000000000', f.path + '/proofs/0000000000000000']
                : [
                    f.path +
                      '/' +
                      (pathKind === 'event' ? 'events' : 'proofs') +
                      '/0000000000000000',
                  ],
        values = paths.map((p) => structuredClone(f.records.get(p)));
      await f.db.runTransaction((tx) => paths.forEach((p) => tx.delete(f.db.doc(p))));
      await f.db.runTransaction((tx) => paths.forEach((p, i) => tx.create(f.db.doc(p), values[i])));
      const before = all(f);
      await assert.rejects(() => f.get());
      await assert.rejects(() => f.reserve());
      await assert.rejects(() => f.cancel());
      assert.deepEqual(all(f), before);
    },
  );
for (const point of ['context', 'event', 'flag'])
  test('reserve rollback at ' + point + ' leaves no manifest, clock or debit', async () => {
    const f = await setup(),
      before = all(f),
      run = f.db.runTransaction.bind(f.db),
      failPath =
        point === 'context'
          ? f.path
          : point === 'event'
            ? f.path + '/proofs/0000000000000000'
            : 'books/book';
    f.db.runTransaction = (fn) =>
      run((tx) => {
        const proxy = { ...tx };
        for (const method of ['create', 'update'])
          proxy[method] = (ref, value) => {
            tx[method](ref, value);
            if (ref.path === failPath) throw Error('injected reserve rollback');
          };
        return fn(proxy);
      });
    await assert.rejects(() => f.reserve(), /injected reserve rollback/);
    assert.deepEqual(all(f), before);
    f.db.runTransaction = run;
    assert.equal((await f.reserve()).phase, 'preparing');
  });
test('cancel intent closes the parent before an unknown child blocks cleanup or book deletion', async () => {
  const f = await setup();
  await f.reserve();
  const path = childPaths(f)[0];
  await f.db.runTransaction((tx) => tx.create(f.db.doc(path), { foreign: true }));
  assert.equal((await f.cancel()).phase, 'cancelling');
  assert.deepEqual(f.records.get(path), { foreign: true });
  const deletion = bookLoreDeletionFixture(f.db);
  await markBookDeleting(deletion);
  await deletion.step();
  let blocked = false;
  for (let unit = 0; unit < 12 && !blocked; unit++) {
    const beforeStep = all(f);
    try {
      await deletion.step();
    } catch (error) {
      assert.equal(error.code, 'failed-precondition');
      assert.deepEqual(all(f), beforeStep);
      blocked = true;
    }
  }
  assert.equal(blocked, true);
  assert.equal((await f.get()).phase, 'cancelling');
  assert.deepEqual(f.records.get(path), { foreign: true });
});
test('whole-book deletion closes a reservation and preserves only metadata receipts after all source bytes are removed', async () => {
  const f = await setup();
  await f.reserve();
  const other = structuredClone(f.records.get(f.path));
  const deletion = bookLoreDeletionFixture(f.db);
  await markBookDeleting(deletion);
  assert.equal((await finishBookLoreDeletion(deletion)).complete, true);
  assert.equal(f.records.has('books/book'), false);
  assert.equal((await f.get()).phase, 'cancelled');
  assert.equal((await f.reserve()).phase, 'cancelled');
  assert.deepEqual(f.records.get(f.path), other);
  assert.equal(f.records.get('users/author').credits, 5);
  assert.equal(
    [...f.records.keys()].some((p) => /bookResource(Bodies|Chunks)/.test(p)),
    false,
  );
});
test('qualified global IDs retain the original component limits without shortening a valid target', async () => {
  const longId = 'x'.repeat(1490),
    qualified = 'universe:world:' + longId,
    f = await setup({
      globals: true,
      analyze: false,
      changes: [
        { scope: 'global', entityId: qualified, input: { summary: 'Changed long global target' } },
      ],
    });
  await f.db.runTransaction((tx) =>
    tx.create(f.db.doc('universes/world/lore/' + longId), {
      name: 'Long target',
      category: 'other',
      updatedAt: 1000,
    }),
  );
  f.request.loreVersions.push([qualified, 1000]);
  await f.analyze();
  const p = await f.reserve();
  assert.equal(p.memberCount, 1);
  assert.equal(context(f).members[0].source.id, qualified);
  assert.equal(context(f).members[0].targetId, longId);
});
test('BYOK provider remains frozen in the reservation and can reserve with zero credits', async () => {
  const f = await setup({ analyze: false });
  await f.db.runTransaction((tx) => tx.update(f.db.doc('users/author'), { credits: 0 }));
  await f.service.prepareBYOKLore(f.uid, { ...f.request, entities: [] });
  assert.equal((await f.reserve()).phase, 'preparing');
  assert.equal(context(f).provider, 'byok');
  assert.equal(f.records.get('users/author').credits, 0);
});

test('orphan state blocks first reservation and cancellation fence without overwriting metadata', async () => {
  const f = await setup();
  await f.db.runTransaction((tx) =>
    tx.create(f.db.doc(f.path + '/state/current'), { foreign: true }),
  );
  const before = all(f);
  await assert.rejects(() => f.reserve());
  await assert.rejects(() => f.cancel());
  assert.deepEqual(all(f), before);
});

test('wrong user and mismatched token cannot claim the reservation', async () => {
  const f = await setup();
  const p = await f.reserve(),
    before = all(f);
  assert.equal(
    await f.service.getLoreAnalysisApplication('other', { ...f.control, jobToken: p.jobToken }),
    null,
  );
  await assert.rejects(() => f.service.reserveLoreAnalysisApplication('other', f.input));
  assert.equal(await f.service.getLoreAnalysisApplication('other', f.control), null);
  await assert.rejects(() =>
    f.service.getLoreAnalysisApplication(f.uid, { ...f.control, jobToken: '0'.repeat(64) }),
  );
  assert.deepEqual(all(f), before);
});
