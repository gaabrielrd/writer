import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/features/auth';
import {
  getInvalidationGeneration,
  publishInvalidation,
  subscribeInvalidation,
} from '@/shared/services';
import {
  Alert,
  Badge,
  Button,
  Card,
  Dialog,
  Dropdown,
  Input,
  LoadingState,
  Textarea,
} from '@/shared/ui';
import {
  campaignSessionStatusLabels,
  type CampaignSession,
  type CampaignSessionEnvelope,
  type CampaignSessionMutation,
  type CampaignSessionSummary,
  type CampaignSessionStatus,
  type PendingCampaignSession,
} from '../model/campaignSession';
import * as api from '../services/campaignSessionService';
import { readPendingCampaignSession } from '../services/campaignSessionRecovery';
import { useCampaignSessionOperation } from '../hooks/useCampaignSessionOperation';
import styles from './CampaignSessions.module.css';
export interface CampaignSessionsPanelProps {
  campaignId: string;
  onPendingChange?: (pending: boolean) => void;
  renderReferences?: (context: CampaignSessionReferenceSlot) => ReactNode;
}
export interface CampaignSessionReferenceSlot {
  campaignId: string;
  campaignToken: string;
  sessionId: string;
  sessionRevision: number;
  isActive: () => boolean;
  readOnly: boolean;
}
interface Form {
  id: string;
  revision: number;
  title: string;
  summary: string;
  scheduledDate: string | null;
  status: CampaignSessionStatus;
  saved: string;
  open: boolean;
  stale: boolean;
}
const fields = (value: {
  title: string;
  summary: string;
  scheduledDate: string | null;
  status: CampaignSessionStatus;
}) => ({
  title: value.title,
  summary: value.summary,
  scheduledDate: value.scheduledDate,
  status: value.status,
});
const savedForm = (value: CampaignSession): Form => ({
  ...fields(value),
  id: value.id,
  revision: value.revision,
  saved: api.canonical(fields(value)),
  open: true,
  stale: false,
});
export function CampaignSessionsPanel(props: CampaignSessionsPanelProps) {
  const { user } = useAuth(),
    [generation, setGeneration] = useState(0),
    [revoked, setRevoked] = useState<string | null>(null),
    actor = useRef('');
  const uid = user?.uid,
    key = JSON.stringify([uid, props.campaignId]);
  // Render-time identity prevents old continuations before effect cleanup.
  // eslint-disable-next-line react-hooks/refs
  actor.current = key;
  const stamp = uid
    ? getInvalidationGeneration({ actorId: uid, scope: 'campaign:' + props.campaignId })
    : 0;
  useLayoutEffect(() => {
    if (!uid) return;
    return subscribeInvalidation({ actorId: uid, scope: 'campaign:' + props.campaignId }, () =>
      setGeneration((n) => n + 1),
    );
  }, [uid, props.campaignId]);
  return uid && revoked === key ? (
    <Alert variant="warning">
      Esta campanha foi excluída ou está em exclusão. Os pedidos deste navegador foram preservados
      para encerramento explícito.
    </Alert>
  ) : uid ? (
    <Sessions
      key={key + ':' + generation + ':' + stamp}
      uid={uid}
      {...props}
      onUnavailable={() => {
        if (actor.current !== key) return;
        setRevoked(key);
        publishInvalidation({ actorId: uid, scope: 'campaign:' + props.campaignId });
      }}
      isActive={() =>
        actor.current === key &&
        getInvalidationGeneration({ actorId: uid, scope: 'campaign:' + props.campaignId }) === stamp
      }
    />
  ) : null;
}
function Sessions({
  uid,
  campaignId,
  onPendingChange,
  renderReferences,
  isActive,
  onUnavailable,
}: CampaignSessionsPanelProps & {
  uid: string;
  isActive: () => boolean;
  onUnavailable: () => void;
}) {
  const [initial] = useState(() => {
    try {
      return readPendingCampaignSession(uid, campaignId);
    } catch {
      return null;
    }
  });
  const [items, setItems] = useState<CampaignSessionSummary[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [reading, setReading] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [listStale, setListStale] = useState(false),
    [form, setForm] = useState<Form | null>(() =>
      initial?.method === 'saveCampaignSession'
        ? {
            ...fields(initial.input),
            id: initial.input.sessionId,
            revision: initial.input.expectedRevision,
            saved: '',
            open: false,
            stale: false,
          }
        : null,
    ),
    [deleting, setDeleting] = useState<CampaignSessionSummary | null>(null),
    [tokenValue, setTokenValue] = useState(initial?.input.campaignToken);
  const alive = useRef(true),
    latest = useRef({ isActive, onPendingChange }),
    token = useRef(initial?.input.campaignToken),
    collection = useRef(0),
    pageRevision = useRef<number | null>(null),
    listOwner = useRef(0),
    readOwner = useRef(0),
    refreshButton = useRef<HTMLButtonElement>(null),
    formRef = useRef(form),
    slotIdentity = useRef(''),
    seen = useRef(new Set<string>()),
    opBusy = useRef(false);
  const slotKey = JSON.stringify([
    uid,
    campaignId,
    tokenValue,
    form?.id,
    form?.revision,
    form?.open,
  ]);
  // The slot carries only the saved identity; edits remain private in this feature.
  // eslint-disable-next-line react-hooks/refs
  slotIdentity.current = slotKey;
  useLayoutEffect(() => {
    latest.current = { isActive, onPendingChange };
    formRef.current = form;
  });
  useLayoutEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const active = () => alive.current && latest.current.isActive();
  function hideUnavailable() {
    readOwner.current++;
    setForm(null);
    setDeleting(null);
    onUnavailable();
  }
  function unavailable(cause: unknown) {
    if (!api.isDeletedCampaignError(cause, campaignId)) return false;
    hideUnavailable();
    return true;
  }
  function observe(value: CampaignSessionEnvelope) {
    api.validateEnvelope(value, uid, campaignId, token.current, collection.current);
    if (pageRevision.current !== null && pageRevision.current !== value.collectionRevision) {
      setItems([]);
      setCursor(null);
      setListStale(true);
    }
    token.current = value.campaignToken;
    setTokenValue(value.campaignToken);
    collection.current = value.collectionRevision;
  }
  function confirmed(
    value: CampaignSessionMutation,
    operation: PendingCampaignSession,
    canAdopt: boolean,
  ) {
    setItems([]);
    setCursor(null);
    setListStale(true);
    setNotice(
      operation.method === 'deleteCampaignSession'
        ? 'Sessão excluída.'
        : operation.method === 'moveCampaignSession'
          ? 'Ordem da sessão atualizada.'
          : 'Pedido da sessão confirmado.',
    );
    const current = formRef.current;
    if (current?.id === operation.input.sessionId) {
      if (
        operation.method === 'saveCampaignSession' &&
        value.session &&
        canAdopt &&
        api.canonical(fields({ ...current, title: current.title.trim() })) ===
          api.canonical(fields(operation.input))
      )
        setForm({ ...savedForm(value.session), open: current.open });
      else if (operation.method === 'deleteCampaignSession') setForm(null);
      else setForm({ ...current, stale: true });
    }
    setDeleting(null);
    if (value.session === null && operation.method !== 'deleteCampaignSession')
      setNotice(
        'O recibo confirma o pedido anterior. Consulte a sessão atual antes de adotar outra versão; seu texto foi preservado.',
      );
    if (operation.method === 'moveCampaignSession' || operation.method === 'deleteCampaignSession')
      refreshButton.current?.focus();
  }
  const op = useCampaignSessionOperation({
    uid,
    campaignId,
    isActive: active,
    minimumRevision: () => collection.current,
    observe,
    onConfirmed: confirmed,
    onRejected: () => {
      const current = formRef.current;
      if (current) setForm({ ...current, stale: true });
    },
    onUnavailable: hideUnavailable,
  });
  useLayoutEffect(() => {
    opBusy.current = op.busy;
  });
  const dirty = !!form && api.canonical(fields(form)) !== form.saved;
  const locked = op.busy || !!op.pending || op.blocked || op.conflict;
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
  async function load(next?: string) {
    const own = ++listOwner.current;
    setLoading(true);
    try {
      const page = await api.listCampaignSessions({
        campaignId,
        ...(token.current ? { campaignToken: token.current } : {}),
        ...(next ? { cursor: next } : {}),
        limit: 25,
      });
      if (!active() || listOwner.current !== own) return;
      api.validateEnvelope(page, uid, campaignId, token.current, collection.current);
      api.keys(page, [
        'schemaVersion',
        'ownerId',
        'campaignId',
        'campaignToken',
        'collectionRevision',
        'items',
        'nextCursor',
      ]);
      if (
        !Array.isArray(page.items) ||
        page.items.length > 50 ||
        (page.nextCursor !== null &&
          (typeof page.nextCursor !== 'string' ||
            !page.nextCursor ||
            page.nextCursor.length > 12000 ||
            (next && seen.current.has(page.nextCursor))))
      )
        api.fail();
      const ids = new Set<string>();
      page.items.forEach((item, index) => {
        api.validateSession(item, uid, campaignId);
        if (ids.has(item.id) || (index > 0 && item.order <= page.items[index - 1]!.order))
          api.fail();
        ids.add(item.id);
      });
      const previous = pageRevision.current;
      observe(page);
      if (next && previous !== page.collectionRevision)
        throw new Error('A lista mudou. Consulte as sessões novamente antes de continuar.');
      if (!next) seen.current.clear();
      if (page.nextCursor) seen.current.add(page.nextCursor);
      pageRevision.current = page.collectionRevision;
      setItems((old) =>
        next
          ? [...old, ...page.items.filter((item) => !old.some((p) => p.id === item.id))]
          : page.items,
      );
      setCursor(page.nextCursor);
      setListStale(false);
      setError('');
      const current = formRef.current;
      if (current && current.revision > 0) {
        const summary = page.items.find((item) => item.id === current.id);
        if (summary && summary.revision !== current.revision) setForm({ ...current, stale: true });
      }
    } catch (cause) {
      if (active() && listOwner.current === own) {
        if (unavailable(cause)) return;
        setError(api.message(cause));
        if (
          next ||
          [
            'cursor-invalidated',
            'campaign-changed',
            'campaign-deleting',
            'campaign-deleted',
          ].includes(api.errorReason(cause))
        ) {
          setItems([]);
          setCursor(null);
          setListStale(true);
        }
      }
    } finally {
      if (active() && listOwner.current === own) setLoading(false);
    }
  }
  useEffect(() => {
    let current = true;
    queueMicrotask(() => {
      if (current) void load();
    });
    const focus = () => {
      if (!opBusy.current) void load();
    };
    window.addEventListener('focus', focus);
    return () => {
      current = false;
      window.removeEventListener('focus', focus);
    };
  }, [campaignId, uid]); // eslint-disable-line react-hooks/exhaustive-deps
  async function openSession(id: string, discard = false) {
    if (op.busy || op.pending || !token.current || (dirty && !discard)) return;
    const own = ++readOwner.current;
    setReading(true);
    try {
      const value = await api.getCampaignSession({
        campaignId,
        campaignToken: token.current,
        sessionId: id,
      });
      if (!active() || readOwner.current !== own) return;
      api.validateEnvelope(value, uid, campaignId, token.current, collection.current);
      api.keys(value, [
        'schemaVersion',
        'ownerId',
        'campaignId',
        'campaignToken',
        'collectionRevision',
        'session',
      ]);
      observe(value);
      if (value.session) {
        api.validateSession(value.session, uid, campaignId, id, true);
        setForm(savedForm(value.session));
      } else {
        setNotice('Esta sessão foi removida ou não está disponível.');
        if (discard) setForm(null);
      }
      op.clearConflict();
      setError('');
    } catch (cause) {
      if (active() && readOwner.current === own && !unavailable(cause))
        setError(api.message(cause));
    } finally {
      if (active() && readOwner.current === own) setReading(false);
    }
  }
  function closeForm() {
    readOwner.current++;
    setReading(false);
    const current = formRef.current;
    if (current) setForm({ ...current, open: false });
  }
  function newSession() {
    if (locked || dirty || !token.current) return;
    readOwner.current++;
    setReading(false);
    const blank = { title: '', summary: '', scheduledDate: null, status: 'planned' as const };
    setForm({
      ...blank,
      id: crypto.randomUUID(),
      revision: 0,
      saved: api.canonical(blank),
      open: true,
      stale: false,
    });
    setNotice('');
  }
  function save() {
    if (!form || !token.current || form.stale) return;
    void op.execute({
      schemaVersion: 1,
      ownerId: uid,
      method: 'saveCampaignSession',
      input: {
        campaignId,
        campaignToken: token.current,
        sessionId: form.id,
        operationId: form.revision === 0 ? form.id : crypto.randomUUID(),
        expectedRevision: form.revision,
        ...fields(form),
        title: form.title.trim(),
      },
    });
  }
  function move(item: CampaignSessionSummary, direction: 'up' | 'down') {
    if (locked || dirty || !token.current || listStale) return;
    refreshButton.current?.focus();
    void op.execute({
      schemaVersion: 1,
      ownerId: uid,
      method: 'moveCampaignSession',
      input: {
        campaignId,
        campaignToken: token.current,
        sessionId: item.id,
        operationId: crypto.randomUUID(),
        expectedRevision: item.revision,
        expectedCollectionRevision: collection.current,
        direction,
      },
    });
  }
  const validation = form ? api.sessionFieldsError(form) : '';
  return (
    <Card className={styles.panel}>
      <header className={styles.actions}>
        <h2>Sessões privadas</h2>
        <Button disabled={locked || dirty || !tokenValue} onClick={newSession}>
          <Plus className="icon icon-sm" aria-hidden="true" />
          Nova sessão
        </Button>
      </header>
      <p>
        Prepare cada encontro com seu próprio texto. As sessões permanecem privadas e separadas do
        material da aventura.
      </p>
      {notice && <p role="status">{notice}</p>}
      {(error || op.error) && <Alert variant="warning">{error || op.error}</Alert>}
      {!op.locksAvailable && (
        <Alert variant="warning">
          A leitura continua disponível. Este navegador não permite reservar alterações com
          segurança; seus campos serão mantidos.
        </Alert>
      )}
      {op.pending && (
        <Alert variant="warning">
          <p>Há um pedido de sessão aguardando confirmação. O pedido original foi preservado.</p>
          <Button disabled={op.busy} onClick={() => void op.recover()}>
            Confirmar pedido de sessão
          </Button>
        </Alert>
      )}
      {form && !form.open && (
        <Button
          variant="outline"
          onClick={() => {
            readOwner.current++;
            setReading(false);
            setForm({ ...form, open: true });
          }}
        >
          Rever preparação da sessão
        </Button>
      )}
      <div className={styles.actions}>
        <Button ref={refreshButton} variant="outline" onClick={() => void load()}>
          Consultar sessões
        </Button>
        {cursor && (
          <Button variant="outline" disabled={loading} onClick={() => void load(cursor)}>
            Carregar mais sessões
          </Button>
        )}
      </div>
      {loading && <LoadingState label="Consultando sessões..." />}
      {reading && <LoadingState label="Carregando preparação da sessão..." />}
      {listStale && <p role="status">Consulte a lista atual antes de outra alteração de ordem.</p>}
      {!loading && !items.length && !error && !listStale && (
        <p>
          {cursor
            ? 'Esta janela está vazia; há mais sessões para consultar.'
            : 'Nenhuma sessão preparada. Crie seu primeiro encontro.'}
        </p>
      )}
      <ol className={styles.list}>
        {items.map((item, index) => (
          <li key={item.id} className={styles.row}>
            <div className={styles.heading}>
              <h3>{item.title}</h3>
              <Badge variant="secondary">{campaignSessionStatusLabels[item.status]}</Badge>
              {item.scheduledDate && (
                <time dateTime={item.scheduledDate}>
                  {item.scheduledDate.split('-').reverse().join('/')}
                </time>
              )}
            </div>
            <div className={styles.actions}>
              <Button
                variant="outline"
                disabled={op.busy || !!op.pending || dirty}
                onClick={() => void openSession(item.id)}
                aria-label={'Editar sessão ' + item.title}
              >
                <Pencil className="icon icon-sm" aria-hidden="true" />
                Editar
              </Button>
              <Button
                variant="outline"
                disabled={locked || dirty || listStale || index === 0}
                onClick={() => move(item, 'up')}
                aria-label={'Mover ' + item.title + ' para cima'}
              >
                <ArrowUp className="icon icon-sm" aria-hidden="true" />
                Subir
              </Button>
              <Button
                variant="outline"
                disabled={locked || dirty || listStale || (index === items.length - 1 && !cursor)}
                onClick={() => move(item, 'down')}
                aria-label={'Mover ' + item.title + ' para baixo'}
              >
                <ArrowDown className="icon icon-sm" aria-hidden="true" />
                Descer
              </Button>
              <Button
                variant="outline"
                disabled={locked || dirty}
                onClick={() => setDeleting(structuredClone(item))}
                aria-label={'Excluir sessão ' + item.title}
              >
                <Trash2 className="icon icon-sm" aria-hidden="true" />
                Excluir
              </Button>
            </div>
          </li>
        ))}
      </ol>
      <Dialog
        open={!!form?.open}
        onClose={closeForm}
        title={form?.revision ? 'Editar sessão' : 'Nova sessão'}
        description="Preparação autoral em texto simples. O salvamento é manual."
        footer={
          <div className={styles.actions}>
            <Button variant="outline" onClick={closeForm}>
              {op.pending ? 'Fechar e manter pedido' : 'Fechar preparação'}
            </Button>
            {dirty && !op.pending && (
              <Button
                variant="outline"
                disabled={op.isReserved()}
                onClick={() => {
                  readOwner.current++;
                  setReading(false);
                  setForm(null);
                  op.clearConflict();
                }}
              >
                Descartar rascunho e fechar
              </Button>
            )}
            <Button
              disabled={
                !form || locked || form.stale || !!validation || !dirty || !op.locksAvailable
              }
              onClick={save}
            >
              Salvar sessão
            </Button>
          </div>
        }
      >
        {form && (
          <div className={styles.form}>
            {op.error && <Alert variant="warning">{op.error}</Alert>}
            {(form.stale || op.conflict) && (
              <Alert variant="warning">
                A sessão mudou ou o recibo é histórico. Seu texto foi preservado.
                <Button
                  disabled={op.isReserved() || reading}
                  variant="outline"
                  onClick={() => void openSession(form.id, true)}
                >
                  Descartar alterações e consultar sessão atual
                </Button>
              </Alert>
            )}
            <Input
              label="Título da sessão"
              required
              maxLength={300}
              value={form.title}
              disabled={locked || form.stale}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
            />
            <Input
              label="Data do encontro"
              type="date"
              min="0001-01-01"
              max="9999-12-31"
              value={form.scheduledDate ?? ''}
              disabled={locked || form.stale}
              hint="Opcional, sem horário."
              onChange={(event) => setForm({ ...form, scheduledDate: event.target.value || null })}
            />
            {form.revision > 0 ? (
              <Dropdown
                mode="select"
                label="Estado da sessão"
                value={form.status}
                disabled={locked || form.stale}
                options={Object.entries(campaignSessionStatusLabels).map(([value, label]) => ({
                  value,
                  label,
                }))}
                onValueChange={(value) =>
                  setForm({ ...form, status: value as CampaignSessionStatus })
                }
              />
            ) : (
              <p>Estado inicial: Planejada. Você poderá alterá-lo após criar a sessão.</p>
            )}
            <Textarea
              label="Preparação da sessão"
              rows={10}
              value={form.summary}
              disabled={locked || form.stale}
              onChange={(event) => setForm({ ...form, summary: event.target.value })}
            />
            <p>
              {form.summary.length.toLocaleString('pt-BR')} de 150.000 caracteres. Texto vazio é
              permitido.
            </p>
            {validation && form.title && <Alert variant="warning">{validation}</Alert>}
            {form.revision > 0 && tokenValue && renderReferences && (
              <div key={slotKey}>
                {/* This callback passes a guard for events/awaits; it does not read the guard during rendering. */}
                {/* eslint-disable-next-line react-hooks/refs */}
                {renderReferences({
                  campaignId,
                  campaignToken: tokenValue,
                  sessionId: form.id,
                  sessionRevision: form.revision,
                  readOnly: locked || form.stale,
                  isActive: () => active() && slotIdentity.current === slotKey,
                })}
              </div>
            )}
          </div>
        )}
      </Dialog>
      <Dialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Excluir sessão"
        description="A exclusão é definitiva e remove a preparação desta sessão. Pistas e missões da campanha são preservadas."
        footer={
          <div className={styles.actions}>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Manter sessão
            </Button>
            <Button
              variant="destructive"
              disabled={locked || !op.locksAvailable}
              onClick={() => {
                const target = deleting;
                if (target && token.current)
                  void op.execute({
                    schemaVersion: 1,
                    ownerId: uid,
                    method: 'deleteCampaignSession',
                    input: {
                      campaignId,
                      campaignToken: token.current,
                      sessionId: target.id,
                      operationId: crypto.randomUUID(),
                      expectedRevision: target.revision,
                    },
                  });
              }}
            >
              Excluir definitivamente a sessão
            </Button>
          </div>
        }
      >
        {deleting && <p>Excluir “{deleting.title}”?</p>}
        {op.error && <Alert variant="warning">{op.error}</Alert>}
      </Dialog>
    </Card>
  );
}
