import { describe, expect, it, vi, beforeEach } from 'vitest';
import { generateAIResponse } from '../services/aiClient';
import * as firebaseAIModule from 'firebase/ai';
import * as sharedLibModule from '@/shared/lib';

vi.mock('firebase/ai', async () => {
  const actual = await vi.importActual<typeof firebaseAIModule>('firebase/ai');
  return {
    ...actual,
    getGenerativeModel: vi.fn(),
  };
});

vi.mock('@/shared/lib', async () => {
  const actual = await vi.importActual<typeof sharedLibModule>('@/shared/lib');
  return {
    ...actual,
    getFirebaseAI: vi.fn(() => ({})),
  };
});

describe('aiClient service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('chama Firebase AI Logic por padrao', async () => {
    const fakeGenerateContent = vi.fn().mockResolvedValue({
      response: {
        text: () => 'Continuação mágica sugerida pelo Gemini.',
      },
    });

    vi.mocked(firebaseAIModule.getGenerativeModel).mockReturnValueOnce({
      generateContent: fakeGenerateContent,
    } as unknown as firebaseAIModule.GenerativeModel);

    const result = await generateAIResponse({
      prompt: 'Era uma vez...',
      byokConfig: { provider: 'firebase_ai' },
    });

    expect(result).toBe('Continuação mágica sugerida pelo Gemini.');
    expect(firebaseAIModule.getGenerativeModel).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        model: 'gemini-3.7-flash',
      }),
    );
  });

  it('chama OpenAI via fetch quando configurado para openai_byok', async () => {
    const originalFetch = globalThis.fetch;
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: 'Resposta da OpenAI.' } }],
        }),
    });
    globalThis.fetch = mockFetch;

    try {
      const result = await generateAIResponse({
        prompt: 'Descreva a espada.',
        byokConfig: {
          provider: 'openai_byok',
          openaiApiKey: 'sk-12345',
          customModel: 'gpt-4o',
        },
      });

      expect(result).toBe('Resposta da OpenAI.');
      const fetchCalls = mockFetch.mock.calls as Array<[string, RequestInit]>;
      expect(fetchCalls[0]?.[0]).toBe('https://api.openai.com/v1/chat/completions');
      const sentHeaders = fetchCalls[0]?.[1]?.headers as Record<string, string>;
      expect(sentHeaders?.Authorization).toBe('Bearer sk-12345');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('lanca erro se a chamada OpenAI falhar', async () => {
    const originalFetch = globalThis.fetch;
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Invalid API Key'),
    });
    globalThis.fetch = mockFetch;

    try {
      await expect(
        generateAIResponse({
          prompt: 'Descreva a espada.',
          byokConfig: {
            provider: 'openai_byok',
            openaiApiKey: 'sk-invalid',
          },
        }),
      ).rejects.toThrow('Erro na API OpenAI (401)');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('chama Gemini via fetch quando configurado para gemini_byok', async () => {
    const originalFetch = globalThis.fetch;
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          candidates: [{ content: { parts: [{ text: 'Resposta direta Gemini.' }] } }],
        }),
    });
    globalThis.fetch = mockFetch;

    try {
      const result = await generateAIResponse({
        prompt: 'Descreva o castelo.',
        byokConfig: {
          provider: 'gemini_byok',
          geminiApiKey: 'AIzaSy12345',
        },
      });

      expect(result).toBe('Resposta direta Gemini.');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('key=AIzaSy12345'),
        expect.anything(),
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('lanca erro se a chamada Gemini falhar', async () => {
    const originalFetch = globalThis.fetch;
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: () => Promise.resolve('Quota exceeded'),
    });
    globalThis.fetch = mockFetch;

    try {
      await expect(
        generateAIResponse({
          prompt: 'Descreva o castelo.',
          byokConfig: {
            provider: 'gemini_byok',
            geminiApiKey: 'AIzaSy12345',
          },
        }),
      ).rejects.toThrow('Erro na API Gemini (403)');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
