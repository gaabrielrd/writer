import test from 'node:test';
import assert from 'node:assert/strict';
import { studioDb } from './helpers/studioDb.mjs';
import { workScope } from '../src/workProgressContracts.mjs';
import {
  readLiteraryImpactNativeAuditPage,
  LITERARY_IMPACT_NATIVE_AUDIT,
} from '../src/literaryImpactNativeAudit.mjs';
import { readLiteraryImpactChatCatalog } from '../src/literaryImpactCatalog.mjs';
import { literaryChatContextIndexId } from '../src/literaryChatContextIndex.mjs';
import { literaryChatTurnIndexId } from '../src/literaryChatTurnIndex.mjs';
const uid = 'author',
  bookId = 'book',
  target = { kind: 'book', id: bookId },
  token = 'a'.repeat(64),
  sourceToken = 'b'.repeat(64),
  closureHash = 'c'.repeat(64);
function fixture() {
  const f = studioDb({ sharedBirth: true });
  f.records.set('books/book', { authorId: uid, updatedAt: 10 });
  const c = workScope(f.db, uid, { target }, []);
  const audit = async () => {
    let cursor = null;
    const items = [];
    for (let n = 0; n < 1000; n++) {
      const page = await f.db.runTransaction((tx) =>
        readLiteraryImpactNativeAuditPage(tx, c, { bookId, cursor }),
      );
      if (page.item) items.push(page.item);
      if (page.done) return items;
      cursor = page.cursor;
    }
    throw new Error('Census did not terminate.');
  };
  const section = (kind) => LITERARY_IMPACT_NATIVE_AUDIT.findIndex((spec) => spec.kind === kind);
  const one = (kind, afterPath = null) =>
    f.db.runTransaction((tx) =>
      readLiteraryImpactNativeAuditPage(tx, c, {
        bookId,
        cursor: { section: section(kind), afterPath },
      }),
    );
  return { ...f, c, audit, one };
}
function context(f, { indexed = true } = {}) {
  const id = 'context',
    resource = { kind: 'scene', id: 'scene' };
  f.records.set('users/author/editorChatContexts/' + id, {
    schemaVersion: 1,
    ownerId: uid,
    contextId: id,
    summary: { target, resource, contextToken: token, phase: 'ready' },
    source: { sourceToken },
    closureHash,
    cleanupId: null,
    privateBody: 'PRIVATE CONTEXT',
  });
  const indexId = literaryChatContextIndexId(uid, id),
    value = {
      version: 1,
      ownerId: uid,
      target,
      resource,
      contextId: id,
      contextToken: token,
      sourceToken,
      closureHash,
    };
  if (indexed) f.records.set('books/book/literaryChatContexts/' + indexId, value);
  return { id, indexId, value };
}
function conversation(f) {
  f.records.set('users/author/editorChatCatalogs/current', {
    schemaVersion: 1,
    ownerId: uid,
    revision: 1,
    updatedAt: 10,
  });
  f.records.set('users/author/editorChats/conversation', {
    schemaVersion: 1,
    ownerId: uid,
    conversationId: 'conversation',
    summary: {
      target,
      resource: { kind: 'scene', id: 'scene' },
      conversationToken: token,
      state: 'open',
    },
    cleanupId: null,
    title: 'PRIVATE CONVERSATION',
  });
}
const legacy = 'users/author/chapterChats/book/chapters/removed/conversations/missing/messages/old';
test('an empty native census terminates with no artificial unsupported record and never writes a catalog', async () => {
  const f = fixture(),
    before = structuredClone([...f.records]),
    items = await f.audit();
  assert.equal(items.length, 1);
  assert.deepEqual(items[0].issues, []);
  assert.deepEqual([...f.records], before);
});
test('orphan legacy messages are found without chapter or conversation parent documents and without reading answers', async () => {
  const f = fixture();
  f.records.set(legacy, {
    id: 'old',
    role: 'assistant',
    state: 'done',
    answer: 'PRIVATE OLD ANSWER',
    history: 'PRIVATE HISTORY',
  });
  const items = await f.audit(),
    found = items.find((item) => item.key === legacy);
  assert.ok(found);
  assert.ok(found.issues.includes('legacy-chat-message-unindexed-or-mismatched'));
  assert.ok(found.issues.includes('legacy-chat-message-parent-unavailable'));
  assert.equal(found.facts.sourceAvailable, false);
  assert.equal(found.link.relation, 'subject');
  assert.equal(found.facts.manuscriptRead, false);
  assert.equal(found.facts.sourceIdentityVerified, false);
  assert.equal(JSON.stringify(items).includes('PRIVATE'), false);
  assert.ok(f.reads.filter((row) => row.group).every((row) => row.maximum === 1));
  assert.ok(
    f.metadataReads.every(
      (row) =>
        !row.fields.some((field) =>
          ['answer', 'history', 'question', 'privateBody', 'frozen'].includes(field),
        ),
    ),
  );
});
test('collection-group bounds exclude neighboring UIDs even when their IDs share a prefix', async () => {
  const f = fixture();
  f.records.set(legacy, { id: 'old', role: 'assistant' });
  f.records.set(legacy.replace('users/author/', 'users/author0/'), {
    id: 'other',
    role: 'assistant',
    answer: 'OTHER ACCOUNT',
  });
  const items = await f.audit();
  assert.equal(items.filter((item) => item.key.includes('/messages/')).length, 1);
  assert.ok(items.every((item) => !item.key.startsWith('users/author0/')));
  assert.equal(
    f.reads
      .filter((row) => row.group && row.collectionPath === 'messages')
      .reduce((sum, row) => sum + row.count, 0),
    1,
  );
});
test('native sources explicitly belonging to another book or an adventure do not create gaps in this book', async () => {
  const f = fixture();
  context(f, { indexed: false });
  const row = f.records.get('users/author/editorChatContexts/context');
  row.summary.target = { kind: 'adventure', id: 'other' };
  const items = await f.audit(),
    found = items.find((item) => item.key.endsWith('/context'));
  assert.equal(found.relevant, false);
  assert.deepEqual(found.issues, []);
  assert.equal(found.link, null);
});
test('context audit crosses native tokens and indexed metadata without promoting current data into a historical capture', async () => {
  const f = fixture();
  context(f);
  const first = (await f.one('contexts')).item;
  assert.deepEqual(first.issues, []);
  f.records.get('users/author/editorChatContexts/context').summary.contextToken = 'd'.repeat(64);
  const changed = (await f.one('contexts')).item;
  assert.ok(changed.issues.includes('native-chat-context-unindexed-or-mismatched'));
  assert.notEqual(changed.token, first.token);
});
test('a native context with no book-side index is a concrete coverage gap rather than an empty inventory', async () => {
  const f = fixture();
  context(f, { indexed: false });
  const found = (await f.one('contexts')).item;
  assert.ok(found.issues.includes('native-chat-context-unindexed-or-mismatched'));
  assert.equal(found.link.from.kind, 'book');
  assert.equal(found.link.to.kind, 'chat');
});
test('an index recreated under identical metadata changes the native audit proof', async () => {
  const f = fixture(),
    { indexId } = context(f),
    first = (await f.one('contexts')).item;
  f.metadata.set('books/book/literaryChatContexts/' + indexId, { createdAt: 50, updatedAt: 50 });
  assert.notEqual((await f.one('contexts')).item.token, first.token);
});
test('orphan native turns and their body/question sidecars are located without loading private text', async () => {
  const f = fixture(),
    base = 'users/author/editorChats/missing/';
  f.records.set(base + 'turns/turn', {
    schemaVersion: 1,
    ownerId: uid,
    conversationId: 'missing',
    conversationToken: token,
    turnId: 'turn',
    summary: { attemptToken: token, sourceToken },
    closureHash,
    answer: 'PRIVATE ANSWER',
  });
  for (const kind of ['turnBodies', 'turnQuestions'])
    f.records.set(base + kind + '/turn', {
      schemaVersion: 1,
      ownerId: uid,
      conversationId: 'missing',
      conversationToken: token,
      turnId: 'turn',
      attemptToken: token,
      question: 'PRIVATE QUESTION',
      answer: 'PRIVATE BODY',
    });
  const items = await f.audit();
  assert.ok(
    items.some((item) => item.issues.includes('native-chat-turn-parent-or-scope-unproven')),
  );
  assert.equal(
    items.filter((item) => item.issues.includes('native-chat-turn-sidecar-orphan-or-mismatched'))
      .length,
    2,
  );
  assert.equal(JSON.stringify(items).includes('PRIVATE'), false);
});
test('a matching native turn requires the exact conversation and turn index tokens', async () => {
  const f = fixture();
  conversation(f);
  const path = 'users/author/editorChats/conversation/turns/turn';
  f.records.set(path, {
    schemaVersion: 1,
    ownerId: uid,
    conversationId: 'conversation',
    conversationToken: token,
    turnId: 'turn',
    summary: { attemptToken: token, sourceToken },
    closureHash,
  });
  const indexId = literaryChatTurnIndexId(uid, 'conversation', 'turn');
  f.records.set('books/book/literaryChatTurns/' + indexId, {
    version: 1,
    ownerId: uid,
    target,
    conversationId: 'conversation',
    conversationToken: token,
    turnId: 'turn',
    attemptToken: token,
    sourceToken,
    closureHash,
  });
  assert.deepEqual((await f.one('turns')).item.issues, []);
  f.records.get(path).conversationToken = 'e'.repeat(64);
  assert.ok(
    (await f.one('turns')).item.issues.includes('native-chat-turn-parent-or-scope-unproven'),
  );
});
test('a context body without its header is reported without inspecting frozen context or author instructions', async () => {
  const f = fixture();
  f.records.set('users/author/editorChatContextBodies/body', {
    schemaVersion: 1,
    ownerId: uid,
    contextId: 'body',
    contextToken: token,
    frozen: { instruction: 'PRIVATE INSTRUCTION' },
  });
  const found = (await f.one('context-bodies')).item;
  assert.ok(found.issues.includes('native-chat-context-body-orphan-or-mismatched'));
  assert.equal(JSON.stringify(found).includes('PRIVATE'), false);
});
test('an old native conversation without a catalog remains explicitly untracked, without repairing the missing clock', async () => {
  const f = fixture();
  conversation(f);
  f.records.delete('users/author/editorChatCatalogs/current');
  const before = structuredClone([...f.records]);
  const observation = await f.db.runTransaction((tx) =>
    readLiteraryImpactChatCatalog(tx, f.db, uid),
  );
  assert.equal(observation.tracked, false);
  const items = await f.audit();
  assert.ok(items.some((item) => item.issues.includes('native-chat-catalog-missing')));
  assert.deepEqual([...f.records], before);
});
test('a malformed existing native catalog still fails closed rather than being replaced by a synthetic observation', async () => {
  const f = fixture();
  f.records.set('users/author/editorChatCatalogs/current', {
    schemaVersion: 1,
    ownerId: 'other',
    revision: 1,
    updatedAt: 10,
  });
  await assert.rejects(f.db.runTransaction((tx) => readLiteraryImpactChatCatalog(tx, f.db, uid)));
});
test('an applied native operation with no recoverable parent or index remains an unscoped gap without reading its payload', async () => {
  const f = fixture();
  f.records.set('users/author/editorChatOperations/apply', {
    schemaVersion: 1,
    ownerId: uid,
    operationId: 'apply',
    action: 'applySuggestion',
    state: 'settled',
    requestHash: token,
    receipt: {
      action: 'applySuggestion',
      outcome: 'confirmed',
      result: {
        kind: 'apply',
        conversationId: 'gone',
        conversationToken: token,
        turnId: 'turn',
        contentHash: token,
        revision: 1,
      },
    },
    payload: 'PRIVATE APPLIED PROSE',
  });
  const item = (await f.one('operations')).item;
  assert.ok(item.issues.includes('native-chat-application-scope-or-index-unproven'));
  assert.equal(JSON.stringify(item).includes('PRIVATE'), false);
});
test('legacy application receipts without the matching companion marker cannot certify indexed coverage', async () => {
  const f = fixture();
  f.records.set('users/author/chapterChats/book/chapters/gone/receipts/apply', {
    fingerprint: token,
    result: { updatedAt: 10, wordCount: 2, credits: 1 },
    after: 'PRIVATE APPLIED PROSE',
  });
  const item = (await f.one('legacy-receipts')).item;
  assert.ok(item.issues.includes('legacy-chat-application-unindexed-or-mismatched'));
  assert.equal(JSON.stringify(item).includes('PRIVATE'), false);
});
test('private cursors cannot change account, collection group or add fields to skip a census segment', async () => {
  const f = fixture();
  await assert.rejects(f.one('turns', 'users/other/editorChats/a/turns/b'), {
    code: 'failed-precondition',
  });
  await assert.rejects(f.one('turns', 'users/author/editorChats/a/messages/b'), {
    code: 'failed-precondition',
  });
  await assert.rejects(
    f.db.runTransaction((tx) =>
      readLiteraryImpactNativeAuditPage(tx, f.c, {
        bookId,
        cursor: { section: 0, afterPath: null, grant: true },
      }),
    ),
    { code: 'failed-precondition' },
  );
});
