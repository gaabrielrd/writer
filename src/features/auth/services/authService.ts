import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
  onAuthStateChanged,
  type User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, firestore } from '@/shared/lib';
import { createDefaultProfile, type UserProfile } from '../model/user';

interface UserDocData {
  displayName?: string | null;
  photoUrl?: string | null;
  credits?: number;
  tier?: 'free' | 'premium';
  createdAt?: number;
  updatedAt?: number;
}

export async function syncUserProfile(firebaseUser: FirebaseUser): Promise<UserProfile> {
  const userRef = doc(firestore, 'users', firebaseUser.uid);
  const snapshot = await getDoc(userRef);

  if (snapshot.exists()) {
    const data = snapshot.data() as UserDocData;
    return {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      displayName: firebaseUser.displayName ?? data.displayName ?? null,
      photoUrl: firebaseUser.photoURL ?? data.photoUrl ?? null,
      credits: typeof data.credits === 'number' ? data.credits : 100,
      tier: data.tier === 'premium' ? 'premium' : 'free',
      createdAt: typeof data.createdAt === 'number' ? data.createdAt : Date.now(),
      updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : Date.now(),
    };
  }

  const newProfile = createDefaultProfile(
    firebaseUser.uid,
    firebaseUser.email,
    firebaseUser.displayName,
    firebaseUser.photoURL,
  );

  await setDoc(userRef, newProfile);
  return newProfile;
}

export async function signInWithGoogle(): Promise<UserProfile> {
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
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
  return onAuthStateChanged(
    auth,
    (firebaseUser) => {
      void (async () => {
        if (!firebaseUser) {
          onUserChanged(null);
          return;
        }
        try {
          const profile = await syncUserProfile(firebaseUser);
          onUserChanged(profile);
        } catch (err) {
          if (onError && err instanceof Error) {
            onError(err);
          } else {
            // Fallback para perfil em memória se o Firestore falhar momentaneamente
            onUserChanged(
              createDefaultProfile(
                firebaseUser.uid,
                firebaseUser.email,
                firebaseUser.displayName,
                firebaseUser.photoURL,
              ),
            );
          }
        }
      })();
    },
    (err) => {
      if (onError) onError(err);
    },
  );
}

export async function updateCredits(uid: string, newCredits: number): Promise<void> {
  const userRef = doc(firestore, 'users', uid);
  await updateDoc(userRef, {
    credits: Math.max(0, newCredits),
    updatedAt: Date.now(),
  });
}
