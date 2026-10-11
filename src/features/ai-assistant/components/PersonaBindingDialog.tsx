import { useState, type ReactNode } from 'react';
import {
  Alert,
  Button,
  Card,
  Dialog,
  Dropdown,
  ErrorState,
  LoadingState,
  Slider,
} from '@/shared/ui';
import { usePersonaLibrary } from '../hooks/usePersonaLibrary';
import { resolveWritingPersona, type PersonaComplement } from '../model/persona';
import { PersonaAvatar } from './PersonaAvatar';
import styles from './Personas.module.css';

export function PersonaBindingDialog({
  ownerId,
  bookPersonaId,
  complement,
  mode,
  onSave,
  onClose,
  navigation,
  title,
}: {
  ownerId: string;
  bookPersonaId?: string | null;
  complement?: PersonaComplement | null;
  mode: 'book' | 'chapter';
  onSave: (personaId: string | null, complement: PersonaComplement | null) => Promise<void>;
  onClose: () => void;
  navigation?: ReactNode;
  title?: string;
}) {
  const { personas, loading, error, retry } = usePersonaLibrary(ownerId);
  const [selected, setSelected] = useState(
    (mode === 'book' ? bookPersonaId : complement?.personaId) ?? 'none',
  );
  const [overrides, setOverrides] = useState(complement?.overrides ?? []);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const persona = personas.find((item) => item.id === selected);
  const resolvedComplement =
    mode === 'chapter' && selected !== 'none' ? { personaId: selected, overrides } : null;
  let summary = '';
  let invalid: string | null = null;
  try {
    summary = resolveWritingPersona(
      personas,
      mode === 'book' ? (selected === 'none' ? null : selected) : bookPersonaId,
      resolvedComplement,
    ).instruction;
  } catch (cause) {
    invalid = cause instanceof Error ? cause.message : 'Persona indisponível.';
  }
  return (
    <Dialog
      open
      title={title ?? (mode === 'book' ? 'Persona do livro' : 'Persona complementar do capítulo')}
      maxWidthClass={navigation ? 'max-w-3xl' : 'max-w-lg'}
      onClose={() => {
        if (!busy) onClose();
      }}
      footer={
        <>
          <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={busy || loading || Boolean(error) || Boolean(invalid)}
            onClick={() => {
              setBusy(true);
              setFailure(null);
              void onSave(
                mode === 'book' && selected !== 'none' ? selected : null,
                resolvedComplement,
              )
                .then(onClose)
                .catch((cause: unknown) => {
                  setFailure(
                    cause instanceof Error ? cause.message : 'Não foi possível salvar o vínculo.',
                  );
                })
                .finally(() => setBusy(false));
            }}
          >
            {busy ? 'Salvando...' : 'Salvar vínculo'}
          </Button>
        </>
      }
    >
      <div className={styles.stack}>
        {navigation && (
          <fieldset className={styles.modalNavigation} disabled={busy}>
            {navigation}
          </fieldset>
        )}
        {loading ? (
          <LoadingState label="Carregando personas..." />
        ) : error ? (
          <ErrorState
            description={error}
            action={
              <Button type="button" onClick={retry}>
                Tentar novamente
              </Button>
            }
          />
        ) : (
          <>
            <Dropdown
              mode="select"
              label={mode === 'book' ? 'Persona base' : 'Persona complementar'}
              value={selected}
              disabled={busy}
              onValueChange={(value) => {
                setSelected(value);
                setOverrides([]);
              }}
              options={[
                {
                  value: 'none',
                  label: mode === 'book' ? 'Sem persona' : 'Somente a persona do livro',
                },
                ...personas
                  .filter((item) => !item.archived || item.id === selected)
                  .map((item) => ({
                    value: item.id,
                    label: `${item.name}${item.archived ? ' (arquivada)' : ''}`,
                  })),
              ]}
            />
            {persona && (
              <div className={styles.identity}>
                <PersonaAvatar persona={persona} />
                <p>{persona.description}</p>
              </div>
            )}
            {mode === 'chapter' && persona && (
              <>
                <p>
                  As instruções complementam as do livro. Os atributos herdam o livro; escolha
                  “Definir no capítulo” para aplicar um valor específico. Sem persona no livro, os
                  valores da complementar são usados.
                </p>
                {persona.traits.map((trait) => {
                  const override = overrides.find((item) => item.traitId === trait.id);
                  return (
                    <Card key={trait.id} className={styles.trait}>
                      <Dropdown
                        mode="select"
                        label={`Aplicação de ${trait.name}`}
                        value={override ? 'override' : 'inherit'}
                        disabled={busy}
                        options={[
                          { value: 'inherit', label: 'Herdar do livro' },
                          { value: 'override', label: 'Definir no capítulo' },
                        ]}
                        onValueChange={(value) =>
                          setOverrides((previous) =>
                            value === 'inherit'
                              ? previous.filter((item) => item.traitId !== trait.id)
                              : [
                                  ...previous.filter((item) => item.traitId !== trait.id),
                                  { traitId: trait.id, value: trait.value },
                                ],
                          )
                        }
                      />
                      {override && (
                        <Slider
                          label={trait.name}
                          low={trait.low}
                          high={trait.high}
                          description={trait.description}
                          value={override.value}
                          disabled={busy}
                          onValueChange={(value) =>
                            setOverrides((previous) =>
                              previous.map((item) =>
                                item.traitId === trait.id ? { ...item, value } : item,
                              ),
                            )
                          }
                        />
                      )}
                    </Card>
                  );
                })}
              </>
            )}
            {invalid && <Alert variant="danger">{invalid}</Alert>}
            <details className={styles.summary}>
              <summary>Orientações efetivas</summary>
              <p>{summary || 'Sem persona: a IA mantém as orientações atuais da operação.'}</p>
            </details>
          </>
        )}
        {failure && <Alert variant="danger">{failure}</Alert>}
      </div>
    </Dialog>
  );
}
