import {
  selectionIdentity,
  selectionEqual,
  selectionFail,
  LoreSelectionConflict,
  memberIdentity,
  makeSelectionOutcome,
  type RemovalSelectionIdentity,
  type RemovalSelectionRoot,
  type RemovalSelectionMember,
  type RemovalSelectionOutcome,
} from './bookLoreRemovalSelectionContracts';
import type { RemovalSelectionStore } from './bookLoreRemovalSelectionDb';
import type { openBookLoreRemovalOperation } from './bookLoreRemovalOperation';
import {
  removalEqual,
  parseRemovalInspection,
  parseRemovalProgress,
  removalIntentHash,
  makeRemovalIntent,
  type RemovalInspection,
  type LoreRemovalIdentity,
} from './bookLoreRemovalProtocol';

type Child = Awaited<ReturnType<typeof openBookLoreRemovalOperation>>;
export interface RemovalSelectionEnvironment {
  guard: () => void;
  openMember(identity: LoreRemovalIdentity): Promise<Child>;
  call(method: string, input: unknown): Promise<unknown>;
}
export async function openBookLoreRemovalSelection(
  raw: RemovalSelectionIdentity,
  store: RemovalSelectionStore,
  environment: RemovalSelectionEnvironment,
) {
  const identity = selectionIdentity(raw),
    { guard } = environment;
  guard();
  let root = await store.read();
  guard();
  if (!root) selectionFail();
  const manifest = root.manifest;
  if (!selectionEqual(identity, manifest.identity)) selectionFail();
  let running = false,
    closing = false,
    localCancelling = false,
    epoch = 0;
  let cached: { index: number; child: Child } | null = null;
  let debt: (() => Promise<RemovalSelectionRoot>) | null = null;
  const verified = new Set<number>();
  const snapshot = () => {
    const h = root!.head,
      count = manifest.count,
      finished = h.cancelRequested ? h.cancelCursor === count : h.cursor === count,
      child = cached?.index === h.cursor ? cached.child.snapshot() : null,
      phase =
        localCancelling && !h.cancelRequested
          ? 'cancelling'
          : finished
            ? verified.size === count
              ? h.cancelRequested
                ? 'cancelled'
                : h.conflicts
                  ? 'partial'
                  : 'complete'
              : 'verifying'
            : h.cancelRequested
              ? 'cancelling'
              : h.faultIndex !== null
                ? 'resolving-conflict'
                : child?.phase === 'uncertain'
                  ? 'uncertain'
                  : child?.phase === 'ready'
                    ? 'ready'
                    : 'preparing';
    return Object.freeze({
      identity,
      manifestHash: manifest.manifestHash,
      count,
      cursor: h.cursor,
      cancelCursor: h.cancelCursor,
      cancelRequested: h.cancelRequested || localCancelling,
      recordedRemoved: h.removed,
      recordedConflicts: h.conflicts,
      recordedCancelled: h.cancelled,
      verifiedCount: verified.size,
      phase,
      savePending: debt !== null || !!child?.savePending,
    });
  };
  function accept(next: RemovalSelectionRoot) {
    if (
      !selectionEqual(next.manifest, manifest) ||
      next.head.revision < root!.head.revision ||
      (next.head.revision === root!.head.revision && next.head.stamp !== root!.head.stamp)
    )
      selectionFail();
    root = next;
  }
  async function refresh() {
    guard();
    const value = await store.read();
    guard();
    if (!value) selectionFail();
    accept(value);
    return snapshot();
  }
  async function save(work: () => Promise<RemovalSelectionRoot>) {
    guard();
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
    } catch (e) {
      if (generation !== epoch) {
        await refresh();
        return false;
      }
      if (e instanceof LoreSelectionConflict) {
        await refresh();
        return false;
      }
      debt = work;
      throw e;
    }
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
    } catch (e) {
      if (generation !== epoch) return refresh();
      if (!(e instanceof LoreSelectionConflict)) throw e;
      if (debt === pending) debt = null;
      await refresh();
    }
    return snapshot(); // Never produce another unit after a local ACK debt.
  }
  async function open(member: RemovalSelectionMember, fresh = false) {
    const expected = memberIdentity(root!, member);
    if (!fresh && cached?.index === member.index) return cached.child;
    guard();
    const child = await environment.openMember(expected);
    guard();
    if (!removalEqual(child.identity, expected)) selectionFail();
    cached = { index: member.index, child };
    return child;
  }
  async function rpc(method: string, input: unknown) {
    guard();
    const value = await environment.call(method, input);
    guard();
    return value;
  }
  async function queryRemoved(child: Child, expected?: string, observed?: RemovalInspection) {
    const s = child.snapshot();
    let intent = s.intent;
    if (!intent) {
      let inspection = observed;
      if (!inspection) {
        const raw = await rpc('getBookLoreSourceInspection', {
          inspectionId: child.ids.inspectionId,
          startHash: child.inspectionHash,
          ...(s.inspection?.jobToken ? { jobToken: s.inspection.jobToken } : {}),
        });
        if (raw !== null)
          inspection = parseRemovalInspection(raw, child.identity, s.inspection?.jobToken);
      }
      if (!inspection?.jobToken) {
        if (expected) selectionFail();
        return null;
      }
      intent = makeRemovalIntent(child.identity, inspection);
    }
    const token = expected ?? s.removal?.jobToken;
    const raw = await rpc('getBookLoreRemoval', {
      removalId: intent.removalId,
      startHash: removalIntentHash(intent),
      ...(token ? { jobToken: token } : {}),
    });
    if (raw === null) {
      if (token) selectionFail();
      return null;
    }
    return parseRemovalProgress(raw, intent, token);
  }
  async function closed(child: Child) {
    const s = child.snapshot();
    if (s.savePending || !s.cancelRequested || !s.inspectionClosed || !s.cancellationChecked)
      return false;
    const token = s.inspection?.jobToken,
      inspection = parseRemovalInspection(
        await rpc('getBookLoreSourceInspection', {
          inspectionId: child.ids.inspectionId,
          startHash: child.inspectionHash,
          ...(token ? { jobToken: token } : {}),
        }),
        child.identity,
        token,
      );
    if (inspection.phase !== 'cancelled') selectionFail();
    return !(await queryRemoved(child, undefined, inspection));
  }
  async function record(member: RemovalSelectionMember, outcome: RemovalSelectionOutcome) {
    const expected = root!.head.stamp;
    if (await save(() => store.finish(expected, member.index, outcome))) verified.add(member.index);
    return snapshot();
  }
  async function terminal(
    member: RemovalSelectionMember,
    child: Child,
    kind: 'conflict' | 'cancelled',
    old: RemovalSelectionOutcome | null,
    generation: number,
  ) {
    const s = child.snapshot();
    if (s.savePending) return snapshot();
    // Cancellation is checked before deciding whether the original removal was accepted.
    if (!s.removal && (!s.inspectionClosed || !s.cancellationChecked)) return snapshot();
    const removed = s.removal && s.verified ? s.removal : await queryRemoved(child);
    if (generation !== epoch) return refresh();
    if (removed) {
      const outcome = makeSelectionOutcome(root!, member, 'removed', removed.jobToken);
      if (old && !selectionEqual(old, outcome)) selectionFail();
      return record(member, outcome);
    }
    if (!(await closed(child))) return snapshot();
    if (generation !== epoch) return refresh();
    const outcome = makeSelectionOutcome(root!, member, old?.kind ?? kind, null);
    if (old && !selectionEqual(old, outcome)) selectionFail();
    return record(member, outcome);
  }
  async function verify(generation: number) {
    let index = 0;
    while (verified.has(index) && index < manifest.count) index++;
    if (index === manifest.count) return snapshot();
    const entry = await store.member(index);
    guard();
    accept(entry.root);
    if (!entry.outcome) selectionFail();
    const child = await open(entry.member, true);
    if (generation !== epoch) return refresh();
    if (entry.outcome.kind === 'removed') {
      const proof = await queryRemoved(child, entry.outcome.jobToken!);
      if (!proof) selectionFail();
    } else {
      // Native fence, not a saved local cancellation flag, closes the original ID.
      const s = child.snapshot(),
        token = s.inspection?.jobToken;
      const p = parseRemovalInspection(
        await rpc('getBookLoreSourceInspection', {
          inspectionId: child.ids.inspectionId,
          startHash: child.inspectionHash,
          ...(token ? { jobToken: token } : {}),
        }),
        child.identity,
        token,
      );
      if (p.phase !== 'cancelled' || (await queryRemoved(child, undefined, p))) selectionFail();
    }
    if (generation !== epoch) return refresh();
    verified.add(index);
    return snapshot();
  }
  async function drive(action: 'advance' | 'apply' | 'retry') {
    guard();
    if (debt) return flush();
    await refresh();
    if (localCancelling && !root!.head.cancelRequested) {
      await save(() => store.cancel());
      return snapshot();
    }
    const generation = epoch,
      h = root!.head,
      index = h.cancelRequested ? h.cancelCursor : h.cursor;
    if (index === manifest.count) return verify(generation);
    const entry = await store.member(index);
    guard();
    accept(entry.root);
    if ((root!.head.cancelRequested ? root!.head.cancelCursor : root!.head.cursor) !== index)
      return snapshot();
    const cancelling = root!.head.cancelRequested,
      fencing = root!.head.faultIndex === index;
    const child = await open(entry.member, cancelling || fencing);
    if (generation !== epoch) return refresh();
    if (cancelling || fencing) {
      await child.cancel();
      if (generation !== epoch) return refresh();
      return terminal(
        entry.member,
        child,
        fencing ? 'conflict' : 'cancelled',
        entry.outcome,
        generation,
      );
    }
    if (entry.outcome) selectionFail();
    const before = child.snapshot();
    try {
      if (before.savePending) {
        await child.advance();
        return refresh();
      }
      if (before.removal && before.verified)
        return record(
          entry.member,
          makeSelectionOutcome(root!, entry.member, 'removed', before.removal.jobToken),
        );
      if (action === 'retry') {
        if (!before.intent || before.removal || before.phase !== 'uncertain') selectionFail();
        await child.apply();
      } else if (action === 'apply' && before.phase === 'ready' && !before.intent)
        await child.apply();
      else await child.advance(); // Uncertain starts only query; apply is not an implicit retry.
    } catch (e) {
      const code = e && typeof e === 'object' && 'code' in e ? String(e.code) : '';
      if (
        generation === epoch &&
        !child.snapshot().removal &&
        ['failed-precondition', 'functions/failed-precondition'].includes(code)
      ) {
        const expected = root!.head.stamp;
        await save(() => store.fence(expected, index));
        return snapshot();
      }
      throw e;
    }
    if (generation !== epoch) return refresh();
    const after = child.snapshot();
    if (after.savePending) return snapshot();
    if (after.removal && after.verified)
      return record(
        entry.member,
        makeSelectionOutcome(root!, entry.member, 'removed', after.removal.jobToken),
      );
    if (after.phase === 'cancelled') {
      const expected = root!.head.stamp;
      await save(() => store.fence(expected, index));
    }
    return snapshot();
  }
  async function exclusive(action: 'advance' | 'apply' | 'retry') {
    guard();
    if (running) throw Error('Há uma unidade da seleção em andamento.');
    running = true;
    try {
      return await drive(action);
    } finally {
      running = false;
    }
  }
  async function cancel() {
    guard();
    if (closing) return snapshot();
    closing = true;
    localCancelling = true;
    epoch++;
    debt = null;
    cached = null;
    try {
      // The parent intent is durable independently of any held producer RPC.
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
