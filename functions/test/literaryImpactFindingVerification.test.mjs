import { literaryArchitectureTargetId } from '../src/literaryArchitectureProtocol.mjs';
import { createLiteraryImpactLinks } from '../src/literaryImpactLinks.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { studioDb } from './helpers/studioDb.mjs';
import { workScope, readWorkMetadata, digest } from '../src/workProgressContracts.mjs';
import { readLiteraryFindingTarget } from '../src/literaryFindingTargets.mjs';
import { createLiteraryImpactSourceVerifier } from '../src/literaryImpactVerification.mjs';
import { literaryProseOriginToken, literaryNativeBirth } from '../src/literarySourceOrigins.mjs';
const target = { kind: 'book', id: 'book' };
const node = (kind, id) => ({ kind, id, scopeKind: 'book', scopeId: 'book' });
function fixture() {
  const f = studioDb();
  f.records.set('books/book', { authorId: 'author', updatedAt: 10 });
  f.records.set('books/book/chapters/c', {
    bookId: 'book',
    content: '<p>PRIVATE PROSE</p>',
    updatedAt: 1,
  });
  f.records.set('books/book/literaryPlans/p', {
    revision: 1,
    plan: {
      kind: 'bookOverview',
      title: 'PRIVATE TITLE',
      fields: { question: 'PRIVATE NOTE' },
      references: [],
    },
  });
  const c = workScope(f.db, 'author', { target }, []);
  const verify = (link) =>
    f.db.runTransaction(async (tx) =>
      (await createLiteraryImpactSourceVerifier(tx, c, { bookId: 'book' }))(link),
    );
  const capture = (kind, id) =>
    f.db.runTransaction(async (tx) => {
      const native = await readLiteraryFindingTarget(tx, c, { kind, id, scopeId: 'book' });
      return {
        from: node(kind, id),
        to: node('finding', 'f'),
        relation: 'target',
        record: { collection: 'literaryFindingDecisions', id: 'f' },
        capture: {
          scheme: 'finding-target',
          originToken: null,
          identityToken: native.identityToken,
          versionToken: native.versionToken,
          revision: native.revision,
        },
      };
    });
  return { ...f, c, verify, capture };
}
test('finding target checks identity/version without declaring a saved or approved correction', async () => {
  const f = fixture(),
    edge = await f.capture('chapter', 'c'),
    value = await f.verify(edge);
  assert.equal(value.status, 'current');
  assert.equal(value.sourceIdentityVerified, true);
  assert.equal(value.manuscriptRead, false);
  assert.equal(value.editorialReview, false);
  assert.equal('correctionConfirmed' in value, false);
  assert.equal('authorAccepted' in value, false);
});
test('editorial target content hash and native birth remain separate proofs', async () => {
  const f = fixture(),
    edge = await f.capture('plan', 'p');
  const first = await f.verify(edge);
  assert.equal(first.status, 'current');
  assert.equal(first.contentVerification, 'editorial-hash');
  assert.equal(JSON.stringify(first).includes('PRIVATE'), false);
  await f.db.runTransaction(async (tx) => {
    await tx.get(f.db.doc('books/book/literaryPlans/p'));
    tx.update(f.db.doc('books/book/literaryPlans/p'), {
      revision: 2,
      plan: { kind: 'bookOverview', title: 'PRIVATE NEW', fields: {}, references: [] },
    });
  });
  const changed = await f.verify(edge);
  assert.equal(changed.status, 'changed');
  assert.equal(changed.sourceIdentityVerified, true);
  f.metadata.set('books/book/literaryPlans/p', { createdAt: 1000, updatedAt: 1000 });
  const recreated = await f.verify(edge);
  assert.equal(recreated.status, 'recreated');
  assert.equal(recreated.contentVerification, undefined);
});
test('same hash/revision without captured target identity does not authorize reading an editorial body', async () => {
  const f = fixture(),
    edge = await f.capture('plan', 'p');
  edge.capture.identityToken = null;
  const value = await f.verify(edge);
  assert.equal(value.status, 'unverified');
  assert.equal(value.sourceIdentityVerified, false);
  assert.equal(value.contentVerification, undefined);
});
test('shared native prose identity preserves the original token format', async () => {
  const f = fixture();
  f.records.set('books/book/scenes/s', { ownerId: 'author' });
  await f.db.runTransaction(async (tx) => {
    const book = await readWorkMetadata(tx, f.c.ref, []),
      chapter = await readWorkMetadata(tx, f.db.doc('books/book/chapters/c'), []);
    const scene = await readWorkMetadata(tx, f.db.doc('books/book/scenes/s'), []);
    const previous = digest({
      domain: 'literary-prose-origin-v1',
      uid: 'author',
      target,
      book: literaryNativeBirth(book),
      chapter: { id: 'c', birth: literaryNativeBirth(chapter) },
      scene: { id: 's', birth: literaryNativeBirth(scene) },
    });
    assert.equal(
      literaryProseOriginToken(f.c, { book, chapterId: 'c', chapter, sceneId: 's', scene }),
      previous,
    );
  });
});

test('structural targets and integration links preserve architecture proof without treating a manuscript edit as a structural correction', async () => {
  const f = fixture();
  const id = literaryArchitectureTargetId({ kind: 'chapter', id: 'c', arcId: null });
  const edge = await f.capture('architecture', id);
  assert.equal((await f.verify(edge)).status, 'current');
  const graph = createLiteraryImpactLinks({ bookId: 'book' });
  const edges = graph.finding({
    id: 'f',
    source: { jobId: 'audit' },
    target: { kind: 'architecture', id, scopeId: 'book' },
    baseline: edge.capture,
  });
  assert.equal(edges.find((x) => x.relation === 'target').from.kind, 'architecture');
  assert.ok(
    edges.some(
      (x) =>
        x.from.kind === 'chapter' && x.to.kind === 'architecture' && x.relation === 'composition',
    ),
  );
  const registered = graph.integrationSource({
    id: 'source-link',
    jobId: 'audit',
    target: { kind: 'architecture', id, scopeId: 'book' },
    scheme: 'architecture-source',
    ...Object.fromEntries(Object.entries(edge.capture).filter(([k]) => k !== 'scheme')),
  })[0];
  assert.equal((await f.verify(registered)).status, 'current');
  await f.db.runTransaction(async (tx) =>
    tx.update(f.db.doc('books/book/chapters/c'), {
      content: '<p>Changed prose only</p>',
      updatedAt: 2,
    }),
  );
  const changed = await f.verify(edge);
  assert.equal(changed.status, 'changed');
  assert.equal(changed.manuscriptRead, false);
  assert.equal(changed.editorialReview, false);
  assert.equal(JSON.stringify(changed).includes('PRIVATE PROSE'), false);
  await f.db.runTransaction(async (tx) => tx.delete(f.db.doc('books/book/chapters/c')));
  assert.equal((await f.verify(edge)).status, 'unavailable');
  await f.db.runTransaction(async (tx) =>
    tx.create(f.db.doc('books/book/chapters/c'), { bookId: 'book', title: 'Same ID' }),
  );
  assert.equal((await f.verify(edge)).status, 'recreated');
});
test('structural composite identities reject malformed and cross-domain encodings', async () => {
  const f = fixture();
  for (const id of [
    'chapter',
    'x'.repeat(20001),
    '["chapter",null,"c","extra"]',
    '["chapter","arc","c"]',
    '["arcMilestone",null,"m"]',
    '["localLore",null,"secret"]',
    '["chapter",null,"../secret"]',
  ]) {
    await assert.rejects(f.capture('architecture', id), { code: 'invalid-argument' });
  }
  const valid = await f.capture(
    'architecture',
    literaryArchitectureTargetId({ kind: 'chapter', id: 'c', arcId: null }),
  );
  await assert.rejects(f.verify({ ...valid, from: { ...valid.from, scopeId: 'foreign-book' } }), {
    code: 'permission-denied',
  });
});
