import test from 'node:test';
import assert from 'node:assert/strict';
import { studioDb } from './helpers/studioDb.mjs';
import { createLiteraryAutocompleteService } from '../src/literaryAutocomplete.mjs';
import { createLiteraryProductionService } from '../src/literaryProduction.mjs';
import { emptyEditorialContract } from '../src/literaryContracts.mjs';
import { readBookChapterText } from '../src/bookChapterText.mjs';
import { digest } from '../src/workProgressContracts.mjs';
const target = { kind: 'book', id: 'book' },
  before = '<p>Uma carta chegou.</p>',
  after = '<p>Uma carta chegou. Ela abriu a carta.</p>';
const id = (n) => 'autocomplete-operation-' + String(n).padStart(4, '0');
function fixture() {
  const f = studioDb();
  let calls = 0;
  f.records.set('books/book', {
    authorId: 'author',
    title: 'Livro',
    createdAt: 1,
    updatedAt: 100,
    wordCount: 3,
  });
  f.records.set('books/book/chapters/chapter', {
    bookId: 'book',
    title: 'A carta',
    order: 1,
    content: before,
    wordCount: 3,
    createdAt: 1,
    updatedAt: 100,
  });
  f.records.set('users/author', { credits: 5 });
  const api = createLiteraryAutocompleteService({
    db: f.db,
    now: () => 300,
    generator: async () => {
      calls++;
      return { text: 'Ela abriu a carta.' };
    },
  });
  return { ...f, api, calls: () => calls };
}
const request = (n = 1) => ({
  target,
  requestId: id(n),
  chapterId: 'chapter',
  beforeHash: digest(before),
  textBeforeCursor: 'Uma carta chegou.',
});
test('platform autocomplete is frozen and charged only in the atomic native application', async () => {
  const f = fixture(),
    input = request();
  const proposed = await f.api.prepareLiteraryAutocomplete('author', input);
  assert.equal(proposed.state, 'ready');
  assert.equal(f.calls(), 1);
  assert.equal(f.records.get('users/author').credits, 5);
  assert.equal((await f.api.prepareLiteraryAutocomplete('author', input)).text, proposed.text);
  assert.equal(f.calls(), 1);
  const apply = { target, requestId: input.requestId, operationId: id(10), after };
  const receipt = await f.api.applyLiteraryAutocomplete('author', apply);
  assert.equal(receipt.chargedCredits, 1);
  assert.equal(f.records.get('users/author').credits, 4);
  assert.equal(receipt.afterHash, digest(after));
  assert.equal(
    await f.db.runTransaction((tx) =>
      readBookChapterText(tx, f.db, {
        uid: 'author',
        bookId: 'book',
        chapterId: 'chapter',
        chapter: f.records.get('books/book/chapters/chapter'),
      }),
    ),
    after,
  );
  assert.deepEqual(await f.api.applyLiteraryAutocomplete('author', apply), receipt);
  assert.equal(f.records.get('users/author').credits, 4);
  assert.equal(JSON.stringify(receipt).includes(after), false);
});
test('BYOK receives canonical context and never calls the platform generator or debits', async () => {
  const f = fixture(),
    input = {
      ...request(),
      generation: {
        version: 1,
        provider: 'gemini_byok',
        model: 'gemini-3.7-flash',
        reasoning: 'auto',
      },
    };
  const prepared = await f.api.prepareLiteraryAutocomplete('author', input);
  assert.equal(prepared.state, 'prepared');
  assert.equal(f.calls(), 0);
  assert.ok(prepared.prompt);
  const ready = await f.api.completeLiteraryAutocomplete('author', {
    target,
    requestId: input.requestId,
    text: 'Ela abriu a carta.',
  });
  assert.equal(ready.applyCost, 0);
  const receipt = await f.api.applyLiteraryAutocomplete('author', {
    target,
    requestId: input.requestId,
    operationId: id(10),
    after,
  });
  assert.equal(receipt.chargedCredits, 0);
  assert.equal(f.records.get('users/author').credits, 5);
});
test('editorial changes invalidate an autocomplete without charging or overwriting', async () => {
  const f = fixture(),
    input = request();
  await f.api.prepareLiteraryAutocomplete('author', input);
  const contract = emptyEditorialContract();
  contract.fields.reservations = 'A carta só abre no próximo capítulo.';
  await createLiteraryProductionService({ db: f.db, now: () => 400 }).saveLiteraryContract(
    'author',
    {
      target,
      operationId: id(20),
      expectedRevision: 0,
      contract,
    },
  );
  assert.equal(
    (await f.api.getLiteraryAutocomplete('author', { target, requestId: input.requestId })).state,
    'stale',
  );
  await assert.rejects(
    f.api.applyLiteraryAutocomplete('author', {
      target,
      requestId: input.requestId,
      operationId: id(10),
      after,
    }),
    { code: 'failed-precondition' },
  );
  assert.equal(f.records.get('users/author').credits, 5);
});
test('cancel before prepare permanently fences a late producer', async () => {
  const f = fixture(),
    input = request();
  await f.api.cancelLiteraryAutocomplete('author', { target, requestId: input.requestId });
  assert.equal((await f.api.prepareLiteraryAutocomplete('author', input)).state, 'canceled');
  assert.equal(f.calls(), 0);
  f.records.delete('books/book/literaryAutocompleteRequests/' + input.requestId);
  assert.equal((await f.api.prepareLiteraryAutocomplete('author', input)).state, 'canceled');
});
test('expiry does not allow reusing the same request identity to regenerate', async () => {
  const f = fixture(),
    input = request();
  await f.api.prepareLiteraryAutocomplete('author', input);
  f.records.delete('books/book/literaryAutocompleteRequests/' + input.requestId);
  assert.equal((await f.api.prepareLiteraryAutocomplete('author', input)).state, 'expired');
  assert.equal(f.calls(), 1);
});
test('a missing insertion or a mismatched saved draft cannot consume credit', async () => {
  const f = fixture(),
    input = request();
  await f.api.prepareLiteraryAutocomplete('author', input);
  await assert.rejects(
    f.api.applyLiteraryAutocomplete('author', {
      target,
      requestId: input.requestId,
      operationId: id(10),
      after: before,
    }),
    { code: 'invalid-argument' },
  );
  f.records.set('books/book/chapters/chapter', {
    ...f.records.get('books/book/chapters/chapter'),
    content: '<p>Texto posterior.</p>',
  });
  await assert.rejects(
    f.api.applyLiteraryAutocomplete('author', {
      target,
      requestId: input.requestId,
      operationId: id(11),
      after,
    }),
    { code: 'failed-precondition' },
  );
  assert.equal(f.records.get('users/author').credits, 5);
});

test('abandon fences a delayed application without consuming credits', async () => {
  const f = fixture(),
    input = request();
  await f.api.prepareLiteraryAutocomplete('author', input);
  const command = { target, requestId: input.requestId, operationId: id(12) };
  assert.deepEqual(
    await f.api.getLiteraryAutocompleteApplication('author', { target, operationId: id(12) }),
    { state: 'unconfirmed' },
  );
  assert.deepEqual(await f.api.abandonLiteraryAutocompleteApplication('author', command), {
    state: 'canceled',
  });
  await assert.rejects(f.api.applyLiteraryAutocomplete('author', { ...command, after }), {
    code: 'failed-precondition',
  });
  assert.deepEqual(
    await f.api.getLiteraryAutocompleteApplication('author', { target, operationId: id(12) }),
    { state: 'canceled' },
  );
  assert.equal(f.records.get('users/author').credits, 5);
});
test('abandon after commit recovers the original receipt instead of denying a completed write', async () => {
  const f = fixture(),
    input = request();
  await f.api.prepareLiteraryAutocomplete('author', input);
  const command = { target, requestId: input.requestId, operationId: id(12) };
  const receipt = await f.api.applyLiteraryAutocomplete('author', { ...command, after });
  assert.deepEqual(await f.api.abandonLiteraryAutocompleteApplication('author', command), {
    state: 'confirmed',
    receipt,
  });
  assert.deepEqual(
    await f.api.getLiteraryAutocompleteApplication('author', { target, operationId: id(12) }),
    { state: 'confirmed', receipt },
  );
  assert.equal(f.records.get('users/author').credits, 4);
});

test('autocomplete delivery and application reject a recreated chapter even when ID and prose are identical', async () => {
  const f = fixture(),
    input = request(880);
  await f.api.prepareLiteraryAutocomplete('author', input);
  assert.ok(
    f.records.get('books/book/literaryAutocompleteRequests/' + input.requestId)
      .chapterIdentityToken,
  );
  const original = structuredClone(f.records.get('books/book/chapters/chapter'));
  f.metadata.set('books/book/chapters/chapter', { createdAt: 500, updatedAt: 500 });
  const current = await f.api.getLiteraryAutocomplete('author', {
    target,
    requestId: input.requestId,
  });
  assert.equal(current.state, 'revoked');
  assert.equal('text' in current, false);
  await assert.rejects(
    f.api.applyLiteraryAutocomplete('author', {
      target,
      requestId: input.requestId,
      operationId: id(881),
      after,
    }),
    { code: 'permission-denied' },
  );
  assert.deepEqual(f.records.get('books/book/chapters/chapter'), original);
  assert.equal(f.records.get('users/author').credits, 5);
});
test('an old autocomplete without chapter incarnation is stale and not silently upgraded', async () => {
  const f = fixture(),
    input = request(882);
  await f.api.prepareLiteraryAutocomplete('author', input);
  const path = 'books/book/literaryAutocompleteRequests/' + input.requestId;
  const record = f.records.get(path);
  delete record.chapterIdentityToken;
  f.records.set(path, record);
  const current = await f.api.getLiteraryAutocomplete('author', {
    target,
    requestId: input.requestId,
  });
  assert.equal(current.state, 'stale');
  assert.equal('text' in current, false);
  assert.equal(f.records.get(path).chapterIdentityToken, undefined);
  assert.equal(f.records.get('users/author').credits, 5);
});
