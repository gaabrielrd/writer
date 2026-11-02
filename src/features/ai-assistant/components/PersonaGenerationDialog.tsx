import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Dialog,
  Dropdown,
  EmptyState,
  ErrorState,
  LoadingState,
  Textarea,
} from '@/shared/ui';
import { listUniverses, type Universe } from '@/features/universes';
import { subscribeLoreEntities, type LoreEntity } from '@/features/lore';
import { capturePlatformTextGeneration } from '../services/byokStorage';
import {
  preparePersonaContext,
  generatePersona,
  getPersonaGeneration,
  discardPersonaGeneration,
} from '../services/personaGenerationService';
import type { PersonaGenerationContext, PersonaGenerationResult } from '../model/personaGeneration';
import styles from './Personas.module.css';

export function PersonaGenerationDialog({
  ownerId,
  open,
  onClose,
  onReview,
}: {
  ownerId: string;
  open: boolean;
  onClose: () => void;
  onReview: (result: PersonaGenerationResult) => void;
}) {
  const [worlds, setWorlds] = useState<Universe[]>([]);
  const [universeId, setUniverseId] = useState('');
  const [entities, setEntities] = useState<LoreEntity[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [intention, setIntention] = useState('');
  const [context, setContext] = useState<PersonaGenerationContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [loreLoading, setLoreLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loreError, setLoreError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    listUniverses(ownerId)
      .then((items) => {
        if (active) {
          setWorlds(items.filter((item) => !item.deleting));
          setLoadError(null);
          setLoading(false);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setLoadError(
            error instanceof Error ? error.message : 'Não foi possível carregar universos.',
          );
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [ownerId, attempt]);
  useEffect(() => {
    if (!universeId) return;
    return subscribeLoreEntities(
      { kind: 'universe', id: universeId },
      (items) => {
        setEntities(items);
        setLoreLoading(false);
        setLoreError(null);
        // A fresh preview must be confirmed after any server synchronization.
        setContext(null);
        setSelected((previous) =>
          previous.filter((entityId) => items.some((entity) => entity.id === entityId)),
        );
      },
      () => {
        setLoreError('Não foi possível carregar o lore. Tente novamente.');
        setLoreLoading(false);
        setContext(null);
      },
    );
  }, [universeId, attempt]);
  const run = async (operation: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    try {
      await operation();
    } catch (error) {
      if (alive.current)
        setFailure(error instanceof Error ? error.message : 'Não foi possível concluir.');
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const review = (result: PersonaGenerationResult) => {
    if (!alive.current) return;
    if (result.state === 'ready' && result.persona && result.rationale) {
      setPending(null);
      onReview(result);
    } else if (result.state === 'generating')
      setFailure('Pedido em andamento. Consulte o resultado em alguns instantes.');
    else {
      setPending(null);
      setFailure('Este pedido foi encerrado. Confira o contexto e gere outra proposta.');
    }
  };
  const close = () => {
    if (busy) return;
    if (pending) void discardPersonaGeneration(pending).catch(() => undefined);
    setPending(null);
    onClose();
  };
  const retry = () => {
    setLoading(true);
    setLoadError(null);
    if (universeId) setLoreLoading(true);
    setAttempt((value) => value + 1);
  };
  const chooseUniverse = (value: string) => {
    setUniverseId(value);
    setSelected([]);
    setEntities([]);
    setLoreLoading(true);
    setLoreError(null);
    setContext(null);
    setFailure(null);
  };
  return (
    <Dialog
      open={open}
      title="Criar persona com IA"
      onClose={close}
      maxWidthClass="max-w-3xl min-[901px]:max-w-[960px]"
      footer={
        <>
          <Button type="button" variant="secondary" disabled={busy} onClick={close}>
            Cancelar criação
          </Button>
          {pending ? (
            <Button
              disabled={busy}
              onClick={() => void run(async () => review(await getPersonaGeneration(pending)))}
            >
              Consultar resultado
            </Button>
          ) : (
            <Button
              form="persona-generation-form"
              type="submit"
              disabled={
                busy || loading || loreLoading || Boolean(loadError || loreError) || !universeId
              }
            >
              {busy ? 'Preparando...' : context ? 'Gerar persona' : 'Conferir contexto'}
            </Button>
          )}
        </>
      }
    >
      <form
        id="persona-generation-form"
        className={styles.stack}
        onSubmit={(event) => {
          event.preventDefault();
          if (pending || !universeId || busy) return;
          void run(async () => {
            if (!context) {
              const prepared = await preparePersonaContext(
                universeId,
                selected.map((value) => value.split(':').at(-1)!),
              );
              if (alive.current) setContext(prepared);
            } else {
              const generation = capturePlatformTextGeneration(),
                requestId = crypto.randomUUID();
              setPending(requestId);
              review(await generatePersona(context, intention, requestId, generation));
            }
          });
        }}
      >
        <Alert variant="info">
          Geração pela IA da plataforma, sem débito de créditos do Writer. Consome cota do provedor.
          A voz só entra na biblioteca depois de revisar e salvar.
        </Alert>
        {failure && <Alert variant="danger">{failure}</Alert>}
        {loading && <LoadingState label="Carregando universos..." />}
        {loadError && (
          <ErrorState
            description={loadError}
            action={
              <Button type="button" onClick={retry}>
                Tentar novamente
              </Button>
            }
          />
        )}
        {!loading && !loadError && worlds.length === 0 && (
          <EmptyState
            title="Nenhum universo disponível"
            description="Crie um universo em Universos antes de gerar uma voz por contexto. A criação manual de personas continua disponível."
          />
        )}
        {worlds.length > 0 && (
          <Dropdown
            mode="select"
            label="Universo da persona"
            placeholder="Escolha um universo"
            searchable
            options={worlds.map((world) => ({ value: world.id, label: world.name }))}
            value={universeId}
            onValueChange={chooseUniverse}
            disabled={busy || Boolean(pending)}
          />
        )}
        {universeId && (
          <>
            <p>{worlds.find((world) => world.id === universeId)?.description}</p>
            {loreLoading && <LoadingState label="Carregando lore do universo..." />}
            {loreError && (
              <ErrorState
                description={loreError}
                action={
                  <Button type="button" onClick={retry}>
                    Tentar carregar lore novamente
                  </Button>
                }
              />
            )}
            {!loreLoading && !loreError && (
              <section className={styles.stack} aria-label="Fichas para o contexto">
                <h3>Escolha o lore que orientará a voz ({selected.length}/25)</h3>
                <p>
                  Somente as fichas selecionadas serão enviadas. Sem seleção, usamos apenas nome e
                  descrição do universo.
                </p>
                {entities.length === 0 && (
                  <EmptyState
                    title="Este universo ainda não tem lore"
                    description="Você pode criar a voz a partir da descrição do universo."
                  />
                )}
                {entities.map((entity) => (
                  <Card key={entity.id} className={`${styles.stack} ${styles.card}`}>
                    <Button
                      type="button"
                      variant="secondary"
                      aria-pressed={selected.includes(entity.id)}
                      disabled={
                        busy ||
                        Boolean(pending) ||
                        (!selected.includes(entity.id) && selected.length >= 25)
                      }
                      onClick={() => {
                        setSelected((previous) =>
                          previous.includes(entity.id)
                            ? previous.filter((value) => value !== entity.id)
                            : [...previous, entity.id],
                        );
                        setContext(null);
                      }}
                    >
                      {selected.includes(entity.id) ? 'Remover' : 'Incluir'} {entity.name}
                    </Button>
                    <p>{entity.summary}</p>
                  </Card>
                ))}
              </section>
            )}
          </>
        )}
        <Textarea
          label="Intenção para a voz (opcional)"
          hint="Exemplo: uma voz sombria e íntima, com humor contido."
          maxLength={2000}
          value={intention}
          disabled={busy || Boolean(pending)}
          onChange={(event) => setIntention(event.target.value)}
        />
        {context && (
          <section className={styles.stack} aria-label="Revisão do contexto">
            <h3>Contexto conferido: {context.universe.name}</h3>
            <p>
              {context.entities.length} fichas · {context.bytes} bytes de 65.536. Confira o conteúdo
              antes de gerar.
            </p>
            <details>
              <summary>Conteúdo completo que será enviado à IA</summary>
              <pre className={styles.promptText}>
                {JSON.stringify(
                  { universe: context.universe, entities: context.entities },
                  null,
                  2,
                )}
              </pre>
            </details>
            <p>
              A proposta interpreta o estilo. Não altera lore, manuscrito ou vínculos. Depois de
              salva, mudanças no universo não atualizam a persona automaticamente.
            </p>
          </section>
        )}
        {busy && (
          <LoadingState
            label={pending ? 'Gerando ou consultando proposta...' : 'Conferindo contexto...'}
          />
        )}
        {pending && !busy && (
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              void discardPersonaGeneration(pending).catch(() => undefined);
              setPending(null);
              setContext(null);
            }}
          >
            Descartar pedido e revisar contexto
          </Button>
        )}
      </form>
    </Dialog>
  );
}
