import { readObject, readId, readCount, readHash } from './bookLoreReadContracts';
import { freezeLoreEditValue } from './bookLoreWritePlan';
import { bookLoreWriteHash as hash } from './bookLoreWritePayload';
import { bookLoreCreationIdentity } from './bookLoreCreationPlan';
import { creationProgress } from './bookLoreCreationProgress';
import { readLoreControlStoredProgress } from './bookLoreControlContracts';
import { journalBlob, journalFail, type LoreJournalBlob } from './bookLoreJournalContracts';
import type { CreationTicket } from './bookLoreCreationTicketContracts';
import type { BookLoreCreationCheckpoint } from './bookLoreCreationOperation';
import type { LoreUploadProgress, LoreEditProgress } from './bookLoreWriteProgress';

export type CreationCheckpointScope = Pick<
  CreationTicket,
  'uid' | 'writeId' | 'bookId' | 'loreId' | 'creationId' | 'intentHash' | 'uploadCount'
>;
export interface CreationCheckpointPage {
  intentHash: string;
  items: { id: string; progress: LoreUploadProgress | null }[];
  nextOffset: number | null;
}
export interface CreationCheckpointBundle {
  schemaVersion: 1;
  checkpoint: BookLoreCreationCheckpoint;
  pages: CreationCheckpointPage[];
}
export interface CreationCheckpointOutcome {
  id: string;
  baseGeneration: string;
  requestHash: string;
  checkpoint: BookLoreCreationCheckpoint;
  patch: { offset: number; page: CreationCheckpointPage } | null;
}
export interface CreationCheckpointState {
  active: LoreJournalBlob | null;
  pending: LoreJournalBlob | null;
  garbage: { blob: LoreJournalBlob; next: number } | null;
  outcome: CreationCheckpointOutcome | null;
  receipt: { id: string; hash: string } | null;
}
export const emptyCreationCheckpoint = (): CreationCheckpointState => ({
  active: null,
  pending: null,
  garbage: null,
  outcome: null,
  receipt: null,
});
export function creationCheckpointJob(i: CreationCheckpointScope, kind: string, index = 0) {
  return (
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
    })
  );
}
function root(value: unknown, i: CreationCheckpointScope, privateWire: boolean) {
  const v = readObject(freezeLoreEditValue(value), [
    'schemaVersion',
    'kind',
    'uid',
    'writeId',
    'bookId',
    'loreId',
    'creationId',
    'intentHash',
    'phase',
    'parent',
    'edit',
    'cancelRequested',
    'completedCalls',
    'initialized',
    'reserved',
    'uploadIndex',
    'resolutionIndex',
    'uploadCount',
    'controlsHash',
    'pending',
  ]);
  if (
    v.schemaVersion !== 1 ||
    v.kind !== 'creation' ||
    ['uid', 'writeId', 'bookId', 'loreId', 'creationId', 'intentHash', 'uploadCount'].some(
      (k) => v[k] !== i[k as keyof CreationCheckpointScope],
    ) ||
    !['preparing', 'ready', 'applied', 'cancelling', 'cancelled', 'conflict'].includes(
      v.phase as string,
    )
  )
    journalFail();
  for (const k of ['cancelRequested', 'initialized']) if (typeof v[k] !== 'boolean') journalFail();
  for (const k of ['completedCalls', 'reserved', 'uploadIndex', 'resolutionIndex', 'uploadCount'])
    readCount(v[k]);
  for (const k of ['reserved', 'uploadIndex', 'resolutionIndex'])
    if ((v[k] as number) > (v.uploadCount as number)) journalFail();
  readHash(v.controlsHash);
  const p = readObject(v.pending, ['production', 'cleanup', 'failedCancel']);
  if (!privateWire && Object.values(p).some((x) => x !== null)) journalFail();
  // Private wires are fully rebuilt by the pure coordinator before accepting a bundle.
  if (v.parent !== null)
    creationProgress(v.parent, bookLoreCreationIdentity(i.uid, i.writeId, i.bookId));
  if (v.edit !== null) {
    const e = readObject(
      v.edit,
      ['id'],
      [
        'startHash',
        'jobToken',
        'phase',
        'revision',
        'reservedCount',
        'releasedCount',
        'blockedReason',
        'compilation',
        'adoption',
      ],
    );
    readLoreControlStoredProgress(e, 'edit', {
      id: creationCheckpointJob(i, 'lore-edit'),
      startHash: readHash(e.startHash),
    });
  }
  const e = v.edit as LoreEditProgress | null;
  const parent = v.parent as ReturnType<typeof creationProgress> | null;
  if (
    (v.initialized && !e?.jobToken) ||
    (!v.initialized && v.reserved !== 0) ||
    (v.phase === 'cancelling' && !v.cancelRequested) ||
    (v.cancelRequested &&
      !['cancelling', 'cancelled', 'applied', 'conflict'].includes(v.phase as string)) ||
    (v.phase === 'cancelled' && parent?.phase !== 'cancelled') ||
    (v.phase === 'conflict' && !parent?.adoption) ||
    (v.phase === 'ready' &&
      (!v.initialized ||
        v.reserved !== v.uploadCount ||
        v.uploadIndex !== v.uploadCount ||
        e?.compilation?.phase !== 'ready')) ||
    (v.phase === 'applied' &&
      (e?.phase !== 'adopted' ||
        !e.adoption ||
        e.adoption.operationId !==
          hash({
            domain: 'writer-book-lore-client-unit',
            uid: i.uid,
            writeId: i.writeId,
            bookId: i.bookId,
            loreId: i.loreId,
            method: 'adoptBookLoreEditGeneration',
            id: e.id,
            revision: e.revision - 1,
          })))
  )
    journalFail();
  return v as unknown as BookLoreCreationCheckpoint;
}
export function readCreationCheckpointPage(
  value: unknown,
  i: CreationCheckpointScope,
  offset: number,
) {
  const p = readObject(value, ['intentHash', 'items', 'nextOffset']),
    count = readCount(i.uploadCount),
    end = Math.min(offset + 50, count);
  if (
    offset % 50 !== 0 ||
    offset >= count ||
    p.intentHash !== i.intentHash ||
    !Array.isArray(p.items) ||
    p.items.length !== end - offset ||
    p.nextOffset !== (end < count ? end : null)
  )
    journalFail();
  p.items.forEach((value, at) => {
    const u = readObject(value, ['id', 'progress']),
      id = creationCheckpointJob(i, 'lore-field', offset + at);
    if (u.id !== id) journalFail();
    if (u.progress !== null) {
      const progress = readObject(
        u.progress,
        ['id'],
        [
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
      );
      readLoreControlStoredProgress(progress, 'upload', {
        id,
        startHash: readHash(progress.startHash),
      });
    }
  });
  return p as unknown as CreationCheckpointPage;
}
export function readCreationCheckpointBundle(value: unknown, i: CreationCheckpointScope) {
  const v = readObject(freezeLoreEditValue(value), ['schemaVersion', 'checkpoint', 'pages']),
    r = root(v.checkpoint, i, true),
    count = readCount(i.uploadCount);
  if (v.schemaVersion !== 1 || !Array.isArray(v.pages) || v.pages.length !== Math.ceil(count / 50))
    journalFail();
  let digest = hash({ domain: 'writer-lore-creation-controls', intentHash: i.intentHash, count });
  v.pages.forEach((p, at) => {
    const page = readCreationCheckpointPage(p, i, at * 50);
    for (const u of page.items) digest = hash({ previous: digest, id: u.id, progress: u.progress });
  });
  if (digest !== r.controlsHash) journalFail();
  return v as unknown as CreationCheckpointBundle;
}
export function readCreationCheckpointOutcome(value: unknown, i: CreationCheckpointScope) {
  const v = readObject(freezeLoreEditValue(value), [
    'id',
    'baseGeneration',
    'requestHash',
    'checkpoint',
    'patch',
  ]);
  readId(v.id);
  readId(v.baseGeneration);
  readHash(v.requestHash);
  root(v.checkpoint, i, false);
  if (v.patch !== null) {
    const p = readObject(v.patch, ['offset', 'page']);
    readCreationCheckpointPage(p.page, i, readCount(p.offset));
  }
  return v as unknown as CreationCheckpointOutcome;
}
export const creationOutcomeHash = (o: CreationCheckpointOutcome) => hash(o);
export function readCreationCheckpointState(value: unknown, i: CreationCheckpointScope) {
  const v = readObject(value, ['active', 'pending', 'garbage', 'outcome', 'receipt']);
  const a = v.active === null ? null : journalBlob(v.active),
    p = v.pending === null ? null : journalBlob(v.pending);
  if ((a && !a.complete) || (p && p.complete)) journalFail();
  const generations = [a?.generation, p?.generation].filter(Boolean);
  if (v.garbage !== null) {
    const g = readObject(v.garbage, ['blob', 'next']),
      b = journalBlob(g.blob),
      n = readCount(g.next);
    if (!b.complete || n > b.chunkCount + 1 || !a) journalFail();
    generations.push(b.generation);
  }
  if (new Set(generations).size !== generations.length) journalFail();
  if (v.outcome !== null) {
    const o = readCreationCheckpointOutcome(v.outcome, i);
    if (!a || o.baseGeneration !== a.generation) journalFail();
  }
  if (v.receipt !== null) {
    const r = readObject(v.receipt, ['id', 'hash']);
    readId(r.id);
    readHash(r.hash);
  }
  return v as unknown as CreationCheckpointState;
}
const same = (a: unknown, b: unknown) => hash(a) === hash(b);
export function creationCheckpointTransition(a: CreationTicket, b: CreationTicket) {
  const old = a.checkpoint ?? null,
    next = b.checkpoint ?? null;
  if (!old) {
    if (
      next &&
      (next.active || next.garbage || next.outcome || next.receipt || next.pending?.written)
    )
      journalFail();
    return;
  }
  if (!next) {
    if (!b.discard || b.discard.phase === 'requested') journalFail();
    return;
  }
  const promoted = old.pending && next.active?.generation === old.pending.generation;
  if (promoted) {
    if (
      next.pending ||
      next.outcome ||
      old.garbage ||
      old.pending!.written !== old.pending!.chunkCount ||
      next.active!.byteLength !== old.pending!.byteLength ||
      next.active!.chunkCount !== old.pending!.chunkCount ||
      (old.active
        ? !next.garbage || !same(next.garbage.blob, old.active) || next.garbage.next !== 0
        : next.garbage !== null)
    )
      journalFail();
    if (!old.outcome && !same(old.receipt, next.receipt)) journalFail();
    if (
      old.outcome &&
      (!next.receipt ||
        next.receipt.id !== old.outcome.id ||
        next.receipt.hash !== creationOutcomeHash(old.outcome))
    )
      journalFail();
  } else {
    if (!same(old.active, next.active)) journalFail();
    if (old.pending) {
      if (
        !next.pending ||
        old.pending.generation !== next.pending.generation ||
        old.pending.byteLength !== next.pending.byteLength ||
        old.pending.chunkCount !== next.pending.chunkCount ||
        next.pending.written < old.pending.written
      )
        journalFail();
    }
    if (old.garbage && next.garbage) {
      if (!same(old.garbage, next.garbage)) journalFail();
    } else if (old.garbage || next.garbage) journalFail();
    if (old.outcome && (!next.outcome || !same(old.outcome, next.outcome))) journalFail();
    if (!same(old.receipt, next.receipt)) journalFail();
  }
}
export function creationCheckpointInventory(t: CreationTicket) {
  const c = t.checkpoint;
  return c
    ? [c.active, c.pending, c.garbage?.blob]
        .filter((b): b is LoreJournalBlob => !!b)
        .map((b) => ({ generation: b.generation, chunkCount: b.chunkCount }))
    : [];
}
