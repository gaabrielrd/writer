import { describe, expect, it } from 'vitest';
import { validateBYOKConfig, type BYOKConfig } from '../model/byokConfig';

describe('byokConfig model', () => {
  it('valida configuracao padrao do firebase_ai com sucesso', () => {
    const config: BYOKConfig = { provider: 'firebase_ai' };
    const result = validateBYOKConfig(config);
    expect(result.isValid).toBe(true);
  });

  it('valida chave valida para gemini_byok', () => {
    const config: BYOKConfig = {
      provider: 'gemini_byok',
      geminiApiKey: 'AIzaSy123456',
    };
    const result = validateBYOKConfig(config);
    expect(result.isValid).toBe(true);
  });

  it('rejeita gemini_byok sem chave', () => {
    const config: BYOKConfig = {
      provider: 'gemini_byok',
      geminiApiKey: '   ',
    };
    const result = validateBYOKConfig(config);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('Gemini');
  });

  it('valida chave valida para openai_byok', () => {
    const config: BYOKConfig = {
      provider: 'openai_byok',
      openaiApiKey: 'sk-123456',
    };
    const result = validateBYOKConfig(config);
    expect(result.isValid).toBe(true);
  });

  it('rejeita openai_byok sem chave', () => {
    const config: BYOKConfig = {
      provider: 'openai_byok',
      openaiApiKey: '',
    };
    const result = validateBYOKConfig(config);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('OpenAI');
  });
});
