import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { RichEditor } from '@/features/editor';
import { generateAIResponse } from '../services/aiClient';
import { deductCredit } from '../services/creditsService';

vi.mock('../services/aiClient');
vi.mock('../services/creditsService');

// JSDOM não fornece edição/seleção nativas por teclado. Entregamos os eventos
// de entrada e a alteração DOM correspondente, sem comandos do ProseMirror.
function typeText(editor: HTMLElement, text: string) {
  for (const character of text) {
    const selection = window.getSelection();
    const node = selection?.focusNode;
    if (!selection || !(node instanceof Text)) throw new Error('A escrita exige cursor na prosa.');
    const offset = selection.focusOffset;
    fireEvent.keyDown(editor, { key: character });
    fireEvent(
      editor,
      new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: character,
      }),
    );
    node.insertData(offset, character);
    selection.collapse(node, offset + character.length);
    fireEvent.input(editor, { inputType: 'insertText', data: character });
    fireEvent.keyUp(editor, { key: character });
    // Notifica a edição real ao observador antes da próxima intenção do usuário.
    fireEvent(document, new Event('selectionchange'));
  }
}
function navigateBackAndForth(editor: HTMLElement) {
  const selection = window.getSelection();
  const node = selection?.focusNode;
  const offset = selection?.focusOffset;
  if (!selection || !(node instanceof Text) || offset === undefined || offset < 1)
    throw new Error('A navegação exige cursor depois da prosa.');
  fireEvent.keyDown(editor, { key: 'ArrowLeft', keyCode: 37, shiftKey: true });
  selection.setBaseAndExtent(node, offset, node, offset - 1);
  fireEvent.keyUp(editor, { key: 'ArrowLeft', keyCode: 37, shiftKey: true });
  fireEvent.keyDown(editor, { key: 'ArrowRight', keyCode: 39 });
  selection.collapse(node, offset);
  fireEvent.keyUp(editor, { key: 'ArrowRight', keyCode: 39 });
  // A notificação coalescida só chega depois que o cursor voltou ao original.
  fireEvent(document, new Event('selectionchange'));
  return { selection, node, offset };
}

it.each(['após 50 ms', 'antes dos efeitos passivos', 'Escape antes dos efeitos passivos'] as const)(
  'cancela a pausa por intenção %s e espera nova digitação sem alterar a prosa',
  async (timing) => {
    const rangeRect = Object.getOwnPropertyDescriptor(Range.prototype, 'getBoundingClientRect');
    const rangeRects = Object.getOwnPropertyDescriptor(Range.prototype, 'getClientRects');
    const elementFromPoint = Object.getOwnPropertyDescriptor(document, 'elementFromPoint');
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
    Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: () => rect,
    });
    Object.defineProperty(Range.prototype, 'getClientRects', {
      configurable: true,
      value: () => Object.assign([rect], { item: () => rect }),
    });
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => document.body,
    });
    const scroll = vi.spyOn(window, 'scrollBy').mockImplementation(() => undefined);
    vi.useFakeTimers();
    vi.mocked(generateAIResponse).mockResolvedValue('A noite trouxe uma nova descoberta.');
    const onChange = vi.fn();
    function WritingSession() {
      const [content, setContent] = useState('<p><strong>Antes</strong> Lia observa o cais.</p>');
      return (
        <RichEditor
          content={content}
          onChange={(next) => {
            onChange(next);
            setContent(next);
          }}
          entities={[]}
          onSelectEntity={() => undefined}
          isSidebarOpen={false}
          onToggleSidebar={() => undefined}
          userId="author"
          userCredits={5}
        />
      );
    }
    const rendered = render(<WritingSession />);
    try {
      const editor = screen.getByRole('textbox', { name: 'Área de escrita do capítulo' });
      const textNode = editor.querySelector('p')?.lastChild;
      if (!(textNode instanceof Text)) throw new Error('A prosa deve terminar em um nó de texto.');
      const selection = window.getSelection();
      if (!selection) throw new Error('A seleção nativa deve estar disponível.');
      act(() => {
        editor.focus();
        const range = document.createRange();
        range.setStart(textNode, textNode.length);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        fireEvent(document, new Event('selectionchange'));
        vi.advanceTimersByTime(20);
      });
      act(() => {
        typeText(editor, ' Mais texto.');
        if (timing === 'antes dos efeitos passivos') navigateBackAndForth(editor);
        if (timing === 'Escape antes dos efeitos passivos') {
          fireEvent.keyDown(editor, { key: 'Escape', keyCode: 27 });
          fireEvent.keyUp(editor, { key: 'Escape', keyCode: 27 });
        }
      });
      const written = '<p><strong>Antes</strong> Lia observa o cais. Mais texto.</p>';
      expect(onChange).toHaveBeenLastCalledWith(written);
      expect(generateAIResponse).not.toHaveBeenCalled();
      if (timing === 'após 50 ms') {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(50);
        });
        act(() => {
          navigateBackAndForth(editor);
        });
      }
      expect(editor.innerHTML).toBe(written);
      expect(selection.isCollapsed).toBe(true);
      expect(selection.focusNode).toBe(editor.querySelector('p')?.lastChild);
      expect(selection.focusOffset).toBe(selection.focusNode?.textContent?.length);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(650);
      });
      expect(generateAIResponse).not.toHaveBeenCalled();
      expect(
        screen.queryByLabelText('Sugestão de IA para continuação do texto'),
      ).not.toBeInTheDocument();
      expect(onChange).toHaveBeenLastCalledWith(written);
      act(() => {
        typeText(editor, ' Ainda há luz.');
      });
      const continued =
        '<p><strong>Antes</strong> Lia observa o cais. Mais texto. Ainda há luz.</p>';
      expect(onChange).toHaveBeenLastCalledWith(continued);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(650);
      });
      expect(generateAIResponse).toHaveBeenCalledTimes(1);
      expect(screen.getByLabelText('Sugestão de IA para continuação do texto')).toBeVisible();
      expect(editor.querySelector('strong')).toHaveTextContent('Antes');
      expect(onChange).toHaveBeenLastCalledWith(continued);
      expect(deductCredit).not.toHaveBeenCalled();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(850);
      });
      expect(generateAIResponse).toHaveBeenCalledTimes(1);
    } finally {
      rendered.unmount();
      window.getSelection()?.removeAllRanges();
      vi.clearAllTimers();
      vi.useRealTimers();
      scroll.mockRestore();
      if (rangeRect) Object.defineProperty(Range.prototype, 'getBoundingClientRect', rangeRect);
      else Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect');
      if (rangeRects) Object.defineProperty(Range.prototype, 'getClientRects', rangeRects);
      else Reflect.deleteProperty(Range.prototype, 'getClientRects');
      if (elementFromPoint) Object.defineProperty(document, 'elementFromPoint', elementFromPoint);
      else Reflect.deleteProperty(document, 'elementFromPoint');
      vi.clearAllMocks();
    }
  },
);
