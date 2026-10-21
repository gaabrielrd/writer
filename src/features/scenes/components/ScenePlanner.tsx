import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Archive, Columns3, List, Plus, ArrowUpDown, FileText } from 'lucide-react';
import { useAuth } from '@/features/auth';
import {
  Alert,
  Badge,
  Button,
  Dropdown,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
} from '@/shared/ui';
import type {
  SceneJob,
  SceneGroupDetail,
  SceneProject,
  SceneStage,
  SceneSummary,
} from '../model/scene';
import { sceneRoute, sceneStageLabels, sceneStages } from '../model/scene';
import {
  archiveScene,
  convertChapterToScenes,
  createSceneGroup,
  deleteSceneGroup,
  deleteSceneGroups,
  getSceneJob,
  getScene,
  getSceneGroup,
  listSceneGroups,
  listScenes,
  rebalanceSceneRanks,
  updateScene,
} from '../services/sceneService';
import { useScenePage } from '../hooks/useScenePage';
import { useSceneResource } from '../hooks/useSceneResource';
import { SceneOperationDialog } from './SceneOperationDialog';
import { ScenePlanningDialog } from './ScenePlanningDialog';
import { SceneMoveDialog } from './SceneMoveDialog';
import styles from './Scenes.module.css';
export interface ScenePlannerProps {
  target: SceneProject;
  projectTitle?: string;
  initialParentId?: string | null;
  onManuscriptChange?: () => void;
}
export function ScenePlanner(props: ScenePlannerProps) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingState label="Carregando conta…" />;
  if (!user) return <EmptyState title="Entre para planejar suas cenas" />;
  return (
    <ScenePlannerSession
      key={user.uid + ':' + props.target.kind + ':' + props.target.id}
      {...props}
    />
  );
}
type Action =
  | { kind: 'create' | 'edit' | 'move'; scene?: SceneSummary }
  | { kind: 'archive' | 'stage'; scene: SceneSummary }
  | { kind: 'group' | 'convert' | 'delete' | 'rebalance' };
function ScenePlannerSession({
  target,
  projectTitle,
  initialParentId = null,
  onManuscriptChange,
}: ScenePlannerProps) {
  const [parentId, setParentId] = useState<string | null>(initialParentId);
  const [stage, setStage] = useState<'all' | SceneStage>('all');
  const [archived, setArchived] = useState(false);
  const [view, setView] = useState<'list' | 'board'>('list');
  const [version, setVersion] = useState(0);
  const [action, setAction] = useState<Action | null>(null);
  const [success, setSuccess] = useState('');
  const groups = useScenePage('groups:' + version, (cursor) =>
    listSceneGroups({ target, cursor, limit: 25 }),
  );
  const scenes = useScenePage(
    'scenes:' + String(parentId) + ':' + stage + ':' + archived + ':' + version,
    (cursor) => listScenes({ target, parentId, stage, archived, cursor, limit: 25 }),
  );
  const detailRequest = useSceneResource('group:' + String(parentId) + ':' + version, async () => {
    const result = await getSceneGroup({ target, parentId });
    if (!result)
      throw new Error(
        'Este agrupador está indisponível. As cenas continuam acessíveis pela identidade.',
      );
    return result;
  });
  const detail = detailRequest.value ?? null;
  const detailLoading = detailRequest.loading;
  const detailError = detailRequest.error;
  const groupLabel = target.kind === 'book' ? 'capítulo' : 'parte';
  const group = detail?.group;
  const blocked =
    detailLoading ||
    Boolean(detailError) ||
    group?.contentMode === 'legacy' ||
    group?.deleting ||
    group?.rebalancing;
  const saved = () => {
    setAction(null);
    setSuccess('Operação confirmada. Planejamento atualizado.');
    setVersion((value) => value + 1);
    onManuscriptChange?.();
  };
  const refresh = () => {
    setSuccess('');
    setVersion((value) => value + 1);
  };
  const card = (scene: SceneSummary) => (
    <article className={styles.card} key={scene.id} aria-label={'Cena ' + scene.title}>
      <div className={styles.actions}>
        <Badge>{sceneStageLabels[scene.stage]}</Badge>
        {scene.archived && <Badge variant="secondary">Arquivada</Badge>}
      </div>
      <h3>
        <Link to={sceneRoute(target, scene.id)}>{scene.title}</Link>
      </h3>
      <p className={styles.meta}>
        {scene.wordCount.toLocaleString('pt-BR')} palavras · revisão {scene.revision}
      </p>
      {scene.formerParentId && scene.parentId === null && (
        <p className={styles.hint}>
          Agrupador de origem removido. A prosa e as referências foram preservadas.
        </p>
      )}
      <Dropdown
        mode="action"
        label={'Ações da cena ' + scene.title}
        options={[
          {
            value: 'edit',
            label: 'Editar planejamento',
            onSelect: () => setAction({ kind: 'edit', scene }),
          },
          {
            value: 'stage',
            label: 'Alterar estado',
            onSelect: () => setAction({ kind: 'stage', scene }),
          },
          ...(!scene.archived
            ? [
                {
                  value: 'move',
                  label: 'Mover cena',
                  onSelect: () => setAction({ kind: 'move', scene }),
                },
              ]
            : []),
          {
            value: 'archive',
            label: scene.archived ? 'Restaurar cena' : 'Arquivar cena',
            onSelect: () => setAction({ kind: 'archive', scene }),
          },
        ]}
      />
    </article>
  );
  const groupOptions = [
    { value: '', label: target.kind === 'book' ? 'Sem capítulo' : 'Sem parte' },
    ...groups.items
      .filter((item) => item.id)
      .map((item) => ({
        value: item.id ?? '',
        label: item.title + (item.contentMode === 'legacy' ? ' · legado' : ''),
      })),
  ];
  if (parentId && !groupOptions.some((option) => option.value === parentId))
    groupOptions.push({ value: parentId, label: detail?.group.title ?? 'Agrupador selecionado' });
  return (
    <section className={styles.planner} aria-label="Planejamento de cenas">
      <div className={styles.toolbar}>
        <div>
          <h2>Cenas</h2>
          {projectTitle && <p className={styles.hint}>{projectTitle}</p>}
        </div>
        <Button
          disabled={Boolean(blocked) || archived}
          onClick={() => setAction({ kind: 'create' })}
        >
          <Plus className="icon icon-sm" aria-hidden="true" />
          Nova cena
        </Button>
        <Button variant="outline" onClick={() => setAction({ kind: 'group' })}>
          <FileText className="icon icon-sm" aria-hidden="true" />
          {target.kind === 'book' ? 'Novo capítulo' : 'Nova parte'}
        </Button>
      </div>
      <div className={styles.filters}>
        <Dropdown
          mode="select"
          label={target.kind === 'book' ? 'Capítulo' : 'Parte'}
          value={parentId ?? ''}
          options={groupOptions}
          onValueChange={(value) => {
            setParentId(value || null);
            setSuccess('');
          }}
        />
        <Dropdown
          mode="select"
          label="Estado da cena"
          value={stage}
          options={[
            { value: 'all', label: 'Todos os estados' },
            ...sceneStages.map((value) => ({ value, label: sceneStageLabels[value] })),
          ]}
          onValueChange={(value) => {
            if (value === 'all') setStage('all');
            else {
              const match = sceneStages.find((item) => item === value);
              if (match) setStage(match);
            }
          }}
        />
        <Dropdown
          mode="select"
          label="Arquivo de cenas"
          value={archived ? 'archived' : 'active'}
          options={[
            { value: 'active', label: 'Ativas' },
            { value: 'archived', label: 'Arquivadas' },
          ]}
          onValueChange={(value) => setArchived(value === 'archived')}
        />
      </div>
      {groups.loading && <LoadingState label="Carregando agrupadores…" />}
      {groups.error && <ErrorState error={groups.error} onRetry={() => void groups.retry()} />}
      {groups.cursor && (
        <Button variant="outline" disabled={groups.loading} onClick={() => void groups.more()}>
          Carregar mais agrupadores
        </Button>
      )}
      <div className={styles.toolbar} aria-label="Visualização de cenas">
        <Button
          variant={view === 'list' ? 'secondary' : 'outline'}
          aria-pressed={view === 'list'}
          onClick={() => setView('list')}
        >
          <List className="icon icon-sm" aria-hidden="true" />
          Lista
        </Button>
        <Button
          variant={view === 'board' ? 'secondary' : 'outline'}
          aria-pressed={view === 'board'}
          onClick={() => setView('board')}
        >
          <Columns3 className="icon icon-sm" aria-hidden="true" />
          Quadro
        </Button>
        <Button variant="ghost" onClick={refresh}>
          Atualizar planejamento
        </Button>
      </div>
      <p className={styles.hint}>
        Cada cena tem prosa própria. Cenas ativas vinculadas compõem{' '}
        {target.kind === 'book' ? 'o capítulo' : 'a parte'} na ordem escolhida; o planejamento
        permanece privado.
      </p>
      {success && <Alert variant="success">{success}</Alert>}
      {detailLoading && <LoadingState label="Carregando agrupador…" />}
      {detailError && <ErrorState error={detailError} onRetry={refresh} />}
      {group?.contentMode === 'legacy' && (
        <Alert variant="info">
          Este capítulo usa texto legado. A conversão cria uma única cena com o corpo inteiro,
          preserva a fonte original e não divide ou duplica a prosa.
          <Button variant="outline" onClick={() => setAction({ kind: 'convert' })}>
            Converter em cenas
          </Button>
        </Alert>
      )}
      {group?.deleting && (
        <Alert variant="warning">
          Remoção em andamento. As cenas e referências serão preservadas em Sem {groupLabel}.
        </Alert>
      )}
      {group?.rebalancing && (
        <Alert variant="warning">
          Reorganização em andamento. A ordem anterior é preservada até concluir.
        </Alert>
      )}
      {group && group.contentMode === 'scenes' && (
        <div className={styles.actions}>
          <Button variant="outline" onClick={() => setAction({ kind: 'rebalance' })}>
            <ArrowUpDown className="icon icon-sm" aria-hidden="true" />
            {group.rebalancing ? 'Retomar reorganização' : 'Reorganizar posições'}
          </Button>
          {parentId && (
            <Button variant="outline" onClick={() => setAction({ kind: 'delete' })}>
              {group.deleting ? 'Retomar remoção' : 'Remover ' + groupLabel}
            </Button>
          )}
        </div>
      )}
      {scenes.loading && (
        <LoadingState
          label={scenes.items.length ? 'Carregando mais cenas…' : 'Carregando cenas…'}
        />
      )}
      {scenes.error && <ErrorState error={scenes.error} onRetry={() => void scenes.retry()} />}
      {!scenes.loading &&
        !scenes.error &&
        !detailLoading &&
        !detailError &&
        scenes.items.length === 0 && (
          <EmptyState
            title={archived ? 'Nenhuma cena arquivada' : 'Nenhuma cena neste agrupador'}
            description={
              stage === 'all'
                ? 'Crie uma cena para começar seu planejamento.'
                : 'Experimente outro estado para encontrar suas cenas.'
            }
          />
        )}
      {view === 'list' ? (
        <div className={styles.list}>{scenes.items.map(card)}</div>
      ) : (
        <div className={styles.board}>
          {sceneStages
            .filter((item) => stage === 'all' || stage === item)
            .map((column) => (
              <section key={column} className={styles.column} aria-label={sceneStageLabels[column]}>
                <h3>{sceneStageLabels[column]}</h3>
                {scenes.items.filter((scene) => scene.stage === column).map(card)}
                {!scenes.items.some((scene) => scene.stage === column) && (
                  <p className={styles.hint}>Nenhuma cena carregada neste estado.</p>
                )}
              </section>
            ))}
        </div>
      )}
      {scenes.cursor && (
        <Button variant="outline" disabled={scenes.loading} onClick={() => void scenes.more()}>
          Carregar mais cenas
        </Button>
      )}
      {action?.kind === 'create' && (
        <ScenePlanningDialog
          target={target}
          parentId={parentId}
          onClose={() => setAction(null)}
          onSaved={saved}
        />
      )}
      {action?.kind === 'edit' && action.scene && (
        <ScenePlanningDialog
          target={target}
          parentId={parentId}
          scene={action.scene}
          onClose={() => setAction(null)}
          onSaved={saved}
        />
      )}
      {action?.kind === 'move' && action.scene && (
        <SceneMoveDialog
          target={target}
          scene={action.scene}
          onClose={() => setAction(null)}
          onSaved={saved}
        />
      )}
      {action && (action.kind === 'archive' || action.kind === 'stage') && (
        <SceneSimpleMutation
          target={target}
          action={action}
          onClose={() => setAction(null)}
          onSaved={saved}
        />
      )}
      {action &&
        (action.kind === 'group' ||
          action.kind === 'convert' ||
          action.kind === 'delete' ||
          action.kind === 'rebalance') && (
          <SceneGroupMutation
            target={target}
            kind={action.kind}
            detail={detail}
            onClose={() => setAction(null)}
            onSaved={() => {
              if (action.kind === 'delete') setParentId(null);
              saved();
            }}
          />
        )}
    </section>
  );
}
function SceneSimpleMutation({
  target,
  action,
  onClose,
  onSaved,
}: {
  target: SceneProject;
  action: { kind: 'archive' | 'stage'; scene: SceneSummary };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [scene, setScene] = useState(action.scene);
  const [stage, setStage] = useState(action.scene.stage);
  const archive = action.kind === 'archive';
  const label = archive ? (scene.archived ? 'Restaurar cena' : 'Arquivar cena') : 'Alterar estado';
  return (
    <SceneOperationDialog
      title={label}
      description={'Cena: ' + scene.title}
      submitLabel={label}
      onClose={onClose}
      onSuccess={onSaved}
      onCompare={async () => {
        const current = await getScene({ target, sceneId: scene.id });
        if (!current) throw new Error('Cena indisponível.');
        setScene(current);
      }}
      buildOperation={(operationId) => {
        const common = { target, sceneId: scene.id, operationId, expectedRevision: scene.revision };
        if (archive) {
          const input = { ...common, archived: !scene.archived };
          return () => archiveScene(input);
        }
        const input = { ...common, patch: { stage } };
        return () => updateScene(input);
      }}
    >
      {(locked) =>
        archive ? (
          <Alert variant="warning">
            <Archive className="icon icon-sm" aria-hidden="true" />
            {scene.archived
              ? 'A cena será acrescentada ao final do agrupador original disponível. Se ele foi removido, ela ficará sem agrupador.'
              : 'A cena sai da composição, mas sua prosa e suas referências permanecem guardadas e podem ser restauradas.'}
          </Alert>
        ) : (
          <Dropdown
            mode="select"
            label="Novo estado da cena"
            disabled={locked}
            value={stage}
            options={sceneStages.map((value) => ({ value, label: sceneStageLabels[value] }))}
            onValueChange={(value) => {
              const match = sceneStages.find((item) => item === value);
              if (match) setStage(match);
            }}
          />
        )
      }
    </SceneOperationDialog>
  );
}
function SceneGroupMutation({
  target,
  kind,
  detail,
  onClose,
  onSaved,
}: {
  target: SceneProject;
  kind: 'group' | 'convert' | 'delete' | 'rebalance';
  detail: SceneGroupDetail | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState('');
  const [observed, setObserved] = useState(detail);
  const [processed, setProcessed] = useState(0);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const resumeId =
    kind === 'delete'
      ? detail?.group.deletionOperationId
      : kind === 'rebalance'
        ? detail?.group.rebalanceOperationId
        : undefined;
  const resumeRequest = useSceneResource<SceneJob | null>('job:' + String(resumeId), async () => {
    if (!resumeId) return null;
    const job = await getSceneJob({ target, operationId: resumeId });
    if (!job || (kind === 'delete' ? job.kind !== 'delete-groups' : job.kind !== 'rebalance'))
      throw new Error('Pedido original indisponível. Atualize o planejamento.');
    return job;
  });
  const resumeJob = resumeRequest.value ?? null;
  const resumeLoading = Boolean(resumeId) && resumeRequest.loading;
  const resumeError = resumeRequest.error;
  const name = target.kind === 'book' ? 'capítulo' : 'parte';
  const label =
    kind === 'group'
      ? target.kind === 'book'
        ? 'Novo capítulo'
        : 'Nova parte'
      : kind === 'convert'
        ? 'Converter em cenas'
        : kind === 'delete'
          ? 'Remover ' + name
          : 'Reorganizar posições';
  const description =
    kind === 'group'
      ? 'Crie um agrupador para reunir as cenas na ordem escolhida.'
      : (observed?.group.title ?? 'Agrupador');
  const valid =
    !resumeLoading &&
    !resumeError &&
    (!resumeId || Boolean(resumeJob)) &&
    (kind === 'group'
      ? Boolean(title.trim()) && title.length <= 300
      : Boolean(observed) &&
        ((kind !== 'convert' && kind !== 'delete') || Boolean(observed?.group.id)));
  return (
    <SceneOperationDialog
      title={label}
      description={description}
      submitLabel={label}
      valid={valid}
      onClose={onClose}
      onSuccess={onSaved}
      onCompare={
        kind !== 'group'
          ? async () => {
              const current = await getSceneGroup({ target, parentId: observed?.group.id ?? null });
              if (!active.current) return;
              if (!current) throw new Error('Agrupador indisponível.');
              setObserved(current);
            }
          : undefined
      }
      buildOperation={(operationId) => {
        if (kind === 'group') {
          const input = { target, operationId, title: title.trim() };
          return () => createSceneGroup(input);
        }
        if (!observed) throw new Error('Agrupador indisponível.');
        if (kind === 'convert') {
          const input = {
            target,
            parentId: observed.group.id ?? '',
            operationId,
            expectedSourceVersion: observed.sourceVersion,
          };
          return () => convertChapterToScenes(input);
        }
        const parentId = observed.group.id;
        const expectedUpdatedAt = observed.group.updatedAt;
        return async () => {
          while (active.current) {
            const result =
              resumeJob?.kind === 'delete-groups'
                ? await deleteSceneGroups(resumeJob.input)
                : resumeJob?.kind === 'rebalance'
                  ? await rebalanceSceneRanks(resumeJob.input)
                  : kind === 'delete'
                    ? await deleteSceneGroup({
                        target,
                        parentId: parentId ?? '',
                        operationId,
                        expectedUpdatedAt,
                        limit: 50,
                      })
                    : await rebalanceSceneRanks({ target, parentId, operationId, limit: 50 });
            if (!active.current) return;
            if (result.complete) {
              setProcessed(result.processed);
              return;
            }
            setProcessed(result.processed);
          }
        };
      }}
    >
      {(locked) => (
        <div className={styles.form}>
          {resumeLoading && <LoadingState label="Recuperando pedido original…" />}
          {resumeError && (
            <ErrorState
              error={resumeError}
              action={
                <Button variant="outline" onClick={onClose}>
                  Voltar e atualizar planejamento
                </Button>
              }
            />
          )}{' '}
          {kind === 'group' ? (
            <Input
              label={target.kind === 'book' ? 'Título do capítulo' : 'Título da parte'}
              required
              maxLength={300}
              value={title}
              disabled={locked}
              onChange={(event) => setTitle(event.target.value)}
            />
          ) : (
            <Alert variant="warning">
              {kind === 'convert'
                ? 'O corpo inteiro vira uma cena. A fonte original fica preservada; o capítulo passa a reunir apenas cenas ativas.'
                : kind === 'delete'
                  ? 'As cenas serão desvinculadas sem apagar a prosa ou as referências. A contribuição deste agrupador será retirada do manuscrito.'
                  : 'A ordem atual permanece válida enquanto o servidor prepara as novas posições.'}
            </Alert>
          )}
          {(kind === 'delete' || kind === 'rebalance') && (
            <p role="status">
              {Math.max(processed, resumeJob?.progress.processed ?? 0)} itens processados. O
              progresso é confirmado pelo servidor.
            </p>
          )}
        </div>
      )}
    </SceneOperationDialog>
  );
}
