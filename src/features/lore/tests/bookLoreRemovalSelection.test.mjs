// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { removalSelectionFixture, finishSelection } from './bookLoreRemovalSelectionHarness.mjs';
import { gate } from './bookLoreRemovalHarness.mjs';
import {
  createRemovalSelection,
  readSelectionRoot,
  readSelectionPage,
  selectionHead,
  LoreSelectionConflict,
} from '../services/bookLoreRemovalSelectionContracts.ts';
import {
  listBookLoreRemovalSelections,
  bookLoreRemovalSelectionStore,
} from '../services/bookLoreRemovalSelectionDb.ts';

afterEach(() => vi.unstubAllGlobals());
const pause = () => new Promise((r) => setTimeout(r, 0));
async function ready(op) {
  for (let n = 0; n < 1000 && op.snapshot().phase !== 'ready'; n++) await op.advance();
  expect(op.snapshot().phase).toBe('ready');
}

it('persists all 53 members in immutable bounded pages before any RPC and preserves the original selection', async () => {
  const f = await removalSelectionFixture({ count: 53 }),
    op = await f.make();
  expect(f.calls).toHaveLength(0);
  expect((await op.page(0)).page.items).toHaveLength(50);
  expect((await op.page(1)).page.items).toHaveLength(3);
  expect((await op.page(1)).outcomes).toEqual([null, null, null]);
  const before = JSON.stringify(f.input);
  await finishSelection(op);
  expect(op.snapshot()).toMatchObject({
    phase: 'complete',
    count: 53,
    recordedRemoved: 53,
    verifiedCount: 53,
  });
  expect(f.records.get('books/book').localLoreVersion).toBe(53);
  expect(JSON.stringify(f.input)).toBe(before);
  expect(f.calls.filter((c) => c.method === 'startBookLoreRemoval')).toHaveLength(53);
  expect(JSON.stringify(f.local.rows())).not.toContain('PRIVATE_PROSE');
  expect(JSON.stringify(f.local.rows())).not.toContain('private 🌙');
}, 20000);

it('waits for the atomic IndexedDB oncomplete before exposing the manifest or a driver', async () => {
  const f = await removalSelectionFixture(),
    done = vi.fn();
  f.local.hold();
  const making = f.make().then(done);
  for (let n = 0; n < 100 && !f.local.held(); n++) await pause();
  expect(f.local.held()).toBe(1);
  expect(done).not.toHaveBeenCalled();
  expect(f.calls).toHaveLength(0);
  f.local.release();
  await making;
  expect(done).toHaveBeenCalledOnce();
});

it('aborted creation leaves no partial pages or selection and cannot send a child RPC', async () => {
  const f = await removalSelectionFixture({ count: 53 });
  f.local.abortNext();
  await expect(f.make()).rejects.toThrow();
  expect(f.local.rows()).toEqual([]);
  expect(f.calls).toHaveLength(0);
  expect((await f.make()).snapshot().count).toBe(53);
});

it('rejects duplicate, unknown and mutated membership instead of silently shortening the selection', async () => {
  const f = await removalSelectionFixture();
  for (const input of [
    { ...f.input, members: [] },
    { ...f.input, members: [f.input.members[0], f.input.members[0]] },
    { ...f.input, members: [{ ...f.input.members[0], name: 'prose' }] },
    { ...f.input, action: 'visibility' },
  ])
    expect(() => createRemovalSelection(input)).toThrow();
  await f.make();
  const page = structuredClone((await f.store.page(0)).page);
  page.items[0].sourceToken = 'a'.repeat(64);
  expect(() => readSelectionPage(page, f.pack.root, 0)).toThrow();
  await expect(
    f.store.init(createRemovalSelection({ ...f.input, members: [f.input.members[1]] })),
  ).rejects.toBeInstanceOf(LoreSelectionConflict);
});

it('refuses orphan pages or outcomes without replacing or adopting them', async () => {
  for (const storeName of ['pages', 'outcomes']) {
    const f = await removalSelectionFixture();
    await f.make();
    const roots = f.local.stores.get('selections');
    roots.clear();
    if (storeName === 'outcomes') {
      f.local.stores.get('pages').clear();
      const k = ['author', f.input.selectionId, 0];
      f.local.stores.get('outcomes').set(JSON.stringify(k), { k, value: { unknown: true } });
    }
    const before = JSON.stringify(f.local.rows());
    await expect(f.make()).rejects.toThrow();
    expect(JSON.stringify(f.local.rows())).toBe(before);
  }
});

it('opening, resuming and listing are metadata-only; advance never authorizes a withdrawal', async () => {
  const f = await removalSelectionFixture(),
    op = await f.make();
  await f.resume();
  await listBookLoreRemovalSelections('author', f.guard);
  expect(f.calls).toHaveLength(0);
  await ready(op);
  await op.advance();
  expect(f.calls.some((c) => c.method === 'startBookLoreRemoval')).toBe(false);
  expect(f.sources.every((s) => f.records.has(s.seed.path))).toBe(true);
});

it('cold completed progress is neutral until every original removal is freshly verified without replaying producers', async () => {
  const f = await removalSelectionFixture(),
    op = await f.make();
  await finishSelection(op);
  const before = f.calls.length,
    cold = await f.resume();
  expect(cold.snapshot()).toMatchObject({
    phase: 'verifying',
    recordedRemoved: 3,
    verifiedCount: 0,
  });
  await finishSelection(cold, 'advance');
  expect(cold.snapshot().verifiedCount).toBe(3);
  expect(f.calls.slice(before).map((c) => c.method)).toEqual(Array(3).fill('getBookLoreRemoval'));
});

for (const accepted of [false, true])
  it(
    'lost destructive response never gets automatically resent, accepted=' + accepted,
    async () => {
      const f = await removalSelectionFixture(),
        op = await f.make();
      await ready(op);
      f.setHook(async (method, _input, invoke) => {
        if (method !== 'startBookLoreRemoval') return invoke();
        if (accepted) await invoke();
        throw Error('lost destructive reply');
      });
      await expect(op.apply()).rejects.toThrow('lost destructive');
      f.setHook(null);
      const cold = await f.resume(),
        before = f.calls.length;
      await cold.advance();
      if (accepted) expect(cold.snapshot().recordedRemoved).toBe(1);
      else {
        expect(cold.snapshot().phase).toBe('uncertain');
        await cold.apply();
        expect(cold.snapshot().phase).toBe('uncertain');
        expect(f.calls.slice(before).every((c) => c.method === 'getBookLoreRemoval')).toBe(true);
        await cold.retry();
        expect(cold.snapshot().recordedRemoved).toBe(1);
      }
      expect(f.calls.filter((c) => c.method === 'startBookLoreRemoval')).toHaveLength(
        accepted ? 1 : 2,
      );
      await finishSelection(cold);
    },
  );

it('a real source conflict is fenced and verified before advancing, keeping other origins unchanged', async () => {
  const f = await removalSelectionFixture(),
    op = await f.make(),
    original = JSON.stringify(f.input);
  await ready(op);
  await op.apply();
  await f.db.runTransaction(async (tx) => {
    tx.update(f.db.doc(f.sources[1].seed.path), { name: 'Changed externally' });
    tx.update(f.db.doc('books/book'), { localLoreVersion: 2 });
  });
  await finishSelection(op);
  expect(op.snapshot()).toMatchObject({
    phase: 'partial',
    recordedRemoved: 2,
    recordedConflicts: 1,
    verifiedCount: 3,
  });
  expect(f.records.has(f.sources[1].seed.path)).toBe(true);
  expect(JSON.stringify(f.input)).toBe(original);
  const outcome = (await op.page(0)).outcomes[1];
  expect(outcome.kind).toBe('conflict');
  const cold = await f.resume();
  await finishSelection(cold, 'advance');
  expect(cold.snapshot().phase).toBe('partial');
});

it('network failures during inspection are not converted into completed conflicts or skipped members', async () => {
  const f = await removalSelectionFixture(),
    op = await f.make();
  f.setHook(() => Promise.reject(Error('offline')));
  await expect(op.advance()).rejects.toThrow('offline');
  expect(op.snapshot()).toMatchObject({ cursor: 0, recordedConflicts: 0, recordedRemoved: 0 });
  f.setHook(null);
  await finishSelection(op);
});

it('parent receipt ACK debt blocks the next producer and a later action only saves the same outcome', async () => {
  const f = await removalSelectionFixture(),
    op = await f.make();
  await ready(op);
  f.setHook(async (method, _input, invoke) => {
    const result = await invoke();
    if (method === 'startBookLoreRemoval') f.local.abortNext();
    return result;
  });
  await expect(op.apply()).rejects.toThrow();
  expect(op.snapshot()).toMatchObject({ savePending: true, cursor: 0 });
  const before = f.calls.length;
  await op.apply();
  expect(op.snapshot()).toMatchObject({ savePending: false, cursor: 1 });
  expect(f.calls).toHaveLength(before);
  f.setHook(null);
  await finishSelection(op);
});

it('cancel before any child starts installs fences for the entire original selection', async () => {
  const f = await removalSelectionFixture(),
    op = await f.make();
  await op.cancel();
  await finishSelection(op, 'advance');
  expect(op.snapshot()).toMatchObject({
    phase: 'cancelled',
    recordedCancelled: 3,
    recordedRemoved: 0,
    verifiedCount: 3,
  });
  expect(f.calls.filter((c) => c.method === 'cancelBookLoreSourceInspection')).toHaveLength(3);
  expect(f.calls.some((c) => c.method === 'startBookLoreRemoval')).toBe(false);
  expect(f.sources.every((s) => f.records.has(s.seed.path))).toBe(true);
  const cold = await f.resume(),
    before = f.calls.length;
  expect(cold.snapshot().phase).toBe('verifying');
  await finishSelection(cold, 'advance');
  expect(f.calls.slice(before).every((c) => c.method === 'getBookLoreSourceInspection')).toBe(true);
});

for (const accepted of [false, true])
  it(
    'fresh cancellation does not wait for a held withdrawal and never restores an accepted head, accepted=' +
      accepted,
    async () => {
      const f = await removalSelectionFixture(),
        op = await f.make(),
        g = gate();
      await ready(op);
      f.setHook(async (method, _input, invoke) => {
        if (method !== 'startBookLoreRemoval') return invoke();
        const result = accepted ? await invoke() : null;
        g.entered();
        await g.waiting;
        return accepted ? result : invoke();
      });
      const applying = op.apply().catch((e) => e);
      await g.started;
      await op.cancel();
      f.setHook(null);
      const fresh = await f.resume();
      await finishSelection(fresh, 'advance');
      expect(fresh.snapshot()).toMatchObject({
        phase: 'cancelled',
        recordedRemoved: accepted ? 1 : 0,
        recordedCancelled: accepted ? 2 : 3,
      });
      g.release();
      await applying;
      expect(op.snapshot().cancelRequested).toBe(true);
      expect(f.records.has(f.sources[0].seed.path)).toBe(!accepted);
      expect(f.sources.slice(1).every((s) => f.records.has(s.seed.path))).toBe(true);
      expect(f.calls.filter((c) => c.method === 'startBookLoreRemoval')).toHaveLength(1);
    },
  );

it('unsaved parent cancel remains a debt and cannot be followed by an apply producer', async () => {
  const f = await removalSelectionFixture(),
    op = await f.make();
  await ready(op);
  f.local.abortNext();
  await expect(op.cancel()).rejects.toThrow();
  expect(op.snapshot()).toMatchObject({ savePending: true, cancelRequested: true });
  const before = f.calls.length;
  await op.apply();
  expect(f.calls).toHaveLength(before);
  expect(op.snapshot().cancelRequested).toBe(true);
  await finishSelection(op, 'advance');
  expect(op.snapshot().recordedRemoved).toBe(0);
});

it('concurrent tabs do not double-count or change the membership of a selection', async () => {
  const f = await removalSelectionFixture(),
    a = await f.make(),
    b = await f.resume();
  await Promise.all([a.advance(), b.advance()]);
  await ready(a);
  await ready(b);
  await Promise.allSettled([a.apply(), b.apply()]);
  await finishSelection(a);
  await finishSelection(b, 'advance');
  expect((await f.store.read()).head.removed).toBe(3);
  expect(f.records.get('books/book').localLoreVersion).toBe(3);
});

it('a missing original native receipt is not replaced by local progress or another destructive start', async () => {
  const f = await removalSelectionFixture({ count: 1 }),
    op = await f.make();
  await finishSelection(op);
  const child = [...f.children.values()][0],
    path = 'users/author/bookLoreRemovals/' + child.intent.removalId;
  await f.db.runTransaction(async (tx) => tx.delete(f.db.doc(path)));
  const cold = await f.resume(),
    before = f.calls.length;
  await expect(cold.advance()).rejects.toThrow();
  expect(cold.snapshot().phase).toBe('verifying');
  expect(f.calls.slice(before).some((c) => c.method === 'startBookLoreRemoval')).toBe(false);
});

it('scope and corrupted head/page metadata fail closed without another account or producer', async () => {
  const f = await removalSelectionFixture(),
    op = await f.make();
  await expect(
    bookLoreRemovalSelectionStore(
      { ...f.pack.root.manifest.identity, uid: 'other' },
      f.guard,
    ).read(),
  ).resolves.toBeNull();
  await expect(
    bookLoreRemovalSelectionStore(
      { uid: 'author', bookId: 'other', selectionId: f.input.selectionId },
      f.guard,
    ).read(),
  ).rejects.toThrow();
  const bad = structuredClone(f.pack.root);
  bad.head = selectionHead({ ...bad.head, cursor: 1, removed: 1 });
  // A valid metadata hash is still not remote evidence; the original child must confirm.
  expect(readSelectionRoot(bad, f.pack.root.manifest.identity).head.cursor).toBe(1);
  f.setCurrent(false);
  await expect(op.apply()).rejects.toThrow('Actor/host');
  expect(f.calls).toHaveLength(0);
});

it('late local outcome ACK does not erase a newer parent cancellation or start another member', async () => {
  const f = await removalSelectionFixture(),
    op = await f.make();
  await ready(op);
  f.local.hold();
  const applying = op.apply();
  for (let n = 0; n < 100 && !f.local.held(); n++) await pause();
  expect(f.local.held()).toBe(1);
  const cancelling = op.cancel();
  expect(op.snapshot().cancelRequested).toBe(true);
  f.local.release();
  await Promise.all([applying, cancelling]);
  await finishSelection(op, 'advance');
  expect(op.snapshot()).toMatchObject({
    phase: 'cancelled',
    recordedRemoved: 1,
    recordedCancelled: 2,
  });
  expect(f.calls.filter((c) => c.method === 'startBookLoreRemoval')).toHaveLength(1);
});

it('an identical old finish is idempotent but a different token cannot replace its immutable outcome', async () => {
  const f = await removalSelectionFixture({ count: 1 }),
    op = await f.make(),
    old = (await f.store.read()).head.stamp;
  await finishSelection(op);
  const current = await f.store.read(),
    outcome = (await op.page(0)).outcomes[0];
  expect(await f.store.finish(old, 0, outcome)).toEqual(current);
  await expect(f.store.finish(old, 0, { ...outcome, jobToken: 'f'.repeat(64) })).rejects.toThrow();
  expect(await f.store.read()).toEqual(current);
});

it('source changed after ready is fenced and checked before becoming a partial conflict', async () => {
  const f = await removalSelectionFixture(),
    op = await f.make();
  await ready(op);
  await f.db.runTransaction(async (tx) => {
    tx.update(f.db.doc(f.sources[0].seed.path), { name: 'Changed after review' });
    tx.update(f.db.doc('books/book'), { localLoreVersion: 1 });
  });
  await op.apply();
  expect(op.snapshot()).toMatchObject({
    phase: 'resolving-conflict',
    cursor: 0,
    recordedConflicts: 0,
  });
  await finishSelection(op);
  expect(op.snapshot()).toMatchObject({
    phase: 'partial',
    recordedConflicts: 1,
    recordedRemoved: 2,
  });
  expect(f.records.get(f.sources[0].seed.path).name).toBe('Changed after review');
  const wire = [...f.children.values()].find((j) => j.identity.loreId === f.sources[0].id);
  expect(
    f.calls.filter(
      (c) => c.method === 'startBookLoreRemoval' && c.input.removalId === wire.intent.removalId,
    ),
  ).toHaveLength(1);
});

it('discovery paginates 53 selections by the exact account without a collection ceiling', async () => {
  const f = await removalSelectionFixture({ count: 1 });
  for (let i = 0; i < 53; i++) {
    const pack = createRemovalSelection({
      ...f.input,
      selectionId: 'selection-' + String(i).padStart(3, '0'),
    });
    await bookLoreRemovalSelectionStore(pack.root.manifest.identity, f.guard).init(pack);
  }
  const ids = [];
  let after;
  do {
    const page = await listBookLoreRemovalSelections('author', f.guard, after, 17);
    ids.push(...page.items.map((r) => r.manifest.identity.selectionId));
    after = page.next ?? undefined;
  } while (after);
  expect(new Set(ids).size).toBe(53);
  expect((await listBookLoreRemovalSelections('other', f.guard)).items).toEqual([]);
  expect(f.calls).toHaveLength(0);
});

it('forged well-formed local progress cannot become fresh native proof or authorize a new producer', async () => {
  const { makeSelectionOutcome } = await import('../services/bookLoreRemovalSelectionContracts.ts');
  const f = await removalSelectionFixture({ count: 1 });
  await f.make();
  const root = await f.store.read(),
    member = (await f.store.member(0)).member;
  await f.store.finish(
    root.head.stamp,
    0,
    makeSelectionOutcome(root, member, 'removed', 'a'.repeat(64)),
  );
  const cold = await f.resume();
  expect(cold.snapshot()).toMatchObject({
    phase: 'verifying',
    recordedRemoved: 1,
    verifiedCount: 0,
  });
  await expect(cold.advance()).rejects.toThrow();
  expect(cold.snapshot().phase).toBe('verifying');
  expect(f.calls.map((c) => c.method)).toEqual(['getBookLoreSourceInspection']);
  expect(f.records.has(f.sources[0].seed.path)).toBe(true);
});

it('mixed inline and payload v1/v2 members use their original sources with the same durable selection', async () => {
  const f = await removalSelectionFixture({ modes: ['inline', 'v1', 'v2'] }),
    op = await f.make();
  await finishSelection(op);
  expect(op.snapshot()).toMatchObject({ phase: 'complete', recordedRemoved: 3, verifiedCount: 3 });
  expect(f.sources.every((s) => !f.records.has(s.seed.path))).toBe(true);
});

it('loss of the child journal cannot turn a previously accepted removal into a cancelled untouched member', async () => {
  const f = await removalSelectionFixture(),
    op = await f.make();
  await ready(op);
  f.setHook(async (method, _input, invoke) => {
    const result = await invoke();
    if (method === 'startBookLoreRemoval') throw Error('lost accepted');
    return result;
  });
  await expect(op.apply()).rejects.toThrow('lost accepted');
  f.setHook(null);
  f.children.clear();
  const fresh = await f.resume();
  await fresh.cancel();
  await finishSelection(fresh, 'advance');
  expect(fresh.snapshot()).toMatchObject({
    phase: 'cancelled',
    recordedRemoved: 1,
    recordedCancelled: 2,
  });
  expect(f.records.has(f.sources[0].seed.path)).toBe(false);
  expect(f.calls.filter((c) => c.method === 'startBookLoreRemoval')).toHaveLength(1);
});
