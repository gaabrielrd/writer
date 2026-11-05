import { openBookLoreRecord, readBookLoreRecordPart } from './bookLoreStorageRead.mjs';
import { BOOK_LORE_GENERATION_FIELDS } from './bookLoreGenerationContracts.mjs';
import { createBookLoreContextReader } from './bookLoreContextRead.mjs';
import { createBookLoreProjectionBudget } from './bookLoreTextProjection.mjs';
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
    readSummaries: async ({ tx, c }) => {
      const reader = await createBookLoreContextReader(tx, db, c.uid, c.bookId);
      const budget = createBookLoreProjectionBudget({
        bytes: 32 * 1024 * 1024,
        parts: 512,
        retainedBytes: 900000,
      });
      return async (id) => {
        const result = await reader.read(
          id,
          {
            name: null,
            category: null,
            aliases: { items: null, characters: null },
            summary: null,
          },
          budget,
        );
        if (!result.fields.name || !result.fields.category) loreChanged();
        return {
          id,
          readToken: result.sourceToken,
          name: result.fields.name.value,
          category: result.fields.category.value,
          aliases: result.fields.aliases?.value ?? [],
          summary: result.fields.summary?.value ?? '',
          isPublic: result.privacy.value === true,
          relationCount: result.relationCount,
        };
      };
    },
  });
}
/** Internal operations shared by active-book and native restore-job authorization ports. */
export function createBookLoreReadOperations({
  db,
  readBook,
  readEntity,
  readPart,
  readSummaries,
}) {
  if ([readBook, readEntity, readPart].some((value) => typeof value !== 'function')) loreInvalid();
  return {
    async listBookLoreRead(uid, data) {
      const c = loreReadScope(db, uid, data, [
          'limit',
          'listToken',
          'cursor',
          'tokenVersion',
          ...(readSummaries ? ['projection'] : []),
        ]),
        limit = data.limit ?? 50,
        tokenVersion = loreReadTokenVersion(data.tokenVersion);
      const summaries = Object.hasOwn(data, 'projection');
      if (summaries && (data.projection !== 'summary' || tokenVersion !== 2)) loreInvalid();
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
        let items;
        if (summaries) {
          const read = await readSummaries({ tx, c });
          items = [];
          for (let start = 0; start < selected.length; start += 4) {
            const batch = await Promise.allSettled(
              selected.slice(start, start + 4).map(async (snapshot) => {
                const item = await read(snapshot.id);
                if (item.readToken !== loreEntityToken(c, book, snapshot, 2)) loreChanged();
                return item;
              }),
            );
            for (const result of batch) {
              if (result.status === 'rejected') throw result.reason;
              items.push(result.value);
            }
          }
        } else
          items = await Promise.all(
            selected.map(async (snapshot) => {
              const native = await readEntity({ tx, c, book, id: snapshot.id, snapshot });
              if (!native.exists || native.id !== snapshot.id) loreChanged();
              return { id: native.id, readToken: loreEntityToken(c, book, native, tokenVersion) };
            }),
          );
        return {
          schemaVersion: summaries ? 2 : 1,
          bookId: c.bookId,
          listToken: book.listToken,
          items,
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
