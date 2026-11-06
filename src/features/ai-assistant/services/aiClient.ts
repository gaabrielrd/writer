import { getGenerativeModel } from 'firebase/ai';
import { getFirebaseAI } from '@/shared/lib';
import { validateBYOKConfig, type BYOKConfig } from '../model/byokConfig';
import {
  DEFAULT_PLATFORM_MODEL,
  DEFAULT_PLATFORM_REASONING,
  resolvePlatformTextGeneration,
  geminiTextGenerationOptions,
  chatProviderGenerationOptions,
  type ChatGeneration,
} from '../model/chatGeneration';
import { getBYOKConfig } from './byokStorage';

export interface GenerateAIOptions {
  prompt: string;
  systemInstruction?: string;
  byokConfig?: BYOKConfig;
  signal?: AbortSignal;
  maxOutputTokens?: number;
  json?: boolean;
  frozenGeneration?: ChatGeneration;
}

export async function generateAIResponse({
  prompt,
  systemInstruction,
  byokConfig = getBYOKConfig(),
  signal,
  maxOutputTokens,
  json = false,
  frozenGeneration,
}: GenerateAIOptions): Promise<string> {
  signal?.throwIfAborted();
  const validation = validateBYOKConfig(byokConfig);
  if (!validation.isValid) throw new Error(validation.error);
  // 1. Provedor BYOK: OpenAI
  if (byokConfig.provider === 'openai_byok' && byokConfig.openaiApiKey?.trim()) {
    const messages = [];
    if (systemInstruction) {
      messages.push({ role: 'system', content: systemInstruction });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${byokConfig.openaiApiKey.trim()}`,
      },
      body: JSON.stringify({
        model: byokConfig.customModel || 'gpt-4o-mini',
        messages,
        ...(frozenGeneration
          ? (() => {
              const options = chatProviderGenerationOptions(frozenGeneration);
              return 'max_completion_tokens' in options
                ? { ...options, max_completion_tokens: maxOutputTokens ?? 1024 }
                : { ...options, max_tokens: maxOutputTokens ?? 1024 };
            })()
          : { temperature: 0.7, max_tokens: maxOutputTokens ?? 500 }),
        ...(json ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal,
    });

    if (!response.ok) {
      throw new Error(`Erro na API OpenAI (${response.status}). Verifique sua chave e cota.`);
    }

    interface OpenAIChoice {
      message?: { content?: string };
    }
    const data = (await response.json()) as {
      choices?: (OpenAIChoice & { finish_reason?: string })[];
    };
    if (json && data.choices?.[0]?.finish_reason !== 'stop')
      throw new Error('Análise interrompida pelo provedor. Nenhuma alteração foi aplicada.');
    const content = data.choices?.[0]?.message?.content?.trim() || '';
    return content;
  }

  // 2. Provedor BYOK: Gemini Direto
  if (byokConfig.provider === 'gemini_byok' && byokConfig.geminiApiKey?.trim()) {
    const modelName = byokConfig.customModel || 'gemini-3.7-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;

    const bodyPayload: {
      contents: Array<{ parts: Array<{ text: string }> }>;
      systemInstruction?: { parts: Array<{ text: string }> };
      generationConfig?: Record<string, unknown>;
    } = {
      contents: [{ parts: [{ text: prompt }] }],
    };
    if (json)
      bodyPayload.generationConfig = {
        ...(frozenGeneration ? chatProviderGenerationOptions(frozenGeneration) : {}),
        maxOutputTokens: maxOutputTokens ?? 12000,
        responseMimeType: 'application/json',
      };

    if (systemInstruction) {
      bodyPayload.systemInstruction = {
        parts: [{ text: systemInstruction }],
      };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': byokConfig.geminiApiKey.trim(),
      },
      body: JSON.stringify(bodyPayload),
      signal,
    });

    if (!response.ok) {
      throw new Error(`Erro na API Gemini (${response.status}). Verifique sua chave e cota.`);
    }

    interface GeminiCandidate {
      content?: { parts?: Array<{ text?: string; thought?: boolean }> };
    }
    const data = (await response.json()) as {
      candidates?: (GeminiCandidate & { finishReason?: string })[];
    };
    if (json && data.candidates?.[0]?.finishReason !== 'STOP')
      throw new Error('Análise interrompida pelo provedor. Nenhuma alteração foi aplicada.');
    const parts = data.candidates?.[0]?.content?.parts;
    const textPart = frozenGeneration
      ? (parts ?? [])
          .filter((part) => !part.thought)
          .map((part) => part.text ?? '')
          .join('')
          .trim()
      : parts?.[0]?.text?.trim() || '';
    return textPart;
  }

  // 3. Platform parameters are captured from the supplied configuration before awaiting I/O.
  const generation = resolvePlatformTextGeneration({
    version: 1,
    provider: 'platform',
    model: byokConfig.platformModel ?? DEFAULT_PLATFORM_MODEL,
    reasoning: byokConfig.platformReasoning ?? DEFAULT_PLATFORM_REASONING,
  });
  // Firebase AI Logic
  const aiInstance = getFirebaseAI();
  const generativeModel = getGenerativeModel(aiInstance, {
    model: generation.effective.model,
    systemInstruction,
    generationConfig: {
      ...geminiTextGenerationOptions(generation, maxOutputTokens ?? 600),
    },
  });

  const result = await generativeModel.generateContent(prompt, { signal });
  signal?.throwIfAborted();
  const responseText = result.response.text().trim();
  return responseText;
}
