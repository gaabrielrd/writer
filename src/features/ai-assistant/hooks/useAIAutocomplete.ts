import type { WritingPersonaContext } from '../model/persona';
import { useState, useEffect, useRef, useCallback } from 'react';
import { buildAutocompletePrompt, type LoreContextItem } from '../model/aiPrompt';
import { type BYOKConfig, usesOwnKey } from '../model/byokConfig';
import { getBYOKConfig, getBYOKRevision } from '../services/byokStorage';
import { generateAIResponse } from '../services/aiClient';
import { deductCredit } from '../services/creditsService';
import { useAIConfig } from './useAIConfig';
import { generateLiteraryAutocomplete } from '../services/literaryAutocompleteService';
import type { AutocompleteOffer, AutocompleteScope } from '../model/atomicAutocomplete';

export interface UseAIAutocompleteOptions {
  // null records canceled typing; a manual request remains available.
  typingRevision: number | null;
  atomicScope?: AutocompleteScope;
  planIds?: string[];
  contextVersion?: string;
  captureDocument?: () => string | null;
  writingPersona?: WritingPersonaContext;
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
  editorial: AutocompleteOffer['editorial'];
  isLoading: boolean;
  isAccepting: boolean;
  error: string | null;
  acceptSuggestion: (
    canApply?: () => boolean,
    applyAtomic?: (offer: AutocompleteOffer) => Promise<void>,
  ) => Promise<string | null>;
  discardSuggestion: () => void;
  triggerManualAutocomplete: () => Promise<void>;
}

interface Suggestion {
  text: string;
  config: BYOKConfig;
  context: string;
  offer?: AutocompleteOffer;
}

const EMPTY_LORE: LoreContextItem[] = [];

export function useAIAutocomplete({
  typingRevision,
  atomicScope,
  planIds,
  contextVersion,
  captureDocument,
  writingPersona,
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
  const currentConfig = useAIConfig();
  const configVersion = JSON.stringify([
    currentConfig.provider,
    currentConfig.customModel,
    currentConfig.platformModel,
    currentConfig.platformReasoning,
    getBYOKRevision(),
  ]);
  const [response, setResponse] = useState<Suggestion | null>(null);
  const [loadingContext, setLoadingContext] = useState<string | null>(null);
  const [isAccepting, setIsAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const acceptingRef = useRef(false);
  const offeredRef = useRef<Suggestion | null>(null);
  const callbacksRef = useRef({ onCreditDeducted, onShowOutOfCredits, captureDocument });
  const atomicBookId = atomicScope?.bookId,
    atomicChapterId = atomicScope?.chapterId;
  const textBeforeCursor = content.substring(0, cursorPosition);
  const { prompt, systemInstruction } = buildAutocompletePrompt({
    textBeforeCursor,
    loreEntities,
    writingPersona,
  });
  const context = JSON.stringify([
    typingRevision,
    atomicBookId,
    atomicChapterId,
    planIds,
    contextVersion,
    content,
    cursorPosition,
    prompt,
    userId,
    userCredits,
    enabled,
    configVersion,
    systemInstruction,
    writingPersona?.version,
  ]);
  const contextRef = useRef(context);
  const lastTypingRevision = useRef(typingRevision);

  useEffect(() => {
    callbacksRef.current = { onCreditDeducted, onShowOutOfCredits, captureDocument };
  }, [onCreditDeducted, onShowOutOfCredits, captureDocument]);

  const discardSuggestion = useCallback(() => {
    controllerRef.current?.abort();
    if (timerRef.current) clearTimeout(timerRef.current);
    offeredRef.current = null;
    setResponse(null);
    setLoadingContext(null);
    setError(null);
  }, [setResponse, setLoadingContext, setError]);

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
      let offer: AutocompleteOffer | undefined;
      if (atomicBookId !== undefined && atomicChapterId !== undefined) {
        const before = callbacksRef.current.captureDocument?.();
        if (before == null) throw new Error('Editor indisponível para capturar o autocomplete.');
        offer = await generateLiteraryAutocomplete(
          { bookId: atomicBookId, chapterId: atomicChapterId, before, textBeforeCursor, planIds },
          config,
          controller.signal,
        );
      }
      const text =
        offer?.text ??
        (await generateAIResponse({
          prompt,
          systemInstruction,
          byokConfig: config,
          signal: controller.signal,
        }));
      if (!controller.signal.aborted && contextRef.current === context && text.trim()) {
        const next = {
          text: text.trim(),
          config: offer ? { provider: config.provider } : config,
          context,
          ...(offer ? { offer } : {}),
        };
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
  }, [
    textBeforeCursor,
    atomicBookId,
    atomicChapterId,
    planIds,
    context,
    enabled,
    prompt,
    systemInstruction,
    userId,
    userCredits,
    setResponse,
    setLoadingContext,
    setError,
  ]);

  useEffect(() => {
    const typed = typingRevision !== null && lastTypingRevision.current !== typingRevision;
    lastTypingRevision.current = typingRevision;
    contextRef.current = context;
    controllerRef.current?.abort();
    offeredRef.current = null;
    if (enabled && typed) {
      timerRef.current = setTimeout(() => {
        void fetchSuggestion();
      }, debounceMs);
    }
    return () => {
      controllerRef.current?.abort();
      offeredRef.current = null;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [context, debounceMs, enabled, fetchSuggestion, typingRevision]);

  const acceptSuggestion = useCallback(
    async (
      canApply?: () => boolean,
      applyAtomic?: (offer: AutocompleteOffer) => Promise<void>,
    ): Promise<string | null> => {
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
        if (offered.offer) {
          if (!applyAtomic)
            throw new Error('O aceite transacional do autocomplete não está disponível.');
          if (offered.offer.expiresAt <= Date.now())
            throw new Error('A sugestão expirou. Gere outra.');
          await applyAtomic(offered.offer);
          return null;
        }
        if (!usesOwnKey(offered.config)) {
          if (!userId) throw new Error('Entre na sua conta para usar os créditos de IA.');
          const newTotal = await deductCredit(userId, 1);
          callbacksRef.current.onCreditDeducted?.(newTotal);
        }
        return offered.text;
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Falha ao debitar crédito.');
        if (
          !offered.offer ||
          (typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            error.code === 'functions/resource-exhausted')
        )
          callbacksRef.current.onShowOutOfCredits?.();
        return null;
      } finally {
        acceptingRef.current = false;
        setIsAccepting(false);
      }
    },
    [context, userId, setResponse, setError, setIsAccepting],
  );

  useEffect(() => {
    if (!response?.offer) return;
    const timeout = setTimeout(
      discardSuggestion,
      Math.max(0, response.offer.expiresAt - Date.now()),
    );
    return () => clearTimeout(timeout);
  }, [response, discardSuggestion]);

  const triggerManualAutocomplete = useCallback(async () => {
    if (!usesOwnKey(getBYOKConfig()) && userCredits <= 0) {
      callbacksRef.current.onShowOutOfCredits?.();
      return;
    }
    await fetchSuggestion();
  }, [fetchSuggestion, userCredits]);

  return {
    suggestion: enabled && response?.context === context ? response.text : null,
    editorial: enabled && response?.context === context ? response.offer?.editorial : null,
    isLoading: loadingContext === context,
    isAccepting,
    error,
    acceptSuggestion,
    discardSuggestion,
    triggerManualAutocomplete,
  };
}
