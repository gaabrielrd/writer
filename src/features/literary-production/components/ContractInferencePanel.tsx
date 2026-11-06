import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Dropdown, Textarea } from '@/shared/ui';
import { editorialFields, type EditorialContract } from '../model/editorial';
import {
  referenceLabels,
  type LiteraryReference,
  type LiteraryReferenceKind,
  type LiteraryReferencePage,
} from '../model/planning';
import type {
  LiteraryProposalPage,
  LiteraryProposalResponse,
  StartLiteraryProposal,
} from '../model/proposal';
import { listLiteraryReferences } from '../services/literaryPlanningService';
import {
  cancelLiteraryProposal,
  getLiteraryProposal,
  listLiteraryProposals,
  startLiteraryProposal,
} from '../services/literaryProposalService';
import styles from './EditorialContractPanel.module.css';

export function ContractInferencePanel({
  bookId,
  revision,
  disabled,
  captureGeneration,
  onUse,
}: {
  bookId: string;
  revision: number;
  disabled: boolean;
  captureGeneration?: () => unknown;
  onUse: (proposal: EditorialContract) => void;
}) {
  const [kind, setKind] = useState<LiteraryReferenceKind>('chapter');
  const [options, setOptions] = useState<LiteraryReferencePage | null>(null);
  const [sources, setSources] = useState<Array<{ reference: LiteraryReference; label: string }>>(
    [],
  );
  const [instruction, setInstruction] = useState('');
  const [pending, setPending] = useState<StartLiteraryProposal | null>(null);
  const [response, setResponse] = useState<LiteraryProposalResponse | null>(null);
  const [previous, setPrevious] = useState<LiteraryProposalPage | null>(null);
  const [busy, setBusy] = useState(false),
    [canceling, setCanceling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const epoch = useRef(0),
    requestSequence = useRef(0),
    cancelIntent = useRef(new Set<string>()),
    latestUse = useRef(onUse);
  useEffect(() => {
    latestUse.current = onUse;
  }, [onUse]);
  useEffect(() => {
    epoch.current += 1;
    return () => {
      epoch.current += 1;
    };
  }, [bookId]);
  const run = async (task: () => Promise<void>) => {
    if (busy || disabled) return;
    const current = epoch.current,
      sequence = ++requestSequence.current;
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (cause) {
      if (epoch.current === current && requestSequence.current === sequence)
        setError(cause instanceof Error ? cause.message : 'Não foi possível concluir.');
    } finally {
      if (epoch.current === current && requestSequence.current === sequence) setBusy(false);
    }
  };
  const browse = (afterId: string | null = null) =>
    run(async () => {
      const current = epoch.current;
      const page = await listLiteraryReferences(bookId, kind, afterId, 'source');
      if (epoch.current === current)
        setOptions((previous) => ({
          ...page,
          items: afterId ? [...(previous?.items ?? []), ...page.items] : page.items,
        }));
    });
  const generate = () =>
    run(async () => {
      const current = epoch.current;
      const request: StartLiteraryProposal = {
        target: { kind: 'book', id: bookId },
        operationId: crypto.randomUUID(),
        mode: 'contract',
        expectedRevision: revision,
        sourcePlanIds: [],
        instruction,
        plan: {
          kind: 'bookOverview',
          title: 'Inferência de contrato editorial',
          status: 'proposal',
          fields: {},
          references: sources.map((source) => source.reference),
        },
        ...(captureGeneration ? { generation: captureGeneration() } : {}),
      };
      setPending(request);
      setResponse(null);
      try {
        const result = await startLiteraryProposal(request);
        if (epoch.current !== current || cancelIntent.current.has(request.operationId)) return;
        setResponse(result);
        if (result.state !== 'running' && result.state !== 'unconfirmed') setPending(null);
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
    });
  const inspect = (operationId?: string) =>
    run(async () => {
      const id = operationId ?? pending?.operationId ?? response?.operationId;
      if (!id) return;
      const current = epoch.current;
      const result = await getLiteraryProposal(bookId, id);
      if (epoch.current !== current) return;
      setResponse(result);
      if (result.state !== 'running' && result.state !== 'unconfirmed')
        setPending((value) => (value?.operationId === id ? null : value));
    });
  const list = (afterId: string | null = null) =>
    run(async () => {
      const current = epoch.current;
      const page = await listLiteraryProposals(bookId, afterId);
      if (epoch.current === current)
        setPrevious((last) => ({
          ...page,
          items: afterId ? [...(last?.items ?? []), ...page.items] : page.items,
        }));
    });
  const cancel = async () => {
    if (!pending || canceling || disabled) return;
    const current = epoch.current,
      id = pending.operationId;
    cancelIntent.current.add(id);
    setCanceling(true);
    setError(null);
    try {
      const result = await cancelLiteraryProposal(bookId, id);
      if (epoch.current !== current) return;
      setResponse(result);
      if (result.state !== 'running' && result.state !== 'unconfirmed') {
        setPending(null);
        requestSequence.current += 1;
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
  const use = () =>
    run(async () => {
      if (!response?.result?.contractProposal) return;
      const current = epoch.current;
      const result = await getLiteraryProposal(bookId, response.operationId);
      if (epoch.current !== current) return;
      setResponse(result);
      if (result.state !== 'done' || !result.result?.contractProposal)
        throw new Error('As fontes mudaram. Confira-as antes de inferir novamente.');
      latestUse.current(result.result.contractProposal);
    });
  const locked = disabled || busy || pending !== null || canceling;
  return (
    <details className={styles.decisionForm}>
      <summary>Recuperar a direção editorial a partir de uma obra existente</summary>
      <p>
        Escolha capítulos, cenas ou fichas para propor as lacunas do contrato. A inferência
        permanece em revisão até você salvar.
      </p>
      {error && <Alert variant="destructive">{error}</Alert>}
      <Dropdown
        mode="select"
        label="Tipo de fonte para o contrato"
        value={kind}
        options={Object.entries(referenceLabels)
          .filter(([value]) => value !== 'volumeUnit')
          .map(([value, label]) => ({ value, label }))}
        disabled={locked}
        onValueChange={(value) => {
          setKind(value as LiteraryReferenceKind);
          setOptions(null);
        }}
      />
      <Button variant="outline" disabled={locked} onClick={() => void browse()}>
        Consultar fontes
      </Button>
      {options?.items.map((item) => (
        <Button
          key={item.reference.kind + ':' + item.reference.id}
          variant="ghost"
          disabled={
            locked ||
            sources.length >= 12 ||
            sources.some((source) => source.reference.sourceToken === item.reference.sourceToken)
          }
          onClick={() => setSources([...sources, item])}
        >
          Incluir {item.label}
        </Button>
      ))}
      {options?.nextAfterId && (
        <Button
          variant="outline"
          disabled={locked}
          onClick={() => void browse(options.nextAfterId)}
        >
          Mais fontes
        </Button>
      )}
      <ul>
        {sources.map((source, index) => (
          <li key={source.reference.kind + ':' + source.reference.id}>
            {source.label}
            <Button
              disabled={locked}
              variant="ghost"
              onClick={() => setSources(sources.filter((_, at) => at !== index))}
            >
              Remover fonte
            </Button>
          </li>
        ))}
      </ul>
      <Textarea
        label="Orientação para inferir o contrato"
        maxLength={4000}
        value={instruction}
        disabled={locked}
        onChange={(event) => setInstruction(event.target.value)}
      />
      <Button disabled={locked || !sources.length} onClick={() => void generate()}>
        Propor direção editorial
      </Button>
      {pending && (
        <Button variant="outline" disabled={disabled || busy} onClick={() => void inspect()}>
          Consultar inferência pendente
        </Button>
      )}
      {pending && (
        <Button variant="outline" disabled={disabled || canceling} onClick={() => void cancel()}>
          Cancelar inferência pendente
        </Button>
      )}
      <Button variant="ghost" disabled={busy || disabled} onClick={() => void list()}>
        Consultar inferências anteriores
      </Button>
      {previous && (
        <section aria-label="Inferências preservadas">
          {previous.items
            .filter((item) => item.mode === 'contract')
            .map((item) => (
              <Button
                variant="ghost"
                disabled={busy || disabled}
                key={item.operationId}
                onClick={() => void inspect(item.operationId)}
              >
                Consultar inferência de {new Date(item.createdAt).toLocaleString('pt-BR')}
              </Button>
            ))}
          {previous.nextAfterId && (
            <Button
              variant="outline"
              disabled={busy || disabled}
              onClick={() => void list(previous.nextAfterId)}
            >
              Mais inferências
            </Button>
          )}
        </section>
      )}
      {response?.state === 'error' && <Alert variant="destructive">{response.message}</Alert>}
      {response?.state === 'stale' && (
        <Alert variant="warning">
          As fontes ou o contrato mudaram. Confira a seleção antes de gerar outra proposta.
        </Alert>
      )}
      {response?.state === 'canceled' && <Alert>Inferência cancelada.</Alert>}
      {response?.result?.contractProposal && (
        <>
          <h3>Direção editorial proposta</h3>
          <p>{response.result.rationale}</p>
          <dl>
            {Object.entries(response.result.contractProposal.fields)
              .filter(([, value]) => value)
              .map(([key, value]) => (
                <div key={key}>
                  <dt>{editorialFields[key as keyof typeof editorialFields]}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
          </dl>
          <ul>
            {response.result.contractProposal.decisions.map((decision) => (
              <li key={decision.id}>{decision.text} · Proposta da IA</li>
            ))}
          </ul>
          <ul>
            {response.result.findings.map((finding, index) => (
              <li key={index}>
                <blockquote>{finding.quote}</blockquote>
                <p>{finding.problem}</p>
                <p>{finding.action}</p>
              </li>
            ))}
          </ul>
          <Button disabled={locked} onClick={() => void use()}>
            Adicionar propostas às lacunas do rascunho
          </Button>
          <p>
            Os campos já preenchidos serão preservados. Confira as propostas antes de salvar o
            contrato.
          </p>
        </>
      )}
    </details>
  );
}
