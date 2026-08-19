import { Edit2, Eye, EyeOff, Tag } from 'lucide-react';
import { Badge, Button, Dialog } from '@vitru/styleguide';
import type { LoreCategory, LoreEntity } from '../model/loreEntity';
import styles from './LoreDrawer.module.css';

export interface LoreDrawerProps {
  entity: LoreEntity | null;
  allEntities: LoreEntity[];
  open: boolean;
  onClose: () => void;
  onEdit: (entity: LoreEntity) => void;
}

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

export function LoreDrawer({ entity, allEntities, open, onClose, onEdit }: LoreDrawerProps) {
  if (!open || !entity) return null;

  const entityMap = new Map(allEntities.map((e) => [e.id, e]));

  return (
    <Dialog
      open={open}
      title={entity.name}
      onClose={onClose}
      footer={
        <div className={styles.footer}>
          <Button variant="secondary" onClick={onClose}>
            Fechar
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              onClose();
              onEdit(entity);
            }}
          >
            <Edit2 className="icon icon-sm" aria-hidden="true" />
            Editar Ficha
          </Button>
        </div>
      }
    >
      <div className={styles.container}>
        <div className={styles.metaRow}>
          <div className={styles.categoryRow}>
            <Badge variant={CATEGORY_BADGES[entity.category]}>
              {CATEGORY_LABELS[entity.category]}
            </Badge>
            {entity.isPublic ? (
              <span className={styles.publicBadge}>
                <Eye className="icon icon-sm" aria-hidden="true" />
                <span>Público no leitor</span>
              </span>
            ) : (
              <span className={styles.privateBadge}>
                <EyeOff className="icon icon-sm" aria-hidden="true" />
                <span>Privado (somente autor)</span>
              </span>
            )}
          </div>
        </div>

        {entity.aliases.length > 0 && (
          <div className={styles.section}>
            <strong className={styles.sectionTitle}>Apelidos / Aliases:</strong>
            <div className={styles.aliasesList}>
              {entity.aliases.map((alias, idx) => (
                <Badge key={idx} variant="neutral">
                  <Tag className="icon icon-sm" aria-hidden="true" />
                  {alias}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div className={styles.section}>
          <strong className={styles.sectionTitle}>Resumo:</strong>
          <p className={styles.summaryText}>{entity.summary}</p>
        </div>

        {entity.details && (
          <div className={styles.section}>
            <strong className={styles.sectionTitle}>Ficha Detalhada:</strong>
            <div className={styles.detailsBox}>
              {entity.details.split('\n').map((line, idx) => (
                <p key={idx} className={styles.detailLine}>
                  {line || '\u00A0'}
                </p>
              ))}
            </div>
          </div>
        )}

        {entity.relations.length > 0 && (
          <div className={styles.section}>
            <strong className={styles.sectionTitle}>Relações Cadastradas:</strong>
            <div className={styles.relationsList}>
              {entity.relations.map((rel, idx) => {
                const target = entityMap.get(rel.targetEntityId);
                return (
                  <div key={idx} className={styles.relationItem}>
                    <span className={styles.relTypeBadge}>{rel.relationType}</span>
                    <strong className={styles.targetName}>
                      {target ? target.name : 'Entidade desconhecida'}
                    </strong>
                    {target && <Badge variant="neutral">{CATEGORY_LABELS[target.category]}</Badge>}
                    {rel.description && <span className={styles.relDesc}>— {rel.description}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
