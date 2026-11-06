import { workFail, digest, readWorkMetadata, workId } from './workProgressContracts.mjs';
import { born } from './bookRestoreUploadContracts.mjs';
import { editorialStored } from './literaryContracts.mjs';
import { composeEditorialContract } from './literaryEditorialComposition.mjs';

/** Private editorial directions, not manuscript evidence or a mutation grant. */
export async function readLoreAnalysisEditorialContext(tx, db, uid, bookId, chapterId, observed) {
  if (!uid) workFail('unauthenticated', 'Entre na sua conta.');
  const path = 'books/' + workId(bookId),
    chapterPath = path + '/chapters/' + workId(chapterId);
  const book =
    observed?.book ??
    (await readWorkMetadata(tx, db.doc(path), [
      'authorId',
      'deleting',
      'literaryContextRevision',
      'sceneRevision',
    ]));
  const chapter =
    observed?.chapter ??
    (await readWorkMetadata(tx, db.doc(chapterPath), [
      'bookId',
      'ownerId',
      'deleting',
      'contentMode',
      'assemblyRevision',
      'structureRevision',
    ]));
  const root = book.data(),
    unit = chapter.data();
  if (
    !root ||
    root.authorId !== uid ||
    root.deleting ||
    !unit ||
    unit.deleting ||
    (unit.bookId && unit.bookId !== bookId) ||
    (unit.ownerId && unit.ownerId !== uid)
  )
    workFail('permission-denied', 'Livro ou capítulo indisponível.');
  const clock = root.literaryContextRevision ?? 0;
  if (!Number.isSafeInteger(clock) || clock < 0)
    workFail('failed-precondition', 'Revisão editorial indisponível.');
  const row = await tx.get(db.doc(path + '/literaryProduction/current'));
  const state = row.exists ? editorialStored(row.data()) : null;
  const manuscriptBase =
    unit.contentMode === 'scenes'
      ? {
          mode: 'scenes',
          sceneRevision: root.sceneRevision ?? 0,
          assemblyRevision: unit.assemblyRevision ?? 0,
          structureRevision: unit.structureRevision ?? 0,
        }
      : null;
  if (
    manuscriptBase &&
    [
      manuscriptBase.sceneRevision,
      manuscriptBase.assemblyRevision,
      manuscriptBase.structureRevision,
    ].some((n) => !Number.isSafeInteger(n) || n < 0)
  )
    workFail('failed-precondition', 'A revisão nativa do capítulo precisa ser conferida.');
  const proof = {
    ...(manuscriptBase ? { manuscriptBase } : {}),
    version: 1,
    actorId: uid,
    bookId,
    chapterId,
    bookBirth: born(book),
    chapterBirth: born(chapter),
    contractBirth: state ? born(row) : null,
    revision: state?.revision ?? 0,
    contractHash: state ? digest(state.contract) : null,
    contextRevision: clock,
  };
  return {
    proof,
    snapshot: {
      version: 1,
      bookId,
      chapterId,
      scope: 'editorial-contract-only',
      wholeBook: false,
      present: state !== null,
      revision: state?.revision ?? 0,
      contextToken: digest(proof),
      instruction: state ? composeEditorialContract(state.contract).instruction : '',
    },
  };
}
