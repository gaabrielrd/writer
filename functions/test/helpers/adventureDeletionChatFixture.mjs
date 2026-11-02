import assert from 'node:assert/strict';
import { createStudioService } from '../../src/studio.mjs';
import { createScenesService } from '../../src/scenes.mjs';
import { createWorkHistoryService } from '../../src/workHistory.mjs';
import { createEditorChatContextService } from '../../src/editorChatContext.mjs';
import { createEditorChatConversationsService } from '../../src/editorChatConversations.mjs';
import { createEditorChatGenerationService } from '../../src/editorChatGeneration.mjs';
import { signed } from './editorChatFixture.mjs';
/** Synthetic authoring input, with real producer transactions on either fixture or SDK database. */
export async function createDeletionChat(
  db,
  {
    uid = 'author',
    kind = 'adventure',
    prefix = 'deletion-chat-fixture',
    withTurn = true,
    generation = 'platform',
  } = {},
) {
  const target = { kind, id: prefix + '-project' },
    now = Date.now();
  if (kind === 'adventure')
    await createStudioService({ db }).createAdventure(uid, {
      operationId: target.id,
      title: 'Own fixture project',
    });
  else
    await db.runTransaction(async (tx) =>
      tx.create(db.doc('books/' + target.id), {
        authorId: uid,
        title: 'Own fixture book',
        wordCount: 0,
        createdAt: now,
        updatedAt: now,
      }),
    );
  const scene = (
      await createScenesService({ db }).createScene(uid, {
        target,
        operationId: prefix + '-scene',
        parentId: null,
        title: 'Own scene',
        content: '<p>Private fixture manuscript</p>',
      })
    ).scene,
    scope = { target, resource: { kind: 'scene', id: scene.id } },
    source = await createWorkHistoryService({ db }).getWorkVersionSource(uid, scope),
    contextApi = createEditorChatContextService({ db }),
    contextId = prefix + '-context';
  let context = (
    await contextApi.dispatch(
      uid,
      await signed({
        action: 'prepareContext',
        ...scope,
        operationId: contextId,
        contextId,
        base: {
          sourceToken: source.sourceToken,
          revision: source.revision,
          bodyHash: source.contentHash,
        },
        capture: {
          source: 'selection',
          editorHash: 'a'.repeat(64),
          from: 0,
          to: 5,
          text: 'Aria',
          surroundingText: '',
          truncated: false,
        },
      }),
    )
  ).current;
  for (let n = 0; ['local', 'global'].includes(context.phase); n++) {
    assert.ok(n < 100);
    context = (
      await contextApi.dispatch(
        uid,
        await signed({
          action: 'advanceContext',
          ...scope,
          operationId: prefix + '-context-advance-' + n,
          contextId,
          contextToken: context.contextToken,
          expectedRevision: context.revision,
        }),
      )
    ).current;
  }
  assert.equal(context.phase, 'ready');
  const conversations = createEditorChatConversationsService({ db }),
    page = await conversations.dispatch(uid, { action: 'listConversations', ...scope }),
    conversation = (
      await conversations.dispatch(
        uid,
        await signed({
          action: 'createConversation',
          ...scope,
          operationId: prefix + '-create-conversation',
          conversationId: prefix + '-conversation',
          projectToken: page.projectToken,
          resourceToken: page.resourceToken,
        }),
      )
    ).current,
    turnScope = {
      ...scope,
      conversationId: conversation.conversationId,
      conversationToken: conversation.conversationToken,
    },
    generationApi = createEditorChatGenerationService({
      db,
      generator: async () => 'Private answer [[SUGESTAO]]Own suggestion[[/SUGESTAO]]',
    });
  let turn = null;
  if (withTurn)
    turn = (
      await generationApi.dispatch(
        uid,
        await signed({
          action: 'send',
          ...turnScope,
          operationId: prefix + '-turn',
          contextId,
          contextToken: context.contextToken,
          expectedContextRevision: context.revision,
          expectedConversationRevision: conversation.revision,
          prompt: '  Own private question\n',
          generation:
            generation === 'platform'
              ? { version: 1, provider: 'platform', model: null, reasoning: 'auto' }
              : { version: 1, provider: 'openai_byok', model: 'gpt-4o-mini', reasoning: 'auto' },
        }),
      )
    ).turn;
  const parent = 'users/' + uid + '/editorChats/' + conversation.conversationId;
  return {
    target,
    scope,
    turnScope,
    context,
    conversation,
    turn,
    parent,
    contextApi,
    conversations,
    generationApi,
    bodyPath: turn && parent + '/turnBodies/' + turn.turnId,
    questionPath: turn && parent + '/turnQuestions/' + turn.turnId,
    contextBodyPath: 'users/' + uid + '/editorChatContextBodies/' + contextId,
  };
}
