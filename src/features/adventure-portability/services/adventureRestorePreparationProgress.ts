import { validAdventureStagingView } from '../../../../functions/src/adventureRestoreStagingMeta.mjs';
import { validAdventureValidationView } from '../../../../functions/src/adventureRestoreValidationMeta.mjs';
import {
  readAdventureRestoreRecoveryRequest,
  recoveryCheck as check,
  recoveryObject,
  recoveryHash,
  type AdventureRestoreRecoveryContext,
  type AdventureRestoreRecoveryIdentity,
  type AdventureRestoreRecoveryRequest,
} from './adventureRestoreRecoveryContracts';
import {
  type AdventureRestorePreparationCommand,
  type AdventureRestorePreparationIntent,
} from './adventureRestorePreparationContracts';

export type AdventurePreparationState =
  | 'uploading'
  | 'uploaded'
  | 'checking'
  | 'bytes-verified'
  | 'rejected'
  | 'validating'
  | 'content-verified'
  | 'content-rejected'
  | 'activated'
  | 'cancelling'
  | 'cancelled';
export type AdventurePreparationPhase =
  | 'structure'
  | 'structure-ready'
  | 'resources'
  | 'resources-ready'
  | 'lore'
  | 'personas'
  | 'profiles-ready'
  | 'history'
  | 'history-ready'
  | 'draft-ready'
  | 'universe-ready'
  | 'persona-library'
  | 'persona-library-ready'
  | 'image-bytes'
  | 'image-bytes-ready'
  | 'image-storage'
  | 'image-storage-ready'
  | 'counts-blocks'
  | 'counts-scenes'
  | 'counts-links'
  | 'counts-ready'
  | 'audit-journals'
  | 'audit-physical'
  | 'audit-media'
  | 'audit-ready'
  | 'image-library'
  | 'image-library-ready';
export type AdventurePreparationPause =
  'file-required' | 'review-required' | 'rejected' | 'activated' | 'cancelling' | 'cancelled';
export type AdventurePreparationProgress = AdventureRestoreRecoveryIdentity &
  Readonly<{
    schemaVersion: 1;
    state: AdventurePreparationState;
    checkpoint: number;
    validation: string | null;
    staging: Readonly<{
      version: 1;
      phase: AdventurePreparationPhase;
      libraryIncluded: boolean;
    }> | null;
  }>;
export type AdventurePreparationStep =
  | {
      kind: 'advanced';
      action: AdventureRestorePreparationCommand;
      progress: AdventurePreparationProgress;
    }
  | { kind: 'paused'; reason: AdventurePreparationPause; progress: AdventurePreparationProgress };
const states: readonly string[] = [
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
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const count = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
function validation(raw: unknown) {
  check(object(raw) && validAdventureValidationView(raw));
  return raw.phase as string;
}
function stage(raw: unknown, state: string): NonNullable<AdventurePreparationProgress['staging']> {
  check(object(raw) && validAdventureStagingView(raw));
  if (['content-verified', 'activated'].includes(state)) {
    check(raw.cleanedArtifacts === 0 && raw.personaLibraryRevoked !== true);
    for (const [pending, phase] of [
      ['historyPending', 'history'],
      ['imagePending', 'image-bytes'],
      ['storagePending', 'image-storage'],
    ])
      if (raw.phase !== phase && Object.hasOwn(raw, pending!)) check(raw[pending!] === false);
  }
  const libraryIncluded = Object.hasOwn(raw, 'libraryImages');
  if (raw.phase === 'audit-ready' && libraryIncluded)
    check(
      raw.libraryImages === raw.imageAssets &&
        raw.libraryUses === raw.imageAssets &&
        raw.storagePrepared === raw.imageAssets,
    );
  return Object.freeze({
    version: 1,
    phase: raw.phase as AdventurePreparationPhase,
    libraryIncluded,
  });
}
export function readAdventurePreparationProgress(
  raw: unknown,
  expected: AdventureRestoreRecoveryRequest,
): AdventurePreparationProgress {
  const c = readAdventureRestoreRecoveryRequest(expected);
  check(
    object(raw) &&
      raw.schemaVersion === 1 &&
      states.includes(raw.state as string) &&
      count(raw.checkpoint) &&
      raw.restoreId === c.restoreId &&
      raw.adventureId === c.adventureId &&
      raw.jobToken === c.jobToken &&
      raw.reviewHash === c.reviewHash &&
      (!Object.hasOwn(raw, 'ownerId') || raw.ownerId === c.ownerId),
  );
  const state = raw.state as AdventurePreparationState;
  const v = Object.hasOwn(raw, 'validation') ? validation(raw.validation) : null;
  const s = Object.hasOwn(raw, 'staging') ? stage(raw.staging, state) : null;
  if (['uploading', 'uploaded', 'checking', 'bytes-verified', 'rejected'].includes(state))
    check(v === null && s === null);
  if (state === 'validating')
    check(v !== null && !['verified', 'rejected'].includes(v) && s === null);
  if (state === 'content-rejected') check(v === 'rejected' && s === null);
  if (['content-verified', 'activated'].includes(state)) check(v === 'verified');
  if (s) check(['content-verified', 'activated', 'cancelling', 'cancelled'].includes(state));
  if (state === 'rejected')
    check(['file-hash-mismatch', 'upload-chain-mismatch'].includes(raw.integrityFailure as string));
  if (state === 'activated') {
    const a = raw.activation;
    check(
      s?.phase === 'audit-ready' &&
        s.libraryIncluded &&
        recoveryObject(a, [
          'schemaVersion',
          'operationId',
          'requestHash',
          'reviewToken',
          'sourceCheckpoint',
          'activatedAt',
          'mediaState',
        ]) &&
        a.schemaVersion === 1 &&
        typeof a.operationId === 'string' &&
        /^[A-Za-z0-9-]{16,80}$/.test(a.operationId) &&
        recoveryHash(a.requestHash) &&
        recoveryHash(a.reviewToken) &&
        count(a.sourceCheckpoint) &&
        Number.isSafeInteger(a.sourceCheckpoint + 1) &&
        a.sourceCheckpoint + 1 === raw.checkpoint &&
        count(a.activatedAt) &&
        a.activatedAt <= 8640000000000000 &&
        ['pending', 'none'].includes(a.mediaState as string),
    );
  }
  return Object.freeze({
    schemaVersion: 1,
    ownerId: c.ownerId,
    restoreId: c.restoreId,
    adventureId: c.adventureId,
    jobToken: c.jobToken,
    reviewHash: c.reviewHash,
    state,
    checkpoint: raw.checkpoint,
    validation: v,
    staging: s,
  });
}
export function chooseAdventurePreparationStep(
  p: AdventurePreparationProgress,
): { action: AdventureRestorePreparationCommand } | { reason: AdventurePreparationPause } {
  switch (p.state) {
    case 'uploading':
      return { reason: 'file-required' };
    case 'uploaded':
    case 'checking':
      return { action: 'advanceAdventureRestoreIntegrity' };
    case 'bytes-verified':
    case 'validating':
      return { action: 'advanceAdventureRestoreValidation' };
    case 'rejected':
    case 'content-rejected':
      return { reason: 'rejected' };
    case 'activated':
    case 'cancelling':
    case 'cancelled':
      return { reason: p.state };
    case 'content-verified':
      break;
  }
  switch (p.staging?.phase ?? null) {
    case null:
    case 'structure':
      return { action: 'advanceAdventureRestoreStructure' };
    case 'structure-ready':
    case 'resources':
      return { action: 'advanceAdventureRestoreResources' };
    case 'resources-ready':
    case 'lore':
    case 'personas':
      return { action: 'advanceAdventureRestoreProfiles' };
    case 'profiles-ready':
    case 'history':
      return { action: 'advanceAdventureRestoreHistory' };
    case 'history-ready':
      return { action: 'finalizeAdventureRestoreDraft' };
    case 'draft-ready':
      return { action: 'advanceAdventureRestoreUniverse' };
    case 'universe-ready':
    case 'persona-library':
      return { action: 'advanceAdventureRestorePersonaLibrary' };
    case 'persona-library-ready':
    case 'image-bytes':
      return { action: 'advanceAdventureRestoreImages' };
    case 'image-bytes-ready':
    case 'image-storage':
      return { action: 'advanceAdventureRestoreImageStorage' };
    case 'image-storage-ready':
    case 'counts-blocks':
    case 'counts-scenes':
    case 'counts-links':
      return { action: 'advanceAdventureRestoreCounts' };
    case 'counts-ready':
    case 'audit-journals':
    case 'audit-physical':
    case 'audit-media':
    case 'image-library-ready':
      return { action: 'advanceAdventureRestoreAudit' };
    case 'image-library':
      return { action: 'advanceAdventureRestoreImageLibrary' };
    case 'audit-ready':
      return p.staging!.libraryIncluded
        ? { reason: 'review-required' }
        : { action: 'advanceAdventureRestoreImageLibrary' };
    default:
      check(false);
  }
}
function sameMetadata(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  return (
    object(a) &&
    object(b) &&
    Object.keys(a).length === Object.keys(b).length &&
    Object.keys(a).every((k) => Object.hasOwn(b, k) && sameMetadata(a[k], b[k]))
  );
}
export function readAdventurePreparationConfirmation(
  raw: unknown,
  intent: AdventureRestorePreparationIntent,
  context: AdventureRestoreRecoveryContext,
) {
  check(object(raw) && raw.schemaVersion === 1 && raw.kind === 'confirmed' && object(raw.receipt));
  const r = raw.receipt;
  check(
    r.schemaVersion === 1 &&
      r.action === intent.action &&
      r.operationId === intent.operationId &&
      r.expectedCheckpoint === intent.expectedCheckpoint &&
      r.checkpoint === intent.expectedCheckpoint + 1 &&
      r.sequence === null,
  );
  const integrity = intent.action === 'advanceAdventureRestoreIntegrity',
    validating = intent.action === 'advanceAdventureRestoreValidation';
  check(
    (integrity
      ? ['checking', 'bytes-verified', 'rejected']
      : validating
        ? ['validating', 'content-verified', 'content-rejected']
        : ['content-verified']
    ).includes(r.state as string),
  );
  if (integrity) check(!Object.hasOwn(r, 'validation') && !Object.hasOwn(r, 'staging'));
  else {
    const v = validation(r.validation);
    check(
      validating
        ? r.state === 'validating'
          ? !['verified', 'rejected'].includes(v)
          : v === (r.state === 'content-verified' ? 'verified' : 'rejected')
        : v === 'verified',
    );
    if (validating) check(!Object.hasOwn(r, 'staging'));
    else stage(r.staging, 'content-verified');
  }
  const p = readAdventurePreparationProgress(raw.progress, context);
  check(p.checkpoint >= r.checkpoint);
  if (p.checkpoint === r.checkpoint) {
    check(
      p.state === r.state &&
        object(raw.progress) &&
        sameMetadata(raw.progress.validation, r.validation) &&
        sameMetadata(raw.progress.staging, r.staging),
    );
  }
  return p;
}
