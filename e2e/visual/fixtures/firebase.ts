// A shared/lib barrel can eagerly re-export Firebase even when all feature services are fake.
// Keep that import inert. An unexpected use fails closed rather than starting an SDK.
export const firebaseApp = null;
export const auth = null;
export const firestore = null;
export const firebaseAI = null;
export const appCheck = null;

export function getFirebaseApp(): never {
  throw new Error('Firebase está desativado na prévia visual isolada.');
}

export const getFirebaseAI = getFirebaseApp;
export const getAppCheck = getFirebaseApp;
