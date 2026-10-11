import { Edit2, Eye, EyeOff, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui';
import { LORE_CATEGORIES, type LoreEntity } from '../model/loreEntity';
import styles from './LorePage.module.css';

interface LoreEntityListProps {
  entities: LoreEntity[];
  selectedIds: Set<string>;
  disabled: boolean;
  selectAllRef: (element: HTMLInputElement | null) => void;
  onSelect: (id: string) => void;
  onSelectAll: () => void;
  onView: (entity: LoreEntity) => void;
  onEdit: (entity: LoreEntity) => void;
  onDelete: (id: string) => void;
}

export function LoreEntityList({
  entities,
  selectedIds,
  disabled,
  selectAllRef,
  onSelect,
  onSelectAll,
  onView,
  onEdit,
  onDelete,
}: LoreEntityListProps) {
  const selectedCount = entities.filter((entity) => selectedIds.has(entity.id)).length;
  return (
    <Table aria-label="Entidades do compêndio" className={styles.entityTable}>
      <TableHeader>
        <TableRow>
          <TableHead className={styles.selectionCell}>
            <Input
              ref={(element) => {
                if (element)
                  element.indeterminate = selectedCount > 0 && selectedCount < entities.length;
                selectAllRef(element);
              }}
              type="checkbox"
              className={styles.checkbox}
              aria-label="Selecionar todas as entidades exibidas"
              checked={selectedCount === entities.length}
              disabled={disabled}
              onChange={onSelectAll}
            />
          </TableHead>
          <TableHead>Entidade</TableHead>
          <TableHead className={styles.categoryCell}>Categoria</TableHead>
          <TableHead className={styles.visibilityCell}>Visibilidade</TableHead>
          <TableHead className={styles.rowActions}>Ações</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entities.map((entity) => (
          <TableRow
            key={entity.id}
            data-state={selectedIds.has(entity.id) ? 'selected' : undefined}
          >
            <TableCell className={styles.selectionCell}>
              <Input
                type="checkbox"
                className={styles.checkbox}
                aria-label={`Selecionar ${entity.name}`}
                checked={selectedIds.has(entity.id)}
                disabled={disabled}
                onChange={() => onSelect(entity.id)}
              />
            </TableCell>
            <TableCell className={styles.entityInfo}>
              <Button
                variant="link"
                className={styles.entityName}
                onClick={() => onView(entity)}
                disabled={disabled}
                title={entity.name}
                aria-label={`Ver ficha de ${entity.name}`}
              >
                {entity.name}
              </Button>
              <p className={styles.entitySummary} title={entity.summary}>
                {entity.summary}
              </p>
            </TableCell>
            <TableCell className={styles.categoryCell}>
              <Badge variant="neutral">
                {LORE_CATEGORIES.find((category) => category.value === entity.category)?.label}
              </Badge>
            </TableCell>
            <TableCell className={styles.visibilityCell}>
              <span className={styles.visibility}>
                {entity.isPublic ? (
                  <Eye className="icon icon-sm" aria-hidden="true" />
                ) : (
                  <EyeOff className="icon icon-sm" aria-hidden="true" />
                )}
                {entity.isPublic ? 'Público' : 'Privado'}
              </span>
            </TableCell>
            <TableCell className={styles.rowActions}>
              <div className={styles.rowActionButtons}>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Editar ${entity.name}`}
                  disabled={disabled}
                  onClick={() => onEdit(entity)}
                >
                  <Edit2 className="icon icon-sm" aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Excluir ${entity.name}`}
                  disabled={disabled}
                  onClick={() => onDelete(entity.id)}
                >
                  <Trash2 className="icon icon-sm" aria-hidden="true" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
