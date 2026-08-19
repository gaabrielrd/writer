import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as firestoreModule from 'firebase/firestore';
import * as authModule from 'firebase/auth';
import {
  syncUserProfile,
  updateCredits,
  subscribeToAuthState,
  signInWithGoogle,
  signInWithEmail,
  signUpWithEmail,
  signOutUser,
} from '../services/authService';
import type { User as FirebaseUser } from 'firebase/auth';

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, collection: string, id: string) => ({ collection, id })),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  getFirestore: vi.fn(() => ({})),
}));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({})),
  GoogleAuthProvider: vi.fn(),
  signInWithPopup: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  updateProfile: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChanged: vi.fn(),
}));

describe('authService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cria novo perfil no Firestore quando usuario ainda nao existe', async () => {
    vi.mocked(firestoreModule.getDoc).mockResolvedValueOnce({
      exists: () => false,
      data: () => undefined,
    } as unknown as firestoreModule.DocumentSnapshot);

    const mockFirebaseUser = {
      uid: 'uid-456',
      email: 'novo@autor.com',
      displayName: 'Novo Autor',
      photoURL: null,
    } as FirebaseUser;

    const profile = await syncUserProfile(mockFirebaseUser);

    expect(profile.uid).toBe('uid-456');
    expect(profile.credits).toBe(100);
    expect(profile.tier).toBe('free');
    expect(firestoreModule.setDoc).toHaveBeenCalledTimes(1);
  });

  it('recupera dados existentes do Firestore quando usuario ja existe', async () => {
    vi.mocked(firestoreModule.getDoc).mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        displayName: 'Autor Existente',
        photoUrl: 'https://exemplo.com/foto.jpg',
        credits: 450,
        tier: 'premium',
        createdAt: 5000,
        updatedAt: 6000,
      }),
    } as unknown as firestoreModule.DocumentSnapshot);

    const mockFirebaseUser = {
      uid: 'uid-789',
      email: 'existente@autor.com',
      displayName: null,
      photoURL: null,
    } as FirebaseUser;

    const profile = await syncUserProfile(mockFirebaseUser);

    expect(profile.uid).toBe('uid-789');
    expect(profile.displayName).toBe('Autor Existente');
    expect(profile.credits).toBe(450);
    expect(profile.tier).toBe('premium');
    expect(firestoreModule.setDoc).not.toHaveBeenCalled();
  });

  it('executa signInWithGoogle e sincroniza o perfil retornado', async () => {
    vi.mocked(firestoreModule.getDoc).mockResolvedValueOnce({
      exists: () => false,
      data: () => undefined,
    } as unknown as firestoreModule.DocumentSnapshot);

    vi.mocked(authModule.signInWithPopup).mockResolvedValueOnce({
      user: {
        uid: 'google-uid',
        email: 'google@autor.com',
        displayName: 'Autor Google',
        photoURL: 'https://google.com/photo.jpg',
      },
    } as unknown as authModule.UserCredential);

    const profile = await signInWithGoogle();
    expect(profile.uid).toBe('google-uid');
    expect(authModule.signInWithPopup).toHaveBeenCalledTimes(1);
  });

  it('executa signInWithEmail e sincroniza o perfil', async () => {
    vi.mocked(firestoreModule.getDoc).mockResolvedValueOnce({
      exists: () => false,
      data: () => undefined,
    } as unknown as firestoreModule.DocumentSnapshot);

    vi.mocked(authModule.signInWithEmailAndPassword).mockResolvedValueOnce({
      user: {
        uid: 'email-uid',
        email: 'email@autor.com',
        displayName: 'Autor Email',
        photoURL: null,
      },
    } as unknown as authModule.UserCredential);

    const profile = await signInWithEmail('email@autor.com', 'senha123');
    expect(profile.uid).toBe('email-uid');
    expect(authModule.signInWithEmailAndPassword).toHaveBeenCalledWith(
      expect.anything(),
      'email@autor.com',
      'senha123',
    );
  });

  it('executa signUpWithEmail com atualizacao opcional de displayName', async () => {
    vi.mocked(firestoreModule.getDoc).mockResolvedValueOnce({
      exists: () => false,
      data: () => undefined,
    } as unknown as firestoreModule.DocumentSnapshot);

    const mockUser = {
      uid: 'new-uid',
      email: 'novo@autor.com',
      displayName: null,
      photoURL: null,
    };

    vi.mocked(authModule.createUserWithEmailAndPassword).mockResolvedValueOnce({
      user: mockUser,
    } as unknown as authModule.UserCredential);

    const profile = await signUpWithEmail('novo@autor.com', 'senha123', 'Nome Autor');
    expect(profile.uid).toBe('new-uid');
    expect(authModule.updateProfile).toHaveBeenCalledWith(mockUser, { displayName: 'Nome Autor' });
  });

  it('executa signOutUser', async () => {
    await signOutUser();
    expect(authModule.signOut).toHaveBeenCalledTimes(1);
  });

  it('atualiza creditos do usuario no Firestore', async () => {
    await updateCredits('uid-123', 85);

    expect(firestoreModule.updateDoc).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'users', id: 'uid-123' }),
      expect.objectContaining({ credits: 85 }),
    );
  });

  it('inscreve observador e dispara callbacks ao mudar estado', async () => {
    let capturedCallback: ((user: FirebaseUser | null) => void) | undefined;
    vi.mocked(authModule.onAuthStateChanged).mockImplementationOnce((_auth, callback) => {
      capturedCallback = callback as (user: FirebaseUser | null) => void;
      return vi.fn();
    });

    const onUserChanged = vi.fn();
    subscribeToAuthState(onUserChanged);

    expect(authModule.onAuthStateChanged).toHaveBeenCalledTimes(1);

    // Dispara com usuario nulo
    if (capturedCallback) {
      capturedCallback(null);
    }
    expect(onUserChanged).toHaveBeenCalledWith(null);

    // Dispara com usuario logado
    vi.mocked(firestoreModule.getDoc).mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ credits: 200 }),
    } as unknown as firestoreModule.DocumentSnapshot);

    if (capturedCallback) {
      capturedCallback({
        uid: 'user-sub',
        email: 'sub@autor.com',
        displayName: 'Sub Autor',
        photoURL: null,
      } as FirebaseUser);
    }

    await vi.waitFor(() => {
      expect(onUserChanged).toHaveBeenCalledWith(
        expect.objectContaining({ uid: 'user-sub', credits: 200 }),
      );
    });
  });
});
