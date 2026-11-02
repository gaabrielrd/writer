import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Dialog, EmptyState, ErrorState, LoadingState } from '@/shared/ui';
import {
  adventureLoreEntity,
  type AdventureLoreSummary,
  type AdventureLoreGet,
} from '../model/adventureLore';
import type { CreateLoreEntityInput, LoreEntity } from '../model/loreEntity';
import { useAdventureLoreCollection } from '../hooks/useAdventureLoreCollection';
import { LoreEntityCard } from './LoreEntityCard';
import { LoreEntityForm } from './LoreEntityForm';
import { AdventureLoreReader } from './AdventureLoreReader';
import styles from './LorePage.module.css';
interface Form {
  key: string;
  entity: LoreEntity | null;
  createdEntityId?: string;
  revision: number;
  collectionRevision: number;
  adventureToken: string;
}
export function AdventureLoreCollection({
  adventureId,
  active = true,
  onBusyChange,
  onEntitiesChanged,
}: {
  adventureId: string;
  active?: boolean;
  onBusyChange?: (busy: boolean) => void;
  onEntitiesChanged?: () => void;
}) {
  const closeApproved = useRef(false);
  const api = useAdventureLoreCollection(adventureId),
    [form, setForm] = useState<Form | null>(null),
    [dirty, setDirty] = useState(false),
    [reading, setReading] = useState(false),
    [viewing, setViewing] = useState<string | null>(null),
    [removing, setRemoving] = useState<AdventureLoreSummary | null>(null),
    [discard, setDiscard] = useState(false),
    [comparison, setComparison] = useState<AdventureLoreGet | null>(null),
    [actionError, setActionError] = useState('');
  const setDraftDirty = useCallback((value: boolean) => setDirty(value), []);
  const locked = api.busy || reading || Boolean(api.pending),
    context = api.context;
  useEffect(() => {
    onBusyChange?.(dirty || locked);
    return () => onBusyChange?.(false);
  }, [dirty, locked, onBusyChange]);
  useEffect(() => {
    if (!dirty && !api.pending) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, api.pending]);
  const clear = () => {
    setForm(null);
    setDirty(false);
    setDiscard(false);
  };
  function create() {
    if (!context || locked) return;
    setForm({
      key: crypto.randomUUID(),
      entity: null,
      revision: 0,
      collectionRevision: context.identity.collectionRevision,
      adventureToken: context.identity.adventureToken,
    });
    setDirty(false);
  }
  async function edit(row: AdventureLoreSummary) {
    if (!context || locked || form) return;
    setReading(true);
    try {
      const result = await api.get(row);
      if (result && api.isCurrent(context)) {
        setForm({
          key: row.id,
          entity: adventureLoreEntity(result.item),
          revision: result.item.revision!,
          collectionRevision: result.collectionRevision,
          adventureToken: result.adventureToken,
        });
        setDirty(false);
      }
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Não foi possível abrir a ficha.');
    } finally {
      setReading(false);
    }
  }
  async function save(input: CreateLoreEntityInput) {
    if (!form) throw new Error('Abra a ficha novamente.');
    const entityId = form.entity ? form.entity.id.split(':').at(-1)! : input.creationId!;
    if (!form.entity)
      setForm((previous) => (previous ? { ...previous, createdEntityId: entityId } : null));
    const confirmed = await api.submit('save', {
      adventureId,
      adventureToken: form.adventureToken,
      entityId,
      operationId: form.entity ? crypto.randomUUID() : entityId,
      expectedRevision: form.revision,
      expectedCollectionRevision: form.collectionRevision,
      entity: {
        name: input.name,
        aliases: input.aliases ?? [],
        category: input.category,
        summary: input.summary,
        details: input.details ?? '',
        structuredDetails: input.structuredDetails ?? {
          appearance: '',
          personality: '',
          history: '',
          notes: '',
        },
        relations: (input.relations ?? []).map(({ targetEntityId, relationType, description }) => ({
          targetEntityId,
          relationType,
          description: description ?? '',
        })),
        isPublic: false,
      },
    });
    if (!confirmed) throw new Error('Pedido encerrado; o rascunho foi preservado.');
    closeApproved.current = true;
    onEntitiesChanged?.();
  }
  async function compare() {
    if (!form || (!form.entity && !form.createdEntityId) || !context || api.pending) return;
    const row = context.items.find(
      (item) => item.id === (form.entity?.id ?? `adventure:${adventureId}:${form.createdEntityId}`),
    );
    if (!row) return;
    setReading(true);
    try {
      const value = await api.get(row);
      if (value && api.isCurrent(context)) setComparison(value);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Não foi possível conferir a ficha.');
    } finally {
      setReading(false);
    }
  }
  const controls = (
    <>
      {api.error && <Alert variant="warning">{api.error}</Alert>}
      {api.notice && <p role="status">{api.notice}</p>}
      {api.pending && (
        <Alert variant="warning" title="Pedido preservado em memória">
          <p>
            Confirme o mesmo pedido ou encerre-o antes de outro envio. Recarregar perde este
            controle local.
          </p>
          <Button
            type="button"
            disabled={api.busy}
            onClick={() => void api.retry().catch(() => undefined)}
          >
            Confirmar pedido de lore
          </Button>
          <Button
            type="button"
            disabled={api.busy}
            variant="secondary"
            onClick={() => void api.cancel().catch(() => undefined)}
          >
            Encerrar pedido de lore
          </Button>
        </Alert>
      )}
      {form && (form.entity || form.createdEntityId) && !api.pending && (
        <Button
          type="button"
          variant="secondary"
          disabled={locked || !context}
          onClick={() => void compare()}
        >
          Conferir revisão atual
        </Button>
      )}
    </>
  );
  const localFormAvailable = Boolean(
    context &&
    form &&
    context.identity.adventureToken === form.adventureToken &&
    (!form.entity || context.items.some((item) => item.id === form.entity!.id)),
  );
  return (
    <section aria-label="Lore da aventura" className={styles.loreTabContainer}>
      <h2>Lore da aventura</h2>
      <p>
        Fichas privadas desta aventura. O lore local tem prioridade sobre os termos do universo.
      </p>
      <div className={styles.loreTabHeader}>
        <Button type="button" disabled={locked || Boolean(form) || !context} onClick={create}>
          Nova Entidade
        </Button>
        <Button type="button" variant="secondary" disabled={api.busy} onClick={() => api.refresh()}>
          Atualizar lore da aventura
        </Button>
      </div>
      {api.loading && <LoadingState label="Carregando lore da aventura…" />}
      {actionError && <Alert variant="warning">{actionError}</Alert>}
      {api.error && <ErrorState error={api.error} onRetry={() => api.refresh()} />}
      {api.notice && <Alert variant="info">{api.notice}</Alert>}
      {api.pending && (
        <Alert variant="warning" title="Pedido preservado em memória">
          <p>
            Confirme o mesmo pedido ou encerre-o antes de outro envio. Recarregar perde este
            controle local.
          </p>
          <Button
            type="button"
            disabled={api.busy}
            onClick={() => void api.retry().catch(() => undefined)}
          >
            Confirmar pedido de lore
          </Button>
          <Button
            type="button"
            disabled={api.busy}
            variant="secondary"
            onClick={() => void api.cancel().catch(() => undefined)}
          >
            Encerrar pedido de lore
          </Button>
        </Alert>
      )}
      {!api.loading && context && !api.items.length && (
        <EmptyState
          title="Nenhuma entidade cadastrada"
          description="Cadastre personagens, locais e conceitos particulares da aventura."
        />
      )}
      <div className={styles.grid}>
        {api.items.map((row) => (
          <LoreEntityCard
            key={row.id}
            entity={row}
            disabled={locked || Boolean(form) || !context}
            onView={(item) => setViewing(item.id)}
            onEdit={(item) => void edit(item)}
            onDelete={(id) => {
              if (!locked && !form) setRemoving(api.items.find((item) => item.id === id) ?? null);
            }}
          />
        ))}
      </div>
      {api.cursor && (
        <Button type="button" disabled={api.loading || locked} onClick={() => void api.load(true)}>
          Carregar mais lore da aventura
        </Button>
      )}
      {form && (
        <LoreEntityForm
          key={form.key}
          open={active && localFormAvailable}
          preserveDraft
          adventure
          privateOnly
          entityToEdit={form.entity}
          allEntities={api.context?.items ?? []}
          disabled={locked || !localFormAvailable}
          operationControls={controls}
          onDirtyChange={setDraftDirty}
          onSubmit={save}
          onClose={() => {
            if (closeApproved.current) {
              closeApproved.current = false;
              clear();
              return;
            }
            if (api.busy) return;
            if (dirty || api.pending) setDiscard(true);
            else clear();
          }}
        />
      )}
      {form && !localFormAvailable && (
        <Alert variant="warning">
          O contexto está sendo conferido. Seu rascunho particular permanece em memória.
        </Alert>
      )}
      {discard && (
        <Dialog
          open
          title="Descartar rascunho de lore?"
          onClose={() => setDiscard(false)}
          footer={
            <>
              <Button type="button" variant="secondary" onClick={() => setDiscard(false)}>
                Continuar editando
              </Button>
              <Button
                type="button"
                variant="danger"
                disabled={Boolean(api.pending)}
                onClick={clear}
              >
                Descartar rascunho
              </Button>
            </>
          }
        >
          <p>
            O texto não salvo será descartado. Pedidos preservados precisam ser encerrados primeiro.
          </p>
        </Dialog>
      )}
      {comparison && context && comparison.contextToken === context.identity.contextToken && (
        <Dialog
          open
          title="Comparar ficha atual"
          onClose={() => setComparison(null)}
          footer={
            <Button
              type="button"
              onClick={() => {
                setForm((previous) =>
                  previous
                    ? {
                        ...previous,
                        entity: adventureLoreEntity(comparison.item),
                        revision: comparison.item.revision!,
                        collectionRevision: comparison.collectionRevision,
                        adventureToken: comparison.adventureToken,
                      }
                    : null,
                );
                setComparison(null);
              }}
            >
              Usar esta revisão e manter meu rascunho
            </Button>
          }
        >
          <p>
            O rascunho permanece intacto. Confira o texto confirmado antes de escolher a revisão.
          </p>
          <h3>{comparison.item.name}</h3>
          <p>{comparison.item.summary}</p>
          <p>{comparison.item.aliases.join(', ')}</p>
          <pre>{comparison.item.details}</pre>
          {Object.entries(comparison.item.structuredDetails).map(([field, value]) => (
            <p key={field}>
              {field}: {value}
            </p>
          ))}
          {comparison.item.relations.map((relation, index) => (
            <p key={index}>
              {relation.available
                ? (context.items.find((item) => item.id === relation.targetEntityId)?.name ??
                  'Entidade indisponível')
                : 'Entidade indisponível'}{' '}
              · {relation.relationType}: {relation.description}
            </p>
          ))}
        </Dialog>
      )}
      {viewing && (
        <AdventureLoreReader
          adventureId={adventureId}
          entityId={viewing}
          onClose={() => setViewing(null)}
        />
      )}
      {removing && (
        <Dialog
          open
          title="Excluir ficha da aventura?"
          onClose={() => {
            if (!api.busy) setRemoving(null);
          }}
          footer={
            <Button
              type="button"
              variant="danger"
              disabled={locked || !context}
              onClick={() => {
                if (!context) return;
                void api
                  .submit('delete', {
                    adventureId,
                    adventureToken: context.identity.adventureToken,
                    entityId: removing.reference.entityId,
                    operationId: crypto.randomUUID(),
                    expectedRevision: removing.revision!,
                    expectedCollectionRevision: context.identity.collectionRevision,
                  })
                  .then(() => {
                    setRemoving(null);
                    onEntitiesChanged?.();
                  })
                  .catch(() => undefined);
              }}
            >
              Confirmar exclusão
            </Button>
          }
        >
          <p>A ficha ficará indisponível nas referências e nas bases que dependem dela.</p>
        </Dialog>
      )}
    </section>
  );
}
