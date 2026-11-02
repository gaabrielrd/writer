import { useEffect, useState } from 'react';
import { Alert, Dialog, LoadingState } from '@/shared/ui';
import { adventureLoreEntity, type AdventureLoreDetail } from '../model/adventureLore';
import type { LoreEntity } from '../model/loreEntity';
import { useAdventureLoreContext } from '../hooks/useAdventureLoreContext';
import { loreMessage } from '../services/adventureLoreService';
import { LoreDrawer } from './LoreDrawer';
export function AdventureLoreReader({
  adventureId,
  entityId,
  onClose,
  onEdit,
}: {
  adventureId: string;
  entityId: string;
  onClose: () => void;
  onEdit?: (entity: LoreEntity) => void;
}) {
  const context = useAdventureLoreContext(adventureId),
    [result, setResult] = useState<{
      entityId: string;
      generation: number;
      item: AdventureLoreDetail;
    } | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    const snapshot = context.context;
    if (!snapshot) return;
    let current = true;
    queueMicrotask(() => {
      if (!current || !context.isCurrent(snapshot)) return;
      setError('');
      const row = snapshot.items.find((item) => item.id === entityId);
      if (!row) {
        setError('Ficha indisponível.');
        return;
      }
      void context
        .get(row)
        .then((value) => {
          if (current && value && context.isCurrent(snapshot))
            setResult({ entityId, generation: snapshot.generation, item: value.item });
        })
        .catch((cause) => {
          if (current && context.isCurrent(snapshot)) setError(loreMessage(cause));
        });
    });
    return () => {
      current = false;
    };
  }, [context.context, entityId]); // eslint-disable-line react-hooks/exhaustive-deps
  const item =
    result &&
    result.entityId === entityId &&
    context.context &&
    context.isCurrent(context.context) &&
    result.generation === context.context.generation
      ? result.item
      : null;
  if (!item)
    return (
      <Dialog open title="Conferindo lore autorizado" onClose={onClose}>
        {context.error || error ? (
          <Alert variant="warning">{context.error || error}</Alert>
        ) : (
          <LoadingState label="Conferindo ficha completa…" />
        )}
      </Dialog>
    );
  return (
    <LoreDrawer
      open
      entity={adventureLoreEntity(item)}
      allEntities={context.items}
      onClose={onClose}
      onEdit={item.reference.kind === 'adventure' ? onEdit : undefined}
    />
  );
}
