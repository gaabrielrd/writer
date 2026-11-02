import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, Button, Dialog } from '@/shared/ui';
import {
  isNarrativeConflict,
  isNarrativeFailureDefinitive,
  narrativeErrorMessage,
} from '../model/narrativeError';
export function NarrativeOperationDialog({
  title,
  description,
  submitLabel = 'Salvar',
  valid = true,
  buildOperation,
  onSuccess,
  onClose,
  onCompare,
  children,
}: {
  title: string;
  description: string;
  submitLabel?: string;
  valid?: boolean;
  buildOperation: (operationId: string) => () => Promise<unknown>;
  onSuccess: () => void;
  onClose: () => void;
  onCompare?: () => Promise<void>;
  children: (locked: boolean) => ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<(() => Promise<unknown>) | null>(null);
  const running = useRef(false);
  const active = useRef(true);
  const feedback = useRef<HTMLDivElement>(null);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const submit = async () => {
    if (running.current || conflict || !valid) return;
    const run = request.current ?? buildOperation(crypto.randomUUID());
    request.current = run;
    running.current = true;
    setBusy(true);
    setError('');
    try {
      await run();
      if (active.current) {
        request.current = null;
        setUncertain(false);
        onSuccess();
      }
    } catch (failure) {
      if (!active.current) return;
      const definite = isNarrativeFailureDefinitive(failure);
      setUncertain(!definite);
      setConflict(isNarrativeConflict(failure));
      setError(narrativeErrorMessage(failure));
      if (definite) request.current = null;
      requestAnimationFrame(() => feedback.current?.focus());
    } finally {
      running.current = false;
      if (active.current) setBusy(false);
    }
  };
  const compare = async () => {
    if (!onCompare || running.current) return;
    running.current = true;
    setBusy(true);
    try {
      await onCompare();
      if (active.current) {
        request.current = null;
        setConflict(false);
        setError('Dados atuais carregados. Confira os valores antes de confirmar novamente.');
      }
    } catch (failure) {
      if (active.current) setError(narrativeErrorMessage(failure));
    } finally {
      running.current = false;
      if (active.current) setBusy(false);
    }
  };
  return (
    <Dialog
      open
      title={title}
      description={description}
      onClose={() => {
        if (!busy && !uncertain) onClose();
      }}
      footer={
        <>
          <Button variant="outline" disabled={busy || uncertain} onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={busy || conflict || !valid} onClick={() => void submit()}>
            {busy ? 'Confirmando…' : uncertain ? 'Tentar novamente' : submitLabel}
          </Button>
        </>
      }
    >
      {children(busy || uncertain || conflict)}
      {error && (
        <div ref={feedback} tabIndex={-1}>
          <Alert variant="destructive">{error}</Alert>
        </div>
      )}
      {uncertain && (
        <Alert variant="warning">
          A resposta não foi confirmada. Tente novamente com o mesmo pedido para evitar duplicação.
        </Alert>
      )}
      {conflict && (
        <>
          <Alert variant="warning">
            O item ou sua ordem mudou. Seu preenchimento foi preservado.
          </Alert>
          {onCompare && (
            <Button variant="outline" disabled={busy} onClick={() => void compare()}>
              Comparar com dados atuais
            </Button>
          )}
        </>
      )}
    </Dialog>
  );
}
