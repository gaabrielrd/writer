import { useCallback, useEffect, useState } from 'react';
import type { Act } from '../model/act';
import { listActs, createAct } from '../services/chapterOrganizationService';

export function useActs(bookId: string | null) {
  const [acts, setActs] = useState<Act[]>([]);
  const [loading, setLoading] = useState(Boolean(bookId));
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    if (!bookId) return;
    setLoading(true);
    setError(null);
    try {
      setActs(await listActs(bookId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os atos.');
    } finally {
      setLoading(false);
    }
  }, [bookId]);
  useEffect(() => {
    let active = true;
    if (!bookId) return;
    void listActs(bookId)
      .then((data) => {
        if (active) {
          setActs(data);
          setLoading(false);
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os atos.');
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [bookId]);
  const create = async (name: string) => {
    if (!bookId) throw new Error('Livro não selecionado.');
    const act = await createAct(bookId, name);
    setActs((previous) => [...previous, act]);
  };
  return { acts, loading, error, refresh, create };
}
