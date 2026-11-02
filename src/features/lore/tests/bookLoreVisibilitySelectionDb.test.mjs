// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { visibilityFixture } from './bookLoreVisibilitySelectionHarness.mjs';
import {
  createVisibilitySelection,
  readVisibilityRoot,
  visibilityHead,
} from '../services/bookLoreVisibilitySelectionContracts.ts';
afterEach(() => vi.unstubAllGlobals());
it('atomic initialization abort leaves no root, pages or members and can be retried without RPC', async () => {
  const f = await visibilityFixture({ count: 53 });
  f.parent.abortNext();
  await expect(f.make()).rejects.toThrow();
  expect(await f.store.read()).toBeNull();
  expect(f.parent.rows()).toHaveLength(0);
  await f.make();
  expect((await f.store.page(1)).states).toHaveLength(3);
  expect(f.calls).toHaveLength(0);
});
it('root and member updates roll back together and stale revisions are refused', async () => {
  const f = await visibilityFixture({ count: 1 });
  await f.make();
  const before = await f.store.member(0);
  f.parent.abortNext();
  const update = (old) => ({ ...old, intentHash: 'a'.repeat(64), unchanged: false });
  await expect(f.store.change(0, 0, update, 'produce')).rejects.toThrow();
  expect(await f.store.member(0)).toEqual(before);
  await f.store.change(0, 0, update, 'produce');
  await expect(f.store.change(0, 0, update, 'produce')).rejects.toThrow('outra aba');
});
it('rejects a conflicting desired value or original selection for the same durable identity', async () => {
  const f = await visibilityFixture({ count: 1 });
  await f.make();
  await expect(
    f.store.init(createVisibilitySelection({ ...f.input, value: false })),
  ).rejects.toThrow('outra aba');
  expect((await f.store.read()).manifest.value).toBe(true);
});
it('pins observed native tokens and forbids reopening production after cancellation', async () => {
  const f = await visibilityFixture({ count: 1 });
  await f.make();
  const entry = await f.store.member(0);
  await f.store.change(0, 0, (old) => ({
    ...old,
    inspection: { ...old.inspection, seen: true, jobToken: 'a'.repeat(64) },
  }));
  await expect(
    f.store.change(0, 1, (old) => ({
      ...old,
      inspection: { ...old.inspection, jobToken: 'b'.repeat(64) },
    })),
  ).rejects.toThrow();
  await f.store.cancel();
  await expect(f.store.change(0, 1, (old) => old, 'produce')).rejects.toThrow('outra aba');
  expect((await f.store.read()).head.cancelRequested).toBe(true);
  expect(entry.state.inspection.seen).toBe(false);
});
it('detects orphan pages before initializing and preserves them for inspection', async () => {
  const f = await visibilityFixture({ count: 1 });
  await f.store.read();
  const k = [f.uid, f.input.selectionId, 0];
  f.parent.stores.get('pages').set(JSON.stringify(k), { k, value: { orphan: true } });
  await expect(f.make()).rejects.toThrow();
  expect(await f.store.read()).toBeNull();
  expect(f.parent.rows()).toHaveLength(1);
  expect(f.calls).toHaveLength(0);
});
it('a changed manifest, page or member cannot be silently adopted by the reader', async () => {
  const f = await visibilityFixture({ count: 1 });
  await f.make();
  const roots = f.parent.stores.get('selections'),
    key = JSON.stringify([f.uid, f.input.selectionId]),
    original = roots.get(key),
    corrupted = structuredClone(original);
  corrupted.value.manifest.value = false;
  roots.set(key, corrupted);
  await expect(f.store.read()).rejects.toThrow();
  roots.set(key, original);
  const row = f.parent.stores.get('members').get(JSON.stringify([f.uid, f.input.selectionId, 0]));
  row.value.memberHash = 'f'.repeat(64);
  await expect(f.store.member(0)).rejects.toThrow();
  expect(readVisibilityRoot(original.value, f.pack.root.manifest.identity).head.stamp).toBe(
    visibilityHead(original.value.head).stamp,
  );
});
