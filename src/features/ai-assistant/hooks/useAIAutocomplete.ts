import { useState, useEffect, useRef, useCallback } from 'react';
import { buildAutocompletePrompt, type LoreContextItem } from '../model/aiPrompt';
import { type BYOKConfig, usesOwnKey } from '../model/byokConfig';
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
  isAccepting: boolean;
  error: string | null;
  acceptSuggestion: (canApply?: () => boolean) => Promise<string | null>;
  discardSuggestion: () => void;
  triggerManualAutocomplete: () => Promise<void>;
}

interface Suggestion {
  text: string;
  config: BYOKConfig;
  context: string;
}

const EMPTY_LORE: LoreContextItem[] = [];

export function useAIAutocomplete({
  content,
  cursorPosition,
  loreEntities = EMPTY_LORE,
  userId,
  userCredits = 0,
  onCreditDeducted,
  onShowOutOfCredits,
  enabled = true,
  debounceMs = 600,
}: UseAIAutocompleteOptions): UseAIAutocompleteResult {
  const [response, setResponse] = useState<Suggestion | null>(null);
  const [loadingContext, setLoadingContext] = useState<string | null>(null);
  const [isAccepting, setIsAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const acceptingRef = useRef(false);
  const offeredRef = useRef<Suggestion | null>(null);
  const callbacksRef = useRef({ onCreditDeducted, onShowOutOfCredits });
  const textBeforeCursor = content.substring(0, cursorPosition);
  const { prompt, systemInstruction } = buildAutocompletePrompt({ textBeforeCursor, loreEntities });
  const context = JSON.stringify([content, cursorPosition, prompt, userId, userCredits, enabled]);
  const contextRef = useRef(context);

  useEffect(() => {
    callbacksRef.current = { onCreditDeducted, onShowOutOfCredits };
  }, [onCreditDeducted, onShowOutOfCredits]);

  const discardSuggestion = useCallback(() => {
    controllerRef.current?.abort();
    if (timerRef.current) clearTimeout(timerRef.current);
    offeredRef.current = null;
    setResponse(null);
    setLoadingContext(null);
    setError(null);
  }, []);

  const fetchSuggestion = useCallback(async () => {
    if (!enabled || acceptingRef.current) return;
    if (textBeforeCursor.trim().length < 10) return;
    const config = getBYOKConfig();
    // Exhaustion never opens a focus-trapping dialog while the author is typing.
    if (!usesOwnKey(config) && (!userId || userCredits <= 0)) return;

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    offeredRef.current = null;
    setResponse(null);
    setLoadingContext(context);
    setError(null);
    try {
      const text = await generateAIResponse({
        prompt,
        systemInstruction,
        byokConfig: config,
        signal: controller.signal,
      });
      if (!controller.signal.aborted && contextRef.current === context && text.trim()) {
        const next = { text: text.trim(), config, context };
        offeredRef.current = next;
        setResponse(next);
      }
    } catch (error) {
      if (!controller.signal.aborted && contextRef.current === context) {
        setError(error instanceof Error ? error.message : 'Falha na sugestão de IA');
      }
    } finally {
      if (!controller.signal.aborted && contextRef.current === context) setLoadingContext(null);
    }
  }, [textBeforeCursor, context, enabled, prompt, systemInstruction, userId, userCredits]);

  useEffect(() => {
    contextRef.current = context;
    controllerRef.current?.abort();
    offeredRef.current = null;
    if (enabled) {
      timerRef.current = setTimeout(() => {
        void fetchSuggestion();
      }, debounceMs);
    }
    return () => {
      controllerRef.current?.abort();
      offeredRef.current = null;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [context, debounceMs, enabled, fetchSuggestion]);

  const acceptSuggestion = useCallback(
    async (canApply?: () => boolean): Promise<string | null> => {
      const offered = offeredRef.current;
      if (
        !offered ||
        offered.context !== context ||
        acceptingRef.current ||
        (canApply && !canApply())
      )
        return null;
      acceptingRef.current = true;
      offeredRef.current = null;
      controllerRef.current?.abort();
      if (timerRef.current) clearTimeout(timerRef.current);
      setIsAccepting(true);
      setResponse(null);
      try {
        if (!usesOwnKey(offered.config)) {
          if (!userId) throw new Error('Entre na sua conta para usar os créditos de IA.');
          const newTotal = await deductCredit(userId, 1);
          callbacksRef.current.onCreditDeducted?.(newTotal);
        }
        return offered.text;
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Falha ao debitar crédito.');
        callbacksRef.current.onShowOutOfCredits?.();
        return null;
      } finally {
        acceptingRef.current = false;
        setIsAccepting(false);
      }
    },
    [context, userId],
  );

  const triggerManualAutocomplete = useCallback(async () => {
    if (!usesOwnKey(getBYOKConfig()) && userCredits <= 0) {
      callbacksRef.current.onShowOutOfCredits?.();
      return;
    }
    await fetchSuggestion();
  }, [fetchSuggestion, userCredits]);

  return {
    suggestion: enabled && response?.context === context ? response.text : null,
    isLoading: loadingContext === context,
    isAccepting,
    error,
    acceptSuggestion,
    discardSuggestion,
    triggerManualAutocomplete,
  };
}
