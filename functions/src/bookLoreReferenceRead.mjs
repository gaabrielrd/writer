import {
  loreReadScope,
  readLoreBook,
  loreReadId,
  loreEntityToken,
} from './bookLoreReadContracts.mjs';
import { openBookLoreRecord } from './bookLoreStorageRead.mjs';
import { createBookLoreContextReader } from './bookLoreContextRead.mjs';
import { createBookLoreProjectionBudget } from './bookLoreTextProjection.mjs';

// Response work only. A reference insertion does not depend on prose size.
export const createBookLoreReferenceBudget = () =>
  createBookLoreProjectionBudget({
    bytes: 32 * 1024 * 1024,
    parts: 512,
    retainedBytes: 900000,
  });
/** Private transaction-scoped reader. Origin is authorization metadata, never a text certificate. */
export async function createBookLoreReferenceReader(tx, db, uid, bookId) {
  const c = loreReadScope(db, uid, { bookId }, []),
    book = await readLoreBook(tx, c);
  let textReader;
  async function origin(id) {
    id = loreReadId(id);
    const snapshot = await tx.get(db.doc(c.path + '/lore/' + id)),
      value = snapshot.data();
    if (
      !snapshot.exists ||
      ['deleted', 'deleting', 'rebalancing'].some(
        (key) => Object.hasOwn(value, key) && value[key] !== false,
      ) ||
      (value.ownerId !== undefined && value.ownerId !== uid) ||
      (value.bookId !== undefined && value.bookId !== bookId) ||
      Object.hasOwn(value, 'universeId') ||
      Object.hasOwn(value, 'adventureId') ||
      (await tx.get(db.doc(c.path + '/bookLoreTombstones/' + id))).exists
    )
      return null;
    // C1 checks native scope, descriptor/base header and any original creation proof.
    // It does not fetch payload chunks. Inline is the existing bounded document.
    const opened = await openBookLoreRecord(tx, c, snapshot);
    return {
      snapshot,
      sourceToken: loreEntityToken(c, book, snapshot, 2),
      entity: {
        ...(Object.hasOwn(opened.value, 'updatedAt') ? { updatedAt: opened.value.updatedAt } : {}),
      },
    };
  }
  return {
    listToken: book.listToken,
    origin,
    async label(id, budget) {
      const current = await origin(id);
      if (!current) return null;
      textReader ??= await createBookLoreContextReader(tx, db, uid, bookId);
      const result = await textReader.read(id, { name: null, category: null }, budget);
      return {
        ...current,
        entity: {
          ...current.entity,
          name: result.fields.name.value,
          category: result.fields.category.value,
        },
      };
    },
  };
}
