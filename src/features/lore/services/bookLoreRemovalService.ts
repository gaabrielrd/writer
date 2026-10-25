import { getFunctions, httpsCallable } from 'firebase/functions';
import { auth, getFirebaseApp } from '@/shared/lib';
import {
  BOOK_LORE_REMOVAL_CALLABLE,
  BOOK_LORE_REMOVAL_ROUTES,
} from '../../../../functions/src/bookLoreRemovalTransportMethods.mjs';
import { createBookLoreReadClient } from './bookLoreReadClient';
import { freezeLoreEditValue } from './bookLoreWritePlan';
import { readId } from './bookLoreReadContracts';
import { removalIdentity, type LoreRemovalIdentity } from './bookLoreRemovalProtocol';
import { bookLoreRemovalStore, listBookLoreRemovals } from './bookLoreRemovalJournalDb';
import { openBookLoreRemovalOperation } from './bookLoreRemovalOperation';

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
  const port = {
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
  return {
    actor,
    guard,
    metadata: reader.metadata,
    ...port,
    async createRemoval(input: Omit<LoreRemovalIdentity, 'uid'>) {
      guard();
      const frozen = freezeLoreEditValue(input) as Omit<LoreRemovalIdentity, 'uid'>;
      const identity = removalIdentity({ ...frozen, uid: actor.uid });
      return openBookLoreRemovalOperation(
        identity,
        port,
        bookLoreRemovalStore(actor.uid, identity.writeId, guard),
        guard,
      );
    },
    async resumeRemoval(bookId: string, writeId: string) {
      guard();
      readId(bookId);
      readId(writeId);
      const store = bookLoreRemovalStore(actor.uid, writeId, guard);
      const saved = await store.read();
      guard();
      if (!saved || saved.identity.bookId !== bookId)
        throw Error('A recuperação não pertence a este livro.');
      return openBookLoreRemovalOperation(saved.identity, port, store, guard, true);
    },
    recoveries(after?: string, limit = 50) {
      guard();
      return listBookLoreRemovals(actor.uid, guard, after, limit);
    },
  };
}
