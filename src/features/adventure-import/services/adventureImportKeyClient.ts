import { getToken } from 'firebase/app-check';
import { auth, appCheck } from '@/shared/lib';
import type { ImportKeyInput, ImportRecoveryKey } from '../model/adventureImport';
import { importCheck, importObject, validateImportKey } from './adventureImportContracts';
export async function getAdventureImportRecoveryKey(
  input: ImportKeyInput,
): Promise<ImportRecoveryKey> {
  const user = auth.currentUser;
  if (!user || !appCheck)
    throw new Error('Confirme sua sessão e a verificação do aplicativo para proteger a revisão.');
  const uid = user.uid;
  const idToken = await user.getIdToken();
  importCheck(auth.currentUser?.uid === uid);
  const token = await getToken(appCheck);
  importCheck(auth.currentUser?.uid === uid && token.token);
  const response = await fetch('/api/adventure-import/recovery-key', {
    method: 'POST',
    credentials: 'omit',
    cache: 'no-store',
    redirect: 'error',
    headers: {
      'Content-Type': 'text/plain;charset=UTF-8',
      Authorization: 'Bearer ' + idToken,
      'X-Firebase-AppCheck': token.token,
    },
    body: JSON.stringify(input),
  });
  importCheck(
    auth.currentUser?.uid === uid &&
      response.headers.get('content-type')?.toLowerCase().includes('application/json'),
  );
  const value: unknown = await response.json();
  importCheck(auth.currentUser?.uid === uid);
  if (!response.ok) {
    const v = value as { error: { code: string; message: string; details: { reason: string } } };
    importObject(v, ['error']);
    importObject(v.error, ['code', 'message', 'details']);
    importObject(v.error.details, ['reason']);
    throw Object.assign(
      new Error('Não foi possível autorizar a cópia protegida. Seus dados foram mantidos.'),
      { code: v.error.code, details: { reason: v.error.details.reason } },
    );
  }
  importObject(value, ['data']);
  return validateImportKey(value.data, uid, input);
}
