import { useState, type ReactNode } from 'react';
import {
  Alert,
  Button,
  Dialog,
  Dropdown,
  ErrorState,
  LoadingState,
  Slider,
  FormSection,
} from '@/shared/ui';
import { usePersonaLibrary } from '../hooks/usePersonaLibrary';
import {
  resolveWritingPersona,
  resolvePersonaProfile,
  PERSONA_SOURCE_LABELS,
  type PersonaComplement,
  type ResolvedPersonaProfile,
} from '../model/persona';
import { PersonaComposition } from './PersonaComposition';
import { PersonaTraits, PersonaTraitMeter } from './PersonaTraits';
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
  let profile: ResolvedPersonaProfile | null = null;
  let invalid: string | null = null;
  try {
    profile = resolvePersonaProfile(
      personas,
      mode === 'book' ? (selected === 'none' ? null : selected) : bookPersonaId,
      resolvedComplement,
    );
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
      maxWidthClass={
        navigation ? 'max-w-3xl min-[901px]:max-w-[960px]' : 'max-w-lg min-[901px]:max-w-[960px]'
      }
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
            {profile && (
              <>
                <PersonaComposition profile={profile} showChapter={mode === 'chapter'} />
                <p className={styles.bindingHelp}>
                  {mode === 'book'
                    ? 'A base orienta a escrita de todos os capítulos. Complementos podem ajustar o estilo de cada capítulo.'
                    : profile.chapter
                      ? 'O complemento prevalece em conflitos de estilo. Os valores abaixo mostram o que a IA usará; você pode definir ajustes para este capítulo.'
                      : profile.base
                        ? 'Este capítulo herda a voz e os atributos do livro. Escolha um complemento para ajustar seu estilo.'
                        : 'Escolha uma base na aba Livro ou uma persona complementar para este capítulo.'}
                </p>
                {profile.traits.length > 0 && (
                  <section className={styles.stack} aria-label="Perfil de escrita efetivo">
                    <div className={styles.profileHeading}>
                      <h3>Atributos efetivos</h3>
                      <span>
                        {profile.traits.length} atributos
                        {mode === 'chapter' &&
                          ` · ${overrides.length} ${overrides.length === 1 ? 'ajuste' : 'ajustes'} do capítulo`}
                      </span>
                    </div>
                    <PersonaTraits
                      traits={profile.traits}
                      sources={Object.fromEntries(
                        Object.entries(profile.sources).map(([id, source]) => [
                          id,
                          PERSONA_SOURCE_LABELS[source],
                        ]),
                      )}
                      controls={
                        mode === 'chapter' && persona
                          ? (trait) => {
                              const definition = persona.traits.find(
                                (item) => item.id === trait.id,
                              );
                              if (!definition) return null;
                              const override = overrides.find((item) => item.traitId === trait.id);
                              return (
                                <>
                                  {!override && <PersonaTraitMeter trait={trait} />}
                                  <Dropdown
                                    mode="select"
                                    label={`Aplicação de ${trait.name}`}
                                    value={override ? 'override' : 'inherit'}
                                    disabled={busy}
                                    options={[
                                      {
                                        value: 'inherit',
                                        label: profile.base?.traits.some(
                                          (item) => item.id === trait.id,
                                        )
                                          ? 'Herdar do livro'
                                          : 'Usar valor da persona',
                                      },
                                      { value: 'override', label: 'Definir no capítulo' },
                                    ]}
                                    onValueChange={(value) =>
                                      setOverrides((previous) =>
                                        value === 'inherit'
                                          ? previous.filter((item) => item.traitId !== trait.id)
                                          : [
                                              ...previous.filter(
                                                (item) => item.traitId !== trait.id,
                                              ),
                                              { traitId: trait.id, value: definition.value },
                                            ],
                                      )
                                    }
                                  />
                                  {override && (
                                    <Slider
                                      label={trait.name}
                                      low={trait.low}
                                      high={trait.high}
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
                                </>
                              );
                            }
                          : undefined
                      }
                    />
                  </section>
                )}
              </>
            )}
            {invalid && <Alert variant="danger">{invalid}</Alert>}
            <FormSection
              title="Orientações efetivas"
              description="Texto completo enviado à IA · consulta opcional"
              disabled={busy}
            >
              <p className={styles.promptText}>
                {summary || 'Sem persona: a IA mantém as orientações atuais da operação.'}
              </p>
            </FormSection>
          </>
        )}
        {failure && <Alert variant="danger">{failure}</Alert>}
      </div>
    </Dialog>
  );
}
