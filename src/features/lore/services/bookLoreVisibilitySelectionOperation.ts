import { prepareBookLoreEditOperation } from './bookLoreEditOperation';
import type {
  createBookLoreManualOperation,
  BookLoreManualOptions,
} from './bookLoreManualOperation';
import type { BookLoreEditSource } from './bookLoreWritePlan';
import type { createBookLoreReadClient } from './bookLoreReadClient';
import {
  visibilityIdentity,
  visibilityScope,
  visibilityEqual,
  visibilityFail,
  VisibilityConflict,
  type VisibilityIdentity,
  type VisibilityRoot,
  type VisibilityState,
  type VisibilityRef,
} from './bookLoreVisibilitySelectionContracts';
import type { VisibilitySelectionStore } from './bookLoreVisibilitySelectionDb';
import { loreControlJobId } from './bookLoreControlContracts';
import {
  queryVisibilityApplied,
  closeVisibilityMember,
  verifyVisibilityClosed,
  type VisibilityNative,
} from './bookLoreVisibilitySelectionCleanup';
import type { BookLoreEditOutcome } from './bookLoreEditOutcome';
type Entry = Awaited<ReturnType<VisibilitySelectionStore['member']>>;
type Child = ReturnType<typeof createBookLoreManualOperation>;
type Unit = Parameters<NonNullable<BookLoreManualOptions['beforeUnit']>>[0];
export interface VisibilitySelectionEnvironment {
  guard: () => void;
  native: VisibilityNative;
  reader: Pick<ReturnType<typeof createBookLoreReadClient>, 'metadata' | 'capture'>;
  openChild(
    entry: Entry,
    beforeUnit: NonNullable<BookLoreManualOptions['beforeUnit']>,
    source?: BookLoreEditSource,
  ): Promise<Child>;
}
export async function openBookLoreVisibilitySelection(
  raw: VisibilityIdentity,
  store: VisibilitySelectionStore,
  environment: VisibilitySelectionEnvironment,
) {
  const identity = visibilityIdentity(raw),
    { guard, native, reader } = environment;
  guard();
  let root = await store.read();
  guard();
  if (!root) visibilityFail();
  const manifest = root.manifest;
  let active: Entry | null = null,
    cached: { index: number; child: Child } | null = null,
    captured: { index: number; source: BookLoreEditSource } | null = null,
    running = false,
    closing = false,
    localCancel = false,
    epoch = 0,
    action: 'advance' | 'apply' | 'retry' = 'advance';
  let debt: (() => Promise<VisibilityRoot>) | null = null;
  const verified = new Set<number>(),
    retryable = new Set<number>();
  const cursor = () => (root!.head.cancelRequested ? root!.head.cancelCursor : root!.head.cursor);
  const snapshot = () => {
    const h = root!.head,
      index = cursor(),
      row = active?.member.index === index ? active.state : null,
      child = cached?.index === index ? cached.child.snapshot() : null,
      finished = index === manifest.count,
      savePending = !!debt || !!(child?.savePending && !child.reservationPending);
    return Object.freeze({
      identity,
      manifestHash: manifest.manifestHash,
      value: manifest.value,
      count: manifest.count,
      cursor: h.cursor,
      cancelCursor: h.cancelCursor,
      cancelRequested: h.cancelRequested || localCancel,
      recordedApplied: h.applied,
      recordedUnchanged: h.unchanged,
      recordedConflicts: h.conflicts,
      recordedCancelled: h.cancelled,
      verifiedCount: verified.size,
      savePending,
      canRetry: !!row?.applyRequested && retryable.has(index) && !h.cancelRequested && !row.closing,
      phase:
        localCancel || h.cancelRequested
          ? finished && verified.size === manifest.count
            ? 'cancelled'
            : 'cancelling'
          : finished
            ? verified.size === manifest.count
              ? h.conflicts
                ? 'partial'
                : 'complete'
              : 'verifying'
            : row?.closing
              ? 'resolving-conflict'
              : row?.applyRequested
                ? 'uncertain'
                : row?.unchanged === true || child?.canApply
                  ? 'ready'
                  : 'preparing',
    });
  };
  function accept(next: VisibilityRoot) {
    if (
      !visibilityEqual(next.manifest, manifest) ||
      next.head.revision < root!.head.revision ||
      (next.head.revision === root!.head.revision && next.head.stamp !== root!.head.stamp)
    )
      visibilityFail();
    root = next;
  }
  async function refresh() {
    guard();
    const value = await store.read();
    guard();
    if (!value) visibilityFail();
    accept(value);
    return snapshot();
  }
  async function read(index: number) {
    guard();
    const entry = await store.member(index);
    guard();
    accept(entry.root);
    active = entry;
    return entry;
  }
  async function save(work: () => Promise<VisibilityRoot>) {
    const generation = epoch;
    try {
      const next = await work();
      guard();
      if (generation !== epoch) {
        await refresh();
        return false;
      }
      accept(next);
      return true;
    } catch (error) {
      if (generation !== epoch || error instanceof VisibilityConflict) {
        await refresh();
        return false;
      }
      debt = work;
      throw error;
    }
  }
  async function patch(
    entry: Entry,
    delta: Partial<VisibilityState>,
    mode: 'produce' | 'control' | 'finish' = 'control',
  ) {
    const generation = epoch;
    const saved = await save(async () => {
      const next = await store.change(
        entry.member.index,
        entry.state.revision,
        (old) => ({ ...old, ...delta }),
        mode,
      );
      if (generation === epoch) active = { ...entry, ...next };
      return next.root;
    });
    if (!saved) throw new VisibilityConflict();
    return active!;
  }
  async function flush() {
    const pending = debt,
      generation = epoch;
    if (!pending) return snapshot();
    try {
      const next = await pending();
      guard();
      if (generation !== epoch) return refresh();
      accept(next);
      if (debt === pending) debt = null;
    } catch (error) {
      if (generation !== epoch) return refresh();
      if (!(error instanceof VisibilityConflict)) throw error;
      if (debt === pending) debt = null;
      await refresh();
    }
    return snapshot();
  }
  async function unit(index: number, generation: number, metadata: Unit) {
    guard();
    if (generation !== epoch) throw new VisibilityConflict();
    const entry = await read(index);
    if (
      generation !== epoch ||
      root!.head.cancelRequested ||
      entry.state.closing ||
      entry.state.outcome ||
      cursor() !== index ||
      entry.state.intentHash === null ||
      entry.state.unchanged !== false
    )
      throw new VisibilityConflict();
    const scope = visibilityScope(entry.root, entry.member);
    const kind =
      metadata.id === loreControlJobId(scope, 'lore-source')
        ? 'inspection'
        : metadata.id === loreControlJobId(scope, 'lore-field')
          ? 'upload'
          : metadata.id === loreControlJobId(scope, 'lore-edit')
            ? 'edit'
            : visibilityFail();
    const old = entry.state[kind];
    if (
      old &&
      (old.id !== metadata.id ||
        old.startHash !== metadata.startHash ||
        (metadata.jobToken !== null && old.seen && old.jobToken !== metadata.jobToken))
    )
      visibilityFail();
    const ref: VisibilityRef = {
      id: metadata.id,
      startHash: metadata.startHash,
      seen: old?.seen || metadata.jobToken !== null,
      jobToken: metadata.jobToken ?? old?.jobToken ?? null,
    };
    const apply = metadata.method === 'adoptBookLoreEditGeneration';
    await patch(entry, { [kind]: ref, ...(apply ? { applyRequested: true } : {}) }, 'produce');
    if (apply && action === 'advance')
      throw Error('Consulte o resultado original antes de reenviar a alteração.');
    if (generation !== epoch || root!.head.cancelRequested) throw new VisibilityConflict();
  }
  async function source(entry: Entry) {
    const { member } = entry,
      bookId = manifest.identity.bookId;
    const header = await reader.metadata(bookId, member.loreId);
    guard();
    if (!header || header.readToken !== member.sourceToken) {
      const error = new Error('A origem da ficha mudou. Selecione e revise novamente.');
      Object.assign(error, { code: 'failed-precondition' });
      throw error;
    }
    const captured = await reader.capture(bookId, member.loreId, member.sourceToken);
    guard();
    if (!captured || captured.sourceToken !== member.sourceToken) visibilityFail();
    const pure = await prepareBookLoreEditOperation(
      {
        uid: identity.uid,
        writeId: member.writeId,
        source: captured,
        changes: [{ field: 'isPublic', value: manifest.value }],
      },
      {
        call() {
          throw Error('Somente preparação local.');
        },
      },
      { guard, yieldControl: async () => {} },
    );
    guard();
    return {
      source: captured,
      intentHash: pure.snapshot().intentHash,
      unchanged:
        Object.hasOwn(captured.data, 'isPublic') && captured.data.isPublic === manifest.value,
    };
  }
  async function child(entry: Entry) {
    if (cached?.index === entry.member.index) return cached.child;
    const generation = epoch,
      index = entry.member.index;
    const op = await environment.openChild(
      entry,
      (metadata) => unit(index, generation, metadata),
      captured?.index === index ? captured.source : undefined,
    );
    guard();
    if (generation !== epoch) throw new VisibilityConflict();
    cached = { index, child: op };
    return op;
  }
  async function finishApplied(entry: Entry, proof: BookLoreEditOutcome) {
    if (!entry.state.edit || !proof.applied || !proof.jobToken || !proof.outcomeToken)
      visibilityFail();
    await patch(
      entry,
      {
        applyRequested: true,
        edit: { ...entry.state.edit, seen: true, jobToken: proof.jobToken },
        outcome: { kind: 'applied', jobToken: proof.jobToken, outcomeToken: proof.outcomeToken },
      },
      'finish',
    );
    verified.add(entry.member.index);
    retryable.delete(entry.member.index);
    cached = null;
    captured = null;
    return snapshot();
  }
  async function check(entry: Entry, generation: number) {
    if (generation !== epoch) throw new VisibilityConflict();
    const proof = await queryVisibilityApplied(entry, native);
    guard();
    if (generation !== epoch) throw new VisibilityConflict();
    if (proof?.applied) return { proof, changed: false };
    if (proof && entry.state.edit && !entry.state.edit.seen) {
      await patch(entry, { edit: { ...entry.state.edit, seen: true, jobToken: proof.jobToken } });
      return { proof, changed: true };
    }
    return { proof, changed: false };
  }
  async function closeEntry(entry: Entry, generation: number) {
    let current = entry;
    try {
      const result = await closeVisibilityMember(entry, native, async (delta) => {
        if (generation !== epoch) throw new VisibilityConflict();
        current = await patch(current, delta);
      });
      guard();
      if (generation !== epoch) return refresh();
      if (result.accepted) return finishApplied(current, result.accepted);
      if (!result.complete) return snapshot();
      const kind = current.state.closing;
      if (!kind) visibilityFail();
      await patch(current, { outcome: { kind, jobToken: null, outcomeToken: null } }, 'finish');
      verified.add(entry.member.index);
      cached = null;
      captured = null;
      return snapshot();
    } catch (error) {
      if (generation !== epoch) return refresh();
      throw error;
    }
  }
  async function verify(entry: Entry, generation: number) {
    const outcome = entry.state.outcome;
    if (!outcome) visibilityFail();
    if (outcome.kind === 'applied') {
      const proof = await queryVisibilityApplied(entry, native);
      guard();
      if (!proof?.applied) visibilityFail();
    } else {
      await verifyVisibilityClosed(entry, native);
      guard();
    }
    if (generation !== epoch) return refresh();
    verified.add(entry.member.index);
    return snapshot();
  }
  async function drive(which: 'advance' | 'apply' | 'retry') {
    guard();
    if (debt) return flush();
    await refresh();
    if (localCancel && !root!.head.cancelRequested) {
      await save(() => store.cancel());
      return snapshot();
    }
    const generation = epoch,
      index = cursor();
    if (index === manifest.count) {
      for (let i = 0; i < manifest.count; i++)
        if (!verified.has(i)) return verify(await read(i), generation);
      return snapshot();
    }
    let entry = await read(index);
    if (generation !== epoch || cursor() !== index) return snapshot();
    if (entry.state.outcome) {
      if (!root!.head.cancelRequested) visibilityFail();
      await verify(entry, generation);
      if (generation !== epoch) return refresh();
      await save(() => store.visit(index, entry.state.revision));
      return snapshot();
    }
    if (root!.head.cancelRequested || entry.state.closing) {
      if (!entry.state.closing) {
        entry = await patch(entry, { closing: 'cancelled' });
        return snapshot();
      }
      return closeEntry(entry, generation);
    }
    const live = cached?.index === index ? cached.child : null;
    if (live?.snapshot().savePending && !live.snapshot().reservationPending) {
      await live.flushLocal();
      guard();
      if (generation !== epoch) return refresh();
      return snapshot();
    }
    if (entry.state.applyRequested) {
      const result = await check(entry, generation);
      if (generation !== epoch) return refresh();
      if (result.proof?.applied) return finishApplied(active ?? entry, result.proof);
      if (result.changed) return snapshot();
      if (result.proof && ['cancelled', 'cancelling'].includes(result.proof.phase)) {
        await patch(entry, { closing: 'conflict' });
        return snapshot();
      }
      try {
        const header = await reader.metadata(identity.bookId, entry.member.loreId);
        guard();
        if (generation !== epoch) return refresh();
        if (!header || header.readToken !== entry.member.sourceToken) {
          await patch(entry, { closing: 'conflict' });
          return snapshot();
        }
      } catch (error) {
        if (generation !== epoch) return refresh();
        const code =
          error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
        if (!debt && ['failed-precondition', 'functions/failed-precondition'].includes(code)) {
          await patch(entry, { closing: 'conflict' });
          return snapshot();
        }
        throw error;
      }
      if (which !== 'retry') {
        retryable.add(index);
        return snapshot();
      }
      if (!retryable.has(index))
        throw Error('Verifique o resultado original antes de revisar o reenvio.');
      retryable.delete(index);
      const op = await child(entry);
      await op.flushLocal();
      guard();
      if (generation !== epoch) return refresh();
      if (!op.snapshot().canApply)
        throw Error('A recuperação ainda não está pronta para reenviar a alteração.');
      action = 'retry';
      try {
        await op.apply();
      } catch (error) {
        if (generation !== epoch) return refresh();
        throw error;
      }
      guard();
      if (generation !== epoch) return refresh();
      if (op.snapshot().savePending) return snapshot();
      const confirmed = await check(await read(index), generation);
      if (confirmed.proof?.applied) return finishApplied(active ?? entry, confirmed.proof);
      return snapshot();
    }
    if (entry.state.intentHash === null) {
      try {
        const prepared = await source(entry);
        if (generation !== epoch) return refresh();
        captured = { index, source: prepared.source };
        await patch(
          entry,
          { intentHash: prepared.intentHash, unchanged: prepared.unchanged },
          'produce',
        );
        return snapshot();
      } catch (error) {
        if (generation !== epoch) return refresh();
        const code =
          error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
        if (!debt && ['failed-precondition', 'functions/failed-precondition'].includes(code)) {
          await patch(entry, { closing: 'conflict' });
          return snapshot();
        }
        throw error;
      }
    }
    if (entry.state.unchanged) {
      if (which !== 'apply') return snapshot();
      try {
        const header = await reader.metadata(
          manifest.identity.bookId,
          entry.member.loreId,
          entry.member.sourceToken,
        );
        guard();
        if (generation !== epoch) return refresh();
        if (!header || header.readToken !== entry.member.sourceToken) visibilityFail();
        await patch(entry, { closing: 'unchanged' }, 'produce');
      } catch (error) {
        const code =
          error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
        if (
          generation === epoch &&
          !debt &&
          ['failed-precondition', 'functions/failed-precondition'].includes(code)
        ) {
          await patch(entry, { closing: 'conflict' });
          return snapshot();
        }
        throw error;
      }
      return snapshot();
    }
    try {
      let op: Child;
      try {
        op = await child(entry);
      } catch (error) {
        const code =
          error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
        if (code !== 'visibility-source-required') throw error;
        const prepared = await source(entry);
        if (
          prepared.intentHash !== entry.state.intentHash ||
          prepared.unchanged !== entry.state.unchanged
        )
          visibilityFail();
        captured = { index, source: prepared.source };
        op = await child(entry);
      }
      if (generation !== epoch) return refresh();
      const state = op.snapshot();
      if (state.operation && state.operation.intentHash !== entry.state.intentHash)
        visibilityFail();
      if (state.phase === 'cancelled' || state.phase === 'cancelling') {
        await patch(entry, { closing: 'conflict' });
        return snapshot();
      }
      if (
        state.operation?.pending.production?.method === 'adoptBookLoreEditGeneration' ||
        state.phase === 'applied'
      ) {
        const progress = state.operation?.edit,
          edit =
            entry.state.edit ??
            (progress
              ? {
                  id: progress.id,
                  startHash: progress.startHash,
                  seen: true,
                  jobToken: progress.jobToken,
                }
              : null);
        if (!edit) visibilityFail();
        await patch(entry, { applyRequested: true, edit });
        return snapshot();
      }
      if (which === 'retry') throw Error('Não há um pedido incerto para reenviar.');
      action = which;
      if (which === 'apply' && state.canApply) {
        entry = await patch(entry, { applyRequested: true }, 'produce');
        await op.apply();
      } else await op.advance();
      guard();
      if (generation !== epoch) return refresh();
      const after = op.snapshot();
      if (after.operation && after.operation.intentHash !== entry.state.intentHash)
        visibilityFail();
      if (after.savePending && !after.reservationPending) return snapshot();
      entry = await read(index);
      if (entry.state.applyRequested) {
        const confirmed = await check(entry, generation);
        if (confirmed.proof?.applied) return finishApplied(active ?? entry, confirmed.proof);
      }
      return snapshot();
    } catch (error) {
      if (generation !== epoch) return refresh();
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      if (
        !debt &&
        !active?.state.applyRequested &&
        ['failed-precondition', 'functions/failed-precondition'].includes(code)
      ) {
        await patch(active ?? entry, { closing: 'conflict' });
        return snapshot();
      }
      throw error;
    }
  }
  async function exclusive(which: 'advance' | 'apply' | 'retry') {
    guard();
    if (running) throw Error('Uma unidade da seleção está em andamento.');
    running = true;
    try {
      return await drive(which);
    } finally {
      running = false;
    }
  }
  async function cancel() {
    guard();
    if (closing) return snapshot();
    closing = true;
    localCancel = true;
    epoch++;
    debt = null;
    cached = null;
    captured = null;
    retryable.clear();
    try {
      if (!(await save(() => store.cancel()))) return snapshot();
      return await drive('advance');
    } finally {
      closing = false;
    }
  }
  return {
    snapshot,
    advance: () => exclusive('advance'),
    apply: () => exclusive('apply'),
    retry: () => exclusive('retry'),
    cancel,
    page: (index: number) => store.page(index),
  };
}
