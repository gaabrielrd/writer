import { useEffect, useRef, useState } from 'react';
import { Check, Plus } from 'lucide-react';
import {
  Alert,
  Button,
  Card,
  Dialog,
  Dropdown,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
} from '@/shared/ui';
import type {
  ChecklistItem,
  ChecklistFilter,
  ChecklistPage,
  ChecklistMutation,
  ChecklistDeletion,
  CreateWorkChecklistInput,
  UpdateWorkChecklistInput,
  DeleteWorkChecklistInput,
  PreparationTarget,
} from '../model/workProgress';
import { isWorkConflict, workErrorMessage } from '../model/workProgress';
import {
  createWorkChecklistItem,
  updateWorkChecklistItem,
  deleteWorkChecklistItem,
  listWorkChecklist,
} from '../services/workProgressService';
import { useWorkPage } from '../hooks/useWorkPage';
import { useWorkMutation } from '../hooks/useWorkMutation';
import styles from './WorkProgress.module.css';
export function WorkChecklist({
  target,
  onChange,
}: {
  target: PreparationTarget;
  onChange?: () => void;
}) {
  const [filter, setFilter] = useState<ChecklistFilter>('all');
  const [dialog, setDialog] = useState<{
    key: number;
    item: ChecklistItem | null;
    remove: boolean;
    compare: boolean;
  } | null>(null);
  const [sequence, setSequence] = useState(0);
  const page = useWorkPage<ChecklistItem, ChecklistPage>(
    target.kind + ':' + target.id + ':' + filter,
    (cursor) => listWorkChecklist({ target, filter, cursor, limit: 25 }),
    (item) => item.id,
  );
  const changed = () => {
    page.refresh();
    onChange?.();
  };
  const open = (item: ChecklistItem | null, remove = false, compare = false) => {
    setSequence((n) => n + 1);
    setDialog({ key: sequence, item, remove, compare });
  };
  return (
    <Card className={styles.card}>
      <header className={styles.heading}>
        <h3>Checklist de preparação</h3>
        <Button variant="secondary" onClick={() => open(null)}>
          <Plus className="icon icon-sm" aria-hidden="true" />
          Adicionar tarefa
        </Button>
      </header>
      <p className={styles.hint}>
        Tarefas privadas deste projeto. Concluir uma tarefa não compartilha materiais.
      </p>
      <Dropdown
        mode="select"
        label="Mostrar tarefas"
        value={filter}
        options={[
          { value: 'all', label: 'Todas' },
          { value: 'pending', label: 'Pendentes' },
          { value: 'completed', label: 'Concluídas' },
        ]}
        onValueChange={(value) => setFilter(value as ChecklistFilter)}
      />
      {page.page && (
        <p role="status">
          {page.page.completed} de {page.page.total} tarefas concluídas
        </p>
      )}
      {page.loading && !page.page && <LoadingState label="Carregando tarefas…" />}
      {page.error && !page.page && <ErrorState error={page.error} onRetry={page.retry} />}{' '}
      {!page.loading && !page.error && page.items.length === 0 && (
        <EmptyState
          title={filter === 'all' ? 'Nenhuma tarefa de preparação' : 'Nenhuma tarefa neste filtro'}
          description="Adicione o próximo trabalho necessário para preparar este projeto."
        />
      )}
      <ul className={styles.list}>
        {page.items.map((item) => (
          <ChecklistRow
            key={item.id}
            target={target}
            item={item}
            onChange={changed}
            onEdit={(compare) => open(item, false, compare)}
            onRemove={() => open(item, true)}
          />
        ))}
      </ul>
      {page.error && page.page && (
        <Alert variant="warning">
          {page.error}
          <Button variant="secondary" onClick={page.retry}>
            Tentar carregar tarefas novamente
          </Button>
        </Alert>
      )}
      {page.page?.nextCursor && (
        <Button variant="secondary" disabled={page.loading} onClick={() => void page.more()}>
          {page.loading ? 'Carregando…' : 'Carregar mais tarefas'}
        </Button>
      )}
      {dialog && (
        <ChecklistDialog
          key={dialog.key}
          target={target}
          item={dialog.item}
          remove={dialog.remove}
          initialComparison={dialog.compare}
          onClose={() => setDialog(null)}
          onChange={() => {
            setDialog(null);
            changed();
          }}
        />
      )}
    </Card>
  );
}
function ChecklistRow({
  target,
  item,
  onChange,
  onEdit,
  onRemove,
}: {
  target: PreparationTarget;
  item: ChecklistItem;
  onChange: () => void;
  onEdit: (compare?: boolean) => void;
  onRemove: () => void;
}) {
  const mutation = useWorkMutation(updateWorkChecklistItem, () => onChange());
  return (
    <li className={styles.item}>
      <Button
        variant="secondary"
        aria-pressed={item.completed}
        disabled={mutation.locked}
        aria-label={(item.completed ? 'Reabrir tarefa ' : 'Concluir tarefa ') + item.title}
        onClick={() =>
          void mutation.run(() => ({
            target,
            id: item.id,
            operationId: crypto.randomUUID(),
            expectedRevision: item.revision,
            patch: { completed: !item.completed },
          }))
        }
      >
        <Check className="icon icon-sm" aria-hidden="true" />
        {item.completed ? 'Concluída' : 'Concluir'}
      </Button>
      <span className={styles.copy + ' ' + (item.completed ? styles.completed : '')}>
        {item.title}
      </span>
      <Button
        variant="ghost"
        disabled={mutation.locked}
        onClick={() => onEdit()}
        aria-label={'Editar tarefa ' + item.title}
      >
        Editar
      </Button>
      <Button
        variant="ghost"
        disabled={mutation.locked}
        onClick={onRemove}
        aria-label={'Remover tarefa ' + item.title}
      >
        Remover
      </Button>
      {mutation.error && (
        <Alert variant="warning">
          {mutation.error}
          <Button
            variant="secondary"
            disabled={mutation.busy}
            onClick={() => {
              if (mutation.conflict) onEdit(true);
              else
                void mutation.run(() => ({
                  target,
                  id: item.id,
                  operationId: crypto.randomUUID(),
                  expectedRevision: item.revision,
                  patch: { completed: !item.completed },
                }));
            }}
          >
            {mutation.conflict ? 'Conferir tarefa atual' : 'Confirmar tarefa novamente'}
          </Button>
        </Alert>
      )}
    </li>
  );
}
type ChecklistRequest =
  | { kind: 'create'; input: CreateWorkChecklistInput }
  | { kind: 'update'; input: UpdateWorkChecklistInput }
  | { kind: 'delete'; input: DeleteWorkChecklistInput };
async function execute(request: ChecklistRequest): Promise<ChecklistMutation | ChecklistDeletion> {
  if (request.kind === 'create') return createWorkChecklistItem(request.input);
  if (request.kind === 'update') return updateWorkChecklistItem(request.input);
  return deleteWorkChecklistItem(request.input);
}
function ChecklistDialog({
  target,
  item,
  remove,
  initialComparison,
  onClose,
  onChange,
}: {
  target: PreparationTarget;
  item: ChecklistItem | null;
  remove: boolean;
  initialComparison: boolean;
  onClose: () => void;
  onChange: () => void;
}) {
  const [current, setCurrent] = useState(item);
  const [title, setTitle] = useState(item?.title ?? '');
  const [validation, setValidation] = useState('');
  const [comparison, setComparison] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [comparing, setComparing] = useState(false);
  const [missing, setMissing] = useState(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const feedback = useRef<HTMLDivElement>(null);
  const mutation = useWorkMutation(execute, () => onChange());
  useEffect(() => {
    if (mutation.error || validation) feedback.current?.focus();
  }, [mutation.error, validation]);
  async function compare(cursor: string | null = null) {
    if (!item) return;
    setComparing(true);
    try {
      const page = await listWorkChecklist({ target, filter: 'all', cursor, limit: 25 });
      if (!active.current) return;
      const fresh = page.items.find((value) => value.id === item.id);
      setNextCursor(fresh ? null : page.nextCursor);
      setMissing(!fresh && !page.nextCursor);
      if (fresh) {
        setCurrent(fresh);
        setComparison(
          'Versão atual: ' +
            fresh.title +
            ' · ' +
            (fresh.completed ? 'Concluída' : 'Pendente') +
            '. Seu preenchimento foi preservado.',
        );
      } else
        setComparison(
          page.nextCursor
            ? 'A tarefa não está nesta página. Você pode procurar na próxima.'
            : 'A tarefa está indisponível. Seu preenchimento foi preservado.',
        );
    } catch (cause) {
      if (active.current) {
        if (isWorkConflict(cause)) setNextCursor(null);
        setComparison(workErrorMessage(cause));
      }
    } finally {
      if (active.current) setComparing(false);
    }
  }
  const formId = 'work-checklist-form';
  return (
    <Dialog
      open
      title={remove ? 'Remover tarefa' : item ? 'Editar tarefa' : 'Nova tarefa de preparação'}
      onClose={() => {
        if (!mutation.locked) onClose();
      }}
      footer={
        <>
          <Button variant="secondary" disabled={mutation.locked} onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} disabled={mutation.busy || missing}>
            {mutation.busy
              ? 'Confirmando…'
              : mutation.uncertain
                ? 'Confirmar operação novamente'
                : remove
                  ? 'Remover tarefa'
                  : 'Salvar tarefa'}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          if (!remove && !title.trim()) {
            setValidation('Informe o título da tarefa.');
            return;
          }
          setValidation('');
          void mutation.run(() => {
            const operationId = crypto.randomUUID();
            if (remove && current)
              return {
                kind: 'delete',
                input: { target, id: current.id, operationId, expectedRevision: current.revision },
              };
            if (current)
              return {
                kind: 'update',
                input: {
                  target,
                  id: current.id,
                  operationId,
                  expectedRevision: current.revision,
                  patch: { title: title.trim() },
                },
              };
            return { kind: 'create', input: { target, operationId, title: title.trim() } };
          });
        }}
      >
        {remove ? (
          <p>
            Remover esta tarefa do checklist: {current?.title}. O manuscrito permanece disponível.
          </p>
        ) : (
          <Input
            label="Título da tarefa"
            value={title}
            maxLength={300}
            required
            disabled={mutation.locked}
            onChange={(event) => {
              setTitle(event.target.value);
              setValidation('');
            }}
            error={validation || undefined}
          />
        )}
        <div ref={feedback} tabIndex={-1}>
          {mutation.error && <Alert variant="destructive">{mutation.error}</Alert>}
        </div>
        {comparison && <Alert variant="info">{comparison}</Alert>}
        {(mutation.conflict || initialComparison) && (
          <Button
            type="button"
            variant="secondary"
            disabled={comparing}
            onClick={() => void compare(nextCursor)}
          >
            {comparing
              ? 'Conferindo…'
              : nextCursor
                ? 'Procurar tarefa na próxima página'
                : 'Conferir versão atual'}
          </Button>
        )}
      </form>
    </Dialog>
  );
}
