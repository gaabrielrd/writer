import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Link2, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/features/auth';
import { subscribeInvalidation } from '@/shared/services';
import {
  Alert,
  Badge,
  Button,
  Card,
  Dialog,
  Dropdown,
  EmptyState,
  LoadingState,
} from '@/shared/ui';
import type {
  CampaignPreparationPanelProps,
  CampaignPreparationSessionContext,
  PreparationItemSummary,
  PreparationLinkSummary,
  PreparationItem,
  PreparationKind,
  PreparationView,
  PreparationRequest,
  PendingCampaignPreparation,
  PreparationOutcome,
} from '../model/campaignPreparation';
import { clueStatusLabels, questStatusLabels, emptyItem } from '../model/campaignPreparation';
import * as api from '../services/campaignPreparationService';
import { readPendingCampaignPreparation } from '../services/campaignPreparationRecovery';
import { useCampaignPreparationOperation } from '../hooks/useCampaignPreparationOperation';
import { PreparationEditor, type PreparationForm } from './PreparationEditor';
import styles from './Preparation.module.css';
const fieldsFromRequest = (v: import('../model/campaignPreparation').SavePreparationItemInput) => ({
  kind: v.kind,
  title: v.title,
  status: v.status,
  body: v.body,
});
const fields = (v: PreparationItem) => ({
  kind: v.kind,
  title: v.title,
  status: v.status,
  body: v.body,
});
const statusLabel = (v: PreparationItemSummary) =>
  v.kind === 'clue'
    ? clueStatusLabels[v.status as keyof typeof clueStatusLabels]
    : questStatusLabels[v.status as keyof typeof questStatusLabels];
export function CampaignPreparationPanel(props: CampaignPreparationPanelProps) {
  const { user } = useAuth(),
    actor = useRef('');
  const key = JSON.stringify([user?.uid, props.campaignId]);
  // The current render closes old actor continuations before effect cleanup.
  // eslint-disable-next-line react-hooks/refs
  actor.current = key;
  return user ? (
    <PreparationHost
      key={key}
      {...props}
      uid={user.uid}
      isActorCurrent={() => actor.current === key}
    />
  ) : null;
}
function PreparationHost({
  campaignId,
  uid,
  openRequest,
  onPendingChange,
  isActorCurrent,
}: CampaignPreparationPanelProps & { uid: string; isActorCurrent: () => boolean }) {
  const [initial] = useState(() => {
    try {
      return readPendingCampaignPreparation(uid, campaignId);
    } catch {
      return null;
    }
  });
  const [open, setOpen] = useState(false),
    [revoked, setRevoked] = useState(false),
    [kind, setKind] = useState<PreparationKind>('clue'),
    [view, setView] = useState<PreparationView>('all'),
    [items, setItems] = useState<PreparationItemSummary[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [loading, setLoading] = useState(false),
    [reading, setReading] = useState(false),
    [error, setError] = useState(''),
    [stale, setStale] = useState(false),
    [notice, setNotice] = useState(''),
    [form, setForm] = useState<PreparationForm | null>(() => {
      if (initial?.action !== 'save-item') return null;
      const request = initial.request;
      return {
        item: {
          ...emptyItem(request.kind, request.itemId),
          ...fieldsFromRequest(request),
          revision: request.expectedRevision,
        } as PreparationItem,
        saved: '',
        baseCollectionRevision: request.expectedItemCollectionRevision,
        stale: true,
      };
    }),
    [queued, setQueued] = useState<PreparationItemSummary | PreparationKind | null>(null),
    [deleting, setDeleting] = useState<PreparationItemSummary | null>(null),
    [session, setSession] = useState<CampaignPreparationSessionContext | null>(null),
    [links, setLinks] = useState<PreparationLinkSummary[]>([]),
    [linkCursor, setLinkCursor] = useState<string | null>(null),
    [linkLoading, setLinkLoading] = useState(false),
    [linkError, setLinkError] = useState(''),
    [linksStale, setLinksStale] = useState(false);
  const alive = useRef(true),
    latestActor = useRef(isActorCurrent),
    token = useRef(initial?.request.campaignToken),
    itemRevision = useRef(0),
    pageRevision = useRef<number | null>(null),
    linkRevision = useRef(0),
    linkPageRevision = useRef<{ items: number; links: number } | null>(null),
    listOwner = useRef(0),
    readOwner = useRef(0),
    linkOwner = useRef(0),
    formRef = useRef(form),
    sessionRef = useRef(session),
    query = useRef(''),
    seen = useRef(new Set<string>()),
    seenLinks = useRef(new Set<string>()),
    revokedRef = useRef(false);
  // eslint-disable-next-line react-hooks/refs
  query.current = kind + ':' + view;
  useLayoutEffect(() => {
    latestActor.current = isActorCurrent;
    formRef.current = form;
    sessionRef.current = session;
  });
  useLayoutEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const active = () => alive.current && latestActor.current();
  function hide() {
    revokedRef.current = true;
    listOwner.current++;
    readOwner.current++;
    linkOwner.current++;
    setRevoked(true);
    setForm(null);
    setItems([]);
    setLinks([]);
    setOpen(false);
    setQueued(null);
    setDeleting(null);
    setReading(false);
    setLoading(false);
    setLinkLoading(false);
  }
  useLayoutEffect(
    () => subscribeInvalidation({ actorId: uid, scope: 'campaign:' + campaignId }, hide),
    [uid, campaignId],
  );
  function unavailable(cause: unknown) {
    if (api.deletedCampaignError(cause, campaignId)) {
      hide();
      return true;
    }
    return false;
  }
  function confirmed(_outcome: PreparationOutcome, operation: PendingCampaignPreparation) {
    listOwner.current++;
    linkOwner.current++;
    readOwner.current++;
    setLoading(false);
    setLinkLoading(false);
    setReading(false);
    if (_outcome.kind === 'confirmed') {
      if ('itemCollectionRevision' in _outcome.receipt)
        itemRevision.current = Math.max(
          itemRevision.current,
          _outcome.receipt.itemCollectionRevision,
        );
      else if (sessionRef.current?.sessionId === _outcome.receipt.sessionId)
        linkRevision.current = Math.max(
          linkRevision.current,
          _outcome.receipt.linkCollectionRevision,
        );
    }
    setItems([]);
    setCursor(null);
    setStale(true);
    setLinks([]);
    setLinkCursor(null);
    setLinksStale(true);
    pageRevision.current = null;
    linkPageRevision.current = null;
    if (
      (operation.action === 'save-item' ||
        operation.action === 'delete-item' ||
        operation.action === 'move-item') &&
      formRef.current?.item.id === operation.request.itemId
    )
      setForm((current) => (current ? { ...current, stale: true } : null));
  }
  const op = useCampaignPreparationOperation({
    uid,
    campaignId,
    isActive: active,
    onConfirmed: confirmed,
    onUnavailable: hide,
  });
  const dirty = !!form && api.canonical(fields(form.item)) !== form.saved;
  const locked = op.busy || !!op.pending || op.blocked || revoked;
  useEffect(() => {
    onPendingChange?.(dirty || op.busy || !!op.pending || op.blocked);
    return () => onPendingChange?.(false);
  }, [dirty, op.busy, op.pending, op.blocked, onPendingChange]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  useEffect(() => {
    if (
      !openRequest ||
      openRequest.session.campaignId !== campaignId ||
      !active() ||
      revokedRef.current
    )
      return;
    setSession(openRequest.session);
    setView(openRequest.view);
    setOpen(true);
    setLinkError('');
    setLinks([]);
    setLinkCursor(null);
    linkRevision.current = 0;
    linkPageRevision.current = null;
    linkOwner.current++;
  }, [openRequest?.requestId, campaignId]); // eslint-disable-line react-hooks/exhaustive-deps
  function observeItems(revision: number) {
    if (revision < itemRevision.current) api.fail('A revisão da preparação ficou desatualizada.');
    itemRevision.current = revision;
  }
  async function loadItems(append = false) {
    if (!active() || revokedRef.current) return;
    const own = ++listOwner.current,
      signature = kind + ':' + view,
      input = {
        campaignId,
        ...(token.current ? { campaignToken: token.current } : {}),
        kind,
        view,
        ...(append && cursor ? { cursor } : {}),
      };
    setLoading(true);
    setError('');
    if (!append) {
      setItems([]);
      setCursor(null);
      seen.current = new Set();
      pageRevision.current = null;
    }
    try {
      const value = await api.listCampaignPreparationItems(input);
      if (
        !active() ||
        revokedRef.current ||
        own !== listOwner.current ||
        query.current !== signature
      )
        return;
      api.validateItemPage(value, uid, input, itemRevision.current);
      if (append && pageRevision.current !== value.itemCollectionRevision)
        api.fail('A lista mudou. Atualize antes de continuar a paginação.');
      observeItems(value.itemCollectionRevision);
      token.current = value.campaignToken;
      for (const item of value.items) {
        if (seen.current.has(item.id)) api.fail('A paginação repetiu um item.');
        seen.current.add(item.id);
      }
      pageRevision.current = value.itemCollectionRevision;
      setItems((prior) => (append ? [...prior, ...value.items] : value.items));
      setCursor(value.nextCursor);
      setStale(false);
      const current = formRef.current;
      if (current) {
        const found = value.items.find((i) => i.id === current.item.id);
        if (found && found.revision !== current.item.revision)
          setForm((previous) => (previous ? { ...previous, stale: true } : null));
      }
    } catch (cause) {
      if (active() && own === listOwner.current) {
        if (!unavailable(cause)) {
          setItems([]);
          setCursor(null);
          setStale(true);
          setError(api.message(cause));
        }
      }
    } finally {
      if (active() && own === listOwner.current) setLoading(false);
    }
  }
  useEffect(() => {
    // Initial/filter reads synchronize the remote catalog without replacing the editor.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadItems();
  }, [kind, view]); // eslint-disable-line react-hooks/exhaustive-deps
  async function selectItem(item: PreparationItemSummary | PreparationKind, discard = false) {
    if (locked || reading || !active()) return;
    const current = formRef.current;
    if (
      current &&
      !discard &&
      (api.canonical(fields(current.item)) !== current.saved || current.stale)
    ) {
      setQueued(item);
      return;
    }
    setQueued(null);
    const own = ++readOwner.current;
    if (typeof item === 'string') {
      const next = emptyItem(item, api.newOperationId());
      setForm({
        item: next,
        saved: api.canonical(fields(next)),
        baseCollectionRevision: itemRevision.current,
        stale: false,
      });
      return;
    }
    if (!token.current) return;
    setReading(true);
    setError('');
    const input = {
      campaignId,
      campaignToken: token.current,
      itemId: item.id,
      expectedRevision: item.revision,
    };
    try {
      const value = await api.getCampaignPreparationItem(input);
      if (!active() || revokedRef.current || own !== readOwner.current) return;
      api.validateItemResult(value, uid, input, itemRevision.current);
      observeItems(value.itemCollectionRevision);
      setForm({
        item: value.item,
        saved: api.canonical(fields(value.item)),
        baseCollectionRevision: value.itemCollectionRevision,
        stale: false,
      });
    } catch (cause) {
      if (active() && own === readOwner.current && !unavailable(cause))
        setError(api.message(cause));
    } finally {
      if (active() && own === readOwner.current) setReading(false);
    }
  }
  function execute(request: PreparationRequest) {
    if (!locked && !op.isReserved() && active()) void op.execute(request);
  }
  function save() {
    const current = formRef.current;
    if (!current || current.stale || !token.current || api.fieldsError(current.item) || locked)
      return;
    const item = current.item,
      operationId = item.revision === 0 ? item.id : api.newOperationId();
    execute({
      action: 'save-item',
      request: {
        campaignId,
        campaignToken: token.current,
        operationId,
        itemId: item.id,
        expectedRevision: item.revision,
        expectedItemCollectionRevision: current.baseCollectionRevision,
        ...fields(item),
        title: item.title.trim(),
      } as import('../model/campaignPreparation').SavePreparationItemInput,
    });
  }
  function itemAction(
    item: PreparationItemSummary,
    action: 'delete-item' | 'move-item',
    direction?: 'up' | 'down',
  ) {
    if (!token.current || stale || locked) return;
    const request = {
      campaignId,
      campaignToken: token.current,
      operationId: api.newOperationId(),
      itemId: item.id,
      expectedRevision: item.revision,
      expectedItemCollectionRevision: itemRevision.current,
    };
    if (action === 'delete-item') {
      execute({ action, request });
      setDeleting(null);
    } else if (direction && view === 'all') execute({ action, request: { ...request, direction } });
  }
  const sessionActive = () => {
    const s = sessionRef.current;
    return (
      !!s &&
      s.campaignId === campaignId &&
      s.campaignToken === token.current &&
      s.isActive() &&
      !s.readOnly &&
      !revokedRef.current
    );
  };
  async function loadLinks(append = false) {
    const selected = sessionRef.current;
    if (!selected || !selected.isActive() || revokedRef.current) {
      setLinkError('Reabra uma sessão salva para consultar seus vínculos.');
      return;
    }
    const own = ++linkOwner.current,
      input = {
        campaignId,
        campaignToken: selected.campaignToken,
        sessionId: selected.sessionId,
        expectedSessionRevision: selected.expectedSessionRevision,
        ...(append && linkCursor ? { cursor: linkCursor } : {}),
      };
    setLinkLoading(true);
    setLinkError('');
    if (!append) {
      setLinks([]);
      setLinkCursor(null);
      seenLinks.current = new Set();
      linkPageRevision.current = null;
    }
    try {
      const value = await api.listCampaignSessionPreparationLinks(input);
      if (
        !active() ||
        revokedRef.current ||
        own !== linkOwner.current ||
        sessionRef.current !== selected ||
        !selected.isActive()
      )
        return;
      api.validateLinkPage(value, uid, input, itemRevision.current, linkRevision.current);
      if (
        append &&
        (linkPageRevision.current?.items !== value.itemCollectionRevision ||
          linkPageRevision.current.links !== value.linkCollectionRevision)
      )
        api.fail('Os itens ou vínculos mudaram. Atualize a lista.');
      observeItems(value.itemCollectionRevision);
      token.current = value.campaignToken;
      linkRevision.current = value.linkCollectionRevision;
      linkPageRevision.current = {
        items: value.itemCollectionRevision,
        links: value.linkCollectionRevision,
      };
      for (const row of value.items) {
        if (seenLinks.current.has(row.id)) api.fail();
        seenLinks.current.add(row.id);
      }
      setLinks((previous) => (append ? [...previous, ...value.items] : value.items));
      setLinkCursor(value.nextCursor);
      setLinksStale(false);
    } catch (cause) {
      if (active() && own === linkOwner.current && !unavailable(cause)) {
        setLinks([]);
        setLinkCursor(null);
        setLinksStale(true);
        setLinkError(api.message(cause));
      }
    } finally {
      if (active() && own === linkOwner.current) setLinkLoading(false);
    }
  }
  useEffect(() => {
    // The saved session context drives a separate metadata read.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (session) void loadLinks();
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps
  function addLink(item: PreparationItemSummary) {
    const s = sessionRef.current;
    if (!s || !sessionActive() || linksStale || linkLoading || locked || stale) return;
    const operationId = api.newOperationId();
    execute({
      action: 'add-link',
      request: {
        campaignId,
        campaignToken: s.campaignToken,
        sessionId: s.sessionId,
        expectedSessionRevision: s.expectedSessionRevision,
        operationId,
        linkId: operationId,
        expectedRevision: 0,
        expectedLinkCollectionRevision: linkRevision.current,
        itemId: item.id,
        expectedItemRevision: item.revision,
      },
    });
  }
  function linkAction(
    row: PreparationLinkSummary,
    action: 'remove-link' | 'move-link',
    direction?: 'up' | 'down',
  ) {
    const s = sessionRef.current;
    if (!s || !sessionActive() || linksStale || locked) return;
    const request = {
      campaignId,
      campaignToken: s.campaignToken,
      sessionId: s.sessionId,
      expectedSessionRevision: s.expectedSessionRevision,
      operationId: api.newOperationId(),
      linkId: row.id,
      expectedRevision: row.revision,
      expectedLinkCollectionRevision: linkRevision.current,
    };
    if (action === 'remove-link') execute({ action, request });
    else if (direction) execute({ action, request: { ...request, direction } });
  }
  const renderSession = () =>
    session ? (
      <section aria-label="Itens vinculados à sessão" className={styles.content}>
        <h3>Itens desta sessão</h3>
        <p>Os vínculos mostram o texto e estado atuais dos itens da campanha.</p>
        <Button
          variant="outline"
          disabled={linkLoading || session.readOnly}
          onClick={() => void loadLinks()}
        >
          Atualizar vínculos
        </Button>
        {linkError && <Alert variant="warning">{linkError}</Alert>}
        {linksStale && <p>Atualize os vínculos antes de outra alteração.</p>}
        {linkLoading && <LoadingState label="Carregando vínculos..." />}
        {!linkLoading && !links.length && !linkError && <p>Nenhum item vinculado nesta página.</p>}
        <ol className={styles.list}>
          {links.map((row, index) => (
            <li key={row.id} className={styles.row}>
              <h4 className={styles.heading}>
                {row.available ? row.target.title : 'Item indisponível'}
              </h4>
              {row.available ? (
                <Badge variant="outline">{statusLabel(row.target)}</Badge>
              ) : (
                <p>O item foi excluído. Você pode remover este vínculo.</p>
              )}
              <div className={styles.actions}>
                {row.available && (
                  <Button
                    variant="outline"
                    disabled={locked || reading}
                    onClick={() => void selectItem(row.target)}
                  >
                    Consultar item
                  </Button>
                )}
                <Button
                  variant="outline"
                  disabled={locked || linksStale || session.readOnly || index === 0}
                  aria-label={
                    'Subir vínculo ' + (row.available ? row.target.title : 'indisponível')
                  }
                  onClick={() => linkAction(row, 'move-link', 'up')}
                >
                  <ArrowUp className="icon icon-sm" />
                  Subir
                </Button>
                <Button
                  variant="outline"
                  disabled={
                    locked ||
                    linksStale ||
                    session.readOnly ||
                    (index === links.length - 1 && !linkCursor)
                  }
                  aria-label={
                    'Descer vínculo ' + (row.available ? row.target.title : 'indisponível')
                  }
                  onClick={() => linkAction(row, 'move-link', 'down')}
                >
                  <ArrowDown className="icon icon-sm" />
                  Descer
                </Button>
                <Button
                  variant="outline"
                  disabled={locked || linksStale || session.readOnly}
                  onClick={() => linkAction(row, 'remove-link')}
                >
                  <Trash2 className="icon icon-sm" />
                  Remover vínculo
                </Button>
              </div>
            </li>
          ))}
        </ol>
        {linkCursor && (
          <Button variant="outline" disabled={linkLoading} onClick={() => void loadLinks(true)}>
            Mais vínculos
          </Button>
        )}
      </section>
    ) : (
      <p>Abra uma sessão salva e escolha Pistas e missões para vincular ou retomar itens.</p>
    );
  const recovery = (
    <>
      {op.notice && <Alert>{op.notice}</Alert>}
      {op.error && <Alert variant="warning">{op.error}</Alert>}
      {op.blocked && (
        <Alert variant="warning">
          O controle preservado não pôde ser lido. Novas alterações estão bloqueadas.
        </Alert>
      )}
      {op.pending && (
        <Alert variant="warning">
          Há um pedido de preparação aguardando confirmação. Nenhuma outra alteração será enviada.
          <div className={styles.actions}>
            <Button variant="outline" disabled={op.busy} onClick={() => void op.recover()}>
              {op.pending.intent === 'cancel'
                ? 'Confirmar encerramento'
                : 'Confirmar pedido preservado'}
            </Button>
            <Button variant="outline" disabled={op.busy} onClick={() => void op.cancel()}>
              Encerrar pedido sem executar
            </Button>
          </div>
        </Alert>
      )}
    </>
  );
  return (
    <Card className={styles.panel}>
      <h2>Pistas e missões</h2>
      <p>Preparação privada da campanha. Condições, destinatários e consequências são anotações.</p>
      {!open && recovery}
      {!op.locksAvailable && (
        <Alert variant="warning">
          A leitura continua disponível. Este navegador não oferece reserva segura para salvar
          alterações.
        </Alert>
      )}
      {revoked ? (
        <Alert variant="warning">
          A campanha foi excluída ou está em exclusão. Os controles foram preservados para
          encerramento explícito.
        </Alert>
      ) : (
        <Button variant="outline" onClick={() => setOpen(true)}>
          Abrir pistas e missões
        </Button>
      )}
      <Dialog
        open={open && !revoked}
        onClose={() => setOpen(false)}
        title="Pistas e missões da campanha"
        description="Itens particulares reutilizados por vínculos às sessões. O salvamento é manual."
        className={styles.dialog}
        footer={
          <Button variant="outline" onClick={() => setOpen(false)}>
            Fechar e manter preparação
          </Button>
        }
      >
        <div className={styles.content}>
          {open && recovery}
          <div className={styles.filters}>
            <Dropdown
              mode="select"
              label="Tipo de item"
              value={kind}
              options={[
                { value: 'clue', label: 'Pistas' },
                { value: 'quest', label: 'Missões' },
              ]}
              onValueChange={(v) => setKind(v as PreparationKind)}
            />
            <Dropdown
              mode="select"
              label="Mostrar itens"
              value={view}
              options={[
                { value: 'all', label: 'Todos' },
                { value: 'pending', label: 'Pendentes' },
              ]}
              onValueChange={(v) => setView(v as PreparationView)}
            />
          </div>
          <div className={styles.actions}>
            <Button disabled={locked || !op.locksAvailable} onClick={() => void selectItem(kind)}>
              <Plus className="icon icon-sm" />
              {kind === 'clue' ? 'Nova pista' : 'Nova missão'}
            </Button>
            <Button variant="outline" disabled={loading} onClick={() => void loadItems()}>
              Atualizar itens
            </Button>
          </div>
          {error && <Alert variant="warning">{error}</Alert>}
          {notice && <Alert>{notice}</Alert>}
          {stale && <p>Atualize os itens antes de outra alteração.</p>}
          {loading && <LoadingState label="Carregando itens..." />}
          {reading && <LoadingState label="Consultando item..." />}
          {!loading && !items.length && !error && (
            <EmptyState
              title="Nenhum item nesta lista"
              description="Crie uma pista ou missão, ou altere o filtro."
            />
          )}
          <ol className={styles.list}>
            {items.map((item, index) => (
              <li key={item.id} className={styles.row}>
                <h3 className={styles.heading}>{item.title}</h3>
                <Badge variant="outline">{statusLabel(item)}</Badge>
                <div className={styles.actions}>
                  <Button
                    variant="outline"
                    disabled={locked || reading}
                    onClick={() => void selectItem(item)}
                  >
                    Consultar item
                  </Button>
                  {session && (
                    <Button
                      variant="outline"
                      disabled={locked || stale || linksStale || linkLoading || session.readOnly}
                      onClick={() => addLink(item)}
                    >
                      <Link2 className="icon icon-sm" />
                      Vincular a esta sessão
                    </Button>
                  )}
                  {view === 'all' && (
                    <>
                      <Button
                        variant="outline"
                        disabled={locked || stale || index === 0}
                        aria-label={'Subir item ' + item.title}
                        onClick={() => itemAction(item, 'move-item', 'up')}
                      >
                        <ArrowUp className="icon icon-sm" />
                        Subir
                      </Button>
                      <Button
                        variant="outline"
                        disabled={locked || stale || (index === items.length - 1 && !cursor)}
                        aria-label={'Descer item ' + item.title}
                        onClick={() => itemAction(item, 'move-item', 'down')}
                      >
                        <ArrowDown className="icon icon-sm" />
                        Descer
                      </Button>
                    </>
                  )}
                  <Button
                    variant="outline"
                    disabled={locked || stale}
                    onClick={() => setDeleting(item)}
                  >
                    <Trash2 className="icon icon-sm" />
                    Excluir item
                  </Button>
                </div>
              </li>
            ))}
          </ol>
          {cursor && (
            <Button variant="outline" disabled={loading} onClick={() => void loadItems(true)}>
              Mais itens
            </Button>
          )}
          {queued && (
            <Alert variant="warning">
              O rascunho atual será descartado para consultar outro item.
              <div className={styles.actions}>
                <Button variant="outline" onClick={() => setQueued(null)}>
                  Manter rascunho atual
                </Button>
                <Button
                  variant="destructive"
                  disabled={locked}
                  onClick={() => void selectItem(queued, true)}
                >
                  Descartar e continuar
                </Button>
              </div>
            </Alert>
          )}
          {deleting && (
            <Alert variant="warning">
              Excluir {deleting.title} remove seu texto da campanha e deixa os vínculos
              indisponíveis.
              <div className={styles.actions}>
                <Button variant="outline" onClick={() => setDeleting(null)}>
                  Manter item
                </Button>
                <Button
                  variant="destructive"
                  disabled={locked}
                  onClick={() => itemAction(deleting, 'delete-item')}
                >
                  Confirmar exclusão do item
                </Button>
              </div>
            </Alert>
          )}
          {form && (
            <PreparationEditor
              form={form}
              locked={locked || reading || !op.locksAvailable}
              onChange={(item) => {
                const current = formRef.current;
                if (!current) return;
                readOwner.current++;
                setReading(false);
                const next = { ...current, item };
                formRef.current = next;
                setForm(next);
              }}
              onSave={save}
              onDiscard={() => {
                readOwner.current++;
                formRef.current = null;
                setForm(null);
                setQueued(null);
                setNotice('Rascunho descartado por sua escolha.');
              }}
            />
          )}
          {renderSession()}
        </div>
      </Dialog>
    </Card>
  );
}
