// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import {
  removalOperationFixture,
  prepareRemoval,
  finishRemovalOperation,
  gate,
} from './bookLoreRemovalHarness.mjs';
import {
  listBookLoreRemovals,
  bookLoreRemovalStore,
} from '../services/bookLoreRemovalJournalDb.ts';
import {
  initialRemovalJournal,
  patchRemovalJournal,
} from '../services/bookLoreRemovalJournalContracts.ts';
import { openBookLoreRemovalOperation } from '../services/bookLoreRemovalOperation.ts';
import {
  bookLoreDeletionFixture,
  markBookDeleting,
  finishBookLoreDeletion,
} from '../../../../functions/test/helpers/bookLoreDeletionFixture.mjs';

afterEach(() => vi.unstubAllGlobals());
for (const mode of ['inline', 'v1', 'v2'])
  it(
    'prepares ' +
      mode +
      ' without withdrawal, applies explicitly and revalidates a cold completed recovery',
    async () => {
      const f = await removalOperationFixture({ mode }),
        op = await f.make();
      expect(f.calls).toHaveLength(0);
      await prepareRemoval(op);
      expect(f.records.has(f.source.seed.path)).toBe(true);
      expect(f.records.get('books/book').localLoreVersion).toBe(0);
      const ready = await f.resume();
      expect(f.calls.filter((c) => c.method === 'startBookLoreRemoval')).toHaveLength(0);
      expect(ready.snapshot().phase).toBe('ready');
      await ready.apply();
      expect(f.records.has(f.source.seed.path)).toBe(false);
      expect(f.records.get('books/book').localLoreVersion).toBe(1);
      await finishRemovalOperation(ready);
      const before = f.calls.length,
        cold = await f.resume();
      expect(cold.snapshot()).toMatchObject({ phase: 'verifying', verified: false });
      expect(f.calls).toHaveLength(before);
      await cold.advance();
      expect(cold.snapshot()).toMatchObject({ phase: 'complete', verified: true });
      expect(f.calls.slice(before).map((c) => c.method)).toEqual(['getBookLoreRemoval']);
      expect(JSON.stringify(f.local.rows())).not.toContain('PRIVATE_PROSE');
    },
  );

it('lost accepted withdrawal is resolved by metadata after reload without replaying start', async () => {
  const f = await removalOperationFixture(),
    op = await f.make();
  await prepareRemoval(op);
  f.setHook(async (method, input, invoke) => {
    const value = await invoke();
    if (method === 'startBookLoreRemoval') throw Error('lost accepted reply');
    return value;
  });
  await expect(op.apply()).rejects.toThrow('lost accepted');
  expect(op.snapshot().phase).toBe('uncertain');
  f.setHook(null);
  const before = f.calls.length,
    cold = await f.resume();
  expect(f.calls).toHaveLength(before);
  await cold.advance();
  expect(f.calls.slice(before).map((c) => c.method)).toEqual(['getBookLoreRemoval']);
  expect(cold.snapshot()).toMatchObject({ phase: 'cleaning', verified: true });
  expect(f.records.get('books/book').localLoreVersion).toBe(1);
});
it('an unaccepted uncertain start stays pending until explicit apply retries the exact original wire', async () => {
  const f = await removalOperationFixture(),
    op = await f.make();
  await prepareRemoval(op);
  f.setHook((method, input, invoke) =>
    method === 'startBookLoreRemoval' ? Promise.reject(Error('not sent')) : invoke(),
  );
  await expect(op.apply()).rejects.toThrow('not sent');
  const wire = (await f.store.read()).pending;
  f.setHook(null);
  const cold = await f.resume();
  await cold.advance();
  expect(cold.snapshot().phase).toBe('uncertain');
  expect(f.records.has(f.source.seed.path)).toBe(true);
  expect(f.calls.filter((c) => c.method === 'startBookLoreRemoval')).toHaveLength(1);
  await cold.apply();
  expect(f.calls.filter((c) => c.method === 'startBookLoreRemoval')).toEqual([wire, wire]);
  expect(cold.snapshot().phase).toBe('cleaning');
});
it('cancel before the first RPC persists a permanent inspection fence and never withdraws', async () => {
  const f = await removalOperationFixture(),
    op = await f.make();
  await op.cancel();
  await op.advance();
  expect(op.snapshot().phase).toBe('cancelled');
  await op.apply();
  await op.advance();
  expect(f.calls.map((c) => c.method)).toEqual(['cancelBookLoreSourceInspection']);
  expect(f.records.has(f.source.seed.path)).toBe(true);
});
for (const accepted of [false, true])
  it('cancel does not wait for an inspection reply, accepted=' + accepted, async () => {
    const f = await removalOperationFixture(),
      op = await f.make(),
      g = gate();
    f.setHook(async (method, input, invoke) => {
      if (method !== 'startBookLoreSourceInspection') return invoke();
      const result = accepted ? await invoke() : null;
      g.entered();
      await g.waiting;
      return accepted ? result : invoke();
    });
    const producing = op.advance();
    await g.started;
    await op.cancel();
    const cold = await f.resume();
    await cold.advance();
    expect(cold.snapshot().phase).toBe('cancelled');
    g.release();
    await producing;
    expect(op.snapshot().phase).toBe('cancelled');
    expect(f.records.has(f.source.seed.path)).toBe(true);
    expect(f.calls.filter((c) => c.method === 'startBookLoreRemoval')).toHaveLength(0);
  });
for (const accepted of [false, true])
  it(
    'cancel races withdrawal without restoring or losing the original event, accepted=' + accepted,
    async () => {
      const f = await removalOperationFixture(),
        op = await f.make(),
        g = gate();
      await prepareRemoval(op);
      f.setHook(async (method, input, invoke) => {
        if (method !== 'startBookLoreRemoval') return invoke();
        const result = accepted ? await invoke() : null;
        g.entered();
        await g.waiting;
        return accepted ? result : invoke();
      });
      const applying = op.apply();
      const outcome = applying.then(
        () => null,
        (e) => e,
      );
      await g.started;
      await op.cancel();
      const cold = await f.resume();
      await cold.advance();
      expect(cold.snapshot().phase).toBe(accepted ? 'cleaning' : 'cancelled');
      expect(f.records.has(f.source.seed.path)).toBe(!accepted);
      g.release();
      const error = await outcome;
      if (accepted) expect(error).toBeNull();
      else expect(error).toMatchObject({ code: 'failed-precondition' });
      if (!accepted) await op.advance();
      expect(op.snapshot().phase).toBe(accepted ? 'cleaning' : 'cancelled');
      if (accepted) await finishRemovalOperation(cold);
      expect(f.records.get('books/book').localLoreVersion).toBe(accepted ? 1 : 0);
    },
  );

it('a failed write before RPC blocks production; retry flushes only the exact journal debt', async () => {
  const f = await removalOperationFixture(),
    op = await f.make();
  f.local.abortNext();
  await expect(op.advance()).rejects.toThrow();
  expect(f.calls).toHaveLength(0);
  expect(op.snapshot().savePending).toBe(true);
  await op.advance();
  expect(f.calls).toHaveLength(0);
  expect(op.snapshot().savePending).toBe(false);
  await op.advance();
  expect(f.calls).toHaveLength(1);
  expect(op.snapshot().inspection).not.toBeNull();
});
for (const method of ['startBookLoreSourceInspection', 'startBookLoreRemoval'])
  it('a failed result write retains RAM debt without another producer: ' + method, async () => {
    const f = await removalOperationFixture(),
      op = await f.make();
    if (method === 'startBookLoreRemoval') await prepareRemoval(op);
    f.setHook(async (m, input, invoke) => {
      const result = await invoke();
      if (m === method) f.local.abortNext();
      return result;
    });
    await expect(method === 'startBookLoreRemoval' ? op.apply() : op.advance()).rejects.toThrow();
    expect(op.snapshot().savePending).toBe(true);
    const before = f.calls.length;
    await op.advance();
    expect(f.calls).toHaveLength(before);
    expect(op.snapshot().savePending).toBe(false);
    if (method === 'startBookLoreRemoval') expect(op.snapshot().phase).toBe('cleaning');
    else expect(op.snapshot().inspection).not.toBeNull();
  });
it('waits for transaction oncomplete before the first native mutation', async () => {
  const f = await removalOperationFixture(),
    op = await f.make();
  f.local.hold();
  const producing = op.advance();
  await vi.waitFor(() => expect(f.local.held()).toBe(1));
  expect(f.calls).toHaveLength(0);
  f.local.release();
  await producing;
  expect(f.calls).toHaveLength(1);
  expect(op.snapshot().inspection).not.toBeNull();
});
it('two handles preserve the same pending wire and do not advance the root clock twice', async () => {
  const f = await removalOperationFixture(),
    a = await f.make(),
    b = await f.resume();
  await Promise.all([a.advance(), b.advance()]);
  await prepareRemoval(a);
  await b.advance();
  await Promise.all([a.apply(), b.apply()]);
  expect(f.records.get('books/book').localLoreVersion).toBe(1);
  expect(f.records.has(f.source.seed.path)).toBe(false);
  const [left, right] = f.calls.filter((c) => c.method === 'startBookLoreRemoval');
  if (right) expect(right).toEqual(left);
});
it('rejects a changed source instead of rebasing withdrawal onto the replacement', async () => {
  const f = await removalOperationFixture(),
    op = await f.make();
  await prepareRemoval(op);
  await f.db.runTransaction(async (tx) => {
    tx.update(f.db.doc(f.source.seed.path), { summary: 'NEW PRIVATE PROSE' });
  });
  await expect(op.apply()).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(f.records.get(f.source.seed.path).summary).toBe('NEW PRIVATE PROSE');
  await op.cancel();
  await op.advance();
  expect(op.snapshot().phase).toBe('cancelled');
});
it('actor or host replacement during RPC leaves the durable original wire for the same account', async () => {
  const f = await removalOperationFixture(),
    op = await f.make(),
    g = gate();
  f.setHook(async (method, input, invoke) => {
    const value = await invoke();
    g.entered();
    await g.waiting;
    return value;
  });
  const promise = op.advance();
  const outcome = promise.then(
    () => null,
    (e) => e,
  );
  await g.started;
  f.setCurrent(false);
  g.release();
  expect(await outcome).toMatchObject({ message: 'Actor/host changed' });
  f.setCurrent(true);
  f.setHook(null);
  expect((await f.store.read()).pending.method).toBe('startBookLoreSourceInspection');
  const cold = await f.resume();
  await cold.advance();
  await prepareRemoval(cold);
  expect(cold.snapshot().phase).toBe('ready');
});
it('journal corruption or a mismatched identity never reaches the native service', async () => {
  const f = await removalOperationFixture(),
    op = await f.make();
  await expect(
    openBookLoreRemovalOperation(
      { ...f.identity, bookId: 'other' },
      f.port,
      f.store,
      f.guard,
      true,
    ),
  ).rejects.toThrow();
  expect(f.calls).toHaveLength(0);
  const row = f.local.rows().find((r) => r.store === 'removals');
  row.value.privateText = 'MUST NOT ENTER JOURNAL';
  await expect(f.resume()).rejects.toThrow();
  expect(op.snapshot().phase).toBe('inspecting');
});
it('metadata discovery is paged, account scoped and contains no source text', async () => {
  const f = await removalOperationFixture();
  for (let n = 0; n < 53; n++) {
    const identity = { ...f.identity, writeId: 'remove-' + String(n).padStart(3, '0') };
    await bookLoreRemovalStore(identity.uid, identity.writeId, f.guard).commit(
      initialRemovalJournal(identity),
      null,
    );
  }
  const first = await listBookLoreRemovals('author', f.guard);
  expect(first.items).toHaveLength(50);
  const last = await listBookLoreRemovals('author', f.guard, first.next);
  expect(last.items).toHaveLength(3);
  expect(last.next).toBeNull();
  expect((await listBookLoreRemovals('other', f.guard)).items).toHaveLength(0);
  expect(JSON.stringify(first)).not.toContain('PRIVATE_PROSE');
  await expect(listBookLoreRemovals('author', f.guard, undefined, 51)).rejects.toThrow();
  expect(f.calls).toHaveLength(0);
});
it('a stale tab cannot overwrite cancellation or reset the original journal', async () => {
  const f = await removalOperationFixture(),
    op = await f.make();
  const before = await f.store.read();
  await op.cancel();
  await expect(f.store.commit(patchRemovalJournal(before, {}), before.stamp)).rejects.toThrow(
    'outra aba',
  );
  expect((await f.store.read()).cancelRequested).toBe(true);
});
it('whole-book handoff queries the original event and never reuses the individual cleanup cursor', async () => {
  const f = await removalOperationFixture(),
    op = await f.make();
  await prepareRemoval(op);
  await op.apply();
  const book = bookLoreDeletionFixture(f.db);
  await markBookDeleting(book);
  for (let n = 0; n < 1000; n++) {
    await book.step();
    const p = await f.native.bookLoreRemoval('author', {
      method: 'getBookLoreRemoval',
      input: {
        removalId: op.snapshot().intent.removalId,
        startHash: op.snapshot().removal.startHash,
      },
    });
    if (p.phase === 'handed-off') break;
  }
  // A pending old cleanup unit must resolve the handoff instead of collecting.
  await expect(op.advance()).rejects.toMatchObject({ code: 'failed-precondition' });
  await op.advance();
  expect(op.snapshot().phase).toBe('handed-off');
  const before = f.calls.length;
  await op.advance();
  expect(f.calls.slice(before).map((c) => c.method)).toEqual(['getBookLoreRemoval']);
  await finishBookLoreDeletion(book);
  await op.advance();
  expect(op.snapshot().phase).toBe('complete');
  expect(f.records.has('books/book')).toBe(false);
});

it('a lost cleanup reply replays its exact bounded unit without repeating withdrawal', async () => {
  const f = await removalOperationFixture(),
    op = await f.make();
  await prepareRemoval(op);
  await op.apply();
  let lost = false;
  f.setHook(async (method, input, invoke) => {
    const result = await invoke();
    if (!lost && method === 'advanceBookLoreRemoval') {
      lost = true;
      throw Error('lost cleanup reply');
    }
    return result;
  });
  await expect(op.advance()).rejects.toThrow('lost cleanup');
  const wire = (await f.store.read()).pending;
  const cold = await f.resume();
  await cold.advance();
  const replay = f.calls.filter((c) => c.method === 'advanceBookLoreRemoval');
  expect(replay).toEqual([wire, wire]);
  expect(f.calls.filter((c) => c.method === 'startBookLoreRemoval')).toHaveLength(1);
  await finishRemovalOperation(cold);
});
it('malformed progress does not erase the pending request or confirm removal', async () => {
  const f = await removalOperationFixture(),
    op = await f.make();
  await prepareRemoval(op);
  f.setHook(async (method, input, invoke) => {
    const result = await invoke();
    return method === 'startBookLoreRemoval' ? { ...result, jobToken: 'invalid' } : result;
  });
  await expect(op.apply()).rejects.toThrow();
  expect((await f.store.read()).pending.method).toBe('startBookLoreRemoval');
  expect(op.snapshot().verified).toBe(false);
  f.setHook(null);
  await op.advance();
  expect(op.snapshot()).toMatchObject({ phase: 'cleaning', verified: true });
});

for (const method of ['startBookLoreSourceInspection', 'startBookLoreRemoval'])
  it('late local commit ACK cannot restart production after cancellation: ' + method, async () => {
    const f = await removalOperationFixture(),
      g = gate();
    let held = false;
    const store = {
      read: () => f.store.read(),
      async commit(next, expected) {
        const saved = await f.store.commit(next, expected);
        if (!held && next.pending?.method === method) {
          held = true;
          g.entered();
          await g.waiting;
        }
        return saved;
      },
    };
    const op = await openBookLoreRemovalOperation(f.identity, f.port, store, f.guard);
    if (method === 'startBookLoreRemoval') await prepareRemoval(op);
    const pending = method === 'startBookLoreRemoval' ? op.apply() : op.advance();
    await g.started;
    await op.cancel();
    const cold = await f.resume();
    await cold.advance();
    expect(cold.snapshot().phase).toBe('cancelled');
    g.release();
    await pending;
    expect(op.snapshot().phase).toBe('cancelled');
    expect(f.calls.filter((c) => c.method === method)).toHaveLength(0);
    expect(f.records.has(f.source.seed.path)).toBe(true);
  });
