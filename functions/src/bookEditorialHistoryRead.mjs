import { digest, readWorkMetadata } from './workProgressContracts.mjs';
import { inconsistent, bornEqual, restoreFail as fail } from './bookRestoreUploadContracts.mjs';
import { readBookEditorialHistoryOrigin, assertEditorialImmutableBefore } from './bookEditorialHistoryOrigin.mjs';
import { editorialRecordDescriptor, editorialBodyDescriptor, editorialBirth } from './bookRestoreEditorialBodyContracts.mjs';
import { nativeRestoreToken } from './bookRestoreIntegrityRead.mjs';
import { createBookRestoreRemapper } from './bookRestoreRemap.mjs';
import { BOOK_EDITORIAL_HISTORY_COLLECTIONS as names } from './bookEditorialStorage.mjs';
import { BOOK_EDITORIAL_HISTORY_RECORD_FIELDS } from './bookEditorialHistoryContracts.mjs';
const at = (bookId, collection, id) => 'books/' + bookId + '/' + collection + '/' + id;
export function readBookEditorialHistoryRecord(proof, snapshot) {
  assertEditorialImmutableBefore(snapshot, proof.seal);
  const value = editorialRecordDescriptor(snapshot.data()), j = proof.loaded.job;
  const mapper = createBookRestoreRemapper({ schemaVersion: 1, sourceBookId: proof.value.sourceBookId,
    bookId: j.bookId, jobToken: proof.loaded.view.jobToken });
  if (value.id !== snapshot.id || value.sourceBookId !== proof.value.sourceBookId ||
    value.sourceIndex >= proof.value.itemCount || mapper.editorialIdentity(value.sourceRecord) !== value.id) inconsistent();
  return value;
}
export async function readBookEditorialHistoryItem(tx, dependencies, uid, bookId, id) {
    const { db } = dependencies;
    const proof = await readBookEditorialHistoryOrigin(tx, dependencies, uid, bookId);
    const header = await readWorkMetadata(tx, db.doc(at(bookId, names.records, id)), BOOK_EDITORIAL_HISTORY_RECORD_FIELDS);
    if (!header.exists) fail('not-found', 'editorial-history-item-unavailable');
    const value = readBookEditorialHistoryRecord(proof, header);
    const body = await tx.get(db.doc(at(bookId, names.bodies, id)));
    if (!body.exists || !bornEqual(header, { createTime: body.updateTime }) ||
      editorialBirth(body) !== value.bodyBirth) inconsistent();
    const descriptor = { ...value }; delete descriptor.bodyBirth;
    editorialBodyDescriptor(body.data());
    if (digest(descriptor) !== digest(body.data())) inconsistent();
    const token = digest({ domain: 'writer-book-editorial-history-item-v1', context: proof.contextToken,
      id, header: nativeRestoreToken(header), body: nativeRestoreToken(body), hash: value.contentHash });
    return { proof, header, body, value, token };
  }
