import { useEffect, useRef, useState } from 'react';
import { Button, Dialog, ErrorState, LoadingState } from '@/shared/ui';
import type { LoreMentionEntity } from '../model/loreEntity';
import { presentBookLore, type BookLorePresentation } from '../model/bookLorePresentation';
import { bookLoreReadSession } from '../services/bookLoreReadService';
import { LoreDrawer } from './LoreDrawer';

export function BookLoreReader({
  bookId,
  entity,
  entities,
  onClose,
  onEdit,
}: {
  bookId: string;
  entity: BookLorePresentation;
  entities: readonly LoreMentionEntity[];
  onClose: () => void;
  onEdit: (id: string) => void;
}) {
  const [value, setValue] = useState<BookLorePresentation | null>(null),
    [error, setError] = useState(''),
    [reload, setReload] = useState(0),
    errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  useEffect(() => {
    let live = true;
    void (async () => {
      const reader = bookLoreReadSession(() => live, { tokenVersion: 2 }),
        source = await reader.capture(bookId, entity.id, entity.sourceToken);
      reader.guard();
      if (!source) throw Error('A ficha está indisponível. Atualize o compêndio.');
      const next = presentBookLore(source);
      if (live) setValue(next);
    })().catch((e: unknown) => {
      if (live) setError(e instanceof Error ? e.message : 'Não foi possível abrir a ficha.');
    });
    return () => {
      live = false;
    };
  }, [bookId, entity.id, entity.sourceToken, reload]);
  return value ? (
    <LoreDrawer
      open
      entity={value}
      allEntities={entities}
      onClose={onClose}
      onEdit={(e) => onEdit(e.id)}
    />
  ) : (
    <Dialog
      open
      title="Ficha do compêndio"
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Fechar
        </Button>
      }
    >
      {error ? (
        <div ref={errorRef} tabIndex={-1}>
          <ErrorState
            title="Não foi possível abrir a ficha"
            description={error}
            action={
              <Button
                onClick={() => {
                  setError('');
                  setReload((n) => n + 1);
                }}
              >
                Tentar novamente
              </Button>
            }
          />
        </div>
      ) : (
        <LoadingState label="Conferindo a ficha completa..." />
      )}
    </Dialog>
  );
}
