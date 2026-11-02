import { isPlatformTextModel } from './chatGeneration';
export type AIProvider = 'firebase_ai' | 'gemini_byok' | 'openai_byok';

export interface BYOKConfig {
  provider: AIProvider;
  geminiApiKey?: string;
  openaiApiKey?: string;
  customModel?: string;
  platformModel?: string;
  platformReasoning?: 'medium' | 'high';
  geminiModel?: string;
  openaiModel?: string;
}

export function validateBYOKConfig(config: BYOKConfig): {
  isValid: boolean;
  error?: string;
} {
  if (!['firebase_ai', 'gemini_byok', 'openai_byok'].includes(config.provider)) {
    return { isValid: false, error: 'Provedor de IA inválido.' };
  }
  if (config.platformModel !== undefined && !isPlatformTextModel(config.platformModel))
    return { isValid: false, error: 'Modelo da plataforma inválido.' };
  if (
    config.platformReasoning !== undefined &&
    !['medium', 'high'].includes(config.platformReasoning)
  )
    return { isValid: false, error: 'Raciocínio da plataforma inválido.' };
  for (const model of [config.geminiModel, config.openaiModel])
    if (model !== undefined && model !== '' && !/^[a-zA-Z0-9._:-]+$/.test(model.trim()))
      return { isValid: false, error: 'Nome do modelo inválido.' };
  if (config.customModel && !/^[a-zA-Z0-9._:-]+$/.test(config.customModel.trim())) {
    return { isValid: false, error: 'Nome do modelo inválido.' };
  }

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

export function usesOwnKey(config: BYOKConfig): boolean {
  return config.provider !== 'firebase_ai' && validateBYOKConfig(config).isValid;
}
