import { useEffect, useRef, useState } from 'react';
import { narrativeErrorMessage, narrativeErrorReason } from '../model/narrativeError';
export interface PlanningPage<T> {
  items: T[];
  nextCursor: string | null;
}
export function useNarrativePage<T, P extends PlanningPage<T> = PlanningPage<T>>(
  key: string,
  loadPage: (cursor: string | null) => Promise<P>,
  itemKey: (item: T) => string,
) {
  const loaderRef = useRef(loadPage);
  const identityRef = useRef(itemKey);
  useEffect(() => {
    loaderRef.current = loadPage;
    identityRef.current = itemKey;
  });
  const [attempt, setAttempt] = useState(0);
  const currentKey = key + ':' + attempt;
  const [result, setResult] = useState<{
    key: string;
    items: T[];
    page: P;
    loading: boolean;
    error: string;
    invalidCursor: boolean;
  }>();
  const controlRef = useRef<{ key: string; active: boolean; busy: boolean } | null>(null);
  useEffect(() => {
    const control = { key: currentKey, active: true, busy: false };
    controlRef.current = control;
    const loader = loaderRef.current;
    void loader(null).then(
      (page) => {
        if (control.active)
          setResult({
            key: currentKey,
            items: page.items,
            page,
            loading: false,
            error: '',
            invalidCursor: false,
          });
      },
      (failure) => {
        if (control.active) setResult(undefined);
        if (control.active)
          setInitialError({ key: currentKey, error: narrativeErrorMessage(failure) });
      },
    );
    return () => {
      control.active = false;
    };
  }, [currentKey]);
  const [initialError, setInitialError] = useState<{ key: string; error: string }>();
  const current = result?.key === currentKey ? result : undefined;
  const error = current?.error || (initialError?.key === currentKey ? initialError.error : '');
  const refresh = () => setAttempt((value) => value + 1);
  const more = async () => {
    const control = controlRef.current;
    if (!control?.active || control.key !== currentKey || control.busy || !current?.page.nextCursor)
      return;
    control.busy = true;
    setResult({ ...current, loading: true, error: '' });
    try {
      const page = await loaderRef.current(current.page.nextCursor);
      if (control.active)
        setResult((previous) => {
          if (previous?.key !== currentKey) return previous;
          const items = new Map(previous.items.map((item) => [identityRef.current(item), item]));
          for (const item of page.items) items.set(identityRef.current(item), item);
          return {
            ...previous,
            items: [...items.values()],
            page,
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
                error: narrativeErrorMessage(failure),
                invalidCursor: ['cursor-invalidated', 'revision-conflict'].includes(
                  narrativeErrorReason(failure),
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
    page: current?.page,
    cursor: current?.page.nextCursor ?? null,
    loading: current ? current.loading : !error,
    error,
    refresh,
    more,
    retry: () => {
      if (!current?.page.nextCursor || current.invalidCursor) refresh();
      else void more();
    },
  };
}
