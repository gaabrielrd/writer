import {
  contentClosed as closed,
  contentCount as count,
  contentHash as hash,
} from './adventureContentPrimitives.mjs';
export function validAdventureRestoreActivation(value, job) {
  const p = job.staging;
  return (
    closed(value, [
      'schemaVersion',
      'operationId',
      'requestHash',
      'reviewToken',
      'sourceCheckpoint',
      'activatedAt',
      'mediaState',
    ]) &&
    value.schemaVersion === 1 &&
    job.state === 'activated' &&
    typeof value.operationId === 'string' &&
    /^[a-zA-Z0-9-]{16,80}$/.test(value.operationId) &&
    hash(value.requestHash) &&
    hash(value.reviewToken) &&
    count(value.sourceCheckpoint) &&
    Number.isSafeInteger(value.sourceCheckpoint + 1) &&
    value.sourceCheckpoint + 1 === job.checkpoint &&
    value.operationId === job.lastOperationId &&
    value.requestHash === job.lastRequestHash &&
    value.activatedAt === job.updatedAt &&
    count(value.activatedAt) &&
    value.activatedAt <= 8640000000000000 &&
    p?.phase === 'audit-ready' &&
    p.cleanedArtifacts === 0 &&
    p.libraryImages === p.imageAssets &&
    p.libraryUses === p.imageAssets &&
    p.librarySourceAudit?.checkpoint < value.sourceCheckpoint &&
    p.auditSealOperationId !== p.librarySourceAudit?.operationId &&
    !p.personaLibraryRevoked &&
    p.storageFenced === 0 &&
    value.mediaState === (p.imageAssets ? 'pending' : 'none')
  );
}
