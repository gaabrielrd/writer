import { bornEqual } from './bookRestoreUploadContracts.mjs';
import { readLoreAnalysisContext } from './loreAnalysisContext.mjs';
import { assertApplicationOpening } from './loreAnalysisApplicationStore.mjs';
import { applicationConflict as conflict } from './loreAnalysisApplicationContracts.mjs';
const authorized = new WeakMap();
export const assertApplicationSourceOpening = (tx, l) => {
  if (authorized.get(l) !== tx) conflict();
};
export async function authorizeApplicationSource(tx, l, now) {
  assertApplicationOpening(tx, l);
  if (
    l.context.kind !== 'reservation' ||
    !['preparing', 'ready'].includes(l.state.phase) ||
    l.context.expiresAt <= now()
  )
    conflict();
  const c = l.context,
    analysis = await tx.get(l.c.db.doc('users/' + l.c.uid + '/loreAnalyses/' + l.c.id)),
    value = analysis.data();
  if (
    !analysis.exists ||
    !bornEqual(analysis, { createTime: c.analysisBirth }) ||
    value.state !== 'ready' ||
    value.bookId !== c.bookId ||
    value.chapterId !== c.chapterId ||
    value.provider !== c.provider ||
    value.fingerprint !== c.fingerprint ||
    value.revision !== c.sourceRevision ||
    value.textHash !== c.textHash ||
    value.expiresAt !== c.expiresAt
  )
    conflict();
  const current = await readLoreAnalysisContext(tx, l.c.db, l.c.uid, c.bookId, c.chapterId);
  if (
    !bornEqual(current.bookSnapshot, { createTime: c.bookBirth }) ||
    !bornEqual(current.chapterSnapshot, { createTime: c.chapterBirth }) ||
    (current.book.universeId ?? null) !== c.universeId ||
    (c.universeId !== null && !bornEqual(current.worldSnapshot, { createTime: c.universeBirth })) ||
    current.revision !== c.sourceRevision ||
    (current.chapterHash !== value.chapterHash && current.chapterHash !== value.contentHash)
  )
    conflict();
  // Manifest data never substitutes this live opening.
  authorized.set(l, tx);
  return current;
}
