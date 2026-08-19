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

  it('expoe configuracao do firebase com defaults quando variaveis nao sao fornecidas', () => {
    const env = createEnv(raw());
    expect(env.firebase.projectId).toBe('writer-44cd5');
    expect(env.firebase.apiKey).toBe('AIzaSyB1mNeWUowIT4o638JUf9vJBGWhp6I4vAY');
    expect(env.firebase.appCheckKey).toBe('6LePNI4tAAAAAFAMXZqWQlT1FxZkdbUU-7j9Amfz');
  });

  it('permite sobrescrever valores de configuracao do firebase', () => {
    const env = createEnv(
      raw({
        VITE_FIREBASE_PROJECT_ID: 'custom-proj',
        VITE_FIREBASE_APPCHECK_KEY: 'custom-key',
      }),
    );
    expect(env.firebase.projectId).toBe('custom-proj');
    expect(env.firebase.appCheckKey).toBe('custom-key');
  });
});
