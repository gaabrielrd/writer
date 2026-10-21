import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  callEditorChat,
  resolveEditorChatOperation,
  EditorChatTransportError,
} from '../services/editorChatService';
import {
  reserveEditorChatOperation,
  cancelEditorChatOperation,
  compareEditorChatOperation,
  readEditorChatOperation,
  editorChatOperationKey,
} from '../services/editorChatOperationStorage';
import {
  normalizeEditorChatRequest,
  editorChatRequestHash,
  type EditorChatOperationRow,
  type EditorChatStreamEvent,
} from '../model/editorChat';
import { EDITOR_CHAT_ACTIONS } from '../../../../functions/src/editorChatContracts.mjs';
import {
  requestFor,
  rowFor,
  responseFor,
  hash,
  scope,
  turnFixture,
  frozenFixture,
  byokGeneration,
} from './editorChatTestFixtures';
import { resolveChatGeneration } from '../model/chatGeneration';

const mocks = vi.hoisted(() => ({
  user: ((): { uid: string } | null => ({ uid: 'user' }))(),
  observers: new Set<(user: { uid: string } | null) => void>(),
  errors: new Set<() => void>(),
  call: vi.fn(),
  stream: vi.fn(),
  callable: vi.fn(),
  locked: false,
}));
vi.mock('@/shared/lib', () => ({
  auth: {
    get currentUser() {
      return mocks.user;
    },
  },
  getFirebaseApp: () => ({}),
}));
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (
    _auth: unknown,
    listener: (user: { uid: string } | null) => void,
    error: () => void,
  ) => {
    mocks.observers.add(listener);
    mocks.errors.add(error);
    return () => {
      mocks.observers.delete(listener);
      mocks.errors.delete(error);
    };
  },
}));
vi.mock('firebase/functions', () => ({
  getFunctions: () => ({}),
  httpsCallable: (...args: unknown[]) => {
    mocks.callable(...args);
    return Object.assign(mocks.call, { stream: mocks.stream });
  },
}));
function switchUser(user: { uid: string } | null) {
  mocks.user = user;
  for (const callback of mocks.observers) callback(user);
}
function streamed(data: unknown, events: unknown[] = []) {
  return {
    data: Promise.resolve(data),
    stream: (async function* () {
      for (const event of events) {
        await Promise.resolve();
        yield event;
      }
    })(),
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('navigator', {
    locks: {
      request: (_key: string, work: () => unknown) => {
        mocks.locked = true;
        try {
          return Promise.resolve(work());
        } finally {
          mocks.locked = false;
        }
      },
    },
  });
  localStorage.clear();
  vi.clearAllMocks();
  mocks.call.mockReset();
  mocks.stream.mockReset();
  mocks.user = { uid: 'user' };
  mocks.observers.clear();
  mocks.errors.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  expect(mocks.observers.size).toBe(0);
});

const actions = EDITOR_CHAT_ACTIONS.filter((action) => action !== 'resolveOperation');
describe('editorChat callable transport', () => {
  it.each(actions)(
    'validates and routes the exact %s wire without holding a storage lock',
    async (action) => {
      const request = await requestFor(action);
      const response = await responseFor(request);
      let operation: EditorChatOperationRow | undefined;
      if ('operationId' in request) {
        operation = rowFor(request);
        await reserveEditorChatOperation(operation, () => undefined);
      }
      mocks.call.mockImplementation(() => {
        expect(mocks.locked).toBe(false);
        return Promise.resolve({ data: response });
      });
      mocks.stream.mockImplementation(() => {
        expect(mocks.locked).toBe(false);
        return Promise.resolve(streamed(response));
      });
      expect(await callEditorChat('user', request, { operation })).toEqual(response);
      expect(mocks.callable).toHaveBeenCalledWith(expect.anything(), 'editorChat', {
        timeout: 120000,
      });
      const wire = normalizeEditorChatRequest(request);
      if (action === 'send') {
        const sent: unknown[] = mocks.stream.mock.calls[0] ?? [];
        expect(sent[0]).toEqual(wire);
        expect((sent[1] as { signal: unknown }).signal).toBeInstanceOf(AbortSignal);
      } else expect(mocks.call).toHaveBeenCalledWith(wire);
      if (operation) expect(readEditorChatOperation('user', operation)).toEqual(operation);
    },
  );

  it('configures an adventure root with no scene and no invented resource token', async () => {
    const request = await requestFor('setAdventurePersonaBinding');
    const row = rowFor(request);
    expect(row.resource).toBeNull();
    expect(row.resourceToken).toBeNull();
    expect(editorChatOperationKey('user', row)).toBe(
      'writer:editor-chat-operation:' +
        JSON.stringify(['user', 'adventure', 'adventure', null, null]),
    );
    await reserveEditorChatOperation(row, () => undefined);
    mocks.call.mockResolvedValue({ data: await responseFor(request) });
    await expect(callEditorChat('user', request, { operation: row })).resolves.toMatchObject({
      current: { sceneId: null },
    });
    expect(mocks.call).toHaveBeenCalledOnce();
    expect(readEditorChatOperation('user', row)).toEqual(row);
  });
  it('binds a scene persona to the exact journal scene before calling Firebase', async () => {
    const initial = await requestFor('setAdventurePersonaBinding');
    const request = { ...initial, sceneId: 'scene-A', value: { personaComplement: null } };
    request.requestHash = await editorChatRequestHash(request);
    const row = rowFor(request);
    expect(row.resource).toEqual({ kind: 'scene', id: 'scene-A' });
    const wrong = { ...row, resource: { kind: 'scene' as const, id: 'scene-B' } };
    await reserveEditorChatOperation(wrong, () => undefined);
    await expect(callEditorChat('user', request, { operation: wrong })).rejects.toMatchObject({
      code: 'editor-chat/operation-changed',
    });
    expect(mocks.call).not.toHaveBeenCalled();
    expect(readEditorChatOperation('user', wrong)).toEqual(wrong);
    await reserveEditorChatOperation(row, () => undefined);
    mocks.call.mockResolvedValue({ data: await responseFor(request) });
    await expect(callEditorChat('user', request, { operation: row })).resolves.toMatchObject({
      current: { sceneId: 'scene-A' },
    });
  });
  it('requires a confirmed persisted journal before any mutation network call', async () => {
    const request = await requestFor('applySuggestion');
    await expect(callEditorChat('user', request)).rejects.toMatchObject({
      code: 'editor-chat/journal-required',
      uncertain: false,
    });
    await expect(
      callEditorChat('user', request, { operation: rowFor(request) }),
    ).rejects.toBeInstanceOf(EditorChatTransportError);
    expect(mocks.call).not.toHaveBeenCalled();
    expect(mocks.stream).not.toHaveBeenCalled();
  });
  it('does not send a fingerprint that differs from the frozen request', async () => {
    const original = await requestFor('applySuggestion');
    const request = { ...original, after: '<p>Different draft</p>' };
    const row = rowFor(request);
    await reserveEditorChatOperation(row, () => undefined);
    await expect(callEditorChat('user', request, { operation: row })).rejects.toMatchObject({
      code: 'editor-chat/fingerprint-mismatch',
      uncertain: false,
    });
    expect(mocks.call).not.toHaveBeenCalled();
  });
  it('resolves a durable cancel with the original action/hash and refuses to replay the mutation', async () => {
    const request = await requestFor('prepareContext');
    const initial = rowFor(request);
    await reserveEditorChatOperation(initial, () => undefined);
    const row = (await cancelEditorChatOperation(initial, () => undefined))!;
    mocks.call.mockResolvedValue({ data: { state: 'unknown', receipt: null } });
    await expect(callEditorChat('user', request, { operation: row })).rejects.toMatchObject({
      code: 'editor-chat/operation-changed',
    });
    expect(mocks.call).not.toHaveBeenCalled();
    expect(await resolveEditorChatOperation('user', row)).toEqual({
      state: 'unknown',
      receipt: null,
    });
    expect(mocks.call).toHaveBeenCalledWith({
      action: 'resolveOperation',
      operationId: row.operationId,
      operationAction: row.action,
      requestHash: row.requestHash,
      intent: 'cancel',
    });
    expect(readEditorChatOperation('user', scope)?.intent).toBe('cancel');
  });
  it('can observe a settled historical receipt without opening derived data', async () => {
    const request = await requestFor('prepareContext');
    const initial = rowFor(request);
    await reserveEditorChatOperation(initial, () => undefined);
    const row = { ...initial, state: 'settled' as const, localGeneration: 1 };
    await compareEditorChatOperation('user', scope, initial, row, () => undefined);
    const response = await responseFor(request);
    mocks.call.mockResolvedValue({ data: { state: 'settled', receipt: response.receipt } });
    expect(await resolveEditorChatOperation('user', row)).toEqual({
      state: 'settled',
      receipt: response.receipt,
    });
    expect(JSON.stringify(mocks.call.mock.calls)).not.toContain('Prosa própria');
  });
  it('does not render late data after UID A→B→A, even when the UID becomes equal again', async () => {
    const request = await requestFor('getTurn');
    const pending = deferred<{ data: unknown }>();
    mocks.call.mockReturnValue(pending.promise);
    const read = callEditorChat('user', request);
    switchUser({ uid: 'other' });
    switchUser({ uid: 'user' });
    pending.resolve({ data: await responseFor(request) });
    await expect(read).rejects.toMatchObject({
      code: 'editor-chat/identity-changed',
      uncertain: false,
    });
  });
  it('preserves a newer cancel row while a mutation response arrives late', async () => {
    const request = await requestFor('advanceContext');
    const initial = rowFor(request);
    await reserveEditorChatOperation(initial, () => undefined);
    const pending = deferred<{ data: unknown }>();
    mocks.call.mockReturnValue(pending.promise);
    const executing = callEditorChat('user', request, { operation: initial });
    await vi.waitFor(() => expect(mocks.call).toHaveBeenCalledOnce());
    const canceled = await cancelEditorChatOperation(initial, () => undefined);
    pending.resolve({ data: await responseFor(request) });
    await expect(executing).rejects.toBeInstanceOf(EditorChatTransportError);
    expect(readEditorChatOperation('user', scope)).toEqual(canceled);
  });
  it.each(['functions/permission-denied', 'functions/invalid-argument', 'functions/unavailable'])(
    'reports a neutral %s without clearing or echoing the journal',
    async (code) => {
      const request = await requestFor('deleteConversation');
      const row = rowFor(request);
      await reserveEditorChatOperation(row, () => undefined);
      mocks.call.mockRejectedValue({ code, message: 'private provider request and credentials' });
      const error = await callEditorChat('user', request, { operation: row }).catch(
        (cause: unknown) => cause,
      );
      expect(error).toBeInstanceOf(EditorChatTransportError);
      expect(error).toMatchObject({ uncertain: code === 'functions/unavailable' });
      expect((error as Error).message).not.toContain('credentials');
      expect(readEditorChatOperation('user', scope)).toEqual(row);
    },
  );
  it.each([
    ['functions/failed-precondition', 'context-stale'],
    ['functions/failed-precondition', 'identity-changed'],
    ['functions/failed-precondition', 'revision-conflict'],
    ['functions/failed-precondition', 'insufficient-credits'],
    ['functions/failed-precondition', 'provenance-revoked'],
    ['functions/permission-denied', 'app-check-required'],
  ])('preserves the validated %s/%s reason without echoing extra details', async (code, reason) => {
    const request = await requestFor('applySuggestion');
    const row = rowFor(request);
    await reserveEditorChatOperation(row, () => undefined);
    mocks.call.mockRejectedValue({
      code,
      details: { reason, key: 'private-secret' },
      message: 'private-secret',
    });
    const error: unknown = await callEditorChat('user', request, { operation: row }).catch(
      (cause: unknown) => cause,
    );
    expect(error).toMatchObject({ code, reason, uncertain: false });
    expect(JSON.stringify(error)).not.toContain('private-secret');
    expect(readEditorChatOperation('user', scope)).toEqual(row);
  });
  it.each([
    ['functions/failed-precondition', { reason: 'private-secret' }],
    ['functions/permission-denied', { reason: 'context-stale' }],
    ['functions/internal', { reason: 'context-stale' }],
    ['private-secret', { reason: 'context-stale' }],
    ['functions/unavailable', undefined],
    ['functions/unavailable', null],
    ['functions/unavailable', 'private-secret'],
    ['functions/unavailable', { reason: { key: 'private-secret' } }],
  ])('keeps unknown or inconsistent error details generic (%s)', async (code, details) => {
    const request = await requestFor('applySuggestion');
    const row = rowFor(request);
    await reserveEditorChatOperation(row, () => undefined);
    mocks.call.mockRejectedValue({ code, details, message: 'private-secret' });
    const error: unknown = await callEditorChat('user', request, { operation: row }).catch(
      (cause: unknown) => cause,
    );
    expect(error).toMatchObject({ reason: null });
    expect(JSON.stringify(error)).not.toContain('private-secret');
    expect(readEditorChatOperation('user', scope)).toEqual(row);
  });
  it('classifies a lost actor after mutation emission as uncertain and preserves its journal', async () => {
    const request = await requestFor('advanceContext');
    const row = rowFor(request);
    await reserveEditorChatOperation(row, () => undefined);
    const pending = deferred<{ data: unknown }>();
    mocks.call.mockReturnValue(pending.promise);
    const result = callEditorChat('user', request, { operation: row });
    await vi.waitFor(() => expect(mocks.call).toHaveBeenCalledOnce());
    switchUser({ uid: 'other' });
    pending.resolve({ data: await responseFor(request) });
    await expect(result).rejects.toMatchObject({
      code: 'editor-chat/identity-changed',
      uncertain: true,
    });
    expect(readEditorChatOperation('user', scope)).toEqual(row);
  });
  it('does not require a resolver when the host fails before the mutation is emitted', async () => {
    const request = await requestFor('applySuggestion');
    const row = rowFor(request);
    await reserveEditorChatOperation(row, () => undefined);
    await expect(
      callEditorChat('user', request, {
        operation: row,
        check: () => {
          throw new Error('stale host');
        },
      }),
    ).rejects.toMatchObject({ uncertain: false });
    expect(mocks.call).not.toHaveBeenCalled();
    expect(mocks.stream).not.toHaveBeenCalled();
    expect(readEditorChatOperation('user', scope)).toEqual(row);
  });
  it('rejects malformed replies and receipts belonging to a different operation', async () => {
    const request = await requestFor('advanceContext');
    const row = rowFor(request);
    await reserveEditorChatOperation(row, () => undefined);
    const response = await responseFor(request);
    mocks.call.mockResolvedValueOnce({ data: { ...response, secret: 'private' } });
    await expect(callEditorChat('user', request, { operation: row })).rejects.toMatchObject({
      uncertain: true,
    });
    mocks.call.mockResolvedValueOnce({
      data: { ...response, receipt: { ...response.receipt, requestHash: hash('9') } },
    });
    await expect(callEditorChat('user', request, { operation: row })).rejects.toMatchObject({
      uncertain: true,
    });
    expect(readEditorChatOperation('user', scope)).toEqual(row);
  });
  it('rejects scope, token and exact-revision mismatches before returning a body', async () => {
    const pageRequest = await requestFor('listConversations');
    const page = await responseFor(pageRequest);
    mocks.call.mockResolvedValueOnce({ data: { ...page, ownerId: 'other' } });
    await expect(callEditorChat('user', pageRequest)).rejects.toMatchObject({
      code: 'editor-chat/invalid-response',
      uncertain: false,
    });
    const inspect = await requestFor('inspectContext');
    const response = await responseFor(inspect);
    mocks.call.mockResolvedValueOnce({
      data: { ...response, context: { ...response.context, revision: 2 } },
    });
    await expect(callEditorChat('user', inspect)).rejects.toMatchObject({
      code: 'editor-chat/invalid-response',
      uncertain: false,
    });
  });
  it('rejects a receipt for another context even when the current projection is absent', async () => {
    const request = await requestFor('advanceContext');
    const row = rowFor(request);
    await reserveEditorChatOperation(row, () => undefined);
    const response = await responseFor(request);
    mocks.call.mockResolvedValue({
      data: {
        receipt: {
          ...response.receipt,
          result: {
            kind: 'context',
            contextId: 'other',
            contextToken: hash('0'),
            revision: 1,
            phase: 'ready',
          },
        },
        current: null,
      },
    });
    await expect(callEditorChat('user', request, { operation: row })).rejects.toBeInstanceOf(
      EditorChatTransportError,
    );
    expect(readEditorChatOperation('user', scope)).toEqual(row);
  });
  it('drops a pending read after auth observation fails or an external signal aborts', async () => {
    const request = await requestFor('getTurn');
    const pending = deferred<{ data: unknown }>();
    mocks.call.mockReturnValueOnce(pending.promise);
    const read = callEditorChat('user', request);
    for (const callback of mocks.errors) callback();
    pending.resolve({ data: await responseFor(request) });
    await expect(read).rejects.toBeInstanceOf(EditorChatTransportError);
    const second = deferred<{ data: unknown }>();
    mocks.call.mockReturnValueOnce(second.promise);
    const abort = new AbortController();
    const another = callEditorChat('user', request, { signal: abort.signal });
    abort.abort();
    second.resolve({ data: await responseFor(request) });
    await expect(another).rejects.toBeInstanceOf(EditorChatTransportError);
  });
  it('does not leak the auth observer when journal validation fails', async () => {
    const request = await requestFor('send');
    await expect(
      callEditorChat('user', request, {
        operation: { ...rowFor(request), prompt: 'private' } as unknown as EditorChatOperationRow,
      }),
    ).rejects.toThrow();
    expect(mocks.call).not.toHaveBeenCalled();
  });
  it('keeps BYOK input ephemeral and performs no provider call', async () => {
    const request = await requestFor('getByokInput');
    const frozen = await frozenFixture();
    const turn = turnFixture({
      provider: 'byok',
      generation: resolveChatGeneration(byokGeneration),
      state: 'awaiting-byok',
      suggestionAvailable: false,
      contextHash: frozen.contextHash,
      closureHash: frozen.closure.closureHash,
    });
    const input = {
      turnId: turn.turnId,
      attemptToken: turn.attemptToken,
      generation: turn.generation,
      systemInstruction: 'Private instruction',
      prompt: 'Own question',
      context: frozen,
      history: [],
      closureHash: turn.closureHash,
    };
    const fetch = vi.spyOn(globalThis, 'fetch');
    mocks.call.mockResolvedValue({ data: { turn, input } });
    expect(await callEditorChat('user', request)).toEqual({ turn, input });
    expect(fetch).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
  });
  it('rejects unauthenticated or already-aborted requests without calling Firebase', async () => {
    const request = await requestFor('listConversations');
    mocks.user = null;
    await expect(callEditorChat('user', request)).rejects.toMatchObject({
      code: 'editor-chat/identity-changed',
      uncertain: false,
    });
    mocks.user = { uid: 'user' };
    await expect(
      callEditorChat('user', request, { signal: AbortSignal.abort() }),
    ).rejects.toThrow();
    expect(mocks.callable).not.toHaveBeenCalled();
  });
});

describe('editorChat stream', () => {
  async function setup() {
    const request = await requestFor('send');
    const row = rowFor(request);
    await reserveEditorChatOperation(row, () => undefined);
    const result = await responseFor(request);
    const running = turnFixture({
      turnId: request.operationId,
      state: 'running',
      suggestionAvailable: false,
    });
    return { request, row, result, running };
  }
  it('delivers only ordered validated events for the captured attempt', async () => {
    const { request, row, result, running } = await setup();
    const events = [
      { type: 'started', turn: running },
      {
        type: 'delta',
        turnId: running.turnId,
        attemptToken: running.attemptToken,
        index: 0,
        text: 'Answer',
      },
      { type: 'settled', turn: result.turn },
    ];
    mocks.stream.mockResolvedValue(streamed(result, events));
    const onEvent = vi.fn<(event: EditorChatStreamEvent) => void>();
    expect(await callEditorChat('user', request, { operation: row, onEvent })).toEqual(result);
    expect(onEvent.mock.calls.map((call) => call[0])).toEqual(events);
    expect(localStorage.getItem(editorChatOperationKey('user', scope))).not.toContain('Answer');
  });
  it.each(['gap', 'wrong-attempt', 'after-settled', 'extra-field'])(
    'rejects an invalid %s event without forwarding it to the UI',
    async (variant) => {
      const { request, row, result, running } = await setup();
      const delta = {
        type: 'delta',
        turnId: running.turnId,
        attemptToken: running.attemptToken,
        index: 0,
        text: 'private',
      };
      const bad =
        variant === 'gap'
          ? { ...delta, index: 1 }
          : variant === 'wrong-attempt'
            ? { ...delta, attemptToken: hash('0') }
            : variant === 'extra-field'
              ? { ...delta, thought: 'private' }
              : delta;
      const events = [
        { type: 'started', turn: running },
        ...(variant === 'after-settled' ? [{ type: 'settled', turn: result.turn }] : []),
        bad,
      ];
      mocks.stream.mockResolvedValue(streamed(result, events));
      const onEvent = vi.fn<(event: EditorChatStreamEvent) => void>();
      await expect(
        callEditorChat('user', request, { operation: row, onEvent }),
      ).rejects.toBeInstanceOf(EditorChatTransportError);
      expect(onEvent.mock.calls.some((call) => call[0].type === 'delta')).toBe(false);
      expect(readEditorChatOperation('user', scope)).toEqual(row);
    },
  );
  it('fences the stream after an account or host context change', async () => {
    const { request, row, result, running } = await setup();
    mocks.stream.mockResolvedValue(
      streamed(result, [
        { type: 'started', turn: running },
        {
          type: 'delta',
          turnId: running.turnId,
          attemptToken: running.attemptToken,
          index: 0,
          text: 'Hidden',
        },
      ]),
    );
    const onEvent = vi.fn(() => switchUser({ uid: 'other' }));
    await expect(
      callEditorChat('user', request, { operation: row, onEvent }),
    ).rejects.toBeInstanceOf(EditorChatTransportError);
    expect(onEvent).toHaveBeenCalledOnce();
    expect(readEditorChatOperation('user', scope)).toEqual(row);
  });
  it('rejects a return that changes the frozen requested generation', async () => {
    const { request, row, result } = await setup();
    const changed = {
      ...result,
      turn: {
        ...result.turn!,
        generation: resolveChatGeneration({ ...request.generation, reasoning: 'high' }),
      },
    };
    mocks.stream.mockResolvedValue(streamed(changed));
    await expect(callEditorChat('user', request, { operation: row })).rejects.toMatchObject({
      code: 'editor-chat/invalid-response',
    });
    expect(readEditorChatOperation('user', scope)).toEqual(row);
  });
  it('does not deliver later chunks after the host invalidates its captured context', async () => {
    const { request, row, result, running } = await setup();
    mocks.stream.mockResolvedValue(
      streamed(result, [
        { type: 'started', turn: running },
        {
          type: 'delta',
          turnId: running.turnId,
          attemptToken: running.attemptToken,
          index: 0,
          text: 'Hidden',
        },
      ]),
    );
    let active = true;
    const onEvent = vi.fn(() => {
      active = false;
    });
    await expect(
      callEditorChat('user', request, {
        operation: row,
        onEvent,
        check: () => {
          if (!active) throw new Error('changed context');
        },
      }),
    ).rejects.toBeInstanceOf(EditorChatTransportError);
    expect(onEvent).toHaveBeenCalledOnce();
    expect(readEditorChatOperation('user', scope)).toEqual(row);
  });
  it('accepts a canceled receipt with no current projection or stream', async () => {
    const { request, row, result } = await setup();
    const canceled = {
      receipt: { ...result.receipt, outcome: 'canceled', result: { kind: 'fence' } },
      turn: null,
      delivery: null,
      byokInput: null,
    };
    mocks.stream.mockResolvedValue(streamed(canceled));
    expect(await callEditorChat('user', request, { operation: row })).toEqual(canceled);
  });
});
