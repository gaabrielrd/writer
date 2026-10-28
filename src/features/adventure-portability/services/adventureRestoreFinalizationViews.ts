import {
  recoveryCheck as check,
  recoveryObject as closed,
  recoveryHash as hash,
  recoveryOperationId as id,
  type AdventureRestoreRecoveryIdentity,
} from './adventureRestoreRecoveryContracts';
import {
  effectCount as count,
  effectObject as object,
  readAdventureEffectIdentity,
} from './adventureRestoreEffectContracts';
const date = (v: unknown): v is number => count(v) && v <= 8640000000000000;
const counts = [
  'parts',
  'scenes',
  'blocks',
  'words',
  'lore',
  'versions',
  'profiles',
  'images',
] as const;
const warnings = [
  'missingDates',
  'danglingLocalReferences',
  'externalReferences',
  'orphanGroups',
  'unknownOverrides',
  'historicalOnlyResources',
] as const;
export type AdventureRestoreActivationReview = Readonly<{
  schemaVersion: 1;
  restoreId: string;
  adventureId: string;
  checkpoint: number;
  reviewToken: string;
  summary: Readonly<{
    titlePreview: string;
    titleTruncated: boolean;
    visibility: 'private';
    counts: Readonly<Record<(typeof counts)[number], number>>;
    warnings: Readonly<Record<(typeof warnings)[number], number>>;
    universe: Readonly<{
      originKind: 'none' | 'reference' | 'unavailable';
      observed: 'none' | 'available' | 'unavailable';
      universeId: string | null;
    }>;
    mediaState: 'pending' | 'none';
    draftOutcome: 'none' | 'version';
  }>;
}>;
export function readAdventureRestoreActivationReview(
  raw: unknown,
  expected: AdventureRestoreRecoveryIdentity,
): AdventureRestoreActivationReview {
  const c = readAdventureEffectIdentity(expected);
  check(
    closed(raw, [
      'schemaVersion',
      'restoreId',
      'adventureId',
      'checkpoint',
      'summary',
      'reviewToken',
    ]) &&
      raw.schemaVersion === 1 &&
      raw.restoreId === c.restoreId &&
      raw.adventureId === c.adventureId &&
      count(raw.checkpoint) &&
      Number.isSafeInteger(raw.checkpoint + 1) &&
      hash(raw.reviewToken) &&
      closed(raw.summary, [
        'titlePreview',
        'titleTruncated',
        'visibility',
        'counts',
        'warnings',
        'universe',
        'mediaState',
        'draftOutcome',
      ]),
  );
  const s = raw.summary;
  check(
    typeof s.titlePreview === 'string' &&
      s.titlePreview.length <= 300 &&
      typeof s.titleTruncated === 'boolean' &&
      s.visibility === 'private' &&
      closed(s.counts, counts) &&
      Object.values(s.counts).every(count) &&
      closed(s.warnings, warnings) &&
      Object.values(s.warnings).every(count) &&
      closed(s.universe, ['originKind', 'observed', 'universeId']) &&
      ['pending', 'none'].includes(s.mediaState as string) &&
      s.mediaState === (s.counts.images ? 'pending' : 'none') &&
      ['none', 'version'].includes(s.draftOutcome as string),
  );
  const u = s.universe;
  check(
    ['none', 'reference', 'unavailable'].includes(u.originKind as string) &&
      ['none', 'available', 'unavailable'].includes(u.observed as string) &&
      (u.originKind === 'none') === (u.observed === 'none') &&
      (u.observed === 'available'
        ? u.originKind === 'reference' &&
          typeof u.universeId === 'string' &&
          u.universeId.length > 0 &&
          u.universeId.length <= 1500
        : u.universeId === null),
  );
  return Object.freeze({
    schemaVersion: 1,
    restoreId: c.restoreId,
    adventureId: c.adventureId,
    checkpoint: raw.checkpoint,
    reviewToken: raw.reviewToken,
    summary: Object.freeze({
      titlePreview: s.titlePreview,
      titleTruncated: s.titleTruncated,
      visibility: 'private',
      counts: Object.freeze({
        ...s.counts,
      }) as AdventureRestoreActivationReview['summary']['counts'],
      warnings: Object.freeze({
        ...s.warnings,
      }) as AdventureRestoreActivationReview['summary']['warnings'],
      universe: Object.freeze({ ...u }) as AdventureRestoreActivationReview['summary']['universe'],
      mediaState: s.mediaState as 'pending' | 'none',
      draftOutcome: s.draftOutcome as 'none' | 'version',
    }),
  });
}
export type AdventureRestoreMediaStatus = Readonly<{
  checkpoint: number;
  total: number;
  processed: number;
  ready: number;
  unavailable: number;
  complete: boolean;
}>;
export function readAdventureRestoreMediaStatus(raw: unknown): AdventureRestoreMediaStatus {
  check(
    closed(raw, ['checkpoint', 'total', 'processed', 'ready', 'unavailable', 'complete']) &&
      ['checkpoint', 'total', 'processed', 'ready', 'unavailable'].every((k) => count(raw[k])) &&
      typeof raw.complete === 'boolean',
  );
  const m = raw as AdventureRestoreMediaStatus;
  check(
    Number.isSafeInteger(m.ready + m.unavailable) &&
      m.processed === m.ready + m.unavailable &&
      m.processed <= m.total &&
      m.checkpoint === m.processed + Number(m.complete) &&
      (!m.complete || m.processed === m.total),
  );
  return Object.freeze({ ...m });
}
export const ADVENTURE_RESTORE_ARCHIVE_PHASES = Object.freeze([
  'not-started',
  'waiting-for-media',
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
] as const);
const removed = [
  'journals',
  'privateArtifacts',
  'chunks',
  'bytes',
  'proofs',
  'integrityStates',
  'index',
  'items',
  'validationStates',
] as const;
export type AdventureRestoreArchiveStatus = Readonly<{
  checkpoint: number;
  phase: (typeof ADVENTURE_RESTORE_ARCHIVE_PHASES)[number];
  removed: Readonly<Record<(typeof removed)[number], number>>;
  completedAt: number | null;
}>;
export function readAdventureRestoreArchiveStatus(
  raw: unknown,
  expected: AdventureRestoreRecoveryIdentity,
): AdventureRestoreArchiveStatus {
  const c = readAdventureEffectIdentity(expected);
  check(
    object(raw) &&
      ADVENTURE_RESTORE_ARCHIVE_PHASES.includes(
        raw.phase as AdventureRestoreArchiveStatus['phase'],
      ) &&
      count(raw.checkpoint) &&
      closed(raw.removed, removed) &&
      Object.values(raw.removed).every(count) &&
      (raw.phase === 'done' ? date(raw.completedAt) : raw.completedAt === null),
  );
  const initial = ['not-started', 'waiting-for-media'].includes(raw.phase as string);
  check(
    closed(
      raw,
      initial
        ? ['checkpoint', 'phase', 'after', 'removed', 'completedAt']
        : [
            'schemaVersion',
            'ownerId',
            'restoreId',
            'jobToken',
            'adventureId',
            'activationOperationId',
            'mediaOperationId',
            'mediaToken',
            'contextToken',
            'checkpoint',
            'phase',
            'after',
            'removed',
            'firstOperationId',
            'lastOperationId',
            'updatedAt',
            'completedAt',
          ],
    ),
  );
  check(
    raw.after === null ||
      (typeof raw.after === 'string' &&
        raw.after.length <= 80 &&
        /^[a-zA-Z0-9-]+$/.test(raw.after)),
  );
  const r = raw.removed;
  check((r.privateArtifacts as number) <= (r.journals as number) && r.proofs === r.chunks);
  if (initial)
    check(raw.checkpoint === 0 && raw.after === null && Object.values(r).every((v) => v === 0));
  else
    check(
      raw.schemaVersion === 1 &&
        raw.ownerId === c.ownerId &&
        raw.restoreId === c.restoreId &&
        raw.adventureId === c.adventureId &&
        raw.jobToken === c.jobToken &&
        raw.checkpoint >= 1 &&
        id(raw.activationOperationId) &&
        id(raw.mediaOperationId) &&
        id(raw.firstOperationId) &&
        id(raw.lastOperationId) &&
        hash(raw.mediaToken) &&
        hash(raw.contextToken) &&
        date(raw.updatedAt) &&
        (raw.phase === 'done' ? raw.completedAt === raw.updatedAt && raw.after === null : true),
    );
  return Object.freeze({
    checkpoint: raw.checkpoint,
    phase: raw.phase as AdventureRestoreArchiveStatus['phase'],
    removed: Object.freeze({ ...r }) as AdventureRestoreArchiveStatus['removed'],
    completedAt: raw.completedAt as number | null,
  });
}
