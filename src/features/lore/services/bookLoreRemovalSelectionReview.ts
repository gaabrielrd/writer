import {
  readSelectionRoot,
  readSelectionPage,
  readSelectionOutcome,
  selectionEqual,
} from './bookLoreRemovalSelectionContracts';
import type { openBookLoreRemovalSelection } from './bookLoreRemovalSelectionOperation';
import type { createBookLoreReadClient } from './bookLoreReadClient';

type Operation = Awaited<ReturnType<typeof openBookLoreRemovalSelection>>;
type Reader = Pick<ReturnType<typeof createBookLoreReadClient>, 'metadata' | 'capture'>;
export interface RemovalSelectionReview {
  readonly manifestHash: string;
  readonly selectionId: string;
  readonly count: number;
  readonly members: readonly {
    readonly index: number;
    readonly loreId: string;
    readonly sourceToken: string;
    readonly name: string;
  }[];
}
/** Authorized C1 names in memory only; never promote the original token or persist prose. */
export async function reviewBookLoreRemovalSelection(
  op: Operation,
  reader: Reader,
  guard: () => void,
): Promise<RemovalSelectionReview> {
  guard();
  const snapshot = op.snapshot(),
    identity = snapshot.identity,
    names = [];
  if (
    snapshot.savePending ||
    snapshot.cancelRequested ||
    ['complete', 'partial', 'cancelled', 'verifying'].includes(snapshot.phase)
  )
    throw Error('Verifique o progresso antes de revisar a seleção.');
  for (let index = 0; index < Math.ceil(snapshot.count / 50); index++) {
    const raw = await op.page(index);
    guard();
    const root = readSelectionRoot(raw.root, identity),
      page = readSelectionPage(raw.page, root, index);
    if (
      root.manifest.manifestHash !== snapshot.manifestHash ||
      root.manifest.count !== snapshot.count ||
      raw.outcomes.length !== page.items.length ||
      root.head.cancelRequested
    )
      throw Error('A seleção mudou. Confira a recuperação.');
    for (const [offset, member] of page.items.entries()) {
      if (raw.outcomes[offset]) {
        readSelectionOutcome(raw.outcomes[offset], root, member);
        continue;
      }
      const header = await reader.metadata(identity.bookId, member.loreId);
      guard();
      if (!header || header.readToken !== member.sourceToken)
        throw Error(
          'Uma ficha mudou ou não usa a origem da seleção. Selecione e revise novamente.',
        );
      const source = await reader.capture(identity.bookId, member.loreId, member.sourceToken);
      guard();
      if (
        !source ||
        source.sourceToken !== member.sourceToken ||
        typeof source.data.name !== 'string'
      )
        throw Error('Não foi possível conferir o nome original da ficha.');
      names.push(
        Object.freeze({
          index: member.index,
          loreId: member.loreId,
          sourceToken: member.sourceToken,
          name: source.data.name,
        }),
      );
    }
  }
  for (const member of names) {
    const header = await reader.metadata(identity.bookId, member.loreId, member.sourceToken);
    guard();
    if (!header || header.readToken !== member.sourceToken)
      throw Error('Uma ficha mudou durante a revisão.');
  }
  const finalPage = await op.page(0);
  guard();
  const finalRoot = readSelectionRoot(finalPage.root, identity);
  if (finalRoot.manifest.manifestHash !== snapshot.manifestHash || finalRoot.head.cancelRequested)
    throw Error('A seleção mudou durante a revisão.');
  const current = op.snapshot();
  if (
    !selectionEqual(current.identity, identity) ||
    current.manifestHash !== snapshot.manifestHash ||
    current.cancelRequested ||
    current.savePending
  )
    throw Error('A seleção mudou durante a revisão.');
  if (!names.length) throw Error('Não há fichas pendentes para revisar. Confira o resultado.');
  return Object.freeze({
    manifestHash: snapshot.manifestHash,
    selectionId: identity.selectionId,
    count: snapshot.count,
    members: Object.freeze(names),
  });
}
