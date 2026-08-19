import { createContext } from 'react';
import type { UserProfile } from '../model/user';

export interface AuthContextValue {
  user: UserProfile | null;
  loading: boolean;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  signInWithGoogleIdToken: (idToken: string) => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, displayName?: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateUserCreditsState: (credits: number) => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
