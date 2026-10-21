import { Alert, Button, Dropdown, Input, Textarea } from '@/shared/ui';
import type { PreparationItem } from '../model/campaignPreparation';
import { clueStatusLabels, questStatusLabels } from '../model/campaignPreparation';
import { fieldsError } from '../services/campaignPreparationService';
import styles from './Preparation.module.css';
export interface PreparationForm {
  item: PreparationItem;
  baseCollectionRevision: number;
  saved: string;
  stale: boolean;
}
export function PreparationEditor({
  form,
  locked,
  onChange,
  onSave,
  onDiscard,
}: {
  form: PreparationForm;
  locked: boolean;
  onChange: (item: PreparationItem) => void;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const { item } = form,
    error = fieldsError(item),
    disabled = locked || form.stale;
  return (
    <section className={styles.editor} aria-label="Editor de pista ou missão">
      <h3>{item.kind === 'clue' ? 'Editar pista' : 'Editar missão'}</h3>
      {form.stale && (
        <Alert variant="warning">
          O recibo é histórico ou o item mudou. Seu rascunho foi preservado. Atualize a lista e
          consulte a versão atual antes de editar novamente.
        </Alert>
      )}
      <Input
        label="Título do item"
        value={item.title}
        maxLength={300}
        required
        disabled={disabled}
        onChange={(e) => onChange({ ...item, title: e.target.value })}
      />
      {item.revision > 0 ? (
        <Dropdown
          mode="select"
          label="Estado do item"
          value={item.status}
          disabled={disabled}
          options={Object.entries(item.kind === 'clue' ? clueStatusLabels : questStatusLabels).map(
            ([value, label]) => ({ value, label }),
          )}
          onValueChange={(status) => onChange({ ...item, status } as PreparationItem)}
        />
      ) : (
        <p>Estado inicial: {item.kind === 'clue' ? 'Pendente' : 'Disponível'}.</p>
      )}
      {item.kind === 'clue' ? (
        <>
          <Textarea
            label="Texto da pista"
            value={item.body.text}
            rows={6}
            disabled={disabled}
            onChange={(e) => onChange({ ...item, body: { ...item.body, text: e.target.value } })}
          />
          <Textarea
            label="Condição de descoberta"
            value={item.body.condition}
            rows={3}
            disabled={disabled}
            onChange={(e) =>
              onChange({ ...item, body: { ...item.body, condition: e.target.value } })
            }
          />
          <Textarea
            label="Destinatário da pista"
            value={item.body.recipient}
            rows={2}
            hint="Anotação privada; nenhum material será enviado."
            disabled={disabled}
            onChange={(e) =>
              onChange({ ...item, body: { ...item.body, recipient: e.target.value } })
            }
          />
        </>
      ) : (
        <>
          <Textarea
            label="Descrição da missão"
            value={item.body.description}
            rows={6}
            disabled={disabled}
            onChange={(e) =>
              onChange({ ...item, body: { ...item.body, description: e.target.value } })
            }
          />
          <Textarea
            label="Possíveis consequências"
            value={item.body.consequences}
            rows={4}
            hint="Texto de preparação. Nenhuma consequência será executada automaticamente."
            disabled={disabled}
            onChange={(e) =>
              onChange({ ...item, body: { ...item.body, consequences: e.target.value } })
            }
          />
        </>
      )}
      <p>Salvamento manual. Até 150.000 caracteres por campo e 512 KiB de texto no total.</p>
      {error && item.title && <Alert variant="warning">{error}</Alert>}
      <div className={styles.actions}>
        <Button disabled={disabled || !!error} onClick={onSave}>
          Salvar item
        </Button>
        <Button variant="outline" disabled={locked} onClick={onDiscard}>
          Descartar rascunho
        </Button>
      </div>
    </section>
  );
}
