import { creationCompositionFixture } from './bookLoreCreationCompositionFixture.mjs';
import { reserveAllEditUploads, editControl } from './bookLoreEditReservationFixture.mjs';
import { finishCompilation } from './bookLoreEditCompilationFixture.mjs';
export async function creationAdoptionFixture(db, options = {}) {
  const f = await creationCompositionFixture(db, options),
    ready = await finishCompilation(f, await reserveAllEditUploads(f)),
    path = 'books/' + f.bookId + '/lore/' + f.loreId,
    bookPath = 'books/' + f.bookId;
  return {
    ...f,
    ready,
    headPath: path,
    source: { seed: { uid: f.uid, bookId: f.bookId, id: f.loreId, path, bookPath } },
    adoptRequest: editControl(f, ready, 'adopt-creation-generation'),
  };
}
export const adoptCreation = (f) => f.factory().adoptBookLoreEditGeneration(f.uid, f.adoptRequest);
