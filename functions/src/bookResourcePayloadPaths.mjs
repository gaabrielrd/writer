import { bookContentId } from './bookBackupSchema.mjs';
import { chunkId, restoreHash } from './bookRestoreUploadContracts.mjs';
export function resourcePayloadBodyPath(bookId, bodyId) {
  bookContentId(bookId);
  restoreHash(bodyId);
  return 'books/' + bookId + '/bookResourceBodies/' + bodyId;
}
export function resourcePayloadChunkPath(bookId, bodyId, index) {
  bookContentId(bookId);
  restoreHash(bodyId);
  return 'books/' + bookId + '/bookResourceChunks/' + bodyId + ':' + chunkId(index);
}
