import {
  editReservationFixture,
  reserveAllEditUploads,
  editControl,
  getEditReservation,
} from './bookLoreEditReservationFixture.mjs';
import { loadEditReservation } from '../../src/bookLoreEditReservationStore.mjs';
import { openBookLoreEditCompilation } from '../../src/bookLoreEditCompilationStore.mjs';
export async function compilationFixture(db, options = {}) {
  const f = await editReservationFixture(db, { mode: 'v1', ...options }),
    progress = await reserveAllEditUploads(f);
  return { ...f, progress };
}
export const advanceCompilation = (f, p) =>
  f.factory().advanceBookLoreEditCompilation(f.uid, editControl(f, p, 'compile-' + p.revision));
export async function finishCompilation(f, p = f.progress) {
  let current = p;
  for (let i = 0; i < 10000 && current.compilation?.phase !== 'ready'; i++)
    current = (await advanceCompilation(f, current)).progress;
  if (current.compilation?.phase !== 'ready') throw Error('Compilation did not finish');
  return current;
}
export const openCompilation = (f) =>
  f.db.runTransaction(async (tx) => {
    const l = await loadEditReservation(tx, f.c, { startHash: f.startHash });
    return openBookLoreEditCompilation(tx, l);
  });
export const compilationProgress = (f) => getEditReservation(f);
