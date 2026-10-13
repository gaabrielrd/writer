import { useEffect, useId, useRef, useState } from 'react';
import { Copy, Cpu, MoreHorizontal, Plus, Send, Square, X } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Dialog,
  Dropdown,
  EmptyState,
  LoadingState,
  Textarea,
  SidePanelHeader,
} from '@/shared/ui';
import { useChapterChat } from '../hooks/useChapterChat';
import { useAIConfig } from '../hooks/useAIConfig';
import { useAISettings } from '../hooks/useAISettings';
import {
  DEFAULT_BYOK_CHAT_MODELS,
  CHAT_REASONING_LABELS,
  CHAT_REASONING_LEVELS,
  getChatModelCapabilities,
  type ChatReasoningLevel,
} from '../model/chatGeneration';
import { renderRichText } from '@/shared/lib/sanitizeRichText';
import {
  CHAT_COMMANDS,
  CHAT_CONTEXT_LABELS,
  parseChatCommand,
  type ChatContext,
  type ChatContextSource,
  type ChatEditorBridge,
  type ChatMessage,
  type ChatTarget,
} from '../model/chapterChat';
import type { ChatIdentity } from '../services/chapterChatService';
import styles from './ChapterChatPanel.module.css';

const visibleReplyText = (text: string) => text.replace(/\[\[\/?SUGESTAO\]\]/g, '');

export interface ChatApplyInput {
  identity: ChatIdentity;
  message: ChatMessage;
  target: ChatTarget;
  retarget: boolean;
  requestId: string;
  replace: boolean;
}
export function ChapterChatPanel({
  open,
  uid,
  bookId,
  chapterId,
  bridge,
  initialPrompt,
  unavailable,
  contextVersion = '',
  onClose,
  onApply,
}: {
  open: boolean;
  uid: string;
  bookId: string;
  chapterId: string;
  bridge: ChatEditorBridge | null;
  initialPrompt?: { id: number; text: string; context: ChatContext | null };
  unavailable?: string | null;
  contextVersion?: string;
  onClose: () => void;
  onApply: (input: ChatApplyInput) => Promise<void>;
}) {
  const chat = useChapterChat(uid, bookId, chapterId);
  const config = useAIConfig();
  const openAISettings = useAISettings();
  const inspectorId = useId();
  const hintId = useId();
  const reasoningHintId = hintId + '-reasoning';
  const modelLabel =
    config.provider === 'firebase_ai'
      ? chat.page.platformModel || 'Modelo da plataforma'
      : config.customModel || DEFAULT_BYOK_CHAT_MODELS[config.provider];
  const capabilities = getChatModelCapabilities(
    config.provider === 'openai_byok' ? 'openai' : 'gemini',
    config.provider === 'firebase_ai' ? chat.page.platformModel : modelLabel,
  );
  const reasoningUnavailable = !capabilities.levels.includes(chat.reasoning);
  const [source, setSource] = useState<ChatContextSource>('auto');
  const [pinned, setPinned] = useState<ChatContext | null>(null);
  const [inspect, setInspect] = useState(false);
  const [applying, setApplying] = useState(false);
  const [confirmation, setConfirmation] = useState<'delete' | ChatMessage | null>(null);
  const [retarget, setRetarget] = useState<{ message: ChatMessage; context: ChatContext } | null>(
    null,
  );
  const [commandIndex, setCommandIndex] = useState(0);
  const [dismissCommands, setDismissCommands] = useState(false);
  const [newMessages, setNewMessages] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const messages = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const applyingRef = useRef(false);
  const pendingApply = useRef<ChatApplyInput | null>(null);
  const initialId = useRef<number | null>(null);
  const draftChange = useRef(chat.changeDraft);
  const latestMessageId = chat.page.messages.at(-1)?.id;
  useEffect(() => {
    draftChange.current = chat.changeDraft;
  });
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => composer.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);
  useEffect(() => {
    if (chat.loading || !initialPrompt || initialId.current === initialPrompt.id) return;
    initialId.current = initialPrompt.id;
    draftChange.current(initialPrompt.text);
    const frame = requestAnimationFrame(() => {
      if (initialPrompt.context) setPinned(initialPrompt.context);
    });
    return () => cancelAnimationFrame(frame);
  }, [initialPrompt, chat.loading]);
  useEffect(() => {
    if (follow.current) messages.current?.scrollTo({ top: messages.current.scrollHeight });
    else if (chat.partial || latestMessageId) {
      const frame = requestAnimationFrame(() => setNewMessages(true));
      return () => cancelAnimationFrame(frame);
    }
  }, [chat.partial, latestMessageId]);
  const stopRef = useRef(chat.stop);
  useEffect(() => {
    stopRef.current = chat.stop;
  });
  const configVersion = JSON.stringify([config, unavailable, contextVersion]);
  const previousConfig = useRef(configVersion);
  useEffect(() => {
    if (previousConfig.current !== configVersion) {
      previousConfig.current = configVersion;
      void stopRef.current();
    }
  }, [configVersion]);
  const running =
    chat.generating || chat.page.messages.some((message) => message.state === 'running');
  const preview = pinned ?? bridge?.preview(source);
  const commandQuery = /^\/([^\s]*)$/.exec(chat.draft);
  const commands =
    commandQuery && !dismissCommands
      ? CHAT_COMMANDS.filter((command) => command.name.includes(commandQuery[1]!))
      : [];
  const lastUser = [...chat.page.messages].reverse().find((message) => message.role === 'user');
  async function capture() {
    if (pinned) return pinned;
    if (!bridge) throw new Error('O editor ainda está carregando.');
    return bridge.capture(source);
  }
  async function submit() {
    if (running || applyingRef.current) return;
    try {
      const parsed = parseChatCommand(chat.draft);
      if (parsed.command === 'contexto') {
        const choices: Record<string, ChatContextSource> = {
          selecao: 'selection',
          seleção: 'selection',
          cursor: 'cursor',
          viewport: 'viewport',
          capitulo: 'chapter',
          capítulo: 'chapter',
          auto: 'auto',
        };
        if (parsed.instruction && !choices[parsed.instruction])
          throw new Error('Use /contexto selecao, cursor, viewport, capitulo ou auto.');
        if (parsed.instruction) {
          setSource(choices[parsed.instruction]!);
          setPinned(null);
        } else setInspect(true);
        chat.changeDraft('');
        return;
      }
      if (parsed.command === 'ajuda') {
        setInspect(true);
        chat.changeDraft('');
        return;
      }
      const context = await capture();
      composer.current?.focus();
      await chat.send(context);
    } catch (cause) {
      chat.setError((cause as Error).message);
    }
  }
  async function apply(message: ChatMessage, destination?: ChatContext) {
    if (!bridge || applyingRef.current) return;
    const target = destination?.target ?? message.context.target;
    if (!target) {
      await chooseDestination(message);
      return;
    }
    applyingRef.current = true;
    setApplying(true);
    chat.setError(null);
    const operation =
      pendingApply.current?.message.id === message.id
        ? pendingApply.current
        : {
            identity: { ...chat.identity.current },
            message,
            target,
            retarget: Boolean(destination),
            requestId: crypto.randomUUID(),
            replace: target.from !== target.to,
          };
    pendingApply.current = operation;
    try {
      await onApply(operation);
      pendingApply.current = null;
      chat.mergeMessage({ ...message, paid: true });
    } catch (cause) {
      pendingApply.current = null;
      chat.setError((cause as Error).message);
    } finally {
      applyingRef.current = false;
      setApplying(false);
      setRetarget(null);
    }
  }
  async function chooseDestination(message: ChatMessage) {
    if (!bridge) return;
    try {
      const selection = bridge.preview('selection').text;
      const context = await bridge.capture(selection ? 'selection' : 'cursor');
      setRetarget({ message, context });
    } catch (cause) {
      chat.setError((cause as Error).message);
    }
  }
  async function copy(message: ChatMessage) {
    try {
      await navigator.clipboard.writeText(message.suggestion ?? visibleReplyText(message.text));
      setCopied(message.id);
    } catch {
      chat.setError('Não foi possível copiar. Selecione o texto para copiar manualmente.');
    }
  }
  if (!open) return null;
  return (
    <aside className={styles.panel} aria-label="Painel lateral do Assistente IA">
      <SidePanelHeader title="Assistente IA">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Nova conversa"
          disabled={running || applying || chat.preferencesSaving}
          onClick={() => void chat.selectConversation()}
        >
          <Plus className="icon icon-sm" aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Fechar painel de IA"
          disabled={applying}
          onClick={() => {
            onClose();
            bridge?.focus();
          }}
        >
          <X className="icon icon-sm" aria-hidden="true" />
        </Button>
      </SidePanelHeader>
      <div className={styles.history}>
        <Dropdown
          mode="select"
          aria-label="Conversas deste capítulo"
          value={chat.page.conversation?.id ?? ''}
          placeholder="Nova conversa"
          options={chat.page.conversations.map((conversation) => ({
            value: conversation.id,
            label: conversation.title,
          }))}
          onValueChange={(id) => void chat.selectConversation(id)}
          disabled={running || applying || chat.preferencesSaving}
        />
        <Dropdown
          mode="action"
          aria-label="Opções da conversa"
          label="Opções da conversa"
          iconOnly
          icon={<MoreHorizontal className="icon icon-sm" aria-hidden="true" />}
          variant="ghost"
          size="icon"
          disabled={!chat.page.conversation || running || applying}
          options={[{ value: 'delete', label: 'Excluir conversa', variant: 'destructive' }]}
          onAction={() => setConfirmation('delete')}
        />
        {chat.page.moreConversations && (
          <Button variant="link" size="sm" onClick={() => void chat.olderConversations()}>
            Mais conversas
          </Button>
        )}
      </div>
      <div
        className={styles.messages}
        ref={messages}
        role="region"
        aria-label="Mensagens da conversa"
        onScroll={() => {
          const element = messages.current;
          if (element) {
            follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < 48;
            if (follow.current) setNewMessages(false);
          }
        }}
      >
        {chat.loading && <LoadingState label="Carregando conversas..." />}
        {!chat.loading && !chat.page.messages.length && (
          <EmptyState
            className={styles.emptyMessage}
            title="Converse sobre este capítulo"
            description="Peça ideias, revise uma passagem ou digite / para escolher um comando."
          />
        )}
        {chat.page.before && (
          <Button variant="secondary" size="sm" onClick={() => void chat.older()}>
            Mensagens anteriores
          </Button>
        )}
        {chat.page.messages.map((message) => (
          <article
            key={message.id}
            className={message.role === 'user' ? styles.userMessage : styles.message}
            aria-label={message.role === 'user' ? 'Mensagem do autor' : 'Resposta do assistente'}
          >
            <strong>{message.role === 'user' ? 'Você' : 'Assistente IA'}</strong>
            <div
              className={styles.response}
              dangerouslySetInnerHTML={{
                __html: renderRichText(
                  message.role === 'assistant' ? visibleReplyText(message.text) : message.text,
                ),
              }}
            />
            {message.role === 'assistant' && (
              <details>
                <summary>Modelo e raciocínio</summary>
                {message.generation ? (
                  <>
                    <p>
                      Solicitado: {message.generation.requested.model || 'Modelo da plataforma'} ·{' '}
                      {CHAT_REASONING_LABELS[message.generation.requested.reasoning]}
                    </p>
                    <p>
                      Usado: {message.generation.effective.model} ·{' '}
                      {CHAT_REASONING_LABELS[message.generation.effective.reasoning]}
                    </p>
                  </>
                ) : (
                  <p>Conversa anterior: Auto; modelo não registrado.</p>
                )}
              </details>
            )}
            {message.role === 'user' && (
              <details>
                <summary>{CHAT_CONTEXT_LABELS[message.context.source]}</summary>
                <p>{message.context.text || 'Capítulo vazio'}</p>
                <small>
                  {message.context.lore.length
                    ? `Lore utilizado: ${message.context.lore.map((entity) => `${entity.name} (${entity.scope === 'global' ? 'global' : 'local'})`).join(', ')}`
                    : 'Nenhuma ficha de lore relevante.'}
                </small>
                {message.context.persona.instruction && (
                  <p>{message.context.persona.instruction}</p>
                )}
                {message.context.truncated && <small>Contexto reduzido ao limite.</small>}
              </details>
            )}
            {message.suggestion && (
              <section className={styles.suggestion} aria-label="Sugestão para o capítulo">
                <Badge variant="secondary">Sugestão de texto</Badge>
                <p>{message.suggestion}</p>
                <div className={styles.actions}>
                  <Button
                    size="sm"
                    disabled={applying || message.state !== 'done' || Boolean(unavailable)}
                    onClick={() => void apply(message)}
                  >
                    {message.context.target
                      ? message.context.target.from !== message.context.target.to
                        ? 'Substituir trecho'
                        : 'Inserir no texto'
                      : 'Escolher destino'}
                  </Button>
                  {message.context.target && (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={applying}
                      onClick={() => void chooseDestination(message)}
                    >
                      Novo destino
                    </Button>
                  )}
                </div>
                <small>
                  {message.provider === 'byok'
                    ? 'BYOK: sem créditos da plataforma.'
                    : message.paid
                      ? 'Sugestão já paga: reaplicar sem débito.'
                      : '1 crédito somente ao aplicar.'}
                </small>
              </section>
            )}
            {message.state === 'stopped' && <small>Resposta interrompida; sem débito.</small>}
            {message.error && <Alert variant="warning">{message.error}</Alert>}
            {message.role === 'assistant' && message.state !== 'running' && (
              <Button variant="ghost" size="sm" onClick={() => void copy(message)}>
                <Copy className="icon icon-sm" aria-hidden="true" />
                {copied === message.id ? 'Copiado' : 'Copiar'}
              </Button>
            )}
            {message.id === lastUser?.id && (
              <div className={styles.actions}>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={running || applying || chat.preferencesSaving}
                  onClick={() => setConfirmation(message)}
                >
                  Editar pedido
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={running || applying || chat.preferencesSaving || Boolean(unavailable)}
                  onClick={() => void chat.send(message.context, message.text)}
                  title="Gerar uma nova resposta com o modelo e raciocínio selecionados"
                >
                  Regenerar resposta
                </Button>
              </div>
            )}
          </article>
        ))}
        {chat.generating && (
          <article className={styles.message} aria-label="Resposta em andamento">
            <strong>Assistente IA</strong>
            <p>{visibleReplyText(chat.partial) || 'Preparando resposta...'}</p>
          </article>
        )}
      </div>
      <div className={styles.status} role="status" aria-live="polite">
        {running
          ? 'Gerando resposta...'
          : applying
            ? 'Aplicando sugestão...'
            : copied
              ? 'Texto copiado.'
              : ''}
      </div>
      {newMessages && (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            follow.current = true;
            setNewMessages(false);
            messages.current?.scrollTo({ top: messages.current.scrollHeight });
          }}
        >
          Novas mensagens
        </Button>
      )}
      <footer className={styles.composer}>
        {(chat.error || (chat.request.current && !running)) && (
          <Alert variant={chat.error ? 'danger' : 'warning'}>
            {chat.error || 'Pedido pendente. Repetir conserva a configuração original.'}
            <div className={styles.actions}>
              {chat.request.current && !running && (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={chat.preferencesSaving || applying}
                  onClick={() => {
                    const pending = chat.request.current!;
                    void chat.send(pending.context, pending.text, true);
                  }}
                >
                  Tentar novamente
                </Button>
              )}
              <Button variant="secondary" size="sm" disabled={running} onClick={chat.reload}>
                Recarregar conversa
              </Button>
            </div>
          </Alert>
        )}
        {unavailable && <Alert variant="warning">{unavailable}</Alert>}
        {commands.length > 0 && (
          <div
            role="listbox"
            aria-label="Comandos do assistente"
            className={styles.commands}
            id="chapter-chat-commands"
          >
            {commands.map((command, index) => (
              <button
                type="button"
                role="option"
                aria-selected={index === commandIndex % commands.length}
                id={`chapter-chat-command-${index}`}
                key={command.name}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  chat.changeDraft(`/${command.name} `);
                  setDismissCommands(true);
                  composer.current?.focus();
                }}
              >
                <strong>/{command.name}</strong>
                <span>{command.description}</span>
              </button>
            ))}
          </div>
        )}
        <div className={styles.inputWell} data-chat-input-well>
          <Textarea
            ref={composer}
            aria-label="Mensagem para o Assistente IA"
            aria-describedby={hintId}
            placeholder="Escreva uma mensagem ou digite /"
            value={chat.draft}
            maxLength={4000}
            rows={3}
            disabled={applying || chat.loading}
            aria-controls={commands.length ? 'chapter-chat-commands' : undefined}
            aria-activedescendant={
              commands.length ? `chapter-chat-command-${commandIndex % commands.length}` : undefined
            }
            onChange={(event) => {
              chat.changeDraft(event.target.value);
              setDismissCommands(false);
              setCommandIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (commands.length && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
                event.preventDefault();
                setCommandIndex(
                  (value) =>
                    (value + (event.key === 'ArrowDown' ? 1 : -1) + commands.length) %
                    commands.length,
                );
                return;
              }
              if (commands.length && event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                setDismissCommands(true);
                return;
              }
              if (event.key === 'Escape' && inspect) {
                event.preventDefault();
                event.stopPropagation();
                setInspect(false);
                return;
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
                bridge?.focus();
                return;
              }
              if (commands.length && (event.key === 'Tab' || event.key === 'Enter')) {
                event.preventDefault();
                chat.changeDraft(`/${commands[commandIndex % commands.length]!.name} `);
                setDismissCommands(true);
                return;
              }
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void submit();
              }
            }}
          />
          <div className={styles.send}>
            {running ? (
              <Button
                variant="secondary"
                size="icon"
                aria-label="Parar"
                title="Parar geração"
                onClick={() => void chat.stop()}
              >
                <Square className="icon icon-sm" aria-hidden="true" />
              </Button>
            ) : (
              <Button
                size="icon"
                aria-label="Enviar"
                title="Enviar mensagem (Enter)"
                disabled={
                  !chat.draft.trim() ||
                  applying ||
                  chat.loading ||
                  chat.preferencesSaving ||
                  Boolean(unavailable)
                }
                onClick={() => void submit()}
              >
                <Send className="icon icon-sm" aria-hidden="true" />
              </Button>
            )}
          </div>
        </div>
        <div className={styles.context}>
          <Dropdown
            mode="select"
            aria-label="Origem do contexto"
            value={source}
            options={Object.entries(CHAT_CONTEXT_LABELS).map(([value, label]) => ({
              value,
              label,
            }))}
            onValueChange={(value) => {
              setSource(value as ChatContextSource);
              setPinned(null);
            }}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setInspect((value) => !value)}
            aria-expanded={inspect}
            aria-controls={inspectorId}
          >
            {pinned
              ? 'Contexto fixado'
              : preview
                ? CHAT_CONTEXT_LABELS[preview.source]
                : 'Contexto'}
          </Button>
        </div>
        <div className={styles.generationControls}>
          <Button
            variant="ghost"
            size="sm"
            className={styles.modelControl}
            aria-label="Configurar modelo do assistente"
            title={modelLabel}
            disabled={running || applying || chat.preferencesSaving}
            onClick={() => openAISettings('provider')}
          >
            <Cpu className="icon icon-sm" aria-hidden="true" />
            <span>{modelLabel}</span>
          </Button>
          <Dropdown
            mode="select"
            size="sm"
            aria-label="Raciocínio do assistente"
            aria-describedby={reasoningHintId}
            title="Níveis desabilitados são incompatíveis com o modelo selecionado."
            value={chat.reasoning}
            disabled={running || applying || chat.loading || chat.preferencesSaving}
            options={CHAT_REASONING_LEVELS.map((value) => ({
              value,
              label: CHAT_REASONING_LABELS[value],
              disabled: !capabilities.levels.includes(value),
            }))}
            onValueChange={(value) => void chat.changeReasoning(value as ChatReasoningLevel)}
          />
        </div>
        <p id={reasoningHintId} className="sr-only">
          Níveis desabilitados são incompatíveis com o modelo selecionado.
        </p>
        {reasoningUnavailable && (
          <small>
            {CHAT_REASONING_LABELS[chat.reasoning]} não é suportado por este modelo; o próximo envio
            usará Auto.
          </small>
        )}
        {inspect && (
          <section
            id={inspectorId}
            className={styles.inspect}
            aria-label="Contexto e comandos"
            onKeyDownCapture={(event) => {
              if (event.key !== 'Escape' || event.nativeEvent.isComposing) return;
              event.preventDefault();
              event.stopPropagation();
              setInspect(false);
              composer.current?.focus();
            }}
          >
            <div className={styles.inspectHeader}>
              <strong>Contexto e comandos</strong>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Recolher detalhes do contexto"
                onClick={() => {
                  setInspect(false);
                  composer.current?.focus();
                }}
              >
                <X className="icon icon-sm" aria-hidden="true" />
              </Button>
            </div>
            <p>
              {preview?.text || 'O capítulo está vazio. Você pode conversar sobre como começar.'}
            </p>
            {pinned?.truncated && <p>Contexto reduzido ao limite de 18 mil caracteres.</p>}
            <p>
              O envio inclui persona e lore relevante. Cada mensagem guarda a passagem utilizada.
            </p>
            <ul>
              {CHAT_COMMANDS.map((command) => (
                <li key={command.name}>
                  <strong>/{command.name}</strong>: {command.description}
                </li>
              ))}
            </ul>
            <div className={styles.actions}>
              <Button
                variant="secondary"
                onClick={() => {
                  setPinned(null);
                  setInspect(false);
                }}
              >
                Usar contexto atual
              </Button>
              <Button
                onClick={() => {
                  void capture()
                    .then((context) => {
                      setPinned(context);
                      setInspect(false);
                    })
                    .catch((cause: Error) => chat.setError(cause.message));
                }}
              >
                Fixar contexto
              </Button>
            </div>
          </section>
        )}
        <small id={hintId}>
          Conversa sem débito · {chat.draft.length}/4000 · Enter envia; Shift+Enter quebra linha
        </small>
      </footer>
      <Dialog
        open={Boolean(confirmation)}
        title={confirmation === 'delete' ? 'Excluir conversa?' : 'Editar pedido?'}
        onClose={() => setConfirmation(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmation(null)}>
              Cancelar
            </Button>
            <Button
              variant={confirmation === 'delete' ? 'destructive' : 'primary'}
              onClick={() => {
                if (confirmation === 'delete') void chat.removeConversation();
                else if (confirmation) void chat.edit(confirmation);
                setConfirmation(null);
              }}
            >
              {confirmation === 'delete' ? 'Excluir conversa' : 'Editar pedido'}
            </Button>
          </>
        }
      >
        <p>
          {confirmation === 'delete'
            ? 'O histórico desta conversa será excluído. O capítulo permanece disponível.'
            : 'As respostas posteriores serão removidas da conversa. Alterações já aplicadas ao capítulo permanecem.'}
        </p>
      </Dialog>
      <Dialog
        open={Boolean(retarget)}
        title="Aplicar em novo destino?"
        onClose={() => setRetarget(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRetarget(null)}>
              Cancelar
            </Button>
            <Button
              disabled={applying}
              onClick={() => {
                if (retarget) void apply(retarget.message, retarget.context);
              }}
            >
              Confirmar aplicação
            </Button>
          </>
        }
      >
        <p>
          {retarget?.context.target?.from !== retarget?.context.target?.to
            ? 'Substituir a seleção atual:'
            : 'Inserir na posição atual do cursor:'}
        </p>
        <p>{retarget?.context.text}</p>
        <p>{retarget?.message.suggestion}</p>
        <p>
          {retarget?.message.provider === 'platform' && !retarget.message.paid
            ? '1 crédito no aceite.'
            : 'Sem débito adicional.'}
        </p>
      </Dialog>
    </aside>
  );
}
