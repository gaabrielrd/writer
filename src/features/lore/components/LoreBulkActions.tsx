import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Eye, Trash2, X } from 'lucide-react';
import { Alert, Button, Dialog, Dropdown } from '@/shared/ui';
import type { LoreEntity } from '../model/loreEntity';
import styles from './LorePage.module.css';

interface LoreBulkActionsProps {
  entities: LoreEntity[];
  global: boolean;
  onUpdate: (id: string, input: { isPublic: boolean }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onCompleted: (succeeded: string[], message: string, failed: boolean) => void;
  onBusyChange: (busy: boolean) => void;
  onClear: () => void;
}

export function LoreBulkActions({
  entities,
  global,
  onUpdate,
  onDelete,
  onCompleted,
  onBusyChange,
  onClear,
}: LoreBulkActionsProps) {
  const [pending, setPending] = useState<{
    action: 'visibility' | 'delete';
    entities: LoreEntity[];
  } | null>(null);
  const [visibility, setVisibility] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const running = useRef(false);
  const busy = progress !== null;

  async function confirm() {
    if (!pending || running.current || (pending.action === 'visibility' && !visibility)) return;
    running.current = true;
    setProgress(0);
    onBusyChange(true);
    const succeeded: string[] = [];
    const failures: string[] = [];
    for (const [index, entity] of pending.entities.entries()) {
      try {
        if (pending.action === 'delete') await onDelete(entity.id);
        else await onUpdate(entity.id, { isPublic: visibility === 'public' });
        succeeded.push(entity.id);
      } catch (cause) {
        failures.push(
          `${entity.name}: ${cause instanceof Error ? cause.message : 'Não foi possível concluir a ação.'}`,
        );
      }
      setProgress(index + 1);
    }
    const singular = pending.entities.length === 1;
    const verb =
      pending.action === 'delete'
        ? singular
          ? 'excluída'
          : 'excluídas'
        : singular
          ? 'atualizada'
          : 'atualizadas';
    const message = `${succeeded.length} de ${pending.entities.length} ${singular ? 'entidade' : 'entidades'} ${verb}.${failures.length ? ` ${failures.length === 1 ? 'A entidade que falhou continua selecionada' : 'As entidades que falharam continuam selecionadas'} para tentar novamente. ${failures.join(' ')}` : ''}`;
    setPending(null);
    setProgress(null);
    running.current = false;
    onBusyChange(false);
    onCompleted(succeeded, message, failures.length > 0);
  }

  function open(action: 'visibility' | 'delete') {
    setVisibility('');
    setPending({ action, entities: [...entities] });
  }

  return (
    <>
      {entities.length > 0 &&
        createPortal(
          <div className={styles.bulkBar} role="region" aria-label="Ações da seleção">
            <span role="status">
              {entities.length} {entities.length === 1 ? 'selecionada' : 'selecionadas'}
            </span>
            <div className={styles.bulkButtons}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => open('visibility')}
                disabled={busy}
              >
                <Eye className="icon icon-sm" aria-hidden="true" />
                Alterar visibilidade
              </Button>
              <Button variant="danger" size="sm" onClick={() => open('delete')} disabled={busy}>
                <Trash2 className="icon icon-sm" aria-hidden="true" />
                Excluir
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Limpar seleção"
                onClick={onClear}
                disabled={busy}
              >
                <X className="icon icon-sm" aria-hidden="true" />
              </Button>
            </div>
          </div>,
          document.body,
        )}
      {pending && (
        <Dialog
          open
          title={
            pending.action === 'delete'
              ? 'Excluir entidades selecionadas?'
              : 'Alterar visibilidade da seleção'
          }
          description={`${pending.entities.length} ${pending.entities.length === 1 ? 'entidade' : 'entidades'} ${global ? 'do universo compartilhado' : 'deste livro'}.`}
          onClose={() => {
            if (!busy) setPending(null);
          }}
          footer={
            <>
              <Button variant="secondary" disabled={busy} onClick={() => setPending(null)}>
                Cancelar
              </Button>
              <Button
                variant={pending.action === 'delete' ? 'danger' : 'primary'}
                disabled={busy || (pending.action === 'visibility' && !visibility)}
                onClick={() => void confirm()}
              >
                {busy
                  ? 'Aplicando...'
                  : pending.action === 'delete'
                    ? 'Confirmar exclusão'
                    : 'Confirmar visibilidade'}
              </Button>
            </>
          }
        >
          {pending.action === 'visibility' ? (
            <Dropdown
              mode="select"
              label="Nova visibilidade"
              value={visibility}
              disabled={busy}
              onValueChange={(nextValue) => setVisibility(nextValue)}
              options={[
                { value: '', label: 'Escolha a visibilidade' },
                { value: 'public', label: 'Público' },
                { value: 'private', label: 'Privado' },
              ]}
            />
          ) : (
            <p>A exclusão é definitiva e não pode ser desfeita.</p>
          )}
          <ul className={styles.confirmationEntities}>
            {pending.entities.map((entity) => (
              <li key={entity.id}>{entity.name}</li>
            ))}
          </ul>
          {global && (
            <Alert variant="warning" className={styles.privacyWarning}>
              Esta ação altera o original compartilhado em todos os livros deste universo.
            </Alert>
          )}
          {pending.entities.some((entity) => entity.isPublic) &&
            (pending.action === 'delete' || visibility === 'private') && (
              <Alert variant="warning" className={styles.privacyWarning}>
                {global
                  ? 'As publicações dos livros deste universo ficarão indisponíveis até republicar.'
                  : 'A publicação atual deste livro será retirada. Será necessário republicar para disponibilizar a obra novamente.'}
              </Alert>
            )}
          {pending.action === 'visibility' && visibility === 'public' && (
            <p>
              Nome, apelidos, categoria e resumo poderão aparecer na próxima publicação. Fichas
              detalhadas e notas continuam privadas. Esta ação não publica automaticamente.
            </p>
          )}
          {busy && (
            <p role="status">
              Aplicando {progress} de {pending.entities.length}…
            </p>
          )}
        </Dialog>
      )}
    </>
  );
}
