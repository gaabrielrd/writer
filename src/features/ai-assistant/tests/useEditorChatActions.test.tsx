import { StrictMode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorChatActions } from '../hooks/useEditorChatActions';
import type { EditorChatController, EditorChatByokControl } from '../model/editorChatController';
import type { EditorChatApplyHost } from '../services/editorChatApplyService';
import type { EditorChatByokInput } from '../model/editorChat';
import { EditorChatByokError } from '../services/editorChatByokService';
import { frozenFixture, hash, scope, byokGeneration, turnFixture } from './editorChatTestFixtures';
import { resolveChatGeneration } from '../model/chatGeneration';
const mocks = vi.hoisted(() => ({ run: vi.fn(), apply: vi.fn() }));
vi.mock('../services/editorChatByokService', async () => ({
  ...(await vi.importActual<typeof import('../services/editorChatByokService')>(
    '../services/editorChatByokService',
  )),
  runEditorChatByok: mocks.run,
}));
vi.mock('../services/editorChatApplyService', () => ({ applyEditorChatSuggestion: mocks.apply }));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function setup() {
  const input: EditorChatByokInput = {
    turnId: 'turn',
    attemptToken: hash('e'),
    generation: resolveChatGeneration(byokGeneration),
    systemInstruction: 'Regra',
    prompt: 'Pergunta',
    context: await frozenFixture(),
    history: [],
    closureHash: hash('8'),
  };
  const control: EditorChatByokControl = {
    conversationId: 'conversation',
    conversationToken: hash('4'),
    turnId: 'turn',
    attemptToken: hash('e'),
  };
  const noop = () => Promise.resolve();
  const controller: EditorChatController = {
    state: {
      scopeKey: 'scope',
      catalogStatus: 'ready',
      messagesStatus: 'ready',
      conversations: [],
      catalog: null,
      conversation: null,
      conversationRef: { id: control.conversationId, token: control.conversationToken },
      messagePage: null,
      turns: [],
      questions: {},
      turnReads: {},
      context: null,
      contextRef: null,
      inspection: null,
      needsInspection: false,
      cleanup: null,
      cleanupRef: null,
      draft: '',
      stream: null,
      byokInput: null,
      pending: null,
      lastReceipt: null,
      busyAction: null,
      error: null,
    },
    hasUnsentDraft: false,
    setDraft: vi.fn(),
    refreshConversations: noop,
    loadMoreConversations: noop,
    createConversation: noop,
    selectConversation: noop,
    renameConversation: noop,
    loadMoreMessages: noop,
    readTurn: noop,
    prepareContext: noop,
    advanceContext: noop,
    inspectContext: noop,
    send: noop,
    recoverPending: noop,
    stopTurn: noop,
    getByokInput: vi.fn(() => Promise.resolve({ control, input })),
    completeBYOK: vi.fn(noop),
    failBYOK: vi.fn(noop),
    deleteContext: noop,
    deleteConversation: noop,
    advanceCleanup: noop,
    refreshKnownControl: vi.fn(noop),
    invalidateDerived: vi.fn(),
  };
  const host: EditorChatApplyHost = {
    ...scope,
    checkCurrent: vi.fn(),
    getConfirmedSnapshot: () => null,
    getBridge: () => null,
    runExclusive: (work) => work(),
    acceptConfirmed: vi.fn(),
  };
  const options = { uid: 'user', host, controller, enabled: true, invalidationKey: 1 };
  mocks.run.mockResolvedValue('Resposta final');
  mocks.apply.mockResolvedValue(undefined);
  return { options, controller, control, input, host };
}
beforeEach(() => vi.resetAllMocks());
describe('ações explícitas do chat', () => {
  it('BYOK completa apenas com handle original, sem disparo automático no mount', async () => {
    const f = await setup(),
      view = renderHook(() => useEditorChatActions(f.options));
    expect(mocks.run).not.toHaveBeenCalled();
    await act(() => view.result.current.onRunByok());
    expect(mocks.run).toHaveBeenCalledTimes(1);
    expect(f.controller.completeBYOK).toHaveBeenCalledWith('Resposta final', f.control);
    expect(view.result.current.byokRunning).toBe(false);
  });
  it('input indisponível não chama provedor nem cria tentativa', async () => {
    const f = await setup();
    vi.mocked(f.controller.getByokInput).mockResolvedValue(null);
    const view = renderHook(() => useEditorChatActions(f.options));
    await act(() => view.result.current.onRunByok());
    expect(mocks.run).not.toHaveBeenCalled();
    expect(f.controller.completeBYOK).not.toHaveBeenCalled();
  });
  it('falha neutra conclui somente o handle original e preserva o erro de configuração', async () => {
    const f = await setup();
    mocks.run.mockRejectedValue(new EditorChatByokError('credential-unavailable'));
    const view = renderHook(() => useEditorChatActions(f.options));
    await act(async () => {
      await expect(view.result.current.onRunByok()).rejects.toMatchObject({
        reason: 'credential-unavailable',
      });
    });
    expect(f.controller.failBYOK).toHaveBeenCalledWith('credential-unavailable', f.control);
    expect(f.controller.completeBYOK).not.toHaveBeenCalled();
  });
  it('conclusão incerta não cria fail ou nova geração automaticamente', async () => {
    const f = await setup();
    vi.mocked(f.controller.completeBYOK).mockRejectedValue(new Error('uncertain'));
    const view = renderHook(() => useEditorChatActions(f.options));
    await act(async () => {
      await expect(view.result.current.onRunByok()).rejects.toThrow('uncertain');
    });
    expect(mocks.run).toHaveBeenCalledTimes(1);
    expect(f.controller.failBYOK).not.toHaveBeenCalled();
  });
  it('conversa alterada descarta resultado atrasado, sem enviá-lo à nova conversa', async () => {
    const f = await setup(),
      pending = deferred<string>();
    mocks.run.mockReturnValue(pending.promise);
    const view = renderHook(({ options }) => useEditorChatActions(options), {
      initialProps: { options: f.options },
    });
    let work!: Promise<void>;
    await act(async () => {
      work = view.result.current.onRunByok();
      await Promise.resolve();
    });
    view.rerender({
      options: {
        ...f.options,
        controller: {
          ...f.controller,
          state: { ...f.controller.state, conversationRef: { id: 'other', token: hash('7') } },
        },
      },
    });
    await act(async () => {
      pending.resolve('Antiga');
      await work;
    });
    expect(f.controller.completeBYOK).not.toHaveBeenCalled();
    expect(f.controller.failBYOK).not.toHaveBeenCalled();
    expect(view.result.current.byokRunning).toBe(false);
  });
  it('invalidação durante provedor aborta transporte e exige retomada explícita', async () => {
    const f = await setup(),
      pending = deferred<string>();
    mocks.run.mockReturnValue(pending.promise);
    const view = renderHook(
      ({ hint }) => useEditorChatActions({ ...f.options, invalidationKey: hint }),
      { initialProps: { hint: 1 } },
    );
    let work!: Promise<void>;
    await act(async () => {
      work = view.result.current.onRunByok();
      await Promise.resolve();
    });
    const passed: unknown = mocks.run.mock.calls[0]?.[1];
    expect((passed as { signal: AbortSignal }).signal).toBeInstanceOf(AbortSignal);
    view.rerender({ hint: 2 });
    await act(async () => {
      pending.resolve('Antiga');
      await work;
    });
    expect(f.controller.completeBYOK).not.toHaveBeenCalled();
    expect(f.controller.failBYOK).not.toHaveBeenCalled();
  });
  it('stop confirmado no controller aborta o provedor em execução', async () => {
    const f = await setup(),
      pending = deferred<string>();
    mocks.run.mockReturnValue(pending.promise);
    const view = renderHook(
      ({ turns }) =>
        useEditorChatActions({
          ...f.options,
          controller: { ...f.controller, state: { ...f.controller.state, turns } },
        }),
      {
        initialProps: {
          turns: [
            turnFixture({
              state: 'awaiting-byok',
              provider: 'byok',
              generation: f.input.generation,
            }),
          ],
        },
      },
    );
    let work!: Promise<void>;
    await act(async () => {
      work = view.result.current.onRunByok();
      await Promise.resolve();
    });
    view.rerender({
      turns: [turnFixture({ state: 'stopped', provider: 'byok', generation: f.input.generation })],
    });
    await act(async () => {
      pending.resolve('Antiga');
      await work;
    });
    expect(f.controller.completeBYOK).not.toHaveBeenCalled();
    expect(f.controller.failBYOK).not.toHaveBeenCalled();
  });
  it('reserva local impede duas execuções simultâneas', async () => {
    const f = await setup(),
      pending = deferred<string>();
    mocks.run.mockReturnValue(pending.promise);
    const view = renderHook(() => useEditorChatActions(f.options));
    let work!: Promise<void>;
    await act(async () => {
      work = view.result.current.onRunByok();
      await Promise.resolve();
    });
    await act(async () => {
      await expect(view.result.current.onRunByok()).rejects.toThrow('Aguarde');
    });
    await act(async () => {
      pending.resolve('Final');
      await work;
    });
    expect(mocks.run).toHaveBeenCalledTimes(1);
  });
  it('aplicação explícita invalida derivados e atualiza controles após confirmação', async () => {
    const f = await setup(),
      view = renderHook(() => useEditorChatActions(f.options));
    const input = { ...f.control, placement: 'original' as const, replace: true };
    await act(() => view.result.current.onApply(input));
    expect(mocks.apply).toHaveBeenCalledWith('user', expect.anything(), input);
    expect(f.controller.invalidateDerived).toHaveBeenCalledOnce();
    expect(f.controller.refreshKnownControl).toHaveBeenCalledOnce();
  });
  it('falha de aplicação não projeta resultado nem confirma controlador', async () => {
    const f = await setup();
    mocks.apply.mockRejectedValue(new Error('CAS'));
    const view = renderHook(() => useEditorChatActions(f.options));
    await act(async () => {
      await expect(
        view.result.current.onApply({ ...f.control, placement: 'original', replace: true }),
      ).rejects.toThrow('CAS');
    });
    expect(f.controller.invalidateDerived).not.toHaveBeenCalled();
    expect(view.result.current.applying).toBe(false);
  });
  it('StrictMode não executa geração nem aplicação por montagem', async () => {
    const f = await setup();
    const view = renderHook(() => useEditorChatActions(f.options), { wrapper: StrictMode });
    expect(mocks.run).not.toHaveBeenCalled();
    expect(mocks.apply).not.toHaveBeenCalled();
    await act(() => view.result.current.onRunByok());
    expect(f.controller.completeBYOK).toHaveBeenCalledOnce();
  });
});
