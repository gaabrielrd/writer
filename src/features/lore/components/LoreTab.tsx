import { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, LayoutGrid, List, MapPin, Plus, Search, Tag, User, X } from 'lucide-react';
import {
  Alert,
  Button,
  Dialog,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Dropdown,
} from '@/shared/ui';
import { useAuth } from '@/features/auth';
import { AdventureLoreCollection } from './AdventureLoreCollection';
import type { Book } from '@/features/books';
import {
  type CreateLoreEntityInput,
  type LoreCategory,
  type LoreEntity,
  type LoreScope,
} from '../model/loreEntity';
import { useLore } from '../hooks/useLore';
import { LoreEntityCard } from './LoreEntityCard';
import { LoreEntityForm } from './LoreEntityForm';
import { LoreDrawer } from './LoreDrawer';
import { LoreEntityList } from './LoreEntityList';
import { LoreBulkActions } from './LoreBulkActions';
import styles from './LorePage.module.css';

export interface LoreTabProps {
  book: Book;
  actionsContainer?: HTMLElement | null;
  onEntitiesChanged?: () => void;
  onBusyChange?: (busy: boolean) => void;
}

/**
 * Conteúdo do compêndio de lore reutilizável.
 * Usado inline no BookPage (aba Compêndio) e no LorePage standalone.
 */
export function LoreTab({ book, ...props }: LoreTabProps) {
  return (
    <BookLoreScopes
      key={`${book.authorId}:${book.id}:${book.universeId ?? ''}`}
      book={book}
      {...props}
    />
  );
}
function BookLoreScopes({ book, actionsContainer, onEntitiesChanged, onBusyChange }: LoreTabProps) {
  const [selected, setSelected] = useState('local');
  const [busy, setBusy] = useState(false);
  const collectionProps = {
    actionsContainer,
    onEntitiesChanged,
    onBusyChange: (value: boolean) => {
      setBusy(value);
      onBusyChange?.(value);
    },
  };
  const globalScope = useMemo(
    () => (book.universeId ? { kind: 'universe' as const, id: book.universeId } : null),
    [book.universeId],
  );
  const globalLore = useLore(globalScope);
  return (
    <>
      {book.universeId && (
        <Dropdown
          mode="select"
          label="Escopo do compêndio"
          value={selected}
          disabled={busy}
          onValueChange={(nextValue) => setSelected(nextValue)}
          options={[
            { value: 'local', label: 'Lore local — somente este livro' },
            { value: 'global', label: 'Lore global — universo compartilhado' },
          ]}
        />
      )}
      {globalLore.error && (
        <ErrorState
          title="Não foi possível carregar o lore global"
          description={globalLore.error}
          action={
            <Button onClick={() => void globalLore.refreshEntities()}>Tentar novamente</Button>
          }
        />
      )}
      {selected === 'global' && globalScope ? (
        <LoreCollection key="global" scope={globalScope} {...collectionProps} />
      ) : (
        <LoreCollection
          key="local"
          scope={book.id}
          relatedEntities={globalLore.entities}
          {...collectionProps}
        />
      )}
    </>
  );
}
function LegacyLoreCollection({
  scope,
  relatedEntities = [],
  actionsContainer,
  onEntitiesChanged,
  onBusyChange,
}: {
  scope: string | LoreScope;
  relatedEntities?: LoreEntity[];
  actionsContainer?: HTMLElement | null;
  onEntitiesChanged?: () => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const global = typeof scope !== 'string' && scope.kind === 'universe';
  const {
    entities,
    filteredEntities,
    loading: loreLoading,
    error: loreError,
    searchQuery,
    categoryFilter,
    setSearchQuery,
    setCategoryFilter,
    refreshEntities,
    createEntity,
    updateEntity,
    deleteEntity,
  } = useLore(scope);

  const [actionError, setActionError] = useState('');
  const [deletingEntity, setDeletingEntity] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEntity, setEditingEntity] = useState<LoreEntity | null>(null);
  const [viewingEntity, setViewingEntity] = useState<LoreEntity | null>(null);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [busy, setBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ message: string; failed: boolean } | null>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const listViewRef = useRef<HTMLButtonElement>(null);
  const [selection, setSelection] = useState({
    entities: filteredEntities,
    ids: new Set<string>(),
  });
  // Reconcile removed entities before rendering selection controls.
  if (selection.entities !== filteredEntities) {
    const visibleIds = new Set(filteredEntities.map((entity) => entity.id));
    setSelection({
      entities: filteredEntities,
      ids: new Set([...selection.ids].filter((id) => visibleIds.has(id))),
    });
  }
  const selectedEntities = filteredEntities.filter((entity) => selection.ids.has(entity.id));
  const clearSelection = () => setSelection({ entities: filteredEntities, ids: new Set<string>() });

  const handleOpenCreate = () => {
    setEditingEntity(null);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (entity: LoreEntity) => {
    setEditingEntity(entity);
    setIsFormOpen(true);
  };

  const handleFormSubmit = async (input: CreateLoreEntityInput) => {
    if (editingEntity) {
      await updateEntity(editingEntity.id, input);
    } else {
      await createEntity(input);
    }
    onEntitiesChanged?.();
  };

  async function remove(entityId: string) {
    setDeleting(true);
    setActionError('');
    try {
      await deleteEntity(entityId);
      setDeletingEntity(null);
      onEntitiesChanged?.();
    } catch (cause) {
      setActionError(
        cause instanceof Error ? cause.message : 'Não foi possível excluir a entidade.',
      );
    } finally {
      setDeleting(false);
    }
  }
  const handleDelete = (entityId: string) => {
    if (global) {
      setActionError('');
      setDeletingEntity(entityId);
    } else void remove(entityId);
  };

  if (loreLoading && entities.length === 0 && !isFormOpen) {
    return <LoadingState label="Carregando compêndio de lore..." />;
  }

  if (loreError && entities.length === 0 && !isFormOpen) {
    return (
      <ErrorState
        title="Não foi possível carregar o compêndio"
        description={loreError}
        action={
          <Button variant="secondary" onClick={() => void refreshEntities()}>
            Tentar novamente
          </Button>
        }
      />
    );
  }

  const categoryCounts = {
    all: entities.length,
    character: entities.filter((e) => e.category === 'character').length,
    location: entities.filter((e) => e.category === 'location').length,
    concept: entities.filter((e) => e.category === 'concept').length,
    other: entities.filter((e) => e.category === 'other').length,
  };

  const CATEGORY_TABS: { value: LoreCategory | 'all'; label: string; icon: typeof User }[] = [
    { value: 'all', label: 'Todos', icon: Tag },
    { value: 'character', label: 'Personagens', icon: User },
    { value: 'location', label: 'Locais', icon: MapPin },
    { value: 'concept', label: 'Conceitos / Itens', icon: BookOpen },
    { value: 'other', label: 'Outros', icon: Tag },
  ];

  const controls = (
    <div className={styles.loreTabHeader}>
      <div className={styles.viewSwitch} role="group" aria-label="Visualização do compêndio">
        <Button
          ref={listViewRef}
          variant="ghost"
          size="sm"
          aria-label="Visualização em lista"
          aria-pressed={view === 'list'}
          disabled={busy}
          onClick={() => {
            clearSelection();
            setView('list');
          }}
        >
          <List className="icon icon-sm" aria-hidden="true" />
          Lista
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Visualização em grid"
          aria-pressed={view === 'grid'}
          disabled={busy}
          onClick={() => {
            clearSelection();
            setView('grid');
          }}
        >
          <LayoutGrid className="icon icon-sm" aria-hidden="true" />
          Grid
        </Button>
      </div>
      <Button variant="primary" disabled={busy} onClick={handleOpenCreate}>
        <Plus className="icon icon-sm" aria-hidden="true" />
        Nova Entidade
      </Button>
    </div>
  );

  return (
    <div
      className={`${styles.loreTabContainer} ${selectedEntities.length ? styles.withSelection : ''}`}
    >
      {bulkResult &&
        (bulkResult.failed ? (
          <Alert variant="destructive" title="Ação parcialmente concluída">
            {bulkResult.message}
          </Alert>
        ) : (
          <p role="status">{bulkResult.message}</p>
        ))}
      {loreError && (
        <Alert variant="warning" title="Falha ao sincronizar o lore">
          {loreError}
          <Button variant="secondary" onClick={() => void refreshEntities()}>
            Tentar novamente
          </Button>
        </Alert>
      )}
      {global && (
        <p>
          Edite o lore global deste universo. As alterações são compartilhadas entre seus livros.
        </p>
      )}
      {actionError && !deletingEntity && <Alert variant="destructive">{actionError}</Alert>}
      {deletingEntity && (
        <Dialog
          open
          title="Excluir entidade global?"
          onClose={() => {
            if (!deleting) setDeletingEntity(null);
          }}
          footer={
            <>
              <Button
                variant="secondary"
                disabled={deleting}
                onClick={() => setDeletingEntity(null)}
              >
                Cancelar
              </Button>
              <Button
                variant="danger"
                disabled={deleting}
                onClick={() => void remove(deletingEntity)}
              >
                Confirmar exclusão
              </Button>
            </>
          }
        >
          <p>
            A entidade será removida de todos os livros do universo. Se for pública, as publicações
            ficarão indisponíveis até republicar.
          </p>
          {actionError && <Alert variant="destructive">{actionError}</Alert>}
        </Dialog>
      )}
      {actionsContainer ? createPortal(controls, actionsContainer) : controls}

      <div className={styles.filterSection}>
        <div className={styles.searchBar}>
          <Input
            aria-label="Buscar no compêndio"
            leftIcon={<Search className="icon icon-sm" aria-hidden="true" />}
            placeholder="Buscar por nome, apelido ou resumo..."
            value={searchQuery}
            disabled={busy}
            onChange={(e) => {
              clearSelection();
              setSearchQuery(e.target.value);
            }}
          />
        </div>

        <div className={styles.tabsRow} role="tablist">
          {CATEGORY_TABS.map((tab) => {
            const isSelected = categoryFilter === tab.value;
            const IconComp = tab.icon;
            const count = categoryCounts[tab.value];

            return (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={isSelected}
                disabled={busy}
                className={`${styles.tabButton} ${isSelected ? styles.tabActive : ''}`}
                onClick={() => {
                  clearSelection();
                  setCategoryFilter(tab.value);
                }}
              >
                <IconComp className="icon icon-sm" aria-hidden="true" />
                <span>{tab.label}</span>
                <span className={styles.tabCount}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {entities.length === 0 ? (
        <EmptyState
          title="Nenhuma entidade cadastrada"
          description={`Cadastre personagens, locais e conceitos para ${global ? 'este universo' : 'este livro'}.`}
          action={
            <Button variant="primary" onClick={handleOpenCreate}>
              <Plus className="icon icon-sm" aria-hidden="true" />
              Cadastrar Primeira Entidade
            </Button>
          }
        />
      ) : filteredEntities.length === 0 ? (
        <EmptyState
          title="Nenhuma entidade encontrada"
          description="Nenhuma entidade corresponde aos termos da busca ou aos filtros selecionados."
          action={
            <Button
              variant="secondary"
              onClick={() => {
                clearSelection();
                setSearchQuery('');
                setCategoryFilter('all');
              }}
            >
              <X className="icon icon-sm" aria-hidden="true" />
              Limpar Filtros
            </Button>
          }
        />
      ) : view === 'list' ? (
        <LoreEntityList
          entities={filteredEntities}
          selectedIds={selection.ids}
          disabled={busy}
          selectAllRef={(element) => {
            selectAllRef.current = element;
          }}
          onSelect={(id) => {
            const ids = new Set(selection.ids);
            if (ids.has(id)) ids.delete(id);
            else ids.add(id);
            setSelection({ entities: filteredEntities, ids });
            setBulkResult(null);
          }}
          onSelectAll={() => {
            setSelection({
              entities: filteredEntities,
              ids:
                selectedEntities.length === filteredEntities.length
                  ? new Set<string>()
                  : new Set(filteredEntities.map((entity) => entity.id)),
            });
            setBulkResult(null);
          }}
          onView={setViewingEntity}
          onEdit={handleOpenEdit}
          onDelete={handleDelete}
        />
      ) : (
        <div className={styles.grid}>
          {filteredEntities.map((entity) => (
            <LoreEntityCard
              key={entity.id}
              entity={entity}
              onView={(e) => setViewingEntity(e)}
              onEdit={handleOpenEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      <LoreBulkActions
        entities={selectedEntities}
        global={global}
        onUpdate={updateEntity}
        onDelete={deleteEntity}
        onClear={clearSelection}
        onBusyChange={(value) => {
          setBusy(value);
          onBusyChange?.(value);
        }}
        onCompleted={(succeeded, message, failed) => {
          setSelection((previous) => ({
            ...previous,
            ids: new Set([...previous.ids].filter((id) => !succeeded.includes(id))),
          }));
          setBulkResult({ message, failed });
          if (succeeded.length) onEntitiesChanged?.();
          if (!failed)
            requestAnimationFrame(() => (selectAllRef.current ?? listViewRef.current)?.focus());
        }}
      />

      <LoreEntityForm
        open={isFormOpen}
        global={global}
        entityToEdit={editingEntity}
        allEntities={[...entities, ...relatedEntities]}
        onClose={() => setIsFormOpen(false)}
        onSubmit={handleFormSubmit}
      />

      <LoreDrawer
        open={Boolean(viewingEntity)}
        entity={viewingEntity}
        allEntities={[...entities, ...relatedEntities]}
        onClose={() => setViewingEntity(null)}
        onEdit={(e) => {
          setViewingEntity(null);
          handleOpenEdit(e);
        }}
      />
    </div>
  );
}

export function LoreCollection(props: {
  scope: string | LoreScope;
  active?: boolean;
  relatedEntities?: LoreEntity[];
  actionsContainer?: HTMLElement | null;
  onEntitiesChanged?: () => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  return typeof props.scope !== 'string' && props.scope.kind === 'adventure' ? (
    <AdventureLoreActor
      adventureId={props.scope.id}
      active={props.active}
      onBusyChange={props.onBusyChange}
      onEntitiesChanged={props.onEntitiesChanged}
    />
  ) : (
    <LegacyLoreCollection {...props} />
  );
}

function AdventureLoreActor(props: Parameters<typeof AdventureLoreCollection>[0]) {
  const { user } = useAuth();
  return user ? (
    <AdventureLoreCollection key={JSON.stringify([user.uid, props.adventureId])} {...props} />
  ) : null;
}
