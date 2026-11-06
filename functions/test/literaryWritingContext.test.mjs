import test from 'node:test';
import assert from 'node:assert/strict';
import { workFixture, book, operation } from './workProgressFixtures.mjs';
import { createLiteraryPlanningService } from '../src/literaryPlanning.mjs';
import { createLiteraryProductionService } from '../src/literaryProduction.mjs';
import { emptyEditorialContract } from '../src/literaryContracts.mjs';
import {
  createLiteraryWritingService,
  literaryWritingScope,
  literaryWritingIsCurrent,
  authorizeLiteraryWritingManifest,
} from '../src/literaryWritingContext.mjs';

function fixture() {
  const f = workFixture();
  f.records.set('books/book/chapters/chapter', {
    bookId: 'book',
    title: 'A carta',
    content: '<p>Ela abriu a carta.</p>',
    updatedAt: 100,
  });
  return {
    ...f,
    planning: createLiteraryPlanningService({ db: f.db, now: () => 300 }),
    contract: createLiteraryProductionService({ db: f.db, now: () => 300 }),
    writing: createLiteraryWritingService({ db: f.db }),
  };
}
const resource = { kind: 'chapter', id: 'chapter' };
const input = (mode = 'chat', planIds) => ({
  target: book,
  resource,
  mode,
  ...(planIds === undefined ? {} : { planIds }),
});
async function subjectBrief(f) {
  const page = await f.planning.listLiteraryReferences('author', {
    target: book,
    kind: 'chapter',
    purpose: 'subject',
  });
  const reference = page.items.find((item) => item.reference.id === 'chapter').reference;
  await f.planning.saveLiteraryPlan('author', {
    target: book,
    id: 'brief',
    operationId: operation(1),
    expectedRevision: 0,
    plan: {
      kind: 'chapterBrief',
      title: 'A carta',
      status: 'approved',
      references: [reference],
      fields: {
        function: 'Uma descoberta exige uma escolha.',
        pointOfView: 'A irmã mais nova.',
        initialKnowledge: 'Ela desconhece o remetente.',
        reservations: 'Preservar a identidade do remetente.',
        consequence: 'A confiança muda.',
      },
    },
  });
}
test('books that did not adopt the method keep their original context behavior', async () => {
  const f = fixture();
  assert.equal(await f.writing.getLiteraryWritingContext('author', input()), null);
  assert.equal(f.records.has('books/book/literaryProduction/current'), false);
});
test('automatic context resolves the chapter brief by stable subject identity', async () => {
  const f = fixture();
  await subjectBrief(f);
  const snapshot = await f.writing.getLiteraryWritingContext('author', input());
  assert.deepEqual(snapshot.manifest.planIds, ['brief']);
  assert.equal(snapshot.manifest.selection, 'automatic');
  assert.match(snapshot.documents[0].text, /identidade do remetente/);
  assert.equal(snapshot.coverage.wholeBook, false);
  assert.equal(snapshot.coverage.completeForSelection, true);
  f.records.set('books/book/chapters/chapter', {
    ...f.records.get('books/book/chapters/chapter'),
    content: '<p>Texto novo.</p>',
    updatedAt: 200,
  });
  const current = await f.db.runTransaction((tx) =>
    literaryWritingIsCurrent(tx, literaryWritingScope(f.db, 'author', book), snapshot.manifest),
  );
  assert.equal(current, true, 'writing the subject does not obsolete the plan itself');
});
test('context invalidates after an approved planning change and histories retain authorized old origins', async () => {
  const f = fixture();
  await subjectBrief(f);
  const snapshot = await f.writing.getLiteraryWritingContext('author', input());
  const stored = await f.planning.getLiteraryPlan('author', { target: book, id: 'brief' });
  await f.planning.saveLiteraryPlan('author', {
    target: book,
    id: 'brief',
    operationId: operation(2),
    expectedRevision: 1,
    plan: {
      ...stored.plan,
      fields: { ...stored.plan.fields, reservations: 'A revelação só acontece no próximo ato.' },
    },
  });
  const current = await f.db.runTransaction((tx) =>
    literaryWritingIsCurrent(tx, literaryWritingScope(f.db, 'author', book), snapshot.manifest),
  );
  assert.equal(current, false);
  await f.db.runTransaction((tx) =>
    authorizeLiteraryWritingManifest(
      tx,
      literaryWritingScope(f.db, 'author', book),
      snapshot.manifest,
    ),
  );
});
test('a removed or recreated planning source cannot inherit an old context capability', async () => {
  const f = fixture();
  await subjectBrief(f);
  const snapshot = await f.writing.getLiteraryWritingContext('author', input());
  await f.db.runTransaction(async (tx) => {
    await tx.get(f.db.doc('books/book/literaryPlans/brief'));
    tx.delete(f.db.doc('books/book/literaryPlans/brief'));
  });
  await assert.rejects(
    f.db.runTransaction((tx) =>
      authorizeLiteraryWritingManifest(
        tx,
        literaryWritingScope(f.db, 'author', book),
        snapshot.manifest,
      ),
    ),
    { code: 'permission-denied' },
  );
});
test('compact autocomplete keeps POV, knowledge and reservations while declaring omitted support', async () => {
  const f = fixture();
  await subjectBrief(f);
  const snapshot = await f.writing.getLiteraryWritingContext('author', input('autocomplete'));
  assert.match(snapshot.documents[0].text, /A irmã mais nova/);
  assert.match(snapshot.documents[0].text, /Ela desconhece o remetente/);
  assert.match(snapshot.documents[0].text, /Preservar a identidade/);
  assert.doesNotMatch(snapshot.documents[0].text, /A confiança muda/);
  assert.equal(snapshot.coverage.completeForSelection, false);
  assert.ok(snapshot.coverage.omittedFields.some((field) => field.endsWith(':consequence')));
});
test('an essential guide exceeding the compact budget is refused instead of silently truncated', async () => {
  const f = fixture();
  const contract = emptyEditorialContract();
  contract.fields.examples = 'A'.repeat(12000);
  contract.fields.invariants = 'B'.repeat(6000);
  contract.fields.reservations = 'C'.repeat(6000);
  contract.fields.narrator = 'D'.repeat(6000);
  contract.fields.distance = 'E'.repeat(6000);
  contract.fields.exposition = 'F'.repeat(6000);
  contract.fields.dialogue = 'G'.repeat(6000);
  await f.contract.saveLiteraryContract('author', {
    target: book,
    operationId: operation(1),
    expectedRevision: 0,
    contract,
  });
  await assert.rejects(f.writing.getLiteraryWritingContext('author', input('autocomplete')), {
    code: 'resource-exhausted',
  });
});
test('explicit source selection stays separate from the automatic chapter association', async () => {
  const f = fixture();
  await subjectBrief(f);
  const empty = await f.writing.getLiteraryWritingContext('author', input('chat', []));
  assert.equal(empty, null);
  const explicit = await f.writing.getLiteraryWritingContext('author', input('chat', ['brief']));
  assert.equal(explicit.manifest.selection, 'explicit');
  assert.deepEqual(explicit.manifest.planIds, ['brief']);
});
test('unauthorized access cannot retrieve a guide or plan context', async () => {
  const f = fixture();
  await subjectBrief(f);
  await assert.rejects(f.writing.getLiteraryWritingContext('other', input()), {
    code: 'not-found',
  });
});
