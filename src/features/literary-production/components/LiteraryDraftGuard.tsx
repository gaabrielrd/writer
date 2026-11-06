import { useContext, useEffect } from 'react';
import { UNSAFE_DataRouterContext, useBlocker } from 'react-router';
import { Button, Dialog } from '@/shared/ui';

function RouterGuard({ dirty, pending }: { dirty: boolean; pending: boolean }) {
  const blocker = useBlocker(dirty || pending);
  useEffect(() => {
    if (!dirty && !pending && blocker.state === 'blocked') blocker.proceed();
  }, [dirty, pending, blocker]);
  if (blocker.state !== 'blocked') return null;
  return (
    <Dialog
      open
      title={pending ? 'Salvamento a confirmar' : 'Descartar alterações editoriais?'}
      description={
        pending
          ? 'Confirme o salvamento antes de sair desta área.'
          : 'As alterações ainda não salvas serão descartadas.'
      }
      onClose={() => blocker.reset()}
      footer={
        <>
          <Button variant="outline" onClick={() => blocker.reset()}>
            Continuar nesta área
          </Button>
          {!pending && (
            <Button variant="primary" onClick={() => blocker.proceed()}>
              Descartar e sair
            </Button>
          )}
        </>
      }
    >
      <p>
        {pending
          ? 'Aguarde a confirmação ou consulte a pendência.'
          : 'Você pode continuar editando antes de decidir.'}
      </p>
    </Dialog>
  );
}
export function LiteraryDraftGuard({ dirty, pending }: { dirty: boolean; pending: boolean }) {
  const router = useContext(UNSAFE_DataRouterContext);
  useEffect(() => {
    if (!dirty && !pending) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, pending]);
  return router ? <RouterGuard dirty={dirty} pending={pending} /> : null;
}
