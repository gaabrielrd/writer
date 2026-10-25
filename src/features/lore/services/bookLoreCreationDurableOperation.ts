import {
  prepareCreationRecovery,
  type CreationPreparationEnvironment,
} from './bookLoreCreationPreparation';
import {
  prepareBookLoreCreationOperation,
  type BookLoreCreationSnapshot,
} from './bookLoreCreationOperation';
import {
  captureCreationCheckpoint,
  creationCheckpointRecovery,
  makeCreationCheckpointOutcome,
} from './bookLoreCreationCheckpointBundle';
import { CreationCheckpointCollectionRequired } from './bookLoreCreationCheckpointJournal';
import type {
  CreationCheckpointBundle,
  CreationCheckpointOutcome,
} from './bookLoreCreationCheckpointContracts';
import { creationJobsClosed, type CreationTicket } from './bookLoreCreationTicketContracts';
import { freezeLoreEditValue } from './bookLoreWritePlan';
import { journalFail } from './bookLoreJournalContracts';
import { bookLoreWriteHash as hash, type BookLoreWriteOptions } from './bookLoreWritePayload';
import type { BookLoreCreationInput } from './bookLoreCreationPlan';
import type { BookLoreEditPort } from './bookLoreEditOperation';

type Core = Awaited<ReturnType<typeof prepareBookLoreCreationOperation>>;
type Journal = Awaited<ReturnType<ReturnType<typeof prepareCreationRecovery>['checkpointJournal']>>;
type Debt = {
  kind: 'initial' | 'before' | 'after';
  bundle: CreationCheckpointBundle;
  outcome?: CreationCheckpointOutcome;
};
export interface DurableBookLoreCreationSnapshot {
  readonly writeId: string;
  readonly bookId: string | null;
  readonly phase:
    | 'opening'
    | 'awaiting-draft'
    | 'preparing'
    | 'ready'
    | 'resolving'
    | 'applied'
    | 'cancelling'
    | 'cancelled'
    | 'conflict';
  readonly initialized: boolean;
  readonly hasRecoveryCopy: boolean;
  readonly requiresInput: boolean;
  readonly savePending: boolean;
  readonly collectionPending: boolean;
  readonly canApply: boolean;
  readonly jobsClosed: boolean;
  readonly keyReleased: boolean;
  readonly copyDiscarded: boolean;
  readonly operation: BookLoreCreationSnapshot | null;
}
/** Owns frozen input, local debt and pending results. Keep this handle after failures. */
export function createDurableBookLoreCreation(
  writeId: string,
  env: CreationPreparationEnvironment,
  input?: BookLoreCreationInput,
  options: BookLoreWriteOptions = {},
) {
  const { guard: environmentGuard, edit: environmentEdit } = env;
  const frozen = input ? (freezeLoreEditValue(input) as BookLoreCreationInput) : undefined,
    { guard: hostGuard, signal, yieldControl } = options,
    actor = () => {
      environmentGuard();
      hostGuard?.();
    },
    bootstrap = prepareCreationRecovery(writeId, env, frozen, {
      guard: hostGuard,
      signal,
      yieldControl,
    });
  let op: Core | null = null,
    journal: Journal | null = null,
    head: CreationTicket | null = null,
    base: CreationCheckpointBundle | null = null,
    baseGeneration: string | null = null,
    debt: Debt | null = null,
    initialized = false,
    requiresInput = false,
    closing = false,
    busy = false,
    initializing: Promise<DurableBookLoreCreationSnapshot> | null = null;
  const production = () => {
    actor();
    signal?.throwIfAborted();
    if (closing) throw Error('A criação está sendo encerrada.');
  };
  async function refresh() {
    actor();
    head = await bootstrap.inspect();
    actor();
    return head;
  }
  function snapshot(): DurableBookLoreCreationSnapshot {
    actor();
    const b = bootstrap.snapshot(),
      s = op?.snapshot() ?? null,
      applied = head?.ownApply?.phase === 'confirmed',
      conflict =
        head?.ownApply?.phase === 'conflict' ||
        (head?.parent?.phase === 'adopted' && !head.ownApply),
      phase = applied
        ? 'applied'
        : conflict
          ? 'conflict'
          : head?.jobsClosed
            ? 'cancelled'
            : head?.ownApply && (s?.phase === 'applied' || head.parent?.phase === 'adopted')
              ? 'resolving'
              : closing || head?.cancelRequested
                ? 'cancelling'
                : requiresInput
                  ? 'awaiting-draft'
                  : (s?.phase ?? 'opening');
    return Object.freeze({
      writeId,
      bookId: head?.bookId ?? frozen?.bookId ?? null,
      phase,
      initialized,
      hasRecoveryCopy: !!head?.draft?.complete,
      requiresInput,
      savePending:
        !applied && (!!debt || !!head?.checkpoint?.pending || !!head?.checkpoint?.outcome),
      collectionPending: !!head?.checkpoint?.garbage,
      canApply:
        !applied &&
        !conflict &&
        head?.parent?.phase !== 'adopted' &&
        initialized &&
        !closing &&
        !busy &&
        !debt &&
        !head?.cancelRequested &&
        !head?.releaseRequested &&
        !head?.checkpoint?.pending &&
        !head?.checkpoint?.outcome &&
        s?.phase === 'ready',
      jobsClosed: !!head && creationJobsClosed(head),
      keyReleased: b.keyReleased,
      copyDiscarded: b.copyDiscarded,
      operation: s,
    });
  }
  async function collect() {
    if (!journal) journalFail();
    while ((await refresh()).checkpoint?.garbage) {
      production();
      await journal.collect(50);
    }
  }
  async function flush() {
    const d = debt;
    if (!d) return;
    if (!journal) journalFail();
    production();
    if (d.outcome) await journal.recordOutcome(d.outcome);
    try {
      await journal.write(d.bundle);
    } catch (error) {
      if (!(error instanceof CreationCheckpointCollectionRequired)) throw error;
      await collect();
      await journal.write(d.bundle);
    }
    production();
    const t = await refresh();
    base = d.bundle;
    baseGeneration = t.checkpoint?.active?.generation ?? null;
    if (!baseGeneration) journalFail();
    if (debt === d) debt = null;
  }
  async function reconcileApplied() {
    for (let n = 0; n < 2; n++) {
      let t = await refresh();
      if (!t.ownApply || t.ownApply.phase === 'conflict') return;
      await bootstrap.confirmAdoption();
      t = await refresh();
      if (
        t.ownApply?.phase === 'confirmed' ||
        t.ownApply?.phase === 'conflict' ||
        t.parent?.phase !== 'adopted'
      )
        return;
    }
  }
  const proxy: BookLoreEditPort = {
    async call(method, value) {
      production();
      const t = await refresh();
      if (t.cancelRequested || t.releaseRequested || t.discard || creationJobsClosed(t))
        journalFail();
      if (!op || !journal || !t.draft?.complete) journalFail();
      debt = { kind: 'before', bundle: captureCreationCheckpoint(op) };
      await flush();
      production();
      if ((await refresh()).cancelRequested) throw Error('A criação está sendo encerrada.');
      if (method === 'adoptBookLoreEditGeneration') {
        await bootstrap.stageApply({ method, input: value });
        production();
        if ((await refresh()).cancelRequested) throw Error('A criação está sendo encerrada.');
      }
      const raw = await environmentEdit.call(method, value);
      actor();
      return raw;
    },
  };
  async function setup() {
    let t = await refresh();
    if (t.discard?.phase === 'complete') {
      await bootstrap.initialize();
      t = await refresh();
    }
    if (t.ownApply) {
      await reconcileApplied();
      t = await refresh();
      if (t.ownApply?.phase === 'confirmed') {
        initialized = true;
        return snapshot();
      }
    }
    if (
      t.cancelRequested ||
      t.releaseRequested ||
      t.discard ||
      t.jobsClosed ||
      t.parent?.phase === 'adopted'
    ) {
      closing = true;
      initialized = true;
      return snapshot();
    }
    await bootstrap.initialize();
    t = await refresh();
    if (
      t.cancelRequested ||
      t.releaseRequested ||
      t.discard ||
      t.jobsClosed ||
      t.parent?.phase === 'adopted'
    ) {
      closing = true;
      initialized = true;
      return snapshot();
    }
    if (!t.draft?.complete) {
      requiresInput = true;
      initialized = true;
      return snapshot();
    }
    const draft = await bootstrap.readDraft();
    production();
    journal ??= await bootstrap.checkpointJournal();
    production();
    let recovered: CreationCheckpointBundle | null;
    try {
      recovered = await journal.recover();
    } catch (error) {
      if (!(error instanceof CreationCheckpointCollectionRequired)) throw error;
      await collect();
      recovered = await journal.recover();
    }
    production();
    op = await prepareBookLoreCreationOperation(
      draft,
      proxy,
      { guard: actor, signal, yieldControl },
      recovered ? creationCheckpointRecovery(recovered) : undefined,
    );
    t = await refresh();
    if (recovered) {
      base = recovered;
      baseGeneration = t.checkpoint?.active?.generation ?? null;
      debt = null;
    } else if (!t.checkpoint?.pending) {
      debt = { kind: 'initial', bundle: captureCreationCheckpoint(op) };
      await flush();
    }
    requiresInput = false;
    initialized = true;
    return snapshot();
  }
  function initialize() {
    actor();
    if (initialized) return Promise.resolve(snapshot());
    if (!initializing)
      initializing = setup()
        .catch(async (error) => {
          try {
            await refresh();
          } catch {
            /* Preserve original failure and in-memory debt. */
          }
          throw error;
        })
        .finally(() => {
          initializing = null;
        });
    return initializing;
  }
  function requestCancel() {
    actor();
    closing = true;
    op?.requestCancel();
  }
  async function close(kind: 'cancel' | 'release' | 'discard', limit = 50) {
    requestCancel();
    if (kind === 'cancel') await bootstrap.cancel();
    else if (kind === 'release') await bootstrap.release();
    else await bootstrap.discard(limit);
    await refresh();
    return snapshot();
  }
  async function run(apply: boolean) {
    actor();
    if (busy) throw Error('Uma unidade desta criação já está em andamento.');
    busy = true;
    try {
      let t = await refresh();
      if (closing || t.cancelRequested || t.releaseRequested || t.discard || t.jobsClosed) {
        await close('cancel');
        return;
      }
      await initialize();
      t = await refresh();
      if (t.ownApply?.phase === 'confirmed' || t.ownApply?.phase === 'conflict') return;
      if (closing || t.cancelRequested) {
        await close('cancel');
        return;
      }
      if (requiresInput)
        throw Error('Reabra a preparação com o rascunho original para confirmar a primeira cópia.');
      if (!op || !journal) journalFail();
      const state = op.snapshot();
      if (
        state.phase === 'applied' ||
        (t.ownApply?.phase === 'pending' &&
          state.phase === 'ready' &&
          state.pending.production?.method === 'adoptBookLoreEditGeneration')
      ) {
        await reconcileApplied();
        t = await refresh();
        if (
          !apply ||
          state.phase === 'applied' ||
          t.ownApply?.phase === 'confirmed' ||
          t.ownApply?.phase === 'conflict'
        )
          return;
      }
      production();
      if (debt) {
        const kind = debt.kind;
        await flush();
        if (kind === 'after') {
          if (op.snapshot().phase === 'applied') await reconcileApplied();
          return;
        }
      }
      if (apply) await op.apply();
      else await op.advance();
      t = await refresh();
      if (closing || t.cancelRequested || t.releaseRequested || t.discard) return;
      const after = captureCreationCheckpoint(op);
      if (!base || hash(after) !== hash(base)) {
        if (after.checkpoint.pending.production !== null) journalFail();
        const outcome =
          base && after.checkpoint.completedCalls === base.checkpoint.completedCalls + 1
            ? makeCreationCheckpointOutcome(base, after, baseGeneration!)
            : undefined;
        debt = { kind: 'after', bundle: after, ...(outcome ? { outcome } : {}) };
        await flush();
      }
      if (op.snapshot().phase === 'applied') await reconcileApplied();
    } finally {
      busy = false;
    }
  }
  return Object.freeze({
    initialize,
    snapshot,
    requestCancel,
    advance: () => run(false).then(snapshot),
    apply: () => run(true).then(snapshot),
    cancel: () => close('cancel'),
    release: () => close('release'),
    discard: (limit = 50) => close('discard', limit),
    readDraft: () => bootstrap.readDraft(),
  });
}
