export type UserTier = 'free' | 'premium';

export interface UserProfile {
  readonly uid: string;
  readonly email: string | null;
  readonly displayName: string | null;
  readonly photoUrl: string | null;
  readonly credits: number;
  readonly tier: UserTier;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export const INITIAL_FREE_CREDITS = 100;
export const PREMIUM_MONTHLY_CREDITS = 2000;

export function createDefaultProfile(
  uid: string,
  email: string | null = null,
  displayName: string | null = null,
  photoUrl: string | null = null,
): UserProfile {
  const now = Date.now();
  return {
    uid,
    email,
    displayName,
    photoUrl,
    credits: INITIAL_FREE_CREDITS,
    tier: 'free',
    createdAt: now,
    updatedAt: now,
  };
}
