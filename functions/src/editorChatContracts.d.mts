import type { ChatGeneration, ChatGenerationRequest } from './chatGeneration.mjs';
export type EditorChatId = string;
export type EditorChatHash = string;
export type EditorChatTarget = { kind: 'book' | 'adventure'; id: string };
export type EditorChatResource = { kind: 'scene' | 'block'; id: string };
export type EditorChatReference = {
  kind: 'book' | 'adventure' | 'universe';
  scopeId: string;
  entityId: string;
};
export type EditorChatStamp = { seconds: number; nanoseconds: number };
export type EditorChatScope = { target: EditorChatTarget; resource: EditorChatResource };
export type EditorChatBase = { sourceToken: string; revision: number; bodyHash: string };
export type EditorChatCapture = {
  source: 'selection' | 'cursor' | 'viewport' | 'document';
  editorHash: string;
  from: number;
  to: number;
  text: string;
  surroundingText: string;
  truncated: boolean;
};
export type EditorChatContextPhase =
  'local' | 'global' | 'ready' | 'consumed' | 'stale' | 'canceled' | 'deleted';
export type EditorChatTurnState =
  'running' | 'awaiting-byok' | 'done' | 'stopped' | 'failed' | 'blocked';
export type EditorChatCleanupPhase =
  'context-body' | 'turn-bodies' | 'turn-questions' | 'turns' | 'complete';
export type EditorChatPersonaComplement = {
  personaId: string;
  overrides: { traitId: string; value: number }[];
};
export type EditorChatPersonaBindingValue =
  { personaId: string | null } | { personaComplement: EditorChatPersonaComplement | null };
export type EditorChatLeaf =
  | ({ kind: 'target'; projectToken: string; resourceToken: string } & EditorChatScope)
  | {
      kind: 'lore';
      reference: EditorChatReference;
      scopeToken: string;
      entityIdentityToken: string;
    }
  | { kind: 'persona'; ownerId: string; personaId: string; identityToken: string }
  | { kind: 'preset'; presetId: string; definitionHash: string }
  | {
      kind: 'binding';
      target: EditorChatTarget;
      scopeKind: 'book' | 'chapter' | 'adventure' | 'scene';
      scopeId: string;
      identityToken: string;
    };
export type EditorChatClosure = { schemaVersion: 1; leaves: EditorChatLeaf[]; closureHash: string };
export type EditorChatSource = EditorChatScope & {
  projectToken: string;
  resourceToken: string;
  containerScene: { id: string; token: string } | null;
  parent: { kind: 'chapter' | 'part'; id: string; token: string } | null;
  sourceToken: string;
  revision: number;
  bodyHash: string;
  title: string;
  projectTitle: string;
  titleTruncated: boolean;
  projectTitleTruncated: boolean;
};
export type EditorChatContextSummary = EditorChatScope & {
  schemaVersion: 1;
  ownerId: string;
  contextId: string;
  contextToken: string;
  projectToken: string;
  resourceToken: string;
  revision: number;
  phase: EditorChatContextPhase;
  scannedLocal: number;
  scannedGlobal: number;
  matchedEntityCount: number | null;
  includedEntityCount: number | null;
  omittedEntityCount: number | null;
  turnId: string | null;
  createdAt: number;
  updatedAt: number;
};
export type EditorChatConversationSummary = EditorChatScope & {
  schemaVersion: 1;
  conversationId: string;
  conversationToken: string;
  projectToken: string;
  resourceToken: string;
  revision: number;
  state: 'open' | 'deleting' | 'deleted';
  title: string;
  activeTurnId: string | null;
  createdAt: number;
  updatedAt: number;
};
export type EditorChatTurnSummary = {
  schemaVersion: 1;
  turnId: string;
  conversationId: string;
  revision: number;
  attemptToken: string;
  state: EditorChatTurnState;
  provider: 'platform' | 'byok';
  generation: ChatGeneration;
  contextHash: string;
  closureHash: string;
  sourceToken: string;
  suggestionAvailable: boolean;
  paid: boolean;
  failureReason: EditorChatFailureReason | null;
  createdAt: number;
  updatedAt: number;
};
export type EditorChatLoreSnapshot = {
  reference: EditorChatReference;
  identityToken: string;
  capturedRevision: number | null;
  capturedStamp: EditorChatStamp;
  name: string;
  aliases: string[];
  category: string;
  summary: string;
  detailsExcerpt: string;
  aliasesOmitted: number;
  detailsTruncated: boolean;
};
type PersonaSnapshotProfile = {
  kind: 'preset' | 'custom';
  id: string;
  identityToken: string;
  revision: number;
};
export type EditorChatPersonaSnapshot = {
  bindingHash: string;
  profileHash: string;
  capturedAt: number;
  base: PersonaSnapshotProfile | null;
  complement: PersonaSnapshotProfile | null;
  instruction: string;
};
export type EditorChatFrozenContext = {
  schemaVersion: 1;
  matcherVersion: 1;
  capturedAt: number;
  source: EditorChatSource;
  capture: EditorChatCapture;
  lore: EditorChatLoreSnapshot[];
  persona: EditorChatPersonaSnapshot;
  includedEntityCount: number;
  omittedEntityCount: number;
  closure: EditorChatClosure;
  contextHash: string;
};
export type EditorChatHistorySummary = {
  turnIds: string[];
  recordCount: number;
  characterCount: number;
  omittedRecordCount: number | null;
  omittedCharacterCount: number | null;
  hasOlderHistory: boolean;
};
export type EditorChatFreshness = 'current' | 'stale' | 'unknown';
export type EditorChatTurnRead = {
  turn: EditorChatTurnSummary;
  question: string;
  presentation: 'available' | 'blocked';
  answer: {
    text: string;
    suggestion: string | null;
    context: EditorChatFrozenContext;
    provenance: EditorChatClosure;
    history: EditorChatHistorySummary;
    freshness: EditorChatFreshness;
  } | null;
};
export type EditorChatCleanupSummary = {
  schemaVersion: 1;
  cleanupId: string;
  cleanupToken: string;
  revision: number;
  subject: { kind: 'context' | 'conversation'; id: string; token: string };
  state: 'deleting' | 'deleted';
  phase: EditorChatCleanupPhase;
  deletedDocuments: number;
  createdAt: number;
  updatedAt: number;
};
export type EditorChatPersonaBinding = {
  schemaVersion: 1;
  ownerId: string;
  adventureId: string;
  adventureToken: string;
  sceneId: string | null;
  sceneToken: string | null;
  personaRevision: number;
  bindingToken: string;
  value: EditorChatPersonaBindingValue;
  updatedAt: number;
};
export type EditorChatApplyResult = EditorChatScope & {
  projectToken: string;
  resourceToken: string;
  revision: number;
  contentHash: string;
  bodyBytes: number;
  wordCount: number;
  projectRevision: number;
  chargedCredits: 0 | 1;
};
export type EditorChatByokInput = {
  turnId: string;
  attemptToken: string;
  generation: ChatGeneration;
  systemInstruction: string;
  prompt: string;
  context: EditorChatFrozenContext;
  history: { role: 'user' | 'assistant'; text: string }[];
  closureHash: string;
};
export type EditorChatMutationAction =
  | 'prepareContext'
  | 'advanceContext'
  | 'createConversation'
  | 'renameConversation'
  | 'setAdventurePersonaBinding'
  | 'send'
  | 'stopTurn'
  | 'completeBYOK'
  | 'failBYOK'
  | 'applySuggestion'
  | 'deleteContext'
  | 'deleteConversation'
  | 'advanceCleanup';
export type EditorChatReceiptResult =
  | {
      kind: 'context';
      contextId: string;
      contextToken: string;
      revision: number;
      phase: EditorChatContextPhase;
    }
  | {
      kind: 'conversation';
      conversationId: string;
      conversationToken: string;
      revision: number;
      state: 'open' | 'deleting' | 'deleted';
    }
  | {
      kind: 'turn';
      conversationId: string;
      conversationToken: string;
      turnId: string;
      attemptToken: string;
      revision: number;
      state: EditorChatTurnState;
    }
  | {
      kind: 'apply';
      conversationId: string;
      conversationToken: string;
      turnId: string;
      resourceToken: string;
      revision: number;
      contentHash: string;
      bodyBytes: number;
      wordCount: number;
      projectRevision: number;
      chargedCredits: 0 | 1;
    }
  | {
      kind: 'cleanup';
      cleanupId: string;
      cleanupToken: string;
      revision: number;
      state: 'deleting' | 'deleted';
      phase: EditorChatCleanupPhase;
      deletedDocuments: number;
    }
  | {
      kind: 'persona-binding';
      adventureId: string;
      adventureToken: string;
      sceneId: string | null;
      sceneToken: string | null;
      personaRevision: number;
      bindingToken: string;
    }
  | { kind: 'fence' };
export type EditorChatReceipt = {
  schemaVersion: 1;
  operationId: string;
  action: EditorChatMutationAction;
  requestHash: string;
  outcome: 'confirmed' | 'canceled';
  confirmedAt: number;
  result: EditorChatReceiptResult;
};
export type ExpectedEditorChatReceipt = {
  operationId?: string;
  action?: EditorChatMutationAction;
  requestHash?: string;
  maxRevision?: number;
  contextId?: string;
  conversationId?: string;
  turnId?: string;
  cleanupId?: string;
  adventureId?: string;
  resourceToken?: string;
};
export type EditorChatMutation<T> = { receipt: EditorChatReceipt; current: T | null };
export type EditorChatSendResult = {
  receipt: EditorChatReceipt;
  turn: EditorChatTurnSummary | null;
  delivery: 'server-stream' | 'byok' | null;
  byokInput: EditorChatByokInput | null;
};
export type EditorChatResolution =
  | { state: 'unknown' | 'pending'; receipt: null }
  | { state: 'settled'; receipt: EditorChatReceipt };
/** Local key scope only; null resource is valid only for an adventure-root persona setter row. */
export type EditorChatJournalScope =
  | EditorChatScope
  | {
      target: { kind: 'adventure'; id: string };
      resource: null;
    };
export type EditorChatJournal = EditorChatJournalScope & {
  schemaVersion: 1;
  ownerId: string;
  projectToken: string | null;
  resourceToken: string | null;
  action: EditorChatMutationAction;
  operationId: string;
  requestHash: string;
  contextId: string | null;
  contextToken: string | null;
  conversationId: string | null;
  conversationToken: string | null;
  turnId: string | null;
  attemptToken: string | null;
  cleanupId: string | null;
  cleanupToken: string | null;
  expectedRevision: number | null;
  state: 'pending' | 'uncertain' | 'settled';
  intent: 'observe' | 'cancel';
  generation: ChatGenerationRequest | null;
  localGeneration: number;
};
type Op = { operationId: string; requestHash: string };
type Conversation = { conversationId: string; conversationToken: string };
type Context = { contextId: string; contextToken: string };
type Turn = Conversation & { turnId: string };
type Attempt = Turn & { attemptToken: string };
type Page = { limit?: number; cursor?: string };
export interface EditorChatRequestFields {
  prepareContext: EditorChatScope &
    Op & { contextId: string; base: EditorChatBase; capture: EditorChatCapture };
  advanceContext: EditorChatScope & Op & Context & { expectedRevision: number };
  getContext: EditorChatScope & Context;
  inspectContext: EditorChatScope & Context & { expectedRevision: number };
  listConversations: EditorChatScope & Page & { projectToken?: string; resourceToken?: string };
  createConversation: EditorChatScope &
    Op & { conversationId: string; projectToken: string; resourceToken: string };
  renameConversation: EditorChatScope &
    Op &
    Conversation & { expectedRevision: number; title: string };
  getAdventurePersonaBinding: {
    adventureId: string;
    sceneId: string | null;
    adventureToken?: string;
  };
  setAdventurePersonaBinding: Op & {
    adventureId: string;
    adventureToken: string;
    sceneId: string | null;
    expectedBindingToken: string;
    value: EditorChatPersonaBindingValue;
  };
  listMessages: EditorChatScope & Conversation & Page;
  send: EditorChatScope &
    Op &
    Conversation &
    Context & {
      expectedConversationRevision: number;
      expectedContextRevision: number;
      prompt: string;
      generation: ChatGenerationRequest;
    };
  getTurn: EditorChatScope & Turn;
  getByokInput: EditorChatScope & Attempt;
  stopTurn: EditorChatScope & Op & Attempt;
  completeBYOK: EditorChatScope & Op & Attempt & { rawAnswer: string };
  failBYOK: EditorChatScope &
    Op &
    Attempt & { reason: 'provider-failed' | 'credential-unavailable' | 'user-stopped' };
  applySuggestion: EditorChatScope &
    Op &
    Turn & {
      suggestionHash: string;
      base: EditorChatBase;
      after: string;
      placement: 'original' | 'retargeted';
    };
  resolveOperation: {
    operationId: string;
    operationAction: EditorChatMutationAction;
    requestHash: string;
    intent: 'observe' | 'cancel';
  };
  deleteContext: EditorChatScope & Op & Context;
  deleteConversation: EditorChatScope & Op & Conversation;
  advanceCleanup: Op & { cleanupId: string; cleanupToken: string; expectedRevision: number };
  getCleanup: { cleanupId: string; cleanupToken: string };
}
export type EditorChatAction = keyof EditorChatRequestFields;
export type EditorChatRequest = {
  [K in EditorChatAction]: { action: K } & EditorChatRequestFields[K];
}[EditorChatAction];
export interface EditorChatDTOMap {
  streamEvent:
    | { type: 'started' | 'settled'; turn: EditorChatTurnSummary }
    | { type: 'delta'; turnId: string; attemptToken: string; index: number; text: string };
  context: EditorChatContextSummary;
  conversation: EditorChatConversationSummary;
  turn: EditorChatTurnSummary;
  source: EditorChatSource;
  lore: EditorChatLoreSnapshot;
  persona: EditorChatPersonaSnapshot;
  frozenContext: EditorChatFrozenContext;
  history: EditorChatHistorySummary;
  turnRead: EditorChatTurnRead;
  cleanup: EditorChatCleanupSummary;
  personaBinding: EditorChatPersonaBinding;
  apply: EditorChatApplyResult;
  byokInput: EditorChatByokInput;
  journal: EditorChatJournal;
  contextInspection: {
    context: EditorChatContextSummary;
    source: EditorChatSource;
    frozen: EditorChatFrozenContext | null;
    freshness: EditorChatFreshness;
  };
  conversationPage: EditorChatScope & {
    schemaVersion: 1;
    ownerId: string;
    projectToken: string;
    resourceToken: string;
    collectionRevision: number;
    platformModel: string;
    items: EditorChatConversationSummary[];
    nextCursor: string | null;
  };
  turnPage: {
    schemaVersion: 1;
    ownerId: string;
    conversationId: string;
    conversationToken: string;
    conversationRevision: number;
    items: EditorChatTurnSummary[];
    nextCursor: string | null;
  };
  byokRead: { turn: EditorChatTurnSummary; input: EditorChatByokInput | null };
  sendResult: EditorChatSendResult;
  resolution: EditorChatResolution;
  mutation: EditorChatMutation<
    | EditorChatContextSummary
    | EditorChatConversationSummary
    | EditorChatTurnSummary
    | EditorChatApplyResult
    | EditorChatCleanupSummary
    | EditorChatPersonaBinding
  >;
}
export const EDITOR_CHAT_LIMITS: Readonly<{
  captureText: 18000;
  surroundingText: 22000;
  prompt: 4000;
  rawAnswer: 24000;
  suggestion: 16000;
  lore: 12;
  leaves: 128;
  closureBytes: 65536;
  relevantTerms: 128;
  intervals: 4096;
  accumulatorBytes: 262144;
  historyRecords: 20;
  historyCharacters: 32000;
  bodyBytes: 800000;
  envelopeBytes: 900000;
  answerReserveBytes: 160000;
  page: 50;
  cleanup: 50;
}>;
export const EDITOR_CHAT_PRESETS: readonly string[];
export const EDITOR_CHAT_ACTIONS: readonly EditorChatAction[];
export const EDITOR_CHAT_MUTATION_ACTIONS: readonly EditorChatMutationAction[];
export const EDITOR_CHAT_RECEIPT_KINDS: Readonly<
  Record<EditorChatMutationAction, EditorChatReceiptResult['kind']>
>;
export const EDITOR_CHAT_CONTEXT_PHASES: readonly EditorChatContextPhase[];
export const EDITOR_CHAT_TURN_STATES: readonly EditorChatTurnState[];
export const EDITOR_CHAT_CLEANUP_PHASES: readonly EditorChatCleanupPhase[];
export type EditorChatFailureReason =
  | 'invalid-request'
  | 'body-too-large'
  | 'unsafe-document'
  | 'auth-required'
  | 'app-check-required'
  | 'source-unavailable'
  | 'conversation-unavailable'
  | 'context-unavailable'
  | 'turn-unavailable'
  | 'conversation-busy'
  | 'operation-pending'
  | 'chat-quota'
  | 'provider-unavailable'
  | 'provider-timeout'
  | 'operation-canceled'
  | 'turn-stopped'
  | 'identity-changed'
  | 'context-stale'
  | 'context-not-ready'
  | 'context-consumed'
  | 'inconsistent'
  | 'revision-conflict'
  | 'cursor-stale'
  | 'operation-conflict'
  | 'provenance-revoked'
  | 'history-revoked'
  | 'context-rebase-required'
  | 'context-too-complex'
  | 'insufficient-credits'
  | 'suggestion-unavailable';
export const EDITOR_CHAT_FAILURE_REASONS: readonly EditorChatFailureReason[];
export class EditorChatContractError extends Error {
  code: string;
  details: { reason: string };
  constructor(reason?: string);
}
export function editorChatFail(reason?: string): never;
export function compareEditorChatStrings(a: string, b: string): number;
export function editorChatUTF8Bytes(value: string): number;
export function editorChatClosed(
  value: unknown,
  required: string[],
  optional?: string[],
): Record<string, unknown>;
export function editorChatText(value: unknown, max?: number, required?: boolean): string;
export function editorChatId(value: unknown): string;
export function editorChatSourceId(value: unknown): string;
export function editorChatRevision(value: unknown): number;
export function nextEditorChatRevision(value: unknown): number;
export function editorChatHashToken(value: unknown): string;
export function normalizeEditorChatStamp(value: unknown): EditorChatStamp;
export function normalizeEditorChatTarget(value: unknown): EditorChatTarget;
export function normalizeEditorChatResource(
  value: unknown,
  target?: EditorChatTarget,
): EditorChatResource;
export function normalizeEditorChatJournalScope(value: unknown): EditorChatJournalScope;
export function normalizeEditorChatReference(value: unknown): EditorChatReference;
export function normalizeEditorChatBase(value: unknown): EditorChatBase;
export function normalizeEditorChatCapture(value: unknown): EditorChatCapture;
export function normalizeEditorChatPersonaId(value: unknown): string;
export function normalizeEditorChatPersonaComplement(value: unknown): EditorChatPersonaComplement;
export function canonicalEditorChatJSON(value: unknown): string;
export function editorChatTextHash(text: string): Promise<string>;
export function editorChatHash(value: unknown): Promise<string>;
export function assertEditorChatEnvelope<T>(value: T, reserve?: number): T;
export function assertEditorChatTurnPreflight<T>(value: T): T;
export function normalizeEditorChatAnswer(raw: unknown): {
  text: string;
  suggestion: string | null;
};
export function normalizeEditorChatRequest(value: unknown): EditorChatRequest;
export function editorChatRequestHash(value: unknown): Promise<string>;
export function verifyEditorChatRequest(value: unknown): Promise<EditorChatRequest>;
export function editorChatProjectToken(value: {
  ownerId: string;
  target: EditorChatTarget;
  createdAt: EditorChatStamp;
}): Promise<string>;
export function editorChatContainerSceneToken(value: {
  ownerId: string;
  target: EditorChatTarget;
  projectToken: string;
  sceneId: string;
  createdAt: EditorChatStamp;
}): Promise<string>;
export function editorChatResourceToken(
  value: EditorChatScope & {
    ownerId: string;
    projectToken: string;
    createdAt: EditorChatStamp;
    bodyCreatedAt: EditorChatStamp;
    containerScene: { id: string; token: string } | null;
  },
): Promise<string>;
export function editorChatControlToken(
  kind: 'context' | 'conversation',
  value: unknown,
): Promise<string>;
export function editorChatCleanupToken(value: {
  ownerId: string;
  cleanupId: string;
  birthNonce: string;
  subject: { kind: 'context' | 'conversation'; id: string; token: string };
}): Promise<string>;
export function editorChatBindingToken(value: unknown): Promise<string>;
export function normalizeEditorChatLeaf(value: unknown): EditorChatLeaf;
export function normalizeEditorChatClosure(leaves: unknown): Promise<EditorChatClosure>;
export function verifyEditorChatClosure(
  value: unknown,
  scope?: { ownerId?: string; target?: EditorChatTarget; resource?: EditorChatResource },
): Promise<EditorChatClosure>;
export function mergeEditorChatClosures(
  ...closures: EditorChatClosure[]
): Promise<EditorChatClosure>;
export function editorChatApplyCost(provider: 'platform' | 'byok', paid: boolean): 0 | 1;
export function normalizeEditorChatReceipt(
  value: unknown,
  expected?: ExpectedEditorChatReceipt,
): EditorChatReceipt;
export function normalizeEditorChatDTO<K extends keyof EditorChatDTOMap>(
  kind: K,
  value: unknown,
  options?: ExpectedEditorChatReceipt,
): EditorChatDTOMap[K];
export function verifyEditorChatSnapshot(value: unknown): Promise<EditorChatFrozenContext>;
export function selectEditorChatHistoryMetadata(
  rows: {
    turnId: string;
    state: EditorChatTurnState;
    questionChars: number;
    modelAnswerChars: number;
  }[],
  hasMore?: boolean,
): EditorChatHistorySummary;
