import { resolveChatGeneration, type ChatGenerationRequest } from '../model/chatGeneration';
import {
  editorChatRequestHash,
  editorChatHash,
  type EditorChatAction,
  type EditorChatRequest,
  type EditorChatResponseMap,
  type EditorChatOperationRow,
  type EditorChatJournalScope,
  type EditorChatReceipt,
  type EditorChatReceiptResult,
  type EditorChatMutationAction,
  type EditorChatTurnSummary,
  type EditorChatContextSummary,
  type EditorChatFrozenContext,
  type EditorChatConversationSummary,
  type EditorChatCleanupSummary,
  type EditorChatApplyResult,
  type EditorChatPersonaBinding,
} from '../model/editorChat';
import { normalizeEditorChatClosure } from '../../../../functions/src/editorChatContracts.mjs';
export const hash = (character = 'a') => character.repeat(64);
export const scope = {
  target: { kind: 'book' as const, id: 'book' },
  resource: { kind: 'scene' as const, id: 'scene' },
};
export const generation: ChatGenerationRequest = {
  version: 1,
  provider: 'platform',
  model: null,
  reasoning: 'auto',
};
export const byokGeneration: ChatGenerationRequest = {
  version: 1,
  provider: 'openai_byok',
  model: 'gpt-6-luna',
  reasoning: 'high',
};
export const base = { sourceToken: hash('5'), revision: 1, bodyHash: hash('f') };
export const capture = {
  source: 'selection' as const,
  editorHash: hash('6'),
  from: 1,
  to: 5,
  text: 'Prosa própria',
  surroundingText: '',
  truncated: false,
};
const conversation = { conversationId: 'conversation', conversationToken: hash('4') };
const context = { contextId: 'context', contextToken: hash('3') };
const turn = { ...conversation, turnId: 'turn' };
const attempt = { ...turn, attemptToken: hash('e') };
const op = { operationId: 'operation', requestHash: hash('0') };
export async function requestFor<A extends EditorChatAction>(
  action: A,
): Promise<EditorChatRequest<A>> {
  const inputs = {
    prepareContext: { ...scope, ...op, contextId: op.operationId, base, capture },
    advanceContext: { ...scope, ...op, ...context, expectedRevision: 1 },
    getContext: { ...scope, ...context },
    inspectContext: { ...scope, ...context, expectedRevision: 1 },
    listConversations: scope,
    createConversation: {
      ...scope,
      ...op,
      conversationId: conversation.conversationId,
      projectToken: hash('1'),
      resourceToken: hash('2'),
    },
    renameConversation: {
      ...scope,
      ...op,
      ...conversation,
      expectedRevision: 1,
      title: ' Novo título ',
    },
    getAdventurePersonaBinding: { adventureId: 'adventure', sceneId: null },
    setAdventurePersonaBinding: {
      ...op,
      adventureId: 'adventure',
      adventureToken: hash('1'),
      sceneId: null,
      expectedBindingToken: hash('7'),
      value: { personaId: 'preset-epic' },
    },
    listMessages: { ...scope, ...conversation },
    send: {
      ...scope,
      ...op,
      ...conversation,
      ...context,
      expectedConversationRevision: 1,
      expectedContextRevision: 1,
      prompt: ` Ideias 🐉
`,
      generation,
    },
    getTurn: { ...scope, ...turn },
    getByokInput: { ...scope, ...attempt },
    stopTurn: { ...scope, ...op, ...attempt },
    completeBYOK: { ...scope, ...op, ...attempt, rawAnswer: 'Resposta' },
    failBYOK: { ...scope, ...op, ...attempt, reason: 'provider-failed' },
    applySuggestion: {
      ...scope,
      ...op,
      ...turn,
      suggestionHash: hash('8'),
      base,
      after: '<p>Aplicado</p>',
      placement: 'original',
    },
    resolveOperation: {
      operationId: op.operationId,
      operationAction: 'prepareContext',
      requestHash: hash('9'),
      intent: 'observe',
    },
    deleteContext: { ...scope, ...op, ...context },
    deleteConversation: { ...scope, ...op, ...conversation },
    advanceCleanup: { ...op, cleanupId: 'cleanup', cleanupToken: hash('c'), expectedRevision: 1 },
    getCleanup: { cleanupId: 'cleanup', cleanupToken: hash('c') },
  };
  const input = { action, ...inputs[action] } as unknown as EditorChatRequest<A>;
  if (action !== 'resolveOperation' && 'operationId' in input)
    input.requestHash = await editorChatRequestHash(input);
  return input;
}
export function rowFor(request: EditorChatRequest): EditorChatOperationRow {
  if (!('operationId' in request) || request.action === 'resolveOperation')
    throw new Error('Fixture requires a mutation');
  const journalScope: EditorChatJournalScope =
    request.action === 'setAdventurePersonaBinding'
      ? request.sceneId === null
        ? { target: { kind: 'adventure', id: request.adventureId }, resource: null }
        : {
            target: { kind: 'adventure', id: request.adventureId },
            resource: { kind: 'scene', id: request.sceneId },
          }
      : 'target' in request
        ? { target: request.target, resource: request.resource }
        : scope;
  return {
    schemaVersion: 1,
    ownerId: 'user',
    ...journalScope,
    projectToken: hash('1'),
    resourceToken: request.action === 'setAdventurePersonaBinding' ? null : hash('2'),
    action: request.action,
    operationId: request.operationId,
    requestHash: request.requestHash,
    contextId: 'contextId' in request ? request.contextId : null,
    contextToken: 'contextToken' in request ? request.contextToken : null,
    conversationId: 'conversationId' in request ? request.conversationId : null,
    conversationToken: 'conversationToken' in request ? request.conversationToken : null,
    turnId: 'turnId' in request ? request.turnId : null,
    attemptToken: 'attemptToken' in request ? request.attemptToken : null,
    cleanupId: 'cleanupId' in request ? request.cleanupId : null,
    cleanupToken: 'cleanupToken' in request ? request.cleanupToken : null,
    expectedRevision: 'expectedRevision' in request ? request.expectedRevision : null,
    state: 'pending',
    intent: 'observe',
    generation: 'generation' in request ? request.generation : null,
    localGeneration: 0,
  };
}
export function turnFixture(overrides: Partial<EditorChatTurnSummary> = {}): EditorChatTurnSummary {
  return {
    schemaVersion: 1,
    conversationId: 'conversation',
    turnId: 'turn',
    revision: 1,
    attemptToken: hash('e'),
    state: 'done',
    provider: 'platform',
    generation: resolveChatGeneration(generation),
    contextHash: hash('7'),
    closureHash: hash('8'),
    sourceToken: base.sourceToken,
    suggestionAvailable: true,
    paid: false,
    failureReason: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}
export function contextFixture(
  overrides: Partial<EditorChatContextSummary> = {},
): EditorChatContextSummary {
  return {
    schemaVersion: 1,
    ownerId: 'user',
    ...scope,
    ...context,
    projectToken: hash('1'),
    resourceToken: hash('2'),
    revision: 1,
    phase: 'ready',
    scannedLocal: 1,
    scannedGlobal: 0,
    matchedEntityCount: 0,
    includedEntityCount: 0,
    omittedEntityCount: 0,
    turnId: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}
export function conversationFixture(): EditorChatConversationSummary {
  return {
    schemaVersion: 1,
    ...scope,
    ...conversation,
    projectToken: hash('1'),
    resourceToken: hash('2'),
    revision: 1,
    state: 'open',
    title: 'Nova conversa',
    activeTurnId: null,
    createdAt: 1,
    updatedAt: 1,
  };
}
export async function frozenFixture(): Promise<EditorChatFrozenContext> {
  const closure = await normalizeEditorChatClosure([
    { kind: 'target', ...scope, projectToken: hash('1'), resourceToken: hash('2') },
  ]);
  const value = {
    schemaVersion: 1 as const,
    matcherVersion: 1 as const,
    capturedAt: 1,
    source: {
      ...scope,
      ...base,
      projectToken: hash('1'),
      resourceToken: hash('2'),
      containerScene: null,
      parent: null,
      title: 'Cena',
      projectTitle: 'Livro',
      titleTruncated: false,
      projectTitleTruncated: false,
    },
    capture,
    lore: [],
    persona: {
      bindingHash: hash('b'),
      profileHash: hash('c'),
      capturedAt: 1,
      base: null,
      complement: null,
      instruction: 'Instrução privada',
    },
    includedEntityCount: 0,
    omittedEntityCount: 0,
    closure,
  };
  return { ...value, contextHash: await editorChatHash(value) };
}
export function receiptFixture(
  action: EditorChatMutationAction,
  requestHash: string,
  result: EditorChatReceiptResult,
): EditorChatReceipt {
  return {
    schemaVersion: 1,
    operationId: 'operation',
    action,
    requestHash,
    outcome: 'confirmed',
    confirmedAt: 1,
    result,
  };
}
export async function responseFor<A extends EditorChatAction>(
  request: EditorChatRequest<A>,
): Promise<EditorChatResponseMap[A]> {
  const q = request as EditorChatRequest;
  let current: unknown;
  let result: EditorChatReceiptResult = { kind: 'fence' };
  const ctx = contextFixture({ contextId: 'contextId' in q ? q.contextId : 'context' });
  const conv = conversationFixture();
  const frozen = await frozenFixture();
  const byok =
    q.action === 'getByokInput' || q.action === 'completeBYOK' || q.action === 'failBYOK';
  const t = turnFixture({
    turnId: q.action === 'send' ? q.operationId : 'turn',
    contextHash: frozen.contextHash,
    closureHash: frozen.closure.closureHash,
    ...(byok ? { provider: 'byok', generation: resolveChatGeneration(byokGeneration) } : {}),
  });
  switch (q.action) {
    case 'getContext':
      current = ctx;
      break;
    case 'inspectContext':
      current = { context: ctx, source: frozen.source, frozen, freshness: 'current' };
      break;
    case 'listConversations':
      current = {
        schemaVersion: 1,
        ownerId: 'user',
        ...scope,
        projectToken: hash('1'),
        resourceToken: hash('2'),
        collectionRevision: 1,
        platformModel: 'gemini-3.7-flash',
        items: [conv],
        nextCursor: null,
      };
      break;
    case 'listMessages':
      current = {
        schemaVersion: 1,
        ownerId: 'user',
        ...conversation,
        conversationRevision: 1,
        items: [t],
        nextCursor: null,
      };
      break;
    case 'getTurn':
      current = {
        turn: t,
        question: 'Pergunta própria',
        presentation: 'available',
        answer: {
          text: 'Resposta',
          suggestion: 'Sugestão',
          context: frozen,
          provenance: frozen.closure,
          history: {
            turnIds: [],
            recordCount: 0,
            characterCount: 0,
            omittedRecordCount: 0,
            omittedCharacterCount: 0,
            hasOlderHistory: false,
          },
          freshness: 'current',
        },
      };
      break;
    case 'getByokInput':
      current = { turn: t, input: null };
      break;
    case 'getAdventurePersonaBinding':
    case 'setAdventurePersonaBinding': {
      const binding: EditorChatPersonaBinding = {
        schemaVersion: 1,
        ownerId: 'user',
        adventureId: q.adventureId,
        adventureToken: hash('1'),
        sceneId: q.sceneId,
        sceneToken: q.sceneId === null ? null : hash('d'),
        personaRevision: 1,
        bindingToken: hash('7'),
        value: q.sceneId === null ? { personaId: 'preset-epic' } : { personaComplement: null },
        updatedAt: 1,
      };
      current = binding;
      result = {
        kind: 'persona-binding',
        adventureId: binding.adventureId,
        adventureToken: binding.adventureToken,
        sceneId: binding.sceneId,
        sceneToken: binding.sceneToken,
        personaRevision: binding.personaRevision,
        bindingToken: binding.bindingToken,
      };
      break;
    }
    case 'prepareContext':
    case 'advanceContext':
      current = ctx;
      result = {
        kind: 'context',
        contextId: ctx.contextId,
        contextToken: ctx.contextToken,
        revision: ctx.revision,
        phase: ctx.phase,
      };
      break;
    case 'createConversation':
    case 'renameConversation':
      current = conv;
      result = { kind: 'conversation', ...conversation, revision: 1, state: 'open' };
      break;
    case 'send':
      current = {
        receipt: receiptFixture(q.action, q.requestHash, {
          kind: 'turn',
          ...conversation,
          turnId: q.operationId,
          attemptToken: t.attemptToken,
          revision: 1,
          state: t.state,
        }),
        turn: t,
        delivery: 'server-stream',
        byokInput: null,
      };
      break;
    case 'stopTurn':
    case 'completeBYOK':
    case 'failBYOK':
      current = t;
      result = {
        kind: 'turn',
        ...conversation,
        turnId: t.turnId,
        attemptToken: t.attemptToken,
        revision: 1,
        state: t.state,
      };
      break;
    case 'applySuggestion': {
      const applied: EditorChatApplyResult = {
        ...scope,
        projectToken: hash('1'),
        resourceToken: hash('2'),
        revision: 2,
        contentHash: hash('9'),
        bodyBytes: 10,
        wordCount: 1,
        projectRevision: 3,
        chargedCredits: 1,
      };
      current = applied;
      result = {
        kind: 'apply',
        ...conversation,
        turnId: t.turnId,
        resourceToken: applied.resourceToken,
        revision: applied.revision,
        contentHash: applied.contentHash,
        bodyBytes: applied.bodyBytes,
        wordCount: applied.wordCount,
        projectRevision: applied.projectRevision,
        chargedCredits: applied.chargedCredits,
      };
      break;
    }
    case 'deleteContext':
    case 'deleteConversation':
    case 'advanceCleanup':
    case 'getCleanup': {
      const cleanup: EditorChatCleanupSummary = {
        schemaVersion: 1,
        cleanupId:
          q.action === 'deleteContext' || q.action === 'deleteConversation'
            ? q.operationId
            : q.cleanupId,
        cleanupToken: hash('c'),
        revision: 1,
        subject:
          q.action === 'deleteContext'
            ? { kind: 'context', id: q.contextId, token: q.contextToken }
            : { kind: 'conversation', id: 'conversation', token: hash('4') },
        state: 'deleting',
        phase: q.action === 'deleteContext' ? 'context-body' : 'turn-bodies',
        deletedDocuments: 0,
        createdAt: 1,
        updatedAt: 1,
      };
      current = cleanup;
      result = {
        kind: 'cleanup',
        cleanupId: cleanup.cleanupId,
        cleanupToken: cleanup.cleanupToken,
        revision: cleanup.revision,
        state: cleanup.state,
        phase: cleanup.phase,
        deletedDocuments: cleanup.deletedDocuments,
      };
      break;
    }
    case 'resolveOperation':
      current = { state: 'unknown', receipt: null };
      break;
  }
  if ('operationId' in q && q.action !== 'send' && q.action !== 'resolveOperation')
    current = { receipt: receiptFixture(q.action, q.requestHash, result), current };
  return current as EditorChatResponseMap[A];
}
