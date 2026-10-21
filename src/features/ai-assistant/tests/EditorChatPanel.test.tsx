import { webcrypto } from 'node:crypto';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chooseDropdown } from '@/test/dropdown';
import { EditorChatPanel, type EditorChatPanelProps } from '../components/EditorChatPanel';
import type {
  EditorChatController,
  EditorChatControllerState,
} from '../model/editorChatController';
import type { EditorChatFrozenContext } from '../model/editorChat';
import {
  conversationFixture,
  contextFixture,
  frozenFixture,
  generation,
  hash,
  requestFor,
  rowFor,
  scope,
  turnFixture,
} from './editorChatTestFixtures';

let frozen: EditorChatFrozenContext;
beforeEach(async () => {
  vi.stubGlobal('crypto', webcrypto);
  frozen = await frozenFixture();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const noop = () => vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
function fixture(overrides: Partial<EditorChatControllerState> = {}) {
  const conversation = conversationFixture();
  const context = contextFixture();
  const state: EditorChatControllerState = {
    scopeKey: 'user/book/scene',
    catalogStatus: 'ready',
    messagesStatus: 'ready',
    conversations: [conversation],
    catalog: {
      schemaVersion: 1,
      ownerId: 'user',
      ...scope,
      projectToken: hash('1'),
      resourceToken: hash('2'),
      collectionRevision: 1,
      platformModel: 'gemini-3.7-flash',
      items: [conversation],
      nextCursor: null,
    },
    conversation,
    conversationRef: { id: conversation.conversationId, token: conversation.conversationToken },
    messagePage: null,
    turns: [],
    questions: {},
    turnReads: {},
    context,
    contextRef: { id: context.contextId, token: context.contextToken },
    inspection: { context, source: frozen.source, frozen, freshness: 'current' },
    needsInspection: false,
    cleanup: null,
    cleanupRef: null,
    draft: 'Pergunta própria',
    stream: null,
    byokInput: null,
    pending: null,
    lastReceipt: null,
    busyAction: null,
    error: null,
    ...overrides,
  };
  const controller: EditorChatController = {
    state,
    hasUnsentDraft: Boolean(state.draft),
    setDraft: vi.fn(),
    refreshConversations: noop(),
    loadMoreConversations: noop(),
    createConversation: noop(),
    selectConversation: vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined),
    renameConversation: vi.fn<(title: string) => Promise<void>>().mockResolvedValue(undefined),
    loadMoreMessages: noop(),
    readTurn: vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined),
    prepareContext: vi.fn<EditorChatController['prepareContext']>().mockResolvedValue(undefined),
    advanceContext: noop(),
    inspectContext: noop(),
    send: vi.fn<EditorChatController['send']>().mockResolvedValue(undefined),
    recoverPending: vi.fn<EditorChatController['recoverPending']>().mockResolvedValue(undefined),
    stopTurn: noop(),
    getByokInput: vi.fn<EditorChatController['getByokInput']>().mockResolvedValue(null),
    completeBYOK: vi.fn<EditorChatController['completeBYOK']>().mockResolvedValue(undefined),
    failBYOK: vi.fn<EditorChatController['failBYOK']>().mockResolvedValue(undefined),
    deleteContext: noop(),
    deleteConversation: noop(),
    advanceCleanup: noop(),
    refreshKnownControl: noop(),
    invalidateDerived: vi.fn(),
  };
  const props: EditorChatPanelProps = {
    open: true,
    onClose: vi.fn(),
    controller,
    generation,
    onGenerationChange: vi.fn(),
    onApply: vi.fn<EditorChatPanelProps['onApply']>().mockResolvedValue(undefined),
    onRunByok: noop(),
  };
  const rendered = render(<EditorChatPanel {...props} />);
  return {
    controller,
    props,
    user: userEvent.setup(),
    update(
      this: void,
      next: Partial<EditorChatControllerState>,
      options: Partial<EditorChatPanelProps> = {},
    ) {
      controller.state = { ...controller.state, ...next };
      Object.assign(props, options);
      rendered.rerender(<EditorChatPanel {...props} />);
    },
    ...rendered,
  };
}
function withAnswer() {
  const turn = turnFixture();
  return {
    turns: [turn],
    questions: { [turn.turnId]: 'Pergunta que é minha' },
    turnReads: {
      [turn.turnId]: {
        turn,
        question: 'Pergunta que é minha',
        presentation: 'available' as const,
        answer: {
          text: 'Resposta autorizada',
          suggestion: 'Sugestão autorizada',
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
          freshness: 'current' as const,
        },
      },
    },
  };
}
const button = (name: string) => screen.getByRole('button', { name });

describe('EditorChatPanel explicit reads and context', () => {
  it('does not issue reads or writes on mount and selects metadata without opening a body', async () => {
    const { controller, user } = fixture({
      turns: [turnFixture()],
      turnReads: {},
      inspection: null,
    });
    expect(controller.readTurn).not.toHaveBeenCalled();
    expect(controller.inspectContext).not.toHaveBeenCalled();
    expect(controller.refreshConversations).not.toHaveBeenCalled();
    expect(screen.queryByText('Instrução privada')).not.toBeInTheDocument();
    await user.click(button('Nova conversa'));
    expect(controller.createConversation).toHaveBeenCalledOnce();
    await user.click(
      screen.getByRole('button', { name: 'Abrir conversa: Nova conversa', pressed: true }),
    );
    expect(controller.selectConversation).toHaveBeenCalledWith('conversation');
    expect(controller.readTurn).not.toHaveBeenCalled();
    await user.click(button('Ler resposta 1'));
    expect(controller.readTurn).toHaveBeenCalledWith('turn');
  });
  it.each([
    ['Automático', 'auto'],
    ['Seleção', 'selection'],
    ['Ao redor do cursor', 'cursor'],
    ['Trecho visível', 'viewport'],
    ['Documento', 'document'],
  ])('prepares only the explicitly chosen %s source', async (label, source) => {
    const { controller, user } = fixture({ context: null, contextRef: null, inspection: null });
    await chooseDropdown(user, screen.getByRole('combobox', { name: 'Origem do trecho' }), label);
    expect(controller.prepareContext).not.toHaveBeenCalled();
    await user.click(button('Preparar contexto'));
    expect(controller.prepareContext).toHaveBeenCalledExactlyOnceWith(source);
  });
  it('advances exactly one context page and requires an explicit current inspection before sending', async () => {
    const { controller, user, update } = fixture({
      context: contextFixture({ phase: 'local' }),
      inspection: null,
      needsInspection: true,
    });
    expect(button('Enviar pergunta')).toBeDisabled();
    await user.click(button('Avançar uma página do contexto'));
    expect(controller.advanceContext).toHaveBeenCalledOnce();
    update({ context: contextFixture() });
    await user.click(button('Conferir contexto'));
    expect(controller.inspectContext).toHaveBeenCalledOnce();
    expect(button('Enviar pergunta')).toBeDisabled();
    update({
      inspection: { context: contextFixture(), source: frozen.source, frozen, freshness: 'stale' },
      needsInspection: false,
    });
    expect(screen.getByText(/Este contexto está desatualizado/)).toBeVisible();
    expect(button('Enviar pergunta')).toBeDisabled();
    update({
      inspection: {
        context: contextFixture(),
        source: frozen.source,
        frozen,
        freshness: 'current',
      },
    });
    await user.click(button('Enviar pergunta'));
    expect(controller.send).toHaveBeenCalledExactlyOnceWith(generation);
  });
  it('renders only the authorized inspection, with captured revision, lore and persona', () => {
    const lore = {
      reference: { kind: 'book' as const, scopeId: 'book', entityId: 'entity' },
      identityToken: hash(),
      capturedRevision: 3,
      capturedStamp: { seconds: 1, nanoseconds: 0 },
      name: 'Guardiã',
      aliases: ['Vigia'],
      category: 'character',
      summary: 'Resumo',
      detailsExcerpt: 'Trecho privado',
      aliasesOmitted: 0,
      detailsTruncated: true,
    };
    frozen = {
      ...frozen,
      lore: [lore],
      includedEntityCount: 1,
      omittedEntityCount: 2,
      capture: { ...frozen.capture, surroundingText: 'Ao redor', truncated: true },
    };
    const { update } = fixture();
    expect(screen.getByText('Guardiã')).toBeVisible();
    expect(screen.getByText('Instrução privada')).toBeVisible();
    expect(screen.getByText(/Revisão do texto: 1/)).toBeVisible();
    update({ inspection: null, needsInspection: true });
    expect(screen.queryByText('Guardiã')).not.toBeInTheDocument();
    expect(screen.queryByText('Instrução privada')).not.toBeInTheDocument();
  });
  it('requires explicit confirmation bound to the same context before deleting', async () => {
    const { user, controller, update } = fixture();
    await user.click(button('Excluir contexto'));
    expect(controller.deleteContext).not.toHaveBeenCalled();
    update({ contextRef: { id: 'another', token: hash('9') } });
    expect(button('Confirmar exclusão')).toBeDisabled();
    await user.click(button('Voltar'));
    update({ contextRef: { id: 'context', token: hash('3') } });
    await user.click(button('Excluir contexto'));
    await user.click(button('Confirmar exclusão'));
    expect(controller.deleteContext).toHaveBeenCalledOnce();
  });
});

describe('EditorChatPanel own questions and transactional application', () => {
  it('hides revoked derivatives while preserving the own question, and never creates a prompt from an answer', () => {
    const { update, controller } = fixture(withAnswer());
    expect(screen.getByText('Resposta autorizada')).toBeVisible();
    expect(button('Aplicar sugestão 1')).toBeEnabled();
    const turn = turnFixture({ state: 'blocked' });
    update({
      turnReads: {
        turn: { turn, question: 'Pergunta que é minha', presentation: 'blocked', answer: null },
      },
    });
    expect(screen.getByText('Pergunta que é minha')).toBeVisible();
    expect(screen.queryByText('Resposta autorizada')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aplicar sugestão 1' })).not.toBeInTheDocument();
    expect(controller.setDraft).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /copiar/i })).not.toBeInTheDocument();
  });
  it.each(['original', 'retargeted'] as const)(
    'confirms %s insertion/replacement without applying on dialog open',
    async (placement) => {
      const { user, props } = fixture(withAnswer());
      await user.click(button('Aplicar sugestão 1'));
      expect(props.onApply).not.toHaveBeenCalled();
      if (placement === 'retargeted') {
        await chooseDropdown(
          user,
          screen.getByRole('combobox', { name: 'Destino da sugestão' }),
          'Nova seleção ou posição',
        );
        await chooseDropdown(
          user,
          screen.getByRole('combobox', { name: 'Nova origem no editor' }),
          'Seleção',
        );
        await chooseDropdown(
          user,
          screen.getByRole('combobox', { name: 'Modo de aplicação' }),
          'Substituir trecho',
        );
      }
      await user.click(button('Confirmar aplicação no texto'));
      expect(props.onApply).toHaveBeenCalledExactlyOnceWith({
        conversationId: 'conversation',
        conversationToken: hash('4'),
        turnId: 'turn',
        placement,
        replace: placement === 'retargeted',
        ...(placement === 'retargeted' ? { source: 'selection' } : {}),
      });
      await waitFor(() =>
        expect(
          screen.queryByRole('dialog', { name: 'Confirmar aplicação' }),
        ).not.toBeInTheDocument(),
      );
    },
  );
  it('disables an open application confirmation immediately when authorization or conversation changes', async () => {
    const { user, update, props } = fixture(withAnswer());
    await user.click(button('Aplicar sugestão 1'));
    update({ turnReads: {} });
    expect(button('Confirmar aplicação no texto')).toBeDisabled();
    update({ ...withAnswer(), conversationRef: { id: 'different', token: hash('5') } });
    expect(button('Confirmar aplicação no texto')).toBeDisabled();
    expect(props.onApply).not.toHaveBeenCalled();
  });
  it('shows a generic callback failure and keeps the confirmation available for deliberate review', async () => {
    const { user, props } = fixture(withAnswer());
    vi.mocked(props.onApply).mockRejectedValueOnce(new Error('SECRET DATA'));
    await user.click(button('Aplicar sugestão 1'));
    await user.click(button('Confirmar aplicação no texto'));
    expect(
      await screen.findByText(
        'Não foi possível confirmar a ação. Confira o estado antes de tentar novamente.',
      ),
    ).toBeVisible();
    expect(screen.queryByText('SECRET DATA')).not.toBeInTheDocument();
  });
  it('presents provisional stream text without an application action and exposes explicit stop', async () => {
    const { user, controller } = fixture({
      busyAction: 'send',
      stream: { turn: turnFixture({ state: 'running' }), text: 'Provisório' },
    });
    expect(screen.getByText('Provisório')).toBeVisible();
    expect(screen.queryByRole('button', { name: /Aplicar sugestão/ })).not.toBeInTheDocument();
    await user.click(button('Interromper geração'));
    expect(controller.stopTurn).toHaveBeenCalledOnce();
  });
});

describe('EditorChatPanel conversation controls, recovery and generation', () => {
  it('renames and deletes only after explicit confirmation of the selected conversation', async () => {
    const { user, controller } = fixture();
    await user.click(button('Renomear conversa'));
    const title = screen.getByRole('textbox', { name: 'Título da conversa' });
    await user.clear(title);
    await user.type(title, 'Mesa do inverno');
    expect(controller.renameConversation).not.toHaveBeenCalled();
    await user.click(button('Salvar título'));
    expect(controller.renameConversation).toHaveBeenCalledWith('Mesa do inverno');
    await user.click(button('Excluir conversa'));
    expect(controller.deleteConversation).not.toHaveBeenCalled();
    await user.click(button('Confirmar exclusão'));
    expect(controller.deleteConversation).toHaveBeenCalledOnce();
  });
  it('does not rename a different selected conversation after a dialog was opened', async () => {
    const { user, controller, update } = fixture();
    await user.click(button('Renomear conversa'));
    update({ conversationRef: { id: 'another', token: hash('8') } });
    expect(button('Salvar título')).toBeDisabled();
    expect(controller.renameConversation).not.toHaveBeenCalled();
  });
  it('observes/cancels the original pending operation, blocks send, and respects persisted cancel intent', async () => {
    const pending = rowFor(await requestFor('send'));
    const { user, controller, update } = fixture({ pending });
    expect(button('Enviar pergunta')).toBeDisabled();
    expect(screen.getByText(pending.operationId)).toBeVisible();
    await user.click(button('Conferir pedido'));
    expect(controller.recoverPending).toHaveBeenCalledWith('observe');
    await user.click(button('Cancelar pedido pendente'));
    expect(controller.recoverPending).toHaveBeenCalledWith('cancel');
    update({ pending: { ...pending, intent: 'cancel' } });
    expect(button('Cancelar pedido pendente')).toBeDisabled();
    update({ pending: { ...pending, state: 'settled' } });
    expect(screen.queryByRole('region', { name: 'Pedido pendente' })).not.toBeInTheDocument();
    expect(button('Enviar pergunta')).toBeEnabled();
  });
  it('advances a single cleanup page without a source body or active host', async () => {
    const { user, controller } = fixture({
      conversation: null,
      conversationRef: null,
      context: null,
      contextRef: null,
      inspection: null,
      cleanup: {
        schemaVersion: 1,
        cleanupId: 'cleanup',
        cleanupToken: hash('c'),
        revision: 1,
        subject: { kind: 'conversation', id: 'conversation', token: hash('4') },
        state: 'deleting',
        phase: 'turn-bodies',
        deletedDocuments: 5,
        createdAt: 1,
        updatedAt: 2,
      },
    });
    await user.click(button('Avançar uma página da limpeza'));
    expect(controller.advanceCleanup).toHaveBeenCalledOnce();
    expect(button('Enviar pergunta')).toBeDisabled();
  });
  it('uses controlled generation props and the explicit BYOK callback without provider credentials', async () => {
    const { user, props, update, controller } = fixture();
    await chooseDropdown(
      user,
      screen.getByRole('combobox', { name: 'Provedor' }),
      'OpenAI com minha chave',
    );
    expect(props.onGenerationChange).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'openai_byok', reasoning: 'auto' }),
    );
    update(
      { turns: [turnFixture({ provider: 'byok', state: 'awaiting-byok' })] },
      {
        generation: { version: 1, provider: 'openai_byok', model: 'gpt-6-luna', reasoning: 'auto' },
      },
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Modelo' }), {
      target: { value: 'gpt-6-sol' },
    });
    expect(props.onGenerationChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ model: 'gpt-6-sol' }),
    );
    await chooseDropdown(user, screen.getByRole('combobox', { name: 'Raciocínio' }), 'Baixo');
    expect(props.onGenerationChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ reasoning: 'low' }),
    );
    expect(props.onRunByok).not.toHaveBeenCalled();
    await user.click(button('Gerar com meu provedor'));
    expect(props.onRunByok).toHaveBeenCalledOnce();
    expect(controller.getByokInput).not.toHaveBeenCalled();
  });
  it('forwards only own draft edits and warns honestly before keyboard close', async () => {
    const { user, props, controller } = fixture();
    fireEvent.change(screen.getByRole('textbox', { name: 'Sua pergunta' }), {
      target: { value: 'Texto meu' },
    });
    expect(controller.setDraft).toHaveBeenCalledWith('Texto meu');
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: 'Fechar o assistente?' })).toBeVisible();
    expect(
      screen.getByText(/O rascunho está apenas na memória desta sessão e pode ser perdido/),
    ).toBeVisible();
    expect(props.onClose).not.toHaveBeenCalled();
    await user.click(button('Fechar agora'));
    expect(props.onClose).toHaveBeenCalledOnce();
  });
  it('resets local confirmation on a scope/actor change and closes directly with no draft/control pending', async () => {
    const { user, update, props } = fixture();
    await user.click(button('Renomear conversa'));
    update({ scopeKey: 'other-user/book/scene', draft: '' });
    expect(screen.queryByRole('dialog', { name: 'Renomear conversa' })).not.toBeInTheDocument();
    props.controller.hasUnsentDraft = false;
    await user.click(button('Fechar painel'));
    expect(props.onClose).toHaveBeenCalledOnce();
  });
  it('renders loading, empty, error and explicit pagination controls without automatic follow-up reads', async () => {
    const { user, controller, update } = fixture({
      conversations: [],
      catalogStatus: 'loading',
      messagesStatus: 'loading',
    });
    expect(screen.getByText('Carregando conversas...')).toBeVisible();
    expect(screen.getByText('Carregando mensagens...')).toBeVisible();
    update({
      catalogStatus: 'error',
      messagesStatus: 'error',
      error: { code: 'functions/unavailable', reason: null, uncertain: false },
    });
    expect(screen.getByText('Nenhuma conversa carregada')).toBeVisible();
    expect(screen.getByText('Nenhuma mensagem carregada')).toBeVisible();
    await user.click(button('Atualizar conversas'));
    expect(controller.refreshConversations).toHaveBeenCalledOnce();
    update({
      catalog: { ...controller.state.catalog!, nextCursor: 'next' },
      messagePage: {
        schemaVersion: 1,
        ownerId: 'user',
        conversationId: 'conversation',
        conversationToken: hash('4'),
        conversationRevision: 1,
        items: [],
        nextCursor: 'next',
      },
      error: { code: 'functions/unavailable', reason: 'context-stale', uncertain: true },
    });
    await user.click(button('Mais conversas'));
    await user.click(button('Mais mensagens'));
    await user.click(button('Conferir controles atuais'));
    expect(controller.loadMoreConversations).toHaveBeenCalledOnce();
    expect(controller.loadMoreMessages).toHaveBeenCalledOnce();
    expect(controller.refreshKnownControl).toHaveBeenCalledOnce();
    expect(screen.getByText(/resultado do pedido ainda precisa ser conferido/)).toBeVisible();
  });
  it('blocks actions under a host restriction and reports BYOK progress without projecting raw provider input', () => {
    const { update } = fixture();
    update({}, { disabledReason: 'Salve o texto para continuar', byokRunning: true });
    expect(button('Enviar pergunta')).toBeDisabled();
    expect(screen.getByText('Salve o texto para continuar')).toBeVisible();
    expect(screen.getByText(/Consultando seu provedor/)).toBeVisible();
  });
});

it('allows explicit closing during a generation without pretending to cancel or stop it', async () => {
  const { user, props, controller, update } = fixture();
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.mocked(controller.send).mockReturnValueOnce(held);
  await user.click(button('Enviar pergunta'));
  update({
    busyAction: 'send',
    stream: { turn: turnFixture({ state: 'running' }), text: 'Provisório' },
  });
  await user.click(button('Fechar painel'));
  await user.click(button('Fechar agora'));
  expect(props.onClose).toHaveBeenCalledOnce();
  expect(controller.stopTurn).not.toHaveBeenCalled();
  expect(controller.recoverPending).not.toHaveBeenCalled();
  await act(async () => {
    release();
    await held;
  });
});

it('blocks sending when the inspected source identity/revision no longer matches the preparation', () => {
  const { update } = fixture();
  expect(button('Enviar pergunta')).toBeEnabled();
  update({ context: contextFixture({ revision: 2 }) });
  expect(button('Enviar pergunta')).toBeDisabled();
  update({ contextRef: { id: 'other-context', token: hash('8') } });
  expect(screen.queryByText('Instrução privada')).not.toBeInTheDocument();
  expect(button('Enviar pergunta')).toBeDisabled();
});

it('does not project BYOK input into the composer or the answer history', () => {
  const { controller } = fixture({
    byokInput: {
      turnId: 'turn',
      attemptToken: hash('e'),
      generation: turnFixture().generation,
      systemInstruction: 'PRIVATE SYSTEM',
      prompt: 'PRIVATE PROVIDER PROMPT',
      context: frozen,
      history: [],
      closureHash: frozen.closure.closureHash,
    },
  });
  expect(screen.queryByText('PRIVATE SYSTEM')).not.toBeInTheDocument();
  expect(screen.queryByText('PRIVATE PROVIDER PROMPT')).not.toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Sua pergunta' })).toHaveValue('Pergunta própria');
  expect(controller.setDraft).not.toHaveBeenCalled();
});

it.each(['context', 'conversation'] as const)(
  'allows explicit %s cleanup without source/host authorization',
  async (kind) => {
    const { user, controller, update } = fixture();
    update({}, { disabledReason: 'A origem não está mais disponível' });
    expect(button('Enviar pergunta')).toBeDisabled();
    expect(button('Renomear conversa')).toBeDisabled();
    await user.click(button(kind === 'context' ? 'Excluir contexto' : 'Excluir conversa'));
    await user.click(button('Confirmar exclusão'));
    expect(
      kind === 'context' ? controller.deleteContext : controller.deleteConversation,
    ).toHaveBeenCalledOnce();
  },
);
