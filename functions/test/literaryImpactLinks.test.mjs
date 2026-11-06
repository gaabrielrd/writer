import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiteraryImpactLinks } from '../src/literaryImpactLinks.mjs';
const graph = () => createLiteraryImpactLinks({ bookId: 'book', universeId: 'world' });
const hash = 'a'.repeat(64);
const ref = (purpose = 'source', kind = 'scene', scopeId = 'book') => ({
  kind,
  id: 'one',
  scopeId,
  sourceToken: hash,
  revision: 3,
  purpose,
});
function manifest() {
  return {
    version: 1,
    target: { kind: 'book', id: 'book' },
    resource: { kind: 'chapter', id: 'chapter' },
    bookToken: hash,
    selection: 'explicit',
    contractRevision: 2,
    planIds: ['plan'],
    plans: [{ id: 'plan', identityToken: hash, revision: 3 }],
    references: [
      { reference: ref(), identityToken: hash, versionToken: 'b'.repeat(64) },
      { reference: ref('subject', 'chapter'), identityToken: hash, versionToken: 'c'.repeat(64) },
    ],
  };
}
test('only active scene composition enters chapter propagation; chapter order also affects its book', () => {
  const g = graph(),
    scene = {
      collection: 'scenes',
      id: 's',
      data: { parentId: 'c', parentActive: true, archived: false },
    };
  assert.equal(g.structural(scene)[0].relation, 'composition');
  for (const patch of [
    { archived: true },
    { deleting: true },
    { parentActive: false },
    { parentActive: undefined },
    { parentId: null },
  ])
    assert.deepEqual(g.structural({ ...scene, data: { ...scene.data, ...patch } }), []);
  const chapter = g.structural({ collection: 'chapters', id: 'c', data: { actId: 'a' } });
  assert.deepEqual(
    chapter.map((row) => row.to.kind),
    ['book', 'act'],
  );
  assert.deepEqual(g.structural({ collection: 'chapters', id: 'c', data: { deleting: true } }), []);
});
test('plan subject links are review associations in both directions, actual sources remain dependencies', () => {
  const g = graph(),
    links = g.plan({
      id: 'p',
      revision: 5,
      plan: { references: [ref(), ref('subject', 'chapter')] },
    });
  assert.equal(links.length, 3);
  assert.equal(links.find((row) => row.from.kind === 'scene').relation, 'source');
  assert.equal(links.find((row) => row.to.kind === 'chapter').relation, 'subject');
  assert.equal(links.find((row) => row.from.kind === 'chapter').relation, 'subject');
  assert.ok(links.every((row) => !Object.hasOwn(row, 'text')));
});
test('manifest extraction includes real captured identities, editorial revisions, and target association', () => {
  const g = graph(),
    links = g.manifest({
      collection: 'literaryProseRequests',
      id: 'r',
      consumer: g.node('prose', 'r'),
      manifest: manifest(),
    });
  assert.equal(links.length, 5);
  const contract = links.find((row) => row.from.kind === 'contract');
  assert.equal(contract.capture.revision, 2);
  const plan = links.find((row) => row.from.kind === 'plan');
  assert.equal(plan.capture.identityToken, hash);
  const scene = links.find((row) => row.from.kind === 'scene');
  assert.equal(scene.relation, 'source');
  assert.equal(scene.capture.versionToken, 'b'.repeat(64));
  const target = links.find((row) => row.from.id === 'chapter');
  assert.equal(target.relation, 'subject');
  assert.equal(target.capture, null);
});
test('another book or universe cannot acquire edges through a same-named ID', () => {
  const g = graph();
  assert.throws(
    () =>
      g.plan({
        id: 'p',
        revision: 1,
        plan: { references: [ref('source', 'chapter', 'another-book')] },
      }),
    TypeError,
  );
  assert.throws(
    () =>
      g.plan({
        id: 'p',
        revision: 1,
        plan: { references: [ref('source', 'globalLore', 'another-world')] },
      }),
    TypeError,
  );
  assert.throws(
    () =>
      createLiteraryImpactLinks({ bookId: 'book' }).plan({
        id: 'p',
        revision: 1,
        plan: { references: [{ ...ref('source', 'globalLore'), scopeId: null }] },
      }),
    TypeError,
  );
  const other = manifest();
  other.target.id = 'another-book';
  assert.throws(
    () =>
      g.manifest({
        collection: 'requests',
        id: 'r',
        consumer: g.node('review', 'r'),
        manifest: other,
      }),
    TypeError,
  );
});
test('native lore links retain their native scope and imply association, not complete source reading', () => {
  const g = graph(),
    local = g.nativeLore({
      id: 'l',
      sceneId: 's',
      reference: { kind: 'book', scopeId: 'book', entityId: 'e' },
    });
  const global = g.nativeLore({
    id: 'g',
    sceneId: 's',
    reference: { kind: 'universe', scopeId: 'world', entityId: 'e' },
  });
  assert.equal(local[0].from.kind, 'localLore');
  assert.equal(global[0].from.kind, 'globalLore');
  assert.equal(local[0].relation, 'narrative');
  assert.equal(global[0].relation, 'narrative');
  assert.throws(
    () =>
      g.nativeLore({
        id: 'l',
        sceneId: 's',
        reference: { kind: 'adventure', scopeId: 'book', entityId: 'e' },
      }),
    TypeError,
  );
});
test('integration registered source and manuscript-unit links remain separate witnesses', () => {
  const g = graph();
  const source = g.integrationSource({
    id: 'l',
    jobId: 'j',
    target: { kind: 'globalLore', id: 'e', scopeId: 'world' },
    versionToken: hash,
  })[0];
  assert.equal(source.to.kind, 'integration');
  assert.equal(source.capture.versionToken, hash);
  const unit = g.integrationUnit({ id: 'u', jobId: 'j', resource: { kind: 'scene', id: 's' } })[0];
  assert.equal(unit.from.kind, 'scene');
  assert.equal(unit.relation, 'source');
  assert.throws(
    () => g.integrationUnit({ id: 'u', jobId: 'j', resource: { kind: 'plan', id: 'p' } }),
    TypeError,
  );
});

test('native narrative links propagate only association and preserve arc-scoped milestone identity', () => {
  const g = graph(),
    record = {
      id: 'l',
      source: { kind: 'milestone', arcId: 'arc', id: 'm' },
      reference: { kind: 'scene', sceneId: 's' },
    };
  const links = g.narrative(record);
  assert.equal(links.length, 2);
  assert.ok(links.every((row) => row.relation === 'narrative'));
  assert.equal(links[0].from.kind, 'arcMilestone');
  const other = g.narrative({ ...record, source: { ...record.source, arcId: 'other-arc' } });
  assert.notEqual(links[0].from.id, other[0].from.id);
  const event = g.narrative({
    id: 'e',
    source: { kind: 'arc', id: 'a' },
    reference: { kind: 'event', eventId: 'e' },
  });
  assert.equal(event[0].to.kind, 'event');
});
test('chapter artifacts distinguish preparation, preservation and selected planning sources', () => {
  const g = graph();
  const draft = g.chapterArtifact({
    collection: 'literaryDraftJobs',
    id: 'd',
    kind: 'draft',
    chapterId: 'c',
    planIds: ['p'],
  });
  assert.deepEqual(
    draft.map((row) => row.from.kind),
    ['chapter', 'plan', 'preparation'],
  );
  const preserved = g.chapterArtifact({
    collection: 'literaryMilestones',
    id: 'm',
    kind: 'milestone',
    chapterId: 'c',
  });
  assert.equal(preserved[0].relation, 'preserves');
  assert.throws(
    () => g.chapterArtifact({ collection: 'jobs', id: 'd', kind: 'approved', chapterId: 'c' }),
    TypeError,
  );
});
test('finding dependencies keep target association separate from an attested successor', () => {
  const g = graph(),
    links = g.finding({
      id: 'f',
      source: { jobId: 'original' },
      target: { kind: 'chapter', id: 'c', scopeId: 'book' },
      baseline: { identityToken: hash, versionToken: 'b'.repeat(64), revision: 2 },
      correction: { successorJobId: 'successor' },
    });
  assert.equal(links.length, 3);
  assert.equal(links.find((row) => row.from.kind === 'chapter').relation, 'target');
  assert.deepEqual(
    links.filter((row) => row.from.kind === 'integration').map((row) => row.from.id),
    ['original', 'successor'],
  );
});
test('a plan source preserves its native origin token rather than matching only ID and revision', () => {
  const g = graph(),
    first = g.plan({ id: 'p', revision: 5, plan: { references: [ref()] } })[0];
  assert.equal(first.capture.originToken, hash);
  assert.equal(first.capture.identityToken, null);
  const second = g.plan({
    id: 'p',
    revision: 5,
    plan: { references: [{ ...ref(), sourceToken: 'b'.repeat(64) }] },
  })[0];
  assert.notDeepEqual(first.capture, second.capture);
});
