import { useState } from 'react';
import { Button, Dropdown, Textarea } from '@/shared/ui';
import type { PageAction, PageCapability } from '../model/pageAssistant';
import styles from './PageAssistant.module.css';
export function PageActionProposal({
  action,
  capability,
  onExecute,
  onDiscard,
}: {
  action: PageAction;
  capability: PageCapability;
  onExecute: (value?: string) => void;
  onDiscard: () => void;
}) {
  const [value, setValue] = useState(action.value ?? '');
  return (
    <div className={styles.form}>
      <p>
        Próxima ação: <strong>{capability.label}</strong>
      </p>
      {action.value !== undefined &&
        (capability.kind === 'select' ? (
          <Dropdown
            mode="select"
            label="Opção proposta"
            value={value}
            onValueChange={setValue}
            options={(capability.options ?? []).map((label) => ({ value: label, label }))}
          />
        ) : (
          <Textarea
            label="Texto proposto"
            value={value}
            maxLength={16000}
            onChange={(e) => setValue(e.target.value)}
          />
        ))}
      <p className={styles.meta}>
        Confira antes de executar. Confirmações e custos da página continuam valendo.
      </p>
      <Button onClick={() => onExecute(action.value === undefined ? undefined : value)}>
        Executar: {capability.label}
      </Button>
      <Button variant="secondary" onClick={onDiscard}>
        Descartar sugestão
      </Button>
    </div>
  );
}
