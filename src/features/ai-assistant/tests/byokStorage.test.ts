import { beforeEach, describe, expect, it } from 'vitest';
import { getBYOKConfig, saveBYOKConfig, clearBYOKConfig } from '../services/byokStorage';
import type { BYOKConfig } from '../model/byokConfig';

describe('byokStorage service', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('retorna configuracao padrao quando o localStorage esta vazio', () => {
    const config = getBYOKConfig();
    expect(config.provider).toBe('firebase_ai');
  });

  it('salva e recupera configuracao personalizada', () => {
    const customConfig: BYOKConfig = {
      provider: 'openai_byok',
      openaiApiKey: 'sk-test12345',
      customModel: 'gpt-4o',
    };

    saveBYOKConfig(customConfig);
    const retrieved = getBYOKConfig();

    expect(retrieved.provider).toBe('openai_byok');
    expect(retrieved.openaiApiKey).toBe('sk-test12345');
    expect(retrieved.customModel).toBe('gpt-4o');
  });

  it('limpa as configuracoes salvas', () => {
    saveBYOKConfig({
      provider: 'gemini_byok',
      geminiApiKey: 'AIzaSyTest',
    });

    clearBYOKConfig();
    const config = getBYOKConfig();
    expect(config.provider).toBe('firebase_ai');
    expect(config.geminiApiKey).toBeUndefined();
  });

  it('retorna padrao caso ocorra erro no JSON.parse', () => {
    localStorage.setItem('writer_byok_config', '{invalido');
    const config = getBYOKConfig();
    expect(config.provider).toBe('firebase_ai');
  });
});
