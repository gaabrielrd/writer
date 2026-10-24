import { getFunctions, httpsCallable } from 'firebase/functions';
import { auth, getFirebaseApp } from '@/shared/lib';
import { BOOK_LORE_EDIT_CALLABLE } from '../../../../functions/src/bookLoreEditTransportMethods.mjs';
import {
  prepareBookLoreEditOperation,
  type BookLoreEditOperationInput,
} from './bookLoreEditOperation';
import type { BookLoreWriteOptions } from './bookLoreWritePayload';

/** No persistence or automatic sending: the host drives the returned operation. */
export function bookLoreEditSession(isCurrent: () => boolean = () => true) {
  const actor = auth.currentUser;
  if (!actor?.uid) throw new Error('Entre na sua conta para editar o lore.');
  const uid = actor.uid;
  const guard = () => {
    if (auth.currentUser !== actor || auth.currentUser?.uid !== actor.uid || !isCurrent())
      throw new Error('O contexto mudou. Reabra a ficha.');
  };
  const port = {
    async call(method: string, input: unknown) {
      guard();
      const result = await httpsCallable<unknown, unknown>(
        getFunctions(getFirebaseApp(), 'us-central1'),
        BOOK_LORE_EDIT_CALLABLE,
        { timeout: 130000 },
      )({ method, input });
      guard();
      return result.data;
    },
  };
  async function prepare(
    input: Omit<BookLoreEditOperationInput, 'uid'>,
    options: BookLoreWriteOptions = {},
  ) {
    const { guard: hostGuard, signal, yieldControl } = options;
    const check = () => {
      guard();
      hostGuard?.();
    };
    check();
    return prepareBookLoreEditOperation({ ...input, uid }, port, {
      signal,
      yieldControl,
      guard: check,
    });
  }
  return Object.freeze({ actor, guard, prepare });
}
