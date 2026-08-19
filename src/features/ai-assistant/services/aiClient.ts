import { getGenerativeModel } from 'firebase/ai';
import { getFirebaseAI } from '@/shared/lib';
import type { BYOKConfig } from '../model/byokConfig';
import { getBYOKConfig } from './byokStorage';

export interface GenerateAIOptions {
  prompt: string;
  systemInstruction?: string;
  byokConfig?: BYOKConfig;
  signal?: AbortSignal;
}

export async function generateAIResponse({
  prompt,
  systemInstruction,
  byokConfig = getBYOKConfig(),
  signal,
}: GenerateAIOptions): Promise<string> {
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
        max_tokens: 500,
      }),
      signal,
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Erro na API OpenAI (${response.status}): ${errBody}`);
    }

    interface OpenAIChoice {
      message?: { content?: string };
    }
    const data = (await response.json()) as { choices?: OpenAIChoice[] };
    const content = data.choices?.[0]?.message?.content?.trim() || '';
    return content;
  }

  // 2. Provedor BYOK: Gemini Direto
  if (byokConfig.provider === 'gemini_byok' && byokConfig.geminiApiKey?.trim()) {
    const modelName = byokConfig.customModel || 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${byokConfig.geminiApiKey.trim()}`;

    const bodyPayload: {
      contents: Array<{ parts: Array<{ text: string }> }>;
      systemInstruction?: { parts: Array<{ text: string }> };
    } = {
      contents: [{ parts: [{ text: prompt }] }],
    };

    if (systemInstruction) {
      bodyPayload.systemInstruction = {
        parts: [{ text: systemInstruction }],
      };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyPayload),
      signal,
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Erro na API Gemini (${response.status}): ${errBody}`);
    }

    interface GeminiCandidate {
      content?: { parts?: Array<{ text?: string }> };
    }
    const data = (await response.json()) as { candidates?: GeminiCandidate[] };
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
      maxOutputTokens: 600,
    },
  });

  const result = await generativeModel.generateContent(prompt);
  const responseText = result.response.text().trim();
  return responseText;
}
