import { workId, workFail, digest, readWorkMetadata } from './workProgressContracts.mjs';
import { literaryNativeBirth } from './literarySourceOrigins.mjs';
import { normalizeLiteraryWritingManifest } from './literaryWritingProtocol.mjs';

export const LITERARY_LEGACY_CHAT_INDEX_FIELDS = Object.freeze([
  'version',
  'ownerId',
  'target',
  'resource',
  'conversationId',
  'messageId',
  'messageInstance',
  'generationAttempt',
  'scopeToken',
  'conversationToken',
  'manifest',
  'historyManifests',
  'historyState',
  'unversionedInputs',
]);
export const literaryLegacyChatIndexId = (uid, data, messageId) =>
  digest({
    domain: 'literary-legacy-chat-index-v1',
    uid: workId(uid),
    bookId: workId(data.bookId),
    chapterId: workId(data.chapterId),
    conversationId: workId(data.conversationId),
    messageId: workId(messageId),
  });
export const literaryLegacyChatConversationPath = (uid, data) =>
  'users/' +
  workId(uid) +
  '/chapterChats/' +
  workId(data.bookId) +
  '/chapters/' +
  workId(data.chapterId) +
  '/conversations/' +
  workId(data.conversationId);
export async function readLiteraryLegacyChatOrigin(
  tx,
  db,
  uid,
  data,
  { conversation = null } = {},
) {
  const book = await readWorkMetadata(tx, db.doc('books/' + workId(data.bookId)), [
      'authorId',
      'deleting',
    ]),
    chapter = await readWorkMetadata(
      tx,
      db.doc('books/' + data.bookId + '/chapters/' + workId(data.chapterId)),
      ['bookId', 'deleting'],
    ),
    parent =
      conversation ??
      (await readWorkMetadata(tx, db.doc(literaryLegacyChatConversationPath(uid, data)), [
        'busy',
        'deleting',
      ]));
  if (!book.exists || book.data().authorId !== uid || book.data().deleting)
    workFail('permission-denied', 'Livro indisponível.');
  if (
    !chapter.exists ||
    chapter.data().deleting ||
    (chapter.data().bookId != null && chapter.data().bookId !== data.bookId)
  )
    workFail('not-found', 'Capítulo indisponível.');
  if (!parent.exists) workFail('not-found', 'Conversa indisponível.');
  const scopeToken = digest({
    domain: 'legacy-chat-mutation-scope-v1',
    uid,
    bookId: data.bookId,
    chapterId: data.chapterId,
    bookBirth: literaryNativeBirth(book),
    chapterBirth: literaryNativeBirth(chapter),
  });
  return {
    scopeToken,
    conversationToken: digest({
      domain: 'legacy-chat-mutation-parent-v1',
      scopeToken,
      conversationId: data.conversationId,
      birth: literaryNativeBirth(parent),
    }),
    parent,
  };
}
export function literaryLegacyChatManifests(header, data) {
  const normalize = (value) => {
    const manifest = normalizeLiteraryWritingManifest(value);
    if (
      manifest.target.kind !== 'book' ||
      manifest.target.id !== data.bookId ||
      manifest.resource.kind !== 'chapter' ||
      manifest.resource.id !== data.chapterId
    )
      workFail('failed-precondition', 'Origem editorial de outra unidade.');
    return manifest;
  };
  const writing = header.context?.writing;
  if (writing && (writing.version !== 1 || !writing.manifest))
    workFail('failed-precondition', 'Origem editorial incompleta.');
  const manifest = writing ? normalize(writing.manifest) : null,
    seen = new Map();
  if (!Array.isArray(header.historyOrigins ?? []) || (header.historyOrigins ?? []).length > 128)
    workFail('failed-precondition', 'Origens históricas inválidas.');
  let bytes = 0;
  for (const raw of header.historyOrigins ?? []) {
    const value = normalize(raw),
      key = digest(value);
    if (!seen.has(key)) {
      bytes += Buffer.byteLength(JSON.stringify(value));
      seen.set(key, value);
    }
  }
  if (bytes > 64000) workFail('resource-exhausted', 'Origens históricas excedem o orçamento.');
  return { manifest, historyManifests: [...seen.values()] };
}
// The native send/history transaction owns authorization and advances the book
// dependency clock. This companion write contains no prompt, answer, lore body,
// persona instructions, manuscript selection or credentials.
export async function prepareLiteraryLegacyChatIndex(
  tx,
  db,
  uid,
  data,
  header,
  { conversation = null } = {},
) {
  if (header.role !== 'assistant') workFail('failed-precondition', 'Origem de mensagem inválida.');
  const messageId = workId(header.id),
    messageInstance = workId(header.messageInstance),
    generationAttempt = workId(header.generationAttempt),
    { scopeToken, conversationToken } = await readLiteraryLegacyChatOrigin(tx, db, uid, data, {
      conversation,
    }),
    manifests = literaryLegacyChatManifests(header, data),
    ref = db.doc(
      'books/' +
        data.bookId +
        '/literaryLegacyChatMessages/' +
        literaryLegacyChatIndexId(uid, data, messageId),
    );
  const next = {
    version: 1,
    ownerId: uid,
    target: { kind: 'book', id: data.bookId },
    resource: { kind: 'chapter', id: data.chapterId },
    conversationId: data.conversationId,
    messageId,
    messageInstance,
    generationAttempt,
    scopeToken,
    conversationToken,
    ...manifests,
    historyState: header.history === undefined ? 'pending' : 'captured',
    // Legacy context outside the canonical manifest is supplied by the client.
    // It cannot certify native lore/persona versions or a complete prose read.
    unversionedInputs: true,
  };
  return {
    commit() {
      tx.set(ref, next);
    },
  };
}
export async function prepareLiteraryLegacyChatIndexCleanup(tx, db, uid, data, job, rows) {
  if (!Array.isArray(rows) || rows.length > 20)
    workFail('failed-precondition', 'Página de limpeza inválida.');
  const refs = [];
  for (const row of rows) {
    if (row.data().role !== 'assistant') continue;
    const ref = db.doc(
        'books/' +
          data.bookId +
          '/literaryLegacyChatMessages/' +
          literaryLegacyChatIndexId(uid, data, row.id),
      ),
      indexed = (await readWorkMetadata(tx, ref, LITERARY_LEGACY_CHAT_INDEX_FIELDS)).data(),
      native = row.data();
    if (
      indexed &&
      indexed.version === 1 &&
      indexed.ownerId === uid &&
      indexed.target?.id === data.bookId &&
      indexed.resource?.id === data.chapterId &&
      indexed.conversationId === data.conversationId &&
      indexed.messageId === row.id &&
      indexed.scopeToken === job.scopeToken &&
      (job.conversationToken === null || indexed.conversationToken === job.conversationToken) &&
      indexed.messageInstance === native.messageInstance &&
      indexed.generationAttempt === native.generationAttempt
    )
      refs.push(ref);
  }
  return {
    count: refs.length,
    commit() {
      refs.forEach((ref) => tx.delete(ref));
    },
  };
}
