import { createHash } from 'node:crypto';
import { born } from './bookRestoreUploadContracts.mjs';
import {
  createBookLoreLogicalBudget,
  readBookLoreLogical,
  bookLoreLogicalOrigin,
} from './bookLoreLogicalRead.mjs';
import { readBookLocalLoreVersion } from './bookLoreVersion.mjs';
import { GenerationError } from './generation.mjs';
import { universeDocumentId } from './universes.mjs';
import { readBookChapterText } from './bookChapterText.mjs';
import { readLoreAnalysisEditorialContext } from './loreAnalysisEditorialContext.mjs';
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail = (code, message) => {
  throw new GenerationError(code, message);
};
export async function readLoreAnalysisContext(tx, db, uid, bookId, chapterId) {
  const bookRef = db.doc(`books/${universeDocumentId(bookId)}`);
  const chapterRef = db.doc(`${bookRef.path}/chapters/${universeDocumentId(chapterId)}`);
  const [bookDoc, chapter] = await Promise.all([tx.get(bookRef), tx.get(chapterRef)]);
  const book = bookDoc.data();
  if (!book || book.authorId !== uid || book.deleting || !chapter.exists || chapter.data().deleting)
    fail('permission-denied', 'Livro ou capítulo indisponível.');
  const localLoreVersion = readBookLocalLoreVersion(book);
  const editorial = await readLoreAnalysisEditorialContext(tx, db, uid, bookId, chapterId, {
    book: bookDoc,
    chapter,
  });
  const worldRef = book.universeId
    ? db.doc(`universes/${universeDocumentId(book.universeId)}`)
    : null;
  const worldSnapshot = worldRef ? await tx.get(worldRef) : null;
  const world = worldSnapshot?.data() ?? null;
  if (worldRef && (!world || world.authorId !== uid || world.deleting))
    fail('failed-precondition', 'Universo indisponível.');
  const budget = createBookLoreLogicalBudget(),
    entities = [],
    localPayloadIds = new Set();
  const localScope = { db, uid, bookId, path: bookRef.path };
  let contextBytes = 2;
  async function append(root, scope) {
    let cursor = null;
    for (;;) {
      let q = db
        .collection(root.path + '/lore')
        .orderBy('__name__')
        .limit(16);
      if (cursor) q = q.startAfter(cursor);
      const page = await tx.get(q);
      for (const item of page.docs) {
        if (entities.length >= 500)
          fail('resource-exhausted', 'Compêndio grande demais para esta análise.');
        let data, origin;
        if (scope === 'local') {
          const logical = await readBookLoreLogical(tx, localScope, item, budget);
          data = logical.data;
          origin = logical.origin;
          if (logical.mode === 'payload') localPayloadIds.add(item.id);
        } else {
          data = item.data();
          budget.reserve({ bytes: Buffer.byteLength(JSON.stringify(data), 'utf8') });
          origin = bookLoreLogicalOrigin(item, data);
        }
        const entity = {
          id: scope === 'global' ? 'universe:' + book.universeId + ':' + item.id : item.id,
          scope,
          path: item.ref.path,
          data,
          origin,
        };
        contextBytes +=
          Buffer.byteLength(JSON.stringify(entity), 'utf8') + (entities.length ? 1 : 0);
        entities.push(entity);
        if (contextBytes > 300000)
          fail('resource-exhausted', 'Compêndio grande demais para esta análise.');
      }
      if (page.docs.length < 16) break;
      cursor = page.docs.at(-1).id;
    }
  }
  await append(bookRef, 'local');
  if (worldRef) await append(worldRef, 'global');
  entities.sort((a, b) => a.id.localeCompare(b.id));
  return {
    book,
    bookSnapshot: bookDoc,
    chapterSnapshot: chapter,
    worldSnapshot,
    bookRef,
    worldRef,
    world,
    entities,
    localPayloadIds,
    editorialContext: editorial.snapshot,
    editorialProof: editorial.proof,
    revision: hash([
      born(bookDoc),
      worldSnapshot ? born(worldSnapshot) : null,
      book.universeId ?? null,
      localLoreVersion,
      world?.loreVersion ?? 0,
      entities,
      ...(editorial.snapshot.present ||
      editorial.proof.contextRevision > 0 ||
      editorial.proof.manuscriptBase
        ? [editorial.proof]
        : []),
    ]),
    chapterHash: hash(
      chapter.data().contentMode === 'scenes'
        ? (chapter.data().content ?? '')
        : await readBookChapterText(tx, db, { uid, bookId, chapterId, chapter: chapter.data() }),
    ),
  };
}
