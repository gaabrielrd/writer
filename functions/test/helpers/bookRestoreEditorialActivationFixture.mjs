import {
  readyEditableEditorial,
  finishEditableEditorial,
} from './bookRestoreEditorialHeadsFixture.mjs';
import { uid } from './bookRestoreEditorialFixture.mjs';
import { legacyMutation as mutation } from './bookLegacyRestoreFixture.mjs';
export { uid };
export async function readyEditorialCensus(options = {}) {
  const f = await readyEditableEditorial({ ...options, editorialActivation: true });
  f.p = await finishEditableEditorial(f);
  for (let unit = 0; unit < 1000; unit++) {
    const state = await f
      .factory()
      .getBookRestoreEditorial(uid, { restoreId: f.id, jobToken: f.p.jobToken });
    if (state.audit?.phase === 'done') return f;
    f.p = (
      await f
        .factory()
        .advanceBookRestoreEditorialAudit(uid, mutation(f.id, f.p, f.id + '-census-' + unit))
    ).progress;
  }
  throw Error('Editorial census did not finish');
}
export async function readyEditorialActivation(options) {
  const f = await readyEditorialCensus(options);
  f.review = await f
    .factory()
    .getBookRestoreActivationReview(uid, { restoreId: f.id, jobToken: f.p.jobToken });
  f.request = { ...mutation(f.id, f.p, f.id + '-activate'), reviewToken: f.review.reviewToken };
  return f;
}
export const activateEditorial = (f) => f.factory().activateBookRestore(uid, f.request);
