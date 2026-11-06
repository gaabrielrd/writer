import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth';
import { listScenes, type ScenePage, type SceneSummary } from '@/features/scenes';
import {
  Alert,
  Badge,
  Button,
  Dialog,
  Dropdown,
  EmptyState,
  LoadingState,
  Textarea,
} from '@/shared/ui';
import {
  getLiteraryProseSourceInfo,
  startLiteraryProse,
  getLiteraryProse,
  listLiteraryProse,
  cancelLiteraryProse,
  applyLiteraryProse,
  recoverLiteraryProse,
  cancelPendingLiteraryProse,
  type LiteraryProseMode,
  type ProseResponse,
  type ProseSourceInfo,
  type StartLiteraryProse,
  type ApplyLiteraryProse,
  type ProseApplication,
} from '../services/literaryProseService';
import styles from './EditorialContractPanel.module.css';
import { WritingSourcePicker } from './WritingSourcePicker';
const modes: Record<LiteraryProseMode, string> = {
  draftScene: 'Redigir cena preparada',
  reviseScene: 'Propor versão revisada da cena',
  reviewStructure: 'Revisar arquitetura e continuidade',
  reviewProse: 'Revisar prosa e experiência',
};
const states: Record<ProseResponse['state'], string> = {
  unconfirmed: 'Pedido sem confirmação',
  running: 'Pedido registrado; resultado pendente',
  done: 'Proposta disponível',
  applied: 'Proposta aplicada',
  stale: 'Texto ou fontes alterados',
  revoked: 'Origem indisponível',
  canceled: 'Pedido cancelado',
  error: 'Não concluído',
};
const definitive = (cause: unknown) =>
  typeof cause === 'object' &&
  cause !== null &&
  'code' in cause &&
  [
    'functions/invalid-argument',
    'functions/not-found',
    'functions/permission-denied',
    'functions/unauthenticated',
    'functions/failed-precondition',
    'functions/resource-exhausted',
  ].includes(String(cause.code));
export function LiteraryProsePanel({
  bookId,
  chapterId,
  onWorkChange,
  captureGeneration,
}: {
  bookId: string;
  chapterId: string;
  onWorkChange?: (state: { dirty: boolean; pending: boolean }) => void;
  captureGeneration?: () => unknown;
}) {
  const { user } = useAuth();
  const [scenes, setScenes] = useState<ScenePage<SceneSummary> | null>(null),
    [sceneId, setSceneId] = useState('');
  const [source, setSource] = useState<ProseSourceInfo | null>(null),
    [mode, setMode] = useState<LiteraryProseMode>('draftScene');
  const [planIds, setPlanIds] = useState<string[] | undefined>(undefined);
  const [segment, setSegment] = useState('0'),
    [instruction, setInstruction] = useState('');
  const [pending, setPending] = useState<StartLiteraryProse | null>(null),
    [proposal, setProposal] = useState<ProseResponse | null>(null);
  const [requests, setRequests] = useState<Awaited<ReturnType<typeof listLiteraryProse>> | null>(
    null,
  );
  const [applyPending, setApplyPending] = useState<ApplyLiteraryProse | null>(null),
    [receipt, setReceipt] = useState<ProseApplication | null>(null);
  const [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [canceling, setCanceling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const epoch = useRef(0),
    working = useRef(false),
    sequence = useRef(0),
    cancelIntent = useRef(new Set<string>());
  useEffect(() => {
    onWorkChange?.({ dirty: !!instruction, pending: pending !== null || applyPending !== null });
  }, [instruction, pending, applyPending, onWorkChange]);
  useEffect(() => {
    epoch.current += 1;
    return () => {
      epoch.current += 1;
    };
  }, [bookId, chapterId, user?.uid]);
  const run = async (task: (current: number, runId: number) => Promise<void>) => {
    if (working.current) return;
    const current = epoch.current,
      runId = ++sequence.current;
    working.current = true;
    setBusy(true);
    setError(null);
    try {
      await task(current, runId);
    } catch (cause) {
      if (epoch.current === current && sequence.current === runId)
        setError(cause instanceof Error ? cause.message : 'Pedido literário indisponível.');
    } finally {
      if (epoch.current === current && sequence.current === runId) {
        working.current = false;
        setBusy(false);
      }
    }
  };
  const loadScenes = (cursor: string | null = null) =>
    run(async (current) => {
      const result = await listScenes({
        target: { kind: 'book', id: bookId },
        parentId: chapterId,
        archived: false,
        stage: 'all',
        cursor,
        limit: 20,
      });
      if (epoch.current === current)
        setScenes((previous) => ({
          ...result,
          items: cursor ? [...(previous?.items ?? []), ...result.items] : result.items,
        }));
    });
  const inspectSource = () =>
    run(async (current) => {
      const value = await getLiteraryProseSourceInfo(bookId, chapterId, sceneId);
      if (epoch.current === current) {
        setSource(value);
        if (value.collaboration?.mode === 'guidance') setMode('reviewStructure');
        setSegment('0');
      }
    });
  const generate = () =>
    run(async (current, runId) => {
      if (!source) return;
      const input: StartLiteraryProse = {
        target: { kind: 'book', id: bookId },
        chapterId,
        sceneId,
        mode,
        segment: mode.startsWith('review') ? Number(segment) : 0,
        requestId: crypto.randomUUID(),
        instruction,
        expectedSourceToken: source.sourceToken,
        ...(mode !== 'draftScene' && planIds !== undefined ? { planIds: [...planIds] } : {}),
        ...(captureGeneration ? { generation: captureGeneration() } : {}),
      };
      setPending(input);
      setProposal(null);
      setReceipt(null);
      let result;
      try {
        result = await startLiteraryProse(input, user?.uid ?? '');
      } catch (cause) {
        if (epoch.current === current && sequence.current === runId && definitive(cause))
          setPending(null);
        throw cause;
      }
      if (
        epoch.current !== current ||
        sequence.current !== runId ||
        cancelIntent.current.has(input.requestId)
      )
        return;
      setPending(null);
      setProposal(result);
      setInstruction('');
    });
  const inspect = (id: string) =>
    run(async (current) => {
      const result = await getLiteraryProse(bookId, id);
      if (epoch.current === current) {
        setProposal(result);
        setReceipt(null);
      }
    });
  const recover = () =>
    run(async (current) => {
      if (!pending) return;
      const result = await recoverLiteraryProse(pending, user?.uid ?? '');
      if (epoch.current !== current) return;
      setProposal(result);
      if (result.state !== 'unconfirmed' && result.state !== 'running') {
        setPending(null);
        setInstruction('');
      }
    });
  const cancel = async () => {
    const id = pending?.requestId ?? proposal?.requestId;
    if (!id || canceling) return;
    const current = epoch.current;
    cancelIntent.current.add(id);
    setCanceling(true);
    setError(null);
    try {
      const result = pending
        ? await cancelPendingLiteraryProse(pending, user?.uid ?? '')
        : await cancelLiteraryProse(bookId, id);
      if (epoch.current !== current) return;
      sequence.current += 1;
      working.current = false;
      setBusy(false);
      setPending(null);
      setProposal(result);
    } catch (cause) {
      if (epoch.current === current)
        setError(cause instanceof Error ? cause.message : 'Cancelamento sem confirmação.');
    } finally {
      if (epoch.current === current) setCanceling(false);
    }
  };
  const loadRequests = (afterId: string | null = null) =>
    run(async (current) => {
      const result = await listLiteraryProse(bookId, chapterId, afterId);
      if (epoch.current === current)
        setRequests((previous) => ({
          ...result,
          items: afterId ? [...(previous?.items ?? []), ...result.items] : result.items,
        }));
    });
  const apply = () =>
    run(async (current) => {
      if (!proposal || proposal.sourceRevision === undefined) return;
      const input = applyPending ?? {
        target: { kind: 'book' as const, id: bookId },
        requestId: proposal.requestId,
        operationId: crypto.randomUUID(),
        expectedRevision: proposal.sourceRevision,
      };
      setApplyPending(input);
      setConfirm(false);
      let result;
      try {
        result = await applyLiteraryProse(input, user?.uid ?? '');
      } catch (cause) {
        if (epoch.current === current && definitive(cause)) setApplyPending(null);
        throw cause;
      }
      if (epoch.current === current) {
        setApplyPending(null);
        setReceipt(result);
        setSource(null);
        setProposal({ ...proposal, state: 'applied', applicable: false });
      }
    });
  const locked = busy || pending !== null || applyPending !== null || canceling;
  return (
    <section className={styles.panel} aria-label="Redação e revisão de cenas">
      <h3>Redação e revisão com IA</h3>
      {(source?.collaboration?.mode === 'guidance' ||
        proposal?.collaboration?.mode === 'guidance') && (
        <Alert>
          Orientação: analise a estrutura e a prosa e consulte sugestões. Você conduz a escrita;
          estas propostas não são aplicadas ao manuscrito.
        </Alert>
      )}
      <p>
        A geração usa a IA da plataforma. Gerar e analisar não debita; aplicar uma nova versão custa
        1 crédito.
      </p>
      <p>
        Trabalhe nas cenas nativas do capítulo. A redação inicial exige preparação conferida e
        aceita. Revisões apontam problemas no texto efetivamente lido; a aplicação de uma nova
        versão depende do seu aceite.
      </p>
      {error && <Alert variant="destructive">{error}</Alert>}
      {busy && <LoadingState label="Consultando ou gerando proposta…" />}
      {pending && (
        <Alert>
          Pedido registrado ou sem confirmação. Consulte o resultado; nenhum pedido será reenviado
          ao abrir esta área.
        </Alert>
      )}
      {applyPending && (
        <Alert>
          A aplicação precisa de confirmação. Recupere o mesmo aceite antes de alterar a cena.
        </Alert>
      )}
      <Button variant="outline" disabled={locked} onClick={() => void loadScenes()}>
        Consultar cenas do capítulo
      </Button>
      {scenes && !scenes.items.length && (
        <EmptyState
          title="Nenhuma cena ativa"
          description="No planejamento nativo, crie cenas neste capítulo. Capítulos legados precisam de conversão explícita antes deste fluxo."
        />
      )}
      {scenes && (
        <Dropdown
          mode="select"
          label="Cena para redação ou revisão"
          value={sceneId}
          disabled={locked}
          options={scenes.items.map((scene) => ({ value: scene.id, label: scene.title }))}
          onValueChange={(id) => {
            setSceneId(id);
            setSource(null);
            setProposal(null);
            setReceipt(null);
            setSegment('0');
          }}
        />
      )}
      {scenes?.nextCursor && (
        <Button
          variant="outline"
          disabled={locked}
          onClick={() => void loadScenes(scenes.nextCursor)}
        >
          Mais cenas
        </Button>
      )}
      {sceneId && (
        <Button variant="outline" disabled={locked} onClick={() => void inspectSource()}>
          Conferir versão salva da cena
        </Button>
      )}
      {source && (
        <>
          <p>
            {source.characters} caracteres de texto · {source.segments.length} segmentos de revisão
            · {source.empty ? 'Cena ainda sem prosa.' : 'Texto salvo disponível.'}
          </p>
          <Dropdown
            mode="select"
            label="Operação literária"
            value={mode}
            disabled={locked}
            options={Object.entries(modes)
              .filter(
                ([value]) => source?.collaboration?.mode !== 'guidance' || value !== 'draftScene',
              )
              .map(([value, label]) => ({ value, label }))}
            onValueChange={(value) => {
              setMode(value as LiteraryProseMode);
              setSegment('0');
            }}
          />
          {mode.startsWith('review') && (
            <Dropdown
              mode="select"
              label="Segmento de revisão"
              value={segment}
              disabled={locked}
              options={source.segments.map((item) => ({
                value: String(item.index),
                label:
                  'Parte ' +
                  (item.index + 1) +
                  ' · caracteres ' +
                  item.coreStart +
                  '–' +
                  item.coreEnd,
              }))}
              onValueChange={setSegment}
            />
          )}
          {mode !== 'draftScene' && (
            <WritingSourcePicker
              bookId={bookId}
              value={planIds}
              onChange={setPlanIds}
              disabled={locked}
            />
          )}
          {mode === 'draftScene' && (
            <p>A redação usa os planejamentos e as fontes da preparação aceita.</p>
          )}
          <Textarea
            label="Orientação para esta operação"
            maxLength={4000}
            disabled={locked}
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
          />
          <div className={styles.actions}>
            <Button disabled={locked} onClick={() => void generate()}>
              Gerar proposta
            </Button>
            {!!instruction && (
              <Button variant="ghost" disabled={locked} onClick={() => setInstruction('')}>
                Descartar orientação não enviada
              </Button>
            )}
          </div>
        </>
      )}
      {pending && (
        <Button variant="outline" disabled={busy || canceling} onClick={() => void recover()}>
          Consultar resultado do mesmo pedido
        </Button>
      )}
      {(pending || proposal?.state === 'running') && (
        <Button
          variant="outline"
          disabled={canceling || applyPending !== null}
          onClick={() => void cancel()}
        >
          Cancelar geração
        </Button>
      )}
      <Button variant="outline" disabled={locked} onClick={() => void loadRequests()}>
        Consultar pedidos do capítulo
      </Button>
      {requests && !requests.items.length && (
        <EmptyState
          title="Nenhum pedido registrado"
          description="Escolha uma cena e confira sua versão salva para começar."
        />
      )}
      {requests && (
        <ul>
          {requests.items.map((item) => (
            <li key={item.requestId}>
              <Button
                variant="ghost"
                disabled={locked}
                onClick={() => void inspect(item.requestId)}
              >
                {item.mode ? modes[item.mode] : 'Pedido'} ·{' '}
                {new Date(item.createdAt).toLocaleString('pt-BR')} · {states[item.state]}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {requests?.nextAfterId && (
        <Button
          variant="outline"
          disabled={locked}
          onClick={() => void loadRequests(requests.nextAfterId)}
        >
          Mais pedidos
        </Button>
      )}
      {proposal && (
        <section className={styles.comparison}>
          <Badge>{states[proposal.state]}</Badge>
          {proposal.historical && (
            <Alert variant="warning">
              Leitura histórica: este pedido usa texto ou fontes de uma versão anterior. A proposta
              não pode ser aplicada.
            </Alert>
          )}
          {proposal.sceneTitle && <p>Cena deste pedido: {proposal.sceneTitle}</p>}
          {proposal.hasBlockingFindings && (
            <Alert variant="warning">
              Há impedimentos estruturais apontados nesta proposta. Confira as decisões e as fontes
              antes de gerar uma nova versão aplicável.
            </Alert>
          )}
          {proposal.message && <p>{proposal.message}</p>}
          {proposal.coverage && (
            <p>
              Parte {proposal.coverage.segment + 1} de {proposal.coverage.segmentCount} desta cena.
              {proposal.coverage.completeScene
                ? ' O texto integral desta cena foi incluído.'
                : ' Apenas o segmento indicado foi incluído, com contexto das fronteiras.'}{' '}
              Esta operação não declara revisão integral de capítulo ou livro.
            </p>
          )}
          {proposal.sourceText !== undefined && (
            <details>
              <summary>Texto utilizado da cena</summary>
              <p className={styles.contextText}>{proposal.sourceText || 'Cena sem prosa.'}</p>
            </details>
          )}
          {proposal.documents && (
            <details>
              <summary>Guia, preparação e outras fontes utilizadas</summary>
              {proposal.documents
                .filter((document) => document.id !== 'manuscript')
                .map((document) => (
                  <section key={document.id}>
                    <h4>{document.label}</h4>
                    <p className={styles.contextText}>{document.text}</p>
                  </section>
                ))}
            </details>
          )}
          {proposal.result && (
            <>
              <p className={styles.contextText}>{proposal.result.rationale}</p>
              {!proposal.result.findings.length && proposal.mode?.startsWith('review') && (
                <p>
                  Nenhum achado foi retornado neste segmento. Isso não representa aceite autoral do
                  conjunto.
                </p>
              )}
              {proposal.result.findings.map((finding, index) => (
                <section className={styles.decisionForm} key={index}>
                  <Badge>
                    {finding.severity === 'blocking'
                      ? 'Impedimento'
                      : finding.severity === 'warning'
                        ? 'Atenção'
                        : 'Sugestão'}
                  </Badge>
                  <blockquote>{finding.quote}</blockquote>
                  <p>
                    Fonte:{' '}
                    {proposal.documents?.find((document) => document.id === finding.sourceId)
                      ?.label ?? 'Fonte selecionada'}{' '}
                    · posição {finding.offset}
                  </p>
                  <p>{finding.problem}</p>
                  <p>{finding.action}</p>
                </section>
              ))}
              {!!proposal.result.text && (
                <>
                  <h4>Nova versão proposta</h4>
                  <p className={styles.contextText}>{proposal.result.text}</p>
                </>
              )}
            </>
          )}
          {proposal.applicable && (
            <Button disabled={locked} onClick={() => setConfirm(true)}>
              Revisar aplicação à cena · {proposal.applyCost ?? 1} crédito
            </Button>
          )}
          {applyPending && (
            <Button disabled={busy || canceling} onClick={() => void apply()}>
              Recuperar o mesmo aceite
            </Button>
          )}
          <Button
            variant="outline"
            disabled={locked}
            onClick={() => void inspect(proposal.requestId)}
          >
            Atualizar disponibilidade da proposta
          </Button>
        </section>
      )}
      {receipt && (
        <Alert variant="success">
          Texto salvo na revisão {receipt.revision}. Débito confirmado: {receipt.chargedCredits}{' '}
          crédito. A versão anterior permanece no histórico.
        </Alert>
      )}
      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Aplicar a versão proposta à cena"
        description="O texto salvo desta cena será substituído pela proposta exibida. Uma versão anterior será preservada no histórico. Texto, preparação e fontes serão conferidos novamente."
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirm(false)}>
              Voltar à leitura
            </Button>
            <Button disabled={locked} onClick={() => void apply()}>
              Aplicar à cena · {proposal?.applyCost ?? 1} crédito
            </Button>
          </>
        }
      >
        <p>
          Esta ação grava o manuscrito e o recibo junto do débito. Se houver alterações não salvas
          em outro editor, confira-as antes de aplicar.
        </p>
      </Dialog>
    </section>
  );
}
