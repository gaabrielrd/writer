import {
  prepareBookLoreEditOperation,
  type BookLoreEditOperationInput,
  type BookLoreEditPort,
  type BookLoreEditOperationSnapshot,
} from './bookLoreEditOperation';
import { freezeLoreEditValue } from './bookLoreWritePlan';
import { bookLoreWriteHash as hash, type BookLoreWriteOptions } from './bookLoreWritePayload';
import { LoreCheckpointCollectionRequired } from './bookLoreCheckpointJournal';
import { captureBookLoreControlMap } from './bookLoreControlMap';
import {
  captureBookLoreEditCheckpoint,
  type BookLoreCheckpointBundle,
} from './bookLoreCheckpointBundle';
import {
  makeCheckpointOutcome,
  type LoreCheckpointOutcome,
} from './bookLoreCheckpointOutcomeContracts';
import { journalFail, journalWire, type LoreJournalHead } from './bookLoreJournalContracts';
import type { LoreControlWorker } from './bookLoreControlContracts';
import type { openBookLoreJournal } from './bookLoreJournal';
type Journal = Awaited<ReturnType<typeof openBookLoreJournal>>;
type Operation = Awaited<ReturnType<typeof prepareBookLoreEditOperation>>;
type Debt = {
  kind: 'initial' | 'before' | 'after';
  bundle: BookLoreCheckpointBundle;
  outcome?: LoreCheckpointOutcome;
};
export interface PersistedBookLoreSnapshot {
  readonly initialized: boolean;
  readonly draftSaved: boolean;
  readonly hasRecoveryCopy: boolean;
  readonly savePending: boolean;
  readonly canApply: boolean;
  readonly phase: 'opening' | BookLoreEditOperationSnapshot['phase'];
  readonly operation: BookLoreEditOperationSnapshot | null;
  readonly cleanup: LoreControlWorker | null;
}
/** Keep this handle after errors: it owns frozen input and any uncommitted result. */
export function createPersistedBookLoreEditOperation(
  journal: Journal,
  port: BookLoreEditPort,
  input?: BookLoreEditOperationInput,
  options: BookLoreWriteOptions = {},
) {
  const { guard: hostGuard, signal, yieldControl } = options;
  const frozen = input ? (freezeLoreEditValue(input) as BookLoreEditOperationInput) : undefined;
  let op: Operation | null = null,
    head: LoreJournalHead | null = null,
    debt: Debt | null = null,
    base: BookLoreCheckpointBundle | null = null,
    baseGeneration: string | null = null,
    initialized = false,
    draftSaved = false,
    closing = false,
    building = false,
    busy = false,
    initializing: Promise<PersistedBookLoreSnapshot> | null = null;
  const actor = () => hostGuard?.();
  const production = () => {
    actor();
    if (closing) throw Error('A edição está sendo encerrada.');
    signal?.throwIfAborted();
  };
  const coreOptions: BookLoreWriteOptions = {
    yieldControl,
    guard: () => {
      actor();
      if (!building && !closing) signal?.throwIfAborted();
    },
  };
  const refresh = async () => {
    actor();
    head = await journal.inspect();
    actor();
    return head;
  };
  function snapshot(): PersistedBookLoreSnapshot {
    actor();
    const worker = head?.controls?.worker ?? null,
      view = op?.snapshot() ?? null;
    const phase =
      worker?.phase === 'applied'
        ? 'applied'
        : worker?.phase === 'cancelled'
          ? 'cancelled'
          : closing
            ? 'cancelling'
            : (view?.phase ?? 'opening');
    return Object.freeze({
      initialized,
      draftSaved,
      hasRecoveryCopy: !!head?.draft?.complete,
      savePending:
        debt !== null ||
        (!!frozen && !draftSaved) ||
        !!head?.checkpoint?.pending ||
        !!head?.checkpointOutcome,
      canApply: initialized && !closing && !busy && !debt && view?.phase === 'ready',
      phase,
      operation: view,
      cleanup: worker,
    });
  }
  async function collect() {
    while ((await refresh()).checkpoint?.garbage) await journal.advanceCheckpointCleanup();
  }
  async function flush() {
    const d = debt;
    if (!d) return;
    actor();
    if (d.outcome) await journal.recordCheckpointOutcome(d.outcome);
    let saved: LoreJournalHead;
    try {
      saved = await journal.writeCheckpoint(d.bundle);
    } catch (error) {
      if (!(error instanceof LoreCheckpointCollectionRequired)) throw error;
      await collect();
      saved = await journal.writeCheckpoint(d.bundle);
    }
    actor();
    head = saved;
    base = d.bundle;
    baseGeneration = saved.checkpoint?.active?.generation ?? null;
    if (debt === d) debt = null;
  }
  const proxy: BookLoreEditPort = {
    async call(method, value) {
      production();
      const h = await refresh(),
        parsed = journalWire({ method, input: value }, h.identity);
      if (parsed.metadata.lane !== 'production' || !op || !draftSaved) journalFail();
      debt = { kind: 'before', bundle: captureBookLoreEditCheckpoint(op) };
      await flush();
      production();
      const current = await refresh();
      if (current.cancelRequested) {
        closing = true;
        op.requestCancel();
        throw Error('A edição está sendo encerrada.');
      }
      return journal.send(port, parsed.wire);
    },
  };
  async function setup() {
    let h = await refresh();
    if (h.cancelRequested || (h.controls && h.controls.worker.phase !== 'idle')) {
      closing = true;
      op?.requestCancel();
      initialized = true;
      return snapshot();
    }
    if (frozen) {
      building = true;
      try {
        op ??= await prepareBookLoreEditOperation(frozen, proxy, coreOptions);
      } finally {
        building = false;
      }
      await journal.writeControlMap(captureBookLoreControlMap(op));
      await journal.writeDraft(frozen);
      draftSaved = true;
    } else {
      await journal.readDraft();
      draftSaved = true;
    }
    h = await refresh();
    if (h.cancelRequested) {
      closing = true;
      op?.requestCancel();
      initialized = true;
      return snapshot();
    }
    if (h.checkpoint?.active || h.checkpointOutcome || h.checkpoint?.pending) {
      const bundle = await journal.recoverCheckpointOutcome();
      if (bundle) {
        building = true;
        try {
          op = await journal.restoreCheckpointOperation(proxy, coreOptions);
        } finally {
          building = false;
        }
        base = bundle;
        baseGeneration = (await refresh()).checkpoint?.active?.generation ?? null;
        debt = null;
      } else {
        if (h.production || h.cleanup || h.diagnostic) journalFail();
        if (!op) journalFail();
      }
    }
    if (!base) {
      h = await refresh();
      if (h.production || h.cleanup || h.diagnostic) journalFail();
      if (!op) {
        const restored = await journal.readDraft();
        building = true;
        try {
          op = await prepareBookLoreEditOperation(restored, proxy, coreOptions);
        } finally {
          building = false;
        }
        await journal.writeControlMap(captureBookLoreControlMap(op));
      }
      const bundle = captureBookLoreEditCheckpoint(op);
      debt = { kind: 'initial', bundle, outcome: makeCheckpointOutcome(null, bundle, null) };
      await flush();
    }
    h = await refresh();
    if (h.cancelRequested) {
      closing = true;
      op?.requestCancel();
    }
    initialized = true;
    return snapshot();
  }
  function initialize(): Promise<PersistedBookLoreSnapshot> {
    actor();
    if (initialized) return Promise.resolve(snapshot());
    if (!initializing)
      initializing = setup()
        .catch(async (error) => {
          try {
            await refresh();
          } catch {
            /* Preserve original failure and local input. */
          }
          throw error;
        })
        .finally(() => {
          initializing = null;
        });
    return initializing;
  }
  async function cleanup() {
    actor();
    await journal.requestCancel();
    const h = await refresh();
    if (h.controls?.ready) head = await journal.advanceControlCleanup(port);
    actor();
    return snapshot();
  }
  function requestCancel() {
    actor();
    closing = true;
    op?.requestCancel();
  }
  function cancel(): Promise<PersistedBookLoreSnapshot> {
    requestCancel();
    return cleanup();
  }
  async function run(apply: boolean) {
    actor();
    if (closing || (await refresh()).cancelRequested) {
      closing = true;
      op?.requestCancel();
      return cleanup();
    }
    if (busy) throw Error('Uma unidade da edição já está em andamento.');
    busy = true;
    try {
      production();
      await initialize();
      production();
      if (debt) {
        const kind = debt.kind;
        await flush();
        if (kind === 'after') return snapshot();
      }
      if (!op) journalFail();
      if (apply) await op.apply();
      else await op.advance();
      let h = await refresh();
      if (h.cancelRequested || closing) {
        closing = true;
        op.requestCancel();
        return cleanup();
      }
      const unit = h.production,
        confirmed =
          unit?.state === 'pending' && op.snapshot().pending.production === null
            ? [{ lane: 'production' as const, requestHash: unit.requestHash }]
            : [];
      const bundle = captureBookLoreEditCheckpoint(op, confirmed);
      if (
        bundle.checkpoint.pending.production === null &&
        (!base || hash(base.checkpoint) !== hash(bundle.checkpoint) || confirmed.length)
      ) {
        debt = {
          kind: 'after',
          bundle,
          outcome: makeCheckpointOutcome(base, bundle, baseGeneration),
        };
        await flush();
      }
      h = await refresh();
      if (h.cancelRequested) {
        closing = true;
        op.requestCancel();
      }
      return snapshot();
    } finally {
      busy = false;
    }
  }
  async function flushLocal() {
    actor();
    if (busy) throw Error('Uma unidade da edição já está em andamento.');
    busy = true;
    try {
      if (!initialized) await initialize();
      else await flush();
      await refresh();
      return snapshot();
    } finally {
      busy = false;
    }
  }
  return Object.freeze({
    initialize,
    flushLocal,
    snapshot,
    advance: () => run(false).then(() => snapshot()),
    apply: () => run(true).then(() => snapshot()),
    cancel,
    requestCancel,
  });
}
