import { describe, expect, it } from 'vitest';
import { EnvValidationError, createEnv } from '../env';

function raw(overrides: Record<string, unknown> = {}): ImportMetaEnv {
  return { MODE: 'test', PROD: false, DEV: true, SSR: false, BASE_URL: '/', ...overrides };
}

describe('createEnv', () => {
  it('expoe o modo e a flag de producao', () => {
    const env = createEnv(raw({ MODE: 'production', PROD: true }));

    expect(env.mode).toBe('production');
    expect(env.isProduction).toBe(true);
  });

  it('deixa apiUrl indefinida quando a variavel nao existe', () => {
    expect(createEnv(raw()).apiUrl).toBeUndefined();
  });

  it('trata string vazia ou so espacos como ausente', () => {
    expect(createEnv(raw({ VITE_API_URL: '   ' })).apiUrl).toBeUndefined();
  });

  it('normaliza a URL informada removendo a barra final', () => {
    expect(createEnv(raw({ VITE_API_URL: 'https://api.exemplo.com/' })).apiUrl).toBe(
      'https://api.exemplo.com',
    );
  });

  it('falha com mensagem acionavel quando a URL e invalida', () => {
    expect(() => createEnv(raw({ VITE_API_URL: 'api.exemplo.com' }))).toThrow(EnvValidationError);
    expect(() => createEnv(raw({ VITE_API_URL: 'api.exemplo.com' }))).toThrow(/URL absoluta/);
  });

  it('reune todos os problemas em uma unica mensagem', () => {
    try {
      createEnv(raw({ VITE_API_URL: 'nao-e-url' }));
      expect.unreachable('createEnv deveria ter lancado');
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      expect((error as Error).message).toContain('.env.local');
    }
  });
});
