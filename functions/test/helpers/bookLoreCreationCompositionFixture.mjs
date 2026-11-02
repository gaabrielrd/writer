import { creationFixture, seedCreationBook } from './bookLoreCreationFixture.mjs';
import { creationUploadFixture } from './bookLoreCreationUploadFixture.mjs';
import { uploadAll, sealAll } from './bookLoreFieldUploadFixture.mjs';
import { createBookLoreEditReservationService } from '../../src/bookLoreEditReservation.mjs';
import {
  editReservationIntent,
  editReservationStartHash,
  editReservationPaths,
} from '../../src/bookLoreEditReservationContracts.mjs';
export async function creationCompositionFixture(
  db,
  {
    uid = 'author',
    bookId = 'book',
    creationId = 'creation-compose-0001',
    editId = 'creation-attempt-0001',
    changes = [
      { target: { field: 'name' }, value: '\ufeffName 🌙' },
      { target: { field: 'category' }, value: 'other' },
    ],
    relations = { present: false, count: 0 },
    removals = [],
    parent = null,
  } = {},
) {
  if (!parent) {
    const root = await db.runTransaction((tx) => tx.get(db.doc('books/' + bookId)));
    if (!root.exists) await seedCreationBook(db, bookId, uid);
    parent = creationFixture(db, { uid, bookId, creationId });
  }
  const parentProgress = await parent.start(),
    loreId = parentProgress.loreId,
    uploads = [],
    fields = Object.fromEntries(removals.map((field) => [field, null]));
  for (let i = 0; i < changes.length; i++) {
    const f = await creationUploadFixture(db, {
        parent,
        uploadId: 'field-' + editId + '-' + i,
        ...changes[i],
      }),
      progress = await sealAll(f, await uploadAll(f)),
      ref = { uploadId: f.uploadId, startHash: f.startHash, jobToken: progress.jobToken };
    uploads.push({ ...f, progress, ref });
    if (f.target.field !== 'relations') fields[f.target.field] = ref;
  }
  const intent = editReservationIntent(uid, {
    bookId,
    loreId,
    editId,
    sourceToken: parentProgress.jobToken,
    creation: {
      creationId: parentProgress.creationId,
      startHash: parentProgress.startHash,
      jobToken: parentProgress.jobToken,
    },
    fields,
    relations,
  });
  return {
    db,
    uid,
    bookId,
    loreId,
    editId,
    parent,
    parentProgress,
    uploads,
    intent,
    startHash: editReservationStartHash(intent),
    c: editReservationPaths(db, uid, editId),
    factory: () => createBookLoreEditReservationService({ db, now: () => 2000 }),
  };
}
