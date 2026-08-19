import { useState, useEffect, useCallback } from 'react';
import type { Book, CreateBookInput, UpdateBookInput } from '../model/book';
import * as bookService from '../services/bookService';

export interface UseBooksResult {
  books: Book[];
  loading: boolean;
  error: string | null;
  refreshBooks: () => Promise<void>;
  createBook: (input: CreateBookInput) => Promise<Book>;
  updateBook: (bookId: string, input: UpdateBookInput) => Promise<void>;
  deleteBook: (bookId: string) => Promise<void>;
}

export function useBooks(authorId?: string | null): UseBooksResult {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState<boolean>(() => Boolean(authorId));
  const [error, setError] = useState<string | null>(null);

  const fetchBooks = useCallback(async () => {
    if (!authorId) {
      setBooks([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await bookService.listBooksByAuthor(authorId);
      setBooks(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar livros');
    } finally {
      setLoading(false);
    }
  }, [authorId]);

  useEffect(() => {
    let active = true;
    if (!authorId) return;

    bookService
      .listBooksByAuthor(authorId)
      .then((data) => {
        if (active) {
          setBooks(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : 'Falha ao carregar livros');
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [authorId]);

  const handleCreateBook = useCallback(
    async (input: CreateBookInput) => {
      if (!authorId) throw new Error('Autor não autenticado');
      const newBook = await bookService.createBook(authorId, input);
      setBooks((prev) => [newBook, ...prev]);
      return newBook;
    },
    [authorId],
  );

  const handleUpdateBook = useCallback(async (bookId: string, input: UpdateBookInput) => {
    await bookService.updateBook(bookId, input);
    setBooks((prev) =>
      prev.map((b) => (b.id === bookId ? { ...b, ...input, updatedAt: Date.now() } : b)),
    );
  }, []);

  const handleDeleteBook = useCallback(async (bookId: string) => {
    await bookService.deleteBook(bookId);
    setBooks((prev) => prev.filter((b) => b.id !== bookId));
  }, []);

  return {
    books,
    loading,
    error,
    refreshBooks: fetchBooks,
    createBook: handleCreateBook,
    updateBook: handleUpdateBook,
    deleteBook: handleDeleteBook,
  };
}
