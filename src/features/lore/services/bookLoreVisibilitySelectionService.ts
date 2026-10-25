import { bookLoreEditSession } from './bookLoreEditService';
import { bookLoreReadSession } from './bookLoreReadService';
import {
  createVisibilitySelection,
  visibilityIdentity,
  visibilityScope,
  type VisibilityInput,
  visibilityEqual,
} from './bookLoreVisibilitySelectionContracts';
import {
  bookLoreVisibilitySelectionStore,
  listBookLoreVisibilitySelections,
} from './bookLoreVisibilitySelectionDb';
import {
  openBookLoreVisibilitySelection,
  type VisibilitySelectionEnvironment,
} from './bookLoreVisibilitySelectionOperation';

export function bookLoreVisibilitySelectionSession(isCurrent: () => boolean = () => true) {
  const native = bookLoreEditSession(isCurrent),
    { actor, guard } = native,
    reader = bookLoreReadSession(isCurrent, { tokenVersion: 2 });
  if (reader.actor !== actor) throw Error('O contexto mudou. Reabra a seleção.');
  const environment: VisibilitySelectionEnvironment = {
    guard,
    native,
    reader,
    async openChild(entry, beforeUnit, source) {
      guard();
      const scope = visibilityScope(entry.root, entry.member);
      if (scope.uid !== actor.uid) throw Error('A seleção pertence a outra conta.');
      const preparation = await native.preparation(scope.writeId);
      guard();
      if (preparation) {
        const intent = preparation.intent;
        if (
          !visibilityEqual(
            {
              writeId: intent.writeId,
              bookId: intent.bookId,
              loreId: intent.loreId,
              sourceToken: intent.sourceToken,
              intentHash: intent.intentHash,
            },
            {
              writeId: scope.writeId,
              bookId: scope.bookId,
              loreId: scope.loreId,
              sourceToken: scope.sourceToken,
              intentHash: entry.state.intentHash,
            },
          )
        )
          throw Error('A recuperação pertence a outra intenção. Preserve a cópia.');
        return native.resumeManual(scope.writeId, { beforeUnit });
      }
      if (!source) {
        const error = new Error(
          entry.state.upload || entry.state.edit
            ? 'A cópia protegida não está neste dispositivo. Verifique o resultado ou cancele a seleção.'
            : 'Confira novamente a origem para preparar a cópia protegida.',
        );
        Object.assign(error, {
          code:
            entry.state.upload || entry.state.edit
              ? 'visibility-recovery-missing'
              : 'visibility-source-required',
        });
        throw error;
      }
      if (
        source.bookId !== scope.bookId ||
        source.id !== scope.loreId ||
        source.sourceToken !== scope.sourceToken
      )
        throw Error('A origem pertence a outra ficha.');
      return native.manual(
        {
          writeId: scope.writeId,
          source,
          changes: [{ field: 'isPublic', value: entry.root.manifest.value }],
        },
        { beforeUnit },
      );
    },
  };
  return {
    actor,
    guard,
    async createSelection(input: Omit<VisibilityInput, 'uid'>) {
      guard();
      const pack = createVisibilitySelection({ ...input, uid: actor.uid }),
        identity = pack.root.manifest.identity,
        store = bookLoreVisibilitySelectionStore(identity, guard);
      await store.init(pack);
      guard();
      return openBookLoreVisibilitySelection(identity, store, environment);
    },
    async resumeSelection(bookId: string, selectionId: string) {
      guard();
      const identity = visibilityIdentity({ uid: actor.uid, bookId, selectionId });
      return openBookLoreVisibilitySelection(
        identity,
        bookLoreVisibilitySelectionStore(identity, guard),
        environment,
      );
    },
    recoveries(after?: string, limit = 50) {
      guard();
      return listBookLoreVisibilitySelections(actor.uid, guard, after, limit);
    },
  };
}
