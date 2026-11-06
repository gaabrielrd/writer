import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth';
import {
  Button,
  Dropdown,
  Textarea,
  Alert,
  ErrorState,
  EmptyState,
  LoadingState,
  DialogRoot,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from '@/shared/ui';
import type {
  ImpactFrame,
  ImpactScope,
  ImpactCheck,
  ImpactPageKind,
  ImpactDecisionStatus,
  ImpactDecision,
  ImpactResolve,
} from '../model/impact';
import { impactClosed } from '../model/impact';
import { useLiteraryImpact } from '../hooks/useLiteraryImpact';
import * as api from '../services/literaryImpactService';
import { LiteraryImpactScopeFields, type ImpactSelection } from './LiteraryImpactScopeFields';
import styles from './EditorialContractPanel.module.css';
const phaseLabels: Record<ImpactFrame['phase'], string> = {
  registering: 'Registrando',
  preparing: 'Preparando índices autorizados',
  freezing: 'Congelando fontes',
  collecting: 'Inventariando vínculos',
  confirming: 'Reconferindo o inventário',
  traversing: 'Propagando dependências',
  'final-census': 'Conferindo a cobertura final',
  done: 'Inventário encerrado',
  partial: 'Inventário parcial encerrado',
  stale: 'Fontes alteradas: mapa interrompido',
  canceled: 'Cancelado',
};
export function LiteraryImpactPanel({
  bookId,
  onWorkChange,
}: {
  bookId: string;
  onWorkChange?: (value: { dirty: boolean; pending: boolean }) => void;
}) {
  const { user } = useAuth();
  return user ? (
    <ImpactSession
      key={user.uid + ':' + bookId}
      actorId={user.uid}
      bookId={bookId}
      onWorkChange={onWorkChange}
    />
  ) : (
    <ErrorState message="Entre na sua conta para consultar o impacto editorial privado." />
  );
}
function ImpactSession({
  actorId,
  bookId,
  onWorkChange,
}: {
  actorId: string;
  bookId: string;
  onWorkChange?: (value: { dirty: boolean; pending: boolean }) => void;
}) {
  const controller = useLiteraryImpact(actorId, bookId);
  const { journal, frame, busy, closing } = controller;
  const [review, setReview] = useState<{ selection: ImpactSelection; scope: ImpactScope } | null>(
    null,
  );
  const [reading, setReading] = useState(false),
    [error, setError] = useState(''),
    [dirty, setDirty] = useState(false),
    [notesDirty, setNotesDirty] = useState(false);
  const [maps, setMaps] = useState<ImpactFrame[]>([]),
    [after, setAfter] = useState<string | null>(null),
    [listed, setListed] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false),
    [discardSelection, setDiscardSelection] = useState(false),
    [selectionGeneration, setSelectionGeneration] = useState(0);
  const alive = useRef(false),
    readingRef = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const pending = busy || closing || !!journal?.pending || !!journal?.cancelRequested;
  useEffect(() => {
    onWorkChange?.({ dirty: (!journal && dirty) || notesDirty, pending });
  }, [dirty, notesDirty, pending, journal, onWorkChange]);
  useEffect(() => () => onWorkChange?.({ dirty: false, pending: false }), [onWorkChange]);
  async function read(action: () => Promise<void>) {
    if (readingRef.current) return;
    readingRef.current = true;
    setReading(true);
    setError('');
    try {
      await action();
    } catch (cause) {
      if (alive.current)
        setError(cause instanceof Error ? cause.message : 'Não foi possível consultar o mapa.');
    } finally {
      readingRef.current = false;
      if (alive.current) setReading(false);
    }
  }
  async function preflight(selection: ImpactSelection) {
    await read(async () => {
      const scope = await api.getLiteraryImpactScope(bookId, selection.intent);
      if (alive.current) setReview({ selection: structuredClone(selection), scope });
    });
  }
  async function list() {
    await read(async () => {
      const result = await api.listLiteraryImpacts(bookId, after);
      if (!alive.current) return;
      setMaps((current) => [
        ...new Map([...current, ...result.items].map((item) => [item.jobId, item])).values(),
      ]);
      setAfter(result.nextAfterId);
      setListed(true);
    });
  }
  return (
    <section className={styles.panel} aria-label="Mapa de impacto editorial">
      <h3>Mapa de impacto editorial</h3>
      <p>
        Investigue quais recursos dependem de uma fonte. Conferir identidade ou versão não equivale
        a ler o manuscrito ou aprovar sua qualidade.
      </p>
      {controller.error && <ErrorState message={controller.error} />}
      {error && <ErrorState message={error} />}
      {controller.message && <Alert variant="info">{controller.message}</Alert>}
      {(reading || busy || closing) && (
        <LoadingState
          label={
            closing ? 'Confirmando cancelamento…' : busy ? 'Confirmando pedido…' : 'Consultando…'
          }
        />
      )}
      {!journal && (
        <>
          <LiteraryImpactScopeFields
            key={selectionGeneration}
            bookId={bookId}
            disabled={reading || busy || closing}
            onReview={(selection) => void preflight(selection)}
            onDirtyChange={setDirty}
          />
          <Button
            className={styles.sequenceAction}
            variant="outline"
            disabled={reading || busy || closing}
            onClick={() => void list()}
          >
            {listed && after ? 'Mais mapas existentes' : 'Consultar mapas existentes'}
          </Button>
          {listed && maps.length === 0 && <EmptyState title="Nenhum mapa registrado" />}
          {maps.map((item) => (
            <div className={styles.decisionForm} key={item.jobId}>
              <p>
                {phaseLabels[item.phase]} · {new Date(item.createdAt).toLocaleString('pt-BR')} ·{' '}
                {item.bookIds.length} livro(s)
              </p>
              <Button
                className={styles.sequenceAction}
                variant="outline"
                disabled={reading || busy || closing || dirty}
                onClick={() => void controller.adopt(item)}
              >
                Acompanhar este mapa
              </Button>
              {dirty && <p>Conclua ou descarte a seleção atual antes de trocar de mapa.</p>}
              <details>
                <summary>Identificador do mapa</summary>
                <p className={styles.contextText}>{item.jobId}</p>
              </details>
            </div>
          ))}
          {dirty && (
            <Button
              className={styles.sequenceAction}
              variant="ghost"
              disabled={reading || busy}
              onClick={() => setDiscardSelection(true)}
            >
              Descartar alterações da seleção
            </Button>
          )}
        </>
      )}
      {journal && (
        <div className={styles.decisionForm}>
          <h4>Mapa acompanhado neste navegador</h4>
          <p>
            Reabrir este painel não envia pedidos. Consulte o resultado antes de repetir uma
            operação incerta.
          </p>
          <div className={styles.actions}>
            <Button
              className={styles.sequenceAction}
              variant="outline"
              disabled={busy || closing}
              onClick={() => void controller.consult()}
            >
              Consultar resultado original
            </Button>
            <Button
              className={styles.sequenceAction}
              variant="outline"
              disabled={busy || closing}
              onClick={() => void controller.refresh()}
            >
              Consultar estado atual
            </Button>
            {!journal.pending && !journal.cancelRequested && (
              <Button
                className={styles.sequenceAction}
                disabled={busy || closing || !frame?.current || impactClosed(frame.phase)}
                onClick={() => void controller.advance()}
              >
                Avançar um passo
              </Button>
            )}
            {!journal.pending && !journal.cancelRequested && (
              <Button
                className={styles.sequenceAction}
                variant="outline"
                disabled={busy || closing || !frame?.current || impactClosed(frame.phase)}
                onClick={() => void controller.advance(20)}
              >
                Avançar até vinte passos
              </Button>
            )}
            {busy && (
              <Button
                className={styles.sequenceAction}
                variant="outline"
                disabled={closing}
                onClick={controller.pause}
              >
                Pausar após este passo
              </Button>
            )}
            {journal.pending && !journal.cancelRequested && !journal.pending.closeRequested && (
              <Button
                className={styles.sequenceAction}
                disabled={busy || closing}
                onClick={() => void controller.retry()}
              >
                Reenviar o mesmo pedido
              </Button>
            )}
            {journal.pending && journal.pending.kind !== 'start' && !journal.cancelRequested && (
              <Button
                className={styles.sequenceAction}
                variant="outline"
                disabled={busy || closing}
                onClick={() => void controller.closeOperation()}
              >
                Encerrar somente o pedido pendente
              </Button>
            )}
            <Button
              className={styles.sequenceAction}
              variant="outline"
              disabled={closing}
              onClick={() => setConfirmCancel(true)}
            >
              {journal.cancelRequested ? 'Confirmar cancelamento pendente' : 'Cancelar mapa'}
            </Button>
            {frame && impactClosed(frame.phase) && !journal.pending && !journal.cancelRequested && (
              <Button
                className={styles.sequenceAction}
                variant="ghost"
                disabled={busy || closing || notesDirty}
                onClick={() => void controller.release()}
              >
                Liberar acompanhamento local
              </Button>
            )}
          </div>
          {journal.pending && (
            <Alert variant="warning">
              Há um pedido{' '}
              {journal.pending.closeRequested
                ? 'com encerramento solicitado'
                : 'sem confirmação local'}
              . Consultar não o reenvia. O texto de uma resolução permanece somente nesta sessão.
            </Alert>
          )}
          {journal.cancelRequested && (
            <Alert variant="warning">
              O cancelamento foi registrado localmente. Confirme o mesmo pedido no servidor antes de
              iniciar outro mapa.
            </Alert>
          )}
          {frame ? (
            <>
              <p role="status">
                {phaseLabels[frame.phase]} · {frame.steps} passos confirmados · {frame.records}{' '}
                registros examinados
              </p>
              <p>
                {frame.bookIds.length} livro(s) · inventário{' '}
                {Math.min(frame.inventoryIndex + 1, frame.inventoryCount)} de {frame.inventoryCount}
              </p>
              <p>
                {frame.unavailable} fonte(s) indisponível(is) · {frame.unsupported} lacuna(s) de
                cobertura · {frame.identityUnknown} identidade(s) sem comprovação.
              </p>
              {frame.current === false && (
                <Alert variant="warning">
                  As fontes mudaram ou ficaram indisponíveis. Notas próprias continuam consultáveis;
                  um novo mapa exige nova seleção.
                </Alert>
              )}
              <Alert variant="info">
                {frame.coverage?.complete
                  ? 'O inventário das dependências registradas foi conferido. Relações implícitas e origens sem registro histórico exigem análise editorial própria.'
                  : 'A cobertura da busca tem lacunas explícitas. Este inventário não certifica todas as origens legadas ou leitura integral.'}{' '}
                Nenhum resultado autoriza a publicação.
              </Alert>
              <ImpactResults
                key={frame.originToken}
                bookId={bookId}
                frame={frame}
                disabled={pending}
                onDirtyChange={setNotesDirty}
                onResolve={controller.resolve}
              />
            </>
          ) : (
            <EmptyState
              title="Estado ainda não consultado"
              description="Consulte o resultado original e o estado atual para retomar este mapa."
            />
          )}
        </div>
      )}
      <DialogRoot
        open={!!review}
        onOpenChange={(open) => {
          if (!open) setReview(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar investigação de impacto</DialogTitle>
            <DialogDescription>Confira o escopo antes de registrar o mapa.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            {review && (
              <>
                <p>Livros: {review.selection.bookLabels.join(', ')}</p>
                <p>Fontes: {review.selection.labels.join(', ')}</p>
                <p>
                  {review.scope.inventoryCount} inventários. Até {review.scope.maximumBooksPerRun}{' '}
                  livros por investigação.
                </p>
                <p>
                  {review.selection.intent.prepareIndices
                    ? 'Você autoriza a preparação privada dos índices ausentes do guia de leitura.'
                    : 'Índices ausentes permanecerão como lacunas; não serão preparados.'}
                </p>
                <p>
                  A investigação não aplica texto, não gera conteúdo por IA e não aprova a
                  publicação.
                </p>
              </>
            )}
          </DialogBody>
          <DialogFooter>
            <Button
              className={styles.sequenceAction}
              variant="outline"
              onClick={() => setReview(null)}
            >
              Voltar à seleção
            </Button>
            <Button
              className={styles.sequenceAction}
              disabled={!review || busy || closing}
              onClick={() => {
                if (!review) return;
                const frozen = review;
                setReview(null);
                setDirty(false);
                void controller.start(frozen.selection.intent, frozen.scope);
              }}
            >
              Registrar mapa
            </Button>
          </DialogFooter>
        </DialogContent>
      </DialogRoot>
      <DialogRoot open={discardSelection} onOpenChange={setDiscardSelection}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Descartar a seleção atual?</DialogTitle>
            <DialogDescription>
              Livros, fontes e preferência de preparação voltarão à seleção inicial. Nenhum pedido
              será enviado.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              className={styles.sequenceAction}
              variant="outline"
              onClick={() => setDiscardSelection(false)}
            >
              Continuar selecionando
            </Button>
            <Button
              className={styles.sequenceAction}
              onClick={() => {
                setDiscardSelection(false);
                setSelectionGeneration((value) => value + 1);
                setDirty(false);
              }}
            >
              Descartar seleção
            </Button>
          </DialogFooter>
        </DialogContent>
      </DialogRoot>
      <DialogRoot open={confirmCancel} onOpenChange={setConfirmCancel}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar este mapa?</DialogTitle>
            <DialogDescription>
              O cancelamento fecha a investigação e impede a continuação dos seus pedidos. Índices
              canônicos já preparados e notas já salvas permanecem no livro. Um rascunho de
              resolução ainda não confirmado será descartado desta sessão.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              className={styles.sequenceAction}
              variant="outline"
              onClick={() => setConfirmCancel(false)}
            >
              Continuar acompanhando
            </Button>
            <Button
              className={styles.sequenceAction}
              onClick={() => {
                setConfirmCancel(false);
                void controller.cancel();
              }}
            >
              Confirmar cancelamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </DialogRoot>
    </section>
  );
}
const resourceLabel = (label: string | null, kind: string) =>
  label ||
  (
    {
      chat: 'Origem de assistência IA',
      book: 'Livro',
      chapter: 'Capítulo',
      scene: 'Cena',
      plan: 'Ficha de planejamento',
      contract: 'Contrato editorial',
      localLore: 'Ficha do livro',
      globalLore: 'Ficha do universo',
      workflow: 'Ciclo do capítulo',
      sequence: 'Sequência',
      publication: 'Publicação',
      readerGuide: 'Entrada do guia',
    } as Record<string, string>
  )[kind] ||
  'Recurso editorial';
const factLabel = (status: string) =>
  (
    ({
      unindexed: 'Origem nativa sem índice ou comprovação suficiente',
      preserved: 'Versão preservada em metadados',
      'origin-mismatch': 'Origem capturada divergente',
      current: 'Versão atual conferida',
      changed: 'Versão alterada',
      recreated: 'Origem recriada',
      unavailable: 'Fonte indisponível',
      unverified: 'Origem sem comprovação suficiente',
      'out-of-scope': 'Fora do escopo escolhido',
    }) as Record<string, string>
  )[status] || 'Exige conferência';
const impactGapLabels: Record<string, string> = {
  'native-chat-catalog-missing':
    'Existem conversas sem o catálogo nativo de alterações; sua estabilidade não está comprovada.',
  'native-chat-context-scope-unproven': 'A origem deste contexto não está comprovada.',
  'native-chat-context-unindexed-or-mismatched':
    'O contexto não possui índice correspondente à sua identidade e versão atuais.',
  'native-chat-context-preparation-or-cleanup-pending':
    'O contexto ainda não possui fechamento comprovado ou aguarda limpeza.',
  'native-chat-context-body-orphan-or-mismatched':
    'Existe um corpo privado sem cabeçalho correspondente. Seu texto não foi aberto.',
  'native-chat-conversation-scope-unproven': 'O vínculo da conversa ao livro não está comprovado.',
  'native-chat-conversation-cleanup-pending': 'A limpeza desta conversa ainda está pendente.',
  'native-chat-turn-parent-or-scope-unproven':
    'A conversa de origem deste turno está ausente ou sua identidade divergiu.',
  'native-chat-turn-unindexed-or-mismatched':
    'O turno não possui índice correspondente à sua identidade e versão.',
  'native-chat-turn-sidecar-orphan-or-mismatched':
    'Existe corpo ou pergunta sem turno correspondente. Seu texto não foi aberto.',
  'native-chat-application-scope-or-index-unproven':
    'A origem de uma aplicação antiga não pôde ser vinculada por prova nativa.',
  'native-chat-application-unindexed-or-mismatched':
    'Uma aplicação não possui índice correspondente ao recibo original.',
  'legacy-chat-mutation-pending': 'Há alteração ou exclusão de conversa antiga ainda pendente.',
  'legacy-chat-message-native-identity-unproven':
    'A mensagem antiga não registra identidade suficiente para comprovar sua origem.',
  'legacy-chat-message-unindexed-or-mismatched':
    'A mensagem antiga não possui índice correspondente à sua origem.',
  'legacy-chat-message-parent-unavailable':
    'A conversa original da mensagem antiga está indisponível.',
  'legacy-chat-application-unindexed-or-mismatched':
    'O recibo antigo não possui índice correspondente à aplicação original.',
};
function ImpactResults({
  bookId,
  frame,
  disabled,
  onDirtyChange,
  onResolve,
}: {
  bookId: string;
  frame: ImpactFrame;
  disabled: boolean;
  onDirtyChange: (value: boolean) => void;
  onResolve: (
    value: Omit<
      ImpactResolve,
      | 'target'
      | 'jobId'
      | 'operationId'
      | 'expectedOriginToken'
      | 'expectedRevision'
      | 'requestHash'
    >,
  ) => Promise<void>;
}) {
  type Rows = {
    kind: ImpactPageKind;
    items: Array<{
      id: string;
      title: string;
      text: string;
      check?: ImpactCheck;
      decision?: ImpactDecision;
    }>;
    after: string | null;
  };
  const [page, setPage] = useState<Rows | null>(null),
    [reading, setReading] = useState(false),
    [error, setError] = useState('');
  const [selected, setSelected] = useState<ImpactCheck | null>(null),
    [rationale, setRationale] = useState(''),
    [notes, setNotes] = useState<string[]>(['']);
  const [status, setStatus] = useState<ImpactDecisionStatus>('needs-review'),
    [draftTouched, setDraftTouched] = useState(false),
    [discard, setDiscard] = useState(false);
  const alive = useRef(false),
    working = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    onDirtyChange(draftTouched);
    return () => onDirtyChange(false);
  }, [draftTouched, onDirtyChange]);
  async function load(kind: 'checks' | 'visits' | 'nodes' | 'decisions', more = false) {
    if (working.current) return;
    working.current = true;
    setReading(true);
    setError('');
    try {
      const after = more && page?.kind === kind ? page.after : null;
      let items: Rows['items'], next: string | null;
      if (kind === 'checks') {
        const result = await api.readLiteraryImpactPage(
          bookId,
          frame.jobId,
          frame.originToken,
          kind,
          after,
        );
        items = result.items.map((check) => ({
          id: check.id,
          title:
            resourceLabel(check.sourceLabel, check.from.kind) +
            ' → ' +
            resourceLabel(check.targetLabel, check.to.kind),
          text: factLabel(check.facts.status),
          check,
        }));
        next = result.nextAfterId;
      } else if (kind === 'visits') {
        const result = await api.readLiteraryImpactPage(
          bookId,
          frame.jobId,
          frame.originToken,
          kind,
          after,
        );
        items = result.items.map((item) => ({
          id: item.id,
          title: resourceLabel(item.label, item.visit.node.kind),
          text: 'Dependência a conferir · distância ' + item.visit.depth,
        }));
        next = result.nextAfterId;
      } else if (kind === 'nodes') {
        const result = await api.readLiteraryImpactPage(
          bookId,
          frame.jobId,
          frame.originToken,
          kind,
          after,
        );
        items = result.items.map((item) => ({
          id: item.id,
          title: resourceLabel(item.label, item.node.kind),
          text: 'Recurso do inventário selecionado',
        }));
        next = result.nextAfterId;
      } else {
        const result = await api.readLiteraryImpactPage(
          bookId,
          frame.jobId,
          frame.originToken,
          kind,
          after,
        );
        items = result.items.map((item) => ({
          id: item.id,
          title: 'Resolução própria · revisão ' + item.revision,
          text: item.rationale,
          decision: item,
        }));
        next = result.nextAfterId;
      }
      if (!alive.current) return;
      setPage((current) => ({
        kind,
        items: more && current?.kind === kind ? [...current.items, ...items] : items,
        after: next,
      }));
    } catch (cause) {
      if (alive.current)
        setError(
          cause instanceof Error ? cause.message : 'Não foi possível consultar esta página.',
        );
    } finally {
      working.current = false;
      if (alive.current) setReading(false);
    }
  }
  function select(check: ImpactCheck) {
    if (draftTouched) return;
    setSelected(check);
    setRationale(check.decision?.rationale ?? '');
    setNotes(
      check.decision?.evidence.length ? check.decision.evidence.map((item) => item.note) : [''],
    );
    setStatus(check.decision?.status ?? 'needs-review');
  }
  return (
    <div className={styles.panel}>
      <div className={styles.actions}>
        <Button
          className={styles.sequenceAction}
          variant="outline"
          disabled={reading || disabled}
          onClick={() => void load('checks')}
        >
          Consultar vínculos
        </Button>
        <Button
          className={styles.sequenceAction}
          variant="outline"
          disabled={reading || disabled}
          onClick={() => void load('visits')}
        >
          Consultar propagação
        </Button>
        <Button
          className={styles.sequenceAction}
          variant="outline"
          disabled={reading || disabled}
          onClick={() => void load('nodes')}
        >
          Consultar recursos
        </Button>
        <Button
          className={styles.sequenceAction}
          variant="outline"
          disabled={reading || disabled}
          onClick={() => void load('decisions')}
        >
          Consultar notas próprias
        </Button>
      </div>
      {reading && <LoadingState label="Consultando página do mapa…" />}
      {error && <ErrorState message={error} />}
      {page && (
        <>
          <p>Os nomes exibidos são atuais. As provas e lacunas se referem à captura deste mapa.</p>
          {page.items.length === 0 && <EmptyState title="Nenhum registro nesta consulta" />}
          {page.items.map((item) => (
            <div className={styles.decisionForm} key={item.id}>
              <h5 className={styles.contextText}>{item.title}</h5>
              <p className={styles.contextText}>{item.text}</p>
              {item.check && (
                <>
                  <p>
                    {item.check.facts.sourceIdentityVerified
                      ? 'Identidade nativa conferida.'
                      : 'A identidade histórica da fonte não está comprovada.'}{' '}
                    {item.check.facts.versionMatches === null
                      ? 'Associação não comprova a versão do texto.'
                      : ''}
                  </p>
                  {item.check.facts.status === 'unindexed' && (
                    <p>
                      {impactGapLabels[item.check.facts.reason ?? ''] ??
                        'O registro privado existe, mas suas dependências não puderam ser comprovadas.'}{' '}
                      A decisão do autor não preenche essa lacuna de cobertura.
                    </p>
                  )}
                  <Button
                    className={styles.sequenceAction}
                    variant="outline"
                    disabled={
                      disabled ||
                      draftTouched ||
                      !frame.current ||
                      !['done', 'partial'].includes(frame.phase)
                    }
                    onClick={() => select(item.check!)}
                  >
                    Revisar este vínculo
                  </Button>
                </>
              )}
              {item.decision && (
                <>
                  <p>
                    Estado registrado pelo autor:{' '}
                    {item.decision.status === 'reviewed'
                      ? 'Revisado'
                      : item.decision.status === 'dismissed'
                        ? 'Dispensado com justificativa'
                        : 'Requer revisão'}
                  </p>
                  {item.decision.evidence.map((evidence, index) => (
                    <p className={styles.contextText} key={index}>
                      {evidence.note}
                    </p>
                  ))}
                </>
              )}
              <details>
                <summary>Identificador para distinguir registros</summary>
                <p className={styles.contextText}>{item.id}</p>
              </details>
            </div>
          ))}
          {page.after && page.kind !== 'witnesses' && (
            <Button
              className={styles.sequenceAction}
              variant="outline"
              disabled={reading || disabled}
              onClick={() =>
                void load(page.kind as 'checks' | 'visits' | 'nodes' | 'decisions', true)
              }
            >
              Mais registros
            </Button>
          )}
        </>
      )}
      {selected && (
        <div className={styles.decisionForm}>
          <h4>Resolução do vínculo selecionado</h4>
          <p className={styles.contextText}>
            {resourceLabel(selected.sourceLabel, selected.from.kind)} →{' '}
            {resourceLabel(selected.targetLabel, selected.to.kind)}
          </p>
          <Dropdown
            mode="select"
            label="Decisão do autor"
            value={status}
            disabled={disabled}
            options={[
              { value: 'needs-review', label: 'Requer revisão' },
              { value: 'reviewed', label: 'Revisado pelo autor' },
              { value: 'dismissed', label: 'Dispensado com justificativa' },
            ]}
            onValueChange={(value) => {
              setDraftTouched(true);
              setStatus(value as ImpactDecisionStatus);
            }}
          />
          <Textarea
            label="Justificativa"
            value={rationale}
            maxLength={4000}
            disabled={disabled}
            onChange={(event) => {
              setDraftTouched(true);
              setRationale(event.target.value);
            }}
          />
          {notes.map((note, index) => (
            <div className={styles.panel} key={index}>
              <Textarea
                label={index === 0 ? 'Evidência da decisão' : 'Evidência adicional ' + index}
                value={note}
                maxLength={1500}
                disabled={disabled}
                onChange={(event) => {
                  setDraftTouched(true);
                  setNotes((current) =>
                    current.map((value, at) => (at === index ? event.target.value : value)),
                  );
                }}
              />
              {notes.length > 1 && (
                <Button
                  className={styles.sequenceAction}
                  variant="ghost"
                  disabled={disabled}
                  onClick={() => {
                    setDraftTouched(true);
                    setNotes((current) => current.filter((_value, at) => at !== index));
                  }}
                >
                  Remover evidência {index + 1}
                </Button>
              )}
            </div>
          ))}
          {notes.length < 8 && (
            <Button
              className={styles.sequenceAction}
              variant="outline"
              disabled={disabled}
              onClick={() => {
                setDraftTouched(true);
                setNotes((current) => [...current, '']);
              }}
            >
              Adicionar evidência
            </Button>
          )}
          <p>
            As notas são privadas e não representam comprovação automática de leitura. O rascunho
            fica nesta sessão; o acompanhamento guarda somente os identificadores do pedido.
          </p>
          <Button
            className={styles.sequenceAction}
            disabled={
              disabled ||
              !rationale.trim() ||
              (status !== 'needs-review' && !notes.some((note) => note.trim())) ||
              !frame.current
            }
            onClick={() =>
              void onResolve({
                checkId: selected.id,
                observationToken: selected.observationToken,
                expectedDecisionRevision: selected.decision?.revision ?? 0,
                status,
                rationale,
                evidence: notes.filter((note) => note.trim()).map((note) => ({ note })),
              })
            }
          >
            Salvar resolução
          </Button>
          <Button
            className={styles.sequenceAction}
            variant="ghost"
            disabled={disabled}
            onClick={() => setDiscard(true)}
          >
            Fechar rascunho da resolução
          </Button>
        </div>
      )}
      <DialogRoot open={discard} onOpenChange={setDiscard}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fechar este rascunho?</DialogTitle>
            <DialogDescription>
              O texto ainda não confirmado será descartado desta sessão. Resoluções já salvas no
              servidor permanecem no histórico.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              className={styles.sequenceAction}
              variant="outline"
              onClick={() => setDiscard(false)}
            >
              Continuar revisando
            </Button>
            <Button
              className={styles.sequenceAction}
              onClick={() => {
                setDiscard(false);
                setSelected(null);
                setRationale('');
                setNotes(['']);
                setDraftTouched(false);
              }}
            >
              Fechar rascunho
            </Button>
          </DialogFooter>
        </DialogContent>
      </DialogRoot>
    </div>
  );
}
