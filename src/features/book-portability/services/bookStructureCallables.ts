import type { BookStructureApi } from '../../../../functions/src/bookBackupStructure.mjs';

async function call<T>(name: string, input: unknown): Promise<T> {
  // Injected/local readers must not initialize Auth or App Check on import.
  const [{ getFunctions, httpsCallable }, { getFirebaseApp }] = await Promise.all([
    import('firebase/functions'),
    import('@/shared/lib'),
  ]);
  return (
    await httpsCallable<unknown, T>(getFunctions(getFirebaseApp(), 'us-central1'), name)(input)
  ).data;
}
export const bookStructureApi: BookStructureApi = {
  getSource: (input) => call('getBookBackupSource', input),
  list: (input) => call('listBookBackupStructure', input),
  read: (input) => call('readBookBackupStructure', input),
};
