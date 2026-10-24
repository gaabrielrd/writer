import { readObject, readId, readHash, readCount } from './bookLoreReadContracts';
import { freezeLoreEditValue } from './bookLoreWritePlan';
import { bookLoreWriteHash as hash } from './bookLoreWritePayload';
import {
  journalWire,
  journalFail,
  type LoreJournalIdentity,
  type LoreJournalWire,
} from './bookLoreJournalContracts';
import {
  inspectionProgress,
  uploadProgress,
  editProgress,
  loreCleanupBlocks,
  type LoreProgress,
  type LoreCleanupBlock,
} from './bookLoreWriteProgress';
export interface LoreControlRef {
  id: string;
  startHash: string;
}
export interface LoreControlPage {
  kind: 'page';
  offset: number;
  items: LoreControlRef[];
}
export interface LoreControlLookup extends LoreControlRef {
  kind: 'upload';
  index: number;
}
export type LoreControlRecord = LoreControlPage | LoreControlLookup;
export interface LoreControlPending {
  wire: LoreJournalWire;
  role: 'wanted' | 'replay';
  legacyLane: 'cleanup' | 'diagnostic' | null;
}
export interface LoreControlWorker {
  phase: 'idle' | 'running' | 'cancelled' | 'applied';
  stage: 'edit-get' | 'edit-cancel' | 'edit-clean' | 'uploads' | 'inspection';
  uploadIndex: number;
  completedCalls: number;
  progress: LoreProgress | null;
  blockedReason: LoreCleanupBlock | null;
  pending: LoreControlPending | null;
  failedCancel: LoreJournalWire | null;
}
export interface LoreJournalControls {
  generation: string;
  count: number;
  pages: number;
  written: number;
  ready: boolean;
  mapHash: string;
  inspection: LoreControlRef;
  edit: LoreControlRef | null;
  worker: LoreControlWorker;
}
export const loreControlJobId = (
  i: Pick<LoreJournalIdentity, 'uid' | 'writeId' | 'bookId' | 'loreId'>,
  kind: string,
  index = 0,
) =>
  kind +
  '-' +
  hash({
    domain: 'writer-book-lore-client-job',
    uid: i.uid,
    writeId: i.writeId,
    bookId: i.bookId,
    loreId: i.loreId,
    kind,
    index,
  });
export const loreControlUnitId = (
  i: Pick<LoreJournalIdentity, 'uid' | 'writeId' | 'bookId' | 'loreId'>,
  method: string,
  id: string,
  revision: number | null,
) =>
  hash({
    domain: 'writer-book-lore-client-unit',
    uid: i.uid,
    writeId: i.writeId,
    bookId: i.bookId,
    loreId: i.loreId,
    method,
    id,
    revision,
  });
export function loreInspectionControl(i: LoreJournalIdentity): LoreControlRef {
  const id = loreControlJobId(i, 'lore-source'),
    intent = { bookId: i.bookId, loreId: i.loreId, inspectionId: id, sourceToken: i.sourceToken };
  return {
    id,
    startHash: hash({ domain: 'writer-lore-source-inspection', schemaVersion: 1, intent }),
  };
}
function ref(value: unknown): LoreControlRef {
  const v = readObject(value, ['id', 'startHash']);
  readId(v.id);
  readHash(v.startHash);
  return v as unknown as LoreControlRef;
}
export function readLoreControlRecord(value: unknown): LoreControlRecord {
  const v = readObject(
    freezeLoreEditValue(value),
    ['kind'],
    ['offset', 'items', 'index', 'id', 'startHash'],
  );
  if (v.kind === 'page') {
    readObject(v, ['kind', 'offset', 'items']);
    if (
      readCount(v.offset) % 50 !== 0 ||
      !Array.isArray(v.items) ||
      v.items.length < 1 ||
      v.items.length > 50
    )
      journalFail();
    v.items.forEach(ref);
  } else if (v.kind === 'upload') {
    readObject(v, ['kind', 'index', 'id', 'startHash']);
    readCount(v.index);
    ref({ id: v.id, startHash: v.startHash });
  } else journalFail();
  return v as unknown as LoreControlRecord;
}
export function loreMetadataWire(value: unknown, i: LoreJournalIdentity) {
  const parsed = journalWire(value, i);
  if (parsed.metadata.lane === 'production') journalFail();
  return parsed;
}
export function loreControlProgress(
  value: unknown,
  kind: 'inspection' | 'upload' | 'edit',
  expected: LoreControlRef,
  token?: string | null,
): LoreProgress {
  const e = { ...expected, token };
  if (kind === 'inspection') return inspectionProgress(value, e);
  if (kind === 'edit') return editProgress(value, e, Number.MAX_SAFE_INTEGER);
  const v = readObject(
      value,
      [],
      [
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
      ],
    ),
    total = readCount(v.totalParts),
    next = readCount(v.nextIndex);
  return uploadProgress(v, e, {
    chunkCount: total,
    byteLength: next === total ? readCount(v.byteLength) : total * 65536,
  });
}
function restoredProgress(
  value: unknown,
  kind: 'inspection' | 'upload' | 'edit',
  expected: LoreControlRef,
) {
  const { id, ...raw } = readObject(
    value,
    ['id'],
    [
      'startHash',
      'jobToken',
      'phase',
      'revision',
      'nextIndex',
      'byteLength',
      'totalParts',
      'ready',
      'sealIndex',
      'cleanupIndex',
      'cleanedCount',
      'prepared',
      'reservedCount',
      'releasedCount',
      'blockedReason',
      'compilation',
      'adoption',
    ],
  );
  return loreControlProgress(
    {
      ...raw,
      [kind === 'inspection' ? 'inspectionId' : kind === 'upload' ? 'uploadId' : 'editId']: id,
    },
    kind,
    expected,
  );
}
export function readLoreJournalControls(
  value: unknown,
  i: LoreJournalIdentity,
): LoreJournalControls | null {
  if (value === undefined || value === null) return null;
  const v = readObject(freezeLoreEditValue(value), [
      'generation',
      'count',
      'pages',
      'written',
      'ready',
      'mapHash',
      'inspection',
      'edit',
      'worker',
    ]),
    count = readCount(v.count),
    pages = readCount(v.pages),
    written = readCount(v.written);
  readId(v.generation);
  readHash(v.mapHash);
  const inspection = ref(v.inspection),
    wanted = loreInspectionControl(i);
  if (
    inspection.id !== wanted.id ||
    inspection.startHash !== wanted.startHash ||
    pages !== Math.ceil(count / 50) ||
    written > pages ||
    typeof v.ready !== 'boolean' ||
    v.ready !== (written === pages)
  )
    journalFail();
  const edit = v.edit === null ? null : ref(v.edit);
  if (edit && edit.id !== loreControlJobId(i, 'lore-edit')) journalFail();
  const w = readObject(v.worker, [
      'phase',
      'stage',
      'uploadIndex',
      'completedCalls',
      'progress',
      'blockedReason',
      'pending',
      'failedCancel',
    ]),
    index = readCount(w.uploadIndex),
    calls = readCount(w.completedCalls);
  if (
    !['idle', 'running', 'cancelled', 'applied'].includes(w.phase as string) ||
    !['edit-get', 'edit-cancel', 'edit-clean', 'uploads', 'inspection'].includes(
      w.stage as string,
    ) ||
    index > count ||
    (w.blockedReason !== null &&
      !loreCleanupBlocks.includes(w.blockedReason as LoreCleanupBlock)) ||
    (!v.ready && w.phase !== 'idle')
  )
    journalFail();
  if (w.pending !== null) {
    const p = readObject(w.pending, ['wire', 'role', 'legacyLane']);
    loreMetadataWire(p.wire, i);
    if (
      !['wanted', 'replay'].includes(p.role as string) ||
      ![null, 'cleanup', 'diagnostic'].includes(p.legacyLane as null | 'cleanup' | 'diagnostic')
    )
      journalFail();
  }
  if (w.failedCancel !== null) {
    const p = loreMetadataWire(w.failedCancel, i);
    if (
      !edit ||
      p.wire.method !== 'cancelBookLoreEditReservation' ||
      p.metadata.id !== edit.id ||
      p.metadata.startHash !== edit.startHash
    )
      journalFail();
  }
  let progress: LoreProgress | null = null;
  const editStage = (w.stage as string).startsWith('edit-');
  if (editStage && !edit) journalFail();
  if (w.progress !== null) {
    const raw = readObject(
      w.progress,
      ['id', 'startHash'],
      [
        'jobToken',
        'phase',
        'revision',
        'nextIndex',
        'byteLength',
        'totalParts',
        'ready',
        'sealIndex',
        'cleanupIndex',
        'cleanedCount',
        'prepared',
        'reservedCount',
        'releasedCount',
        'blockedReason',
        'compilation',
        'adoption',
      ],
    );
    const expected = editStage
      ? edit!
      : w.stage === 'inspection'
        ? inspection
        : { id: loreControlJobId(i, 'lore-field', index), startHash: readHash(raw.startHash) };
    progress = restoredProgress(
      raw,
      editStage ? 'edit' : w.stage === 'inspection' ? 'inspection' : 'upload',
      expected,
    );
  }
  if (
    (w.phase === 'idle' &&
      (calls !== 0 ||
        index !== 0 ||
        w.progress !== null ||
        w.pending !== null ||
        w.failedCancel !== null)) ||
    (w.phase === 'cancelled' &&
      (w.stage !== 'inspection' ||
        index !== count ||
        progress?.phase !== 'cancelled' ||
        w.pending !== null)) ||
    (w.phase === 'applied' && (progress?.phase !== 'adopted' || w.pending !== null))
  )
    journalFail();
  if (progress?.phase === 'adopted') {
    const p = progress as ReturnType<typeof editProgress>;
    if (
      p.revision < 1 ||
      p.adoption?.operationId !==
        loreControlUnitId(i, 'adoptBookLoreEditGeneration', p.id, p.revision - 1)
    )
      journalFail();
  }
  return v as unknown as LoreJournalControls;
}
export const emptyLoreControlWorker = (): LoreControlWorker => ({
  phase: 'idle',
  stage: 'uploads',
  uploadIndex: 0,
  completedCalls: 0,
  progress: null,
  blockedReason: null,
  pending: null,
  failedCancel: null,
});
