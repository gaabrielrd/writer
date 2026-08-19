export type AIProvider = 'firebase_ai' | 'gemini_byok' | 'openai_byok';

export interface BYOKConfig {
  provider: AIProvider;
  geminiApiKey?: string;
  openaiApiKey?: string;
  customModel?: string;
}

export function validateBYOKConfig(config: BYOKConfig): {
  isValid: boolean;
  error?: string;
} {
  if (config.provider === 'gemini_byok') {
    if (!config.geminiApiKey?.trim()) {
      return { isValid: false, error: 'Chave de API do Gemini é obrigatória.' };
    }
  }

  if (config.provider === 'openai_byok') {
    if (!config.openaiApiKey?.trim()) {
      return { isValid: false, error: 'Chave de API da OpenAI é obrigatória.' };
    }
  }

  return { isValid: true };
}
