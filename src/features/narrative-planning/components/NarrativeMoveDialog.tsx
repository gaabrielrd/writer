import { useState } from 'react';
import { Button, Dropdown, ErrorState, LoadingState } from '@/shared/ui';
import type {
  NarrativeItem,
  NarrativePage,
  NarrativeSummary,
  NarrativeTarget,
} from '../model/narrative';
import { narrativeResource, narrativeSource } from '../model/narrative';
import {
  getNarrativeItem,
  listNarrativeItems,
  moveNarrativeItem,
} from '../services/narrativePlanningService';
import { useNarrativePage } from '../hooks/useNarrativePage';
import { NarrativeOperationDialog } from './NarrativeOperationDialog';
export function NarrativeMoveDialog({
  target,
  item,
  onClose,
  onSuccess,
}: {
  target: NarrativeTarget;
  item: NarrativeItem;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [version, setVersion] = useState(0);
  const [revision, setRevision] = useState(item.revision);
  const [neighbor, setNeighbor] = useState('');
  const [position, setPosition] = useState('before');
  const resource = narrativeResource(item);
  const neighbors = useNarrativePage<NarrativeSummary, NarrativePage<NarrativeSummary>>(
    'move:' + version,
    (cursor) => listNarrativeItems({ target, resource, cursor, limit: 25 }),
    (value) => value.id,
  );
  const options = neighbors.items
    .filter((value) => value.id !== item.id && !value.deleting)
    .map((value) => ({ value: value.id, label: value.title }));
  const sequence = neighbors.page?.sequence;
  return (
    <NarrativeOperationDialog
      title="Mover item"
      description="A posição muda somente nesta sequência de planejamento."
      valid={
        Boolean(neighbor) &&
        options.some((value) => value.value === neighbor) &&
        Boolean(sequence) &&
        !sequence?.rebalancing &&
        !neighbors.loading &&
        !neighbors.error
      }
      onClose={onClose}
      onSuccess={onSuccess}
      onCompare={async () => {
        const current = await getNarrativeItem({ target, source: narrativeSource(item) });
        if (!current || current.deleting) throw new Error('Item indisponível.');
        setRevision(current.revision);
        setVersion((value) => value + 1);
        setNeighbor('');
      }}
      buildOperation={(operationId) => {
        const input = {
          target,
          source: narrativeSource(item),
          operationId,
          expectedRevision: revision,
          expectedStructureRevision: sequence?.structureRevision ?? 0,
          ...(position === 'before' ? { beforeId: neighbor } : { afterId: neighbor }),
        };
        return () => moveNarrativeItem(input);
      }}
    >
      {(locked) => (
        <>
          {neighbors.loading && <LoadingState label="Carregando posições…" />}
          {neighbors.error && <ErrorState error={neighbors.error} onRetry={neighbors.retry} />}
          <Dropdown
            mode="select"
            label="Item vizinho"
            options={options}
            value={neighbor}
            onValueChange={setNeighbor}
            disabled={locked || neighbors.loading}
            searchable
          />
          <Dropdown
            mode="select"
            label="Posição"
            options={[
              { value: 'before', label: 'Antes' },
              { value: 'after', label: 'Depois' },
            ]}
            value={position}
            onValueChange={setPosition}
            disabled={locked}
          />
          {neighbors.cursor && (
            <Button
              variant="outline"
              disabled={locked || neighbors.loading}
              onClick={() => void neighbors.more()}
            >
              Carregar mais posições
            </Button>
          )}
          {sequence?.rebalancing && (
            <p>
              Esta sequência está em reorganização. Retome a reorganização antes de mover itens.
            </p>
          )}
        </>
      )}
    </NarrativeOperationDialog>
  );
}
