import { webcrypto } from 'node:crypto';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { createEditorChatOperationSession } from '../services/editorChatOperationSession';
import {
  readEditorChatOperation,
  editorChatOperationKey,
  reserveEditorChatOperation,
} from '../services/editorChatOperationStorage';
import * as transport from '../services/editorChatService';
import {
  requestFor,
  responseFor,
  rowFor,
  scope,
  hash,
  receiptFixture,
} from './editorChatTestFixtures';
import type {
  EditorChatMutationAction,
  EditorChatRequest,
  EditorChatReceipt,
} from '../model/editorChat';
vi.mock('../services/editorChatService', async () => {
  const actual = await vi.importActual<typeof transport>('../services/editorChatService');
  return { ...actual, callEditorChat: vi.fn(), resolveEditorChatOperation: vi.fn() };
});
let locked = false;
beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto);
  localStorage.clear();
  vi.clearAllMocks();
  let tail: Promise<unknown> = Promise.resolve();
  vi.stubGlobal('navigator', {
    locks: {
      request: vi.fn((_key: string, callback: () => unknown) => {
        const run = tail.then(() => {
          locked = true;
          try {
            const result = callback();
            expect(result).not.toBeInstanceOf(Promise);
            return result;
          } finally {
            locked = false;
          }
        });
        tail = run.catch(() => undefined);
        return run;
      }),
    },
  });
  vi.mocked(transport.callEditorChat).mockImplementation(async (_uid, request, options) => {
    expect(locked).toBe(false);
    expect(readEditorChatOperation('user', scope)).toEqual(options?.operation);
    const response = await responseFor(request);
    if ('receipt' in response && response.receipt)
      response.receipt.operationId = 'operationId' in request ? request.operationId : 'operation';
    return response;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const check = () => undefined;
const session = () => createEditorChatOperationSession({ uid: 'user', scope, check });
async function fields<A extends EditorChatMutationAction>(
  action: A,
): Promise<Omit<EditorChatRequest<A>, 'action' | 'requestHash'>> {
  const value = (await requestFor(action)) as EditorChatRequest;
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== 'action' && key !== 'requestHash'),
  ) as Omit<EditorChatRequest<A>, 'action' | 'requestHash'>;
}

describe('editor chat operation session', () => {
  it.each(['prepareContext', 'createConversation', 'send'] as const)(
    'hydrates binding-only controls for explicit %s without crossing conversation/turn identities',
    async (action) => {
      const { compareEditorChatOperation } = await import('../services/editorChatOperationStorage');
      const original = {
        ...rowFor(await requestFor('setAdventurePersonaBinding')),
        resource: { kind: 'scene' as const, id: 'scene' },
        conversationId: 'conversation',
        conversationToken: hash('4'),
        turnId: 'old-turn',
        attemptToken: hash('e'),
      };
      await reserveEditorChatOperation(original, check);
      const settled = { ...original, state: 'settled' as const, localGeneration: 1 };
      await compareEditorChatOperation('user', original, original, settled, check);
      const current = createEditorChatOperationSession({
        uid: 'user',
        scope: original,
        check,
        controls: () => ({
          projectToken: hash('1'),
          resourceToken: hash('2'),
          conversationId: settled.conversationId,
          conversationToken: settled.conversationToken,
          turnId: settled.turnId,
          attemptToken: settled.attemptToken,
        }),
      });
      let sent: typeof settled | null = null;
      vi.mocked(transport.callEditorChat).mockImplementationOnce((_uid, request, options) => {
        if (!('requestHash' in request)) throw new Error('Expected mutation');
        sent = options!.operation! as typeof settled;
        expect(locked).toBe(false);
        return Promise.resolve({
          receipt: {
            schemaVersion: 1,
            action,
            operationId: 'next-operation',
            requestHash: request.requestHash,
            outcome: 'canceled',
            confirmedAt: 2,
            result: { kind: 'fence' },
          },
          current: null,
          turn: null,
          delivery: null,
          byokInput: null,
        });
      });
      const input = {
        ...(await fields(action)),
        target: original.target,
        resource: original.resource,
        operationId: 'next-operation',
        ...(action === 'prepareContext' ? { contextId: 'next-operation' } : {}),
        ...(action === 'createConversation' ? { conversationId: 'new-conversation' } : {}),
      };
      await current.execute(action, input);
      expect(sent).toMatchObject({ projectToken: hash('1'), resourceToken: hash('2') });
      if (action === 'createConversation')
        expect(sent).toMatchObject({
          conversationId: 'new-conversation',
          conversationToken: null,
          turnId: null,
          attemptToken: null,
        });
      else if (action === 'send')
        expect(sent).toMatchObject({
          conversationId: 'conversation',
          conversationToken: hash('4'),
          turnId: 'next-operation',
          attemptToken: null,
        });
      else
        expect(sent).toMatchObject({
          conversationId: 'conversation',
          turnId: 'old-turn',
          attemptToken: hash('e'),
        });
    },
  );
  it('permits only exact known conversation deletion with null grants after a binding setter', async () => {
    const { compareEditorChatOperation } = await import('../services/editorChatOperationStorage');
    const row = {
      ...rowFor(await requestFor('setAdventurePersonaBinding')),
      resource: { kind: 'scene' as const, id: 'scene' },
      conversationId: 'conversation',
      conversationToken: hash('4'),
      turnId: 'old-turn',
      attemptToken: hash('e'),
    };
    await reserveEditorChatOperation(row, check);
    await compareEditorChatOperation(
      'user',
      row,
      row,
      { ...row, state: 'settled', localGeneration: 1 },
      check,
    );
    const current = createEditorChatOperationSession({
      uid: 'user',
      scope: row,
      check,
      controls: () => ({
        projectToken: null,
        resourceToken: null,
        conversationId: row.conversationId,
        conversationToken: row.conversationToken,
        turnId: row.turnId,
        attemptToken: row.attemptToken,
      }),
    });
    vi.mocked(transport.callEditorChat).mockImplementationOnce(async (_uid, request, options) => {
      expect(options?.operation).toMatchObject({
        projectToken: null,
        resourceToken: null,
        conversationId: row.conversationId,
        turnId: row.turnId,
      });
      const response = await responseFor(request);
      if ('receipt' in response && response.receipt)
        response.receipt.operationId = 'delete-known-conversation';
      return response;
    });
    await current.execute('deleteConversation', {
      ...(await fields('deleteConversation')),
      operationId: 'delete-known-conversation',
      target: row.target,
      resource: row.resource,
    });
  });
  it('rejects binding hydration that changes project birth or drops persistent controls', async () => {
    const { compareEditorChatOperation } = await import('../services/editorChatOperationStorage');
    const row = {
      ...rowFor(await requestFor('setAdventurePersonaBinding')),
      resource: { kind: 'scene' as const, id: 'scene' },
      conversationId: 'conversation',
      conversationToken: hash('4'),
    };
    await reserveEditorChatOperation(row, check);
    await compareEditorChatOperation(
      'user',
      row,
      row,
      { ...row, state: 'settled', localGeneration: 1 },
      check,
    );
    for (const controls of [
      { projectToken: hash('9'), resourceToken: hash('2') },
      {
        projectToken: hash('1'),
        resourceToken: hash('2'),
        conversationId: null,
        conversationToken: null,
      },
      { projectToken: null, resourceToken: null },
    ]) {
      const current = createEditorChatOperationSession({
        uid: 'user',
        scope: row,
        check,
        controls: () => controls,
      });
      await expect(
        current.execute('prepareContext', {
          ...(await fields('prepareContext')),
          target: row.target,
          resource: row.resource,
        }),
      ).rejects.toMatchObject({ reason: 'conflict' });
    }
    expect(transport.callEditorChat).not.toHaveBeenCalled();
  });
  it('rejects a repeated binding setter that drops persistent controls without deletion proof', async () => {
    const { compareEditorChatOperation } = await import('../services/editorChatOperationStorage');
    const original = {
      ...rowFor(await requestFor('setAdventurePersonaBinding')),
      resource: { kind: 'scene' as const, id: 'scene' },
      conversationId: 'conversation',
      conversationToken: hash('4'),
      turnId: 'old-turn',
      attemptToken: hash('e'),
    };
    await reserveEditorChatOperation(original, check);
    const settled = { ...original, state: 'settled' as const, localGeneration: 1 };
    await compareEditorChatOperation('user', original, original, settled, check);
    const current = createEditorChatOperationSession({
      uid: 'user',
      scope: original,
      check,
      controls: () => ({
        projectToken: original.projectToken,
        resourceToken: null,
        conversationId: null,
        conversationToken: null,
        turnId: null,
        attemptToken: null,
      }),
    });
    await expect(
      current.execute('setAdventurePersonaBinding', {
        ...(await fields('setAdventurePersonaBinding')),
        operationId: 'repeated-binding',
        sceneId: 'scene',
        value: { personaComplement: null },
      }),
    ).rejects.toMatchObject({ reason: 'conflict' });
    expect(current.read()).toEqual(settled);
    expect(transport.callEditorChat).not.toHaveBeenCalled();
  });
  it('journals an adventure root persona setter without inventing a scene or resource token', async () => {
    const rootScope = { target: { kind: 'adventure' as const, id: 'adventure' }, resource: null };
    const current = createEditorChatOperationSession({
      uid: 'user',
      scope: rootScope,
      check,
      controls: () => ({ projectToken: hash('1'), resourceToken: null }),
    });
    vi.mocked(transport.callEditorChat).mockImplementationOnce(async (_uid, request, options) => {
      expect(locked).toBe(false);
      expect(readEditorChatOperation('user', rootScope)).toEqual(options?.operation);
      return responseFor(request);
    });
    await current.execute('setAdventurePersonaBinding', await fields('setAdventurePersonaBinding'));
    expect(current.read()).toMatchObject({
      target: rootScope.target,
      resource: null,
      resourceToken: null,
      projectToken: hash('1'),
      action: 'setAdventurePersonaBinding',
      state: 'settled',
    });
    const raw = localStorage.getItem(editorChatOperationKey('user', rootScope))!;
    expect(raw).not.toContain('preset-epic');
    expect(raw).not.toContain('expectedBindingToken');
  });
  it('seals only metadata before RPC and retains the settled context for reload', async () => {
    const service = session();
    await service.execute('prepareContext', await fields('prepareContext'));
    expect(service.read()).toMatchObject({
      state: 'settled',
      contextId: 'operation',
      contextToken: hash('3'),
      localGeneration: 1,
    });
    expect(
      JSON.parse(localStorage.getItem(editorChatOperationKey('user', scope))!),
    ).not.toHaveProperty('capture');
    const reloaded = session();
    expect(reloaded.read()).toEqual(service.read());
  });
  it('hands off a settled row atomically while preserving known control pointers', async () => {
    const service = session();
    await service.execute('prepareContext', await fields('prepareContext'));
    const remove = vi.spyOn(Storage.prototype, 'removeItem');
    const next = await fields('createConversation');
    next.operationId = 'next-operation';
    await service.execute('createConversation', next);
    expect(remove).not.toHaveBeenCalled();
    expect(service.read()).toMatchObject({
      action: 'createConversation',
      contextId: 'operation',
      contextToken: hash('3'),
      state: 'settled',
    });
  });
  it('does not emit a mutation if reservation/locks fail', async () => {
    vi.stubGlobal('navigator', {});
    await expect(
      session().execute('prepareContext', await fields('prepareContext')),
    ).rejects.toMatchObject({ reason: 'locks-unavailable' });
    expect(transport.callEditorChat).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
  });
  it('does not emit after a failed handoff or overwrite its settled snapshot', async () => {
    const service = session();
    await service.execute('prepareContext', await fields('prepareContext'));
    const before = service.read();
    vi.mocked(transport.callEditorChat).mockClear();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new Error('quota');
    });
    const next = await fields('createConversation');
    next.operationId = 'new-operation';
    await expect(service.execute('createConversation', next)).rejects.toThrow();
    expect(transport.callEditorChat).not.toHaveBeenCalled();
    expect(service.read()).toEqual(before);
  });
  it('keeps an uncertain original without storing or resending its question', async () => {
    const service = session();
    vi.mocked(transport.callEditorChat).mockRejectedValueOnce(
      new transport.EditorChatTransportError('functions/unavailable', true),
    );
    await expect(service.execute('send', await fields('send'))).rejects.toMatchObject({
      uncertain: true,
    });
    const pending = service.read();
    expect(pending).toMatchObject({ state: 'uncertain', turnId: 'operation' });
    expect(localStorage.getItem(editorChatOperationKey('user', scope))).not.toContain('Ideias');
    await expect(service.execute('send', await fields('send'))).rejects.toMatchObject({
      reason: 'conflict',
    });
    expect(transport.callEditorChat).toHaveBeenCalledTimes(1);
  });
  it.each(['unknown', 'pending'] as const)(
    'observes %s without fabricating a receipt or replaying the original',
    async (state) => {
      const original = rowFor(await requestFor('prepareContext'));
      await reserveEditorChatOperation(original, check);
      vi.mocked(transport.resolveEditorChatOperation).mockResolvedValue({ state, receipt: null });
      expect(await session().recover('observe')).toEqual({ state, receipt: null });
      expect(session().read()).toEqual(original);
      expect(transport.callEditorChat).not.toHaveBeenCalled();
    },
  );
  it('persists cancel before resolver and keeps the original fingerprint after reload', async () => {
    const original = rowFor(await requestFor('prepareContext'));
    await reserveEditorChatOperation(original, check);
    vi.mocked(transport.resolveEditorChatOperation).mockImplementation((_uid, pending) => {
      expect(pending.intent).toBe('cancel');
      expect(readEditorChatOperation('user', scope)).toEqual(pending);
      expect(pending.requestHash).toBe(original.requestHash);
      return Promise.resolve({ state: 'pending', receipt: null });
    });
    await session().recover('cancel');
    await session().recover('observe');
    expect(session().read()).toMatchObject({ intent: 'cancel', requestHash: original.requestHash });
    expect(transport.callEditorChat).not.toHaveBeenCalled();
  });
  it.each(['confirmed', 'canceled'] as const)(
    'settles a metadata-only %s recovery without needing the original capture',
    async (outcome) => {
      const original = rowFor(await requestFor('prepareContext'));
      await reserveEditorChatOperation(original, check);
      const receipt: EditorChatReceipt =
        outcome === 'canceled'
          ? {
              ...receiptFixture('prepareContext', original.requestHash, { kind: 'fence' }),
              outcome,
            }
          : receiptFixture('prepareContext', original.requestHash, {
              kind: 'context',
              contextId: 'operation',
              contextToken: hash('3'),
              revision: 6,
              phase: 'ready',
            });
      vi.mocked(transport.resolveEditorChatOperation).mockResolvedValue({
        state: 'settled',
        receipt,
      });
      await session().recover('observe');
      expect(session().read()?.state).toBe('settled');
      if (outcome === 'confirmed') expect(session().read()?.contextToken).toBe(hash('3'));
      expect(transport.callEditorChat).not.toHaveBeenCalled();
    },
  );
  it('rejects a changed incarnation while old control pointers remain', async () => {
    const original = rowFor(await requestFor('advanceContext'));
    original.state = 'settled';
    await reserveEditorChatOperation({ ...original, state: 'pending' }, check);
    const raw = readEditorChatOperation('user', scope)!;
    const { compareEditorChatOperation } = await import('../services/editorChatOperationStorage');
    await compareEditorChatOperation(
      'user',
      scope,
      raw,
      { ...raw, state: 'settled', localGeneration: 1 },
      check,
    );
    const service = createEditorChatOperationSession({
      uid: 'user',
      scope,
      check,
      controls: () => ({ projectToken: hash('9'), resourceToken: hash('8') }),
    });
    await expect(
      service.execute('createConversation', {
        ...(await fields('createConversation')),
        operationId: 'new-operation',
        projectToken: hash('9'),
        resourceToken: hash('8'),
      }),
    ).rejects.toMatchObject({ reason: 'conflict' });
    expect(transport.callEditorChat).not.toHaveBeenCalled();
  });
  it('does not settle or erase metadata when the owner changes after RPC', async () => {
    let valid = true;
    const service = createEditorChatOperationSession({
      uid: 'user',
      scope,
      check: () => {
        if (!valid) throw new Error('owner changed');
      },
    });
    vi.mocked(transport.callEditorChat).mockImplementationOnce(async (_uid, request) => {
      const result = await responseFor(request);
      valid = false;
      return result;
    });
    await expect(service.execute('prepareContext', await fields('prepareContext'))).rejects.toThrow(
      'owner changed',
    );
    expect(readEditorChatOperation('user', scope)?.state).toBe('pending');
  });
  it('fences a result if another tab changes the complete journal row', async () => {
    const { compareEditorChatOperation } = await import('../services/editorChatOperationStorage');
    vi.mocked(transport.callEditorChat).mockImplementationOnce(async (_uid, request, options) => {
      const pending = options!.operation!;
      await compareEditorChatOperation(
        'user',
        scope,
        pending,
        { ...pending, intent: 'cancel', localGeneration: 1 },
        check,
      );
      return responseFor(request);
    });
    await expect(
      session().execute('prepareContext', await fields('prepareContext')),
    ).rejects.toMatchObject({ reason: 'conflict' });
    expect(session().read()).toMatchObject({
      intent: 'cancel',
      state: 'pending',
      localGeneration: 1,
    });
  });
});

it('validates effective request tokens before handing off old control pointers', async () => {
  const service = session();
  await service.execute('prepareContext', await fields('prepareContext'));
  const original = service.read();
  // Seed known old incarnation metadata through an ordinary context mutation.
  const request = await fields('createConversation');
  await service.execute('createConversation', { ...request, operationId: 'known-operation' });
  const before = service.read();
  vi.mocked(transport.callEditorChat).mockClear();
  await expect(
    service.execute('createConversation', {
      ...request,
      operationId: 'different-operation',
      projectToken: hash('9'),
      resourceToken: hash('8'),
    }),
  ).rejects.toMatchObject({ reason: 'conflict' });
  expect(service.read()).toEqual(before);
  expect(transport.callEditorChat).not.toHaveBeenCalled();
  expect(original?.contextId).toBe('operation');
});
