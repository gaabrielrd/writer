import { readyAudit, finishAudit, uid } from './bookRestoreAuditFixture.mjs';
import { legacyMutation } from './bookLegacyRestoreFixture.mjs';
export { uid };
export async function readyActivation(options = {}) {
  const f = await readyAudit(options);
  f.p = await finishAudit(f);
  f.review = await f
    .factory()
    .getBookRestoreActivationReview(uid, { restoreId: f.id, jobToken: f.p.jobToken });
  f.request = {
    ...legacyMutation(f.id, f.p, f.id + '-activate'),
    reviewToken: f.review.reviewToken,
  };
  return f;
}
export const activate = (f) => f.factory().activateBookRestore(uid, f.request);
