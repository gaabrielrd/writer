import { useState } from 'react';
import { Alert, Button, Dialog } from '@/shared/ui';
import type { PendingSessionReference } from '../model/sessionReference';
import type { useSessionReferenceOperation } from '../hooks/useSessionReferenceOperation';
export function ReferenceRecoveryActions({
  op,
}: {
  op: ReturnType<typeof useSessionReferenceOperation>;
}) {
  const [expected, setExpected] = useState<PendingSessionReference | null>(null);
  return (
    <>
      {op.error && <Alert variant="warning">{op.error}</Alert>}
      {op.notice && <p role="status">{op.notice}</p>}
      {!op.locksAvailable && (
        <Alert variant="warning">
          A leitura continua disponível. Este navegador não permite reservar pedidos de vínculo com
          segurança.
        </Alert>
      )}
      {op.pending && (
        <Alert variant="warning">
          <p>Há um pedido de vínculo aguardando confirmação. O controle original foi preservado.</p>
          <Button disabled={op.busy} onClick={() => void op.recover(op.pending!)}>
            {op.pending.intent === 'cancel'
              ? 'Confirmar encerramento do pedido'
              : 'Confirmar pedido de vínculo'}
          </Button>
          <Button
            variant="outline"
            disabled={op.busy || op.pending.intent === 'cancel'}
            onClick={() => setExpected(structuredClone(op.pending!))}
          >
            Encerrar pedido de vínculo
          </Button>
        </Alert>
      )}
      <Dialog
        open={!!expected}
        onClose={() => setExpected(null)}
        title="Encerrar pedido de vínculo?"
        description="Se o pedido já foi confirmado, o vínculo não será desfeito. Se não chegou, este pedido será impedido de executar."
        footer={
          <>
            <Button variant="outline" onClick={() => setExpected(null)}>
              Manter pedido de vínculo
            </Button>
            <Button
              disabled={op.busy}
              onClick={() => {
                const value = expected;
                setExpected(null);
                if (value) void op.cancel(value);
              }}
            >
              Confirmar encerramento do vínculo
            </Button>
          </>
        }
      >
        Somente o pedido mostrado será conferido. Nenhum texto de ficha é necessário para esta
        confirmação.
      </Dialog>
    </>
  );
}
