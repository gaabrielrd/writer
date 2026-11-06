import test from 'node:test';
import assert from 'node:assert/strict';
import { studioDb } from './helpers/studioDb.mjs';
import { workScope, workProject, digest } from '../src/workProgressContracts.mjs';
import { createLiteraryReferenceReader } from '../src/literaryReferences.mjs';
import { readLiteraryImpactBookInventoryPage } from '../src/literaryImpactInventory.mjs';
import { verifyLiteraryImpactInventoryLink } from '../src/literaryImpactRecordVerification.mjs';
import { literaryImpactLinkKey } from '../src/literaryImpactProtocol.mjs';
const target = { kind: 'book', id: 'book' };
async function fixture() {
  const f = studioDb();
  f.records.set('books/book', { authorId: 'author', updatedAt: 1 });
  f.records.set('books/book/chapters/c', {
    bookId: 'book',
    content: 'PRIVATE MANUSCRIPT',
    updatedAt: 1,
  });
  const c = workScope(f.db, 'author', { target }, []);
  const reference = await f.db.runTransaction(async (tx) => {
    const root = await workProject(tx, c),
      read = await createLiteraryReferenceReader(tx, c, root);
    return (await read({ kind: 'chapter', id: 'c', scopeId: 'book', purpose: 'source' })).reference;
  });
  f.records.set('books/book/literaryPlans/p', {
    revision: 1,
    plan: { references: [reference], title: 'PRIVATE TITLE', fields: { text: 'PRIVATE PLAN' } },
  });
  const page = await f.db.runTransaction((tx) =>
    readLiteraryImpactBookInventoryPage(tx, c, { bookId: 'book', collection: 'literaryPlans' }),
  );
  const item = page.items[0],
    pointer = {
      bookId: 'book',
      collection: 'literaryPlans',
      recordId: 'p',
      recordToken: item.recordToken,
      linkId: digest(literaryImpactLinkKey(item.links[0])),
    };
  const verify = (patch = {}) =>
    f.db.runTransaction((tx) => verifyLiteraryImpactInventoryLink(tx, c, { ...pointer, ...patch }));
  return { ...f, c, item, pointer, verify };
}
test('a dependency check reconstructs the stored link before resolving its native source', async () => {
  const f = await fixture(),
    value = await f.verify();
  assert.equal(value.recordCurrent, true);
  assert.equal(value.status, 'current');
  assert.equal(value.sourceIdentityVerified, true);
  assert.equal(value.manuscriptRead, false);
  assert.equal(JSON.stringify(value).includes('PRIVATE'), false);
  const projection = f.reads
    .filter((row) => row.collectionPath === 'books/book/literaryPlans')
    .at(-1).fields;
  assert.deepEqual(projection, ['revision', 'plan.references']);
});
test('changed or removed native records cannot be blessed by a cached link capture', async () => {
  const f = await fixture();
  await f.db.runTransaction(async (tx) => {
    await tx.get(f.db.doc('books/book/literaryPlans/p'));
    tx.update(f.db.doc('books/book/literaryPlans/p'), { revision: 2 });
  });
  assert.equal((await f.verify()).status, 'record-changed');
  f.records.delete('books/book/literaryPlans/p');
  assert.equal((await f.verify()).status, 'record-unavailable');
});
test('an arbitrary consumer hash cannot substitute another captured grant', async () => {
  const f = await fixture();
  const forged = await f.verify({ linkId: '0'.repeat(64) });
  assert.equal(forged.recordCurrent, false);
  assert.equal(forged.status, 'link-changed');
  assert.equal(forged.sourceIdentityVerified, false);
});
test('point reads do not imply collection completion, including for a missing record', async () => {
  const f = await fixture();
  const page = await f.db.runTransaction((tx) =>
    readLiteraryImpactBookInventoryPage(tx, f.c, {
      bookId: 'book',
      collection: 'literaryPlans',
      recordId: 'missing',
    }),
  );
  assert.equal(page.items.length, 0);
  assert.equal(page.collectionComplete, false);
  assert.equal(page.wholeProject, false);
});

test('structural source identity is the frozen native record, not an unverified locator', async () => {
  const f = await fixture();
  const page = await f.db.runTransaction((tx) =>
    readLiteraryImpactBookInventoryPage(tx, f.c, { bookId: 'book', collection: 'chapters' }),
  );
  const item = page.items[0],
    pointer = {
      bookId: 'book',
      collection: 'chapters',
      recordId: 'c',
      recordToken: item.recordToken,
      linkId: digest(literaryImpactLinkKey(item.links[0])),
    };
  const current = await f.db.runTransaction((tx) =>
    verifyLiteraryImpactInventoryLink(tx, f.c, pointer),
  );
  assert.equal(current.sourceIdentityVerified, true);
  assert.equal(current.identityEvidence, 'native-record-snapshot');
  assert.equal(current.manuscriptRead, false);
  assert.equal(current.editorialReview, false);
  f.metadata.set('books/book/chapters/c', { createdAt: 2000, updatedAt: 2000 });
  const recreated = await f.db.runTransaction((tx) =>
    verifyLiteraryImpactInventoryLink(tx, f.c, pointer),
  );
  assert.equal(recreated.status, 'record-changed');
  assert.equal(recreated.sourceIdentityVerified, false);
});
