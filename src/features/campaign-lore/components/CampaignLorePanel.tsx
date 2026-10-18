import { getInvalidationGeneration, subscribeInvalidation } from '@/shared/services';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth';
import { Alert, Badge, Button, Card, Dialog, Dropdown, LoadingState } from '@/shared/ui';
import type {
  CampaignLoreAction,
  CampaignLoreEntityInput,
  CampaignLoreEnvelope,
  CampaignLoreOperation,
  CampaignLoreResult,
  CampaignLoreState,
  CampaignLoreSummary,
} from '../model/campaignLore';
import { useCampaignLoreMutation } from '../hooks/useCampaignLoreMutation';
import * as api from '../services/campaignLoreService';
import { CampaignLoreForm } from './CampaignLoreForm';
import { viewNames } from '../services/campaignLoreService';
import styles from './CampaignLore.module.css';
export interface CampaignLorePanelProps {
  campaignId: string;
  baseId: string;
}
interface Form {
  item: CampaignLoreState;
  entity: CampaignLoreEntityInput;
  names: Record<string, string>;
  open: boolean;
  stale: boolean;
}
export function CampaignLorePanel(props: CampaignLorePanelProps) {
  const { user } = useAuth(),
    identity = useRef('');
  const [, pulse] = useState(0);
  const scope = { actorId: user?.uid ?? '', scope: 'campaign:' + props.campaignId },
    stamp = user?.uid ? getInvalidationGeneration(scope) : 0;
  useLayoutEffect(() => {
    if (!user?.uid) return;
    return subscribeInvalidation(
      { actorId: user?.uid ?? '', scope: 'campaign:' + props.campaignId },
      () => pulse((n) => n + 1),
    );
  }, [user?.uid, props.campaignId]);
  const key = JSON.stringify([user?.uid, props.campaignId, props.baseId, stamp]);
  // Block old async work already during the account/base-changing render.
  // eslint-disable-next-line react-hooks/refs
  identity.current = key;
  return user ? (
    <LoreSession
      key={key}
      uid={user.uid}
      {...props}
      isActive={() => identity.current === key && getInvalidationGeneration(scope) === stamp}
    />
  ) : null;
}
function LoreSession({
  uid,
  campaignId,
  baseId,
  isActive,
}: { uid: string; isActive: () => boolean } & CampaignLorePanelProps) {
  const [items, setItems] = useState<CampaignLoreSummary[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [view, setView] = useState<'active' | 'removed'>('active'),
    [loading, setLoading] = useState(false),
    [readError, setReadError] = useState(''),
    [notice, setNotice] = useState(''),
    [form, setForm] = useState<Form | null>(null),
    [confirmation, setConfirmation] = useState<CampaignLoreAction | null>(null),
    [canceling, setCanceling] = useState<CampaignLoreOperation | null>(null),
    [epoch, setEpoch] = useState(0),
    [checking, setChecking] = useState(false),
    [verificationRequired, setVerificationRequired] = useState(false),
    [envelope, setEnvelope] = useState<CampaignLoreEnvelope | null>(null);
  const formRef = useRef(form),
    alive = useRef(true),
    generation = useRef(0),
    token = useRef<string | undefined>(undefined),
    collection = useRef<number | undefined>(undefined),
    projection = useRef<string | undefined>(undefined),
    presentation = useRef(0),
    accessVersion = useRef(0),
    recoveryPresentation = useRef<number | undefined>(undefined);
  useLayoutEffect(() => {
    formRef.current = form;
  });
  useLayoutEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const active = () => alive.current && isActive();
  const denied = useCallback(() => {
    accessVersion.current++;
    presentation.current++;
    setForm(null);
    formRef.current = null;
    setItems([]);
    setCursor(null);
    setConfirmation(null);
    setNotice(
      'Esta ficha ou sua base não está disponível. Pedidos preservados podem ser encerrados sem acessar o texto.',
    );
  }, []);
  const observe = useCallback(
    (value: CampaignLoreEnvelope) => {
      api.validateEnvelope(value, uid, campaignId, baseId, token.current);
      if (collection.current !== undefined && value.collectionRevision < collection.current)
        api.invalid('A resposta pertence a uma revisão anterior. Consulte o lore atual.');
      token.current = value.campaignToken;
      collection.current = value.collectionRevision;
      projection.current = value.projectionToken;
      setEnvelope(value);
    },
    [uid, campaignId, baseId],
  );
  function observeExternal(value: CampaignLoreEnvelope) {
    api.validateEnvelope(value, uid, campaignId, baseId, token.current);
    if (projection.current !== value.projectionToken) {
      accessVersion.current++;
      presentation.current++;
      formRef.current = null;
      setForm(null);
    }
    observe(value);
  }
  function confirmed(value: CampaignLoreResult) {
    if (!active()) return;
    observe(value);
    setEpoch((n) => n + 1);
    setNotice('Alteração de lore confirmada nesta campanha.');
    const current = formRef.current;
    if (current && current.item.sourceKey === value.item?.sourceKey && value.item?.entity) {
      const next = {
        item: value.item,
        entity: api.toEntityInput(value.item.entity),
        names: viewNames(value.item.entity),
        open: current.open,
        stale: false,
      };
      formRef.current = next;
      setForm(next);
    } else if (current?.item.sourceKey === value.item?.sourceKey) {
      setForm(null);
      formRef.current = null;
    }
  }
  function recovered(entity: CampaignLoreEntityInput, op: CampaignLoreOperation) {
    if (!active() || recoveryPresentation.current !== presentation.current) return;
    // Names are not in the ciphertext. No target name is invented or resolved live.
    const next: Form = {
      item: {
        legacy: false,
        sourceKey: op.header.sourceKey,
        revision: op.header.expectedRevision,
        mode: 'override',
        createdAt: null,
        updatedAt: null,
        entityHash: null,
        entity: null,
      },
      entity,
      names: {},
      open: true,
      stale: true,
    };
    formRef.current = next;
    setForm(next);
  }
  const mutation = useCampaignLoreMutation({
    uid,
    campaignId,
    baseId,
    isActive,
    accessVersion: () => accessVersion.current,
    onConfirmed: confirmed,
    onRecovered: recovered,
    onClosed: () => {
      setEpoch((n) => n + 1);
      setForm((current) => (current ? { ...current, stale: true } : null));
    },
    onGateDenied: denied,
    observe,
  });
  async function load(next?: string) {
    const own = ++generation.current,
      oldProjection = projection.current;
    setLoading(true);
    setReadError('');
    try {
      const page = await api.listCampaignLore({
        campaignId,
        baseId,
        ...(token.current ? { campaignToken: token.current } : {}),
        view,
        ...(next ? { cursor: next } : {}),
      });
      if (!active() || generation.current !== own) return;
      api.validateEnvelope(page, uid, campaignId, baseId, token.current);
      page.items.forEach(api.validateSummary);
      if (
        !Array.isArray(page.items) ||
        page.items.length > 50 ||
        (page.nextCursor !== null && typeof page.nextCursor !== 'string') ||
        page.items.some((i) => (view === 'removed' ? i.mode !== 'removed' : i.mode === 'removed'))
      )
        api.invalid();
      if (
        next &&
        (page.collectionRevision !== collection.current ||
          page.projectionToken !== projection.current)
      ) {
        observeExternal(page);
        throw new Error('A lista mudou. Atualize o lore para consultar novas páginas.');
      }
      observeExternal(page);
      setItems((old) =>
        next
          ? [...old, ...page.items.filter((i) => !old.some((o) => o.sourceKey === i.sourceKey))]
          : page.items,
      );
      setCursor(page.nextCursor);
      if (
        oldProjection &&
        oldProjection !== page.projectionToken &&
        formRef.current &&
        !mutation.busy &&
        !mutation.pending
      ) {
        presentation.current++;
        setForm(null);
        formRef.current = null;
        setNotice('A lista ou a autorização mudou. Abra a ficha atual antes de continuar.');
      }
    } catch (cause) {
      if (active() && generation.current === own) {
        setItems([]);
        setCursor(null);
        setReadError(api.loreMessage(cause));
        if (api.gateDenied(cause)) denied();
      }
    } finally {
      if (active() && generation.current === own) setLoading(false);
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
  }, [view, epoch]); // eslint-disable-line react-hooks/exhaustive-deps
  function verifyAccess() {
    const current = formRef.current;
    if (!current || mutation.isReserved()) return;
    const own = ++generation.current,
      before = projection.current;
    setChecking(true);
    setVerificationRequired(true);
    void api
      .getCampaignLore({
        campaignId,
        baseId,
        campaignToken: token.current!,
        sourceKey: current.item.sourceKey,
      })
      .then((value) => {
        if (!active() || generation.current !== own) return;
        observeExternal(value);
        if (!value.item) {
          denied();
          return;
        }
        api.validateState(value.item, current.item.sourceKey);
        setVerificationRequired(false);
        setReadError('');
        if (before !== value.projectionToken || value.item.revision !== current.item.revision) {
          presentation.current++;
          setForm(null);
          formRef.current = null;
          setNotice('O lore mudou. Abra a ficha atual para continuar.');
        }
      })
      .catch((cause) => {
        if (active() && generation.current === own) {
          if (api.gateDenied(cause)) denied();
          setReadError(api.loreMessage(cause));
        }
      })
      .finally(() => {
        if (active() && generation.current === own) setChecking(false);
      });
  }
  useEffect(() => {
    window.addEventListener('focus', verifyAccess);
    return () => window.removeEventListener('focus', verifyAccess);
  });
  async function open(item: CampaignLoreSummary) {
    const own = ++generation.current,
      present = ++presentation.current;
    setChecking(true);
    setReadError('');
    try {
      const value = await api.getCampaignLore({
        campaignId,
        baseId,
        campaignToken: token.current!,
        sourceKey: item.sourceKey,
      });
      if (!active() || generation.current !== own || presentation.current !== present) return;
      observeExternal(value);
      if (!value.item) {
        denied();
        return;
      }
      api.validateState(value.item, item.sourceKey);
      setVerificationRequired(false);
      const next: Form = {
        item: value.item,
        entity: value.item.entity
          ? api.toEntityInput(value.item.entity)
          : {
              name: item.name,
              aliases: [],
              category: item.category,
              summary: '',
              details: '',
              structuredDetails: { appearance: '', personality: '', history: '', notes: '' },
              relations: [],
            },
        names: value.item.entity ? viewNames(value.item.entity) : {},
        open: true,
        stale: false,
      };
      setForm(next);
      formRef.current = next;
    } catch (cause) {
      if (active() && generation.current === own) {
        setReadError(api.loreMessage(cause));
        if (api.gateDenied(cause)) denied();
      }
    } finally {
      if (active() && generation.current === own) setChecking(false);
    }
  }
  function close() {
    presentation.current++;
    setConfirmation(null);
    setForm((current) => (current ? { ...current, open: false } : null));
    if (formRef.current) formRef.current = { ...formRef.current, open: false };
  }
  function act(action: CampaignLoreAction) {
    const current = formRef.current;
    if (!current || !token.current) return;
    setConfirmation(null);
    void mutation.execute(
      action,
      {
        campaignId,
        baseId,
        campaignToken: token.current,
        sourceKey: current.item.sourceKey,
        operationId: crypto.randomUUID(),
        expectedRevision: current.item.revision,
      },
      action === 'save' ? current.entity : undefined,
    );
  }
  const locked =
    mutation.busy ||
    !!mutation.pending ||
    !mutation.ready ||
    !mutation.available ||
    checking ||
    verificationRequired;
  const error = mutation.error || readError;
  return (
    <Card className={styles.panel}>
      <h2>Lore da mesa</h2>
      <p className={styles.meta}>
        Alterações ficam apenas nesta campanha. A base congelada e o universo conservam suas fichas.
      </p>
      {!mutation.available && (
        <Alert variant="warning">
          A leitura está disponível. Para alterar fichas, use um navegador com recuperação cifrada e
          reserva entre abas.
        </Alert>
      )}
      {notice && <p role="status">{notice}</p>}
      {error && <Alert variant="warning">{error}</Alert>}
      {mutation.pending && (
        <Alert variant="warning">
          <p>
            {mutation.pending.phase === 'confirmed'
              ? 'A alteração foi confirmada. Falta encerrar sua recuperação.'
              : mutation.pending.phase === 'preparing'
                ? 'Existe um preparo sem rascunho cifrado completo. Encerre-o para continuar.'
                : 'Existe um pedido preservado. Confirme o mesmo pedido antes de alterar outra ficha.'}
          </p>
          <div className={styles.actions}>
            {mutation.pending.phase !== 'preparing' && (
              <Button
                disabled={mutation.busy}
                onClick={() => {
                  recoveryPresentation.current = ++presentation.current;
                  void mutation.recover();
                }}
              >
                Recuperar pedido de lore
              </Button>
            )}
            <Button
              disabled={mutation.busy}
              variant="outline"
              onClick={() => {
                if (mutation.pending) setCanceling(structuredClone(mutation.pending));
              }}
            >
              Encerrar pedido sem recuperar texto
            </Button>
          </div>
        </Alert>
      )}
      <div className={styles.actions}>
        <Dropdown
          mode="select"
          label="Fichas do lore da mesa"
          value={view}
          options={[
            { value: 'active', label: 'Ativas' },
            { value: 'removed', label: 'Retiradas' },
          ]}
          disabled={mutation.busy}
          onValueChange={(value) => {
            setItems([]);
            setCursor(null);
            setView(value as typeof view);
          }}
        />
        <Button variant="outline" disabled={loading || mutation.busy} onClick={() => void load()}>
          Atualizar lore da mesa
        </Button>
      </div>
      {loading && <LoadingState label="Carregando lore da mesa..." />}
      {checking && <LoadingState label="Verificando acesso à ficha..." />}
      {!loading && !items.length && !readError && (
        <p>
          {cursor
            ? 'Esta página não contém fichas disponíveis. Há mais páginas para consultar.'
            : view === 'removed'
              ? 'Nenhuma ficha retirada disponível.'
              : 'Nenhuma ficha de lore disponível nesta base.'}
        </p>
      )}
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item.sourceKey}>
            <div className={styles.row}>
              <Button variant="outline" disabled={mutation.busy} onClick={() => void open(item)}>
                {item.name}
              </Button>
              <Badge variant="outline">{api.loreModes[item.mode]}</Badge>
              {item.legacy && <Badge variant="outline">Legado da mesa</Badge>}
            </div>
          </li>
        ))}
      </ul>
      {cursor && (
        <Button disabled={loading || mutation.busy} onClick={() => void load(cursor)}>
          Carregar mais lore da mesa
        </Button>
      )}
      <Dialog
        open={!!form?.open}
        onClose={close}
        title={form?.item.mode === 'removed' ? 'Ficha retirada' : 'Editar lore da mesa'}
        description="Esta ficha pertence somente à campanha. Salvar substitui a ficha inteira."
        maxWidthClass="max-w-3xl"
        footer={
          <div className={styles.actions}>
            {form?.item.mode === 'removed' ? (
              <Button disabled={locked || form?.stale} onClick={() => setConfirmation('restore')}>
                Restaurar ficha
              </Button>
            ) : (
              <>
                <Button disabled={locked || form?.stale} onClick={() => act('save')}>
                  Salvar variante da mesa
                </Button>
                <Button
                  variant="outline"
                  disabled={locked || form?.stale}
                  onClick={() => setConfirmation('remove')}
                >
                  Retirar ficha da mesa
                </Button>
                {form?.item.mode === 'override' && (
                  <Button
                    variant="destructive"
                    disabled={locked || form?.stale}
                    onClick={() => setConfirmation('discard')}
                  >
                    Descartar variante
                  </Button>
                )}
              </>
            )}
            <Button variant="secondary" onClick={close}>
              Fechar ficha
            </Button>
          </div>
        }
      >
        {form && (
          <div className={styles.form}>
            {form.item.legacy && (
              <Alert variant="info">
                Legado da mesa: esta ficha conserva sua origem e permissões. Restaurar mantém o modo
                anterior; descartar a variante retorna à ficha congelada de origem.
              </Alert>
            )}
            {verificationRequired && (
              <Alert variant="warning">
                Confira novamente o acesso antes de enviar. Seus campos foram mantidos nesta sessão.
                <Button disabled={checking} onClick={verifyAccess}>
                  Conferir acesso novamente
                </Button>
              </Alert>
            )}
            {mutation.error && <Alert variant="warning">{mutation.error}</Alert>}
            {form.stale && (
              <Alert variant="warning">
                Confirme ou encerre o pedido preservado. Para outra edição, feche e abra a ficha
                atual; o texto não será reaplicado a uma revisão nova.
              </Alert>
            )}
            {form.item.mode === 'removed' ? (
              <p>
                {form.entity.name} foi retirada apenas desta mesa. Restaurar retorna ao modo
                anterior.
              </p>
            ) : (
              <CampaignLoreForm
                key={form.item.sourceKey + ':' + envelope?.projectionToken}
                entity={form.entity}
                names={form.names}
                sourceKey={form.item.sourceKey}
                disabled={locked || form.stale}
                scope={{ campaignId, baseId, campaignToken: envelope!.campaignToken }}
                uid={uid}
                projectionToken={envelope!.projectionToken}
                onDenied={denied}
                onObserved={observeExternal}
                onChange={(entity) => {
                  const next = { ...form, entity };
                  formRef.current = next;
                  setForm(next);
                }}
              />
            )}
          </div>
        )}
      </Dialog>
      <Dialog
        open={confirmation !== null}
        onClose={() => setConfirmation(null)}
        title={
          confirmation === 'discard'
            ? 'Descartar variante inteira?'
            : confirmation === 'remove'
              ? 'Retirar ficha desta mesa?'
              : 'Restaurar ficha?'
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmation(null)}>
              Voltar à ficha
            </Button>
            <Button
              variant={confirmation === 'discard' ? 'destructive' : 'primary'}
              disabled={locked}
              onClick={() => confirmation && act(confirmation)}
            >
              Confirmar{' '}
              {confirmation === 'discard'
                ? 'descarte'
                : confirmation === 'remove'
                  ? 'retirada'
                  : 'restauração'}
            </Button>
          </>
        }
      >
        <p>
          {confirmation === 'discard'
            ? 'Todos os campos da variante serão perdidos. A ficha voltará à base congelada autorizada.'
            : confirmation === 'remove'
              ? 'A ficha sairá da mesa; sua variante será preservada para restauração.'
              : 'A ficha voltará ao modo que tinha antes da retirada.'}
        </p>
      </Dialog>
      <Dialog
        open={canceling !== null}
        onClose={() => setCanceling(null)}
        title="Encerrar recuperação de lore?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCanceling(null)}>
              Manter pedido
            </Button>
            <Button
              variant="destructive"
              disabled={mutation.busy}
              onClick={() => {
                const expected = canceling;
                setCanceling(null);
                void mutation.cancel(expected);
              }}
            >
              Confirmar encerramento
            </Button>
          </>
        }
      >
        <p>
          O rascunho cifrado será descartado. Se a alteração já foi aplicada, encerrar a recuperação
          não desfaz essa alteração. Esta ação não precisa acessar o texto da origem.
        </p>
      </Dialog>
    </Card>
  );
}
