import { BookOpen, Edit2, Eye, EyeOff, MapPin, Tag, Trash2, User } from 'lucide-react';
import { Badge, Button, Card } from '@/shared/ui';
import type { LoreCategory, LoreEntity, LoreMentionEntity } from '../model/loreEntity';
import styles from './LoreEntityCard.module.css';

export interface LoreEntityCardProps<
  T extends LoreMentionEntity & {
    isPublic: boolean;
    relationCount?: number;
    relations?: unknown[];
  } = LoreEntity,
> {
  entity: T;
  disabled?: boolean;
  onView: (entity: T) => void;
  onEdit: (entity: T) => void;
  onDelete: (entityId: string) => void;
}

const CATEGORY_ICONS: Record<LoreCategory, typeof User> = {
  character: User,
  location: MapPin,
  concept: BookOpen,
  other: Tag,
};

const CATEGORY_LABELS: Record<LoreCategory, string> = {
  character: 'Personagem',
  location: 'Local',
  concept: 'Conceito / Item',
  other: 'Outro',
};

const CATEGORY_BADGES: Record<
  LoreCategory,
  'neutral' | 'accent' | 'success' | 'danger' | 'highlight'
> = {
  character: 'accent',
  location: 'success',
  concept: 'highlight',
  other: 'neutral',
};

export function LoreEntityCard<
  T extends LoreMentionEntity & {
    isPublic: boolean;
    relationCount?: number;
    relations?: unknown[];
  },
>({ entity, disabled = false, onView, onEdit, onDelete }: LoreEntityCardProps<T>) {
  const relationCount = entity.relationCount ?? entity.relations?.length;
  const IconComponent = CATEGORY_ICONS[entity.category] || Tag;

  return (
    <Card tone="raised">
      <div className={styles.cardContainer}>
        <div className={styles.header}>
          <div className={styles.categoryRow}>
            <div className={styles.categoryInfo}>
              <IconComponent className="icon icon-sm" aria-hidden="true" />
              <Badge variant={CATEGORY_BADGES[entity.category]}>
                {CATEGORY_LABELS[entity.category]}
              </Badge>
            </div>
            {entity.isPublic ? (
              <span className={styles.publicBadge} title="Visível no leitor público">
                <Eye className="icon icon-sm" aria-hidden="true" />
                <span className={styles.badgeText}>Público</span>
              </span>
            ) : (
              <span className={styles.privateBadge} title="Privado (apenas para o autor)">
                <EyeOff className="icon icon-sm" aria-hidden="true" />
                <span className={styles.badgeText}>Privado</span>
              </span>
            )}
          </div>

          <h3 className={styles.name}>{entity.name}</h3>

          {entity.aliases.length > 0 && (
            <div className={styles.aliases}>
              <span className={styles.aliasesLabel}>Aliases:</span> {entity.aliases.join(', ')}
            </div>
          )}
        </div>

        <p className={styles.summary}>{entity.summary}</p>

        {relationCount !== undefined && relationCount > 0 && (
          <div className={styles.relationsInfo}>
            <span>
              <strong>{relationCount}</strong>{' '}
              {relationCount === 1 ? 'relação vinculada' : 'relações vinculadas'}
            </span>
          </div>
        )}

        <div className={styles.actions}>
          <Button
            variant="primary"
            disabled={disabled}
            onClick={() => onView(entity)}
            title="Ver ficha completa da entidade"
          >
            Ver Ficha
          </Button>

          <div className={styles.actionButtons}>
            <Button
              variant="secondary"
              disabled={disabled}
              onClick={() => onEdit(entity)}
              title={`Editar ${entity.name}`}
              aria-label={`Editar ${entity.name}`}
            >
              <Edit2 className="icon icon-sm" aria-hidden="true" />
            </Button>
            <Button
              variant="danger"
              disabled={disabled}
              onClick={() => onDelete(entity.id)}
              title={`Excluir ${entity.name}`}
              aria-label={`Excluir ${entity.name}`}
            >
              <Trash2 className="icon icon-sm" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
