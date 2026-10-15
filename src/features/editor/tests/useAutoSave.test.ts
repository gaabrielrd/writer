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
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.saveStatus).toBe('unsaved');

    // Avança tempo do debounce
    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });

    expect(saveSpy).toHaveBeenCalledWith(
      'b-1',
      'c-1',
      'Texto alterado com novas ideias',
      expect.any(Function),
      undefined,
    );
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
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.saveStatus).toBe('unsaved');

    await act(async () => {
      await result.current.saveNow();
    });

    expect(saveSpy).toHaveBeenCalledWith(
      'b-1',
      'c-1',
      'Texto modificado',
      expect.any(Function),
      undefined,
    );
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
      await Promise.resolve();
    });

    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });

    expect(result.current.saveStatus).toBe('error');
    expect(result.current.error).toBe('Erro no Firestore');
  });
});

describe('autosave recovery and ordering', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.restoreAllMocks();
  });
  afterEach(() => vi.useRealTimers());
  it('flushes dirty text for the captured chapter on unmount', async () => {
    const save = vi.spyOn(storage, 'saveChapterContent').mockResolvedValue({ wordCount: 2 });
    const { rerender, unmount } = renderHook(
      ({ content }) =>
        useAutoSave({ bookId: 'old-book', chapterId: 'old-chapter', ownerId: 'author', content }),
      { initialProps: { content: 'initial' } },
    );
    rerender({ content: 'unsaved last line' });
    await act(async () => {
      await Promise.resolve();
    });
    expect(localStorage.getItem('writer:draft:author:old-book:old-chapter')).toContain(
      'unsaved last line',
    );
    unmount();
    await act(async () => {
      await Promise.resolve();
    });
    expect(save).toHaveBeenCalledWith(
      'old-book',
      'old-chapter',
      'unsaved last line',
      expect.any(Function),
      'author',
    );
    expect(localStorage.getItem('writer:draft:author:old-book:old-chapter')).toBeNull();
  });
  it('serializes writes and never marks newer edits saved by an older response', async () => {
    let finish!: (value: { wordCount: number }) => void;
    const save = vi
      .spyOn(storage, 'saveChapterContent')
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve;
        }),
      )
      .mockResolvedValue({ wordCount: 3 });
    const { result, rerender } = renderHook(
      ({ content }) =>
        useAutoSave({ bookId: 'b', chapterId: 'c', ownerId: 'a', content, debounceMs: 10 }),
      { initialProps: { content: 'initial' } },
    );
    rerender({ content: 'first' });
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(10);
      await Promise.resolve();
    });
    rerender({ content: 'second latest' });
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(10);
      await Promise.resolve();
    });
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish({ wordCount: 1 });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(save).toHaveBeenLastCalledWith('b', 'c', 'second latest', expect.any(Function), 'a');
    expect(result.current.saveStatus).toBe('saved');
    expect(localStorage.getItem('writer:draft:a:b:c')).toBeNull();
  });
  it('retains recoverable text after network rejection and retries explicitly', async () => {
    const save = vi
      .spyOn(storage, 'saveChapterContent')
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ wordCount: 2 });
    const { result, rerender } = renderHook(
      ({ content }) =>
        useAutoSave({ bookId: 'b', chapterId: 'c', ownerId: 'a', content, debounceMs: 10 }),
      { initialProps: { content: 'initial' } },
    );
    rerender({ content: 'recover me' });
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(10);
      await Promise.resolve();
    });
    expect(result.current.saveStatus).toBe('error');
    expect(localStorage.getItem('writer:draft:a:b:c')).toContain('recover me');
    await act(() => result.current.saveNow());
    expect(save).toHaveBeenCalledTimes(2);
    expect(result.current.saveStatus).toBe('saved');
  });
  it('does not save while chapter data is loading', async () => {
    const save = vi.spyOn(storage, 'saveChapterContent').mockResolvedValue({ wordCount: 0 });
    const { rerender, unmount } = renderHook(
      ({ content }) => useAutoSave({ bookId: 'b', chapterId: 'c', enabled: false, content }),
      { initialProps: { content: '' } },
    );
    rerender({ content: 'not yet loaded' });
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });
    unmount();
    expect(save).not.toHaveBeenCalled();
  });
});

it('salva a reversao ao texto anterior depois da resposta pendente', async () => {
  vi.useFakeTimers();
  vi.restoreAllMocks();
  let finish!: (value: { wordCount: number }) => void;
  const save = vi
    .spyOn(storage, 'saveChapterContent')
    .mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    )
    .mockResolvedValue({ wordCount: 1 });
  const { result, rerender, unmount } = renderHook(
    ({ content }) =>
      useAutoSave({ bookId: 'revert', chapterId: 'c', ownerId: 'a', content, debounceMs: 10 }),
    { initialProps: { content: 'A' } },
  );
  rerender({ content: 'B' });
  await act(async () => {
    vi.advanceTimersByTime(10);
    await Promise.resolve();
  });
  rerender({ content: 'A' });
  expect(localStorage.getItem('writer:draft:a:revert:c')).toContain('A');
  await act(async () => {
    finish({ wordCount: 1 });
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(save).toHaveBeenLastCalledWith('revert', 'c', 'A', expect.any(Function), 'a');
  expect(result.current.saveStatus).toBe('saved');
  unmount();
  vi.useRealTimers();
});

it('enfileira texto final antes da nova sessao e nunca drena sessao antiga depois', async () => {
  vi.useFakeTimers();
  vi.restoreAllMocks();
  let finish!: (value: { wordCount: number }) => void;
  const save = vi
    .spyOn(storage, 'saveChapterContent')
    .mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    )
    .mockResolvedValue({ wordCount: 1 });
  const old = renderHook(
    ({ content }) =>
      useAutoSave({
        bookId: 'book',
        chapterId: 'chapter',
        ownerId: 'owner',
        content,
        debounceMs: 10,
      }),
    { initialProps: { content: '' } },
  );
  old.rerender({ content: 'A' });
  await act(async () => {
    vi.advanceTimersByTime(10);
    await Promise.resolve();
  });
  old.rerender({ content: 'B' });
  old.unmount();
  expect(save.mock.calls.map((call) => call[2])).toEqual(['A', 'B']);
  const next = renderHook(
    ({ content }) =>
      useAutoSave({
        bookId: 'book',
        chapterId: 'chapter',
        ownerId: 'owner',
        content,
        debounceMs: 10,
      }),
    { initialProps: { content: '' } },
  );
  next.rerender({ content: 'C' });
  await act(() => next.result.current.saveNow());
  await act(async () => {
    finish({ wordCount: 1 });
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(save.mock.calls.map((call) => call[2])).toEqual(['A', 'B', 'C']);
  next.unmount();
  vi.useRealTimers();
});

describe('aceite de texto confirmado pelo histórico', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.restoreAllMocks();
  });
  afterEach(() => vi.useRealTimers());
  it('não regrava o texto anterior ao desmontar imediatamente após uma restauração', () => {
    const save = vi.spyOn(storage, 'saveChapterContent').mockResolvedValue({ wordCount: 2 });
    const { result, unmount } = renderHook(() =>
      useAutoSave({ bookId: 'b', chapterId: 'c', content: 'Texto anterior' }),
    );
    act(() => {
      result.current.acceptConfirmedContent('Texto restaurado');
      expect(result.current.getConfirmedContent()).toBe('Texto restaurado');
      unmount();
    });
    expect(save).not.toHaveBeenCalled();
  });
  it('recusa substituir a base enquanto um salvamento ainda não foi confirmado', async () => {
    let resolve!: (value: { wordCount: number }) => void;
    const pending = new Promise<{ wordCount: number }>((done) => {
      resolve = done;
    });
    vi.spyOn(storage, 'saveChapterContent').mockReturnValue(pending);
    const { result, rerender } = renderHook(
      ({ content }) => useAutoSave({ bookId: 'b', chapterId: 'c', content, debounceMs: 10 }),
      { initialProps: { content: 'Anterior' } },
    );
    rerender({ content: 'Em gravação' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(result.current.getConfirmedContent()).toBeNull();
    expect(() => result.current.acceptConfirmedContent('Restauração')).toThrow(
      /confirmação do salvamento/,
    );
    expect(result.current.getSavedContent()).toBe('Anterior');
    await act(async () => {
      resolve({ wordCount: 2 });
      await pending;
    });
    expect(result.current.getConfirmedContent()).toBe('Em gravação');
  });
  it('usa o texto restaurado como base CAS da edição seguinte sem autosave da restauração', async () => {
    let observedBase: string | undefined;
    const save = vi
      .spyOn(storage, 'saveChapterContent')
      .mockImplementation((_bookId, _chapterId, _content, base) => {
        observedBase = typeof base === 'function' ? base() : base;
        return Promise.resolve({ wordCount: 3 });
      });
    const { result, rerender } = renderHook(
      ({ content }) => useAutoSave({ bookId: 'b', chapterId: 'c', content, debounceMs: 10 }),
      { initialProps: { content: 'Anterior' } },
    );
    act(() => result.current.acceptConfirmedContent('Restaurado'));
    rerender({ content: 'Restaurado' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });
    expect(save).not.toHaveBeenCalled();
    rerender({ content: 'Edição depois da restauração' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(save).toHaveBeenCalledOnce();
    expect(observedBase).toBe('Restaurado');
    expect(save).toHaveBeenCalledWith(
      'b',
      'c',
      'Edição depois da restauração',
      expect.any(Function),
      undefined,
    );
  });
});
