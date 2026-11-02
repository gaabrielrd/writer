import type { ChatGenerationRequest } from '../model/chatGeneration';
import {
  normalizeEditorChatRequest,
  editorChatRequestHash,
  normalizeEditorChatDTO,
  normalizeEditorChatReceipt,
  type EditorChatJournalScope,
  type EditorChatMutationAction,
  type EditorChatRequest,
  type EditorChatResponseMap,
  type EditorChatOperationRow,
  type EditorChatReceipt,
} from '../model/editorChat';
import {
  callEditorChat,
  resolveEditorChatOperation,
  EditorChatTransportError,
  type EditorChatCallOptions,
} from './editorChatService';
import {
  readEditorChatOperation,
  reserveEditorChatOperation,
  handoffEditorChatOperation,
  compareEditorChatOperation,
  cancelEditorChatOperation,
  EditorChatStorageError,
} from './editorChatOperationStorage';

export type EditorChatOperationControls = Pick<
  EditorChatOperationRow,
  | 'projectToken'
  | 'resourceToken'
  | 'contextId'
  | 'contextToken'
  | 'conversationId'
  | 'conversationToken'
  | 'turnId'
  | 'attemptToken'
  | 'cleanupId'
  | 'cleanupToken'
>;
type Fields<A extends EditorChatMutationAction> = Omit<
  EditorChatRequest<A>,
  'action' | 'requestHash'
>;
const emptyControls: EditorChatOperationControls = {
  projectToken: null,
  resourceToken: null,
  contextId: null,
  contextToken: null,
  conversationId: null,
  conversationToken: null,
  turnId: null,
  attemptToken: null,
  cleanupId: null,
  cleanupToken: null,
};

/** Owns only operation metadata. Request bodies survive solely in the live caller's RAM. */
export function createEditorChatOperationSession(options: {
  uid: string;
  scope: EditorChatJournalScope;
  check: () => void;
  controls?: () => Partial<EditorChatOperationControls>;
  /** Only a terminal cleanup of this exact conversation may release its persona-handoff pointers. */
  validateDeletedConversationForPersona?: (
    original: EditorChatOperationRow,
    planned: Readonly<EditorChatOperationControls>,
  ) => boolean;
}) {
  const { uid, scope, check } = options;
  const read = () => {
    check();
    return readEditorChatOperation(uid, scope);
  };
  const finish = async (row: EditorChatOperationRow, receipt: EditorChatReceipt) => {
    check();
    normalizeEditorChatReceipt(receipt, {
      operationId: row.operationId,
      action: row.action,
      requestHash: row.requestHash,
    });
    const next = { ...row, state: 'settled' as const, localGeneration: row.localGeneration + 1 };
    if (receipt.outcome === 'confirmed') {
      const result = receipt.result;
      for (const key of [
        'contextId',
        'contextToken',
        'conversationId',
        'conversationToken',
        'turnId',
        'attemptToken',
        'cleanupId',
        'cleanupToken',
      ] as const)
        if (key in result) {
          const value = (result as unknown as Record<string, unknown>)[key];
          if (typeof value === 'string') next[key] = value;
        }
    }
    await compareEditorChatOperation(uid, scope, row, next, check);
    check();
    return next;
  };
  const uncertain = async (row: EditorChatOperationRow, cause: unknown) => {
    if (!(cause instanceof EditorChatTransportError) || !cause.uncertain || row.state === 'settled')
      return;
    try {
      await compareEditorChatOperation(
        uid,
        scope,
        row,
        { ...row, state: 'uncertain', localGeneration: row.localGeneration + 1 },
        check,
      );
    } catch {
      /* Preserve the exact row if the actor or another tab won. */
    }
  };
  return {
    read,
    async execute<A extends EditorChatMutationAction>(
      action: A,
      fields: Fields<A>,
      callOptions: Pick<EditorChatCallOptions, 'signal' | 'onEvent'> & {
        frozenGeneration?: ChatGenerationRequest;
      } = {},
    ): Promise<EditorChatResponseMap[A]> {
      check();
      const original = read();
      if (original && original.state !== 'settled') throw new EditorChatStorageError('conflict');
      const input = normalizeEditorChatRequest({ action, ...fields, requestHash: '0'.repeat(64) });
      const requestHash = await editorChatRequestHash(input);
      check();
      const request = normalizeEditorChatRequest<A>({ ...input, requestHash });
      const metadata: EditorChatOperationControls = {
        ...emptyControls,
        ...(original ?? {}),
        ...options.controls?.(),
      };
      const samePersistentControls =
        original !== null &&
        (['conversationId', 'conversationToken', 'turnId', 'attemptToken'] as const).every(
          (key) => original[key] === metadata[key],
        );
      const deletedConversationReleased =
        original !== null &&
        action === 'setAdventurePersonaBinding' &&
        scope.target.kind === 'adventure' &&
        original.projectToken !== null &&
        original.projectToken === metadata.projectToken &&
        metadata.resourceToken === null &&
        (['conversationId', 'conversationToken', 'turnId', 'attemptToken'] as const).every(
          (key) => metadata[key] === null,
        ) &&
        options.validateDeletedConversationForPersona?.(original, metadata) === true;
      const q = request as unknown as Record<string, unknown>;
      for (const [idKey, tokenKey] of [
        ['contextId', 'contextToken'],
        ['conversationId', 'conversationToken'],
        ['turnId', 'attemptToken'],
        ['cleanupId', 'cleanupToken'],
      ] as const) {
        if (typeof q[idKey] === 'string' && q[idKey] !== metadata[idKey]) metadata[tokenKey] = null;
      }
      for (const key of Object.keys(emptyControls) as (keyof EditorChatOperationControls)[])
        if (typeof q[key] === 'string') metadata[key] = q[key];
      if (action === 'send') {
        metadata.turnId = fields.operationId;
        metadata.attemptToken = null;
      }
      if (action === 'createConversation' && q.conversationId !== original?.conversationId) {
        metadata.turnId = null;
        metadata.attemptToken = null;
      }
      if (action === 'deleteContext' || action === 'deleteConversation') {
        metadata.cleanupId = fields.operationId;
        metadata.cleanupToken = null;
      }
      const bindingTransition =
        original !== null &&
        (action === 'setAdventurePersonaBinding' ||
          original.action === 'setAdventurePersonaBinding');
      if (bindingTransition && !samePersistentControls && !deletedConversationReleased)
        throw new EditorChatStorageError('conflict');
      const bindingHandoff =
        bindingTransition &&
        scope.target.kind === 'adventure' &&
        original.projectToken !== null &&
        original.projectToken === metadata.projectToken &&
        (samePersistentControls || deletedConversationReleased) &&
        (action === 'setAdventurePersonaBinding'
          ? metadata.resourceToken === null
          : original.resourceToken === null);
      const bindingCleanup =
        original?.action === 'setAdventurePersonaBinding' &&
        action === 'deleteConversation' &&
        samePersistentControls &&
        original.projectToken !== null &&
        original.resourceToken === null &&
        metadata.projectToken === null &&
        metadata.resourceToken === null &&
        q.conversationId === original.conversationId &&
        q.conversationToken === original.conversationToken;
      if (
        bindingTransition &&
        original.resourceToken !== metadata.resourceToken &&
        !bindingHandoff &&
        !bindingCleanup
      )
        throw new EditorChatStorageError('conflict');
      if (
        original?.action === 'setAdventurePersonaBinding' &&
        original.projectToken !== null &&
        metadata.projectToken === null &&
        !bindingCleanup
      )
        throw new EditorChatStorageError('conflict');
      if (
        original &&
        original.projectToken !== null &&
        metadata.projectToken !== null &&
        (original.projectToken !== metadata.projectToken ||
          original.resourceToken !== metadata.resourceToken) &&
        ['contextId', 'conversationId', 'turnId', 'cleanupId'].some(
          (key) =>
            original[key as keyof EditorChatOperationControls] !== null &&
            original[key as keyof EditorChatOperationControls] ===
              metadata[key as keyof EditorChatOperationControls],
        ) &&
        !bindingHandoff
      )
        throw new EditorChatStorageError('conflict');
      const row = normalizeEditorChatDTO('journal', {
        ...scope,
        ...Object.fromEntries(
          Object.keys(emptyControls).map((key) => [
            key,
            metadata[key as keyof EditorChatOperationControls],
          ]),
        ),
        schemaVersion: 1,
        ownerId: uid,
        action,
        operationId: fields.operationId,
        requestHash,
        expectedRevision: 'expectedRevision' in q ? q.expectedRevision : null,
        state: 'pending',
        intent: 'observe',
        generation: 'generation' in q ? q.generation : (callOptions.frozenGeneration ?? null),
        localGeneration: 0,
      });
      if (original) await handoffEditorChatOperation(original, row, check);
      else await reserveEditorChatOperation(row, check);
      check();
      try {
        const result = await callEditorChat(uid, request, {
          signal: callOptions.signal,
          onEvent: callOptions.onEvent,
          check,
          operation: row,
        });
        check();
        await finish(row, result.receipt);
        return result;
      } catch (cause) {
        await uncertain(row, cause);
        throw cause;
      }
    },
    async recover(intent: 'observe' | 'cancel') {
      let row = read();
      if (!row) throw new EditorChatStorageError('conflict');
      if (intent === 'cancel' && row.intent !== 'cancel') {
        row = await cancelEditorChatOperation(row, check);
        if (!row) throw new EditorChatStorageError('conflict');
      }
      try {
        const result = await resolveEditorChatOperation(uid, row, { check });
        check();
        if (result.state === 'settled') await finish(row, result.receipt);
        return result;
      } catch (cause) {
        await uncertain(row, cause);
        throw cause;
      }
    },
  };
}
