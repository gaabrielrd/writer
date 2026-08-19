import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useChapters } from '../hooks/useChapters';
import * as bookService from '../services/bookService';
import type { Chapter } from '../model/chapter';

describe('useChapters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retorna array vazio quando bookId nao e fornecido e lida com chamadas sem bookId', async () => {
    const { result } = renderHook(() => useChapters(null));

    expect(result.current.loading).toBe(false);
    expect(result.current.chapters).toEqual([]);

    await act(async () => {
      await result.current.refreshChapters();
    });

    await expect(result.current.createChapter({ title: 'Capítulo' })).rejects.toThrow(
      /livro não selecionado/i,
    );

    await act(async () => {
      await result.current.updateChapter('c-1', { title: 'Novo' });
      await result.current.deleteChapter('c-1');
      await result.current.reorderChapters(['c-1']);
    });
  });

  it('carrega capitulos do livro', async () => {
    const mockChapters: Chapter[] = [
      {
        id: 'c-1',
        bookId: 'b-1',
        title: 'Capítulo 1',
        order: 1,
        wordCount: 800,
        content: 'Texto',
        createdAt: 1000,
        updatedAt: 1000,
      },
    ];

    vi.spyOn(bookService, 'listChapters').mockResolvedValue(mockChapters);

    const { result } = renderHook(() => useChapters('b-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.chapters).toHaveLength(1);
    expect(result.current.chapters[0]?.title).toBe('Capítulo 1');
  });

  it('captura erro ao carregar capitulos e permite retentativa', async () => {
    vi.spyOn(bookService, 'listChapters').mockRejectedValueOnce(
      new Error('Erro ao buscar capítulos'),
    );

    const { result } = renderHook(() => useChapters('b-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('Erro ao buscar capítulos');

    vi.spyOn(bookService, 'listChapters').mockResolvedValueOnce([]);

    await act(async () => {
      await result.current.refreshChapters();
    });

    expect(result.current.error).toBeNull();
  });

  it('permite criar, renomear, excluir e reordenar capitulos', async () => {
    const mockChapter: Chapter = {
      id: 'c-1',
      bookId: 'b-1',
      title: 'Cap 1',
      order: 1,
      wordCount: 10,
      content: '',
      createdAt: 1000,
      updatedAt: 1000,
    };

    vi.spyOn(bookService, 'listChapters').mockResolvedValue([]);
    vi.spyOn(bookService, 'createChapter').mockResolvedValue(mockChapter);
    vi.spyOn(bookService, 'updateChapter').mockResolvedValue();
    vi.spyOn(bookService, 'deleteChapter').mockResolvedValue();
    vi.spyOn(bookService, 'reorderChapters').mockResolvedValue();

    const { result } = renderHook(() => useChapters('b-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.createChapter({ title: 'Cap 1' });
    });

    expect(result.current.chapters).toHaveLength(1);

    await act(async () => {
      await result.current.updateChapter('c-1', { title: 'Capítulo Um' });
    });

    expect(result.current.chapters[0]?.title).toBe('Capítulo Um');

    await act(async () => {
      await result.current.reorderChapters(['c-1']);
    });

    await act(async () => {
      await result.current.deleteChapter('c-1');
    });

    expect(result.current.chapters).toHaveLength(0);
  });
});
