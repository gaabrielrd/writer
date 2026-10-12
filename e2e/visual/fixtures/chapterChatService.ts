import type {
  ChatConversation,
  ChatContext,
  ChatMessage,
  ChatPage,
} from '../../../src/features/ai-assistant/model/chapterChat';
import { chapterChatKey, type ChatIdentity } from './chapterChatStore';
import { getChapter, updateChapter } from './bookService';
import { deductCredit, getUserCredits } from './aiService';
import { author } from './data';
import type { ChatReasoningLevel } from '../../../src/features/ai-assistant/model/chatGeneration';
export interface Store {
  conversations: ChatConversation[];
  messages: Record<string, ChatMessage[]>;
}
const read = (identity: ChatIdentity): Store =>
  JSON.parse(
    localStorage.getItem(chapterChatKey(identity)) ?? '{"conversations":[],"messages":{}}',
  ) as Store;
const write = (identity: ChatIdentity, store: Store) =>
  localStorage.setItem(chapterChatKey(identity), JSON.stringify(store));
export type { ChatIdentity } from './chapterChatStore';
export class ChapterChatError extends Error {
  readonly uncertain = false;
}
export function loadChapterChat(
  identity: ChatIdentity,
  pagination: { before?: number } = {},
): Promise<ChatPage> {
  const store = read(identity);
  const conversation =
    store.conversations.find((item) => item.id === identity.conversationId) ??
    store.conversations[0] ??
    null;
  const messages = conversation
    ? (store.messages[conversation.id] ?? []).filter(
        (message) => !pagination.before || message.createdAt < pagination.before,
      )
    : [];
  return Promise.resolve({
    conversations: store.conversations,
    conversation,
    messages: messages.slice(-30),
    before: messages.length > 30 ? messages.at(-30)!.createdAt : null,
    platformModel: 'gemini-3.7-flash',
  });
}
export function createChapterChat(
  identity: ChatIdentity,
  title: string,
  reasoning: ChatReasoningLevel = 'auto',
) {
  const store = read(identity),
    id = crypto.randomUUID();
  store.conversations.unshift({
    id,
    title: title.slice(0, 120),
    draft: '',
    updatedAt: Date.now(),
    reasoning,
  });
  store.messages[id] = [];
  write(identity, store);
  return Promise.resolve({ id });
}
export async function chapterChatCall<T>(
  identity: ChatIdentity,
  data: {
    action?: string;
    draft?: string;
    requestId?: string;
    messageId?: string;
    after?: string;
    before?: number;
    partial?: string;
    reasoning?: ChatReasoningLevel;
  },
): Promise<T> {
  const store = read(identity),
    id = identity.conversationId!;
  if (data.action === 'preferences') {
    const conversation = store.conversations.find((item) => item.id === id);
    if (conversation) conversation.reasoning = data.reasoning ?? 'auto';
  }
  if (data.action === 'draft') {
    const conversation = store.conversations.find((item) => item.id === id);
    if (conversation) conversation.draft = data.draft ?? '';
  }
  if (data.action === 'delete') {
    store.conversations = store.conversations.filter((item) => item.id !== id);
    delete store.messages[id];
  }
  if (data.action === 'edit') {
    store.messages[id] = store.messages[id].filter((message) => message.createdAt < data.before!);
    store.conversations.find((item) => item.id === id)!.draft = data.draft!;
  }
  if (data.action === 'stop') {
    const message = store.messages[id]?.find((item) => item.id === data.requestId);
    if (message) {
      message.state = 'stopped';
      message.text = data.partial ?? '';
    }
  }
  if (data.action === 'apply') {
    const message = store.messages[id].find((item) => item.id === data.messageId)!;
    const credits = message.paid ? await getUserCredits() : await deductCredit(author.uid);
    message.paid = true;
    await updateChapter(identity.bookId, identity.chapterId, { content: data.after! });
    write(identity, store);
    const chapter = await getChapter(identity.bookId, identity.chapterId);
    return { content: data.after, credits, wordCount: chapter!.wordCount } as T;
  }
  write(identity, store);
  return {} as T;
}
export async function sendChapterChat(
  identity: ChatIdentity,
  request: { requestId: string; text: string; context: ChatContext },
  onChunk: (text: string) => void,
  signal: AbortSignal,
): Promise<ChatMessage> {
  let store = read(identity);
  const id = identity.conversationId!;
  const createdAt = Date.now();
  store.messages[id] ??= [];
  store.messages[id] = store.messages[id].filter(
    (item) => item.id !== request.requestId && item.id !== `${request.requestId}-user`,
  );
  store.messages[id].push({
    id: `${request.requestId}-user`,
    role: 'user',
    text: request.text,
    context: request.context,
    state: 'done',
    createdAt,
  });
  const message: ChatMessage = {
    id: request.requestId,
    role: 'assistant',
    text: '',
    context: request.context,
    state: 'running',
    createdAt: createdAt + 1,
    provider: 'platform',
  };
  store.messages[id].push(message);
  store.conversations.find((item) => item.id === id)!.draft = '';
  write(identity, store);
  sessionStorage.setItem('writer_fixture_ai_system', request.context.persona.instruction);
  sessionStorage.setItem('writer_fixture_ai_action_prompt', request.context.text);
  sessionStorage.setItem('writer_fixture_chat_context', JSON.stringify(request.context));
  sessionStorage.setItem(
    'writer_fixture_ai_action_calls',
    String(Number(sessionStorage.getItem('writer_fixture_ai_action_calls') ?? 0) + 1),
  );
  const output = 'Analisei a passagem atual.';
  for (const chunk of ['Analisei ', 'a passagem atual.']) {
    await new Promise((resolve) =>
      setTimeout(resolve, sessionStorage.getItem('writer_fixture_chat_slow') ? 1800 : 40),
    );
    signal.throwIfAborted();
    onChunk(chunk);
  }
  store = read(identity);
  const completed = store.messages[id].find((item) => item.id === request.requestId)!;
  Object.assign(completed, {
    state: 'done',
    text: output,
    ...(/^\/(continuar|estilo|reescrever|revisar)/.test(request.text)
      ? { suggestion: 'O trecho ganhou novos detalhes.' }
      : {}),
  });
  write(identity, store);
  return completed;
}
