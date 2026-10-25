import { readId } from './bookLoreReadContracts';
import {
  prepareBookLoreEditOperation,
  type BookLoreEditOperationInput,
  type BookLoreEditPort,
} from './bookLoreEditOperation';
import { createPersistedBookLoreEditOperation } from './bookLorePersistedOperation';
import { freezeLoreEditValue } from './bookLoreWritePlan';
import { type BookLoreWriteOptions } from './bookLoreWritePayload';
import {
  journalFail,
  journalWire,
  sameJournalIdentity,
  type LoreJournalHead,
  type LoreJournalIdentity,
} from './bookLoreJournalContracts';
import {
  readJournalHead,
  readJournalPreparation,
  commitJournalPreparation,
  advanceJournalDiscard,
} from './bookLoreJournalDb';
import {
  preparationIntent,
  preparationRequestHash,
  readLoreRecoveryView,
  identityFromRecovery,
  type LorePreparationHead,
} from './bookLorePreparationContracts';
import type { openBookLoreJournal } from './bookLoreJournal';
type Journal = Awaited<ReturnType<typeof openBookLoreJournal>>;
type Controller = ReturnType<typeof createPersistedBookLoreEditOperation>;
export interface BookLoreManualEnvironment {
  uid: string;
  guard: () => void;
  recovery: {
    call(
      this: void,
      method: 'reserveBookLoreEditRecovery' | 'revokeBookLoreEditRecovery',
      input: unknown,
    ): Promise<unknown>;
  };
  edit: BookLoreEditPort;
  createJournal: (identity: LoreJournalIdentity) => Promise<Journal>;
  openJournal: (identity: LoreJournalIdentity) => Promise<Journal>;
}
export interface BookLoreManualSnapshot {
  readonly writeId: string;
  readonly phase:
    | 'opening'
    | 'reserving'
    | 'awaiting-draft'
    | 'empty'
    | 'preparing'
    | 'ready'
    | 'applied'
    | 'cancelling'
    | 'cancelled';
  readonly reservationPending: boolean;
  readonly hasRecoveryCopy: boolean;
  readonly draftSaved: boolean;
  readonly requiresInput: boolean;
  readonly savePending: boolean;
  readonly canApply: boolean;
  readonly keyReleaseRequested: boolean;
  readonly keyReleased: boolean;
  readonly canDiscard: boolean;
  readonly copyDiscarded: boolean;
  readonly discardPhase: 'requested' | 'purging' | 'complete' | null;
  readonly operation: ReturnType<Controller['snapshot']>['operation'];
}
export interface BookLoreManualOptions extends BookLoreWriteOptions {
  beforeUnit?: (metadata: Readonly<ReturnType<typeof journalWire>['metadata']>) => Promise<void>;
}
/** Metadata bootstrap is durable before reservation; keep this handle across failures. */
export function createBookLoreManualOperation(
  writeId: string,
  environment: BookLoreManualEnvironment,
  input?: BookLoreEditOperationInput,
  options: BookLoreManualOptions = {},
) {
  let frozen = input ? (freezeLoreEditValue(input) as BookLoreEditOperationInput) : undefined;
  const { uid, guard: actor, recovery, edit, createJournal, openJournal } = environment,
    { guard: hostGuard, signal, yieldControl, beforeUnit } = options;
  const guard = () => {
    actor();
    hostGuard?.();
  };
  let head: LorePreparationHead | null = null,
    journal: Journal | null = null,
    controller: Controller | null = null,
    journalHead: LoreJournalHead | null = null,
    requiresInput = false,
    discardVerified = false,
    closing = false,
    releasing = false,
    closingBusy = false,
    ticketPromise: Promise<LorePreparationHead> | null = null,
    opening: Promise<Journal | null> | null = null,
    initializing: Promise<BookLoreManualSnapshot> | null = null,
    queue = Promise.resolve();
  guard();
  readId(uid);
  readId(writeId);
  if (frozen && (frozen.uid !== uid || frozen.writeId !== writeId)) journalFail();
  async function inspect() {
    guard();
    if (!head) journalFail();
    const current = await readJournalPreparation(uid, writeId);
    guard();
    if (!current || current.stamp !== head.stamp) journalFail();
    head = current;
    return current;
  }
  function mutate(update: (h: LorePreparationHead) => LorePreparationHead) {
    const result = queue.then(async () => {
      guard();
      if (!head) journalFail();
      const saved = await commitJournalPreparation(
        { ...update(head), stamp: crypto.randomUUID() },
        head.stamp,
      );
      head = saved;
      guard();
      return saved;
    });
    queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
  async function acquire() {
    guard();
    let intent;
    if (frozen) {
      const op = await prepareBookLoreEditOperation(
        frozen,
        {
          call: () => {
            throw Error('Only metadata is prepared here.');
          },
        },
        { guard, yieldControl },
      );
      guard();
      intent = preparationIntent({
        writeId,
        bookId: frozen.source.bookId,
        loreId: frozen.source.id,
        sourceToken: frozen.source.sourceToken,
        intentHash: op.snapshot().intentHash,
      });
    }
    const current = await readJournalPreparation(uid, writeId);
    guard();
    if (current) {
      if (intent && preparationRequestHash(uid, intent) !== current.requestHash) journalFail();
      head = await commitJournalPreparation(
        {
          ...current,
          stamp: crypto.randomUUID(),
          cancelRequested: current.cancelRequested || closing,
          releaseRequested: current.releaseRequested || releasing,
        },
        current.stamp,
      );
    } else {
      if (!intent) throw Error('A preparação não foi encontrada neste dispositivo.');
      head = await commitJournalPreparation(
        {
          schemaVersion: 1,
          uid,
          stamp: crypto.randomUUID(),
          intent,
          requestHash: preparationRequestHash(uid, intent),
          cancelRequested: closing,
          releaseRequested: releasing,
          reserveState: 'pending',
          identity: null,
          jobsClosed: null,
          revoke: null,
          closed: null,
          discard: null,
        },
        null,
      );
    }
    guard();
    return head;
  }
  function ensureTicket() {
    guard();
    if (head) return inspect();
    if (!ticketPromise)
      ticketPromise = acquire().finally(() => {
        ticketPromise = null;
      });
    return ticketPromise;
  }
  const guardedPort: BookLoreEditPort = {
    async call(method, value) {
      const h = await inspect();
      if (!h.identity) journalFail();
      const wire = journalWire({ method, input: value }, h.identity);
      if (wire.metadata.lane === 'production' && (closing || h.cancelRequested || h.closed))
        throw Error('A edição está sendo encerrada.');
      guard();
      await beforeUnit?.(Object.freeze({ ...wire.metadata }));
      const current = await inspect();
      if (
        wire.metadata.lane === 'production' &&
        (closing || current.cancelRequested || current.closed)
      )
        throw Error('A edição está sendo encerrada.');
      guard();
      const result = await edit.call(method, value);
      await inspect();
      guard();
      return result;
    },
  };
  function bindController() {
    if (!journal) journalFail();
    controller ??= createPersistedBookLoreEditOperation(journal, guardedPort, frozen, {
      guard,
      signal,
      yieldControl,
    });
    if (closing || head?.cancelRequested) controller.requestCancel();
  }
  async function getJournal(create: boolean): Promise<Journal | null> {
    if (journal) {
      journalHead = await journal.inspect();
      await inspect();
      guard();
      bindController();
      return journal;
    }
    if (opening) return opening;
    opening = (async () => {
      const h = await inspect(),
        identity = h.identity;
      if (!identity) return null;
      const stored = await readJournalHead(uid, writeId);
      await inspect();
      guard();
      if (stored && !sameJournalIdentity(stored.identity, identity)) journalFail();
      if (!stored && (!create || closing || head?.cancelRequested || head?.closed)) return null;
      journal = stored ? await openJournal(identity) : await createJournal(identity);
      await inspect();
      guard();
      journalHead = await journal.inspect();
      guard();
      bindController();
      return journal;
    })().finally(() => {
      opening = null;
    });
    return opening;
  }
  function snapshot(): BookLoreManualSnapshot {
    guard();
    const child = controller?.snapshot() ?? null;
    const applied =
        head?.jobsClosed === 'applied' ||
        child?.phase === 'applied' ||
        journalHead?.controls?.worker.phase === 'applied',
      cancelled = !!head && head.jobsClosed !== null && !applied;
    const phase = applied
      ? 'applied'
      : cancelled
        ? 'cancelled'
        : closing || head?.cancelRequested
          ? 'cancelling'
          : requiresInput
            ? 'awaiting-draft'
            : child?.phase === 'empty'
              ? 'empty'
              : child?.phase === 'ready'
                ? 'ready'
                : child?.initialized
                  ? 'preparing'
                  : head?.identity
                    ? 'opening'
                    : head
                      ? 'reserving'
                      : 'opening';
    return Object.freeze({
      writeId,
      phase,
      reservationPending: head?.reserveState === 'pending',
      hasRecoveryCopy: !!journalHead?.draft?.complete || !!child?.hasRecoveryCopy,
      draftSaved: !!child?.draftSaved,
      requiresInput,
      savePending:
        !!child?.savePending ||
        head?.reserveState === 'pending' ||
        head?.revoke?.state === 'pending',
      canApply: !!child?.canApply && !closing && !head?.cancelRequested && !head?.closed,
      keyReleaseRequested: !!head?.releaseRequested,
      keyReleased: !!head?.closed,
      canDiscard: !!head?.closed && head.jobsClosed !== null,
      copyDiscarded: head?.discard?.phase === 'complete' && discardVerified,
      discardPhase: head?.discard?.phase ?? null,
      operation: child?.operation ?? null,
    });
  }
  async function reserve() {
    const h = await inspect();
    if (h.cancelRequested || h.closed || closing) return;
    if (h.reserveState === 'confirmed' && h.identity) return;
    guard();
    const raw = await recovery.call('reserveBookLoreEditRecovery', h.intent);
    await inspect();
    guard();
    const view = readLoreRecoveryView(raw, uid, h.intent, head!.identity),
      identity = identityFromRecovery(view, uid);
    await mutate((current) => {
      if (current.closed) {
        if (current.closed.jobToken !== view.jobToken) journalFail();
        return { ...current, reserveState: 'confirmed' };
      }
      if (view.phase === 'revoked')
        return {
          ...current,
          cancelRequested: true,
          reserveState: 'confirmed',
          identity: current.identity ?? identity,
        };
      if (!identity) journalFail();
      return { ...current, reserveState: 'confirmed', identity };
    });
  }
  async function initializeWork() {
    let h = await ensureTicket();
    if (h.discard?.phase === 'complete') {
      head = await advanceJournalDiscard(uid, writeId, h.stamp);
      guard();
      discardVerified = true;
      return snapshot();
    }
    if (h.cancelRequested || h.closed || closing) {
      closing = true;
      await getJournal(false);
      return snapshot();
    }
    await reserve();
    h = await inspect();
    if (h.cancelRequested || h.closed || closing) {
      closing = true;
      await getJournal(false);
      return snapshot();
    }
    const j = await getJournal(true);
    if (!j || !controller) journalFail();
    journalHead = await j.inspect();
    await inspect();
    if (closing || head?.cancelRequested) {
      controller.requestCancel();
      return snapshot();
    }
    if (
      !frozen &&
      (!journalHead.draft || journalHead.draft.written !== journalHead.draft.chunkCount)
    ) {
      requiresInput = true;
      return snapshot();
    }
    requiresInput = false;
    await controller.initialize();
    await inspect();
    journalHead = await j.inspect();
    guard();
    return snapshot();
  }
  function initialize() {
    guard();
    if (!initializing)
      initializing = initializeWork().finally(() => {
        initializing = null;
      });
    return initializing;
  }
  async function run(apply: boolean) {
    guard();
    let h = await ensureTicket();
    if (closing || h.cancelRequested) return cancel();
    if (!controller?.snapshot().initialized) {
      await initialize();
      return snapshot();
    }
    h = await inspect();
    if (h.cancelRequested) return cancel();
    if (apply) await controller.apply();
    else await controller.advance();
    await inspect();
    journalHead = await journal!.inspect();
    guard();
    return snapshot();
  }
  async function flushLocal() {
    guard();
    await ensureTicket();
    await getJournal(false);
    if (controller) await controller.flushLocal();
    await inspect();
    if (journal) journalHead = await journal.inspect();
    guard();
    return snapshot();
  }
  async function revoke() {
    let h = await inspect();
    if (h.closed) return;
    if (h.jobsClosed === null || !h.cancelRequested) journalFail();
    if (!h.revoke)
      h = await mutate((current) => ({
        ...current,
        revoke: {
          wire: {
            writeId,
            requestHash: current.requestHash,
            ...(current.identity ? { jobToken: current.identity.jobToken } : {}),
          },
          state: 'pending',
        },
      }));
    const wire = h.revoke!.wire;
    guard();
    const raw = await recovery.call('revokeBookLoreEditRecovery', wire);
    await inspect();
    guard();
    const view = readLoreRecoveryView(raw, uid, h.intent, head!.identity);
    if (view.phase !== 'revoked') journalFail();
    await mutate((current) => ({
      ...current,
      identity: current.identity ?? identityFromRecovery(view, uid),
      revoke: { wire, state: 'confirmed' },
      closed: view,
    }));
  }
  function cancel(): Promise<BookLoreManualSnapshot> {
    guard();
    closing = true;
    controller?.requestCancel();
    if (closingBusy)
      return Promise.reject(Error('Uma unidade do encerramento já está em andamento.'));
    closingBusy = true;
    return closeWork().finally(() => {
      closingBusy = false;
    });
  }
  async function closeWork() {
    await ensureTicket();
    if (!head!.cancelRequested || (releasing && !head!.releaseRequested))
      await mutate((h) => ({
        ...h,
        cancelRequested: true,
        releaseRequested: h.releaseRequested || releasing,
      }));
    const j = await getJournal(false);
    if (!head!.closed && head!.jobsClosed === null) {
      if (j) {
        journalHead = await j.requestCancel();
        await inspect();
        if (journalHead.controls?.ready) {
          const before = journalHead.controls.worker.completedCalls;
          journalHead = await j.advanceControlCleanup(guardedPort);
          await inspect();
          const worker = journalHead.controls!.worker;
          if (!['cancelled', 'applied'].includes(worker.phase)) return snapshot();
          await mutate((h) => ({ ...h, jobsClosed: worker.phase as 'cancelled' | 'applied' }));
          if (worker.completedCalls !== before) return snapshot();
        } else {
          if (
            journalHead.production ||
            journalHead.cleanup ||
            journalHead.diagnostic ||
            (journalHead.controls && journalHead.controls.worker.phase !== 'idle')
          )
            journalFail();
          await mutate((h) => ({ ...h, jobsClosed: 'none' }));
        }
      } else await mutate((h) => ({ ...h, jobsClosed: 'none' }));
    }
    if (head!.releaseRequested) await revoke();
    return snapshot();
  }
  function discard(limit = 50) {
    guard();
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50)
      return Promise.reject(Error('Lote de descarte inválido.'));
    if (closingBusy)
      return Promise.reject(Error('Uma unidade do encerramento já está em andamento.'));
    closing = true;
    releasing = true;
    discardVerified = false;
    controller?.requestCancel();
    closingBusy = true;
    return (async () => {
      await ensureTicket();
      if (!head!.discard)
        await mutate((h) => ({
          ...h,
          cancelRequested: true,
          releaseRequested: true,
          discard: { phase: 'requested', deleted: 0 },
        }));
      await closeWork();
      if (!head!.closed) return snapshot();
      head = await advanceJournalDiscard(uid, writeId, head!.stamp, limit);
      guard();
      controller = null;
      journal = null;
      journalHead = null;
      discardVerified = head.discard?.phase === 'complete';
      if (discardVerified) frozen = undefined;
      return snapshot();
    })().finally(() => {
      closingBusy = false;
    });
  }
  async function readDraft() {
    await ensureTicket();
    const j = await getJournal(false);
    if (!j) throw Error('O texto ainda não foi confirmado na cópia protegida.');
    const result = await j.readDraft();
    await inspect();
    guard();
    return result;
  }
  function releaseRecovery() {
    guard();
    if (closingBusy)
      return Promise.reject(Error('Uma unidade do encerramento já está em andamento.'));
    releasing = true;
    return cancel();
  }
  return Object.freeze({
    initialize,
    snapshot,
    flushLocal,
    advance: () => run(false),
    apply: () => run(true),
    cancel,
    releaseRecovery,
    discard,
    readDraft,
  });
}
