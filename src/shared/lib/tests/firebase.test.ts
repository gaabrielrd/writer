import { describe, expect, it } from 'vitest';
import { getFirebaseApp, firebaseApp, auth, firestore } from '../firebase';

describe('firebase client', () => {
  it('inicializa instancias compartilhadas de app, auth e firestore', () => {
    expect(firebaseApp).toBeDefined();
    expect(auth).toBeDefined();
    expect(firestore).toBeDefined();
    expect(getFirebaseApp()).toBe(firebaseApp);
  });
});
