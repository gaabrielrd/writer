// Pure, browser-safe protocol. Authorization and persistence belong to the service.
import {
  normalizeChatGenerationRequest,
  CHAT_GENERATION_LIMITS,
  CHAT_REASONING_LEVELS,
} from './chatGeneration.mjs';

export const EDITOR_CHAT_LIMITS = Object.freeze({
  captureText: 18000,
  surroundingText: 22000,
  prompt: 4000,
  rawAnswer: 24000,
  suggestion: 16000,
  lore: 12,
  leaves: 128,
  closureBytes: 65536,
  relevantTerms: 128,
  intervals: 4096,
  accumulatorBytes: 262144,
  historyRecords: 20,
  historyCharacters: 32000,
  bodyBytes: 800000,
  envelopeBytes: 900000,
  answerReserveBytes: 160000,
  page: 50,
  cleanup: 50,
});
export const EDITOR_CHAT_PRESETS = Object.freeze([
  'preset-atmospheric',
  'preset-incisive',
  'preset-intimate',
  'preset-ironic',
  'preset-epic',
  'preset-unsettling',
]);
export const EDITOR_CHAT_CONTEXT_PHASES = Object.freeze([
  'local',
  'global',
  'ready',
  'consumed',
  'stale',
  'canceled',
  'deleted',
]);
export const EDITOR_CHAT_TURN_STATES = Object.freeze([
  'running',
  'awaiting-byok',
  'done',
  'stopped',
  'failed',
  'blocked',
]);
export const EDITOR_CHAT_CLEANUP_PHASES = Object.freeze([
  'context-body',
  'turn-bodies',
  'turn-questions',
  'turns',
  'complete',
]);
const reasonCodes = Object.freeze({
  'invalid-request': 'invalid-argument',
  'body-too-large': 'invalid-argument',
  'unsafe-document': 'invalid-argument',
  'auth-required': 'unauthenticated',
  'app-check-required': 'permission-denied',
  'source-unavailable': 'not-found',
  'conversation-unavailable': 'not-found',
  'context-unavailable': 'not-found',
  'turn-unavailable': 'not-found',
  'conversation-busy': 'aborted',
  'operation-pending': 'aborted',
  'chat-quota': 'resource-exhausted',
  'provider-unavailable': 'unavailable',
  'provider-timeout': 'deadline-exceeded',
  'operation-canceled': 'cancelled',
  'turn-stopped': 'cancelled',
});
export const EDITOR_CHAT_FAILURE_REASONS = Object.freeze([
  ...Object.keys(reasonCodes),
  'identity-changed',
  'context-stale',
  'context-not-ready',
  'context-consumed',
  'inconsistent',
  'revision-conflict',
  'cursor-stale',
  'operation-conflict',
  'provenance-revoked',
  'history-revoked',
  'context-rebase-required',
  'context-too-complex',
  'insufficient-credits',
  'suggestion-unavailable',
]);
export class EditorChatContractError extends Error {
  constructor(reason = 'invalid-request') {
    super('Não foi possível concluir o pedido de chat. Confira o contexto e tente novamente.');
    this.name = 'EditorChatContractError';
    this.code = reasonCodes[reason] ?? 'failed-precondition';
    this.details = { reason };
  }
}
export function editorChatFail(reason = 'invalid-request') {
  throw new EditorChatContractError(reason);
}
export const compareEditorChatStrings = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const encoder = new TextEncoder();
export function editorChatUTF8Bytes(value) {
  return encoder.encode(value).byteLength;
}
function plain(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![null, Object.prototype].includes(Object.getPrototypeOf(value)) ||
    Reflect.ownKeys(value).some(
      (k) =>
        typeof k !== 'string' ||
        !Object.getOwnPropertyDescriptor(value, k)?.enumerable ||
        !Object.hasOwn(Object.getOwnPropertyDescriptor(value, k), 'value'),
    )
  )
    editorChatFail();
  return value;
}
export function editorChatClosed(value, required, optional = []) {
  plain(value);
  if (
    Object.keys(value).some((k) => !required.includes(k) && !optional.includes(k)) ||
    required.some((k) => !Object.hasOwn(value, k))
  )
    editorChatFail();
  return value;
}
export function editorChatText(value, max = Infinity, required = false) {
  if (
    typeof value !== 'string' ||
    !value.isWellFormed() ||
    value.length > max ||
    (required && !value.trim())
  )
    editorChatFail();
  return value;
}
export function editorChatId(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) editorChatFail();
  return value;
}
export function editorChatSourceId(value) {
  editorChatText(value);
  if (
    !value ||
    value.includes('/') ||
    value === '.' ||
    value === '..' ||
    editorChatUTF8Bytes(value) > 1500
  )
    editorChatFail();
  return value;
}
export function editorChatRevision(value) {
  if (!Number.isSafeInteger(value) || value < 0) editorChatFail();
  return Object.is(value, -0) ? 0 : value;
}
export function nextEditorChatRevision(value) {
  const next = editorChatRevision(value) + 1;
  return editorChatRevision(next);
}
export function editorChatHashToken(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) editorChatFail();
  return value;
}
const bool = (v) => {
  if (typeof v !== 'boolean') editorChatFail();
  return v;
};
const one = (v, choices) => {
  if (!choices.includes(v)) editorChatFail();
  return v;
};
const nullable = (v, fn) => (v === null ? null : fn(v));
const list = (v, fn, max = Infinity) => {
  if (!Array.isArray(v) || v.length > max || Object.keys(v).length !== v.length) editorChatFail();
  return Array.from(v, fn);
};
function date(value) {
  editorChatRevision(value);
  if (value > 8640000000000000) editorChatFail();
  return value;
}
export function normalizeEditorChatStamp(value) {
  editorChatClosed(value, ['seconds', 'nanoseconds']);
  if (
    !Number.isSafeInteger(value.seconds) ||
    !Number.isInteger(value.nanoseconds) ||
    value.nanoseconds < 0 ||
    value.nanoseconds >= 1e9
  )
    editorChatFail();
  return { seconds: value.seconds, nanoseconds: value.nanoseconds };
}
export function normalizeEditorChatTarget(value) {
  editorChatClosed(value, ['kind', 'id']);
  return { kind: one(value.kind, ['book', 'adventure']), id: editorChatSourceId(value.id) };
}
export function normalizeEditorChatResource(value, target) {
  editorChatClosed(value, ['kind', 'id']);
  const kind = one(value.kind, ['scene', 'block']);
  if (target?.kind === 'book' && kind === 'block') editorChatFail();
  return { kind, id: editorChatSourceId(value.id) };
}
// Local journal keys also support an adventure-root persona binding, before any scene exists.
// This is not a wire Scope and never grants access to a textual resource.
export function normalizeEditorChatJournalScope(value) {
  editorChatClosed(value, ['target', 'resource']);
  const target = normalizeEditorChatTarget(value.target);
  if (value.resource === null) {
    if (target.kind !== 'adventure') editorChatFail();
    return { target, resource: null };
  }
  return { target, resource: normalizeEditorChatResource(value.resource, target) };
}
export function normalizeEditorChatReference(value) {
  editorChatClosed(value, ['kind', 'scopeId', 'entityId']);
  return {
    kind: one(value.kind, ['book', 'adventure', 'universe']),
    scopeId: editorChatSourceId(value.scopeId),
    entityId: editorChatSourceId(value.entityId),
  };
}
export function normalizeEditorChatBase(value) {
  editorChatClosed(value, ['sourceToken', 'revision', 'bodyHash']);
  return {
    sourceToken: editorChatHashToken(value.sourceToken),
    revision: editorChatRevision(value.revision),
    bodyHash: editorChatHashToken(value.bodyHash),
  };
}
export function normalizeEditorChatCapture(value) {
  editorChatClosed(value, [
    'source',
    'editorHash',
    'from',
    'to',
    'text',
    'surroundingText',
    'truncated',
  ]);
  const from = editorChatRevision(value.from),
    to = editorChatRevision(value.to);
  if (to < from || to > 900000) editorChatFail();
  return {
    source: one(value.source, ['selection', 'cursor', 'viewport', 'document']),
    editorHash: editorChatHashToken(value.editorHash),
    from,
    to,
    text: editorChatText(value.text, EDITOR_CHAT_LIMITS.captureText),
    surroundingText: editorChatText(value.surroundingText, EDITOR_CHAT_LIMITS.surroundingText),
    truncated: bool(value.truncated),
  };
}
export function normalizeEditorChatPersonaId(value) {
  if (
    typeof value !== 'string' ||
    !/^[-A-Za-z0-9]{1,100}$/.test(value) ||
    (value.startsWith('preset-') && !EDITOR_CHAT_PRESETS.includes(value))
  )
    editorChatFail();
  return value;
}
export function normalizeEditorChatPersonaComplement(value) {
  editorChatClosed(value, ['personaId', 'overrides']);
  const seen = new Set();
  return {
    personaId: normalizeEditorChatPersonaId(value.personaId),
    overrides: list(
      value.overrides,
      (o) => {
        editorChatClosed(o, ['traitId', 'value']);
        if (
          typeof o.traitId !== 'string' ||
          !/^[-A-Za-z0-9]{1,100}$/.test(o.traitId) ||
          seen.has(o.traitId) ||
          !Number.isInteger(o.value) ||
          o.value < 0 ||
          o.value > 100
        )
          editorChatFail();
        seen.add(o.traitId);
        return { traitId: o.traitId, value: o.value };
      },
      16,
    ),
  };
}
function bindingValue(value, sceneId) {
  const key = sceneId === null ? 'personaId' : 'personaComplement';
  editorChatClosed(value, [key]);
  return {
    [key]: nullable(
      value[key],
      sceneId === null ? normalizeEditorChatPersonaId : normalizeEditorChatPersonaComplement,
    ),
  };
}

export function canonicalEditorChatJSON(value) {
  const parents = new Set();
  function visit(v) {
    if (typeof v === 'string') return editorChatText(v);
    if (typeof v === 'number') {
      if (!Number.isSafeInteger(v)) editorChatFail();
      return Object.is(v, -0) ? 0 : v;
    }
    if (v === null || typeof v === 'boolean') return v;
    if (typeof v !== 'object' || parents.has(v)) editorChatFail();
    parents.add(v);
    let result;
    if (Array.isArray(v)) {
      if (Object.keys(v).length !== v.length) editorChatFail();
      result = Array.from(v, visit);
    } else {
      plain(v);
      result = Object.fromEntries(
        Object.keys(v)
          .sort()
          .map((k) => [editorChatText(k), visit(v[k])]),
      );
    }
    parents.delete(v);
    return result;
  }
  return JSON.stringify(visit(value));
}
export async function editorChatTextHash(text) {
  editorChatText(text);
  const bytes = await globalThis.crypto.subtle.digest('SHA-256', encoder.encode(text));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}
export const editorChatHash = async (value) => editorChatTextHash(canonicalEditorChatJSON(value));
export function assertEditorChatEnvelope(value, reserve = 0) {
  editorChatRevision(reserve);
  if (
    editorChatUTF8Bytes(canonicalEditorChatJSON(value)) + reserve >
    EDITOR_CHAT_LIMITS.envelopeBytes
  )
    editorChatFail('body-too-large');
  return value;
}
export const assertEditorChatTurnPreflight = (value) =>
  assertEditorChatEnvelope(value, EDITOR_CHAT_LIMITS.answerReserveBytes);
export function normalizeEditorChatAnswer(raw) {
  editorChatText(raw, EDITOR_CHAT_LIMITS.rawAnswer, true);
  const matches = [...raw.matchAll(/\[\[SUGESTAO\]\]([\s\S]*?)\[\[\/SUGESTAO\]\]/g)];
  if (
    matches.length > 1 ||
    raw.split('[[SUGESTAO]]').length - 1 !== matches.length ||
    raw.split('[[/SUGESTAO]]').length - 1 !== matches.length
  )
    editorChatFail('provider-unavailable');
  const match = matches[0];
  const suggestion = match
    ? editorChatText(match[1].trim(), EDITOR_CHAT_LIMITS.suggestion, true)
    : null;
  const text = match
    ? raw.replace(match[0], '').trim() || 'Revise a sugestão antes de aplicar.'
    : raw.trim();
  if (text.length + (suggestion?.length ?? 0) > EDITOR_CHAT_LIMITS.rawAnswer)
    editorChatFail('provider-unavailable');
  return { text, suggestion };
}

// The map is deliberately limited to editor-chat actions; no generic mutation engine.
const scopeFields = ['target', 'resource'];
const conversationFields = ['conversationId', 'conversationToken'];
const contextFields = ['contextId', 'contextToken'];
const turnFields = [...conversationFields, 'turnId'];
const attemptFields = [...turnFields, 'attemptToken'];
const actionFields = {
  prepareContext: [...scopeFields, 'contextId', 'base', 'capture'],
  advanceContext: [...scopeFields, ...contextFields, 'expectedRevision'],
  getContext: [...scopeFields, ...contextFields],
  inspectContext: [...scopeFields, ...contextFields, 'expectedRevision'],
  listConversations: [...scopeFields],
  createConversation: [...scopeFields, 'conversationId', 'projectToken', 'resourceToken'],
  renameConversation: [...scopeFields, ...conversationFields, 'expectedRevision', 'title'],
  getAdventurePersonaBinding: ['adventureId', 'sceneId'],
  setAdventurePersonaBinding: [
    'adventureId',
    'adventureToken',
    'sceneId',
    'expectedBindingToken',
    'value',
  ],
  listMessages: [...scopeFields, ...conversationFields],
  send: [
    ...scopeFields,
    ...conversationFields,
    'expectedConversationRevision',
    ...contextFields,
    'expectedContextRevision',
    'prompt',
    'generation',
  ],
  getTurn: [...scopeFields, ...turnFields],
  getByokInput: [...scopeFields, ...attemptFields],
  stopTurn: [...scopeFields, ...attemptFields],
  completeBYOK: [...scopeFields, ...attemptFields, 'rawAnswer'],
  failBYOK: [...scopeFields, ...attemptFields, 'reason'],
  applySuggestion: [...scopeFields, ...turnFields, 'suggestionHash', 'base', 'after', 'placement'],
  resolveOperation: ['operationId', 'operationAction', 'requestHash', 'intent'],
  deleteContext: [...scopeFields, ...contextFields],
  deleteConversation: [...scopeFields, ...conversationFields],
  advanceCleanup: ['cleanupId', 'cleanupToken', 'expectedRevision'],
  getCleanup: ['cleanupId', 'cleanupToken'],
};
export const EDITOR_CHAT_RECEIPT_KINDS = Object.freeze({
  prepareContext: 'context',
  advanceContext: 'context',
  createConversation: 'conversation',
  renameConversation: 'conversation',
  setAdventurePersonaBinding: 'persona-binding',
  send: 'turn',
  stopTurn: 'turn',
  completeBYOK: 'turn',
  failBYOK: 'turn',
  applySuggestion: 'apply',
  deleteContext: 'cleanup',
  deleteConversation: 'cleanup',
  advanceCleanup: 'cleanup',
});
export const EDITOR_CHAT_MUTATION_ACTIONS = Object.freeze(Object.keys(EDITOR_CHAT_RECEIPT_KINDS));
export const EDITOR_CHAT_ACTIONS = Object.freeze(Object.keys(actionFields));
const idFields = new Set(['operationId', 'contextId', 'conversationId', 'turnId', 'cleanupId']);
const hashFields = new Set([
  'requestHash',
  'contextToken',
  'conversationToken',
  'projectToken',
  'resourceToken',
  'attemptToken',
  'suggestionHash',
  'cleanupToken',
  'adventureToken',
  'expectedBindingToken',
]);
function normalizeRequestedGeneration(v) {
  editorChatClosed(v, ['version', 'provider', 'model', 'reasoning']);
  const result = normalizeChatGenerationRequest(v);
  if (!result) editorChatFail();
  return result;
}
export function normalizeEditorChatRequest(value) {
  plain(value);
  const action = one(value.action, EDITOR_CHAT_ACTIONS),
    mutation = EDITOR_CHAT_MUTATION_ACTIONS.includes(action);
  const required = [
    'action',
    ...actionFields[action],
    ...(mutation ? ['operationId', 'requestHash'] : []),
  ];
  const optional =
    action === 'listConversations'
      ? ['projectToken', 'resourceToken', 'limit', 'cursor']
      : action === 'listMessages'
        ? ['limit', 'cursor']
        : action === 'getAdventurePersonaBinding'
          ? ['adventureToken']
          : [];
  editorChatClosed(value, required, optional);
  const result = { action };
  for (const key of [...required, ...optional]) {
    if (key === 'action' || !Object.hasOwn(value, key)) continue;
    const v = value[key];
    if (idFields.has(key)) result[key] = editorChatId(v);
    else if (hashFields.has(key)) result[key] = editorChatHashToken(v);
    else if (key.startsWith('expected') && key.endsWith('Revision'))
      result[key] = editorChatRevision(v);
    else if (key === 'target') result.target = normalizeEditorChatTarget(v);
    else if (key === 'resource') result.resource = normalizeEditorChatResource(v, result.target);
    else if (key === 'base') result.base = normalizeEditorChatBase(v);
    else if (key === 'capture') result.capture = normalizeEditorChatCapture(v);
    else if (key === 'adventureId') result[key] = editorChatSourceId(v);
    else if (key === 'sceneId') result[key] = nullable(v, editorChatSourceId);
    else if (key === 'value') result.value = bindingValue(v, result.sceneId);
    else if (key === 'generation') result.generation = normalizeRequestedGeneration(v);
    else if (key === 'prompt') result.prompt = editorChatText(v, EDITOR_CHAT_LIMITS.prompt, true);
    else if (key === 'rawAnswer') {
      editorChatText(v, EDITOR_CHAT_LIMITS.rawAnswer, true);
      result[key] = v;
    } else if (key === 'after') {
      editorChatText(v);
      if (editorChatUTF8Bytes(v) > EDITOR_CHAT_LIMITS.bodyBytes) editorChatFail('body-too-large');
      result.after = v;
    } else if (key === 'title') result.title = editorChatText(editorChatText(v).trim(), 120, true);
    else if (key === 'limit') {
      if (!Number.isInteger(v) || v < 1 || v > 50) editorChatFail();
      result.limit = v;
    } else if (key === 'cursor') {
      editorChatText(v, 900000, true);
      if (!/^[A-Za-z0-9_-]+$/.test(v)) editorChatFail();
      result.cursor = v;
    } else if (key === 'reason')
      result.reason = one(v, ['provider-failed', 'credential-unavailable', 'user-stopped']);
    else if (key === 'placement') result.placement = one(v, ['original', 'retargeted']);
    else if (key === 'operationAction')
      result.operationAction = one(v, EDITOR_CHAT_MUTATION_ACTIONS);
    else if (key === 'intent') result.intent = one(v, ['observe', 'cancel']);
  }
  if (['listConversations', 'listMessages'].includes(action) && !Object.hasOwn(result, 'limit'))
    result.limit = 25;
  if (
    action === 'listConversations' &&
    Object.hasOwn(result, 'projectToken') !== Object.hasOwn(result, 'resourceToken')
  )
    editorChatFail();
  if (action === 'prepareContext' && result.contextId !== result.operationId) editorChatFail();
  assertEditorChatEnvelope(result);
  return result;
}
export async function editorChatRequestHash(value) {
  plain(value);
  if (!EDITOR_CHAT_MUTATION_ACTIONS.includes(value.action)) editorChatFail();
  const normalized = normalizeEditorChatRequest({ ...value, requestHash: '0'.repeat(64) });
  const { action, ...request } = normalized;
  delete request.requestHash;
  return editorChatHash({ version: 1, action, request });
}
export async function verifyEditorChatRequest(value) {
  const request = normalizeEditorChatRequest(value);
  if (
    EDITOR_CHAT_MUTATION_ACTIONS.includes(request.action) &&
    request.requestHash !== (await editorChatRequestHash(request))
  )
    editorChatFail();
  return request;
}

function birth(value, keys) {
  editorChatClosed(value, keys);
  return value;
}
export async function editorChatProjectToken(value) {
  birth(value, ['ownerId', 'target', 'createdAt']);
  return editorChatHash({
    version: 1,
    ownerId: editorChatSourceId(value.ownerId),
    target: normalizeEditorChatTarget(value.target),
    createdAt: normalizeEditorChatStamp(value.createdAt),
  });
}
export async function editorChatContainerSceneToken(value) {
  birth(value, ['ownerId', 'target', 'projectToken', 'sceneId', 'createdAt']);
  const target = normalizeEditorChatTarget(value.target);
  if (target.kind !== 'adventure') editorChatFail();
  return editorChatHash({
    version: 1,
    ownerId: editorChatSourceId(value.ownerId),
    target,
    projectToken: editorChatHashToken(value.projectToken),
    sceneId: editorChatSourceId(value.sceneId),
    createdAt: normalizeEditorChatStamp(value.createdAt),
  });
}
function containerScene(v) {
  editorChatClosed(v, ['id', 'token']);
  return { id: editorChatSourceId(v.id), token: editorChatHashToken(v.token) };
}
export async function editorChatResourceToken(value) {
  birth(value, [
    'ownerId',
    'target',
    'resource',
    'projectToken',
    'createdAt',
    'bodyCreatedAt',
    'containerScene',
  ]);
  const target = normalizeEditorChatTarget(value.target),
    resource = normalizeEditorChatResource(value.resource, target);
  if ((resource.kind === 'scene') !== (value.containerScene === null)) editorChatFail();
  return editorChatHash({
    version: 1,
    ownerId: editorChatSourceId(value.ownerId),
    target,
    resource,
    projectToken: editorChatHashToken(value.projectToken),
    createdAt: normalizeEditorChatStamp(value.createdAt),
    bodyCreatedAt: normalizeEditorChatStamp(value.bodyCreatedAt),
    containerScene: nullable(value.containerScene, containerScene),
  });
}
export async function editorChatControlToken(kind, value) {
  if (!['context', 'conversation'].includes(kind)) editorChatFail();
  const idKey = kind + 'Id';
  editorChatClosed(value, ['ownerId', idKey, 'birthNonce', 'projectToken', 'resourceToken']);
  return editorChatHash({
    version: 1,
    kind,
    ownerId: editorChatSourceId(value.ownerId),
    [idKey]: editorChatId(value[idKey]),
    birthNonce: editorChatHashToken(value.birthNonce),
    projectToken: editorChatHashToken(value.projectToken),
    resourceToken: editorChatHashToken(value.resourceToken),
  });
}
export async function editorChatCleanupToken(value) {
  editorChatClosed(value, ['ownerId', 'cleanupId', 'birthNonce', 'subject']);
  const subject = shape(value.subject, {
    kind: (v) => one(v, ['context', 'conversation']),
    id: editorChatId,
    token: editorChatHashToken,
  });
  return editorChatHash({
    version: 1,
    kind: 'cleanup',
    ownerId: editorChatSourceId(value.ownerId),
    cleanupId: editorChatId(value.cleanupId),
    birthNonce: editorChatHashToken(value.birthNonce),
    subject,
  });
}
export async function editorChatBindingToken(value) {
  editorChatClosed(value, [
    'ownerId',
    'adventureId',
    'adventureToken',
    'sceneId',
    'sceneToken',
    'personaRevision',
    'value',
  ]);
  const sceneId = nullable(value.sceneId, editorChatSourceId);
  if ((sceneId === null) !== (value.sceneToken === null)) editorChatFail();
  return editorChatHash({
    version: 1,
    ownerId: editorChatSourceId(value.ownerId),
    adventureId: editorChatSourceId(value.adventureId),
    adventureToken: editorChatHashToken(value.adventureToken),
    sceneId,
    sceneToken: nullable(value.sceneToken, editorChatHashToken),
    personaRevision: editorChatRevision(value.personaRevision),
    value: bindingValue(value.value, sceneId),
  });
}
export function normalizeEditorChatLeaf(value) {
  plain(value);
  switch (value.kind) {
    case 'target': {
      editorChatClosed(value, ['kind', 'target', 'resource', 'projectToken', 'resourceToken']);
      const target = normalizeEditorChatTarget(value.target);
      return {
        kind: 'target',
        target,
        resource: normalizeEditorChatResource(value.resource, target),
        projectToken: editorChatHashToken(value.projectToken),
        resourceToken: editorChatHashToken(value.resourceToken),
      };
    }
    case 'lore':
      editorChatClosed(value, ['kind', 'reference', 'scopeToken', 'entityIdentityToken']);
      return {
        kind: 'lore',
        reference: normalizeEditorChatReference(value.reference),
        scopeToken: editorChatHashToken(value.scopeToken),
        entityIdentityToken: editorChatHashToken(value.entityIdentityToken),
      };
    case 'persona':
      editorChatClosed(value, ['kind', 'ownerId', 'personaId', 'identityToken']);
      return {
        kind: 'persona',
        ownerId: editorChatSourceId(value.ownerId),
        personaId: editorChatSourceId(value.personaId),
        identityToken: editorChatHashToken(value.identityToken),
      };
    case 'preset':
      editorChatClosed(value, ['kind', 'presetId', 'definitionHash']);
      return {
        kind: 'preset',
        presetId: one(value.presetId, EDITOR_CHAT_PRESETS),
        definitionHash: editorChatHashToken(value.definitionHash),
      };
    case 'binding': {
      editorChatClosed(value, ['kind', 'target', 'scopeKind', 'scopeId', 'identityToken']);
      const target = normalizeEditorChatTarget(value.target),
        scopeKind = one(
          value.scopeKind,
          target.kind === 'book' ? ['book', 'chapter'] : ['adventure', 'scene'],
        );
      if (scopeKind === target.kind && value.scopeId !== target.id) editorChatFail();
      return {
        kind: 'binding',
        target,
        scopeKind,
        scopeId: editorChatSourceId(value.scopeId),
        identityToken: editorChatHashToken(value.identityToken),
      };
    }
    default:
      editorChatFail();
  }
}
export async function normalizeEditorChatClosure(leaves) {
  const rows = list(leaves, normalizeEditorChatLeaf);
  const unique = new Map();
  for (const leaf of rows) unique.set(await editorChatHash(leaf), leaf);
  if (unique.size > EDITOR_CHAT_LIMITS.leaves) editorChatFail('context-rebase-required');
  const ordered = [...unique]
    .sort((a, b) => compareEditorChatStrings(a[0], b[0]))
    .map(([, leaf]) => leaf);
  const value = {
    schemaVersion: 1,
    leaves: ordered,
    closureHash: await editorChatHash({ version: 1, leaves: ordered }),
  };
  if (editorChatUTF8Bytes(canonicalEditorChatJSON(value)) > EDITOR_CHAT_LIMITS.closureBytes)
    editorChatFail('context-rebase-required');
  return value;
}
export async function verifyEditorChatClosure(value, scope = {}) {
  editorChatClosed(value, ['schemaVersion', 'leaves', 'closureHash']);
  if (value.schemaVersion !== 1) editorChatFail('inconsistent');
  const normalized = await normalizeEditorChatClosure(value.leaves);
  if (
    value.closureHash !== normalized.closureHash ||
    canonicalEditorChatJSON(value.leaves) !== canonicalEditorChatJSON(normalized.leaves)
  )
    editorChatFail('inconsistent');
  for (const leaf of normalized.leaves) {
    if (scope.ownerId && leaf.kind === 'persona' && leaf.ownerId !== scope.ownerId)
      editorChatFail('provenance-revoked');
    if (
      scope.target &&
      leaf.kind === 'lore' &&
      leaf.reference.kind !== 'universe' &&
      (leaf.reference.kind !== scope.target.kind || leaf.reference.scopeId !== scope.target.id)
    )
      editorChatFail('provenance-revoked');
    if (
      scope.target &&
      ['target', 'binding'].includes(leaf.kind) &&
      canonicalEditorChatJSON(leaf.target) !== canonicalEditorChatJSON(scope.target)
    )
      editorChatFail('provenance-revoked');
    if (
      scope.resource &&
      leaf.kind === 'target' &&
      canonicalEditorChatJSON(leaf.resource) !== canonicalEditorChatJSON(scope.resource)
    )
      editorChatFail('provenance-revoked');
  }
  return normalized;
}
export async function mergeEditorChatClosures(...closures) {
  const verified = await Promise.all(closures.map((v) => verifyEditorChatClosure(v)));
  return normalizeEditorChatClosure(verified.flatMap((v) => v.leaves));
}
export function editorChatApplyCost(provider, paid) {
  one(provider, ['platform', 'byok']);
  bool(paid);
  return provider === 'platform' && !paid ? 1 : 0;
}

// Closed public DTOs are structural projections, not proof of current authorization.
const field = {
  id: editorChatId,
  sourceId: editorChatSourceId,
  hash: editorChatHashToken,
  rev: editorChatRevision,
  date,
  bool,
  text: editorChatText,
};
function shape(v, fields) {
  editorChatClosed(v, Object.keys(fields));
  return Object.fromEntries(Object.entries(fields).map(([k, fn]) => [k, fn(v[k])]));
}
const schema = (v) => one(v, [1]);
const nullableHash = (v) => nullable(v, editorChatHashToken);
const nullableId = (v) => nullable(v, editorChatId);
function scopeShape(v, extra) {
  const target = normalizeEditorChatTarget(v.target);
  return shape(v, {
    ...extra,
    target: normalizeEditorChatTarget,
    resource: (r) => normalizeEditorChatResource(r, target),
  });
}
function stored(fn) {
  try {
    return fn();
  } catch (cause) {
    if (cause instanceof EditorChatContractError) editorChatFail('inconsistent');
    throw cause;
  }
}
function closureShape(v) {
  return shape(v, {
    schemaVersion: schema,
    leaves: (v) => list(v, normalizeEditorChatLeaf, 128),
    closureHash: field.hash,
  });
}
function generationShape(v) {
  const result = shape(v, {
    version: schema,
    requested: normalizeRequestedGeneration,
    effective: (v) =>
      shape(v, {
        provider: (v) => one(v, ['gemini', 'openai']),
        model: (v) => editorChatText(v, 120, true),
        reasoning: (v) => one(v, CHAT_REASONING_LEVELS),
        api: (v) => one(v, ['gemini-content', 'openai-chat', 'automatic']),
        ...Object.fromEntries(
          Object.entries(CHAT_GENERATION_LIMITS).map(([k, n]) => [k, (v) => one(v, [n])]),
        ),
      }),
  });
  const { requested, effective } = result;
  if (
    !/^[A-Za-z0-9._:-]{1,120}$/.test(effective.model) ||
    effective.provider !== (requested.provider === 'openai_byok' ? 'openai' : 'gemini') ||
    (requested.provider !== 'platform' && effective.model !== requested.model) ||
    (effective.provider === 'gemini' && effective.api === 'openai-chat') ||
    (effective.provider === 'openai' && effective.api === 'gemini-content')
  )
    editorChatFail();
  return result;
}
function confirmedSource(v) {
  const target = normalizeEditorChatTarget(v.target);
  const result = scopeShape(v, {
    projectToken: field.hash,
    resourceToken: field.hash,
    containerScene: (v) => nullable(v, containerScene),
    parent: (v) =>
      nullable(v, (p) =>
        shape(p, {
          kind: (k) => one(k, target.kind === 'book' ? ['chapter'] : ['part']),
          id: field.sourceId,
          token: field.hash,
        }),
      ),
    sourceToken: field.hash,
    revision: field.rev,
    bodyHash: field.hash,
    title: (v) => editorChatText(v, 300),
    projectTitle: (v) => editorChatText(v, 300),
    titleTruncated: bool,
    projectTitleTruncated: bool,
  });
  if ((result.resource.kind === 'scene') !== (result.containerScene === null)) editorChatFail();
  return result;
}
function contextSummary(v) {
  const r = scopeShape(v, {
    schemaVersion: schema,
    ownerId: field.sourceId,
    contextId: field.id,
    contextToken: field.hash,
    projectToken: field.hash,
    resourceToken: field.hash,
    revision: field.rev,
    phase: (v) => one(v, EDITOR_CHAT_CONTEXT_PHASES),
    scannedLocal: field.rev,
    scannedGlobal: field.rev,
    matchedEntityCount: (v) => nullable(v, field.rev),
    includedEntityCount: (v) => nullable(v, field.rev),
    omittedEntityCount: (v) => nullable(v, field.rev),
    turnId: nullableId,
    createdAt: date,
    updatedAt: date,
  });
  const counts = [r.matchedEntityCount, r.includedEntityCount, r.omittedEntityCount];
  if (counts.some((v) => v === null) && !counts.every((v) => v === null)) editorChatFail();
  if (
    counts[0] !== null &&
    (r.includedEntityCount !== Math.min(12, r.matchedEntityCount) ||
      r.omittedEntityCount !== r.matchedEntityCount - r.includedEntityCount)
  )
    editorChatFail();
  if (['ready', 'consumed'].includes(r.phase) && counts[0] === null) editorChatFail();
  if (['local', 'global'].includes(r.phase) && counts[0] !== null) editorChatFail();
  if (r.phase === 'consumed' && r.turnId === null) editorChatFail();
  if (['local', 'global', 'ready'].includes(r.phase) && r.turnId !== null) editorChatFail();
  if (r.updatedAt < r.createdAt) editorChatFail();
  return r;
}
function conversationSummary(v) {
  const r = scopeShape(v, {
    schemaVersion: schema,
    conversationId: field.id,
    conversationToken: field.hash,
    projectToken: field.hash,
    resourceToken: field.hash,
    revision: field.rev,
    state: (v) => one(v, ['open', 'deleting', 'deleted']),
    title: (v) => editorChatText(v, 120),
    activeTurnId: nullableId,
    createdAt: date,
    updatedAt: date,
  });
  if (r.updatedAt < r.createdAt) editorChatFail();
  return r;
}
function turnSummary(v) {
  const r = shape(v, {
    schemaVersion: schema,
    turnId: field.id,
    conversationId: field.id,
    revision: field.rev,
    attemptToken: field.hash,
    state: (v) => one(v, EDITOR_CHAT_TURN_STATES),
    provider: (v) => one(v, ['platform', 'byok']),
    generation: generationShape,
    contextHash: field.hash,
    closureHash: field.hash,
    sourceToken: field.hash,
    suggestionAvailable: bool,
    paid: bool,
    failureReason: (v) => nullable(v, (r) => one(r, EDITOR_CHAT_FAILURE_REASONS)),
    createdAt: date,
    updatedAt: date,
  });
  if (
    (r.provider === 'platform') !== (r.generation.requested.provider === 'platform') ||
    (r.suggestionAvailable && r.state !== 'done') ||
    r.updatedAt < r.createdAt ||
    (r.state === 'awaiting-byok' && r.provider !== 'byok')
  )
    editorChatFail();
  return r;
}
function loreSnapshot(v) {
  return shape(v, {
    reference: normalizeEditorChatReference,
    identityToken: field.hash,
    capturedRevision: (v) => nullable(v, field.rev),
    capturedStamp: normalizeEditorChatStamp,
    name: (v) => editorChatText(v, 200),
    aliases: (v) => list(v, (a) => editorChatText(a, 200), 20),
    category: (v) => editorChatText(v, 30),
    summary: (v) => editorChatText(v, 140),
    detailsExcerpt: (v) => editorChatText(v, 2000),
    aliasesOmitted: field.rev,
    detailsTruncated: bool,
  });
}
function personaProfile(v) {
  const r = shape(v, {
    kind: (v) => one(v, ['preset', 'custom']),
    id: normalizeEditorChatPersonaId,
    identityToken: field.hash,
    revision: field.rev,
  });
  if ((r.kind === 'preset') !== EDITOR_CHAT_PRESETS.includes(r.id)) editorChatFail();
  return r;
}
function personaSnapshot(v) {
  return shape(v, {
    bindingHash: field.hash,
    profileHash: field.hash,
    capturedAt: date,
    base: (v) => nullable(v, personaProfile),
    complement: (v) => nullable(v, personaProfile),
    instruction: (v) => editorChatText(v, 36000),
  });
}
function frozenContext(v) {
  const r = shape(v, {
    schemaVersion: schema,
    matcherVersion: schema,
    capturedAt: date,
    source: confirmedSource,
    capture: normalizeEditorChatCapture,
    lore: (v) => list(v, loreSnapshot, 12),
    persona: personaSnapshot,
    includedEntityCount: field.rev,
    omittedEntityCount: field.rev,
    closure: closureShape,
    contextHash: field.hash,
  });
  if (r.includedEntityCount !== r.lore.length) editorChatFail();
  assertEditorChatEnvelope(r);
  return r;
}
const freshness = (v) => one(v, ['current', 'stale', 'unknown']);
function historySummary(v) {
  const r = shape(v, {
    turnIds: (v) => list(v, field.id, 10),
    recordCount: field.rev,
    characterCount: field.rev,
    omittedRecordCount: (v) => nullable(v, field.rev),
    omittedCharacterCount: (v) => nullable(v, field.rev),
    hasOlderHistory: bool,
  });
  if (
    r.recordCount !== r.turnIds.length * 2 ||
    r.recordCount > 20 ||
    r.characterCount > 32000 ||
    new Set(r.turnIds).size !== r.turnIds.length
  )
    editorChatFail();
  return r;
}
function turnRead(v) {
  const r = shape(v, {
    turn: turnSummary,
    question: (v) => editorChatText(v, 4000),
    presentation: (v) => one(v, ['available', 'blocked']),
    answer: (v) =>
      nullable(v, (a) =>
        shape(a, {
          text: (v) => editorChatText(v, 24000),
          suggestion: (v) => nullable(v, (s) => editorChatText(s, 16000, true)),
          context: frozenContext,
          provenance: closureShape,
          history: historySummary,
          freshness,
        }),
      ),
  });
  if (
    (r.presentation === 'blocked' && r.answer !== null) ||
    (r.answer &&
      (r.answer.context.contextHash !== r.turn.contextHash ||
        r.answer.provenance.closureHash !== r.turn.closureHash ||
        r.answer.text.length + (r.answer.suggestion?.length ?? 0) > 24000))
  )
    editorChatFail();
  return r;
}
function cleanupSummary(v) {
  const r = shape(v, {
    schemaVersion: schema,
    cleanupId: field.id,
    cleanupToken: field.hash,
    revision: field.rev,
    subject: (v) =>
      shape(v, {
        kind: (v) => one(v, ['context', 'conversation']),
        id: field.id,
        token: field.hash,
      }),
    state: (v) => one(v, ['deleting', 'deleted']),
    phase: (v) => one(v, EDITOR_CHAT_CLEANUP_PHASES),
    deletedDocuments: field.rev,
    createdAt: date,
    updatedAt: date,
  });
  if (
    (r.state === 'deleted') !== (r.phase === 'complete') ||
    r.updatedAt < r.createdAt ||
    (r.subject.kind === 'context' && !['context-body', 'complete'].includes(r.phase)) ||
    (r.subject.kind === 'conversation' && r.phase === 'context-body')
  )
    editorChatFail();
  return r;
}
function personaBinding(v) {
  const sceneId = nullable(v.sceneId, field.sourceId);
  const r = shape(v, {
    schemaVersion: schema,
    ownerId: field.sourceId,
    adventureId: field.sourceId,
    adventureToken: field.hash,
    sceneId: (v) => nullable(v, field.sourceId),
    sceneToken: nullableHash,
    personaRevision: field.rev,
    bindingToken: field.hash,
    value: (v) => bindingValue(v, sceneId),
    updatedAt: date,
  });
  if ((r.sceneId === null) !== (r.sceneToken === null)) editorChatFail();
  return r;
}
function applyResult(v) {
  return scopeShape(v, {
    projectToken: field.hash,
    resourceToken: field.hash,
    revision: field.rev,
    contentHash: field.hash,
    bodyBytes: field.rev,
    wordCount: field.rev,
    projectRevision: field.rev,
    chargedCredits: (v) => one(v, [0, 1]),
  });
}
function byokInput(v) {
  const r = shape(v, {
    turnId: field.id,
    attemptToken: field.hash,
    generation: generationShape,
    systemInstruction: (v) => editorChatText(v),
    prompt: (v) => editorChatText(v, 4000),
    context: frozenContext,
    history: (v) =>
      list(
        v,
        (h) =>
          shape(h, {
            role: (v) => one(v, ['user', 'assistant']),
            text: (v) => editorChatText(v, 32000),
          }),
        20,
      ),
    closureHash: field.hash,
  });
  if (
    r.generation.requested.provider === 'platform' ||
    r.history.length % 2 ||
    r.history.reduce((n, h) => n + h.text.length, 0) > 32000 ||
    r.history.some((h, i) => h.role !== (i % 2 ? 'assistant' : 'user'))
  )
    editorChatFail();
  assertEditorChatEnvelope(r);
  return r;
}
function receiptResult(v, kind) {
  if (kind === 'fence') return shape(v, { kind: (v) => one(v, ['fence']) });
  const common = { kind: (v) => one(v, [kind]) };
  if (kind === 'context')
    return shape(v, {
      ...common,
      contextId: field.id,
      contextToken: field.hash,
      revision: field.rev,
      phase: (v) => one(v, EDITOR_CHAT_CONTEXT_PHASES),
    });
  if (kind === 'conversation')
    return shape(v, {
      ...common,
      conversationId: field.id,
      conversationToken: field.hash,
      revision: field.rev,
      state: (v) => one(v, ['open', 'deleting', 'deleted']),
    });
  if (kind === 'turn')
    return shape(v, {
      ...common,
      conversationId: field.id,
      conversationToken: field.hash,
      turnId: field.id,
      attemptToken: field.hash,
      revision: field.rev,
      state: (v) => one(v, EDITOR_CHAT_TURN_STATES),
    });
  if (kind === 'apply')
    return shape(v, {
      ...common,
      conversationId: field.id,
      conversationToken: field.hash,
      turnId: field.id,
      resourceToken: field.hash,
      revision: field.rev,
      contentHash: field.hash,
      bodyBytes: field.rev,
      wordCount: field.rev,
      projectRevision: field.rev,
      chargedCredits: (v) => one(v, [0, 1]),
    });
  if (kind === 'cleanup') {
    const r = shape(v, {
      ...common,
      cleanupId: field.id,
      cleanupToken: field.hash,
      revision: field.rev,
      state: (v) => one(v, ['deleting', 'deleted']),
      phase: (v) => one(v, EDITOR_CHAT_CLEANUP_PHASES),
      deletedDocuments: field.rev,
    });
    if ((r.state === 'deleted') !== (r.phase === 'complete')) editorChatFail();
    return r;
  }
  if (kind === 'persona-binding') {
    const r = shape(v, {
      ...common,
      adventureId: field.sourceId,
      adventureToken: field.hash,
      sceneId: (v) => nullable(v, field.sourceId),
      sceneToken: nullableHash,
      personaRevision: field.rev,
      bindingToken: field.hash,
    });
    if ((r.sceneId === null) !== (r.sceneToken === null)) editorChatFail();
    return r;
  }
  editorChatFail();
}
export function normalizeEditorChatReceipt(value, expected = {}) {
  return stored(() => {
    const r = shape(value, {
      schemaVersion: schema,
      operationId: field.id,
      action: (v) => one(v, EDITOR_CHAT_MUTATION_ACTIONS),
      requestHash: field.hash,
      outcome: (v) => one(v, ['confirmed', 'canceled']),
      confirmedAt: date,
      result: (v) =>
        receiptResult(
          v,
          value.outcome === 'canceled' ? 'fence' : EDITOR_CHAT_RECEIPT_KINDS[value.action],
        ),
    });
    for (const k of ['operationId', 'action', 'requestHash'])
      if (expected[k] !== undefined && expected[k] !== r[k]) editorChatFail();
    for (const k of [
      'contextId',
      'conversationId',
      'turnId',
      'cleanupId',
      'adventureId',
      'resourceToken',
    ])
      if (expected[k] !== undefined && r.outcome === 'confirmed' && expected[k] !== r.result[k])
        editorChatFail();
    if (
      expected.maxRevision !== undefined &&
      (r.result.revision ?? r.result.personaRevision ?? 0) >
        editorChatRevision(expected.maxRevision)
    )
      editorChatFail();
    if (
      r.outcome === 'confirmed' &&
      ((r.action === 'prepareContext' && r.result.contextId !== r.operationId) ||
        (r.action === 'send' && r.result.turnId !== r.operationId) ||
        (['deleteContext', 'deleteConversation'].includes(r.action) &&
          r.result.cleanupId !== r.operationId))
    )
      editorChatFail();
    if (
      r.outcome === 'confirmed' &&
      r.action === 'deleteContext' &&
      !['context-body', 'complete'].includes(r.result.phase)
    )
      editorChatFail();
    if (
      r.outcome === 'confirmed' &&
      r.action === 'deleteConversation' &&
      r.result.phase === 'context-body'
    )
      editorChatFail();
    return r;
  });
}
export function normalizeEditorChatDTO(kind, value, options = {}) {
  return stored(() => {
    if (kind === 'streamEvent') {
      if (value?.type === 'delta')
        return shape(value, {
          type: (v) => one(v, ['delta']),
          turnId: field.id,
          attemptToken: field.hash,
          index: field.rev,
          text: (v) => editorChatText(v, 24000),
        });
      return shape(value, { type: (v) => one(v, ['started', 'settled']), turn: turnSummary });
    }
    if (kind === 'journal') {
      const scope = normalizeEditorChatJournalScope({
        target: value.target,
        resource: value.resource,
      });
      const r = shape(value, {
        schemaVersion: schema,
        ownerId: field.sourceId,
        target: () => scope.target,
        resource: () => scope.resource,
        projectToken: nullableHash,
        resourceToken: nullableHash,
        action: (v) => one(v, EDITOR_CHAT_MUTATION_ACTIONS),
        operationId: field.id,
        requestHash: field.hash,
        contextId: nullableId,
        contextToken: nullableHash,
        conversationId: nullableId,
        conversationToken: nullableHash,
        turnId: nullableId,
        attemptToken: nullableHash,
        cleanupId: nullableId,
        cleanupToken: nullableHash,
        expectedRevision: (v) => nullable(v, field.rev),
        state: (v) => one(v, ['pending', 'uncertain', 'settled']),
        intent: (v) => one(v, ['observe', 'cancel']),
        generation: (v) => nullable(v, normalizeRequestedGeneration),
        localGeneration: field.rev,
      });
      const personaSetter = r.action === 'setAdventurePersonaBinding';
      if (
        (personaSetter
          ? r.target.kind !== 'adventure' ||
            r.projectToken === null ||
            r.resourceToken !== null ||
            (r.resource !== null && r.resource.kind !== 'scene')
          : r.resource === null || (r.projectToken === null) !== (r.resourceToken === null)) ||
        (r.contextToken !== null && r.contextId === null) ||
        (r.conversationToken !== null && r.conversationId === null) ||
        (r.attemptToken !== null && r.turnId === null) ||
        (r.cleanupToken !== null && r.cleanupId === null)
      )
        editorChatFail();
      return r;
    }
    const direct = {
      context: contextSummary,
      conversation: conversationSummary,
      turn: turnSummary,
      source: confirmedSource,
      lore: loreSnapshot,
      persona: personaSnapshot,
      frozenContext,
      history: historySummary,
      turnRead,
      cleanup: cleanupSummary,
      personaBinding,
      apply: applyResult,
      byokInput,
    };
    if (Object.hasOwn(direct, kind)) return direct[kind](value);
    if (kind === 'contextInspection') {
      const r = shape(value, {
        context: contextSummary,
        source: confirmedSource,
        frozen: (v) => nullable(v, frozenContext),
        freshness,
      });
      if (
        r.frozen &&
        (r.context.phase !== 'ready' ||
          r.context.projectToken !== r.source.projectToken ||
          r.context.resourceToken !== r.source.resourceToken ||
          canonicalEditorChatJSON(r.source) !== canonicalEditorChatJSON(r.frozen.source))
      )
        editorChatFail();
      return r;
    }
    if (kind === 'conversationPage') {
      const r = scopeShape(value, {
        schemaVersion: schema,
        ownerId: field.sourceId,
        projectToken: field.hash,
        resourceToken: field.hash,
        collectionRevision: field.rev,
        platformModel: (v) => editorChatText(v, 120, true),
        items: (v) => list(v, conversationSummary, 50),
        nextCursor: (v) => nullable(v, (x) => editorChatText(x, 900000, true)),
      });
      if (
        r.items.some(
          (i) =>
            i.state !== 'open' ||
            canonicalEditorChatJSON(i.target) !== canonicalEditorChatJSON(r.target) ||
            canonicalEditorChatJSON(i.resource) !== canonicalEditorChatJSON(r.resource) ||
            i.projectToken !== r.projectToken ||
            i.resourceToken !== r.resourceToken,
        )
      )
        editorChatFail();
      return r;
    }
    if (kind === 'turnPage') {
      const r = shape(value, {
        schemaVersion: schema,
        ownerId: field.sourceId,
        conversationId: field.id,
        conversationToken: field.hash,
        conversationRevision: field.rev,
        items: (v) => list(v, turnSummary, 50),
        nextCursor: (v) => nullable(v, (x) => editorChatText(x, 900000, true)),
      });
      if (r.items.some((i) => i.conversationId !== r.conversationId)) editorChatFail();
      return r;
    }
    if (kind === 'byokRead') {
      const r = shape(value, { turn: turnSummary, input: (v) => nullable(v, byokInput) });
      if (
        r.input &&
        (r.turn.state !== 'awaiting-byok' ||
          r.turn.turnId !== r.input.turnId ||
          r.turn.attemptToken !== r.input.attemptToken ||
          r.turn.contextHash !== r.input.context.contextHash ||
          r.turn.closureHash !== r.input.closureHash ||
          canonicalEditorChatJSON(r.turn.generation) !==
            canonicalEditorChatJSON(r.input.generation))
      )
        editorChatFail();
      return r;
    }
    if (kind === 'sendResult') {
      const r = shape(value, {
        receipt: (v) => normalizeEditorChatReceipt(v, options),
        turn: (v) => nullable(v, turnSummary),
        delivery: (v) => nullable(v, (x) => one(x, ['server-stream', 'byok'])),
        byokInput: (v) => nullable(v, byokInput),
      });
      if (
        r.receipt.action !== 'send' ||
        (r.turn === null && (r.delivery !== null || r.byokInput !== null)) ||
        (r.receipt.outcome === 'canceled' && r.turn !== null)
      )
        editorChatFail();
      if (
        r.turn &&
        (r.receipt.operationId !== r.turn.turnId ||
          r.receipt.result.conversationId !== r.turn.conversationId ||
          r.receipt.result.attemptToken !== r.turn.attemptToken ||
          r.delivery === null ||
          (r.delivery === 'server-stream') !== (r.turn.provider === 'platform') ||
          (r.byokInput &&
            (r.turn.state !== 'awaiting-byok' ||
              r.byokInput.turnId !== r.turn.turnId ||
              r.byokInput.attemptToken !== r.turn.attemptToken ||
              r.byokInput.context.contextHash !== r.turn.contextHash ||
              r.byokInput.closureHash !== r.turn.closureHash ||
              canonicalEditorChatJSON(r.byokInput.generation) !==
                canonicalEditorChatJSON(r.turn.generation))))
      )
        editorChatFail();
      return r;
    }
    if (kind === 'resolution') {
      const r = shape(value, {
        state: (v) => one(v, ['unknown', 'pending', 'settled']),
        receipt: (v) => nullable(v, (x) => normalizeEditorChatReceipt(x, options)),
      });
      if ((r.state === 'settled') !== (r.receipt !== null)) editorChatFail();
      return r;
    }
    if (kind === 'mutation') {
      const r = shape(value, {
        receipt: (v) => normalizeEditorChatReceipt(v, options),
        current: (v) =>
          v === null
            ? null
            : normalizeEditorChatDTO(
                {
                  context: 'context',
                  conversation: 'conversation',
                  turn: 'turn',
                  apply: 'apply',
                  cleanup: 'cleanup',
                  'persona-binding': 'personaBinding',
                }[EDITOR_CHAT_RECEIPT_KINDS[options.action ?? value.receipt.action]],
                v,
              ),
      });
      return r;
    }
    editorChatFail();
  });
}
export async function verifyEditorChatSnapshot(value) {
  const r = normalizeEditorChatDTO('frozenContext', value);
  await verifyEditorChatClosure(r.closure, {
    target: r.source.target,
    resource: r.source.resource,
  });
  const { contextHash, ...body } = r;
  if (contextHash !== (await editorChatHash(body))) editorChatFail('inconsistent');
  const targetLeaf = r.closure.leaves.find((l) => l.kind === 'target');
  if (
    !targetLeaf ||
    targetLeaf.projectToken !== r.source.projectToken ||
    targetLeaf.resourceToken !== r.source.resourceToken
  )
    editorChatFail('inconsistent');
  for (const lore of r.lore) {
    if (
      !r.closure.leaves.some(
        (l) =>
          l.kind === 'lore' &&
          l.entityIdentityToken === lore.identityToken &&
          canonicalEditorChatJSON(l.reference) === canonicalEditorChatJSON(lore.reference),
      )
    )
      editorChatFail('inconsistent');
  }
  for (const profile of [r.persona.base, r.persona.complement].filter(Boolean)) {
    if (
      !r.closure.leaves.some((l) =>
        profile.kind === 'preset'
          ? l.kind === 'preset' &&
            l.presetId === profile.id &&
            l.definitionHash === profile.identityToken
          : l.kind === 'persona' &&
            l.personaId === profile.id &&
            l.identityToken === profile.identityToken,
      )
    )
      editorChatFail('inconsistent');
  }
  return r;
}
export function selectEditorChatHistoryMetadata(rows, hasMore = false) {
  bool(hasMore);
  const eligible = list(rows, (v) =>
    shape(v, {
      turnId: field.id,
      state: (v) => one(v, EDITOR_CHAT_TURN_STATES),
      questionChars: field.rev,
      modelAnswerChars: field.rev,
    }),
  ).filter((v) => v.state === 'done');
  const selected = [];
  let used = 0;
  for (const row of eligible) {
    const n = row.questionChars + row.modelAnswerChars;
    if (!Number.isSafeInteger(n)) editorChatFail('inconsistent');
    if (selected.length === 10 || used + n > 32000) break;
    selected.push(row);
    used += n;
  }
  return {
    turnIds: selected.map((v) => v.turnId).reverse(),
    recordCount: selected.length * 2,
    characterCount: used,
    omittedRecordCount: hasMore ? null : (eligible.length - selected.length) * 2,
    omittedCharacterCount: hasMore
      ? null
      : eligible
          .slice(selected.length)
          .reduce((n, v) => n + v.questionChars + v.modelAnswerChars, 0),
    hasOlderHistory: hasMore || eligible.length > selected.length,
  };
}
