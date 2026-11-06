import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Dropdown, Textarea } from '@/shared/ui';
import type { LiteraryPlan, LiteraryPlanPage } from '../model/planning';
import type {
  LiteraryProposalPage,
  LiteraryProposalResponse,
  StartLiteraryProposal,
} from '../model/proposal';
import {
  cancelLiteraryProposal,
  getLiteraryProposal,
  listLiteraryProposals,
  startLiteraryProposal,
} from '../services/literaryProposalService';
import styles from './EditorialContractPanel.module.css';

export function LiteraryProposalPanel({
  bookId,
  draft,
  revision,
  schema,
  plans,
  disabled,
  captureGeneration,
  onUse,
}: {
  bookId: string;
  draft: LiteraryPlan;
  revision: number;
  schema: LiteraryPlanPage['schema'];
  plans: LiteraryPlanPage['items'];
  disabled: boolean;
  captureGeneration?: () => unknown;
  onUse: (plan: LiteraryPlan) => void;
}) {
  const [instruction, setInstruction] = useState('');
  const [sourcePlanIds, setSourcePlanIds] = useState<string[]>([]);
  const [selectedPlan, setSelectedPlan] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<StartLiteraryProposal | null>(null);
  const [result, setResult] = useState<LiteraryProposalResponse | null>(null);
  const [previous, setPrevious] = useState<LiteraryProposalPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const epoch = useRef(0),
    working = useRef(false),
    latestDraft = useRef(draft),
    cancelIntent = useRef(new Set<string>()),
    runSequence = useRef(0);
  const [canceling, setCanceling] = useState(false);
  useEffect(() => {
    latestDraft.current = draft;
  }, [draft]);
  useEffect(() => {
    epoch.current += 1;
    return () => {
      epoch.current += 1;
    };
  }, [bookId]);
  const run = async (task: () => Promise<void>) => {
    if (working.current || disabled) return;
    const current = epoch.current,
      runId = ++runSequence.current;
    working.current = true;
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (cause) {
      if (epoch.current === current && runSequence.current === runId)
        setError(cause instanceof Error ? cause.message : 'Não foi possível concluir a análise.');
    } finally {
      if (epoch.current === current && runSequence.current === runId) {
        working.current = false;
        setBusy(false);
      }
    }
  };
  const generate = (mode: 'propose' | 'audit') =>
    run(async () => {
      const current = epoch.current;
      const request: StartLiteraryProposal = {
        target: { kind: 'book', id: bookId },
        operationId: crypto.randomUUID(),
        mode,
        plan: structuredClone(draft),
        expectedRevision: revision,
        sourcePlanIds: [...sourcePlanIds],
        instruction,
        ...(captureGeneration ? { generation: captureGeneration() } : {}),
      };
      setPending(request);
      setResult(null);
      let response: LiteraryProposalResponse;
      try {
        response = await startLiteraryProposal(request);
      } catch (cause) {
        const code =
          typeof cause === 'object' && cause !== null && 'code' in cause ? String(cause.code) : '';
        if (
          [
            'functions/invalid-argument',
            'functions/failed-precondition',
            'functions/not-found',
            'functions/permission-denied',
            'functions/unauthenticated',
            'functions/resource-exhausted',
          ].includes(code) &&
          epoch.current === current &&
          !cancelIntent.current.has(request.operationId)
        )
          setPending(null);
        throw cause;
      }
      if (epoch.current !== current || cancelIntent.current.has(request.operationId)) return;
      setResult(response);
      if (response.state !== 'running' && response.state !== 'unconfirmed') setPending(null);
    });
  const cancel = async () => {
    if (!pending || canceling || disabled) return;
    const current = epoch.current,
      operationId = pending.operationId;
    cancelIntent.current.add(operationId);
    setCanceling(true);
    setError(null);
    try {
      const response = await cancelLiteraryProposal(bookId, operationId);
      if (epoch.current !== current) return;
      setResult(response);
      if (response.state !== 'running' && response.state !== 'unconfirmed') {
        setPending(null);
        runSequence.current += 1;
        working.current = false;
        setBusy(false);
      }
    } catch (cause) {
      if (epoch.current === current)
        setError(
          cause instanceof Error ? cause.message : 'Consulte o cancelamento antes de continuar.',
        );
    } finally {
      if (epoch.current === current) setCanceling(false);
    }
  };
  const inspect = (operationId: string) =>
    run(async () => {
      const current = epoch.current;
      const response = await getLiteraryProposal(bookId, operationId);
      if (epoch.current !== current) return;
      setResult(response);
      if (response.state !== 'running' && response.state !== 'unconfirmed')
        setPending((current) => (current?.operationId === operationId ? null : current));
    });
  const list = (afterId: string | null = null) =>
    run(async () => {
      const current = epoch.current;
      const response = await listLiteraryProposals(bookId, afterId);
      if (epoch.current === current)
        setPrevious((last) => ({
          ...response,
          items: afterId ? [...(last?.items ?? []), ...response.items] : response.items,
        }));
    });
  const applyProposal = () =>
    run(async () => {
      if (!result?.result) return;
      const current = epoch.current;
      const fresh = await getLiteraryProposal(bookId, result.operationId);
      if (epoch.current !== current) return;
      setResult(fresh);
      if (fresh.state !== 'done' || !fresh.result)
        throw new Error('As fontes mudaram; confira o planejamento antes de gerar novamente.');
      if (JSON.stringify(fresh.inputPlan) !== JSON.stringify(latestDraft.current))
        throw new Error(
          'O rascunho mudou depois deste pedido. Compare a proposta com suas alterações.',
        );
      onUse(fresh.result.plan);
    });
  const locked = disabled || busy || pending !== null || canceling;
  const severity = {
    blocking: 'Bloqueio estrutural',
    warning: 'Ponto de atenção',
    suggestion: 'Sugestão',
  };
  return (
    <section className={styles.decisionForm} aria-label="Assistência de planejamento">
      <h4>Planejar com IA</h4>
      <p>
        A análise usa o contrato, este rascunho e as referências vinculadas. Escolha outros
        planejamentos para dar contexto. Propostas e auditorias não debitam créditos.
      </p>
      {error && <Alert variant="destructive">{error}</Alert>}
      <Textarea
        label="Orientação para esta análise"
        maxLength={4000}
        value={instruction}
        disabled={locked}
        onChange={(event) => setInstruction(event.target.value)}
      />
      <Dropdown
        mode="select"
        label="Planejamento de apoio"
        value={selectedPlan}
        disabled={locked}
        placeholder="Escolha um documento"
        options={plans.map((plan) => ({ value: plan.id, label: plan.title }))}
        onValueChange={setSelectedPlan}
      />
      <Button
        variant="outline"
        disabled={
          locked ||
          !selectedPlan ||
          sourcePlanIds.length >= 8 ||
          sourcePlanIds.includes(selectedPlan)
        }
        onClick={() => {
          setSourcePlanIds([...sourcePlanIds, selectedPlan]);
          setSelectedPlan('');
        }}
      >
        Incluir como fonte
      </Button>
      <ul>
        {sourcePlanIds.map((id) => (
          <li key={id}>
            {plans.find((plan) => plan.id === id)?.title ?? 'Planejamento selecionado'}
            <Button
              variant="ghost"
              disabled={locked}
              onClick={() => setSourcePlanIds(sourcePlanIds.filter((value) => value !== id))}
            >
              Remover fonte
            </Button>
          </li>
        ))}
      </ul>
      <div className={styles.actions}>
        <Button disabled={locked || !draft.title.trim()} onClick={() => void generate('propose')}>
          Gerar proposta
        </Button>
        <Button
          variant="outline"
          disabled={locked || !draft.title.trim()}
          onClick={() => void generate('audit')}
        >
          Auditar planejamento
        </Button>
        <Button variant="ghost" disabled={busy || disabled} onClick={() => void list()}>
          Consultar análises anteriores
        </Button>
        {pending && (
          <Button
            variant="outline"
            disabled={busy || disabled}
            onClick={() => void inspect(pending.operationId)}
          >
            Consultar resultado pendente
          </Button>
        )}
      </div>
      {pending && (
        <Button variant="outline" disabled={disabled || canceling} onClick={() => void cancel()}>
          {canceling ? 'Confirmando cancelamento…' : 'Cancelar análise pendente'}
        </Button>
      )}
      {result?.state === 'canceled' && (
        <Alert>Análise cancelada. Você pode preparar outro pedido.</Alert>
      )}
      {pending && (
        <Alert>
          Aguardando confirmação do pedido. Consulte o resultado antes de iniciar outra análise.
        </Alert>
      )}
      {previous && (
        <section aria-label="Análises preservadas">
          {!previous.items.length && <p>Nenhuma análise registrada.</p>}
          {previous.items.map((row) => (
            <Button
              key={row.operationId}
              variant="ghost"
              disabled={busy || disabled}
              onClick={() => void inspect(row.operationId)}
            >
              Consultar análise de {new Date(row.createdAt).toLocaleString('pt-BR')}
            </Button>
          ))}
          {previous.nextAfterId && (
            <Button
              variant="outline"
              disabled={busy || disabled}
              onClick={() => void list(previous.nextAfterId)}
            >
              Mais análises
            </Button>
          )}
        </section>
      )}
      {result?.state === 'stale' && (
        <Alert variant="warning">
          As fontes desta análise mudaram ou ficaram indisponíveis. Confira as referências e gere
          uma nova proposta.
        </Alert>
      )}
      {result?.state === 'error' && <Alert variant="destructive">{result.message}</Alert>}
      {result?.state === 'unconfirmed' && (
        <Alert>
          O pedido ainda não tem resultado confirmado. A consulta não reenvia a geração.
        </Alert>
      )}
      {result?.result && (
        <section className={styles.panel} aria-label="Proposta para revisão">
          <p>
            Fontes selecionadas: {result.result.coverage.documentCount}. Esta análise tem o escopo
            das fontes escolhidas.
          </p>
          {result.generation && <p>Modelo utilizado: {result.generation.effective.model}</p>}
          <ul>
            {result.sources?.map((source) => (
              <li key={source.id}>
                {source.label}
                {source.id === 'contract' || source.id.startsWith('plan:')
                  ? ' · revisão ' + source.revision
                  : ''}
              </li>
            ))}
          </ul>
          <p>{result.result.rationale}</p>
          <dl>
            {Object.entries(result.result.plan.fields).map(([key, value]) => (
              <div key={key}>
                <dt>{schema[result.result!.plan.kind]?.fields[key] ?? key}</dt>
                <dd>{value || 'Não definido'}</dd>
              </div>
            ))}
          </dl>
          <ul>
            {result.result.findings.map((finding, index) => (
              <li key={index}>
                <strong>{severity[finding.severity]}</strong>
                <blockquote>{finding.quote}</blockquote>
                <p>{finding.problem}</p>
                <p>{finding.action}</p>
                <small>
                  Fonte:{' '}
                  {result.sources?.find((source) => source.id === finding.sourceId)?.label ??
                    finding.sourceId}
                </small>
              </li>
            ))}
          </ul>
          {JSON.stringify(result.inputPlan) !== JSON.stringify(draft) && (
            <Alert variant="warning">
              O rascunho atual difere daquele usado nesta análise. Compare as versões antes de
              continuar.
            </Alert>
          )}
          <Button
            disabled={
              busy || disabled || JSON.stringify(result.inputPlan) !== JSON.stringify(draft)
            }
            onClick={() => void applyProposal()}
          >
            Usar proposta no rascunho
          </Button>
          <p>Revise as alterações e use Salvar documento para preservá-las.</p>
        </section>
      )}
    </section>
  );
}
