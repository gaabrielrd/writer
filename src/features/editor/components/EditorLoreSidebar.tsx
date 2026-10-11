import { useState, useMemo, useRef, useEffect } from 'react';
import { BookOpen, MapPin, Plus, Search, Tag, User, X } from 'lucide-react';
import { Badge, Button, Input, Select } from '@/shared/ui';
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
  universeId?: string | null;
  selectedEntityId?: string | null;
  createEntityName?: string | null;
  onCreateRequestHandled?: () => void;
  onClose: () => void;
  onCreateEntity: (input: CreateLoreEntityInput, scope?: 'local' | 'global') => Promise<void>;
  onUpdateEntity: (id: string, input: UpdateLoreEntityInput) => Promise<void>;
  onAnalyzeText?: () => void;
}

const CATEGORY_BADGES: Record<LoreCategory, 'default' | 'accent' | 'success' | 'secondary'> = {
  character: 'accent',
  location: 'success',
  concept: 'default',
  other: 'secondary',
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
  universeId,
  selectedEntityId,
  createEntityName,
  onCreateRequestHandled,
  onClose,
  onCreateEntity,
  onUpdateEntity,
  onAnalyzeText,
}: EditorLoreSidebarProps) {
  const [scopeChoice, setScopeChoice] = useState<{
    target?: string | null;
    value: 'local' | 'global';
  }>({ value: 'local' });
  const selectedScope =
    scopeChoice.target === selectedEntityId
      ? scopeChoice.value
      : entities.find((item) => item.id === selectedEntityId)?.universeId
        ? 'global'
        : 'local';
  const selectedCard = useRef<HTMLDivElement>(null);
  useEffect(() => {
    selectedCard.current?.scrollIntoView?.({ block: 'nearest' });
  }, [selectedEntityId, isOpen]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<LoreCategory | 'all'>('all');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [entityToEdit, setEntityToEdit] = useState<LoreEntity | null>(null);
  const [viewingEntity, setViewingEntity] = useState<LoreEntity | null>(null);

  const isCreationRequested = createEntityName !== undefined && createEntityName !== null;
  const editingEntity = isCreationRequested ? null : entityToEdit;

  const filteredEntities = useMemo(() => {
    return entities.filter((entity) => {
      if (Boolean(entity.universeId) !== (selectedScope === 'global')) return false;
      if (entity.id === selectedEntityId) return true;
      const matchesCategory = selectedCategory === 'all' || entity.category === selectedCategory;
      if (!matchesCategory) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const nameMatch = entity.name.toLowerCase().includes(q);
      const summaryMatch = entity.summary.toLowerCase().includes(q);
      const aliasMatch = entity.aliases.some((a) => a.toLowerCase().includes(q));

      return nameMatch || summaryMatch || aliasMatch;
    });
  }, [entities, selectedCategory, searchQuery, selectedEntityId, selectedScope]);

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
    if (editingEntity) {
      await onUpdateEntity(editingEntity.id, input);
    } else {
      if (universeId) await onCreateEntity(input, isCreationRequested ? 'local' : selectedScope);
      else await onCreateEntity(input);
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
        {onAnalyzeText && (
          <Button variant="secondary" onClick={onAnalyzeText}>
            Atualizar compêndio com base no texto
          </Button>
        )}
        {universeId && (
          <Select
            label="Escopo do lore"
            value={selectedScope}
            onChange={(event) =>
              setScopeChoice({
                target: selectedEntityId,
                value: event.target.value as 'local' | 'global',
              })
            }
            options={[
              { value: 'local', label: 'Lore local — somente este livro' },
              { value: 'global', label: 'Lore global — universo compartilhado' },
            ]}
          />
        )}
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

          <Button variant="secondary" onClick={handleOpenCreate}>
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
                ref={isTarget ? selectedCard : undefined}
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

                {isTarget && (
                  <section
                    className={styles.fullRecord}
                    aria-label={`Ficha completa de ${entity.name}`}
                  >
                    {entity.details && (
                      <>
                        <h4>Ficha detalhada</h4>
                        <p>{entity.details}</p>
                      </>
                    )}
                    {entity.structuredDetails &&
                      Object.entries(entity.structuredDetails)
                        .filter(([, value]) => value)
                        .map(([field, value]) => (
                          <p key={field}>
                            <strong>
                              {(
                                {
                                  notes: 'Notas',
                                  age: 'Idade',
                                  occupation: 'Ocupação',
                                  personality: 'Personalidade',
                                  appearance: 'Aparência',
                                  history: 'História',
                                  geography: 'Geografia',
                                  climate: 'Clima',
                                  culture: 'Cultura',
                                  rules: 'Regras',
                                  origin: 'Origem',
                                  purpose: 'Propósito',
                                } as Record<string, string>
                              )[field] ?? field}
                              :
                            </strong>{' '}
                            {value}
                          </p>
                        ))}
                    {entity.relations.length > 0 && (
                      <>
                        <h4>Relações</h4>
                        <ul>
                          {entity.relations.map((relation, index) => (
                            <li key={`${relation.targetEntityId}-${index}`}>
                              <strong>{relation.relationType}:</strong>{' '}
                              {entities.find((item) => item.id === relation.targetEntityId)?.name ??
                                'Entidade não disponível'}
                              {relation.description ? ` — ${relation.description}` : ''}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                    <p>{entity.isPublic ? 'Público no leitor' : 'Privado (somente autor)'}</p>
                  </section>
                )}
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
        open={isFormOpen || isCreationRequested}
        global={
          !isCreationRequested &&
          (editingEntity ? Boolean(editingEntity.universeId) : selectedScope === 'global')
        }
        initialName={createEntityName ?? undefined}
        entityToEdit={editingEntity}
        allEntities={entities}
        onClose={() => {
          setIsFormOpen(false);
          onCreateRequestHandled?.();
        }}
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
