import { Edit2, Eye, EyeOff, Trash2 } from 'lucide-react';
import { Badge, Button, Inspector } from '@/shared/ui';
import { LORE_CATEGORIES, type LoreMentionEntity } from '../model/loreEntity';
import styles from './LorePage.module.css';

export interface LoreEntityInspectorProps<T extends LoreMentionEntity & { isPublic: boolean }> {
  entity: T;
  disabled: boolean;
  onOpen: (entity: T) => void;
  onEdit: (entity: T) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

/** Summary of one entity next to the compendium list. */
export function LoreEntityInspector<T extends LoreMentionEntity & { isPublic: boolean }>({
  entity,
  disabled,
  onOpen,
  onEdit,
  onDelete,
  onClose,
}: LoreEntityInspectorProps<T>) {
  const category = LORE_CATEGORIES.find((item) => item.value === entity.category)?.label;
  return (
    <Inspector
      title={entity.name}
      onClose={onClose}
      eyebrow={
        <>
          {category && <Badge variant="secondary">{category}</Badge>}
          <span className={styles.visibility}>
            {entity.isPublic ? (
              <Eye className="icon icon-sm" aria-hidden="true" />
            ) : (
              <EyeOff className="icon icon-sm" aria-hidden="true" />
            )}
            {entity.isPublic ? 'Pública' : 'Privada'}
          </span>
        </>
      }
      actions={
        <>
          <Button size="sm" disabled={disabled} onClick={() => onOpen(entity)}>
            Abrir ficha completa
          </Button>
          <Button size="sm" variant="outline" disabled={disabled} onClick={() => onEdit(entity)}>
            <Edit2 className="icon icon-sm" aria-hidden="true" />
            Editar
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className={styles.inspectorDelete}
            disabled={disabled}
            aria-label={`Excluir ${entity.name}`}
            onClick={() => onDelete(entity.id)}
          >
            <Trash2 className="icon icon-sm" aria-hidden="true" />
          </Button>
        </>
      }
    >
      {entity.aliases.length > 0 && (
        <p className={styles.inspectorAliases}>Também chamado de {entity.aliases.join(', ')}</p>
      )}
      <p className={styles.inspectorSummary}>{entity.summary || 'Sem resumo.'}</p>
    </Inspector>
  );
}
