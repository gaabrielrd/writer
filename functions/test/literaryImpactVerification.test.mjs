import test from 'node:test';
import assert from 'node:assert/strict';
import { studioDb } from './helpers/studioDb.mjs';
import { workScope, workProject, digest, readWorkMetadata } from '../src/workProgressContracts.mjs';
import { createLiteraryReferenceReader } from '../src/literaryReferences.mjs';
import { createLiteraryImpactSourceVerifier } from '../src/literaryImpactVerification.mjs';
const target = { kind: 'book', id: 'book' };
const node = (kind, id, scopeId = 'book') => ({
  kind,
  id,
  scopeKind: kind === 'globalLore' ? 'universe' : 'book',
  scopeId,
});
const edge = (from, capture, relation = 'source') => ({
  from,
  to: node('review', 'r'),
  relation,
  record: { collection: 'literaryPlans', id: 'p' },
  capture,
});
function fixture() {
  const f = studioDb();
  f.records.set('books/book', { authorId: 'author', updatedAt: 1, universeId: 'world' });
  f.records.set('books/book/chapters/c', {
    bookId: 'book',
    title: 'PRIVATE TITLE',
    content: 'PRIVATE PROSE',
    updatedAt: 1,
  });
  f.records.set('universes/world', { authorId: 'author' });
  f.records.set('universes/world/lore/e', {
    name: 'PRIVATE NAME',
    details: 'PRIVATE DETAILS',
    updatedAt: 1,
  });
  const c = workScope(f.db, 'author', { target }, []);
  const verify = (link) =>
    f.db.runTransaction(async (tx) =>
      (await createLiteraryImpactSourceVerifier(tx, c, { bookId: 'book' }))(link),
    );
  const reference = async (kind = 'chapter', id = 'c', purpose = 'source') =>
    f.db.runTransaction(async (tx) => {
      const root = await workProject(tx, c),
        read = await createLiteraryReferenceReader(tx, c, root);
      const scopeId = kind === 'globalLore' ? 'world' : 'book',
        actual = await read({ kind, id, scopeId, purpose });
      return edge(
        node(kind, id, scopeId),
        {
          scheme: 'reference',
          originToken: actual.reference.sourceToken,
          identityToken: actual.identityToken,
          versionToken:
            purpose === 'subject' && ['act', 'chapter', 'scene'].includes(kind)
              ? actual.identityToken
              : actual.versionToken,
          revision: actual.reference.revision,
        },
        purpose === 'subject' ? 'subject' : 'source',
      );
    });
  return { ...f, c, verify, reference };
}
test('identity/version verification does not read manuscript or confer whole-unit coverage', async () => {
  const f = fixture(),
    link = await f.reference(),
    value = await f.verify(link);
  assert.equal(value.status, 'current');
  assert.equal(value.sourceIdentityVerified, true);
  assert.equal(value.manuscriptRead, false);
  assert.equal(value.wholeUnitRead, false);
  assert.equal(JSON.stringify(value).includes('PRIVATE'), false);
  assert.ok(
    f.metadataReads
      .filter((row) => row.path.includes('/chapters/'))
      .every((row) => !row.fields.includes('content')),
  );
});
test('source text metadata changes preserve identity but require version review; subject intent stays identity-bound', async () => {
  const f = fixture(),
    source = await f.reference(),
    subject = await f.reference('chapter', 'c', 'subject');
  await f.db.runTransaction(async (tx) => {
    await tx.get(f.db.doc('books/book/chapters/c'));
    tx.update(f.db.doc('books/book/chapters/c'), { content: 'Changed prose' });
  });
  const value = await f.verify(source);
  assert.equal(value.status, 'changed');
  assert.equal(value.sourceIdentityVerified, true);
  assert.equal(value.versionMatches, false);
  assert.equal((await f.verify(subject)).status, 'current');
});
test('same ID and fields after native recreation do not authorize the old captured identity', async () => {
  const f = fixture(),
    link = await f.reference();
  f.metadata.set('books/book/chapters/c', { createdAt: 500, updatedAt: 500 });
  const value = await f.verify(link);
  assert.equal(value.status, 'recreated');
  assert.equal(value.sourceIdentityVerified, false);
});
test('revoked global access yields unavailable without private fields or historical response access', async () => {
  const f = fixture(),
    link = await f.reference('globalLore', 'e');
  f.records.set('universes/world', { authorId: 'other' });
  const value = await f.verify(link);
  assert.equal(value.status, 'unavailable');
  assert.equal(value.sourceIdentityVerified, false);
  assert.equal(JSON.stringify(value).includes('PRIVATE'), false);
});
test('writing-plan identities include native birth and cannot be replaced by revision equality', async () => {
  const f = fixture();
  f.records.set('books/book/literaryPlans/p', {
    revision: 1,
    plan: { title: 'PRIVATE', fields: { body: 'PRIVATE' } },
  });
  const identity = await f.db.runTransaction(async (tx) => {
    const book = await readWorkMetadata(tx, f.c.ref, []),
      row = await readWorkMetadata(tx, f.db.doc('books/book/literaryPlans/p'), ['revision']);
    const stamp = (snapshot) => [snapshot.createTime.seconds, snapshot.createTime.nanoseconds];
    const bookToken = digest({
      domain: 'literary-writing-book-v1',
      uid: 'author',
      target,
      birth: stamp(book),
    });
    return digest({
      domain: 'literary-plan-identity-v1',
      uid: 'author',
      bookToken,
      id: 'p',
      birth: stamp(row),
    });
  });
  const link = edge(node('plan', 'p'), {
    scheme: 'writing-plan',
    originToken: null,
    identityToken: identity,
    versionToken: null,
    revision: 1,
  });
  assert.equal((await f.verify(link)).status, 'current');
  f.metadata.set('books/book/literaryPlans/p', { createdAt: 1000, updatedAt: 1000 });
  assert.equal((await f.verify(link)).status, 'recreated');
});
test('unknown, history and content formats are not accidentally compared as native reference versions', async () => {
  const f = fixture(),
    original = await f.reference();
  for (const scheme of ['unknown', 'history-source', 'content-hash', 'finding-target']) {
    const value = await f.verify({ ...original, capture: { ...original.capture, scheme } });
    assert.equal(value.status, 'unverified');
    assert.equal(value.sourceIdentityVerified, false);
  }
  const noScheme = { ...original, capture: { ...original.capture } };
  delete noScheme.capture.scheme;
  assert.equal((await f.verify(noScheme)).status, 'unverified');
});
