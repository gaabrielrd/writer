import { useRef, useState, type ReactNode } from 'react';
import { Plus, Copy, Pencil, Archive, ChevronRight } from 'lucide-react';
import {
  Alert,
  Button,
  Badge,
  Card,
  Dialog,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Slider,
  Textarea,
  FormSection,
} from '@/shared/ui';
import {
  STANDARD_TRAITS,
  isDefaultPersona,
  validatePersona,
  resolvePersonaProfile,
  resolveWritingPersona,
  PERSONA_SOURCE_LABELS,
  type AIPersona,
  type PersonaTrait,
  type PersonaComplement,
  type ResolvedPersonaProfile,
} from '../model/persona';
import { usePersonaLibrary } from '../hooks/usePersonaLibrary';
import { savePersona } from '../services/personaService';
import { PersonaTraitIcon, PersonaTraits } from './PersonaTraits';
import { PersonaAvatar } from './PersonaAvatar';
import { PersonaComposition } from './PersonaComposition';
import styles from './Personas.module.css';

export function PersonaManager({
  ownerId,
  modal = false,
  onClose,
  navigation,
  bindingContext,
}: {
  ownerId?: string | null;
  modal?: boolean;
  onClose?: () => void;
  navigation?: ReactNode;
  bindingContext?: {
    bookPersonaId?: string | null;
    complement?: PersonaComplement | null;
    instruction: string;
  };
}) {
  const [selected, setSelected] = useState<AIPersona | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const { personas, loading, error, retry } = usePersonaLibrary(ownerId);
  const [draft, setDraft] = useState<AIPersona | null>(null);
  const [expectedRevision, setExpectedRevision] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [custom, setCustom] = useState({ name: '', description: '', low: '', high: '' });
  const [showCustom, setShowCustom] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const begin = (source?: AIPersona, duplicate = false) => {
    setFailure(null);
    setShowCustom(false);
    setCustom({ name: '', description: '', low: '', high: '' });
    setExpectedRevision(source && !duplicate ? source.revision : null);
    setDraft(
      source
        ? {
            ...structuredClone(source),
            id: duplicate ? `custom-${crypto.randomUUID()}` : source.id,
            name: duplicate ? `${source.name} (cópia)`.slice(0, 80) : source.name,
            archived: duplicate ? false : source.archived,
          }
        : {
            id: `custom-${crypto.randomUUID()}`,
            schemaVersion: 1,
            name: '',
            description: '',
            instructions: '',
            traits: STANDARD_TRAITS.map((trait) => ({ ...trait, value: 50 })),
            revision: 1,
            archived: false,
            createdAt: 0,
            updatedAt: 0,
          },
    );
  };
  const change = (input: Partial<AIPersona>) => {
    setDraft((previous) => (previous ? { ...previous, ...input } : null));
  };
  const save = async (value: AIPersona, revision: number | null) => {
    if (!ownerId || busy) return;
    setBusy(true);
    setFailure(null);
    try {
      await savePersona(ownerId, validatePersona(value), revision);
      setDraft(null);
      setSelected(null);
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : 'Não foi possível salvar a persona.');
    } finally {
      setBusy(false);
    }
  };
  const addTrait = () => {
    if (!draft) return;
    const trait: PersonaTrait = { ...custom, id: `custom-${crypto.randomUUID()}`, value: 50 };
    try {
      const next = validatePersona({ ...draft, traits: [...draft.traits, trait] });
      change({ traits: next.traits });
      setCustom({ name: '', description: '', low: '', high: '' });
      setShowCustom(false);
      setFailure(null);
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : 'Confira o atributo.');
    }
  };
  const items = personas.filter((persona) => showArchived || !persona.archived);
  let activeProfile: ResolvedPersonaProfile | null = null;
  let profileError: string | null = null;
  if (bindingContext && !loading && !error) {
    try {
      activeProfile = resolvePersonaProfile(
        personas,
        bindingContext.bookPersonaId,
        bindingContext.complement,
      );
    } catch (cause) {
      profileError =
        cause instanceof Error ? cause.message : 'Não foi possível carregar a voz deste capítulo.';
    }
  }
  const libraryContent = (
    <div className={styles.stack}>
      <div className={styles.actions}>
        <div>
          <h2>Personas de escrita</h2>
          <p>Escolha uma voz para explorar instruções e personalidade.</p>
        </div>
        <Button
          type="button"
          disabled={!ownerId || busy || loading || Boolean(error)}
          onClick={(event) => {
            trigger.current = event.currentTarget;
            begin();
          }}
        >
          <Plus className="icon icon-sm" aria-hidden="true" />
          Nova persona
        </Button>
      </div>
      {activeProfile && <PersonaComposition profile={activeProfile} compact />}
      {profileError && <Alert variant="danger">{profileError}</Alert>}
      {!ownerId && (
        <Alert variant="info">
          Entre na sua conta para criar e editar personas. Os modelos padrão estão disponíveis para
          consulta.
        </Alert>
      )}
      {loading && <LoadingState label="Carregando suas personas..." />}
      {error && (
        <ErrorState
          description={error}
          action={<Button onClick={retry}>Tentar novamente</Button>}
        />
      )}
      {!modal && ownerId && !loading && !error && personas.length === 6 && (
        <EmptyState
          className={styles.libraryEmpty}
          title="Você ainda não criou personas"
          description="Explore um modelo abaixo e personalize para criar sua própria voz."
        />
      )}
      <ul
        className={`${styles.personaList} ${modal ? styles.modalPersonaList : ''}`}
        aria-label="Personas disponíveis"
      >
        {items.map((persona) => (
          <li key={persona.id}>
            <Button
              type="button"
              variant="ghost"
              className={styles.personaRow}
              onClick={(event) => {
                trigger.current = event.currentTarget;
                setFailure(null);
                setSelected(persona);
              }}
              aria-label={`Ver detalhes de ${persona.name}`}
            >
              <PersonaAvatar persona={persona} />
              <span className={styles.rowCopy}>
                <strong>{persona.name}</strong>
                <span>{persona.description}</span>
                <span className={styles.rowMeta}>
                  {persona.archived
                    ? 'Arquivada'
                    : isDefaultPersona(persona.id)
                      ? 'Persona padrão'
                      : 'Sua persona'}{' '}
                  · {persona.traits.length} atributos
                </span>
                {activeProfile?.base?.id === persona.id && (
                  <Badge variant="secondary" className={styles.activeVoiceBadge}>
                    Base do livro
                  </Badge>
                )}
                {activeProfile?.chapter?.id === persona.id && (
                  <Badge variant="secondary" className={styles.activeVoiceBadge}>
                    Complemento do capítulo
                  </Badge>
                )}
              </span>
              <ChevronRight className="icon icon-sm" aria-hidden="true" />
              {modal && (
                <span className={styles.miniProfile}>
                  {[...persona.traits]
                    .sort((a, b) => Math.abs(b.value - 50) - Math.abs(a.value - 50))
                    .slice(0, 3)
                    .map((trait) => (
                      <span key={trait.id}>
                        <span title={trait.name}>{trait.name}</span>
                        <progress
                          max={100}
                          value={trait.value}
                          aria-label={`${persona.name}: ${trait.name}`}
                        />
                        <strong>{trait.value}</strong>
                      </span>
                    ))}
                </span>
              )}
            </Button>
          </li>
        ))}
      </ul>
      {modal && ownerId && !loading && !error && personas.length === 6 && (
        <p className={styles.bindingHelp}>
          Explore um modelo e personalize para criar sua própria voz.
        </p>
      )}
      {activeProfile && (
        <FormSection
          title="Orientações efetivas"
          description="Perfil em uso neste capítulo · consulta opcional"
          disabled={busy}
        >
          <PersonaTraits
            traits={activeProfile.traits}
            sources={Object.fromEntries(
              Object.entries(activeProfile.sources).map(([id, source]) => [
                id,
                PERSONA_SOURCE_LABELS[source],
              ]),
            )}
          />
          <FormSection
            title="Texto completo das orientações"
            description="Instruções enviadas à IA"
          >
            <p className={styles.promptText}>
              {bindingContext?.instruction ||
                resolveWritingPersona(
                  personas,
                  bindingContext?.bookPersonaId,
                  bindingContext?.complement,
                ).instruction ||
                'Orientações padrão da operação.'}
            </p>
          </FormSection>
        </FormSection>
      )}
      <Button
        type="button"
        variant="ghost"
        aria-pressed={showArchived}
        onClick={() => setShowArchived(!showArchived)}
      >
        {showArchived ? 'Ocultar arquivadas' : 'Mostrar arquivadas'}
      </Button>
    </div>
  );
  return (
    <>
      {!modal && libraryContent}
      <Dialog
        open={modal || Boolean(draft || selected)}
        title={draft ? 'Editar persona de IA' : (selected?.name ?? 'Persona')}
        maxWidthClass="max-w-3xl min-[901px]:max-w-[960px]"
        onClose={() => {
          if (!busy) {
            if (!draft && !selected) onClose?.();
            setDraft(null);
            setSelected(null);
            setFailure(null);
          }
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          trigger.current?.focus();
        }}
        footer={
          draft ? (
            <>
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  setDraft(null);
                  setFailure(null);
                }}
              >
                Cancelar edição
              </Button>
              <Button form="persona-edit-form" type="submit" disabled={busy || !ownerId}>
                {busy ? 'Salvando...' : 'Salvar persona'}
              </Button>
            </>
          ) : selected ? (
            <div className={styles.detailActions}>
              <Button
                type="button"
                variant="secondary"
                disabled={!ownerId || busy || Boolean(error)}
                onClick={() => begin(selected, true)}
              >
                <Copy className="icon icon-sm" aria-hidden="true" />
                {isDefaultPersona(selected.id) ? 'Personalizar' : 'Duplicar'} {selected.name}
              </Button>
              {!isDefaultPersona(selected.id) && (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy || Boolean(error)}
                    onClick={() => begin(selected)}
                  >
                    <Pencil className="icon icon-sm" aria-hidden="true" />
                    Editar {selected.name}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={busy || Boolean(error)}
                    onClick={() =>
                      void save({ ...selected, archived: !selected.archived }, selected.revision)
                    }
                  >
                    <Archive className="icon icon-sm" aria-hidden="true" />
                    {selected.archived ? 'Reativar' : 'Arquivar'} {selected.name}
                  </Button>
                </>
              )}
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => setSelected(null)}
              >
                Fechar detalhes
              </Button>
            </div>
          ) : modal ? (
            <Button type="button" onClick={onClose}>
              Fechar
            </Button>
          ) : null
        }
      >
        {navigation && (
          <fieldset className={styles.modalNavigation} disabled={busy}>
            {navigation}
          </fieldset>
        )}
        {failure && <Alert variant="danger">{failure}</Alert>}
        {draft ? (
          <form
            id="persona-edit-form"
            className={styles.stack}
            onSubmit={(event) => {
              event.preventDefault();
              void save(draft, expectedRevision);
            }}
          >
            {expectedRevision !== null && (
              <Alert variant="info">
                Alterações afetam as próximas chamadas de todos os livros e capítulos que usam esta
                persona. Duplique para criar uma variação independente.
              </Alert>
            )}
            <Input
              label="Nome da persona"
              value={draft.name}
              required
              maxLength={80}
              disabled={busy}
              onChange={(event) => change({ name: event.target.value })}
            />
            <Textarea
              label="Descrição da persona"
              value={draft.description}
              maxLength={500}
              disabled={busy}
              onChange={(event) => change({ description: event.target.value })}
            />
            <Textarea
              label="Instruções permanentes"
              value={draft.instructions}
              required
              maxLength={6000}
              disabled={busy}
              onChange={(event) => change({ instructions: event.target.value })}
            />
            <p>
              Estas instruções acompanharão as chamadas de escrita. O pedido da ação pode solicitar
              uma exceção de estilo; os fatos do lore e o formato da resposta continuam preservados.
            </p>
            <div className={styles.traitGrid}>
              {draft.traits.map((trait) => (
                <Card key={trait.id} className={styles.trait}>
                  <div className={styles.traitEyebrow}>
                    <PersonaTraitIcon id={trait.id} />
                    <span>Expressão narrativa</span>
                  </div>
                  <Slider
                    label={trait.name}
                    description={trait.description}
                    low={trait.low}
                    high={trait.high}
                    value={trait.value}
                    disabled={busy}
                    onValueChange={(value) =>
                      change({
                        traits: draft.traits.map((item) =>
                          item.id === trait.id ? { ...item, value } : item,
                        ),
                      })
                    }
                  />
                  {trait.id.startsWith('custom-') && (
                    <details>
                      <summary>Editar definição de {trait.name}</summary>
                      {(['name', 'description', 'low', 'high'] as const).map((field) => (
                        <Input
                          key={field}
                          label={`${{ name: 'Nome', description: 'Significado', low: 'Valor 0', high: 'Valor 100' }[field]} de ${trait.name}`}
                          value={trait[field]}
                          required
                          maxLength={field === 'name' ? 80 : field === 'description' ? 300 : 200}
                          disabled={busy}
                          onChange={(event) =>
                            change({
                              traits: draft.traits.map((item) =>
                                item.id === trait.id
                                  ? { ...item, [field]: event.target.value }
                                  : item,
                              ),
                            })
                          }
                        />
                      ))}
                    </details>
                  )}
                  {trait.id.startsWith('custom-') && (
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={busy}
                      onClick={() =>
                        change({ traits: draft.traits.filter((item) => item.id !== trait.id) })
                      }
                    >
                      Remover atributo {trait.name}
                    </Button>
                  )}
                </Card>
              ))}
            </div>
            {showCustom ? (
              <Card className={`${styles.stack} ${styles.card}`}>
                <Input
                  label="Nome do atributo"
                  value={custom.name}
                  maxLength={80}
                  disabled={busy}
                  onChange={(event) => setCustom({ ...custom, name: event.target.value })}
                />
                <Textarea
                  label="Significado do atributo"
                  value={custom.description}
                  maxLength={300}
                  disabled={busy}
                  onChange={(event) => setCustom({ ...custom, description: event.target.value })}
                />
                <Input
                  label="Significado de 0"
                  value={custom.low}
                  maxLength={200}
                  disabled={busy}
                  onChange={(event) => setCustom({ ...custom, low: event.target.value })}
                />
                <Input
                  label="Significado de 100"
                  value={custom.high}
                  maxLength={200}
                  disabled={busy}
                  onChange={(event) => setCustom({ ...custom, high: event.target.value })}
                />
                <Button
                  type="button"
                  disabled={
                    busy ||
                    !custom.name.trim() ||
                    !custom.description.trim() ||
                    !custom.low.trim() ||
                    !custom.high.trim()
                  }
                  onClick={addTrait}
                >
                  Adicionar atributo
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setShowCustom(false)}
                >
                  Cancelar atributo
                </Button>
              </Card>
            ) : (
              <Button
                type="button"
                variant="secondary"
                disabled={busy || draft.traits.length >= 16}
                onClick={() => setShowCustom(true)}
              >
                <Plus className="icon icon-sm" aria-hidden="true" />
                Criar slider personalizado ({draft.traits.length - 8}/8)
              </Button>
            )}
            <details className={styles.summary}>
              <summary>Resumo das orientações</summary>
              <p>{draft.instructions}</p>
              {draft.traits.map((trait) => (
                <p key={trait.id}>
                  {trait.name}: {trait.value}/100 · 0: {trait.low} · 100: {trait.high}
                </p>
              ))}
            </details>
          </form>
        ) : selected ? (
          <div className={styles.stack}>
            <div className={`${styles.identity} ${styles.detailHero}`}>
              <PersonaAvatar persona={selected} />
              <div>
                <Badge variant="secondary">
                  {isDefaultPersona(selected.id)
                    ? 'Persona padrão'
                    : selected.archived
                      ? 'Arquivada'
                      : 'Sua persona'}
                </Badge>
                <p>{selected.description}</p>
              </div>
            </div>
            <section className={styles.instructions}>
              <h2>Direção de escrita</h2>
              <p>{selected.instructions}</p>
            </section>
            <section className={styles.stack}>
              <div>
                <h2>Mapa de personalidade</h2>
                <p>Intensidades de 0 a 100 que orientam o estilo narrativo.</p>
              </div>
              <PersonaTraits traits={selected.traits} />
            </section>
          </div>
        ) : modal ? (
          libraryContent
        ) : null}
      </Dialog>
    </>
  );
}
