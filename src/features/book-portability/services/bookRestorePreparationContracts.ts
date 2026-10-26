import {
  BOOK_RESTORE_PREPARATION_COMMANDS,
  type BookRestoreIdentity,
  type BookRestorePreparationIntent,
  type BookRestorePreparationProgress,
  type BookRestorePreparationCommand,
  type BookRestorePreparationPause,
  type BookRestorePreparationPhase,
  type BookRestoreState,
} from '../model/bookRestorePreparation';

export function restorePreparationCheck(condition: unknown): asserts condition {
  if (!condition) throw new Error('Não foi possível confirmar a etapa da restauração.');
}
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const integer = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
export function restorePreparationId(v: unknown): v is string {
  return (
    typeof v === 'string' &&
    v.length > 0 &&
    v.length <= 128 &&
    v !== '.' &&
    v !== '..' &&
    !v.includes('/') &&
    !v.includes(String.fromCharCode(92)) &&
    Array.from(v).every((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127) &&
    new TextDecoder().decode(new TextEncoder().encode(v)) === v
  );
}
export const restorePreparationOperationId = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-zA-Z0-9-]{16,80}$/.test(value);
export function readBookRestoreIdentity(value: unknown): BookRestoreIdentity {
  restorePreparationCheck(
    object(value) &&
      restorePreparationId(value.ownerId) &&
      restorePreparationOperationId(value.restoreId) &&
      restorePreparationId(value.bookId) &&
      typeof value.jobToken === 'string' &&
      /^[a-f0-9]{64}$/.test(value.jobToken),
  );
  return {
    ownerId: value.ownerId,
    restoreId: value.restoreId,
    jobToken: value.jobToken,
    bookId: value.bookId,
  };
}
const phases: Record<BookRestorePreparationPhase, readonly number[]> = {
  structure: [1],
  resources: [1, 2],
  scenes: [2, 3],
  'resource-counts': [3, 4],
  personas: [4, 5],
  universe: [5],
  history: [6, 7],
  draft: [7, 8],
  'draft-finalize': [8],
  cover: [8, 9],
  'cover-finalize': [9, 10],
  'personas-integrate': [10, 11],
  'resources-finalize': [11, 12],
  'resources-audit': [13],
  'activation-ready': [13],
};
const states: readonly BookRestoreState[] = [
  'uploading',
  'uploaded',
  'checking',
  'bytes-verified',
  'rejected',
  'validating',
  'content-verified',
  'content-rejected',
  'activated',
  'cancelling',
  'cancelled',
];
function bind(v: Record<string, unknown>, identity: BookRestoreIdentity) {
  restorePreparationCheck(
    (['ownerId', 'restoreId', 'bookId', 'jobToken'] as const).every((k) => v[k] === identity[k]),
  );
}
export function readBookRestorePreparationProgress(
  raw: unknown,
  expected: BookRestoreIdentity,
): BookRestorePreparationProgress {
  const identity = readBookRestoreIdentity(expected);
  restorePreparationCheck(object(raw));
  bind(raw, identity);
  restorePreparationCheck(
    raw.schemaVersion === 1 &&
      integer(raw.checkpoint) &&
      states.includes(raw.state as BookRestoreState),
  );
  let preparation: BookRestorePreparationProgress['preparation'] = null;
  if (Object.hasOwn(raw, 'preparation')) {
    const p = raw.preparation;
    restorePreparationCheck(
      object(p) &&
        integer(p.schemaVersion) &&
        typeof p.phase === 'string' &&
        Object.hasOwn(phases, p.phase) &&
        phases[p.phase as BookRestorePreparationPhase].includes(p.schemaVersion),
    );
    let coverStorageState: null | 'reserved' | 'prepared' = null;
    if (p.schemaVersion >= 10) {
      restorePreparationCheck(
        object(p.coverStorage) && ['reserved', 'prepared'].includes(p.coverStorage.state as string),
      );
      coverStorageState = p.coverStorage.state as 'reserved' | 'prepared';
    } else restorePreparationCheck(!Object.hasOwn(p, 'coverStorage'));
    let sourceIndexesComplete: boolean | null = null;
    if (p.schemaVersion >= 12) {
      restorePreparationCheck(
        object(p.sourceIndexes) && typeof p.sourceIndexes.complete === 'boolean',
      );
      sourceIndexesComplete = p.sourceIndexes.complete;
      restorePreparationCheck(p.schemaVersion !== 13 || sourceIndexesComplete);
    } else restorePreparationCheck(!Object.hasOwn(p, 'sourceIndexes'));
    preparation = {
      schemaVersion: p.schemaVersion,
      phase: p.phase as BookRestorePreparationPhase,
      coverStorageState,
      sourceIndexesComplete,
    };
  }
  restorePreparationCheck(raw.state !== 'activated' || preparation?.phase === 'activation-ready');
  restorePreparationCheck(
    raw.state === 'content-verified' ||
      raw.state === 'activated' ||
      raw.state === 'cancelling' ||
      raw.state === 'cancelled' ||
      preparation === null,
  );
  return {
    schemaVersion: 1,
    ...identity,
    state: raw.state as BookRestoreState,
    checkpoint: raw.checkpoint,
    preparation,
  };
}
export function readBookRestorePreparationIntent(
  raw: unknown,
  expected: BookRestoreIdentity,
): BookRestorePreparationIntent {
  const identity = readBookRestoreIdentity(expected);
  const keys = [
    'schemaVersion',
    'ownerId',
    'restoreId',
    'jobToken',
    'bookId',
    'action',
    'operationId',
    'expectedCheckpoint',
    'limit',
  ];
  restorePreparationCheck(
    object(raw) &&
      Object.keys(raw).length === keys.length &&
      keys.every((k) => Object.hasOwn(raw, k)),
  );
  bind(raw, identity);
  restorePreparationCheck(
    raw.schemaVersion === 1 &&
      BOOK_RESTORE_PREPARATION_COMMANDS.includes(raw.action as BookRestorePreparationCommand) &&
      restorePreparationOperationId(raw.operationId) &&
      integer(raw.expectedCheckpoint) &&
      raw.expectedCheckpoint < Number.MAX_SAFE_INTEGER &&
      raw.limit === (raw.action === 'advanceBookRestoreIntegrity' ? 16 : null),
  );
  return Object.freeze({
    schemaVersion: 1,
    ...identity,
    action: raw.action as BookRestorePreparationCommand,
    operationId: raw.operationId,
    expectedCheckpoint: raw.expectedCheckpoint,
    limit: raw.limit as 16 | null,
  });
}
export function chooseBookRestorePreparationStep(
  p: BookRestorePreparationProgress,
): { action: BookRestorePreparationCommand } | { reason: BookRestorePreparationPause } {
  switch (p.state) {
    case 'uploading':
      return { reason: 'file-required' };
    case 'rejected':
    case 'content-rejected':
      return { reason: 'rejected' };
    case 'cancelling':
    case 'cancelled':
    case 'activated':
      return { reason: p.state };
    case 'uploaded':
    case 'checking':
      return { action: 'advanceBookRestoreIntegrity' };
    case 'bytes-verified':
    case 'validating':
      return { action: 'advanceBookRestoreValidation' };
    case 'content-verified':
      break;
  }
  if (!p.preparation) return { action: 'advanceBookRestoreStructure' };
  switch (p.preparation.phase) {
    case 'structure':
      return { action: 'advanceBookRestoreStructure' };
    case 'resources':
      return { action: 'advanceBookRestoreLore' };
    case 'scenes':
      return { action: 'advanceBookRestoreResources' };
    case 'resource-counts':
      return { action: 'advanceBookRestoreCounts' };
    case 'personas':
      return { action: 'advanceBookRestorePersonas' };
    case 'universe':
      return { action: 'advanceBookRestoreUniverse' };
    case 'history':
      return { action: 'advanceBookRestoreHistory' };
    case 'draft':
      return { action: 'advanceBookRestoreDraft' };
    case 'draft-finalize':
      return { action: 'finalizeBookRestoreDraft' };
    case 'cover':
      return { action: 'advanceBookRestoreCover' };
    case 'cover-finalize':
      return {
        action:
          p.preparation.coverStorageState === null
            ? 'reserveBookRestoreCover'
            : 'materializeBookRestoreCover',
      };
    case 'personas-integrate':
      return { action: 'advanceBookRestorePersonaLibrary' };
    case 'resources-finalize':
      return {
        action: p.preparation.sourceIndexesComplete
          ? 'advanceBookRestoreAudit'
          : 'advanceBookRestoreSourceIndexes',
      };
    case 'resources-audit':
      return { action: 'advanceBookRestoreAudit' };
    case 'activation-ready':
      return { reason: 'review-required' };
  }
}
export function readBookRestorePreparationConfirmation(
  raw: unknown,
  intent: BookRestorePreparationIntent,
): BookRestorePreparationProgress {
  restorePreparationCheck(
    object(raw) && raw.schemaVersion === 1 && raw.kind === 'confirmed' && object(raw.receipt),
  );
  const r = raw.receipt;
  restorePreparationCheck(
    r.schemaVersion === 1 &&
      r.action === intent.action &&
      r.operationId === intent.operationId &&
      r.expectedCheckpoint === intent.expectedCheckpoint &&
      r.checkpoint === intent.expectedCheckpoint + 1,
  );
  const p = readBookRestorePreparationProgress(raw.progress, intent);
  restorePreparationCheck(p.checkpoint >= r.checkpoint);
  return p;
}
