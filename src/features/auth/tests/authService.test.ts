import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import * as firestore from 'firebase/firestore';
import * as firebaseAuth from 'firebase/auth';
import type { User as FirebaseUser } from 'firebase/auth';
import {
  syncUserProfile,
  subscribeToAuthState,
  signInWithGoogle,
  signInWithGoogleIdToken,
  signInWithEmail,
  signUpWithEmail,
  signOutUser,
  isMonthlyCreditGrantDue,
} from '../services/authService';

vi.mock('@/shared/lib', () => ({ auth: {}, firestore: {} }));
vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual<typeof firestore>('firebase/firestore');
  return {
    ...actual,
    doc: vi.fn((_db, _collection, id: string) => ({ id })),
    runTransaction: vi.fn(),
    getDoc: vi.fn(),
    getDocFromCache: vi.fn(),
    onSnapshot: vi.fn(),
    serverTimestamp: vi.fn(() => 'server-time'),
  };
});
vi.mock('firebase/auth', () => {
  class Provider {
    setCustomParameters = vi.fn();
    static credential = vi.fn((token: string) => ({ token }));
  }
  return {
    GoogleAuthProvider: Provider,
    signInWithPopup: vi.fn(),
    signInWithCredential: vi.fn(),
    signInWithEmailAndPassword: vi.fn(),
    createUserWithEmailAndPassword: vi.fn(),
    updateProfile: vi.fn(),
    signOut: vi.fn(),
    onAuthStateChanged: vi.fn(),
  };
});

const user = {
  uid: 'author',
  email: 'author@example.test',
  displayName: 'Autora',
  photoURL: null,
} as FirebaseUser;
let data: Record<string, unknown> | undefined;
const set = vi.fn();
const update = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  data = { credits: 40, tier: 'free', createdAt: 1000, updatedAt: 1000 };
  vi.mocked(firestore.runTransaction).mockImplementation(async (_db, callback) =>
    callback({
      get: vi.fn(() => Promise.resolve({ exists: () => data !== undefined, data: () => data })),
      set,
      update,
    } as unknown as firestore.Transaction),
  );
  vi.mocked(firestore.onSnapshot).mockReturnValue(vi.fn());
  vi.mocked(firebaseAuth.onAuthStateChanged).mockReturnValue(vi.fn());
});

afterEach(() => {
  vi.useRealTimers();
});

describe('profile persistence', () => {
  it('creates the 100-credit free profile inside the transaction', async () => {
    data = undefined;
    const profile = await syncUserProfile(user);
    expect(profile).toMatchObject({ uid: 'author', credits: 100, tier: 'free' });
    expect(set).toHaveBeenCalledWith(expect.anything(), profile);
    expect(firestore.runTransaction).toHaveBeenCalledTimes(1);
  });
  it('recovers existing balance without overwriting it', async () => {
    data = { ...data, displayName: 'Nome salvo', photoUrl: 'photo.png', credits: 17 };
    const profile = await syncUserProfile({ ...user, displayName: null });
    expect(profile).toMatchObject({
      displayName: 'Nome salvo',
      photoUrl: 'photo.png',
      credits: 17,
    });
    expect(set).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
  it.each([-1, NaN, 0.2, undefined])(
    'rejects an invalid balance (%s) instead of inventing 100 credits',
    async (credits) => {
      data = { ...data, credits };
      await expect(syncUserProfile(user)).rejects.toThrow('validar o saldo');
      expect(set).not.toHaveBeenCalled();
    },
  );
  it('propagates persistence failure without creating a local entitlement', async () => {
    vi.mocked(firestore.runTransaction).mockRejectedValueOnce(new Error('offline'));
    await expect(syncUserProfile(user)).rejects.toThrow('offline');
  });
  it('uses only a previously persisted profile when offline; never fabricates one', async () => {
    vi.mocked(firestore.runTransaction).mockRejectedValueOnce(
      Object.assign(new Error('offline'), { code: 'unavailable' }),
    );
    vi.mocked(firestore.getDocFromCache).mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ ...data, credits: 3 }),
    } as unknown as firestore.DocumentSnapshot);
    expect((await syncUserProfile(user)).credits).toBe(3);
    expect(set).not.toHaveBeenCalled();
  });
  it('does not grant based on a fast browser clock when server rules reject it', async () => {
    data = { ...data, tier: 'premium' };
    vi.mocked(firestore.runTransaction).mockImplementationOnce(async (_db, callback) => {
      await callback({
        get: vi.fn(() => Promise.resolve({ exists: () => true, data: () => data })),
        update,
      } as unknown as firestore.Transaction);
      throw Object.assign(new Error('server month is earlier'), { code: 'permission-denied' });
    });
    vi.mocked(firestore.getDoc).mockResolvedValueOnce({
      exists: () => true,
      data: () => data,
    } as unknown as firestore.DocumentSnapshot);
    expect((await syncUserProfile(user)).credits).toBe(40);
  });
  it('grants exactly 2000 in a transaction with a server renewal timestamp', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-10T12:00:00Z'));
    data = {
      ...data,
      tier: 'premium',
      creditsRenewedAt: firestore.Timestamp.fromDate(new Date('2026-09-30T23:59:59Z')),
    };
    expect((await syncUserProfile(user)).credits).toBe(2040);
    expect(update).toHaveBeenCalledWith(expect.anything(), {
      credits: 2040,
      creditsRenewedAt: 'server-time',
      updatedAt: Date.now(),
    });
  });
  it('never renews twice in the same UTC month or in a future month', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-10T12:00:00Z'));
    for (const date of ['2026-10-01T00:00:00Z', '2027-01-01T00:00:00Z']) {
      data = {
        ...data,
        tier: 'premium',
        creditsRenewedAt: firestore.Timestamp.fromDate(new Date(date)),
      };
      expect((await syncUserProfile(user)).credits).toBe(40);
    }
    expect(update).not.toHaveBeenCalled();
  });
  it('migrates admin-managed premium profiles once; never renews free or malformed profiles', () => {
    expect(isMonthlyCreditGrantDue({ tier: 'premium' })).toBe(true);
    expect(isMonthlyCreditGrantDue({ tier: 'free' })).toBe(false);
    expect(
      isMonthlyCreditGrantDue({
        tier: 'premium',
        creditsRenewedAt: 'invalid' as unknown as firestore.Timestamp,
      }),
    ).toBe(false);
  });
});

describe('sign-in and sign-out', () => {
  it('authenticates Google popup and ID-token with profile synchronization', async () => {
    vi.mocked(firebaseAuth.signInWithPopup).mockResolvedValueOnce({
      user,
    } as firebaseAuth.UserCredential);
    vi.mocked(firebaseAuth.signInWithCredential).mockResolvedValueOnce({
      user,
    } as firebaseAuth.UserCredential);
    expect((await signInWithGoogle()).uid).toBe('author');
    expect((await signInWithGoogleIdToken('test-id-token')).credits).toBe(40);
    expect(firebaseAuth.signInWithCredential).toHaveBeenCalledWith({}, { token: 'test-id-token' });
  });
  it('authenticates and registers email, updating the requested display name', async () => {
    vi.mocked(firebaseAuth.signInWithEmailAndPassword).mockResolvedValueOnce({
      user,
    } as firebaseAuth.UserCredential);
    vi.mocked(firebaseAuth.createUserWithEmailAndPassword).mockResolvedValue({
      user,
    } as firebaseAuth.UserCredential);
    expect((await signInWithEmail('author@example.test', 'test-password')).credits).toBe(40);
    await signUpWithEmail('author@example.test', 'test-password', 'Autora');
    await signUpWithEmail('author@example.test', 'test-password');
    expect(firebaseAuth.updateProfile).toHaveBeenCalledTimes(1);
    await signOutUser();
    expect(firebaseAuth.signOut).toHaveBeenCalledOnce();
  });
});

describe('reactive auth subscription', () => {
  const authCallback = () =>
    vi.mocked(firebaseAuth.onAuthStateChanged).mock.calls[0]?.[1] as (
      user: FirebaseUser | null,
    ) => void;
  const profileCallback = () =>
    vi.mocked(firestore.onSnapshot).mock.calls[0]?.[1] as (
      snap: firestore.DocumentSnapshot,
    ) => void;
  it('subscribes to current credits and ignores callbacks after sign-out', async () => {
    const changed = vi.fn();
    const error = vi.fn();
    const unsubscribe = subscribeToAuthState(changed, error);
    authCallback()(user);
    await vi.waitFor(() =>
      expect(changed).toHaveBeenCalledWith(expect.objectContaining({ credits: 40 })),
    );
    const snapshot = profileCallback();
    snapshot({
      exists: () => true,
      data: () => ({ ...data, credits: 39 }),
    } as unknown as firestore.DocumentSnapshot);
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ credits: 39 }));
    snapshot({ exists: () => false } as firestore.DocumentSnapshot);
    expect(error).toHaveBeenCalledWith(expect.any(Error));
    authCallback()(null);
    snapshot({
      exists: () => true,
      data: () => ({ ...data, credits: 99 }),
    } as unknown as firestore.DocumentSnapshot);
    expect(changed).toHaveBeenLastCalledWith(null);
    unsubscribe();
  });
  it('rejects stale profile loads after logout and unsubscribes cleanly', async () => {
    let resolve!: (value: unknown) => void;
    vi.mocked(firestore.runTransaction).mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const changed = vi.fn();
    const unsubscribe = subscribeToAuthState(changed);
    authCallback()(user);
    authCallback()(null);
    resolve({ uid: 'author', credits: 100 });
    await Promise.resolve();
    expect(changed).toHaveBeenCalledTimes(1);
    expect(changed).toHaveBeenCalledWith(null);
    unsubscribe();
  });
  it('reports failed and invalid snapshots without a fabricated profile', async () => {
    const changed = vi.fn();
    const error = vi.fn();
    const unsubscribe = subscribeToAuthState(changed, error);
    vi.mocked(firestore.runTransaction).mockRejectedValueOnce(new Error('failed load'));
    authCallback()(user);
    await vi.waitFor(() =>
      expect(error).toHaveBeenCalledWith(expect.objectContaining({ message: 'failed load' })),
    );
    expect(changed).not.toHaveBeenCalled();
    authCallback()(user);
    await vi.waitFor(() => expect(firestore.onSnapshot).toHaveBeenCalled());
    profileCallback()({
      exists: () => true,
      data: () => ({ credits: -1 }),
    } as unknown as firestore.DocumentSnapshot);
    expect(error).toHaveBeenLastCalledWith(expect.any(Error));
    const failure = vi.mocked(firestore.onSnapshot).mock.calls[0]?.[2] as unknown as (
      error: Error,
    ) => void;
    failure(new Error('snapshot failed'));
    expect(error).toHaveBeenLastCalledWith(expect.objectContaining({ message: 'snapshot failed' }));
    unsubscribe();
  });
  it('refreshes the profile on return and at the next UTC month', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-31T23:59:59Z'));
    const changed = vi.fn();
    const unsubscribe = subscribeToAuthState(changed);
    authCallback()(user);
    await vi.advanceTimersByTimeAsync(0);
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(2100);
    expect(vi.mocked(firestore.runTransaction).mock.calls.length).toBeGreaterThanOrEqual(2);
    unsubscribe();
  });
});
