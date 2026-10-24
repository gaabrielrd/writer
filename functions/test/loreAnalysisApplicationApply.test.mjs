import test from 'node:test';
import assert from 'node:assert/strict';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import {
  applicationPreparationFixture,
  prepareApplication,
} from './helpers/loreAnalysisApplicationPreparationFixture.mjs';
import {
  bookLoreDeletionFixture,
  markBookDeleting,
  finishBookLoreDeletion,
} from './helpers/bookLoreDeletionFixture.mjs';
import { analysisChildPaths } from '../src/loreAnalysisApplicationChildContracts.mjs';
import { applicationPaths } from '../src/loreAnalysisApplicationContracts.mjs';
import { loadApplication } from '../src/loreAnalysisApplicationStore.mjs';
import { authorizeApplicationSource } from '../src/loreAnalysisApplicationSource.mjs';
import {
  grantApplicationAdoption,
  assertAnalysisChildUnit,
} from '../src/loreAnalysisApplicationChildBindings.mjs';
import {
  prepareBookLoreEditAdoption,
  prepareBookLoreEditAdoptionBatch,
} from '../src/bookLoreEditAdoption.mjs';
const all = (f) => structuredClone([...f.records]);
async function setup(options = {}) {
  const d = adventureImportDb({ nativeUpdates: true });
  return { ...d, ...(await applicationPreparationFixture(d.db, options)) };
}
const apply = (f) => f.service.applyLoreAnalysis(f.uid, f.input);
const members = (f) => f.records.get(f.path).members;
const localNew = (i) => ({
  scope: 'local',
  input: { name: 'Local ' + i, category: 'location', summary: 'Harbour ' + i },
});
const globalNew = (i) => ({
  scope: 'global',
  input: { name: 'Global ' + i, category: 'concept', summary: 'Law ' + i },
});
const mixed = [
  { scope: 'local', entityId: 'arthur', input: { summary: 'Confirmed' } },
  localNew(1),
  { scope: 'global', entityId: 'universe:world:global', input: { summary: 'Global changed' } },
  globalNew(1),
];
for (const mode of ['inline', 'v1', 'v2', 'created'])
  test('atomic real apply and metadata replay for ' + mode, async () => {
    const f = await setup({ mode }),
      before = structuredClone(f.records.get('books/book'));
    await prepareApplication(f);
    assert.deepEqual(await apply(f), { applied: 1, credits: 4 });
    const logical = await f.read();
    assert.equal(logical.data.summary, 'Confirmed');
    for (const [key, value] of Object.entries(f.expected))
      if (!['summary', 'updatedAt'].includes(key)) assert.deepEqual(logical.data[key], value, key);
    assert.equal(f.records.get('books/book').localLoreVersion, (before.localLoreVersion ?? 0) + 1);
    const state = f.records.get(f.path + '/state/current'),
      receipt = f.records.get(f.path + '/applied/current');
    assert.equal(state.phase, 'applied');
    assert.equal(receipt.cost, 1);
    assert.equal(receipt.balanceBefore, 5);
    assert.equal(receipt.timestamp, logical.data.updatedAt);
    assert.equal((await f.get()).application.receiptHash, state.application.receiptHash);
    const snapshot = all(f);
    assert.deepEqual(await apply(f), { applied: 1, credits: 4 });
    assert.deepEqual(all(f), snapshot);
    await assert.rejects(f.cancel(), { code: 'failed-precondition' });
  });

test('mixed existing/new local/global preserves unselected bytes, privacy and shared clocks', async () => {
  const f = await setup({ globals: true, changes: mixed }),
    original = structuredClone(f.records.get('universes/world/lore/global'));
  await prepareApplication(f);
  const before = f.records.get('books/book').localLoreVersion ?? 0;
  assert.deepEqual(await apply(f), { applied: 4, credits: 4 });
  const receipt = f.records.get(f.path + '/applied/current'),
    timestamp = receipt.timestamp;
  assert.equal(f.records.get('books/book').localLoreVersion, before + 1);
  assert.equal(f.records.get('books/book').updatedAt, timestamp);
  assert.equal(f.records.get('universes/world').loreVersion, 1);
  assert.equal(f.records.get('universes/world').updatedAt, timestamp);
  assert.equal(f.records.get('users/author/campaignAuthorization/current').epoch, 1);
  assert.deepEqual(f.records.get('universes/world/lore/global'), {
    ...original,
    summary: 'Global changed',
    updatedAt: timestamp,
  });
  const local = f.records.get('books/book/lore/' + members(f)[1].targetId);
  assert.equal(local.isPublic, false);
  assert.equal(local.payloadStorage.dates.updatedAt, timestamp);
  assert.equal(f.records.get('books/book/lore/arthur').isPublic, true);
  const global = f.records.get('universes/world/lore/' + members(f)[3].targetId);
  assert.deepEqual(global, {
    ...mixed[3].input,
    aliases: [],
    details: '',
    relations: [],
    isPublic: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  assert.equal(f.records.get('users/author').updatedAt, timestamp);
  const writes = f.commits.at(-1);
  assert.equal(writes.filter((w) => w.path === 'books/book').length, 1);
  assert.equal(writes.filter((w) => w.path === 'users/author').length, 1);
  assert.equal(writes.filter((w) => w.path === 'universes/world').length, 1);
});

test('global-only prepared batch applies without a local adoption or local clock', async () => {
  const f = await setup({ globals: true, changes: [globalNew(1)] }),
    before = f.records.get('books/book').localLoreVersion;
  await prepareApplication(f);
  assert.deepEqual(await apply(f), { applied: 1, credits: 4 });
  assert.equal(f.records.get('books/book').localLoreVersion, before);
  const r = f.records.get(f.path + '/applied/current');
  assert.equal(r.localBatch, null);
  assert.equal(r.localLoreVersion, null);
  assert.deepEqual(await apply(f), r.result);
});
test('BYOK final confirmation at zero balance has no user debit write', async () => {
  const d = adventureImportDb({ nativeUpdates: true });
  // The BYOK ticket must precede the application reservation.
  const { analysisApplicationFixture } =
    await import('./helpers/loreAnalysisApplicationFixture.mjs');
  const f = { ...d, ...(await analysisApplicationFixture(d.db, { analyze: false })) };
  await f.service.prepareBYOKLore(f.uid, { ...f.request, entities: [] });
  f.initial = await f.reserve();
  f.step = (p) =>
    f.service.advanceLoreAnalysisApplication(f.uid, {
      ...f.input,
      jobToken: p.jobToken,
      expectedRevision: p.revision,
      operationId: 'prepare-' + p.revision,
    });
  await prepareApplication(f);
  await f.db.runTransaction(async (tx) => tx.update(f.db.doc('users/author'), { credits: 0 }));
  assert.deepEqual(await apply(f), { applied: 1, credits: 0 });
  assert.equal(f.records.get(f.path + '/applied/current').cost, 0);
  assert.equal(
    f.commits.at(-1).some((w) => w.path === 'users/author'),
    false,
  );
});
test('insufficient credit rolls back every target and can retry after topup', async () => {
  const f = await setup({ globals: true, changes: mixed });
  await prepareApplication(f);
  await f.db.runTransaction(async (tx) => tx.update(f.db.doc('users/author'), { credits: 0 }));
  const before = all(f);
  await assert.rejects(apply(f), { code: 'resource-exhausted' });
  assert.deepEqual(all(f), before);
  await f.db.runTransaction(async (tx) => tx.update(f.db.doc('users/author'), { credits: 3 }));
  assert.deepEqual(await apply(f), { applied: 4, credits: 2 });
});
for (const phase of ['preparing', 'cancelled', 'ready-cancelled'])
  test('legacy route cannot bypass a ' + phase + ' application', async () => {
    const f = await setup({ mode: 'inline' });
    if (phase === 'ready-cancelled') await prepareApplication(f);
    if (phase !== 'preparing') await f.cancel();
    const before = all(f);
    await assert.rejects(apply(f), { code: 'failed-precondition' });
    assert.deepEqual(all(f), before);
  });

test('complete parent grant never enables singular adoption or a proper subset batch', async () => {
  const f = await setup({ changes: [localNew(1), localNew(2)] });
  await prepareApplication(f);
  const before = all(f);
  await f.db.runTransaction(async (tx) => {
    const l = await loadApplication(tx, applicationPaths(f.db, f.uid, f.control.id), f.control);
    await authorizeApplicationSource(tx, l, () => 5000);
    const { localBatch } = await grantApplicationAdoption(tx, l);
    await assert.rejects(
      prepareBookLoreEditAdoption(tx, { db: f.db }, f.uid, localBatch.requests[0]),
      { code: 'failed-precondition' },
    );
    await assert.rejects(
      prepareBookLoreEditAdoptionBatch(tx, { db: f.db }, f.uid, {
        ...localBatch,
        requests: localBatch.requests.slice(0, 1),
      }),
      { code: 'failed-precondition' },
    );
    // Even after the complete aggregate opens its opaque permit, singular calls cannot use it.
    await prepareBookLoreEditAdoptionBatch(tx, { db: f.db, now: () => 5000 }, f.uid, localBatch);
    await assert.rejects(
      prepareBookLoreEditAdoption(tx, { db: f.db }, f.uid, localBatch.requests[0]),
      { code: 'failed-precondition' },
    );
    assert.throws(
      () => assertAnalysisChildUnit(tx, f.db, f.uid, 'edit', localBatch.requests[0].editId),
      { code: 'failed-precondition' },
    );
  });
  assert.deepEqual(all(f), before);
  assert.deepEqual(await apply(f), { applied: 2, credits: 4 });
});
test('success survives user balance changes, source revocation and missing ticket without writes', async () => {
  const f = await setup();
  await prepareApplication(f);
  const result = await apply(f);
  await f.db.runTransaction(async (tx) => {
    tx.update(f.db.doc('users/author'), { credits: 42 });
    tx.update(f.db.doc('books/book'), { authorId: 'other' });
    tx.delete(f.db.doc('users/author/loreAnalyses/' + f.input.id));
  });
  const before = all(f);
  assert.deepEqual(await apply(f), result);
  assert.equal((await f.get()).phase, 'applied');
  assert.deepEqual(all(f), before);
});
for (const target of ['receipt', 'proof', 'group', 'group-proof', 'state'])
  test('success replay refuses missing original ' + target, async () => {
    const f = await setup();
    await prepareApplication(f);
    await apply(f);
    const receipt = f.records.get(f.path + '/applied/current'),
      prefix = 'users/author/bookLoreEdits/' + receipt.localBatch.requests[0].editId;
    const path = {
      receipt: f.path + '/applied/current',
      proof: f.path + '/appliedProofs/current',
      group: prefix + '/adoptionBatches/' + receipt.localBatch.batchId,
      'group-proof': prefix + '/adoptionBatchProofs/' + receipt.localBatch.batchId,
      state: f.path + '/state/current',
    }[target];
    await f.db.runTransaction(async (tx) => tx.delete(f.db.doc(path)));
    const before = all(f);
    await assert.rejects(apply(f));
    assert.deepEqual(all(f), before);
  });
for (const target of ['receipt', 'proof', 'group'])
  test('same JSON recreation cannot replace native original ' + target, async () => {
    const f = await setup();
    await prepareApplication(f);
    await apply(f);
    const receipt = f.records.get(f.path + '/applied/current'),
      path =
        target === 'group'
          ? 'users/author/bookLoreEdits/' +
            receipt.localBatch.requests[0].editId +
            '/adoptionBatches/' +
            receipt.localBatch.batchId
          : f.path + (target === 'receipt' ? '/applied/current' : '/appliedProofs/current'),
      value = f.records.get(path);
    await f.db.runTransaction(async (tx) => tx.delete(f.db.doc(path)));
    await f.db.runTransaction(async (tx) => tx.create(f.db.doc(path), value));
    const before = all(f);
    await assert.rejects(apply(f));
    assert.deepEqual(all(f), before);
  });
test('ticket marker never falls back to its mutable result after missing application', async () => {
  const f = await setup();
  await prepareApplication(f);
  await apply(f);
  await f.db.runTransaction(async (tx) => tx.delete(f.db.doc(f.path)));
  const before = all(f);
  await assert.rejects(apply(f));
  assert.deepEqual(all(f), before);
});
test('applied receipt remains metadata-confirmable after whole-book lore cleanup', async () => {
  const f = await setup({ changes: [localNew(1)] });
  await prepareApplication(f);
  const result = await apply(f);
  const deletion = bookLoreDeletionFixture(f.db);
  await markBookDeleting(deletion);
  await finishBookLoreDeletion(deletion);
  assert.equal(f.records.has('books/book/lore/' + members(f)[0].targetId), false);
  assert.equal(
    [...f.records.keys()].some((p) => /books\/book\/bookResource(Bodies|Chunks)\//.test(p)),
    false,
  );
  const before = all(f);
  assert.deepEqual(await apply(f), result);
  assert.equal((await f.get()).phase, 'applied');
  assert.deepEqual(all(f), before);
});

for (const mutation of [
  'book-owner',
  'chapter-text',
  'ticket-provider',
  'ticket-birth',
  'world-owner',
  'global-source',
  'missing-member',
  'extra-member',
  'edit-owner-recreated',
])
  test(
    'final apply refuses changed ' + mutation + ' without any target or debit writes',
    async () => {
      const f = await setup({ globals: true, changes: mixed });
      await prepareApplication(f);
      const c = members(f),
        owner = analysisChildPaths(f.db, f.uid, { kind: 'edit', id: c[0].children.editId }).owner
          .path;
      if (mutation === 'book-owner')
        await f.db.runTransaction(async (tx) =>
          tx.update(f.db.doc('books/book'), { authorId: 'other' }),
        );
      if (mutation === 'chapter-text')
        await f.db.runTransaction(async (tx) =>
          tx.update(f.db.doc('books/book/chapters/chapter'), { content: 'Changed' }),
        );
      if (mutation === 'ticket-provider')
        await f.db.runTransaction(async (tx) =>
          tx.update(f.db.doc('users/author/loreAnalyses/' + f.input.id), { provider: 'byok' }),
        );
      if (mutation === 'world-owner')
        await f.db.runTransaction(async (tx) =>
          tx.update(f.db.doc('universes/world'), { authorId: 'other' }),
        );
      if (mutation === 'global-source')
        await f.db.runTransaction(async (tx) =>
          tx.update(f.db.doc('universes/world/lore/global'), { details: 'Changed' }),
        );
      if (mutation === 'missing-member')
        await f.db.runTransaction(async (tx) => tx.delete(f.db.doc(f.path + '/prepared/0001')));
      if (mutation === 'extra-member')
        await f.db.runTransaction(async (tx) =>
          tx.create(f.db.doc(f.path + '/prepared/0049'), { unexpected: true }),
        );
      if (mutation === 'ticket-birth' || mutation === 'edit-owner-recreated') {
        const path =
          mutation === 'ticket-birth' ? 'users/author/loreAnalyses/' + f.input.id : owner;
        const actual = path;
        const value = f.records.get(actual);
        await f.db.runTransaction(async (tx) => tx.delete(f.db.doc(actual)));
        await f.db.runTransaction(async (tx) => tx.create(f.db.doc(actual), value));
      }
      const before = all(f);
      await assert.rejects(apply(f));
      assert.deepEqual(all(f), before);
    },
  );

for (const location of [
  'head',
  'book-clock',
  'global',
  'world-clock',
  'credit',
  'ticket',
  'receipt',
  'parent',
])
  test(
    'transaction rollback at ' +
      location +
      ' leaves all sources and balance unchanged, then exact retry succeeds',
    async () => {
      const f = await setup({ globals: true, changes: mixed });
      await prepareApplication(f);
      const targets = {
          head: 'books/book/lore/arthur',
          'book-clock': 'books/book',
          global: 'universes/world/lore/global',
          'world-clock': 'universes/world',
          credit: 'users/author',
          ticket: 'users/author/loreAnalyses/' + f.input.id,
          receipt: f.path + '/applied/current',
          parent: f.path + '/state/current',
        },
        before = all(f),
        run = f.db.runTransaction.bind(f.db);
      f.db.runTransaction = (fn) =>
        run((tx) =>
          fn(
            new Proxy(tx, {
              get(target, key) {
                if (['create', 'set', 'update', 'delete'].includes(key))
                  return (ref, ...args) => {
                    const result = target[key](ref, ...args);
                    if (ref.path === targets[location]) throw Error('Injected atomic failure');
                    return result;
                  };
                const value = target[key];
                return typeof value === 'function' ? value.bind(target) : value;
              },
            }),
          ),
        );
      try {
        await assert.rejects(apply(f), /Injected atomic failure/);
      } finally {
        f.db.runTransaction = run;
      }
      assert.deepEqual(all(f), before);
      assert.deepEqual(await apply(f), { applied: 4, credits: 4 });
    },
  );

test('50 actual new local targets apply with one charge, one clock and one immutable group receipt', async () => {
  const f = await setup({ changes: Array.from({ length: 50 }, (_, i) => localNew(i)) });
  await prepareApplication(f);
  assert.deepEqual(await apply(f), { applied: 50, credits: 4 });
  const r = f.records.get(f.path + '/applied/current');
  assert.equal(r.localCount, 50);
  assert.equal(r.localBatch.requests.length, 50);
  assert.equal(f.records.get('books/book').localLoreVersion, 1);
  for (const m of members(f)) {
    const head = f.records.get('books/book/lore/' + m.targetId);
    assert.equal(head.payloadStorage.dates.updatedAt, r.timestamp);
    assert.equal(head.isPublic, false);
    assert.equal(f.records.get('users/author/bookLoreEdits/' + m.children.editId).phase, 'adopted');
  }
  const before = all(f);
  assert.deepEqual(await apply(f), r.result);
  assert.deepEqual(all(f), before);
});

for (const marker of [null, false, {}])
  test(
    'present but invalid new ticket marker cannot fall back to legacy receipt: ' +
      JSON.stringify(marker),
    async () => {
      const f = await setup({ mode: 'inline' });
      await prepareApplication(f);
      await apply(f);
      await f.db.runTransaction(async (tx) => {
        tx.delete(f.db.doc(f.path));
        tx.update(f.db.doc('users/author/loreAnalyses/' + f.input.id), { application: marker });
      });
      const before = all(f);
      await assert.rejects(apply(f));
      assert.deepEqual(all(f), before);
    },
  );
test('prepared intent remains stable across object property order while legacy hash stays untouched', async () => {
  const f = await setup();
  await prepareApplication(f);
  const { input } = f.input.changes[0];
  const reordered = { input, entityId: f.entityId, scope: 'local' };
  assert.deepEqual(await f.service.applyLoreAnalysis(f.uid, { ...f.input, changes: [reordered] }), {
    applied: 1,
    credits: 4,
  });
  assert.deepEqual(await apply(f), { applied: 1, credits: 4 });
});

test('legacy applied receipt remains confirmable after a later cancellation fence and source revocation', async () => {
  const { analysisApplicationFixture } =
    await import('./helpers/loreAnalysisApplicationFixture.mjs');
  const d = adventureImportDb({ nativeUpdates: true }),
    f = { ...d, ...(await analysisApplicationFixture(d.db, { mode: 'inline' })) },
    result = await apply(f);
  assert.equal(
    Object.hasOwn(f.records.get('users/author/loreAnalyses/' + f.input.id), 'application'),
    false,
  );
  assert.equal((await f.cancel()).phase, 'cancelled');
  await f.db.runTransaction(async (tx) => tx.update(f.db.doc('books/book'), { authorId: 'other' }));
  const before = all(f);
  assert.deepEqual(await apply(f), result);
  assert.deepEqual(all(f), before);
});
test('future global timestamp determines the common local/global/credit timestamp', async () => {
  const f = await setup({ globals: true, changes: mixed });
  await prepareApplication(f);
  await f.db.runTransaction(async (tx) =>
    tx.update(f.db.doc('universes/world'), { updatedAt: 9000 }),
  );
  await apply(f);
  const r = f.records.get(f.path + '/applied/current');
  assert.equal(r.timestamp, 9001);
  assert.equal((await f.read()).data.updatedAt, 9001);
  for (const path of [
    'books/book',
    'universes/world',
    'universes/world/lore/global',
    'users/author',
  ])
    assert.equal(f.records.get(path).updatedAt, 9001, path);
});
