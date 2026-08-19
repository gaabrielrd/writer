import { useState, useEffect, useRef, useCallback } from 'react';
import { buildAutocompletePrompt, type LoreContextItem } from '../model/aiPrompt';
import { getBYOKConfig } from '../services/byokStorage';
import { generateAIResponse } from '../services/aiClient';
import { deductCredit } from '../services/creditsService';

export interface UseAIAutocompleteOptions {
  content: string;
  cursorPosition: number;
  loreEntities?: LoreContextItem[];
  userId?: string | null;
  userCredits?: number;
  onCreditDeducted?: (newCredits: number) => void;
  onShowOutOfCredits?: () => void;
  enabled?: boolean;
  debounceMs?: number;
}

export interface UseAIAutocompleteResult {
  suggestion: string | null;
  isLoading: boolean;
  error: string | null;
  acceptSuggestion: () => Promise<string | null>;
  discardSuggestion: () => void;
  triggerManualAutocomplete: () => Promise<void>;
}

export function useAIAutocomplete({
  content,
  cursorPosition,
  loreEntities = [],
  userId,
  userCredits = 0,
  onCreditDeducted,
  onShowOutOfCredits,
  enabled = true,
  debounceMs = 600,
}: UseAIAutocompleteOptions): UseAIAutocompleteResult {
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  const discardSuggestion = useCallback(() => {
    setSuggestion(null);
    setError(null);
  }, []);

  const fetchSuggestion = useCallback(async () => {
    const textBeforeCursor = content.substring(0, cursorPosition);
    if (!textBeforeCursor.trim() || textBeforeCursor.length < 10) {
      setSuggestion(null);
      return;
    }

    const byok = getBYOKConfig();
    const isUsingBYOK = byok.provider !== 'firebase_ai';

    // Se não usa chave própria e os créditos acabaram, avisa e cancela
    if (!isUsingBYOK && userCredits <= 0) {
      setSuggestion(null);
      onShowOutOfCredits?.();
      return;
    }

    // Cancela requisição anterior em andamento
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    setError(null);

    try {
      const { prompt, systemInstruction } = buildAutocompletePrompt({
        textBeforeCursor,
        loreEntities,
      });

      const response = await generateAIResponse({
        prompt,
        systemInstruction,
        byokConfig: byok,
        signal: controller.signal,
      });

      if (!controller.signal.aborted) {
        setSuggestion(response.trim() || null);
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : 'Falha na sugestão de IA');
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [content, cursorPosition, loreEntities, onShowOutOfCredits, userCredits]);

  const acceptSuggestion = useCallback(async (): Promise<string | null> => {
    if (!suggestion) return null;

    const acceptedText = suggestion;
    const byok = getBYOKConfig();
    const isUsingBYOK = byok.provider !== 'firebase_ai';

    // Só debita créditos se estiver consumindo a cota da plataforma
    if (!isUsingBYOK && userId) {
      try {
        const newTotal = await deductCredit(userId, 1);
        onCreditDeducted?.(newTotal);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Falha ao debitar crédito.');
        onShowOutOfCredits?.();
        return null;
      }
    }

    setSuggestion(null);
    return acceptedText;
  }, [suggestion, userId, onCreditDeducted, onShowOutOfCredits]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const timer = setTimeout(() => {
      void fetchSuggestion();
    }, debounceMs);

    return () => {
      clearTimeout(timer);
    };
  }, [debounceMs, enabled, fetchSuggestion]);

  return {
    suggestion,
    isLoading,
    error,
    acceptSuggestion,
    discardSuggestion,
    triggerManualAutocomplete: fetchSuggestion,
  };
}
