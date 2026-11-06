import test from 'node:test';
import assert from 'node:assert/strict';
import { studioDb } from './helpers/studioDb.mjs';
import { workScope } from '../src/workProgressContracts.mjs';
import {
  readLiteraryImpactBookInventoryPage,
  LITERARY_IMPACT_BOOK_INVENTORIES,
} from '../src/literaryImpactInventory.mjs';
const target = { kind: 'book', id: 'book' },
  hash = 'a'.repeat(64);
function fixture() {
  const f = studioDb();
  f.records.set('books/book', { authorId: 'author', updatedAt: 10, universeId: 'world' });
  const c = workScope(f.db, 'author', { target }, []);
  const read = (collection, afterId = null, bookId = 'book') =>
    f.db.runTransaction((tx) =>
      readLiteraryImpactBookInventoryPage(tx, c, { bookId, collection, afterId }),
    );
  return { ...f, c, read };
}
test('inventory pages read declared metadata and actual active composition, never manuscript bodies', async () => {
  const f = fixture();
  f.records.set('books/book/chapters/c', {
    bookId: 'book',
    contentMode: 'scenes',
    content: 'PRIVATE CHAPTER BODY',
  });
  f.records.set('books/book/scenes/s', {
    ownerId: 'author',
    parentId: 'c',
    archived: false,
    body: 'PRIVATE SCENE BODY',
    prompt: 'PRIVATE PROMPT',
  });
  const page = await f.read('scenes');
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].links.length, 1);
  assert.equal(page.items[0].links[0].to.id, 'c');
  assert.equal(page.items[0].sourceIdentitiesVerified, false);
  assert.equal(page.nextAfterId, 's');
  assert.equal(page.collectionComplete, false);
  assert.equal(page.wholeProject, false);
  const projection = f.reads.find((row) => row.collectionPath === 'books/book/scenes').fields;
  assert.equal(projection.includes('body'), false);
  assert.equal(projection.includes('prompt'), false);
  assert.equal(JSON.stringify(page).includes('PRIVATE'), false);
  const end = await f.read('scenes', 's');
  assert.equal(end.collectionComplete, true);
  assert.equal(end.wholeProject, false);
});
test('archived scenes and a scene whose parent is legacy are outside active manuscript composition', async () => {
  for (const patch of [{ archived: true }, { parentId: null }]) {
    const f = fixture();
    f.records.set('books/book/scenes/s', {
      ownerId: 'author',
      parentId: 'c',
      archived: false,
      ...patch,
    });
    assert.deepEqual((await f.read('scenes')).items[0].links, []);
  }
  const f = fixture();
  f.records.set('books/book/chapters/c', { bookId: 'book', contentMode: 'legacy' });
  f.records.set('books/book/scenes/s', { ownerId: 'author', parentId: 'c', archived: false });
  assert.deepEqual((await f.read('scenes')).items[0].links, []);
});
test('a native origin token is retained while record-body and decision rationale are excluded', async () => {
  const f = fixture();
  f.records.set('books/book/literaryPlans/p', {
    revision: 2,
    plan: {
      title: 'PRIVATE TITLE',
      fields: { secret: 'PRIVATE BODY' },
      references: [
        {
          kind: 'chapter',
          id: 'c',
          scopeId: 'book',
          sourceToken: hash,
          revision: 1,
          purpose: 'source',
        },
      ],
    },
  });
  const page = await f.read('literaryPlans');
  assert.equal(page.items[0].links[0].capture.originToken, hash);
  assert.equal(JSON.stringify(page).includes('PRIVATE'), false);
  const projection = f.reads.at(-1).fields;
  assert.deepEqual(projection, ['revision', 'plan.references']);
});
test('stale global-scope references remain an explicit unresolved record, never a silently rebound source', async () => {
  const f = fixture();
  f.records.set('books/book/literaryPlans/p', {
    revision: 2,
    plan: {
      references: [
        {
          kind: 'globalLore',
          id: 'same-id',
          scopeId: 'previous-world',
          sourceToken: hash,
          revision: 1,
          purpose: 'source',
        },
      ],
    },
  });
  const item = (await f.read('literaryPlans')).items[0];
  assert.deepEqual(item.links, []);
  assert.deepEqual(item.issues, ['invalid-or-unavailable-dependency-metadata']);
  assert.equal(item.sourceIdentitiesVerified, false);
});
test('persona metadata projection excludes its inline selection and cannot claim completed origin inventory', async () => {
  const f = fixture(),
    manifest = {
      version: 1,
      target,
      resource: { kind: 'chapter', id: 'c' },
      bookToken: hash,
      selection: 'explicit',
      contractRevision: 0,
      planIds: [],
      plans: [],
      references: [],
    };
  f.records.set('books/book/literaryAutocompleteRequests/r', {
    chapterId: 'c',
    manifest,
    beforeHash: hash,
    prompt: 'PRIVATE PROMPT',
    text: 'PRIVATE GENERATED TEXT',
    persona: {
      identityToken: hash,
      versionToken: hash,
      selection: { baseId: 'x', complement: { instruction: 'PRIVATE INSTRUCTION' } },
    },
  });
  const page = await f.read('literaryAutocompleteRequests'),
    item = page.items[0];
  assert.ok(item.issues.includes('persona-origin-not-inventoried'));
  assert.equal(JSON.stringify(page).includes('PRIVATE'), false);
  const projection = f.reads.at(-1).fields;
  assert.ok(projection.includes('persona.identityToken'));
  assert.equal(projection.includes('persona'), false);
});
test('foreign books, foreign scenes, and unregistered body collections are rejected', async () => {
  const f = fixture();
  f.records.set('books/foreign', { authorId: 'other', updatedAt: 10 });
  await assert.rejects(f.read('scenes', null, 'foreign'), { code: 'not-found' });
  f.records.set('books/book/scenes/s', { ownerId: 'other', parentId: 'c', archived: false });
  await assert.rejects(f.read('scenes'), { code: 'permission-denied' });
  await assert.rejects(f.read('literaryIntegrationResults'), { code: 'invalid-argument' });
  assert.equal(LITERARY_IMPACT_BOOK_INVENTORIES.includes('literaryIntegrationResults'), false);
});
test('same record ID and metadata cannot disguise native recreation', async () => {
  const f = fixture();
  f.records.set('books/book/chapters/c', { bookId: 'book', contentMode: 'legacy' });
  const first = (await f.read('chapters')).items[0];
  f.metadata.set('books/book/chapters/c', { createdAt: 200, updatedAt: 200 });
  const recreated = (await f.read('chapters')).items[0];
  assert.notEqual(recreated.recordToken, first.recordToken);
});

test('decision inventory omits authored rationale and historical target labels', async () => {
  const f = fixture();
  f.records.set('books/book/literaryFindingDecisions/f', {
    source: { jobId: 'original' },
    target: { kind: 'chapter', id: 'c', scopeId: 'book' },
    rationale: 'PRIVATE RATIONALE',
    baseline: { identityToken: hash, versionToken: hash, revision: 2, label: 'PRIVATE TITLE' },
    correction: { successorJobId: 'successor', note: 'PRIVATE NOTE' },
  });
  const page = await f.read('literaryFindingDecisions');
  assert.equal(page.items[0].links.length, 3);
  assert.equal(JSON.stringify(page).includes('PRIVATE'), false);
  const projection = f.reads.at(-1).fields;
  assert.equal(projection.includes('baseline'), false);
  assert.equal(projection.includes('rationale'), false);
  assert.ok(projection.includes('baseline.identityToken'));
});

test('new generation dependencies are read without opening source labels, prompts or generated results', async () => {
  const f = fixture();
  const bookRow = await f.db.doc('books/book').get(),
    birth = [bookRow.createTime.seconds, bookRow.createTime.nanoseconds];
  f.records.set('books/book/literaryGenerations/g', {
    state: 'done',
    dependencies: {
      version: 1,
      bookBirth: birth,
      contractRevision: 0,
      plans: [],
      references: [
        {
          reference: {
            kind: 'chapter',
            id: 'c',
            scopeId: 'book',
            sourceToken: hash,
            revision: 1,
            purpose: 'source',
          },
          identityToken: hash,
          versionToken: hash,
          bodyToken: hash,
        },
      ],
    },
    snapshot: {
      proof: { references: [{ label: 'PRIVATE SOURCE LABEL' }] },
      documents: [{ text: 'PRIVATE SOURCE BODY' }],
    },
    request: { instruction: 'PRIVATE NOTE' },
    result: { report: 'PRIVATE GENERATED REPORT' },
  });
  const page = await f.read('literaryGenerations'),
    item = page.items[0];
  assert.equal(item.links.length, 1);
  assert.equal(item.links[0].to.kind, 'generation');
  assert.equal(item.links[0].capture.scheme, 'reference');
  assert.equal(JSON.stringify(page).includes('PRIVATE'), false);
  assert.deepEqual(f.reads.at(-1).fields, ['dependencies', 'state']);
});
test('old generation records and another book incarnation remain explicit unresolved origins', async () => {
  const f = fixture();
  f.records.set('books/book/literaryGenerations/legacy', {
    state: 'done',
    snapshot: {
      proof: { references: [{ label: 'PRIVATE LEGACY LABEL' }] },
      documents: [{ text: 'PRIVATE' }],
    },
  });
  let item = (await f.read('literaryGenerations')).items[0];
  assert.deepEqual(item.links, []);
  assert.deepEqual(item.issues, ['generation-dependencies-not-recorded']);
  f.records.delete('books/book/literaryGenerations/legacy');
  f.records.set('books/book/literaryGenerations/recreated', {
    state: 'done',
    dependencies: {
      version: 1,
      bookBirth: [9999, 1],
      contractRevision: 0,
      plans: [],
      references: [],
    },
  });
  item = (await f.read('literaryGenerations')).items[0];
  assert.deepEqual(item.links, []);
  assert.deepEqual(item.issues, ['generation-book-origin-changed']);
});
