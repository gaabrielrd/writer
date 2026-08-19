import { describe, expect, it } from 'vitest';
import {
  getFirebaseApp,
  firebaseApp,
  auth,
  firestore,
  firebaseAI,
  getFirebaseAI,
  getAppCheck,
} from '../firebase';

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
});
