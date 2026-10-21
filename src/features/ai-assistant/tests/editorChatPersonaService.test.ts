import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAdventurePersonaService } from '../services/editorChatPersonaService';
import * as transport from '../services/editorChatService';
import {
  editorChatOperationKey,
  readEditorChatOperation,
} from '../services/editorChatOperationStorage';
import {
  hash,
  receiptFixture,
  contextFixture,
  rowFor,
  requestFor,
  responseFor,
} from './editorChatTestFixtures';
import type {
  EditorChatPersonaBinding,
  EditorChatRequest,
  EditorChatJournalScope,
  EditorChatOperationRow,
} from '../model/editorChat';

const mocks = vi.hoisted(() => ({
  user: ((): { uid: string } | null => ({ uid: 'user' }))(),
  listeners: new Set<(user: { uid: string } | null) => void>(),
}));
vi.mock('@/shared/lib', () => ({
  auth: {
    get currentUser() {
      return mocks.user;
    },
  },
}));
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_auth: unknown, listener: (u: { uid: string } | null) => void) => {
    mocks.listeners.add(listener);
    return () => mocks.listeners.delete(listener);
  },
}));
vi.mock('../services/editorChatService', async () => {
  const actual = await vi.importActual<typeof transport>('../services/editorChatService');
  return { ...actual, callEditorChat: vi.fn(), resolveEditorChatOperation: vi.fn() };
});
const rootScope: EditorChatJournalScope = {
  target: { kind: 'adventure', id: 'adventure' },
  resource: null,
};
const sceneScope: EditorChatJournalScope = {
  ...rootScope,
  resource: { kind: 'scene', id: 'scene' },
};
const binding = (sceneId: string | null = null, revision = 1): EditorChatPersonaBinding => ({
  schemaVersion: 1,
  ownerId: 'user',
  adventureId: 'adventure',
  adventureToken: hash('1'),
  sceneId,
  sceneToken: sceneId === null ? null : hash('d'),
  personaRevision: revision,
  bindingToken: hash(revision === 1 ? '7' : '8'),
  value: sceneId === null ? { personaId: 'preset-atmospheric' } : { personaComplement: null },
  updatedAt: revision,
});
function reply(request: EditorChatRequest<'setAdventurePersonaBinding'>) {
  const current = { ...binding(request.sceneId, 2), value: request.value };
  return {
    current,
    receipt: {
      ...receiptFixture('setAdventurePersonaBinding', request.requestHash, {
        kind: 'persona-binding',
        adventureId: current.adventureId,
        adventureToken: current.adventureToken,
        sceneId: current.sceneId,
        sceneToken: current.sceneToken,
        personaRevision: current.personaRevision,
        bindingToken: current.bindingToken,
      }),
      operationId: request.operationId,
    },
  };
}
const instances: ReturnType<typeof createAdventurePersonaService>[] = [];
function service(sceneId: string | null = null) {
  const instance = createAdventurePersonaService({
    uid: 'user',
    adventureId: 'adventure',
    sceneId,
  });
  instances.push(instance);
  return instance;
}
const switchUser = (user: { uid: string } | null) => {
  mocks.user = user;
  for (const listener of mocks.listeners) listener(user);
};
async function seedSettled(row: EditorChatOperationRow) {
  const { reserveEditorChatOperation, compareEditorChatOperation } =
    await import('../services/editorChatOperationStorage');
  await reserveEditorChatOperation(row, () => undefined);
  await compareEditorChatOperation(
    'user',
    row,
    row,
    { ...row, state: 'settled', localGeneration: 1 },
    () => undefined,
  );
}
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  vi.stubGlobal('crypto', webcrypto);
  mocks.user = { uid: 'user' };
  mocks.listeners.clear();
  vi.stubGlobal('navigator', {
    locks: { request: (_key: string, work: () => unknown) => Promise.resolve(work()) },
  });
  vi.mocked(transport.callEditorChat).mockImplementation((_uid, request, options) => {
    options?.check?.();
    if (request.action === 'getAdventurePersonaBinding')
      return Promise.resolve(binding(request.sceneId));
    if (request.action === 'setAdventurePersonaBinding') return Promise.resolve(reply(request));
    throw new Error('Ação inesperada');
  });
});
afterEach(() => {
  for (const instance of instances.splice(0)) instance.dispose();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('adventure persona service', () => {
  it('a deleted context cleanup never authorizes discarding conversation or historical turn controls', async () => {
    const row = {
      ...rowFor(await requestFor('advanceCleanup')),
      ...sceneScope,
      conversationId: 'conversation',
      conversationToken: hash('4'),
      turnId: 'old-turn',
      attemptToken: hash('e'),
    };
    await seedSettled(row);
    const instance = service('scene');
    await instance.load();
    const cleanup = await responseFor(await requestFor('getCleanup'));
    vi.mocked(transport.callEditorChat)
      .mockResolvedValueOnce({
        ...cleanup,
        state: 'deleted',
        phase: 'complete',
        subject: { kind: 'context', id: 'other-context', token: hash('3') },
      })
      .mockResolvedValueOnce(await responseFor(await requestFor('listMessages')));
    await instance.save({ personaComplement: null });
    expect(readEditorChatOperation('user', sceneScope)).toMatchObject({
      cleanupId: null,
      conversationId: row.conversationId,
      conversationToken: row.conversationToken,
      turnId: row.turnId,
      attemptToken: row.attemptToken,
      resourceToken: null,
    });
  });
  it('compares the complete proved row again after request hashing before it can reserve a setter', async () => {
    const { compareEditorChatOperation } = await import('../services/editorChatOperationStorage');
    const row = {
      ...rowFor(await requestFor('prepareContext')),
      ...sceneScope,
      contextToken: hash('3'),
    };
    await seedSettled(row);
    const instance = service('scene');
    await instance.load();
    const original = readEditorChatOperation('user', sceneScope)!;
    vi.mocked(transport.callEditorChat).mockResolvedValueOnce(
      contextFixture({
        target: sceneScope.target,
        resource: { kind: 'scene', id: 'scene' },
        contextId: row.contextId!,
        contextToken: row.contextToken,
        phase: 'consumed',
        turnId: 'turn',
      }),
    );
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(async (...args) => {
      await compareEditorChatOperation(
        'user',
        sceneScope,
        original,
        { ...original, localGeneration: 2 },
        () => undefined,
      );
      return digest(...args);
    });
    await expect(instance.save({ personaComplement: null })).rejects.toMatchObject({
      reason: 'conflict',
    });
    expect(readEditorChatOperation('user', sceneScope)).toEqual({
      ...original,
      localGeneration: 2,
    });
    expect(
      vi
        .mocked(transport.callEditorChat)
        .mock.calls.some((call) => call[1].action === 'setAdventurePersonaBinding'),
    ).toBe(false);
  });
  it.each(['context', 'conversation'] as const)(
    'releases only the exact %s proven deleted by a completed cleanup',
    async (kind) => {
      const row = {
        ...rowFor(await requestFor('advanceCleanup')),
        ...sceneScope,
        contextId: kind === 'context' ? 'context' : null,
        contextToken: kind === 'context' ? hash('3') : null,
        conversationId: kind === 'conversation' ? 'conversation' : null,
        conversationToken: kind === 'conversation' ? hash('4') : null,
        turnId: kind === 'conversation' ? 'old-turn' : null,
        attemptToken: kind === 'conversation' ? hash('e') : null,
      };
      await seedSettled(row);
      const instance = service('scene');
      await instance.load();
      const initial = await responseFor(await requestFor('getCleanup'));
      vi.mocked(transport.callEditorChat).mockResolvedValueOnce({
        ...initial,
        state: 'deleted',
        phase: 'complete',
        subject: {
          kind,
          id: kind === 'context' ? 'context' : 'conversation',
          token: kind === 'context' ? hash('3') : hash('4'),
        },
      });
      await instance.save({ personaComplement: null });
      expect(readEditorChatOperation('user', sceneScope)).toMatchObject({
        action: 'setAdventurePersonaBinding',
        resourceToken: null,
        contextId: null,
        cleanupId: null,
        conversationId: null,
        turnId: null,
      });
      expect(
        vi
          .mocked(transport.callEditorChat)
          .mock.calls.some((call) =>
            ['getTurn', 'listMessages', 'getContext'].includes(call[1].action),
          ),
      ).toBe(false);
    },
  );
  it('does not treat canceled cleanup intent as proof that an existing context was deleted', async () => {
    const row = {
      ...rowFor(await requestFor('deleteContext')),
      ...sceneScope,
      contextId: 'context',
      contextToken: hash('3'),
      cleanupId: 'operation',
      cleanupToken: null,
    };
    await seedSettled(row);
    const instance = service('scene');
    await instance.load();
    const original = readEditorChatOperation('user', sceneScope)!;
    vi.mocked(transport.resolveEditorChatOperation).mockResolvedValueOnce({
      state: 'settled',
      receipt: {
        ...receiptFixture('deleteContext', row.requestHash, { kind: 'fence' }),
        outcome: 'canceled',
      },
    });
    vi.mocked(transport.callEditorChat).mockResolvedValueOnce(
      contextFixture({
        target: sceneScope.target,
        resource: { kind: 'scene', id: 'scene' },
        contextId: 'context',
        contextToken: hash('3'),
        phase: 'ready',
      }),
    );
    await expect(instance.save({ personaComplement: null })).rejects.toThrow('Consuma ou exclua');
    expect(readEditorChatOperation('user', sceneScope)).toEqual(original);
  });
  it('releases only a proven consumed context without inheriting textual grants into the persona setter', async () => {
    const { rowFor, requestFor } = await import('./editorChatTestFixtures');
    const { reserveEditorChatOperation, compareEditorChatOperation } =
      await import('../services/editorChatOperationStorage');
    const old: EditorChatOperationRow = {
      ...rowFor(await requestFor('prepareContext')),
      target: sceneScope.target,
      resource: sceneScope.resource,
      contextToken: hash('3'),
    };
    await reserveEditorChatOperation(old, () => undefined);
    await compareEditorChatOperation(
      'user',
      sceneScope,
      old,
      { ...old, state: 'settled', localGeneration: 1 },
      () => undefined,
    );
    const instance = service('scene');
    await instance.load();
    vi.mocked(transport.callEditorChat).mockResolvedValueOnce(
      contextFixture({
        ...sceneScope,
        resource: { kind: 'scene', id: 'scene' },
        contextId: old.contextId!,
        contextToken: old.contextToken!,
        phase: 'consumed',
        turnId: 'turn',
      }),
    );
    await instance.save({ personaComplement: null });
    expect(readEditorChatOperation('user', sceneScope)).toMatchObject({
      action: 'setAdventurePersonaBinding',
      resourceToken: null,
      contextId: null,
      contextToken: null,
      conversationId: null,
      conversationToken: null,
      turnId: null,
      attemptToken: null,
      cleanupId: null,
      cleanupToken: null,
      state: 'settled',
    });
  });
  it.each(['local', 'global', 'ready', 'stale', 'canceled'] as const)(
    'preserves the only recoverable %s context before any setter or journal mutation',
    async (phase) => {
      const { reserveEditorChatOperation, compareEditorChatOperation } =
        await import('../services/editorChatOperationStorage');
      const row = {
        ...rowFor(await requestFor('prepareContext')),
        ...sceneScope,
        contextToken: hash('3'),
      };
      await reserveEditorChatOperation(row, () => undefined);
      await compareEditorChatOperation(
        'user',
        sceneScope,
        row,
        { ...row, state: 'settled', localGeneration: 1 },
        () => undefined,
      );
      const instance = service('scene');
      await instance.load();
      const before = readEditorChatOperation('user', sceneScope);
      vi.mocked(transport.callEditorChat).mockResolvedValueOnce(
        contextFixture({
          target: sceneScope.target,
          resource: { kind: 'scene', id: 'scene' },
          contextId: row.contextId!,
          contextToken: row.contextToken,
          phase,
        }),
      );
      await expect(instance.save({ personaComplement: null })).rejects.toThrow('Consuma ou exclua');
      expect(readEditorChatOperation('user', sceneScope)).toEqual(before);
      expect(
        vi
          .mocked(transport.callEditorChat)
          .mock.calls.some((call) => call[1].action === 'setAdventurePersonaBinding'),
      ).toBe(false);
    },
  );
  it('does not lose an incomplete cleanup control and never opens a derived body for its proof', async () => {
    const { reserveEditorChatOperation, compareEditorChatOperation } =
      await import('../services/editorChatOperationStorage');
    const row = { ...rowFor(await requestFor('advanceCleanup')), ...sceneScope };
    await reserveEditorChatOperation(row, () => undefined);
    await compareEditorChatOperation(
      'user',
      sceneScope,
      row,
      { ...row, state: 'settled', localGeneration: 1 },
      () => undefined,
    );
    const instance = service('scene');
    await instance.load();
    const before = readEditorChatOperation('user', sceneScope);
    vi.mocked(transport.callEditorChat).mockResolvedValueOnce(
      await responseFor(await requestFor('getCleanup')),
    );
    await expect(instance.save({ personaComplement: null })).rejects.toThrow('Conclua a limpeza');
    expect(readEditorChatOperation('user', sceneScope)).toEqual(before);
    expect(vi.mocked(transport.callEditorChat).mock.calls.at(-1)![1].action).toBe('getCleanup');
  });
  it('retains conversation and completed-turn controls after metadata-only native authorization', async () => {
    const { reserveEditorChatOperation, compareEditorChatOperation } =
      await import('../services/editorChatOperationStorage');
    const row = { ...rowFor(await requestFor('completeBYOK')), ...sceneScope };
    await reserveEditorChatOperation(row, () => undefined);
    await compareEditorChatOperation(
      'user',
      sceneScope,
      row,
      { ...row, state: 'settled', localGeneration: 1 },
      () => undefined,
    );
    const instance = service('scene');
    await instance.load();
    vi.mocked(transport.callEditorChat).mockResolvedValueOnce(
      await responseFor(await requestFor('listMessages')),
    );
    await instance.save({ personaComplement: null });
    expect(readEditorChatOperation('user', sceneScope)).toMatchObject({
      conversationId: row.conversationId,
      conversationToken: row.conversationToken,
      turnId: row.turnId,
      attemptToken: row.attemptToken,
      resourceToken: null,
    });
    expect(
      vi.mocked(transport.callEditorChat).mock.calls.map((call) => call[1].action),
    ).not.toContain('getTurn');
  });
  it('rejects a row changed while checking controls instead of handing off unproved metadata', async () => {
    const { reserveEditorChatOperation, compareEditorChatOperation } =
      await import('../services/editorChatOperationStorage');
    const row = {
      ...rowFor(await requestFor('prepareContext')),
      ...sceneScope,
      contextToken: hash('3'),
    };
    await reserveEditorChatOperation(row, () => undefined);
    await compareEditorChatOperation(
      'user',
      sceneScope,
      row,
      { ...row, state: 'settled', localGeneration: 1 },
      () => undefined,
    );
    const instance = service('scene');
    await instance.load();
    const before = readEditorChatOperation('user', sceneScope)!;
    vi.mocked(transport.callEditorChat).mockImplementationOnce(async () => {
      await compareEditorChatOperation(
        'user',
        sceneScope,
        before,
        { ...before, localGeneration: 2 },
        () => undefined,
      );
      return contextFixture({
        target: sceneScope.target,
        resource: { kind: 'scene', id: 'scene' },
        contextId: before.contextId!,
        contextToken: before.contextToken!,
        phase: 'consumed',
        turnId: 'turn',
      });
    });
    await expect(instance.save({ personaComplement: null })).rejects.toMatchObject({
      reason: 'conflict',
    });
    expect(readEditorChatOperation('user', sceneScope)).toEqual({ ...before, localGeneration: 2 });
    expect(
      vi
        .mocked(transport.callEditorChat)
        .mock.calls.some((call) => call[1].action === 'setAdventurePersonaBinding'),
    ).toBe(false);
  });
  it('loads and saves the root before any scene using literal CAS and metadata-only root journal', async () => {
    const instance = service();
    const loaded = await instance.load();
    expect(loaded.base).toEqual(binding());
    expect(transport.callEditorChat).toHaveBeenCalledWith(
      'user',
      {
        action: 'getAdventurePersonaBinding',
        adventureId: 'adventure',
        sceneId: null,
      },
      expect.any(Object),
    );
    const result = await instance.save({ personaId: 'minha-persona' });
    const request = vi.mocked(transport.callEditorChat).mock.calls.at(-1)![1];
    expect(request).toMatchObject({
      action: 'setAdventurePersonaBinding',
      adventureId: 'adventure',
      sceneId: null,
      adventureToken: hash('1'),
      expectedBindingToken: hash('7'),
      value: { personaId: 'minha-persona' },
    });
    expect(result.current?.value).toEqual({ personaId: 'minha-persona' });
    expect(readEditorChatOperation('user', rootScope)).toMatchObject({
      action: 'setAdventurePersonaBinding',
      resource: null,
      resourceToken: null,
      projectToken: hash('1'),
      state: 'settled',
    });
    const journal = localStorage.getItem(editorChatOperationKey('user', rootScope))!;
    expect(journal).not.toContain('minha-persona');
    expect(journal).not.toContain('expectedBindingToken');
    expect(journal).not.toContain('personaComplement');
  });
  it('loads a coherent base and scene, using only a scene journal with no textual resource token', async () => {
    const instance = service('scene');
    await instance.load();
    expect(vi.mocked(transport.callEditorChat).mock.calls.map((call) => call[1])).toEqual([
      { action: 'getAdventurePersonaBinding', adventureId: 'adventure', sceneId: null },
      {
        action: 'getAdventurePersonaBinding',
        adventureId: 'adventure',
        sceneId: 'scene',
        adventureToken: hash('1'),
      },
      {
        action: 'getAdventurePersonaBinding',
        adventureId: 'adventure',
        sceneId: null,
        adventureToken: hash('1'),
      },
    ]);
    const personaComplement = {
      personaId: 'preset-unsettling',
      overrides: [{ traitId: 'tension', value: 0 }],
    };
    await instance.save({ personaComplement });
    expect(readEditorChatOperation('user', sceneScope)).toMatchObject({
      resource: { kind: 'scene', id: 'scene' },
      resourceToken: null,
      projectToken: hash('1'),
      state: 'settled',
    });
    expect(localStorage.getItem(editorChatOperationKey('user', sceneScope))).not.toContain(
      'tension',
    );
  });
  it('rejects a base changed during scene load rather than silently presenting a mixed profile', async () => {
    vi.mocked(transport.callEditorChat)
      .mockResolvedValueOnce(binding())
      .mockResolvedValueOnce(binding('scene'))
      .mockResolvedValueOnce(binding(null, 2));
    const instance = service('scene');
    await expect(instance.load()).rejects.toThrow('base mudou');
    await expect(instance.save({ personaComplement: null })).rejects.toThrow('Confira o vínculo');
    expect(localStorage.length).toBe(0);
  });
  it('keeps uncertain mutation metadata and recovers/cancels the ORIGINAL fingerprint without replaying a setter', async () => {
    const instance = service();
    await instance.load();
    vi.mocked(transport.callEditorChat).mockRejectedValueOnce(
      new transport.EditorChatTransportError('functions/unavailable', true),
    );
    await expect(instance.save({ personaId: 'preset-epic' })).rejects.toMatchObject({
      uncertain: true,
    });
    const original = instance.pending()!;
    expect(original.state).toBe('uncertain');
    const reloaded = service();
    expect(reloaded.pending()).toEqual(original);
    vi.mocked(transport.resolveEditorChatOperation).mockResolvedValueOnce({
      state: 'unknown',
      receipt: null,
    });
    await reloaded.recover('observe');
    expect(transport.resolveEditorChatOperation).toHaveBeenLastCalledWith(
      'user',
      original,
      expect.any(Object),
    );
    vi.mocked(transport.resolveEditorChatOperation).mockImplementationOnce((_uid, row) => {
      expect(row.intent).toBe('cancel');
      expect(row.requestHash).toBe(original.requestHash);
      return Promise.resolve({
        state: 'settled',
        receipt: {
          schemaVersion: 1,
          operationId: row.operationId,
          action: row.action,
          requestHash: row.requestHash,
          outcome: 'canceled',
          confirmedAt: 2,
          result: { kind: 'fence' },
        },
      });
    });
    await reloaded.recover('cancel');
    expect(reloaded.pending()).toBeNull();
    expect(transport.callEditorChat).toHaveBeenCalledTimes(2);
  });
  it('keeps frozen CAS after conflict until explicit reload and never retries the setter', async () => {
    const instance = service();
    await instance.load();
    vi.mocked(transport.callEditorChat).mockRejectedValueOnce(
      new transport.EditorChatTransportError('functions/aborted', false, 'revision-conflict'),
    );
    await expect(instance.save({ personaId: 'preset-epic' })).rejects.toMatchObject({
      reason: 'revision-conflict',
    });
    await expect(instance.save({ personaId: null })).rejects.toThrow('pendência');
    expect(transport.callEditorChat).toHaveBeenCalledTimes(2);
    const original = instance.pending()!;
    vi.mocked(transport.resolveEditorChatOperation).mockResolvedValueOnce({
      state: 'settled',
      receipt: {
        schemaVersion: 1,
        action: original.action,
        operationId: original.operationId,
        requestHash: original.requestHash,
        outcome: 'canceled',
        confirmedAt: 2,
        result: { kind: 'fence' },
      },
    });
    await instance.recover('cancel');
    vi.mocked(transport.callEditorChat).mockResolvedValueOnce(binding(null, 2));
    await instance.load();
    await instance.save({ personaId: 'preset-incisive' });
    expect(vi.mocked(transport.callEditorChat).mock.calls.at(-1)![1]).toMatchObject({
      expectedBindingToken: hash('8'),
    });
  });
  it('rejects account ABA after a setter response without settling or erasing its original journal', async () => {
    const instance = service();
    await instance.load();
    vi.mocked(transport.callEditorChat).mockImplementationOnce((_uid, request) => {
      if (request.action !== 'setAdventurePersonaBinding') throw Error('Ação inesperada');
      const result = reply(request),
        old = mocks.user;
      switchUser({ uid: 'other' });
      switchUser(old);
      return Promise.resolve(result);
    });
    await expect(instance.save({ personaId: null })).rejects.toMatchObject({
      code: 'editor-chat/identity-changed',
    });
    expect(readEditorChatOperation('user', rootScope)?.state).toBe('pending');
  });
  it('disposal blocks late projection and is not a cancellation on the server', async () => {
    const instance = service();
    await instance.load();
    vi.mocked(transport.callEditorChat).mockImplementationOnce((_uid, request) => {
      if (request.action !== 'setAdventurePersonaBinding') throw Error('Ação inesperada');
      const result = reply(request);
      instance.dispose();
      return Promise.resolve(result);
    });
    await expect(instance.save({ personaId: null })).rejects.toMatchObject({
      code: 'editor-chat/identity-changed',
    });
    expect(readEditorChatOperation('user', rootScope)?.state).toBe('pending');
    expect(transport.resolveEditorChatOperation).not.toHaveBeenCalled();
  });
  it('does not recover an unrelated pending chat operation through the persona editor', async () => {
    const { rowFor, requestFor } = await import('./editorChatTestFixtures');
    const { reserveEditorChatOperation } = await import('../services/editorChatOperationStorage');
    const row: EditorChatOperationRow = {
      ...rowFor(await requestFor('prepareContext')),
      target: sceneScope.target,
      resource: sceneScope.resource,
    };
    await reserveEditorChatOperation(row, () => undefined);
    const instance = service('scene');
    await instance.load();
    await expect(instance.recover('cancel')).rejects.toThrow('chat que iniciou');
    await expect(instance.save({ personaComplement: null })).rejects.toThrow('pendência');
    expect(transport.resolveEditorChatOperation).not.toHaveBeenCalled();
    expect(
      vi
        .mocked(transport.callEditorChat)
        .mock.calls.every((call) => call[1].action === 'getAdventurePersonaBinding'),
    ).toBe(true);
  });
});
