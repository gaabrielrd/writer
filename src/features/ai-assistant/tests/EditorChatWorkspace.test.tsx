import { StrictMode } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { EditorChatController } from '../model/editorChatController';
import type { EditorChatPanelProps } from '../components/EditorChatPanel';
import type { EditorChatApplyHost } from '../services/editorChatApplyService';
import type { ChatGenerationRequest } from '../model/chatGeneration';
import { EditorChatWorkspace } from '../components/EditorChatWorkspace';
import { scope } from './editorChatTestFixtures';
const mocks = vi.hoisted(() => ({
  controller: null as EditorChatController | null,
  panel: null as EditorChatPanelProps | null,
  hook: vi.fn(),
  actions: vi.fn(),
  credits: vi.fn(),
  updateCredits: vi.fn(),
  revision: 0,
  callbacks: new Set<() => void>(),
  choice: ((): ChatGenerationRequest => ({
    version: 1,
    provider: 'platform',
    model: null,
    reasoning: 'auto',
  }))(),
  onApplied: null as ((check: () => void) => void) | null,
}));
vi.mock('@/features/auth', () => ({
  useAuth: () => ({ updateUserCreditsState: mocks.updateCredits }),
}));
vi.mock('../hooks/useEditorChat', () => ({
  useEditorChat: (options: unknown) => {
    mocks.hook(options);
    return mocks.controller;
  },
}));
vi.mock('../hooks/useEditorChatActions', () => ({
  useEditorChatActions: (options: { onApplied?: (check: () => void) => void }) => {
    mocks.onApplied = options.onApplied ?? null;
    return {
      byokRunning: false,
      applying: false,
      onApply: () => Promise.resolve(),
      onRunByok: () => Promise.resolve(),
    };
  },
}));
vi.mock('../services/creditsService', () => ({ getUserCredits: mocks.credits }));
vi.mock('../services/chapterChatService', () => ({
  captureChatGeneration: (reasoning = 'auto') => ({ ...mocks.choice, reasoning }),
}));
vi.mock('../services/byokStorage', () => ({
  getBYOKRevision: () => mocks.revision,
  subscribeBYOKConfig: (listener: () => void) => {
    mocks.callbacks.add(listener);
    return () => mocks.callbacks.delete(listener);
  },
}));
vi.mock('../components/EditorChatPanel', () => ({
  EditorChatPanel: (props: EditorChatPanelProps) => {
    mocks.panel = props;
    return (
      <>
        <p>{props.open ? 'Aberto' : 'Recolhido'}</p>
        <p>{JSON.stringify(props.generation)}</p>
        <button
          onClick={() => props.onGenerationChange({ ...props.generation, reasoning: 'high' })}
        >
          Mudar esforço
        </button>
        <button onClick={() => mocks.onApplied?.(() => undefined)}>
          Atualizar saldo confirmado
        </button>
      </>
    );
  },
}));
const noop = () => Promise.resolve();
function controller(): EditorChatController {
  return {
    state: {
      scopeKey: 'scope',
      catalogStatus: 'ready',
      messagesStatus: 'ready',
      conversations: [],
      catalog: null,
      conversation: null,
      conversationRef: null,
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
      draft: 'Minha pergunta',
      stream: null,
      byokInput: null,
      pending: null,
      lastReceipt: null,
      busyAction: null,
      error: null,
    },
    hasUnsentDraft: true,
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
    getByokInput: () => Promise.resolve(null),
    completeBYOK: noop,
    failBYOK: noop,
    deleteContext: noop,
    deleteConversation: noop,
    advanceCleanup: noop,
    refreshKnownControl: noop,
    invalidateDerived: vi.fn(),
  };
}
const host: EditorChatApplyHost = {
  ...scope,
  checkCurrent: vi.fn(),
  getBridge: () => null,
  getConfirmedSnapshot: () => null,
  runExclusive: (work) => work(),
  acceptConfirmed: vi.fn(),
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.controller = controller();
  mocks.panel = null;
  mocks.revision = 0;
  mocks.choice = { version: 1, provider: 'platform', model: null, reasoning: 'auto' };
  mocks.callbacks.clear();
  mocks.credits.mockResolvedValue(4);
});
it('recolher mantém controller e pergunta em RAM, sem desabilitar recuperação', () => {
  const props = { uid: 'user', host, open: true, onClose: vi.fn() };
  const view = render(<EditorChatWorkspace {...props} />);
  view.rerender(<EditorChatWorkspace {...props} open={false} />);
  expect(screen.getByText('Recolhido')).toBeInTheDocument();
  expect(mocks.panel?.controller).toBe(mocks.controller);
  expect(mocks.controller!.setDraft).not.toHaveBeenCalled();
  expect(mocks.hook).toHaveBeenLastCalledWith(expect.objectContaining({ uid: 'user', host }));
});
it('ação explícita acrescenta comando sem sobrescrever pergunta própria e sem reenviar em StrictMode', () => {
  render(
    <StrictMode>
      <EditorChatWorkspace
        uid="user"
        host={host}
        open
        onClose={vi.fn()}
        requestAction={{ id: 1, action: 'improve_style' }}
      />
    </StrictMode>,
  );
  expect(mocks.controller!.setDraft).toHaveBeenCalledTimes(1);
  expect(mocks.controller!.setDraft).toHaveBeenCalledWith('Minha pergunta\n\n/estilo ');
});
it('ação personalizada abre sem fabricar pergunta ou contexto', () => {
  render(
    <EditorChatWorkspace
      uid="user"
      host={host}
      open
      onClose={vi.fn()}
      requestAction={{ id: 2, action: 'custom' }}
    />,
  );
  expect(mocks.controller!.setDraft).not.toHaveBeenCalled();
});
it('troca da configuração só altera parâmetros públicos da próxima geração, preservando esforço escolhido', () => {
  render(<EditorChatWorkspace uid="user" host={host} open onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Mudar esforço' }));
  act(() => {
    mocks.choice = { version: 1, provider: 'openai_byok', model: 'gpt-6-luna', reasoning: 'auto' };
    mocks.revision++;
    for (const listener of mocks.callbacks) listener();
  });
  expect(mocks.panel?.generation).toEqual({
    version: 1,
    provider: 'openai_byok',
    model: 'gpt-6-luna',
    reasoning: 'high',
  });
});
it('informa pergunta volátil e pendência separadamente e limpa sinais ao desmontar', () => {
  const pending = vi.fn(),
    draft = vi.fn();
  mocks.controller!.state.busyAction = 'send';
  const view = render(
    <EditorChatWorkspace
      uid="user"
      host={host}
      open
      onClose={vi.fn()}
      onPendingChange={pending}
      onDraftChange={draft}
    />,
  );
  expect(pending).toHaveBeenLastCalledWith(true);
  expect(draft).toHaveBeenLastCalledWith(true);
  view.unmount();
  expect(pending).toHaveBeenLastCalledWith(false);
  expect(draft).toHaveBeenLastCalledWith(false);
});
it('atualiza saldo por leitura posterior ao aceite, sem débito no cliente', async () => {
  render(<EditorChatWorkspace uid="user" host={host} open onClose={vi.fn()} />);
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar saldo confirmado' }));
    await Promise.resolve();
  });
  expect(mocks.credits).toHaveBeenCalledWith('user');
  expect(mocks.updateCredits).toHaveBeenCalledWith(4);
});
it('resposta de saldo tardia é descartada se o guard de lifecycle mudou', async () => {
  render(<EditorChatWorkspace uid="user" host={host} open onClose={vi.fn()} />);
  await act(async () => {
    mocks.onApplied?.(() => {
      throw new Error('scope-changed');
    });
    await Promise.resolve();
  });
  expect(mocks.updateCredits).not.toHaveBeenCalled();
});
