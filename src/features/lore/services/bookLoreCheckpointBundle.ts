import { readObject, readCount, readHash, readId } from './bookLoreReadContracts';
import { freezeLoreEditValue } from './bookLoreWritePlan';
import { bookLoreWriteHash as hash } from './bookLoreWritePayload';
import {
  journalWire,
  journalFail,
  type LoreJournalIdentity,
  type LoreJournalLane,
} from './bookLoreJournalContracts';
import {
  inspectionProgress,
  uploadProgress,
  editProgress,
  loreCleanupBlocks,
  type LoreCleanupBlock,
  type LoreInspectionProgress,
  type LoreEditProgress,
} from './bookLoreWriteProgress';
import type { BookLoreEditCheckpoint } from './bookLoreEditCheckpoint';
import type { BookLoreEditControlPage } from './bookLoreEditOperation';
export interface LoreCheckpointConfirmation {
  readonly lane: LoreJournalLane;
  readonly requestHash: string;
}
/** Private wire and controls. Persist only through the encrypted journal. */
export interface BookLoreCheckpointBundle {
  readonly schemaVersion: 1;
  readonly checkpoint: BookLoreEditCheckpoint;
  readonly pages: readonly BookLoreEditControlPage[];
  readonly confirmed: readonly LoreCheckpointConfirmation[];
}
export function captureBookLoreEditCheckpoint(
  operation: {
    checkpoint(): BookLoreEditCheckpoint;
    controlsPage(offset: number, limit: number): BookLoreEditControlPage;
  },
  confirmed: readonly LoreCheckpointConfirmation[] = [],
): BookLoreCheckpointBundle {
  const checkpoint = operation.checkpoint(),
    pages: BookLoreEditControlPage[] = [];
  for (let offset = 0; offset < checkpoint.uploadCount; offset += 50)
    pages.push(operation.controlsPage(offset, Math.min(50, checkpoint.uploadCount - offset)));
  return freezeLoreEditValue({
    schemaVersion: 1,
    checkpoint,
    pages,
    confirmed,
  }) as BookLoreCheckpointBundle;
}
export function readBookLoreCheckpointBundle(
  value: unknown,
  identity: LoreJournalIdentity,
): BookLoreCheckpointBundle {
  const bundle = readObject(freezeLoreEditValue(value), [
      'schemaVersion',
      'checkpoint',
      'pages',
      'confirmed',
    ]),
    root = readObject(bundle.checkpoint, [
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
    ]);
  if (
    bundle.schemaVersion !== 1 ||
    root.schemaVersion !== 1 ||
    ['uid', 'writeId', 'bookId', 'loreId', 'sourceToken', 'intentHash'].some(
      (k) => root[k] !== identity[k as keyof LoreJournalIdentity],
    ) ||
    !['empty', 'preparing', 'ready', 'applied', 'cancelling', 'cancelled'].includes(
      root.phase as string,
    ) ||
    (root.blockedReason !== null &&
      !loreCleanupBlocks.includes(root.blockedReason as LoreCleanupBlock))
  )
    journalFail();
  for (const k of ['cancelRequested', 'initialized', 'hasEditIntent'])
    if (typeof root[k] !== 'boolean') journalFail();
  for (const k of [
    'completedCalls',
    'reservationIndex',
    'productionUploadIndex',
    'cleanupUploadIndex',
    'uploadCount',
  ])
    readCount(root[k]);
  readHash(root.controlsHash);
  const count = root.uploadCount as number;
  if (
    [root.reservationIndex, root.productionUploadIndex, root.cleanupUploadIndex].some(
      (n) => (n as number) > count,
    ) ||
    !Array.isArray(bundle.pages) ||
    bundle.pages.length !== Math.ceil(count / 50)
  )
    journalFail();
  const derived = (kind: string, index = 0) =>
    kind +
    '-' +
    hash({
      domain: 'writer-book-lore-client-job',
      uid: identity.uid,
      writeId: identity.writeId,
      bookId: identity.bookId,
      loreId: identity.loreId,
      kind,
      index,
    });
  const normalize = (value: unknown, key: string) => {
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
    return { ...raw, [key]: id };
  };
  let inspection: LoreInspectionProgress | null = null,
    edit: LoreEditProgress | null = null;
  if (root.inspection !== null) {
    const intent = {
      bookId: identity.bookId,
      loreId: identity.loreId,
      inspectionId: derived('lore-source'),
      sourceToken: identity.sourceToken,
    };
    inspection = inspectionProgress(normalize(root.inspection, 'inspectionId'), {
      id: intent.inspectionId,
      startHash: hash({ domain: 'writer-lore-source-inspection', schemaVersion: 1, intent }),
    });
  }
  if (root.edit !== null) {
    if (!root.hasEditIntent) journalFail();
    const p = normalize(root.edit, 'editId');
    edit = editProgress(
      p,
      { id: derived('lore-edit'), startHash: readHash(p.startHash) },
      Number.MAX_SAFE_INTEGER,
    );
  }
  if (
    (!root.initialized && root.reservationIndex !== 0) ||
    (root.initialized && !edit?.jobToken) ||
    (!root.hasEditIntent && (root.initialized || root.reservationIndex !== 0 || edit !== null)) ||
    (root.hasEditIntent && !inspection?.jobToken) ||
    (root.phase === 'cancelling' && !root.cancelRequested) ||
    (root.cancelRequested &&
      !['cancelling', 'cancelled', 'applied'].includes(root.phase as string)) ||
    (root.phase === 'applied' && edit?.phase !== 'adopted') ||
    (root.phase === 'ready' &&
      (edit?.compilation?.phase !== 'ready' ||
        !root.initialized ||
        root.reservationIndex !== count ||
        root.productionUploadIndex !== count)) ||
    (root.phase === 'cancelled' &&
      (count > 0 || inspection !== null || root.hasEditIntent) &&
      (root.cleanupUploadIndex !== count ||
        inspection?.phase !== 'cancelled' ||
        (root.hasEditIntent && edit?.phase !== 'cancelled')))
  )
    journalFail();
  const pending = readObject(root.pending, ['production', 'cleanup', 'failedCancel']);
  if (
    (['empty', 'applied', 'cancelled'].includes(root.phase as string) &&
      Object.values(pending).some((v) => v !== null)) ||
    (!root.cancelRequested && (pending.cleanup !== null || pending.failedCancel !== null))
  )
    journalFail();
  for (const lane of ['production', 'cleanup', 'failedCancel'] as const)
    if (pending[lane] !== null) {
      const wire = journalWire(pending[lane], identity);
      if (
        lane === 'production'
          ? wire.metadata.lane !== 'production'
          : wire.metadata.lane === 'production'
      )
        journalFail();
      if (lane === 'failedCancel' && wire.wire.method !== 'cancelBookLoreEditReservation')
        journalFail();
    }
  let digest = hash({
    domain: 'writer-lore-edit-control-pages',
    intentHash: identity.intentHash,
    count,
  });
  for (const [pageIndex, raw] of bundle.pages.entries()) {
    const page = readObject(raw, ['intentHash', 'items', 'nextOffset']),
      offset = pageIndex * 50,
      end = Math.min(offset + 50, count);
    if (
      page.intentHash !== identity.intentHash ||
      !Array.isArray(page.items) ||
      page.items.length !== end - offset ||
      page.nextOffset !== (end < count ? end : null)
    )
      journalFail();
    for (const [local, rawItem] of page.items.entries()) {
      const item = readObject(rawItem, ['id', 'startHash', 'progress']);
      if (readId(item.id) !== derived('lore-field', offset + local)) journalFail();
      readHash(item.startHash);
      if (item.progress !== null) {
        const p = normalize(item.progress, 'uploadId'),
          total = readCount(p.totalParts),
          next = readCount(p.nextIndex);
        uploadProgress(
          p,
          { id: item.id as string, startHash: item.startHash as string },
          {
            chunkCount: total,
            byteLength: next === total ? readCount(p.byteLength) : total * 65536,
          },
        );
      }
      const p = item.progress as { phase: string; jobToken: string | null } | null,
        index = offset + local;
      if (
        (root.hasEditIntent && !p?.jobToken) ||
        (index < (root.cleanupUploadIndex as number) && p?.phase !== 'cancelled') ||
        (!root.cancelRequested &&
          index < (root.productionUploadIndex as number) &&
          !['sealed', 'reserved'].includes(p?.phase ?? ''))
      )
        journalFail();
      digest = hash({
        previous: digest,
        id: item.id,
        startHash: item.startHash,
        progress: item.progress,
      });
    }
  }
  if (digest !== root.controlsHash) journalFail();
  if (!Array.isArray(bundle.confirmed) || bundle.confirmed.length > 3) journalFail();
  const lanes = new Set();
  for (const raw of bundle.confirmed) {
    const c = readObject(raw, ['lane', 'requestHash']);
    if (!['production', 'cleanup', 'diagnostic'].includes(c.lane as string) || lanes.has(c.lane))
      journalFail();
    lanes.add(c.lane);
    readHash(c.requestHash);
  }
  return bundle as unknown as BookLoreCheckpointBundle;
}
