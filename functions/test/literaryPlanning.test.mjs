import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiteraryPlanningService } from '../src/literaryPlanning.mjs';
import { literaryPlan } from '../src/literaryPlanningSchema.mjs';
import { workFixture, book, operation } from './workProgressFixtures.mjs';

function fixture() {
  const f = workFixture();
  return { ...f, api: createLiteraryPlanningService({ db: f.db, now: () => 400 }) };
}
const plan = () => ({
  kind: 'chapterBrief',
  title: 'A carta atrasada',
  status: 'working',
  fields: {
    function: 'A personagem decide abrir a carta.',
    decision: 'Romper o selo.',
    consequence: 'Descobrir que a irmã pode estar viva.',
  },
  references: [],
});
const input = (value = plan(), expectedRevision = 0, n = 1) => ({
  target: book,
  id: 'chapter-plan',
  operationId: operation(n),
  expectedRevision,
  plan: value,
});
test('planning preserves manuscript, existing structure and publication', async () => {
  const f = fixture();
  const root = structuredClone(f.records.get('books/book'));
  await f.api.saveLiteraryPlan('author', input());
  const result = await f.api.getLiteraryPlan('author', { target: book, id: 'chapter-plan' });
  assert.equal(result.plan.fields.decision, 'Romper o selo.');
  assert.equal(result.plan.fields.finalKnowledge, '');
  assert.equal(result.plan.status, 'working');
  assert.equal(f.records.get('books/book').status, root.status);
  assert.equal(f.records.get('books/book').wordCount, root.wordCount);
  assert.equal(f.records.has('books/book/chapters/chapter-plan'), false);
});
test('new references use stable native identities; reordering changes revision without relinking', async () => {
  const f = fixture();
  f.records.set('books/book/chapters/chapter-1', {
    title: 'A carta',
    bookId: 'book',
    order: 0,
    updatedAt: 100,
  });
  const options = await f.api.listLiteraryReferences('author', { target: book, kind: 'chapter' });
  assert.equal(options.items[0].label, 'A carta');
  const value = plan();
  value.references.push(options.items[0].reference);
  await f.api.saveLiteraryPlan('author', input(value));
  f.records.set('books/book/chapters/chapter-1', {
    title: 'A carta',
    bookId: 'book',
    order: 9,
    updatedAt: 200,
  });
  const saved = await f.api.getLiteraryPlan('author', { target: book, id: 'chapter-plan' });
  assert.equal(saved.plan.references[0].id, 'chapter-1');
  assert.equal(saved.sources[0].available, true);
  assert.equal(saved.sources[0].changed, true);
  await assert.rejects(f.api.saveLiteraryPlan('author', input(value, 1, 2)), {
    code: 'failed-precondition',
  });
});
test('missing or cross-book references never become grants and cannot be saved', async () => {
  const f = fixture();
  f.records.set('books/book/chapters/chapter-1', {
    title: 'A carta',
    bookId: 'other',
    updatedAt: 100,
  });
  const options = await f.api.listLiteraryReferences('author', { target: book, kind: 'chapter' });
  assert.deepEqual(options.items, []);
  const value = plan();
  value.references.push({
    kind: 'chapter',
    id: 'chapter-1',
    scopeId: 'book',
    sourceToken: 'a'.repeat(64),
    revision: 100,
  });
  await assert.rejects(f.api.saveLiteraryPlan('author', input(value)), {
    code: 'failed-precondition',
  });
});
test('CAS and frozen receipts preserve edits and immutable plan versions', async () => {
  const f = fixture();
  const first = input();
  const original = await f.api.saveLiteraryPlan('author', first);
  const revised = plan();
  revised.fields.decision = 'Guardar a carta.';
  await f.api.saveLiteraryPlan('author', input(revised, 1, 2));
  assert.deepEqual(await f.api.saveLiteraryPlan('author', first), original);
  assert.equal(
    (await f.api.getLiteraryPlan('author', { target: book, id: 'chapter-plan' })).plan.fields
      .decision,
    'Guardar a carta.',
  );
  await assert.rejects(f.api.saveLiteraryPlan('author', input(plan(), 0, 3)), {
    code: 'failed-precondition',
  });
  assert.equal(
    [...f.records.keys()].filter((path) => path.startsWith('books/book/literaryPlanVersions/'))
      .length,
    2,
  );
});
test('schema rejects unknown fields and does not equate approval with manuscript completion', () => {
  const approved = { ...plan(), status: 'approved' };
  assert.equal(literaryPlan(approved).status, 'approved');
  assert.throws(
    () => literaryPlan({ ...plan(), fields: { secretSystemInstruction: 'run tools' } }),
    { code: 'invalid-argument' },
  );
  assert.throws(() => literaryPlan({ ...plan(), kind: '__proto__' }), { code: 'invalid-argument' });
});
test('metadata listing omits plan bodies and author access is checked per call', async () => {
  const f = fixture();
  await f.api.saveLiteraryPlan('author', input());
  const page = await f.api.listLiteraryPlans('author', { target: book });
  assert.equal(page.items[0].title, 'A carta atrasada');
  assert.equal('fields' in page.items[0], false);
  await assert.rejects(f.api.listLiteraryPlans('other', { target: book }), { code: 'not-found' });
  f.records.set('books/book', { ...f.records.get('books/book'), deleting: true });
  await assert.rejects(f.api.getLiteraryPlan('author', { target: book, id: 'chapter-plan' }), {
    code: 'not-found',
  });
});

test('a subject association survives manuscript edits without claiming source verification', async () => {
  const f = fixture();
  f.records.set('books/book/chapters/chapter-1', {
    title: 'A carta',
    bookId: 'book',
    updatedAt: 100,
  });
  const options = await f.api.listLiteraryReferences('author', {
    target: book,
    kind: 'chapter',
    purpose: 'subject',
  });
  const value = plan();
  value.references.push(options.items[0].reference);
  await f.api.saveLiteraryPlan('author', input(value));
  f.records.set('books/book/chapters/chapter-1', {
    title: 'A carta',
    bookId: 'book',
    updatedAt: 200,
  });
  const result = await f.api.getLiteraryPlan('author', { target: book, id: 'chapter-plan' });
  assert.equal(result.sources[0].available, true);
  assert.equal(result.sources[0].changed, false);
});

test('changed sources offer an explicit current reference without modifying the saved plan or prose', async () => {
  const f = fixture(),
    path = 'books/book/chapters/chapter-1';
  f.records.set(path, {
    title: 'A carta',
    bookId: 'book',
    order: 0,
    content: 'Texto preservado',
    updatedAt: 100,
  });
  const options = await f.api.listLiteraryReferences('author', { target: book, kind: 'chapter' });
  const original = { ...plan(), status: 'approved' };
  original.references = [options.items[0].reference];
  await f.api.saveLiteraryPlan('author', input(original));
  f.records.set(path, { ...f.records.get(path), updatedAt: 200 });
  const view = await f.api.getLiteraryPlan('author', { target: book, id: 'chapter-plan' });
  assert.equal(view.plan.status, 'approved');
  assert.equal(view.plan.references[0].revision, 100);
  assert.equal(view.sources[0].currentReference.revision, 200);
  const reconciled = {
    ...view.plan,
    status: 'working',
    references: [view.sources[0].currentReference],
  };
  await f.api.saveLiteraryPlan('author', input(reconciled, 1, 2));
  const saved = await f.api.getLiteraryPlan('author', { target: book, id: 'chapter-plan' });
  assert.equal(saved.plan.status, 'working');
  assert.deepEqual(saved.plan.fields, view.plan.fields);
  assert.equal(f.records.get(path).content, 'Texto preservado');
  const historical = await f.api.getLiteraryPlanVersion('author', {
    target: book,
    id: 'chapter-plan',
    revision: 1,
  });
  assert.equal(historical.plan.status, 'approved');
  assert.equal(historical.plan.references[0].revision, 100);
});
test('an inaccessible source cannot be rebound by a current-reference shortcut', async () => {
  const f = fixture(),
    path = 'books/book/chapters/chapter-1';
  f.records.set(path, { title: 'Original', bookId: 'book', updatedAt: 100 });
  const options = await f.api.listLiteraryReferences('author', { target: book, kind: 'chapter' });
  const original = plan();
  original.references = [options.items[0].reference];
  await f.api.saveLiteraryPlan('author', input(original));
  f.records.set(path, { title: 'Outra origem', bookId: 'other', updatedAt: 200 });
  const view = await f.api.getLiteraryPlan('author', { target: book, id: 'chapter-plan' });
  assert.equal(view.sources[0].available, false);
  assert.equal(view.sources[0].currentReference, null);
  assert.equal(view.sources[0].label, null);
});
