import { useState } from 'react';
import { MessageSquare, Plus, RefreshCw, Send, Square, Eye, Trash2 } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Dialog,
  Dropdown,
  EmptyState,
  Input,
  LoadingState,
  Textarea,
} from '@/shared/ui';
import {
  CHAT_REASONING_LABELS,
  DEFAULT_BYOK_CHAT_MODELS,
  getChatModelCapabilities,
  type ChatGenerationRequest,
  type ChatReasoningLevel,
} from '../model/chatGeneration';
import type { EditorChatController } from '../model/editorChatController';
import type { EditorChatCaptureSource } from '../model/editorChatEditorBridge';
import type { EditorChatApplyInput } from '../services/editorChatApplyService';
import styles from './EditorChatPanel.module.css';

export interface EditorChatPanelProps {
  open: boolean;
  onClose: () => void;
  controller: EditorChatController;
  generation: ChatGenerationRequest;
  onGenerationChange: (generation: ChatGenerationRequest) => void;
  disabledReason?: string | null;
  onApply: (input: EditorChatApplyInput) => Promise<void>;
  onRunByok: () => Promise<void>;
  byokRunning?: boolean;
}
const sources: { value: EditorChatCaptureSource; label: string }[] = [
  { value: 'auto', label: 'Automático' },
  { value: 'selection', label: 'Seleção' },
  { value: 'cursor', label: 'Ao redor do cursor' },
  { value: 'viewport', label: 'Trecho visível' },
  { value: 'document', label: 'Documento' },
];
const phases = {
  local: 'Consultando fichas locais',
  global: 'Consultando universo',
  ready: 'Pronto para conferir',
  stale: 'Contexto desatualizado',
  consumed: 'Contexto já utilizado',
  canceled: 'Contexto cancelado',
  deleted: 'Contexto excluído',
};
const turnStates = {
  running: 'Gerando',
  'awaiting-byok': 'Aguardando provedor próprio',
  done: 'Concluída',
  stopped: 'Interrompida',
  failed: 'Falhou',
  blocked: 'Indisponível',
};
const operationLabels: Record<string, string> = {
  prepareContext: 'Preparar contexto',
  advanceContext: 'Consultar contexto',
  createConversation: 'Criar conversa',
  renameConversation: 'Renomear conversa',
  send: 'Enviar pergunta',
  stopTurn: 'Interromper geração',
  completeBYOK: 'Conferir resposta do seu provedor',
  failBYOK: 'Registrar interrupção do seu provedor',
  applySuggestion: 'Aplicar sugestão',
  deleteContext: 'Excluir contexto',
  deleteConversation: 'Excluir conversa',
  advanceCleanup: 'Continuar exclusão',
  setAdventurePersonaBinding: 'Atualizar persona',
};
const reasonLabels: Record<string, string> = {
  'identity-changed': 'O acesso ou a origem do texto mudou. Confira os controles atuais.',
  'context-stale': 'O contexto mudou. Exclua a preparação anterior e prepare outro contexto.',
  'revision-conflict': 'O texto ou a conversa mudou em outra operação. Confira o estado atual.',
  'cursor-stale': 'O catálogo mudou. Atualize a lista antes de continuar.',
  'insufficient-credits': 'Não há créditos suficientes para aplicar a sugestão.',
  'provenance-revoked': 'Uma origem desta resposta não está mais autorizada.',
  'history-revoked': 'Uma origem do histórico não está mais autorizada.',
  'chat-quota': 'O limite temporário de conversas foi atingido. Tente mais tarde.',
};
type Confirmation =
  | { kind: 'close' }
  | { kind: 'context'; id: string; token: string }
  | { kind: 'delete' | 'rename'; id: string; token: string }
  | { kind: 'apply'; id: string; token: string; turnId: string };

/** Presentation only: all authorized reads and durable commands belong to the controller. */
export function EditorChatPanel(props: EditorChatPanelProps) {
  return <PanelContents key={props.controller.state.scopeKey} {...props} />;
}
function PanelContents({
  open,
  onClose,
  controller,
  generation,
  onGenerationChange,
  disabledReason,
  onApply,
  onRunByok,
  byokRunning = false,
}: EditorChatPanelProps) {
  const s = controller.state;
  const [source, setSource] = useState<EditorChatCaptureSource>('auto');
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [title, setTitle] = useState('');
  const [placement, setPlacement] = useState<'original' | 'retargeted'>('original');
  const [replace, setReplace] = useState(false);
  const [localBusy, setLocalBusy] = useState(false);
  const [localError, setLocalError] = useState(false);
  const pending = s.pending && s.pending.state !== 'settled' ? s.pending : null;
  const busy = Boolean(s.busyAction || localBusy || byokRunning);
  const metadataLocked = busy || Boolean(pending) || s.cleanup?.state === 'deleting';
  const locked = metadataLocked || Boolean(disabledReason);
  const inspection =
    s.inspection &&
    s.inspection.context.contextId === s.contextRef?.id &&
    s.inspection.context.contextToken === s.contextRef?.token
      ? s.inspection
      : null;
  const inspected = Boolean(
    inspection?.frozen &&
    inspection.freshness === 'current' &&
    !s.needsInspection &&
    inspection.context.revision === s.context?.revision,
  );
  const canSend =
    !locked &&
    s.conversation?.state === 'open' &&
    s.context?.phase === 'ready' &&
    inspected &&
    Boolean(s.draft.trim());
  const model = generation.model ?? s.catalog?.platformModel ?? '';
  const capabilities = getChatModelCapabilities(
    generation.provider === 'openai_byok' ? 'openai' : 'gemini',
    model,
  );
  const selected = s.conversationRef;
  const sameConversation =
    confirmation &&
    'id' in confirmation &&
    selected?.id === confirmation.id &&
    selected.token === confirmation.token;
  const sameContext =
    confirmation?.kind === 'context' &&
    s.contextRef?.id === confirmation.id &&
    s.contextRef.token === confirmation.token;
  const applying = confirmation?.kind === 'apply' ? s.turnReads[confirmation.turnId] : null;
  const canApply = Boolean(
    sameConversation &&
    applying?.presentation === 'available' &&
    applying.turn.state === 'done' &&
    applying.answer?.suggestion !== null &&
    applying.answer?.suggestion !== undefined &&
    !locked,
  );
  const askClose = () => {
    if (controller.hasUnsentDraft || pending || busy) setConfirmation({ kind: 'close' });
    else onClose();
  };
  const run = async (work: () => Promise<void>, close = false) => {
    if (localBusy) return;
    setLocalBusy(true);
    setLocalError(false);
    try {
      await work();
      if (close) setConfirmation(null);
    } catch {
      setLocalError(true);
    } finally {
      setLocalBusy(false);
    }
  };
  const confirmAction = () => {
    if (!confirmation || (localBusy && confirmation.kind !== 'close')) return;
    if (confirmation.kind === 'close') {
      setConfirmation(null);
      onClose();
      return;
    }
    if (confirmation.kind === 'context') {
      if (!metadataLocked && sameContext) void run(controller.deleteContext, true);
      return;
    }
    if (!sameConversation) return;
    if (confirmation.kind === 'delete') {
      if (!metadataLocked) void run(controller.deleteConversation, true);
      return;
    }
    if (locked) return;
    if (confirmation.kind === 'rename' && title.trim())
      void run(() => controller.renameConversation(title), true);
    if (confirmation.kind === 'apply' && canApply) {
      const input: EditorChatApplyInput = {
        conversationId: confirmation.id,
        conversationToken: confirmation.token,
        turnId: confirmation.turnId,
        placement,
        replace,
        ...(placement === 'retargeted' ? { source } : {}),
      };
      void run(() => onApply(input), true);
    }
  };
  const awaitingByok = s.turns.some((t) => t.provider === 'byok' && t.state === 'awaiting-byok');
  const running = Boolean(
    s.stream || s.turns.some((t) => t.state === 'running' || t.state === 'awaiting-byok'),
  );
  return (
    <>
      <Dialog
        open={open}
        onClose={askClose}
        title="Assistente de escrita"
        description="Converse sobre este texto. Confira o contexto antes de enviar e confirme cada aplicação."
        maxWidthClass="max-w-6xl"
        className={styles.dialog}
        footer={
          <Button variant="outline" onClick={askClose}>
            Fechar painel
          </Button>
        }
      >
        {disabledReason && (
          <Alert variant="warning" className={styles.notice}>
            {disabledReason}
          </Alert>
        )}
        {(s.error || localError) && (
          <Alert variant="destructive" className={styles.notice} title="Não foi possível concluir">
            {s.error?.uncertain
              ? 'O resultado do pedido ainda precisa ser conferido. Use os controles do pedido pendente antes de tentar outra operação.'
              : 'Confira o estado atual antes de tentar a ação novamente.'}
            {s.error?.reason && reasonLabels[s.error.reason] && (
              <p>{reasonLabels[s.error.reason]}</p>
            )}
          </Alert>
        )}
        {pending && (
          <section className={styles.section} aria-label="Pedido pendente">
            <h3>Pedido pendente</h3>
            <p>
              {operationLabels[pending.action] ?? 'Pedido de escrita'}. A conferência e o
              cancelamento usam o mesmo pedido.
            </p>
            <p className={styles.identifier}>{pending.operationId}</p>
            <div className={styles.actions}>
              <Button
                disabled={busy}
                onClick={() => void run(() => controller.recoverPending('observe'))}
              >
                Conferir pedido
              </Button>
              <Button
                variant="outline"
                disabled={busy || pending.intent === 'cancel'}
                onClick={() => void run(() => controller.recoverPending('cancel'))}
              >
                Cancelar pedido pendente
              </Button>
            </div>
            {pending.intent === 'cancel' && (
              <p>Cancelamento solicitado. Confira o resultado para continuar.</p>
            )}
          </section>
        )}
        {s.cleanup && (
          <section className={styles.section} aria-label="Limpeza">
            <h3>
              {s.cleanup.state === 'deleted' ? 'Exclusão concluída' : 'Exclusão em andamento'}
            </h3>
            <p>{s.cleanup.deletedDocuments} registros removidos.</p>
            {s.cleanup.state === 'deleting' && (
              <Button
                disabled={busy || Boolean(pending)}
                onClick={() => void run(controller.advanceCleanup)}
              >
                Avançar uma página da limpeza
              </Button>
            )}
          </section>
        )}
        <div className={styles.layout}>
          <aside className={styles.section} aria-label="Conversas">
            <h3>
              <MessageSquare className="icon icon-sm" aria-hidden="true" /> Conversas
            </h3>
            <div className={styles.actions}>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void run(controller.refreshConversations)}
              >
                <RefreshCw className="icon icon-sm" aria-hidden="true" />
                Atualizar conversas
              </Button>
              <Button
                disabled={locked || !s.catalog}
                onClick={() => void run(controller.createConversation)}
              >
                <Plus className="icon icon-sm" aria-hidden="true" />
                Nova conversa
              </Button>
            </div>
            {s.catalogStatus === 'loading' && <LoadingState label="Carregando conversas..." />}
            {s.catalogStatus === 'error' && (
              <p role="status">Não foi possível carregar as conversas. Use Atualizar conversas.</p>
            )}
            {!s.conversations.length && s.catalogStatus !== 'loading' && (
              <EmptyState
                title="Nenhuma conversa carregada"
                description="Atualize o catálogo ou crie uma conversa depois de carregá-lo."
              />
            )}
            <ul className={styles.list}>
              {s.conversations.map((c) => (
                <li key={c.conversationId}>
                  <Button
                    variant={selected?.id === c.conversationId ? 'secondary' : 'ghost'}
                    className={styles.conversation}
                    aria-label={`Abrir conversa: ${c.title}`}
                    aria-pressed={selected?.id === c.conversationId}
                    disabled={locked || c.state !== 'open'}
                    onClick={() => void run(() => controller.selectConversation(c.conversationId))}
                  >
                    {c.title}
                  </Button>
                </li>
              ))}
            </ul>
            {s.catalog?.nextCursor && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void run(controller.loadMoreConversations)}
              >
                Mais conversas
              </Button>
            )}
            {selected && (
              <div className={styles.actions}>
                <Button
                  variant="outline"
                  disabled={locked || !s.conversation}
                  onClick={() => {
                    setTitle(s.conversation?.title ?? '');
                    setConfirmation({ kind: 'rename', ...selected });
                  }}
                >
                  Renomear conversa
                </Button>
                <Button
                  variant="outline"
                  disabled={metadataLocked}
                  onClick={() => setConfirmation({ kind: 'delete', ...selected })}
                >
                  <Trash2 className="icon icon-sm" aria-hidden="true" />
                  Excluir conversa
                </Button>
              </div>
            )}
            {(s.contextRef || selected || s.cleanupRef) && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void run(controller.refreshKnownControl)}
              >
                Conferir controles atuais
              </Button>
            )}
          </aside>
          <div className={styles.main}>
            <section className={styles.section} aria-label="Contexto da próxima pergunta">
              <h3>Contexto da próxima pergunta</h3>
              <Dropdown
                mode="select"
                label="Origem do trecho"
                value={source}
                options={sources}
                disabled={locked}
                onValueChange={(value) => setSource(value as EditorChatCaptureSource)}
              />
              <div className={styles.actions}>
                <Button
                  disabled={
                    locked ||
                    Boolean(
                      s.contextRef && !['consumed', 'deleted'].includes(s.context?.phase ?? ''),
                    )
                  }
                  onClick={() => void run(() => controller.prepareContext(source))}
                >
                  Preparar contexto
                </Button>
                {s.context && ['local', 'global'].includes(s.context.phase) && (
                  <Button disabled={locked} onClick={() => void run(controller.advanceContext)}>
                    Avançar uma página do contexto
                  </Button>
                )}
                {s.context?.phase === 'ready' && (
                  <Button
                    variant="outline"
                    disabled={locked}
                    onClick={() => void run(controller.inspectContext)}
                  >
                    <Eye className="icon icon-sm" aria-hidden="true" />
                    Conferir contexto
                  </Button>
                )}
                {s.contextRef && s.context?.phase !== 'deleted' && (
                  <Button
                    variant="outline"
                    disabled={metadataLocked}
                    onClick={() => {
                      if (s.contextRef) setConfirmation({ kind: 'context', ...s.contextRef });
                    }}
                  >
                    Excluir contexto
                  </Button>
                )}
              </div>
              {s.context ? (
                <>
                  <Badge>{phases[s.context.phase]}</Badge>
                  <p>
                    {s.context.scannedLocal} fichas locais e {s.context.scannedGlobal} fichas do
                    universo consultadas.
                  </p>
                </>
              ) : (
                <p>
                  Prepare um trecho confirmado do editor. Fichas e persona serão consultadas no
                  servidor.
                </p>
              )}
              {inspection?.frozen && (
                <details className={styles.details} open>
                  <summary>Contexto conferido</summary>
                  <p>
                    Revisão do texto: {inspection.frozen.source.revision}. Capturado em{' '}
                    {new Date(inspection.frozen.capturedAt).toLocaleString()}.
                  </p>
                  {inspection.freshness !== 'current' && (
                    <Alert variant="warning" className={styles.notice}>
                      Este contexto está desatualizado ou sua atualidade não foi confirmada. Prepare
                      outro contexto antes de enviar.
                    </Alert>
                  )}
                  <h4>Trecho</h4>
                  <p className={styles.prose}>{inspection.frozen.capture.text}</p>
                  {inspection.frozen.capture.truncated && (
                    <p>O trecho foi limitado para esta consulta.</p>
                  )}
                  {inspection.frozen.capture.surroundingText && (
                    <>
                      <h4>Ao redor do trecho</h4>
                      <p className={styles.prose}>{inspection.frozen.capture.surroundingText}</p>
                    </>
                  )}
                  <h4>Fichas incluídas ({inspection.frozen.includedEntityCount})</h4>
                  <p>{inspection.frozen.omittedEntityCount} fichas omitidas.</p>
                  {inspection.frozen.lore.map((l) => (
                    <article key={JSON.stringify(l.reference)}>
                      <h5>{l.name}</h5>
                      <p>{l.aliases.join(', ')}</p>
                      <p className={styles.prose}>{l.summary}</p>
                      <p className={styles.prose}>{l.detailsExcerpt}</p>
                      <p>
                        Revisão: {l.capturedRevision ?? 'registro capturado'}
                        {l.detailsTruncated ? ' · Trecho limitado' : ''}
                      </p>
                    </article>
                  ))}
                  <h4>Orientação da persona</h4>
                  <p className={styles.prose}>
                    {inspection.frozen.persona.instruction || 'Sem orientação adicional.'}
                  </p>
                </details>
              )}
              {s.needsInspection && <p>Confira o contexto atual antes de enviar.</p>}
            </section>
            <section className={styles.section} aria-label="Nova pergunta">
              <h3>Nova pergunta</h3>
              <div className={styles.generation}>
                <Dropdown
                  mode="select"
                  label="Provedor"
                  value={generation.provider}
                  disabled={locked}
                  options={[
                    { value: 'platform', label: 'Writer' },
                    { value: 'gemini_byok', label: 'Gemini com minha chave' },
                    { value: 'openai_byok', label: 'OpenAI com minha chave' },
                  ]}
                  onValueChange={(value) => {
                    const provider = value as ChatGenerationRequest['provider'];
                    onGenerationChange({
                      version: 1,
                      provider,
                      model: provider === 'platform' ? null : DEFAULT_BYOK_CHAT_MODELS[provider],
                      reasoning: 'auto',
                    });
                  }}
                />
                {generation.provider === 'platform' ? (
                  <p>Modelo do Writer: {s.catalog?.platformModel ?? 'a confirmar no catálogo'}</p>
                ) : (
                  <Input
                    label="Modelo"
                    value={generation.model ?? ''}
                    disabled={locked}
                    maxLength={120}
                    onChange={(e) => onGenerationChange({ ...generation, model: e.target.value })}
                  />
                )}
                <Dropdown
                  mode="select"
                  label="Raciocínio"
                  value={generation.reasoning}
                  disabled={locked}
                  options={capabilities.levels.map((value) => ({
                    value,
                    label: CHAT_REASONING_LABELS[value],
                  }))}
                  onValueChange={(value) =>
                    onGenerationChange({ ...generation, reasoning: value as ChatReasoningLevel })
                  }
                />
              </div>
              <Textarea
                label="Sua pergunta"
                value={s.draft}
                maxLength={4000}
                onChange={(e) => controller.setDraft(e.target.value)}
                disabled={Boolean(disabledReason)}
                hint="O rascunho fica apenas na memória desta sessão. Conversar não debita créditos; aplicar uma sugestão pode debitar um crédito após a confirmação no servidor."
                rows={4}
              />
              <div className={styles.actions}>
                <Button
                  disabled={!canSend}
                  onClick={() => void run(() => controller.send(generation))}
                >
                  <Send className="icon icon-sm" aria-hidden="true" />
                  Enviar pergunta
                </Button>
                {running && (
                  <Button
                    variant="outline"
                    disabled={localBusy && !s.stream && !byokRunning}
                    onClick={() => void controller.stopTurn()}
                  >
                    <Square className="icon icon-sm" aria-hidden="true" />
                    Interromper geração
                  </Button>
                )}
                {awaitingByok && (
                  <Button disabled={locked} onClick={() => void run(onRunByok)}>
                    Gerar com meu provedor
                  </Button>
                )}
              </div>
              {!selected && <p>Escolha uma conversa para enviar.</p>}
              {s.busyAction && <LoadingState label="Conferindo a operação..." />}
              {byokRunning && (
                <LoadingState label="Consultando seu provedor. A resposta será conferida antes de aparecer." />
              )}
            </section>
            <section className={styles.section} aria-label="Histórico da conversa">
              <h3>{s.conversation?.title ?? 'Histórico da conversa'}</h3>
              {selected && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void run(controller.loadMoreMessages)}
                >
                  {s.messagePage?.nextCursor ? 'Mais mensagens' : 'Atualizar mensagens'}
                </Button>
              )}
              {s.messagesStatus === 'loading' && <LoadingState label="Carregando mensagens..." />}
              {s.messagesStatus === 'error' && (
                <p role="status">
                  Não foi possível carregar o histórico. Atualize as mensagens para conferir.
                </p>
              )}
              {!s.turns.length && s.messagesStatus !== 'loading' && (
                <EmptyState
                  title="Nenhuma mensagem carregada"
                  description="As respostas são abertas somente quando você pede para lê-las."
                />
              )}
              {s.turns.map((turn, index) => {
                const read = s.turnReads[turn.turnId];
                const answer = read?.presentation === 'available' ? read.answer : null;
                return (
                  <article
                    key={turn.turnId}
                    className={styles.message}
                    aria-label={`Mensagem ${index + 1}`}
                  >
                    <header>
                      <h4>Pergunta {index + 1}</h4>
                      <Badge>{turnStates[turn.state]}</Badge>
                    </header>
                    <p className={styles.prose}>
                      {s.questions[turn.turnId] ?? 'Leia a mensagem para consultar a pergunta.'}
                    </p>
                    <Button
                      variant="outline"
                      disabled={locked}
                      onClick={() => void run(() => controller.readTurn(turn.turnId))}
                    >
                      Ler resposta {index + 1}
                    </Button>
                    {read?.presentation === 'blocked' && (
                      <p>
                        Resposta indisponível. A pergunta própria foi preservada. Uma nova leitura
                        exige autorização da mesma origem.
                      </p>
                    )}
                    {answer && (
                      <>
                        <p className={styles.prose}>{answer.text}</p>
                        {answer.freshness !== 'current' && (
                          <p>
                            Esta resposta usa uma captura anterior; o contexto pode estar
                            desatualizado.
                          </p>
                        )}
                        {answer.suggestion !== null && (
                          <>
                            <h5>Sugestão</h5>
                            <p className={styles.prose}>{answer.suggestion}</p>
                            <Button
                              disabled={locked || turn.state !== 'done' || !selected}
                              onClick={() => {
                                if (selected) {
                                  setPlacement('original');
                                  setReplace(false);
                                  setConfirmation({
                                    kind: 'apply',
                                    ...selected,
                                    turnId: turn.turnId,
                                  });
                                }
                              }}
                            >
                              Aplicar sugestão {index + 1}
                            </Button>
                          </>
                        )}
                      </>
                    )}
                  </article>
                );
              })}
              {s.stream && (
                <div role="status" className={styles.message}>
                  <h4>Resposta em andamento</h4>
                  <p className={styles.prose}>{s.stream.text}</p>
                  <p>
                    Trecho provisório; a aplicação estará disponível somente após a conferência da
                    resposta.
                  </p>
                </div>
              )}
            </section>
          </div>
        </div>
      </Dialog>
      <Dialog
        open={open && Boolean(confirmation)}
        className={styles.dialog}
        onClose={() => {
          if (!localBusy || confirmation?.kind === 'close') setConfirmation(null);
        }}
        title={
          confirmation?.kind === 'apply'
            ? 'Confirmar aplicação'
            : confirmation?.kind === 'rename'
              ? 'Renomear conversa'
              : confirmation?.kind === 'close'
                ? 'Fechar o assistente?'
                : 'Confirmar exclusão'
        }
        footer={
          <>
            <Button
              variant="outline"
              disabled={localBusy && confirmation?.kind !== 'close'}
              onClick={() => setConfirmation(null)}
            >
              Voltar
            </Button>
            <Button
              disabled={
                (localBusy && confirmation?.kind !== 'close') ||
                (confirmation?.kind !== 'close' &&
                  ((confirmation?.kind === 'context' || confirmation?.kind === 'delete'
                    ? metadataLocked
                    : locked) ||
                    (confirmation?.kind === 'context' ? !sameContext : !sameConversation) ||
                    (confirmation?.kind === 'rename' && !title.trim()) ||
                    (confirmation?.kind === 'apply' && !canApply)))
              }
              onClick={confirmAction}
            >
              {confirmation?.kind === 'apply'
                ? 'Confirmar aplicação no texto'
                : confirmation?.kind === 'rename'
                  ? 'Salvar título'
                  : confirmation?.kind === 'close'
                    ? 'Fechar agora'
                    : 'Confirmar exclusão'}
            </Button>
          </>
        }
      >
        {confirmation?.kind === 'close' && (
          <p>
            O rascunho está apenas na memória desta sessão e pode ser perdido ao recarregar ou sair.
            Fechar o painel não interrompe uma geração nem cancela um pedido pendente.
          </p>
        )}
        {confirmation?.kind === 'delete' && (
          <p>
            A conversa e suas respostas serão excluídas em etapas. Essa ação não remove o texto já
            aplicado ao manuscrito.
          </p>
        )}
        {confirmation?.kind === 'context' && (
          <p>Excluir esta preparação de contexto antes de preparar outra?</p>
        )}
        {confirmation?.kind === 'rename' && (
          <Input
            label="Título da conversa"
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
          />
        )}
        {confirmation?.kind === 'apply' && (
          <>
            <p>
              A sugestão será conferida novamente no servidor. O texto só será alterado se a base
              confirmada continuar válida.
            </p>
            <Dropdown
              mode="select"
              label="Destino da sugestão"
              value={placement}
              options={[
                { value: 'original', label: 'Trecho original' },
                { value: 'retargeted', label: 'Nova seleção ou posição' },
              ]}
              onValueChange={(value) => setPlacement(value as typeof placement)}
              disabled={localBusy}
            />
            {placement === 'retargeted' && (
              <Dropdown
                mode="select"
                label="Nova origem no editor"
                value={source}
                options={sources}
                onValueChange={(value) => setSource(value as EditorChatCaptureSource)}
                disabled={localBusy}
              />
            )}
            <Dropdown
              mode="select"
              label="Modo de aplicação"
              value={replace ? 'replace' : 'insert'}
              options={[
                { value: 'insert', label: 'Inserir' },
                { value: 'replace', label: 'Substituir trecho' },
              ]}
              onValueChange={(value) => setReplace(value === 'replace')}
              disabled={localBusy}
            />
            {!canApply && <p>A resposta precisa continuar disponível e autorizada para aplicar.</p>}
          </>
        )}
        {localError && (
          <Alert variant="destructive" className={styles.notice}>
            Não foi possível confirmar a ação. Confira o estado antes de tentar novamente.
          </Alert>
        )}
      </Dialog>
    </>
  );
}
