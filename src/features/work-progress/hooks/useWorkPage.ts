import { useEffect, useRef, useState } from 'react';
import { isWorkConflict, workErrorMessage } from '../model/workProgress';
export function useWorkPage<T, P extends { items: T[]; nextCursor: string | null }>(
  identity: string,
  load: (cursor: string | null) => Promise<P>,
  itemKey: (item: T) => string,
) {
  const loader = useRef(load),
    identify = useRef(itemKey);
  useEffect(() => {
    loader.current = load;
    identify.current = itemKey;
  });
  const [attempt, setAttempt] = useState(0);
  const key = identity + ':' + attempt;
  const [result, setResult] = useState<{
    key: string;
    page?: P;
    items: T[];
    error: string;
    loading: boolean;
    invalid: boolean;
  }>();
  const control = useRef<{ key: string; active: boolean; busy: boolean } | undefined>(undefined);
  useEffect(() => {
    const current = { key, active: true, busy: false };
    control.current = current;
    void loader.current(null).then(
      (page) => {
        if (current.active)
          setResult({ key, page, items: page.items, error: '', loading: false, invalid: false });
      },
      (cause) => {
        if (current.active)
          setResult({
            key,
            items: [],
            error: workErrorMessage(cause),
            loading: false,
            invalid: false,
          });
      },
    );
    return () => {
      current.active = false;
    };
  }, [key]);
  const current = result?.key === key ? result : undefined;
  const refresh = () => setAttempt((n) => n + 1);
  async function more() {
    const token = control.current;
    if (!token?.active || token.key !== key || token.busy || !current?.page?.nextCursor) return;
    token.busy = true;
    setResult({ ...current, loading: true, error: '' });
    try {
      const page = await loader.current(current.page.nextCursor);
      if (token.active)
        setResult((previous) => {
          if (previous?.key !== key) return previous;
          const items = new Map(previous.items.map((item) => [identify.current(item), item]));
          for (const item of page.items) items.set(identify.current(item), item);
          return {
            key,
            page,
            items: [...items.values()],
            error: '',
            loading: false,
            invalid: false,
          };
        });
    } catch (cause) {
      if (token.active)
        setResult((previous) =>
          previous?.key === key
            ? {
                ...previous,
                error: workErrorMessage(cause),
                loading: false,
                invalid: isWorkConflict(cause),
              }
            : previous,
        );
    } finally {
      token.busy = false;
    }
  }
  return {
    items: current?.items ?? [],
    page: current?.page,
    loading: current ? current.loading : true,
    error: current?.error ?? '',
    refresh,
    more,
    retry: () => {
      if (current?.page?.nextCursor && !current.invalid) void more();
      else refresh();
    },
  };
}
