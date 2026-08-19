import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import {
  initializeAppCheck,
  ReCaptchaV3Provider,
  ReCaptchaEnterpriseProvider,
  type AppCheck,
} from 'firebase/app-check';
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
export const firestore: Firestore = getFirestore(firebaseApp);

export function getAppCheck(): AppCheck | null {
  if (typeof window === 'undefined' || !env.firebase.appCheckKey) {
    return null;
  }

  try {
    return initializeAppCheck(firebaseApp, {
      provider: new ReCaptchaV3Provider(env.firebase.appCheckKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch {
    try {
      return initializeAppCheck(firebaseApp, {
        provider: new ReCaptchaEnterpriseProvider(env.firebase.appCheckKey),
        isTokenAutoRefreshEnabled: true,
      });
    } catch {
      // AppCheck may be already initialized or skipped in test environment
      return null;
    }
  }
}

export const appCheck: AppCheck | null = getAppCheck();

export function getFirebaseAI(): AI {
  return getAI(firebaseApp, { backend: new GoogleAIBackend() });
}

export const firebaseAI: AI = getFirebaseAI();
