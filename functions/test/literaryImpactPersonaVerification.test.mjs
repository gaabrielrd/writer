import test from 'node:test';
import assert from 'node:assert/strict';
import { studioDb } from './helpers/studioDb.mjs';
import { workScope } from '../src/workProgressContracts.mjs';
import { DEFAULT_PERSONAS } from '../src/personaProfile.mjs';
import { readLiteraryPersona } from '../src/literaryPersona.mjs';
import { createLiteraryImpactLinks } from '../src/literaryImpactLinks.mjs';
import { createLiteraryImpactSourceVerifier } from '../src/literaryImpactVerification.mjs';
import { readLiteraryImpactBookInventoryPage } from '../src/literaryImpactInventory.mjs';
const target = { kind: 'book', id: 'book' },
  resource = { kind: 'chapter', id: 'chapter' };
async function fixture() {
  const f = studioDb(),
    profile = {
      ...structuredClone(DEFAULT_PERSONAS[0]),
      id: 'custom-impact',
      name: 'PRIVATE NAME',
      instructions: 'PRIVATE INSTRUCTION',
      createdAt: 1,
      updatedAt: 1,
    };
  f.records.set('books/book', { authorId: 'author', updatedAt: 1, personaId: profile.id });
  f.records.set('books/book/chapters/chapter', {
    bookId: 'book',
    updatedAt: 1,
    personaComplement: null,
  });
  f.records.set('users/author/aiPersonas/' + profile.id, profile);
  const c = workScope(f.db, 'author', { target }, []);
  const persona = await f.db.runTransaction((tx) => readLiteraryPersona(tx, c, resource));
  const graph = createLiteraryImpactLinks({ bookId: 'book', ownerId: 'author' });
  const links = graph.persona({
    collection: 'literaryReviewJobs',
    id: 'r',
    consumer: graph.node('review', 'r'),
    dependencies: persona.dependencies,
  });
  const verify = (link) =>
    f.db.runTransaction(async (tx) =>
      (await createLiteraryImpactSourceVerifier(tx, c, { bookId: 'book' }))(link),
    );
  return { ...f, c, graph, persona, links, profile, verify };
}
test('persona profile and bindings are distinct source nodes with private, metadata-only proofs', async () => {
  const f = await fixture();
  assert.deepEqual(
    f.links.map((link) => link.from.kind),
    ['personaBinding', 'personaBinding', 'persona'],
  );
  for (const link of f.links) {
    const result = await f.verify(link);
    assert.equal(result.status, 'current');
    assert.equal(result.sourceIdentityVerified, true);
    assert.equal(result.manuscriptRead, false);
    assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
  }
  assert.ok(
    f.metadataReads
      .filter((row) => row.path.includes('/aiPersonas/'))
      .every(
        (row) => !row.fields.some((field) => ['instructions', 'name', 'traits'].includes(field)),
      ),
  );
});
test('editing a profile changes its version; archiving or native recreation cannot revive old origins', async () => {
  const f = await fixture(),
    link = f.links.find((row) => row.from.kind === 'persona');
  await f.db.runTransaction(async (tx) => {
    await tx.get(f.db.doc('users/author/aiPersonas/' + f.profile.id));
    tx.update(f.db.doc('users/author/aiPersonas/' + f.profile.id), {
      revision: 2,
      instructions: 'PRIVATE NEW INSTRUCTION',
    });
  });
  const edited = await f.verify(link);
  assert.equal(edited.status, 'changed');
  assert.equal(edited.sourceIdentityVerified, true);
  f.metadata.set('users/author/aiPersonas/' + f.profile.id, { createdAt: 900, updatedAt: 900 });
  assert.equal((await f.verify(link)).status, 'recreated');
  f.records.set('users/author/aiPersonas/' + f.profile.id, { ...f.profile, archived: true });
  assert.equal((await f.verify(link)).status, 'unavailable');
});
test('binding changes are checked independently of prose and do not follow manuscript composition', async () => {
  const f = await fixture(),
    binding = f.links[1];
  assert.equal(binding.from.kind, 'personaBinding');
  await f.db.runTransaction(async (tx) => {
    await tx.get(f.db.doc('books/book/chapters/chapter'));
    tx.update(f.db.doc('books/book/chapters/chapter'), { content: 'Different prose' });
  });
  assert.equal((await f.verify(binding)).status, 'current');
  f.records.set('books/book/chapters/chapter', {
    bookId: 'book',
    personaComplement: { personaId: DEFAULT_PERSONAS[1].id, overrides: [] },
    personaRevision: 1,
  });
  const changed = await f.verify(binding);
  assert.equal(changed.status, 'changed');
  assert.equal(changed.sourceIdentityVerified, true);
  f.metadata.set('books/book/chapters/chapter', { createdAt: 1000, updatedAt: 1000 });
  assert.equal((await f.verify(binding)).status, 'recreated');
});
test('persona metadata from another owner or resource cannot become an accepted inventory link', async () => {
  const f = await fixture(),
    dependencies = f.persona.dependencies;
  assert.throws(() =>
    createLiteraryImpactLinks({ bookId: 'book', ownerId: 'other' }).persona({
      collection: 'jobs',
      id: 'r',
      consumer: f.graph.node('review', 'r'),
      dependencies,
    }),
  );
  f.records.set('books/book/literaryReviewJobs/r', {
    chapterId: 'another-chapter',
    personaDependencies: dependencies,
  });
  const page = await f.db.runTransaction((tx) =>
    readLiteraryImpactBookInventoryPage(tx, f.c, {
      bookId: 'book',
      collection: 'literaryReviewJobs',
    }),
  );
  assert.ok(page.items[0].issues.includes('persona-resource-mismatch'));
  assert.equal(
    page.items[0].links.some((row) => row.from.kind === 'persona'),
    false,
  );
});
test('inventory includes valid new persona origins and leaves legacy missing proof explicit', async () => {
  const f = await fixture();
  f.records.set('books/book/literaryReviewJobs/new', {
    chapterId: 'chapter',
    personaDependencies: f.persona.dependencies,
  });
  let page = await f.db.runTransaction((tx) =>
    readLiteraryImpactBookInventoryPage(tx, f.c, {
      bookId: 'book',
      collection: 'literaryReviewJobs',
    }),
  );
  assert.equal(page.items[0].links.filter((row) => row.from.kind === 'persona').length, 1);
  assert.equal(page.items[0].issues.includes('persona-origin-not-inventoried'), false);
  f.records.delete('books/book/literaryReviewJobs/new');
  f.records.set('books/book/literaryReviewJobs/old', { chapterId: 'chapter' });
  page = await f.db.runTransaction((tx) =>
    readLiteraryImpactBookInventoryPage(tx, f.c, {
      bookId: 'book',
      collection: 'literaryReviewJobs',
    }),
  );
  assert.ok(page.items[0].issues.includes('persona-origin-not-inventoried'));
});
