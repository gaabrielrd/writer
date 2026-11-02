import { compilationFixture, finishCompilation } from './bookLoreEditCompilationFixture.mjs';
import { editControl } from './bookLoreEditReservationFixture.mjs';
export async function adoptionFixture(db, options = {}) {
  const f = await compilationFixture(db, options),
    ready = await finishCompilation(f);
  return { ...f, ready, adoptRequest: editControl(f, ready, 'adopt-generation') };
}
export const adoptFixture = (f) => f.factory().adoptBookLoreEditGeneration(f.uid, f.adoptRequest);
export async function nextAdoptionFixture(f, options = {}) {
  const head = await f.db.runTransaction((tx) => tx.get(f.db.doc(f.source.seed.path)));
  return adoptionFixture(f.db, {
    uid: f.uid,
    bookId: f.bookId,
    loreId: f.loreId,
    editId: 'next-' + f.editId,
    ...options,
    sourceOptions: {
      existingSeed: {
        uid: f.uid,
        bookId: f.bookId,
        id: f.loreId,
        path: f.source.seed.path,
        bookPath: f.source.seed.bookPath,
        storage: head.data().payloadStorage,
      },
      ...options.sourceOptions,
    },
  });
}
