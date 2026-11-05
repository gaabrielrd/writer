import { useState } from 'react';
import { Alert, Button, Dialog, Dropdown } from '@/shared/ui';
import type { LoreMentionEntity } from '../model/loreEntity';
import type { BookLorePresentation } from '../model/bookLorePresentation';
import { BookLoreCreationEditor } from './BookLoreCreationEditor';
import { BookLoreCreationRecoveries } from './BookLoreCreationRecoveries';
import { BookLoreManualEditor } from './BookLoreManualEditor';
import { BookLoreRecoveries } from './BookLoreRecoveries';
import { BookLoreRemovalDialog } from './BookLoreRemovalDialog';
import { BookLoreRemovalRecoveries } from './BookLoreRemovalRecoveries';
import { BookLoreRemovalSelectionDialog } from './BookLoreRemovalSelectionDialog';
import { BookLoreRemovalSelectionRecoveries } from './BookLoreRemovalSelectionRecoveries';
import { BookLoreVisibilitySelectionDialog } from './BookLoreVisibilitySelectionDialog';
import { BookLoreVisibilitySelectionRecoveries } from './BookLoreVisibilitySelectionRecoveries';
import { BookLoreReader } from './BookLoreReader';

type Target = { readonly loreId: string; readonly sourceToken: string };
export type BookLoreWorkspaceMode =
  | { kind: 'create'; writeId?: string; initialName?: string }
  | { kind: 'edit'; loreId: string; writeId?: string }
  | { kind: 'read'; entity: Pick<BookLorePresentation, 'id' | 'sourceToken'> }
  | { kind: 'read-current'; loreId: string }
  | { kind: 'remove'; loreId: string; sourceToken?: string; name?: string; writeId?: string }
  | { kind: 'remove-selection'; targets?: readonly Target[]; selectionId?: string }
  | { kind: 'visibility'; targets?: readonly Target[]; selectionId?: string; value?: boolean }
  | { kind: 'choose-visibility'; targets: readonly Target[] }
  | { kind: 'recoveries' };

export function BookLoreWorkspaceDialog({
  mode,
  bookId,
  entities,
  disabled = false,
  onClose,
  onMode,
  onCompleted,
}: {
  mode: BookLoreWorkspaceMode;
  bookId: string;
  entities: readonly LoreMentionEntity[];
  disabled?: boolean;
  onClose: () => void;
  onMode: (mode: BookLoreWorkspaceMode) => void;
  onCompleted: (ids: readonly string[], message: string) => void;
}) {
  switch (mode.kind) {
    case 'create':
      return (
        <BookLoreCreationEditor
          open
          bookId={bookId}
          resumeWriteId={mode.writeId}
          initialName={mode.initialName}
          entities={entities}
          onClose={onClose}
          onCreated={(id) =>
            onCompleted([id], 'Entidade criada. O compêndio será conferido novamente.')
          }
        />
      );
    case 'edit':
      return (
        <BookLoreManualEditor
          open
          bookId={bookId}
          loreId={mode.loreId}
          resumeWriteId={mode.writeId}
          entities={entities}
          onClose={onClose}
          onApplied={() =>
            onCompleted(
              [mode.loreId],
              'Alteração confirmada. O compêndio será conferido novamente.',
            )
          }
        />
      );
    case 'read':
      return (
        <BookLoreReader
          key={JSON.stringify([bookId, mode.entity.id, mode.entity.sourceToken])}
          bookId={bookId}
          loreId={mode.entity.id}
          sourceToken={mode.entity.sourceToken}
          entities={entities}
          onClose={onClose}
          onEdit={disabled ? undefined : (loreId) => onMode({ kind: 'edit', loreId })}
        />
      );
    case 'read-current':
      return (
        <BookLoreReader
          bookId={bookId}
          loreId={mode.loreId}
          entities={entities}
          onClose={onClose}
          onEdit={disabled ? undefined : (loreId) => onMode({ kind: 'edit', loreId })}
        />
      );
    case 'remove':
      return (
        <BookLoreRemovalDialog
          open
          bookId={bookId}
          loreId={mode.loreId}
          sourceToken={mode.sourceToken}
          entityName={mode.name}
          resumeWriteId={mode.writeId}
          onClose={onClose}
          onRemoved={(id) =>
            onCompleted([id], 'Retirada confirmada. O compêndio será conferido novamente.')
          }
        />
      );
    case 'remove-selection':
      return (
        <BookLoreRemovalSelectionDialog
          open
          bookId={bookId}
          targets={mode.targets}
          resumeSelectionId={mode.selectionId}
          onClose={onClose}
          onCompleted={(ids, result) =>
            onCompleted(
              ids,
              `${ids.length} de ${result.total} fichas retiradas. O compêndio será conferido novamente.`,
            )
          }
        />
      );
    case 'visibility':
      return (
        <BookLoreVisibilitySelectionDialog
          open
          bookId={bookId}
          targets={mode.targets}
          value={mode.value}
          resumeSelectionId={mode.selectionId}
          onClose={onClose}
          onCompleted={(ids, result) =>
            onCompleted(
              [...ids, ...result.unchangedIds],
              `Alterações aplicadas: ${result.applied}. Sem mudança: ${result.unchanged}. O compêndio será conferido novamente.`,
            )
          }
        />
      );
    case 'choose-visibility':
      return (
        <VisibilityChoice
          onClose={onClose}
          onChoose={(value) => onMode({ kind: 'visibility', targets: mode.targets, value })}
        />
      );
    case 'recoveries':
      return (
        <Dialog
          open
          title="Retomadas do compêndio"
          onClose={onClose}
          footer={
            <Button variant="secondary" onClick={onClose}>
              Fechar
            </Button>
          }
        >
          {disabled && (
            <Alert>
              Uma operação do capítulo está em andamento. Aguarde para abrir uma retomada.
            </Alert>
          )}
          <fieldset className="contents" disabled={disabled}>
            <BookLoreRecoveries
              bookId={bookId}
              entities={entities}
              onSelect={(writeId, loreId) => onMode({ kind: 'edit', writeId, loreId })}
            />
            <BookLoreCreationRecoveries
              bookId={bookId}
              entities={entities}
              onSelect={(writeId) => onMode({ kind: 'create', writeId })}
            />
            <BookLoreRemovalRecoveries
              bookId={bookId}
              entities={entities}
              onSelect={(writeId, loreId) => onMode({ kind: 'remove', writeId, loreId })}
            />
            <BookLoreRemovalSelectionRecoveries
              bookId={bookId}
              onSelect={(selectionId) => onMode({ kind: 'remove-selection', selectionId })}
            />
            <BookLoreVisibilitySelectionRecoveries
              bookId={bookId}
              onSelect={(selectionId) => onMode({ kind: 'visibility', selectionId })}
            />
          </fieldset>
        </Dialog>
      );
  }
}
function VisibilityChoice({
  onClose,
  onChoose,
}: {
  onClose: () => void;
  onChoose: (value: boolean) => void;
}) {
  const [value, setValue] = useState('');
  return (
    <Dialog
      open
      title="Alterar visibilidade da seleção"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!value} onClick={() => onChoose(value === 'public')}>
            Revisar seleção
          </Button>
        </>
      }
    >
      <Dropdown
        mode="select"
        label="Nova visibilidade"
        value={value}
        onValueChange={setValue}
        placeholder="Escolha a visibilidade"
        options={[
          { value: 'private', label: 'Privado' },
          { value: 'public', label: 'Público' },
        ]}
      />
      <p>
        Você conferirá as fichas e confirmará antes de aplicar. Esta ação não publica
        automaticamente.
      </p>
    </Dialog>
  );
}
