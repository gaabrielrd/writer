import { getFunctions, httpsCallable } from 'firebase/functions';
import { auth, getFirebaseApp } from '@/shared/lib';
import { createBookLoreReadClient } from './bookLoreReadClient';

export function bookLoreReadSession(
  isCurrent: () => boolean = () => true,
  options: { tokenVersion?: 1 | 2 } = {},
) {
  const actor = auth.currentUser;
  if (!actor?.uid) throw new Error('Entre na sua conta para ler o lore.');
  const uid = actor.uid;
  const guard = () => {
    if (auth.currentUser !== actor || auth.currentUser?.uid !== uid || !isCurrent())
      throw new Error('O contexto mudou. Reabra o compêndio.');
  };
  const call = async (name: string, data: unknown) =>
    (
      await httpsCallable<unknown, unknown>(
        getFunctions(getFirebaseApp(), 'us-central1'),
        name,
      )(data)
    ).data;
  return { actor, guard, ...createBookLoreReadClient(call, guard, options) };
}
export const hasBookLorePayload = (value: object) => Object.hasOwn(value, 'payloadStorage');
