import { useEffect, useRef, useState } from 'react';
import type { ScenePage } from '../model/scene';
import { sceneErrorMessage, sceneErrorReason } from '../model/sceneError';
export function useScenePage<T extends { id: string | null }>(
  key: string,
  fetchPage: (cursor: string | null) => Promise<ScenePage<T>>,
) {
  const fetchRef = useRef(fetchPage);
  useEffect(() => {
    fetchRef.current = fetchPage;
  });
  const [attempt, setAttempt] = useState(0);
  const currentKey = key + ':' + attempt;
  const [result, setResult] = useState<{
    key: string;
    items: T[];
    cursor: string | null;
    loading: boolean;
    error: string;
    invalidCursor: boolean;
  }>();
  const controlRef = useRef<{ key: string; active: boolean; busy: boolean } | null>(null);
  useEffect(() => {
    const control = { key: currentKey, active: true, busy: false };
    controlRef.current = control;
    const loader = fetchRef.current;
    async function load() {
      try {
        const page = await loader(null);
        if (control.active)
          setResult({
            key: currentKey,
            items: page.items,
            cursor: page.nextCursor,
            loading: false,
            error: '',
            invalidCursor: false,
          });
      } catch (failure) {
        if (control.active)
          setResult({
            key: currentKey,
            items: [],
            cursor: null,
            loading: false,
            error: sceneErrorMessage(failure),
            invalidCursor: false,
          });
      }
    }
    void load();
    return () => {
      control.active = false;
    };
  }, [currentKey]);
  const current = result?.key === currentKey ? result : undefined;
  const refresh = () => {
    setAttempt((value) => value + 1);
  };
  const more = async () => {
    const control = controlRef.current;
    if (!control?.active || control.key !== currentKey || control.busy || !current?.cursor) return;
    control.busy = true;
    setResult({ ...current, loading: true, error: '' });
    try {
      const page = await fetchRef.current(current.cursor);
      if (control.active)
        setResult((previous) => {
          if (previous?.key !== currentKey) return previous;
          const items = new Map(previous.items.map((item) => [item.id, item]));
          for (const item of page.items) items.set(item.id, item);
          return {
            ...previous,
            items: [...items.values()],
            cursor: page.nextCursor,
            loading: false,
            error: '',
            invalidCursor: false,
          };
        });
    } catch (failure) {
      if (control.active)
        setResult((previous) =>
          previous?.key === currentKey
            ? {
                ...previous,
                loading: false,
                error: sceneErrorMessage(failure),
                invalidCursor: ['cursor-invalidated', 'revision-conflict'].includes(
                  sceneErrorReason(failure),
                ),
              }
            : previous,
        );
    } finally {
      control.busy = false;
    }
  };
  return {
    items: current?.items ?? [],
    cursor: current?.cursor ?? null,
    loading: !current || current.loading,
    error: current?.error ?? '',
    invalidCursor: current?.invalidCursor ?? false,
    refresh,
    more,
    retry: () => {
      if (!current?.cursor || current.invalidCursor) refresh();
      else void more();
    },
  };
}
