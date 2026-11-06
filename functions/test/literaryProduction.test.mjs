import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiteraryProductionService } from '../src/literaryProduction.mjs';
import { emptyEditorialContract, editorialContract } from '../src/literaryContracts.mjs';
import { workFixture, book, operation } from './workProgressFixtures.mjs';

function fixture() {
  const f = workFixture();
  return { ...f, api: createLiteraryProductionService({ db: f.db, now: () => 300 }) };
}
function input(contract = emptyEditorialContract(), expectedRevision = 0, n = 1) {
  return { target: book, operationId: operation(n), expectedRevision, contract };
}
const decision = (id = 'decision-1') => ({
  id,
  text: 'O narrador desconhece o destino da irmã.',
  category: 'requirement',
  status: 'approved',
  source: 'Decisão explícita do autor',
  supersedes: null,
});
test('optional editorial contract does not alter manuscript or publication', async () => {
  const f = fixture();
  const before = structuredClone(f.records.get('books/book'));
  const empty = await f.api.getLiteraryContract('author', { target: book });
  assert.equal(empty.revision, 0);
  assert.equal(f.records.has('books/book/literaryProduction/current'), false);
  const contract = emptyEditorialContract();
  contract.fields.premise = 'Uma carta chega vinte anos depois.';
  contract.decisions.push(decision());
  const result = await f.api.saveLiteraryContract('author', input(contract));
  assert.equal(result.revision, 1);
  assert.equal(f.records.get('books/book').status, before.status);
  assert.equal(f.records.get('books/book').wordCount, before.wordCount);
  assert.equal(f.records.has('publicBooks/book'), false);
});
test('replay returns original version after later changes; conflicting input is refused', async () => {
  const f = fixture();
  const first = input();
  const one = await f.api.saveLiteraryContract('author', first);
  const next = emptyEditorialContract();
  next.fields.promise = 'A carta muda a família.';
  await f.api.saveLiteraryContract('author', input(next, 1, 2));
  assert.deepEqual(await f.api.saveLiteraryContract('author', first), one);
  await assert.rejects(f.api.saveLiteraryContract('author', { ...first, contract: next }), {
    code: 'invalid-argument',
  });
  assert.equal((await f.api.getLiteraryContract('author', { target: book })).revision, 2);
});
test('stale revisions fail without overwriting or creating historical versions', async () => {
  const f = fixture();
  await f.api.saveLiteraryContract('author', input());
  await assert.rejects(
    f.api.saveLiteraryContract('author', input(emptyEditorialContract(), 0, 2)),
    { code: 'failed-precondition' },
  );
  assert.equal(f.records.has('books/book/literaryContractVersions/2'), false);
});
test('decision history is append-only and approval is an explicit replacement', async () => {
  const f = fixture();
  const contract = emptyEditorialContract();
  const proposed = { ...decision(), status: 'proposal' };
  contract.decisions.push(proposed);
  await f.api.saveLiteraryContract('author', input(contract));
  const changed = structuredClone(contract);
  changed.decisions[0].status = 'approved';
  await assert.rejects(f.api.saveLiteraryContract('author', input(changed, 1, 2)), {
    code: 'failed-precondition',
  });
  const approved = structuredClone(contract);
  approved.decisions.push({ ...decision('decision-2'), supersedes: proposed.id });
  await f.api.saveLiteraryContract('author', input(approved, 1, 3));
  const historical = await f.api.getLiteraryContractVersion('author', {
    target: book,
    revision: 1,
  });
  assert.deepEqual(historical.contract.decisions, [proposed]);
});
test('unauthorized and deleting books reject content reads, history and mutations', async () => {
  const f = fixture();
  await assert.rejects(f.api.getLiteraryContract('other', { target: book }), { code: 'not-found' });
  await assert.rejects(f.api.saveLiteraryContract('other', input()), { code: 'not-found' });
  await f.api.saveLiteraryContract('author', input());
  f.records.set('books/book', { ...f.records.get('books/book'), deleting: true });
  await assert.rejects(f.api.getLiteraryContractVersion('author', { target: book, revision: 1 }), {
    code: 'not-found',
  });
  await assert.rejects(f.api.saveLiteraryContract('author', input()), { code: 'not-found' });
});
test('unknown schema, cycles, missing replacements and invalid statuses are rejected', () => {
  assert.throws(() => editorialContract({ ...emptyEditorialContract(), schemaVersion: 2 }), {
    code: 'invalid-argument',
  });
  const contract = emptyEditorialContract();
  contract.decisions = [{ ...decision(), supersedes: 'missing' }];
  assert.throws(() => editorialContract(contract), { code: 'invalid-argument' });
  contract.decisions = [
    { ...decision('a'), supersedes: 'b' },
    { ...decision('b'), supersedes: 'a' },
  ];
  assert.throws(() => editorialContract(contract), { code: 'invalid-argument' });
});
test('history is paginated and source content is returned only by explicit version read', async () => {
  const f = fixture();
  await f.api.saveLiteraryContract('author', input());
  const nextContract = emptyEditorialContract();
  nextContract.fields.premise = 'Uma carta.';
  await f.api.saveLiteraryContract('author', input(nextContract, 1, 2));
  const page = await f.api.listLiteraryContractVersions('author', { target: book, limit: 1 });
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].revision, 2);
  assert.equal('contract' in page.items[0], false);
  const next = await f.api.listLiteraryContractVersions('author', {
    target: book,
    limit: 1,
    beforeRevision: page.nextBeforeRevision,
  });
  assert.equal(next.items[0].revision, 1);
});

test('saving an unchanged contract preserves the same version and confirms the no-op receipt', async () => {
  const f = fixture();
  const first = await f.api.saveLiteraryContract('author', input());
  const result = await f.api.saveLiteraryContract('author', input(emptyEditorialContract(), 1, 2));
  assert.deepEqual(result, first);
  assert.equal(f.records.has('books/book/literaryContractVersions/2'), false);
  const outcome = await f.api.getLiteraryOperation('author', {
    target: book,
    operationId: operation(2),
  });
  assert.equal(outcome.noOp, true);
  assert.equal(outcome.revision, 1);
});

test('operational collaboration is validated, versioned and independent of free-form observations', async () => {
  const f = fixture();
  const legacy = emptyEditorialContract();
  legacy.fields.collaboration = 'Contínuo, segundo as minhas notas';
  const one = await f.api.saveLiteraryContract('author', input(legacy));
  assert.equal(Object.hasOwn(one.contract, 'collaborationPolicy'), false);
  const next = structuredClone(legacy);
  next.collaborationPolicy = { version: 1, mode: 'guidance' };
  const two = await f.api.saveLiteraryContract('author', input(next, 1, 2));
  assert.equal(two.contract.collaborationPolicy.mode, 'guidance');
  assert.deepEqual(
    (await f.api.getLiteraryContractVersion('author', { target: book, revision: 1 })).contract,
    legacy,
  );
  assert.deepEqual(await f.api.saveLiteraryContract('author', input(legacy)), one);
  assert.deepEqual(await f.api.saveLiteraryContract('author', input(next, 1, 2)), two);
  for (const policy of [
    null,
    { version: 2, mode: 'continuous' },
    { version: 1, mode: 'automatic' },
    { version: 1, mode: 'continuous', maxCredits: 100 },
    { mode: 'supervised' },
  ]) {
    assert.throws(() => editorialContract({ ...legacy, collaborationPolicy: policy }), {
      code: 'invalid-argument',
    });
  }
});

test('publication unit is versioned, activates the native barrier and stays separate from publishing', async () => {
  const f = fixture();
  const contract = { ...emptyEditorialContract(), publicationPolicy: { version: 1, unit: 'act' } };
  const originalStatus = f.records.get('books/book').status;
  const first = input(contract);
  const saved = await f.api.saveLiteraryContract('author', first);
  assert.deepEqual(saved.contract.publicationPolicy, { version: 1, unit: 'act' });
  assert.deepEqual(
    f.records.get('books/book/literaryContractVersions/1').contract.publicationPolicy,
    saved.contract.publicationPolicy,
  );
  assert.equal(f.records.get('books/book').hasLiteraryPublications, true);
  assert.equal(f.records.get('books/book').status, originalStatus);
  assert.equal(f.records.has('publicBooks/book'), false);
  const next = structuredClone(contract);
  delete next.publicationPolicy;
  await f.api.saveLiteraryContract('author', input(next, 1, 2));
  assert.equal(
    Object.hasOwn(
      (await f.api.getLiteraryContract('author', { target: book })).contract,
      'publicationPolicy',
    ),
    false,
  );
  assert.equal(f.records.get('books/book').hasLiteraryPublications, true);
  assert.deepEqual(await f.api.saveLiteraryContract('author', first), saved);
  assert.equal((await f.api.getLiteraryContract('author', { target: book })).revision, 2);
});

test('same-content save repairs a missing native publication barrier without inventing a new contract version', async () => {
  const f = fixture();
  const contract = { ...emptyEditorialContract(), publicationPolicy: { version: 1, unit: 'book' } };
  const saved = { revision: 1, updatedAt: 200, contract };
  f.records.set('books/book/literaryProduction/current', saved);
  f.records.set('books/book/literaryContractVersions/1', saved);
  await f.api.saveLiteraryContract('author', input(contract, 1, 1));
  assert.equal(f.records.get('books/book').hasLiteraryPublications, true);
  assert.equal((await f.api.getLiteraryContract('author', { target: book })).revision, 1);
  assert.equal(f.records.has('books/book/literaryContractVersions/2'), false);
  assert.equal(f.records.has('publicBooks/book'), false);
});
