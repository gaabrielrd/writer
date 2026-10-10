import { describe, expect, it, vi } from 'vitest';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { env } from '@/shared/config';
import {
  getFirebaseApp,
  firebaseApp,
  auth,
  firestore,
  firebaseAI,
  getFirebaseAI,
  getAppCheck,
} from '../firebase';

vi.mock('firebase/app-check', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/app-check')>();
  return {
    ...actual,
    initializeAppCheck: vi.fn(actual.initializeAppCheck),
    ReCaptchaEnterpriseProvider: vi.fn(function (siteKey: string) {
      return new actual.ReCaptchaEnterpriseProvider(siteKey);
    }),
  };
});

describe('firebase client', () => {
  it('inicializa instancias compartilhadas de app, auth, firestore e ai', () => {
    expect(firebaseApp).toBeDefined();
    expect(auth).toBeDefined();
    expect(firestore).toBeDefined();
    expect(firebaseAI).toBeDefined();
    expect(getFirebaseApp()).toBe(firebaseApp);
    expect(getFirebaseAI()).toBeDefined();
  });

  it('obtem appCheck com seguranca no ambiente', () => {
    const checkInstance = getAppCheck();
    // No ambiente Node/JSDOM sem chaves de produção ou já inicializado, retorna objeto ou null sem estourar exceção
    expect(checkInstance !== undefined).toBe(true);
  });

  it('usa o provedor Enterprise cadastrado para obter tokens com renovação automática', () => {
    expect(ReCaptchaEnterpriseProvider).toHaveBeenCalledWith(env.firebase.appCheckKey);
    expect(initializeAppCheck).toHaveBeenCalledWith(
      firebaseApp,
      expect.objectContaining({ isTokenAutoRefreshEnabled: true }),
    );
    const provider = vi.mocked(initializeAppCheck).mock.calls[0]?.[1].provider;
    expect(provider).toBe(vi.mocked(ReCaptchaEnterpriseProvider).mock.results[0]?.value);
  });
});
