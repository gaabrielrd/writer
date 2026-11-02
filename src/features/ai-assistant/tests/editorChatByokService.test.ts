import { afterEach, describe, expect, it, vi } from 'vitest';
import { runEditorChatByok } from '../services/editorChatByokService';
import * as storage from '../services/byokStorage';
import { resolveChatGeneration } from '../model/chatGeneration';
import type { EditorChatByokInput } from '../model/editorChat';
import { frozenFixture, hash } from './editorChatTestFixtures';

async function input(
  provider: 'openai_byok' | 'gemini_byok' | 'platform' = 'openai_byok',
): Promise<EditorChatByokInput> {
  return {
    turnId: 'turn',
    attemptToken: hash('e'),
    generation: resolveChatGeneration({
      version: 1,
      provider,
      model:
        provider === 'platform'
          ? null
          : provider === 'openai_byok'
            ? 'gpt-6-luna'
            : 'gemini-3.7-flash',
      reasoning: 'high',
    }),
    systemInstruction: 'Instrução única',
    prompt: ' Pergunta própria 🐉 ',
    context: await frozenFixture(),
    history: [
      { role: 'user', text: 'Pergunta anterior' },
      { role: 'assistant', text: 'Resposta anterior' },
    ],
    closureHash: hash('8'),
  };
}
function stream(provider: 'openai' | 'gemini', text = 'Resposta completa') {
  const event =
    provider === 'openai'
      ? { choices: [{ delta: { content: text }, finish_reason: 'stop' }] }
      : {
          candidates: [
            {
              content: { parts: [{ thought: true, text: 'não mostrar raciocínio' }, { text }] },
              finishReason: 'STOP',
            },
          ],
        };
  return new Response(`data: ${JSON.stringify(event)}\n\n`, { status: 200 });
}
function config() {
  vi.spyOn(storage, 'getBYOKConfig').mockReturnValue({
    provider: 'gemini_byok',
    customModel: 'modelo-atual',
    openaiApiKey: ' fake-original-openai ',
    geminiApiKey: ' fake-original-gemini ',
  });
}
function options() {
  return { signal: new AbortController().signal, check: vi.fn() };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe('execução explícita BYOK do chat de cenas', () => {
  it.each(['openai_byok', 'gemini_byok'] as const)(
    'conserva provedor/modelo originais e entrega só o resultado final: %s',
    async (provider) => {
      config();
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(stream(provider === 'openai_byok' ? 'openai' : 'gemini'));
      vi.stubGlobal('fetch', fetcher);
      const captured = await input(provider),
        own = options();
      expect(await runEditorChatByok(captured, own)).toBe('Resposta completa');
      const [url, request] = fetcher.mock.calls[0]!;
      expect(typeof url === 'string' ? url : url instanceof URL ? url.href : url.url).toContain(
        provider === 'openai_byok' ? 'api.openai.com' : 'models/gemini-3.7-flash',
      );
      expect(request?.headers).toEqual(
        provider === 'openai_byok'
          ? { 'Content-Type': 'application/json', Authorization: 'Bearer fake-original-openai' }
          : { 'Content-Type': 'application/json', 'x-goog-api-key': 'fake-original-gemini' },
      );
      const body = JSON.parse(request?.body as string) as Record<string, unknown>;
      expect(JSON.stringify(body)).not.toContain('fake-original');
      expect(JSON.stringify(body)).toContain('Pergunta anterior');
      expect(JSON.stringify(body)).toContain(' Pergunta própria 🐉 ');
      expect(JSON.stringify(body)).not.toContain('modelo-atual');
      expect(own.check).toHaveBeenCalled();
      expect(JSON.stringify(captured)).not.toContain('fake-original');
    },
  );
  it('chave original ausente falha antes do HTTP, sem fallback de plataforma', async () => {
    vi.spyOn(storage, 'getBYOKConfig').mockReturnValue({
      provider: 'gemini_byok',
      geminiApiKey: 'fake-other-provider',
    });
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await expect(runEditorChatByok(await input(), options())).rejects.toMatchObject({
      reason: 'credential-unavailable',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('recusa geração de plataforma antes do HTTP', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await expect(runEditorChatByok(await input('platform'), options())).rejects.toMatchObject({
      name: 'EditorChatContractError',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('abort prévio não emite o pedido', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await expect(
      runEditorChatByok(await input(), { signal: controller.signal, check: vi.fn() }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('troca de ator durante HTTP descarta a resposta', async () => {
    config();
    let active = true;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        active = false;
        return Promise.resolve(stream('openai'));
      }),
    );
    await expect(
      runEditorChatByok(await input(), {
        signal: new AbortController().signal,
        check: () => {
          if (!active) throw new Error('actor-changed');
        },
      }),
    ).rejects.toThrow('actor-changed');
  });
  it('abort durante HTTP descarta a resposta sem transformar em confirmação de stop', async () => {
    config();
    const controller = new AbortController();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        controller.abort();
        return Promise.resolve(stream('openai'));
      }),
    );
    await expect(
      runEditorChatByok(await input(), { signal: controller.signal, check: vi.fn() }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('não expõe erro nem chave retornados pelo provedor', async () => {
    config();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('segredo fake-original-openai')));
    await expect(runEditorChatByok(await input(), options())).rejects.toMatchObject({
      reason: 'provider-failed',
      message: 'Não foi possível concluir a resposta no provedor.',
    });
  });
  it('resposta sem finalização é falha, sem conteúdo parcial devolvido', async () => {
    config();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(new Response('data: {"choices":[{"delta":{"content":"parcial"}}]}\n')),
    );
    await expect(runEditorChatByok(await input(), options())).rejects.toMatchObject({
      reason: 'provider-failed',
    });
  });
  it('resposta acima do limite falha integralmente', async () => {
    config();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(stream('openai', 'x'.repeat(24001))));
    await expect(runEditorChatByok(await input(), options())).rejects.toMatchObject({
      reason: 'provider-failed',
    });
  });
});
