import { Badge } from '@/shared/ui';
import type { CampaignLoreDisplayData } from '../model/campaignLoreDisplay';
import styles from './CampaignLore.module.css';
export interface CampaignLoreDisplayProps {
  item: CampaignLoreDisplayData;
}
const labels = {
  appearance: 'Aparência',
  personality: 'Personalidade',
  history: 'História',
  notes: 'Notas',
};
export function CampaignLoreDisplay({ item }: CampaignLoreDisplayProps) {
  return (
    <section className={styles.form} aria-label="Ficha inteira atual da mesa">
      {item.legacy && <Badge variant="outline">Legado da mesa</Badge>}
      <p>
        {{ base: 'Base', override: 'Variante da mesa', removed: 'Retirada' }[item.mode]} · Revisão{' '}
        {item.revision}
      </p>
      {item.entity ? (
        <>
          <h4>{item.entity.name}</h4>
          <p>Outros nomes: {item.entity.aliases.join(', ') || 'Nenhum'}</p>
          <p>{item.entity.summary}</p>
          <p className={styles.text}>{item.entity.details}</p>
          {Object.entries(item.entity.structuredDetails).map(([key, text]) => (
            <p className={styles.text} key={key}>
              {labels[key as keyof typeof labels]}: {text}
            </p>
          ))}
          {item.entity.relations.map((relation, index) => (
            <p key={relation.targetKey + ':' + index}>
              {relation.targetName} · {relation.relationType}: {relation.description}
            </p>
          ))}
        </>
      ) : (
        <p>
          Ficha retirada. O texto não é entregue neste modo; restaurar preserva o modo anterior.
        </p>
      )}
    </section>
  );
}
