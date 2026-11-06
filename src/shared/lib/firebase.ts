import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';
import { connectStorageEmulator, getStorage } from 'firebase/storage';
import {
  initializeFirestore,
  connectFirestoreEmulator,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  CustomProvider,
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
// The SDK falls back to memory when IndexedDB is unavailable. Public reading uses
// server-only reads and never trusts this authoring cache for publication access.
export const firestore: Firestore = initializeFirestore(firebaseApp, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

// Configure the shared SDK instances before any feature starts using them.
if (env.useFirebaseEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099');
  connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
  connectStorageEmulator(getStorage(firebaseApp), '127.0.0.1', 9199);
  connectFunctionsEmulator(getFunctions(firebaseApp, 'us-central1'), '127.0.0.1', 5001);
}

export function getAppCheck(): AppCheck | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    if (env.useFirebaseEmulators) {
      // The Functions emulator decodes unsigned tokens locally. This provider is
      // unreachable in production and never contacts the App Check service.
      return initializeAppCheck(firebaseApp, {
        provider: new CustomProvider({
          getToken: () => {
            const now = Math.floor(Date.now() / 1000);
            const encode = (value: object) =>
              btoa(JSON.stringify(value)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
            return Promise.resolve({
              token: `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
                sub: env.firebase.appId,
                iat: now,
                exp: now + 3600,
                aud: ['projects/demo-writer'],
                iss: 'https://firebaseappcheck.googleapis.com/demo-writer',
              })}.`,
              expireTimeMillis: (now + 3600) * 1000,
            });
          },
        }),
        isTokenAutoRefreshEnabled: true,
      });
    }
    if (!env.firebase.appCheckKey) return null;
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
