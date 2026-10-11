import { getGenerativeModel } from 'firebase/ai';
import { getFirebaseAI } from '@/shared/lib';
import { validateBYOKConfig, type BYOKConfig } from '../model/byokConfig';
import { getBYOKConfig } from './byokStorage';

export interface GenerateAIOptions {
  prompt: string;
  systemInstruction?: string;
  byokConfig?: BYOKConfig;
  signal?: AbortSignal;
  maxOutputTokens?: number;
  json?: boolean;
}

export async function generateAIResponse({
  prompt,
  systemInstruction,
  byokConfig = getBYOKConfig(),
  signal,
  maxOutputTokens,
  json = false,
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
        temperature: 0.7,
        max_tokens: maxOutputTokens ?? 500,
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
      generationConfig?: { maxOutputTokens: number; responseMimeType: string };
    } = {
      contents: [{ parts: [{ text: prompt }] }],
    };
    if (json)
      bodyPayload.generationConfig = {
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
      content?: { parts?: Array<{ text?: string }> };
    }
    const data = (await response.json()) as {
      candidates?: (GeminiCandidate & { finishReason?: string })[];
    };
    if (json && data.candidates?.[0]?.finishReason !== 'STOP')
      throw new Error('Análise interrompida pelo provedor. Nenhuma alteração foi aplicada.');
    const textPart = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    return textPart;
  }

  // 3. Provedor Padrão: Firebase AI Logic (Gemini 3.7 Flash)
  const aiInstance = getFirebaseAI();
  const generativeModel = getGenerativeModel(aiInstance, {
    model: byokConfig.customModel || 'gemini-3.7-flash',
    systemInstruction,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: maxOutputTokens ?? 600,
    },
  });

  const result = await generativeModel.generateContent(prompt, { signal });
  signal?.throwIfAborted();
  const responseText = result.response.text().trim();
  return responseText;
}
