import { normalizeEditorChatDTO, type EditorChatByokInput } from '../model/editorChat';
import { CHAT_GENERATION_LIMITS, chatProviderGenerationOptions } from '../model/chatGeneration';
import { getBYOKConfig } from './byokStorage';
import { validateBYOKConfig } from '../model/byokConfig';
import { readProviderStream } from './chapterChatService';

export class EditorChatByokError extends Error {
  readonly reason: 'credential-unavailable' | 'provider-failed';
  constructor(reason: 'credential-unavailable' | 'provider-failed') {
    super(
      reason === 'credential-unavailable'
        ? 'Restaure a chave do provedor original para continuar.'
        : 'Não foi possível concluir a resposta no provedor.',
    );
    this.name = 'EditorChatByokError';
    this.reason = reason;
  }
}

/** Explicit execution only. No derived chunks leave this service before server confirmation. */
export async function runEditorChatByok(
  value: EditorChatByokInput,
  options: { signal: AbortSignal; check: () => void },
): Promise<string> {
  options.check();
  options.signal.throwIfAborted();
  const input = normalizeEditorChatDTO('byokInput', value);
  const { generation } = input;
  const config = getBYOKConfig();
  const openai = generation.requested.provider === 'openai_byok';
  if (
    !validateBYOKConfig({
      ...config,
      provider: openai ? 'openai_byok' : 'gemini_byok',
      customModel: generation.effective.model,
    }).isValid
  )
    throw new EditorChatByokError('credential-unavailable');
  const signal = AbortSignal.any([
    options.signal,
    AbortSignal.timeout(CHAT_GENERATION_LIMITS.providerTimeoutMs),
  ]);
  const current = () => {
    options.check();
    signal.throwIfAborted();
  };
  const system = `${input.systemInstruction}\n${input.context.persona.instruction}`;
  const user = JSON.stringify({ context: input.context, request: input.prompt });
  try {
    current();
    const response = await fetch(
      openai
        ? 'https://api.openai.com/v1/chat/completions'
        : `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(generation.effective.model)}:streamGenerateContent?alt=sse`,
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
                model: generation.effective.model,
                stream: true,
                ...chatProviderGenerationOptions(generation),
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
                generationConfig: chatProviderGenerationOptions(generation),
              },
        ),
      },
    );
    current();
    const answer = await readProviderStream(
      response,
      openai ? 'openai' : 'gemini',
      current,
      signal,
    );
    current();
    return answer;
  } catch {
    options.check();
    options.signal.throwIfAborted();
    throw new EditorChatByokError('provider-failed');
  }
}
