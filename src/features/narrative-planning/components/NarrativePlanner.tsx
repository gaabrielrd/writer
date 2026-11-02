import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { BookOpen, CalendarDays, Flag, Link2 } from 'lucide-react';
import { useAuth } from '@/features/auth';
import { Badge, Button, EmptyState, ErrorState, LoadingState } from '@/shared/ui';
import type {
  NarrativeContext,
  NarrativeItem,
  NarrativePage,
  NarrativeResource,
  NarrativeSource,
  NarrativeSummary,
  NarrativeTarget,
} from '../model/narrative';
import { narrativeResource, narrativeSource } from '../model/narrative';
import {
  getNarrativeContext,
  getNarrativeItem,
  listNarrativeItems,
} from '../services/narrativePlanningService';
import { useNarrativePage } from '../hooks/useNarrativePage';
import { useNarrativeResource } from '../hooks/useNarrativeResource';
import { NarrativeItemDialog } from './NarrativeItemDialog';
import { NarrativeMoveDialog } from './NarrativeMoveDialog';
import { NarrativeJobDialog } from './NarrativeJobDialog';
import { NarrativeReferences } from './NarrativeReferences';
import { NarrativeEntities } from './NarrativeEntities';
import { NarrativePageFeedback } from './NarrativePageFeedback';
import styles from './Narrative.module.css';
export interface NarrativePlannerProps {
  target: NarrativeTarget;
  onProjectChange?: () => void;
}
export function NarrativePlanner({ target, onProjectChange }: NarrativePlannerProps) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingState label="Carregando conta…" />;
  if (!user) return <EmptyState title="Entre para planejar arcos e cronologia" />;
  return (
    <PlannerSession
      key={user.uid + ':' + target.kind + ':' + target.id}
      uid={user.uid}
      target={target}
      onProjectChange={onProjectChange}
    />
  );
}
function PlannerSession({ uid, target, onProjectChange }: NarrativePlannerProps & { uid: string }) {
  const context = useNarrativeResource('context:' + target.kind + ':' + target.id, () =>
    getNarrativeContext({ target }),
  );
  const [params, setParams] = useSearchParams();
  const view =
    params.get('narrativeView') === 'timeline'
      ? 'timeline'
      : params.get('narrativeView') === 'entities'
        ? 'entities'
        : 'arcs';
  const arcId = params.get('narrativeArc');
  const itemId = params.get('narrativeItem');
  const open = (source: NarrativeSource) =>
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set('narrativeView', source.kind === 'event' ? 'timeline' : 'arcs');
      if (source.kind === 'arc') {
        next.set('narrativeArc', source.id);
        next.delete('narrativeItem');
      } else if (source.kind === 'milestone') {
        next.set('narrativeArc', source.arcId);
        next.set('narrativeItem', source.id);
      } else next.set('narrativeItem', source.id);
      return next;
    });
  const change = () => {
    context.retry();
    onProjectChange?.();
  };
  const chooseView = (value: string) =>
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set('narrativeView', value);
      next.delete('narrativeItem');
      return next;
    });
  const back = () =>
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      if (next.has('narrativeItem')) next.delete('narrativeItem');
      else next.delete('narrativeArc');
      return next;
    });
  if (context.loading) return <LoadingState label="Carregando planejamento…" />;
  if (context.error) return <ErrorState error={context.error} onRetry={context.retry} />;
  const current = context.value;
  if (
    !current ||
    current.ownerId !== uid ||
    current.target.kind !== target.kind ||
    current.target.id !== target.id
  )
    return (
      <EmptyState
        title="Planejamento indisponível"
        description="Este projeto não está disponível para sua conta."
      />
    );
  const selected: NarrativeSource | null =
    view === 'timeline' && itemId
      ? { kind: 'event', id: itemId }
      : view === 'arcs' && arcId
        ? itemId
          ? { kind: 'milestone', arcId, id: itemId }
          : { kind: 'arc', id: arcId }
        : null;
  return (
    <section className={styles.planner} aria-label="Arcos e cronologia">
      <header className={styles.heading}>
        <h2>
          <BookOpen className="icon" aria-hidden="true" /> Arcos e cronologia
        </h2>
        <p className={styles.hint}>
          Organize a evolução da história. A ordem é manual; datas livres não alteram o manuscrito.
        </p>
      </header>
      <nav className={styles.toolbar} aria-label="Visões do planejamento">
        <Button
          variant={view === 'arcs' ? 'default' : 'outline'}
          aria-pressed={view === 'arcs'}
          onClick={() => chooseView('arcs')}
        >
          <Flag className="icon icon-sm" aria-hidden="true" /> Arcos
        </Button>
        <Button
          variant={view === 'timeline' ? 'default' : 'outline'}
          aria-pressed={view === 'timeline'}
          onClick={() => chooseView('timeline')}
        >
          <CalendarDays className="icon icon-sm" aria-hidden="true" /> Cronologia
        </Button>
        <Button
          variant={view === 'entities' ? 'default' : 'outline'}
          aria-pressed={view === 'entities'}
          onClick={() => chooseView('entities')}
        >
          <Link2 className="icon icon-sm" aria-hidden="true" /> Entidades
        </Button>
        <Button variant="ghost" onClick={context.retry}>
          Atualizar planejamento
        </Button>
      </nav>
      {view === 'entities' ? (
        <NarrativeEntities
          key={current.universeId}
          context={current}
          onChange={change}
          onOpen={open}
        />
      ) : selected ? (
        <NarrativeDetail
          key={JSON.stringify(selected) + ':' + current.universeId}
          context={current}
          source={selected}
          onBack={back}
          onChange={change}
          onOpen={open}
        />
      ) : (
        <NarrativeSequence
          key={view}
          context={current}
          resource={{ kind: view === 'timeline' ? 'event' : 'arc' }}
          onChange={change}
          onOpen={open}
        />
      )}
    </section>
  );
}
function NarrativeSequence({
  context,
  resource,
  onChange,
  onOpen,
}: {
  context: NarrativeContext;
  resource: NarrativeResource;
  onChange: () => void;
  onOpen: (source: NarrativeSource) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [rebalancing, setRebalancing] = useState(false);
  const [removing, setRemoving] = useState<NarrativeSummary | null>(null);
  const page = useNarrativePage<NarrativeSummary, NarrativePage<NarrativeSummary>>(
    'items:' + JSON.stringify(resource) + ':' + context.projectRevision,
    (cursor) => listNarrativeItems({ target: context.target, resource, cursor, limit: 25 }),
    (value) => value.id,
  );
  const labels = {
    arc: ['Arcos', 'Novo arco', 'Nenhum arco planejado'],
    event: ['Cronologia', 'Novo evento', 'Nenhum evento registrado'],
    milestone: ['Marcos', 'Novo marco', 'Nenhum marco planejado'],
  }[resource.kind];
  const sequence = page.page?.sequence;
  return (
    <section className={styles.section} aria-label={labels[0]}>
      <div className={styles.toolbar}>
        <h3>{labels[0]}</h3>
        <Button disabled={sequence?.rebalancing} onClick={() => setCreating(true)}>
          {labels[1]}
        </Button>
        <Button variant="outline" onClick={() => setRebalancing(true)}>
          {sequence?.rebalancing ? 'Retomar reorganização' : 'Reorganizar posições'}
        </Button>
      </div>
      {resource.kind === 'event' && (
        <p className={styles.hint}>
          A data é uma anotação livre. A sequência abaixo segue a ordem que você escolher.
        </p>
      )}
      <ol className={styles.list}>
        {page.items.map((item) => (
          <li className={styles.row} key={item.id}>
            <div className={styles.itemText}>
              <strong>{item.title}</strong>
              {item.kind === 'event' && (
                <span className={styles.date}>{item.dateLabel || 'Sem data'}</span>
              )}
              {item.deleting && <Badge variant="secondary">Em exclusão</Badge>}
            </div>
            <div className={styles.actions}>
              {item.deleting ? (
                <Button variant="outline" onClick={() => setRemoving(item)}>
                  Retomar exclusão
                </Button>
              ) : (
                <Button variant="ghost" onClick={() => onOpen(narrativeSource(item))}>
                  {item.kind === 'arc'
                    ? 'Abrir arco'
                    : item.kind === 'event'
                      ? 'Abrir evento'
                      : 'Abrir marco'}
                </Button>
              )}
            </div>
          </li>
        ))}
      </ol>
      <NarrativePageFeedback
        page={page}
        emptyLabel={labels[2] ?? 'Nenhum item'}
        moreLabel={
          'Carregar mais ' +
          (resource.kind === 'arc' ? 'arcos' : resource.kind === 'event' ? 'eventos' : 'marcos')
        }
      />
      {creating && (
        <NarrativeItemDialog
          target={context.target}
          resource={resource}
          onClose={() => setCreating(false)}
          onSuccess={() => {
            setCreating(false);
            onChange();
          }}
        />
      )}
      {rebalancing && (
        <NarrativeJobDialog
          target={context.target}
          choice={{ kind: 'rebalance', resource }}
          operationId={sequence?.rebalanceOperationId}
          onClose={() => setRebalancing(false)}
          onSuccess={() => {
            setRebalancing(false);
            onChange();
          }}
        />
      )}
      {removing && (
        <NarrativeJobDialog
          target={context.target}
          choice={{
            kind: 'delete-item',
            source: narrativeSource(removing),
            expectedRevision: removing.revision,
          }}
          operationId={removing.deletionOperationId}
          onClose={() => setRemoving(null)}
          onSuccess={() => {
            setRemoving(null);
            onChange();
          }}
        />
      )}
    </section>
  );
}
function NarrativeDetail({
  context,
  source,
  onBack,
  onChange,
  onOpen,
}: {
  context: NarrativeContext;
  source: NarrativeSource;
  onBack: () => void;
  onChange: () => void;
  onOpen: (source: NarrativeSource) => void;
}) {
  const detail = useNarrativeResource(
    'detail:' + JSON.stringify(source) + ':' + context.projectRevision,
    () => getNarrativeItem({ target: context.target, source }),
  );
  if (detail.loading) return <LoadingState label="Carregando detalhes…" />;
  if (detail.error) return <ErrorState error={detail.error} onRetry={detail.retry} />;
  const item = detail.value;
  if (
    !item ||
    item.ownerId !== context.ownerId ||
    item.kind !== source.kind ||
    item.id !== source.id ||
    (item.kind === 'milestone' && source.kind === 'milestone' && item.arcId !== source.arcId)
  )
    return (
      <EmptyState
        title="Item indisponível"
        description="Não é possível abrir esta origem."
        action={
          <Button variant="outline" onClick={onBack}>
            Voltar à lista
          </Button>
        }
      />
    );
  return (
    <ItemDetail item={item} context={context} onBack={onBack} onChange={onChange} onOpen={onOpen} />
  );
}
function ItemDetail({
  item,
  context,
  onBack,
  onChange,
  onOpen,
}: {
  item: NarrativeItem;
  context: NarrativeContext;
  onBack: () => void;
  onChange: () => void;
  onOpen: (source: NarrativeSource) => void;
}) {
  const [action, setAction] = useState<'edit' | 'move' | 'delete' | null>(null);
  return (
    <section className={styles.section} aria-label="Detalhes do planejamento">
      <div className={styles.toolbar}>
        <Button variant="outline" onClick={onBack}>
          Voltar à lista
        </Button>
        <h3>{item.title}</h3>
        {!item.deleting && (
          <>
            <Button variant="outline" onClick={() => setAction('edit')}>
              Editar
            </Button>
            <Button variant="outline" onClick={() => setAction('move')}>
              Mover
            </Button>
          </>
        )}
        <Button variant="destructive" onClick={() => setAction('delete')}>
          {item.deleting ? 'Retomar exclusão' : 'Excluir'}
        </Button>
      </div>
      {item.kind === 'arc' ? (
        <dl className={styles.fields}>
          <dt>Estado inicial</dt>
          <dd>{item.initialState || 'Não preenchido'}</dd>
          <dt>Objetivo</dt>
          <dd>{item.objective || 'Não preenchido'}</dd>
          <dt>Desfecho planejado</dt>
          <dd>{item.plannedOutcome || 'Não preenchido'}</dd>
        </dl>
      ) : item.kind === 'event' ? (
        <>
          <p className={styles.date}>{item.dateLabel || 'Sem data'}</p>
          <p className={styles.prose}>{item.description || 'Nenhuma descrição.'}</p>
        </>
      ) : (
        <p className={styles.prose}>{item.notes || 'Nenhuma nota.'}</p>
      )}
      {!item.deleting && (
        <NarrativeReferences context={context} item={item} onChange={onChange} onOpen={onOpen} />
      )}
      {item.kind === 'arc' && !item.deleting && (
        <NarrativeSequence
          context={context}
          resource={{ kind: 'milestone', arcId: item.id }}
          onChange={onChange}
          onOpen={onOpen}
        />
      )}
      {action === 'edit' && (
        <NarrativeItemDialog
          target={context.target}
          resource={narrativeResource(item)}
          item={item}
          onClose={() => setAction(null)}
          onSuccess={() => {
            setAction(null);
            onChange();
          }}
        />
      )}
      {action === 'move' && (
        <NarrativeMoveDialog
          target={context.target}
          item={item}
          onClose={() => setAction(null)}
          onSuccess={() => {
            setAction(null);
            onChange();
          }}
        />
      )}
      {action === 'delete' && (
        <NarrativeJobDialog
          target={context.target}
          choice={{
            kind: 'delete-item',
            source: narrativeSource(item),
            expectedRevision: item.revision,
          }}
          operationId={item.deletionOperationId}
          onClose={() => setAction(null)}
          onSuccess={() => {
            setAction(null);
            onBack();
            onChange();
          }}
        />
      )}
    </section>
  );
}
