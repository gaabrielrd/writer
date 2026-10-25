import { BOOK_RESTORE_METHODS, authorize, invalid } from './bookRestoreUploadContracts.mjs';

// A composed restore service also contains non-serializable, server-only ports.
// Only this closed command list may cross the callable boundary.
export async function invokeBookRestoreCallable(service, method, uid, input) {
  authorize(uid);
  if (!BOOK_RESTORE_METHODS.includes(method)) invalid('unsupported-restore-command');
  if (!Object.hasOwn(service, method) || typeof service[method] !== 'function')
    invalid('unsupported-restore-command');
  return service[method](uid, input);
}
