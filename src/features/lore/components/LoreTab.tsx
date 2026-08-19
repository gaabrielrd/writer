import { useState } from 'react';
import { BookOpen, MapPin, Plus, Tag, User, X } from 'lucide-react';
import { Button, EmptyState, ErrorState, Input, LoadingState } from '@/shared/ui';
import type { Book } from '@/features/books';
import {
  type CreateLoreEntityInput,
  type LoreCategory,
  type LoreEntity,
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
  } = useLore(book.id);

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

  const handleDelete = (entityId: string) => {
    void deleteEntity(entityId);
  };

  if (loreLoading && entities.length === 0) {
    return <LoadingState label="Carregando compêndio de lore..." />;
  }

  if (loreError) {
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
          description="Você ainda não cadastrou personagens, locais ou conceitos para este livro. Crie sua primeira entidade para estruturar o worldbuilding."
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
        entityToEdit={editingEntity}
        allEntities={entities}
        onClose={() => setIsFormOpen(false)}
        onSubmit={handleFormSubmit}
      />

      <LoreDrawer
        open={Boolean(viewingEntity)}
        entity={viewingEntity}
        allEntities={entities}
        onClose={() => setViewingEntity(null)}
        onEdit={(e) => {
          setViewingEntity(null);
          handleOpenEdit(e);
        }}
      />
    </div>
  );
}
