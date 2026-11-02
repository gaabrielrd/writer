import type { UserProfile } from '../../../src/features/auth/model/user';
import { author, FIXTURE_SESSION_KEY } from './data';

const subscribers = new Set<(user: UserProfile | null) => void>();

function currentUser(): UserProfile | null {
  if (sessionStorage.getItem(FIXTURE_SESSION_KEY) !== 'true') return null;
  return sessionStorage.getItem('writer.visual.account') === 'second'
    ? { ...author, uid: 'visual-second-author', displayName: 'Outro Autor de Exemplo' }
    : { ...author };
}

// A test may switch the fictional identity through this fixture boundary.
window.addEventListener('writer.visual.auth-change', () => {
  subscribers.forEach((callback) => callback(currentUser()));
});

function signIn(): Promise<UserProfile> {
  sessionStorage.setItem(FIXTURE_SESSION_KEY, 'true');
  subscribers.forEach((callback) => callback({ ...author }));
  return Promise.resolve({ ...author });
}

// Every sign-in method returns the same fictional account; no credentials leave this page.
export const signInWithGoogle = signIn;
export const signInWithGoogleIdToken = signIn;
export const signInWithEmail = signIn;
export const signUpWithEmail = signIn;

export function signOutUser(): Promise<void> {
  sessionStorage.removeItem(FIXTURE_SESSION_KEY);
  subscribers.forEach((callback) => callback(null));
  return Promise.resolve();
}

export function subscribeToAuthState(
  onUserChanged: (user: UserProfile | null) => void,
): () => void {
  subscribers.add(onUserChanged);
  queueMicrotask(() => {
    if (subscribers.has(onUserChanged)) onUserChanged(currentUser());
  });
  return () => subscribers.delete(onUserChanged);
}

export function updateCredits(uid: string, newCredits: number): Promise<void> {
  if (uid !== author.uid) throw new Error('A prévia permite somente a conta fictícia.');
  subscribers.forEach((callback) => callback({ ...author, credits: Math.max(0, newCredits) }));
  return Promise.resolve();
}
