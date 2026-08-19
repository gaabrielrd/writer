import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useBooks } from '../hooks/useBooks';
import * as bookService from '../services/bookService';
import type { Book } from '../model/book';

describe('useBooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retorna array vazio quando authorId nao e fornecido e lida com refreshBooks e criacao sem autor', async () => {
    const { result } = renderHook(() => useBooks(null));

    expect(result.current.loading).toBe(false);
    expect(result.current.books).toEqual([]);

    await act(async () => {
      await result.current.refreshBooks();
    });

    await expect(result.current.createBook({ title: 'Sem autor' })).rejects.toThrow(
      /autor não autenticado/i,
    );
  });

  it('carrega livros do autor com sucesso', async () => {
    const mockBooks: Book[] = [
      {
        id: 'b-1',
        authorId: 'auth-1',
        title: 'Livro 1',
        genre: 'Fantasia',
        synopsis: 'Sinopse',
        coverUrl: null,
        status: 'draft',
        wordCount: 1200,
        createdAt: 1000,
        updatedAt: 1000,
      },
    ];

    vi.spyOn(bookService, 'listBooksByAuthor').mockResolvedValue(mockBooks);

    const { result } = renderHook(() => useBooks('auth-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.books).toHaveLength(1);
    expect(result.current.books[0]?.title).toBe('Livro 1');
  });

  it('captura erro ao carregar livros e permite retentativa com refreshBooks', async () => {
    vi.spyOn(bookService, 'listBooksByAuthor').mockRejectedValueOnce(
      new Error('Erro de conexão com Firestore'),
    );

    const { result } = renderHook(() => useBooks('auth-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('Erro de conexão com Firestore');

    // Retentativa com sucesso
    vi.spyOn(bookService, 'listBooksByAuthor').mockResolvedValueOnce([]);

    await act(async () => {
      await result.current.refreshBooks();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.books).toEqual([]);
  });

  it('lida com criacao, atualizacao e exclusao de livros', async () => {
    const mockBook: Book = {
      id: 'b-new',
      authorId: 'auth-1',
      title: 'Novo Livro',
      genre: 'Aventura',
      synopsis: '',
      coverUrl: null,
      status: 'draft',
      wordCount: 0,
      createdAt: 1000,
      updatedAt: 1000,
    };

    vi.spyOn(bookService, 'listBooksByAuthor').mockResolvedValue([]);
    vi.spyOn(bookService, 'createBook').mockResolvedValue(mockBook);
    vi.spyOn(bookService, 'updateBook').mockResolvedValue();
    vi.spyOn(bookService, 'deleteBook').mockResolvedValue();

    const { result } = renderHook(() => useBooks('auth-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.createBook({ title: 'Novo Livro' });
    });

    expect(result.current.books).toHaveLength(1);

    await act(async () => {
      await result.current.updateBook('b-new', { title: 'Livro Editado' });
    });

    expect(result.current.books[0]?.title).toBe('Livro Editado');

    await act(async () => {
      await result.current.deleteBook('b-new');
    });

    expect(result.current.books).toHaveLength(0);
  });
});
