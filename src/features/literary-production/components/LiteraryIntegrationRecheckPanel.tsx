import { useEffect, useRef, useState } from 'react';
import { Alert, Button, LoadingState } from '@/shared/ui';
import { useAuth } from '@/features/auth';
import {
  startLiteraryIntegrationRecheck,
  getLiteraryIntegrationRecheck,
  advanceLiteraryIntegrationRecheck,
  cancelLiteraryIntegrationRecheck,
  cancelPendingLiteraryIntegrationRecheck,
  type IntegrationRecheck,
  type StartIntegrationRecheck,
} from '../services/literaryIntegrationRecheckService';
export function LiteraryIntegrationRecheckPanel({
  bookId,
  jobId,
  sourceToken,
  operationId,
  lastOperationId,
  disabled = false,
  onPendingChange,
  onRefresh,
}: {
  bookId: string;
  jobId: string;
  sourceToken: string;
  operationId?: string | null;
  lastOperationId?: string | null;
  disabled?: boolean;
  onPendingChange?: (value: boolean) => void;
  onRefresh?: () => void;
}) {
  const { user } = useAuth();
  const [pending, setPending] = useState<StartIntegrationRecheck | null>(null),
    [record, setRecord] = useState<IntegrationRecheck | null>(null);
  const [busy, setBusy] = useState(false),
    [canceling, setCanceling] = useState(false),
    [error, setError] = useState<string | null>(null);
  const epoch = useRef(0),
    working = useRef(false),
    sequence = useRef(0),
    pause = useRef(false);
  useEffect(() => {
    onPendingChange?.(pending !== null || busy || canceling);
  }, [pending, busy, canceling, onPendingChange]);
  useEffect(() => {
    const generation = ++epoch.current;
    return () => {
      epoch.current = generation + 1;
      pause.current = true;
    };
  }, [bookId, jobId, user?.uid]);
  const run = async (task: (current: number, runId: number) => Promise<void>) => {
    if (working.current || canceling || disabled) return;
    const current = epoch.current,
      runId = ++sequence.current;
    working.current = true;
    setBusy(true);
    setError(null);
    try {
      await task(current, runId);
    } catch (cause) {
      if (epoch.current === current && sequence.current === runId)
        setError(cause instanceof Error ? cause.message : 'Reconferência indisponível.');
    } finally {
      if (epoch.current === current && sequence.current === runId) {
        working.current = false;
        setBusy(false);
      }
    }
  };
  const start = () =>
    run(async (current, runId) => {
      const input = pending ?? {
        target: { kind: 'book' as const, id: bookId },
        operationId: crypto.randomUUID(),
        jobId,
        expectedSourceToken: sourceToken,
      };
      setPending(input);
      let result;
      try {
        result = await startLiteraryIntegrationRecheck(input, user?.uid ?? '');
      } catch (cause) {
        const code =
          typeof cause === 'object' && cause !== null && 'code' in cause ? String(cause.code) : '';
        if (
          epoch.current === current &&
          sequence.current === runId &&
          [
            'functions/invalid-argument',
            'functions/failed-precondition',
            'functions/not-found',
            'functions/unauthenticated',
            'functions/permission-denied',
            'functions/resource-exhausted',
          ].includes(code)
        )
          setPending(null);
        throw cause;
      }
      if (epoch.current === current && sequence.current === runId) {
        setPending(null);
        setRecord(result);
        onRefresh?.();
      }
    });
  const inspect = (id: string) =>
    run(async (current) => {
      const result = await getLiteraryIntegrationRecheck(bookId, id);
      if (epoch.current !== current) return;
      if (result.state === 'unconfirmed')
        throw new Error('Reconferência sem confirmação. Consulte novamente.');
      setRecord(result);
    });
  const resume = () =>
    run(async (current, runId) => {
      if (!record) return;
      pause.current = false;
      let latest = record;
      while (
        epoch.current === current &&
        sequence.current === runId &&
        !pause.current &&
        latest.state === 'scanning'
      ) {
        latest = await advanceLiteraryIntegrationRecheck(bookId, record.operationId);
        if (epoch.current === current && sequence.current === runId) setRecord(latest);
      }
      if (epoch.current === current && sequence.current === runId && latest.state !== 'scanning')
        onRefresh?.();
    });
  const cancel = async () => {
    const id = pending?.operationId ?? record?.operationId ?? operationId;
    if (!id || canceling || disabled) return;
    const current = epoch.current;
    pause.current = true;
    setCanceling(true);
    setError(null);
    try {
      const result = pending
        ? await cancelPendingLiteraryIntegrationRecheck(pending, user?.uid ?? '')
        : await cancelLiteraryIntegrationRecheck(bookId, id);
      if (epoch.current === current) {
        sequence.current++;
        working.current = false;
        setBusy(false);
        setPending(null);
        setRecord(result);
        onRefresh?.();
      }
    } catch (cause) {
      if (epoch.current === current)
        setError(cause instanceof Error ? cause.message : 'Cancelamento sem confirmação.');
    } finally {
      if (epoch.current === current) setCanceling(false);
    }
  };
  const locked = disabled || busy || canceling || pending !== null;
  return (
    <section aria-label="Reconferência das fontes da integração">
      <h3>Reconferir sem gerar novas análises</h3>
      <p>
        Compare organização, texto e fontes com o registro concluído. Se permanecerem equivalentes,
        as análises são preservadas; o aceite autoral é solicitado novamente.
      </p>
      {error && <Alert variant="destructive">{error}</Alert>}
      {busy && <LoadingState label="Reconferindo fontes e cobertura…" />}
      <Button
        variant="outline"
        disabled={disabled || busy || canceling || (!!operationId && !pending)}
        onClick={() => void start()}
      >
        {pending ? 'Recuperar registro de reconferência' : 'Registrar reconferência das fontes'}
      </Button>
      {(operationId || lastOperationId) && (
        <Button
          variant="outline"
          disabled={locked}
          onClick={() => void inspect((operationId ?? lastOperationId)!)}
        >
          Consultar reconferência registrada
        </Button>
      )}
      {busy && (
        <Button
          variant="outline"
          onClick={() => {
            pause.current = true;
          }}
        >
          Pausar após a conferência atual
        </Button>
      )}
      {(pending || operationId || record?.state === 'scanning') && (
        <Button variant="outline" disabled={disabled || canceling} onClick={() => void cancel()}>
          Cancelar reconferência
        </Button>
      )}
      {record && (
        <>
          <p>
            {record.selectedChapters} capítulos comparados · {record.verifiedUnits} fontes de texto
            · {record.verifiedAnalyses} análises conferidas
          </p>
          {record.architectureCompared !== undefined && (
            <p>{record.architectureCompared} fontes arquiteturais comparadas.</p>
          )}
          {record.state === 'scanning' && (
            <Button disabled={locked} onClick={() => void resume()}>
              Retomar reconferência até concluir
            </Button>
          )}
          {record.state === 'done' && (
            <Alert variant="success">
              A reconferência foi concluída sem gerar análises. Consulte o checkpoint atual para
              registrar seu aceite.
            </Alert>
          )}
          {record.state === 'changed' && (
            <Alert variant="warning">
              {record.impact?.message ?? 'Uma fonte mudou.'} Esta é a primeira divergência
              encontrada; outros impactos podem existir. Uma integração sucessora reaproveita apenas
              pedidos comprovadamente equivalentes.
            </Alert>
          )}
          {record.state === 'canceled' && (
            <Alert>Reconferência cancelada. As análises anteriores foram preservadas.</Alert>
          )}
        </>
      )}
    </section>
  );
}
