import { authorize, invalid } from './bookRestoreUploadContracts.mjs';
export const BOOK_EDITORIAL_HISTORY_METHODS = Object.freeze([
  'listBookEditorialRestoreReviews',
  'getBookEditorialRestoreReview',
  'reviewBookEditorialRestore',
  'retireBookEditorialRestoreReview',
  'getBookEditorialRestoreReviewOperation',
  'listBookEditorialHistory',
  'getBookEditorialHistory',
  'readBookEditorialHistoryPart',
]);
export async function invokeBookEditorialHistoryCallable(service, method, uid, input) {
  authorize(uid);
  if (
    !BOOK_EDITORIAL_HISTORY_METHODS.includes(method) ||
    !Object.hasOwn(service, method) ||
    typeof service[method] !== 'function'
  )
    invalid('unsupported-editorial-history-command');
  return service[method](uid, input);
}
