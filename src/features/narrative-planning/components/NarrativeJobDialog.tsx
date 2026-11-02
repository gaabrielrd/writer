import { useEffect, useRef, useState } from 'react';
import { ErrorState, LoadingState } from '@/shared/ui';
import type {
  NarrativeJob,
  NarrativeJobProgress,
  NarrativeSource,
  NarrativeResource,
  NarrativeTarget,
} from '../model/narrative';
import {
  deleteNarrativeItem,
  getNarrativeItem,
  getNarrativeJob,
  prepareEntitySceneIndex,
  rebalanceNarrativeRanks,
} from '../services/narrativePlanningService';
import { useNarrativeResource } from '../hooks/useNarrativeResource';
import { NarrativeOperationDialog } from './NarrativeOperationDialog';
type JobChoice =
  | { kind: 'delete-item'; source: NarrativeSource; expectedRevision: number }
  | { kind: 'rebalance'; resource: NarrativeResource }
  | { kind: 'prepare-entity-scenes' };
export function NarrativeJobDialog({
  target,
  choice,
  operationId,
  onClose,
  onSuccess,
}: {
  target: NarrativeTarget;
  choice: JobChoice;
  operationId?: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const existing = useNarrativeResource('job:' + (operationId ?? 'new'), () =>
    operationId ? getNarrativeJob({ target, operationId }) : Promise.resolve(null),
  );
  if (existing.loading) return <LoadingState label="Carregando pedido original…" />;
  if (existing.error) return <ErrorState error={existing.error} onRetry={existing.retry} />;
  if (operationId && (!existing.value || existing.value.kind !== choice.kind))
    return (
      <ErrorState
        error="Pedido original indisponível. Atualize o planejamento antes de continuar."
        onRetry={existing.retry}
      />
    );
  return (
    <JobRun
      target={target}
      choice={choice}
      original={existing.value ?? undefined}
      onClose={onClose}
      onSuccess={onSuccess}
    />
  );
}
function JobRun({
  target,
  choice,
  original,
  onClose,
  onSuccess,
}: {
  target: NarrativeTarget;
  choice: JobChoice;
  original?: NarrativeJob;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [progress, setProgress] = useState<NarrativeJobProgress>(
    original?.progress ?? { complete: false, processed: 0 },
  );
  const [revision, setRevision] = useState(
    choice.kind === 'delete-item' ? choice.expectedRevision : 0,
  );
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const title = {
    'delete-item': 'Excluir item',
    rebalance: 'Reorganizar posições',
    'prepare-entity-scenes': 'Preparar cenas vinculadas',
  }[choice.kind];
  return (
    <NarrativeOperationDialog
      title={title}
      description={
        choice.kind === 'delete-item'
          ? 'A exclusão limpa referências próprias. Excluir um arco também exclui seus marcos; eventos independentes permanecem.'
          : 'Operação em lotes com progresso confirmado. A prosa permanece intacta.'
      }
      onClose={onClose}
      onSuccess={onSuccess}
      submitLabel={
        original
          ? 'Retomar operação'
          : choice.kind === 'delete-item'
            ? 'Confirmar exclusão'
            : 'Iniciar'
      }
      onCompare={
        choice.kind === 'delete-item' && !original
          ? async () => {
              const current = await getNarrativeItem({ target, source: choice.source });
              if (!current || current.deleting)
                throw new Error(
                  'Item indisponível. Atualize a lista para retomar uma exclusão em andamento.',
                );
              setRevision(current.revision);
            }
          : undefined
      }
      buildOperation={(operationId) => {
        const common = { target, operationId, limit: 50 };
        const job: NarrativeJob =
          original ??
          (choice.kind === 'delete-item'
            ? {
                kind: choice.kind,
                input: { ...common, source: choice.source, expectedRevision: revision },
                progress,
              }
            : choice.kind === 'rebalance'
              ? { kind: choice.kind, input: { ...common, resource: choice.resource }, progress }
              : { kind: choice.kind, input: common, progress });
        return async () => {
          let next: NarrativeJobProgress;
          do {
            if (!active.current) return;
            next =
              job.kind === 'delete-item'
                ? await deleteNarrativeItem(job.input)
                : job.kind === 'rebalance'
                  ? await rebalanceNarrativeRanks(job.input)
                  : await prepareEntitySceneIndex(job.input);
            if (active.current) setProgress(next);
          } while (!next.complete);
        };
      }}
    >
      {() => (
        <p role="status">
          {progress.processed.toLocaleString('pt-BR')} itens processados
          {progress.complete ? ' · Concluído' : ''}
        </p>
      )}
    </NarrativeOperationDialog>
  );
}
