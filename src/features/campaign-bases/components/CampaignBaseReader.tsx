import { getInvalidationGeneration, subscribeInvalidation } from '@/shared/services';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth';
import { renderRichText } from '@/shared/lib';
import { Alert, Badge, Button, Card, Dropdown, LoadingState } from '@/shared/ui';
import type {
  CampaignBase,
  CampaignBaseArchive,
  CampaignBaseItemKind,
  CampaignBaseReference,
  CampaignBaseSummary,
} from '../model/campaignBase';
import * as api from '../services/campaignBaseService';
import styles from './CampaignBases.module.css';
export interface CampaignBaseReaderProps {
  campaignId: string;
  generationId: string;
}
const labels: Record<CampaignBaseItemKind, string> = {
  part: 'Partes',
  scene: 'Cenas',
  block: 'Blocos',
  arc: 'Arcos',
  milestone: 'Marcos',
  event: 'Cronologia',
  lore: 'Fichas de lore',
};
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
function useBaseReadGuard(campaignId: string) {
  const { user } = useAuth(),
    uid = user?.uid ?? '',
    scope = { actorId: uid, scope: 'campaign:' + campaignId },
    stamp = useRef(uid ? getInvalidationGeneration(scope) : 0);
  return useCallback(
    () =>
      !!uid &&
      getInvalidationGeneration({ actorId: uid, scope: 'campaign:' + campaignId }) ===
        stamp.current,
    [uid, campaignId],
  );
}
export function CampaignBaseReader(props: CampaignBaseReaderProps) {
  const { user } = useAuth();
  const [attempt, setAttempt] = useState(0);
  useLayoutEffect(() => {
    if (!user?.uid) return;
    const retry = () => setAttempt((n) => n + 1),
      off = subscribeInvalidation(
        { actorId: user?.uid ?? '', scope: 'campaign:' + props.campaignId },
        retry,
      );
    window.addEventListener('focus', retry);
    return () => {
      off();
      window.removeEventListener('focus', retry);
    };
  }, [user?.uid, props.campaignId]);
  return user ? (
    <ReaderSession
      key={JSON.stringify([user.uid, props.campaignId, props.generationId, attempt])}
      {...props}
      retry={() => setAttempt((n) => n + 1)}
    />
  ) : null;
}
function ReaderSession({
  campaignId,
  generationId,
  retry,
}: CampaignBaseReaderProps & { retry: () => void }) {
  const pulseActive = useBaseReadGuard(campaignId);
  const [base, setBase] = useState<CampaignBase | null>(null),
    [error, setError] = useState(''),
    [section, setSection] = useState('material'),
    [kind, setKind] = useState<CampaignBaseItemKind>('part'),
    [parent, setParent] = useState<string | undefined>(),
    [roots, setRoots] = useState(false),
    [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void api
      .getCampaignBase({ campaignId })
      .then((value) => {
        if (!active || !pulseActive()) return;
        api.assertCampaignResponseBudget(value);
        api.assertCampaignProjection(value.projectionToken);
        if (value.baseId !== generationId)
          throw new Error('A geração ativa da campanha mudou. Reabra a campanha.');
        setBase(value);
      })
      .catch((cause) => {
        if (active && pulseActive()) {
          setBase(null);
          setError(api.captureErrorMessage(cause));
        }
      });
    return () => {
      active = false;
    };
  }, [campaignId, generationId, pulseActive]);
  const invalidate = useCallback((cause: unknown) => {
    setBase(null);
    setSelected(null);
    setError(api.captureErrorMessage(cause));
  }, []);
  const archive: CampaignBaseArchive = section === 'archive' ? 'archived' : 'active';
  const choices: CampaignBaseItemKind[] =
    section === 'narrative'
      ? ['arc', 'milestone', 'event']
      : section === 'lore'
        ? ['lore']
        : section === 'archive'
          ? ['part', 'scene', 'block', 'arc', 'milestone', 'event', 'lore']
          : ['part', 'scene', 'block'];
  function selectSection(value: string) {
    setSection(value);
    setKind(value === 'narrative' ? 'arc' : value === 'lore' ? 'lore' : 'part');
    setParent(undefined);
    setRoots(false);
    setSelected(null);
  }
  return (
    <Card className={styles.reader}>
      <h2>Base congelada da campanha</h2>
      {error ? (
        <Alert variant="warning">
          A base não está disponível para esta leitura. {error}
          <Button variant="outline" onClick={retry}>
            Reabrir base
          </Button>
        </Alert>
      ) : !base ? (
        <LoadingState label="Autorizando base da campanha…" />
      ) : (
        <>
          <header>
            <h3>{base.source.title}</h3>
            <p className={styles.text}>{base.source.synopsis}</p>
            <p className={styles.meta}>
              Idioma: {base.source.language} · Origem congelada em{' '}
              {new Date(base.capturedAt).toLocaleString('pt-BR')}
            </p>
            <p>
              A descrição e o checklist desta mesa permanecem separados do material original
              capturado.
            </p>
          </header>
          <Dropdown
            mode="select"
            label="Área da base"
            value={section}
            onValueChange={selectSection}
            options={[
              { value: 'material', label: 'Material' },
              { value: 'narrative', label: 'Narrativa' },
              { value: 'lore', label: 'Lore' },
              { value: 'archive', label: 'Arquivo' },
            ]}
          />
          <Dropdown
            mode="select"
            label="Tipo de material capturado"
            value={kind}
            onValueChange={(value) => {
              setKind(value as CampaignBaseItemKind);
              setParent(undefined);
              setRoots(false);
              setSelected(null);
            }}
            options={choices.map((value) => ({ value, label: labels[value] }))}
          />
          {(kind === 'scene' || kind === 'part') && (
            <div className={styles.actions}>
              <Button
                variant={roots ? 'primary' : 'outline'}
                onClick={() => {
                  setRoots((n) => !n);
                  setParent(undefined);
                  setSelected(null);
                }}
              >
                {kind === 'scene' ? 'Cenas sem parte' : 'Partes da raiz'}
              </Button>
            </div>
          )}
          {parent && (
            <Button
              variant="outline"
              onClick={() => {
                setParent(undefined);
                setSelected(null);
              }}
            >
              Mostrar todos de {labels[kind].toLowerCase()}
            </Button>
          )}
          <BaseItems
            key={JSON.stringify([kind, parent, roots, archive, base.projectionToken])}
            campaignId={campaignId}
            kind={kind}
            archive={archive}
            parentKey={roots ? null : parent}
            token={base.projectionToken}
            onError={invalidate}
            onSelect={setSelected}
            onChildren={(item) => {
              setKind(
                item.kind === 'part' ? 'scene' : item.kind === 'scene' ? 'block' : 'milestone',
              );
              setParent(item.sourceKey);
              setRoots(false);
              setSelected(null);
            }}
          />
          {selected && (
            <BaseItem
              key={selected}
              campaignId={campaignId}
              sourceKey={selected}
              token={base.projectionToken}
              onError={invalidate}
              onSelect={setSelected}
            />
          )}
        </>
      )}
    </Card>
  );
}
interface ListProps {
  campaignId: string;
  kind: CampaignBaseItemKind;
  archive: CampaignBaseArchive;
  parentKey?: string | null;
  token: string;
  onError: (cause: unknown) => void;
  onSelect: (key: string) => void;
  onChildren: (item: CampaignBaseSummary) => void;
}
function BaseItems({
  campaignId,
  kind,
  archive,
  parentKey,
  token,
  onError,
  onSelect,
  onChildren,
}: ListProps) {
  const pulseActive = useBaseReadGuard(campaignId);
  const [items, setItems] = useState<CampaignBaseSummary[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    active = useRef(true),
    busy = useRef(false),
    seen = useRef(new Set<string>());
  useLayoutEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const load = useCallback(
    async (more: boolean, next: string | null = null) => {
      if (busy.current) return;
      busy.current = true;
      try {
        const page = await api.listCampaignBaseItems({
          campaignId: campaignId,
          kind: kind,
          archive: archive,
          ...(parentKey !== undefined ? { parentKey: parentKey } : {}),
          cursor: next,
          limit: 25,
        });
        if (!active.current || !pulseActive()) return;
        api.assertCampaignResponseBudget(page);
        api.assertCampaignProjection(page.projectionToken, token);
        if (
          !Array.isArray(page.items) ||
          page.items.some(
            (item) =>
              item.kind !== kind ||
              typeof item.sourceKey !== 'string' ||
              (parentKey !== undefined && item.parentKey !== parentKey),
          )
        )
          throw new Error('A lista capturada não corresponde à leitura solicitada.');
        if (
          page.nextCursor !== null &&
          (typeof page.nextCursor !== 'string' || seen.current.has(page.nextCursor))
        )
          throw new Error('O cursor da base não pôde ser confirmado.');
        if (page.nextCursor) seen.current.add(page.nextCursor);
        setItems((current) => [
          ...new Map(
            [...(more ? current : []), ...page.items].map((item) => [item.sourceKey, item]),
          ).values(),
        ]);
        setCursor(page.nextCursor);
      } catch (cause) {
        if (active.current && pulseActive()) onError(cause);
      } finally {
        busy.current = false;
        if (active.current && pulseActive()) setLoading(false);
      }
    },
    [campaignId, kind, archive, parentKey, token, onError, pulseActive],
  );
  useEffect(() => {
    queueMicrotask(() => {
      if (active.current) void load(false);
    });
    return () => {
      active.current = false;
    };
  }, [load]);
  return (
    <div className={styles.stack}>
      {loading && <LoadingState label="Carregando material capturado…" />}
      <ul className={styles.items}>
        {items.map((item) => (
          <li key={item.sourceKey}>
            <div className={styles.actions}>
              <Button variant="outline" onClick={() => onSelect(item.sourceKey)}>
                {item.title}
                {item.role === 'main'
                  ? ' · Principal'
                  : item.role === 'additional'
                    ? ' · Adicional'
                    : ''}
              </Button>
              {item.archived && <Badge variant="secondary">Arquivo</Badge>}
              {item.audience && (
                <Badge variant="outline">
                  {item.audience === 'creator'
                    ? 'Criador'
                    : item.audience === 'gm'
                      ? 'Mestre'
                      : 'Jogadores'}
                </Badge>
              )}
              {item.dateLabel && <span>{item.dateLabel}</span>}
              {['part', 'scene', 'arc'].includes(item.kind) && (
                <Button variant="secondary" onClick={() => onChildren(item)}>
                  Abrir{' '}
                  {item.kind === 'part' ? 'cenas' : item.kind === 'scene' ? 'blocos' : 'marcos'}
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {!loading && !items.length && !cursor && (
        <p>Nenhum material disponível neste recorte da base.</p>
      )}
      {cursor && (
        <Button
          disabled={loading}
          variant="secondary"
          onClick={() => {
            setLoading(true);
            void load(true, cursor);
          }}
        >
          Carregar mais material
        </Button>
      )}
    </div>
  );
}
function BaseItem({
  campaignId,
  sourceKey,
  token,
  onError,
  onSelect,
}: {
  campaignId: string;
  sourceKey: string;
  token: string;
  onError: (cause: unknown) => void;
  onSelect: (key: string) => void;
}) {
  const pulseActive = useBaseReadGuard(campaignId);
  const [body, setBody] =
      useState<Awaited<ReturnType<typeof api.readCompleteCampaignBaseItem>>>(null),
    [image, setImage] = useState<string | null>(null);
  const alive = useRef(true);
  useLayoutEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    void api
      .readCompleteCampaignBaseItem(
        campaignId,
        sourceKey,
        token,
        () => active && alive.current && pulseActive(),
      )
      .then(async (value) => {
        if (!active || !alive.current || !pulseActive() || !value) return;
        setBody(value);
        if (value.item.image) {
          const media = await api.readCampaignBaseImage({
            campaignId,
            imageKey: value.item.image.imageKey,
          });
          if (!active || !alive.current || !pulseActive()) return;
          setImage(api.validatedCampaignBaseImage(media, token));
        }
      })
      .catch((cause) => {
        if (active && alive.current && pulseActive()) {
          setBody(null);
          setImage(null);
          onError(cause);
        }
      });
    return () => {
      active = false;
    };
  }, [campaignId, sourceKey, token, onError, pulseActive]);
  if (!body) return <LoadingState label="Conferindo texto integral e autorização…" />;
  return (
    <section className={styles.stack} aria-label="Recurso capturado">
      <h3>{body.item.title}</h3>
      {Object.entries(body.fields).map(([field, text]) => (
        <section key={field}>
          <h4>{fieldLabels[field] ?? field}</h4>
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
      {body.item.image &&
        (image ? (
          <figure>
            <img className={styles.image} src={image} alt={body.item.image.alt} />
            <figcaption>{body.item.image.caption}</figcaption>
          </figure>
        ) : (
          <LoadingState label="Conferindo ilustração capturada…" />
        ))}
      {body.item.structured.aliases?.length ? (
        <p>Também conhecida como: {body.item.structured.aliases.join(', ')}</p>
      ) : null}
      {body.item.structured.relations?.map((relation, index) => (
        <p key={relation.targetKey + ':' + index}>
          <Button variant="outline" onClick={() => onSelect(relation.targetKey)}>
            {relation.title}
          </Button>{' '}
          · {relation.relationType}
          <span className={styles.text}> {relation.description}</span>
        </p>
      ))}
      {['scene', 'arc', 'milestone', 'event'].includes(body.item.kind) && (
        <BaseReferences
          campaignId={campaignId}
          sourceKey={sourceKey}
          token={token}
          onError={onError}
          onSelect={onSelect}
        />
      )}
    </section>
  );
}
function BaseReferences({
  campaignId,
  sourceKey,
  token,
  onError,
  onSelect,
}: {
  campaignId: string;
  sourceKey: string;
  token: string;
  onError: (cause: unknown) => void;
  onSelect: (key: string) => void;
}) {
  const pulseActive = useBaseReadGuard(campaignId);
  const [items, setItems] = useState<CampaignBaseReference[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    active = useRef(true),
    busy = useRef(false),
    seen = useRef(new Set<string>());
  useLayoutEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const load = useCallback(
    async (next: string | null) => {
      if (busy.current) return;
      busy.current = true;
      try {
        const page = await api.listCampaignBaseReferences({
          campaignId,
          sourceKey,
          cursor: next,
          limit: 25,
        });
        if (!active.current || !pulseActive()) return;
        api.assertCampaignResponseBudget(page);
        api.assertCampaignProjection(page.projectionToken, token);
        if (
          page.items.some(
            (item) =>
              item.sourceKey !== sourceKey ||
              (item.available ? typeof item.targetKey !== 'string' : item.targetKey !== null),
          )
        )
          throw new Error('O vínculo capturado não pôde ser confirmado.');
        if (
          page.nextCursor !== null &&
          (typeof page.nextCursor !== 'string' || seen.current.has(page.nextCursor))
        )
          throw new Error('O cursor dos vínculos não pôde ser confirmado.');
        if (page.nextCursor) seen.current.add(page.nextCursor);
        setItems((current) => [
          ...new Map([...current, ...page.items].map((item) => [item.key, item])).values(),
        ]);
        setCursor(page.nextCursor);
      } catch (cause) {
        if (active.current && pulseActive()) onError(cause);
      } finally {
        busy.current = false;
        if (active.current && pulseActive()) setLoading(false);
      }
    },
    [campaignId, sourceKey, token, onError, pulseActive],
  );
  useEffect(() => {
    queueMicrotask(() => {
      if (active.current) void load(null);
    });
    return () => {
      active.current = false;
    };
  }, [load]);
  return (
    <section className={styles.stack}>
      <h4>Referências capturadas</h4>
      {loading && <LoadingState label="Carregando referências…" />}
      {items.map((item, index) =>
        item.available && item.targetKey ? (
          <Button key={item.key} variant="outline" onClick={() => onSelect(item.targetKey!)}>
            Consultar ficha capturada {index + 1}
          </Button>
        ) : (
          <p key={item.key}>Ficha referenciada indisponível</p>
        ),
      )}
      {!loading && !items.length && !cursor && <p>Sem referências estruturadas neste recurso.</p>}
      {cursor && (
        <Button
          variant="secondary"
          disabled={loading}
          onClick={() => {
            setLoading(true);
            void load(cursor);
          }}
        >
          Carregar mais referências
        </Button>
      )}
    </section>
  );
}
