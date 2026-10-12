import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generatePlatformChat } from '../src/chapterChatProvider.mjs';
import { resolveChatGeneration } from '../src/chatGeneration.mjs';
const input = (reasoning) => ({
  systemInstruction: 'Sistema',
  context: { persona: { instruction: 'Persona' }, text: 'Passagem' },
  text: 'Pedido',
  history: [
    { role: 'user', text: 'Antes' },
    { role: 'assistant', text: 'Resposta anterior' },
  ],
  generation: resolveChatGeneration({ version: 1, provider: 'platform', model: null, reasoning }),
});
test('transporte Gemini envia nível real, preserva papéis e não entrega pensamentos ou chave no texto', async () => {
  for (const reasoning of ['auto', 'low', 'medium', 'high']) {
    const calls = [],
      chunks = [];
    const output = await generatePlatformChat(
      input(reasoning),
      async (chunk) => chunks.push(chunk),
      {
        apiKey: 'fake-private-key',
        fetchImpl: async (url, options) => {
          calls.push({ url, options });
          return new Response(
            'data: {"candidates":[{"content":{"parts":[{"thought":true,"text":"raciocinio-privado"},{"text":"Olá"}]},"finishReason":"STOP"}]}\n',
          );
        },
      },
    );
    assert.equal(output, 'Olá');
    assert.deepEqual(chunks, ['Olá']);
    assert.match(calls[0].url, /gemini-3.7-flash:streamGenerateContent/);
    const body = JSON.parse(calls[0].options.body);
    assert.deepEqual(body.generationConfig, {
      maxOutputTokens: 4000,
      thinkingConfig: {
        thinkingLevel: reasoning === 'auto' ? 'medium' : reasoning,
        includeThoughts: false,
      },
      temperature: 0.7,
    });
    assert.deepEqual(
      body.contents.map((item) => item.role),
      ['user', 'model', 'user'],
    );
    assert.match(body.systemInstruction.parts[0].text, /Persona/);
    assert.equal(calls[0].options.body.includes('fake-private-key'), false);
    assert.equal(calls[0].options.headers['x-goog-api-key'], 'fake-private-key');
  }
});
test('transporte recusa HTTP indisponível e saída truncada', async () => {
  await assert.rejects(
    generatePlatformChat(input('high'), async () => {}, {
      apiKey: 'fake',
      fetchImpl: async () => new Response(null, { status: 403 }),
    }),
    /Provedor indisponível/,
  );
  await assert.rejects(
    generatePlatformChat(input('high'), async () => {}, {
      apiKey: 'fake',
      fetchImpl: async () =>
        new Response(
          'data: {"candidates":[{"content":{"parts":[{"text":"Parcial"}]},"finishReason":"MAX_TOKENS"}]}\n',
        ),
    }),
    /Resposta incompleta/,
  );
});
test('cancelamento interrompe leitura pendente e libera o stream', async () => {
  const abort = new AbortController();
  let capturedSignal,
    cancelled = 0;
  const work = generatePlatformChat(input('high'), async () => {}, {
    apiKey: 'fake',
    signal: abort.signal,
    fetchImpl: async (_url, options) => {
      capturedSignal = options.signal;
      return new Response(
        new ReadableStream({
          cancel() {
            cancelled++;
          },
        }),
      );
    },
  });
  await Promise.resolve();
  abort.abort();
  await assert.rejects(work);
  assert.equal(capturedSignal.aborted, true);
  assert.equal(cancelled, 1);
});
