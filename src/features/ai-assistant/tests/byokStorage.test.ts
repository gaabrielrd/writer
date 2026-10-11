import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import {
  getBYOKConfig,
  saveBYOKConfig,
  clearBYOKConfig,
  subscribeBYOKConfig,
} from '../services/byokStorage';
import type { BYOKConfig } from '../model/byokConfig';

describe('byokStorage service', () => {
  it('notifies same-tab changes, cross-tab updates and removes subscriptions', () => {
    const listener = vi.fn();
    const stop = subscribeBYOKConfig(listener);
    saveBYOKConfig({ provider: 'openai_byok', openaiApiKey: 'test' });
    clearBYOKConfig();
    window.dispatchEvent(new StorageEvent('storage', { key: 'writer_byok_config' }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated' }));
    expect(listener).toHaveBeenCalledTimes(3);
    stop();
    clearBYOKConfig();
    expect(listener).toHaveBeenCalledTimes(3);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
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
  it.each([
    'null',
    '[]',
    '{"provider":"unknown"}',
    '{"provider":"openai_byok","openaiApiKey":42}',
    '{"provider":"gemini_byok","geminiApiKey":""}',
  ])('rejects malformed saved configuration %s', (raw) => {
    localStorage.setItem('writer_byok_config', raw);
    expect(getBYOKConfig()).toEqual({ provider: 'firebase_ai' });
  });
  it('reports failed writes and deletion rather than pretending credentials were saved or removed', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    expect(() => saveBYOKConfig({ provider: 'openai_byok', openaiApiKey: 'test-key' })).toThrow(
      'salvar a chave',
    );
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => clearBYOKConfig()).toThrow('remover a chave');
  });
  it('rejects invalid provider/model settings at the persistence boundary', () => {
    expect(() => saveBYOKConfig({ provider: 'openai_byok' })).toThrow('obrigatória');
    expect(() =>
      saveBYOKConfig({
        provider: 'gemini_byok',
        geminiApiKey: 'test-key',
        customModel: '../../other?key=bad',
      }),
    ).toThrow('modelo inválido');
  });
});
