import test from 'node:test';
import assert from 'node:assert/strict';
import { editorChatGenerationFixture, byok } from './helpers/editorChatGenerationFixture.mjs';
import { uid, signed } from './helpers/editorChatFixture.mjs';
import { workScope, digest } from '../src/workProgressContracts.mjs';
import { literaryChatTurnIndexId } from '../src/literaryChatTurnIndex.mjs';
import { literaryChatContextIndexId } from '../src/literaryChatContextIndex.mjs';
import { readLiteraryImpactBookInventoryPage } from '../src/literaryImpactInventory.mjs';
import { verifyLiteraryImpactInventoryLink } from '../src/literaryImpactRecordVerification.mjs';
import { literaryImpactLinkKey } from '../src/literaryImpactProtocol.mjs';
import { createEditorChatContextService } from '../src/editorChatContext.mjs';
import { readLiteraryImpactFence } from '../src/literaryImpactFence.mjs';
function helpers(f) {
  const c = workScope(f.db, uid, { target: f.target }, []);
  const id = (turnId) => literaryChatTurnIndexId(uid, f.conversation.conversationId, turnId);
  const inventory = (turnId) =>
    f.db.runTransaction((tx) =>
      readLiteraryImpactBookInventoryPage(tx, c, {
        bookId: f.target.id,
        collection: 'literaryChatTurns',
        recordId: id(turnId),
      }),
    );
  const verify = (item, link) =>
    f.db.runTransaction((tx) =>
      verifyLiteraryImpactInventoryLink(tx, c, {
        bookId: f.target.id,
        collection: 'literaryChatTurns',
        recordId: item.record.id,
        recordToken: item.recordToken,
        linkId: digest(literaryImpactLinkKey(link)),
      }),
    );
  const fence = () =>
    f.db.runTransaction((tx) => readLiteraryImpactFence(tx, c, { bookIds: [f.target.id] }));
  return { c, id, inventory, verify, fence };
}
test('claim captures metadata only and history forms a verifiable dependency between assistant turns', async () => {
  const f = await editorChatGenerationFixture({ world: true }),
    h = helpers(f),
    firstRequest = await f.request({ id: 'impact-first' }),
    first = await f.generate(firstRequest);
  const firstPath = f.path + '/literaryChatTurns/' + h.id('impact-first');
  const record = f.records.get(firstPath);
  assert.ok(record);
  assert.equal(record.attemptToken, first.turn.attemptToken);
  assert.equal(record.contextOrigins.contextId, f.ready.contextId);
  assert.equal(record.contextOrigins.loreDependencies.length, 1);
  const metadata = JSON.stringify(record);
  for (const text of [
    'Pergunta própria',
    'Resposta',
    'Fato secreto',
    '[[SUGESTAO]]',
    'systemInstruction',
  ])
    assert.equal(metadata.includes(text), false);
  const clock = f.records.get(f.path).literaryDependencyRevision;
  await f.generate(firstRequest);
  assert.equal(f.records.get(f.path).literaryDependencyRevision, clock);
  const fresh = await f.fresh('impact-next-context');
  await f.generate(await f.request({ id: 'impact-second', context: fresh }));
  f.events.length = 0;
  const item = (await h.inventory('impact-second')).items[0];
  const edge = item.links.find((link) => link.capture?.scheme === 'native-chat-turn');
  assert.ok(edge);
  assert.equal(edge.from.id, h.id('impact-first'));
  assert.equal(edge.to.id, h.id('impact-second'));
  assert.equal(item.issues.includes('native-chat-history-origin-not-indexed'), false);
  const proof = await h.verify(item, edge);
  assert.equal(proof.status, 'current');
  assert.equal(proof.manuscriptRead, false);
  assert.equal(proof.editorialReview, false);
  assert.equal(
    f.events.some((event) => /\/(turnBodies|turnQuestions)\//.test(event.path ?? '')),
    false,
  );
  f.records.get(
    'users/' + uid + '/editorChats/' + f.conversation.conversationId + '/turns/impact-first',
  ).summary.attemptToken = 'f'.repeat(64);
  assert.equal((await h.verify(item, edge)).status, 'recreated');
});
test('removing the consumed input context does not erase the retained provenance of its assistant turn', async () => {
  const f = await editorChatGenerationFixture(),
    h = helpers(f);
  await f.generate(await f.request({ id: 'retained-turn' }));
  const contextApi = createEditorChatContextService({ db: f.db, now: () => 6000 });
  await contextApi.dispatch(
    uid,
    await signed({
      action: 'deleteContext',
      ...f.resourceScope,
      contextId: f.ready.contextId,
      contextToken: f.ready.contextToken,
      operationId: 'delete-input-context',
    }),
  );
  const contextIndex =
    f.path + '/literaryChatContexts/' + literaryChatContextIndexId(uid, f.ready.contextId);
  assert.equal(f.records.has(contextIndex), false);
  const item = (await h.inventory('retained-turn')).items[0];
  assert.ok(item.links.some((link) => link.capture?.scheme === 'native-chat-target'));
  assert.equal(item.issues.includes('native-chat-direct-context-not-indexed'), false);
});
test('unindexed historical turns are explicit even while their own native identity remains provable', async () => {
  const f = await editorChatGenerationFixture(),
    h = helpers(f);
  await f.seedTurn('legacy-history');
  await f.generate(await f.request({ id: 'legacy-consumer' }));
  const item = (await h.inventory('legacy-consumer')).items[0];
  assert.ok(item.issues.includes('native-chat-history-origin-not-indexed'));
  const edge = item.links.find((link) => link.capture?.scheme === 'native-chat-turn');
  assert.ok(edge);
  assert.equal((await h.verify(item, edge)).sourceIdentityVerified, true);
});
test('completion changes the impact fence through the native catalog without creating another dependency or debit', async () => {
  const f = await editorChatGenerationFixture(),
    h = helpers(f);
  const pending = await f.generate(await f.request({ id: 'byok-impact', generation: byok }));
  const before = await h.fence(),
    clock = f.records.get(f.path).literaryDependencyRevision;
  await f.generationMutate({
    action: 'completeBYOK',
    ...f.scope,
    turnId: pending.turn.turnId,
    attemptToken: pending.turn.attemptToken,
    operationId: 'byok-impact-complete',
    rawAnswer: 'PRIVATE BYOK ANSWER',
  });
  assert.notEqual((await h.fence()).token, before.token);
  assert.equal(f.records.get(f.path).literaryDependencyRevision, clock);
  assert.equal(f.records.has('users/' + uid + '/credits/current'), false);
});
test('deleting a conversation retires its candidates immediately and bounded cleanup removes turn indices', async () => {
  const f = await editorChatGenerationFixture(),
    h = helpers(f);
  await f.generate(await f.request({ id: 'cleanup-indexed-turn' }));
  const before = await h.fence(),
    deletion = await f.mutate({
      action: 'deleteConversation',
      ...f.scope,
      operationId: 'delete-indexed-conversation',
    });
  assert.notEqual((await h.fence()).token, before.token);
  const retired = (await h.inventory('cleanup-indexed-turn')).items[0];
  assert.deepEqual(retired.links, []);
  assert.deepEqual(retired.issues, []);
  let summary = deletion.current;
  for (let page = 0; page < 10 && summary.state !== 'deleted'; page++) {
    f.events.length = 0;
    summary = (
      await f.mutate({
        action: 'advanceCleanup',
        cleanupId: summary.cleanupId,
        cleanupToken: summary.cleanupToken,
        expectedRevision: summary.revision,
        operationId: 'cleanup-indexed-' + page,
      })
    ).current;
    assert.ok(
      f.events.filter((event) => ['set', 'update', 'create', 'delete'].includes(event.method))
        .length <= 50,
    );
    assert.equal(
      f.events.some(
        (event) =>
          event.method === 'get' && /\/(turnBodies|turnQuestions)\//.test(event.path ?? ''),
      ),
      false,
    );
  }
  assert.equal(summary.state, 'deleted');
  assert.equal(f.records.has(f.path + '/literaryChatTurns/' + h.id('cleanup-indexed-turn')), false);
  assert.equal(summary.deletedDocuments, 4);
});
