import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import {
  listSceneGroups,
  listScenes,
  sceneRoute,
  type SceneGroup,
  type SceneSummary,
} from '@/features/scenes';
import { useAdventureLoreContext } from '@/features/lore';
import { Badge, Button, Dropdown } from '@/shared/ui';
import type {
  NarrativeContext,
  NarrativeItem,
  NarrativeReference,
  NarrativeSource,
  NarrativeSummary,
  NarrativeReferenceView,
  NarrativeLoreOption,
} from '../model/narrative';
import { narrativeSource } from '../model/narrative';
import {
  listNarrativeItems,
  listNarrativeLoreOptions,
  listNarrativeReferences,
  setNarrativeReference,
  getNarrativeItem,
} from '../services/narrativePlanningService';
import { useNarrativePage } from '../hooks/useNarrativePage';
import { NarrativeOperationDialog } from './NarrativeOperationDialog';
import { NarrativePageFeedback } from './NarrativePageFeedback';
import styles from './Narrative.module.css';
export function NarrativeReferences({
  context,
  item,
  onChange,
  onOpen,
}: {
  context: NarrativeContext;
  item: NarrativeItem;
  onChange: () => void;
  onOpen: (item: NarrativeSource) => void;
}) {
  const { target } = context;
  const loreContext = useAdventureLoreContext(target.kind === 'adventure' ? target.id : null);
  const location = useLocation();
  const source = narrativeSource(item);
  const [version, setVersion] = useState(0);
  const [link, setLink] = useState<{
    reference: NarrativeReference;
    label: string;
    remove?: boolean;
  } | null>(null);
  const [adding, setAdding] = useState(false);
  const [revision, setRevision] = useState(item.revision);
  const refs = useNarrativePage<NarrativeReferenceView>(
    'refs:' + item.id + ':' + version + ':' + context.projectRevision,
    (cursor) => listNarrativeReferences({ target, source, cursor, limit: 25 }),
    (value) => value.id,
  );
  const start = (reference: NarrativeReference, label: string) => {
    setLink({ reference, label });
    setAdding(false);
  };
  return (
    <section className={styles.section} aria-label="Referências do item">
      <div className={styles.toolbar}>
        <h3>Referências</h3>
        <Button variant="outline" onClick={() => setAdding(true)}>
          Vincular referência
        </Button>
      </div>
      <ul className={styles.list}>
        {refs.items.map((stored) => {
          const linked = stored.reference.kind === 'lore' ? stored.reference.reference : null;
          const fresh =
            linked && target.kind === 'adventure'
              ? loreContext.items.find(
                  (entity) =>
                    entity.reference.kind === linked.kind &&
                    entity.reference.scopeId === linked.scopeId &&
                    entity.reference.entityId === linked.entityId,
                )
              : undefined;
          const ref =
            linked && target.kind === 'adventure'
              ? { ...stored, available: Boolean(fresh), label: fresh?.name }
              : stored;
          return (
            <li key={ref.id} className={styles.row}>
              <span>
                {ref.available ? (ref.label ?? 'Referência') : 'Referência indisponível'}{' '}
                {ref.available && ref.archived && <Badge variant="secondary">Cena arquivada</Badge>}
              </span>
              <div className={styles.actions}>
                {ref.available && ref.reference.kind === 'scene' && (
                  <Link
                    to={sceneRoute(target, ref.reference.sceneId)}
                    state={{ returnTo: location.pathname + location.search }}
                  >
                    Abrir cena
                  </Link>
                )}
                {ref.available && ref.reference.kind === 'event' && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      if (ref.reference.kind === 'event')
                        onOpen({ kind: 'event', id: ref.reference.eventId });
                    }}
                  >
                    Abrir evento vinculado
                  </Button>
                )}
                <Button
                  variant="ghost"
                  aria-label={
                    'Remover referência ' +
                    (ref.available ? (ref.label ?? 'vinculada') : 'indisponível')
                  }
                  onClick={() =>
                    setLink({
                      reference: ref.reference,
                      label: ref.available
                        ? (ref.label ?? 'Referência')
                        : 'Referência indisponível',
                      remove: true,
                    })
                  }
                >
                  Remover
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      <NarrativePageFeedback
        page={refs}
        emptyLabel="Nenhuma referência vinculada"
        moreLabel="Carregar mais referências"
      />
      {adding && (
        <ReferencePicker
          context={context}
          item={item}
          onPick={start}
          onClose={() => setAdding(false)}
        />
      )}
      {link && (
        <NarrativeOperationDialog
          title={link.remove ? 'Remover referência' : 'Confirmar referência'}
          description={
            target.kind === 'adventure' && link.reference.kind === 'lore'
              ? (loreContext.items.find(
                  (entity) =>
                    entity.id ===
                    `${link.reference.kind === 'lore' ? link.reference.reference.kind : ''}:${link.reference.kind === 'lore' ? link.reference.reference.scopeId : ''}:${link.reference.kind === 'lore' ? link.reference.reference.entityId : ''}`,
                )?.name ?? 'Referência indisponível')
              : link.label
          }
          onClose={() => setLink(null)}
          onSuccess={() => {
            setLink(null);
            setVersion((value) => value + 1);
            onChange();
          }}
          onCompare={async () => {
            const current = await getNarrativeItem({ target, source });
            if (!current || current.deleting) throw new Error('Item indisponível.');
            setRevision(current.revision);
          }}
          buildOperation={(operationId) => {
            const input = {
              target,
              source,
              operationId,
              expectedRevision: Math.max(item.revision, revision),
              reference: link.reference,
              remove: link.remove ?? false,
            };
            return () => setNarrativeReference(input);
          }}
        >
          {() => <p>Este vínculo é privado e não acrescenta conteúdo ao manuscrito.</p>}
        </NarrativeOperationDialog>
      )}
    </section>
  );
}
import { Dialog } from '@/shared/ui';
function ReferencePicker({
  context,
  item,
  onPick,
  onClose,
}: {
  context: NarrativeContext;
  item: NarrativeItem;
  onPick: (reference: NarrativeReference, label: string) => void;
  onClose: () => void;
}) {
  const [kind, setKind] = useState('scene');
  return (
    <Dialog
      open
      title="Selecionar referência"
      description="Escolha uma origem autorizada por identidade."
      onClose={onClose}
    >
      <Dropdown
        mode="select"
        label="Tipo de referência"
        value={kind}
        onValueChange={setKind}
        options={[
          { value: 'scene', label: 'Cena' },
          { value: 'event', label: 'Evento' },
          { value: 'lore', label: 'Entidade de lore' },
        ]}
      />
      {kind === 'scene' ? (
        <ScenePicker target={context.target} onPick={onPick} />
      ) : kind === 'event' ? (
        <EventPicker context={context} item={item} onPick={onPick} />
      ) : (
        <LorePicker context={context} onPick={onPick} />
      )}
    </Dialog>
  );
}
function ScenePicker({
  target,
  onPick,
}: {
  target: NarrativeContext['target'];
  onPick: (reference: NarrativeReference, label: string) => void;
}) {
  const [parent, setParent] = useState('');
  const [archived, setArchived] = useState('false');
  const [selected, setSelected] = useState('');
  const groups = useNarrativePage<SceneGroup>(
    'groups',
    (cursor) => listSceneGroups({ target, cursor, limit: 25 }),
    (value) => String(value.id),
  );
  const scenes = useNarrativePage<SceneSummary>(
    'scene-options:' + parent + ':' + archived,
    (cursor) =>
      listScenes({
        target,
        parentId: parent || null,
        archived: archived === 'true',
        cursor,
        limit: 25,
      }),
    (value) => value.id,
  );
  const choice = scenes.items.find((value) => value.id === selected);
  return (
    <>
      <Dropdown
        mode="select"
        label={target.kind === 'book' ? 'Capítulo' : 'Parte'}
        value={parent || 'unassigned'}
        onValueChange={(value) => {
          setParent(value === 'unassigned' ? '' : value);
          setSelected('');
        }}
        options={[
          { value: 'unassigned', label: target.kind === 'book' ? 'Sem capítulo' : 'Sem parte' },
          ...groups.items
            .filter((value) => value.id && !value.deleting && value.contentMode === 'scenes')
            .map((value) => ({ value: value.id!, label: value.title })),
        ]}
        searchable
      />
      <NarrativePageFeedback
        page={groups}
        emptyLabel="Nenhum agrupador encontrado"
        moreLabel="Carregar mais agrupadores"
      />
      <Dropdown
        mode="select"
        label="Disponibilidade da cena"
        value={archived}
        onValueChange={(value) => {
          setArchived(value);
          setSelected('');
        }}
        options={[
          { value: 'false', label: 'Ativas' },
          { value: 'true', label: 'Arquivadas' },
        ]}
      />
      <Dropdown
        mode="select"
        label="Cena"
        value={selected}
        onValueChange={setSelected}
        options={scenes.items.map((value) => ({ value: value.id, label: value.title }))}
        disabled={scenes.loading}
        searchable
      />
      <NarrativePageFeedback
        page={scenes}
        emptyLabel="Nenhuma cena neste agrupador"
        moreLabel="Carregar mais cenas"
      />
      <Button
        disabled={!choice || scenes.loading || Boolean(scenes.error)}
        onClick={() => {
          if (choice) onPick({ kind: 'scene', sceneId: choice.id }, choice.title);
        }}
      >
        Selecionar cena
      </Button>
    </>
  );
}
function EventPicker({
  context,
  item,
  onPick,
}: {
  context: NarrativeContext;
  item: NarrativeItem;
  onPick: (reference: NarrativeReference, label: string) => void;
}) {
  const [selected, setSelected] = useState('');
  const events = useNarrativePage<NarrativeSummary>(
    'events',
    (cursor) =>
      listNarrativeItems({
        target: context.target,
        resource: { kind: 'event' },
        cursor,
        limit: 25,
      }),
    (value) => value.id,
  );
  const choice = events.items.find((value) => value.id === selected);
  return (
    <>
      <Dropdown
        mode="select"
        label="Evento"
        value={selected}
        onValueChange={setSelected}
        options={events.items
          .filter((value) => !value.deleting && !(item.kind === 'event' && value.id === item.id))
          .map((value) => ({ value: value.id, label: value.title }))}
        disabled={events.loading}
        searchable
      />
      <NarrativePageFeedback
        page={events}
        emptyLabel="Nenhum evento disponível"
        moreLabel="Carregar mais eventos"
      />
      <Button
        disabled={!choice || events.loading || Boolean(events.error)}
        onClick={() => {
          if (choice) onPick({ kind: 'event', eventId: choice.id }, choice.title);
        }}
      >
        Selecionar evento
      </Button>
    </>
  );
}
export function LoreOptions({
  context,
  onSelect,
}: {
  context: NarrativeContext;
  onSelect: (
    reference: Extract<NarrativeReference, { kind: 'lore' }>['reference'],
    label: string,
  ) => void;
}) {
  const loreContext = useAdventureLoreContext(
    context.target.kind === 'adventure' ? context.target.id : null,
  );
  const [scope, setScope] = useState<'book' | 'universe' | 'adventure'>(
    context.target.kind === 'book' ? 'book' : 'adventure',
  );
  const [selected, setSelected] = useState('');
  const options = useNarrativePage<NarrativeLoreOption>(
    'lore-options:' +
      scope +
      ':' +
      context.universeId +
      ':' +
      (loreContext.context?.identity.contextToken ?? 'checking'),
    (cursor) =>
      scope !== 'universe' || context.universeId
        ? listNarrativeLoreOptions({ target: context.target, scope, cursor, limit: 25 })
        : Promise.resolve({ items: [], nextCursor: null }),
    (value) => JSON.stringify(value.reference),
  );
  const visibleOptions =
    context.target.kind === 'adventure'
      ? options.items.flatMap((value) => {
          const fresh = loreContext.items.find(
            (entity) =>
              entity.reference.kind === value.reference.kind &&
              entity.reference.scopeId === value.reference.scopeId &&
              entity.reference.entityId === value.reference.entityId,
          );
          return fresh ? [{ ...value, name: fresh.name }] : [];
        })
      : options.items;
  const choice = visibleOptions.find((value) => JSON.stringify(value.reference) === selected);
  const available =
    scope !== 'universe' ? scope === context.target.kind : Boolean(context.universeId);
  return (
    <>
      <Dropdown
        mode="select"
        label="Origem da entidade"
        value={scope}
        onValueChange={(value) => {
          setScope(value === 'book' ? 'book' : value === 'adventure' ? 'adventure' : 'universe');
          setSelected('');
        }}
        options={[
          ...(context.target.kind === 'book'
            ? [{ value: 'book', label: 'Livro' }]
            : [{ value: 'adventure', label: 'Aventura' }]),
          ...(context.universeId ? [{ value: 'universe', label: 'Universo' }] : []),
        ]}
      />
      {available ? (
        <>
          <Dropdown
            mode="select"
            label="Entidade"
            value={selected}
            onValueChange={setSelected}
            disabled={
              options.loading || (context.target.kind === 'adventure' && loreContext.loading)
            }
            options={visibleOptions.map((value) => ({
              value: JSON.stringify(value.reference),
              label: value.name,
            }))}
            searchable
          />
          <NarrativePageFeedback
            page={options}
            emptyLabel="Nenhuma entidade disponível"
            moreLabel="Carregar mais entidades"
          />
          <Button
            disabled={!choice || options.loading || Boolean(options.error)}
            onClick={() => {
              if (choice) onSelect(choice.reference, choice.name);
            }}
          >
            Selecionar entidade
          </Button>
        </>
      ) : (
        <p>
          Vincule um universo à aventura para selecionar seu lore. Cenas e eventos continuam
          disponíveis.
        </p>
      )}
    </>
  );
}
function LorePicker({
  context,
  onPick,
}: {
  context: NarrativeContext;
  onPick: (reference: NarrativeReference, label: string) => void;
}) {
  return (
    <LoreOptions
      context={context}
      onSelect={(reference, label) => onPick({ kind: 'lore', reference }, label)}
    />
  );
}
