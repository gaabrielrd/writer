import { authorize, invalid } from './adventureRestoreContracts.mjs';
// The public protocol is explicit; server-only ports must never be discovered by enumeration.
export const ADVENTURE_RESTORE_METHODS = Object.freeze([
  'startAdventureRestore',
  'resolveAdventureRestoreStart',
  'getAdventureRestore',
  'listAdventureRestores',
  'appendAdventureRestoreChunk',
  'resolveAdventureRestoreOperation',
  'cancelAdventureRestore',
  'advanceAdventureRestoreCleanup',
  'advanceAdventureRestoreIntegrity',
  'advanceAdventureRestoreValidation',
  'advanceAdventureRestoreStructure',
  'advanceAdventureRestoreResources',
  'advanceAdventureRestoreProfiles',
  'advanceAdventureRestoreHistory',
  'finalizeAdventureRestoreDraft',
  'advanceAdventureRestoreUniverse',
  'advanceAdventureRestorePersonaLibrary',
  'advanceAdventureRestoreImages',
  'advanceAdventureRestoreImageStorage',
  'advanceAdventureRestoreCounts',
  'advanceAdventureRestoreAudit',
  'advanceAdventureRestoreImageLibrary',
  'getAdventureRestoreActivationReview',
  'activateAdventureRestore',
  'retireAdventureRestoreActivation',
  'getAdventureRestoreMediaState',
  'advanceAdventureRestoreMedia',
  'getAdventureRestoreArchiveCleanup',
  'advanceAdventureRestoreArchiveCleanup',
]);
export async function invokeAdventureRestoreCallable(service, method, uid, input) {
  authorize(uid);
  if (
    !ADVENTURE_RESTORE_METHODS.includes(method) ||
    !Object.hasOwn(service, method) ||
    typeof service[method] !== 'function'
  )
    invalid('unsupported-restore-command');
  return service[method](uid, input);
}
export function setAdventureRestoreHeaders(method, request) {
  if (!ADVENTURE_RESTORE_METHODS.includes(method)) return;
  request.rawRequest?.res?.setHeader('Cache-Control', 'private, no-store');
  request.rawRequest?.res?.setHeader('Vary', 'Authorization');
}
