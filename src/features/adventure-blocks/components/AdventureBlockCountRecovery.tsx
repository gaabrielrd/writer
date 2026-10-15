import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth';
import { Alert, Button, EmptyState, ErrorState, LoadingState } from '@/shared/ui';
import { blockErrorMessage, type AdventureBlockCountStatus } from '../model/adventureBlock';
import { getAdventureBlockCountStatus } from '../services/adventureBlockService';
import { useAdventureBlockMutation } from '../hooks/useAdventureBlockMutation';
import styles from './AdventureBlocks.module.css';
export interface AdventureBlockCountRecoveryProps {
  adventureId: string;
  sceneId: string;
  onRecovered?: () => void;
}
export function AdventureBlockCountRecovery(props: AdventureBlockCountRecoveryProps) {
  const { user } = useAuth();
  return user ? (
    <CountRecoverySession
      key={JSON.stringify([user.uid, props.adventureId, props.sceneId])}
      {...props}
    />
  ) : null;
}
function CountRecoverySession({
  adventureId,
  sceneId,
  onRecovered,
}: AdventureBlockCountRecoveryProps) {
  const { setPendingEditorOperation } = useAuth();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    value: AdventureBlockCountStatus | null;
    error: string;
  }>();
  const active = useRef(true);
  useLayoutEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const mutation = useAdventureBlockMutation(adventureId, sceneId);
  useEffect(() => {
    setPendingEditorOperation(mutation.busy || Boolean(mutation.pending));
    return () => setPendingEditorOperation(false);
  }, [mutation.busy, mutation.pending, setPendingEditorOperation]);
  useEffect(() => {
    let current = true;
    void getAdventureBlockCountStatus({ adventureId, sceneId })
      .then((value) => {
        if (!current) return;
        if (
          value &&
          (!Number.isSafeInteger(value.sceneRevision) ||
            value.sceneRevision < 0 ||
            !Number.isSafeInteger(value.structureRevision) ||
            value.structureRevision < 0 ||
            typeof value.needsVerification !== 'boolean' ||
            typeof value.repairable !== 'boolean' ||
            !/^[a-f0-9]{64}$/.test(value.mainBodyHash) ||
            (value.sceneWordCount !== null &&
              (!Number.isSafeInteger(value.sceneWordCount) || value.sceneWordCount < 0)))
        )
          throw new Error('Não foi possível verificar a situação da contagem.');
        setResult({ value, error: '' });
      })
      .catch((cause: unknown) => {
        if (current) setResult({ value: null, error: blockErrorMessage(cause) });
      });
    return () => {
      current = false;
    };
  }, [adventureId, sceneId, attempt]);
  const refresh = () => {
    setResult(undefined);
    mutation.clearConflict();
    setAttempt((value) => value + 1);
  };
  const verify = async (recovery: boolean) => {
    const operation = mutation.pending;
    if (!recovery && !result?.value) return;
    const value = recovery
      ? await mutation.recover()
      : await mutation.execute({
          method: 'verifyAdventureBlockCount',
          input: {
            adventureId,
            sceneId,
            operationId: crypto.randomUUID(),
            expectedSceneRevision: result!.value!.sceneRevision,
            limit: 25,
          },
        });
    if (value && active.current) {
      if (!recovery || operation?.method === 'verifyAdventureBlockCount') onRecovered?.();
      else refresh();
    }
  };
  if (!result) return <LoadingState label="Verificando a situação da contagem…" />;
  if (result.error)
    return (
      <ErrorState
        title="Não foi possível consultar a contagem"
        description={result.error}
        onRetry={refresh}
      />
    );
  if (!result.value)
    return (
      <EmptyState
        title="Cena indisponível"
        description="A cena não está disponível para esta conta."
      />
    );
  return (
    <section className={styles.navigator} aria-label="Recuperação da contagem da cena">
      <h2>Verificar contagem da cena</h2>
      <p>
        O texto não será apagado nem substituído. A verificação percorre os metadados dos blocos e
        confirma o total somente ao concluir.
      </p>
      <p className={styles.hint}>
        {result.value.sceneWordCount === null
          ? 'O total atual ainda não pôde ser confirmado.'
          : `Último total conhecido: ${result.value.sceneWordCount.toLocaleString('pt-BR')} palavras.`}
      </p>
      {!result.value.repairable && (
        <Alert variant="warning">
          Há metadados indisponíveis que impedem a verificação automática. Nenhum total foi zerado e
          nenhum texto foi alterado.
        </Alert>
      )}
      {mutation.error && <Alert variant="destructive">{mutation.error}</Alert>}
      {mutation.conflict && (
        <Alert variant="warning">
          A cena mudou durante a verificação. Confira a situação atual antes de iniciar outro
          pedido.
        </Alert>
      )}
      {mutation.busy && (
        <p role="status">
          Verificando metadados: {mutation.verificationProcessed ?? 0} blocos conferidos.
        </p>
      )}
      <div className={styles.actions}>
        {mutation.pending ? (
          <Button disabled={mutation.busy} onClick={() => void verify(true)}>
            {mutation.pending.method === 'verifyAdventureBlockCount'
              ? 'Retomar verificação pendente'
              : 'Confirmar operação pendente da cena'}
          </Button>
        ) : result.value.needsVerification ? (
          <Button
            disabled={mutation.busy || mutation.conflict || !result.value.repairable}
            onClick={() => void verify(false)}
          >
            Verificar contagem
          </Button>
        ) : (
          <Button onClick={onRecovered}>Tentar abrir a cena novamente</Button>
        )}
        <Button
          variant="outline"
          disabled={mutation.busy || Boolean(mutation.pending)}
          onClick={refresh}
        >
          Conferir situação atual
        </Button>
      </div>
    </section>
  );
}
