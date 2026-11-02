import { libraryFixture, finishImageLibrary } from './adventureRestoreImageLibraryFixture.mjs';
import { finishAudit } from './adventureRestoreAuditFixture.mjs';
import { mutation } from './adventureRestoreTransferFixture.mjs';
export async function activationFixture(bytes = null) {
  const { f, p } = await libraryFixture(bytes);
  const ready = await finishAudit(f, await finishImageLibrary(f, p));
  return { f, p: ready };
}
export async function activationRequest(f, p, operationId = 'adventure-activation-0001') {
  const review = await f.api.getAdventureRestoreActivationReview(f.uid, {
    restoreId: p.restoreId,
    jobToken: p.jobToken,
  });
  return { review, request: mutation(p, operationId, { reviewToken: review.reviewToken }) };
}
