import type { BookStructureApi } from '../../../../functions/src/bookBackupStructure.mjs';

export async function callBookBackup<T>(name: string, input: unknown): Promise<T> {
  // Injected/local readers must not initialize Auth or App Check on import.
  const [{ getFunctions, httpsCallable }, { getFirebaseApp }] = await Promise.all([
    import('@/shared/api/domainCallable'),
    import('@/shared/lib'),
  ]);
  return (
    await httpsCallable<unknown, T>(getFunctions(getFirebaseApp(), 'us-central1'), name)(input)
  ).data;
}
export const bookStructureApi: BookStructureApi = {
  getSource: (input) => callBookBackup('getBookBackupSource', input),
  list: (input) => callBookBackup('listBookBackupStructure', input),
  read: (input) => callBookBackup('readBookBackupStructure', input),
};
