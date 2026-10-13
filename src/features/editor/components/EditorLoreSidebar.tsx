import { useState, useMemo, useRef, useEffect } from 'react';
import { BookOpen, MapPin, Plus, Search, Sparkles, Tag, User, X } from 'lucide-react';
import { Badge, Button, Input, Dropdown, Tooltip, SidePanelHeader, EmptyState } from '@/shared/ui';
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
      <SidePanelHeader title="Compêndio">
        <Button variant="ghost" size="icon" onClick={handleOpenCreate} aria-label="Nova Entidade">
          <Plus className="icon icon-sm" aria-hidden="true" />
        </Button>
        {onAnalyzeText && (
          <Tooltip content="Atualizar compêndio com base no texto">
            <Button
              variant="ghost"
              size="icon"

              onClick={onAnalyzeText}
              aria-label="Atualizar compêndio com base no texto"
            >
              <Sparkles className="icon icon-sm" aria-hidden="true" />
            </Button>
          </Tooltip>
        )}
        <Button
          variant="ghost"
          size="icon"

          onClick={onClose}
          aria-label="Fechar painel de lore"
        >
          <X className="icon icon-sm" aria-hidden="true" />
        </Button>
      </SidePanelHeader>

      <div className={styles.controls}>
        <Input
          aria-label="Buscar no compêndio"
          leftIcon={<Search className="icon icon-sm" aria-hidden="true" />}
          placeholder="Buscar personagem, local, item..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />

        <div className={styles.actionsRow}>
          <div className={styles.categoryFilters} role="group" aria-label="Categorias do compêndio">
            <Button
              variant="ghost"
              size="sm"
              type="button"
              className={`${styles.filterChip} ${selectedCategory === 'all' ? styles.filterChipActive : ''}`}
              onClick={() => setSelectedCategory('all')}
              aria-pressed={selectedCategory === 'all'}
            >
              Todos
            </Button>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              className={`${styles.filterChip} ${selectedCategory === 'character' ? styles.filterChipActive : ''}`}
              onClick={() => setSelectedCategory('character')}
              aria-pressed={selectedCategory === 'character'}
            >
              Personagens
            </Button>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              className={`${styles.filterChip} ${selectedCategory === 'location' ? styles.filterChipActive : ''}`}
              onClick={() => setSelectedCategory('location')}
              aria-pressed={selectedCategory === 'location'}
            >
              Locais
            </Button>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              className={`${styles.filterChip} ${selectedCategory === 'concept' ? styles.filterChipActive : ''}`}
              onClick={() => setSelectedCategory('concept')}
              aria-pressed={selectedCategory === 'concept'}
            >
              Conceitos
            </Button>
          </div>
        </div>
        {universeId && (
          <Dropdown
            mode="select"
            aria-label="Escopo do lore"
            size="sm"
            value={selectedScope}
            onValueChange={(nextValue) =>
              setScopeChoice({ target: selectedEntityId, value: nextValue as 'local' | 'global' })
            }
            options={[
              { value: 'local', label: 'Lore local — somente este livro' },
              { value: 'global', label: 'Lore global — universo compartilhado' },
            ]}
          />
        )}
      </div>

      <div className={styles.entityList}>
        {filteredEntities.length === 0 ? (
          <EmptyState
            title="Nenhuma entidade encontrada."
            description="Ajuste a busca ou crie uma entidade para o compêndio."
            icon={<Search className="icon" aria-hidden="true" />}
          />
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
