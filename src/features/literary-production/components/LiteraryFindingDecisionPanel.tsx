import { findingActionLabels } from '../model/finding';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Badge, Button, Dropdown, LoadingState, Textarea } from '@/shared/ui';
import { useAuth } from '@/features/auth';
import {
  getLiteraryFindingContext,
  getLiteraryFindingDecision,
  saveLiteraryFindingDecision,
  confirmLiteraryFindingCorrection,
  listLiteraryFindingDecisionVersions,
  getLiteraryFindingDecisionVersion,
  findingRequestRejected,
  type FindingAction,
  type FindingSource,
  type FindingTarget,
  type FindingDecision,
  type SaveFindingDecision,
  type ConfirmFindingCorrection,
} from '../services/literaryFindingService';
import { listLiteraryIntegrations } from '../services/literaryIntegrationService';
import { listLiteraryPlans, listLiteraryReferences } from '../services/literaryPlanningService';
import { referenceLabels } from '../model/planning';
import styles from './EditorialContractPanel.module.css';

const stateLabels: Record<FindingDecision['state'], string> = {
  planned: 'Correção planejada',
  retained: 'Texto mantido por decisão autoral',
  deferred: 'Decisão adiada',
  investigating: 'Em investigação',
  correctionConfirmed: 'Correção confirmada pelo autor',
};
const targetLabels: Record<FindingTarget['kind'], string> = {
  act: referenceLabels.act,
  chapter: referenceLabels.chapter,
  scene: referenceLabels.scene,
  arc: referenceLabels.arc,
  event: referenceLabels.event,
  localLore: referenceLabels.localLore,
  globalLore: referenceLabels.globalLore,
  plan: 'Planejamento',
  contract: 'Guia editorial',
  architecture: 'Estrutura e planejamento nativo',
};
type Work = { dirty: boolean; pending: boolean };
interface Props {
  bookId: string;
  trackingKey: string;
  source?: FindingSource;
  decisionId?: string;
  disabled?: boolean;
  onWorkChange?: (key: string, state: Work) => void;
  onClose?: () => void;
  onChanged?: (jobId: string) => void;
}
type Pending =
  | { kind: 'save'; input: SaveFindingDecision }
  | { kind: 'confirm'; input: ConfirmFindingCorrection };
type Option = { target: FindingTarget; label: string };
const targetKey = (value: FindingTarget | null) =>
  value ? JSON.stringify([value.kind, value.scopeId, value.id]) : 'none';
export function LiteraryFindingDecisionPanel(props: Props) {
  const { user } = useAuth();
  return (
    <FindingSession key={user?.uid + ':' + props.bookId + ':' + props.trackingKey} {...props} />
  );
}
function FindingSession({
  bookId,
  trackingKey,
  source,
  decisionId,
  disabled = false,
  onWorkChange,
  onClose,
  onChanged,
}: Props) {
  const { user } = useAuth();
  const [id, setId] = useState<string | null>(decisionId ?? null),
    [origin, setOrigin] = useState<FindingSource | null>(source ?? null);
  const [record, setRecord] = useState<FindingDecision | null>(null),
    [comparison, setComparison] = useState<FindingDecision | null>(null);
  const [action, setAction] = useState<FindingAction>('investigate'),
    [rationale, setRationale] = useState('');
  const [target, setTarget] = useState<FindingTarget | null>(null),
    [options, setOptions] = useState<Option[]>([]);
  const [kind, setKind] = useState<FindingTarget['kind']>('scene'),
    [nextTarget, setNextTarget] = useState<string | null>(null);
  const [architectureAudit, setArchitectureAudit] = useState(false);
  const [nextArchitecture, setNextArchitecture] = useState<number | null>(null);
  const [note, setNote] = useState(''),
    [successor, setSuccessor] = useState('');
  const [successors, setSuccessors] = useState<Awaited<
    ReturnType<typeof listLiteraryIntegrations>
  > | null>(null);
  const [versions, setVersions] = useState<Awaited<
    ReturnType<typeof listLiteraryFindingDecisionVersions>
  > | null>(null);
  const [historical, setHistorical] = useState<FindingDecision | null>(null);
  const [pending, setPending] = useState<Pending | null>(null),
    [busy, setBusy] = useState(true),
    [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null),
    [notice, setNotice] = useState<string | null>(null);
  const epoch = useRef(0),
    working = useRef(false);
  const sourceJobId = source?.jobId,
    sourceRequestId = source?.requestId,
    sourceIndex = source?.index;
  const decisionDirty =
    action !== (record?.action ?? 'investigate') ||
    rationale !== (record?.rationale ?? '') ||
    targetKey(target) !== targetKey(record?.target ?? null);
  const confirmationDirty =
    note !== (record?.correction?.note ?? '') ||
    successor !== (record?.correction?.successorJobId ?? '');
  const dirty = decisionDirty || confirmationDirty;
  const addOptions = useCallback(
    (items: Option[]) =>
      setOptions((previous) => {
        const all = new Map(previous.map((item) => [targetKey(item.target), item]));
        items.forEach((item) => all.set(targetKey(item.target), item));
        return [...all.values()];
      }),
    [],
  );
  const adopt = useCallback(
    (value: FindingDecision | null, all = false) => {
      setRecord(value);
      setAction(value?.action ?? 'investigate');
      setRationale(value?.rationale ?? '');
      setTarget(value?.target ?? null);
      setComparison(null);
      if (value?.target)
        addOptions([
          {
            target: value.target,
            label: value.currentTarget?.label ?? value.baseline?.label ?? 'Destino registrado',
          },
        ]);
      if (all) {
        setNote(value?.correction?.note ?? '');
        setSuccessor(value?.correction?.successorJobId ?? '');
      }
    },
    [addOptions],
  );
  useEffect(() => {
    onWorkChange?.(trackingKey, { dirty, pending: pending !== null || busy });
  }, [trackingKey, dirty, pending, busy, onWorkChange]);
  useEffect(
    () => () => onWorkChange?.(trackingKey, { dirty: false, pending: false }),
    [trackingKey, onWorkChange],
  );
  useEffect(() => {
    const current = ++epoch.current;
    working.current = true;
    const load = async () => {
      let findingId = decisionId;
      if (sourceJobId && sourceRequestId && sourceIndex !== undefined) {
        const context = await getLiteraryFindingContext(bookId, {
          jobId: sourceJobId,
          requestId: sourceRequestId,
          index: sourceIndex,
        });
        findingId = context.id;
        if (epoch.current !== current) return;
        setOrigin(context.source);
        addOptions(context.options);
        setArchitectureAudit(context.architectureAudit === true);
        setNextArchitecture(context.nextAfterArchitectureIndex ?? null);
      }
      if (!findingId) throw new Error('Escolha um achado ou uma decisão registrada.');
      const value = await getLiteraryFindingDecision(bookId, findingId);
      if (epoch.current !== current) return;
      setId(findingId);
      adopt(value.state === 'unrecorded' ? null : value, true);
      if (value.state !== 'unrecorded') {
        setOrigin(value.source);
        setArchitectureAudit(value.sourceScope?.audit === 'architecture');
      }
      setReady(true);
    };
    void load()
      .catch((cause: unknown) => {
        if (epoch.current === current)
          setError(cause instanceof Error ? cause.message : 'Decisão indisponível.');
      })
      .finally(() => {
        if (epoch.current === current) {
          working.current = false;
          setBusy(false);
        }
      });
    return () => {
      epoch.current = current + 1;
    };
  }, [bookId, decisionId, sourceJobId, sourceRequestId, sourceIndex, adopt, addOptions]);
  const run = async (task: (current: number) => Promise<void>) => {
    if (working.current || disabled) return;
    const current = epoch.current;
    working.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await task(current);
    } catch (cause) {
      if (epoch.current === current)
        setError(cause instanceof Error ? cause.message : 'Não foi possível concluir a decisão.');
    } finally {
      if (epoch.current === current) {
        working.current = false;
        setBusy(false);
      }
    }
  };
  const consult = () =>
    run(async (current) => {
      if (!id) return;
      const value = await getLiteraryFindingDecision(bookId, id);
      if (epoch.current !== current) return;
      if (value.state === 'unrecorded') {
        setNotice('Ainda não existe uma decisão salva.');
        return;
      }
      if (record?.revision === value.revision) setRecord(value);
      else setComparison(value);
      setReady(true);
    });
  const reloadInitial = () =>
    run(async (current) => {
      if (!source && !decisionId) return;
      let findingId = decisionId;
      if (source) {
        const context = await getLiteraryFindingContext(bookId, source);
        if (epoch.current !== current) return;
        findingId = context.id;
        setOrigin(context.source);
        addOptions(context.options);
        setArchitectureAudit(context.architectureAudit === true);
        setNextArchitecture(context.nextAfterArchitectureIndex ?? null);
      }
      const value = await getLiteraryFindingDecision(bookId, findingId!);
      if (epoch.current !== current) return;
      setId(findingId!);
      adopt(value.state === 'unrecorded' ? null : value, true);
      if (value.state !== 'unrecorded') setOrigin(value.source);
      setReady(true);
    });
  const saved = async (
    current: number,
    result: { id: string; revision: number },
    confirm = false,
  ) => {
    if (epoch.current !== current) return;
    setPending(null);
    setId(result.id);
    setNotice('Operação confirmada na revisão ' + result.revision + '.');
    const affectedJob = origin?.jobId ?? record?.source.jobId;
    if (affectedJob) onChanged?.(affectedJob);
    const value = await getLiteraryFindingDecision(bookId, result.id);
    if (epoch.current !== current) return;
    if (value.state === 'unrecorded')
      throw new Error('O recibo foi confirmado; consulte novamente o registro salvo.');
    if (value.revision !== result.revision) {
      setComparison(value);
      setNotice(
        'O pedido foi confirmado, mas há uma revisão posterior. Compare antes de adotar o registro.',
      );
    } else adopt(value, confirm);
  };
  const save = () =>
    run(async (current) => {
      if (!origin || pending?.kind === 'confirm') return;
      const input =
        pending?.kind === 'save'
          ? pending.input
          : {
              target: { kind: 'book' as const, id: bookId },
              jobId: origin.jobId,
              requestId: origin.requestId,
              findingIndex: origin.index,
              operationId: crypto.randomUUID(),
              expectedRevision: record?.revision ?? 0,
              action,
              rationale,
              targetResource: target,
            };
      setPending({ kind: 'save', input });
      try {
        await saved(current, await saveLiteraryFindingDecision(input, user?.uid ?? ''));
      } catch (cause) {
        if (epoch.current === current && findingRequestRejected(cause)) setPending(null);
        throw cause;
      }
    });
  const confirm = () =>
    run(async (current) => {
      if (!record || pending?.kind === 'save') return;
      const input =
        pending?.kind === 'confirm'
          ? pending.input
          : {
              target: { kind: 'book' as const, id: bookId },
              id: record.id,
              operationId: crypto.randomUUID(),
              expectedRevision: record.revision,
              successorJobId: successor,
              note,
            };
      setPending({ kind: 'confirm', input });
      try {
        await saved(current, await confirmLiteraryFindingCorrection(input, user?.uid ?? ''), true);
      } catch (cause) {
        if (epoch.current === current && findingRequestRejected(cause)) setPending(null);
        throw cause;
      }
    });
  const browseArchitectureTargets = () =>
    run(async (current) => {
      if (!origin) return;
      const context = await getLiteraryFindingContext(bookId, origin, nextArchitecture ?? -1);
      if (epoch.current !== current) return;
      addOptions(context.options);
      setNextArchitecture(context.nextAfterArchitectureIndex ?? null);
      if (!context.options.length)
        setNotice(
          'Nenhum destino lido nesta página; continue o inventário se houver mais páginas.',
        );
    });
  const browseTargets = (afterId: string | null = null) =>
    run(async (current) => {
      if (kind === 'contract') {
        addOptions([{ target: { kind, id: 'current', scopeId: bookId }, label: 'Guia editorial' }]);
        setNextTarget(null);
        return;
      }
      if (kind === 'plan') {
        const page = await listLiteraryPlans(bookId, afterId);
        if (epoch.current !== current) return;
        addOptions(
          page.items.map((item) => ({
            target: { kind: 'plan', id: item.id, scopeId: bookId },
            label: item.title,
          })),
        );
        setNextTarget(page.nextAfterId);
        if (!page.items.length) setNotice('Nenhum destino disponível nesta página.');
      } else if (kind !== 'architecture') {
        const page = await listLiteraryReferences(bookId, kind, afterId, 'source');
        if (epoch.current !== current) return;
        addOptions(
          page.items.map((item) => ({
            target: {
              kind: item.reference.kind as FindingTarget['kind'],
              id: item.reference.id,
              scopeId: item.reference.scopeId,
            },
            label: item.label,
          })),
        );
        setNextTarget(page.nextAfterId);
        if (!page.items.length) setNotice('Nenhum destino disponível nesta página.');
      }
    });
  const browseSuccessors = (afterId: string | null = null) =>
    run(async (current) => {
      const page = await listLiteraryIntegrations(bookId, afterId);
      if (epoch.current === current)
        setSuccessors((previous) => ({
          ...page,
          items: afterId ? [...(previous?.items ?? []), ...page.items] : page.items,
        }));
    });
  const history = (before: number | null = null) =>
    run(async (current) => {
      if (!id) return;
      const page = await listLiteraryFindingDecisionVersions(bookId, id, before);
      if (epoch.current === current)
        setVersions((previous) => ({
          ...page,
          items: before ? [...(previous?.items ?? []), ...page.items] : page.items,
        }));
    });
  const inspectVersion = (revision: number) =>
    run(async (current) => {
      if (!id) return;
      const value = await getLiteraryFindingDecisionVersion(bookId, id, revision);
      if (epoch.current === current) setHistorical(value);
    });
  const locked = disabled || busy || pending !== null;
  const canEdit = ready && (!record || record.originalSourceCurrent);
  const successorItems =
    successors?.items.filter(
      (item) =>
        item.state === 'done' &&
        item.jobId !== origin?.jobId &&
        (!record?.sourceScope ||
          (item.level === record.sourceScope.level &&
            item.actId === record.sourceScope.actId &&
            item.audit === record.sourceScope.audit)),
    ) ?? [];
  return (
    <section className={styles.comparison} aria-label="Decisão editorial sobre achado">
      <h3>Decisão sobre o achado</h3>
      <p>
        Planejar, manter e confirmar uma alteração são ações distintas. Este painel não modifica o
        manuscrito.
      </p>
      {busy && <LoadingState label="Consultando decisão e evidências…" />}
      {error && <Alert variant="destructive">{error}</Alert>}
      {notice && <Alert>{notice}</Alert>}
      {!ready && !busy && (
        <Button variant="outline" disabled={disabled} onClick={() => void reloadInitial()}>
          Tentar consultar decisão novamente
        </Button>
      )}
      {pending && (
        <Alert>
          O resultado aguarda confirmação. Recupere o mesmo pedido antes de editar ou fechar.
        </Alert>
      )}
      {record && (
        <>
          <Badge>
            {stateLabels[record.state]} · revisão {record.revision}
          </Badge>
          {record.action === 'retain' && (
            <Alert>
              {record.effectiveRetention
                ? 'A decisão de manter está vigente para estas fontes.'
                : 'Esta decisão é histórica; as fontes ou sua conferência mudaram.'}{' '}
              O diagnóstico original permanece registrado.
            </Alert>
          )}
          {record.state === 'correctionConfirmed' && (
            <Alert variant={record.confirmationCurrent ? 'success' : 'warning'}>
              {record.confirmationCurrent
                ? 'Alteração salva e integração sucessora conferidas pelo autor.'
                : 'Confirmação histórica: confira novamente fonte, versão e cobertura.'}
              A confirmação deste achado não aprova os demais impedimentos.
            </Alert>
          )}
          {!record.originalSourceCurrent && (
            <p>
              A análise original já não representa as fontes atuais. Sua decisão e seu histórico
              permanecem disponíveis; uma correção pode ser vinculada à integração sucessora.
            </p>
          )}
          {record.targetUnavailable && (
            <Alert variant="warning">
              O destino registrado não está disponível. Nenhuma origem será substituída
              automaticamente.
            </Alert>
          )}
        </>
      )}
      {ready && (
        <>
          <Dropdown
            mode="select"
            label="Decisão editorial"
            value={action}
            disabled={locked || !canEdit}
            options={Object.entries(findingActionLabels).map(([value, label]) => ({
              value,
              label,
            }))}
            onValueChange={(value) => setAction(value as FindingAction)}
          />
          <Textarea
            label="Justificativa da decisão"
            maxLength={6000}
            value={rationale}
            disabled={locked || !canEdit}
            onChange={(event) => setRationale(event.target.value)}
          />
          <Dropdown
            mode="select"
            label="Destino da alteração"
            value={targetKey(target)}
            disabled={locked || !canEdit}
            options={[
              { value: 'none', label: 'Sem destino específico' },
              ...options.map((item) => ({
                value: targetKey(item.target),
                label: targetLabels[item.target.kind] + ' · ' + item.label,
              })),
            ]}
            onValueChange={(value) =>
              setTarget(options.find((item) => targetKey(item.target) === value)?.target ?? null)
            }
          />
          {target && (
            <p className={styles.contextText}>
              Destino selecionado:{' '}
              {options.find((item) => targetKey(item.target) === targetKey(target))?.label ??
                record?.currentTarget?.label ??
                'Destino registrado'}
            </p>
          )}
          {canEdit && (
            <details>
              <summary>Consultar outros destinos do livro</summary>
              {architectureAudit && (
                <>
                  <p>
                    Destinos da arquitetura lida por esta integração. Estrutura e texto possuem
                    provas separadas; selecionar um destino não aplica nem confirma uma correção.
                  </p>
                  <Button
                    variant="outline"
                    disabled={locked}
                    onClick={() => void browseArchitectureTargets()}
                  >
                    {nextArchitecture === null
                      ? 'Consultar arquitetura lida'
                      : 'Mais destinos da arquitetura lida'}
                  </Button>
                </>
              )}
              <Dropdown
                mode="select"
                label="Tipo de destino"
                value={kind}
                disabled={locked}
                options={Object.entries(targetLabels)
                  .filter(([value]) => value !== 'architecture')
                  .map(([value, label]) => ({ value, label }))}
                onValueChange={(value) => {
                  setKind(value as FindingTarget['kind']);
                  setNextTarget(null);
                }}
              />
              <Button variant="outline" disabled={locked} onClick={() => void browseTargets()}>
                Consultar destinos
              </Button>
              {nextTarget && (
                <Button
                  variant="outline"
                  disabled={locked}
                  onClick={() => void browseTargets(nextTarget)}
                >
                  Mais destinos
                </Button>
              )}
            </details>
          )}
          <div className={styles.actions}>
            <Button
              disabled={
                disabled ||
                busy ||
                pending?.kind === 'confirm' ||
                !canEdit ||
                !rationale.trim() ||
                (action === 'correct' && !target)
              }
              onClick={() => void save()}
            >
              {pending?.kind === 'save' ? 'Recuperar a mesma decisão' : 'Salvar decisão do achado'}
            </Button>
            <Button variant="outline" disabled={locked} onClick={() => void consult()}>
              Consultar versão atual da decisão
            </Button>
            {record && (
              <Button variant="outline" disabled={locked} onClick={() => void history()}>
                Consultar histórico da decisão
              </Button>
            )}
          </div>
          {record?.action === 'correct' && (
            <section aria-label="Confirmação de correção salva">
              <h4>Confirmar alteração salva</h4>
              <p>
                Salve a alteração no destino e conclua uma integração sucessora do mesmo escopo. Ao
                confirmar prosa, uma versão será preservada no histórico nativo.
              </p>
              <Button variant="outline" disabled={locked} onClick={() => void browseSuccessors()}>
                Consultar integrações sucessoras
              </Button>
              <Dropdown
                mode="select"
                label="Integração que conferiu a alteração"
                value={successor}
                disabled={locked}
                options={successorItems.map((item) => ({
                  value: item.jobId,
                  label:
                    (item.level === 'act' ? 'Ato' : 'Livro') +
                    ' · ' +
                    new Date(item.createdAt).toLocaleString('pt-BR'),
                }))}
                onValueChange={setSuccessor}
              />
              {successors && !successorItems.length && (
                <p>
                  Nenhuma cobertura concluída do mesmo escopo nesta página. A seleção será conferida
                  no servidor.
                </p>
              )}
              {successors?.nextAfterId && (
                <Button
                  variant="outline"
                  disabled={locked}
                  onClick={() => void browseSuccessors(successors.nextAfterId)}
                >
                  Mais integrações sucessoras
                </Button>
              )}
              <Textarea
                label="Conferência autoral da alteração"
                maxLength={6000}
                value={note}
                disabled={locked}
                onChange={(event) => setNote(event.target.value)}
              />
              <Button
                disabled={
                  disabled ||
                  busy ||
                  pending?.kind === 'save' ||
                  decisionDirty ||
                  record.targetUnavailable ||
                  !successor ||
                  !note.trim() ||
                  (record.confirmationCurrent && !confirmationDirty)
                }
                onClick={() => void confirm()}
              >
                {pending?.kind === 'confirm'
                  ? 'Recuperar a mesma confirmação'
                  : 'Preservar e confirmar alteração salva'}
              </Button>
            </section>
          )}
          {confirmationDirty && (
            <Button
              variant="ghost"
              disabled={locked}
              onClick={() => {
                setNote(record?.correction?.note ?? '');
                setSuccessor(record?.correction?.successorJobId ?? '');
              }}
            >
              Descartar rascunho de confirmação
            </Button>
          )}
        </>
      )}
      {comparison && (
        <section aria-label="Comparação com decisão mais recente">
          <h4>Atual no servidor · revisão {comparison.revision}</h4>
          <p>{findingActionLabels[comparison.action]}</p>
          <p className={styles.contextText}>{comparison.rationale}</p>
          <Button variant="outline" disabled={locked} onClick={() => adopt(comparison, true)}>
            Adotar esta revisão e descartar meu rascunho
          </Button>
          <Button variant="ghost" onClick={() => setComparison(null)}>
            Manter meu rascunho
          </Button>
        </section>
      )}
      {versions && (
        <section aria-label="Histórico da decisão">
          {versions.items.map((item) => (
            <Button
              key={item.revision}
              variant="ghost"
              disabled={locked}
              onClick={() => void inspectVersion(item.revision)}
            >
              Consultar decisão na revisão {item.revision}
            </Button>
          ))}
          {versions.nextBeforeRevision !== null && (
            <Button
              variant="outline"
              disabled={locked}
              onClick={() => void history(versions.nextBeforeRevision)}
            >
              Mais versões da decisão
            </Button>
          )}
        </section>
      )}
      {historical && (
        <section aria-label="Decisão histórica">
          <h4>Revisão {historical.revision} · consulta histórica</h4>
          <p>{findingActionLabels[historical.action]}</p>
          <p className={styles.contextText}>{historical.rationale}</p>
          {historical.correction && (
            <p className={styles.contextText}>{historical.correction.note}</p>
          )}
          <Button variant="ghost" onClick={() => setHistorical(null)}>
            Fechar consulta histórica
          </Button>
        </section>
      )}
      {onClose && (
        <Button variant="ghost" disabled={locked} onClick={onClose}>
          {dirty ? 'Descartar rascunho e fechar decisão' : 'Fechar decisão'}
        </Button>
      )}
    </section>
  );
}
