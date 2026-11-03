// @vitest-environment node
import { afterEach, afterAll, expect, it, vi } from 'vitest';
vi.setConfig({ testTimeout: 60000 });
afterAll(() => vi.resetConfig());
import {
  visibilityFixture,
  visibilityReady,
  finishVisibility,
} from './bookLoreVisibilitySelectionHarness.mjs';
import { openBookLoreVisibilitySelection } from '../services/bookLoreVisibilitySelectionOperation.ts';
import { listBookLoreVisibilitySelections } from '../services/bookLoreVisibilitySelectionDb.ts';
afterEach(() => vi.unstubAllGlobals());
it('stores the whole 53-member plan before RPC and applies actual C1 isPublic edits without a selection cap', async () => {
  const f = await visibilityFixture({ count: 53 }),
    op = await f.make();
  expect(f.calls).toHaveLength(0);
  expect((await op.page(0)).page.items).toHaveLength(50);
  expect((await op.page(1)).page.items).toHaveLength(3);
  await finishVisibility(op);
  expect(op.snapshot()).toMatchObject({
    phase: 'complete',
    count: 53,
    recordedApplied: 53,
    verifiedCount: 53,
  });
  expect(f.records.get('books/book').localLoreVersion).toBe(53);
  for (const m of f.input.members) {
    const source = await f.reader.capture('book', m.loreId);
    expect(source.data.isPublic).toBe(true);
    expect(source.data.details).toContain('NATIVE_PRIVATE_');
  }
  expect(JSON.stringify(f.parent.rows())).not.toContain('NATIVE_PRIVATE');
  const cold = await f.resume();
  expect(cold.snapshot().phase).toBe('verifying');
  const calls = f.calls.length;
  for (let i = 0; i < 53; i++) await cold.advance();
  expect(cold.snapshot().phase).toBe('complete');
  expect(f.calls.slice(calls).every((c) => c.kind === 'outcome')).toBe(true);
}, 300000);
it('unchanged results are distinct, close original IDs and never create a fake manual edit', async () => {
  const f = await visibilityFixture({ count: 2, publics: [true, true] }),
    op = await f.make();
  await finishVisibility(op);
  expect(op.snapshot()).toMatchObject({
    phase: 'complete',
    recordedApplied: 0,
    recordedUnchanged: 2,
  });
  expect(f.calls.some((c) => c.method === 'adoptBookLoreEditGeneration')).toBe(false);
  expect(f.records.get('books/book').localLoreVersion).toBe(0);
  expect(f.encrypted.rows()).toHaveLength(0);
  const cold = await f.resume();
  await cold.advance();
  await cold.advance();
  expect(cold.snapshot().phase).toBe('complete');
});
it('mixed changes and unchanged members preserve both results and unrelated source values', async () => {
  const f = await visibilityFixture({ count: 3, publics: [true, false, true] }),
    op = await f.make();
  await finishVisibility(op);
  expect(op.snapshot()).toMatchObject({
    recordedApplied: 1,
    recordedUnchanged: 2,
    phase: 'complete',
  });
  expect(f.records.get('books/book').localLoreVersion).toBe(1);
});
it('does not promote changed origins; closes that member and finishes other original sources', async () => {
  const f = await visibilityFixture({ count: 2 });
  await f.db.runTransaction((tx) =>
    tx.update(f.db.doc(f.seeds[0].path), { details: 'changed source' }),
  );
  const op = await f.make();
  await finishVisibility(op);
  expect(op.snapshot()).toMatchObject({
    phase: 'partial',
    recordedConflicts: 1,
    recordedApplied: 1,
  });
  expect(f.records.get(f.seeds[0].path).isPublic).toBe(false);
});
it('lost accepted apply reply is resolved after restart only by original native metadata, including child copy loss', async () => {
  const f = await visibilityFixture({ count: 1 }),
    op = await f.make();
  await visibilityReady(op);
  f.intercept(async (_kind, method, _input, invoke) => {
    const result = await invoke();
    if (method === 'adoptBookLoreEditGeneration') throw Error('lost accepted reply');
    return result;
  });
  await expect(op.apply()).rejects.toThrow('lost accepted reply');
  const entry = await f.store.member(0);
  f.dropChild(entry.member.writeId);
  const count = f.calls.length,
    cold = await f.resume();
  await cold.advance();
  expect(cold.snapshot()).toMatchObject({ phase: 'complete', recordedApplied: 1 });
  expect(f.calls.slice(count).map((c) => c.method)).toEqual(['bookLoreEditOutcome']);
  expect(f.records.get('books/book').localLoreVersion).toBe(1);
});
it('unaccepted apply is only queried by advance/apply; retry is explicit and reuses the original wire', async () => {
  const f = await visibilityFixture({ count: 1 }),
    op = await f.make();
  await visibilityReady(op);
  let drop = true;
  f.intercept(async (_kind, method, _input, invoke) => {
    if (method === 'adoptBookLoreEditGeneration' && drop) throw Error('not sent');
    return invoke();
  });
  await expect(op.apply()).rejects.toThrow('not sent');
  const first = f.calls.find((c) => c.method === 'adoptBookLoreEditGeneration'),
    count = f.calls.length;
  await op.advance();
  await op.apply();
  expect(f.calls.slice(count).every((c) => c.kind === 'outcome')).toBe(true);
  expect(op.snapshot().canRetry).toBe(true);
  drop = false;
  await op.retry();
  expect(op.snapshot()).toMatchObject({ phase: 'complete', recordedApplied: 1 });
  expect(f.calls.filter((c) => c.method === 'adoptBookLoreEditGeneration').at(-1)).toEqual(first);
});
it('cancel closes every original ID without loading source or creating manual drafts', async () => {
  const f = await visibilityFixture({ count: 53 }),
    op = await f.make();
  f.keyAllowed(false);
  for (let n = 0; n < 1000 && op.snapshot().phase !== 'cancelled'; n++) await op.cancel();
  expect(op.snapshot()).toMatchObject({
    phase: 'cancelled',
    recordedCancelled: 53,
    recordedApplied: 0,
  });
  expect(f.keys).toHaveLength(0);
  expect(f.encrypted.rows()).toHaveLength(0);
  expect(
    f.calls.every((c) =>
      ['getBookLoreSourceInspection', 'cancelBookLoreSourceInspection'].includes(c.method),
    ),
  ).toBe(true);
}, 30000);
it('discovery is metadata, paginated and account guarded without native RPC or private names', async () => {
  const f = await visibilityFixture({ count: 1 }),
    op = await f.make(),
    calls = f.calls.length;
  const list = await listBookLoreVisibilitySelections(f.uid, f.environment.guard, undefined, 1);
  expect(list.items).toHaveLength(1);
  expect(list.items[0].manifest.identity.selectionId).toBe(op.snapshot().identity.selectionId);
  expect(JSON.stringify(list)).not.toContain('Literal');
  expect(f.calls).toHaveLength(calls);
  f.current(false);
  await expect(op.advance()).rejects.toThrow('actor changed');
});

it('cancels prepared edits by metadata without keys and collects their staged resources', async () => {
  const f = await visibilityFixture({ count: 2 }),
    op = await f.make();
  await visibilityReady(op);
  expect([...f.records.keys()].some((p) => p.includes('/bookResourceBodies/'))).toBe(true);
  const keys = f.keys.length;
  f.keyAllowed(false);
  const cold = await f.resume();
  for (let n = 0; n < 1000 && cold.snapshot().phase !== 'cancelled'; n++) await cold.cancel();
  expect(cold.snapshot()).toMatchObject({
    phase: 'cancelled',
    recordedCancelled: 2,
    recordedApplied: 0,
  });
  expect(f.keys).toHaveLength(keys);
  expect(f.records.get('books/book').localLoreVersion).toBe(0);
  expect(
    [...f.records.keys()].filter((p) => /\/bookResource(Bodies|Chunks)\//.test(p)),
  ).toHaveLength(0);
});
it('accepted held apply survives independent cancellation; late producer cannot overwrite parent progress', async () => {
  const f = await visibilityFixture({ count: 3 }),
    op = await f.make();
  await visibilityReady(op);
  let entered, release;
  const atApply = new Promise((r) => {
      entered = r;
    }),
    held = new Promise((r) => {
      release = r;
    });
  f.intercept(async (_kind, method, _input, invoke) => {
    const result = await invoke();
    if (method === 'adoptBookLoreEditGeneration') {
      entered();
      await held;
    }
    return result;
  });
  const running = op.apply().catch((error) => ({ error }));
  await atApply;
  const keys = f.keys.length,
    cancel = await f.resume();
  for (let n = 0; n < 1000 && cancel.snapshot().phase !== 'cancelled'; n++) await cancel.cancel();
  expect(cancel.snapshot()).toMatchObject({
    phase: 'cancelled',
    recordedApplied: 1,
    recordedCancelled: 2,
  });
  expect(f.keys).toHaveLength(keys);
  const before = await f.store.read();
  release();
  await running;
  expect(await f.store.read()).toEqual(before);
  expect(f.calls.filter((c) => c.method === 'adoptBookLoreEditGeneration')).toHaveLength(1);
  expect(f.records.get('books/book').localLoreVersion).toBe(1);
});
it('lost cancellation reply remains pending until the same original native fence is confirmed', async () => {
  const f = await visibilityFixture({ count: 1 }),
    op = await f.make();
  let once = true;
  f.intercept(async (_kind, method, _input, invoke) => {
    const result = await invoke();
    if (method === 'cancelBookLoreSourceInspection' && once) {
      once = false;
      throw Error('lost cancel reply');
    }
    return result;
  });
  await op.cancel();
  await expect(op.cancel()).rejects.toThrow('lost cancel reply');
  expect(op.snapshot().cancelRequested).toBe(true);
  expect(op.snapshot().recordedCancelled).toBe(0);
  for (let n = 0; n < 20 && op.snapshot().phase !== 'cancelled'; n++) await op.advance();
  expect(op.snapshot()).toMatchObject({ phase: 'cancelled', recordedCancelled: 1 });
  expect(f.calls.filter((c) => c.method === 'cancelBookLoreSourceInspection')).toHaveLength(1);
});
it('a missing encrypted child before application can still be cancelled from pinned parent references', async () => {
  const f = await visibilityFixture({ count: 1 }),
    op = await f.make();
  await visibilityReady(op);
  const entry = await f.store.member(0);
  f.dropChild(entry.member.writeId);
  const cold = await f.resume(),
    keys = f.keys.length;
  f.keyAllowed(false);
  await expect(cold.advance()).rejects.toThrow('protected copy missing');
  for (let n = 0; n < 1000 && cold.snapshot().phase !== 'cancelled'; n++) await cold.cancel();
  expect(cold.snapshot()).toMatchObject({ phase: 'cancelled', recordedCancelled: 1 });
  expect(f.keys).toHaveLength(keys);
});
it('a key denial keeps the attempt and allows cancellation without granting the old source', async () => {
  const f = await visibilityFixture({ count: 1 }),
    op = await f.make();
  f.keyAllowed(false);
  await op.advance();
  await expect(op.advance()).rejects.toThrow('key denied');
  const keys = f.keys.length,
    cancel = await f.resume();
  for (let n = 0; n < 30 && cancel.snapshot().phase !== 'cancelled'; n++) await cancel.cancel();
  expect(cancel.snapshot()).toMatchObject({ phase: 'cancelled', recordedCancelled: 1 });
  expect(f.keys).toHaveLength(keys);
  expect(f.calls.some((c) => c.method === 'startBookLoreSourceInspection')).toBe(false);
});
it('lost local outcome ACK is flushed without producing the next member or replaying adoption', async () => {
  const f = await visibilityFixture({ count: 2 });
  await f.make();
  let fail = true;
  const store = {
    ...f.store,
    async change(...args) {
      const result = await f.store.change(...args);
      if (args[3] === 'finish' && fail) {
        fail = false;
        throw Error('local outcome ACK lost');
      }
      return result;
    },
  };
  const op = await openBookLoreVisibilitySelection(
    f.pack.root.manifest.identity,
    store,
    f.environment,
  );
  await visibilityReady(op);
  await expect(op.apply()).rejects.toThrow('local outcome ACK lost');
  expect(op.snapshot().savePending).toBe(true);
  const calls = f.calls.length;
  await op.advance();
  expect(f.calls).toHaveLength(calls);
  expect(op.snapshot()).toMatchObject({ savePending: false, cursor: 1 });
  await finishVisibility(op);
  expect(op.snapshot()).toMatchObject({ phase: 'complete', recordedApplied: 2 });
  expect(f.calls.filter((c) => c.method === 'adoptBookLoreEditGeneration')).toHaveLength(2);
});
it('parent metadata debt before RPC saves alone on the next action and preserves the original pending child', async () => {
  const f = await visibilityFixture({ count: 1 });
  await f.make();
  let fail = true;
  const store = {
      ...f.store,
      async change(index, revision, update, mode) {
        const entry = await f.store.member(index),
          next = update(entry.state);
        if (mode === 'produce' && next.upload && !entry.state.upload && fail) {
          fail = false;
          throw Error('parent refs not saved');
        }
        return f.store.change(index, revision, update, mode);
      },
    },
    op = await openBookLoreVisibilitySelection(f.pack.root.manifest.identity, store, f.environment);
  await expect(visibilityReady(op)).rejects.toThrow('parent refs not saved');
  expect(op.snapshot().savePending).toBe(true);
  expect(f.calls.some((c) => c.method === 'startBookLoreFieldUpload')).toBe(false);
  const calls = f.calls.length;
  await op.advance();
  expect(f.calls).toHaveLength(calls);
  expect(op.snapshot().savePending).toBe(false);
  await finishVisibility(op);
  expect(op.snapshot()).toMatchObject({ phase: 'complete', recordedApplied: 1 });
});
it('cold verification refuses a recreated original receipt without applying again or trusting recorded counts', async () => {
  const f = await visibilityFixture({ count: 1 }),
    op = await f.make();
  await finishVisibility(op);
  const entry = await f.store.member(0),
    path = 'users/author/bookLoreEdits/' + entry.state.edit.id,
    j = f.records.get(path),
    receipt = path + '/operations/' + j.adoption.operationId,
    original = f.records.get(receipt);
  await f.db.runTransaction((tx) => tx.delete(f.db.doc(receipt)));
  await f.db.runTransaction((tx) => tx.create(f.db.doc(receipt), original));
  const cold = await f.resume(),
    count = f.calls.length;
  await expect(cold.advance()).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(cold.snapshot().phase).toBe('verifying');
  expect(f.calls.slice(count).every((c) => c.kind === 'outcome')).toBe(true);
});

it('an absent consent field becoming explicit false is a real edit rather than an unchanged result', async () => {
  const f = await visibilityFixture({ count: 1, value: false, omitPublic: [0] }),
    op = await f.make();
  await finishVisibility(op);
  expect(op.snapshot()).toMatchObject({
    phase: 'complete',
    recordedApplied: 1,
    recordedUnchanged: 0,
  });
  expect((await f.reader.capture('book', 'entity-0')).data.isPublic).toBe(false);
});

it('a held cleanup observation cannot update a different member after same-handle cancellation advances', async () => {
  const f = await visibilityFixture({ count: 2 });
  await f.db.runTransaction((tx) =>
    tx.update(f.db.doc(f.seeds[0].path), { details: 'source changed' }),
  );
  const op = await f.make();
  await op.advance();
  let lose = true;
  f.intercept(async (_kind, method, _input, invoke) => {
    const result = await invoke();
    if (method === 'cancelBookLoreSourceInspection' && lose) {
      lose = false;
      throw Error('lost close reply');
    }
    return result;
  });
  await expect(op.advance()).rejects.toThrow('lost close reply');
  f.intercept(null);
  await op.advance();
  expect((await f.store.member(0)).state).toMatchObject({
    inspection: { seen: true },
    inspectionClosed: false,
  });
  let entered,
    release,
    once = true;
  const waiting = new Promise((r) => {
      entered = r;
    }),
    held = new Promise((r) => {
      release = r;
    });
  f.intercept(async (_kind, method, _input, invoke) => {
    const result = await invoke();
    if (method === 'getBookLoreSourceInspection' && once) {
      once = false;
      entered();
      await held;
    }
    return result;
  });
  const old = op.advance();
  await waiting;
  for (let n = 0; n < 20 && (await f.store.read()).head.cancelCursor === 0; n++) await op.cancel();
  await op.cancel();
  const before = await f.store.member(1);
  expect(before.state.inspectionClosed).toBe(false);
  release();
  await old;
  expect(await f.store.member(1)).toEqual(before);
  for (let n = 0; n < 20 && op.snapshot().phase !== 'cancelled'; n++) await op.cancel();
  expect(op.snapshot()).toMatchObject({
    phase: 'cancelled',
    recordedConflicts: 1,
    recordedCancelled: 1,
  });
});

it('a source changed after ready becomes conflict only after the original apply is checked as unaccepted', async () => {
  const f = await visibilityFixture({ count: 2 }),
    op = await f.make();
  await visibilityReady(op);
  await f.db.runTransaction((tx) =>
    tx.update(f.db.doc(f.seeds[0].path), { details: 'newer source' }),
  );
  await expect(op.apply()).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(op.snapshot().recordedConflicts).toBe(0);
  const before = f.calls.length;
  await op.advance();
  expect(f.calls[before].kind).toBe('outcome');
  expect(op.snapshot().phase).toBe('resolving-conflict');
  await finishVisibility(op);
  expect(op.snapshot()).toMatchObject({
    phase: 'partial',
    recordedConflicts: 1,
    recordedApplied: 1,
  });
  expect(f.records.get(f.seeds[0].path).isPublic).toBe(false);
});

it('one selection preserves raw source fields across inline, payload v1 and payload v2 heads', async () => {
  const f = await visibilityFixture({ count: 3, modes: ['inline', 'v1', 'v2'] }),
    op = await f.make();
  await finishVisibility(op);
  expect(op.snapshot()).toMatchObject({ phase: 'complete', recordedApplied: 3 });
  for (let n = 0; n < 3; n++) {
    const captured = await f.reader.capture('book', 'entity-' + n);
    expect(captured.data.isPublic).toBe(true);
    expect(captured.data.details).toBe('NATIVE_PRIVATE_' + n);
    expect(captured.data.name).toBe('Literal 🌙 ' + n);
  }
}, 30000);
