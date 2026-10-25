import { readObject, readId, readHash, readCount } from './bookLoreReadContracts';
import { freezeLoreEditValue } from './bookLoreWritePlan';
import { bookLoreWriteHash as hash } from './bookLoreWritePayload';
import { bookLoreCreationIdentity } from './bookLoreCreationPlan';
import { creationProgress, type LoreCreationProgress } from './bookLoreCreationProgress';
import {
  readLoreRecoveryView,
  type LoreRecoveryView,
  type LoreRecoveryControl,
  type LorePreparationIntent,
} from './bookLorePreparationContracts';
import {
  journalIdentity,
  journalBlob,
  journalFail,
  type LoreJournalIdentity,
  type LoreJournalBlob,
} from './bookLoreJournalContracts';

import {
  readCreationCheckpointState,
  creationCheckpointInventory,
  type CreationCheckpointState,
} from './bookLoreCreationCheckpointContracts';

import {
  readCreationAdoptionState,
  type CreationAdoptionState,
} from './bookLoreCreationAdoptionContracts';

export interface CreationMetaWire {
  readonly method: string;
  readonly input: Readonly<Record<string, unknown>>;
}
export interface CreationTicket {
  schemaVersion: 1;
  kind: 'creation';
  uid: string;
  writeId: string;
  bookId: string;
  loreId: string;
  creationId: string;
  intentHash: string | null;
  uploadCount: number | null;
  stamp: string;
  cancelRequested: boolean;
  releaseRequested: boolean;
  startState: 'pending' | 'confirmed';
  parent: LoreCreationProgress | null;
  closing: { wire: CreationMetaWire; state: 'pending' | 'confirmed' } | null;
  keyState: 'none' | 'pending' | 'confirmed';
  identity: LoreJournalIdentity | null;
  keyView: LoreRecoveryView | null;
  revoke: { wire: LoreRecoveryControl; state: 'pending' | 'confirmed' } | null;
  jobsClosed: boolean;
  draft: LoreJournalBlob | null;
  checkpoint?: CreationCheckpointState | null;
  ownApply?: CreationAdoptionState | null;
  discard: {
    phase: 'requested' | 'purging' | 'complete';
    generation: string | null;
    deleted: number;
    checkpoints?: { generation: string; chunkCount: number }[];
  } | null;
}
export function creationRecoveryIntent(
  t: Pick<CreationTicket, 'writeId' | 'bookId' | 'loreId' | 'intentHash' | 'parent' | 'creationId'>,
) {
  if (!t.parent?.jobToken) journalFail();
  return {
    writeId: t.writeId,
    bookId: t.bookId,
    loreId: t.loreId,
    sourceToken: t.parent.jobToken,
    intentHash: readHash(t.intentHash),
    creation: {
      creationId: t.creationId,
      startHash: t.parent.startHash,
      jobToken: t.parent.jobToken,
    },
  } satisfies LorePreparationIntent & {
    creation: { creationId: string; startHash: string; jobToken: string };
  };
}
export const creationRecoveryHash = (t: CreationTicket) =>
  hash({
    domain: 'writer-lore-edit-recovery',
    schemaVersion: 1,
    uid: t.uid,
    intent: creationRecoveryIntent(t),
  });
export const creationTicketScope = (t: CreationTicket) =>
  hash({
    uid: t.uid,
    writeId: t.writeId,
    bookId: t.bookId,
    loreId: t.loreId,
    creationId: t.creationId,
  });
export const creationJobsClosed = (t: CreationTicket) =>
  t.jobsClosed || t.ownApply?.phase === 'confirmed';
export const creationKeyClosed = (t: CreationTicket) =>
  creationJobsClosed(t) &&
  t.releaseRequested &&
  ((t.keyState === 'none' && t.intentHash === null && !t.identity && !t.draft) ||
    (t.keyState === 'none' && t.parent?.jobToken === null) ||
    (t.revoke?.state === 'confirmed' && t.keyView?.phase === 'revoked'));
export function readCreationTicket(value: unknown, uid: string, writeId: string): CreationTicket {
  const v = readObject(
    freezeLoreEditValue(value),
    [
      'schemaVersion',
      'kind',
      'uid',
      'writeId',
      'bookId',
      'loreId',
      'creationId',
      'intentHash',
      'uploadCount',
      'stamp',
      'cancelRequested',
      'releaseRequested',
      'startState',
      'parent',
      'closing',
      'keyState',
      'identity',
      'keyView',
      'revoke',
      'jobsClosed',
      'draft',
      'discard',
    ],
    ['checkpoint', 'ownApply'],
  );
  const expected = bookLoreCreationIdentity(readId(uid), readId(writeId), readId(v.bookId));
  if (
    v.schemaVersion !== 1 ||
    v.kind !== 'creation' ||
    v.uid !== uid ||
    v.writeId !== writeId ||
    v.loreId !== expected.loreId ||
    v.creationId !== expected.creationId ||
    !['pending', 'confirmed'].includes(v.startState as string) ||
    !['none', 'pending', 'confirmed'].includes(v.keyState as string)
  )
    journalFail();
  if ((v.intentHash === null) !== (v.uploadCount === null)) journalFail();
  if (v.intentHash !== null) {
    readHash(v.intentHash);
    if (readCount(v.uploadCount) < 2) journalFail();
  }
  readId(v.stamp);
  for (const k of ['cancelRequested', 'releaseRequested', 'jobsClosed'])
    if (typeof v[k] !== 'boolean') journalFail();
  if (v.releaseRequested && !v.cancelRequested) journalFail();
  const parent =
    v.parent === null
      ? null
      : creationProgress(v.parent, {
          ...expected,
          startHash: expected.startHash,
        });
  if (v.startState === 'confirmed' && !parent) journalFail();
  if (v.jobsClosed && (!v.cancelRequested || parent?.phase !== 'cancelled')) journalFail();
  const identity = v.identity === null ? null : journalIdentity(v.identity);
  if (
    identity &&
    (identity.uid !== uid ||
      identity.writeId !== writeId ||
      identity.bookId !== v.bookId ||
      identity.loreId !== v.loreId ||
      identity.intentHash !== v.intentHash ||
      identity.sourceToken !== parent?.jobToken)
  )
    journalFail();
  const t = { ...v, parent, identity } as unknown as CreationTicket;
  if (v.keyState !== 'none' && (!parent?.jobToken || v.intentHash === null)) journalFail();
  if (identity && identity.requestHash !== creationRecoveryHash(t)) journalFail();
  if (v.keyView !== null) {
    const view = readLoreRecoveryView(v.keyView, uid, creationRecoveryIntent(t), identity);
    if ((view.keyId !== null && !identity) || v.keyState !== 'confirmed') journalFail();
  } else if (v.keyState === 'confirmed' || identity) journalFail();
  if (v.closing !== null) {
    const c = readObject(v.closing, ['wire', 'state']),
      w = readObject(c.wire, ['method', 'input']);
    if (
      !v.cancelRequested ||
      !['pending', 'confirmed'].includes(c.state as string) ||
      ![
        'getBookLoreCreationReservation',
        'cancelBookLoreCreationReservation',
        'advanceBookLoreCreationCleanup',
      ].includes(w.method as string)
    )
      journalFail();
    const get = w.method === 'getBookLoreCreationReservation',
      advance = w.method === 'advanceBookLoreCreationCleanup';
    const r = readObject(
      w.input,
      [
        'bookId',
        'creationId',
        ...(!get ? ['operationId'] : []),
        ...(advance ? ['jobToken', 'expectedRevision'] : []),
      ],
      !advance ? ['jobToken'] : [],
    );
    if (
      r.bookId !== v.bookId ||
      r.creationId !== v.creationId ||
      (r.jobToken !== undefined && r.jobToken !== parent?.jobToken)
    )
      journalFail();
    if (!get) readId(r.operationId);
    if (advance) readCount(r.expectedRevision);
  }
  if (v.ownApply !== undefined && v.ownApply !== null) readCreationAdoptionState(v.ownApply, t);
  if (v.revoke !== null) {
    const r = readObject(v.revoke, ['wire', 'state']),
      w = readObject(r.wire, ['writeId', 'requestHash'], ['jobToken']);
    if (
      !v.releaseRequested ||
      !creationJobsClosed(t) ||
      !['pending', 'confirmed'].includes(r.state as string) ||
      w.writeId !== writeId ||
      w.requestHash !== creationRecoveryHash(t) ||
      (w.jobToken !== undefined && w.jobToken !== identity?.jobToken)
    )
      journalFail();
    if (r.state === 'confirmed' && t.keyView?.phase !== 'revoked') journalFail();
  }
  if (v.draft !== null) {
    journalBlob(v.draft);
    if (!identity) journalFail();
  }
  if (v.checkpoint !== undefined && v.checkpoint !== null) {
    if (!identity || !t.draft?.complete) journalFail();
    readCreationCheckpointState(v.checkpoint, t);
  }
  if (v.discard !== null) {
    const d = readObject(v.discard, ['phase', 'generation', 'deleted'], ['checkpoints']);
    if (d.checkpoints !== undefined) {
      if (!Array.isArray(d.checkpoints) || d.checkpoints.length > 3) journalFail();
      const generations = new Set<string>();
      for (const raw of d.checkpoints) {
        const b = readObject(raw, ['generation', 'chunkCount']);
        const gen = readId(b.generation);
        if (generations.has(gen) || readCount(b.chunkCount) < 1) journalFail();
        generations.add(gen);
      }
    }
    if (
      d.phase === 'requested' &&
      hash(d.checkpoints ?? []) !== hash(creationCheckpointInventory(t))
    )
      journalFail();
    if (d.phase !== 'requested' && v.checkpoint) journalFail();
    if (
      !v.cancelRequested ||
      !v.releaseRequested ||
      !['requested', 'purging', 'complete'].includes(d.phase as string)
    )
      journalFail();
    if (d.generation !== null) readId(d.generation);
    readCount(d.deleted);
    if (d.phase !== 'requested' && (!creationKeyClosed(t) || v.draft !== null)) journalFail();
    if (d.phase === 'requested' && d.generation !== (t.draft?.generation ?? null)) journalFail();
  }
  return v as unknown as CreationTicket;
}
