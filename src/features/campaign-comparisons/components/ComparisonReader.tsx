import { getInvalidationGeneration, subscribeInvalidation } from '@/shared/services';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { renderRichText } from '@/shared/lib';
import { Alert, Badge, Button, Dropdown, LoadingState } from '@/shared/ui';
import type { CampaignBaseItem, CampaignBaseItemKind } from '@/features/campaign-bases';
import type {
  ComparisonChange,
  ComparisonChangeKind,
  ComparisonGroup,
  ComparisonIdentity,
  ComparisonReadEnvelope,
  ComparisonSide,
} from '../model/campaignComparison';
import * as api from '../services/campaignComparisonService';
import styles from './Comparisons.module.css';
export function ComparisonReader({
  identity,
  isActive,
  onReviewAdoption,
}: {
  identity: ComparisonIdentity;
  isActive: () => boolean;
  onReviewAdoption?: (context: ComparisonReadEnvelope) => void;
}) {
  const [attempt, setAttempt] = useState(0),
    scope = { actorId: identity.ownerId, scope: 'campaign:' + identity.campaignId },
    stamp = getInvalidationGeneration(scope);
  useLayoutEffect(() => {
    const retry = () => setAttempt((n) => n + 1),
      off = subscribeInvalidation(scope, retry);
    window.addEventListener('focus', retry);
    return () => {
      off();
      window.removeEventListener('focus', retry);
    };
  }, [identity.ownerId, identity.campaignId]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <ReaderSession
      key={attempt}
      identity={identity}
      isActive={() => isActive() && getInvalidationGeneration(scope) === stamp}
      retry={() => setAttempt((n) => n + 1)}
      onReviewAdoption={onReviewAdoption}
    />
  );
}
function ReaderSession({
  identity,
  isActive,
  retry,
  onReviewAdoption,
}: {
  identity: ComparisonIdentity;
  isActive: () => boolean;
  retry: () => void;
  onReviewAdoption?: (context: ComparisonReadEnvelope) => void;
}) {
  const [group, setGroup] = useState<ComparisonGroup>('source'),
    [kind, setKind] = useState('all'),
    [change, setChange] = useState('all'),
    [items, setItems] = useState<ComparisonChange[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(''),
    [envelope, setEnvelope] = useState<ComparisonReadEnvelope | null>(null),
    [selected, setSelected] = useState<{
      key: string;
      type: 'pair' | 'image' | 'single';
      row?: ComparisonChange;
      side?: ComparisonSide;
    } | null>(null);
  const alive = useRef(true),
    context = useRef<ComparisonReadEnvelope | null>(null),
    generation = useRef(0),
    invalid = useRef(false),
    seen = useRef(new Set<string>()),
    queryRef = useRef('');
  const query = JSON.stringify([group, kind, change]);
  // Reject a late page before effect cleanup when the user changes a filter.
  // eslint-disable-next-line react-hooks/refs
  queryRef.current = query;
  useLayoutEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const active = () => alive.current && isActive() && !invalid.current;
  function invalidate(cause: unknown) {
    if (!alive.current || !isActive()) return;
    invalid.current = true;
    generation.current++;
    context.current = null;
    setEnvelope(null);
    setItems([]);
    setSelected(null);
    setCursor(null);
    setLoading(false);
    setError(api.message(cause));
  }
  function observe(value: ComparisonReadEnvelope) {
    if (!active()) throw new Error('Leitura cancelada.');
    api.validateRead(value, identity);
    const prior = context.current;
    if (
      prior &&
      (prior.comparisonToken !== value.comparisonToken ||
        prior.collectionRevision !== value.collectionRevision ||
        prior.currentCapturedAt !== value.currentCapturedAt ||
        prior.candidateCapturedAt !== value.candidateCapturedAt)
    ) {
      const cause = new Error(
        'A comparação ou a autorização mudou. Reabra para consultar os dois lados atuais.',
      );
      invalidate(cause);
      throw cause;
    }
    context.current = value;
    setEnvelope(value);
  }
  async function load(next?: string) {
    if (!active()) return;
    const own = ++generation.current,
      requested = query;
    setLoading(true);
    try {
      const value = await api.listCampaignComparisonChanges({
        comparisonId: identity.comparisonId,
        group,
        ...(group === 'items' && kind !== 'all' ? { kind: kind as CampaignBaseItemKind } : {}),
        ...(change !== 'all' ? { change: change as ComparisonChangeKind } : {}),
        ...(next ? { cursor: next } : {}),
        limit: 25,
      });
      if (!active() || own !== generation.current || requested !== queryRef.current) return;
      // Observe authorization before rejecting a cursor/window mismatch.
      observe(value);
      api.keys(value, [
        'schemaVersion',
        'ownerId',
        'comparisonId',
        'campaignId',
        'campaignToken',
        'currentBaseId',
        'candidateBaseId',
        'currentCapturedAt',
        'candidateCapturedAt',
        'collectionRevision',
        'comparisonToken',
        'items',
        'nextCursor',
      ]);
      if (!Array.isArray(value.items) || value.items.length > 50) api.fail();
      value.items.forEach((row) => {
        api.validateChange(row, group);
        if (
          group === 'items' &&
          kind !== 'all' &&
          row.group === 'items' &&
          (row.currentSummary ?? row.candidateSummary)?.kind !== kind
        )
          api.fail();
        if (change !== 'all' && row.change !== change) api.fail();
      });
      if (!next) seen.current.clear();
      api.validateCursor(value.nextCursor, seen.current);
      if (value.nextCursor) seen.current.add(value.nextCursor);
      setItems((old) =>
        next
          ? [...old, ...value.items.filter((row) => !old.some((item) => item.key === row.key))]
          : value.items,
      );
      setCursor(value.nextCursor);
    } catch (cause) {
      if (active() && own === generation.current) invalidate(cause);
    } finally {
      if (active() && own === generation.current) setLoading(false);
    }
  }
  useEffect(() => {
    let current = true;
    queueMicrotask(() => {
      if (current) void load();
    });
    return () => {
      current = false;
    };
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps
  function filter(fn: () => void) {
    generation.current++;
    setItems([]);
    setSelected(null);
    setCursor(null);
    fn();
  }
  function selectKey(side: ComparisonSide, key: string) {
    setSelected({ type: 'single', key, side });
  }
  const labels = { current: 'Base atual', candidate: 'Base candidata' };
  return (
    <section className={styles.stack} aria-label="Comparação das bases">
      <h3>Comparar bases congeladas</h3>
      <p>Esta comparação não altera a base atual, as variantes ou as notas da campanha.</p>
      {error ? (
        <Alert variant="warning">
          {error}
          <Button onClick={retry}>Reabrir comparação</Button>
        </Alert>
      ) : (
        <>
          {envelope && (
            <div className={styles.columns}>
              {(['current', 'candidate'] as const).map((side) => (
                <p key={side} className={styles.meta}>
                  {labels[side]} · Capturada em{' '}
                  {new Date(
                    side === 'current' ? envelope.currentCapturedAt : envelope.candidateCapturedAt,
                  ).toLocaleString('pt-BR')}
                </p>
              ))}
            </div>
          )}
          {envelope && onReviewAdoption && (
            <Button
              onClick={() => {
                if (active() && context.current) onReviewAdoption({ ...context.current });
              }}
            >
              Revisar atualização da campanha
            </Button>
          )}
          <div className={styles.actions}>
            <Dropdown
              mode="select"
              label="Grupo da comparação"
              value={group}
              options={api.groups}
              onValueChange={(v) =>
                filter(() => {
                  setKind('all');
                  setGroup(v as ComparisonGroup);
                })
              }
            />
            {group === 'items' && (
              <Dropdown
                mode="select"
                label="Tipo de conteúdo comparado"
                value={kind}
                options={[{ value: 'all', label: 'Todos os tipos' }, ...api.kinds]}
                onValueChange={(v) => filter(() => setKind(v))}
              />
            )}
            <Dropdown
              mode="select"
              label="Mudanças da comparação"
              value={change}
              options={[
                { value: 'all', label: 'Todas as mudanças' },
                ...Object.entries(api.changeLabels).map(([value, label]) => ({ value, label })),
              ]}
              onValueChange={(v) => filter(() => setChange(v))}
            />
          </div>
          {loading && <LoadingState label="Conferindo diferenças autorizadas..." />}
          {!loading && !items.length && (
            <p>
              {cursor
                ? 'Esta janela não contém diferenças disponíveis. Há mais páginas para consultar.'
                : 'Nenhuma diferença disponível para estes filtros.'}
            </p>
          )}
          <ul className={styles.list}>
            {items.map((row, index) => (
              <li key={row.key} className={styles.rowCard}>
                <Badge variant="outline">{api.changeLabels[row.change]}</Badge>
                {row.group === 'source' ? (
                  <div className={styles.columns}>
                    {(['current', 'candidate'] as const).map((side) => {
                      const value = side === 'current' ? row.currentSummary : row.candidateSummary;
                      return (
                        <section key={side}>
                          <h4>{labels[side]}</h4>
                          {value && (
                            <>
                              <h5>{value.title}</h5>
                              <p className={styles.text}>{value.synopsis}</p>
                              <p>Idioma: {value.language}</p>
                            </>
                          )}
                        </section>
                      );
                    })}
                  </div>
                ) : row.group === 'items' ? (
                  <>
                    <p>
                      {row.currentSummary?.title ?? 'Não consta na base atual'} →{' '}
                      {row.candidateSummary?.title ?? 'Não consta na candidata'}
                    </p>
                    {row.orderContextChanged && <p>Contexto de ordem alterado</p>}
                    {row.requiresReview && (
                      <Alert variant="warning">
                        Esta ficha tem uma variante ou retirada particular. Será necessária uma
                        decisão antes de atualizar a base.
                      </Alert>
                    )}
                    {row.local && (
                      <p className={styles.meta}>
                        Lore da mesa:{' '}
                        {row.local.mode === 'override'
                          ? 'Variante da mesa'
                          : row.local.mode === 'removed'
                            ? 'Retirada'
                            : 'Base'}{' '}
                        · Revisão {row.local.revision}
                      </p>
                    )}
                    <Button
                      variant="outline"
                      onClick={() => setSelected({ type: 'pair', key: row.key, row })}
                    >
                      Comparar {row.currentSummary?.title ?? row.candidateSummary?.title}
                    </Button>
                  </>
                ) : row.group === 'references' ? (
                  <div className={styles.columns}>
                    {(['current', 'candidate'] as const).map((side) => {
                      const ref = side === 'current' ? row.currentSummary : row.candidateSummary;
                      return (
                        <section key={side}>
                          <h4>{labels[side]}</h4>
                          {ref ? (
                            <>
                              <p>
                                {ref.kind === 'scene' ? 'Vínculo de cena' : 'Vínculo narrativo'}
                              </p>
                              <Button
                                variant="outline"
                                onClick={() => selectKey(side, ref.sourceKey)}
                              >
                                Consultar origem {side === 'current' ? 'atual' : 'candidata'}
                              </Button>
                              {ref.available && ref.targetKey ? (
                                <Button
                                  variant="outline"
                                  onClick={() => selectKey(side, ref.targetKey!)}
                                >
                                  Consultar ficha {side === 'current' ? 'atual' : 'candidata'}
                                </Button>
                              ) : (
                                <p>Ficha referenciada indisponível</p>
                              )}
                            </>
                          ) : (
                            <p>Não consta nesta base.</p>
                          )}
                        </section>
                      );
                    })}
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => setSelected({ type: 'image', key: row.key, row })}
                  >
                    Comparar ilustração {index + 1}
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {cursor && (
            <Button disabled={loading} onClick={() => void load(cursor)}>
              Carregar mais diferenças
            </Button>
          )}
          {selected && envelope && (
            <section className={styles.stack} aria-label="Detalhes da comparação">
              <div className={styles.actions}>
                <h4>Detalhes autorizados</h4>
                <Button variant="secondary" onClick={() => setSelected(null)}>
                  Fechar detalhes
                </Button>
              </div>
              <div className={styles.columns}>
                {(['current', 'candidate'] as const).map((side) => {
                  if (selected.type === 'single' && selected.side !== side) return null;
                  const exists =
                    selected.type === 'single' ||
                    Boolean(
                      side === 'current'
                        ? selected.row?.currentSummary
                        : selected.row?.candidateSummary,
                    );
                  return (
                    <section key={side}>
                      <h4>{labels[side]}</h4>
                      {exists ? (
                        <ComparisonSideView
                          key={JSON.stringify([side, selected.key, envelope.comparisonToken])}
                          identity={identity}
                          side={side}
                          resourceKey={selected.key}
                          imageOnly={selected.type === 'image'}
                          envelope={envelope}
                          observe={observe}
                          isActive={active}
                          onError={invalidate}
                          onSelect={selectKey}
                        />
                      ) : (
                        <p>Não consta nesta base.</p>
                      )}
                    </section>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}
    </section>
  );
}
const fieldLabels: Record<string, string> = {
  content: 'Texto',
  legacyContent: 'Texto legado da parte',
  objective: 'Objetivo',
  conflict: 'Conflito',
  pointOfView: 'Ponto de vista',
  initialState: 'Estado inicial',
  plannedOutcome: 'Desfecho planejado',
  notes: 'Notas',
  description: 'Descrição',
  summary: 'Resumo',
  details: 'Detalhes',
  appearance: 'Aparência',
  personality: 'Personalidade',
  history: 'História',
};
function ComparisonSideView({
  identity,
  side,
  resourceKey,
  imageOnly,
  envelope,
  observe,
  isActive,
  onError,
  onSelect,
}: {
  identity: ComparisonIdentity;
  side: ComparisonSide;
  resourceKey: string;
  imageOnly: boolean;
  envelope: ComparisonReadEnvelope;
  observe: (v: ComparisonReadEnvelope) => void;
  isActive: () => boolean;
  onError: (cause: unknown) => void;
  onSelect: (side: ComparisonSide, key: string) => void;
}) {
  const [body, setBody] = useState<{
      item: CampaignBaseItem;
      fields: Record<string, string>;
    } | null>(null),
    [image, setImage] = useState<string | null>(null),
    [requestedImage, setRequestedImage] = useState(false),
    [imageLoading, setImageLoading] = useState(false),
    [done, setDone] = useState(false),
    active = useRef(true),
    latest = useRef({ observe, isActive, onError });
  useLayoutEffect(() => {
    latest.current = { observe, isActive, onError };
  });
  useLayoutEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    let current = true;
    const valid = () => current && active.current && latest.current.isActive();
    void (async () => {
      if (imageOnly) return;
      const item = await api.readCompleteComparisonItem(
        identity,
        side,
        resourceKey,
        envelope.comparisonToken,
        envelope.collectionRevision,
        valid,
        (page) => latest.current.observe(page),
      );
      if (!valid() || !item) return;
      setBody(item);
      setDone(true);
    })().catch((cause) => {
      if (valid()) latest.current.onError(cause);
    });
    return () => {
      current = false;
    };
  }, [
    identity,
    side,
    resourceKey,
    imageOnly,
    envelope.comparisonToken,
    envelope.collectionRevision,
  ]);
  const mediaKey = imageOnly ? resourceKey : requestedImage ? body?.item.image?.imageKey : null;
  useEffect(() => {
    if (!mediaKey) return;
    let current = true;
    const valid = () => current && active.current && latest.current.isActive();
    void (async () => {
      if (!valid()) return;
      setImageLoading(true);
      const media = await api.readCampaignComparisonImage({
        comparisonId: identity.comparisonId,
        imageKey: mediaKey,
        side,
      });
      if (!valid()) return;
      latest.current.observe(media);
      api.validateRead(media, identity, envelope.comparisonToken, envelope.collectionRevision);
      api.keys(media, [
        'schemaVersion',
        'ownerId',
        'comparisonId',
        'campaignId',
        'campaignToken',
        'currentBaseId',
        'candidateBaseId',
        'currentCapturedAt',
        'candidateCapturedAt',
        'collectionRevision',
        'comparisonToken',
        'side',
        'key',
        'dataUrl',
      ]);
      if (media.side !== side || media.key !== mediaKey) api.fail();
      setImage(api.validateImage(media.dataUrl));
      setDone(true);
    })()
      .catch((cause) => {
        if (valid()) {
          setBody(null);
          setImage(null);
          latest.current.onError(cause);
        }
      })
      .finally(() => {
        if (valid()) setImageLoading(false);
      });
    return () => {
      current = false;
    };
  }, [identity, side, mediaKey, envelope.comparisonToken, envelope.collectionRevision]);
  if (!done) return <LoadingState label="Verificando texto integral e mídia..." />;
  return (
    <div className={styles.stack}>
      {body && (
        <>
          <h5>{body.item.title}</h5>
          <p className={styles.meta}>
            {body.item.archived ? 'Arquivado' : 'Ativo'}
            {body.item.audience
              ? ' · ' +
                { creator: 'Só criador', gm: 'Mestre', players: 'Jogadores' }[body.item.audience]
              : ''}
          </p>
          {Object.entries(body.fields).map(([field, text]) => (
            <section key={field}>
              <h5>{fieldLabels[field] ?? field}</h5>
              {['content', 'legacyContent'].includes(field) ? (
                <div
                  className={styles.rich}
                  dangerouslySetInnerHTML={{ __html: renderRichText(text) }}
                />
              ) : (
                <p className={styles.text}>{text}</p>
              )}
            </section>
          ))}
          {body.item.structured.aliases?.length ? (
            <p>Outros nomes: {body.item.structured.aliases.join(', ')}</p>
          ) : null}
          {body.item.structured.relations?.map((r, i) => (
            <p key={r.targetKey + ':' + i}>
              <Button variant="outline" onClick={() => onSelect(side, r.targetKey)}>
                {r.title}
              </Button>{' '}
              · {r.relationType}
              <span className={styles.text}> {r.description}</span>
            </p>
          ))}
        </>
      )}
      {body?.item.image && (
        <>
          <p className={styles.text}>Texto alternativo: {body.item.image.alt}</p>
          <p className={styles.text}>Legenda: {body.item.image.caption}</p>
          {!image && !requestedImage && (
            <Button variant="outline" onClick={() => setRequestedImage(true)}>
              Ver ilustração deste lado
            </Button>
          )}
        </>
      )}
      {imageLoading && !imageOnly && <LoadingState label="Conferindo ilustração..." />}
      {image && (
        <figure>
          <img
            className={styles.image}
            src={image}
            alt={
              body?.item.image?.alt ??
              'Ilustração da base ' + (side === 'current' ? 'atual' : 'candidata')
            }
          />
          {body?.item.image && (
            <figcaption className={styles.text}>{body.item.image.caption}</figcaption>
          )}
        </figure>
      )}
    </div>
  );
}
