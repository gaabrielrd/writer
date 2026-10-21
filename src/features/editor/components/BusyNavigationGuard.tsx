import { useContext, useEffect } from 'react';
import { UNSAFE_DataRouterContext, useBlocker } from 'react-router';
import { Button, Dialog } from '@/shared/ui';

interface NavigationGuardProps {
  busy: boolean;
  unsavedMessage?: string;
  allowDiscard?: boolean;
  discardLabel?: string;
}
function DataRouterGuard({
  busy,
  unsavedMessage,
  allowDiscard = true,
  discardLabel = 'Sair sem guardar',
}: NavigationGuardProps) {
  const blocker = useBlocker(busy || Boolean(unsavedMessage));
  useEffect(() => {
    if (busy && blocker.state === 'blocked') blocker.reset();
  }, [blocker, busy]);
  return !busy && blocker.state === 'blocked' && unsavedMessage ? (
    <Dialog
      open
      title="Texto ainda não confirmado"
      description={unsavedMessage}
      onClose={() => blocker.reset()}
      footer={
        <>
          <Button variant="outline" onClick={() => blocker.reset()}>
            Continuar escrevendo
          </Button>
          <Button disabled={!allowDiscard} onClick={() => blocker.proceed()}>
            {discardLabel}
          </Button>
        </>
      }
    >
      <p>Confira sua escolha antes de sair.</p>
    </Dialog>
  ) : null;
}

export function BusyNavigationGuard(props: NavigationGuardProps) {
  const busy = props.busy || Boolean(props.unsavedMessage);
  const router = useContext(UNSAFE_DataRouterContext);
  useEffect(() => {
    if (!busy) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busy]);
  return router ? <DataRouterGuard {...props} /> : null;
}
