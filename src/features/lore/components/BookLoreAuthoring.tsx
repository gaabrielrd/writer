import { useState } from 'react';
import { Alert, Button, Dialog } from '@/shared/ui';
import { useBookLoreActor } from '../hooks/useBookLoreActor';
import type { LoreMentionEntity } from '../model/loreEntity';
import { BookLoreWorkspaceDialog, type BookLoreWorkspaceMode } from './BookLoreWorkspaceDialog';
export type BookLoreAuthoringTarget =
  | { kind: 'create'; initialName?: string }
  | { kind: 'edit'; loreId: string }
  | { kind: 'read'; loreId: string }
  | { kind: 'recoveries' };
export interface BookLoreAuthoringProps {
  open: boolean;
  bookId: string;
  target: BookLoreAuthoringTarget;
  entities: readonly LoreMentionEntity[];
  disabled?: boolean;
  onClose: (originalTarget: BookLoreAuthoringTarget) => void;
  onConfirmed?: () => void;
}
/** Public composition port. It never delegates a book mutation to a legacy callback. */
export function BookLoreAuthoring(props: BookLoreAuthoringProps) {
  const actor = useBookLoreActor();
  return props.open && actor !== null ? (
    <Content key={JSON.stringify([actor, props.bookId])} {...props} />
  ) : null;
}
function Content({
  bookId,
  target,
  entities,
  disabled = false,
  onClose,
  onConfirmed,
}: BookLoreAuthoringProps) {
  const [original] = useState(() => ({ ...target })),
    [opener] = useState(() =>
      document.activeElement instanceof HTMLElement ? document.activeElement : null,
    ),
    [mode, setMode] = useState<BookLoreWorkspaceMode>(() =>
      target.kind === 'read' ? { kind: 'read-current', loreId: target.loreId } : { ...target },
    ),
    [entered, setEntered] = useState(!disabled);
  const close = () => {
    onClose(original);
    requestAnimationFrame(() => {
      if (opener?.isConnected && !opener.hasAttribute('disabled')) opener.focus();
    });
  };
  if (!entered && !disabled) setEntered(true);
  if (!entered && (mode.kind === 'create' || mode.kind === 'edit'))
    return (
      <Dialog
        open
        title="Aguarde a operação do capítulo"
        onClose={close}
        footer={<Button onClick={close}>Fechar</Button>}
      >
        <Alert>O formulário será aberto quando a operação atual terminar.</Alert>
      </Dialog>
    );
  return (
    <BookLoreWorkspaceDialog
      mode={mode}
      bookId={bookId}
      entities={entities}
      disabled={disabled}
      onClose={close}
      onCompleted={() => onConfirmed?.()}
      onMode={(next) => {
        if (disabled && (next.kind === 'create' || next.kind === 'edit')) return;
        setEntered(true);
        setMode(next);
      }}
    />
  );
}
