import { useEffect, useState } from 'react';
import { DEFAULT_PERSONAS, type AIPersona } from '../model/persona';
import { subscribePersonas } from '../services/personaService';

export function usePersonaLibrary(ownerId?: string | null) {
  const [state, setState] = useState<{
    ownerId?: string | null;
    items: AIPersona[];
    error: string | null;
    ready: boolean;
  }>({ items: [], error: null, ready: false });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!ownerId) return;
    let active = true;
    const stop = subscribePersonas(
      ownerId,
      (items) => {
        if (active) setState({ ownerId, items, error: null, ready: true });
      },
      (error) => {
        if (active) setState({ ownerId, items: [], error: error.message, ready: true });
      },
    );
    return () => {
      active = false;
      stop();
    };
  }, [ownerId, attempt]);
  const current = state.ownerId === ownerId ? state : null;
  return {
    personas: [...DEFAULT_PERSONAS, ...(current?.items ?? [])],
    loading: Boolean(ownerId && !current?.ready),
    error: current?.error ?? null,
    retry: () => {
      setState({ items: [], error: null, ready: false });
      setAttempt((value) => value + 1);
    },
  };
}
