import {
  readAdventurePreparationProgress,
  type AdventurePreparationProgress,
} from './adventureRestorePreparationProgress';
import {
  recoveryCheck as check,
  recoveryObject as object,
  recoveryHash as hash,
  recoveryOwner,
} from './adventureRestoreRecoveryContracts';
import {
  readAdventureRestoreStartIntent,
  readAdventureRestoreSourceDescriptor,
  expectedAdventureRestoreTarget,
  type AdventureRestoreStartIntent,
  type AdventureRestoreSourceDescriptor,
} from './adventureRestoreTransferContracts';
export type AdventureRestoreTransferJob = AdventurePreparationProgress &
  Readonly<{
    source: AdventureRestoreSourceDescriptor;
    uploadedChunks: number;
    uploadedBytes: number;
    checkedChunks: number;
    checkedBytes: number;
    cleanedChunks: number;
    createdAt: number;
    updatedAt: number;
  }>;
export type AdventureRestoreStartOutcome =
  | { kind: 'confirmed'; progress: AdventureRestoreTransferJob }
  | { kind: 'cancelled'; restoreId: string; adventureId: string };
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const count = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
export function readAdventureRestoreTransferJob(
  raw: unknown,
  ownerId: string,
  expected: { restoreId?: string; jobToken?: string } = {},
): AdventureRestoreTransferJob {
  check(recoveryOwner(ownerId) && record(raw) && raw.schemaVersion === 1 && hash(raw.jobToken));
  const intent = readAdventureRestoreStartIntent(
    {
      schemaVersion: 1,
      ownerId,
      operationId: raw.restoreId,
      source: raw.source,
      reviewHash: raw.reviewHash,
    },
    ownerId,
  );
  const adventureId = expectedAdventureRestoreTarget(intent);
  const p = readAdventurePreparationProgress(raw, {
    ownerId,
    restoreId: intent.operationId,
    adventureId,
    jobToken: raw.jobToken,
    reviewHash: intent.reviewHash,
  });
  check(
    (expected.restoreId === undefined || p.restoreId === expected.restoreId) &&
      (expected.jobToken === undefined || p.jobToken === expected.jobToken),
  );
  check(
    count(raw.uploadedChunks) &&
      count(raw.uploadedBytes) &&
      count(raw.checkedChunks) &&
      count(raw.checkedBytes) &&
      count(raw.cleanedChunks) &&
      count(raw.createdAt) &&
      count(raw.updatedAt),
  );
  const total = Math.ceil(intent.source.byteLength / 65536);
  check(
    raw.uploadedChunks <= total &&
      raw.checkedChunks <= raw.uploadedChunks &&
      raw.cleanedChunks <= raw.uploadedChunks &&
      raw.uploadedBytes === Math.min(intent.source.byteLength, raw.uploadedChunks * 65536) &&
      raw.checkedBytes === Math.min(intent.source.byteLength, raw.checkedChunks * 65536) &&
      p.checkpoint >= raw.uploadedChunks &&
      raw.updatedAt >= raw.createdAt &&
      raw.updatedAt <= 8640000000000000,
  );
  if (p.state === 'uploading')
    check(
      raw.uploadedChunks < total && p.checkpoint === raw.uploadedChunks && raw.checkedChunks === 0,
    );
  else if (!['cancelling', 'cancelled'].includes(p.state)) check(raw.uploadedChunks === total);
  if (p.state === 'uploaded') check(p.checkpoint === raw.uploadedChunks && raw.checkedChunks === 0);
  return Object.freeze({
    ...p,
    source: readAdventureRestoreSourceDescriptor(intent.source),
    uploadedChunks: raw.uploadedChunks,
    uploadedBytes: raw.uploadedBytes,
    checkedChunks: raw.checkedChunks,
    checkedBytes: raw.checkedBytes,
    cleanedChunks: raw.cleanedChunks,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  });
}
export function readAdventureRestoreStartOutcome(
  raw: unknown,
  expected: AdventureRestoreStartIntent,
): AdventureRestoreStartOutcome {
  const intent = readAdventureRestoreStartIntent(expected, expected.ownerId),
    adventureId = expectedAdventureRestoreTarget(intent);
  check(record(raw) && raw.schemaVersion === 1);
  if (raw.kind === 'cancelled') {
    check(
      object(raw, ['schemaVersion', 'kind', 'restoreId', 'adventureId']) &&
        raw.restoreId === intent.operationId &&
        raw.adventureId === adventureId,
    );
    return Object.freeze({ kind: 'cancelled', restoreId: intent.operationId, adventureId });
  }
  check(raw.kind === 'confirmed' && record(raw.receipt));
  const r = raw.receipt;
  check(
    r.schemaVersion === 1 &&
      r.action === 'startAdventureRestore' &&
      r.operationId === intent.operationId &&
      r.expectedCheckpoint === null &&
      r.checkpoint === 0 &&
      r.sequence === null &&
      r.state === 'uploading' &&
      [
        'uploadedChunks',
        'uploadedBytes',
        'checkedChunks',
        'checkedBytes',
        'cleanedChunks',
        'cleanedProofs',
        'cleanedStates',
      ].every((k) => r[k] === 0) &&
      r.cleanupPhase === 'chunks' &&
      r.integrityFailure === null &&
      !Object.hasOwn(r, 'validation') &&
      !Object.hasOwn(r, 'staging') &&
      !Object.hasOwn(r, 'activation'),
  );
  const progress = readAdventureRestoreTransferJob(raw.progress, intent.ownerId, {
    restoreId: intent.operationId,
  });
  check(
    progress.reviewHash === intent.reviewHash &&
      JSON.stringify(progress.source) === JSON.stringify(intent.source),
  );
  return Object.freeze({ kind: 'confirmed', progress });
}
export function readAdventureRestoreTransferPage(raw: unknown, ownerId: string, limit = 25) {
  check(
    recoveryOwner(ownerId) &&
      Number.isSafeInteger(limit) &&
      limit >= 1 &&
      limit <= 50 &&
      object(raw, ['schemaVersion', 'items', 'nextCursor']) &&
      raw.schemaVersion === 1 &&
      Array.isArray(raw.items) &&
      raw.items.length <= limit &&
      (raw.nextCursor === null ||
        (typeof raw.nextCursor === 'string' &&
          raw.nextCursor.length <= 4096 &&
          /^[A-Za-z0-9_-]+$/.test(raw.nextCursor))),
  );
  const items = raw.items.map((v) => readAdventureRestoreTransferJob(v, ownerId));
  check(new Set(items.map((v) => v.restoreId)).size === items.length);
  return Object.freeze({
    items: Object.freeze(items),
    nextCursor: raw.nextCursor,
  });
}
