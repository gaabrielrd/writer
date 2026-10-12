import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChapterChatPanel } from '../components/ChapterChatPanel';
import type { ChatContext, ChatEditorBridge, ChatMessage, ChatPage } from '../model/chapterChat';
import * as service from '../services/chapterChatService';
import userEvent from '@testing-library/user-event';

vi.mock('../services/chapterChatService', () => ({
  loadChapterChat: vi.fn(),
  createChapterChat: vi.fn(),
  sendChapterChat: vi.fn(),
  chapterChatCall: vi.fn(),
}));
vi.mock('../hooks/useAIConfig', () => ({ useAIConfig: () => ({ provider: 'firebase_ai' }) }));
const context: ChatContext = {
  source: 'selection',
  text: 'Lia observa o porto.',
  surrounding: '',
  title: 'Capítulo',
  bookTitle: 'Livro',
  persona: { instruction: '', version: '' },
  lore: [],
  truncated: false,
  target: { hash: 'a'.repeat(64), from: 1, to: 20 },
};
const authorMessage: ChatMessage = {
  id: 'request-user',
  role: 'user',
  state: 'done',
  text: '/estilo ',
  context,
  createdAt: 1,
};
const assistantMessage: ChatMessage = {
  id: 'request',
  role: 'assistant',
  state: 'done',
  text: 'Analisei a passagem.',
  suggestion: 'Novo trecho.',
  provider: 'platform',
  context,
  createdAt: 2,
};
let page: ChatPage;
const scrollTo = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  page = {
    conversation: { id: 'chat', title: 'Conversa', draft: '', updatedAt: 1 },
    conversations: [{ id: 'chat', title: 'Conversa', draft: '', updatedAt: 1 }],
    messages: [],
    before: null,
  };
  vi.mocked(service.loadChapterChat).mockImplementation(() =>
    Promise.resolve(structuredClone(page)),
  );
  vi.mocked(service.createChapterChat).mockResolvedValue({ id: 'new-chat' });
  vi.mocked(service.chapterChatCall).mockResolvedValue({});
  vi.mocked(service.sendChapterChat).mockImplementation((_identity, request, chunk) => {
    chunk('Parcial');
    const message = { ...assistantMessage, id: request.requestId };
    page.messages = [
      {
        ...authorMessage,
        id: `${request.requestId}-user`,
        text: request.text,
        context: request.context,
      },
      message,
    ];
    return Promise.resolve(message);
  });
  HTMLElement.prototype.scrollTo = scrollTo;
});
async function setup(overrides: Partial<React.ComponentProps<typeof ChapterChatPanel>> = {}) {
  const bridge: ChatEditorBridge = {
    capture: vi.fn().mockResolvedValue(context),
    preview: vi.fn().mockReturnValue(context),
    prepare: vi.fn(),
    setBusy: vi.fn(),
    focus: vi.fn(),
  };
  const onApply = vi.fn().mockResolvedValue(undefined),
    onClose = vi.fn();
  const props = {
    open: true,
    uid: 'author',
    bookId: 'book',
    chapterId: 'chapter',
    bridge,
    onClose,
    onApply,
    ...overrides,
  };
  const rendered = render(<ChapterChatPanel {...props} />);
  await waitFor(() => expect(screen.getByLabelText('Mensagem para o Assistente IA')).toBeEnabled());
  return {
    ...rendered,
    props,
    bridge,
    onApply,
    onClose,
    input: screen.getByLabelText('Mensagem para o Assistente IA'),
  };
}
describe('chat do capítulo', () => {
  it('permite escolher contexto, desfazer a fixação e navegar no catálogo com setas e Tab', async () => {
    const ui = await setup();
    await userEvent.click(screen.getByRole('combobox', { name: 'Origem do contexto' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Capítulo' }));
    fireEvent.change(ui.input, { target: { value: 'Resuma' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    await screen.findByText('Novo trecho.');
    expect(ui.bridge.capture).toHaveBeenCalledWith('chapter');
    fireEvent.click(screen.getByRole('button', { name: 'Seleção' }));
    const dialog = await screen.findByRole('dialog', { name: 'Contexto e comandos' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Usar contexto atual' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.change(ui.input, { target: { value: '/' } });
    fireEvent.keyDown(ui.input, { key: 'ArrowDown' });
    fireEvent.keyDown(ui.input, { key: 'ArrowUp' });
    fireEvent.keyDown(ui.input, { key: 'Tab' });
    expect(ui.input).toHaveValue('/continuar ');
    fireEvent.change(ui.input, { target: { value: '/' } });
    fireEvent.keyDown(ui.input, { key: 'Escape' });
    expect(screen.queryByRole('listbox', { name: 'Comandos do assistente' })).toBeNull();
    fireEvent.change(ui.input, { target: { value: '/ide' } });
    fireEvent.click(screen.getByRole('option', { name: /\/ideias/ }));
    expect(ui.input).toHaveValue('/ideias ');
    fireEvent.change(ui.input, { target: { value: '/contexto invalido' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    await screen.findByText(/Use \/contexto selecao/);
  });
  it('troca e cria conversas preservando rascunhos, com paginação da lista', async () => {
    page.moreConversations = true;
    page.conversations.push({
      id: 'other',
      title: 'Outra conversa',
      draft: 'Outro rascunho',
      updatedAt: 0,
    });
    vi.mocked(service.loadChapterChat).mockImplementation((identity, pagination) =>
      Promise.resolve(
        pagination?.conversationsBefore !== undefined
          ? {
              ...page,
              conversations: [{ id: 'older', title: 'Antiga conversa', draft: '', updatedAt: -1 }],
              moreConversations: false,
            }
          : {
              ...page,
              conversation:
                page.conversations.find((item) => item.id === identity.conversationId) ??
                page.conversation,
            },
      ),
    );
    const ui = await setup();
    fireEvent.change(ui.input, { target: { value: 'Meu rascunho' } });
    await userEvent.click(screen.getByRole('combobox', { name: 'Conversas deste capítulo' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Outra conversa' }));
    await waitFor(() => expect(ui.input).toHaveValue('Outro rascunho'));
    expect(service.chapterChatCall).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'chat' }),
      { action: 'draft', draft: 'Meu rascunho' },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Mais conversas' }));
    await waitFor(() =>
      expect(service.loadChapterChat).toHaveBeenCalledWith(expect.anything(), {
        conversationsBefore: 0,
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Nova conversa' }));
    await waitFor(() => expect(service.createChapterChat).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Fechar painel de IA' }));
    expect(ui.onClose).toHaveBeenCalled();
  });
  it('avisa sobre novas mensagens quando o autor consulta o histórico anterior', async () => {
    page.messages = [authorMessage, assistantMessage];
    const ui = await setup();
    const region = screen.getByRole('region', { name: 'Mensagens da conversa' });
    Object.defineProperties(region, {
      scrollHeight: { configurable: true, value: 1000 },
      clientHeight: { configurable: true, value: 100 },
      scrollTop: { configurable: true, writable: true, value: 0 },
    });
    fireEvent.scroll(region);
    fireEvent.change(ui.input, { target: { value: 'Pedido novo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    const button = await screen.findByRole('button', { name: 'Novas mensagens' });
    fireEvent.click(button);
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Novas mensagens' })).toBeNull(),
    );
    expect(scrollTo).toHaveBeenCalledWith({ top: 1000 });
  });
  it('renderiza respostas formatadas sem permitir conteúdo ativo do modelo', async () => {
    page.messages = [
      {
        ...assistantMessage,
        text: '**Resposta**\n\n- Uma ideia\n- Outra ideia\n\n<script>alert(1)</script><img src="https://example.test/image.png" onerror="alert(1)">',
        suggestion: undefined,
      },
    ];
    await setup();
    expect(await screen.findByText('Resposta')).toBeVisible();
    expect(screen.getByText('Uma ideia')).toBeVisible();
    expect(document.querySelector('script, img')).toBeNull();
  });
  it('prepara comandos pelo teclado, envia contexto e aplica apenas após aceite', async () => {
    const ui = await setup();
    fireEvent.change(ui.input, { target: { value: '/est' } });
    fireEvent.keyDown(ui.input, { key: 'Enter' });
    expect(ui.input).toHaveValue('/estilo ');
    expect(service.sendChapterChat).not.toHaveBeenCalled();
    fireEvent.keyDown(ui.input, { key: 'Enter' });
    await screen.findByText('Novo trecho.');
    expect(ui.onApply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Substituir trecho' }));
    await waitFor(() => expect(ui.onApply).toHaveBeenCalledTimes(1));
    expect(ui.onApply.mock.calls[0]![0]).toMatchObject({ target: context.target, replace: true });
    expect(await screen.findByText('Sugestão já paga: reaplicar sem débito.')).toBeVisible();
  });
  it('mantém rascunho ao fechar e reabrir, interpreta contexto/ajuda sem gerar', async () => {
    const ui = await setup();
    fireEvent.change(ui.input, { target: { value: 'Rascunho' } });
    ui.rerender(<ChapterChatPanel {...ui.props} open={false} />);
    expect(screen.queryByRole('complementary')).toBeNull();
    ui.rerender(<ChapterChatPanel {...ui.props} />);
    ui.input = screen.getByLabelText('Mensagem para o Assistente IA');
    expect(ui.input).toHaveValue('Rascunho');
    fireEvent.change(ui.input, { target: { value: '/contexto viewport' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    await waitFor(() => expect(ui.input).toHaveValue(''));
    fireEvent.change(ui.input, { target: { value: '/ajuda ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    await screen.findByRole('dialog', { name: 'Contexto e comandos' });
    expect(service.sendChapterChat).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Fixar contexto' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('button', { name: 'Contexto fixado' })).toBeVisible();
  });
  it('mostra comando inválido e respeita Shift+Enter e composição IME', async () => {
    const ui = await setup();
    fireEvent.change(ui.input, { target: { value: '/unknown ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    await screen.findByText(/Comando desconhecido/);
    fireEvent.change(ui.input, { target: { value: 'Pedido' } });
    fireEvent.keyDown(ui.input, { key: 'Enter', shiftKey: true });
    fireEvent.keyDown(ui.input, { key: 'Enter', isComposing: true });
    expect(service.sendChapterChat).not.toHaveBeenCalled();
    fireEvent.keyDown(ui.input, { key: 'Escape' });
    expect(ui.onClose).toHaveBeenCalled();
    expect(ui.bridge.focus).toHaveBeenCalled();
  });
  it('preserva falha e recupera o mesmo pedido em retry', async () => {
    vi.mocked(service.sendChapterChat).mockRejectedValueOnce(new Error('Falha de rede'));
    const ui = await setup();
    fireEvent.change(ui.input, { target: { value: 'Pedido' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    await screen.findByText('Falha de rede');
    const requestId = vi.mocked(service.sendChapterChat).mock.calls[0]![1].requestId;
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await screen.findByText('Novo trecho.');
    expect(vi.mocked(service.sendChapterChat).mock.calls[1]![1].requestId).toBe(requestId);
  });
  it('oferece novo destino com prévia e mantém falha de aplicação sem marcar como paga', async () => {
    page.messages = [authorMessage, assistantMessage];
    const onApply = vi.fn().mockRejectedValue(new Error('O trecho mudou.'));
    const ui = await setup({ onApply });
    fireEvent.click(screen.getByRole('button', { name: 'Substituir trecho' }));
    await screen.findByText('O trecho mudou.');
    fireEvent.click(screen.getByRole('button', { name: 'Novo destino' }));
    const dialog = await screen.findByRole('dialog', { name: 'Aplicar em novo destino?' });
    expect(dialog).toHaveTextContent(context.text);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar aplicação' }));
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('Sugestão já paga: reaplicar sem débito.')).toBeNull();
    expect(ui.bridge.capture).toHaveBeenCalled();
  });
  it('copia sem cobrar, edita com confirmação, regenera e exclui somente a conversa', async () => {
    page.messages = [authorMessage, assistantMessage];
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    await setup();
    fireEvent.click(screen.getByRole('button', { name: 'Copiar' }));
    await screen.findByRole('button', { name: 'Copiado' });
    expect(service.chapterChatCall).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'apply' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Editar pedido' }));
    const edit = await screen.findByRole('dialog', { name: 'Editar pedido?' });
    fireEvent.click(within(edit).getByRole('button', { name: 'Editar pedido' }));
    await waitFor(() =>
      expect(service.chapterChatCall).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: 'edit' }),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Regenerar resposta' }));
    await waitFor(() => expect(service.sendChapterChat).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Opções da conversa' })).toBeEnabled(),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Opções da conversa' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Excluir conversa' }));
    const remove = await screen.findByRole('dialog', { name: 'Excluir conversa?' });
    fireEvent.click(within(remove).getByRole('button', { name: 'Excluir conversa' }));
    await waitFor(() =>
      expect(service.chapterChatCall).toHaveBeenCalledWith(expect.anything(), { action: 'delete' }),
    );
  });
  it('interrompe uma resposta e não mostra resultado tardio', async () => {
    let finish: (message: ChatMessage) => void = () => undefined;
    vi.mocked(service.sendChapterChat).mockImplementation((_id, _request, chunk) => {
      chunk('Parcial');
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    const ui = await setup();
    fireEvent.change(ui.input, { target: { value: 'Pedido' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    await screen.findByRole('button', { name: 'Parar' });
    fireEvent.click(screen.getByRole('button', { name: 'Parar' }));
    await waitFor(() =>
      expect(service.chapterChatCall).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: 'stop' }),
      ),
    );
    await act(async () => {
      finish(assistantMessage);
      await Promise.resolve();
    });
    expect(screen.queryByText('Novo trecho.')).toBeNull();
  });
  it('inicia uma conversa, prepara ação contextual e pagina mensagens', async () => {
    page.conversation = null;
    page.conversations = [];
    page.before = 5;
    const ui = await setup({ initialPrompt: { id: 1, text: '/continuar ', context } });
    await waitFor(() => expect(ui.input).toHaveValue('/continuar '));
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    await waitFor(() => expect(service.createChapterChat).toHaveBeenCalled());
    await screen.findByText('Novo trecho.');
    fireEvent.click(screen.getByRole('button', { name: 'Mensagens anteriores' }));
    await waitFor(() =>
      expect(service.loadChapterChat).toHaveBeenCalledWith(expect.anything(), { before: 5 }),
    );
  });
  it('mantém a nova resposta ativa quando a geração interrompida termina ou envia chunks tardios', async () => {
    const finishes: ((message: ChatMessage) => void)[] = [];
    const chunks: ((text: string) => void)[] = [];
    vi.mocked(service.sendChapterChat).mockImplementation((_id, _request, chunk) => {
      chunks.push(chunk);
      chunk(`Parcial ${chunks.length}`);
      return new Promise((resolve) => finishes.push(resolve));
    });
    const ui = await setup();
    fireEvent.change(ui.input, { target: { value: 'Primeiro pedido' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    await screen.findByText('Parcial 1');
    fireEvent.click(screen.getByRole('button', { name: 'Parar' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Parar' })).toBeNull());
    await waitFor(() => expect(service.loadChapterChat).toHaveBeenCalledTimes(2));
    fireEvent.change(ui.input, { target: { value: 'Segundo pedido' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    await screen.findByText('Parcial 2');
    await act(async () => {
      chunks[0]!('Texto tardio');
      finishes[0]!(assistantMessage);
      await Promise.resolve();
    });
    expect(screen.getByRole('button', { name: 'Parar' })).toBeVisible();
    expect(screen.getByText('Parcial 2')).toBeVisible();
    expect(screen.queryByText(/Texto tardio/)).toBeNull();
    expect(screen.queryByText('Novo trecho.')).toBeNull();
  });
});
