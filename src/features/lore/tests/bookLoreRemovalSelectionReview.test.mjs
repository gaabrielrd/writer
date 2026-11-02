// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { removalSelectionFixture } from './bookLoreRemovalSelectionHarness.mjs';
import { createBookLoreReadService } from '../../../../functions/src/bookLoreRead.mjs';
import { createBookLoreReadClient } from '../services/bookLoreReadClient.ts';
import { reviewBookLoreRemovalSelection } from '../services/bookLoreRemovalSelectionReview.ts';
import { createRemovalSelection } from '../services/bookLoreRemovalSelectionContracts.ts';
import { bookLoreRemovalSelectionStore } from '../services/bookLoreRemovalSelectionDb.ts';
import { openBookLoreRemovalSelection } from '../services/bookLoreRemovalSelectionOperation.ts';
afterEach(() => vi.unstubAllGlobals());
async function setup(options) {
  const f = await removalSelectionFixture(options),
    op = await f.make(),
    server = createBookLoreReadService({ db: f.db }),
    call = vi.fn((method, input) => server[method]('author', input)),
    reader = createBookLoreReadClient(call, f.guard, { tokenVersion: 2 });
  return {
    ...f,
    op,
    server,
    call,
    reader,
    review: () => reviewBookLoreRemovalSelection(op, reader, f.guard),
  };
}
it('reviews all 53 original C1 names literally without persisting prose or starting a withdrawal', async () => {
  const literal = ' \ufeff' + '字🌙'.repeat(100),
    f = await setup({ count: 53, names: [literal] }),
    original = JSON.stringify(f.input),
    result = await f.review();
  expect(result.members).toHaveLength(53);
  expect(result.members[0].name).toBe(literal);
  expect(Object.isFrozen(result.members)).toBe(true);
  expect(JSON.stringify(f.input)).toBe(original);
  expect(JSON.stringify(f.local.rows())).not.toContain(literal);
  expect(JSON.stringify(result)).not.toContain('details');
  expect(f.calls).toHaveLength(0);
  expect(f.records.get('books/book').localLoreVersion).toBe(0);
  expect(
    f.call.mock.calls
      .filter(([m, i]) => m === 'getBookLoreRead' && !i.readToken)
      .every(([, i]) => i.tokenVersion === 2),
  ).toBe(true);
});
it('rejects a valid legacy origin instead of promoting it to the newly emitted v2 token', async () => {
  const f = await setup({ count: 1 }),
    old = await f.server.getBookLoreRead('author', { bookId: 'book', id: f.sources[0].id }),
    pack = createRemovalSelection({
      ...f.input,
      selectionId: 'legacy',
      members: [{ loreId: f.sources[0].id, sourceToken: old.readToken }],
    }),
    store = bookLoreRemovalSelectionStore(pack.root.manifest.identity, f.guard);
  await store.init(pack);
  const op = await openBookLoreRemovalSelection(pack.root.manifest.identity, store, f.environment);
  await expect(reviewBookLoreRemovalSelection(op, f.reader, f.guard)).rejects.toThrow('mudou');
  expect((await store.page(0)).page.items[0].sourceToken).toBe(old.readToken);
  expect(f.calls).toHaveLength(0);
});
it('source changed after the independent header is never silently adopted by C1 capture', async () => {
  const f = await setup({ count: 1 });
  let changed = false;
  f.call.mockImplementation(async (method, input) => {
    const result = await f.server[method]('author', input);
    if (method === 'getBookLoreRead' && !changed) {
      changed = true;
      await f.db.runTransaction(async (tx) =>
        tx.update(f.db.doc(f.sources[0].seed.path), { name: 'Changed' }),
      );
    }
    return result;
  });
  await expect(f.review()).rejects.toThrow();
  expect(f.op.snapshot().recordedRemoved).toBe(0);
  expect(f.calls).toHaveLength(0);
});
it('the final reauthorization rejects an earlier source changed while a later name was assembled', async () => {
  const f = await setup({ count: 2 });
  let changed = false;
  f.call.mockImplementation(async (method, input) => {
    const result = await f.server[method]('author', input);
    if (method === 'getBookLoreRead' && input.id === f.sources[1].id && !changed) {
      changed = true;
      await f.db.runTransaction(async (tx) =>
        tx.update(f.db.doc(f.sources[0].seed.path), { name: 'Later external edit' }),
      );
    }
    return result;
  });
  await expect(f.review()).rejects.toThrow();
  expect(f.calls).toHaveLength(0);
});
it('only pending original members are reviewed after a confirmed partial advance', async () => {
  const f = await setup();
  for (let n = 0; n < 100 && f.op.snapshot().phase !== 'ready'; n++) await f.op.advance();
  await f.op.apply();
  const before = f.calls.length,
    result = await f.review();
  expect(result.members.map((m) => m.index)).toEqual([1, 2]);
  expect(result.members.map((m) => m.sourceToken)).toEqual(
    f.input.members.slice(1).map((m) => m.sourceToken),
  );
  expect(f.calls).toHaveLength(before);
});
it('a book or manifest mismatch fails before opening source text', async () => {
  const f = await setup(),
    op = {
      ...f.op,
      page: async (i) => {
        const page = await f.op.page(i);
        return {
          ...page,
          root: {
            ...page.root,
            manifest: {
              ...page.root.manifest,
              identity: { ...page.root.manifest.identity, bookId: 'other' },
            },
          },
        };
      },
    };
  await expect(reviewBookLoreRemovalSelection(op, f.reader, f.guard)).rejects.toThrow();
  expect(f.call).not.toHaveBeenCalled();
});
it('actor/host revocation stops assembling names and never starts a child', async () => {
  const f = await setup({ count: 1 });
  f.call.mockImplementation(async (method, input) => {
    const value = await f.server[method]('author', input);
    f.setCurrent(false);
    return value;
  });
  await expect(f.review()).rejects.toThrow('Actor/host');
  expect(f.calls).toHaveLength(0);
});
it('a parent cancellation is re-read at the end even when the handle snapshot has not refreshed', async () => {
  const f = await setup({ count: 1 });
  let changed = false;
  f.call.mockImplementation(async (method, input) => {
    const result = await f.server[method]('author', input);
    if (method === 'readBookLorePart' && !changed) {
      changed = true;
      await f.store.cancel();
    }
    return result;
  });
  await expect(f.review()).rejects.toThrow('seleção mudou');
  expect(f.op.snapshot().cancelRequested).toBe(false);
  expect((await f.store.read()).head.cancelRequested).toBe(true);
});
for (const patch of [{ savePending: true }, { cancelRequested: true }, { phase: 'verifying' }])
  it('unsettled state cannot open a new source review: ' + JSON.stringify(patch), async () => {
    const f = await setup(),
      op = { ...f.op, snapshot: () => ({ ...f.op.snapshot(), ...patch }) };
    await expect(reviewBookLoreRemovalSelection(op, f.reader, f.guard)).rejects.toThrow(
      'Verifique',
    );
    expect(f.call).not.toHaveBeenCalled();
  });
