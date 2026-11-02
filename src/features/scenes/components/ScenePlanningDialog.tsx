import { useEffect, useRef, useState } from 'react';
import { Alert, ErrorState, Input, LoadingState, Textarea, Dropdown } from '@/shared/ui';
import type {
  SceneDocument,
  ScenePlanning,
  SceneProject,
  SceneSummary,
  SceneStage,
} from '../model/scene';
import { sceneStageLabels, sceneStages } from '../model/scene';
import { getScene, createScene, updateScene } from '../services/sceneService';
import { useSceneResource } from '../hooks/useSceneResource';
import { SceneOperationDialog } from './SceneOperationDialog';
import { SceneReferences } from './SceneReferences';
import styles from './Scenes.module.css';
const emptyPlanning: ScenePlanning = { objective: '', conflict: '', pointOfView: '' };
export function ScenePlanningDialog({
  target,
  parentId,
  scene,
  onClose,
  onSaved,
}: {
  target: SceneProject;
  parentId: string | null;
  scene?: SceneSummary;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<{
    title: string;
    planning: ScenePlanning;
    stage: SceneStage;
  } | null>(null);
  const [changedDocument, setChangedDocument] = useState<SceneDocument | null>(null);
  const [comparison, setComparison] = useState<SceneDocument | null>(null);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const source = useSceneResource('planning:' + String(scene?.id), async () => {
    if (!scene) return null;
    const current = await getScene({ target, sceneId: scene.id });
    if (!current) throw new Error('Esta cena está indisponível.');
    return current;
  });
  const document = changedDocument ?? source.value ?? null;
  const loading = Boolean(scene) && source.loading;
  const error = source.error;
  const values = draft ?? {
    title: source.value?.title ?? scene?.title ?? '',
    planning: source.value?.planning ?? emptyPlanning,
    stage: source.value?.stage ?? scene?.stage ?? 'planned',
  };
  const { title, planning, stage } = values;
  const setTitle = (title: string) => setDraft({ ...values, title });
  const setPlanning = (planning: ScenePlanning) => setDraft({ ...values, planning });
  const setStage = (stage: SceneStage) => setDraft({ ...values, stage });
  const valid =
    Boolean(title.trim()) &&
    title.length <= 300 &&
    !loading &&
    (!scene || Boolean(document)) &&
    Object.values(planning).every((text) => text.length <= 4000);
  return (
    <SceneOperationDialog
      title={scene ? 'Editar planejamento' : 'Nova cena'}
      description="O planejamento é privado. A prosa é escrita no editor da cena."
      valid={valid}
      onClose={onClose}
      onSuccess={onSaved}
      onCompare={
        scene
          ? async () => {
              const current = await getScene({
                target: { kind: target.kind, id: target.id },
                sceneId: scene.id,
              });
              if (!active.current) return;
              if (!current) throw new Error('Esta cena está indisponível.');
              setChangedDocument(current);
              setComparison(current);
            }
          : undefined
      }
      buildOperation={(operationId) => {
        if (scene && document) {
          const input = {
            target,
            sceneId: scene.id,
            operationId,
            expectedRevision: document.revision,
            patch: { title: title.trim(), planning: { ...planning }, stage },
          };
          return () => updateScene(input);
        }
        const input = {
          target,
          operationId,
          title: title.trim(),
          parentId,
          planning: { ...planning },
        };
        return () => createScene(input);
      }}
    >
      {(locked) => (
        <div className={styles.form}>
          {loading ? (
            <LoadingState label="Carregando planejamento…" />
          ) : error ? (
            <ErrorState error={error} onRetry={source.retry} />
          ) : (
            <>
              <Input
                label="Título da cena"
                value={title}
                maxLength={300}
                required
                disabled={locked}
                onChange={(event) => setTitle(event.target.value)}
              />
              <Textarea
                label="Objetivo"
                value={planning.objective}
                maxLength={4000}
                disabled={locked}
                onChange={(event) => setPlanning({ ...planning, objective: event.target.value })}
              />
              <Textarea
                label="Conflito"
                value={planning.conflict}
                maxLength={4000}
                disabled={locked}
                onChange={(event) => setPlanning({ ...planning, conflict: event.target.value })}
              />
              <Textarea
                label="Ponto de vista"
                value={planning.pointOfView}
                maxLength={4000}
                disabled={locked}
                onChange={(event) => setPlanning({ ...planning, pointOfView: event.target.value })}
              />
              {scene && (
                <Dropdown
                  mode="select"
                  label="Estado da cena"
                  value={stage}
                  disabled={locked}
                  options={sceneStages.map((value) => ({ value, label: sceneStageLabels[value] }))}
                  onValueChange={(value) => {
                    const selected = sceneStages.find((item) => item === value);
                    if (selected) setStage(selected);
                  }}
                />
              )}
              {comparison && (
                <Alert variant="info">
                  Versão remota {comparison.revision}: título “{comparison.title}”, estado{' '}
                  {sceneStageLabels[comparison.stage]}. Objetivo:{' '}
                  {comparison.planning.objective || 'Não informado'}. Conflito:{' '}
                  {comparison.planning.conflict || 'Não informado'}. Ponto de vista:{' '}
                  {comparison.planning.pointOfView || 'Não informado'}. Seu preenchimento acima foi
                  mantido.
                </Alert>
              )}
            </>
          )}
          {document && (
            <SceneReferences
              document={document}
              disabled={locked}
              onRevision={(current) =>
                setChangedDocument((previous) => ({ ...(previous ?? document), ...current }))
              }
            />
          )}
        </div>
      )}
    </SceneOperationDialog>
  );
}
