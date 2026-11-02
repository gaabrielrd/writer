import { onAuthStateChanged } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { auth, getFirebaseApp } from '@/shared/lib';
import { CHAT_GENERATION_LIMITS } from '../model/chatGeneration';
import {
  EDITOR_CHAT_MUTATION_ACTIONS,
  EditorChatContractError,
  EDITOR_CHAT_FAILURE_REASONS,
  type EditorChatFailureReason,
} from '../../../../functions/src/editorChatContracts.mjs';
import {
  canonicalEditorChatJSON,
  editorChatRequestHash,
  normalizeEditorChatRequest,
  normalizeEditorChatDTO,
  normalizeEditorChatReceipt,
  type EditorChatAction,
  type EditorChatRequest,
  type EditorChatResponseMap,
  type EditorChatDTOMap,
  type EditorChatOperationRow,
  type EditorChatStreamEvent,
  type EditorChatTurnSummary,
} from '../model/editorChat';
import { assertEditorChatOperation } from './editorChatOperationStorage';

export class EditorChatTransportError extends Error {
  readonly code: string;
  readonly uncertain: boolean;
  readonly reason: EditorChatFailureReason | null;
  constructor(code: string, uncertain: boolean, reason: EditorChatFailureReason | null = null) {
    super('Não foi possível concluir este pedido. Confira o estado antes de continuar.');
    this.name = 'EditorChatTransportError';
    this.code = code;
    this.uncertain = uncertain;
    this.reason = reason;
  }
}
const knownCodes = new Set([
  'functions/invalid-argument',
  'functions/permission-denied',
  'functions/not-found',
  'functions/failed-precondition',
  'functions/resource-exhausted',
  'functions/unauthenticated',
  'functions/aborted',
  'functions/cancelled',
  'functions/unavailable',
  'functions/deadline-exceeded',
  'functions/unknown',
  'functions/internal',
  'functions/already-exists',
  'functions/data-loss',
  'functions/unimplemented',
  'functions/out-of-range',
  'editor-chat/invalid-response',
  'editor-chat/identity-changed',
  'editor-chat/operation-changed',
  'editor-chat/journal-required',
  'editor-chat/fingerprint-mismatch',
  'editor-chat/unavailable',
]);
function errorCode(cause: unknown): string {
  if (!cause || typeof cause !== 'object' || !('code' in cause) || typeof cause.code !== 'string')
    return 'editor-chat/unavailable';
  if (
    knownCodes.has(cause.code) ||
    (cause instanceof EditorChatContractError && knownCodes.has('functions/' + cause.code))
  )
    return cause.code;
  return 'editor-chat/unavailable';
}
function failureReason(cause: unknown, code: string): EditorChatFailureReason | null {
  if (
    !cause ||
    typeof cause !== 'object' ||
    !('details' in cause) ||
    !cause.details ||
    typeof cause.details !== 'object' ||
    !('reason' in cause.details)
  )
    return null;
  const reason = cause.details.reason;
  const valid = EDITOR_CHAT_FAILURE_REASONS.find((candidate) => candidate === reason);
  if (!valid) return null;
  const expectedCode = new EditorChatContractError(valid).code;
  return code === 'functions/' + expectedCode ||
    (cause instanceof EditorChatContractError && code === expectedCode)
    ? valid
    : null;
}
export interface EditorChatCallOptions {
  check?: () => void;
  signal?: AbortSignal;
  operation?: EditorChatOperationRow;
  onEvent?: (event: EditorChatStreamEvent) => void;
}
const responseKinds: Record<EditorChatAction, keyof EditorChatDTOMap> = {
  prepareContext: 'mutation',
  advanceContext: 'mutation',
  getContext: 'context',
  inspectContext: 'contextInspection',
  listConversations: 'conversationPage',
  createConversation: 'mutation',
  renameConversation: 'mutation',
  getAdventurePersonaBinding: 'personaBinding',
  setAdventurePersonaBinding: 'mutation',
  listMessages: 'turnPage',
  send: 'sendResult',
  getTurn: 'turnRead',
  getByokInput: 'byokRead',
  stopTurn: 'mutation',
  completeBYOK: 'mutation',
  failBYOK: 'mutation',
  applySuggestion: 'mutation',
  resolveOperation: 'resolution',
  deleteContext: 'mutation',
  deleteConversation: 'mutation',
  advanceCleanup: 'mutation',
  getCleanup: 'cleanup',
};
const same = (a: unknown, b: unknown) => canonicalEditorChatJSON(a) === canonicalEditorChatJSON(b);
function invalid(): never {
  throw new EditorChatTransportError('editor-chat/invalid-response', false);
}
function owner(uid: string, options: EditorChatCallOptions) {
  const user = auth.currentUser;
  const abort = new AbortController();
  let changed = false;
  const check = () => {
    options.signal?.throwIfAborted();
    options.check?.();
    if (changed || !user || user.uid !== uid || auth.currentUser !== user)
      throw new EditorChatTransportError('editor-chat/identity-changed', false);
  };
  check();
  const stop = onAuthStateChanged(
    auth,
    (current) => {
      if (current !== user) {
        changed = true;
        abort.abort();
      }
    },
    () => {
      changed = true;
      abort.abort();
    },
  );
  const cancel = () => abort.abort();
  options.signal?.addEventListener('abort', cancel, { once: true });
  return {
    check,
    signal: abort.signal,
    close: () => {
      stop();
      abort.abort();
      options.signal?.removeEventListener('abort', cancel);
    },
  };
}
function matchRow(uid: string, request: EditorChatRequest, row: EditorChatOperationRow): void {
  if (row.ownerId !== uid || (row.state === 'settled' && request.action !== 'resolveOperation'))
    throw new EditorChatTransportError('editor-chat/operation-changed', false);
  if (request.action === 'resolveOperation') {
    if (
      request.operationId !== row.operationId ||
      request.operationAction !== row.action ||
      request.requestHash !== row.requestHash ||
      request.intent !== row.intent
    )
      throw new EditorChatTransportError('editor-chat/operation-changed', false);
    return;
  }
  if (
    !('operationId' in request) ||
    request.action !== row.action ||
    request.operationId !== row.operationId ||
    request.requestHash !== row.requestHash ||
    row.intent === 'cancel'
  )
    throw new EditorChatTransportError('editor-chat/operation-changed', false);
  for (const key of [
    'target',
    'resource',
    'projectToken',
    'resourceToken',
    'contextId',
    'contextToken',
    'conversationId',
    'conversationToken',
    'turnId',
    'attemptToken',
    'cleanupId',
    'cleanupToken',
    'expectedRevision',
    'generation',
  ] as const) {
    if (key in request && !same(request[key as keyof typeof request], row[key]))
      throw new EditorChatTransportError('editor-chat/operation-changed', false);
  }
  if (request.action === 'setAdventurePersonaBinding') {
    const resource = request.sceneId === null ? null : { kind: 'scene', id: request.sceneId };
    if (
      row.target.kind !== 'adventure' ||
      request.adventureId !== row.target.id ||
      request.adventureToken !== row.projectToken ||
      row.resourceToken !== null ||
      !same(resource, row.resource)
    )
      throw new EditorChatTransportError('editor-chat/operation-changed', false);
  }
}
function matchResult(
  uid: string,
  request: EditorChatRequest,
  value: unknown,
  operation?: EditorChatOperationRow,
): void {
  const q = request as unknown as Record<string, unknown>;
  function visit(input: unknown) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return;
    const r = input as Record<string, unknown>;
    if ('ownerId' in r && r.ownerId !== uid) invalid();
    for (const key of [
      'target',
      'resource',
      'conversationId',
      'conversationToken',
      'contextId',
      'contextToken',
      'cleanupId',
      'cleanupToken',
      'adventureId',
      'adventureToken',
      'sceneId',
      'projectToken',
      'resourceToken',
      'attemptToken',
    ] as const) {
      const expected =
        key in q
          ? q[key]
          : operation && key in operation
            ? (operation[key as keyof EditorChatOperationRow] ?? undefined)
            : undefined;
      if (expected !== undefined && key in r && !same(expected, r[key])) invalid();
    }
    const requestedGeneration = 'generation' in q ? q.generation : operation?.generation;
    if (
      requestedGeneration &&
      r.generation &&
      typeof r.generation === 'object' &&
      'requested' in r.generation &&
      !same(requestedGeneration, r.generation.requested)
    )
      invalid();
    const turnId = request.action === 'send' ? request.operationId : q.turnId;
    if (turnId !== undefined && 'turnId' in r && r.turnId !== null && r.turnId !== turnId)
      invalid();
    if (operation) {
      for (const key of ['projectToken', 'resourceToken'] as const)
        if (operation[key] !== null && key in r && r[key] !== operation[key]) invalid();
    }
    if (
      'subject' in r &&
      (request.action === 'deleteContext' || request.action === 'deleteConversation')
    ) {
      const expected =
        request.action === 'deleteContext'
          ? { kind: 'context', id: request.contextId, token: request.contextToken }
          : { kind: 'conversation', id: request.conversationId, token: request.conversationToken };
      if (!same(r.subject, expected)) invalid();
    }
    if (Array.isArray(r.items)) r.items.forEach(visit);
    for (const key of [
      'current',
      'turn',
      'context',
      'source',
      'frozen',
      'byokInput',
      'input',
      'answer',
    ])
      visit(r[key]);
  }
  visit(value);
  if (value && typeof value === 'object' && 'receipt' in value && value.receipt !== null) {
    const expected =
      request.action === 'resolveOperation'
        ? {
            operationId: request.operationId,
            action: request.operationAction,
            requestHash: request.requestHash,
          }
        : 'operationId' in request && 'requestHash' in request
          ? {
              operationId: request.operationId,
              action: request.action,
              requestHash: request.requestHash,
            }
          : undefined;
    if (!expected) invalid();
    const receipt = normalizeEditorChatReceipt(value.receipt, expected);
    visit(receipt.result);
  }
}

/** Validated callable transport only. Provider execution and UI state belong to later layers. */
export async function callEditorChat<A extends EditorChatAction>(
  uid: string,
  input: EditorChatRequest<A>,
  options: EditorChatCallOptions = {},
): Promise<EditorChatResponseMap[A]> {
  const request = normalizeEditorChatRequest(input);
  const operation = options.operation
    ? normalizeEditorChatDTO('journal', options.operation)
    : undefined;
  let actor: ReturnType<typeof owner> | undefined;
  const mutation = EDITOR_CHAT_MUTATION_ACTIONS.some((action) => action === request.action);
  const requiresRow = mutation || request.action === 'resolveOperation';
  let issued = false;
  const check = () => {
    if (!actor) throw new EditorChatTransportError('editor-chat/identity-changed', false);
    actor.check();
    if (requiresRow) {
      if (!operation) throw new EditorChatTransportError('editor-chat/journal-required', false);
      matchRow(uid, request, operation);
      assertEditorChatOperation(operation, actor.check);
    }
  };
  try {
    actor = owner(uid, options);
    check();
    if (mutation && 'requestHash' in request) {
      const hash = await editorChatRequestHash(request);
      check();
      if (hash !== request.requestHash)
        throw new EditorChatTransportError('editor-chat/fingerprint-mismatch', false);
    }
    const call = httpsCallable<unknown, unknown, unknown>(
      getFunctions(getFirebaseApp(), 'us-central1'),
      'editorChat',
      { timeout: CHAT_GENERATION_LIMITS.requestTimeoutMs },
    );
    check();
    issued = true;
    let raw: unknown;
    if (request.action === 'send') {
      const result = await call.stream(request, { signal: actor.signal });
      const final = result.data;
      void final.catch(() => undefined);
      let started: EditorChatTurnSummary | null = null;
      let settled = false;
      let index = 0;
      let characters = 0;
      for await (const chunk of result.stream) {
        check();
        const event = normalizeEditorChatDTO('streamEvent', chunk);
        if (settled) invalid();
        if (event.type === 'started') {
          if (started) invalid();
          started = event.turn;
          matchResult(uid, request, { turn: event.turn }, operation);
        } else if (event.type === 'delta') {
          characters += event.text.length;
          if (
            !started ||
            event.turnId !== started.turnId ||
            event.attemptToken !== started.attemptToken ||
            event.index !== index++ ||
            characters > 24000
          )
            invalid();
        } else {
          if (
            !started ||
            event.turn.turnId !== started.turnId ||
            event.turn.attemptToken !== started.attemptToken
          )
            invalid();
          matchResult(uid, request, { turn: event.turn }, operation);
          settled = true;
        }
        check();
        options.onEvent?.(event);
      }
      check();
      raw = await final;
      check();
      const parsed = normalizeEditorChatDTO('sendResult', raw);
      if (
        started &&
        parsed.turn &&
        (started.turnId !== parsed.turn.turnId || started.attemptToken !== parsed.turn.attemptToken)
      )
        invalid();
      raw = parsed;
    } else {
      raw = (await call(request)).data;
      check();
    }
    const result = normalizeEditorChatDTO(responseKinds[request.action], raw);
    matchResult(uid, request, result, operation);
    if (
      request.action === 'inspectContext' &&
      normalizeEditorChatDTO('contextInspection', result).context.revision !==
        request.expectedRevision
    )
      invalid();
    check();
    return result as EditorChatResponseMap[A];
  } catch (cause) {
    const code = errorCode(cause);
    const definitive = [
      'functions/invalid-argument',
      'functions/permission-denied',
      'functions/not-found',
      'functions/failed-precondition',
      'functions/resource-exhausted',
      'functions/unauthenticated',
    ].includes(code);
    throw new EditorChatTransportError(
      code,
      issued && requiresRow && !definitive,
      failureReason(cause, code),
    );
  } finally {
    actor?.close();
  }
}
export function resolveEditorChatOperation(
  uid: string,
  row: EditorChatOperationRow,
  options: Omit<EditorChatCallOptions, 'operation'> = {},
) {
  return callEditorChat(
    uid,
    {
      action: 'resolveOperation',
      operationId: row.operationId,
      operationAction: row.action,
      requestHash: row.requestHash,
      intent: row.intent,
    },
    { ...options, operation: row },
  );
}
