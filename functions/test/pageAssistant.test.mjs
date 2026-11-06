import { studioDb } from './helpers/studioDb.mjs';
import { emptyEditorialContract } from '../src/literaryContracts.mjs';
import { composeEditorialContract } from '../src/literaryEditorialComposition.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPageAssistantService } from '../src/pageAssistant.mjs';
import { workFixture } from './workProgressFixtures.mjs';
const request = (extra = {}) => ({
  prompt: 'Abra a primeira cena',
  page: '/books/book',
  target: { kind: 'book', id: 'book' },
  capabilities: [{ id: 'control-1', label: 'Nova cena', kind: 'action' }],
  ...extra,
});
function fixture(
  generator = async () => ({ reply: 'Vamos criar a cena.', action: { id: 'control-1' } }),
) {
  const f = workFixture();
  return {
    ...f,
    call: (data = request(), uid = 'author') =>
      createPageAssistantService({ db: f.db, generator, now: () => 200 }).pageAssistant(uid, data),
  };
}
test('page assistant proposes a registered action without changing manuscript or credits', async () => {
  const f = fixture();
  const before = structuredClone(f.records.get('books/book'));
  const result = await f.call();
  assert.equal(result.action.id, 'control-1');
  assert.deepEqual(f.records.get('books/book'), before);
  assert.match(result.contextProof, /^[a-f0-9]{64}$/);
});
test('private context rejects visitors, other accounts and deleted projects before provider I/O', async () => {
  let calls = 0;
  const f = fixture(async () => {
    calls++;
    return { reply: 'answer', action: null };
  });
  await assert.rejects(f.call(request(), ''), { code: 'unauthenticated' });
  await assert.rejects(f.call(request(), 'other'), { code: 'permission-denied' });
  f.records.get('books/book').deleting = true;
  await assert.rejects(f.call(), { code: 'permission-denied' });
  assert.equal(calls, 0);
});
test('changed project during provider I/O discards the entire proposal', async () => {
  const f = fixture(async () => {
    f.records.get('books/book').updatedAt++;
    return { reply: 'old', action: null };
  });
  await assert.rejects(f.call(), { code: 'failed-precondition' });
});
test('unknown actions and invalid select values are rejected without invoking product writes', async () => {
  const f = fixture(async () => ({ reply: 'Proposta', action: { id: 'delete-everything' } }));
  await assert.rejects(f.call(), { code: 'failed-precondition' });
  const g = fixture(async () => ({
    reply: 'Proposta',
    action: { id: 'control-1', value: 'oculto' },
  }));
  await assert.rejects(
    g.call(
      request({
        capabilities: [{ id: 'control-1', kind: 'select', label: 'Estado', options: ['Rascunho'] }],
      }),
    ),
    { code: 'failed-precondition' },
  );
});
test('generation preferences are frozen and quota includes failed attempts', async () => {
  let captured;
  const f = fixture(async (context) => {
    captured = context;
    return { reply: 'Proposta', action: null };
  });
  await f.call();
  assert.equal(captured.generation.effective.provider, 'gemini');
  f.records.set('users/author/assistedLimits/current', { windowStart: 0, count: 60 });
  await assert.rejects(f.call(), { code: 'resource-exhausted' });
});

test('dynamic derived names in UI labels never reach the provider automatically', async () => {
  let captured;
  const f = fixture(async (context) => {
    captured = context;
    return { reply: 'Escolha o item antes de editar.', action: null };
  });
  await f.call(
    request({
      capabilities: [{ id: 'control-1', kind: 'action', label: 'Editar Nome privado da base' }],
    }),
  );
  assert.equal(captured.capabilities[0].label, 'Editar 1');
  assert.equal(JSON.stringify(captured).includes('Nome privado da base'), false);
});

test('select proposals map opaque provider options back to their exact local value', async () => {
  const f = fixture(async () => ({
    reply: 'Confirme a seleção.',
    action: { id: 'control-1', value: 'Opção 2' },
  }));
  const result = await f.call(
    request({
      capabilities: [
        { id: 'control-1', kind: 'select', label: 'Estado', options: ['Rascunho', 'Em revisão'] },
      ],
    }),
  );
  assert.equal(result.action.value, 'Em revisão');
});

test('inspection reauthorizes the current source without provider calls or quota writes', async () => {
  let calls = 0;
  const f = fixture(async () => {
    calls++;
    return { reply: 'unused', action: null };
  });
  const before = structuredClone([...f.records]);
  const first = await f.call({ action: 'inspect', target: request().target });
  assert.match(first.contextProof, /^[a-f0-9]{64}$/);
  assert.deepEqual([...f.records], before);
  f.records.get('books/book').updatedAt++;
  const second = await f.call({ action: 'inspect', target: request().target });
  assert.notEqual(first.contextProof, second.contextProof);
  assert.equal(calls, 0);
  await assert.rejects(f.call({ action: 'inspect', target: request().target }, 'other'), {
    code: 'permission-denied',
  });
  await assert.rejects(f.call({ action: 'inspect', target: null }, ''), {
    code: 'unauthenticated',
  });
  f.records.get('books/book').deleting = true;
  await assert.rejects(f.call({ action: 'inspect', target: request().target }), {
    code: 'permission-denied',
  });
});
function editorialFixture(generator) {
  const f = studioDb();
  const contract = emptyEditorialContract();
  contract.fields.narrator = 'Primeira pessoa limitada';
  contract.decisions = [
    {
      id: 'decision-old',
      text: 'Antiga regra da voz',
      category: 'preference',
      status: 'approved',
      source: 'Autor',
      supersedes: null,
    },
    {
      id: 'decision-new',
      text: 'Nova voz',
      category: 'preference',
      status: 'approved',
      source: 'Autor',
      supersedes: 'decision-old',
    },
    {
      id: 'decision-idea',
      text: 'Possível traição',
      category: 'hypothesis',
      status: 'approved',
      source: 'Autor',
      supersedes: null,
    },
  ];
  f.records.set('books/book', { authorId: 'author', title: 'Ilhas', updatedAt: 10 });
  f.records.set('users/author', { credits: 7 });
  f.records.set('books/book/literaryProduction/current', { revision: 1, updatedAt: 10, contract });
  return {
    ...f,
    contract,
    call: (uid = 'author') =>
      createPageAssistantService({ db: f.db, now: () => 200, generator }).pageAssistant(
        uid,
        request(),
      ),
  };
}

test('page assistant uses the effective editorial guide and returns its exact limited source', async () => {
  let captured;
  const f = editorialFixture(async (context) => {
    captured = context;
    return { reply: 'Confira o POV.', action: null };
  });
  const result = await f.call();
  const expected = composeEditorialContract(f.contract).instruction;
  assert.equal(captured.context.editorial.instruction, expected);
  assert.deepEqual(result.editorialContext, {
    bookId: 'book',
    revision: 1,
    scope: 'editorial-contract-only',
    wholeBook: false,
    instruction: expected,
  });
  assert.equal(expected.includes('Antiga regra da voz'), false);
  assert.match(expected, /HIPÓTESES DE TRABALHO APROVADAS/);
  assert.match(expected, /Possível traição/);
  assert.equal(f.records.get('users/author').credits, 7);
  assert.equal(
    [...f.records.keys()].some((path) => path.includes('literaryContractVersions')),
    false,
  );
});

for (const mutation of ['changed', 'recreated', 'removed']) {
  test(`page assistant discards a response if its editorial guide is ${mutation} during generation`, async () => {
    const f = editorialFixture(async () => {
      const ref = f.db.doc('books/book/literaryProduction/current');
      const previous = structuredClone(f.records.get(ref.path));
      if (mutation === 'changed')
        await f.db.runTransaction(async (tx) =>
          tx.set(ref, {
            ...previous,
            contract: {
              ...previous.contract,
              fields: { ...previous.contract.fields, narrator: 'Outro POV' },
            },
          }),
        );
      else {
        await f.db.runTransaction(async (tx) => tx.delete(ref));
        if (mutation === 'recreated')
          await f.db.runTransaction(async (tx) => tx.create(ref, previous));
      }
      return { reply: 'Resposta obsoleta', action: null };
    });
    await assert.rejects(f.call(), { code: 'failed-precondition' });
    assert.equal(f.records.get('books/book').updatedAt, 10);
    assert.equal(f.records.get('users/author').credits, 7);
  });
}

test('page assistant never sends the private guide to another account', async () => {
  let calls = 0;
  const f = editorialFixture(async () => {
    calls++;
    return { reply: 'Private', action: null };
  });
  await assert.rejects(f.call('other'), { code: 'permission-denied' });
  assert.equal(calls, 0);
});
