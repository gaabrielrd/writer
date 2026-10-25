import { getFunctions, httpsCallable } from 'firebase/functions';
import { auth, getFirebaseApp } from '@/shared/lib';
import {
  BOOK_LORE_REMOVAL_CALLABLE,
  BOOK_LORE_REMOVAL_ROUTES,
} from '../../../../functions/src/bookLoreRemovalTransportMethods.mjs';
import { createBookLoreReadClient } from './bookLoreReadClient';
import { freezeLoreEditValue } from './bookLoreWritePlan';

/** Internal Auth-bound port. The durable executor must persist wire before mutations. */
export function bookLoreRemovalSession(isCurrent: () => boolean = () => true) {
  const actor = auth.currentUser;
  if (!actor?.uid) throw new Error('Entre na sua conta para retirar o lore.');
  const guard = () => {
    if (auth.currentUser !== actor || auth.currentUser?.uid !== actor.uid || !isCurrent())
      throw new Error('O contexto mudou. Reabra a ficha.');
  };
  const rpc = async (name: string, input: unknown) => {
    guard();
    const result = await httpsCallable<unknown, unknown>(
      getFunctions(getFirebaseApp(), 'us-central1'),
      name,
      { timeout: 130000 },
    )(input);
    guard();
    return result.data;
  };
  const reader = createBookLoreReadClient(rpc, guard);
  return {
    actor,
    guard,
    metadata: reader.metadata,
    async call(method: string, input: unknown): Promise<unknown> {
      guard();
      const frozen = freezeLoreEditValue(input) as Record<string, unknown>;
      const route = BOOK_LORE_REMOVAL_ROUTES.find((r) => r.methods.includes(method));
      if (
        !route ||
        !frozen ||
        Array.isArray(frozen) ||
        typeof frozen[route.key] !== 'string' ||
        !new RegExp('^' + route.prefix + '-[a-f0-9]{64}$').test(frozen[route.key] as string)
      )
        throw new Error('Pedido de retirada de lore inválido.');
      return rpc(BOOK_LORE_REMOVAL_CALLABLE, { method, input: frozen });
    },
  };
}
