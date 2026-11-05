import { useCallback, useSyncExternalStore } from 'react';

/** Live result of a CSS media query; `false` where `matchMedia` is unavailable. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (notify: () => void) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => undefined;
      const list = window.matchMedia(query);
      list.addEventListener('change', notify);
      return () => list.removeEventListener('change', notify);
    },
    [query],
  );
  const read = useCallback(
    () => typeof window !== 'undefined' && Boolean(window.matchMedia?.(query).matches),
    [query],
  );
  return useSyncExternalStore(subscribe, read, () => false);
}
