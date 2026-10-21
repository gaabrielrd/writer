import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirebaseApp } from '@/shared/lib';
import {
  isUncertainHistoryFailure,
  type CreateWorkVersionInput,
  type DeleteWorkVersionInput,
  type RestoreWorkVersionInput,
  type RestoreWorkVersionResult,
  type VersionBodyPage,
  type VersionPage,
  type VersionResource,
  type VersionSource,
  type VersionSummary,
  type VersionTarget,
  type WorkHistoryBackupSource,
} from '../model/workHistory';
async function call<T>(name: string, input: unknown): Promise<T> {
  try {
    return (
      await httpsCallable<unknown, T>(getFunctions(getFirebaseApp(), 'us-central1'), name)(input)
    ).data;
  } catch (cause) {
    if (isUncertainHistoryFailure(cause)) {
      const code =
        typeof cause === 'object' && cause !== null && 'code' in cause
          ? String(cause.code)
          : 'functions/unavailable';
      throw Object.assign(
        new Error(
          'Não foi possível confirmar esta operação. Confirme o mesmo pedido antes de continuar.',
          { cause },
        ),
        { code },
      );
    }
    if (cause instanceof Error) throw cause;
    throw new Error('Não foi possível acessar o histórico. Tente novamente.', { cause });
  }
}
export const getWorkHistoryBackupSource = (input: {
  target: VersionTarget;
}): Promise<WorkHistoryBackupSource> => call('getWorkHistoryBackupSource', input);
export const getWorkVersionSource = (input: {
  target: VersionTarget;
  resource: VersionResource;
}): Promise<VersionSource | null> => call('getWorkVersionSource', input);
export const createWorkVersion = (
  input: CreateWorkVersionInput,
): Promise<{ version: VersionSummary }> => call('createWorkVersion', input);
export const listWorkVersions = (input: {
  target: VersionTarget;
  resource?: VersionResource;
  cursor?: string | null;
  limit?: number;
  expectedHistoryToken?: string;
}): Promise<VersionPage> => call('listWorkVersions', input);
export const readWorkVersion = (input: {
  target: VersionTarget;
  versionId: string;
  cursor?: string | null;
  limit?: number;
  expectedHistoryToken?: string;
}): Promise<VersionBodyPage> => call('readWorkVersion', input);
export const restoreWorkVersion = (
  input: RestoreWorkVersionInput,
): Promise<RestoreWorkVersionResult> => call('restoreWorkVersion', input);
export const deleteWorkVersion = (
  input: DeleteWorkVersionInput,
): Promise<{ complete: boolean; processed: number }> => call('deleteWorkVersion', input);
