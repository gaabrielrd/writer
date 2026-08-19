import { useState, useMemo } from 'react';
import { BookOpen, MapPin, Plus, Search, Tag, User, X } from 'lucide-react';
import { Badge, Button, Input } from '@vitru/styleguide';
import {
  type CreateLoreEntityInput,
  type LoreCategory,
  type LoreEntity,
  type UpdateLoreEntityInput,
  LoreDrawer,
  LoreEntityForm,
} from '@/features/lore';
import styles from './EditorLoreSidebar.module.css';

export interface EditorLoreSidebarProps {
  isOpen: boolean;
  entities: LoreEntity[];
  selectedEntityId?: string | null;
  onClose: () => void;
  onCreateEntity: (input: CreateLoreEntityInput) => Promise<void>;
  onUpdateEntity: (id: string, input: UpdateLoreEntityInput) => Promise<void>;
}

const CATEGORY_BADGES: Record<
  LoreCategory,
  'neutral' | 'accent' | 'success' | 'danger' | 'highlight'
> = {
  character: 'accent',
  location: 'success',
  concept: 'highlight',
  other: 'neutral',
};

const CATEGORY_LABELS: Record<LoreCategory, string> = {
  character: 'Personagem',
  location: 'Local',
  concept: 'Conceito',
  other: 'Outro',
};

const CATEGORY_ICONS: Record<LoreCategory, typeof User> = {
  character: User,
  location: MapPin,
  concept: BookOpen,
  other: Tag,
};

export function EditorLoreSidebar({
  isOpen,
  entities,
  selectedEntityId,
  onClose,
  onCreateEntity,
  onUpdateEntity,
}: EditorLoreSidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<LoreCategory | 'all'>('all');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [entityToEdit, setEntityToEdit] = useState<LoreEntity | null>(null);
  const [viewingEntity, setViewingEntity] = useState<LoreEntity | null>(null);

  const filteredEntities = useMemo(() => {
    return entities.filter((entity) => {
      const matchesCategory = selectedCategory === 'all' || entity.category === selectedCategory;
      if (!matchesCategory) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const nameMatch = entity.name.toLowerCase().includes(q);
      const summaryMatch = entity.summary.toLowerCase().includes(q);
      const aliasMatch = entity.aliases.some((a) => a.toLowerCase().includes(q));

      return nameMatch || summaryMatch || aliasMatch;
    });
  }, [entities, selectedCategory, searchQuery]);

  if (!isOpen) return null;

  const handleOpenCreate = () => {
    setEntityToEdit(null);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (entity: LoreEntity) => {
    setEntityToEdit(entity);
    setIsFormOpen(true);
  };

  const handleFormSubmit = async (input: CreateLoreEntityInput) => {
    if (entityToEdit) {
      await onUpdateEntity(entityToEdit.id, input);
    } else {
      await onCreateEntity(input);
    }
  };

  return (
    <aside className={styles.sidebar} aria-label="Painel lateral do Compêndio de Lore">
      <div className={styles.header}>
        <div className={styles.headerTitleRow}>
          <h3 className={styles.title}>Compêndio de Lore</h3>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Fechar painel de lore"
          >
            <X className="icon icon-sm" aria-hidden="true" />
          </button>
        </div>
        <p className={styles.description}>
          Consulte e gerencie fichas do universo sem sair do editor.
        </p>
      </div>

      <div className={styles.controls}>
        <Input
          label="Buscar no compêndio"
          placeholder="Buscar personagem, local, item..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />

        <div className={styles.actionsRow}>
          <div className={styles.categoryFilters}>
            <button
              type="button"
              className={`${styles.filterChip} ${selectedCategory === 'all' ? styles.filterChipActive : ''}`}
              onClick={() => setSelectedCategory('all')}
            >
              Todos
            </button>
            <button
              type="button"
              className={`${styles.filterChip} ${selectedCategory === 'character' ? styles.filterChipActive : ''}`}
              onClick={() => setSelectedCategory('character')}
            >
              Personagens
            </button>
            <button
              type="button"
              className={`${styles.filterChip} ${selectedCategory === 'location' ? styles.filterChipActive : ''}`}
              onClick={() => setSelectedCategory('location')}
            >
              Locais
            </button>
            <button
              type="button"
              className={`${styles.filterChip} ${selectedCategory === 'concept' ? styles.filterChipActive : ''}`}
              onClick={() => setSelectedCategory('concept')}
            >
              Conceitos
            </button>
          </div>

          <Button variant="primary" onClick={handleOpenCreate}>
            <Plus className="icon icon-sm" aria-hidden="true" />
            Nova Entidade
          </Button>
        </div>
      </div>

      <div className={styles.entityList}>
        {filteredEntities.length === 0 ? (
          <div className={styles.emptyState}>
            <Search className="icon" aria-hidden="true" />
            <p className={styles.emptyText}>Nenhuma entidade encontrada.</p>
          </div>
        ) : (
          filteredEntities.map((entity) => {
            const isTarget = entity.id === selectedEntityId;
            const IconComp = CATEGORY_ICONS[entity.category] || Tag;

            return (
              <div
                key={entity.id}
                className={`${styles.entityItem} ${isTarget ? styles.entityItemHighlighted : ''}`}
              >
                <div className={styles.itemHeader}>
                  <div className={styles.itemTitleGroup}>
                    <IconComp className="icon icon-sm" aria-hidden="true" />
                    <strong className={styles.entityName}>{entity.name}</strong>
                  </div>
                  <Badge variant={CATEGORY_BADGES[entity.category]}>
                    {CATEGORY_LABELS[entity.category]}
                  </Badge>
                </div>

                {entity.aliases.length > 0 && (
                  <span className={styles.aliases}>Aliases: {entity.aliases.join(', ')}</span>
                )}

                <p className={styles.itemSummary}>{entity.summary}</p>

                <div className={styles.itemActions}>
                  <Button variant="secondary" onClick={() => setViewingEntity(entity)}>
                    Ver Ficha
                  </Button>
                  <Button variant="secondary" onClick={() => handleOpenEdit(entity)}>
                    Editar
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <LoreEntityForm
        open={isFormOpen}
        entityToEdit={entityToEdit}
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
    </aside>
  );
}
