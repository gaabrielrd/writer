import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithCredential,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
  onAuthStateChanged,
  type User as FirebaseUser,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  getDocFromCache,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { auth, firestore } from '@/shared/lib';
import { createDefaultProfile, PREMIUM_MONTHLY_CREDITS, type UserProfile } from '../model/user';

interface UserDocData {
  displayName?: string | null;
  photoUrl?: string | null;
  credits?: number;
  tier?: 'free' | 'premium';
  createdAt?: number;
  updatedAt?: number;
  creditsRenewedAt?: Timestamp;
}

function readProfile(firebaseUser: FirebaseUser, data: UserDocData): UserProfile {
  if (!Number.isSafeInteger(data.credits) || (data.credits ?? -1) < 0) {
    throw new Error('Não foi possível validar o saldo de créditos. Tente entrar novamente.');
  }
  return {
    uid: firebaseUser.uid,
    email: firebaseUser.email,
    displayName: firebaseUser.displayName ?? data.displayName ?? null,
    photoUrl: firebaseUser.photoURL ?? data.photoUrl ?? null,
    credits: data.credits as number,
    tier: data.tier === 'premium' ? 'premium' : 'free',
    createdAt: typeof data.createdAt === 'number' ? data.createdAt : 0,
    updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : 0,
  };
}

/** The server rules authorize the grant; the browser clock only avoids unnecessary writes. */
export function isMonthlyCreditGrantDue(data: UserDocData, now = Date.now()): boolean {
  if (data.tier !== 'premium') return false;
  if (data.creditsRenewedAt === undefined) return true;
  if (!(data.creditsRenewedAt instanceof Timestamp)) return false;
  const current = new Date(now);
  const monthStart = Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), 1);
  return data.creditsRenewedAt.toMillis() < monthStart;
}

export async function syncUserProfile(firebaseUser: FirebaseUser): Promise<UserProfile> {
  const userRef = doc(firestore, 'users', firebaseUser.uid);
  let attemptedGrant = false;
  try {
    return await runTransaction(firestore, async (transaction) => {
      const snapshot = await transaction.get(userRef);
      if (!snapshot.exists()) {
        const profile = createDefaultProfile(
          firebaseUser.uid,
          firebaseUser.email,
          firebaseUser.displayName,
          firebaseUser.photoURL,
        );
        transaction.set(userRef, profile);
        return profile;
      }

      const data = snapshot.data() as UserDocData;
      const profile = readProfile(firebaseUser, data);
      if (!isMonthlyCreditGrantDue(data)) return profile;

      const credits = profile.credits + PREMIUM_MONTHLY_CREDITS;
      if (!Number.isSafeInteger(credits)) throw new Error('Saldo de créditos inválido.');
      const updatedAt = Date.now();
      attemptedGrant = true;
      transaction.update(userRef, {
        credits,
        creditsRenewedAt: serverTimestamp(),
        updatedAt,
      });
      return { ...profile, credits, updatedAt };
    });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
    // Existing cached profiles retain offline writing access, without inventing a balance.
    // A fast browser clock may propose a grant too early; only the server can authorize it.
    if (code === 'unavailable' || (attemptedGrant && code === 'permission-denied')) {
      const existing =
        code === 'unavailable' ? await getDocFromCache(userRef) : await getDoc(userRef);
      if (existing.exists()) return readProfile(firebaseUser, existing.data());
    }
    throw error;
  }
}

export async function signInWithGoogle(): Promise<UserProfile> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const result = await signInWithPopup(auth, provider);
  return syncUserProfile(result.user);
}

export async function signInWithGoogleIdToken(idToken: string): Promise<UserProfile> {
  const credential = GoogleAuthProvider.credential(idToken);
  const result = await signInWithCredential(auth, credential);
  return syncUserProfile(result.user);
}

export async function signInWithEmail(email: string, password: string): Promise<UserProfile> {
  const result = await signInWithEmailAndPassword(auth, email, password);
  return syncUserProfile(result.user);
}

export async function signUpWithEmail(
  email: string,
  password: string,
  displayName?: string,
): Promise<UserProfile> {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName) {
    await updateProfile(result.user, { displayName });
  }
  return syncUserProfile(result.user);
}

export async function signOutUser(): Promise<void> {
  await signOut(auth);
}

export function subscribeToAuthState(
  onUserChanged: (user: UserProfile | null) => void,
  onError?: (error: Error) => void,
): () => void {
  let revision = 0;
  let unsubscribeProfile: (() => void) | undefined;
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  let activeUser: FirebaseUser | null = null;

  const reportError = (error: unknown) => {
    onError?.(error instanceof Error ? error : new Error('Falha ao carregar perfil.'));
  };

  const scheduleRefresh = (user: FirebaseUser, expectedRevision: number) => {
    if (refreshTimer) clearTimeout(refreshTimer);
    const now = new Date();
    const nextMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
    const delay = Math.min(nextMonth - now.getTime() + 1000, 2_147_000_000);
    refreshTimer = setTimeout(() => {
      void syncUserProfile(user)
        .then((profile) => {
          if (revision === expectedRevision) onUserChanged(profile);
        })
        .catch((error: unknown) => {
          if (revision === expectedRevision) reportError(error);
        })
        .finally(() => {
          if (revision === expectedRevision) scheduleRefresh(user, expectedRevision);
        });
    }, delay);
  };

  const refreshOnReturn = () => {
    const user = activeUser;
    const expectedRevision = revision;
    if (!user || document.visibilityState !== 'visible') return;
    void syncUserProfile(user)
      .then((profile) => {
        if (revision === expectedRevision) onUserChanged(profile);
      })
      .catch((error: unknown) => {
        if (revision === expectedRevision) reportError(error);
      });
  };
  document.addEventListener('visibilitychange', refreshOnReturn);

  const unsubscribeAuth = onAuthStateChanged(
    auth,
    (firebaseUser) => {
      const expectedRevision = ++revision;
      activeUser = firebaseUser;
      unsubscribeProfile?.();
      unsubscribeProfile = undefined;
      if (refreshTimer) clearTimeout(refreshTimer);
      if (!firebaseUser) {
        onUserChanged(null);
        return;
      }
      void syncUserProfile(firebaseUser)
        .then((profile) => {
          if (revision !== expectedRevision) return;
          onUserChanged(profile);
          unsubscribeProfile = onSnapshot(
            doc(firestore, 'users', firebaseUser.uid),
            (snapshot) => {
              if (revision !== expectedRevision) return;
              if (!snapshot.exists()) {
                reportError(new Error('Perfil indisponível. Tente entrar novamente.'));
                return;
              }
              try {
                onUserChanged(readProfile(firebaseUser, snapshot.data()));
              } catch (error) {
                reportError(error);
              }
            },
            (error) => {
              if (revision === expectedRevision) reportError(error);
            },
          );
          scheduleRefresh(firebaseUser, expectedRevision);
        })
        .catch((error: unknown) => {
          if (revision === expectedRevision) reportError(error);
        });
    },
    reportError,
  );

  return () => {
    revision++;
    activeUser = null;
    unsubscribeAuth();
    unsubscribeProfile?.();
    if (refreshTimer) clearTimeout(refreshTimer);
    document.removeEventListener('visibilitychange', refreshOnReturn);
  };
}
