import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirebaseApp } from '@/shared/lib';
import {
  isBlockFailureDefinitive,
  type AdventureBlockDocument,
  type AdventureBlockCountStatus,
  type AdventureBlockJob,
  type AdventureBlockMutation,
  type AdventureBlockPage,
  type AdventureBlockResource,
  type AdventureBlockVerificationProgress,
  type ArchiveAdventureBlockInput,
  type CreateAdventureBlockInput,
  type DeleteAdventureBlockInput,
  type DuplicateAdventureBlockInput,
  type MoveAdventureBlockInput,
  type UpdateAdventureBlockInput,
  type VerifyAdventureBlockCountInput,
} from '../model/adventureBlock';
async function call<T>(name: string, input: unknown): Promise<T> {
  try {
    return (
      await httpsCallable<unknown, T>(getFunctions(getFirebaseApp(), 'us-central1'), name)(input)
    ).data;
  } catch (cause) {
    if (isBlockFailureDefinitive(cause) && cause instanceof Error) throw cause;
    const code =
      typeof cause === 'object' && cause !== null && 'code' in cause
        ? String(cause.code)
        : 'functions/unavailable';
    throw Object.assign(
      new Error(
        'Não foi possível confirmar a operação. Confirme o mesmo pedido antes de continuar.',
        { cause },
      ),
      { code },
    );
  }
}
export const listAdventureBlocks = (input: {
  adventureId: string;
  sceneId: string;
  archived?: boolean;
  cursor?: string | null;
  limit?: number;
}): Promise<AdventureBlockPage> => call('listAdventureBlocks', input);
export const getAdventureBlockCountStatus = (input: {
  adventureId: string;
  sceneId: string;
}): Promise<AdventureBlockCountStatus | null> => call('getAdventureBlockCountStatus', input);
export const getAdventureBlock = (input: {
  adventureId: string;
  resource: AdventureBlockResource;
}): Promise<AdventureBlockDocument | null> => call('getAdventureBlock', input);
export const createAdventureBlock = (
  input: CreateAdventureBlockInput,
): Promise<AdventureBlockMutation> => call('createAdventureBlock', input);
export const updateAdventureBlock = (
  input: UpdateAdventureBlockInput,
): Promise<AdventureBlockMutation> => call('updateAdventureBlock', input);
export const duplicateAdventureBlock = (
  input: DuplicateAdventureBlockInput,
): Promise<AdventureBlockMutation> => call('duplicateAdventureBlock', input);
export const moveAdventureBlock = (
  input: MoveAdventureBlockInput,
): Promise<AdventureBlockMutation> => call('moveAdventureBlock', input);
export const archiveAdventureBlock = (
  input: ArchiveAdventureBlockInput,
): Promise<AdventureBlockMutation> => call('archiveAdventureBlock', input);
export const deleteAdventureBlock = (
  input: DeleteAdventureBlockInput,
): Promise<AdventureBlockJob> => call('deleteAdventureBlock', input);
export const verifyAdventureBlockCount = (
  input: VerifyAdventureBlockCountInput,
): Promise<AdventureBlockVerificationProgress> => call('verifyAdventureBlockCount', input);
