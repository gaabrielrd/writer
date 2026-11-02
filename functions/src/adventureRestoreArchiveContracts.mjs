import {
  digest,
  closed,
  inconsistent,
  integer,
  restoreId,
  restoreHash,
  mutationInput,
  nativeToken,
} from './adventureRestoreContracts.mjs';
export const ARCHIVE_ACTION = 'advanceAdventureRestoreArchiveCleanup';
export const ARCHIVE_NAMES = Object.freeze([
  'stagingArtifacts',
  'preparedRoot',
  'chunks',
  'integrityProofs',
  'integrityStates',
  'validationIndex',
  'validationItems',
  'validationState',
]);
export const ARCHIVE_PHASES = Object.freeze([
  'journals',
  'prepared-root',
  'chunks',
  'proofs',
  'integrity-states',
  'validation-index',
  'validation-items',
  'validation-state',
  'verify',
  'done',
]);
export const ARCHIVE_COUNTERS = Object.freeze([
  'journals',
  'privateArtifacts',
  'chunks',
  'bytes',
  'proofs',
  'integrityStates',
  'index',
  'items',
  'validationStates',
]);
export const archiveFingerprint = (request) => digest({ action: ARCHIVE_ACTION, ...request });
export const archiveRequest = (input, mutate = false) => {
  if (mutate) return Object.freeze(mutationInput(input));
  closed(input, ['restoreId', 'jobToken']);
  return { restoreId: restoreId(input.restoreId), jobToken: restoreHash(input.jobToken) };
};
export const archiveContext = (loaded, media) => ({
  schemaVersion: 1,
  ownerId: loaded.uid,
  restoreId: loaded.id,
  jobToken: loaded.view.jobToken,
  adventureId: loaded.job.adventureId,
  activationOperationId: loaded.job.activation.operationId,
  mediaOperationId: media.value.lastOperationId,
  mediaToken: nativeToken(media.snapshot),
  contextToken: digest({
    domain: 'adventure-source-collection-v1',
    jobToken: loaded.view.jobToken,
    job: nativeToken(loaded.snapshot),
    activation: loaded.job.activation,
    media: nativeToken(media.snapshot),
    layout: ARCHIVE_NAMES,
  }),
});
export function archiveLimits(l) {
  return {
    journals: l.job.staging.artifactCount,
    privateArtifacts: l.job.staging.artifactCount,
    chunks: l.job.uploadedChunks,
    bytes: l.job.uploadedBytes,
    proofs: l.job.checkedChunks,
    integrityStates: l.job.writtenStates,
    index: l.job.validation.indexEntries,
    items: l.job.validation.items,
    validationStates: Number(l.job.validation.stateCreated),
  };
}
export function initialArchive(l, media) {
  return {
    ...archiveContext(l, media),
    checkpoint: 0,
    phase: 'journals',
    after: null,
    removed: Object.fromEntries(ARCHIVE_COUNTERS.map((k) => [k, 0])),
    firstOperationId: null,
    lastOperationId: null,
    updatedAt: media.value.updatedAt,
    completedAt: null,
  };
}
export function validateArchive(v, l, media) {
  const context = archiveContext(l, media);
  closed(v, [
    ...Object.keys(context),
    'checkpoint',
    'phase',
    'after',
    'removed',
    'firstOperationId',
    'lastOperationId',
    'updatedAt',
    'completedAt',
  ]);
  if (Object.keys(context).some((k) => v[k] !== context[k]) || !ARCHIVE_PHASES.includes(v.phase))
    inconsistent();
  integer(v.checkpoint);
  integer(v.updatedAt);
  closed(v.removed, ARCHIVE_COUNTERS);
  const limits = archiveLimits(l);
  for (const key of ARCHIVE_COUNTERS) {
    integer(v.removed[key]);
    if (v.removed[key] > limits[key]) inconsistent();
  }
  if (
    v.removed.privateArtifacts > v.removed.journals ||
    v.removed.proofs !== v.removed.chunks ||
    v.updatedAt < media.value.updatedAt ||
    v.updatedAt > 8640000000000000
  )
    inconsistent();
  if (v.checkpoint === 0) {
    if (
      v.firstOperationId !== null ||
      v.lastOperationId !== null ||
      v.phase !== 'journals' ||
      v.after !== null ||
      ARCHIVE_COUNTERS.some((k) => v.removed[k]) ||
      v.updatedAt !== media.value.updatedAt
    )
      inconsistent();
  } else {
    restoreId(v.firstOperationId);
    restoreId(v.lastOperationId);
    if (v.updatedAt <= media.value.updatedAt) inconsistent();
  }
  if (
    v.after !== null &&
    (typeof v.after !== 'string' || v.after.length > 80 || !/^[a-zA-Z0-9-]+$/.test(v.after))
  )
    inconsistent();
  const phase = ARCHIVE_PHASES.indexOf(v.phase);
  const doneAfter = {
    journals: 0,
    chunks: 2,
    bytes: 2,
    proofs: 2,
    integrityStates: 4,
    index: 5,
    items: 6,
    validationStates: 7,
  };
  for (const [key, index] of Object.entries(doneAfter))
    if (phase > index && v.removed[key] !== limits[key]) inconsistent();
  if (
    v.phase === 'done' ? v.completedAt !== v.updatedAt || v.after !== null : v.completedAt !== null
  )
    inconsistent();
  return v;
}
export function archiveHistory(old, current) {
  if (
    old.contextToken !== current.contextToken ||
    old.firstOperationId !== current.firstOperationId ||
    old.checkpoint > current.checkpoint ||
    ARCHIVE_PHASES.indexOf(old.phase) > ARCHIVE_PHASES.indexOf(current.phase) ||
    ARCHIVE_COUNTERS.some((k) => old.removed[k] > current.removed[k]) ||
    (old.completedAt !== null && old.completedAt !== current.completedAt)
  )
    inconsistent();
}
export const archiveView = (value, complete) =>
  value
    ? structuredClone(value)
    : {
        checkpoint: 0,
        phase: complete ? 'not-started' : 'waiting-for-media',
        after: null,
        removed: Object.fromEntries(ARCHIVE_COUNTERS.map((k) => [k, 0])),
        completedAt: null,
      };
