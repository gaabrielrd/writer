import { useEffect, useRef } from 'react';
import { Button, Dialog, ErrorState, LoadingState } from '@/shared/ui';
import type { LoreMentionEntity } from '../model/loreEntity';
import { useBookLorePresentation } from '../hooks/useBookLorePresentation';
import { useBookLoreActor } from '../hooks/useBookLoreActor';
import { LoreDrawer } from './LoreDrawer';

export interface BookLoreReaderProps {
  bookId: string;
  loreId: string;
  sourceToken?: string;
  entities: readonly LoreMentionEntity[];
  onClose: () => void;
  onEdit?: (id: string) => void;
}
export function BookLoreReader(props: BookLoreReaderProps) {
  const actor = useBookLoreActor();
  return actor !== null ? (
    <Content
      key={JSON.stringify([actor, props.bookId, props.loreId, props.sourceToken])}
      {...props}
    />
  ) : null;
}
function Content({ bookId, loreId, sourceToken, entities, onClose, onEdit }: BookLoreReaderProps) {
  const { value, error, retry } = useBookLorePresentation(bookId, loreId, sourceToken),
    errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  return value ? (
    <LoreDrawer
      open
      entity={value}
      allEntities={entities}
      onClose={onClose}
      closeOnEdit={false}
      onEdit={onEdit ? (e) => onEdit(e.id) : undefined}
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
            action={<Button onClick={retry}>Tentar novamente</Button>}
          />
        </div>
      ) : (
        <LoadingState label="Conferindo a ficha completa..." />
      )}
    </Dialog>
  );
}
