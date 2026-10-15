import { useState, useEffect, useRef, useCallback } from 'react';
import type { SaveStatus } from '../model/editorState';
import { saveChapterContent } from '../services/chapterContentStorage';
import { clearLocalDraft, writeLocalDraft } from '../services/localDraftStorage';

export interface UseAutoSaveOptions {
  bookId?: string | null;
  chapterId?: string | null;
  ownerId?: string;
  enabled?: boolean;
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
  acceptConfirmedContent: (content: string) => void;
  getConfirmedContent: () => string | null;
  getSavedContent: () => string;
}

export function useAutoSave({
  bookId,
  chapterId,
  ownerId,
  enabled = true,
  content,
  debounceMs = 1000,
  onSaved,
}: UseAutoSaveOptions): UseAutoSaveResult {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const saved = useRef(content);
  const latest = useRef(content);
  const pending = useRef<Promise<void> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  const callback = useRef(onSaved);
  useEffect(() => {
    callback.current = onSaved;
  }, [onSaved]);

  const resetSavedContent = useCallback((text: string) => {
    saved.current = text;
    setSaveStatus('saved');
    setError(null);
  }, []);

  const acceptConfirmedContent = useCallback((text: string) => {
    if (!mounted.current || pending.current)
      throw new Error('Aguarde a confirmação do salvamento antes de substituir o texto.');
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    latest.current = text;
    saved.current = text;
    setSaveStatus('saved');
    setError(null);
    setLastSavedAt(Date.now());
  }, []);

  const performSave = useCallback(
    async function saveLatest(): Promise<void> {
      if (!bookId || !chapterId || !enabled) return;
      while (pending.current) {
        await pending.current;
      }
      if (!mounted.current) return;
      if (latest.current === saved.current) return;
      const text = latest.current;
      if (mounted.current) {
        setSaveStatus('saving');
        setError(null);
      }
      let succeeded = false;
      const request = (async () => {
        try {
          const result = await saveChapterContent(
            bookId,
            chapterId,
            text,
            () => saved.current,
            ownerId,
          );
          saved.current = text;
          succeeded = true;
          if (ownerId) {
            try {
              clearLocalDraft(ownerId, bookId, chapterId, text);
            } catch {
              /* Retaining an already-saved recovery copy is safe. */
            }
          }
          if (mounted.current) {
            setLastSavedAt(Date.now());
            setSaveStatus(latest.current === text ? 'saved' : 'unsaved');
            if (latest.current === text) callback.current?.(result.wordCount);
          }
        } catch (cause) {
          if (mounted.current) {
            setError(cause instanceof Error ? cause.message : 'Falha ao salvar capítulo');
            setSaveStatus('error');
          }
        }
      })();
      pending.current = request;
      await request;
      if (pending.current === request) pending.current = null;
      if (succeeded && mounted.current && latest.current !== saved.current) await saveLatest();
    },
    [bookId, chapterId, ownerId, enabled],
  );

  useEffect(() => {
    latest.current = content;
    if (!enabled || !bookId || !chapterId || (content === saved.current && !pending.current))
      return;
    let active = true;
    let backupError: string | null = null;
    if (ownerId) {
      try {
        writeLocalDraft(ownerId, bookId, chapterId, content);
      } catch {
        backupError =
          'Não foi possível preservar a cópia local. Mantenha esta aba aberta até o salvamento concluir.';
      }
    }
    // Report the storage result asynchronously, outside the synchronization effect.
    queueMicrotask(() => {
      if (!active) return;
      setSaveStatus('unsaved');
      if (backupError) setError(backupError);
    });
    timer.current = setTimeout(() => {
      timer.current = null;
      void performSave();
    }, debounceMs);
    return () => {
      active = false;
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [content, enabled, bookId, chapterId, ownerId, debounceMs, performSave]);

  useEffect(() => {
    mounted.current = true;
    const warn = (event: BeforeUnloadEvent) => {
      if (latest.current !== saved.current || pending.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      mounted.current = false;
      window.removeEventListener('beforeunload', warn);
      // Enqueue the final captured text synchronously, before a new route session
      // can append its edits. Never let an old session's delayed drain run later.
      if (enabled && bookId && chapterId && (latest.current !== saved.current || pending.current)) {
        const finalText = latest.current;
        void saveChapterContent(bookId, chapterId, finalText, () => saved.current, ownerId)
          .then(() => {
            if (ownerId) {
              try {
                clearLocalDraft(ownerId, bookId, chapterId, finalText);
              } catch {
                /* Keep recovery copy. */
              }
            }
          })
          .catch(() => {
            /* The private recovery copy survives a failed flush. */
          });
      }
    };
  }, [performSave, bookId, chapterId, ownerId, enabled]);

  return {
    saveStatus,
    lastSavedAt,
    error,
    saveNow: performSave,
    resetSavedContent,
    acceptConfirmedContent,
    getConfirmedContent: () =>
      mounted.current && !pending.current && latest.current === saved.current
        ? saved.current
        : null,
    getSavedContent: () => saved.current,
  };
}
