import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { RichEditor, type RichEditorProps } from '../components/RichEditor';
import type { AIActionMenuProps } from '@/features/ai-assistant';
import * as ai from '@/features/ai-assistant';

const adapter = vi.hoisted(() => ({ current: null as AIActionMenuProps | null }));
vi.mock('@/features/ai-assistant', async () => {
  const actual = await vi.importActual<typeof ai>('@/features/ai-assistant');
  return {
    ...actual,
    useAIAutocomplete: vi.fn(),
    AIActionMenu: (props: AIActionMenuProps) => {
      adapter.current = props;
      return null;
    },
  };
});

beforeAll(() => {
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
  if (!document.elementFromPoint) document.elementFromPoint = () => document.body;
  window.scrollBy = vi.fn();
});
beforeEach(() => {
  vi.clearAllMocks();
  adapter.current = null;
  vi.mocked(ai.useAIAutocomplete).mockReturnValue({
    suggestion: null,
    isLoading: false,
    isAccepting: false,
    error: null,
    acceptSuggestion: vi.fn().mockResolvedValue(null),
    discardSuggestion: vi.fn(),
    triggerManualAutocomplete: vi.fn(),
  });
});

function setup(content: string, extra: Partial<RichEditorProps> = {}) {
  const onChange = vi.fn();
  const onBusyChange = vi.fn();
  const props: RichEditorProps = {
    content,
    documentId: 'chapter-ai',
    onChange,
    onBusyChange,
    entities: [],
    onSelectEntity: vi.fn(),
    isSidebarOpen: false,
    onToggleSidebar: vi.fn(),
    userId: 'author',
    userCredits: 5,
    ...extra,
  };
  const rendered = render(<RichEditor {...props} />);
  return {
    ...rendered,
    props,
    onChange,
    onBusyChange,
    editor: screen.getByRole('textbox', { name: 'Área de escrita do capítulo' }),
  };
}
function menu(): AIActionMenuProps {
  if (!adapter.current) throw new Error('The editor did not mount its AI adapter.');
  return adapter.current;
}
function select(editor: HTMLElement, from: number, to: number) {
  act(() => {
    editor.focus();
  });
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
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
  range.setStart(...locate(from));
  range.setEnd(...locate(to));
  window.getSelection()?.removeAllRanges();
  window.getSelection()?.addRange(range);
  fireEvent(document, new Event('selectionchange'));
}

describe('RichEditor AI integration boundary', () => {
  it('captures real selected text and plain chapter context, then preserves surrounding formatting on replacement', async () => {
    const { editor, onChange, onBusyChange } = setup(
      '<p><strong>Antes</strong> alvo <em>depois</em>.</p>',
    );
    select(editor, 6, 10);
    await waitFor(() => expect(menu().onGetSelectedText?.()).toBe('alvo'));
    expect(menu().onGetContextText?.()).toBe('Antes alvo depois.');
    expect(menu().onCanApplyResult?.()).toBe(true);
    act(() => {
      menu().onApplyingChange?.(true);
    });
    expect(editor).toHaveAttribute('contenteditable', 'false');
    expect(onBusyChange).toHaveBeenLastCalledWith(true);
    act(() => {
      expect(menu().onReplaceSelection('novo trecho')).toBe(true);
    });
    expect(editor).not.toHaveTextContent('alvo');
    expect(editor).toHaveTextContent('novo trecho');
    expect(editor.querySelector('strong')).toHaveTextContent('Antes');
    expect(editor.querySelector('em')).toHaveTextContent('depois');
    expect(onChange).toHaveBeenCalled();
    act(() => {
      menu().onApplyingChange?.(false);
    });
    expect(editor).toHaveAttribute('contenteditable', 'true');
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
    expect(menu().onCanApplyResult?.()).toBe(false);
  });

  it('inserts model output as literal text, never active HTML, and consumes the captured target once', async () => {
    const { editor, onChange } = setup('<p>Um começo.</p>');
    select(editor, 10, 10);
    await waitFor(() => expect(menu().onGetSelectedText?.()).toBe(''));
    const output = '<script>alert(1)</script>\nOutra linha & conteúdo';
    act(() => {
      expect(menu().onInsertText(output)).toBe(true);
    });
    expect(editor).toHaveTextContent('<script>alert(1)</script>');
    expect(editor).toHaveTextContent('Outra linha & conteúdo');
    expect(editor.querySelector('script')).toBeNull();
    const saved = onChange.mock.lastCall?.[0] as string;
    expect(saved).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    const count = onChange.mock.calls.length;
    act(() => {
      expect(menu().onInsertText(output)).toBe(false);
    });
    expect(onChange).toHaveBeenCalledTimes(count);
  });

  it('rejects an old captured selection after a document update instead of overwriting newer writing', async () => {
    const { editor, props, rerender, onChange } = setup('<p>Texto anterior.</p>');
    select(editor, 0, 5);
    await waitFor(() => expect(menu().onGetSelectedText?.()).toBe('Texto'));
    rerender(<RichEditor {...props} content="<p>Manuscrito mais recente.</p>" />);
    await waitFor(() => expect(editor).toHaveTextContent('Manuscrito mais recente.'));
    expect(menu().onCanApplyResult?.()).toBe(false);
    act(() => {
      expect(menu().onReplaceSelection('Resultado antigo')).toBe(false);
      expect(menu().onInsertText('Resultado antigo')).toBe(false);
    });
    expect(editor).not.toHaveTextContent('Resultado antigo');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('rejects an uncaptured target and a destroyed editor without emitting content', async () => {
    const { editor, onChange, unmount } = setup('<p>Texto.</p>');
    expect(menu().onCanApplyResult?.()).toBe(false);
    expect(menu().onReplaceSelection('Sem alvo')).toBe(false);
    select(editor, 0, 5);
    menu().onGetSelectedText?.();
    const pending = menu();
    unmount();
    await waitFor(() => expect(pending.onCanApplyResult?.()).toBe(false));
    expect(pending.onInsertText('Após sair')).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('RichEditor explicit AI capabilities', () => {
  it('keeps legacy autocomplete/menu enabled by default', () => {
    setup('<p>Texto próprio.</p>');
    expect(adapter.current).not.toBeNull();
    expect(vi.mocked(ai.useAIAutocomplete).mock.lastCall?.[0].enabled).toBe(true);
  });
  it('offers chat independently of autocomplete and legacy actions, with its own availability reason', async () => {
    const onOpenChat = vi.fn();
    const onEditorChatBridge = vi.fn();
    const { editor } = setup('<p>Texto próprio.</p>', {
      onOpenChat,
      onEditorChatBridge,
      aiCapabilities: { chat: true, autocomplete: false, legacyActions: false },
      aiUnavailableReason: 'Autocomplete indisponível.',
      chatUnavailableReason: null,
    });
    expect(adapter.current).toBeNull();
    expect(vi.mocked(ai.useAIAutocomplete).mock.lastCall?.[0].enabled).toBe(false);
    const button = screen.getByRole('button', { name: 'Abrir Assistente Criativo de IA' });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onOpenChat).toHaveBeenCalledWith(undefined);
    expect(onEditorChatBridge.mock.lastCall?.[0]).toBeTruthy();
    select(editor, 0, 5);
    await waitFor(() =>
      expect(document.querySelector('[data-editor-selection-actions]')).not.toBeNull(),
    );
    const action = document.querySelector<HTMLButtonElement>(
      '[data-editor-selection-actions] button',
    )!;
    fireEvent.click(action);
    expect(onOpenChat).toHaveBeenCalledTimes(2);
  });
  it('removes launcher, selection actions and bridges when chat capability is removed, without a legacy fallback', async () => {
    const onOpenChat = vi.fn();
    const onEditorChatBridge = vi.fn();
    const onChatBridge = vi.fn();
    const { props, rerender, editor } = setup('<p>Texto próprio.</p>', {
      onOpenChat,
      onEditorChatBridge,
      onChatBridge,
      aiCapabilities: { chat: true, autocomplete: false, legacyActions: false },
    });
    select(editor, 0, 5);
    await waitFor(() =>
      expect(document.querySelector('[data-editor-selection-actions]')).not.toBeNull(),
    );
    rerender(
      <RichEditor
        {...props}
        aiCapabilities={{ chat: false, autocomplete: false, legacyActions: false }}
      />,
    );
    expect(
      screen.queryByRole('button', { name: 'Abrir Assistente Criativo de IA' }),
    ).not.toBeInTheDocument();
    expect(document.querySelector('[data-editor-selection-actions]')).toBeNull();
    expect(onEditorChatBridge).toHaveBeenLastCalledWith(null);
    expect(onChatBridge).toHaveBeenLastCalledWith(null);
    expect(adapter.current).toBeNull();
    fireEvent.keyDown(editor, { key: '/' });
    fireEvent.keyDown(editor, { key: 'Enter', altKey: true });
    expect(onOpenChat).not.toHaveBeenCalled();
  });
  it('does not mount legacy actions when explicitly disabled without a chat callback', () => {
    setup('<p>Texto próprio.</p>', {
      aiCapabilities: { legacyActions: false, autocomplete: false },
    });
    expect(adapter.current).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Abrir Assistente Criativo de IA' }),
    ).not.toBeInTheDocument();
  });
  it('blocks a retained legacy apply callback as soon as its capability is removed', () => {
    const { props, rerender, editor, onChange } = setup('<p>Texto próprio.</p>');
    select(editor, 0, 5);
    const pending = menu();
    pending.onGetSelectedText?.();
    expect(pending.onCanApplyResult?.()).toBe(true);
    rerender(<RichEditor {...props} aiCapabilities={{ legacyActions: false }} />);
    expect(pending.onCanApplyResult?.()).toBe(false);
    expect(pending.onReplaceSelection('Resposta antiga')).toBe(false);
    expect(pending.onGetSelectedText?.()).toBe('');
    expect(onChange).not.toHaveBeenCalled();
  });
  it('masks and discards a prior ghost when capabilities change and never accepts it by click or Tab', () => {
    const acceptSuggestion = vi.fn().mockResolvedValue('Resultado');
    const discardSuggestion = vi.fn();
    vi.mocked(ai.useAIAutocomplete).mockReturnValue({
      suggestion: 'Resultado',
      isLoading: false,
      isAccepting: false,
      error: null,
      acceptSuggestion,
      discardSuggestion,
      triggerManualAutocomplete: vi.fn(),
    });
    const { props, rerender, editor, onChange } = setup('<p>Texto próprio.</p>');
    expect(screen.getByRole('button', { name: 'Aceitar sugestão' })).toBeInTheDocument();
    const oldButton = screen.getByRole('button', { name: 'Aceitar sugestão' });
    rerender(<RichEditor {...props} aiCapabilities={{ autocomplete: false }} />);
    expect(vi.mocked(ai.useAIAutocomplete).mock.lastCall?.[0].enabled).toBe(false);
    expect(screen.queryByRole('button', { name: 'Aceitar sugestão' })).not.toBeInTheDocument();
    expect(document.querySelector('.writer-ai-ghost')).toBeNull();
    expect(discardSuggestion).toHaveBeenCalled();
    fireEvent.click(oldButton);
    fireEvent.keyDown(editor, { key: 'Tab' });
    expect(acceptSuggestion).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });
  it('retains the external readonly state when the new bridge releases its own busy state', () => {
    const onEditorChatBridge = vi.fn();
    const { editor } = setup('<p>Texto próprio.</p>', {
      externalBusy: true,
      onEditorChatBridge,
      aiCapabilities: { autocomplete: false, legacyActions: false },
    });
    const bridge = onEditorChatBridge.mock.lastCall?.[0] as ai.EditorChatEditorBridge;
    act(() => {
      bridge.setBusy(true);
      bridge.setBusy(false);
    });
    expect(editor).toHaveAttribute('contenteditable', 'false');
  });
});

it('restores selection actions after revoking an open legacy menu and switching to chat', async () => {
  const onOpenChat = vi.fn();
  const { props, rerender, editor } = setup('<p>Texto próprio.</p>', {
    aiCapabilities: { autocomplete: false },
  });
  act(() => {
    menu().onOpenChange?.(true);
  });
  select(editor, 0, 5);
  expect(document.querySelector('[data-editor-selection-actions]')).toBeNull();
  rerender(
    <RichEditor
      {...props}
      onOpenChat={onOpenChat}
      aiCapabilities={{ chat: true, autocomplete: false, legacyActions: false }}
    />,
  );
  await waitFor(() =>
    expect(document.querySelector('[data-editor-selection-actions]')).not.toBeNull(),
  );
  fireEvent.click(
    document.querySelector<HTMLButtonElement>('[data-editor-selection-actions] button')!,
  );
  expect(onOpenChat).toHaveBeenCalledWith('continue');
});
