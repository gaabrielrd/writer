import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import { initializeAppCheck, ReCaptchaEnterpriseProvider, type AppCheck } from 'firebase/app-check';
import { getAI, GoogleAIBackend, type AI } from 'firebase/ai';
import { env } from '@/shared/config';

export function getFirebaseApp(): FirebaseApp {
  if (getApps().length > 0) {
    return getApp();
  }
  return initializeApp(env.firebase);
}

export const firebaseApp: FirebaseApp = getFirebaseApp();
export const auth: Auth = getAuth(firebaseApp);
// The SDK falls back to memory when IndexedDB is unavailable. Public reading uses
// server-only reads and never trusts this authoring cache for publication access.
export const firestore: Firestore = initializeFirestore(firebaseApp, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

export function getAppCheck(): AppCheck | null {
  if (typeof window === 'undefined' || !env.firebase.appCheckKey) {
    return null;
  }

  try {
    return initializeAppCheck(firebaseApp, {
      provider: new ReCaptchaEnterpriseProvider(env.firebase.appCheckKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch {
    // Initialization is synchronous; token-exchange failures cannot switch providers here.
    return null;
  }
}

export const appCheck: AppCheck | null = getAppCheck();

export function getFirebaseAI(): AI {
  return getAI(firebaseApp, { backend: new GoogleAIBackend() });
}

export const firebaseAI: AI = getFirebaseAI();
