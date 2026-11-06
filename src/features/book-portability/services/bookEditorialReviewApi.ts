import type { EditorialReviewApi } from '../model/bookEditorialReview';
import { callBookBackup } from './bookStructureCallables';
import { editorialReviewPage, editorialReviewView, editorialReviewOutcome, editorialReviewResolution } from './bookEditorialReviewContracts';
export const bookEditorialReviewApi: EditorialReviewApi = {
  async list(bookId, after = null) { return editorialReviewPage(await callBookBackup('listBookEditorialRestoreReviews', { bookId, after, limit: 25 }), bookId); },
  async get(bookId, id) { return editorialReviewView(await callBookBackup('getBookEditorialRestoreReview', { bookId, id }), bookId, id); },
  async apply(wire) { return editorialReviewOutcome(await callBookBackup('reviewBookEditorialRestore', wire), wire); },
  async retire(wire) { return editorialReviewOutcome(await callBookBackup('retireBookEditorialRestoreReview', wire), wire); },
  async resolve(bookId, operationId) { return editorialReviewResolution(await callBookBackup('getBookEditorialRestoreReviewOperation', { bookId, operationId }), bookId, operationId); },
};
