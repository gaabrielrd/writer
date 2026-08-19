import { useState, useEffect, useRef, useCallback } from 'react';
import type { SaveStatus } from '../model/editorState';
import { saveChapterContent } from '../services/chapterContentStorage';

export interface UseAutoSaveOptions {
  bookId?: string | null;
  chapterId?: string | null;
  content: string;
  debounceMs?: number;
  onSaved?: (wordCount: number) => void;
}

export interface UseAutoSaveResult {
  saveStatus: SaveStatus;
  lastSavedAt: number | null;
  error: string | null;
  saveNow: () => Promise<void>;
  resetSavedContent: (newSavedContent: string) => void;
}

export function useAutoSave({
  bookId,
  chapterId,
  content,
  debounceMs = 1000,
  onSaved,
}: UseAutoSaveOptions): UseAutoSaveResult {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lastSavedContentRef = useRef<string>(content);
  const currentChapterIdRef = useRef<string | null | undefined>(chapterId);

  const resetSavedContent = useCallback((newSavedContent: string) => {
    lastSavedContentRef.current = newSavedContent;
    setSaveStatus('saved');
    setError(null);
  }, []);

  const performSave = useCallback(
    async (textToSave: string) => {
      if (!bookId || !chapterId) return;

      setSaveStatus('saving');
      setError(null);

      try {
        const { wordCount } = await saveChapterContent(bookId, chapterId, textToSave);
        lastSavedContentRef.current = textToSave;
        setLastSavedAt(Date.now());
        setSaveStatus('saved');
        onSaved?.(wordCount);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Falha ao salvar capítulo');
        setSaveStatus('error');
      }
    },
    [bookId, chapterId, onSaved],
  );

  const saveNow = useCallback(async () => {
    if (content !== lastSavedContentRef.current) {
      await performSave(content);
    }
  }, [content, performSave]);

  useEffect(() => {
    // Quando o ID do capítulo muda, reinicia o snapshot de conteúdo salvo
    if (currentChapterIdRef.current !== chapterId) {
      currentChapterIdRef.current = chapterId;
      lastSavedContentRef.current = content;
      return;
    }

    if (content === lastSavedContentRef.current) {
      return;
    }

    setSaveStatus('unsaved');

    const timer = setTimeout(() => {
      void performSave(content);
    }, debounceMs);

    return () => {
      clearTimeout(timer);
    };
  }, [chapterId, content, debounceMs, performSave]);

  return {
    saveStatus,
    lastSavedAt,
    error,
    saveNow,
    resetSavedContent,
  };
}
