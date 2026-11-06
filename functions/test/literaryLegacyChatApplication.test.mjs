import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { studioDb } from './helpers/studioDb.mjs';
import { createChapterChatService } from '../src/chapterChat.mjs';
import { workScope, digest } from '../src/workProgressContracts.mjs';
import { readLiteraryImpactBookInventoryPage } from '../src/literaryImpactInventory.mjs';
import { verifyLiteraryImpactInventoryLink } from '../src/literaryImpactRecordVerification.mjs';
import { literaryImpactLinkKey } from '../src/literaryImpactProtocol.mjs';
const sha = (s) => createHash('sha256').update(s).digest('hex'),
  target = { kind: 'book', id: 'book' },
  identity = { bookId: 'book', chapterId: 'chapter', conversationId: 'conversation' },
  parent = 'users/author/chapterChats/book/chapters/chapter/conversations/conversation';
async function fixture() {
  const f = studioDb();
  f.records.set('books/book', { authorId: 'author', title: 'PRIVATE TITLE', updatedAt: 1 });
  f.records.set('books/book/chapters/chapter', {
    bookId: 'book',
    content: '<p>Texto</p>',
    updatedAt: 1,
    wordCount: 1,
  });
  f.records.set('users/author', { credits: 5 });
  const service = createChapterChatService({
      db: f.db,
      now: () => 1000,
      generator: async () => 'PRIVATE ANSWER [[SUGESTAO]]Novo texto[[/SUGESTAO]]',
    }),
    call = (data) => service.chapterChat('author', { ...identity, ...data }),
    c = workScope(f.db, 'author', { target }, []);
  await call({ action: 'create' });
  const message = await call({
    action: 'send',
    requestId: 'message',
    messageInstance: 'intent',
    text: 'PRIVATE QUESTION',
    context: {
      source: 'selection',
      text: 'PRIVATE INPUT',
      surrounding: '',
      title: 'PRIVATE TITLE',
      bookTitle: 'PRIVATE TITLE',
      target: { hash: sha('<p>Texto</p>'), from: 1, to: 6 },
      truncated: false,
      persona: { instruction: 'PRIVATE PERSONA', version: '' },
      lore: [],
    },
  });
  const apply = {
      action: 'apply',
      requestId: 'accept',
      messageId: 'message',
      messageInstance: message.messageInstance,
      generationAttempt: message.generationAttempt,
      suggestionHash: sha(message.suggestion),
      expectedHash: sha('<p>Texto</p>'),
      sourceHash: sha('<p>Texto</p>'),
      after: '<p>Novo texto</p>',
      retarget: false,
    },
    read = () =>
      f.db.runTransaction((tx) =>
        readLiteraryImpactBookInventoryPage(tx, c, {
          bookId: 'book',
          collection: 'literaryLegacyChatApplications',
        }),
      ),
    verify = (item, link) =>
      f.db.runTransaction((tx) =>
        verifyLiteraryImpactInventoryLink(tx, c, {
          bookId: 'book',
          collection: item.record.collection,
          recordId: item.record.id,
          recordToken: item.recordToken,
          linkId: digest(literaryImpactLinkKey(link)),
        }),
      );
  return { ...f, call, apply, read, verify };
}
test('legacy acceptance binds metadata to atomic manuscript/credit/receipt and survives conversation deletion', async () => {
  const f = await fixture(),
    result = await f.call(f.apply),
    item = (await f.read()).items[0],
    link = item.links.find((link) => link.relation === 'target');
  assert.ok(link);
  assert.equal(result.credits, 4);
  assert.equal(f.records.get('books/book/chapters/chapter').content, f.apply.after);
  assert.equal(
    JSON.stringify(
      f.records.get('books/book/literaryLegacyChatApplications/' + item.record.id),
    ).includes('PRIVATE'),
    false,
  );
  let proof = await f.verify(item, link);
  assert.equal(proof.status, 'current');
  assert.equal(proof.liveSourceAvailable, true);
  await f.call({ action: 'delete', mutationId: 'remove' });
  assert.equal(f.records.has(parent), false);
  assert.deepEqual(await f.call(f.apply), result);
  assert.equal(f.records.get('users/author').credits, 4);
  const preserved = (await f.read()).items[0];
  proof = await f.verify(
    preserved,
    preserved.links.find((link) => link.relation === 'target'),
  );
  assert.equal(proof.status, 'preserved');
  assert.equal(proof.liveSourceAvailable, false);
  assert.equal(proof.derivedBodyAuthorized, false);
  assert.equal(proof.currentManuscriptEquivalence, 'not-checked');
  assert.equal(proof.byteIntegrityChecked, false);
});
test('same IDs recreated after deletion retain historical evidence without adopting the new response', async () => {
  const f = await fixture();
  await f.call(f.apply);
  await f.call({ action: 'delete', mutationId: 'remove' });
  await f.call({ action: 'create' });
  f.records.set(parent + '/messages/message', {
    id: 'message',
    role: 'assistant',
    state: 'done',
    messageInstance: 'new-intent',
    generationAttempt: 'new-attempt',
    suggestionHash: f.apply.suggestionHash,
    text: 'PRIVATE NEW RESPONSE',
    suggestion: 'PRIVATE NEW SUGGESTION',
  });
  const readStart = f.metadataReads.length;
  const item = (await f.read()).items[0],
    proof = await f.verify(
      item,
      item.links.find((link) => link.relation === 'target'),
    );
  assert.equal(proof.status, 'preserved');
  assert.equal(proof.liveSourceAvailable, false);
  for (const read of f.metadataReads
    .slice(readStart)
    .filter((entry) => entry.path === parent + '/messages/message'))
    assert.equal(
      read.fields.some((field) => ['text', 'suggestion', 'history', 'context'].includes(field)),
      false,
    );
});
test('altered durable receipt or recreated destination invalidates the accepted provenance record', async () => {
  for (const change of ['receipt', 'destination']) {
    const f = await fixture();
    await f.call(f.apply);
    if (change === 'receipt')
      f.records.get(
        'users/author/chapterChats/book/chapters/chapter/receipts/accept',
      ).literaryApplication.metadataToken = 'a'.repeat(64);
    else f.metadata.set('books/book/chapters/chapter', { createdAt: 99999 });
    const item = (await f.read()).items[0];
    assert.equal(item.links.length, 0);
    assert.ok(item.issues.length > 0);
  }
});
test('failure to persist provenance rolls back the native writer, credit and receipt', async () => {
  const f = await fixture(),
    snapshot = structuredClone([...f.records]),
    run = f.db.runTransaction.bind(f.db);
  f.db.runTransaction = (work) =>
    run((tx) =>
      work({
        ...tx,
        create(ref, value) {
          if (ref.path.includes('/literaryLegacyChatApplications/'))
            throw new Error('Storage unavailable');
          tx.create(ref, value);
        },
      }),
    );
  await assert.rejects(f.call(f.apply), /Storage unavailable/);
  assert.deepEqual([...f.records], snapshot);
});
test('unconfirmed acceptance rejects missing, stale or altered source proof without charging', async () => {
  const f = await fixture();
  for (const alter of [
    { messageInstance: undefined },
    { generationAttempt: 'older' },
    { suggestionHash: sha('Another suggestion') },
  ]) {
    const snapshot = structuredClone([...f.records]);
    await assert.rejects(f.call({ ...f.apply, ...alter }), { code: 'failed-precondition' });
    assert.deepEqual([...f.records], snapshot);
  }
});
