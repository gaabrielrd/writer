import {
  readVisibilityRoot,
  readVisibilityPage,
  readVisibilityState,
  visibilityEqual,
} from './bookLoreVisibilitySelectionContracts';
import type { openBookLoreVisibilitySelection } from './bookLoreVisibilitySelectionOperation';
import type { createBookLoreReadClient } from './bookLoreReadClient';
type Operation = Awaited<ReturnType<typeof openBookLoreVisibilitySelection>>;
type Reader = Pick<ReturnType<typeof createBookLoreReadClient>, 'metadata' | 'capture'>;
export interface VisibilitySelectionReview {
  readonly manifestHash: string;
  readonly selectionId: string;
  readonly value: boolean;
  readonly mode: 'selection' | 'retry';
  readonly count: number;
  readonly members: readonly {
    readonly index: number;
    readonly loreId: string;
    readonly sourceToken: string;
    readonly name: string;
    readonly currentValue: boolean | null;
  }[];
}
/** Names and consent come from the authorized full C1 source, in RAM only. */
export async function reviewBookLoreVisibilitySelection(
  op: Operation,
  reader: Reader,
  guard: () => void,
): Promise<VisibilitySelectionReview> {
  guard();
  const before = op.snapshot(),
    identity = before.identity,
    names = [],
    retry = before.phase === 'uncertain';
  if (
    before.savePending ||
    before.cancelRequested ||
    ['complete', 'partial', 'cancelled', 'verifying', 'resolving-conflict'].includes(
      before.phase,
    ) ||
    (retry && !before.canRetry)
  )
    throw Error('Verifique o progresso antes de revisar a seleção.');
  for (let index = 0; index < Math.ceil(before.count / 50); index++) {
    const raw = await op.page(index);
    guard();
    const root = readVisibilityRoot(raw.root, identity),
      page = readVisibilityPage(raw.page, root, index);
    if (
      root.manifest.manifestHash !== before.manifestHash ||
      root.manifest.value !== before.value ||
      root.manifest.count !== before.count ||
      raw.states.length !== page.items.length ||
      root.head.cancelRequested
    )
      throw Error('A seleção mudou. Confira a recuperação.');
    for (const [offset, member] of page.items.entries()) {
      const state = readVisibilityState(raw.states[offset], root, member);
      if (state.outcome) continue;
      if (state.closing || (state.applyRequested && (!retry || member.index !== before.cursor)))
        throw Error('Verifique o pedido original antes de revisar a seleção.');
      if (retry && member.index !== before.cursor) continue;
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
          currentValue: typeof source.data.isPublic === 'boolean' ? source.data.isPublic : null,
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
  const last = await op.page(0);
  guard();
  const root = readVisibilityRoot(last.root, identity),
    after = op.snapshot();
  if (
    root.manifest.manifestHash !== before.manifestHash ||
    root.head.cancelRequested ||
    (retry && root.head.cursor !== before.cursor) ||
    !visibilityEqual(after.identity, identity) ||
    after.manifestHash !== before.manifestHash ||
    after.value !== before.value ||
    after.cancelRequested ||
    after.savePending ||
    (retry && (!after.canRetry || after.cursor !== before.cursor))
  )
    throw Error('A seleção mudou durante a revisão.');
  if (!names.length) throw Error('Não há fichas pendentes para revisar. Confira o resultado.');
  return Object.freeze({
    manifestHash: before.manifestHash,
    selectionId: identity.selectionId,
    value: before.value,
    count: before.count,
    mode: retry ? 'retry' : 'selection',
    members: Object.freeze(names),
  });
}
