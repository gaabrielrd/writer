import {
  normalizeEditorChatRequest as normalizeRequest,
  type EditorChatRequest as WireRequest,
  type EditorChatAction,
  type EditorChatMutation,
  type EditorChatMutationAction,
  type EditorChatContextSummary,
  type EditorChatConversationSummary,
  type EditorChatTurnSummary,
  type EditorChatCleanupSummary,
  type EditorChatPersonaBinding,
  type EditorChatApplyResult,
  type EditorChatDTOMap,
  type EditorChatJournal,
} from '../../../../functions/src/editorChatContracts.mjs';

export {
  EditorChatContractError,
  EDITOR_CHAT_LIMITS,
  EDITOR_CHAT_FAILURE_REASONS,
  canonicalEditorChatJSON,
  editorChatRequestHash,
  editorChatHash,
  editorChatTextHash,
  normalizeEditorChatReceipt,
  normalizeEditorChatDTO,
} from '../../../../functions/src/editorChatContracts.mjs';
export type {
  EditorChatAction,
  EditorChatMutationAction,
  EditorChatTarget,
  EditorChatResource,
  EditorChatScope,
  EditorChatJournalScope,
  EditorChatBase,
  EditorChatCapture,
  EditorChatReference,
  EditorChatStamp,
  EditorChatContextPhase,
  EditorChatTurnState,
  EditorChatCleanupPhase,
  EditorChatSource,
  EditorChatContextSummary,
  EditorChatConversationSummary,
  EditorChatTurnSummary,
  EditorChatLoreSnapshot,
  EditorChatPersonaSnapshot,
  EditorChatFrozenContext,
  EditorChatClosure,
  EditorChatHistorySummary,
  EditorChatFreshness,
  EditorChatTurnRead,
  EditorChatCleanupSummary,
  EditorChatPersonaComplement,
  EditorChatPersonaBindingValue,
  EditorChatPersonaBinding,
  EditorChatApplyResult,
  EditorChatReceipt,
  EditorChatReceiptResult,
  EditorChatMutation,
  EditorChatResolution,
  EditorChatByokInput,
  EditorChatSendResult,
  EditorChatDTOMap,
} from '../../../../functions/src/editorChatContracts.mjs';

export type EditorChatRequest<A extends EditorChatAction = EditorChatAction> = Extract<
  WireRequest,
  { action: A }
>;
export type EditorChatReadAction = Exclude<
  EditorChatAction,
  EditorChatMutationAction | 'resolveOperation'
>;
export type EditorChatOperationRow = EditorChatJournal;
export type EditorChatStreamEvent = EditorChatDTOMap['streamEvent'];
export type EditorChatConversationPage = EditorChatDTOMap['conversationPage'];
export type EditorChatTurnPage = EditorChatDTOMap['turnPage'];
export type EditorChatContextInspection = EditorChatDTOMap['contextInspection'];
export type EditorChatByokRead = EditorChatDTOMap['byokRead'];
export interface EditorChatResponseMap {
  prepareContext: EditorChatMutation<EditorChatContextSummary>;
  advanceContext: EditorChatMutation<EditorChatContextSummary>;
  getContext: EditorChatContextSummary;
  inspectContext: EditorChatContextInspection;
  listConversations: EditorChatConversationPage;
  createConversation: EditorChatMutation<EditorChatConversationSummary>;
  renameConversation: EditorChatMutation<EditorChatConversationSummary>;
  getAdventurePersonaBinding: EditorChatPersonaBinding;
  setAdventurePersonaBinding: EditorChatMutation<EditorChatPersonaBinding>;
  listMessages: EditorChatTurnPage;
  send: EditorChatDTOMap['sendResult'];
  getTurn: EditorChatDTOMap['turnRead'];
  getByokInput: EditorChatByokRead;
  stopTurn: EditorChatMutation<EditorChatTurnSummary>;
  completeBYOK: EditorChatMutation<EditorChatTurnSummary>;
  failBYOK: EditorChatMutation<EditorChatTurnSummary>;
  applySuggestion: EditorChatMutation<EditorChatApplyResult>;
  resolveOperation: EditorChatDTOMap['resolution'];
  deleteContext: EditorChatMutation<EditorChatCleanupSummary>;
  deleteConversation: EditorChatMutation<EditorChatCleanupSummary>;
  advanceCleanup: EditorChatMutation<EditorChatCleanupSummary>;
  getCleanup: EditorChatCleanupSummary;
}

/** Public browser adapter; all wire validation stays in the shared pure contract. */
export function normalizeEditorChatRequest<A extends EditorChatAction = EditorChatAction>(
  value: unknown,
): EditorChatRequest<A> {
  return normalizeRequest(value) as EditorChatRequest<A>;
}
