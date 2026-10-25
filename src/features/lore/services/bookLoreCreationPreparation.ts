import { readId, readObject } from './bookLoreReadContracts';
import { freezeLoreEditValue } from './bookLoreWritePlan';
import { bookLoreCreationIdentity, type BookLoreCreationInput } from './bookLoreCreationPlan';
import { prepareBookLoreCreationOperation } from './bookLoreCreationOperation';
import { creationProgress } from './bookLoreCreationProgress';
import {
  createCreationTicket,
  openCreationTicket,
  type CreationTicketHandle,
} from './bookLoreCreationTicket';
import { creationDraftStore } from './bookLoreCreationDraft';
import { creationCheckpointInventory } from './bookLoreCreationCheckpointContracts';
import { creationCheckpointJournal } from './bookLoreCreationCheckpointJournal';
import {
  creationRecoveryIntent,
  creationRecoveryHash,
  creationKeyClosed,
  type CreationTicket,
  type CreationMetaWire,
} from './bookLoreCreationTicketContracts';
import { readLoreRecoveryView, identityFromRecovery } from './bookLorePreparationContracts';
import {
  journalFail,
  type LoreJournalIdentity,
  type LoreJournalGrant,
} from './bookLoreJournalContracts';
import { bookLoreWriteHash as hash, type BookLoreWriteOptions } from './bookLoreWritePayload';
import type { BookLoreEditPort } from './bookLoreEditOperation';

export interface CreationPreparationEnvironment {
  uid: string;
  guard: () => void;
  edit: BookLoreEditPort;
  recovery: {
    call(
      this: void,
      method: 'reserveBookLoreEditRecovery' | 'revokeBookLoreEditRecovery',
      input: unknown,
    ): Promise<unknown>;
  };
  getKey: (identity: LoreJournalIdentity) => Promise<LoreJournalGrant>;
}
const conflict = (error: unknown) =>
  !!error &&
  typeof error === 'object' &&
  'code' in error &&
  ['failed-precondition', 'functions/failed-precondition'].includes(String(error.code));
/** Bootstraps the protected draft only. Production still requires a persistent coordinator. */
export function prepareCreationRecovery(
  writeId: string,
  env: CreationPreparationEnvironment,
  input?: BookLoreCreationInput,
  options: BookLoreWriteOptions = {},
) {
  const { uid, guard: actor, edit, recovery, getKey } = env;
  const { guard: hostGuard, signal, yieldControl } = options;
  const guard = () => {
    actor();
    hostGuard?.();
  };
  guard();
  readId(uid);
  readId(writeId);
  const frozen = input ? (freezeLoreEditValue(input) as BookLoreCreationInput) : undefined;
  if (frozen && (frozen.uid !== uid || frozen.writeId !== writeId)) journalFail();
  let ticket: CreationTicketHandle | null = null,
    head: CreationTicket | null = null,
    opening: Promise<CreationTicketHandle> | null = null,
    initializing: Promise<ReturnType<typeof snapshot>> | null = null,
    stop = false,
    release = false,
    discard = false,
    closingBusy = false,
    discardVerified = false;
  function snapshot() {
    guard();
    return Object.freeze({
      writeId,
      bookId: head?.bookId ?? frozen?.bookId ?? null,
      phase:
        head?.discard?.phase === 'complete' && discardVerified
          ? 'discarded'
          : head && creationKeyClosed(head)
            ? 'released'
            : head?.jobsClosed
              ? 'cancelled'
              : head?.parent?.phase === 'adopted'
                ? 'conflict'
                : head?.cancelRequested
                  ? 'cancelling'
                  : head?.draft?.complete
                    ? 'copy-ready'
                    : head && !frozen
                      ? 'awaiting-draft'
                      : head
                        ? 'preparing'
                        : 'opening',
      hasRecoveryCopy: !!head?.draft?.complete,
      requiresInput: !!head && !frozen && !head.draft?.complete,
      parent: head?.parent ?? null,
      keyReservePending: head?.keyState === 'pending',
      keyReleased: !!head && creationKeyClosed(head),
      copyDiscarded: !!head && head.discard?.phase === 'complete' && discardVerified,
      discardPhase: head?.discard?.phase ?? null,
      deleted: head?.discard?.deleted ?? 0,
    });
  }
  async function current() {
    guard();
    if (!ticket) journalFail();
    head = await ticket.inspect();
    guard();
    return head;
  }
  async function update(fn: (t: CreationTicket) => CreationTicket) {
    guard();
    if (!ticket) journalFail();
    head = await ticket.mutate(fn);
    guard();
    return head;
  }
  async function acquire() {
    if (ticket) return ticket;
    if (opening) return opening;
    opening = (async () => {
      let opened;
      if (frozen) {
        const id = bookLoreCreationIdentity(uid, writeId, frozen.bookId);
        const initial: CreationTicket = {
          schemaVersion: 1,
          kind: 'creation',
          uid,
          writeId,
          bookId: id.bookId,
          loreId: id.loreId,
          creationId: id.creationId,
          intentHash: null,
          uploadCount: null,
          stamp: crypto.randomUUID(),
          cancelRequested: stop,
          releaseRequested: release,
          startState: 'pending',
          parent: null,
          closing: null,
          keyState: 'none',
          identity: null,
          keyView: null,
          revoke: null,
          jobsClosed: false,
          draft: null,
          discard: discard ? { phase: 'requested', generation: null, deleted: 0 } : null,
        };
        opened = await createCreationTicket(initial, guard);
      } else opened = await openCreationTicket(uid, writeId, guard);
      ticket = opened;
      head = await ticket.inspect();
      guard();
      return ticket;
    })();
    try {
      return await opening;
    } finally {
      opening = null;
    }
  }
  function draft() {
    if (!ticket) journalFail();
    return creationDraftStore(ticket, { guard, signal, yieldControl, getKey });
  }
  async function parentResult(raw: unknown, start: boolean) {
    const t = await current(),
      id = bookLoreCreationIdentity(uid, writeId, t.bookId);
    const p = creationProgress(raw, { ...id, token: t.parent?.jobToken });
    return update((h) => {
      const preserve =
        h.parent &&
        (['cancelled', 'adopted'].includes(h.parent.phase) ||
          (h.parent.phase === 'cancelling' && p.phase === 'preparing') ||
          (h.parent.cleanupRevision ?? 0) > (p.cleanupRevision ?? 0));
      const parent = preserve ? h.parent : p;
      return {
        ...h,
        parent,
        startState: start ? 'confirmed' : h.startState,
        cancelRequested:
          h.cancelRequested || parent?.phase === 'cancelled' || parent?.phase === 'cancelling',
        jobsClosed: h.jobsClosed || parent?.phase === 'cancelled',
      };
    });
  }
  async function initializeWork() {
    await acquire();
    let t = await current();
    if (t.discard?.phase === 'complete') {
      head = await ticket!.purge(1);
      guard();
      discardVerified = true;
      return snapshot();
    }
    if (!t.cancelRequested && !t.parent) {
      const raw = await edit.call('startBookLoreCreationReservation', {
        bookId: t.bookId,
        creationId: t.creationId,
      });
      guard();
      t = await parentResult(raw, true);
    }
    if (t.releaseRequested || t.discard || t.parent?.phase === 'adopted') return snapshot();
    if (!t.cancelRequested && frozen) {
      const op = await prepareBookLoreCreationOperation(
        frozen,
        {
          call() {
            throw Error('Bootstrap never produces.');
          },
        },
        {
          guard: () => {
            guard();
            if (stop) throw Error('A preparação foi cancelada.');
          },
          signal,
          yieldControl,
        },
      );
      guard();
      const s = op.snapshot();
      await update((h) => {
        if (
          h.cancelRequested ||
          h.releaseRequested ||
          (h.intentHash && h.intentHash !== s.intentHash)
        )
          journalFail();
        return { ...h, intentHash: s.intentHash, uploadCount: s.uploads.count };
      });
    }
    t = await current();
    if (
      !t.cancelRequested &&
      t.parent?.phase === 'preparing' &&
      t.intentHash &&
      t.keyState !== 'confirmed'
    ) {
      if (t.keyState === 'none')
        t = await update((h) => {
          if (h.cancelRequested || h.releaseRequested) journalFail();
          return { ...h, keyState: 'pending' };
        });
      const intent = creationRecoveryIntent(t);
      const raw = await recovery.call('reserveBookLoreEditRecovery', intent);
      guard();
      const latest = await current();
      const view = readLoreRecoveryView(raw, uid, creationRecoveryIntent(latest), latest.identity);
      if (latest.keyView?.phase !== 'revoked')
        await update((h) => ({
          ...h,
          keyState: 'confirmed',
          identity: identityFromRecovery(view, uid),
          keyView: view,
          cancelRequested: h.cancelRequested || view.phase === 'revoked',
        }));
    }
    t = await current();
    if (t.releaseRequested || t.discard || t.keyView?.phase !== 'reserved' || !t.identity)
      return snapshot();
    if (t.draft && t.draft.written === t.draft.chunkCount) await draft().readDraft();
    else if (frozen) await draft().saveDraft(frozen);
    head = await ticket!.inspect();
    guard();
    return snapshot();
  }
  function initialize() {
    guard();
    if (initializing) return initializing;
    initializing = initializeWork();
    return initializing.finally(() => {
      initializing = null;
    });
  }
  const closeId = (t: CreationTicket, method: string, revision: number | null) =>
    hash({
      domain: 'writer-book-lore-client-unit',
      uid,
      writeId,
      bookId: t.bookId,
      loreId: t.loreId,
      method,
      id: t.creationId,
      revision,
    });
  async function advanceClosing() {
    let t = await current();
    if (!t.jobsClosed) {
      if (t.parent?.phase === 'adopted') return snapshot();
      if (!t.closing || t.closing.state === 'confirmed') {
        const advance = t.parent?.phase === 'cancelling';
        const method = advance
          ? 'advanceBookLoreCreationCleanup'
          : 'cancelBookLoreCreationReservation';
        const revision = advance ? t.parent!.cleanupRevision! : null;
        const wire: CreationMetaWire = {
          method,
          input: {
            bookId: t.bookId,
            creationId: t.creationId,
            ...(t.parent?.jobToken ? { jobToken: t.parent.jobToken } : {}),
            operationId: closeId(t, method, revision),
            ...(advance ? { expectedRevision: revision } : {}),
          },
        };
        t = await update((h) => ({ ...h, closing: { wire, state: 'pending' } }));
      }
      const wire = t.closing!.wire;
      let raw;
      try {
        raw = await edit.call(wire.method, wire.input);
      } catch (error) {
        if (conflict(error) && wire.method !== 'getBookLoreCreationReservation')
          await update((h) => ({
            ...h,
            closing: {
              state: 'pending',
              wire: {
                method: 'getBookLoreCreationReservation',
                input: {
                  bookId: h.bookId,
                  creationId: h.creationId,
                  ...(h.parent?.jobToken ? { jobToken: h.parent.jobToken } : {}),
                },
              },
            },
          }));
        throw error;
      }
      guard();
      if (wire.method === 'advanceBookLoreCreationCleanup') {
        const result = readObject(freezeLoreEditValue(raw), ['receipt', 'progress']);
        if (result.receipt !== null) {
          const latest = await current(),
            id = bookLoreCreationIdentity(uid, writeId, latest.bookId);
          creationProgress(result.receipt, { ...id, token: latest.parent?.jobToken });
        }
        raw = result.progress;
      }
      await parentResult(raw, false);
      await update((h) => ({ ...h, closing: { wire, state: 'confirmed' } }));
      return snapshot();
    }
    if (t.releaseRequested && !creationKeyClosed(t)) {
      if (t.intentHash === null && t.keyState === 'none') return snapshot();
      if (!t.revoke)
        t = await update((h) => ({
          ...h,
          revoke: {
            state: 'pending',
            wire: {
              writeId,
              requestHash: creationRecoveryHash(h),
              ...(h.identity ? { jobToken: h.identity.jobToken } : {}),
            },
          },
        }));
      const raw = await recovery.call('revokeBookLoreEditRecovery', t.revoke!.wire);
      guard();
      const latest = await current();
      const view = readLoreRecoveryView(raw, uid, creationRecoveryIntent(latest), latest.identity);
      if (view.phase !== 'revoked') journalFail();
      await update((h) => ({
        ...h,
        keyState: 'confirmed',
        identity: identityFromRecovery(view, uid),
        keyView: view,
        revoke: { ...h.revoke!, state: 'confirmed' },
      }));
    }
    return snapshot();
  }
  async function close(kind: 'cancel' | 'release' | 'discard', limit = 50) {
    guard();
    stop = true;
    release ||= kind !== 'cancel';
    discard ||= kind === 'discard';
    if (closingBusy) throw Error('Um encerramento desta preparação já está em andamento.');
    closingBusy = true;
    try {
      await acquire();
      let t = await update((h) => ({
        ...h,
        cancelRequested: true,
        releaseRequested: h.releaseRequested || release,
        discard:
          h.discard ??
          (discard
            ? {
                phase: 'requested',
                generation: h.draft?.generation ?? null,
                deleted: 0,
                ...(creationCheckpointInventory(h).length
                  ? { checkpoints: creationCheckpointInventory(h) }
                  : {}),
              }
            : null),
      }));
      if (discard && creationKeyClosed(t)) {
        head = await ticket!.purge(limit);
        guard();
        discardVerified = head.discard?.phase === 'complete';
      } else {
        await advanceClosing();
        t = await current();
        if (discard && creationKeyClosed(t)) {
          head = await ticket!.purge(limit);
          guard();
          discardVerified = head.discard?.phase === 'complete';
        }
      }
      return snapshot();
    } finally {
      closingBusy = false;
    }
  }
  async function readDraft() {
    await acquire();
    const value = await draft().readDraft();
    head = await ticket!.inspect();
    guard();
    return value;
  }
  async function checkpointJournal() {
    await acquire();
    const input = await draft().readDraft();
    guard();
    return creationCheckpointJournal(ticket!, input, { guard, signal, yieldControl, getKey });
  }
  return Object.freeze({
    checkpointJournal,
    initialize,
    snapshot,
    readDraft,
    cancel: () => close('cancel'),
    release: () => close('release'),
    discard: (limit = 50) => close('discard', limit),
  });
}

export type BookLoreCreationPreparationSnapshot = ReturnType<
  ReturnType<typeof prepareCreationRecovery>['snapshot']
>;
