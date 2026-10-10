import { useMemo, useState } from 'react';
import { BookOpen, MapPin, Plus, Tag, User, X } from 'lucide-react';
import {
  Alert,
  Button,
  Dialog,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Select,
} from '@/shared/ui';
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
import styles from './LorePage.module.css';

export interface LoreTabProps {
  book: Book;
}

/**
 * Conteúdo do compêndio de lore reutilizável.
 * Usado inline no BookPage (aba Compêndio) e no LorePage standalone.
 */
export function LoreTab({ book }: LoreTabProps) {
  return (
    <BookLoreScopes key={`${book.authorId}:${book.id}:${book.universeId ?? ''}`} book={book} />
  );
}
function BookLoreScopes({ book }: LoreTabProps) {
  const [selected, setSelected] = useState('local');
  const globalScope = useMemo(
    () => (book.universeId ? { kind: 'universe' as const, id: book.universeId } : null),
    [book.universeId],
  );
  const globalLore = useLore(globalScope);
  return (
    <>
      {book.universeId && (
        <Select
          label="Escopo do compêndio"
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
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
        <LoreCollection key="global" scope={globalScope} />
      ) : (
        <LoreCollection key="local" scope={book.id} relatedEntities={globalLore.entities} />
      )}
    </>
  );
}
export function LoreCollection({
  scope,
  relatedEntities = [],
}: {
  scope: string | LoreScope;
  relatedEntities?: LoreEntity[];
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
  };

  async function remove(entityId: string) {
    setDeleting(true);
    setActionError('');
    try {
      await deleteEntity(entityId);
      setDeletingEntity(null);
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

  return (
    <div className={styles.loreTabContainer}>
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
      <div className={styles.loreTabHeader}>
        <Button variant="primary" onClick={handleOpenCreate}>
          <Plus className="icon icon-sm" aria-hidden="true" />
          Nova Entidade
        </Button>
      </div>

      <div className={styles.filterSection}>
        <div className={styles.searchBar}>
          <Input
            label="Buscar no compêndio"
            placeholder="Buscar por nome, apelido ou resumo..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
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
                className={`${styles.tabButton} ${isSelected ? styles.tabActive : ''}`}
                onClick={() => setCategoryFilter(tab.value)}
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
                setSearchQuery('');
                setCategoryFilter('all');
              }}
            >
              <X className="icon icon-sm" aria-hidden="true" />
              Limpar Filtros
            </Button>
          }
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
