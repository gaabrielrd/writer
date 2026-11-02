import { digest } from './sceneContracts.mjs';
import {
  born,
  bornEqual,
  inconsistent,
  restoreFail as fail,
} from './bookRestoreUploadContracts.mjs';
import { nativeRestoreToken } from './bookRestoreIntegrityRead.mjs';
import { readBookRestoreArtifact } from './bookRestoreArtifacts.mjs';
import { validateBookBackupCover } from './bookBackupCover.mjs';
import { mediaOrigin } from './bookRestoreMediaContracts.mjs';
export async function prepareBookRestorePendingMedia(tx, db, loaded) {
  const j = loaded.job,
    p = j.preparation;
  if (p.cover.kind !== 'library') return null;
  const definition = await readBookRestoreArtifact(tx, db, loaded, 'cover-definition', 'current'),
    intent = await readBookRestoreArtifact(tx, db, loaded, 'cover-storage', 'current'),
    cover = validateBookBackupCover(definition.value.cover),
    sourceProof = p.coverStorage.proof;
  if (
    cover.kind !== 'library' ||
    cover.imageId !== p.cover.imageId ||
    digest(definition.value) !== digest({ schemaVersion: 1, cover }) ||
    digest(intent.value) !==
      digest({ schemaVersion: 1, cover, state: 'prepared', storage: sourceProof, fence: null })
  )
    inconsistent();
  const imageRef = db.doc('users/' + j.ownerId + '/imageLibrary/' + cover.imageId),
    image = await tx.get(imageRef),
    value = image.data(),
    path = 'book-covers/' + j.ownerId + '/' + cover.imageId + '.png',
    expectedStorage = {
      schemaVersion: 1,
      contentHash: cover.contentHash,
      byteLength: cover.byteLength,
      proof: sourceProof,
    };
  if (!image.exists || !['preparing', 'deleted'].includes(value.state))
    fail('failed-precondition', 'media-unavailable');
  if (
    !bornEqual(image, { createTime: loaded.snapshot.updateTime }) ||
    value.id !== cover.imageId ||
    value.url !== null ||
    value.path !== path ||
    digest(value.restoreOrigin ?? null) !== digest(mediaOrigin(loaded)) ||
    digest(value.restoreStorage ?? null) !== digest(expectedStorage) ||
    !Number.isSafeInteger(value.useCount) ||
    value.useCount < 0 ||
    value.useCount > 1
  )
    inconsistent();
  const uses = await tx.get(
    db
      .collection(imageRef.path + '/uses')
      .select('bookId')
      .limit(2),
  );
  if (
    uses.docs.length !== value.useCount ||
    uses.docs.some(
      (s) =>
        s.id !== j.bookId ||
        s.data().bookId !== j.bookId ||
        !bornEqual(s, { createTime: loaded.snapshot.updateTime }),
    )
  )
    inconsistent();
  const unavailable = value.state === 'deleted';
  if (unavailable && value.useCount !== 0) inconsistent();
  const rootRef = db.doc('books/' + j.bookId),
    root = await tx.get(rootRef),
    book = root.data(),
    { bookId: ignoredBookId, ...rootOrigin } = mediaOrigin(loaded);
  if (ignoredBookId !== j.bookId) inconsistent();
  const attach = Boolean(
    !unavailable &&
    root.exists &&
    uses.docs.length === 1 &&
    book.authorId === j.ownerId &&
    !book.deleting &&
    book.coverImageId === cover.imageId &&
    book.coverUrl === null &&
    bornEqual(root, { createTime: loaded.snapshot.updateTime }) &&
    digest(book.restoreOrigin ?? null) === digest(rootOrigin),
  );
  return {
    unavailable,
    cover,
    sourceProof,
    path,
    image,
    imageRef,
    root,
    rootRef,
    attach,
    context: {
      ownerId: j.ownerId,
      restoreId: j.restoreId,
      jobToken: loaded.view.jobToken,
      imageId: cover.imageId,
      contentHash: cover.contentHash,
      byteLength: cover.byteLength,
    },
    token: digest({
      definition: nativeRestoreToken(definition.snapshot),
      intent: nativeRestoreToken(intent.snapshot),
      imageBirth: born(image),
      unavailable,
      path,
      storage: expectedStorage,
      origin: mediaOrigin(loaded),
    }),
  };
}
