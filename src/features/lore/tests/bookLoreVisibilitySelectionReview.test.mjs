// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { visibilityFixture, visibilityReady } from './bookLoreVisibilitySelectionHarness.mjs';
import { reviewBookLoreVisibilitySelection as review } from '../services/bookLoreVisibilitySelectionReview.ts';
import { createVisibilitySelection } from '../services/bookLoreVisibilitySelectionContracts.ts';
import { openBookLoreVisibilitySelection } from '../services/bookLoreVisibilitySelectionOperation.ts';
import { createBookLoreReadService } from '../../../../functions/src/bookLoreRead.mjs';
afterEach(() => vi.unstubAllGlobals());
it('reviews 53 literal names and actual consent from C1/v2 without native child mutation or parent prose', async () => {
  const f = await visibilityFixture({ count: 53, publics: [true, false], omitPublic: [2] }),
    op = await f.make();
  const result = await review(op, f.reader, f.environment.guard);
  expect(result).toMatchObject({ value: true, count: 53, mode: 'selection' });
  expect(result.members).toHaveLength(53);
  expect(result.members[0]).toMatchObject({ name: 'Literal 🌙 0', currentValue: true });
  expect(result.members[1].currentValue).toBe(false);
  expect(result.members[2].currentValue).toBeNull();
  expect(f.calls).toHaveLength(0);
  expect(f.keys).toHaveLength(0);
  expect(JSON.stringify(f.parent.rows())).not.toContain('Literal');
});
it('rejects an old v1 token without promoting it to the v2 emission', async () => {
  const f = await visibilityFixture({ count: 1 }),
    server = createBookLoreReadService({ db: f.db }),
    legacy = await server.getBookLoreRead(f.uid, {
      bookId: f.bookId,
      id: f.input.members[0].loreId,
    }),
    pack = createVisibilitySelection({
      ...f.input,
      members: [{ ...f.input.members[0], sourceToken: legacy.readToken }],
    });
  await f.store.init(pack);
  const op = await openBookLoreVisibilitySelection(
    pack.root.manifest.identity,
    f.store,
    f.environment,
  );
  await expect(review(op, f.reader, f.environment.guard)).rejects.toThrow('origem');
  expect(f.calls).toHaveLength(0);
});
it('detects source changes during C1 and refuses the stale literal name at final authorization', async () => {
  const f = await visibilityFixture({ count: 1 }),
    op = await f.make();
  const reader = {
    ...f.reader,
    async capture(...args) {
      const captured = await f.reader.capture(...args);
      await f.db.runTransaction((tx) =>
        tx.update(f.db.doc(f.seeds[0].path), { details: 'changed during review' }),
      );
      return captured;
    },
  };
  await expect(review(op, reader, f.environment.guard)).rejects.toThrow();
  expect(f.calls).toHaveLength(0);
});
it('retry reviews only the current uncertain member after a native false result', async () => {
  const f = await visibilityFixture({ count: 3 }),
    op = await f.make();
  await visibilityReady(op);
  f.intercept((_kind, method, _input, invoke) => {
    if (method === 'adoptBookLoreEditGeneration') throw Error('not sent');
    return invoke();
  });
  await expect(op.apply()).rejects.toThrow('not sent');
  await expect(review(op, f.reader, f.environment.guard)).rejects.toThrow('Verifique');
  await op.advance();
  const calls = f.calls.length,
    checked = await review(op, f.reader, f.environment.guard);
  expect(checked.mode).toBe('retry');
  expect(checked.members.map((m) => m.index)).toEqual([0]);
  expect(f.calls).toHaveLength(calls);
});
it('skips already accepted results instead of opening their obsolete source token', async () => {
  const f = await visibilityFixture({ count: 2 }),
    op = await f.make();
  await visibilityReady(op);
  await op.apply();
  const checked = await review(op, f.reader, f.environment.guard);
  expect(checked.members.map((m) => m.index)).toEqual([1]);
});
it('parent cancellation during capture invalidates review without creating a child', async () => {
  const f = await visibilityFixture({ count: 1 }),
    op = await f.make();
  const reader = {
    ...f.reader,
    async capture(...args) {
      const captured = await f.reader.capture(...args);
      await f.store.cancel();
      return captured;
    },
  };
  await expect(review(op, reader, f.environment.guard)).rejects.toThrow('seleção mudou');
  expect(f.calls).toHaveLength(0);
});
it('actor changes stop the review and never publish a recovered name', async () => {
  const f = await visibilityFixture({ count: 1 }),
    op = await f.make();
  const reader = {
    ...f.reader,
    async capture(...args) {
      const captured = await f.reader.capture(...args);
      f.current(false);
      return captured;
    },
  };
  await expect(review(op, reader, f.environment.guard)).rejects.toThrow('actor changed');
  expect(f.calls).toHaveLength(0);
});
it('retry cannot keep an old cursor while another handle closes that original member', async () => {
  const f = await visibilityFixture({ count: 2 }),
    op = await f.make();
  await visibilityReady(op);
  f.intercept((_kind, method, _input, invoke) => {
    if (method === 'adoptBookLoreEditGeneration') throw Error('not sent');
    return invoke();
  });
  await expect(op.apply()).rejects.toThrow();
  await op.advance();
  const reader = {
    ...f.reader,
    async capture(...args) {
      const captured = await f.reader.capture(...args);
      const batch = await f.store.page(0),
        edit = batch.states[0].edit;
      await f.native.call('cancelBookLoreEditReservation', {
        editId: edit.id,
        startHash: edit.startHash,
        jobToken: edit.jobToken,
        operationId: 'external-cancel',
      });
      await f.store.change(
        0,
        batch.states[0].revision,
        (old) => ({ ...old, closing: 'conflict' }),
        'control',
      );
      const other = await f.resume();
      for (let n = 0; n < 20 && other.snapshot().cursor === 0; n++) await other.advance();
      expect(other.snapshot().cursor).toBe(1);
      expect(other.snapshot().cancelRequested).toBe(false);
      return captured;
    },
  };
  await expect(review(op, reader, f.environment.guard)).rejects.toThrow('seleção mudou');
});
