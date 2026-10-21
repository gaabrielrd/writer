import {
  editorChatFail,
  editorChatSourceId,
  verifyEditorChatRequest,
} from './editorChatContracts.mjs';
import {
  createEditorChatContextService,
  EDITOR_CHAT_CONTEXT_ACTIONS,
} from './editorChatContext.mjs';
import {
  createEditorChatConversationsService,
  EDITOR_CHAT_CONVERSATION_ACTIONS,
} from './editorChatConversations.mjs';
import {
  createEditorChatGenerationService,
  EDITOR_CHAT_GENERATION_ACTIONS,
} from './editorChatGeneration.mjs';
import { createEditorChatApplyService } from './editorChatApply.mjs';

/** Callable composition. Factories retain all authorization and transaction boundaries. */
export function createEditorChatService(options) {
  const context = createEditorChatContextService(options);
  const conversations = createEditorChatConversationsService(options);
  const generation = createEditorChatGenerationService(options);
  const apply = createEditorChatApplyService(options);
  return {
    async dispatch(uid, data, transport = {}) {
      if (!uid) editorChatFail('auth-required');
      editorChatSourceId(uid);
      const request = await verifyEditorChatRequest(data);
      if (request.action === 'advanceCleanup') return conversations.dispatch(uid, request);
      if (EDITOR_CHAT_CONTEXT_ACTIONS.includes(request.action))
        return context.dispatch(uid, request);
      if (EDITOR_CHAT_CONVERSATION_ACTIONS.includes(request.action))
        return conversations.dispatch(uid, request);
      if (EDITOR_CHAT_GENERATION_ACTIONS.includes(request.action))
        return generation.dispatch(uid, request, transport);
      if (request.action === 'applySuggestion') return apply.dispatch(uid, request);
      editorChatFail('invalid-request');
    },
  };
}
