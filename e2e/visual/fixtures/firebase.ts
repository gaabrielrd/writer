import type { Auth, User } from 'firebase/auth';
import { subscribeToAuthState } from './authService';
import { author, FIXTURE_SESSION_KEY } from './data';

// Identity instances, not network clients. Firebase's real onAuthStateChanged delegates
// to this object's method. Callback and currentUser intentionally share one instance.
const identities = new Map<string, User>();
function currentIdentity(): User | null {
  if (sessionStorage.getItem(FIXTURE_SESSION_KEY) !== 'true') return null;
  const uid =
    sessionStorage.getItem('writer.visual.account') === 'second'
      ? 'visual-second-author'
      : author.uid;
  let user = identities.get(uid);
  if (!user) {
    user = { uid, email: author.email, displayName: author.displayName } as User;
    identities.set(uid, user);
  }
  return user;
}

// A shared/lib barrel can eagerly re-export Firebase even when all feature services are fake.
// Keep that import inert. An unexpected use fails closed rather than starting an SDK.
export const firebaseApp = null;
export const auth = {
  get currentUser() {
    return currentIdentity();
  },
  onAuthStateChanged(next: ((user: User | null) => void) | { next?: (user: User | null) => void }) {
    const callback = typeof next === 'function' ? next : (user: User | null) => next.next?.(user);
    return subscribeToAuthState(() => callback(currentIdentity()));
  },
} as unknown as Auth;
export const firestore = null;
export const firebaseAI = null;
export const appCheck = null;

export function getFirebaseApp(): never {
  throw new Error('Firebase está desativado na prévia visual isolada.');
}

export const getFirebaseAI = getFirebaseApp;
export const getAppCheck = getFirebaseApp;
