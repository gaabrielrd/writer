import test from 'node:test';
import assert from 'node:assert/strict';
import { editorChatConversationFixture } from './helpers/editorChatConversationFixture.mjs';
import { uid, reason, signed } from './helpers/editorChatFixture.mjs';
import { readEditorChatConversation } from '../src/editorChatConversations.mjs';
const path = (f) => `users/${uid}/editorChats/${f.conversation.conversationId}`;

test('conversation bootstrap/create/rename use one durable catalog and historical receipts', async () => {
  const f = await editorChatConversationFixture();
  const initial = await f.call({ action: 'listConversations', ...f.resourceScope });
  assert.equal(initial.items.length, 1);
  assert.equal(initial.collectionRevision, 1);
  assert.equal(initial.platformModel, 'gemini-3.7-flash');
  const rename = await signed({
    action: 'renameConversation',
    ...f.scope,
    operationId: 'rename',
    expectedRevision: 1,
    title: '  Minha conversa  ',
  });
  const renamed = await f.call(rename);
  assert.equal(renamed.current.title, 'Minha conversa');
  assert.equal(renamed.current.revision, 2);
  const before = f.records.get(`users/${uid}/editorChatCatalogs/current`).revision;
  assert.deepEqual(await f.call(rename), { receipt: renamed.receipt, current: null });
  assert.equal(f.records.get(`users/${uid}/editorChatCatalogs/current`).revision, before);
  await assert.rejects(
    f.mutate({ ...rename, operationId: 'stale-rename' }),
    reason('revision-conflict'),
  );
  f.records.delete(f.path);
  f.events.length = 0;
  assert.deepEqual((await f.call(f.createRequest)).current, null);
  assert.equal(
    f.events.some((e) => e.path?.includes('turnBodies')),
    false,
  );
});

test('conversation pages are newest-first, token-bound and invalidated by catalog races', async () => {
  const f = await editorChatConversationFixture();
  for (let i = 0; i < 3; i++)
    await f.mutate({
      action: 'createConversation',
      ...f.resourceScope,
      operationId: 'create-' + i,
      conversationId: 'conversation-' + i,
      projectToken: f.conversation.projectToken,
      resourceToken: f.conversation.resourceToken,
    });
  const request = { action: 'listConversations', ...f.resourceScope, limit: 2 };
  const first = await f.call(request),
    second = await f.call({ ...request, cursor: first.nextCursor });
  assert.deepEqual(
    first.items.map((x) => x.conversationId),
    ['conversation-2', 'conversation-1'],
  );
  assert.deepEqual(
    second.items.map((x) => x.conversationId),
    ['conversation-0', 'conversation-first'],
  );
  assert.equal(second.nextCursor, null);
  await f.mutate({
    action: 'renameConversation',
    ...f.scope,
    operationId: 'rename-race',
    expectedRevision: 1,
    title: 'Alterada',
  });
  await assert.rejects(f.call({ ...request, cursor: first.nextCursor }), reason('cursor-stale'));
  await assert.rejects(
    f.call({
      ...request,
      projectToken: '0'.repeat(64),
      resourceToken: f.conversation.resourceToken,
    }),
    reason('identity-changed'),
  );
  await assert.rejects(f.call(request, 'other'), reason('source-unavailable'));
});

test('missing catalog with any existing control or tombstone fails instead of resetting revision', async () => {
  const f = await editorChatConversationFixture();
  f.records.delete(`users/${uid}/editorChatCatalogs/current`);
  await assert.rejects(
    f.call({ action: 'listConversations', ...f.resourceScope }),
    reason('inconsistent'),
  );
  const c = f.records.get(path(f));
  c.summary.state = 'deleted';
  c.summary.title = '';
  c.cleanupId = 'deletion';
  await assert.rejects(
    f.call({ action: 'listConversations', ...f.resourceScope }),
    reason('inconsistent'),
  );
});

test('turn pages return only metadata in descending date/ID order, then reject stale cursor', async () => {
  const f = await editorChatConversationFixture();
  for (const id of ['a', 'b', 'c']) await f.seedTurn(id, { createdAt: 3000 });
  const request = { action: 'listMessages', ...f.scope, limit: 2 };
  const first = await f.call(request);
  assert.deepEqual(
    first.items.map((x) => x.turnId),
    ['c', 'b'],
  );
  assert.equal(JSON.stringify(first).includes('Pergunta'), false);
  assert.equal(JSON.stringify(first).includes('Resposta'), false);
  const second = await f.call({ ...request, cursor: first.nextCursor });
  assert.deepEqual(
    second.items.map((x) => x.turnId),
    ['a'],
  );
  await f.seedTurn('d', { createdAt: 4000 });
  await assert.rejects(f.call({ ...request, cursor: first.nextCursor }), reason('cursor-stale'));
});

test('delete fences active metadata and bounded cleanup removes all flat orphans without body reads', async () => {
  const f = await editorChatConversationFixture();
  await f.seedTurn('active', { state: 'running' });
  f.records.get(path(f)).summary.activeTurnId = 'active';
  for (let i = 0; i < 100; i++)
    f.records.set(`${path(f)}/turnBodies/orphan-${String(i).padStart(3, '0')}`, {
      secret: 'revoked',
    });
  const deletion = await f.mutate({
    action: 'deleteConversation',
    ...f.scope,
    operationId: 'delete-conversation',
  });
  assert.equal(f.records.get(`${path(f)}/turns/active`).summary.state, 'stopped');
  assert.equal(f.records.get(path(f)).summary.activeTurnId, null);
  f.events.length = 0;
  await assert.rejects(f.get('active'), reason('conversation-unavailable'));
  assert.equal(
    f.events.some((e) => e.path?.includes('/turnQuestions/')),
    false,
  );
  let cleanup = deletion.current;
  for (let i = 0; i < 10 && cleanup.state !== 'deleted'; i++) {
    f.events.length = 0;
    cleanup = (
      await f.mutate({
        action: 'advanceCleanup',
        cleanupId: cleanup.cleanupId,
        cleanupToken: cleanup.cleanupToken,
        expectedRevision: cleanup.revision,
        operationId: 'cleanup-' + i,
      })
    ).current;
    assert.ok(
      f.events.filter((e) => ['set', 'update', 'create', 'delete'].includes(e.method)).length <= 50,
    );
    assert.equal(
      f.events.some(
        (e) => e.method === 'get' && /\/(turnBodies|turnQuestions)\//.test(e.path ?? ''),
      ),
      false,
    );
    for (const q of f.reads.filter((q) => q.collectionPath.startsWith(path(f))))
      assert.deepEqual(q.fields, []);
  }
  assert.equal(cleanup.state, 'deleted');
  assert.equal(cleanup.deletedDocuments, 103);
  const tomb = f.records.get(path(f));
  assert.equal(tomb.summary.title, '');
  assert.equal(tomb.summary.state, 'deleted');
  assert.equal([...f.records.keys()].filter((p) => p.startsWith(path(f) + '/')).length, 0);
  const bootstrap = await f.call({ action: 'listConversations', ...f.resourceScope });
  assert.equal(bootstrap.items.length, 0);
  await assert.rejects(
    f.mutate({ ...f.createRequest, operationId: 'cannot-recreate' }),
    reason('operation-conflict'),
  );
});

test('unknown create cancellation fences a late request and does not create a control', async () => {
  const f = await editorChatConversationFixture();
  const request = await signed({
    ...f.createRequest,
    operationId: 'late-create',
    conversationId: 'late-conversation',
  });
  const resolution = await f.call({
    action: 'resolveOperation',
    operationId: request.operationId,
    operationAction: request.action,
    requestHash: request.requestHash,
    intent: 'cancel',
  });
  assert.equal(resolution.receipt.outcome, 'canceled');
  assert.equal((await f.call(request)).receipt.outcome, 'canceled');
  assert.equal(f.records.has(`users/${uid}/editorChats/late-conversation`), false);
});

test('private control incarnation and scope are checked independently of revision', async () => {
  const f = await editorChatConversationFixture();
  const read = () =>
    f.db.runTransaction((tx) =>
      readEditorChatConversation(
        tx,
        f.db,
        uid,
        f.conversation.conversationId,
        f.conversation.conversationToken,
        f.resourceScope,
      ),
    );
  assert.equal((await read()).summary.revision, 1);
  f.records.get(path(f)).birthNonce = '4'.repeat(64);
  await assert.rejects(read(), reason('inconsistent'));
});
