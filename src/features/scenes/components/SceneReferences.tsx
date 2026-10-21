import { useEffect, useRef, useState } from 'react';
import {
  listLoreEntities,
  useAdventureLoreContext,
  entityScope,
  loreEntityDocumentId,
  type LoreEntity,
  type LoreMentionEntity,
} from '@/features/lore';
import { Button, Dropdown, EmptyState, ErrorState, LoadingState } from '@/shared/ui';
import type { SceneDocument, SceneReference, SceneSummary } from '../model/scene';
import { getScene, listSceneReferences, setSceneReference } from '../services/sceneService';
import { sceneErrorMessage } from '../model/sceneError';
import { useScenePage } from '../hooks/useScenePage';
import { useSceneResource } from '../hooks/useSceneResource';
import { SceneOperationDialog } from './SceneOperationDialog';
import styles from './Scenes.module.css';
export function SceneReferences({
  document,
  disabled = false,
  onRevision,
}: {
  document: SceneDocument;
  disabled?: boolean;
  onRevision: (scene: SceneSummary) => void;
}) {
  const target = { kind: document.project.kind, id: document.project.id };
  const adventureLore = useAdventureLoreContext(target.kind === 'adventure' ? target.id : null);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const [version, setVersion] = useState(0);
  const [loadVersion, setLoadVersion] = useState(0);
  const [selected, setSelected] = useState('');
  const [operation, setOperation] = useState<{
    reference: SceneReference;
    name: string;
    remove: boolean;
  } | null>(null);
  const [revision, setRevision] = useState(document.revision);
  const references = useScenePage('refs:' + document.id + ':' + version, (cursor) =>
    listSceneReferences({ target, sceneId: document.id, cursor, limit: 25 }),
  );
  const lore = useSceneResource(
    'lore:' +
      target.kind +
      ':' +
      target.id +
      ':' +
      String(document.project.universeId) +
      ':' +
      loadVersion,
    async () => {
      if (target.kind === 'adventure') return { entities: [], error: '' };
      const requests = [];
      if (target.kind === 'book') requests.push(listLoreEntities({ kind: 'book', id: target.id }));
      if (document.project.universeId)
        requests.push(listLoreEntities({ kind: 'universe', id: document.project.universeId }));
      const results = await Promise.allSettled(requests);
      const entities: LoreEntity[] = results.flatMap((result) =>
        result.status === 'fulfilled' ? result.value : [],
      );
      const failed = results.find((result) => result.status === 'rejected');
      return {
        entities,
        error: failed?.status === 'rejected' ? sceneErrorMessage(failed.reason) : '',
      };
    },
  );
  const entities: LoreMentionEntity[] =
    target.kind === 'adventure' ? adventureLore.items : (lore.value?.entities ?? []);
  const loading = target.kind === 'adventure' ? adventureLore.loading : lore.loading;
  const error =
    target.kind === 'adventure' ? adventureLore.error : lore.error || lore.value?.error || '';
  const options = entities.map((entity) => {
    const scope = entityScope(entity);
    const reference: SceneReference = {
      kind: scope.kind,
      scopeId: scope.id,
      entityId: loreEntityDocumentId(scope, entity.id),
    };
    return {
      value: JSON.stringify(reference),
      label:
        entity.name +
        ' · ' +
        (scope.kind === 'book' ? 'Livro' : scope.kind === 'adventure' ? 'Aventura' : 'Universo'),
      reference,
    };
  });
  const selectedOption = options.find((option) => option.value === selected);
  return (
    <section className={styles.references} aria-label="Referências da cena">
      <h3>Referências</h3>
      <p className={styles.hint}>
        Vínculos por identidade com o lore autorizado. Referências removidas continuam identificadas
        como indisponíveis.
      </p>
      {references.loading && <LoadingState label="Carregando referências…" />}
      {references.error && (
        <ErrorState error={references.error} onRetry={() => void references.retry()} />
      )}
      {!references.loading && !references.error && references.items.length === 0 && (
        <EmptyState title="Nenhuma referência vinculada" />
      )}
      {references.items.map((stored) => {
        const current =
          target.kind === 'adventure'
            ? entities.find((entity) => {
                const scope = entityScope(entity);
                return (
                  scope.kind === stored.reference.kind &&
                  scope.id === stored.reference.scopeId &&
                  loreEntityDocumentId(scope, entity.id) === stored.reference.entityId
                );
              })
            : null;
        const item =
          target.kind === 'adventure'
            ? { ...stored, available: Boolean(current), name: current?.name }
            : stored;
        return (
          <div className={styles.actions} key={item.id}>
            <span>{item.available ? (item.name ?? 'Referência') : 'Referência indisponível'}</span>
            <Button
              variant="ghost"
              disabled={disabled}
              aria-label={`Remover referência ${item.available ? (item.name ?? 'vinculada') : 'indisponível'}`}
              onClick={() =>
                setOperation({
                  reference: item.reference,
                  name: item.available ? (item.name ?? 'Referência') : 'Referência indisponível',
                  remove: true,
                })
              }
            >
              Remover
            </Button>
          </div>
        );
      })}
      {references.cursor && (
        <Button
          variant="outline"
          disabled={references.loading || disabled}
          onClick={() => void references.more()}
        >
          Carregar mais referências
        </Button>
      )}
      {loading ? (
        <LoadingState label="Carregando lore autorizado…" />
      ) : (
        <>
          <Dropdown
            mode="select"
            label="Lore para vincular"
            placeholder="Selecione uma referência"
            value={selected}
            disabled={disabled}
            options={options}
            searchable
            onValueChange={setSelected}
          />
          <Button
            variant="outline"
            disabled={disabled || !selectedOption}
            onClick={() => {
              if (selectedOption)
                setOperation({
                  reference: selectedOption.reference,
                  name: selectedOption.label,
                  remove: false,
                });
            }}
          >
            Vincular referência
          </Button>
        </>
      )}
      {error && (
        <ErrorState
          title="Parte do lore está indisponível"
          error={error}
          onRetry={() =>
            target.kind === 'adventure'
              ? adventureLore.refresh()
              : setLoadVersion((value) => value + 1)
          }
        />
      )}

      {operation && (
        <SceneOperationDialog
          title={operation.remove ? 'Remover referência' : 'Vincular referência'}
          description={operation.name}
          submitLabel="Confirmar referência"
          onClose={() => setOperation(null)}
          onSuccess={() => {
            setOperation(null);
            setVersion((value) => value + 1);
            setSelected('');
          }}
          onCompare={async () => {
            const current = await getScene({ target, sceneId: document.id });
            if (!active.current) return;
            if (!current) throw new Error('Cena indisponível.');
            setRevision(current.revision);
            onRevision(current);
          }}
          buildOperation={(operationId) => {
            const input = {
              target,
              sceneId: document.id,
              operationId,
              expectedRevision: Math.max(revision, document.revision),
              reference: operation.reference,
              remove: operation.remove,
            };
            return async () => {
              const result = await setSceneReference(input);
              if (!active.current) return;
              setRevision(result.scene.revision);
              onRevision(result.scene);
            };
          }}
        >
          {() => <p>Este vínculo é privado e não será incluído na prosa publicada.</p>}
        </SceneOperationDialog>
      )}
    </section>
  );
}
