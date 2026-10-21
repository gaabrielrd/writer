import type { ChatGenerationRequest } from './chatGeneration';
import type {
  EditorChatAction,
  EditorChatReceipt,
  EditorChatContextSummary,
  EditorChatContextInspection,
  EditorChatConversationSummary,
  EditorChatConversationPage,
  EditorChatTurnPage,
  EditorChatTurnRead,
  EditorChatTurnSummary,
  EditorChatCleanupSummary,
  EditorChatOperationRow,
  EditorChatByokInput,
} from './editorChat';
import type { EditorChatFailureReason } from '../../../../functions/src/editorChatContracts.mjs';
import type { EditorChatHost } from './editorChatHost';
import type { EditorChatCaptureSource } from './editorChatEditorBridge';

export type EditorChatControllerReadStatus = 'idle' | 'loading' | 'ready' | 'error';
export interface EditorChatControllerError {
  code: string;
  reason: EditorChatFailureReason | null;
  uncertain: boolean;
}
export interface EditorChatControlReference {
  id: string;
  token: string;
}
export interface EditorChatControllerState {
  scopeKey: string;
  catalogStatus: EditorChatControllerReadStatus;
  messagesStatus: EditorChatControllerReadStatus;
  conversations: EditorChatConversationSummary[];
  catalog: EditorChatConversationPage | null;
  conversation: EditorChatConversationSummary | null;
  conversationRef: EditorChatControlReference | null;
  messagePage: EditorChatTurnPage | null;
  turns: EditorChatTurnSummary[];
  questions: Record<string, string>;
  turnReads: Record<string, EditorChatTurnRead>;
  context: EditorChatContextSummary | null;
  contextRef: EditorChatControlReference | null;
  inspection: EditorChatContextInspection | null;
  needsInspection: boolean;
  cleanup: EditorChatCleanupSummary | null;
  cleanupRef: EditorChatControlReference | null;
  draft: string;
  stream: { turn: EditorChatTurnSummary; text: string } | null;
  byokInput: EditorChatByokInput | null;
  pending: EditorChatOperationRow | null;
  lastReceipt: EditorChatReceipt | null;
  busyAction: EditorChatAction | 'capture' | null;
  error: EditorChatControllerError | null;
}
export interface UseEditorChatOptions {
  uid: string;
  host: EditorChatHost;
  enabled?: boolean;
  /** A local invalidation hint, never an authorization proof. */
  invalidationKey?: string | number;
}
export interface EditorChatByokControl {
  readonly conversationId: string;
  readonly conversationToken: string;
  readonly turnId: string;
  readonly attemptToken: string;
}
export interface EditorChatController {
  state: EditorChatControllerState;
  hasUnsentDraft: boolean;
  setDraft(this: void, text: string): void;
  refreshConversations(this: void): Promise<void>;
  loadMoreConversations(this: void): Promise<void>;
  createConversation(this: void): Promise<void>;
  selectConversation(this: void, id: string): Promise<void>;
  renameConversation(this: void, title: string): Promise<void>;
  loadMoreMessages(this: void): Promise<void>;
  readTurn(this: void, id: string): Promise<void>;
  prepareContext(this: void, source: EditorChatCaptureSource): Promise<void>;
  advanceContext(this: void): Promise<void>;
  inspectContext(this: void): Promise<void>;
  send(this: void, generation: ChatGenerationRequest): Promise<void>;
  recoverPending(this: void, intent: 'observe' | 'cancel'): Promise<void>;
  stopTurn(this: void): Promise<void>;
  getByokInput(
    this: void,
  ): Promise<{ control: EditorChatByokControl; input: EditorChatByokInput } | null>;
  completeBYOK(this: void, rawAnswer: string, control: EditorChatByokControl): Promise<void>;
  failBYOK(
    this: void,
    reason: 'provider-failed' | 'credential-unavailable' | 'user-stopped',
    control: EditorChatByokControl,
  ): Promise<void>;
  deleteContext(this: void): Promise<void>;
  deleteConversation(this: void): Promise<void>;
  advanceCleanup(this: void): Promise<void>;
  refreshKnownControl(this: void): Promise<void>;
  invalidateDerived(this: void): void;
}
