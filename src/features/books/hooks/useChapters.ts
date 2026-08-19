import { useState, useEffect, useCallback } from 'react';
import type { Chapter, CreateChapterInput, UpdateChapterInput } from '../model/chapter';
import * as bookService from '../services/bookService';

export interface UseChaptersResult {
  chapters: Chapter[];
  loading: boolean;
  error: string | null;
  refreshChapters: () => Promise<void>;
  createChapter: (input: CreateChapterInput) => Promise<Chapter>;
  updateChapter: (chapterId: string, input: UpdateChapterInput) => Promise<void>;
  deleteChapter: (chapterId: string) => Promise<void>;
  reorderChapters: (orderedIds: string[]) => Promise<void>;
}

export function useChapters(bookId?: string | null): UseChaptersResult {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState<boolean>(() => Boolean(bookId));
  const [error, setError] = useState<string | null>(null);

  const fetchChapters = useCallback(async () => {
    if (!bookId) {
      setChapters([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await bookService.listChapters(bookId);
      setChapters(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar capítulos');
    } finally {
      setLoading(false);
    }
  }, [bookId]);

  useEffect(() => {
    let active = true;
    if (!bookId) return;

    bookService
      .listChapters(bookId)
      .then((data) => {
        if (active) {
          setChapters(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : 'Falha ao carregar capítulos');
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [bookId]);

  const handleCreateChapter = useCallback(
    async (input: CreateChapterInput) => {
      if (!bookId) throw new Error('Livro não selecionado');
      const newChapter = await bookService.createChapter(bookId, input);
      setChapters((prev) => [...prev, newChapter]);
      return newChapter;
    },
    [bookId],
  );

  const handleUpdateChapter = useCallback(
    async (chapterId: string, input: UpdateChapterInput) => {
      if (!bookId) return;
      await bookService.updateChapter(bookId, chapterId, input);
      setChapters((prev) =>
        prev.map((c) => (c.id === chapterId ? { ...c, ...input, updatedAt: Date.now() } : c)),
      );
    },
    [bookId],
  );

  const handleDeleteChapter = useCallback(
    async (chapterId: string) => {
      if (!bookId) return;
      await bookService.deleteChapter(bookId, chapterId);
      setChapters((prev) => prev.filter((c) => c.id !== chapterId));
    },
    [bookId],
  );

  const handleReorderChapters = useCallback(
    async (orderedIds: string[]) => {
      if (!bookId) return;
      await bookService.reorderChapters(bookId, orderedIds);
      setChapters((prev) => {
        const map = new Map(prev.map((c) => [c.id, c]));
        return orderedIds
          .map((id, index) => {
            const ch = map.get(id);
            return ch ? { ...ch, order: index + 1 } : null;
          })
          .filter((c): c is Chapter => c !== null);
      });
    },
    [bookId],
  );

  return {
    chapters,
    loading,
    error,
    refreshChapters: fetchChapters,
    createChapter: handleCreateChapter,
    updateChapter: handleUpdateChapter,
    deleteChapter: handleDeleteChapter,
    reorderChapters: handleReorderChapters,
  };
}
