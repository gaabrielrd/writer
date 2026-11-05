import { useCallback, useEffect, useRef, useState } from 'react';
import { bookLoreReadSession } from '../services/bookLoreReadService';
import type { BookLoreSummary } from '../model/bookLorePresentation';

/** Mount under the exact actor + book key; listing metadata lives only in RAM. */
export function useBookLoreCollection(bookId: string) {
  const [state, setState] = useState<{
      rows: BookLoreSummary[];
      loading: boolean;
      error: string;
    }>({
      rows: [],
      loading: true,
      error: '',
    }),
    binding = useRef({ epoch: 0, alive: true });
  const load = useCallback(async () => {
    const owner = binding.current,
      n = ++owner.epoch,
      current = () => owner.alive && owner.epoch === n;
    try {
      const reader = bookLoreReadSession(current, { tokenVersion: 2 }),
        sources = await reader.listSummaries(bookId);
      reader.guard();
      const rows = [...sources].sort(
        (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
      );
      if (current()) setState({ rows, loading: false, error: '' });
    } catch (e) {
      if (current())
        setState({
          rows: [],
          loading: false,
          error: e instanceof Error ? e.message : 'Não foi possível carregar o compêndio.',
        });
    }
  }, [bookId]);
  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: '' }));
    await load();
  }, [load]);
  useEffect(() => {
    const owner = binding.current;
    owner.alive = true;
    void load();
    return () => {
      owner.alive = false;
      owner.epoch++;
    };
  }, [load]);
  return { ...state, refresh };
}
