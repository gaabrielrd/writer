import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Alert, Button, Dialog, ErrorState, LoadingState } from '@/shared/ui';
import {
  createAdventurePersonaService,
  type AdventurePersonaRead,
} from '../services/editorChatPersonaService';
import type { EditorChatOperationRow } from '../model/editorChat';
import { PersonaBindingDialog } from './PersonaBindingDialog';

export interface AdventurePersonaDialogProps {
  uid: string;
  adventureId: string;
  sceneId: string | null;
  onClose: () => void;
  onChanged?: () => void;
  onPendingChange?: (pending: boolean) => void;
}
export function AdventurePersonaDialog(props: AdventurePersonaDialogProps) {
  return (
    <AdventurePersonaDialogSession
      key={JSON.stringify([props.uid, props.adventureId, props.sceneId])}
      {...props}
    />
  );
}
function AdventurePersonaDialogSession({
  uid,
  adventureId,
  sceneId,
  onClose,
  onChanged,
  onPendingChange,
}: AdventurePersonaDialogProps) {
  const identity = JSON.stringify([uid, adventureId, sceneId]);
  const alive = useRef(true);
  const callbacks = useRef({ onChanged, onPendingChange });
  useLayoutEffect(() => {
    callbacks.current = { onChanged, onPendingChange };
  }, [onChanged, onPendingChange]);
  useLayoutEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const service = useRef<ReturnType<typeof createAdventurePersonaService> | null>(null);
  const [state, setState] = useState<{
    identity: string;
    data: AdventurePersonaRead | null;
    error: string | null;
  }>({
    identity,
    data: null,
    error: null,
  });
  const [pending, setPending] = useState<EditorChatOperationRow | null>(null);
  const [busy, setBusy] = useState(true);
  const working = useRef(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const report = (value: boolean) => callbacks.current.onPendingChange?.(value);
  useEffect(() => {
    let active = true;
    const check = () => {
      if (!active || !alive.current) throw new Error('O vínculo aberto mudou.');
    };
    working.current = true;
    report(true);
    let current: ReturnType<typeof createAdventurePersonaService> | undefined;
    let stop: (() => void) | undefined;
    void Promise.resolve()
      .then(async () => {
        check();
        current = createAdventurePersonaService({
          uid,
          adventureId,
          sceneId,
          check,
          onInvalidated: () => {
            if (!active || !alive.current) return;
            setState({
              identity,
              data: null,
              error: 'A conta mudou. Feche esta janela e abra novamente.',
            });
            setBusy(false);
            working.current = false;
            report(false);
          },
        });
        service.current = current;
        const sync = () => {
          check();
          const row = current!.pending();
          setPending(row);
          report(Boolean(row) || working.current);
        };
        stop = current.subscribe(sync);
        const data = await current.load();
        check();
        setState({ identity, data, error: null });
        sync();
      })
      .catch((cause: unknown) => {
        if (!active || !alive.current) return;
        setState({
          identity,
          data: null,
          error: cause instanceof Error ? cause.message : 'Vínculo indisponível.',
        });
      })
      .finally(() => {
        if (active && alive.current) {
          setBusy(false);
          working.current = false;
          try {
            const row = current?.pending() ?? null;
            setPending(row);
            report(Boolean(row));
          } catch {
            report(false);
          }
        }
      });
    return () => {
      active = false;
      stop?.();
      current?.dispose();
      if (service.current === current) service.current = null;
      report(false);
    };
  }, [identity, uid, adventureId, sceneId, attempt]);
  const visible = state.identity === identity ? state : null;
  const syncPending = () => {
    const row = service.current?.pending() ?? null;
    setPending(row);
    report(Boolean(row) || working.current);
  };
  const recover = async (intent: 'observe' | 'cancel') => {
    const current = service.current;
    if (!current) return;
    setBusy(true);
    working.current = true;
    report(true);
    setNotice(null);
    try {
      const result = await current.recover(intent);
      if (service.current !== current || !alive.current) return;
      if (result.state === 'settled') {
        setNotice(
          result.receipt.outcome === 'confirmed'
            ? 'Pedido confirmado. Confira o vínculo atual antes de salvar novamente; sua seleção foi mantida.'
            : 'Pedido cancelado. Sua seleção foi mantida.',
        );
        if (result.receipt.outcome === 'confirmed') callbacks.current.onChanged?.();
      } else setNotice('O pedido continua sem confirmação. Nenhum vínculo foi reenviado.');
    } catch (cause) {
      if (service.current === current && alive.current)
        setNotice(
          cause instanceof Error ? cause.message : 'Não foi possível conferir a pendência.',
        );
    } finally {
      if (service.current === current && alive.current) {
        setBusy(false);
        working.current = false;
        try {
          syncPending();
        } catch {
          report(false);
        }
      }
    }
  };
  const reload = async () => {
    const current = service.current;
    if (!current) return;
    setBusy(true);
    working.current = true;
    report(true);
    try {
      const data = await current.load();
      if (service.current === current && alive.current) {
        setState({ identity, data, error: null });
        setNotice(
          'Vínculo atual conferido. Sua seleção e seus ajustes foram mantidos; salvar usará esta confirmação.',
        );
      }
    } catch (cause) {
      if (service.current === current && alive.current)
        setNotice(cause instanceof Error ? cause.message : 'Não foi possível conferir o vínculo.');
    } finally {
      if (service.current === current && alive.current) {
        setBusy(false);
        working.current = false;
        try {
          syncPending();
        } catch {
          report(false);
        }
      }
    }
  };
  const title = sceneId === null ? 'Persona da aventura' : 'Persona complementar da cena';
  const close = () => {
    if (busy || pending?.action === 'setAdventurePersonaBinding') {
      setNotice('Confira ou cancele o pedido pendente antes de fechar esta janela.');
      return;
    }
    onClose();
  };
  const pendingControls = (
    <div className="space-y-3">
      {pending && (
        <Alert variant="warning">
          Há um pedido pendente. Confira ou cancele o pedido original antes de salvar outro vínculo.
          {pending.action !== 'setAdventurePersonaBinding' &&
            ' Abra o chat para conferir esta pendência.'}
        </Alert>
      )}
      {notice && <Alert variant="info">{notice}</Alert>}
      <div className="flex flex-wrap gap-2">
        {pending?.action === 'setAdventurePersonaBinding' && (
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => void recover('observe')}
            >
              Conferir pendência
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => void recover('cancel')}
            >
              Cancelar pendência
            </Button>
          </>
        )}
        <Button
          type="button"
          variant="secondary"
          className="h-auto min-h-11 max-w-full whitespace-normal"
          disabled={busy || Boolean(pending)}
          onClick={() => void reload()}
        >
          Conferir vínculo atual e manter ajustes
        </Button>
      </div>
    </div>
  );
  if (!visible?.data)
    return (
      <Dialog open title={title} onClose={close}>
        {visible?.error ? (
          <ErrorState
            description={visible.error}
            action={
              <Button
                onClick={() => {
                  setState({ identity, data: null, error: null });
                  setBusy(true);
                  setAttempt((n) => n + 1);
                }}
              >
                Tentar novamente
              </Button>
            }
          />
        ) : (
          <LoadingState label="Carregando vínculo da persona..." />
        )}
        {pendingControls}
      </Dialog>
    );
  const data = visible.data;
  return (
    <PersonaBindingDialog
      key={identity}
      scope="adventure"
      ownerId={uid}
      title={title}
      mode={sceneId === null ? 'book' : 'chapter'}
      bookPersonaId={'personaId' in data.base.value ? data.base.value.personaId : null}
      complement={
        'personaComplement' in data.binding.value ? data.binding.value.personaComplement : null
      }
      onClose={close}
      onSave={async (personaId, personaComplement) => {
        const current = service.current;
        if (!current || busy) throw new Error('Aguarde a confirmação atual.');
        setBusy(true);
        working.current = true;
        report(true);
        try {
          const result = await current.save(
            sceneId === null ? { personaId } : { personaComplement },
          );
          if (service.current !== current || !alive.current)
            throw new Error('O vínculo aberto mudou.');
          if (result.receipt.outcome !== 'confirmed' || !result.current)
            throw new Error('Confira o resultado do pedido antes de continuar.');
          callbacks.current.onChanged?.();
        } finally {
          if (service.current === current && alive.current) {
            setBusy(false);
            working.current = false;
            try {
              syncPending();
            } catch {
              report(false);
            }
          }
        }
      }}
      navigation={
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {sceneId === null
              ? 'A base orienta as cenas da aventura. Cada cena pode ter um complemento; seus blocos herdam essa composição.'
              : 'Os blocos desta cena herdam a base da aventura e os ajustes da cena.'}
          </p>
          {pendingControls}
        </div>
      }
    />
  );
}
