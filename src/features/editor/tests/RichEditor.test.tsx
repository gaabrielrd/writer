import { useState } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RichEditor, type RichEditorProps } from '../components/RichEditor';
import type { LoreEntity } from '@/features/lore';
import * as aiAssistantModule from '@/features/ai-assistant';
import * as richText from '@/shared/lib/sanitizeRichText';

vi.mock('@/shared/lib/sanitizeRichText', async () => {
  const actual = await vi.importActual<typeof richText>('@/shared/lib/sanitizeRichText');
  return { ...actual, renderRichText: vi.fn(actual.renderRichText) };
});

vi.mock('@/features/ai-assistant', async () => {
  const actual = await vi.importActual<typeof aiAssistantModule>('@/features/ai-assistant');
  return { ...actual, useAIAutocomplete: vi.fn() };
});

const entities: LoreEntity[] = [
  {
    id: 'e-1',
    bookId: 'b-1',
    name: 'Rei Arthur',
    aliases: ['Arthur', 'Pendragon'],
    category: 'character',
    summary: 'Soberano da Bretanha',
    details: '',
    relations: [],
    isPublic: true,
    createdAt: 1,
    updatedAt: 1,
  },
  {
    id: 'e-2',
    bookId: 'b-1',
    name: 'Excalibur',
    aliases: [],
    category: 'concept',
    summary: 'A lâmina lendária',
    details: '',
    relations: [],
    isPublic: true,
    createdAt: 1,
    updatedAt: 1,
  },
];
const discard = vi.fn();
const accept = vi.fn<() => Promise<string | null>>();
function setup(overrides: Partial<RichEditorProps> = {}) {
  const onChange = vi.fn();
  const props: RichEditorProps = {
    content: 'Era uma vez',
    onChange,
    entities,
    onSelectEntity: vi.fn(),
    isSidebarOpen: false,
    onToggleSidebar: vi.fn(),
    ...overrides,
  };
  const result = render(<RichEditor {...props} />);
  return {
    ...result,
    props,
    onChange,
    editor: screen.getByRole('textbox', { name: 'Área de escrita do capítulo' }),
  };
}
function selectText(editor: HTMLElement, start = 0, end = editor.textContent?.length ?? 0) {
  act(() => {
    editor.focus();
  });
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (!node.parentElement?.closest('[contenteditable="false"]')) nodes.push(node);
  }
  const locate = (offset: number): [Node, number] => {
    for (const node of nodes) {
      if (offset <= node.length) return [node, offset];
      offset -= node.length;
    }
    return [editor, 0];
  };
  const range = document.createRange();
  range.setStart(...locate(start));
  range.setEnd(...locate(end));
  window.getSelection()?.removeAllRanges();
  window.getSelection()?.addRange(range);
  fireEvent(document, new Event('selectionchange'));
}

beforeAll(() => {
  // jsdom has no layout; these geometry methods are available in actual browsers.
  const rect = {
    left: 0,
    right: 100,
    top: 0,
    bottom: 20,
    width: 100,
    height: 20,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  };
  if (!Range.prototype.getBoundingClientRect) Range.prototype.getBoundingClientRect = () => rect;
  if (!Range.prototype.getClientRects)
    Range.prototype.getClientRects = () => Object.assign([rect], { item: () => rect });
  window.scrollBy = vi.fn();
  if (!document.elementFromPoint) document.elementFromPoint = () => document.body;
});
beforeEach(() => {
  vi.clearAllMocks();
  accept.mockResolvedValue('continuação segura');
  vi.mocked(aiAssistantModule.useAIAutocomplete).mockReturnValue({
    suggestion: null,
    isLoading: false,
    isAccepting: false,
    error: null,
    acceptSuggestion: accept,
    discardSuggestion: discard,
    triggerManualAutocomplete: vi.fn(),
  });
});

describe('RichEditor WYSIWYG', () => {
  it('atualiza o minimapa após substituição externa, troca de lore e edição sem salvar ao navegar', async () => {
    const { props, rerender, onChange, editor } = setup({ content: '# Início\n\nArthur voltou.' });
    const map = screen.getByRole('listbox', { name: 'Trechos do capítulo' });
    await waitFor(() =>
      expect(map.querySelector('[role="option"]')).toHaveAttribute('aria-setsize', '3'),
    );
    fireEvent.keyDown(map, { key: 'End' });
    expect(map.querySelector('[role="option"]')).toHaveTextContent('Personagem: Rei Arthur');
    rerender(<RichEditor {...props} entities={[]} content="<h2>Outro capítulo</h2>" />);
    await waitFor(() =>
      expect(map.querySelector('[role="option"]')).toHaveAttribute('aria-setsize', '1'),
    );
    fireEvent.keyDown(map, { key: 'Home' });
    expect(map.querySelector('[role="option"]')).toHaveTextContent(
      'Título nível 2: Outro capítulo',
    );
    expect(onChange).not.toHaveBeenCalled();
    await userEvent.setup().click(screen.getByLabelText('Título Principal'));
    expect(editor.querySelector('h1')).toHaveTextContent('Outro capítulo');
    await waitFor(() =>
      expect(map.querySelector('[role="option"]')).toHaveTextContent(
        'Título nível 1: Outro capítulo',
      ),
    );
  });

  it('mostra ações para a seleção, fecha por Escape e só reaparece após nova seleção', async () => {
    const { editor, onChange } = setup();
    expect(
      screen.queryByRole('toolbar', { name: 'Assistente IA para o texto selecionado' }),
    ).not.toBeInTheDocument();
    selectText(editor, 0, 3);
    await screen.findByRole('toolbar', { name: 'Assistente IA para o texto selecionado' });
    fireEvent.keyDown(editor, { key: 'Enter', altKey: true });
    expect(screen.getByRole('button', { name: 'Continuar Cena' })).toHaveFocus();
    // Tooltips can consume the bubbling Escape; selection dismissal must still run.
    document.activeElement!.addEventListener('keydown', (event) => event.stopPropagation(), {
      once: true,
    });
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    await waitFor(() =>
      expect(
        screen.queryByRole('toolbar', { name: 'Assistente IA para o texto selecionado' }),
      ).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(editor).toHaveFocus());
    selectText(editor, 3, 3);
    await waitFor(() =>
      expect(
        screen.queryByRole('toolbar', { name: 'Assistente IA para o texto selecionado' }),
      ).not.toBeInTheDocument(),
    );
    selectText(editor, 0, 3);
    await screen.findByRole('toolbar', { name: 'Assistente IA para o texto selecionado' });
    selectText(editor, 3, 3);
    await waitFor(() =>
      expect(
        screen.queryByRole('toolbar', { name: 'Assistente IA para o texto selecionado' }),
      ).not.toBeInTheDocument(),
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it('abre Markdown legado com formatação real sem gravar migração ao abrir', () => {
    const { editor, onChange } = setup({
      content:
        '# Capítulo I\n\n**Arthur** falou *baixo*.\n\n> Uma citação\n\n- Primeiro\n- Segundo',
    });
    expect(editor.querySelector('h1')).toHaveTextContent('Capítulo I');
    expect(editor.querySelector('strong')).toHaveTextContent('Arthur');
    expect(editor.querySelector('em')).toHaveTextContent('baixo');
    expect(editor.querySelector('blockquote')).toHaveTextContent('Uma citação');
    expect(editor.querySelectorAll('li')).toHaveLength(2);
    expect(editor).toHaveAttribute('contenteditable', 'true');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('abre HTML importado sanitizado e mantém estrutura, sem executar conteúdo ativo', () => {
    const { editor, onChange } = setup({
      content:
        '<h2>Importado</h2><p><strong>Arthur</strong> e <em>Excalibur</em></p><script>bad()</script><img src=x onerror=bad()><a href="javascript:bad()">link</a>',
    });
    expect(editor.querySelector('h2')).toHaveTextContent('Importado');
    expect(editor.querySelector('strong')).toHaveTextContent('Arthur');
    expect(editor.querySelector('script,img,[onerror],[href^="javascript:"]')).toBeNull();
    expect(editor).not.toHaveTextContent('bad()');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('formata a seleção real, mantém seleção e oferece desfazer/refazer', async () => {
    const user = userEvent.setup({ delay: null });
    const { editor, onChange } = setup();
    selectText(editor, 0, 3);
    await user.click(screen.getByRole('button', { name: 'Negrito' }));
    await waitFor(() => expect(editor.querySelector('strong')).toHaveTextContent('Era'));
    expect(window.getSelection()?.toString()).toBe('Era');
    expect(onChange).toHaveBeenLastCalledWith('<p><strong>Era</strong> uma vez</p>');
    await user.click(screen.getByRole('button', { name: 'Desfazer' }));
    expect(editor.querySelector('strong')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Refazer' }));
    expect(editor.querySelector('strong')).toHaveTextContent('Era');
  });

  it('atalhos Ctrl+B e Ctrl+I geram HTML sem marcadores visíveis', async () => {
    const user = userEvent.setup({ delay: null });
    const { editor } = setup();
    selectText(editor, 0, 3);
    await user.keyboard('{Control>}b{/Control}');
    await waitFor(() => expect(editor.querySelector('strong')).toHaveTextContent('Era'));
    await user.keyboard('{Control>}i{/Control}');
    expect(editor.querySelector('em')).toHaveTextContent('Era');
    expect(editor).not.toHaveTextContent('**');
  });

  it('aplica títulos, citação e travessão sem inserir texto fictício', async () => {
    const user = userEvent.setup({ delay: null });
    const { editor } = setup();
    await user.click(screen.getByLabelText('Título Principal'));
    expect(editor.querySelector('h1')).toHaveTextContent('Era uma vez');
    await user.click(screen.getByLabelText('Subtítulo'));
    expect(editor.querySelector('h2')).toHaveTextContent('Era uma vez');
    await user.click(screen.getByLabelText('Citação'));
    expect(editor.querySelector('blockquote')).toHaveTextContent('Era uma vez');
    await user.click(screen.getByLabelText('Travessão de Diálogo'));
    expect(editor).toHaveTextContent('— Era uma vez');
    expect(editor).not.toHaveTextContent('texto');
  });

  it('destaca nome/apelido enquanto escreve, mostra tooltip e abre ficha sem salvar marcações', async () => {
    const user = userEvent.setup({ delay: null });
    const onSelectEntity = vi.fn();
    const { editor, onChange } = setup({ content: 'Arthur empunhou Excalibur.', onSelectEntity });
    const term = screen.getByRole('button', { name: 'Ver ficha de Rei Arthur' });
    await user.hover(term);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Soberano da Bretanha');
    expect(screen.getByRole('tooltip')).toHaveTextContent('Personagem');
    await user.click(term);
    expect(onSelectEntity).toHaveBeenCalledWith(entities[0]);
    await user.unhover(term);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    selectText(editor, 0, 6);
    await user.click(screen.getByRole('button', { name: 'Negrito' }));
    expect(onChange).toHaveBeenLastCalledWith('<p><strong>Arthur</strong> empunhou Excalibur.</p>');
  });

  it('mantém escrita, formatação e lore disponíveis sem seletor de modos nem gravação ao abrir', () => {
    const { editor, onChange } = setup({ content: '**Arthur** escreve.' });
    expect(screen.queryByRole('group', { name: 'Modo do editor' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Preview' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edição' })).not.toBeInTheDocument();
    expect(editor).toHaveAttribute('aria-readonly', 'false');
    expect(editor.querySelector('strong')).toHaveTextContent('Arthur');
    expect(screen.getByRole('button', { name: 'Ver ficha de Rei Arthur' })).toBeInTheDocument();
    expect(editor).toHaveAttribute('contenteditable', 'true');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('abre menções, navega por teclado e insere entidade com seleção preservada', async () => {
    const user = userEvent.setup({ delay: null });
    const { editor, onChange } = setup({ content: '' });
    await user.click(screen.getByRole('button', { name: 'Mencionar Lore' }));
    await waitFor(() => expect(editor).toHaveFocus());
    expect(
      screen.getByRole('listbox', { name: 'Sugestões de menção do compêndio' }),
    ).toBeInTheDocument();
    await user.keyboard('{ArrowDown}{ArrowUp}{Enter}');
    expect(editor).toHaveTextContent('Rei Arthur');
    expect(onChange).toHaveBeenLastCalledWith('<p>Rei Arthur </p>');
    expect(
      screen.queryByRole('listbox', { name: 'Sugestões de menção do compêndio' }),
    ).not.toBeInTheDocument();
  });

  it('oferece criação de termo desconhecido e Escape fecha até sem resultados', async () => {
    const user = userEvent.setup({ delay: null });
    const onCreateEntity = vi.fn();
    const { editor } = setup({ content: '@Avalon', onCreateEntity });
    selectText(editor, 7, 7);
    await waitFor(() =>
      expect(screen.getByRole('option', { name: /Criar “Avalon”/ })).toHaveTextContent(
        'Criar “Avalon”',
      ),
    );
    await user.keyboard('{Enter}');
    expect(onCreateEntity).toHaveBeenCalledWith('Avalon');
    expect(editor).toHaveTextContent('@Avalon');
    expect(
      screen.queryByRole('listbox', { name: 'Sugestões de menção do compêndio' }),
    ).not.toBeInTheDocument();
  });

  it('fecha menções vazias com Escape e não intercepta composição IME', async () => {
    const user = userEvent.setup({ delay: null });
    const { editor } = setup({ content: '@ninguém' });
    selectText(editor, 8, 8);
    await waitFor(() =>
      expect(
        screen.getByRole('listbox', { name: 'Sugestões de menção do compêndio' }),
      ).toBeInTheDocument(),
    );
    fireEvent.compositionStart(editor);
    fireEvent.keyDown(editor, { key: 'Enter', keyCode: 229, isComposing: true });
    expect(
      screen.getByRole('listbox', { name: 'Sugestões de menção do compêndio' }),
    ).toBeInTheDocument();
    fireEvent.compositionEnd(editor);
    await new Promise((resolve) => setTimeout(resolve, 550));
    await user.keyboard('{Escape}');
    expect(
      screen.queryByRole('listbox', { name: 'Sugestões de menção do compêndio' }),
    ).not.toBeInTheDocument();
  });

  it('cola HTML seguro com seleção mantida, removendo scripts e URLs ativas', async () => {
    const { editor, onChange } = setup({ content: 'Antes depois' });
    selectText(editor, 6, 6);
    fireEvent.paste(editor, {
      clipboardData: {
        getData: (format: string) =>
          format === 'text/html'
            ? '<b>colado</b><script>roubar()</script><a href="javascript:roubar()">link</a>'
            : format === 'text/plain'
              ? 'coladolink'
              : '',
        files: [],
        types: ['text/html', 'text/plain'],
      },
    });
    await waitFor(() => expect(editor.querySelector('strong')).toHaveTextContent('colado'));
    expect(editor).toHaveTextContent('Antes coladolinkdepois');
    expect(editor.querySelector('script,[href^="javascript:"]')).toBeNull();
    expect(onChange).toHaveBeenLastCalledWith('<p>Antes <strong>colado</strong>linkdepois</p>');
  });

  it('digitação e eco de autosave preservam o cursor e histórico', async () => {
    const user = userEvent.setup({ delay: null });
    const changed = vi.fn();
    function ControlledEditor() {
      const [content, setContent] = useState('Um fim');
      return (
        <RichEditor
          content={content}
          onChange={(value) => {
            changed(value);
            setContent(value);
          }}
          entities={entities}
          onSelectEntity={vi.fn()}
          isSidebarOpen={false}
          onToggleSidebar={vi.fn()}
        />
      );
    }
    render(<ControlledEditor />);
    expect(richText.renderRichText).toHaveBeenCalledTimes(1);
    const editor = screen.getByRole('textbox');
    selectText(editor, 3, 3);
    await user.keyboard('novo ');
    await waitFor(() => expect(editor).toHaveTextContent('Um novo fim'));
    expect(changed).toHaveBeenLastCalledWith('<p>Um novo fim</p>');
    await user.click(screen.getByRole('button', { name: 'Desfazer' }));
    expect(editor).toHaveTextContent('Um fim');
    expect(richText.renderRichText).toHaveBeenCalledTimes(1);
  });

  it('sanitiza novamente uma substituição externa sem repetir a análise nos renders internos', () => {
    const { props, editor, rerender, onChange } = setup({ content: '# Original' });
    expect(richText.renderRichText).toHaveBeenCalledTimes(1);
    rerender(<RichEditor {...props} content="<h2>Texto atualizado</h2><script>bad()</script>" />);
    expect(editor.querySelector('h2')).toHaveTextContent('Texto atualizado');
    expect(editor.querySelector('script')).toBeNull();
    expect(editor).not.toHaveTextContent('bad()');
    expect(richText.renderRichText).toHaveBeenCalledTimes(2);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('aceita sugestão uma única vez e bloqueia edição enquanto aplica', async () => {
    let resolve!: (text: string | null) => void;
    accept.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    vi.mocked(aiAssistantModule.useAIAutocomplete).mockReturnValue({
      suggestion: 'continuação segura',
      isLoading: false,
      isAccepting: false,
      error: null,
      acceptSuggestion: accept,
      discardSuggestion: discard,
      triggerManualAutocomplete: vi.fn(),
    });
    const user = userEvent.setup({ delay: null });
    const onBusyChange = vi.fn();
    const { editor, onChange } = setup({ onBusyChange });
    expect(editor.querySelector('.writer-ai-ghost')).toHaveTextContent('continuação segura');
    expect(onChange).not.toHaveBeenCalled();
    selectText(editor, 11, 11);
    await user.keyboard('{Tab}');
    expect(editor).toHaveAttribute('contenteditable', 'false');
    await user.click(screen.getByRole('button', { name: /aceitar/i }));
    expect(accept).toHaveBeenCalledTimes(1);
    act(() => {
      resolve('continuação segura');
    });
    await waitFor(() => expect(editor).toHaveTextContent('Era uma vez continuação segura'));
    expect(editor).toHaveAttribute('contenteditable', 'true');
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
    expect(onChange).toHaveBeenLastCalledWith('<p>Era uma vez continuação segura</p>');
  });

  it('libera Escape ocioso para o workspace após alternar tela cheia sem remontagem', () => {
    const view = setup();
    const original = view.editor;
    view.rerender(<RichEditor {...view.props} workspaceExpanded />);
    act(() => original.focus());
    const idle = new KeyboardEvent('keydown', {
      key: 'Escape',
      keyCode: 27,
      bubbles: true,
      cancelable: true,
    });
    fireEvent(original, idle);
    expect(idle.defaultPrevented).toBe(false);
    expect(screen.getByLabelText('Área de escrita do capítulo')).toBe(original);
    expect(discard).toHaveBeenCalled();
  });

  it('consome Escape quando uma sugestão está aberta na tela cheia', () => {
    vi.mocked(aiAssistantModule.useAIAutocomplete).mockReturnValue({
      suggestion: 'continuação segura',
      isLoading: false,
      isAccepting: false,
      error: null,
      triggerManualAutocomplete: vi.fn(),
      acceptSuggestion: accept,
      discardSuggestion: discard,
    });
    const { editor } = setup({ workspaceExpanded: true });
    act(() => editor.focus());
    const key = new KeyboardEvent('keydown', {
      key: 'Escape',
      keyCode: 27,
      bubbles: true,
      cancelable: true,
    });
    fireEvent(editor, key);
    expect(key.defaultPrevented).toBe(true);
    expect(discard).toHaveBeenCalled();
  });

  it('abre assistência, remove configurações da barra e descarta respostas com Escape', async () => {
    const user = userEvent.setup({ delay: null });
    const { editor } = setup();
    editor.focus();
    await user.keyboard('{Escape}');
    expect(discard).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /Abrir Assistente Criativo de IA/i }));
    expect(screen.getByRole('heading', { name: 'Assistente Criativo de IA' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(
      screen.queryByRole('button', { name: /configurações de ia e chaves de api/i }),
    ).not.toBeInTheDocument();
  });
});

it('aceita rótulo contextual de cena preservando prosa formatada sem gravar ao abrir', () => {
  const onChange = vi.fn();
  render(
    <RichEditor
      ariaLabel="Área de escrita da cena"
      content="<p><strong>Lia</strong> observa o farol.</p>"
      onChange={onChange}
      entities={[]}
      onSelectEntity={vi.fn()}
      isSidebarOpen={false}
      onToggleSidebar={vi.fn()}
      aiUnavailableReason="A assistência de IA ainda não está disponível para cenas."
    />,
  );
  const area = screen.getByRole('textbox', { name: 'Área de escrita da cena' });
  expect(area.querySelector('strong')).toHaveTextContent('Lia');
  expect(area).toHaveTextContent('observa o farol');
  expect(onChange).not.toHaveBeenCalled();
});

it('restaura cursor e preserva digitação ao fechar lore antes do frame atrasado de foco', async () => {
  const originalGlobalFrame = globalThis.requestAnimationFrame;
  const originalWindowFrame = Object.getOwnPropertyDescriptor(window, 'requestAnimationFrame');
  const originalGlobalCancel = globalThis.cancelAnimationFrame;
  const originalWindowCancel = Object.getOwnPropertyDescriptor(window, 'cancelAnimationFrame');
  const frames = new Map<number, FrameRequestCallback>();
  let frameId = 0;
  const queueFrame = (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback);
    return frameId;
  };
  const cancelFrame = (id: number) => {
    frames.delete(id);
  };
  const mobile = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 Android');
  const changed = vi.fn();
  const initial = '<p><strong>Arthur</strong> observa o cais.</p>';
  function LoreWorkspace() {
    const [sidebar, setSidebar] = useState(false);
    const [content, setContent] = useState(initial);
    return (
      <>
        <RichEditor
          content={content}
          onChange={(value) => {
            changed(value);
            setContent(value);
          }}
          entities={entities}
          onSelectEntity={() => setSidebar(true)}
          isSidebarOpen={sidebar}
          onToggleSidebar={() => setSidebar((value) => !value)}
          aiUnavailableReason="A assistência de IA ainda não está disponível para cenas."
        />
        {sidebar && (
          <aside aria-label="Ficha de lore">
            <p>Texto da ficha de Arthur</p>
            <button onClick={() => setSidebar(false)}>Fechar lore</button>
          </aside>
        )}
      </>
    );
  }
  let mounted: ReturnType<typeof render> | undefined;
  try {
    mounted = render(<LoreWorkspace />);
    const area = screen.getByRole('textbox', { name: 'Área de escrita do capítulo' });
    const user = userEvent.setup({ delay: null });
    selectText(area, 3, 3);
    await user.click(screen.getByRole('button', { name: 'Ver ficha de Rei Arthur' }));
    // jsdom does not implement native ControlEnd. A DOM range represents the
    // user's text selection in the lore panel, which is then removed on close.
    const panelText = screen.getByText('Texto da ficha de Arthur');
    const range = document.createRange();
    range.selectNodeContents(panelText);
    const selection = window.getSelection();
    if (!selection) throw new Error('Seleção DOM indisponível');
    selection.removeAllRanges();
    selection.addRange(range);
    globalThis.requestAnimationFrame = window.requestAnimationFrame = queueFrame;
    globalThis.cancelAnimationFrame = window.cancelAnimationFrame = cancelFrame;
    fireEvent.click(screen.getByRole('button', { name: 'Fechar lore' }));
    expect(screen.queryByRole('complementary', { name: 'Ficha de lore' })).not.toBeInTheDocument();
    expect(area).toHaveFocus();
    expect(area.contains(selection.anchorNode)).toBe(true);
    expect(selection.isCollapsed).toBe(true);
    expect(changed).not.toHaveBeenCalled();
    // Simulate the native caret move before the browser delivers selectionchange.
    // No ProseMirror transaction is dispatched: this is the pending-event window
    // of the real gesture, not a claim that jsdom implements native ControlEnd.
    const walker = document.createTreeWalker(area, NodeFilter.SHOW_TEXT);
    let endNode: Text | null = null;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node instanceof Text && !node.parentElement?.closest('[contenteditable="false"]'))
        endNode = node;
    }
    if (!endNode) throw new Error('Prosa final indisponível');
    selection.collapse(endNode, endNode.length);
    act(() => {
      const pending = [...frames.values()];
      frames.clear();
      for (const callback of pending) callback(performance.now());
    });
    expect(selection.focusNode).toBe(endNode);
    expect(selection.focusOffset).toBe(endNode.length);
    fireEvent(document, new Event('selectionchange'));
    await user.keyboard('LUZ');
    await waitFor(() => expect(area).toHaveTextContent('Arthur observa o cais.LUZ'));
    expect(area.querySelector('strong')).toHaveTextContent('Arthur');
    expect(changed).toHaveBeenLastCalledWith('<p><strong>Arthur</strong> observa o cais.LUZ</p>');
    await user.click(screen.getByRole('button', { name: 'Desfazer' }));
    expect(area).toHaveTextContent('Arthur observa o cais.');
    expect(area.querySelector('strong')).toHaveTextContent('Arthur');
  } finally {
    mounted?.unmount();
    frames.clear();
    globalThis.requestAnimationFrame = originalGlobalFrame;
    if (originalWindowFrame)
      Object.defineProperty(window, 'requestAnimationFrame', originalWindowFrame);
    else Reflect.deleteProperty(window, 'requestAnimationFrame');
    globalThis.cancelAnimationFrame = originalGlobalCancel;
    if (originalWindowCancel)
      Object.defineProperty(window, 'cancelAnimationFrame', originalWindowCancel);
    else Reflect.deleteProperty(window, 'cancelAnimationFrame');
    mobile.mockRestore();
    window.getSelection()?.removeAllRanges();
  }
});

it('mantém uma restauração externa como passo próprio de desfazer e a próxima edição como passo separado', async () => {
  const user = userEvent.setup();
  const { props, rerender, onChange, editor } = setup({ content: '<p>Antes da restauração</p>' });
  rerender(<RichEditor {...props} content="<p>Versão restaurada</p>" externalContentVersion={1} />);
  await waitFor(() => expect(editor).toHaveTextContent('Versão restaurada'));
  expect(onChange).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: /^Desfazer$/ }));
  expect(editor).toHaveTextContent('Antes da restauração');
  expect(onChange).toHaveBeenLastCalledWith('<p>Antes da restauração</p>');
  await user.click(screen.getByRole('button', { name: /^Refazer$/ }));
  expect(editor).toHaveTextContent('Versão restaurada');
  selectText(editor, editor.textContent.length, editor.textContent.length);
  await user.keyboard('!');
  await waitFor(() => expect(editor).toHaveTextContent('Versão restaurada!'));
  await user.click(screen.getByRole('button', { name: /^Desfazer$/ }));
  expect(editor).toHaveTextContent('Versão restaurada');
});
it('bloqueia prosa, formatação e desfazer enquanto uma operação externa aguarda confirmação', async () => {
  const user = userEvent.setup();
  const { props, rerender, onChange, editor } = setup({
    content: '<p>Preservado</p>',
    externalBusy: true,
  });
  expect(editor).toHaveAttribute('contenteditable', 'false');
  expect(editor).toHaveAttribute('aria-readonly', 'true');
  expect(screen.getByRole('button', { name: /^Negrito$/ })).toBeDisabled();
  expect(screen.getByRole('button', { name: /^Desfazer$/ })).toBeDisabled();
  await user.click(editor);
  await user.keyboard('Não gravar');
  expect(onChange).not.toHaveBeenCalled();
  rerender(<RichEditor {...props} externalBusy={false} />);
  expect(editor).toHaveAttribute('contenteditable', 'true');
  expect(editor).toHaveTextContent('Preservado');
});
