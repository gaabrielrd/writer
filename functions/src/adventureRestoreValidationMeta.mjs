import {
  contentClosed as closed,
  contentCount as count,
  contentHash as hash,
  contentId as id,
} from './adventureContentPrimitives.mjs';
import { adventureCoreCounts } from './adventureArchiveCore.mjs';
import { ADVENTURE_STAGING_COLLECTIONS } from './adventureRestoreStagingMeta.mjs';
export const ADVENTURE_VALIDATION_COLLECTIONS = Object.freeze([
  'validationIndex',
  'validationItems',
  'validationState',
]);
export const ADVENTURE_RESTORE_CLEANUP = Object.freeze([
  'chunks',
  'integrityProofs',
  'integrityStates',
  ...ADVENTURE_VALIDATION_COLLECTIONS,
  ...ADVENTURE_STAGING_COLLECTIONS,
]);
export const ADVENTURE_VALIDATION_STATES = Object.freeze([
  'validating',
  'content-verified',
  'content-rejected',
]);
export const ADVENTURE_VALIDATION_FAILURES = Object.freeze([
  'adventure-backup-invalid-content',
  'invalid-format',
  'invalid-record',
  'incomplete-archive',
  'unsupported-version',
  'integrity-mismatch',
  'limit-exceeded',
  'invalid-package',
]);
const phases = ['frames', 'semantic', 'recheck', 'verified', 'rejected'];
const counts = (value, keys) => closed(value, keys) && keys.every((k) => count(value[k]));
const totals = [
  'parts',
  'resources',
  'lore',
  'personas',
  'versions',
  'nativeHistoryRecords',
  'historyBytes',
  'drafts',
  'draftBytes',
  'imageBindings',
  'imageAssets',
  'imageBytes',
];
const warnings = [
  'missingDates',
  'danglingLocalReferences',
  'externalReferences',
  'orphanGroups',
  'unknownOverrides',
  'historicalOnlyResources',
];
export function validAdventureValidationSummary(value) {
  return (
    closed(value, ['sourceAdventureId', 'totals', 'warnings']) &&
    id(value.sourceAdventureId) &&
    closed(value.totals, totals) &&
    totals.every((k) =>
      ['resources', 'lore', 'personas'].includes(k)
        ? counts(value.totals[k], Object.keys(adventureCoreCounts(k)))
        : count(value.totals[k]),
    ) &&
    counts(value.warnings, warnings)
  );
}
export const initialAdventureValidationMeta = () => ({
  version: 1,
  phase: 'frames',
  snapshot: null,
  stateCreated: false,
  indexEntries: 0,
  items: 0,
  frames: 0,
  recheckedChunks: 0,
  cleanedIndex: 0,
  cleanedItems: 0,
  cleanedState: 0,
  failure: null,
  reportHash: null,
  summary: null,
});
export function adventureValidationView(value) {
  return structuredClone(
    Object.fromEntries(
      ['version', 'phase', 'frames', 'items', 'recheckedChunks', 'failure', 'summary'].map((k) => [
        k,
        value[k],
      ]),
    ),
  );
}
export function validAdventureValidationView(value) {
  return (
    closed(value, [
      'version',
      'phase',
      'frames',
      'items',
      'recheckedChunks',
      'failure',
      'summary',
    ]) &&
    value.version === 1 &&
    phases.includes(value.phase) &&
    ['frames', 'items', 'recheckedChunks'].every((k) => count(value[k])) &&
    (value.phase === 'rejected'
      ? ADVENTURE_VALIDATION_FAILURES.includes(value.failure)
      : value.failure === null) &&
    (value.phase === 'verified'
      ? validAdventureValidationSummary(value.summary)
      : value.summary === null)
  );
}
export function validAdventureValidationMeta(v, job) {
  if (
    !closed(v, [
      'version',
      'phase',
      'snapshot',
      'stateCreated',
      'indexEntries',
      'items',
      'frames',
      'recheckedChunks',
      'cleanedIndex',
      'cleanedItems',
      'cleanedState',
      'failure',
      'reportHash',
      'summary',
    ]) ||
    !validAdventureValidationView(adventureValidationView(v)) ||
    typeof v.stateCreated !== 'boolean' ||
    !['indexEntries', 'cleanedIndex', 'cleanedItems', 'cleanedState'].every((k) => count(v[k])) ||
    v.cleanedIndex > v.indexEntries ||
    v.cleanedItems > v.items ||
    v.cleanedState > Number(v.stateCreated) ||
    v.recheckedChunks > job.checkedChunks ||
    (v.phase !== 'verified' && v.reportHash !== null) ||
    (v.phase === 'verified' &&
      (!hash(v.reportHash) ||
        v.recheckedChunks !== job.checkedChunks ||
        v.summary.sourceAdventureId === job.adventureId))
  )
    return false;
  if (
    v.snapshot !== null &&
    (!closed(v.snapshot, ['birthOperationId', 'operationId', 'checkpoint', 'hash']) ||
      ![v.snapshot.birthOperationId, v.snapshot.operationId].every(
        (x) => typeof x === 'string' && /^[a-zA-Z0-9-]{16,80}$/.test(x),
      ) ||
      !count(v.snapshot.checkpoint) ||
      v.snapshot.checkpoint < 1 ||
      v.snapshot.checkpoint > job.checkpoint ||
      !hash(v.snapshot.hash))
  )
    return false;
  if (
    !v.stateCreated &&
    (v.snapshot !== null || v.items || v.indexEntries || v.frames || v.recheckedChunks)
  )
    return false;
  if (v.stateCreated && (v.snapshot === null) !== (v.cleanedState === 1)) return false;
  const cancelling = ['cancelling', 'cancelled'].includes(job.state);
  if (!cancelling && (v.cleanedIndex || v.cleanedItems || v.cleanedState)) return false;
  if (
    job.state === 'cancelled' &&
    (v.cleanedIndex !== v.indexEntries ||
      v.cleanedItems !== v.items ||
      v.cleanedState !== Number(v.stateCreated))
  )
    return false;
  if (
    !cancelling &&
    (v.phase === 'verified'
      ? job.state !== 'content-verified'
      : v.phase === 'rejected'
        ? job.state !== 'content-rejected'
        : job.state !== 'validating')
  )
    return false;
  if (!['recheck', 'verified', 'rejected'].includes(v.phase) && v.recheckedChunks) return false;
  return true;
}
