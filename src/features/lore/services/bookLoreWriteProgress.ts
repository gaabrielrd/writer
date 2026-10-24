import { readObject, readCount, readHash } from './bookLoreReadContracts';
import { invalidLoreEdit, freezeLoreEditValue } from './bookLoreWritePlan';

export const loreCleanupBlocks = [
  'book-absent',
  'book-deleting',
  'unmanaged',
  'lore-removal',
  'active-head',
  'lease',
  'active-generation',
] as const;
export type LoreCleanupBlock = (typeof loreCleanupBlocks)[number];
function block(value: unknown): LoreCleanupBlock | null {
  if (value === null) return null;
  if (!loreCleanupBlocks.includes(value as LoreCleanupBlock)) invalidLoreEdit();
  return value as LoreCleanupBlock;
}
export interface LoreJobProgress {
  id: string;
  startHash: string;
  jobToken: string | null;
  phase: string;
  revision: number;
}
export interface LoreInspectionProgress extends LoreJobProgress {
  nextIndex: number;
  byteLength: number;
  totalParts: number;
  ready: boolean;
}
export interface LoreUploadProgress extends LoreJobProgress {
  nextIndex: number;
  sealIndex: number;
  totalParts: number;
  byteLength: number;
  cleanupIndex: number;
  cleanedCount: number;
  prepared: boolean;
}
export interface LoreAdoptionProgress {
  operationId: string;
  timestamp: number;
  localLoreVersion: number;
  publicationPrivacyVersion: number;
  revoked: boolean;
  storageHash: string;
}
export interface LoreEditProgress extends LoreJobProgress {
  reservedCount: number;
  releasedCount: number;
  blockedReason: LoreCleanupBlock | null;
  compilation?: {
    phase: string;
    fieldIndex: number;
    page: number;
    totalPages: number;
    auditSelector: number;
    auditIndex: number;
    auditedParts: number;
    cleanupPage: number;
  };
  adoption?: LoreAdoptionProgress;
}
export type LoreProgress = LoreInspectionProgress | LoreUploadProgress | LoreEditProgress;
export interface LoreJobExpectation {
  id: string;
  startHash: string;
  token?: string | null;
}
const object = (v: unknown, required: string[], optional: string[] = []) =>
  readObject(freezeLoreEditValue(v), required, optional);
function base(
  v: Record<string, unknown>,
  key: string,
  expected: LoreJobExpectation,
  phases: string[],
): LoreJobProgress {
  const phase = v.phase;
  if (
    v[key] !== expected.id ||
    v.startHash !== expected.startHash ||
    typeof phase !== 'string' ||
    !phases.includes(phase)
  )
    invalidLoreEdit();
  const jobToken = v.jobToken === null ? null : readHash(v.jobToken),
    revision = readCount(v.revision);
  if (
    (expected.token !== undefined && jobToken !== expected.token) ||
    (jobToken === null && (phase !== 'cancelled' || revision !== 0))
  )
    invalidLoreEdit();
  return { id: expected.id, startHash: expected.startHash, jobToken, phase, revision };
}
export function inspectionProgress(
  value: unknown,
  expected: LoreJobExpectation,
): LoreInspectionProgress {
  const v = object(value, [
      'inspectionId',
      'startHash',
      'jobToken',
      'phase',
      'revision',
      'nextIndex',
      'byteLength',
      'totalParts',
      'ready',
    ]),
    p = base(v, 'inspectionId', expected, ['checking', 'base', 'privacy', 'ready', 'cancelled']),
    nextIndex = readCount(v.nextIndex),
    byteLength = readCount(v.byteLength),
    totalParts = readCount(v.totalParts);
  if (
    !Number.isSafeInteger(totalParts * 65536) ||
    nextIndex > totalParts ||
    byteLength > totalParts * 65536 ||
    typeof v.ready !== 'boolean' ||
    v.ready !== (p.phase === 'ready')
  )
    invalidLoreEdit();
  return { ...p, nextIndex, byteLength, totalParts, ready: v.ready };
}
export function uploadProgress(
  value: unknown,
  expected: LoreJobExpectation,
  manifest: { chunkCount: number; byteLength: number },
): LoreUploadProgress {
  const v = object(value, [
      'uploadId',
      'startHash',
      'jobToken',
      'phase',
      'revision',
      'nextIndex',
      'sealIndex',
      'totalParts',
      'byteLength',
      'cleanupIndex',
      'cleanedCount',
      'prepared',
    ]),
    p = base(v, 'uploadId', expected, [
      'uploading',
      'verifying',
      'sealed',
      'reserved',
      'cancelling',
      'cancelled',
    ]),
    nextIndex = readCount(v.nextIndex),
    sealIndex = readCount(v.sealIndex),
    totalParts = readCount(v.totalParts),
    byteLength = readCount(v.byteLength),
    cleanupIndex = readCount(v.cleanupIndex),
    cleanedCount = readCount(v.cleanedCount);
  if (
    totalParts !== (p.jobToken === null ? 0 : manifest.chunkCount) ||
    nextIndex > totalParts ||
    sealIndex > nextIndex ||
    cleanupIndex > nextIndex ||
    cleanedCount > nextIndex + 1 ||
    byteLength !== Math.min(nextIndex * 65536, manifest.byteLength) ||
    typeof v.prepared !== 'boolean' ||
    v.prepared !== (p.phase === 'sealed') ||
    (['verifying', 'sealed', 'reserved'].includes(p.phase) && nextIndex !== totalParts)
  )
    invalidLoreEdit();
  return {
    ...p,
    nextIndex,
    sealIndex,
    totalParts,
    byteLength,
    cleanupIndex,
    cleanedCount,
    prepared: v.prepared,
  };
}
export function editProgress(
  value: unknown,
  expected: LoreJobExpectation,
  maxSlots: number,
): LoreEditProgress {
  const v = object(
      value,
      [
        'editId',
        'startHash',
        'jobToken',
        'phase',
        'revision',
        'reservedCount',
        'releasedCount',
        'blockedReason',
      ],
      ['compilation', 'adoption'],
    ),
    p = base(v, 'editId', expected, [
      'initializing',
      'preparing',
      'adopted',
      'cancelling',
      'cancelled',
    ]),
    reservedCount = readCount(v.reservedCount),
    releasedCount = readCount(v.releasedCount),
    blockedReason = block(v.blockedReason);
  if (reservedCount > maxSlots || releasedCount > reservedCount) invalidLoreEdit();
  const result: LoreEditProgress = { ...p, reservedCount, releasedCount, blockedReason };
  if (Object.hasOwn(v, 'compilation')) {
    const c = object(
      v.compilation,
      [
        'phase',
        'fieldIndex',
        'page',
        'totalPages',
        'auditSelector',
        'auditIndex',
        'auditedParts',
        'cleanupPage',
      ],
      ['materializing'],
    );
    if (
      typeof c.phase !== 'string' ||
      !['base', 'fields', 'relations', 'audit', 'finalize', 'ready'].includes(c.phase)
    )
      invalidLoreEdit();
    const fieldIndex = readCount(c.fieldIndex),
      page = readCount(c.page),
      totalPages = readCount(c.totalPages),
      auditSelector = readCount(c.auditSelector),
      auditIndex = readCount(c.auditIndex),
      auditedParts = readCount(c.auditedParts),
      cleanupPage = readCount(c.cleanupPage);
    if (fieldIndex > 7 || page > totalPages || cleanupPage > page || auditSelector > 8 + totalPages)
      invalidLoreEdit();
    if (c.materializing !== undefined && c.materializing !== null) {
      const m = object(c.materializing, ['field'], ['page', 'count']);
      if (
        ![
          'name',
          'category',
          'summary',
          'details',
          'aliases',
          'structuredDetails',
          'isPublic',
          'relations',
        ].includes(m.field as string)
      )
        invalidLoreEdit();
      if (m.field === 'relations') {
        readCount(m.page);
        if (readCount(m.count) < 1 || (m.count as number) > 64) invalidLoreEdit();
      } else if (Object.keys(m).length !== 1) invalidLoreEdit();
    }
    result.compilation = {
      phase: c.phase,
      fieldIndex,
      page,
      totalPages,
      auditSelector,
      auditIndex,
      auditedParts,
      cleanupPage,
    };
  }
  if (Object.hasOwn(v, 'adoption')) {
    const a = object(v.adoption, [
        'operationId',
        'timestamp',
        'localLoreVersion',
        'publicationPrivacyVersion',
        'revoked',
        'storageHash',
      ]),
      timestamp = readCount(a.timestamp),
      localLoreVersion = readCount(a.localLoreVersion);
    if (
      p.phase !== 'adopted' ||
      typeof a.operationId !== 'string' ||
      !/^[a-f0-9]{64}$/.test(a.operationId) ||
      !Number.isFinite(new Date(timestamp).getTime()) ||
      localLoreVersion < 1 ||
      typeof a.revoked !== 'boolean'
    )
      invalidLoreEdit();
    result.adoption = {
      operationId: a.operationId,
      timestamp,
      localLoreVersion,
      publicationPrivacyVersion: readCount(a.publicationPrivacyVersion),
      revoked: a.revoked,
      storageHash: readHash(a.storageHash),
    };
  }
  if ((p.phase === 'adopted') !== Boolean(result.adoption)) invalidLoreEdit();
  return result;
}
export function progressResponse(
  value: unknown,
  direct: boolean,
  parse: (v: unknown) => LoreProgress,
): { progress: LoreProgress; blocked: LoreCleanupBlock | null } {
  if (direct) return { progress: parse(value), blocked: null };
  const response = object(value, ['receipt', 'progress'], ['blocked']);
  if (response.receipt !== null) parse(response.receipt);
  return { progress: parse(response.progress), blocked: block(response.blocked ?? null) };
}
