import test from 'node:test';
import assert from 'node:assert/strict';
import { studioDb } from './helpers/studioDb.mjs';
import { createLiteraryImpactGraphStore } from '../src/literaryImpactGraph.mjs';
import { workScope, digest } from '../src/workProgressContracts.mjs';
const target = { kind: 'book', id: 'book' },
  jobId = 'impact-graph-one';
const sourceFence = 'a'.repeat(64),
  changedFence = 'b'.repeat(64);
const inventory = { scopeKind: 'book', scopeId: 'book', collection: 'literaryPlans' };
const census = [
  { inventory, scanComplete: true, verified: true, records: 0, unavailable: 0, unsupported: 0 },
];
const node = (kind, id, scopeId = 'book') => ({
  kind,
  id,
  scopeKind: kind === 'globalLore' ? 'universe' : 'book',
  scopeId,
});
const link = (from, to, id, relation = 'source') => ({
  from,
  to,
  relation,
  record: { collection: 'literaryPlans', id },
  capture: null,
});
function fixture() {
  const f = studioDb();
  f.records.set('books/book', { authorId: 'author', updatedAt: 10, impactTestFence: sourceFence });
  const c = workScope(f.db, 'author', { target }, []);
  const readFence = async (tx, context) => (await tx.get(context.ref)).data().impactTestFence;
  const create = () => createLiteraryImpactGraphStore({ db: f.db, readFence });
  const api = create();
  const call = (method, data = {}) =>
    f.db.runTransaction((tx) => api[method](tx, c, { jobId, ...data }));
  const init = (extra = {}) =>
    call('initialize', {
      bookIds: ['book'],
      sourceFence,
      inventories: [inventory],
      sources: [node('scene', 'source')],
      ...extra,
    });
  return { ...f, c, create, api, call, init };
}
async function traverse(f) {
  for (let step = 0; step < 100; step++) {
    const state = await f.call('advance');
    if (state.state === 'traversed') return state;
  }
  throw new Error('The fixture graph did not finish');
}
test('graph inventory and closure are separate, with a final census before completion', async () => {
  const f = fixture(),
    initial = await f.init();
  assert.equal(initial.state, 'collecting');
  assert.equal(initial.nodes, 1);
  await assert.rejects(f.call('advance'), { code: 'failed-precondition' });
  await f.call('append', {
    links: [
      link(node('scene', 'source'), node('chapter', 'chapter'), 'one', 'composition'),
      link(node('chapter', 'chapter'), node('integration', 'report'), 'two'),
    ],
  });
  await assert.rejects(f.call('seal', { census: [] }), { code: 'failed-precondition' });
  await f.call('seal', { census });
  await assert.rejects(f.call('append', { links: [] }), { code: 'failed-precondition' });
  const traversed = await traverse(f);
  assert.equal(traversed.visits, 3);
  assert.equal(traversed.completedVisits, 3);
  assert.equal(traversed.state, 'traversed');
  assert.equal(traversed.publicationReady, false);
  await assert.rejects(f.call('finish', { census: [{ ...census[0], verified: false }] }), {
    code: 'failed-precondition',
  });
  const final = await f.call('finish', { census });
  assert.equal(final.state, 'done');
  assert.equal(final.witnesses, 2);
  assert.equal(final.semanticCompleteness, false);
  assert.equal(final.publicationReady, false);
  assert.deepEqual(await f.call('finish', { census }), final);
});
test('inventory-page replay is idempotent and cyclic associations terminate with all witnesses', async () => {
  const f = fixture();
  await f.init();
  const edges = [
    link(node('scene', 'source'), node('plan', 'plan'), 'one', 'subject'),
    link(node('plan', 'plan'), node('scene', 'source'), 'two', 'subject'),
  ];
  const first = await f.call('append', { links: edges });
  assert.deepEqual(await f.call('append', { links: edges }), first);
  assert.equal(first.nodes, 2);
  assert.equal(first.links, 2);
  await f.call('seal', { census });
  const result = await traverse(f);
  assert.equal(result.visits, 3);
  assert.equal(result.witnesses, 3);
  assert.equal(result.completedVisits, result.visits);
});
test('bounded adjacency pages survive process reconstruction without losing the 33rd edge', async () => {
  const f = fixture();
  await f.init();
  const edges = Array.from({ length: 33 }, (_, index) =>
    link(node('scene', 'source'), node('review', 'r' + index), 'l' + index),
  );
  await f.call('append', { links: edges.slice(0, 32) });
  await f.call('append', { links: edges.slice(32) });
  await f.call('seal', { census });
  const first = await f.call('advance');
  assert.equal(first.completedVisits, 0);
  assert.equal(first.witnesses, 32);
  const persisted = f.records.get('books/book/literaryImpactJobs/' + jobId);
  assert.ok(persisted.activeVisitId);
  const newProcess = f.create();
  const resumed = await f.db.runTransaction((tx) => newProcess.advance(tx, f.c, { jobId }));
  assert.equal(resumed.witnesses, 33);
  assert.equal(resumed.completedVisits, 1);
  const result = await traverse(f);
  assert.equal(result.visits, 34);
  assert.equal(result.witnesses, 33);
  for (const read of f.reads) if (read.collectionPath) assert.ok(read.maximum <= 32);
});
test('a changed topology fence stales the graph before another link or traversal can commit', async () => {
  const f = fixture();
  await f.init();
  f.records.set('books/book', { ...f.records.get('books/book'), impactTestFence: changedFence });
  const before = f.records.size;
  const result = await f.call('append', {
    links: [link(node('scene', 'source'), node('review', 'r'), 'one')],
  });
  assert.equal(result.state, 'stale');
  assert.equal(result.inventoryComplete, false);
  assert.equal(f.records.size, before);
  assert.equal(
    [...f.records.values()].some((row) => row.record?.id === 'one'),
    false,
  );
});
test('cancellation freezes metadata collection and never mutates manuscript or credits', async () => {
  const f = fixture();
  f.records.set('users/author', { credits: 8 });
  await f.init();
  const canceled = await f.call('cancel');
  assert.equal(canceled.state, 'canceled');
  assert.deepEqual(
    await f.call('append', { links: [link(node('scene', 'source'), node('review', 'r'), 'one')] }),
    canceled,
  );
  assert.equal(f.records.get('users/author').credits, 8);
  assert.equal(f.records.get('books/book').updatedAt, 10);
});
test('cross-volume and global-source graphs reauthorize every origin on each step', async () => {
  const f = fixture();
  f.records.set('books/book', { ...f.records.get('books/book'), universeId: 'world' });
  f.records.set('books/second', { authorId: 'author', updatedAt: 10 });
  f.records.set('universes/world', { authorId: 'author' });
  await f.init({ bookIds: ['book', 'second'], universeId: 'world' });
  await f.call('append', {
    links: [link(node('globalLore', 'e', 'world'), node('chapter', 'c', 'second'), 'shared')],
  });
  f.records.set('books/second', { authorId: 'other', updatedAt: 10 });
  await assert.rejects(f.call('seal', { census }), { code: 'permission-denied' });
  f.records.set('books/second', { authorId: 'author', updatedAt: 10 });
  f.records.set('universes/world', { authorId: 'other' });
  await assert.rejects(f.call('seal', { census }), { code: 'permission-denied' });
});
test('other scopes and operation-ID reuse are rejected before graph records are added', async () => {
  const f = fixture();
  await f.init();
  await assert.rejects(
    f.call('append', {
      links: [link(node('scene', 'source'), node('review', 'r', 'foreign'), 'one')],
    }),
    { code: 'permission-denied' },
  );
  await assert.rejects(f.init({ sources: [node('chapter', 'different')] }), {
    code: 'invalid-argument',
  });
  assert.equal(f.records.get('books/book/literaryImpactJobs/' + jobId).links, 0);
  assert.throws(() => createLiteraryImpactGraphStore({ db: f.db }), TypeError);
});
test('long locator keys use fixed-width digests in Firestore query fields', async () => {
  const f = fixture();
  await f.init();
  const source = node('plan', 'x'.repeat(1400));
  await f.call('append', { links: [link(source, node('review', 'r'), 'one')] });
  const row = [...f.records.entries()].find(([path]) =>
    path.startsWith('books/book/literaryImpactLinks/'),
  )[1];
  assert.match(row.fromKey, /^[a-f0-9]{64}$/);
  assert.equal(row.fromKey, digest(JSON.stringify(['book', 'book', 'plan', 'x'.repeat(1400)])));
});

test('graph scope includes and reauthorizes the distinct universes of all selected volumes', async () => {
  const f = fixture();
  f.records.set('books/book', { ...f.records.get('books/book'), universeId: 'first-world' });
  f.records.set('books/second', { authorId: 'author', updatedAt: 10, universeId: 'second-world' });
  f.records.set('universes/first-world', { authorId: 'author' });
  f.records.set('universes/second-world', { authorId: 'author' });
  await f.init({
    bookIds: ['book', 'second'],
    universeId: 'first-world',
    sources: [node('globalLore', 'entity', 'second-world')],
  });
  assert.deepEqual(f.records.get('books/book/literaryImpactJobs/' + jobId).universeIds, [
    'first-world',
    'second-world',
  ]);
  const edge = link(
    node('globalLore', 'entity', 'second-world'),
    node('chapter', 'c', 'second'),
    'second-world-edge',
  );
  assert.equal((await f.call('append', { links: [edge] })).links, 1);
  f.records.set('universes/second-world', { authorId: 'other' });
  await assert.rejects(f.call('append', { links: [] }), { code: 'permission-denied' });
});

test('explicit partial traversal preserves coverage gaps but never permits a missing scan or verification', async () => {
  const f = fixture();
  await f.init();
  const gap = [{ ...census[0], unsupported: 1 }];
  await assert.rejects(
    f.call('seal', { census: [{ ...gap[0], verified: false }], allowIncomplete: true }),
    { code: 'failed-precondition' },
  );
  const sealed = await f.call('seal', { census: gap, allowIncomplete: true });
  assert.equal(sealed.inventoryComplete, false);
  await traverse(f);
  const finished = await f.call('finish', { census: gap, allowIncomplete: true });
  assert.equal(finished.state, 'done');
  assert.equal(finished.inventoryComplete, false);
  assert.equal(finished.publicationReady, false);
});
