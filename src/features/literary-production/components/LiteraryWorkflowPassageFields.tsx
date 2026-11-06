import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Dropdown, EmptyState, LoadingState } from '@/shared/ui';
import {
  getLiteraryWorkflowScope,
  listLiteraryWorkflows,
  type WorkflowListItem,
  type WorkflowPassageInput,
} from '../services/literaryWorkflowService';
import {
  listLiteraryIntegrations,
  type LiteraryIntegration,
} from '../services/literaryIntegrationService';
import styles from './EditorialContractPanel.module.css';
interface Props {
  bookId: string;
  chapterId: string;
  targetActId?: string | null;
  enabled: boolean;
  value: WorkflowPassageInput | null;
  disabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onChange: (value: WorkflowPassageInput | null) => void;
  onValidityChange: (valid: boolean) => void;
}
const date = (value: number) => new Date(value).toLocaleString('pt-BR');
export function LiteraryWorkflowPassageFields({
  bookId,
  chapterId,
  targetActId,
  enabled,
  value,
  disabled,
  onEnabledChange,
  onChange,
  onValidityChange,
}: Props) {
  const [cycles, setCycles] = useState<WorkflowListItem[]>([]),
    [cycleAfter, setCycleAfter] = useState<string | null>(null),
    [reports, setReports] = useState<LiteraryIntegration[]>([]),
    [reportAfter, setReportAfter] = useState<string | null>(null),
    [actId, setActId] = useState<string | null | undefined>(undefined),
    [loaded, setLoaded] = useState(false),
    [reportsLoaded, setReportsLoaded] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const alive = useRef(false),
    working = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const eligible = cycles.filter((item) => item.phase === 'done' && item.chapterId !== chapterId);
  const selected = eligible.find((item) => item.jobId === value?.previousWorkflowId);
  const currentActId = targetActId !== undefined ? targetActId : actId;
  const crossesAct = !!selected && selected.actId !== null && selected.actId !== currentActId;
  const eligibleReports = reports.filter(
    (item) =>
      item.state === 'done' &&
      item.authorAccepted &&
      item.level === 'act' &&
      item.actId === selected?.actId,
  );
  const valid =
    !enabled ||
    !!(
      selected &&
      currentActId !== undefined &&
      (!crossesAct || eligibleReports.some((item) => item.jobId === value?.actIntegrationId))
    );
  useEffect(() => {
    onValidityChange(valid);
  }, [valid, onValidityChange]);
  async function load(kind: 'cycles' | 'reports', more = false) {
    if (working.current || disabled) return;
    working.current = true;
    setBusy(true);
    setError(null);
    try {
      if (kind === 'cycles') {
        const [page, scope] = await Promise.all([
          listLiteraryWorkflows(bookId, null, more ? cycleAfter : null),
          targetActId !== undefined
            ? Promise.resolve({ actId: targetActId })
            : getLiteraryWorkflowScope(bookId, chapterId),
        ]);
        if (!alive.current) return;
        setCycles((old) =>
          more
            ? [...old, ...page.items.filter((item) => !old.some((v) => v.jobId === item.jobId))]
            : page.items,
        );
        setCycleAfter(page.nextAfterId);
        setActId(scope.actId ?? null);
        setLoaded(true);
      } else {
        const page = await listLiteraryIntegrations(bookId, more ? reportAfter : null);
        if (!alive.current) return;
        setReports((old) =>
          more
            ? [...old, ...page.items.filter((item) => !old.some((v) => v.jobId === item.jobId))]
            : page.items,
        );
        setReportAfter(page.nextAfterId);
        setReportsLoaded(true);
      }
    } catch (cause) {
      if (alive.current)
        setError(
          cause instanceof Error
            ? cause.message
            : 'Não foi possível consultar as condições de passagem.',
        );
    } finally {
      if (alive.current) {
        working.current = false;
        setBusy(false);
      }
    }
  }
  return (
    <section className={styles.panel} aria-label="Condições de entrada do capítulo">
      <Dropdown
        mode="select"
        label="Entrada neste capítulo"
        value={enabled ? 'previous' : 'independent'}
        disabled={disabled || busy}
        options={[
          { value: 'independent', label: 'Ciclo independente deste capítulo' },
          { value: 'previous', label: 'Continuar após um capítulo revisado' },
        ]}
        onValueChange={(choice) => {
          onEnabledChange(choice === 'previous');
          onChange(null);
        }}
      />
      {enabled && (
        <>
          <p>
            Escolha o ciclo anterior concluído. Ao sair de um ato, escolha também sua integração
            aceita. As fontes e a ordem serão reconferidas no servidor ao registrar; consultar
            opções não inicia trabalho.
          </p>
          {error && <Alert variant="destructive">{error}</Alert>}
          {busy && <LoadingState label="Consultando condições de passagem…" />}
          <Button variant="outline" disabled={disabled || busy} onClick={() => void load('cycles')}>
            Consultar ciclos anteriores
          </Button>
          {loaded && !eligible.length && (
            <EmptyState
              title="Nenhum ciclo anterior concluído nesta página"
              description="Conclua e preserve a revisão do capítulo anterior ou consulte a próxima página."
            />
          )}
          {!!eligible.length && (
            <Dropdown
              mode="select"
              label="Ciclo anterior revisado"
              value={value?.previousWorkflowId ?? ''}
              placeholder="Escolha o ciclo anterior"
              disabled={disabled || busy}
              options={eligible.map((item) => ({
                value: item.jobId,
                label: item.chapterTitle + ' · ' + date(item.completedAt ?? item.createdAt),
              }))}
              onValueChange={(id) => onChange({ previousWorkflowId: id, actIntegrationId: null })}
            />
          )}
          {cycleAfter && (
            <Button
              variant="outline"
              disabled={disabled || busy}
              onClick={() => void load('cycles', true)}
            >
              Mais ciclos anteriores
            </Button>
          )}
          {crossesAct && (
            <>
              <Alert>
                A passagem sai de um ato. Sua integração integral aceita é obrigatória antes da
                primeira versão deste capítulo.
              </Alert>
              <Button
                variant="outline"
                disabled={disabled || busy}
                onClick={() => void load('reports')}
              >
                Consultar integrações do ato anterior
              </Button>
              {reportsLoaded && !eligibleReports.length && (
                <EmptyState
                  title="Nenhuma integração aceita desse ato nesta página"
                  description="Conclua e aceite a integração do ato anterior ou consulte a próxima página."
                />
              )}
              {!!eligibleReports.length && (
                <Dropdown
                  mode="select"
                  label="Integração aceita do ato anterior"
                  placeholder="Escolha a integração"
                  disabled={disabled || busy}
                  value={value?.actIntegrationId ?? ''}
                  options={eligibleReports.map((item) => ({
                    value: item.jobId,
                    label:
                      'Integração do ato anterior · ' + date(item.completedAt ?? item.createdAt),
                  }))}
                  onValueChange={(id) => {
                    if (value) onChange({ ...value, actIntegrationId: id });
                  }}
                />
              )}
              {reportAfter && (
                <Button
                  variant="outline"
                  disabled={disabled || busy}
                  onClick={() => void load('reports', true)}
                >
                  Mais integrações do ato anterior
                </Button>
              )}
            </>
          )}
          {valid && selected && (
            <p>
              Condição escolhida: revisão integral preservada de {selected.chapterTitle}
              {crossesAct ? ' e integração aceita do ato anterior.' : '.'} O registro não inicia a
              execução.
            </p>
          )}
        </>
      )}
    </section>
  );
}
