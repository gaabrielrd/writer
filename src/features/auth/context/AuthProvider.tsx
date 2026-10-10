import { useEffect, useState, useRef, useCallback, type ReactNode } from 'react';
import type { UserProfile } from '../model/user';
import {
  subscribeToAuthState,
  signInWithGoogle,
  signInWithGoogleIdToken,
  signInWithEmail,
  signUpWithEmail,
  signOutUser,
} from '../services/authService';
import { AuthContext } from './AuthContext';

export interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingEditorOperation, setPendingOperation] = useState(false);
  const pendingOperationRef = useRef(false);
  const setPendingEditorOperation = useCallback((pending: boolean) => {
    pendingOperationRef.current = pending;
    setPendingOperation(pending);
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToAuthState(
      (currentUser) => {
        setUser(currentUser);
        setError(null);
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, []);

  const handleSignInGoogle = useCallback(async () => {
    setError(null);
    try {
      const profile = await signInWithGoogle();
      setUser(profile);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao autenticar com Google';
      setError(msg);
      throw err;
    }
  }, []);

  const handleSignInGoogleIdToken = useCallback(async (idToken: string) => {
    setError(null);
    try {
      const profile = await signInWithGoogleIdToken(idToken);
      setUser(profile);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao autenticar com Google One Tap';
      setError(msg);
      throw err;
    }
  }, []);

  const handleSignInEmail = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      const profile = await signInWithEmail(email, password);
      setUser(profile);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao entrar com e-mail e senha';
      setError(msg);
      throw err;
    }
  }, []);

  const handleSignUpEmail = useCallback(
    async (email: string, password: string, displayName?: string) => {
      setError(null);
      try {
        const profile = await signUpWithEmail(email, password, displayName);
        setUser(profile);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Falha ao criar conta';
        setError(msg);
        throw err;
      }
    },
    [],
  );

  const handleSignOut = useCallback(async () => {
    if (pendingOperationRef.current) {
      const message = 'Aguarde a sugestão ser inserida no manuscrito antes de sair.';
      setError(message);
      throw new Error(message);
    }
    setError(null);
    try {
      await signOutUser();
      setUser(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao sair';
      setError(msg);
      throw err;
    }
  }, []);

  const updateUserCreditsState = useCallback((credits: number) => {
    if (!Number.isSafeInteger(credits) || credits < 0) return;
    setUser((prev) => (prev ? { ...prev, credits } : null));
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        signInWithGoogle: handleSignInGoogle,
        signInWithGoogleIdToken: handleSignInGoogleIdToken,
        signInWithEmail: handleSignInEmail,
        signUpWithEmail: handleSignUpEmail,
        signOut: handleSignOut,
        updateUserCreditsState,
        pendingEditorOperation,
        setPendingEditorOperation,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
