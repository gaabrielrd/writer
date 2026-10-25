import { authorize } from './bookRestoreUploadContracts.mjs';
import { bookContentId } from './bookBackupSchema.mjs';
import { workClosed, workFail, readWorkMetadata, digest } from './workProgressContracts.mjs';
import { readBookLocalLoreVersion } from './bookLoreVersion.mjs';
import { bookBackupIdentity } from './bookBackupContext.mjs';
export const BOOK_LORE_READ_METHODS = Object.freeze([
  'listBookLoreRead',
  'getBookLoreRead',
  'readBookLorePart',
]);
export const loreChanged = () =>
  workFail(
    'failed-precondition',
    'O lore mudou ou está indisponível. Reabra a ficha.',
    'book-lore-changed',
  );
export const loreInvalid = () => workFail('invalid-argument', 'Leitura de lore inválida.');
export function loreReadId(value) {
  try {
    return bookContentId(value);
  } catch {
    loreInvalid();
  }
}
export function loreReadToken(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) loreInvalid();
  return value;
}
export function loreReadInteger(value) {
  if (!Number.isSafeInteger(value) || value < 0) loreInvalid();
  return value;
}
export function loreReadScope(db, uid, data, keys) {
  authorize(uid);
  workClosed(data, ['bookId', ...keys]);
  const bookId = loreReadId(data.bookId);
  return { db, uid, bookId, path: 'books/' + bookId };
}
export async function readLoreBook(tx, c) {
  const snapshot = await readWorkMetadata(tx, c.db.doc(c.path), [
      'authorId',
      'deleting',
      'localLoreVersion',
    ]),
    value = snapshot.data();
  if (!snapshot.exists || value.authorId !== c.uid) workFail('not-found', 'Livro indisponível.');
  if (Object.hasOwn(value, 'deleting') && value.deleting !== false) loreChanged();
  const identity = bookBackupIdentity(snapshot),
    version = readBookLocalLoreVersion(value),
    listToken = digest({
      schemaVersion: 1,
      domain: 'book-lore-list',
      uid: c.uid,
      bookId: c.bookId,
      birth: identity.created,
      version,
    });
  return { snapshot, version, listToken };
}
export function loreReadTokenVersion(value = 1) {
  if (value !== 1 && value !== 2) loreInvalid();
  return value;
}
export function loreEntityToken(c, book, snapshot, tokenVersion = 1) {
  const native = bookBackupIdentity(snapshot);
  if (!native) loreChanged();
  loreReadTokenVersion(tokenVersion);
  const scope = book.tokenScope === undefined ? {} : { tokenScope: loreReadToken(book.tokenScope) };
  if (tokenVersion === 2)
    return digest({
      schemaVersion: 2,
      domain: 'book-lore-read-entity',
      ...scope,
      uid: c.uid,
      bookId: c.bookId,
      bookBirth: bookBackupIdentity(book.snapshot).created,
      id: snapshot.id,
      native,
    });
  return digest({
    schemaVersion: 1,
    domain: 'book-lore-read',
    ...scope,
    uid: c.uid,
    bookId: c.bookId,
    listToken: book.listToken,
    id: snapshot.id,
    native,
  });
}
/** Compare the exact original token; never replace an expected v1 token with v2. */
export function matchesLoreEntityToken(c, book, snapshot, expected) {
  return (
    loreEntityToken(c, book, snapshot, 1) === expected ||
    loreEntityToken(c, book, snapshot, 2) === expected
  );
}
export function loreReadCursor(value, c, book, tokenVersion = 1) {
  if (value == null) return null;
  if (typeof value !== 'string' || value.length > 10000 || !/^[A-Za-z0-9_-]+$/.test(value))
    loreInvalid();
  let decoded;
  try {
    decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    loreInvalid();
  }
  workClosed(decoded, [
    'schemaVersion',
    'bookId',
    'listToken',
    'after',
    ...(tokenVersion === 2 ? ['tokenVersion'] : []),
  ]);
  if (
    Buffer.from(JSON.stringify(decoded)).toString('base64url') !== value ||
    decoded.schemaVersion !== tokenVersion ||
    (tokenVersion === 2 && decoded.tokenVersion !== 2) ||
    decoded.bookId !== c.bookId ||
    decoded.listToken !== book.listToken
  )
    loreInvalid();
  return loreReadId(decoded.after);
}
export const loreTransportManifest = (m) => ({
  schemaVersion: 1,
  contentHash: m.contentHash,
  byteLength: m.byteLength,
  chunkCount: m.chunkCount,
});
