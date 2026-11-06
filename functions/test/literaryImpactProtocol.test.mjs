import test from 'node:test';
import assert from 'node:assert/strict';
import {
  literaryImpactNodeKey,
  literaryImpactLinkKey,
  literaryImpactVisitKey,
  advanceLiteraryImpactVisit,
  literaryImpactCoverage,
  normalizeLiteraryImpactLink,
} from '../src/literaryImpactProtocol.mjs';
const node = (kind, id, scopeId = 'volume-one') => ({
  kind,
  id,
  scopeKind: kind === 'globalLore' ? 'universe' : 'book',
  scopeId,
});
const link = (from, to, relation = 'source', id = 'edge') => ({
  from,
  to,
  relation,
  record: { collection: 'testLinks', id },
  capture: null,
});
const visit = (current, source = current, effect = 'changed', depth = 0) => ({
  node: current,
  source,
  effect,
  depth,
});
const hash = 'a'.repeat(64);
test('impact locators distinguish volume, domain, homonym, and delimiter-like IDs', () => {
  const values = [
    node('chapter', '30'),
    node('chapter', '30', 'volume-two'),
    node('localLore', '30'),
    node('globalLore', '30', 'world'),
    node('plan', 'a:b'),
    node('plan', 'b:a'),
  ];
  assert.equal(new Set(values.map(literaryImpactNodeKey)).size, values.length);
  assert.throws(
    () => literaryImpactNodeKey({ ...node('chapter', '30'), scopeKind: 'universe' }),
    TypeError,
  );
  assert.throws(
    () => literaryImpactNodeKey({ ...node('globalLore', '30'), scopeKind: 'book' }),
    TypeError,
  );
});
test('transitive source/composition traversal retains the actual initiating change', () => {
  const scene = node('scene', 's'),
    chapter = node('chapter', 'c'),
    act = node('act', 'a'),
    integration = node('integration', 'i');
  let [step] = advanceLiteraryImpactVisit(visit(scene), [link(scene, chapter, 'composition')]);
  assert.equal(step.visit.effect, 'dependency-check');
  [step] = advanceLiteraryImpactVisit(step.visit, [link(chapter, act, 'composition')]);
  [step] = advanceLiteraryImpactVisit(step.visit, [link(act, integration)]);
  assert.deepEqual(step.visit.source, scene);
  assert.deepEqual(step.visit.node, integration);
  assert.equal(step.visit.depth, 3);
  assert.equal(step.visit.effect, 'dependency-check');
});
test('subject associations never become proof of consumed prose downstream', () => {
  const scene = node('scene', 's'),
    plan = node('plan', 'p'),
    gate = node('preparation', 'c'),
    integration = node('integration', 'i');
  const [a] = advanceLiteraryImpactVisit(visit(scene), [link(scene, plan, 'subject')]);
  const [b] = advanceLiteraryImpactVisit(a.visit, [link(plan, gate)]);
  const [c] = advanceLiteraryImpactVisit(b.visit, [link(gate, integration)]);
  assert.equal(c.visit.effect, 'association-check');
  const direct = advanceLiteraryImpactVisit(visit(plan), [link(plan, gate)])[0];
  assert.equal(direct.visit.effect, 'dependency-check');
  assert.notEqual(literaryImpactVisitKey(b.visit), literaryImpactVisitKey(direct.visit));
});
test('an immutable preserved version requires relevance review, without becoming overwritten or invalid', () => {
  const chapter = node('chapter', 'c'),
    milestone = node('milestone', 'first'),
    report = node('review', 'r');
  const [a] = advanceLiteraryImpactVisit(visit(chapter), [link(chapter, milestone, 'preserves')]);
  const [b] = advanceLiteraryImpactVisit(a.visit, [link(milestone, report)]);
  assert.equal(a.visit.effect, 'preservation-check');
  assert.equal(b.visit.effect, 'preservation-check');
});
test('cycles have finite durable visit keys; evidence from separate records is preserved', () => {
  const a = node('plan', 'a'),
    b = node('chapter', 'b'),
    c = node('review', 'c');
  const [first] = advanceLiteraryImpactVisit(visit(a), [link(a, b, 'subject')]);
  const [second] = advanceLiteraryImpactVisit(first.visit, [link(b, a, 'subject')]);
  const [third] = advanceLiteraryImpactVisit(second.visit, [link(a, b, 'subject')]);
  assert.equal(first.visitKey, third.visitKey);
  assert.notEqual(first.visit.depth, third.visit.depth);
  const edges = [link(b, c, 'source', 'one'), link(b, c, 'source', 'two')];
  const rows = advanceLiteraryImpactVisit(first.visit, [edges[0], edges[0], edges[1]]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].visitKey, rows[1].visitKey);
  assert.notEqual(rows[0].linkKey, rows[1].linkKey);
});
test('captured identities/versions are distinct witnesses, never equivalent by locator alone', () => {
  const from = node('scene', 's'),
    to = node('review', 'r'),
    a = link(from, to);
  a.capture = { originToken: null, identityToken: hash, versionToken: 'b'.repeat(64), revision: 1 };
  const b = structuredClone(a);
  b.capture.identityToken = 'c'.repeat(64);
  assert.notEqual(literaryImpactLinkKey(a), literaryImpactLinkKey(b));
  assert.throws(
    () => normalizeLiteraryImpactLink({ ...a, capture: { ...a.capture, authorized: true } }),
    TypeError,
  );
});
test('invalid adjacency, unsupported relations and oversized pages fail without dropping edges', () => {
  const a = node('plan', 'a'),
    b = node('chapter', 'b');
  assert.throws(() => advanceLiteraryImpactVisit(visit(a), [link(b, a)]), TypeError);
  assert.throws(() => advanceLiteraryImpactVisit(visit(a), [link(a, b, 'approved')]), TypeError);
  assert.throws(
    () =>
      advanceLiteraryImpactVisit(
        visit(a),
        Array.from({ length: 65 }, () => link(a, b)),
      ),
    TypeError,
  );
  assert.throws(
    () =>
      advanceLiteraryImpactVisit(
        { ...visit(a), depth: Number.MAX_SAFE_INTEGER, effect: 'dependency-check' },
        [link(a, b)],
      ),
    TypeError,
  );
  assert.throws(() => normalizeLiteraryImpactLink(link(a, a)), TypeError);
});
const inventories = [
  { scopeKind: 'book', scopeId: 'volume-one', collection: 'literaryPlans' },
  { scopeKind: 'book', scopeId: 'volume-two', collection: 'literaryPlans' },
  { scopeKind: 'universe', scopeId: 'world', collection: 'lore' },
];
const census = () =>
  inventories.map((inventory) => ({
    inventory,
    scanComplete: true,
    verified: true,
    records: 20,
    unavailable: 0,
    unsupported: 0,
  }));
test('coverage requires every registered inventory, verified completion and stable fences', () => {
  const all = census(),
    stable = { before: hash, after: hash };
  const result = literaryImpactCoverage(inventories, all, stable);
  assert.equal(result.complete, true);
  assert.equal(result.semanticCompleteness, false);
  assert.equal(result.authorAccepted, false);
  assert.equal(result.publicationReady, false);
  assert.equal(literaryImpactCoverage(inventories, all.slice(0, 2), stable).complete, false);
  for (const field of ['scanComplete', 'verified']) {
    const changed = census();
    changed[1][field] = false;
    assert.equal(literaryImpactCoverage(inventories, changed, stable).complete, false);
  }
  for (const field of ['unavailable', 'unsupported']) {
    const changed = census();
    changed[2][field] = 1;
    const value = literaryImpactCoverage(inventories, changed, stable);
    assert.equal(value.complete, false);
    assert.equal(value[field][0].count, 1);
  }
  const concurrent = literaryImpactCoverage(inventories, all, {
    before: hash,
    after: 'b'.repeat(64),
  });
  assert.equal(concurrent.complete, false);
  assert.equal(concurrent.concurrentChange, true);
});
test('duplicate or unexpected inventories cannot conceal an absent book', () => {
  const all = census(),
    stable = { before: hash, after: hash };
  assert.throws(() => literaryImpactCoverage(inventories, [all[0], all[0]], stable), TypeError);
  assert.throws(
    () => literaryImpactCoverage([inventories[0], inventories[0]], all.slice(0, 1), stable),
    TypeError,
  );
  assert.throws(
    () =>
      literaryImpactCoverage(
        inventories,
        [{ ...all[0], inventory: { ...inventories[0], scopeId: 'other' } }],
        stable,
      ),
    TypeError,
  );
});

test('proof formats remain distinct even when their hashes happen to be equal', () => {
  const from = node('scene', 's'),
    to = node('review', 'r'),
    base = link(from, to);
  base.capture = { originToken: null, identityToken: hash, versionToken: hash, revision: 1 };
  const reference = { ...base, capture: { ...base.capture, scheme: 'reference' } };
  const history = { ...base, capture: { ...base.capture, scheme: 'history-source' } };
  assert.equal(normalizeLiteraryImpactLink(base).capture.scheme, 'unknown');
  assert.notEqual(literaryImpactLinkKey(reference), literaryImpactLinkKey(history));
  assert.throws(
    () =>
      normalizeLiteraryImpactLink({ ...base, capture: { ...base.capture, scheme: 'authorized' } }),
    TypeError,
  );
});

test('persona bindings use their own domain and canonical scoped identity', () => {
  const book = {
    kind: 'personaBinding',
    id: JSON.stringify(['book', 'same']),
    scopeKind: 'book',
    scopeId: 'same',
  };
  const chapter = { ...book, id: JSON.stringify(['chapter', 'same']) };
  assert.notEqual(literaryImpactNodeKey(book), literaryImpactNodeKey(chapter));
  assert.notEqual(literaryImpactNodeKey(book), literaryImpactNodeKey(node('book', 'same', 'same')));
  assert.throws(
    () => literaryImpactNodeKey({ ...book, id: JSON.stringify(['scene', 'same']) }),
    TypeError,
  );
  assert.throws(() => literaryImpactNodeKey({ ...book, scopeKind: 'user' }), TypeError);
});
