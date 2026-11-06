import test from 'node:test';
import assert from 'node:assert/strict';
import { workFixture, book, operation } from './workProgressFixtures.mjs';
import { createLiteraryBookMapService } from '../src/literaryBookMap.mjs';
import { createLiteraryPlanningService } from '../src/literaryPlanning.mjs';
import { sequenceKey } from '../src/narrativeContracts.mjs';
function fixture() {
  const f = workFixture();
  const api = createLiteraryBookMapService({ db: f.db });
  return {
    ...f,
    api,
    read: (extra = {}, uid = 'author') =>
      api.readLiteraryBookMapPage(uid, { target: book, resource: 'chapters', ...extra }),
  };
}
test('map traverses all metadata pages without reading manuscript or changing project, credits or publication', async () => {
  const f = fixture();
  for (let i = 0; i < 53; i++)
    f.records.set(`books/book/chapters/chapter-${String(i).padStart(3, '0')}`, {
      bookId: 'book',
      order: i,
      title: `Unidade ${i}`,
      content: 'PRIVATE PROSE',
      updatedAt: 10,
    });
  f.records.set('books/book/chapters/chapter-foreign', {
    ownerId: 'other',
    order: 0,
    title: 'FOREIGN',
    content: 'PRIVATE',
  });
  const before = structuredClone([...f.records]);
  const rows = [];
  let afterId = null,
    fence = null,
    pages = 0;
  do {
    const page = await f.read({ afterId, fence });
    fence ??= page.fence;
    afterId = page.nextAfterId;
    rows.push(...page.items);
    pages++;
    assert.equal(page.fence, fence);
    assert.deepEqual(page.coverage, { kind: 'root-fenced-metadata-read', manuscriptRead: false });
  } while (afterId !== null);
  assert.equal(rows.length, 53);
  assert.equal(pages, 3);
  assert.equal(JSON.stringify(rows).includes('PRIVATE'), false);
  assert.equal(JSON.stringify(rows).includes('FOREIGN'), false);
  assert.deepEqual([...f.records], before);
  await assert.rejects(f.read({ afterId: 'chapter-001' }), { code: 'invalid-argument' });
});
async function planned(f, purpose = 'subject') {
  f.records.set('books/book/chapters/chapter-one', {
    bookId: 'book',
    title: 'Original',
    order: 0,
    updatedAt: 10,
  });
  const planning = createLiteraryPlanningService({ db: f.db, now: () => 500 });
  const choice = await planning.listLiteraryReferences('author', {
    target: book,
    kind: 'chapter',
    purpose,
  });
  await planning.saveLiteraryPlan('author', {
    target: book,
    id: 'brief-one',
    expectedRevision: 0,
    operationId: operation(1),
    plan: {
      kind: 'chapterBrief',
      title: 'Intenção',
      status: 'approved',
      fields: { realTime: 'Antes da carta', apparentTime: 'Talvez depois' },
      references: [choice.items[0].reference],
    },
  });
}
test('map preserves intent, source/subject distinction and stale source evidence without changing approval', async () => {
  const f = fixture();
  await planned(f, 'source');
  await f.db.runTransaction(async (tx) =>
    tx.update(f.db.doc('books/book/chapters/chapter-one'), { updatedAt: 11, title: 'Atual' }),
  );
  const result = await f.read({ resource: 'plans' });
  const entry = result.items[0];
  assert.equal(entry.plan.status, 'approved');
  assert.equal(entry.fieldLabels.realTime, 'Momento real, idade e cargo');
  assert.equal(entry.plan.fields.realTime, 'Antes da carta');
  assert.equal(entry.plan.fields.apparentTime, 'Talvez depois');
  assert.equal(entry.sources[0].reference.purpose, 'source');
  assert.equal(entry.sources[0].available, true);
  assert.equal(entry.sources[0].changed, true);
});
test('same-ID chapter recreation never relinks an old subject or exposes its new label', async () => {
  const f = fixture();
  await planned(f);
  await f.db.runTransaction(async (tx) => tx.delete(f.db.doc('books/book/chapters/chapter-one')));
  await f.db.runTransaction(async (tx) =>
    tx.create(f.db.doc('books/book/chapters/chapter-one'), {
      bookId: 'book',
      order: 0,
      title: 'NEW PRIVATE IDENTITY',
      updatedAt: 10,
    }),
  );
  const page = await f.read({ resource: 'plans' });
  assert.equal(page.items[0].sources[0].available, false);
  assert.equal(page.items[0].sources[0].label, null);
  assert.equal(JSON.stringify(page).includes('NEW PRIVATE IDENTITY'), false);
});
for (const mutation of ['update', 'recreate', 'sequence'])
  test(`pagination fence rejects ${mutation} even when author timestamps are unchanged`, async () => {
    const f = fixture(),
      first = await f.read();
    if (mutation === 'update')
      await f.db.runTransaction(async (tx) =>
        tx.update(f.db.doc('books/book'), { updatedAt: f.records.get('books/book').updatedAt }),
      );
    if (mutation === 'recreate') {
      const original = structuredClone(f.records.get('books/book'));
      await f.db.runTransaction(async (tx) => tx.delete(f.db.doc('books/book')));
      await f.db.runTransaction(async (tx) => tx.create(f.db.doc('books/book'), original));
    }
    if (mutation === 'sequence')
      await f.db.runTransaction(async (tx) =>
        tx.set(f.db.doc('books/book/narrativeControls/' + sequenceKey({ kind: 'event' })), {
          rankSlot: 'B',
        }),
      );
    await assert.rejects(f.read({ resource: 'acts', fence: first.fence }), {
      code: 'failed-precondition',
    });
  });
test('map uses the active event rank slot and never parses free date labels as reading order', async () => {
  const f = fixture();
  f.records.set('books/book/narrativeControls/' + sequenceKey({ kind: 'event' }), {
    rankSlot: 'B',
  });
  f.records.set('books/book/timelineEvents/event-one', {
    ownerId: 'author',
    title: 'A memória',
    rankA: 'z',
    rankB: 'B',
    dateLabel: 'Dez anos antes',
    description: 'Uma intenção editorial',
    revision: 1,
  });
  const page = await f.read({ resource: 'events' });
  assert.equal(page.items[0].rank, 'B');
  assert.equal(page.items[0].dateLabel, 'Dez anos antes');
  assert.equal('order' in page.items[0], false);
});
test('map authorizes every page and rejects unsupported resources, targets and oversized plan pages', async () => {
  const f = fixture(),
    first = await f.read();
  await assert.rejects(f.read({}, ''), { code: 'unauthenticated' });
  await assert.rejects(f.read({ fence: first.fence }, 'other'), { code: 'not-found' });
  await assert.rejects(f.read({ resource: '__proto__' }), { code: 'invalid-argument' });
  await assert.rejects(f.read({ target: { kind: 'adventure', id: 'adventure' } }), {
    code: 'invalid-argument',
  });
  await assert.rejects(f.read({ resource: 'plans', limit: 4 }), { code: 'invalid-argument' });
  f.records.get('books/book').deleting = true;
  await assert.rejects(f.read({ fence: first.fence }), { code: 'not-found' });
});

test('universe revocation invalidates the map fence and hides the old global source without revoking the private book', async () => {
  const f = fixture();
  f.records.get('books/book').universeId = 'world';
  f.records.set('universes/world', { authorId: 'author', name: 'Universo privado' });
  f.records.set('universes/world/lore/ana', { name: 'Nome reservado', revision: 1, updatedAt: 10 });
  const planning = createLiteraryPlanningService({ db: f.db, now: () => 500 });
  const choices = await planning.listLiteraryReferences('author', {
    target: book,
    kind: 'globalLore',
  });
  await planning.saveLiteraryPlan('author', {
    target: book,
    id: 'overview',
    expectedRevision: 0,
    operationId: operation(2),
    plan: {
      kind: 'bookOverview',
      title: 'Continuidade do mundo',
      status: 'working',
      fields: { question: 'Qual é a promessa?' },
      references: [choices.items[0].reference],
    },
  });
  const first = await f.read({ resource: 'plans' });
  assert.equal(first.items[0].sources[0].available, true);
  const original = structuredClone(f.records.get('books/book'));
  await f.db.runTransaction(async (tx) =>
    tx.update(f.db.doc('universes/world'), { authorId: 'other', name: 'NEW PRIVATE WORLD' }),
  );
  await assert.rejects(f.read({ resource: 'plans', fence: first.fence }), {
    code: 'failed-precondition',
  });
  const refreshed = await f.read({ resource: 'plans' });
  assert.equal(refreshed.items[0].sources[0].available, false);
  assert.equal(refreshed.items[0].sources[0].label, null);
  assert.equal(JSON.stringify(refreshed).includes('NEW PRIVATE WORLD'), false);
  assert.equal(JSON.stringify(refreshed).includes('Nome reservado'), false);
  assert.deepEqual(f.records.get('books/book'), original);
});
