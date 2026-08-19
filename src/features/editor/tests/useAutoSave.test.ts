import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAutoSave } from '../hooks/useAutoSave';
import * as storage from '../services/chapterContentStorage';

describe('useAutoSave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('inicia com status saved e salva com debounce ao alterar conteudo', async () => {
    const saveSpy = vi.spyOn(storage, 'saveChapterContent').mockResolvedValue({ wordCount: 5 });
    const onSaved = vi.fn();

    const { result, rerender } = renderHook(
      ({ content }) =>
        useAutoSave({
          bookId: 'b-1',
          chapterId: 'c-1',
          content,
          debounceMs: 500,
          onSaved,
        }),
      {
        initialProps: { content: 'Texto inicial' },
      },
    );

    expect(result.current.saveStatus).toBe('saved');
    expect(saveSpy).not.toHaveBeenCalled();

    // Atualiza conteúdo
    rerender({ content: 'Texto alterado com novas ideias' });
    expect(result.current.saveStatus).toBe('unsaved');

    // Avança tempo do debounce
    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });

    expect(saveSpy).toHaveBeenCalledWith('b-1', 'c-1', 'Texto alterado com novas ideias');
    expect(result.current.saveStatus).toBe('saved');
    expect(onSaved).toHaveBeenCalledWith(5);
    expect(result.current.lastSavedAt).not.toBeNull();
  });

  it('permite salvar imediatamente com saveNow', async () => {
    const saveSpy = vi.spyOn(storage, 'saveChapterContent').mockResolvedValue({ wordCount: 3 });

    const { result, rerender } = renderHook(
      ({ content }) =>
        useAutoSave({
          bookId: 'b-1',
          chapterId: 'c-1',
          content,
          debounceMs: 5000,
        }),
      {
        initialProps: { content: 'Apenas um rascunho' },
      },
    );

    rerender({ content: 'Texto modificado' });
    expect(result.current.saveStatus).toBe('unsaved');

    await act(async () => {
      await result.current.saveNow();
    });

    expect(saveSpy).toHaveBeenCalledWith('b-1', 'c-1', 'Texto modificado');
    expect(result.current.saveStatus).toBe('saved');
  });

  it('lida com erros na persistencia e atualiza status para error', async () => {
    vi.spyOn(storage, 'saveChapterContent').mockRejectedValue(new Error('Erro no Firestore'));

    const { result, rerender } = renderHook(
      ({ content }) =>
        useAutoSave({
          bookId: 'b-1',
          chapterId: 'c-1',
          content,
          debounceMs: 500,
        }),
      {
        initialProps: { content: 'Início' },
      },
    );

    rerender({ content: 'Falha iminente' });

    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });

    expect(result.current.saveStatus).toBe('error');
    expect(result.current.error).toBe('Erro no Firestore');
  });
});
