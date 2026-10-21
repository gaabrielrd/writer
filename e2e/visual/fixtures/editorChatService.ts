/** Transport-only fictional server. Production controller, host, PM bridge and local journal remain real.
 * Session data below models the remote store; it is NOT evidence of backend authorization/atomicity. */
import {
  canonicalEditorChatJSON as json,
  editorChatHash as hash,
  editorChatRequestHash,
  normalizeEditorChatRequest,
  normalizeEditorChatDTO,
  normalizeEditorChatReceipt,
  type EditorChatAction,
  type EditorChatRequest,
  type EditorChatResponseMap,
  type EditorChatReceipt,
  type EditorChatReceiptResult,
  type EditorChatScope,
  type EditorChatSource,
  type EditorChatCapture,
  type EditorChatContextSummary,
  type EditorChatFrozenContext,
  type EditorChatConversationSummary,
  type EditorChatTurnSummary,
  type EditorChatTurnRead,
  type EditorChatCleanupSummary,
  type EditorChatOperationRow,
  type EditorChatPersonaBinding,
  type EditorChatPersonaBindingValue,
  type EditorChatPersonaSnapshot,
} from '../../../src/features/ai-assistant/model/editorChat';
import {
  normalizeEditorChatClosure,
  EditorChatContractError,
  editorChatBindingToken,
} from '../../../functions/src/editorChatContracts.mjs';
import {
  DEFAULT_PERSONAS,
  resolveWritingPersona,
  resolvePersonaProfile,
  isDefaultPersona,
  type AIPersona,
} from '../../../functions/src/personaProfile.mjs';
import { listPersonas } from './personaService';
import { countVisibleWords } from '../../../functions/src/visibleWordCount.mjs';
import {
  editorChatMatcherId,
  findEditorChatLoreMatches,
} from '../../../functions/src/editorChatMatcher.mjs';
import { resolveChatGeneration } from '../../../src/features/ai-assistant/model/chatGeneration';
import { assertEditorChatOperation } from '../../../src/features/ai-assistant/services/editorChatOperationStorage';
import type { EditorChatCallOptions } from '../../../src/features/ai-assistant/services/editorChatService';
import { getWorkVersionSource } from './workHistoryFixture';
import { fixtureSceneState } from './sceneStore';
import { createScene, createSceneGroup, updateScene } from './sceneService';
import { createAdventureBlock, updateAdventureBlock } from './adventureBlocksFixture';
import { fixtureWriteBook } from './bookService';
import { fixtureOwner, fixturePatchProject } from './studioStore';
import { listLoreEntities, createLoreEntity, seedAssistedLore } from './loreService';
import {
  listAdventureLore,
  fixtureGetLocalAdventureLore,
  fixtureSeedAdventureLore,
  fixtureAdventureLoreHint,
} from './adventureLoreFixture';
import { createUniverse } from './universeService';
import { getUserCredits, deductCredit } from './aiService';
import { FIXTURE_BOOK_ID, FIXTURE_TIME } from './data';
import { auth } from './firebase';
import type { LoreEntity } from '../../../src/features/lore/model/loreEntity';

export class EditorChatTransportError extends Error {
  readonly code: string;
  readonly uncertain: boolean;
  readonly reason: string | null;
  constructor(code: string, uncertain: boolean, reason: string | null = null) {
    super('Não foi possível concluir este pedido. Confira o estado antes de continuar.');
    this.name = 'EditorChatTransportError';
    this.code = code;
    this.uncertain = uncertain;
    this.reason = reason;
  }
}
type Context = {
  summary: EditorChatContextSummary;
  source: EditorChatSource;
  capture: EditorChatCapture;
  frozen: EditorChatFrozenContext | null;
};
type Turn = {
  summary: EditorChatTurnSummary;
  question: string;
  frozen: EditorChatFrozenContext;
  text: string;
  suggestion: string | null;
};
type Store = {
  contexts: Record<string, Context>;
  conversations: Record<string, EditorChatConversationSummary>;
  turns: Record<string, Record<string, Turn>>;
  operations: Record<string, EditorChatReceipt>;
  cleanups: Record<string, EditorChatCleanupSummary>;
  bindings: Record<string, EditorChatPersonaBinding>;
  revision: number;
  clock: number;
  calls: string[];
};
const key = () => 'writer.visual.editor-chat:' + fixtureOwner();
function store(): Store {
  const value = JSON.parse(
    sessionStorage.getItem(key()) ??
      '{"contexts":{},"conversations":{},"turns":{},"operations":{},"cleanups":{},"revision":0,"clock":0,"calls":[]}',
  ) as Store;
  value.bindings ??= {};
  return value;
}
const persist = (value: Store) => sessionStorage.setItem(key(), JSON.stringify(value));
const time = (s: Store) => FIXTURE_TIME + ++s.clock;
const same = (a: unknown, b: unknown) => json(a) === json(b);
const scopeOf = (r: EditorChatScope) => ({ target: r.target, resource: r.resource });
const history = {
  turnIds: [],
  recordCount: 0,
  characterCount: 0,
  omittedRecordCount: 0,
  omittedCharacterCount: 0,
  hasOlderHistory: false,
};
function fail(reason: string): never {
  throw new EditorChatTransportError('functions/failed-precondition', false, reason);
}
const matches = (c: EditorChatScope, r: EditorChatScope) => same(scopeOf(c), scopeOf(r));
const revoked = () => sessionStorage.getItem('writer.visual.editor-chat-revoked') === 'true';
let queue = Promise.resolve();
let releaseProvider: (() => void) | null = null;
let releaseResolution: (() => void) | null = null;

async function source(scope: EditorChatScope): Promise<EditorChatSource> {
  const saved = await getWorkVersionSource(scope);
  if (!saved || saved.revision === null) return fail('source-unavailable');
  const state = await fixtureSceneState(scope.target);
  const scene =
    scope.resource.kind === 'block'
      ? Object.values(state.adventureBlocks ?? {}).find(
          (row) => row.resource.id === scope.resource.id,
        )
      : state.scenes[scope.resource.id];
  if (!scene) return fail('source-unavailable');
  const projectToken = await hash({
    fixture: 'project-birth',
    owner: fixtureOwner(),
    target: scope.target,
  });
  const resourceToken = await hash({
    fixture: 'resource-birth',
    projectToken,
    resource: scope.resource,
  });
  const sceneId =
    scope.resource.kind === 'block' && 'sceneId' in scene ? scene.sceneId : scope.resource.id;
  const container = state.scenes[sceneId];
  return normalizeEditorChatDTO('source', {
    ...scopeOf(scope),
    projectToken,
    resourceToken,
    containerScene:
      scope.resource.kind === 'block'
        ? { id: sceneId, token: await hash({ projectToken, sceneId }) }
        : null,
    parent: container?.parentId
      ? {
          kind: scope.target.kind === 'book' ? 'chapter' : 'part',
          id: container.parentId,
          token: await hash({ projectToken, parent: container.parentId }),
        }
      : null,
    sourceToken: saved.sourceToken,
    revision: saved.revision,
    bodyHash: saved.contentHash,
    title: saved.title.slice(0, 300),
    projectTitle: state.title.slice(0, 300),
    titleTruncated: saved.title.length > 300,
    projectTitleTruncated: state.title.length > 300,
  });
}
async function lore(scope: EditorChatScope) {
  const state = await fixtureSceneState(scope.target);
  const local: LoreEntity[] =
    scope.target.kind === 'book'
      ? await listLoreEntities(scope.target.id)
      : await (async () => {
          const page = await listAdventureLore({
            adventureId: scope.target.id,
            scope: 'adventure',
          });
          const rows = await Promise.all(
            page.items.map((row) =>
              fixtureGetLocalAdventureLore(scope.target.id, row.reference.entityId),
            ),
          );
          return rows.filter((row): row is LoreEntity => row !== null);
        })();
  const global = state.universeId
    ? await listLoreEntities({ kind: 'universe', id: state.universeId })
    : [];
  return [...local, ...global].map((entity) => {
    const kind = entity.universeId ? ('universe' as const) : scope.target.kind;
    const scopeId = entity.universeId ?? scope.target.id;
    const prefix = `${kind}:${scopeId}:`;
    const reference = {
      kind,
      scopeId,
      entityId: entity.id.startsWith(prefix) ? entity.id.slice(prefix.length) : entity.id,
    };
    return {
      entity,
      reference,
      id: editorChatMatcherId(reference),
      name: entity.name,
      aliases: entity.aliases,
      global: !!entity.universeId,
    };
  });
}

const bindingKey = (adventureId: string, sceneId: string | null) =>
  JSON.stringify([adventureId, sceneId]);
async function personaBinding(s: Store, adventureId: string, sceneId: string | null) {
  const target = { kind: 'adventure' as const, id: adventureId };
  const state = await fixtureSceneState(target);
  if (sceneId !== null && !state.scenes[sceneId]) fail('source-unavailable');
  const id = bindingKey(adventureId, sceneId);
  const previous = s.bindings[id];
  if (previous) return previous;
  const adventureToken = await hash({ fixture: 'project-birth', owner: fixtureOwner(), target });
  const fields = {
    ownerId: fixtureOwner(),
    adventureId,
    adventureToken,
    sceneId,
    sceneToken: sceneId === null ? null : await hash({ projectToken: adventureToken, sceneId }),
    personaRevision: 0,
    value: sceneId === null ? { personaId: null } : { personaComplement: null },
  };
  const current = normalizeEditorChatDTO('personaBinding', {
    schemaVersion: 1,
    ...fields,
    bindingToken: await editorChatBindingToken(fields),
    updatedAt: FIXTURE_TIME,
  });
  s.bindings[id] = current;
  persist(s);
  return current;
}
async function nextBinding(
  s: Store,
  before: EditorChatPersonaBinding,
  value: EditorChatPersonaBindingValue,
) {
  const fields = {
    ownerId: before.ownerId,
    adventureId: before.adventureId,
    adventureToken: before.adventureToken,
    sceneId: before.sceneId,
    sceneToken: before.sceneToken,
    personaRevision: before.personaRevision + 1,
    value,
  };
  const current = normalizeEditorChatDTO('personaBinding', {
    schemaVersion: 1,
    ...fields,
    bindingToken: await editorChatBindingToken(fields),
    updatedAt: time(s),
  });
  s.bindings[bindingKey(before.adventureId, before.sceneId)] = current;
  return current;
}
async function compilePersona(
  s: Store,
  scope: EditorChatScope,
  at: number,
): Promise<{
  snapshot: EditorChatPersonaSnapshot;
  leaves: Awaited<ReturnType<typeof normalizeEditorChatClosure>>['leaves'];
}> {
  if (scope.target.kind === 'book')
    return {
      snapshot: {
        bindingHash: await hash({ fixture: 'binding' }),
        profileHash: await hash({ fixture: 'profile' }),
        capturedAt: at,
        base: null,
        complement: null,
        instruction: 'Oriente a escrita sem substituir as decisões do autor.',
      },
      leaves: [],
    };
  const state = await fixtureSceneState(scope.target);
  const sceneId =
    scope.resource.kind === 'scene'
      ? scope.resource.id
      : state.adventureBlocks?.[scope.resource.id]?.sceneId;
  if (!sceneId) return fail('source-unavailable');
  const base = await personaBinding(s, scope.target.id, null);
  const scene = await personaBinding(s, scope.target.id, sceneId);
  const baseId = 'personaId' in base.value ? base.value.personaId : null;
  const complement = 'personaComplement' in scene.value ? scene.value.personaComplement : null;
  const profiles = [...DEFAULT_PERSONAS, ...(await listPersonas(fixtureOwner()))];
  const resolved = resolvePersonaProfile(profiles, baseId, complement);
  const compiled = resolveWritingPersona(profiles, baseId, complement, 'adventure');
  const describe = async (profile: AIPersona | null) =>
    profile
      ? {
          kind: isDefaultPersona(profile.id) ? ('preset' as const) : ('custom' as const),
          id: profile.id,
          identityToken: await hash(profile),
          revision: profile.revision,
        }
      : null;
  const snapshot = {
    bindingHash: await hash([base.bindingToken, scene.bindingToken]),
    profileHash: await hash([resolved.base, resolved.chapter]),
    capturedAt: at,
    base: await describe(resolved.base),
    complement: await describe(resolved.chapter),
    instruction: compiled.instruction,
  };
  const leaves = (
    await normalizeEditorChatClosure([
      {
        kind: 'binding',
        target: scope.target,
        scopeKind: 'adventure',
        scopeId: scope.target.id,
        identityToken: base.bindingToken,
      },
      {
        kind: 'binding',
        target: scope.target,
        scopeKind: 'scene',
        scopeId: sceneId,
        identityToken: scene.bindingToken,
      },
      ...[snapshot.base, snapshot.complement]
        .filter((p) => p !== null)
        .map((profile) =>
          profile.kind === 'preset'
            ? { kind: 'preset', presetId: profile.id, definitionHash: profile.identityToken }
            : {
                kind: 'persona',
                ownerId: fixtureOwner(),
                personaId: profile.id,
                identityToken: profile.identityToken,
              },
        ),
    ])
  ).leaves;
  return { snapshot, leaves };
}
async function freeze(context: Context): Promise<EditorChatFrozenContext> {
  const rows = await lore(context.summary);
  const found = findEditorChatLoreMatches(
    context.capture.text + '\n' + context.capture.surroundingText,
    rows,
  );
  const ids = [...new Set(found.map((match) => match.id))];
  const selected = ids.slice(0, 12).map((id) => rows.find((row) => row.id === id)!);
  const included = await Promise.all(
    selected.map(async ({ entity, reference }) => ({
      reference,
      identityToken: await hash({ fixture: 'lore-birth', reference }),
      capturedRevision: 1,
      capturedStamp: { seconds: Math.floor(FIXTURE_TIME / 1000), nanoseconds: 0 },
      name: entity.name.slice(0, 200),
      aliases: entity.aliases.slice(0, 20).map((alias) => alias.slice(0, 200)),
      category: entity.category,
      summary: entity.summary.slice(0, 140),
      detailsExcerpt: entity.details.slice(0, 2000),
      aliasesOmitted: Math.max(0, entity.aliases.length - 20),
      detailsTruncated: entity.details.length > 2000,
    })),
  );
  const persona = await compilePersona(store(), context.summary, context.summary.createdAt);
  const closure = await normalizeEditorChatClosure([
    {
      kind: 'target',
      ...scopeOf(context.summary),
      projectToken: context.source.projectToken,
      resourceToken: context.source.resourceToken,
    },
    ...persona.leaves,
    ...included.map((row) => ({
      kind: 'lore',
      reference: row.reference,
      scopeToken: context.source.projectToken,
      entityIdentityToken: row.identityToken,
    })),
  ]);
  const body = {
    schemaVersion: 1 as const,
    matcherVersion: 1 as const,
    capturedAt: context.summary.createdAt,
    source: context.source,
    capture: context.capture,
    lore: included,
    persona: persona.snapshot,
    includedEntityCount: included.length,
    omittedEntityCount: Math.max(0, ids.length - included.length),
    closure,
  };
  return normalizeEditorChatDTO('frozenContext', { ...body, contextHash: await hash(body) });
}
function conversation(s: Store, r: { conversationId: string; conversationToken: string }) {
  const value = s.conversations[r.conversationId];
  if (!value || value.conversationToken !== r.conversationToken)
    return fail('conversation-unavailable');
  return value;
}
function context(s: Store, r: { contextId: string; contextToken: string }) {
  const value = s.contexts[r.contextId];
  if (!value || value.summary.contextToken !== r.contextToken) return fail('identity-changed');
  return value;
}
function turn(s: Store, r: { conversationId: string; conversationToken: string; turnId: string }) {
  conversation(s, r);
  const value = s.turns[r.conversationId]?.[r.turnId];
  if (!value) return fail('turn-unavailable');
  return value;
}
function resultOf(
  current:
    | EditorChatContextSummary
    | EditorChatConversationSummary
    | EditorChatTurnSummary
    | EditorChatCleanupSummary
    | EditorChatResponseMap['applySuggestion']['current'],
): EditorChatReceiptResult {
  if (!current) throw Error('Fixture missing control');
  if ('contextId' in current)
    return {
      kind: 'context',
      contextId: current.contextId,
      contextToken: current.contextToken,
      revision: current.revision,
      phase: current.phase,
    };
  if ('cleanupId' in current)
    return {
      kind: 'cleanup',
      cleanupId: current.cleanupId,
      cleanupToken: current.cleanupToken,
      revision: current.revision,
      state: current.state,
      phase: current.phase,
      deletedDocuments: current.deletedDocuments,
    };
  if ('turnId' in current) throw Error('Turn receipts require conversation token');
  if ('conversationId' in current)
    return {
      kind: 'conversation',
      conversationId: current.conversationId,
      conversationToken: current.conversationToken,
      revision: current.revision,
      state: current.state,
    };
  throw Error('Apply receipts are explicit');
}
function settle(s: Store, r: EditorChatRequest, result: EditorChatReceiptResult, current: unknown) {
  if (!('operationId' in r)) throw Error('Fixture mutation required');
  const receipt = normalizeEditorChatReceipt({
    schemaVersion: 1,
    operationId: r.operationId,
    action: r.action,
    requestHash: r.requestHash,
    outcome: 'confirmed',
    confirmedAt: time(s),
    result,
  });
  s.operations[r.operationId] = receipt;
  s.revision++;
  persist(s);
  return { receipt, current };
}
function turnResult(
  c: EditorChatConversationSummary,
  t: EditorChatTurnSummary,
): EditorChatReceiptResult {
  return {
    kind: 'turn',
    conversationId: c.conversationId,
    conversationToken: c.conversationToken,
    turnId: t.turnId,
    attemptToken: t.attemptToken,
    revision: t.revision,
    state: t.state,
  };
}
async function readTurn(row: Turn): Promise<EditorChatTurnRead> {
  const current = revoked() ? null : await source(row.frozen.source);
  const freshness = current?.sourceToken === row.frozen.source.sourceToken ? 'current' : 'stale';
  return normalizeEditorChatDTO('turnRead', {
    turn: row.summary,
    question: row.question,
    presentation: revoked() ? 'blocked' : 'available',
    answer:
      !revoked() && row.summary.state === 'done'
        ? {
            text: row.text,
            suggestion: row.suggestion,
            context: row.frozen,
            provenance: row.frozen.closure,
            history,
            freshness,
          }
        : null,
  });
}
async function dispatch(
  s: Store,
  r: EditorChatRequest,
  options: EditorChatCallOptions,
): Promise<unknown> {
  if (r.action === 'resolveOperation') {
    const receipt = s.operations[r.operationId];
    if (receipt) {
      if (receipt.action !== r.operationAction || receipt.requestHash !== r.requestHash)
        fail('operation-conflict');
      return { state: 'settled', receipt };
    }
    if (r.intent === 'observe') return { state: 'unknown', receipt: null };
    const fence = normalizeEditorChatReceipt({
      schemaVersion: 1,
      operationId: r.operationId,
      action: r.operationAction,
      requestHash: r.requestHash,
      outcome: 'canceled',
      confirmedAt: time(s),
      result: { kind: 'fence' },
    });
    s.operations[r.operationId] = fence;
    persist(s);
    return { state: 'settled', receipt: fence };
  }
  if ('operationId' in r) {
    const receipt = s.operations[r.operationId];
    if (receipt) {
      if (receipt.action !== r.action || receipt.requestHash !== r.requestHash)
        fail('operation-conflict');
      if (r.action === 'send') {
        const row = s.turns[r.conversationId]?.[r.operationId];
        return {
          receipt,
          turn: row?.summary ?? null,
          delivery: row ? (row.summary.provider === 'platform' ? 'server-stream' : 'byok') : null,
          byokInput: null,
        };
      }
      return { receipt, current: null };
    }
    if (sessionStorage.getItem('writer.visual.editor-chat-loss') === 'before') {
      sessionStorage.removeItem('writer.visual.editor-chat-loss');
      throw new EditorChatTransportError('functions/unavailable', true);
    }
  }

  if (r.action === 'getAdventurePersonaBinding') {
    const binding = await personaBinding(s, r.adventureId, r.sceneId);
    if (r.adventureToken !== undefined && r.adventureToken !== binding.adventureToken)
      fail('identity-changed');
    return binding;
  }
  if (r.action === 'setAdventurePersonaBinding') {
    const current = await personaBinding(s, r.adventureId, r.sceneId);
    if (r.adventureToken !== current.adventureToken) fail('identity-changed');
    if (sessionStorage.getItem('writer.visual.editor-chat-persona-conflict') === 'true') {
      sessionStorage.removeItem('writer.visual.editor-chat-persona-conflict');
      await nextBinding(s, current, current.value);
      persist(s);
      fail('revision-conflict');
    }
    if (r.expectedBindingToken !== current.bindingToken) fail('revision-conflict');
    const base = await personaBinding(s, r.adventureId, null);
    const baseId =
      r.sceneId === null && 'personaId' in r.value
        ? r.value.personaId
        : 'personaId' in base.value
          ? base.value.personaId
          : null;
    const complement =
      r.sceneId !== null && 'personaComplement' in r.value ? r.value.personaComplement : null;
    // Same pure compiler as the UI/backend, but fictional binding metadata. This is NOT an authorization reader.
    resolveWritingPersona(
      [...DEFAULT_PERSONAS, ...(await listPersonas(fixtureOwner()))],
      baseId,
      complement,
      'adventure',
    );
    const value = await nextBinding(s, current, r.value);
    return settle(
      s,
      r,
      {
        kind: 'persona-binding',
        adventureId: r.adventureId,
        adventureToken: value.adventureToken,
        sceneId: value.sceneId,
        sceneToken: value.sceneToken,
        personaRevision: value.personaRevision,
        bindingToken: value.bindingToken,
      },
      value,
    );
  }
  if (r.action === 'listConversations') {
    const saved = await source(r);
    return {
      schemaVersion: 1,
      ownerId: fixtureOwner(),
      ...scopeOf(r),
      projectToken: saved.projectToken,
      resourceToken: saved.resourceToken,
      collectionRevision: s.revision,
      platformModel: 'gemini-3.7-flash',
      items: Object.values(s.conversations)
        .filter((c) => c.state === 'open' && matches(c, r))
        .sort((a, b) => b.updatedAt - a.updatedAt),
      nextCursor: null,
    };
  }
  if (r.action === 'createConversation') {
    const saved = await source(r);
    const at = time(s);
    const value = normalizeEditorChatDTO('conversation', {
      schemaVersion: 1,
      ...scopeOf(r),
      conversationId: r.conversationId,
      conversationToken: await hash({ uid: fixtureOwner(), id: r.conversationId }),
      projectToken: saved.projectToken,
      resourceToken: saved.resourceToken,
      revision: 1,
      state: 'open',
      title: 'Nova conversa',
      activeTurnId: null,
      createdAt: at,
      updatedAt: at,
    });
    s.conversations[r.conversationId] = value;
    s.turns[r.conversationId] = {};
    return settle(s, r, resultOf(value), value);
  }
  if (r.action === 'renameConversation') {
    const c = conversation(s, r);
    if (c.revision !== r.expectedRevision) fail('revision-conflict');
    Object.assign(c, { title: r.title, revision: c.revision + 1, updatedAt: time(s) });
    return settle(s, r, resultOf(c), c);
  }
  if (r.action === 'prepareContext') {
    const saved = await source(r);
    if (
      !same(r.base, {
        sourceToken: saved.sourceToken,
        revision: saved.revision,
        bodyHash: saved.bodyHash,
      })
    )
      fail('revision-conflict');
    const at = time(s);
    const summary = normalizeEditorChatDTO('context', {
      schemaVersion: 1,
      ownerId: fixtureOwner(),
      ...scopeOf(r),
      contextId: r.contextId,
      contextToken: await hash({ uid: fixtureOwner(), id: r.contextId }),
      projectToken: saved.projectToken,
      resourceToken: saved.resourceToken,
      revision: 1,
      phase: 'local',
      scannedLocal: 0,
      scannedGlobal: 0,
      matchedEntityCount: null,
      includedEntityCount: null,
      omittedEntityCount: null,
      turnId: null,
      createdAt: at,
      updatedAt: at,
    });
    s.contexts[r.contextId] = { summary, source: saved, capture: r.capture, frozen: null };
    return settle(s, r, resultOf(summary), summary);
  }
  if (r.action === 'getContext') return context(s, r).summary;
  if (r.action === 'advanceContext') {
    const c = context(s, r);
    if (c.summary.revision !== r.expectedRevision) fail('revision-conflict');
    const old = c.summary.phase;
    c.summary.revision++;
    c.summary.updatedAt = time(s);
    if (old === 'local') {
      c.summary.phase = 'global';
      c.summary.scannedLocal = (await lore(r)).filter((row) => !row.global).length;
    } else {
      c.frozen = await freeze(c);
      s.bindings = store().bindings;
      c.summary.phase = 'ready';
      c.summary.scannedGlobal = (await lore(r)).filter((row) => row.global).length;
      c.summary.includedEntityCount = c.frozen.includedEntityCount;
      c.summary.omittedEntityCount = c.frozen.omittedEntityCount;
      c.summary.matchedEntityCount = c.frozen.includedEntityCount + c.frozen.omittedEntityCount;
    }
    return settle(s, r, resultOf(c.summary), c.summary);
  }
  if (r.action === 'inspectContext') {
    const c = context(s, r);
    if (revoked()) fail('provenance-revoked');
    const current = await source(r);
    return {
      context: c.summary,
      source: current,
      frozen: c.frozen,
      freshness: current.sourceToken === c.source.sourceToken ? 'current' : 'stale',
    };
  }
  if (r.action === 'listMessages') {
    const c = conversation(s, r);
    return {
      schemaVersion: 1,
      ownerId: fixtureOwner(),
      conversationId: c.conversationId,
      conversationToken: c.conversationToken,
      conversationRevision: c.revision,
      items: Object.values(s.turns[c.conversationId] ?? {})
        .map((row) => row.summary)
        .reverse(),
      nextCursor: null,
    };
  }
  if (r.action === 'getTurn') return readTurn(turn(s, r));
  if (r.action === 'send') {
    const c = conversation(s, r),
      ctx = context(s, r);
    if (
      c.revision !== r.expectedConversationRevision ||
      ctx.summary.revision !== r.expectedContextRevision
    )
      fail('revision-conflict');
    if (revoked()) fail('provenance-revoked');
    if (ctx.summary.phase !== 'ready' || !ctx.frozen) fail('context-stale');
    const at = time(s),
      byok = r.generation.provider !== 'platform';
    const summary = normalizeEditorChatDTO('turn', {
      schemaVersion: 1,
      conversationId: c.conversationId,
      turnId: r.operationId,
      revision: 1,
      attemptToken: await hash({ operation: r.operationId }),
      state: byok ? 'awaiting-byok' : 'running',
      provider: byok ? 'byok' : 'platform',
      generation: resolveChatGeneration(r.generation),
      contextHash: ctx.frozen.contextHash,
      closureHash: ctx.frozen.closure.closureHash,
      sourceToken: ctx.source.sourceToken,
      suggestionAvailable: false,
      paid: false,
      failureReason: null,
      createdAt: at,
      updatedAt: at,
    });
    const row: Turn = {
      summary,
      question: r.prompt,
      frozen: ctx.frozen,
      text: 'A Guardiã pode revelar a passagem sem resolver a escolha do grupo.',
      suggestion: 'A Guardiã abriu a passagem entre as estrelas.',
    };
    s.turns[c.conversationId][r.operationId] = row;
    c.activeTurnId = summary.turnId;
    c.revision++;
    c.updatedAt = at;
    ctx.summary.phase = 'consumed';
    ctx.summary.turnId = summary.turnId;
    ctx.summary.revision++;
    const claimed = settle(s, r, turnResult(c, summary), summary);
    if (byok)
      return {
        receipt: claimed.receipt,
        turn: summary,
        delivery: 'byok',
        byokInput: {
          turnId: summary.turnId,
          attemptToken: summary.attemptToken,
          generation: summary.generation,
          systemInstruction: 'Converse com o autor.',
          prompt: r.prompt,
          context: ctx.frozen,
          history: [],
          closureHash: summary.closureHash,
        },
      };
    options.check?.();
    options.onEvent?.(normalizeEditorChatDTO('streamEvent', { type: 'started', turn: summary }));
    if (sessionStorage.getItem('writer.visual.editor-chat-hold') === 'true')
      await new Promise<void>((resolve) => {
        releaseProvider = resolve;
      });
    options.signal?.throwIfAborted();
    options.check?.();
    const latest = store();
    const live = latest.turns[c.conversationId]?.[summary.turnId];
    if (!live || live.summary.state !== 'running')
      return {
        receipt: claimed.receipt,
        turn: live?.summary ?? null,
        delivery: live ? 'server-stream' : null,
        byokInput: null,
      };
    s.calls = latest.calls;
    if (revoked()) {
      row.summary.state = 'blocked';
      row.summary.failureReason = 'provenance-revoked';
    } else {
      options.onEvent?.(
        normalizeEditorChatDTO('streamEvent', {
          type: 'delta',
          turnId: summary.turnId,
          attemptToken: summary.attemptToken,
          index: 0,
          text: row.text,
        }),
      );
      row.summary.state = 'done';
      row.summary.suggestionAvailable = true;
    }
    row.summary.revision++;
    row.summary.updatedAt = time(s);
    c.activeTurnId = null;
    c.revision++;
    c.updatedAt = time(s);
    persist(s);
    options.onEvent?.(
      normalizeEditorChatDTO('streamEvent', { type: 'settled', turn: row.summary }),
    );
    return {
      receipt: claimed.receipt,
      turn: row.summary,
      delivery: 'server-stream',
      byokInput: null,
    };
  }
  if (r.action === 'applySuggestion') {
    const c = conversation(s, r),
      row = turn(s, r);
    if (revoked()) fail('provenance-revoked');
    const saved = await getWorkVersionSource(r);
    if (
      !saved ||
      !same(r.base, {
        sourceToken: saved.sourceToken,
        revision: saved.revision,
        bodyHash: saved.contentHash,
      })
    )
      fail('revision-conflict');
    if (!row.suggestion || (await hashText(row.suggestion)) !== r.suggestionHash)
      fail('suggestion-unavailable');
    if (r.placement === 'original' && r.base.sourceToken !== row.frozen.source.sourceToken)
      fail('revision-conflict');
    const chargedCredits = row.summary.provider === 'platform' && !row.summary.paid ? 1 : 0;
    if ((await getUserCredits()) < chargedCredits) fail('insufficient-credits');
    if (r.resource.kind === 'block')
      await updateAdventureBlock({
        adventureId: r.target.id,
        operationId: r.operationId,
        resource: r.resource,
        expectedRevision: saved.revision!,
        patch: { content: r.after },
      });
    else
      await updateScene({
        target: r.target,
        operationId: r.operationId,
        sceneId: r.resource.id,
        expectedRevision: saved.revision!,
        patch: { content: r.after },
      });
    if (chargedCredits) await deductCredit(fixtureOwner(), chargedCredits);
    row.summary.paid = row.summary.paid || chargedCredits === 1;
    row.summary.revision++;
    row.summary.updatedAt = time(s);
    c.revision++;
    c.updatedAt = time(s);
    const current = await getWorkVersionSource(r);
    const state = await fixtureSceneState(r.target);
    if (!current) fail('source-unavailable');
    const wordCount = countVisibleWords(r.after);
    const result = normalizeEditorChatDTO('apply', {
      ...scopeOf(r),
      projectToken: c.projectToken,
      resourceToken: c.resourceToken,
      revision: current.revision,
      contentHash: current.contentHash,
      bodyBytes: new TextEncoder().encode(current.content).byteLength,
      wordCount,
      projectRevision: state.revision,
      chargedCredits,
    });
    return settle(
      s,
      r,
      {
        kind: 'apply',
        conversationId: c.conversationId,
        conversationToken: c.conversationToken,
        turnId: row.summary.turnId,
        resourceToken: c.resourceToken,
        revision: result.revision,
        contentHash: result.contentHash,
        bodyBytes: result.bodyBytes,
        wordCount: result.wordCount,
        projectRevision: result.projectRevision,
        chargedCredits,
      },
      result,
    );
  }
  if (r.action === 'stopTurn' || r.action === 'completeBYOK' || r.action === 'failBYOK') {
    const c = conversation(s, r),
      row = turn(s, r);
    if (row.summary.attemptToken !== r.attemptToken) fail('identity-changed');
    row.summary.state =
      r.action === 'completeBYOK' ? 'done' : r.action === 'stopTurn' ? 'stopped' : 'failed';
    row.summary.suggestionAvailable = row.summary.state === 'done';
    row.summary.revision++;
    row.summary.updatedAt = time(s);
    c.activeTurnId = null;
    c.revision++;
    return settle(s, r, turnResult(c, row.summary), row.summary);
  }
  if (r.action === 'getByokInput') {
    const row = turn(s, r);
    if (row.summary.attemptToken !== r.attemptToken) fail('identity-changed');
    return {
      turn: row.summary,
      input:
        !revoked() && row.summary.state === 'awaiting-byok'
          ? {
              turnId: row.summary.turnId,
              attemptToken: row.summary.attemptToken,
              generation: row.summary.generation,
              systemInstruction: 'Converse com o autor.',
              prompt: row.question,
              context: row.frozen,
              history: [],
              closureHash: row.summary.closureHash,
            }
          : null,
    };
  }
  if (r.action === 'deleteConversation' || r.action === 'deleteContext') {
    const isContext = r.action === 'deleteContext';
    const subject = isContext
      ? { kind: 'context' as const, id: r.contextId, token: r.contextToken }
      : { kind: 'conversation' as const, id: r.conversationId, token: r.conversationToken };
    const at = time(s);
    const cleanup = normalizeEditorChatDTO('cleanup', {
      schemaVersion: 1,
      cleanupId: r.operationId,
      cleanupToken: await hash({ cleanup: r.operationId }),
      revision: 1,
      subject,
      state: 'deleting',
      phase: isContext ? 'context-body' : 'turn-bodies',
      deletedDocuments: 0,
      createdAt: at,
      updatedAt: at,
    });
    if (!isContext) {
      const c = conversation(s, r);
      c.state = 'deleting';
      c.activeTurnId = null;
    }
    s.cleanups[cleanup.cleanupId] = cleanup;
    return settle(s, r, resultOf(cleanup), cleanup);
  }
  if (r.action === 'getCleanup' || r.action === 'advanceCleanup') {
    const cleanup = s.cleanups[r.cleanupId];
    if (!cleanup || cleanup.cleanupToken !== r.cleanupToken) fail('identity-changed');
    if (r.action === 'getCleanup') return cleanup;
    if (cleanup.revision !== r.expectedRevision) fail('revision-conflict');
    cleanup.state = 'deleted';
    cleanup.phase = 'complete';
    cleanup.deletedDocuments = 3;
    cleanup.revision++;
    cleanup.updatedAt = time(s);
    if (cleanup.subject.kind === 'context') {
      const c = s.contexts[cleanup.subject.id];
      if (c) {
        c.summary.phase = 'deleted';
        c.frozen = null;
      }
    } else {
      const c = s.conversations[cleanup.subject.id];
      if (c) {
        c.state = 'deleted';
        c.title = '';
        c.activeTurnId = null;
      }
      delete s.turns[cleanup.subject.id];
    }
    return settle(s, r, resultOf(cleanup), cleanup);
  }
  throw new EditorChatTransportError('functions/unimplemented', false);
}
const hashText = async (text: string) => {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
};
const kinds: Record<EditorChatAction, Parameters<typeof normalizeEditorChatDTO>[0]> = {
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
export async function callEditorChat<A extends EditorChatAction>(
  uid: string,
  value: EditorChatRequest<A>,
  options: EditorChatCallOptions = {},
): Promise<EditorChatResponseMap[A]> {
  const request = normalizeEditorChatRequest(value);
  const check = () => {
    options.signal?.throwIfAborted();
    options.check?.();
    if (!auth.currentUser || auth.currentUser.uid !== uid || fixtureOwner() !== uid)
      throw new EditorChatTransportError('editor-chat/identity-changed', false);
    if (options.operation)
      assertEditorChatOperation(options.operation, options.check ?? (() => undefined));
  };
  check();
  if ('operationId' in request && request.action !== 'resolveOperation') {
    if (!options.operation)
      throw new EditorChatTransportError('editor-chat/journal-required', false);
    if (
      (await editorChatRequestHash(request)) !== request.requestHash ||
      options.operation.requestHash !== request.requestHash ||
      options.operation.action !== request.action ||
      options.operation.operationId !== request.operationId
    )
      throw new EditorChatTransportError('editor-chat/fingerprint-mismatch', false);
    check();
  }
  const work = async () => {
    check();
    const s = store();
    s.calls.push(request.action);
    persist(s);
    try {
      const result = await dispatch(s, request, options);
      // Delay only delivery, after the fictional server result. The real caller guard below
      // must still reject an actor/lifecycle change before any result can be published.
      if (
        request.action === 'resolveOperation' &&
        sessionStorage.getItem('writer.visual.editor-chat-hold-resolution') === 'true'
      ) {
        sessionStorage.removeItem('writer.visual.editor-chat-hold-resolution');
        await new Promise<void>((resolve) => {
          releaseResolution = resolve;
          sessionStorage.setItem('writer.visual.editor-chat-resolution-ready', 'true');
        });
        sessionStorage.removeItem('writer.visual.editor-chat-resolution-ready');
      }
      check();
      if (
        'operationId' in request &&
        request.action !== 'resolveOperation' &&
        sessionStorage.getItem('writer.visual.editor-chat-loss') === 'after'
      ) {
        sessionStorage.removeItem('writer.visual.editor-chat-loss');
        throw new EditorChatTransportError('functions/unavailable', true);
      }
      return normalizeEditorChatDTO(kinds[request.action], result, {
        ...('operationId' in request
          ? {
              action:
                request.action === 'resolveOperation' ? request.operationAction : request.action,
            }
          : {}),
        ...('operationId' in request
          ? { operationId: request.operationId, requestHash: request.requestHash }
          : {}),
      }) as EditorChatResponseMap[A];
    } catch (cause) {
      if (cause instanceof EditorChatTransportError) throw cause;
      if (cause instanceof EditorChatContractError)
        throw new EditorChatTransportError('functions/' + cause.code, false, cause.details.reason);
      throw new EditorChatTransportError('functions/unavailable', 'operationId' in request);
    }
  };
  // Serialize fake mutations, but never keep the queue across a simulated provider wait.
  if (request.action === 'send') return work();
  const result = queue.then(work);
  queue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
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
export function fixtureReleaseEditorChat() {
  sessionStorage.removeItem('writer.visual.editor-chat-hold');
  releaseProvider?.();
  releaseProvider = null;
}
export function fixtureReleaseEditorChatResolution() {
  releaseResolution?.();
  releaseResolution = null;
}
export function fixtureEditorChatState() {
  return store();
}
export function fixtureRevokeEditorChat(scope: EditorChatScope) {
  sessionStorage.setItem('writer.visual.editor-chat-revoked', 'true');
  if (scope.target.kind === 'adventure') fixtureAdventureLoreHint(scope.target.id);
  window.dispatchEvent(new Event('focus'));
}
export async function fixtureSeedEditorChat(kind: 'book' | 'adventure' | 'block') {
  sessionStorage.setItem('writer_fixture_ai_actions', 'true');
  sessionStorage.setItem('writer_fixture_autocomplete', 'true');
  const target =
    kind === 'book'
      ? { kind: 'book' as const, id: FIXTURE_BOOK_ID }
      : { kind: 'adventure' as const, id: 'visual-adventure-1' };
  const universeId = 'visual-editor-chat-world';
  await createUniverse(
    { name: 'Universo do assistente', description: 'Fatos fictícios' },
    universeId,
  );
  const global = await createLoreEntity(
    { kind: 'universe', id: universeId },
    {
      name: 'Guardiã global',
      aliases: ['Guardiã'],
      category: 'character',
      summary: 'GLOBAL QUE NÃO DEVE VENCER',
      details: 'SEGREDO GLOBAL PERDEDOR',
      isPublic: false,
    },
  );
  if (target.kind === 'book') {
    fixtureWriteBook(target.id, { universeId });
    seedAssistedLore(target.id, [
      {
        id: global.id.split(':').at(-1)!,
        name: 'Guardiã' + 'N'.repeat(113),
        aliases: ['Guardiã', 'Vigia', 'ALIAS' + 'X'.repeat(175)],
        category: 'character',
        summary: 'A guardiã local conhece o farol.',
        details: 'LORE LOCAL AUTORIZADO',
        relations: [],
      },
    ]);
  } else {
    fixturePatchProject('adventure', target.id, { universeId });
    await fixtureSeedAdventureLore(target.id, [
      {
        name: 'Guardiã' + 'N'.repeat(113),
        aliases: ['Guardiã', 'Vigia', 'ALIAS' + 'X'.repeat(175)],
        category: 'character',
        summary: 'A guardiã local conhece o farol.',
        details: 'LORE LOCAL AUTORIZADO',
        structuredDetails: { appearance: '', personality: '', history: '', notes: '' },
        relations: [],
        isPublic: false,
      },
    ]);
  }
  const group = await createSceneGroup({
    target,
    operationId: 'visual-chat-group',
    title: 'Cena do assistente',
  });
  const created = await createScene({
    target,
    operationId: 'visual-chat-scene',
    parentId: group.id,
    title: 'A Guardiã e o farol ' + 'T'.repeat(100),
    content: '<p>A Guardiã encontrou o farol sob as estrelas.</p>',
  });
  let resource = { kind: 'scene' as 'scene' | 'block', id: created.scene.id };
  if (kind === 'block') {
    const block = await createAdventureBlock({
      adventureId: target.id,
      sceneId: created.scene.id,
      operationId: 'visual-chat-block',
      title: 'Segredo da Guardiã',
      content: '<p>A Guardiã protege a passagem do farol.</p>',
      audience: 'creator',
    });
    resource = block.block.resource;
  }
  return {
    target,
    resource,
    sceneId: created.scene.id,
    path:
      target.kind === 'book'
        ? `/books/${target.id}/scenes/${created.scene.id}`
        : `/adventures/${target.id}/scenes/${created.scene.id}${resource.kind === 'block' ? `/blocks/${resource.id}` : ''}`,
  };
}

export async function fixtureEditorChatEvidence(scope: EditorChatScope) {
  const state = await fixtureSceneState(scope.target);
  const saved = await getWorkVersionSource(scope);
  const sceneId =
    scope.resource.kind === 'block'
      ? state.adventureBlocks?.[scope.resource.id]?.sceneId
      : scope.resource.id;
  return {
    server: store(),
    source: saved,
    scene: sceneId ? state.scenes[sceneId] : null,
    group:
      sceneId && state.scenes[sceneId]
        ? state.groups[state.scenes[sceneId].parentId ?? '$unassigned']
        : null,
    credits: await getUserCredits(),
    journal: Object.fromEntries(
      Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
        .filter((key): key is string => !!key && key.startsWith('writer:editor-chat-operation:'))
        .map((key) => [key, localStorage.getItem(key) ?? '']),
    ) as Record<string, string>,
    legacyActions: sessionStorage.getItem('writer_fixture_ai_action_calls'),
    autocomplete: sessionStorage.getItem('writer_fixture_autocomplete_calls'),
  };
}
