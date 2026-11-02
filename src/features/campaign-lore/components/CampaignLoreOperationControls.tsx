import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth';
import { Alert, Button, Dialog, LoadingState } from '@/shared/ui';
import type { CampaignLoreScope, CampaignLoreOperation } from '../model/campaignLore';
import type {
  CampaignLoreRemoteControl,
  CampaignLoreRemotePending,
  CampaignLoreRemoteResolution,
} from '../model/campaignLoreRemote';
import * as remote from '../services/campaignLoreRemoteCallables';
import * as journal from '../services/campaignLoreRemoteRecovery';
import * as local from '../services/campaignLoreRecovery';
import { resolveCampaignLoreOperation } from '../services/campaignLoreCallables';
import { loreMessage, validateResolution } from '../services/campaignLoreService';
import styles from './CampaignLore.module.css';
export interface CampaignLoreOperationControlsProps {
  scope: CampaignLoreScope;
  mode: 'normal' | 'metadata-only';
  includeLocal?: boolean;
  onRecoverLocal?: () => void;
  onPendingChange?: (pending: boolean) => void;
}
export function CampaignLoreOperationControls(props: CampaignLoreOperationControlsProps) {
  const { user } = useAuth(),
    actor = useRef('');
  const key = JSON.stringify([user?.uid, props.scope]);
  // eslint-disable-next-line react-hooks/refs
  actor.current = key;
  return user ? (
    <Controls key={key} {...props} uid={user.uid} isActive={() => actor.current === key} />
  ) : null;
}
function Controls({
  scope,
  mode,
  includeLocal = true,
  onRecoverLocal,
  onPendingChange,
  uid,
  isActive,
}: CampaignLoreOperationControlsProps & { uid: string; isActive: () => boolean }) {
  const [items, setItems] = useState<CampaignLoreRemoteControl[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [pending, setPending] = useState<CampaignLoreRemotePending | null>(null),
    [rejected, setRejected] = useState<CampaignLoreRemoteResolution | null>(null),
    [localOp, setLocalOp] = useState<CampaignLoreOperation | null>(null),
    [confirm, setConfirm] = useState<
      CampaignLoreRemoteControl | { local: CampaignLoreOperation } | null
    >(null);
  const alive = useRef(true),
    reserved = useRef(false),
    generation = useRef(0),
    seen = useRef(new Set<string>()),
    latest = useRef({ onPendingChange });
  useLayoutEffect(() => {
    latest.current = { onPendingChange };
  });
  useLayoutEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const active = () => alive.current && isActive();
  function check() {
    if (!active()) throw new Error('A sessão deste pedido foi encerrada.');
  }
  async function refreshLocal() {
    try {
      const p = journal.readRemoteResolution(uid, scope.campaignId);
      const op = includeLocal ? await local.readLoreOperation(uid, scope.campaignId) : null;
      if (!active()) return;
      setPending(p);
      setLocalOp(op);
    } catch (cause) {
      if (active()) setError(loreMessage(cause));
    }
  }
  async function load(next?: string) {
    const own = ++generation.current;
    setLoading(true);
    try {
      const v = await remote.listCampaignLoreOperations({
        ...scope,
        ...(next ? { cursor: next } : {}),
        limit: 25,
      });
      if (!active() || own !== generation.current) return;
      journal.validateRemotePage(v, uid, scope);
      if (next && v.nextCursor && seen.current.has(v.nextCursor))
        throw new Error('A paginação dos pedidos mudou. Consulte novamente.');
      if (!next) seen.current.clear();
      if (v.nextCursor) seen.current.add(v.nextCursor);
      setItems((old) =>
        next
          ? [...old, ...v.items.filter((x) => !old.some((y) => y.operationId === x.operationId))]
          : v.items,
      );
      setCursor(v.nextCursor);
      setError('');
    } catch (cause) {
      if (active() && own === generation.current) setError(loreMessage(cause));
    } finally {
      if (active() && own === generation.current) setLoading(false);
    }
  }
  useEffect(() => {
    let current = true;
    queueMicrotask(() => {
      if (current) {
        void load();
        void refreshLocal();
      }
    });
    const unsub = journal.subscribeRemoteResolutions(() => {
      if (!reserved.current) void refreshLocal();
    });
    const unsubLocal = local.subscribeLoreOperations(() => {
      if (!reserved.current) void refreshLocal();
    });
    return () => {
      current = false;
      unsub();
      unsubLocal();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (active()) latest.current.onPendingChange?.(busy || !!pending);
  }, [busy, pending]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (reserved.current || journal.readRemoteResolution(uid, scope.campaignId)) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [uid, scope.campaignId]);
  async function run(work: () => Promise<void>) {
    if (reserved.current) return;
    reserved.current = true;
    setBusy(true);
    setError('');
    try {
      check();
      await work();
    } catch (cause) {
      if (active()) setError(loreMessage(cause));
    } finally {
      reserved.current = false;
      if (active()) {
        setBusy(false);
        await refreshLocal();
      }
    }
  }
  async function send(op: CampaignLoreRemotePending) {
    check();
    if (
      journal.remoteCanonical(journal.readRemoteResolution(uid, scope.campaignId)) !==
      journal.remoteCanonical(op)
    )
      throw new Error('A resolução mudou em outra aba. O controle atual foi preservado.');
    const v = await remote.resolveCampaignLoreRemoteOperation(op.input);
    check();
    journal.validateRemoteResolution(v, op);
    if (v.outcome === 'rejected') {
      setRejected(v);
      setNotice(
        'O pedido mudou em outro dispositivo. Encerre esta tentativa e consulte os controles atuais.',
      );
      return;
    }
    const next = await journal.clearRemoteResolution(op, check);
    check();
    const actual = journal.readRemoteResolution(uid, scope.campaignId);
    if (journal.remoteCanonical(next) !== journal.remoteCanonical(actual))
      throw new Error('Outro pedido foi preservado em outra aba.');
    setPending(actual);
    setNotice('Resolução do pedido remoto confirmada.');
    void load();
  }
  function resolveSelected(item: CampaignLoreRemoteControl) {
    const op: CampaignLoreRemotePending = {
      schemaVersion: 1,
      ownerId: uid,
      input: {
        ...scope,
        operationId: item.operationId,
        statusToken: item.statusToken,
        resolutionId: crypto.randomUUID(),
        intent: item.state === 'committed' ? 'confirm' : 'cancel',
      },
    };
    return run(async () => {
      await journal.reserveRemoteResolution(op, check);
      check();
      setPending(op);
      await send(op);
    });
  }
  function closeLocal(expected: CampaignLoreOperation) {
    return run(async () => {
      const op = await local.readLoreOperation(uid, scope.campaignId);
      check();
      if (!local.sameLoreOperation(op, expected))
        throw new Error('O controle local mudou em outra aba e foi preservado.');
      if (!op) throw new Error('O controle local mudou. Consulte os pedidos novamente.');
      const v = await resolveCampaignLoreOperation({
        ...op.header,
        action: op.action,
        ...(op.action === 'save' ? { relatedSourceKeys: op.relatedSourceKeys } : {}),
        intent: op.phase === 'confirmed' ? 'confirm' : 'cancel',
      });
      check();
      validateResolution(v, op);
      if (!local.sameLoreOperation(await local.readLoreOperation(uid, scope.campaignId), expected))
        throw new Error('O controle local mudou em outra aba e foi preservado.');
      check();
      const next = await local.clearLoreOperation(op, check);
      check();
      if (next) throw new Error('O controle local mudou em outra aba e foi preservado.');
      setLocalOp(null);
      setNotice('Recuperação local encerrada por sua escolha.');
      void load();
    });
  }
  return (
    <section className={styles.form} aria-label="Pedidos preservados de lore">
      <h3>Pedidos preservados de lore</h3>
      <p>
        Controles sem texto ou relações. Para recuperar um rascunho, use o navegador que o
        preservou.
      </p>
      {mode === 'metadata-only' && (
        <p>
          A recuperação e a aplicação de texto estão bloqueadas durante esta preparação ou para uma
          base anterior. Encerrar um pedido continua disponível.
        </p>
      )}
      {error && <Alert variant="warning">{error}</Alert>}
      {notice && <p role="status">{notice}</p>}
      {pending && (
        <Alert variant="warning">
          <p>Há uma resolução remota aguardando confirmação.</p>
          <Button disabled={busy} onClick={() => void run(() => send(pending))}>
            Confirmar resolução preservada
          </Button>
          {rejected && (
            <Button
              disabled={busy}
              variant="outline"
              onClick={() =>
                void run(async () => {
                  journal.validateRemoteResolution(rejected, pending);
                  await journal.clearRemoteResolution(pending, check);
                  check();
                  setRejected(null);
                  setNotice('Tentativa encerrada. Consulte novamente antes de outra decisão.');
                  void load();
                })
              }
            >
              Encerrar tentativa de resolução
            </Button>
          )}
        </Alert>
      )}
      {localOp && (
        <Alert variant="warning">
          <p>
            Existe um pedido local ligado à base em que foi iniciado. Seu rascunho protegido não
            será transferido.
          </p>
          {mode === 'normal' && onRecoverLocal && (
            <Button disabled={busy} onClick={onRecoverLocal}>
              Recuperar no Lore da mesa
            </Button>
          )}
          <Button
            disabled={busy}
            variant="outline"
            onClick={() => setConfirm({ local: structuredClone(localOp) })}
          >
            {localOp.phase === 'confirmed'
              ? 'Finalizar recuperação local confirmada'
              : 'Encerrar pedido local sem recuperar texto'}
          </Button>
        </Alert>
      )}
      {loading && <LoadingState label="Conferindo pedidos remotos..." />}
      {!loading && !error && !items.length && (
        <p>
          {cursor
            ? 'Esta janela está vazia; há mais pedidos para consultar.'
            : 'Nenhum pedido remoto aberto nesta base.'}
        </p>
      )}
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item.operationId}>
            <p>
              Pedido {item.operationId.slice(-8)} ·{' '}
              {item.state === 'committed' ? 'Aplicado; recuperação aberta' : 'Preparo preservado'}
            </p>
            <Button
              disabled={busy || !!pending || !journal.remoteRecoveryAvailable()}
              variant="outline"
              onClick={() => setConfirm(item)}
            >
              {item.state === 'committed'
                ? 'Finalizar recuperação remota'
                : 'Encerrar preparo remoto'}
            </Button>
          </li>
        ))}
      </ul>
      {cursor && (
        <Button disabled={loading} onClick={() => void load(cursor)}>
          Carregar mais pedidos remotos
        </Button>
      )}
      <Button
        disabled={loading || busy}
        variant="outline"
        onClick={() => {
          void refreshLocal();
          void load();
        }}
      >
        Consultar pedidos novamente
      </Button>
      <Dialog
        open={confirm !== null}
        children={
          <p>O rascunho protegido só será liberado após a confirmação deste encerramento.</p>
        }
        onClose={() => setConfirm(null)}
        title="Encerrar recuperação de lore?"
        description="Esta escolha não recupera texto. Um preparo ainda não aplicado será encerrado; um pedido já aplicado conserva sua alteração."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(null)}>
              Manter pedido
            </Button>
            <Button
              disabled={busy}
              variant="destructive"
              onClick={() => {
                const selected = confirm;
                setConfirm(null);
                if (selected && 'local' in selected) void closeLocal(selected.local);
                else if (selected) void resolveSelected(selected);
              }}
            >
              Confirmar encerramento do pedido
            </Button>
          </>
        }
      />
    </section>
  );
}
