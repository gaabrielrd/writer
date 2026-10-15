import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { useAuth } from '@/features/auth';
import {
  Alert,
  Badge,
  Button,
  Card,
  Dropdown,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
} from '@/shared/ui';
import type {
  EditorialState,
  ManuscriptTarget,
  PrepareWorkWordCountInput,
  WorkProgress,
  WorkTarget,
} from '../model/workProgress';
import { editorialStateLabels, parseWordGoal, workErrorMessage } from '../model/workProgress';
import {
  getWorkProgress,
  prepareWorkWordCount,
  updateWorkProgress,
} from '../services/workProgressService';
import { useWorkResource } from '../hooks/useWorkResource';
import { useWorkMutation } from '../hooks/useWorkMutation';
import { WorkChecklist } from './WorkChecklist';
import { WorkPreferencesPanel } from './WorkPreferencesPanel';
import styles from './WorkProgress.module.css';
export interface ProjectProgressPanelProps {
  target: WorkTarget;
  onProjectChange?: () => void;
  manuscriptRefreshKey?: string | number;
}
export function ProjectProgressPanel(props: ProjectProgressPanelProps) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingState label="Carregando conta…" />;
  if (!user) return <EmptyState title="Entre para acompanhar seu trabalho" />;
  return (
    <ProgressSession
      key={user.uid + ':' + props.target.kind + ':' + props.target.id}
      {...props}
      uid={user.uid}
    />
  );
}
function ProgressSession({
  target,
  uid,
  onProjectChange,
  manuscriptRefreshKey,
}: ProjectProgressPanelProps & { uid: string }) {
  const location = useLocation();
  const navigationState: unknown = location.state;
  const fallback =
    typeof navigationState === 'object' &&
    navigationState !== null &&
    'workResumeFallback' in navigationState &&
    navigationState.workResumeFallback === true;
  const progress = useWorkResource('work:' + uid + ':' + target.kind + ':' + target.id, () =>
    getWorkProgress({ target }),
  );
  if (progress.loading) return <LoadingState label="Carregando progresso…" />;
  if (progress.error) return <ErrorState error={progress.error} onRetry={progress.retry} />;
  const current = progress.value;
  if (
    !current ||
    current.ownerId !== uid ||
    current.target.id !== target.id ||
    current.target.kind !== target.kind
  )
    return (
      <EmptyState
        title="Progresso indisponível"
        description="Este projeto não está disponível para sua conta."
      />
    );
  return (
    <section
      className={styles.panel}
      aria-label={target.kind === 'campaign' ? 'Preparação do projeto' : 'Progresso do projeto'}
    >
      {fallback && (
        <Alert variant="warning">
          O recurso anterior está indisponível. Você pode continuar pelo projeto.
        </Alert>
      )}
      <header>
        <h2>{target.kind === 'campaign' ? 'Preparação' : 'Progresso'}</h2>
        <p className={styles.hint}>
          Seu planejamento é privado. Alterar o progresso não publica ou compartilha conteúdo.
        </p>
        {current.archived && <Badge variant="secondary">Projeto arquivado</Badge>}
      </header>
      {target.kind !== 'campaign' && (
        <ManuscriptProgress
          target={{ kind: target.kind, id: target.id }}
          initial={current}
          refreshKey={manuscriptRefreshKey}
          onChange={() => {
            onProjectChange?.();
          }}
        />
      )}
      {target.kind !== 'book' && (
        <WorkChecklist target={{ kind: target.kind, id: target.id }} onChange={onProjectChange} />
      )}
      <WorkPreferencesPanel />
    </section>
  );
}
function ManuscriptProgress({
  target,
  initial,
  refreshKey,
  onChange,
}: {
  target: ManuscriptTarget;
  initial: WorkProgress;
  refreshKey?: string | number;
  onChange: () => void;
}) {
  const [current, setCurrent] = useState(initial);
  const [stage, setStage] = useState<EditorialState>(initial.editorialState ?? 'draft');
  const [goal, setGoal] = useState(initial.wordGoal?.toString() ?? '');
  const [validation, setValidation] = useState('');
  const [notice, setNotice] = useState('');
  const [comparing, setComparing] = useState(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const feedback = useRef<HTMLDivElement>(null);
  const save = useWorkMutation(updateWorkProgress, (result) => {
    setCurrent((previous) => ({ ...previous, ...result }));
    setNotice('Progresso salvo.');
    onChange();
  });
  useEffect(() => {
    if (save.error || validation) feedback.current?.focus();
  }, [save.error, validation]);
  async function compare() {
    setComparing(true);
    try {
      const fresh = await getWorkProgress({ target });
      if (active.current) {
        if (
          !fresh ||
          fresh.ownerId !== current.ownerId ||
          fresh.target.id !== target.id ||
          fresh.target.kind !== target.kind
        )
          throw new Error('O projeto não está mais disponível.');
        setCurrent(fresh);
        setNotice(
          'Versão atual: ' +
            editorialStateLabels[fresh.editorialState ?? 'draft'] +
            '; meta ' +
            (fresh.wordGoal ?? 'não definida') +
            '. Seu preenchimento foi preservado. Confira antes de salvar.',
        );
      }
    } catch (cause) {
      if (active.current) setValidation(workErrorMessage(cause));
    } finally {
      if (active.current) setComparing(false);
    }
  }
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState('');
  const countRequest = useRef(0);
  const initialRefreshKey = useRef(refreshKey);
  const targetKind = target.kind,
    targetId = target.id,
    ownerId = initial.ownerId;
  const refreshManuscript = useCallback(async () => {
    const attempt = ++countRequest.current;
    await Promise.resolve();
    if (!active.current || attempt !== countRequest.current) return;
    setRefreshing(true);
    setRefreshError('');
    try {
      const fresh = await getWorkProgress({ target: { kind: targetKind, id: targetId } });
      if (!active.current || attempt !== countRequest.current) return;
      if (
        !fresh ||
        fresh.ownerId !== ownerId ||
        fresh.target.kind !== targetKind ||
        fresh.target.id !== targetId
      )
        throw new Error('O projeto não está disponível para atualizar a contagem.');
      // Atualizar o total não muda a base CAS ou os campos do formulário.
      setCurrent((previous) => ({ ...previous, manuscript: fresh.manuscript }));
    } catch (cause) {
      if (active.current && attempt === countRequest.current)
        setRefreshError(workErrorMessage(cause));
    } finally {
      if (active.current && attempt === countRequest.current) setRefreshing(false);
    }
  }, [ownerId, targetKind, targetId]);
  useEffect(() => {
    if (refreshKey === initialRefreshKey.current) return;
    initialRefreshKey.current = refreshKey;
    void refreshManuscript();
  }, [refreshKey, refreshManuscript]);
  const request = useRef<PrepareWorkWordCountInput | null>(null);
  const [preparing, setPreparing] = useState(false),
    [preparationError, setPreparationError] = useState('');
  const [processed, setProcessed] = useState(initial.manuscript?.processed ?? 0);
  async function prepare() {
    if (preparing || refreshing) return;
    setPreparing(true);
    setPreparationError('');
    const input = request.current ?? {
      target,
      operationId: current.manuscript?.operationId ?? crypto.randomUUID(),
      limit: 25,
    };
    request.current = input;
    try {
      let complete = false;
      while (!complete && active.current) {
        const result = await prepareWorkWordCount(input);
        if (!active.current) return;
        setProcessed(result.processed);
        complete = result.complete;
        if (complete) {
          request.current = null;
          setCurrent((previous) => ({
            ...previous,
            manuscript: { ready: true, wordCount: result.wordCount },
          }));
          onChange();
        }
      }
    } catch (cause) {
      if (active.current) setPreparationError(workErrorMessage(cause));
    } finally {
      if (active.current) setPreparing(false);
    }
  }
  const words = current.manuscript?.ready ? current.manuscript.wordCount : null;
  const reached =
    current.wordGoal !== null && words !== null && words !== undefined && words >= current.wordGoal;
  return (
    <>
      <Card className={styles.card}>
        <h3>Estado editorial e meta</h3>
        <p className={styles.hint}>
          A meta acompanha o manuscrito atual. Reescrita, remoção, arquivo e restauração podem
          alterar o total.
        </p>
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            setNotice('');
            if (!save.uncertain) {
              try {
                parseWordGoal(goal);
                setValidation('');
              } catch (cause) {
                setValidation(workErrorMessage(cause));
                return;
              }
            }
            void save.run(() => ({
              target,
              operationId: crypto.randomUUID(),
              expectedRevision: current.revision,
              patch: { editorialState: stage, wordGoal: parseWordGoal(goal) },
            }));
          }}
        >
          <Dropdown
            mode="select"
            label="Estado editorial"
            value={stage}
            disabled={save.locked || comparing}
            onValueChange={(value) => setStage(value as EditorialState)}
            options={Object.entries(editorialStateLabels).map(([value, label]) => ({
              value,
              label,
            }))}
          />
          <Input
            label="Meta total de palavras"
            value={goal}
            inputMode="numeric"
            disabled={save.locked}
            hint="Deixe vazio para remover a meta."
            onChange={(event) => {
              setGoal(event.target.value);
              setValidation('');
            }}
            error={validation || undefined}
          />
          <div ref={feedback} tabIndex={-1}>
            {save.error && <Alert variant="destructive">{save.error}</Alert>}
          </div>
          {notice && <p role="status">{notice}</p>}
          <div className={styles.actions}>
            {save.conflict && (
              <Button
                type="button"
                variant="secondary"
                disabled={comparing}
                onClick={() => void compare()}
              >
                Comparar versão atual
              </Button>
            )}
            <Button type="submit" disabled={save.busy || comparing}>
              {save.busy
                ? 'Salvando…'
                : save.uncertain
                  ? 'Confirmar progresso novamente'
                  : 'Salvar progresso'}
            </Button>
          </div>
        </form>
      </Card>
      <Card className={styles.card}>
        <h3>Manuscrito confirmado</h3>
        <Button
          variant="secondary"
          disabled={refreshing || preparing}
          onClick={() => void refreshManuscript()}
        >
          {refreshing ? 'Atualizando contagem…' : 'Atualizar contagem'}
        </Button>
        {refreshError && <Alert variant="warning">{refreshError}</Alert>}
        {words === null || words === undefined ? (
          <>
            <p>O total ainda precisa ser verificado.</p>
            <p role="status">
              {processed} fontes verificadas{preparing ? ' · Verificando…' : ''}
            </p>
            {preparationError && <Alert variant="warning">{preparationError}</Alert>}
            <Button disabled={preparing || refreshing} onClick={() => void prepare()}>
              {preparing
                ? 'Verificando…'
                : preparationError || current.manuscript?.operationId
                  ? 'Retomar verificação'
                  : 'Verificar contagem'}
            </Button>
          </>
        ) : (
          <>
            <p className={styles.total}>
              {words.toLocaleString('pt-BR')}
              {current.wordGoal !== null
                ? ' de ' + current.wordGoal.toLocaleString('pt-BR')
                : ''}{' '}
              palavras confirmadas
            </p>
            {current.wordGoal !== null ? (
              <>
                <progress
                  className={styles.progress}
                  max={current.wordGoal}
                  value={Math.min(words, current.wordGoal)}
                  aria-label="Progresso da meta de palavras"
                />
                <p>
                  {reached
                    ? 'Meta atingida'
                    : Math.floor((words / current.wordGoal) * 100) + '% da meta total'}
                </p>
              </>
            ) : (
              <p>Nenhuma meta definida. Você pode continuar escrevendo.</p>
            )}
          </>
        )}
      </Card>
    </>
  );
}
