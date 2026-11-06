import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getLiteraryWritingContext } from '@/features/literary-production';
import {
  chapterChatCall,
  createChapterChat,
  loadChapterChat,
  sendChapterChat,
  captureChatGeneration,
  type ChatIdentity,
} from '../services/chapterChatService';
import {
  readChatRecovery,
  writeChatRecovery,
  clearChatRecovery,
  type ChatPendingRequest,
} from '../services/chatDraftStorage';
import {
  parseChatCommand,
  type ChatContext,
  type ChatMessage,
  type ChatPage,
} from '../model/chapterChat';
import { normalizeChatReasoning, type ChatReasoningLevel } from '../model/chatGeneration';
import {
  readChatReasoningDefault,
  writeChatReasoningDefault,
} from '../services/chatReasoningStorage';

const empty: ChatPage = { conversations: [], conversation: null, messages: [], before: null };
export function useChapterChat(uid: string, bookId: string, chapterId: string) {
  const [page, setPage] = useState(empty);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [generating, setGenerating] = useState(false);
  const [partial, setPartial] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [preferencesSaving, setPreferencesSaving] = useState(false);
  const mounted = useRef(true);
  const selected = useRef<ChatIdentity>({ bookId, chapterId });
  const controller = useRef<AbortController | null>(null);
  const request = useRef<ChatPendingRequest | null>(null);
  const creating = useRef<Promise<{ id: string; reasoning: ChatReasoningLevel }> | null>(null);
  const partialRef = useRef('');
  const draftRef = useRef('');
  const changing = useRef(false);
  const mutation = useRef<{ key: string; id: string } | null>(null);
  const activeScope = useRef(JSON.stringify([uid, bookId, chapterId]));
  useLayoutEffect(() => {
    activeScope.current = JSON.stringify([uid, bookId, chapterId]);
  }, [uid, bookId, chapterId]);
  useEffect(() => {
    mounted.current = true;
    let active = true;
    void loadChapterChat({ bookId, chapterId })
      .then((result) => {
        if (!active) return;
        selected.current = { bookId, chapterId, conversationId: result.conversation?.id };
        setPage(result);
        const recovery = readChatRecovery(
          uid,
          bookId,
          chapterId,
          result.conversation?.id ?? 'pending',
        );
        const recoveredMessage = result.messages.find(
          (message) => message.id === recovery?.request?.requestId,
        );
        request.current =
          recoveredMessage && ['done', 'stopped'].includes(recoveredMessage.state)
            ? null
            : recovery?.request
              ? {
                  ...recovery.request,
                  ...(recoveredMessage?.messageInstance
                    ? { messageInstance: recoveredMessage.messageInstance }
                    : {}),
                }
              : null;
        const text = recovery?.draft ?? result.conversation?.draft ?? '';
        draftRef.current = text;
        setDraft(text);
        setError(
          recoveredMessage?.state === 'error'
            ? (recoveredMessage.error ?? 'A última resposta não foi concluída. Tente novamente.')
            : null,
        );
      })
      .catch((cause: Error) => {
        if (active) setError(cause.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      mounted.current = false;
      controller.current?.abort();
      if (request.current && selected.current.conversationId)
        void chapterChatCall(selected.current, {
          action: 'stop',
          requestId: request.current.requestId,
          ...(request.current.messageInstance
            ? { messageInstance: request.current.messageInstance }
            : {}),
          partial: partialRef.current,
        }).catch(() => undefined);
    };
  }, [uid, bookId, chapterId, attempt]);
  async function ensureConversation(title = 'Nova conversa') {
    if (selected.current.conversationId) return selected.current;
    if (!creating.current) {
      const reasoning = readChatReasoningDefault(uid);
      creating.current = createChapterChat({ bookId, chapterId }, title, reasoning)
        .then(({ id }) => ({ id, reasoning }))
        .finally(() => {
          creating.current = null;
        });
    }
    const { id, reasoning } = await creating.current;
    selected.current = { bookId, chapterId, conversationId: id };
    clearChatRecovery(uid, bookId, chapterId, 'pending');
    if (mounted.current)
      setPage((previous) => ({
        ...previous,
        conversation: {
          id,
          title: title.slice(0, 120),
          draft: '',
          updatedAt: Date.now(),
          reasoning,
        },
        conversations: [
          { id, title: title.slice(0, 120), draft: '', updatedAt: Date.now(), reasoning },
          ...previous.conversations.filter((item) => item.id !== id),
        ],
      }));
    return selected.current;
  }
  async function changeReasoning(reasoning: ChatReasoningLevel) {
    if (loading || changing.current || controller.current) return;
    changing.current = true;
    setPreferencesSaving(true);
    setError(null);
    try {
      const identity = await ensureConversation();
      await chapterChatCall(identity, { action: 'preferences', reasoning });
      if (!mounted.current) return;
      setPage((previous) => ({
        ...previous,
        conversation: previous.conversation ? { ...previous.conversation, reasoning } : null,
        conversations: previous.conversations.map((item) =>
          item.id === identity.conversationId ? { ...item, reasoning } : item,
        ),
      }));
      if (!writeChatReasoningDefault(uid, reasoning))
        setError('Escolha salva na conversa; não foi possível salvar o padrão deste navegador.');
    } catch (cause) {
      if (mounted.current) setError((cause as Error).message);
    } finally {
      changing.current = false;
      if (mounted.current) setPreferencesSaving(false);
    }
  }
  async function persistDraft(text: string) {
    const identity = await ensureConversation();
    writeChatRecovery(uid, bookId, chapterId, identity.conversationId!, {
      draft: text,
      ...(request.current ? { request: request.current } : {}),
    });
    const draftEpoch =
      page.conversation?.id === identity.conversationId ? (page.conversation?.draftEpoch ?? 0) : 0;
    await chapterChatCall(identity, { action: 'draft', draft: text, draftEpoch });
  }
  useEffect(() => {
    if (loading || (!draft && !selected.current.conversationId)) return;
    const timer = setTimeout(() => {
      void persistDraft(draft).catch((cause: Error) => {
        if (mounted.current)
          setError(`Rascunho local preservado; falha ao sincronizar: ${cause.message}`);
      });
    }, 500);
    return () => clearTimeout(timer);
  });
  function changeDraft(text: string) {
    draftRef.current = text;
    setDraft(text);
    {
      try {
        writeChatRecovery(uid, bookId, chapterId, selected.current.conversationId ?? 'pending', {
          draft: text,
          ...(request.current ? { request: request.current } : {}),
        });
      } catch {
        setError('Não foi possível preservar o rascunho local. Mantenha a conversa aberta.');
      }
    }
  }
  function mergeMessage(message: ChatMessage) {
    setPage((previous) => ({
      ...previous,
      messages: [...previous.messages.filter((item) => item.id !== message.id), message].sort(
        (a, b) => a.createdAt - b.createdAt,
      ),
    }));
  }
  async function send(context: ChatContext, value = draftRef.current, retry = false) {
    if (controller.current || changing.current || !value.trim()) return;
    try {
      parseChatCommand(value);
    } catch (cause) {
      setError((cause as Error).message);
      return;
    }
    const abort = new AbortController();
    controller.current = abort;
    setGenerating(true);
    setError(null);
    setPartial('');
    partialRef.current = '';
    try {
      const generation =
        retry && request.current
          ? request.current.generation
          : captureChatGeneration(
              page.conversation
                ? normalizeChatReasoning(page.conversation.reasoning)
                : readChatReasoningDefault(uid),
            );
      let editorialContext = context;
      if (!retry) {
        const writing = await getLiteraryWritingContext({
          target: { kind: 'book', id: bookId },
          resource: { kind: 'chapter', id: chapterId },
          ...(context.literaryPlanIds === undefined ? {} : { planIds: context.literaryPlanIds }),
        });
        if (abort.signal.aborted || !mounted.current) return;
        editorialContext = { ...context };
        delete editorialContext.editorial;
        delete editorialContext.writing;
        if (writing) editorialContext.writing = writing;
      }
      const pending =
        retry && request.current
          ? request.current
          : {
              requestId: crypto.randomUUID(),
              messageInstance: crypto.randomUUID(),
              text: value.trim(),
              context: editorialContext,
              generation,
            };
      const identity = await ensureConversation(value);
      if (abort.signal.aborted || !mounted.current) return;
      request.current = pending;
      writeChatRecovery(uid, bookId, chapterId, identity.conversationId!, {
        draft: '',
        request: pending,
      });
      const createdAt =
        page.messages.find(
          (message) => message.role === 'user' && message.id === pending.requestId + '-user',
        )?.createdAt ?? Date.now();
      mergeMessage({
        id: `${pending.requestId}-user`,
        ...(pending.messageInstance ? { messageInstance: pending.messageInstance } : {}),
        role: 'user',
        text: pending.text,
        state: 'done',
        createdAt,
        context: pending.context,
      });
      changeDraft('');
      const response = await sendChapterChat(
        identity,
        pending,
        (chunk) => {
          if (mounted.current && !abort.signal.aborted && controller.current === abort) {
            partialRef.current += chunk;
            setPartial(partialRef.current);
          }
        },
        abort.signal,
      );
      if (!mounted.current || abort.signal.aborted) return;
      mergeMessage(response);
      request.current = null;
      writeChatRecovery(uid, bookId, chapterId, identity.conversationId!, {
        draft: draftRef.current,
      });
      const refreshed = await loadChapterChat(identity);
      if (mounted.current && !abort.signal.aborted && controller.current === abort)
        setPage(refreshed);
    } catch (cause) {
      if (mounted.current && !abort.signal.aborted) setError((cause as Error).message);
    } finally {
      if (controller.current === abort) {
        controller.current = null;
        if (mounted.current) {
          setGenerating(false);
          setPartial('');
        }
      }
    }
  }
  async function stop() {
    if (changing.current) return;
    const identity = { ...selected.current };
    const pending = request.current;
    controller.current?.abort();
    controller.current = null;
    setGenerating(false);
    const running =
      pending?.requestId ?? page.messages.find((item) => item.state === 'running')?.id;
    if (!running) return;
    const messageInstance =
      pending?.messageInstance ??
      page.messages.find((item) => item.id === running)?.messageInstance;
    changing.current = true;
    try {
      await chapterChatCall(identity, {
        action: 'stop',
        requestId: running,
        ...(messageInstance ? { messageInstance } : {}),
        partial: partialRef.current,
      });
      request.current = null;
      const refreshed = await loadChapterChat(identity);
      if (!mounted.current) return;
      setPage(refreshed);
      setPartial('');
      writeChatRecovery(uid, bookId, chapterId, identity.conversationId!, {
        draft: draftRef.current,
      });
    } catch (cause) {
      if (mounted.current) setError((cause as Error).message);
    } finally {
      changing.current = false;
    }
  }
  async function selectConversation(id?: string) {
    if (controller.current || changing.current) return;
    changing.current = true;
    setLoading(true);
    try {
      if (selected.current.conversationId) await persistDraft(draftRef.current);
      selected.current = { bookId, chapterId, conversationId: id };
      if (!id) await ensureConversation();
      const next = await loadChapterChat(selected.current);
      setPage(next);
      const recovery = readChatRecovery(uid, bookId, chapterId, selected.current.conversationId!);
      request.current = recovery?.request ?? null;
      changeDraft(recovery?.draft ?? next.conversation?.draft ?? '');
      setError(null);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      changing.current = false;
      setLoading(false);
    }
  }
  function operationIdentity(action: 'edit' | 'delete', message?: ChatMessage) {
    const identity = { ...selected.current },
      scope = JSON.stringify([uid, bookId, chapterId]);
    const key = JSON.stringify([
      scope,
      identity.conversationId,
      action,
      message?.id ?? null,
      message?.createdAt ?? null,
    ]);
    if (mutation.current?.key !== key) mutation.current = { key, id: crypto.randomUUID() };
    const mutationId = mutation.current.id;
    const current = () =>
      activeScope.current === scope &&
      selected.current.bookId === identity.bookId &&
      selected.current.chapterId === identity.chapterId &&
      selected.current.conversationId === identity.conversationId;
    return { identity, mutationId, current };
  }
  async function removeConversation() {
    const operation = operationIdentity('delete');
    setLoading(true);
    try {
      await chapterChatCall(operation.identity, {
        action: 'delete',
        mutationId: operation.mutationId,
      });
      if (mutation.current?.id === operation.mutationId) mutation.current = null;
      if (!operation.current()) return;
      clearChatRecovery(uid, bookId, chapterId, operation.identity.conversationId!);
      selected.current = { bookId, chapterId };
      setLoading(true);
      setAttempt((value) => value + 1);
    } catch (cause) {
      if (operation.current()) {
        setError((cause as Error).message);
        setLoading(false);
      }
    }
  }
  async function edit(message: ChatMessage) {
    const operation = operationIdentity('edit', message),
      draftBefore = draftRef.current,
      priorRequest = request.current;
    setLoading(true);
    try {
      await chapterChatCall(operation.identity, {
        action: 'edit',
        mutationId: operation.mutationId,
        before: message.createdAt,
        draft: message.text,
      });
      if (mutation.current?.id === operation.mutationId) mutation.current = null;
      if (!operation.current()) return;
      const updated = await loadChapterChat(operation.identity);
      if (!operation.current()) return;
      if (request.current === priorRequest) request.current = null;
      setPage(updated);
      if (draftRef.current === draftBefore) changeDraft(message.text);
    } catch (cause) {
      if (operation.current()) setError((cause as Error).message);
    } finally {
      if (operation.current()) setLoading(false);
    }
  }
  async function older() {
    try {
      const result = await loadChapterChat(selected.current, { before: page.before! });
      setPage((previous) => ({
        ...previous,
        before: result.before,
        messages: [
          ...result.messages,
          ...previous.messages.filter(
            (message) => !result.messages.some((item) => item.id === message.id),
          ),
        ],
      }));
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  async function olderConversations() {
    try {
      const result = await loadChapterChat(selected.current, {
        conversationsBefore: page.conversations.at(-1)?.updatedAt,
      });
      setPage((previous) => ({
        ...previous,
        moreConversations: result.moreConversations,
        conversations: [...previous.conversations, ...result.conversations],
      }));
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  return {
    page,
    loading,
    error,
    draft,
    generating,
    preferencesSaving,
    reasoning: page.conversation
      ? normalizeChatReasoning(page.conversation.reasoning)
      : readChatReasoningDefault(uid),
    changeReasoning,
    partial,
    changeDraft,
    send,
    stop,
    selectConversation,
    removeConversation,
    edit,
    older,
    olderConversations,
    identity: selected,
    request,
    setError,
    mergeMessage,
    reload: () => {
      setLoading(true);
      setAttempt((value) => value + 1);
    },
  };
}
