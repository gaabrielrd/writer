import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth';
import {
  CampaignLoreDisplay,
  CampaignLorePicker,
  type CampaignLorePickerPage,
} from '@/features/campaign-lore';
import {
  getInvalidationGeneration,
  publishInvalidation,
  subscribeInvalidation,
} from '@/shared/services';
import { Alert, Badge, Button, Dialog, Dropdown, LoadingState } from '@/shared/ui';
import type {
  SessionReferenceScope,
  SessionReferenceSourceContext,
  SessionLoreMaterial,
  PendingSessionReference,
  SessionLoreCandidate,
} from '../model/sessionReference';
import type {
  AnySessionReferenceRow,
  SessionSceneArchive,
  SessionSceneCandidate,
  SessionSceneReadScope,
} from '../model/sessionSceneReference';
import { SessionScenePicker } from './SessionScenePicker';
import { SessionSceneReader } from './SessionSceneReader';
import * as api from '../services/sessionReferenceService';
import * as store from '../services/sessionReferenceRecovery';
import { useSessionReferenceOperation } from '../hooks/useSessionReferenceOperation';
import { ReferenceRecoveryActions } from './ReferenceRecoveryActions';
import styles from './References.module.css';
export interface CampaignSessionReferencesPanelProps {
  scope: SessionReferenceScope;
  isActive: () => boolean;
  readOnly: boolean;
}
export function CampaignSessionReferencesPanel(props: CampaignSessionReferencesPanelProps) {
  const { user } = useAuth(),
    actor = useRef(''),
    [epoch, setEpoch] = useState(0),
    key = JSON.stringify([user?.uid, props.scope]);
  // eslint-disable-next-line react-hooks/refs
  actor.current = key;
  const stamp = user
    ? getInvalidationGeneration({ actorId: user.uid, scope: 'campaign:' + props.scope.campaignId })
    : 0;
  useLayoutEffect(() => {
    if (!user) return;
    return subscribeInvalidation(
      { actorId: user.uid, scope: 'campaign:' + props.scope.campaignId },
      () => setEpoch((n) => n + 1),
    );
  }, [user, props.scope.campaignId]);
  return user ? (
    <Panel
      key={key + ':' + epoch + ':' + stamp}
      {...props}
      uid={user.uid}
      isActive={() =>
        actor.current === key &&
        props.isActive() &&
        getInvalidationGeneration({
          actorId: user.uid,
          scope: 'campaign:' + props.scope.campaignId,
        }) === stamp
      }
    />
  ) : null;
}
function Panel({
  scope,
  isActive,
  readOnly,
  uid,
}: CampaignSessionReferencesPanelProps & { uid: string }) {
  const [kind, setKind] = useState<'lore' | 'scene'>('lore'),
    [sceneSelection, setSceneSelection] = useState<{
      sceneKey: string;
      scope: SessionSceneReadScope;
      gate: number;
    } | null>(null),
    [rows, setRows] = useState<AnySessionReferenceRow[]>([]),
    [context, setContext] = useState<SessionReferenceSourceContext | null>(null),
    [cursor, setCursor] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [picker, setPicker] = useState(false),
    [selected, setSelected] = useState<AnySessionReferenceRow | null>(null),
    [material, setMaterial] = useState<SessionLoreMaterial | null>(null),
    [reading, setReading] = useState(false),
    [removing, setRemoving] = useState<PendingSessionReference | null>(null),
    [stale, setStale] = useState(false);
  const area = useRef(kind);
  // Invalidate old area continuations during the render that changes the selection.
  // eslint-disable-next-line react-hooks/refs
  area.current = kind;
  const alive = useRef(true),
    latest = useRef({ isActive, readOnly }),
    owner = useRef(0),
    readOwner = useRef(0),
    access = useRef(0),
    seen = useRef(new Set<string>()),
    observed = useRef<{ context: SessionReferenceSourceContext | null; revision: number } | null>(
      null,
    ),
    refresh = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    latest.current = { isActive, readOnly };
  });
  useLayoutEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const active = () => alive.current && latest.current.isActive();
  function invalidate(cause?: unknown) {
    access.current++;
    readOwner.current++;
    setRows([]);
    setCursor(null);
    setContext(null);
    setMaterial(null);
    setSelected(null);
    setSceneSelection(null);
    setPicker(false);
    setRemoving(null);
    setStale(true);
    setReading(false);
    setLoading(false);
    if (cause) setError(api.message(cause));
  }
  function reject(cause: unknown) {
    invalidate(cause);
    if (api.deletedCampaignError(cause, scope.campaignId))
      publishInvalidation({ actorId: uid, scope: 'campaign:' + scope.campaignId });
  }
  function observe(value: {
    sourceContext: SessionReferenceSourceContext | null;
    referenceCollectionRevision: number;
  }) {
    const old = observed.current;
    if (old && value.referenceCollectionRevision < old.revision)
      throw new Error('A resposta pertence a uma revisão anterior dos vínculos.');
    if (
      old &&
      (old.revision !== value.referenceCollectionRevision ||
        api.canonical(old.context) !== api.canonical(value.sourceContext))
    )
      invalidate();
    observed.current = {
      context: value.sourceContext,
      revision: value.referenceCollectionRevision,
    };
  }
  const op = useSessionReferenceOperation({
    uid,
    campaignId: scope.campaignId,
    isActive: active,
    onConfirmed: () => {
      invalidate();
      refresh.current?.focus();
    },
    onUnavailable: () => invalidate(),
  });
  const locked = readOnly || op.busy || !!op.pending || op.blocked || !op.locksAvailable;
  async function load(next?: string) {
    if (!next) invalidate();
    const own = ++owner.current,
      gate = access.current;
    setLoading(true);
    try {
      const page = await api.listCampaignSessionReferences({
        ...scope,
        view: 'references',
        ...(kind === 'scene' ? { kind: 'scene' as const } : {}),
        ...(next ? { cursor: next } : {}),
        limit: 25,
      });
      if (!active() || owner.current !== own || gate !== access.current) return;
      api.validatePage(page, uid, scope, 'references', kind);
      if (page.view !== 'references') api.fail();
      const previous = observed.current;
      observe(page);
      if (
        next &&
        (!previous ||
          previous.revision !== page.referenceCollectionRevision ||
          api.canonical(previous.context) !== api.canonical(page.sourceContext))
      )
        throw new Error('Os vínculos ou o acesso mudaram. Consulte novamente.');
      if (page.nextCursor && next && seen.current.has(page.nextCursor)) api.fail();
      if (!next) seen.current.clear();
      if (page.nextCursor) seen.current.add(page.nextCursor);
      setRows((old) =>
        next
          ? [...old, ...page.items.filter((item) => !old.some((row) => row.id === item.id))]
          : page.items,
      );
      setCursor(page.nextCursor);
      setContext(page.sourceContext);
      setStale(false);
      setError('');
    } catch (cause) {
      if (active() && owner.current === own) reject(cause);
    } finally {
      if (active() && owner.current === own) setLoading(false);
    }
  }
  useEffect(() => {
    let current = true;
    queueMicrotask(() => {
      if (current) void load();
    });
    const focus = () => {
      if (active()) void load();
    };
    window.addEventListener('focus', focus);
    return () => {
      current = false;
      window.removeEventListener('focus', focus);
    };
  }, [scope.campaignId, scope.campaignToken, scope.sessionId, scope.expectedSessionRevision, kind]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(
    () =>
      store.subscribeSessionReferences(uid, scope.campaignId, () => {
        if (active()) invalidate();
      }),
    [uid, scope.campaignId],
  );
  async function candidates(next?: string): Promise<CampaignLorePickerPage> {
    const expected = observed.current,
      own = access.current;
    if (!expected?.context) throw new Error('Consulte os vínculos antes de escolher uma ficha.');
    const page = await api.listCampaignSessionReferences({
      ...scope,
      view: 'candidates',
      sourceContext: expected.context,
      ...(next ? { cursor: next } : {}),
      limit: 25,
    });
    if (!active() || own !== access.current) throw new Error('Esta seleção foi encerrada.');
    api.validatePage(page, uid, scope, 'candidates');
    if (page.view !== 'candidates') api.fail();
    observe(page);
    if (
      own !== access.current ||
      api.canonical(page.sourceContext) !== api.canonical(expected.context)
    )
      throw new Error('O acesso às fichas mudou. Consulte os vínculos novamente.');
    return {
      items: page.items as SessionLoreCandidate[],
      nextCursor: page.nextCursor,
      projectionToken: page.sourceContext?.projectionToken ?? null,
    };
  }
  async function sceneCandidates(
    archive: SessionSceneArchive,
    next?: string,
  ): Promise<{ items: SessionSceneCandidate[]; nextCursor: string | null }> {
    const expected = observed.current,
      own = access.current;
    if (!expected?.context) throw new Error('Consulte os vínculos antes de escolher uma cena.');
    const page = await api.listCampaignSessionReferences({
      ...scope,
      view: 'candidates',
      kind: 'scene',
      sourceContext: expected.context,
      archive,
      ...(next ? { cursor: next } : {}),
      limit: 25,
    });
    if (!active() || own !== access.current || area.current !== 'scene')
      throw new Error('Esta seleção foi encerrada.');
    api.validatePage(page, uid, scope, 'candidates', 'scene');
    if (page.view !== 'candidates') api.fail();
    observe(page);
    if (
      own !== access.current ||
      api.canonical(page.sourceContext) !== api.canonical(expected.context)
    )
      throw new Error('O acesso às cenas mudou. Consulte novamente.');
    return { items: page.items as SessionSceneCandidate[], nextCursor: page.nextCursor };
  }
  function add(sourceKey: string) {
    const current = observed.current;
    if (locked || !current?.context) return;
    const operationId = crypto.randomUUID();
    setPicker(false);
    void op.execute({
      schemaVersion: 1,
      ownerId: uid,
      intent: 'apply',
      action: 'add',
      request: {
        ...scope,
        referenceId: operationId,
        operationId,
        expectedReferenceCollectionRevision: current.revision,
        sourceContext: current.context,
        target: { kind, sourceKey },
      },
    });
  }
  async function read(row: AnySessionReferenceRow) {
    const current = observed.current;
    if (!row.available || !current?.context) return;
    if (row.target.kind === 'scene') {
      setSceneSelection({
        sceneKey: row.target.sourceKey,
        gate: access.current,
        scope: {
          ...scope,
          referenceId: row.id,
          expectedRevision: row.revision,
          expectedReferenceCollectionRevision: current.revision,
          sourceContext: current.context,
        },
      });
      return;
    }
    const own = ++readOwner.current,
      gate = access.current;
    setSelected(row);
    setMaterial(null);
    setReading(true);
    const input = {
      ...scope,
      referenceId: row.id,
      expectedRevision: row.revision,
      expectedReferenceCollectionRevision: current.revision,
      sourceContext: current.context,
    };
    try {
      const value = await api.readCampaignSessionLoreReference(input);
      if (!active() || own !== readOwner.current || gate !== access.current) return;
      api.validateRead(value, uid, input, row.target.sourceKey);
      observe(value);
      if (gate !== access.current)
        throw new Error('O acesso à ficha mudou. Consulte os vínculos novamente.');
      setMaterial(value.material);
    } catch (cause) {
      if (active() && own === readOwner.current) reject(cause);
    } finally {
      if (active() && own === readOwner.current) setReading(false);
    }
  }
  function remove(row: AnySessionReferenceRow) {
    const current = observed.current;
    if (locked || !current) return;
    setRemoving({
      schemaVersion: 1,
      ownerId: uid,
      intent: 'apply',
      action: 'remove',
      request: {
        ...scope,
        referenceId: row.id,
        operationId: crypto.randomUUID(),
        expectedRevision: row.revision,
        expectedReferenceCollectionRevision: current.revision,
      },
    });
  }
  return (
    <section className={styles.panel} aria-label="Referências da sessão">
      <Dropdown
        mode="select"
        label="Material da sessão"
        value={kind}
        options={[
          { value: 'lore', label: 'Fichas' },
          { value: 'scene', label: 'Cenas' },
        ]}
        onValueChange={(value) => {
          if (value === kind) return;
          owner.current++;
          invalidate();
          setError('');
          setKind(value as 'lore' | 'scene');
        }}
      />
      <h3>{kind === 'lore' ? 'Fichas desta sessão' : 'Cenas desta sessão'}</h3>

      <div className={styles.actions}>
        <Button ref={refresh} variant="outline" onClick={() => void load()}>
          Consultar vínculos
        </Button>
        {context && (
          <Button disabled={locked || stale} onClick={() => setPicker(true)}>
            {kind === 'lore' ? 'Vincular ficha' : 'Vincular cena'}
          </Button>
        )}
        {cursor && (
          <Button variant="outline" disabled={loading} onClick={() => void load(cursor)}>
            Carregar mais vínculos
          </Button>
        )}
      </div>
      <ReferenceRecoveryActions op={op} />
      {error && <Alert variant="warning">{error}</Alert>}
      {loading && <LoadingState label="Consultando vínculos da sessão..." />}
      {!loading && !rows.length && !error && (
        <p>
          {cursor
            ? 'Esta janela está vazia; há mais vínculos para consultar.'
            : stale
              ? 'Consulte os vínculos atuais para continuar.'
              : kind === 'lore'
                ? 'Nenhuma ficha vinculada à sessão.'
                : 'Nenhuma cena vinculada à sessão.'}
        </p>
      )}
      {!context && !loading && !error && (
        <p>
          O material da aventura não está disponível nesta consulta. Sua preparação própria continua
          acessível.
        </p>
      )}
      <ul className={styles.list}>
        {rows.map((row, index) => (
          <li key={row.id}>
            <p>
              {row.available
                ? row.target.kind === 'lore'
                  ? row.target.name
                  : row.target.title
                : 'Material indisponível'}{' '}
              {row.available && row.target.kind === 'lore' && row.target.legacy && (
                <Badge variant="outline">Legado da mesa</Badge>
              )}
              {row.available && row.target.kind === 'scene' && row.target.archived && (
                <Badge variant="outline">Arquivo da cena</Badge>
              )}
            </p>
            <div className={styles.actions}>
              {row.available && (
                <Button
                  variant="outline"
                  onClick={() => void read(row)}
                  aria-label={
                    (row.target.kind === 'lore' ? 'Ler ficha ' : 'Ler cena ') +
                    (row.target.kind === 'lore' ? row.target.name : row.target.title)
                  }
                >
                  {row.target.kind === 'lore' ? 'Ler ficha' : 'Ler cena'}
                </Button>
              )}
              <Button
                variant="outline"
                disabled={locked || stale}
                onClick={() => remove(row)}
                aria-label={
                  'Remover vínculo ' +
                  (row.available
                    ? row.target.kind === 'lore'
                      ? row.target.name
                      : row.target.title
                    : String(index + 1))
                }
              >
                Remover vínculo
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {context && kind === 'lore' && (
        <CampaignLorePicker
          open={picker}
          identity={api.canonical([uid, scope, context])}
          projectionToken={context.projectionToken}
          isActive={active}
          disabled={locked}
          loadPage={candidates}
          onSelect={add}
          onClose={() => setPicker(false)}
          onInvalidated={reject}
        />
      )}
      {context && picker && kind === 'scene' && (
        <SessionScenePicker
          active={active}
          disabled={locked}
          load={sceneCandidates}
          onSelect={add}
          onClose={() => setPicker(false)}
          onError={reject}
        />
      )}
      {sceneSelection && (
        <SessionSceneReader
          key={api.canonical(sceneSelection)}
          uid={uid}
          scope={sceneSelection.scope}
          sceneKey={sceneSelection.sceneKey}
          active={() =>
            active() && area.current === 'scene' && access.current === sceneSelection.gate
          }
          observe={observe}
          onError={reject}
          onClose={() => setSceneSelection(null)}
        />
      )}
      <Dialog
        open={selected !== null}
        onClose={() => {
          readOwner.current++;
          setSelected(null);
          setMaterial(null);
          setReading(false);
        }}
        title="Ficha vinculada à sessão"
        description="Leitura privada do material autorizado para esta sessão."
        footer={
          <Button
            variant="outline"
            onClick={() => {
              readOwner.current++;
              setSelected(null);
              setMaterial(null);
              setReading(false);
            }}
          >
            Fechar ficha vinculada
          </Button>
        }
      >
        {reading ? (
          <LoadingState label="Conferindo ficha vinculada..." />
        ) : material ? (
          <CampaignLoreDisplay item={material} />
        ) : (
          <p>Material indisponível nesta consulta.</p>
        )}
      </Dialog>
      <Dialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title="Remover vínculo da sessão?"
        description="Esta ação remove somente o vínculo; o material de origem e o texto autoral permanecem."
        footer={
          <>
            <Button variant="outline" onClick={() => setRemoving(null)}>
              Manter vínculo
            </Button>
            <Button
              disabled={locked}
              onClick={() => {
                const value = removing;
                setRemoving(null);
                if (value) void op.execute(value);
              }}
            >
              Confirmar remoção do vínculo
            </Button>
          </>
        }
      >
        A confirmação usa a revisão que você consultou.
      </Dialog>
    </section>
  );
}
