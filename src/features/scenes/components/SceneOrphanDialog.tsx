import { useState } from 'react';
import { renderRichText } from '@/shared/lib';
import { Alert, Button, Dialog, EmptyState, ErrorState, LoadingState } from '@/shared/ui';
import type { SceneProject, SceneSummary } from '../model/scene';
import { getScene, listOrphanScenes, recoverOrphanScene } from '../services/sceneService';
import { useScenePage } from '../hooks/useScenePage';
import { useSceneResource } from '../hooks/useSceneResource';
import { SceneOperationDialog } from './SceneOperationDialog';
import styles from './Scenes.module.css';

export function SceneOrphanDialog({
  target,
  onClose,
  onRecovered,
}: {
  target: SceneProject;
  onClose: () => void;
  onRecovered: () => void;
}) {
  const [selected, setSelected] = useState<SceneSummary | null>(null),
    [version, setVersion] = useState(0);
  const page = useScenePage('orphan-scenes:' + version, (cursor) =>
    listOrphanScenes({ target, cursor, limit: 25 }),
  );
  if (selected)
    return (
      <OrphanReview
        key={selected.id}
        target={target}
        scene={selected}
        onClose={() => setSelected(null)}
        onRecovered={() => {
          setSelected(null);
          setVersion((v) => v + 1);
          onRecovered();
        }}
      />
    );
  return (
    <Dialog
      open
      onClose={onClose}
      title="Cenas sem parte disponível"
      description="Localize cenas cuja parte anterior não existe mais. Nenhuma alteração é feita ao abrir esta lista."
      footer={
        <Button variant="secondary" onClick={onClose}>
          Fechar
        </Button>
      }
    >
      <div className={styles.planner}>
        {page.loading && <LoadingState label="Procurando cenas sem parte disponível…" />}
        {page.error && <ErrorState error={page.error} onRetry={() => void page.retry()} />}
        {!page.loading && !page.error && !page.items.length && (
          <EmptyState
            title="Nenhuma cena encontrada nesta página"
            description={
              page.cursor
                ? 'Continue a busca nas próximas páginas.'
                : 'Não há outras cenas sem parte disponível.'
            }
          />
        )}
        {page.items.map((scene) => (
          <article className={styles.card} key={scene.id}>
            <h3>{scene.title}</h3>
            <p>
              {scene.archived ? 'Arquivada' : 'Ativa'} · {scene.wordCount} palavras
            </p>
            <Button variant="outline" onClick={() => setSelected(scene)}>
              Conferir {scene.title}
            </Button>
          </article>
        ))}
        {page.cursor && (
          <Button variant="outline" disabled={page.loading} onClick={() => void page.more()}>
            Continuar busca
          </Button>
        )}
      </div>
    </Dialog>
  );
}
function OrphanReview({
  target,
  scene,
  onClose,
  onRecovered,
}: {
  target: SceneProject;
  scene: SceneSummary;
  onClose: () => void;
  onRecovered: () => void;
}) {
  const resource = useSceneResource('orphan-preview:' + scene.id, () =>
    getScene({ target, sceneId: scene.id }),
  );
  const current = resource.value;
  if (resource.loading || resource.error || !current || current.parentId === null)
    return (
      <Dialog
        open
        onClose={onClose}
        title="Conferir recuperação"
        footer={
          <Button variant="secondary" onClick={onClose}>
            Voltar
          </Button>
        }
      >
        {resource.loading ? (
          <LoadingState label="Carregando texto da cena…" />
        ) : resource.error ? (
          <ErrorState error={resource.error} onRetry={resource.retry} />
        ) : (
          <Alert variant="warning">
            A cena mudou ou não está mais disponível nesta lista. Volte e atualize o planejamento.
          </Alert>
        )}
      </Dialog>
    );
  const observed = {
    target,
    sceneId: current.id,
    expectedRevision: current.revision,
    expectedMissingParentId: current.parentId,
  };
  return (
    <SceneOperationDialog
      title={'Recuperar ' + current.title}
      description="Mover para Sem parte preserva texto, blocos, histórico e a referência à parte anterior. A cena mantém seu estado de arquivo."
      submitLabel="Mover para Sem parte"
      buildOperation={(operationId) => () => recoverOrphanScene({ ...observed, operationId })}
      onSuccess={onRecovered}
      onClose={onClose}
    >
      {() => (
        <section
          aria-label="Texto da cena a recuperar"
          className={styles.preservedPart}
          dangerouslySetInnerHTML={{ __html: renderRichText(current.content) }}
        />
      )}
    </SceneOperationDialog>
  );
}
