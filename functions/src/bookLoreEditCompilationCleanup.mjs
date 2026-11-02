import { bornEqual } from './bookRestoreUploadContracts.mjs';
import { readWorkMetadata } from './workProgressContracts.mjs';
import { loreGenerationStorage, loreGenerationRelations } from './bookLoreGenerationContracts.mjs';
import { editReservationConflict as conflict } from './bookLoreEditReservationContracts.mjs';
import {
  readCompilationAudit,
  compilationAuditRef,
  readCompilationSegment,
} from './bookLoreEditCompilationStore.mjs';
/** Called after all reserved uploads finished their own bounded cleanup. */
export async function cleanupEditCompilation(tx, l) {
  if (!l.job.compilation) return { complete: true, patch: {} };
  const c = structuredClone(l.job.compilation),
    state = await readCompilationAudit(tx, l);
  if (c.relations.copied && c.cleanupPage < c.page) {
    const bookId = l.job.context.intent.bookId,
      root = await readWorkMetadata(tx, l.c.db.doc('books/' + bookId), []),
      head = await readWorkMetadata(
        tx,
        l.c.db.doc('books/' + bookId + '/lore/' + l.job.context.intent.loreId),
        ['bookId', 'ownerId', 'universeId', 'adventureId', 'payloadStorage'],
      );
    if (root.exists && !bornEqual(root, { createTime: l.job.context.bookBirth })) conflict();
    if (head.exists) {
      const value = head.data();
      if (
        (value.bookId !== undefined && value.bookId !== bookId) ||
        (value.ownerId !== undefined && value.ownerId !== l.c.uid) ||
        Object.hasOwn(value, 'universeId') ||
        Object.hasOwn(value, 'adventureId')
      )
        conflict();
      if (Object.hasOwn(value, 'payloadStorage')) {
        const storage = loreGenerationStorage(value.payloadStorage);
        if (
          storage.generationId === l.job.generationId ||
          loreGenerationRelations(storage).generationId === l.job.generationId
        )
          return { complete: false, patch: { blockedReason: 'active-head' } };
      }
    }
    const segment = await readCompilationSegment(tx, l, c.cleanupPage);
    tx.delete(segment.snapshot.ref);
    c.cleanupPage++;
  } else c.cleanupPage = c.page;
  if (state) {
    tx.delete(compilationAuditRef(l));
    c.auditHash = null;
    c.auditIndex = 0;
  }
  return { complete: c.cleanupPage === c.page, patch: { compilation: c, blockedReason: null } };
}
