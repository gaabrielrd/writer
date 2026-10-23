import { openBookLoreRecord, readBookLoreRecordPart } from './bookLoreStorageRead.mjs';
import { BOOK_LORE_GENERATION_FIELDS } from './bookLoreGenerationContracts.mjs';
import {
  BOOK_LORE_READ_METHODS,
  loreChanged,
  loreInvalid,
  loreReadId,
  loreReadToken,
  loreReadInteger,
  loreReadScope,
  readLoreBook,
  loreEntityToken,
  loreReadCursor,
} from './bookLoreReadContracts.mjs';
export { BOOK_LORE_READ_METHODS };
export function setBookLoreReadHeaders(method, request) {
  if (!BOOK_LORE_READ_METHODS.includes(method)) return;
  request.rawRequest?.res?.setHeader('Cache-Control', 'private, no-store');
  request.rawRequest?.res?.setHeader('Vary', 'Authorization');
}
export function createBookLoreReadService({ db }) {
  return {
    async listBookLoreRead(uid, data) {
      const c = loreReadScope(db, uid, data, ['limit', 'listToken', 'cursor']),
        limit = data.limit ?? 50;
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) loreInvalid();
      if (data.listToken != null) loreReadToken(data.listToken);
      if (data.cursor != null && data.listToken == null) loreInvalid();
      return db.runTransaction(async (tx) => {
        const book = await readLoreBook(tx, c);
        if (data.listToken != null && data.listToken !== book.listToken) loreChanged();
        const after = loreReadCursor(data.cursor, c, book);
        let query = db
          .collection(c.path + '/lore')
          .orderBy('__name__')
          .select()
          .limit(limit + 1);
        if (after !== null) query = query.startAfter(after);
        const rows = await tx.get(query),
          selected = rows.docs.slice(0, limit);
        return {
          schemaVersion: 1,
          bookId: c.bookId,
          listToken: book.listToken,
          items: selected.map((snapshot) => ({
            id: snapshot.id,
            readToken: loreEntityToken(c, book, snapshot),
          })),
          nextCursor:
            rows.docs.length > limit
              ? Buffer.from(
                  JSON.stringify({
                    schemaVersion: 1,
                    bookId: c.bookId,
                    listToken: book.listToken,
                    after: selected.at(-1).id,
                  }),
                ).toString('base64url')
              : null,
        };
      });
    },
    async getBookLoreRead(uid, data) {
      const c = loreReadScope(db, uid, data, ['id', 'readToken']),
        id = loreReadId(data.id);
      if (data.readToken !== undefined) loreReadToken(data.readToken);
      return db.runTransaction(async (tx) => {
        const book = await readLoreBook(tx, c),
          snapshot = await tx.get(db.doc(c.path + '/lore/' + id));
        if (!snapshot.exists) {
          if (data.readToken !== undefined) loreChanged();
          return null;
        }
        const token = loreEntityToken(c, book, snapshot);
        if (data.readToken !== undefined && data.readToken !== token) loreChanged();
        const opened = await openBookLoreRecord(tx, c, snapshot);
        return {
          schemaVersion: opened.storage?.schemaVersion === 2 ? 2 : 1,
          bookId: c.bookId,
          id,
          readToken: token,
          mode: opened.mode,
          base: opened.manifest,
          relations: opened.relations,
          ...(opened.fields ? { fields: opened.fields, dates: opened.dates } : {}),
        };
      });
    },
    async readBookLorePart(uid, data) {
      const c = loreReadScope(db, uid, data, [
          'id',
          'readToken',
          'section',
          'page',
          'index',
          'field',
        ]),
        id = loreReadId(data.id),
        token = loreReadToken(data.readToken),
        page = loreReadInteger(data.page),
        index = loreReadInteger(data.index);
      if (
        !['base', 'relations', 'field'].includes(data.section) ||
        (data.section === 'field'
          ? !BOOK_LORE_GENERATION_FIELDS.includes(data.field)
          : Object.hasOwn(data, 'field'))
      )
        loreInvalid();
      return db.runTransaction(async (tx) => {
        const book = await readLoreBook(tx, c),
          snapshot = await tx.get(db.doc(c.path + '/lore/' + id));
        if (!snapshot.exists || loreEntityToken(c, book, snapshot) !== token) loreChanged();
        const opened = await openBookLoreRecord(tx, c, snapshot),
          part = await readBookLoreRecordPart(tx, opened, data.section, page, index, data.field);
        return {
          schemaVersion: 1,
          bookId: c.bookId,
          id,
          readToken: token,
          section: data.section,
          ...(data.section === 'field' ? { field: data.field } : {}),
          page,
          index,
          manifest: part.manifest,
          offset: part.offset,
          count: part.count,
          chunkBase64: Buffer.from(part.bytes).toString('base64'),
        };
      });
    },
  };
}
