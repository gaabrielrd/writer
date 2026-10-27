import { contentClosed as closed, contentCount as count } from './adventureContentPrimitives.mjs';
export const draftFinalizePhase = (v) => v.phase === 'draft-ready';
export const draftFinalizeViewKeys = ['draftOutcome', 'draftWordCount'];
export function validAdventureDraftFinalized(v) {
  return (
    ['none', 'version'].includes(v.draftOutcome) &&
    (v.draftOutcome === 'none' ? v.draftWordCount === null : count(v.draftWordCount))
  );
}
export function validAdventureRecoveredDraft(v) {
  return (
    closed(v, [
      'schemaVersion',
      'state',
      'versionId',
      'resource',
      'baseRevision',
      'savedAt',
      'current',
      'byteLength',
      'contentHash',
      'chunkCount',
    ]) &&
    v.schemaVersion === 1 &&
    v.state === 'pending-finalization' &&
    typeof v.versionId === 'string' &&
    /^restore-[a-f0-9]{64}$/.test(v.versionId) &&
    closed(v.resource, ['kind', 'id']) &&
    ['scene', 'block'].includes(v.resource.kind) &&
    typeof v.resource.id === 'string' &&
    /^restore-[a-f0-9]{64}$/.test(v.resource.id) &&
    count(v.baseRevision) &&
    v.baseRevision >= 1 &&
    typeof v.savedAt === 'number' &&
    Number.isFinite(v.savedAt) &&
    v.savedAt >= 0 &&
    v.savedAt <= 8640000000000000 &&
    closed(v.current, ['headHash', 'bodyHash']) &&
    [v.current.headHash, v.current.bodyHash, v.contentHash].every(
      (h) => typeof h === 'string' && /^[a-f0-9]{64}$/.test(h),
    ) &&
    count(v.byteLength) &&
    count(v.chunkCount) &&
    v.chunkCount >= Math.max(1, Math.ceil(v.byteLength / 65536)) &&
    v.chunkCount <= Math.max(1, Math.ceil(v.byteLength / 65533))
  );
}
