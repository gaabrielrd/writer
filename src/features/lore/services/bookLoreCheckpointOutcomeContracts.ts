import { readObject, readId, readHash, readCount } from './bookLoreReadContracts';
import { freezeLoreEditValue } from './bookLoreWritePlan';
import { bookLoreWriteHash as hash } from './bookLoreWritePayload';
import {
  journalFail,
  type LoreJournalIdentity,
  type LoreJournalHead,
} from './bookLoreJournalContracts';
import {
  loreControlJobId,
  loreControlUnitId,
  loreInspectionControl,
  readLoreControlStoredProgress,
} from './bookLoreControlContracts';
import type { BookLoreEditCheckpoint } from './bookLoreEditCheckpoint';
import type {
  BookLoreCheckpointBundle,
  LoreCheckpointConfirmation,
} from './bookLoreCheckpointBundle';
import type { BookLoreEditControlPage } from './bookLoreEditOperation';
import {
  loreCleanupBlocks,
  type LoreCleanupBlock,
  type LoreInspectionProgress,
  type LoreEditProgress,
} from './bookLoreWriteProgress';
type Identity = Pick<
  LoreJournalIdentity,
  'uid' | 'writeId' | 'bookId' | 'loreId' | 'sourceToken' | 'intentHash'
>;
export interface LoreCheckpointOutcome {
  schemaVersion: 1;
  id: string;
  baseGeneration: string | null;
  checkpoint: BookLoreEditCheckpoint;
  patch: { offset: number; page: BookLoreEditControlPage } | null;
  confirmed: readonly LoreCheckpointConfirmation[];
}
export interface LoreCheckpointOutcomeReceipt {
  id: string;
  hash: string;
}
function rootMetadata(value: unknown, i: Identity): BookLoreEditCheckpoint {
  const r = readObject(value, [
      'schemaVersion',
      'uid',
      'writeId',
      'bookId',
      'loreId',
      'sourceToken',
      'intentHash',
      'phase',
      'completedCalls',
      'blockedReason',
      'cancelRequested',
      'initialized',
      'reservationIndex',
      'productionUploadIndex',
      'cleanupUploadIndex',
      'uploadCount',
      'hasEditIntent',
      'controlsHash',
      'inspection',
      'edit',
      'pending',
    ]),
    pending = readObject(r.pending, ['production', 'cleanup', 'failedCancel']);
  if (
    r.schemaVersion !== 1 ||
    ['uid', 'writeId', 'bookId', 'loreId', 'sourceToken', 'intentHash'].some(
      (k) => r[k] !== i[k as keyof Identity],
    ) ||
    !['empty', 'preparing', 'ready', 'applied'].includes(r.phase as string) ||
    Object.values(pending).some((v) => v !== null) ||
    (r.blockedReason !== null && !loreCleanupBlocks.includes(r.blockedReason as LoreCleanupBlock))
  )
    journalFail();
  for (const k of ['cancelRequested', 'initialized', 'hasEditIntent'])
    if (typeof r[k] !== 'boolean') journalFail();
  for (const k of [
    'completedCalls',
    'reservationIndex',
    'productionUploadIndex',
    'cleanupUploadIndex',
    'uploadCount',
  ])
    readCount(r[k]);
  readHash(r.controlsHash);
  const count = r.uploadCount as number;
  if (
    [r.reservationIndex, r.productionUploadIndex, r.cleanupUploadIndex].some(
      (n) => (n as number) > count,
    ) ||
    (!r.initialized && r.reservationIndex !== 0) ||
    (!r.hasEditIntent && (r.initialized || r.reservationIndex !== 0 || r.edit !== null)) ||
    (r.cancelRequested && r.phase !== 'applied')
  )
    journalFail();
  const inspection =
      r.inspection === null
        ? null
        : (readLoreControlStoredProgress(
            r.inspection,
            'inspection',
            loreInspectionControl(i),
          ) as LoreInspectionProgress),
    rawEdit =
      r.edit === null
        ? null
        : readObject(
            r.edit,
            ['id', 'startHash'],
            [
              'jobToken',
              'phase',
              'revision',
              'reservedCount',
              'releasedCount',
              'blockedReason',
              'compilation',
              'adoption',
            ],
          ),
    edit = rawEdit
      ? (readLoreControlStoredProgress(rawEdit, 'edit', {
          id: loreControlJobId(i, 'lore-edit'),
          startHash: readHash(rawEdit.startHash),
        }) as LoreEditProgress)
      : null;
  if (
    (r.hasEditIntent && !inspection?.jobToken) ||
    (r.initialized && !edit?.jobToken) ||
    (r.phase === 'ready' &&
      (edit?.compilation?.phase !== 'ready' ||
        !r.initialized ||
        r.reservationIndex !== count ||
        r.productionUploadIndex !== count)) ||
    (r.phase === 'applied' &&
      (edit?.phase !== 'adopted' ||
        !edit.adoption ||
        edit.adoption.operationId !==
          loreControlUnitId(i, 'adoptBookLoreEditGeneration', edit.id, edit.revision - 1)))
  )
    journalFail();
  return r as unknown as BookLoreEditCheckpoint;
}
export function readCheckpointOutcome(value: unknown, i: Identity): LoreCheckpointOutcome | null {
  if (value === null || value === undefined) return null;
  const v = readObject(freezeLoreEditValue(value), [
    'schemaVersion',
    'id',
    'baseGeneration',
    'checkpoint',
    'patch',
    'confirmed',
  ]);
  if (v.schemaVersion !== 1) journalFail();
  readId(v.id);
  if (v.baseGeneration !== null) readId(v.baseGeneration);
  const root = rootMetadata(v.checkpoint, i),
    count = root.uploadCount;
  if (!Array.isArray(v.confirmed) || v.confirmed.length > 1) journalFail();
  for (const raw of v.confirmed) {
    const c = readObject(raw, ['lane', 'requestHash']);
    if (c.lane !== 'production') journalFail();
    readHash(c.requestHash);
  }
  if (v.patch !== null) {
    const p = readObject(v.patch, ['offset', 'page']),
      offset = readCount(p.offset),
      page = readObject(p.page, ['intentHash', 'items', 'nextOffset']),
      end = Math.min(offset + 50, count);
    if (
      offset % 50 !== 0 ||
      offset >= count ||
      page.intentHash !== i.intentHash ||
      !Array.isArray(page.items) ||
      page.items.length !== end - offset ||
      page.nextOffset !== (end < count ? end : null)
    )
      journalFail();
    for (const [n, raw] of page.items.entries()) {
      const item = readObject(raw, ['id', 'startHash', 'progress']);
      if (item.id !== loreControlJobId(i, 'lore-field', offset + n)) journalFail();
      readHash(item.startHash);
      if (item.progress !== null)
        readLoreControlStoredProgress(item.progress, 'upload', {
          id: item.id,
          startHash: item.startHash as string,
        });
    }
  }
  if (
    v.baseGeneration === null &&
    (v.patch !== null ||
      v.confirmed.length !== 0 ||
      root.completedCalls !== 0 ||
      root.initialized ||
      root.hasEditIntent ||
      root.inspection !== null ||
      root.edit !== null ||
      root.reservationIndex !== 0 ||
      root.productionUploadIndex !== 0 ||
      root.cleanupUploadIndex !== 0 ||
      !['empty', 'preparing'].includes(root.phase))
  )
    journalFail();
  return v as unknown as LoreCheckpointOutcome;
}
export function readCheckpointOutcomeReceipt(value: unknown): LoreCheckpointOutcomeReceipt | null {
  if (value === null || value === undefined) return null;
  const v = readObject(value, ['id', 'hash']);
  readId(v.id);
  readHash(v.hash);
  return v as unknown as LoreCheckpointOutcomeReceipt;
}
export const checkpointOutcomeHash = (o: LoreCheckpointOutcome) =>
  hash({
    baseGeneration: o.baseGeneration,
    checkpoint: o.checkpoint,
    patch: o.patch,
    confirmed: o.confirmed,
  });
export function makeCheckpointOutcome(
  before: BookLoreCheckpointBundle | null,
  after: BookLoreCheckpointBundle,
  baseGeneration: string | null,
): LoreCheckpointOutcome {
  let patch: LoreCheckpointOutcome['patch'] = null;
  if (before) {
    if (before.pages.length !== after.pages.length || baseGeneration === null) journalFail();
    for (const [index, page] of after.pages.entries()) {
      const old = before.pages[index]!;
      if (hash(old) !== hash(page)) {
        if (patch || old.items.length !== page.items.length) journalFail();
        for (const [n, item] of page.items.entries())
          if (item.id !== old.items[n]!.id || item.startHash !== old.items[n]!.startHash)
            journalFail();
        patch = { offset: index * 50, page };
      }
    }
  } else if (
    baseGeneration !== null ||
    after.pages.some((p) => p.items.some((item) => item.progress !== null))
  )
    journalFail();
  const r = after.checkpoint,
    i = {
      uid: r.uid,
      writeId: r.writeId,
      bookId: r.bookId,
      loreId: r.loreId,
      sourceToken: r.sourceToken,
      intentHash: r.intentHash,
    };
  return readCheckpointOutcome(
    {
      schemaVersion: 1,
      id: crypto.randomUUID(),
      baseGeneration,
      checkpoint: r,
      patch,
      confirmed: after.confirmed,
    },
    i,
  )!;
}
export function checkCheckpointOutcome(h: LoreJournalHead, bundle: BookLoreCheckpointBundle) {
  const o = h.checkpointOutcome;
  if (!o) return;
  if (
    o.baseGeneration !== (h.checkpoint?.active?.generation ?? null) ||
    hash(o.checkpoint) !== hash(bundle.checkpoint) ||
    hash(o.confirmed) !== hash(bundle.confirmed) ||
    (o.patch && hash(o.patch.page) !== hash(bundle.pages[o.patch.offset / 50])) ||
    (!o.baseGeneration && bundle.pages.some((p) => p.items.some((item) => item.progress !== null)))
  )
    journalFail();
}
export function finishCheckpointOutcome(
  before: LoreJournalHead,
  after: LoreJournalHead,
  bundle: BookLoreCheckpointBundle,
): LoreJournalHead {
  checkCheckpointOutcome(before, bundle);
  const o = before.checkpointOutcome;
  return o
    ? {
        ...after,
        checkpointOutcome: null,
        checkpointOutcomeReceipt: { id: o.id, hash: checkpointOutcomeHash(o) },
      }
    : after;
}
