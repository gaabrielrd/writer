import { chatProviderGenerationOptions, CHAT_GENERATION_LIMITS } from './chatGeneration.mjs';

// Provider transport only. The service owns the generation snapshot; the key never leaves headers.
export async function generatePlatformChat(input, onChunk, { apiKey, signal, fetchImpl = fetch }) {
  const model = input.generation?.effective.model;
  if (
    input.generation?.effective.provider !== 'gemini' ||
    typeof model !== 'string' ||
    !/^[a-zA-Z0-9._:-]{1,120}$/.test(model)
  )
    throw new Error('Modelo inválido.');
  const boundedSignal = AbortSignal.any([
    AbortSignal.timeout(CHAT_GENERATION_LIMITS.providerTimeoutMs),
    ...(signal ? [signal] : []),
  ]);
  boundedSignal.throwIfAborted();
  const response = await fetchImpl(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
    {
      method: 'POST',
      signal: boundedSignal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: `${input.systemInstruction}\n${input.context.persona.instruction}` }],
        },
        contents: [
          ...input.history.map((message) => ({
            role: message.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: message.text }],
          })),
          {
            role: 'user',
            parts: [{ text: JSON.stringify({ context: input.context, request: input.text }) }],
          },
        ],
        generationConfig: { ...chatProviderGenerationOptions(input.generation), temperature: 0.7 },
      }),
    },
  );
  if (!response.ok || !response.body) throw new Error('Provedor indisponível.');
  let buffer = '',
    output = '',
    finish = '';
  const decoder = new TextDecoder();
  const consume = async (line) => {
    if (!line.startsWith('data:')) return;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') return;
    const result = JSON.parse(payload);
    const candidate = result.candidates?.[0];
    if (candidate?.finishReason) finish = candidate.finishReason;
    const chunk = (candidate?.content?.parts ?? [])
      .filter((part) => !part.thought)
      .map((part) => part.text ?? '')
      .join('');
    if (chunk) {
      output += chunk;
      if (output.length > 24000) throw new Error('Resposta acima do limite.');
      await onChunk(chunk);
    }
  };
  const reader = response.body.getReader();
  const cancel = () => {
    void reader.cancel().catch(() => undefined);
  };
  boundedSignal.addEventListener('abort', cancel, { once: true });
  try {
    while (true) {
      boundedSignal.throwIfAborted();
      const { done, value } = await reader.read();
      boundedSignal.throwIfAborted();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let end;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end).trimEnd();
        buffer = buffer.slice(end + 1);
        await consume(line);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) await consume(buffer.trim());
    if (finish !== 'STOP' || !output.trim()) throw new Error('Resposta incompleta.');
    return output;
  } finally {
    boundedSignal.removeEventListener('abort', cancel);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
