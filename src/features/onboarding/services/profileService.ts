import { doc, getDocFromServer, runTransaction } from 'firebase/firestore';
import { firestore } from '@/shared/lib';
import { parseProfile, type ProfileInput, type WriterProfile } from '../model/profile';
const reference = (uid: string) => doc(firestore, 'users', uid, 'preferences', 'onboarding');
export async function loadWriterProfile(uid: string): Promise<WriterProfile | null> {
  const snapshot = await getDocFromServer(reference(uid));
  return snapshot.exists() ? parseProfile(snapshot.data()) : null;
}
export async function saveWriterProfile(
  uid: string,
  expected: number,
  input: ProfileInput,
): Promise<WriterProfile> {
  const next = parseProfile({ ...input, schemaVersion: 1, revision: expected + 1 });
  return runTransaction(firestore, async (tx) => {
    const ref = reference(uid);
    const snapshot = await tx.get(ref);
    const previous = snapshot.exists() ? parseProfile(snapshot.data()) : null;
    if ((previous?.revision ?? 0) !== expected)
      throw new Error(
        'Seu perfil mudou em outra aba ou dispositivo. Recarregue o perfil antes de salvar novamente.',
      );
    tx.set(ref, next);
    return next;
  });
}
