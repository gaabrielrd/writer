import {
  bookBackupToken as token,
  bookBackupIdentity as identity,
  bookBackupChanged as changed,
  bookBackupScope,
  readBookBackupSource as source,
} from './bookBackupContext.mjs';
import { digest, workClosed, workFail, workId, workLimit } from './workProgressContracts.mjs';
import { BOOK_STRUCTURE_LIMITS, serializeBookBackupStructure } from './bookBackupStructure.mjs';
import { readBookChapterText } from './bookChapterText.mjs';

function kind(value, allowBook = false) {
  if (!(allowBook ? ['book', 'act', 'chapter'] : ['act', 'chapter']).includes(value))
    workFail('invalid-argument', 'Tipo de estrutura inválido.');
  return value;
}
export function createBookBackupReadService({ db }) {
  const scope = (uid, data, keys) => bookBackupScope(db, uid, data, keys);
  function itemToken(context, sourceToken, type, snapshot) {
    return digest({
      version: 1,
      uid: context.uid,
      bookId: context.target.id,
      sourceToken,
      kind: type,
      id: snapshot.id,
      native: identity(snapshot),
    });
  }
  function cursor(value, context, type, sourceToken) {
    if (value == null) return null;
    let parsed;
    if (typeof value !== 'string' || value.length > 16000 || !/^[A-Za-z0-9_-]+$/.test(value))
      workFail('invalid-argument', 'Página inválida.');
    try {
      parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    } catch {
      workFail('invalid-argument', 'Página inválida.');
    }
    workClosed(parsed, ['version', 'bookId', 'kind', 'sourceToken', 'id']);
    if (
      Buffer.from(JSON.stringify(parsed)).toString('base64url') !== value ||
      parsed.version !== 1 ||
      parsed.bookId !== context.target.id ||
      parsed.kind !== type ||
      parsed.sourceToken !== sourceToken
    )
      workFail('invalid-argument', 'Página de outra captura.');
    return workId(parsed.id);
  }
  return {
    async getBookBackupSource(uid, data) {
      const context = scope(uid, data, ['expectedSourceToken']),
        expected = Object.hasOwn(data, 'expectedSourceToken')
          ? token(data.expectedSourceToken)
          : undefined;
      return db.runTransaction(async (tx) => (await source(tx, context, expected)).result);
    },
    async listBookBackupStructure(uid, data) {
      const context = scope(uid, data, ['kind', 'sourceToken', 'cursor', 'limit']),
        type = kind(data.kind),
        expected = token(data.sourceToken),
        limit = workLimit(data.limit),
        after = cursor(data.cursor, context, type, expected);
      return db.runTransaction(async (tx) => {
        const current = await source(tx, context, expected);
        let query = db
          .collection(context.path + (type === 'act' ? '/acts' : '/chapters'))
          .orderBy('__name__')
          .limit(limit + 1)
          .select();
        if (after !== null) query = query.startAfter(after);
        const page = await tx.get(query),
          selected = page.docs.slice(0, limit);
        return {
          ...current.result,
          kind: type,
          items: selected.map((snapshot) => ({
            id: snapshot.id,
            itemToken: itemToken(context, expected, type, snapshot),
          })),
          nextCursor:
            page.docs.length > limit
              ? Buffer.from(
                  JSON.stringify({
                    version: 1,
                    bookId: context.target.id,
                    kind: type,
                    sourceToken: expected,
                    id: selected.at(-1).id,
                  }),
                ).toString('base64url')
              : null,
        };
      });
    },
    async readBookBackupStructure(uid, data) {
      const context = scope(uid, data, ['kind', 'sourceToken', 'id', 'itemToken', 'index']),
        type = kind(data.kind, true),
        expected = token(data.sourceToken),
        id = workId(data.id),
        expectedItem = token(data.itemToken);
      if (!Number.isSafeInteger(data.index) || data.index < 0)
        workFail('invalid-argument', 'Parte inválida.');
      if (type === 'book' && id !== context.target.id)
        workFail('invalid-argument', 'Livro inválido.');
      return db.runTransaction(async (tx) => {
        const current = await source(tx, context, expected),
          snapshot =
            type === 'book'
              ? null
              : await tx.get(
                  db.doc(context.path + (type === 'act' ? '/acts/' : '/chapters/') + id),
                ),
          actualToken = snapshot ? itemToken(context, expected, type, snapshot) : expected,
          value = snapshot ? snapshot.data() : current.root;
        if (!value || actualToken !== expectedItem) changed(true);
        if (value.deleting || value.rebalancing)
          workFail('failed-precondition', 'Estrutura em alteração. Aguarde para fazer o backup.');
        let encoded;
        try {
          const logical =
            type === 'chapter' && value.contentMode !== 'scenes'
              ? {
                  ...value,
                  content: await readBookChapterText(tx, db, {
                    uid,
                    bookId: context.target.id,
                    chapterId: id,
                    chapter: value,
                  }),
                }
              : value;
          encoded = serializeBookBackupStructure(type, logical, current.control);
        } catch {
          workFail(
            'failed-precondition',
            'Dados da estrutura não podem ser representados no backup.',
          );
        }
        const chunkCount = Math.ceil(encoded.bytes.length / BOOK_STRUCTURE_LIMITS.chunkBytes);
        if (data.index >= chunkCount) workFail('invalid-argument', 'Parte fora do item.');
        const offset = data.index * BOOK_STRUCTURE_LIMITS.chunkBytes;
        return {
          ...current.result,
          kind: type,
          id,
          itemToken: actualToken,
          index: data.index,
          chunkCount,
          byteLength: encoded.bytes.length,
          contentHash: digest(encoded.json),
          chunkBase64: Buffer.from(
            encoded.bytes.subarray(offset, offset + BOOK_STRUCTURE_LIMITS.chunkBytes),
          ).toString('base64'),
        };
      });
    },
  };
}
