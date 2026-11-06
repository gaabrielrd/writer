import { readBookEditorialRestoreReviewState } from './bookEditorialRestoreReviewRead.mjs';
import { readBookEditorialHistoryRecord, readBookEditorialHistoryItem } from './bookEditorialHistoryRead.mjs';
import { createHash } from 'node:crypto';
import { readWorkMetadata } from './workProgressContracts.mjs';
import { authorize, integer, restoreHash, inconsistent, closed, restoreFail as fail } from './bookRestoreUploadContracts.mjs';
import { readBookEditorialHistoryOrigin, assertEditorialImmutableBefore } from './bookEditorialHistoryOrigin.mjs';
import { editorialStoredPart } from './bookRestoreEditorialBodyContracts.mjs';
import { nativeRestoreToken } from './bookRestoreIntegrityRead.mjs';
import { BOOK_EDITORIAL_HISTORY_COLLECTIONS as names } from './bookEditorialStorage.mjs';
import { BOOK_EDITORIAL_HISTORY_RECORD_FIELDS, editorialHistoryInput, editorialHistoryLimit,
  readEditorialHistoryCursor, editorialHistoryCursor, editorialHistoryView,
  editorialRestoreReviewId } from './bookEditorialHistoryContracts.mjs';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const at = (bookId, collection, id) => 'books/' + bookId + '/' + collection + '/' + id;

export function createBookEditorialHistoryService({ db, load, readOp }) {
  const dependencies = { db, load, readOp };
  const origin = (tx, uid, bookId) => readBookEditorialHistoryOrigin(tx, dependencies, uid, bookId);
  const item = (tx, uid, bookId, id) => readBookEditorialHistoryItem(tx, dependencies, uid, bookId, id);
  async function partMetadata(tx, uid, request) {
    const current = await item(tx, uid, request.bookId, request.id);
    if (current.token !== request.readToken) fail('failed-precondition', 'editorial-history-changed');
    if (request.index >= current.value.chunkCount) fail('invalid-argument', 'editorial-history-part-out-of-range');
    const ref = db.doc(at(request.bookId, names.parts, request.id + ':' + String(request.index).padStart(15, '0')));
    const metadata = await readWorkMetadata(tx, ref, ['schemaVersion', 'bodyId', 'index', 'byteLength', 'contentHash']);
    assertEditorialImmutableBefore(metadata, current.header);
    const value = metadata.data(), length = Math.min(65536, current.value.byteLength - request.index * 65536);
    closed(value, ['schemaVersion', 'bodyId', 'index', 'byteLength', 'contentHash']);
    if (value.schemaVersion !== 1 || value.bodyId !== request.id || value.index !== request.index ||
      value.byteLength !== length) inconsistent();
    restoreHash(value.contentHash);
    return { current, ref, metadata, length };
  }
  async function part(tx, uid, request) {
    const prepared = await partMetadata(tx, uid, request);
    const snapshot = await tx.get(prepared.ref);
    if (nativeRestoreToken(snapshot) !== nativeRestoreToken(prepared.metadata)) inconsistent();
    const bytes = editorialStoredPart(snapshot.data(), request.id, request.index, prepared.length);
    if (snapshot.data().contentHash !== sha(bytes)) inconsistent();
    return { current: prepared.current, snapshot, bytes };
  }
  return {
    async listBookEditorialHistory(uid, input) {
      authorize(uid); const request = editorialHistoryInput(input, ['after', 'limit']);
      const limit = editorialHistoryLimit(request.limit);
      return db.runTransaction(async tx => {
        const proof = await origin(tx, uid, request.bookId);
        const after = readEditorialHistoryCursor(request.after, request.bookId, proof.contextToken);
        let query = db.collection('books/' + request.bookId + '/' + names.records).orderBy('__name__')
          .select(...BOOK_EDITORIAL_HISTORY_RECORD_FIELDS).limit(limit);
        if (after !== null) query = query.startAfter(after);
        const page = await tx.get(query);
        const items = page.docs.map(snapshot => editorialHistoryView(readBookEditorialHistoryRecord(proof, snapshot)));
        return { schemaVersion: 1, bookId: request.bookId, items, next: items.length === limit
          ? editorialHistoryCursor(request.bookId, proof.contextToken, items.at(-1).id) : null };
      });
    },
    async getBookEditorialHistory(uid, input) {
      authorize(uid); const request = editorialHistoryInput(input, ['id']); restoreHash(request.id);
      const current = await db.runTransaction(tx => item(tx, uid, request.bookId, request.id));
      return { schemaVersion: 1, bookId: request.bookId, ...editorialHistoryView(current.value), readToken: current.token };
    },
    async readBookEditorialHistoryPart(uid, input) {
      authorize(uid); const request = editorialHistoryInput(input, ['id', 'readToken', 'index']);
      restoreHash(request.id); restoreHash(request.readToken); integer(request.index);
      const result = await db.runTransaction(tx => part(tx, uid, request));
      return { schemaVersion: 1, bookId: request.bookId, index: request.index, byteLength: result.bytes.length,
        chunkBase64: result.bytes.toString('base64'), contentHash: result.snapshot.data().contentHash,
        done: request.index + 1 === result.current.value.chunkCount };
    },
    /** Native source for consumers that must check aggregate SHA/proof before accepting content. */
    async openVerifiedBookEditorialHistory(uid, input) {
      authorize(uid); const request = editorialHistoryInput(input, ['id']); restoreHash(request.id);
      const captured = await db.runTransaction(tx => item(tx, uid, request.bookId, request.id));
      async function verify(tx) {
        if ((await item(tx, uid, request.bookId, request.id)).token !== captured.token) inconsistent();
      }
      return Object.freeze({ schemaVersion: 1, bookId: request.bookId, id: request.id,
        sourceBookId: captured.value.sourceBookId, sourceRecord: structuredClone(captured.value.sourceRecord),
        byteLength: captured.value.byteLength, chunkCount: captured.value.chunkCount,
        contentHash: captured.value.contentHash, partProofRoot: captured.value.partProofRoot,
        valueHash: captured.value.valueHash, sourceToken: captured.token, verify,
        async readPart(index) {
          integer(index);
          const result = await db.runTransaction(tx => part(tx, uid, { ...request, readToken: captured.token, index }));
          const token = nativeRestoreToken(result.snapshot);
          return { index, bytes: Buffer.from(result.bytes), partToken: token,
            contentHash: result.snapshot.data().contentHash, done: index + 1 === captured.value.chunkCount,
            async verify(tx) {
              const fresh = await partMetadata(tx, uid, { ...request, readToken: captured.token, index });
              if (nativeRestoreToken(fresh.metadata) !== token) inconsistent();
            } };
        } });
    },
    async getBookEditorialRestoreReview(uid, input) {
      authorize(uid); const request = editorialHistoryInput(input, ['id']); editorialRestoreReviewId(request.id);
      return db.runTransaction(async tx => {
        return (await readBookEditorialRestoreReviewState(tx, dependencies, uid, request, true)).view;
      });
    },
  };
}
