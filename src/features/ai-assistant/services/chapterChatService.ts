import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirebaseApp } from '@/shared/lib';
import { getBYOKConfig } from './byokStorage';
import { validateBYOKConfig } from '../model/byokConfig';
import { DEFAULT_BYOK_CHAT_MODELS, type ChatReasoningLevel } from '../model/chatGeneration';
import type { ChatContext, ChatMessage, ChatPage } from '../model/chapterChat';

export interface ChatIdentity {
  bookId: string;
  chapterId: string;
  conversationId?: string;
}
export class ChapterChatError extends Error {
  readonly uncertain: boolean;
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : 'Não foi possível concluir. Tente novamente.');
    this.uncertain = ![
      'functions/invalid-argument',
      'functions/permission-denied',
      'functions/not-found',
      'functions/failed-precondition',
      'functions/resource-exhausted',
      'functions/unauthenticated',
    ].includes((cause as { code?: string })?.code ?? '');
  }
}
export async function chapterChatCall<T>(identity: ChatIdentity, data: object): Promise<T> {
  try {
    return (
      await httpsCallable<object, T>(getFunctions(getFirebaseApp(), 'us-central1'), 'chapterChat', {
        timeout: 120000,
      })({ ...identity, ...data })
    ).data;
  } catch (cause) {
    throw new ChapterChatError(cause);
  }
}
export const loadChapterChat = (
  identity: ChatIdentity,
  pagination: { before?: number; conversationsBefore?: number } = {},
) => chapterChatCall<ChatPage>(identity, { action: 'load', ...pagination });
export const createChapterChat = (
  identity: ChatIdentity,
  title: string,
  reasoning: ChatReasoningLevel = 'auto',
) =>
  chapterChatCall<{ id: string }>(identity, {
    action: 'create',
    conversationId: crypto.randomUUID(),
    title: title.slice(0, 120) || 'Nova conversa',
    reasoning,
  });

export async function readProviderStream(
  response: Response,
  provider: 'openai' | 'gemini',
  onChunk: (text: string) => void,
  signal: AbortSignal,
) {
  if (!response.ok || !response.body)
    throw new Error(`Provedor indisponível (${response.status}). Verifique a chave e a cota.`);
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let buffer = '',
    output = '',
    completed = false;
  const consume = (line: string) => {
    if (!line.startsWith('data:')) return;
    const data = line.slice(5).trim();
    if (data === '[DONE]') return;
    const event = JSON.parse(data) as {
      choices?: { finish_reason?: string; delta?: { content?: string } }[];
      candidates?: {
        finishReason?: string;
        content?: { parts?: { thought?: boolean; text?: string }[] };
      }[];
    };
    const finish =
      provider === 'openai'
        ? event.choices?.[0]?.finish_reason
        : event.candidates?.[0]?.finishReason;
    if (finish) {
      if (!['stop', 'STOP'].includes(finish))
        throw new Error('Resposta interrompida pelo provedor.');
      completed = true;
    }
    const chunk: string =
      provider === 'openai'
        ? (event.choices?.[0]?.delta?.content ?? '')
        : (event.candidates?.[0]?.content?.parts ?? [])
            .filter((part: { thought?: boolean }) => !part.thought)
            .map((part: { text?: string }) => part.text ?? '')
            .join('');
    if (chunk) {
      output += chunk;
      if (output.length > 24000) throw new Error('Resposta acima do limite.');
      onChunk(chunk);
    }
  };
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let end;
      while ((end = buffer.indexOf('\n')) >= 0) {
        consume(buffer.slice(0, end).trimEnd());
        buffer = buffer.slice(end + 1);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) consume(buffer.trim());
    if (!completed || !output.trim())
      throw new Error('A resposta não foi concluída. Tente novamente.');
    return output;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
interface ChatInput {
  context: ChatContext;
  text: string;
  systemInstruction: string;
  history: { role: string; text: string }[];
}
export async function sendChapterChat(
  identity: ChatIdentity,
  request: { requestId: string; text: string; context: ChatContext },
  onChunk: (text: string) => void,
  signal: AbortSignal,
): Promise<ChatMessage> {
  const config = getBYOKConfig();
  const validation = validateBYOKConfig(config);
  if (!validation.isValid) throw new Error(validation.error);
  if (config.provider === 'firebase_ai') {
    const call = httpsCallable<object, ChatMessage, { text: string }>(
      getFunctions(getFirebaseApp(), 'us-central1'),
      'chapterChat',
      { timeout: 120000 },
    );
    const result = await call.stream(
      { ...identity, ...request, action: 'send', mode: 'platform' },
      { signal },
    );
    // Consume the final promise from the outset, including stream failures.
    const final = result.data;
    void final.catch(() => undefined);
    for await (const chunk of result.stream) {
      signal.throwIfAborted();
      onChunk(chunk.text);
    }
    return final;
  }
  const started = await chapterChatCall<ChatMessage & { input?: ChatInput }>(identity, {
    ...request,
    action: 'send',
    mode: 'byok',
  });
  if (!started.input) return started;
  const { input } = started;
  const system = `${input.systemInstruction}\n${input.context.persona.instruction}`;
  const user = JSON.stringify({ context: input.context, request: input.text });
  const openai = config.provider === 'openai_byok';
  const model =
    config.customModel || DEFAULT_BYOK_CHAT_MODELS[openai ? 'openai_byok' : 'gemini_byok'];
  try {
    const response = await fetch(
      openai
        ? 'https://api.openai.com/v1/chat/completions'
        : `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
      {
        method: 'POST',
        signal,
        headers: openai
          ? {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${config.openaiApiKey!.trim()}`,
            }
          : { 'Content-Type': 'application/json', 'x-goog-api-key': config.geminiApiKey!.trim() },
        body: JSON.stringify(
          openai
            ? {
                model,
                stream: true,
                max_tokens: 4000,
                messages: [
                  { role: 'system', content: system },
                  ...input.history.map((item) => ({ role: item.role, content: item.text })),
                  { role: 'user', content: user },
                ],
              }
            : {
                systemInstruction: { parts: [{ text: system }] },
                contents: [
                  ...input.history.map((item) => ({
                    role: item.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: item.text }],
                  })),
                  { role: 'user', parts: [{ text: user }] },
                ],
                generationConfig: { maxOutputTokens: 4000 },
              },
        ),
      },
    );
    const output = await readProviderStream(
      response,
      openai ? 'openai' : 'gemini',
      onChunk,
      signal,
    );
    return chapterChatCall<ChatMessage>(identity, {
      action: 'completeBYOK',
      requestId: request.requestId,
      output,
    });
  } catch (cause) {
    if (!signal.aborted)
      await chapterChatCall(identity, { action: 'failBYOK', requestId: request.requestId }).catch(
        () => undefined,
      );
    throw cause;
  }
}
