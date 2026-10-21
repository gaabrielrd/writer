import { StrictMode } from 'react';
import { webcrypto } from 'node:crypto';
import { act, renderHook, cleanup } from '@testing-library/react';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { useEditorChat } from '../hooks/useEditorChat';
import * as transport from '../services/editorChatService';
import { captureEditorChatHost } from '../services/editorChatHostService';
import {
  readEditorChatOperation,
  editorChatOperationKey,
  reserveEditorChatOperation,
  compareEditorChatOperation,
} from '../services/editorChatOperationStorage';
import {
  base,
  capture,
  scope,
  hash,
  generation,
  byokGeneration,
  contextFixture,
  conversationFixture,
  turnFixture,
  frozenFixture,
  rowFor,
} from './editorChatTestFixtures';
import type { EditorChatHost } from '../model/editorChatHost';
import type {
  EditorChatRequest,
  EditorChatResponseMap,
  EditorChatAction,
  EditorChatReceipt,
  EditorChatReceiptResult,
  EditorChatContextSummary,
  EditorChatCleanupSummary,
  EditorChatConversationSummary,
  EditorChatTurnSummary,
  EditorChatTurnRead,
} from '../model/editorChat';
import { editorChatRequestHash } from '../model/editorChat';
import { resolveChatGeneration } from '../model/chatGeneration';

const boundary = vi.hoisted(() => {
  const auth: { currentUser: { uid: string } | null } = { currentUser: { uid: 'user' } };
  return { auth, listeners: new Set<(user: { uid: string } | null) => void>() };
});
vi.mock('@/shared/lib', () => ({ auth: boundary.auth, getFirebaseApp: vi.fn() }));
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn((_auth: unknown, next: (user: { uid: string } | null) => void) => {
    boundary.listeners.add(next);
    next(boundary.auth.currentUser);
    return () => boundary.listeners.delete(next);
  }),
}));
vi.mock('../services/editorChatService', async () => {
  const actual = await vi.importActual<typeof transport>('../services/editorChatService');
  return { ...actual, callEditorChat: vi.fn(), resolveEditorChatOperation: vi.fn() };
});
vi.mock('../services/editorChatHostService', () => ({ captureEditorChatHost: vi.fn() }));

let contexts: Map<string, EditorChatContextSummary>;
let conversations: Map<string, EditorChatConversationSummary>;
let turns: Map<string, EditorChatTurnSummary>;
let cleanups: Map<string, EditorChatCleanupSummary>;
let receipts: Map<string, EditorChatReceipt>;
let revision: number;
let locked = false;
const check = vi.fn();
function host(): EditorChatHost {
  return {
    ...scope,
    checkCurrent: check,
    getConfirmedSnapshot: () => ({ content: 'Own', revision: 1, bodyHash: base.bodyHash }),
    getBridge: () => null,
    runExclusive: async (work) => work(),
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
function receipt(
  q: Extract<EditorChatRequest, { operationId: string }>,
  result: EditorChatReceiptResult,
): EditorChatReceipt {
  return {
    schemaVersion: 1,
    operationId: q.operationId,
    action: q.action as EditorChatReceipt['action'],
    requestHash: q.requestHash,
    outcome: 'confirmed',
    confirmedAt: 1,
    result,
  };
}
async function serve<A extends EditorChatAction>(
  q: EditorChatRequest<A>,
  options?: transport.EditorChatCallOptions,
): Promise<EditorChatResponseMap[A]> {
  expect(locked).toBe(false);
  options?.check?.();
  const request = q as EditorChatRequest;
  const frozen = await frozenFixture();
  let output: unknown;
  if (request.action === 'listConversations')
    output = {
      schemaVersion: 1,
      ownerId: 'user',
      ...scope,
      projectToken: hash('1'),
      resourceToken: hash('2'),
      collectionRevision: revision,
      platformModel: 'gemini-3.7-flash',
      items: [...conversations.values()],
      nextCursor: null,
    };
  if (request.action === 'listMessages')
    output = {
      schemaVersion: 1,
      ownerId: 'user',
      conversationId: request.conversationId,
      conversationToken: request.conversationToken,
      conversationRevision: conversations.get(request.conversationId)?.revision ?? 1,
      items: [...turns.values()].filter((t) => t.conversationId === request.conversationId),
      nextCursor: null,
    };
  if (request.action === 'getContext') output = contexts.get(request.contextId);
  if (request.action === 'inspectContext')
    output = {
      context: contexts.get(request.contextId),
      source: frozen.source,
      frozen,
      freshness: 'current',
    };
  if (request.action === 'getTurn')
    output = {
      turn:
        turns.get(request.turnId) ??
        turnFixture({ turnId: request.turnId, conversationId: request.conversationId }),
      question: 'Pergunta própria',
      presentation: 'available',
      answer: {
        text: 'Resposta autorizada',
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
  if (request.action === 'getCleanup') output = cleanups.get(request.cleanupId);
  if (request.action === 'prepareContext' || request.action === 'advanceContext') {
    const old = contexts.get(request.contextId);
    const phase =
      request.action === 'prepareContext' ? 'local' : old?.phase === 'local' ? 'global' : 'ready';
    const current = contextFixture({
      contextId: request.contextId,
      revision: (old?.revision ?? 0) + 1,
      phase,
      matchedEntityCount: phase === 'ready' ? 0 : null,
      includedEntityCount: phase === 'ready' ? 0 : null,
      omittedEntityCount: phase === 'ready' ? 0 : null,
    });
    contexts.set(current.contextId, current);
    output = {
      receipt: receipt(request, {
        kind: 'context',
        contextId: current.contextId,
        contextToken: current.contextToken,
        revision: current.revision,
        phase,
      }),
      current,
    };
  }
  if (request.action === 'createConversation' || request.action === 'renameConversation') {
    const current = {
      ...conversationFixture(),
      conversationId: request.conversationId,
      revision: request.action === 'renameConversation' ? request.expectedRevision + 1 : 1,
      title: request.action === 'renameConversation' ? request.title : 'Nova conversa',
    };
    conversations.set(current.conversationId, current);
    revision++;
    output = {
      receipt: receipt(request, {
        kind: 'conversation',
        conversationId: current.conversationId,
        conversationToken: current.conversationToken,
        revision: current.revision,
        state: 'open',
      }),
      current,
    };
  }
  if (request.action === 'send') {
    expect(readEditorChatOperation('user', scope)).toEqual(options?.operation);
    const turn = turnFixture({
      turnId: request.operationId,
      conversationId: request.conversationId,
      state: 'running',
      generation: resolveChatGeneration(request.generation),
      provider: request.generation.provider === 'platform' ? 'platform' : 'byok',
    });
    turns.set(turn.turnId, turn);
    options?.onEvent?.({ type: 'started', turn });
    options?.onEvent?.({
      type: 'delta',
      turnId: turn.turnId,
      attemptToken: turn.attemptToken,
      index: 0,
      text: 'Resposta ',
    });
    expect(readEditorChatOperation('user', scope)).toEqual(options?.operation);
    options?.onEvent?.({
      type: 'delta',
      turnId: turn.turnId,
      attemptToken: turn.attemptToken,
      index: 1,
      text: 'em partes',
    });
    const done = {
      ...turn,
      state:
        request.generation.provider === 'platform' ? ('done' as const) : ('awaiting-byok' as const),
    };
    turns.set(turn.turnId, done);
    options?.onEvent?.({ type: 'settled', turn: done });
    const context = contexts.get(request.contextId);
    if (context)
      contexts.set(request.contextId, {
        ...context,
        phase: 'consumed',
        revision: context.revision + 1,
        turnId: done.turnId,
      });
    const conversation = conversations.get(request.conversationId);
    if (conversation)
      conversations.set(conversation.conversationId, {
        ...conversation,
        revision: conversation.revision + 1,
        activeTurnId: null,
      });
    output = {
      receipt: receipt(request, {
        kind: 'turn',
        conversationId: request.conversationId,
        conversationToken: request.conversationToken,
        turnId: done.turnId,
        attemptToken: done.attemptToken,
        revision: done.revision,
        state: done.state,
      }),
      turn: done,
      delivery: done.provider === 'platform' ? 'server-stream' : 'byok',
      byokInput:
        done.provider === 'byok'
          ? {
              turnId: done.turnId,
              attemptToken: done.attemptToken,
              generation: done.generation,
              systemInstruction: 'Instrução autorizada',
              prompt: 'Entrada autorizada',
              context: frozen,
              history: [],
              closureHash: frozen.closure.closureHash,
            }
          : null,
    };
  }
  if (request.action === 'getByokInput') {
    const current = turns.get(request.turnId)!;
    output = {
      turn: current,
      input:
        current.state === 'awaiting-byok'
          ? {
              turnId: current.turnId,
              attemptToken: current.attemptToken,
              generation: current.generation,
              systemInstruction: 'Instrução autorizada',
              prompt: 'Entrada autorizada',
              context: frozen,
              history: [],
              closureHash: frozen.closure.closureHash,
            }
          : null,
    };
  }
  if (request.action === 'completeBYOK' || request.action === 'failBYOK') {
    const current = {
      ...turns.get(request.turnId)!,
      state: request.action === 'completeBYOK' ? ('done' as const) : ('failed' as const),
      revision: 2,
    };
    turns.set(current.turnId, current);
    output = {
      receipt: receipt(request, {
        kind: 'turn',
        conversationId: request.conversationId,
        conversationToken: request.conversationToken,
        turnId: current.turnId,
        attemptToken: current.attemptToken,
        revision: current.revision,
        state: current.state,
      }),
      current,
    };
  }
  if (request.action === 'stopTurn') {
    const current = {
      ...(turns.get(request.turnId) ?? turnFixture()),
      turnId: request.turnId,
      conversationId: request.conversationId,
      state: 'stopped' as const,
      revision: 2,
    };
    turns.set(current.turnId, current);
    output = {
      receipt: receipt(request, {
        kind: 'turn',
        conversationId: request.conversationId,
        conversationToken: request.conversationToken,
        turnId: current.turnId,
        attemptToken: current.attemptToken,
        revision: current.revision,
        state: current.state,
      }),
      current,
    };
  }
  if (
    request.action === 'deleteContext' ||
    request.action === 'deleteConversation' ||
    request.action === 'advanceCleanup'
  ) {
    const old = request.action === 'advanceCleanup' ? cleanups.get(request.cleanupId) : null;
    const current: EditorChatCleanupSummary = {
      schemaVersion: 1,
      cleanupId: old?.cleanupId ?? request.operationId,
      cleanupToken: hash('c'),
      revision: old ? old.revision + 1 : 1,
      subject:
        old?.subject ??
        (request.action === 'deleteContext'
          ? { kind: 'context', id: request.contextId, token: request.contextToken }
          : {
              kind: 'conversation',
              id: 'conversationId' in request ? request.conversationId : 'conversation',
              token: hash('4'),
            }),
      state: old ? 'deleted' : 'deleting',
      phase: old ? 'complete' : request.action === 'deleteContext' ? 'context-body' : 'turn-bodies',
      deletedDocuments: old ? 5 : 0,
      createdAt: 1,
      updatedAt: 2,
    };
    cleanups.set(current.cleanupId, current);
    output = {
      receipt: receipt(request, {
        kind: 'cleanup',
        cleanupId: current.cleanupId,
        cleanupToken: current.cleanupToken,
        revision: current.revision,
        state: current.state,
        phase: current.phase,
        deletedDocuments: current.deletedDocuments,
      }),
      current,
    };
  }
  if (output && typeof output === 'object' && 'receipt' in output) {
    const r = output.receipt as EditorChatReceipt;
    receipts.set(r.operationId, r);
  }
  return output as EditorChatResponseMap[A];
}
beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto);
  localStorage.clear();
  vi.clearAllMocks();
  boundary.listeners.clear();
  boundary.auth.currentUser = { uid: 'user' };
  check.mockImplementation(() => undefined);
  contexts = new Map();
  conversations = new Map([['conversation', conversationFixture()]]);
  turns = new Map([['turn', turnFixture()]]);
  cleanups = new Map();
  receipts = new Map();
  revision = 1;
  let tail: Promise<unknown> = Promise.resolve();
  vi.stubGlobal('navigator', {
    locks: {
      request: vi.fn((_name: string, callback: () => unknown) => {
        const run = tail.then(() => {
          locked = true;
          try {
            const out = callback();
            expect(out).not.toBeInstanceOf(Promise);
            return out;
          } finally {
            locked = false;
          }
        });
        tail = run.catch(() => undefined);
        return run;
      }),
    },
  });
  vi.mocked(transport.callEditorChat).mockImplementation(async (_uid, request, options) =>
    serve(request, options),
  );
  vi.mocked(transport.resolveEditorChatOperation).mockImplementation((_uid, row) => {
    const known = receipts.get(row.operationId);
    if (known) return Promise.resolve({ state: 'settled', receipt: known });
    if (row.intent === 'cancel')
      return Promise.resolve({
        state: 'settled',
        receipt: {
          schemaVersion: 1,
          operationId: row.operationId,
          action: row.action,
          requestHash: row.requestHash,
          outcome: 'canceled',
          confirmedAt: 1,
          result: { kind: 'fence' },
        },
      });
    return Promise.resolve({ state: 'unknown', receipt: null });
  });
  vi.mocked(captureEditorChatHost).mockImplementation(async (_uid, _host, _source, options) => {
    options?.check?.();
    const withCapture = (
      options as typeof options & {
        withCapture?: (
          value: { base: typeof base; capture: typeof capture },
          check: () => void,
        ) => Promise<unknown>;
      }
    )?.withCapture;
    if (withCapture)
      await withCapture({ base, capture }, () => {
        options?.check?.();
      });
    options?.check?.();
    return { base, capture };
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function setup(options: Partial<Parameters<typeof useEditorChat>[0]> = {}) {
  return renderHook((props) => useEditorChat(props), {
    initialProps: { uid: 'user', host: host(), ...options },
  });
}
async function select(result: ReturnType<typeof setup>['result']) {
  await act(async () => {
    await result.current.refreshConversations();
    await result.current.selectConversation('conversation');
  });
}
async function prepare(result: ReturnType<typeof setup>['result']) {
  await act(async () => {
    await result.current.prepareContext('selection');
    await result.current.advanceContext();
    await result.current.advanceContext();
    await result.current.inspectContext();
  });
}

describe('target-aware private editor chat controller', () => {
  it('mounts without remote mutation, keeps composer only in RAM and survives a same-scope host ref replacement', () => {
    const rendered = setup();
    act(() => rendered.result.current.setDraft('Pergunta ainda não enviada'));
    const method = rendered.result.current.send;
    rendered.rerender({ uid: 'user', host: host() });
    expect(rendered.result.current.state.draft).toBe('Pergunta ainda não enviada');
    expect(rendered.result.current.send).toBe(method);
    expect(transport.callEditorChat).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
  });
  it('loads metadata pages without reading bodies; own questions and authorized answers require getTurn', async () => {
    const { result } = setup();
    await select(result);
    expect(result.current.state.turns.map((t) => t.turnId)).toEqual(['turn']);
    expect(result.current.state.turnReads).toEqual({});
    expect(vi.mocked(transport.callEditorChat).mock.calls.map((call) => call[1].action)).toEqual([
      'listConversations',
      'listMessages',
    ]);
    await act(async () => {
      await result.current.readTurn('turn');
    });
    expect(result.current.state.questions.turn).toBe('Pergunta própria');
    expect(result.current.state.turnReads.turn?.answer?.text).toBe('Resposta autorizada');
  });
  it('creates/renames using confirmed current metadata, preserving a durable settled operation', async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.refreshConversations();
      await result.current.createConversation();
    });
    const id = result.current.state.conversation!.conversationId;
    expect(id).not.toBe('conversation');
    expect(result.current.state.pending?.state).toBe('settled');
    await act(async () => {
      await result.current.renameConversation('Título próprio');
    });
    expect(result.current.state.conversation).toMatchObject({
      conversationId: id,
      title: 'Título próprio',
      revision: 2,
    });
    expect(readEditorChatOperation('user', scope)).toMatchObject({
      action: 'renameConversation',
      state: 'settled',
    });
  });
  it('prepares once and advances one page at a time; inspection is explicit', async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.prepareContext('viewport');
    });
    expect(result.current.state.context?.phase).toBe('local');
    expect(result.current.state.inspection).toBeNull();
    await act(async () => {
      await result.current.advanceContext();
    });
    expect(result.current.state.context?.phase).toBe('global');
    await act(async () => {
      await result.current.advanceContext();
    });
    expect(result.current.state.context?.phase).toBe('ready');
    await act(async () => {
      await result.current.inspectContext();
    });
    expect(result.current.state.inspection?.frozen).toBeTruthy();
    expect(captureEditorChatHost).toHaveBeenCalledTimes(1);
    expect(vi.mocked(transport.callEditorChat).mock.calls.map((call) => call[1].action)).toEqual([
      'prepareContext',
      'advanceContext',
      'advanceContext',
      'inspectContext',
    ]);
  });
  it('does not orphan a ready context and permits another only after explicit cleanup completes', async () => {
    const { result } = setup();
    await prepare(result);
    const id = result.current.state.context!.contextId;
    await act(async () => {
      await result.current.prepareContext('document');
    });
    expect(captureEditorChatHost).toHaveBeenCalledTimes(1);
    await act(async () => {
      await result.current.deleteContext();
      await result.current.advanceCleanup();
    });
    expect(result.current.state.cleanup?.state).toBe('deleted');
    expect(result.current.state.contextRef).toBeNull();
    await act(async () => {
      await result.current.prepareContext('document');
    });
    expect(result.current.state.context?.contextId).not.toBe(id);
    expect(captureEditorChatHost).toHaveBeenCalledTimes(2);
  });
  it('does not recapture or rebase an advance conflict; the existing control and draft remain', async () => {
    const { result } = setup();
    await act(async () => {
      result.current.setDraft('Own');
      await result.current.prepareContext('cursor');
    });
    const before = result.current.state.context;
    vi.mocked(transport.callEditorChat).mockRejectedValueOnce(
      new transport.EditorChatTransportError(
        'functions/failed-precondition',
        false,
        'context-stale',
      ),
    );
    await act(async () => {
      await result.current.advanceContext();
    });
    expect(result.current.state.context).toEqual(before);
    expect(result.current.state.draft).toBe('Own');
    expect(result.current.state.error?.reason).toBe('context-stale');
    expect(captureEditorChatHost).toHaveBeenCalledTimes(1);
  });
  it('sends with frozen generation and journal during deltas, preserving only metadata on disk', async () => {
    const { result } = setup();
    await select(result);
    await prepare(result);
    act(() => result.current.setDraft('Minha pergunta 🐉'));
    await act(async () => {
      await result.current.send(generation);
    });
    expect(result.current.state.draft).toBe('');
    expect(Object.values(result.current.state.questions)).toContain('Minha pergunta 🐉');
    expect(result.current.state.stream).toBeNull();
    expect(result.current.state.pending).toMatchObject({
      action: 'send',
      state: 'settled',
      generation,
    });
    const stored = localStorage.getItem(editorChatOperationKey('user', scope))!;
    for (const text of [
      'Minha pergunta',
      'Resposta em partes',
      'Instrução',
      '"prompt"',
      '"capture"',
      '"answer"',
      '"byokInput"',
    ])
      expect(stored).not.toContain(text);
  });
  it('keeps an authorized BYOK input ephemeral without calling a provider', async () => {
    const { result } = setup();
    await select(result);
    await prepare(result);
    act(() => result.current.setDraft('Own'));
    await act(async () => {
      await result.current.send(byokGeneration);
    });
    expect(result.current.state.byokInput?.prompt).toBe('Entrada autorizada');
    expect(localStorage.getItem(editorChatOperationKey('user', scope))).not.toContain(
      'Entrada autorizada',
    );
    act(() => result.current.invalidateDerived());
    expect(result.current.state.byokInput).toBeNull();
  });
  it('preserves live composer on an uncertain send; reload resolves/cancels only metadata and never replays send', async () => {
    const rendered = setup();
    await select(rendered.result);
    await prepare(rendered.result);
    act(() => rendered.result.current.setDraft('Não perder enquanto aberto'));
    vi.mocked(transport.callEditorChat).mockRejectedValueOnce(
      new transport.EditorChatTransportError('functions/unavailable', true),
    );
    await act(async () => {
      await rendered.result.current.send(generation);
    });
    expect(rendered.result.current.state.draft).toBe('Não perder enquanto aberto');
    expect(rendered.result.current.state.pending?.state).toBe('uncertain');
    const id = rendered.result.current.state.pending!.operationId;
    rendered.unmount();
    const reloaded = setup();
    expect(reloaded.result.current.state.draft).toBe('');
    expect(reloaded.result.current.state.pending?.operationId).toBe(id);
    const sends = vi
      .mocked(transport.callEditorChat)
      .mock.calls.filter((call) => call[1].action === 'send').length;
    await act(async () => {
      await reloaded.result.current.recoverPending('observe');
    });
    expect(reloaded.result.current.state.pending?.state).toBe('uncertain');
    await act(async () => {
      await reloaded.result.current.recoverPending('cancel');
    });
    expect(reloaded.result.current.state.pending).toMatchObject({
      operationId: id,
      intent: 'cancel',
      state: 'settled',
    });
    expect(
      vi.mocked(transport.callEditorChat).mock.calls.filter((call) => call[1].action === 'send'),
    ).toHaveLength(sends);
  });
  it('hides revoked answers while preserving the own question and never reconstructing from deltas', async () => {
    const { result } = setup();
    await select(result);
    await act(async () => {
      await result.current.readTurn('turn');
    });
    vi.mocked(transport.callEditorChat).mockResolvedValueOnce({
      turn: turnFixture(),
      question: 'Pergunta própria',
      presentation: 'blocked',
      answer: null,
    } as never);
    await act(async () => {
      await result.current.readTurn('turn');
    });
    expect(result.current.state.questions.turn).toBe('Pergunta própria');
    expect(result.current.state.turnReads.turn?.answer).toBeNull();
    expect(result.current.state.stream).toBeNull();
  });
  it('invalidates projections on hint/focus without authorizing or automatically reading them', async () => {
    const rendered = setup({ invalidationKey: 1 });
    await select(rendered.result);
    await prepare(rendered.result);
    await act(async () => {
      await rendered.result.current.readTurn('turn');
    });
    const calls = vi.mocked(transport.callEditorChat).mock.calls.length;
    act(() => rendered.result.current.setDraft('Own'));
    rendered.rerender({ uid: 'user', host: host(), invalidationKey: 2 });
    expect(rendered.result.current.state.turnReads).toEqual({});
    expect(rendered.result.current.state.inspection).toBeNull();
    expect(rendered.result.current.state.questions.turn).toBe('Pergunta própria');
    expect(rendered.result.current.state.needsInspection).toBe(true);
    expect(vi.mocked(transport.callEditorChat).mock.calls).toHaveLength(calls);
    await act(async () => {
      await rendered.result.current.readTurn('turn');
    });
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(rendered.result.current.state.turnReads).toEqual({});
    expect(rendered.result.current.state.draft).toBe('Own');
  });
  it('rejects stale catalog cursors without adopting a selected conversation revision or losing draft', async () => {
    const { result } = setup();
    const page = await serve({ action: 'listConversations', ...scope });
    vi.mocked(transport.callEditorChat).mockResolvedValueOnce({ ...page, nextCursor: 'cursor' });
    await act(async () => {
      await result.current.refreshConversations();
      await result.current.selectConversation('conversation');
      result.current.setDraft('Own');
    });
    const selected = result.current.state.conversation;
    vi.mocked(transport.callEditorChat).mockResolvedValueOnce({
      ...page,
      collectionRevision: 2,
      items: [{ ...conversationFixture(), revision: 9 }],
      nextCursor: null,
    });
    await act(async () => {
      await result.current.loadMoreConversations();
    });
    expect(result.current.state.error?.reason).toBe('cursor-stale');
    expect(result.current.state.conversation).toEqual(selected);
    expect(result.current.state.draft).toBe('Own');
    expect(result.current.state.catalog?.nextCursor).toBeNull();
  });
  it('ignores out-of-order catalog reads and old lists completing after a confirmed mutation', async () => {
    const { result } = setup();
    const page = await serve({ action: 'listConversations', ...scope });
    const old = deferred<EditorChatResponseMap['listConversations']>();
    vi.mocked(transport.callEditorChat).mockImplementationOnce(() => old.promise);
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.refreshConversations();
    });
    await act(async () => {
      await result.current.refreshConversations();
      await result.current.createConversation();
    });
    const selected = result.current.state.conversation;
    await act(async () => {
      old.resolve({ ...page, items: [] });
      await pending;
    });
    expect(result.current.state.conversation).toEqual(selected);
    expect(result.current.state.catalogStatus).toBe('idle');
    expect(result.current.state.conversations).toHaveLength(1);
  });
  it('fences late UID A→B→A completions and clears prior own/private RAM', async () => {
    const { result } = setup();
    await select(result);
    act(() => result.current.setDraft('Own'));
    const late = deferred<EditorChatTurnRead>();
    vi.mocked(transport.callEditorChat).mockImplementationOnce(() => late.promise);
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.readTurn('turn');
    });
    const previous = boundary.auth.currentUser;
    act(() => {
      boundary.auth.currentUser = { uid: 'other' };
      for (const listener of boundary.listeners) listener(boundary.auth.currentUser);
      boundary.auth.currentUser = previous;
      for (const listener of boundary.listeners) listener(previous);
    });
    const value = await serve({
      action: 'getTurn',
      ...scope,
      conversationId: 'conversation',
      conversationToken: hash('4'),
      turnId: 'turn',
    });
    await act(async () => {
      late.resolve(value);
      await pending;
    });
    expect(result.current.state.turnReads).toEqual({});
    expect(result.current.state.questions).toEqual({});
    expect(result.current.state.draft).toBe('');
  });
  it('fences disabled/scope-replaced late reads and preserves a same-scope disabled draft', async () => {
    const rendered = setup();
    await select(rendered.result);
    act(() => rendered.result.current.setDraft('Own'));
    const late = deferred<EditorChatTurnRead>();
    vi.mocked(transport.callEditorChat).mockImplementationOnce(() => late.promise);
    let pending!: Promise<void>;
    act(() => {
      pending = rendered.result.current.readTurn('turn');
    });
    rendered.rerender({ uid: 'user', host: host(), enabled: false });
    const value = await serve({
      action: 'getTurn',
      ...scope,
      conversationId: 'conversation',
      conversationToken: hash('4'),
      turnId: 'turn',
    });
    await act(async () => {
      late.resolve(value);
      await pending;
    });
    expect(rendered.result.current.state.turnReads).toEqual({});
    expect(rendered.result.current.hasUnsentDraft).toBe(true);
    rendered.rerender({
      uid: 'user',
      host: { ...host(), resource: { kind: 'scene', id: 'other' } },
      enabled: true,
    });
    expect(rendered.result.current.state.draft).toBe('');
    expect(rendered.result.current.state.pending).toBeNull();
  });
  it('removes cached derived bodies if the host lifecycle fails, without altering its journal', async () => {
    const { result } = setup();
    await select(result);
    await act(async () => {
      await result.current.readTurn('turn');
    });
    check.mockImplementation(() => {
      throw new Error('gone');
    });
    await act(async () => {
      await result.current.readTurn('turn');
    });
    expect(result.current.state.turnReads).toEqual({});
    expect(result.current.state.questions.turn).toBe('Pergunta própria');
  });
  it('recovers confirmed context controls after reload without a File/capture or historical body adoption', async () => {
    const rendered = setup();
    await prepare(rendered.result);
    const id = rendered.result.current.state.context!.contextId;
    rendered.unmount();
    const reloaded = setup();
    expect(reloaded.result.current.state.contextRef?.id).toBe(id);
    expect(reloaded.result.current.state.inspection).toBeNull();
    const captures = vi.mocked(captureEditorChatHost).mock.calls.length;
    contexts.set(id, { ...contexts.get(id)!, revision: 8, phase: 'stale' });
    await act(async () => {
      await reloaded.result.current.recoverPending('observe');
    });
    expect(reloaded.result.current.state.context).toMatchObject({
      contextId: id,
      revision: 8,
      phase: 'stale',
    });
    expect(reloaded.result.current.state.inspection).toBeNull();
    expect(captureEditorChatHost).toHaveBeenCalledTimes(captures);
  });
  it('resumes private cleanup after the root/host is unavailable and does not require a body', async () => {
    const { result } = setup();
    await select(result);
    await act(async () => {
      await result.current.deleteConversation();
    });
    check.mockImplementation(() => {
      throw new Error('deleted root');
    });
    await act(async () => {
      await result.current.refreshKnownControl();
      await result.current.advanceCleanup();
    });
    expect(result.current.state.cleanup?.state).toBe('deleted');
    expect(result.current.state.conversationRef).toBeNull();
  });
  it('preserves corrupt/future metadata and blocks mutation before network', async () => {
    const key = editorChatOperationKey('user', scope);
    localStorage.setItem(key, '{"schemaVersion":99}');
    const { result } = setup();
    expect(result.current.state.error?.code).toBe('editor-chat/storage-corrupt');
    await act(async () => {
      await result.current.prepareContext('cursor');
    });
    expect(localStorage.getItem(key)).toBe('{"schemaVersion":99}');
    expect(transport.callEditorChat).not.toHaveBeenCalled();
  });
  it('is StrictMode-safe and has no phantom reserve/RPC on replayed mount effects', async () => {
    const rendered = renderHook(() => useEditorChat({ uid: 'user', host: host() }), {
      wrapper: StrictMode,
    });
    act(() => rendered.result.current.setDraft('Own'));
    await act(async () => {
      await rendered.result.current.refreshConversations();
    });
    expect(rendered.result.current.state.catalogStatus).toBe('ready');
    expect(transport.callEditorChat).toHaveBeenCalledTimes(1);
    expect(localStorage.length).toBe(0);
  });
  it('stops a known running attempt explicitly; canceling an unknown operation does not pretend to stop it', async () => {
    turns.set('turn', turnFixture({ state: 'running' }));
    const { result } = setup();
    await select(result);
    await act(async () => {
      await result.current.stopTurn();
    });
    expect(result.current.state.turns.find((t) => t.turnId === 'turn')?.state).toBe('stopped');
    expect(result.current.state.pending?.action).toBe('stopTurn');
  });
  it('shows generic infrastructure failure without leaking messages or mutating draft', async () => {
    const { result } = setup();
    act(() => result.current.setDraft('Own'));
    vi.mocked(transport.callEditorChat).mockRejectedValueOnce(new Error('PRIVATE INFRA KEY'));
    await act(async () => {
      await result.current.refreshConversations();
    });
    expect(result.current.state.catalogStatus).toBe('error');
    expect(result.current.state.error?.code).toBe('editor-chat/unavailable');
    expect(JSON.stringify(result.current.state.error)).not.toContain('PRIVATE');
    expect(result.current.state.draft).toBe('Own');
  });
});

describe('frozen BYOK attempt and additional controller races', () => {
  async function byok(result: ReturnType<typeof setup>['result']) {
    await select(result);
    await prepare(result);
    act(() => result.current.setDraft('Pergunta própria'));
    await act(async () => {
      await result.current.send(byokGeneration);
    });
    let value: Awaited<ReturnType<typeof result.current.getByokInput>> = null;
    await act(async () => {
      value = await result.current.getByokInput();
    });
    return value!;
  }
  it('reads BYOK input explicitly, then completes the frozen attempt and projects only an authorized getTurn body', async () => {
    const { result } = setup();
    const input = await byok(result);
    expect(Object.isFrozen(input.control)).toBe(true);
    expect(input.input.generation.requested).toEqual(byokGeneration);
    await act(async () => {
      await result.current.completeBYOK('PRIVATE RAW ANSWER', input.control);
    });
    expect(result.current.state.byokInput).toBeNull();
    expect(result.current.state.turnReads[input.control.turnId]?.answer?.text).toBe(
      'Resposta autorizada',
    );
    expect(result.current.state.pending).toMatchObject({
      action: 'completeBYOK',
      generation: byokGeneration,
      state: 'settled',
    });
    expect(localStorage.getItem(editorChatOperationKey('user', scope))).not.toContain(
      'PRIVATE RAW ANSWER',
    );
    expect(
      vi
        .mocked(transport.callEditorChat)
        .mock.calls.slice(-2)
        .map((call) => call[1].action),
    ).toEqual(['completeBYOK', 'getTurn']);
  });
  it.each(['provider-failed', 'credential-unavailable', 'user-stopped'] as const)(
    'fails BYOK using the original handle and reason %s, without provider fallback',
    async (reason) => {
      const { result } = setup();
      const input = await byok(result);
      await act(async () => {
        await result.current.failBYOK(reason, input.control);
      });
      expect(result.current.state.pending?.action).toBe('failBYOK');
      expect(result.current.state.byokInput).toBeNull();
      expect(
        vi.mocked(transport.callEditorChat).mock.calls.filter((call) => call[1].action === 'send'),
      ).toHaveLength(1);
    },
  );
  it('refuses a wrong or late handle before emitting a completion for the current attempt', async () => {
    const { result } = setup();
    const input = await byok(result);
    const before = vi.mocked(transport.callEditorChat).mock.calls.length;
    await act(async () => {
      await result.current.completeBYOK('Own raw', { ...input.control, attemptToken: hash('f') });
    });
    expect(vi.mocked(transport.callEditorChat).mock.calls).toHaveLength(before);
    expect(result.current.state.error?.code).toBe('editor-chat/identity-changed');
    await act(async () => {
      await result.current.getByokInput();
      await result.current.selectConversation('conversation');
    });
    act(() => result.current.invalidateDerived());
    await act(async () => {
      await result.current.failBYOK('user-stopped', input.control);
    });
    expect(
      vi
        .mocked(transport.callEditorChat)
        .mock.calls.filter(
          (call) => call[1].action === 'completeBYOK' || call[1].action === 'failBYOK',
        ),
    ).toHaveLength(0);
  });
  it('does not return a terminal BYOK input or use a stale generation as the current attempt', async () => {
    const { result } = setup();
    const input = await byok(result);
    turns.set(input.control.turnId, { ...turns.get(input.control.turnId)!, state: 'done' });
    let terminal: Awaited<ReturnType<typeof result.current.getByokInput>> = input;
    await act(async () => {
      terminal = await result.current.getByokInput();
    });
    expect(terminal).toBeNull();
    expect(result.current.state.byokInput).toBeNull();
  });
  it('does not send a known stale inspection and does not automatically recapture it', async () => {
    const { result } = setup();
    await select(result);
    await prepare(result);
    const context = result.current.state.context!;
    const frozen = await frozenFixture();
    vi.mocked(transport.callEditorChat).mockResolvedValueOnce({
      context,
      source: frozen.source,
      frozen,
      freshness: 'stale',
    } as never);
    await act(async () => {
      await result.current.inspectContext();
      result.current.setDraft('Own');
      await result.current.send(generation);
    });
    expect(
      vi.mocked(transport.callEditorChat).mock.calls.filter((call) => call[1].action === 'send'),
    ).toHaveLength(0);
    expect(captureEditorChatHost).toHaveBeenCalledTimes(1);
  });
  it('preserves a newer live composer while an older prompt finishes', async () => {
    const { result } = setup();
    await select(result);
    await prepare(result);
    act(() => result.current.setDraft('Primeira pergunta'));
    const held = deferred<EditorChatResponseMap['send']>();
    vi.mocked(transport.callEditorChat).mockImplementationOnce(async (_uid, request, options) => {
      const value = await serve(request, options);
      await held.promise;
      return value;
    });
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.send(generation);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    act(() => result.current.setDraft('Pergunta seguinte'));
    await act(async () => {
      held.resolve(undefined as never);
      await pending;
    });
    expect(result.current.state.draft).toBe('Pergunta seguinte');
    expect(Object.values(result.current.state.questions)).toContain('Primeira pergunta');
  });
  it('rejects a stale message cursor without refreshing selected control revisions', async () => {
    const { result } = setup();
    await select(result);
    const page = result.current.state.messagePage!;
    vi.mocked(transport.callEditorChat).mockResolvedValueOnce({
      ...page,
      nextCursor: 'cursor',
    });
    await act(async () => {
      await result.current.refreshKnownControl();
    });
    vi.mocked(transport.callEditorChat).mockResolvedValueOnce({
      ...page,
      conversationRevision: 99,
      nextCursor: null,
    });
    await act(async () => {
      await result.current.loadMoreMessages();
    });
    expect(result.current.state.error?.reason).toBe('cursor-stale');
    expect(result.current.state.conversation?.revision).toBe(1);
    expect(result.current.state.messagePage?.nextCursor).toBeNull();
  });
  it('retains old controls when a new incarnation appears and blocks new mutation until cleanup', async () => {
    const { result } = setup();
    await select(result);
    await prepare(result);
    const before = readEditorChatOperation('user', scope);
    const page = await serve({ action: 'listConversations', ...scope });
    vi.mocked(transport.callEditorChat).mockResolvedValueOnce({
      ...page,
      projectToken: hash('9'),
      resourceToken: hash('8'),
      items: [],
    });
    await act(async () => {
      await result.current.refreshConversations();
    });
    expect(result.current.state.error?.reason).toBe('identity-changed');
    expect(readEditorChatOperation('user', scope)).toEqual(before);
    const count = vi.mocked(transport.callEditorChat).mock.calls.length;
    await act(async () => {
      await result.current.createConversation();
    });
    expect(vi.mocked(transport.callEditorChat).mock.calls).toHaveLength(count);
    expect(result.current.state.contextRef).not.toBeNull();
    await act(async () => {
      await result.current.deleteContext();
      await result.current.advanceCleanup();
    });
    expect(result.current.state.cleanup?.state).toBe('deleted');
  });
});

it('recovers the first prepare receipt after a lost response and reload without recapturing own text', async () => {
  const rendered = setup();
  vi.mocked(transport.callEditorChat).mockImplementationOnce(async (_uid, request, options) => {
    await serve(request, options);
    throw new transport.EditorChatTransportError('functions/unavailable', true);
  });
  await act(async () => {
    await rendered.result.current.prepareContext('selection');
  });
  expect(rendered.result.current.state.context).toBeNull();
  expect(rendered.result.current.state.pending).toMatchObject({
    action: 'prepareContext',
    contextToken: null,
    state: 'uncertain',
  });
  const id = rendered.result.current.state.pending!.contextId!;
  rendered.unmount();
  const reloaded = setup();
  await act(async () => {
    await reloaded.result.current.recoverPending('observe');
  });
  expect(reloaded.result.current.state.context).toMatchObject({ contextId: id, phase: 'local' });
  expect(reloaded.result.current.state.pending?.state).toBe('settled');
  expect(captureEditorChatHost).toHaveBeenCalledTimes(1);
});
it('resolves a streamed claim before stopping the known attempt and never marks a mere abort as stopped', async () => {
  const { result } = setup();
  await select(result);
  await prepare(result);
  act(() => result.current.setDraft('Own'));
  const started = deferred<void>();
  vi.mocked(transport.callEditorChat).mockImplementationOnce(async (_uid, request, options) => {
    if (request.action !== 'send') throw new Error('Unexpected request');
    const turn = turnFixture({
      turnId: request.operationId,
      conversationId: request.conversationId,
      state: 'running',
    });
    turns.set(turn.turnId, turn);
    const claim = receipt(request, {
      kind: 'turn',
      conversationId: request.conversationId,
      conversationToken: request.conversationToken,
      turnId: turn.turnId,
      attemptToken: turn.attemptToken,
      revision: turn.revision,
      state: 'running',
    });
    receipts.set(claim.operationId, claim);
    const context = contexts.get(request.contextId)!;
    contexts.set(context.contextId, {
      ...context,
      phase: 'consumed',
      revision: context.revision + 1,
    });
    options?.onEvent?.({ type: 'started', turn });
    options?.onEvent?.({
      type: 'delta',
      turnId: turn.turnId,
      attemptToken: turn.attemptToken,
      index: 0,
      text: 'Trecho efêmero',
    });
    started.resolve();
    await new Promise<never>((_resolve, reject) => {
      options?.signal?.addEventListener(
        'abort',
        () => reject(new transport.EditorChatTransportError('functions/cancelled', true)),
        { once: true },
      );
    });
    throw new Error('Unreachable');
  });
  let sending!: Promise<void>;
  act(() => {
    sending = result.current.send(generation);
  });
  await act(async () => {
    await started.promise;
  });
  expect(result.current.state.stream?.turn.state).toBe('running');
  expect(result.current.state.pending?.state).toBe('pending');
  await act(async () => {
    await result.current.stopTurn();
    await sending;
  });
  expect(transport.resolveEditorChatOperation).toHaveBeenCalled();
  expect(result.current.state.turns.some((turn) => turn.state === 'stopped')).toBe(true);
  expect(result.current.state.stream).toBeNull();
  expect(result.current.state.pending).toMatchObject({ action: 'stopTurn', state: 'settled' });
});
it('fences BYOK completion after its generation changes during RPC, preserving recovery metadata', async () => {
  const { result } = setup();
  await select(result);
  await prepare(result);
  act(() => result.current.setDraft('Own'));
  await act(async () => {
    await result.current.send(byokGeneration);
  });
  let authorized: Awaited<ReturnType<typeof result.current.getByokInput>> = null;
  await act(async () => {
    authorized = await result.current.getByokInput();
  });
  const control = authorized!.control;
  const held = deferred<EditorChatResponseMap['completeBYOK']>();
  const issued = deferred<void>();
  vi.mocked(transport.callEditorChat).mockImplementationOnce(async (_uid, request, options) => {
    const value = await serve(request, options);
    issued.resolve();
    await held.promise;
    return value;
  });
  let completing!: Promise<void>;
  act(() => {
    completing = result.current.completeBYOK('Own provider answer', control);
  });
  await act(async () => {
    await issued.promise;
  });
  const changed = turnFixture({
    turnId: control.turnId,
    conversationId: control.conversationId,
    provider: 'byok',
    state: 'awaiting-byok',
    generation: resolveChatGeneration({ ...byokGeneration, reasoning: 'low' }),
  });
  vi.mocked(transport.callEditorChat).mockResolvedValueOnce({
    turn: changed,
    question: 'Pergunta própria',
    presentation: 'available',
    answer: null,
  } as never);
  await act(async () => {
    await result.current.readTurn(control.turnId);
    held.resolve(undefined as never);
    await completing;
  });
  expect(result.current.state.pending).toMatchObject({ action: 'completeBYOK', state: 'pending' });
  expect(result.current.state.byokInput).toBeNull();
  expect(result.current.state.turnReads).toEqual({});
});

it('returns no BYOK payload after a delayed input read loses its authorization/lifecycle generation', async () => {
  const { result } = setup();
  await select(result);
  await prepare(result);
  act(() => result.current.setDraft('Own'));
  await act(async () => {
    await result.current.send(byokGeneration);
  });
  const turn = result.current.state.turns.find((item) => item.state === 'awaiting-byok')!;
  const late = deferred<EditorChatResponseMap['getByokInput']>();
  vi.mocked(transport.callEditorChat).mockImplementationOnce(() => late.promise);
  let pending!: ReturnType<typeof result.current.getByokInput>;
  act(() => {
    pending = result.current.getByokInput();
  });
  act(() => result.current.invalidateDerived());
  const input = await serve({
    action: 'getByokInput',
    ...scope,
    conversationId: 'conversation',
    conversationToken: hash('4'),
    turnId: turn.turnId,
    attemptToken: turn.attemptToken,
  });
  let returned: Awaited<ReturnType<typeof result.current.getByokInput>> = null;
  await act(async () => {
    late.resolve(input);
    returned = await pending;
  });
  expect(returned).toBeNull();
  expect(result.current.state.byokInput).toBeNull();
});

it('releases loading markers when a hint supersedes an outstanding catalog read', async () => {
  const { result } = setup();
  const held = deferred<EditorChatResponseMap['listConversations']>();
  vi.mocked(transport.callEditorChat).mockImplementationOnce(() => held.promise);
  let pending!: Promise<void>;
  act(() => {
    pending = result.current.refreshConversations();
  });
  expect(result.current.state.catalogStatus).toBe('loading');
  act(() => result.current.invalidateDerived());
  expect(result.current.state.catalogStatus).toBe('idle');
  const page = await serve({ action: 'listConversations', ...scope });
  await act(async () => {
    held.resolve(page);
    await pending;
  });
  expect(result.current.state.catalogStatus).toBe('idle');
  expect(result.current.state.conversations).toEqual([]);
});

it.each(['getTurn', 'getByokInput'] as const)(
  'does not restore a delayed %s result after conversation cleanup',
  async (action) => {
    const { result } = setup();
    await select(result);
    if (action === 'getByokInput') {
      await prepare(result);
      act(() => result.current.setDraft('Own question'));
      await act(async () => {
        await result.current.send(byokGeneration);
      });
    }
    const turnId =
      action === 'getTurn'
        ? 'turn'
        : result.current.state.turns.find((t) => t.state === 'awaiting-byok')!.turnId;
    const held = deferred<void>();
    const issued = deferred<void>();
    vi.mocked(transport.callEditorChat).mockImplementationOnce(async (_uid, request, options) => {
      const response = await serve(request, options);
      issued.resolve();
      await held.promise;
      return response;
    });
    let pending!: Promise<unknown>;
    act(() => {
      pending =
        action === 'getTurn' ? result.current.readTurn(turnId) : result.current.getByokInput();
    });
    await act(async () => {
      await issued.promise;
    });
    await act(async () => {
      await result.current.deleteConversation();
      await result.current.advanceCleanup();
    });
    expect(result.current.state.conversationRef).toBeNull();
    await act(async () => {
      held.resolve();
      await pending;
    });
    expect(result.current.state.turnReads).toEqual({});
    expect(result.current.state.questions).toEqual({});
    expect(result.current.state.turns).toEqual([]);
    expect(result.current.state.byokInput).toBeNull();
    expect(result.current.state.stream).toBeNull();
  },
);

const adventureScope = {
  target: { kind: 'adventure' as const, id: 'adventure' },
  resource: { kind: 'scene' as const, id: 'scene' },
};
async function seedSceneBinding() {
  const request: EditorChatRequest<'setAdventurePersonaBinding'> = {
    action: 'setAdventurePersonaBinding',
    adventureId: 'adventure',
    adventureToken: hash('1'),
    sceneId: 'scene',
    expectedBindingToken: hash('7'),
    value: { personaComplement: null },
    operationId: 'persona-operation',
    requestHash: hash('0'),
  };
  request.requestHash = await editorChatRequestHash(request);
  const before = {
    ...rowFor(request),
    conversationId: 'conversation',
    conversationToken: hash('4'),
    turnId: 'turn',
    attemptToken: hash('e'),
  };
  await reserveEditorChatOperation(before, () => undefined);
  const settled = { ...before, state: 'settled' as const, localGeneration: 1 };
  await compareEditorChatOperation('user', adventureScope, before, settled, () => undefined);
  return settled;
}
async function adventureServe<A extends EditorChatAction>(
  request: EditorChatRequest<A>,
  options?: transport.EditorChatCallOptions,
): Promise<EditorChatResponseMap[A]> {
  const result = await serve(request, options);
  if (request.action === 'listConversations') {
    const page = result as EditorChatResponseMap['listConversations'];
    return {
      ...page,
      ...adventureScope,
      items: page.items.map((item) => ({ ...item, ...adventureScope })),
    } as EditorChatResponseMap[A];
  }
  if (request.action === 'prepareContext') {
    const mutation = result as EditorChatResponseMap['prepareContext'];
    const current = mutation.current && { ...mutation.current, ...adventureScope };
    if (current) contexts.set(current.contextId, current);
    return { ...mutation, current } as EditorChatResponseMap[A];
  }
  return result;
}
function adventureSetup() {
  vi.mocked(transport.callEditorChat).mockImplementation((_uid, request, options) =>
    adventureServe(request, options),
  );
  return setup({ host: { ...host(), ...adventureScope } });
}
it('rehydrates only native metadata after a scene persona setter and prepares without losing the known conversation', async () => {
  const saved = await seedSceneBinding();
  const { result } = adventureSetup();
  expect(result.current.state.conversationRef).toEqual({ id: 'conversation', token: hash('4') });
  await act(async () => {
    await result.current.refreshConversations();
  });
  expect(result.current.state.error).toBeNull();
  expect(result.current.state.catalog?.resourceToken).toBe(hash('2'));
  expect(result.current.state.messagePage).toBeNull();
  expect(result.current.state.turnReads).toEqual({});
  expect(vi.mocked(transport.callEditorChat).mock.calls.map((call) => call[1].action)).toEqual([
    'listConversations',
    'listMessages',
  ]);
  expect(readEditorChatOperation('user', adventureScope)).toEqual(saved);
  await act(async () => {
    await result.current.selectConversation('conversation');
  });
  expect(result.current.state.conversation?.conversationId).toBe('conversation');
  await act(async () => {
    await result.current.prepareContext('selection');
  });
  expect(result.current.state.context?.phase).toBe('local');
  expect(readEditorChatOperation('user', adventureScope)).toMatchObject({
    action: 'prepareContext',
    resourceToken: hash('2'),
    conversationId: 'conversation',
    conversationToken: hash('4'),
    turnId: 'turn',
    attemptToken: hash('e'),
  });
  expect(
    vi.mocked(transport.callEditorChat).mock.calls.some((call) => call[1].action === 'getTurn'),
  ).toBe(false);
});
it.each(['project', 'conversation'] as const)(
  'does not hydrate binding-only metadata after the native %s origin was recreated',
  async (changed) => {
    const saved = await seedSceneBinding();
    const { result } = adventureSetup();
    if (changed === 'project')
      vi.mocked(transport.callEditorChat).mockImplementationOnce(
        async (_uid, request, options) => ({
          ...(await adventureServe(request, options)),
          projectToken: hash('9'),
        }),
      );
    else
      vi.mocked(transport.callEditorChat)
        .mockImplementationOnce((_uid, request, options) => adventureServe(request, options))
        .mockRejectedValueOnce(
          new transport.EditorChatTransportError(
            'functions/failed-precondition',
            false,
            'identity-changed',
          ),
        );
    await act(async () => {
      await result.current.refreshConversations();
    });
    expect(result.current.state.catalog).toBeNull();
    expect(result.current.state.error).not.toBeNull();
    expect(readEditorChatOperation('user', adventureScope)).toEqual(saved);
    const count = vi.mocked(transport.callEditorChat).mock.calls.length;
    await act(async () => {
      await result.current.prepareContext('selection');
    });
    expect(vi.mocked(transport.callEditorChat).mock.calls).toHaveLength(count);
    expect(result.current.state.turnReads).toEqual({});
  },
);
it('does not adopt a binding-only catalog proof when another tab changes the integral journal during the metadata read', async () => {
  const saved = await seedSceneBinding();
  const { result } = adventureSetup();
  const held = deferred<EditorChatResponseMap['listMessages']>();
  const issued = deferred<void>();
  vi.mocked(transport.callEditorChat).mockImplementation(async (_uid, request, options) => {
    if (request.action === 'listMessages') {
      issued.resolve();
      return held.promise;
    }
    return adventureServe(request, options);
  });
  let refreshing!: Promise<void>;
  act(() => {
    refreshing = result.current.refreshConversations();
  });
  await act(async () => {
    await issued.promise;
  });
  const next = { ...saved, localGeneration: saved.localGeneration + 1 };
  await compareEditorChatOperation('user', adventureScope, saved, next, () => undefined);
  await act(async () => {
    held.resolve(
      await serve({
        action: 'listMessages',
        ...adventureScope,
        conversationId: 'conversation',
        conversationToken: hash('4'),
      }),
    );
    await refreshing;
  });
  expect(result.current.state.catalog).toBeNull();
  expect(readEditorChatOperation('user', adventureScope)).toEqual(next);
  expect(result.current.state.conversationRef).toEqual({ id: 'conversation', token: hash('4') });
  expect(result.current.state.turnReads).toEqual({});
});

it('discards a binding-only proof after a journal change before a textual operation', async () => {
  const saved = await seedSceneBinding();
  const { result } = adventureSetup();
  await act(async () => {
    await result.current.refreshConversations();
  });
  const next = { ...saved, localGeneration: saved.localGeneration + 1 };
  await compareEditorChatOperation('user', adventureScope, saved, next, () => undefined);
  const calls = vi.mocked(transport.callEditorChat).mock.calls.length;
  await act(async () => {
    await result.current.prepareContext('selection');
  });
  expect(vi.mocked(transport.callEditorChat).mock.calls).toHaveLength(calls);
  expect(captureEditorChatHost).not.toHaveBeenCalled();
  expect(readEditorChatOperation('user', adventureScope)).toEqual(next);
});
it('deletes a known conversation from a binding-only journal without source authorization and preserves own questions until explicit cleanup', async () => {
  await seedSceneBinding();
  const { result } = adventureSetup();
  vi.mocked(transport.callEditorChat).mockResolvedValueOnce({
    turn: turnFixture(),
    question: 'Pergunta histórica própria',
    presentation: 'blocked',
    answer: null,
  } as never);
  await act(async () => {
    await result.current.readTurn('turn');
  });
  expect(result.current.state.questions.turn).toBe('Pergunta histórica própria');
  check.mockImplementation(() => {
    throw new Error('Origem removida');
  });
  const calls = vi.mocked(transport.callEditorChat).mock.calls.length;
  await act(async () => {
    await result.current.deleteConversation();
  });
  expect(result.current.state.cleanup?.state).toBe('deleting');
  expect(result.current.state.questions.turn).toBe('Pergunta histórica própria');
  expect(readEditorChatOperation('user', adventureScope)).toMatchObject({
    action: 'deleteConversation',
    projectToken: null,
    resourceToken: null,
    conversationId: 'conversation',
    conversationToken: hash('4'),
    turnId: 'turn',
    attemptToken: hash('e'),
  });
  await act(async () => {
    await result.current.advanceCleanup();
  });
  expect(result.current.state.cleanup?.state).toBe('deleted');
  expect(result.current.state.conversationRef).toBeNull();
  expect(result.current.state.questions).toEqual({});
  expect(result.current.state.turnReads).toEqual({});
  expect(
    vi
      .mocked(transport.callEditorChat)
      .mock.calls.slice(calls)
      .map((call) => call[1].action),
  ).toEqual(['deleteConversation', 'advanceCleanup']);
});

it('does not reuse an older native proof after a binding-only catalog refresh fails', async () => {
  const saved = await seedSceneBinding();
  const { result } = adventureSetup();
  await act(async () => {
    await result.current.refreshConversations();
  });
  expect(result.current.state.catalog?.resourceToken).toBe(hash('2'));
  vi.mocked(transport.callEditorChat).mockRejectedValueOnce(new Error('Offline'));
  await act(async () => {
    await result.current.refreshConversations();
  });
  const calls = vi.mocked(transport.callEditorChat).mock.calls.length;
  await act(async () => {
    await result.current.prepareContext('selection');
  });
  expect(vi.mocked(transport.callEditorChat).mock.calls).toHaveLength(calls);
  expect(readEditorChatOperation('user', adventureScope)).toEqual(saved);
  expect(captureEditorChatHost).not.toHaveBeenCalled();
});
