import { readObject } from './bookLoreReadContracts';
import {
  removalEqual,
  removalFail,
  removalIdentity,
  removalIds,
  removalInspectionHash,
  removalIntentHash,
  makeRemovalIntent,
  parseRemovalInspection,
  parseRemovalProgress,
  removalWire,
  type LoreRemovalIdentity,
  type LoreRemovalProgress,
  type RemovalWireKind,
} from './bookLoreRemovalProtocol';
import {
  initialRemovalJournal,
  readRemovalJournal,
  patchRemovalJournal,
  removalJournalTransition,
  LoreRemovalJournalConflict,
  type LoreRemovalJournal,
} from './bookLoreRemovalJournalContracts';
import type { LoreRemovalStore } from './bookLoreRemovalJournalDb';

export interface LoreRemovalPort {
  call(method: string, input: unknown): Promise<unknown>;
}
export async function openBookLoreRemovalOperation(
  identity: LoreRemovalIdentity,
  port: LoreRemovalPort,
  store: LoreRemovalStore,
  guard: () => void = () => {},
  resumeOnly = false,
) {
  const scope = removalIdentity(identity);
  guard();
  let initial = await store.read();
  guard();
  if (!initial) {
    if (resumeOnly) removalFail();
    initial = await store.commit(initialRemovalJournal(scope), null);
    guard();
  }
  return createOperation(
    readRemovalJournal(initial, scope.uid, scope.writeId),
    scope,
    port,
    store,
    guard,
  );
}
function createOperation(
  initial: LoreRemovalJournal,
  scope: LoreRemovalIdentity,
  port: LoreRemovalPort,
  store: LoreRemovalStore,
  guard: () => void,
) {
  if (!removalEqual(initial.identity, scope)) removalFail();
  let head = initial,
    running = false,
    closing = false,
    verifiedToken: string | null = null;
  let debt: { expected: string; next: LoreRemovalJournal } | null = null;
  const phase = () =>
    head.removal
      ? head.removal.complete
        ? verifiedToken === head.removal.jobToken
          ? 'complete'
          : 'verifying'
        : head.removal.phase === 'handed-off'
          ? 'handed-off'
          : 'cleaning'
      : head.cancelRequested
        ? head.inspectionClosed && head.cancellationChecked
          ? 'cancelled'
          : 'cancelling'
        : head.intent
          ? 'uncertain'
          : head.inspection?.ready
            ? 'ready'
            : 'inspecting';
  const snapshot = () =>
    Object.freeze({
      ...head,
      phase: phase(),
      savePending: debt !== null,
      verified: !!head.removal && verifiedToken === head.removal.jobToken,
    });
  async function refresh() {
    guard();
    const raw = await store.read();
    guard();
    if (!raw) removalFail();
    const next = readRemovalJournal(raw, scope.uid, scope.writeId);
    if (!removalEqual(next.identity, scope)) removalFail();
    removalJournalTransition(head, next, false);
    head = next;
    return snapshot();
  }
  async function save(base: LoreRemovalJournal, next: LoreRemovalJournal) {
    guard();
    try {
      const result = await store.commit(next, base.stamp);
      guard();
      const saved = readRemovalJournal(result, scope.uid, scope.writeId);
      if (saved.revision < head.revision) {
        await refresh();
        return false;
      }
      removalJournalTransition(head, saved, false);
      head = saved;
      if (debt?.expected === base.stamp) debt = null;
      return true;
    } catch (e) {
      if (e instanceof LoreRemovalJournalConflict) {
        if (debt?.expected === base.stamp) debt = null;
        await refresh();
        return false;
      }
      // Cancellation may supersede a late producer reply, including an unsaved result.
      if (
        (!debt || !debt.next.cancelRequested || next.cancelRequested) &&
        (head.stamp === base.stamp || next.cancelRequested)
      )
        debt = { expected: base.stamp, next };
      throw e;
    }
  }
  async function flush() {
    const pending = debt;
    if (!pending) return snapshot();
    guard();
    try {
      const result = await store.commit(pending.next, pending.expected);
      guard();
      const saved = readRemovalJournal(result, scope.uid, scope.writeId);
      if (saved.revision < head.revision) await refresh();
      else {
        removalJournalTransition(head, saved, false);
        head = saved;
      }
      if (debt === pending) debt = null;
    } catch (e) {
      if (!(e instanceof LoreRemovalJournalConflict)) throw e;
      if (debt === pending) debt = null;
      await refresh();
    }
    return snapshot(); // This action never starts another unit.
  }
  async function rpc(method: string, input: unknown) {
    guard();
    const result = await port.call(method, input);
    guard();
    return result;
  }
  async function queryRemoval(base: LoreRemovalJournal): Promise<LoreRemovalProgress | null> {
    if (!base.intent) return null;
    const raw = await rpc('getBookLoreRemoval', {
      removalId: base.intent.removalId,
      startHash: removalIntentHash(base.intent),
      ...(base.removal ? { jobToken: base.removal.jobToken } : {}),
    });
    if (raw === null) return null;
    const p = parseRemovalProgress(raw, base.intent, base.removal?.jobToken);
    verifiedToken = p.jobToken;
    return p;
  }
  async function finishQuery(
    base: LoreRemovalJournal,
    p: LoreRemovalProgress | null,
    cancelled = false,
  ) {
    if (base.removal && !p) removalFail();
    if (p)
      await save(
        base,
        patchRemovalJournal(base, {
          removal: p,
          pending: null,
          ...(cancelled ? { cancellationChecked: true } : {}),
        }),
      );
    else if (cancelled)
      await save(base, patchRemovalJournal(base, { cancellationChecked: true, pending: null }));
    return snapshot();
  }
  async function send(base: LoreRemovalJournal) {
    const wire = base.pending;
    if (!wire) removalFail();
    guard();
    const current = await store.read();
    guard();
    if (!current || current.stamp !== base.stamp) return refresh();
    const raw = await rpc(wire.method, wire.input);
    let next: LoreRemovalJournal;
    if (wire.method === 'startBookLoreSourceInspection') {
      const p = parseRemovalInspection(raw, scope, base.inspection?.jobToken);
      next = patchRemovalJournal(base, { inspection: p, pending: null });
    } else if (wire.method === 'startBookLoreRemoval') {
      if (!base.intent) removalFail();
      const p = parseRemovalProgress(raw, base.intent);
      verifiedToken = p.jobToken;
      next = patchRemovalJournal(base, { removal: p, pending: null });
    } else {
      const envelope = readObject(raw, ['receipt', 'progress']);
      if (wire.method === 'advanceBookLoreRemoval') {
        if (!base.intent || !base.removal) removalFail();
        const p = parseRemovalProgress(envelope.progress, base.intent, base.removal.jobToken);
        const receipt = parseRemovalProgress(envelope.receipt, base.intent, base.removal.jobToken);
        if (receipt.revision !== base.removal.revision + 1 || p.revision < receipt.revision)
          removalFail();
        verifiedToken = p.jobToken;
        next = patchRemovalJournal(base, { removal: p, pending: null });
      } else {
        const p = parseRemovalInspection(envelope.progress, scope, base.inspection?.jobToken);
        const cancelling = wire.method === 'cancelBookLoreSourceInspection';
        if (cancelling) {
          if (p.phase !== 'cancelled') removalFail();
        } else {
          const receipt = parseRemovalInspection(
            envelope.receipt,
            scope,
            base.inspection?.jobToken,
          );
          if (
            !base.inspection ||
            receipt.revision !== base.inspection.revision + 1 ||
            p.revision < receipt.revision
          )
            removalFail();
        }
        next = patchRemovalJournal(base, {
          inspection: p,
          pending: null,
          ...(cancelling ? { inspectionClosed: true } : {}),
        });
      }
    }
    await save(base, next);
    return snapshot();
  }
  async function stage(
    kind: RemovalWireKind,
    base: LoreRemovalJournal = head,
    patch: Partial<Pick<LoreRemovalJournal, 'intent' | 'cancelRequested'>> = {},
  ) {
    const context = { ...base, ...patch };
    const next = patchRemovalJournal(base, { ...patch, pending: removalWire(kind, context) });
    if (!(await save(base, next))) return snapshot();
    return send(next);
  }
  async function step() {
    guard();
    if (debt) return flush();
    await refresh();
    const base = head;
    if (base.pending?.method === 'startBookLoreRemoval') {
      // A missing job is not permission to replay a destructive request.
      const p = await queryRemoval(base);
      return p ? finishQuery(base, p) : snapshot();
    }
    if (base.pending?.method === 'advanceBookLoreRemoval') {
      const p = await queryRemoval(base);
      if (!p) removalFail();
      if (p.complete || p.phase === 'handed-off') return finishQuery(base, p);
      return send(base); // The original receipt/wire resolves this bounded unit.
    }
    if (base.pending) return send(base);
    if (base.cancelRequested && !base.cancellationChecked) {
      if (!base.inspectionClosed) return stage('inspect-cancel', base);
      return finishQuery(base, await queryRemoval(base), true);
    }
    if (base.removal) {
      if (base.removal.complete)
        return verifiedToken === base.removal.jobToken
          ? snapshot()
          : finishQuery(base, await queryRemoval(base));
      if (base.removal.phase === 'handed-off') return finishQuery(base, await queryRemoval(base));
      return stage('remove-advance', base);
    }
    if (base.cancelRequested || base.inspection?.ready) return snapshot();
    if (!base.inspection) return stage('inspect-start', base);
    if (base.inspection.phase === 'cancelled') {
      await save(
        base,
        patchRemovalJournal(base, {
          cancelRequested: true,
          inspectionClosed: true,
          cancellationChecked: true,
        }),
      );
      return snapshot();
    }
    return stage('inspect-advance', base);
  }
  async function apply() {
    guard();
    if (debt) return flush();
    await refresh();
    const base = head;
    if (base.removal || base.cancelRequested) return snapshot();
    if (base.pending?.method === 'startBookLoreRemoval') {
      const p = await queryRemoval(base);
      return p ? finishQuery(base, p) : send(base); // Only an explicit apply may resend.
    }
    if (base.pending || !base.inspection?.ready) removalFail();
    return stage('remove-start', base, { intent: makeRemovalIntent(scope, base.inspection) });
  }
  async function cancel() {
    guard();
    if (closing) return snapshot();
    closing = true;
    try {
      debt = null; // Native metadata, not an obsolete producer result, resolves the race.
      for (let attempt = 0; attempt < 3; attempt++) {
        await refresh();
        const base = head;
        if (base.removal) return snapshot(); // Withdrawal cannot be undone.
        if (base.cancelRequested) return step();
        const next = patchRemovalJournal(base, {
          cancelRequested: true,
          pending: removalWire('inspect-cancel', base),
        });
        if (await save(base, next)) return send(next);
      }
      throw new LoreRemovalJournalConflict();
    } finally {
      closing = false;
    }
  }
  async function exclusive(action: () => Promise<ReturnType<typeof snapshot>>) {
    guard();
    if (running) throw Error('Há uma unidade de retirada em andamento.');
    running = true;
    try {
      return await action();
    } finally {
      running = false;
    }
  }
  return {
    snapshot,
    advance: () => exclusive(step),
    apply: () => exclusive(apply),
    cancel,
    // Metadata only; no source contents are fetched during recovery.
    identity: scope,
    ids: removalIds(scope),
    inspectionHash: removalInspectionHash(scope),
  };
}
