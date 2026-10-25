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
  matchesLoreEntityToken,
  loreReadTokenVersion,
  loreReadCursor,
} from './bookLoreReadContracts.mjs';
export { BOOK_LORE_READ_METHODS };
export function setBookLoreReadHeaders(method, request) {
  if (!BOOK_LORE_READ_METHODS.includes(method)) return;
  request.rawRequest?.res?.setHeader('Cache-Control', 'private, no-store');
  request.rawRequest?.res?.setHeader('Vary', 'Authorization');
}
export function createBookLoreReadService({ db }) {
  return createBookLoreReadOperations({
    db,
    readBook: ({ tx, c }) => readLoreBook(tx, c),
    readEntity: ({ tx, c, id, snapshot }) => snapshot ?? tx.get(db.doc(c.path + '/lore/' + id)),
    readPart: ({ tx, opened, section, page, index, field }) =>
      readBookLoreRecordPart(tx, opened, section, page, index, field),
  });
}
/** Internal operations shared by active-book and native restore-job authorization ports. */
export function createBookLoreReadOperations({ db, readBook, readEntity, readPart }) {
  if ([readBook, readEntity, readPart].some((value) => typeof value !== 'function')) loreInvalid();
  return {
    async listBookLoreRead(uid, data) {
      const c = loreReadScope(db, uid, data, ['limit', 'listToken', 'cursor', 'tokenVersion']),
        limit = data.limit ?? 50,
        tokenVersion = loreReadTokenVersion(data.tokenVersion);
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) loreInvalid();
      if (data.listToken != null) loreReadToken(data.listToken);
      if (data.cursor != null && data.listToken == null) loreInvalid();
      return db.runTransaction(async (tx) => {
        const book = await readBook({ tx, c });
        if (data.listToken != null && data.listToken !== book.listToken) loreChanged();
        const after = loreReadCursor(data.cursor, c, book, tokenVersion);
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
          items: await Promise.all(
            selected.map(async (snapshot) => {
              const native = await readEntity({ tx, c, book, id: snapshot.id, snapshot });
              if (!native.exists || native.id !== snapshot.id) loreChanged();
              return { id: native.id, readToken: loreEntityToken(c, book, native, tokenVersion) };
            }),
          ),
          nextCursor:
            rows.docs.length > limit
              ? Buffer.from(
                  JSON.stringify({
                    schemaVersion: tokenVersion,
                    bookId: c.bookId,
                    ...(tokenVersion === 2 ? { tokenVersion } : {}),
                    listToken: book.listToken,
                    after: selected.at(-1).id,
                  }),
                ).toString('base64url')
              : null,
        };
      });
    },
    async getBookLoreRead(uid, data) {
      const c = loreReadScope(db, uid, data, ['id', 'readToken', 'tokenVersion']),
        id = loreReadId(data.id),
        tokenVersion = loreReadTokenVersion(data.tokenVersion);
      if (data.readToken !== undefined) {
        loreReadToken(data.readToken);
        if (Object.hasOwn(data, 'tokenVersion')) loreInvalid();
      }
      return db.runTransaction(async (tx) => {
        const book = await readBook({ tx, c }),
          snapshot = await readEntity({ tx, c, book, id });
        if (!snapshot.exists) {
          if (data.readToken !== undefined) loreChanged();
          return null;
        }
        if (
          data.readToken !== undefined &&
          !matchesLoreEntityToken(c, book, snapshot, data.readToken)
        )
          loreChanged();
        const token = data.readToken ?? loreEntityToken(c, book, snapshot, tokenVersion);
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
        const book = await readBook({ tx, c }),
          snapshot = await readEntity({ tx, c, book, id });
        if (!snapshot.exists || !matchesLoreEntityToken(c, book, snapshot, token)) loreChanged();
        const opened = await openBookLoreRecord(tx, c, snapshot),
          part = await readPart({
            tx,
            c,
            book,
            opened,
            section: data.section,
            page,
            index,
            field: data.field,
          });
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
