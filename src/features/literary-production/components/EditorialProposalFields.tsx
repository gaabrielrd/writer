import { Alert, Button, Textarea } from '@/shared/ui';
import { EditorialPublicationPolicyFields } from './EditorialPublicationPolicyFields';
import { editorialFields, statusLabels, type EditorialContract } from '../model/editorial';
import styles from './EditorialContractPanel.module.css';

export function EditorialProposalFields({
  value,
  disabled,
  onChange,
}: {
  value?: EditorialContract;
  disabled: boolean;
  onChange: (contract: EditorialContract) => void;
}) {
  return (
    <section className={styles.panel} aria-label="Direção editorial da proposta">
      <h3>Direção editorial</h3>
      <Alert>
        Confira estas orientações antes de criar. Decisões propostas pela IA não são aprovadas
        automaticamente; você poderá aprová-las individualmente no livro.
      </Alert>
      {!value ? (
        <Button
          variant="outline"
          disabled={disabled}
          onClick={() =>
            onChange({
              schemaVersion: 1,
              fields: Object.fromEntries(
                Object.keys(editorialFields).map((key) => [key, '']),
              ) as EditorialContract['fields'],
              decisions: [],
            })
          }
        >
          Adicionar direção editorial
        </Button>
      ) : (
        <>
          <EditorialPublicationPolicyFields value={value} disabled={disabled} onChange={onChange} />
          <div className={styles.fields}>
            {Object.entries(editorialFields).map(([key, label]) => (
              <Textarea
                key={key}
                label={label}
                disabled={disabled}
                maxLength={key === 'examples' ? 12000 : 6000}
                value={value.fields[key as keyof typeof editorialFields] ?? ''}
                onChange={(event) =>
                  onChange({ ...value, fields: { ...value.fields, [key]: event.target.value } })
                }
              />
            ))}
          </div>
          <ul>
            {value.decisions.map((row) => (
              <li key={row.id}>
                <p>
                  {row.text} · {statusLabels[row.status]}
                </p>
                <Button
                  variant="ghost"
                  disabled={disabled}
                  onClick={() =>
                    onChange({
                      ...value,
                      decisions: value.decisions.filter(
                        (item) => item.id !== row.id && item.supersedes !== row.id,
                      ),
                    })
                  }
                >
                  Excluir proposta de decisão
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
