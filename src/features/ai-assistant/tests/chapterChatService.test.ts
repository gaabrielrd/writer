import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  chapterChatCall,
  createChapterChat,
  loadChapterChat,
  readProviderStream,
  sendChapterChat,
  captureChatGeneration,
} from '../services/chapterChatService';
import * as byok from '../services/byokStorage';
import type { ChatContext } from '../model/chapterChat';
import { resolveChatGeneration, type ChatGenerationRequest } from '../model/chatGeneration';

const mocks = vi.hoisted(() => ({ call: vi.fn(), stream: vi.fn() }));
vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(),
  httpsCallable: () => Object.assign(mocks.call, { stream: mocks.stream }),
}));
vi.mock('@/shared/lib', () => ({ getFirebaseApp: vi.fn() }));
const identity = { bookId: 'book', chapterId: 'chapter', conversationId: 'conversation' };
const context: ChatContext = {
  source: 'cursor',
  text: 'Texto',
  surrounding: '',
  title: '',
  bookTitle: '',
  persona: { instruction: 'Persona', version: 'v1' },
  lore: [],
  target: null,
  truncated: false,
};
function response(events: string, chunkSize = 7) {
  const bytes = new TextEncoder().encode(events);
  return new Response(
    new ReadableStream({
      start(controller) {
        for (let i = 0; i < bytes.length; i += chunkSize)
          controller.enqueue(bytes.slice(i, i + chunkSize));
        controller.close();
      },
    }),
  );
}
function requestBody(options: RequestInit): Record<string, unknown> {
  if (typeof options.body !== 'string') throw new Error('O corpo HTTP deve ser JSON serializado.');
  return JSON.parse(options.body) as Record<string, unknown>;
}
beforeEach(() => {
  vi.restoreAllMocks();
  mocks.call.mockReset();
  mocks.stream.mockReset();
});
describe('serviço do chat', () => {
  it('captura somente parâmetros públicos, sem incluir chaves na configuração', () => {
    vi.spyOn(byok, 'getBYOKConfig').mockReturnValue({
      provider: 'openai_byok',
      customModel: 'gpt-6-luna',
      openaiApiKey: 'fake-private-key',
    });
    const generation = captureChatGeneration('max');
    expect(generation).toEqual({
      version: 1,
      provider: 'openai_byok',
      model: 'gpt-6-luna',
      reasoning: 'max',
    });
    expect(JSON.stringify(generation)).not.toContain('fake-private-key');
  });
  it.each(['auto', 'none', 'low', 'medium', 'high', 'xhigh', 'max'] as const)(
    'envia esforço OpenAI %s com teto e snapshot preservado após trocar de provedor',
    async (reasoning) => {
      vi.spyOn(byok, 'getBYOKConfig').mockReturnValue({
        provider: 'gemini_byok',
        customModel: 'modelo-atual-diferente',
        geminiApiKey: 'fake-gemini-key',
        openaiApiKey: 'fake-original-openai-key',
      });
      const generation: ChatGenerationRequest = {
        version: 1,
        provider: 'openai_byok',
        model: 'gpt-6-luna',
        reasoning,
      };
      mocks.call
        .mockResolvedValueOnce({
          data: {
            generation: resolveChatGeneration(generation),
            messageInstance: 'instance',
            generationAttempt: 'attempt',
            input: { context, text: 'Pedido', systemInstruction: 'Sistema', history: [] },
          },
        })
        .mockResolvedValueOnce({ data: { state: 'done' } });
      const fetch = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(
          response('data: {"choices":[{"delta":{"content":"Cena"},"finish_reason":"stop"}]}\n'),
        );
      await sendChapterChat(
        identity,
        { requestId: 'frozen', text: 'Pedido', context, generation },
        vi.fn(),
        new AbortController().signal,
      );
      expect(fetch.mock.calls[0]![0]).toBe('https://api.openai.com/v1/chat/completions');
      const options = fetch.mock.calls[0]![1]!;
      expect(requestBody(options)).toMatchObject({
        model: 'gpt-6-luna',
        max_completion_tokens: 4000,
        reasoning_effort: reasoning === 'auto' ? 'medium' : reasoning,
      });
      expect(options.headers).toMatchObject({ Authorization: 'Bearer fake-original-openai-key' });
      expect(JSON.stringify(mocks.call.mock.calls)).not.toContain('fake-original-openai-key');
      expect(JSON.stringify(mocks.call.mock.calls)).not.toContain('fake-gemini-key');
    },
  );
  it.each(['auto', 'low', 'medium', 'high'] as const)(
    'envia pensamento Gemini %s e filtra partes privadas',
    async (reasoning) => {
      vi.spyOn(byok, 'getBYOKConfig').mockReturnValue({
        provider: 'gemini_byok',
        geminiApiKey: 'fake-key',
      });
      const generation: ChatGenerationRequest = {
        version: 1,
        provider: 'gemini_byok',
        model: 'gemini-3.7-flash',
        reasoning,
      };
      mocks.call
        .mockResolvedValueOnce({
          data: {
            generation: resolveChatGeneration(generation),
            messageInstance: 'instance',
            generationAttempt: 'attempt',
            input: { context, text: 'Pedido', systemInstruction: 'Sistema', history: [] },
          },
        })
        .mockResolvedValueOnce({ data: { state: 'done' } });
      const fetch = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(
          response(
            'data: {"candidates":[{"content":{"parts":[{"thought":true,"text":"privado"},{"text":"Cena"}]},"finishReason":"STOP"}]}\n',
          ),
        );
      const chunks = vi.fn();
      await sendChapterChat(
        identity,
        { requestId: 'frozen', text: 'Pedido', context, generation },
        chunks,
        new AbortController().signal,
      );
      expect(requestBody(fetch.mock.calls[0]![1]!).generationConfig).toEqual({
        maxOutputTokens: 4000,
        thinkingConfig: {
          thinkingLevel: reasoning === 'auto' ? 'medium' : reasoning,
          includeThoughts: false,
        },
      });
      expect(chunks).toHaveBeenCalledExactlyOnceWith('Cena');
      expect(JSON.stringify(mocks.call.mock.calls)).not.toContain('privado');
      expect(JSON.stringify(mocks.call.mock.calls)).not.toContain('fake-key');
    },
  );
  it('recupera BYOK concluído sem chave e recusa novo transporte sem a chave original', async () => {
    vi.spyOn(byok, 'getBYOKConfig').mockReturnValue({ provider: 'firebase_ai' });
    const generation: ChatGenerationRequest = {
      version: 1,
      provider: 'openai_byok',
      model: 'gpt-6-luna',
      reasoning: 'high',
    };
    const fetch = vi.spyOn(globalThis, 'fetch');
    mocks.call.mockResolvedValueOnce({ data: { state: 'done', text: 'Resposta salva' } });
    expect(
      await sendChapterChat(
        identity,
        { requestId: 'saved', text: 'Pedido', context, generation },
        vi.fn(),
        new AbortController().signal,
      ),
    ).toMatchObject({ text: 'Resposta salva' });
    expect(fetch).not.toHaveBeenCalled();
    mocks.call
      .mockResolvedValueOnce({
        data: {
          messageInstance: 'instance',
          generationAttempt: 'attempt',
          input: { context, text: 'Pedido', systemInstruction: 'Sistema', history: [] },
        },
      })
      .mockResolvedValueOnce({ data: {} });
    await expect(
      sendChapterChat(
        identity,
        { requestId: 'pending', text: 'Pedido', context, generation },
        vi.fn(),
        new AbortController().signal,
      ),
    ).rejects.toThrow('provedor original');
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.call).toHaveBeenLastCalledWith({
      ...identity,
      action: 'failBYOK',
      messageInstance: 'instance',
      generationAttempt: 'attempt',
      requestId: 'pending',
    });
  });
  it('carrega, cria e encaminha identidade para a callable', async () => {
    mocks.call.mockResolvedValue({ data: { id: 'created' } });
    await loadChapterChat(identity, { before: 4 });
    expect(mocks.call).toHaveBeenLastCalledWith({ ...identity, action: 'load', before: 4 });
    expect(await createChapterChat(identity, 'Título')).toEqual({ id: 'created' });
  });
  it('distingue falhas definitivas de resultados incertos', async () => {
    mocks.call.mockRejectedValue(
      Object.assign(new Error('Falha'), { code: 'functions/failed-precondition' }),
    );
    await expect(chapterChatCall(identity, {})).rejects.toMatchObject({ uncertain: false });
    mocks.call.mockRejectedValue(new Error('Rede'));
    await expect(chapterChatCall(identity, {})).rejects.toMatchObject({ uncertain: true });
  });
  it('consome UTF-8 dividido e finaliza SSE de OpenAI e Gemini', async () => {
    const chunks: string[] = [];
    const output = await readProviderStream(
      response(
        'data: {"choices":[{"delta":{"content":"Olá"}}]}\r\n\r\ndata: {"choices":[{"finish_reason":"stop"}]}\n\ndata: [DONE]\n',
      ),
      'openai',
      (chunk) => chunks.push(chunk),
      new AbortController().signal,
    );
    expect(output).toBe('Olá');
    expect(chunks).toEqual(['Olá']);
    expect(
      await readProviderStream(
        response(
          'data: {"candidates":[{"content":{"parts":[{"text":"Cena"}]},"finishReason":"STOP"}]}',
        ),
        'gemini',
        vi.fn(),
        new AbortController().signal,
      ),
    ).toBe('Cena');
  });
  it('recusa saída truncada, corpo ausente, erro HTTP e cancelamento', async () => {
    await expect(
      readProviderStream(
        response('data: {"choices":[{"finish_reason":"length"}]}\n'),
        'openai',
        vi.fn(),
        new AbortController().signal,
      ),
    ).rejects.toThrow('interrompida');
    await expect(
      readProviderStream(response(''), 'gemini', vi.fn(), new AbortController().signal),
    ).rejects.toThrow('concluída');
    await expect(
      readProviderStream(
        new Response(null, { status: 403 }),
        'gemini',
        vi.fn(),
        new AbortController().signal,
      ),
    ).rejects.toThrow('403');
    const abort = new AbortController();
    abort.abort();
    await expect(
      readProviderStream(response(''), 'openai', vi.fn(), abort.signal),
    ).rejects.toThrow();
  });
  it('gera na plataforma sem enviar chaves e entrega os chunks e o resultado final', async () => {
    vi.spyOn(byok, 'getBYOKConfig').mockReturnValue({ provider: 'firebase_ai' });
    mocks.stream.mockResolvedValue({
      stream: (async function* () {
        yield await Promise.resolve({ text: 'Olá' });
      })(),
      data: Promise.resolve({ text: 'Olá', state: 'done' }),
    });
    const chunk = vi.fn();
    expect(
      await sendChapterChat(
        identity,
        { requestId: 'request', text: 'Pedido', context },
        chunk,
        new AbortController().signal,
      ),
    ).toMatchObject({ state: 'done' });
    expect(chunk).toHaveBeenCalledWith('Olá');
    expect(mocks.stream.mock.calls[0]![0]).toMatchObject({ action: 'send', mode: 'platform' });
  });
  it.each(['openai_byok', 'gemini_byok'] as const)(
    'gera em %s, conserva histórico/persona e registra só a saída',
    async (provider) => {
      vi.spyOn(byok, 'getBYOKConfig').mockReturnValue({
        provider,
        openaiApiKey: 'sk-own',
        geminiApiKey: 'own-key',
      });
      mocks.call
        .mockResolvedValueOnce({
          data: {
            state: 'running',
            messageInstance: 'instance',
            generationAttempt: 'attempt',
            input: {
              context,
              text: 'Pedido',
              systemInstruction: 'Sistema',
              history: [
                { role: 'user', text: 'Antes' },
                { role: 'assistant', text: 'Resposta' },
              ],
            },
          },
        })
        .mockResolvedValueOnce({ data: { state: 'done' } });
      const fetch = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(
          response(
            provider === 'openai_byok'
              ? 'data: {"choices":[{"delta":{"content":"Cena"},"finish_reason":"stop"}]}\n'
              : 'data: {"candidates":[{"content":{"parts":[{"text":"Cena"}]},"finishReason":"STOP"}]}\n',
          ),
        );
      await sendChapterChat(
        identity,
        { requestId: 'request', text: 'Pedido', context },
        vi.fn(),
        new AbortController().signal,
      );
      expect(fetch.mock.calls[0]![1]!.body).toContain('Persona');
      expect(fetch.mock.calls[0]![1]!.body).toContain('Antes');
      expect(JSON.stringify(mocks.call.mock.calls)).not.toContain('sk-own');
      expect(mocks.call).toHaveBeenLastCalledWith({
        ...identity,
        action: 'completeBYOK',
        messageInstance: 'instance',
        generationAttempt: 'attempt',
        requestId: 'request',
        output: 'Cena',
      });
    },
  );
});

it('captura o modelo selecionado e raciocínio da plataforma sem usar o modelo antigo carregado do servidor', () => {
  vi.spyOn(byok, 'getBYOKConfig').mockReturnValue({
    provider: 'firebase_ai',
    platformModel: 'gemini-4-argon',
    platformReasoning: 'high',
    geminiApiKey: 'private-test',
  });
  expect(captureChatGeneration('auto')).toEqual({
    version: 1,
    provider: 'platform',
    model: 'gemini-4-argon',
    reasoning: 'high',
  });
});

describe('retomada de mutações de conversa', () => {
  it('continua páginas com a identidade original e sem reenviar o texto de edição', async () => {
    mocks.call
      .mockResolvedValueOnce({
        data: {
          mutation: {
            id: 'edit-op',
            conversationId: 'conversation',
            kind: 'edit',
            state: 'running',
            deletedDocuments: 200,
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          mutation: {
            id: 'edit-op',
            conversationId: 'conversation',
            kind: 'edit',
            state: 'running',
            deletedDocuments: 400,
          },
        },
      })
      .mockResolvedValueOnce({ data: {} });
    expect(
      await chapterChatCall(identity, {
        action: 'edit',
        mutationId: 'edit-op',
        before: 1,
        draft: 'Pedido privado',
      }),
    ).toEqual({});
    expect(mocks.call).toHaveBeenNthCalledWith(2, {
      ...identity,
      action: 'resumeMutation',
      mutationId: 'edit-op',
    });
    expect(mocks.call).toHaveBeenNthCalledWith(3, {
      ...identity,
      action: 'resumeMutation',
      mutationId: 'edit-op',
    });
    expect(JSON.stringify(mocks.call.mock.calls.slice(1))).not.toContain('Pedido privado');
  });
  it('retoma uma operação observada no carregamento e então carrega o estado final', async () => {
    const pending = {
      id: 'delete-op',
      conversationId: 'conversation',
      kind: 'delete',
      state: 'running',
      deletedDocuments: 0,
    };
    const page = { conversations: [], conversation: null, messages: [], before: null };
    mocks.call
      .mockResolvedValueOnce({ data: { ...page, pendingMutation: pending } })
      .mockResolvedValueOnce({ data: {} })
      .mockResolvedValueOnce({ data: page });
    expect(await loadChapterChat(identity)).toEqual(page);
    expect(mocks.call).toHaveBeenNthCalledWith(2, {
      ...identity,
      action: 'resumeMutation',
      mutationId: 'delete-op',
    });
    expect(mocks.call).toHaveBeenNthCalledWith(3, { ...identity, action: 'load' });
  });
  it('não inicia uma nova identidade ao observar uma página sem progresso', async () => {
    const pending = {
      id: 'delete-op',
      conversationId: 'conversation',
      kind: 'delete',
      state: 'running',
      deletedDocuments: 200,
    };
    mocks.call.mockResolvedValue({ data: { mutation: pending } });
    await expect(
      chapterChatCall(identity, { action: 'delete', mutationId: 'delete-op' }),
    ).rejects.toThrow(/pendente/);
    expect(mocks.call).toHaveBeenCalledTimes(2);
    expect(mocks.call).toHaveBeenLastCalledWith({
      ...identity,
      action: 'resumeMutation',
      mutationId: 'delete-op',
    });
  });
});

describe('vínculo das tentativas BYOK', () => {
  it('não chama o provedor nem confirma uma resposta sem tentativa recebida do servidor', async () => {
    vi.spyOn(byok, 'getBYOKConfig').mockReturnValue({
      provider: 'openai_byok',
      openaiApiKey: 'fake-key',
      geminiApiKey: '',
      customModel: 'gpt-4o-mini',
    });
    mocks.call.mockResolvedValueOnce({
      data: { input: { context, text: 'Pedido', systemInstruction: 'Sistema', history: [] } },
    });
    const fetch = vi.spyOn(globalThis, 'fetch');
    await expect(
      sendChapterChat(
        identity,
        {
          requestId: 'request',
          messageInstance: 'instance',
          text: 'Pedido',
          context,
          generation: {
            version: 1,
            provider: 'openai_byok',
            model: 'gpt-4o-mini',
            reasoning: 'auto',
          },
        },
        vi.fn(),
        new AbortController().signal,
      ),
    ).rejects.toThrow(/tentativa/);
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.call).toHaveBeenCalledTimes(1);
  });
  it('recusa uma instância divergente antes de enviar texto ou chave ao provedor', async () => {
    vi.spyOn(byok, 'getBYOKConfig').mockReturnValue({
      provider: 'openai_byok',
      openaiApiKey: 'fake-key',
      geminiApiKey: '',
      customModel: 'gpt-4o-mini',
    });
    mocks.call.mockResolvedValueOnce({
      data: {
        messageInstance: 'other-instance',
        generationAttempt: 'attempt',
        input: { context, text: 'Pedido', systemInstruction: 'Sistema', history: [] },
      },
    });
    const fetch = vi.spyOn(globalThis, 'fetch');
    await expect(
      sendChapterChat(
        identity,
        {
          requestId: 'request',
          messageInstance: 'instance',
          text: 'Pedido',
          context,
          generation: {
            version: 1,
            provider: 'openai_byok',
            model: 'gpt-4o-mini',
            reasoning: 'auto',
          },
        },
        vi.fn(),
        new AbortController().signal,
      ),
    ).rejects.toThrow(/tentativa/);
    expect(fetch).not.toHaveBeenCalled();
  });
});
