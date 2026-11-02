import { useEffect, useState } from 'react';
import { bookLoreReadSession } from '../services/bookLoreReadService';
import { presentBookLore, type BookLorePresentation } from '../model/bookLorePresentation';

/** Mounted under actor/book/id/token identity; complete authorized source stays in RAM. */
export function useBookLorePresentation(bookId: string, loreId: string, sourceToken?: string) {
  const [state, setState] = useState<{ value: BookLorePresentation | null; error: string }>({
      value: null,
      error: '',
    }),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let live = true;
    void (async () => {
      const reader = bookLoreReadSession(() => live, { tokenVersion: 2 }),
        source = await reader.capture(bookId, loreId, sourceToken);
      reader.guard();
      if (!source) throw Error('A ficha está indisponível. Atualize o compêndio.');
      const value = presentBookLore(source);
      if (live) setState({ value, error: '' });
    })().catch((error: unknown) => {
      if (live)
        setState({
          value: null,
          error: error instanceof Error ? error.message : 'Não foi possível abrir a ficha.',
        });
    });
    return () => {
      live = false;
    };
  }, [bookId, loreId, sourceToken, revision]);
  return {
    ...state,
    retry: () => {
      setState({ value: null, error: '' });
      setRevision((n) => n + 1);
    },
  };
}
