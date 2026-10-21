import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Alert, Badge, Button, Dropdown, LoadingState } from '@/shared/ui';
import { CampaignLoreReadView } from '@/features/campaign-lore';
import type {
  AdoptionProgress,
  AdoptionDecision,
  AdoptionDecisionsPage,
  AdoptionMutationResult,
  AdoptionChoice,
} from '../model/campaignAdoption';
import * as api from '../services/campaignAdoptionService';
import styles from './Adoptions.module.css';
export function AdoptionDecisions({
  uid,
  progress,
  result,
  disabled,
  isActive,
  onDecide,
  onRefresh,
  onAdapt,
  onReviewed,
}: {
  uid: string;
  progress: AdoptionProgress;
  result: AdoptionMutationResult | null;
  disabled: boolean;
  isActive: () => boolean;
  onDecide: (row: AdoptionDecision, choice: AdoptionChoice) => void;
  onRefresh: () => void;
  onAdapt: () => void;
  onReviewed: (checkpoint: number | null) => void;
}) {
  const [items, setItems] = useState<AdoptionDecision[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(''),
    [stale, setStale] = useState(false),
    [selected, setSelected] = useState<string | null>(null);
  const alive = useRef(true),
    generation = useRef(0),
    context = useRef<AdoptionDecisionsPage | null>(null),
    checkpoint = useRef(progress.checkpoint),
    latest = useRef({ isActive, progress }),
    seen = useRef(new Set<string>()),
    handled = useRef('');
  useLayoutEffect(() => {
    latest.current = { isActive, progress };
  });
  useLayoutEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const active = () => alive.current && latest.current.isActive();
  function invalidate(cause: unknown) {
    if (!active()) return;
    generation.current++;
    context.current = null;
    setItems([]);
    setCursor(null);
    setStale(true);
    setSelected(null);
    setLoading(false);
    onReviewed(null);
    setError(api.message(cause));
  }
  useEffect(() => {
    const p = progress,
      own = result?.receipt;
    let current = true;
    queueMicrotask(() => {
      if (!current || !active() || p.checkpoint === checkpoint.current) return;
      if (
        own?.action === 'decide' &&
        own.outcome === 'confirmed' &&
        own.confirmedCheckpoint === p.checkpoint &&
        own.expectedCheckpoint === checkpoint.current &&
        own.operationId !== handled.current
      ) {
        handled.current = own.operationId;
        checkpoint.current = p.checkpoint;
        setItems((old) =>
          old.map((row) =>
            row.sourceKey === own.sourceKey ? { ...row, choice: own.choice! } : row,
          ),
        );
        if (context.current && !loading && !stale) onReviewed(p.checkpoint);
      } else
        invalidate(
          new Error(
            'As escolhas mudaram. Consulte o progresso e reveja as decisões antes de preparar.',
          ),
        );
    });
    return () => {
      current = false;
    };
  }, [progress, result]); // eslint-disable-line react-hooks/exhaustive-deps
  async function load(next?: string) {
    const own = ++generation.current;
    setLoading(true);
    onReviewed(null);
    try {
      const v = await api.listCampaignAdoptionDecisions({
        adoptionId: progress.adoptionId,
        ...(next ? { cursor: next } : {}),
        limit: 25,
      });
      if (!active() || own !== generation.current) return;
      api.validateDecisionPage(v, uid, api.identityOf(progress), checkpoint.current);
      const old = context.current;
      if (
        old &&
        (old.projectionToken !== v.projectionToken ||
          old.currentCapturedAt !== v.currentCapturedAt ||
          old.candidateCapturedAt !== v.candidateCapturedAt)
      )
        throw new Error('A autorização ou o contexto mudou. Reveja as decisões.');
      if (
        v.checkpoint !== checkpoint.current ||
        v.checkpoint !== latest.current.progress.checkpoint
      )
        throw new Error(
          'Outro dispositivo alterou as escolhas. Consulte o progresso antes de rever.',
        );
      api.validateCursor(v.nextCursor, next ? seen.current : undefined);
      if (!next) seen.current.clear();
      if (v.nextCursor) seen.current.add(v.nextCursor);
      context.current = v;
      setItems((old) =>
        next
          ? [...old, ...v.items.filter((row) => !old.some((x) => x.sourceKey === row.sourceKey))]
          : v.items,
      );
      setCursor(v.nextCursor);
      setStale(false);
      setError('');
      onReviewed(v.checkpoint);
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section className={styles.stack} aria-label="Decisões da adoção">
      <h3>Decisões sobre o lore da mesa</h3>
      <p>
        Cada escolha vale para a ficha inteira. Fichas legadas conservam sua origem e permissões;
        não viram notas próprias.
      </p>
      {error && (
        <Alert variant="warning">
          {error}
          <Button disabled={disabled} onClick={onRefresh}>
            Consultar progresso da revisão
          </Button>
          <Button
            disabled={disabled}
            variant="outline"
            onClick={() => {
              checkpoint.current = latest.current.progress.checkpoint;
              context.current = null;
              setStale(false);
              void load();
            }}
          >
            Rever decisões
          </Button>
        </Alert>
      )}
      {loading && <LoadingState label="Conferindo decisões autorizadas..." />}
      {!loading && !error && !items.length && (
        <p>
          {cursor
            ? 'Esta janela está vazia; há mais fichas para conferir.'
            : 'Nenhuma decisão disponível nesta janela.'}
        </p>
      )}
      <ul className={styles.list}>
        {items.map((row) => (
          <li className={styles.row} key={row.sourceKey}>
            <h4>{row.current.name}</h4>
            <div className={styles.actions}>
              <Badge variant="outline">
                {row.mode === 'removed'
                  ? 'Retirada'
                  : row.mode === 'override'
                    ? 'Variante da mesa'
                    : 'Base'}
              </Badge>
              {row.legacy && <Badge variant="outline">Legado da mesa</Badge>}
              {row.required && <Badge variant="outline">Escolha necessária</Badge>}
            </div>
            <p>
              {row.candidate.present
                ? 'Na candidata: ' + row.candidate.name
                : 'Esta ficha não consta na candidata.'}
            </p>
            {row.impediments.map((text, i) => (
              <Alert variant="warning" key={i}>
                {text}
              </Alert>
            ))}
            <Button
              variant="outline"
              disabled={disabled || stale || loading}
              onClick={() => setSelected(row.sourceKey)}
            >
              Consultar ficha inteira de {row.current.name}
            </Button>
            <Dropdown
              mode="select"
              label={'Decisão para ' + row.current.name}
              value={row.choice ?? ''}
              options={[
                { value: '', label: 'Escolha uma opção' },
                {
                  value: 'keep-local',
                  label: row.candidate.present
                    ? row.mode === 'removed'
                      ? 'Manter ficha retirada'
                      : 'Manter variante da mesa'
                    : 'Manter legado da mesa',
                },
                ...(row.candidate.present
                  ? [{ value: 'use-candidate', label: 'Usar ficha da candidata' }]
                  : [{ value: 'discard-local', label: 'Descartar ficha ausente' }]),
              ]}
              disabled={disabled || stale || loading}
              onValueChange={(choice) => {
                if (choice) onDecide(row, choice as AdoptionChoice);
              }}
            />
          </li>
        ))}
      </ul>
      {selected && !stale && (
        <section className={styles.stack}>
          <Button variant="secondary" onClick={() => setSelected(null)}>
            Fechar ficha de consulta
          </Button>
          <CampaignLoreReadView
            scope={{
              campaignId: progress.campaignId,
              campaignToken: progress.campaignToken,
              baseId: progress.currentBaseId,
            }}
            sourceKey={selected}
            expectedCollectionRevision={progress.expectedCollectionRevision}
            isActive={isActive}
            onInvalidated={() =>
              invalidate(new Error('A ficha ou a autorização mudou. Reveja as decisões.'))
            }
          />
        </section>
      )}
      {cursor && !stale && (
        <Button disabled={loading || disabled} onClick={() => void load(cursor)}>
          Carregar mais decisões
        </Button>
      )}
      <Button variant="outline" disabled={disabled} onClick={onAdapt}>
        Fechar e adaptar no Lore da mesa
      </Button>
    </section>
  );
}
