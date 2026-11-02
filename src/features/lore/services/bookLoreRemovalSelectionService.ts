import { bookLoreRemovalSession } from './bookLoreRemovalService';
import { bookLoreReadSession } from './bookLoreReadService';
import { reviewBookLoreRemovalSelection } from './bookLoreRemovalSelectionReview';
import {
  createRemovalSelection,
  selectionIdentity,
  type RemovalSelectionInput,
} from './bookLoreRemovalSelectionContracts';
import {
  bookLoreRemovalSelectionStore,
  listBookLoreRemovalSelections,
} from './bookLoreRemovalSelectionDb';
import { openBookLoreRemovalSelection } from './bookLoreRemovalSelectionOperation';
import { freezeLoreEditValue } from './bookLoreWritePlan';

/** Selection metadata is durable before any child can send a request. */
export function bookLoreRemovalSelectionSession(isCurrent: () => boolean = () => true) {
  const native = bookLoreRemovalSession(isCurrent),
    { actor, guard } = native;
  const environment = {
    guard,
    call: (method: string, input: unknown) => native.call(method, input),
    openMember: (identity: Parameters<typeof native.createRemoval>[0] & { uid: string }) => {
      guard();
      if (identity.uid !== actor.uid) throw Error('A seleção pertence a outra conta.');
      const { writeId, bookId, loreId, sourceToken } = identity;
      return native.createRemoval({ writeId, bookId, loreId, sourceToken });
    },
  };
  return {
    actor,
    guard,
    async createSelection(input: Omit<RemovalSelectionInput, 'uid'>) {
      guard();
      const frozen = freezeLoreEditValue(input) as Omit<RemovalSelectionInput, 'uid'>,
        pack = createRemovalSelection({ ...frozen, uid: actor.uid }),
        identity = pack.root.manifest.identity,
        store = bookLoreRemovalSelectionStore(identity, guard);
      await store.init(pack);
      guard();
      return openBookLoreRemovalSelection(identity, store, environment);
    },
    async resumeSelection(bookId: string, selectionId: string) {
      guard();
      const identity = selectionIdentity({ uid: actor.uid, bookId, selectionId }),
        store = bookLoreRemovalSelectionStore(identity, guard);
      return openBookLoreRemovalSelection(identity, store, environment);
    },
    async review(op: Awaited<ReturnType<typeof openBookLoreRemovalSelection>>) {
      guard();
      if (op.snapshot().identity.uid !== actor.uid)
        throw Error('A seleção pertence a outra conta.');
      const reader = bookLoreReadSession(isCurrent, { tokenVersion: 2 });
      if (reader.actor !== actor) throw Error('O contexto mudou. Reabra a seleção.');
      return reviewBookLoreRemovalSelection(op, reader, guard);
    },
    recoveries(after?: string, limit = 50) {
      guard();
      return listBookLoreRemovalSelections(actor.uid, guard, after, limit);
    },
  };
}
