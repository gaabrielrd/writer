import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Dropdown, ErrorState, LoadingState } from '@/shared/ui';
import type { SceneProject, SceneSummary } from '../model/scene';
import {
  getScene,
  getSceneGroup,
  listSceneGroups,
  listScenes,
  moveScene,
} from '../services/sceneService';
import { useSceneResource } from '../hooks/useSceneResource';
import { useScenePage } from '../hooks/useScenePage';
import { SceneOperationDialog } from './SceneOperationDialog';
import styles from './Scenes.module.css';
export function SceneMoveDialog({
  target,
  scene,
  onClose,
  onSaved,
}: {
  target: SceneProject;
  scene: SceneSummary;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [destination, setDestination] = useState(scene.parentId ?? '');
  const [placement, setPlacement] = useState('end');
  const [neighbor, setNeighbor] = useState('');
  const [current, setCurrent] = useState(scene);
  const active = useRef(true);
  const groups = useScenePage('move-groups', (cursor) =>
    listSceneGroups({ target, cursor, limit: 25 }),
  );
  const neighbors = useScenePage('move-neighbors:' + destination, (cursor) =>
    listScenes({
      target,
      parentId: destination || null,
      stage: 'all',
      archived: false,
      cursor,
      limit: 25,
    }),
  );
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const metadata = useSceneResource(
    'destination:' + destination + ':' + String(current.parentId) + ':' + current.revision,
    async () => {
      const [source, dest] = await Promise.all([
        getSceneGroup({ target, parentId: current.parentId }),
        getSceneGroup({ target, parentId: destination || null }),
      ]);
      if (!source || !dest) throw new Error('Destino indisponível.');
      return { source: source.group, dest: dest.group };
    },
  );
  const sourceGroup = metadata.value?.source ?? null;
  const targetGroup = metadata.value?.dest ?? null;
  const loading = metadata.loading;
  const error = metadata.error;
  const refresh = async () => {
    const document = await getScene({ target, sceneId: current.id });
    if (!active.current) return;
    if (!document) throw new Error('Cena indisponível.');
    setCurrent(document);
    metadata.retry();
  };
  const destinations = groups.items.filter(
    (group) => group.id && group.contentMode === 'scenes' && !group.deleting && !group.rebalancing,
  );
  const valid =
    !loading &&
    !error &&
    Boolean(sourceGroup && targetGroup) &&
    targetGroup?.contentMode === 'scenes' &&
    !targetGroup.deleting &&
    !targetGroup.rebalancing &&
    (placement === 'end' || Boolean(neighbor));
  return (
    <SceneOperationDialog
      title="Mover cena"
      description={`Mover “${scene.title}” preserva sua prosa e suas referências. A ordem escolhida compõe o manuscrito.`}
      submitLabel="Mover cena"
      valid={valid}
      onClose={onClose}
      onSuccess={onSaved}
      onCompare={refresh}
      buildOperation={(operationId) => {
        if (!sourceGroup || !targetGroup) throw new Error('Destino indisponível.');
        const input = {
          target,
          sceneId: current.id,
          operationId,
          expectedRevision: current.revision,
          parentId: destination || null,
          expectedSourceStructureRevision: sourceGroup.structureRevision,
          expectedTargetStructureRevision: targetGroup.structureRevision,
          ...(placement === 'before'
            ? { beforeId: neighbor }
            : placement === 'after'
              ? { afterId: neighbor }
              : {}),
        };
        return () => moveScene(input);
      }}
    >
      {(locked) => (
        <div className={styles.form}>
          <Dropdown
            mode="select"
            label="Destino"
            value={destination}
            disabled={locked}
            options={[
              { value: '', label: target.kind === 'book' ? 'Sem capítulo' : 'Sem parte' },
              ...destinations.map((group) => ({ value: group.id ?? '', label: group.title })),
            ]}
            onValueChange={(value) => {
              setDestination(value);
              setNeighbor('');
            }}
          />
          {groups.loading && <LoadingState label="Carregando destinos…" />}
          {groups.error && <ErrorState error={groups.error} onRetry={() => void groups.retry()} />}
          {groups.cursor && (
            <Button
              variant="outline"
              disabled={locked || groups.loading}
              onClick={() => void groups.more()}
            >
              Carregar mais destinos
            </Button>
          )}
          <Dropdown
            mode="select"
            label="Posição"
            value={placement}
            disabled={locked}
            options={[
              { value: 'end', label: 'No final' },
              { value: 'before', label: 'Antes de outra cena' },
              { value: 'after', label: 'Depois de outra cena' },
            ]}
            onValueChange={(value) => {
              setPlacement(value);
              setNeighbor('');
            }}
          />
          {placement !== 'end' && (
            <>
              <Dropdown
                mode="select"
                label="Cena de referência da posição"
                value={neighbor}
                disabled={locked}
                placeholder="Escolha uma cena"
                options={neighbors.items
                  .filter((item) => item.id !== scene.id)
                  .map((item) => ({ value: item.id, label: item.title }))}
                onValueChange={setNeighbor}
              />
              {neighbors.loading && <LoadingState label="Carregando cenas do destino…" />}
              {neighbors.error && (
                <ErrorState error={neighbors.error} onRetry={() => void neighbors.retry()} />
              )}
              {neighbors.cursor && (
                <Button
                  variant="outline"
                  disabled={locked || neighbors.loading}
                  onClick={() => void neighbors.more()}
                >
                  Carregar mais cenas do destino
                </Button>
              )}
            </>
          )}
          {loading && <LoadingState label="Verificando ordem atual…" />}
          {error && (
            <ErrorState error={error} onRetry={() => void refresh().catch(() => undefined)} />
          )}
          {targetGroup && (
            <Alert variant="info">
              Destino: {targetGroup.title}.{' '}
              {destination
                ? 'A cena ativa contribuirá para esse manuscrito.'
                : 'A prosa fica guardada sem entrar na composição.'}
            </Alert>
          )}
        </div>
      )}
    </SceneOperationDialog>
  );
}
