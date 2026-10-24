// @vitest-environment node
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { manualFixture } from './bookLoreManualHarness.mjs';
import { installLoreJournalHarness } from './bookLoreJournalHarness.mjs';
import {
  advanceJournalDiscard,
  readJournalHead,
  readJournalPreparation,
} from '../services/bookLoreJournalDb.ts';
let h;
beforeEach(() => {
  h = installLoreJournalHarness();
});
afterEach(() => vi.unstubAllGlobals());
const setup = () => manualFixture(h);
async function released(op) {
  for (let n = 0; n < 100 && !op.snapshot().keyReleased; n++) await op.releaseRecovery();
}
async function discarded(op, limit = 50) {
  for (let n = 0; n < 200 && !op.snapshot().copyDiscarded; n++) await op.discard(limit);
  expect(op.snapshot().copyDiscarded).toBe(true);
}
const own = (f) =>
  h.rows().filter((r) => r.store === 'frames' && r.k[0] === f.uid && r.k[1] === f.input.writeId);
it('requires explicit discard and native closure before touching private frames', async () => {
  const f = await setup(),
    op = f.make();
  await op.initialize();
  const p = await f.ticket(),
    rows = structuredClone(h.rows());
  await expect(advanceJournalDiscard(f.uid, f.input.writeId, p.stamp)).rejects.toThrow();
  expect(h.rows()).toEqual(rows);
  await released(op);
  expect(own(f).length).toBeGreaterThan(0);
  const keys = f.keys.length,
    spy = vi.spyOn(crypto.subtle, 'decrypt');
  await discarded(op);
  expect(f.keys).toHaveLength(keys);
  expect(spy).not.toHaveBeenCalled();
  expect(own(f)).toHaveLength(0);
  expect(await readJournalHead(f.uid, f.input.writeId)).toBeNull();
  expect((await f.ticket()).discard.phase).toBe('complete');
});
it('purges bounded batches across reloads and isolates other users and neighboring operations', async () => {
  const f = await setup(),
    draft = { ...f.input, changes: [{ field: 'details', value: 'x'.repeat(4 * 1024 * 1024) }] };
  let op = f.make(draft);
  await op.initialize();
  await released(op);
  const identity = (await f.ticket()).identity,
    old = f.j;
  const store = h.stores.get('frames');
  for (const key of [
    [f.uid, f.input.writeId + '-next', 'draft', 'other', 0],
    ['other', f.input.writeId, 'checkpoint', 'other', 0],
  ]) {
    store.set(JSON.stringify(key), {
      k: key,
      value: { nonce: new ArrayBuffer(12), ciphertext: new ArrayBuffer(16) },
    });
  }
  const other = structuredClone(
    h
      .rows()
      .filter(
        (r) =>
          r.store === 'frames' && !own(f).some((x) => JSON.stringify(x.k) === JSON.stringify(r.k)),
      ),
  );
  let count = own(f).length;
  expect(count).toBeGreaterThan(50);
  await op.discard(5);
  expect(count - own(f).length).toBe(5);
  expect(op.snapshot().discardPhase).toBe('purging');
  await expect(old.inspect()).rejects.toThrow();
  await expect(f.environment.createJournal(identity)).rejects.toThrow();
  for (let n = 0; n < 30 && !op.snapshot().copyDiscarded; n++) {
    count = own(f).length;
    op = f.resume();
    await op.discard(5);
    expect(count - own(f).length).toBeLessThanOrEqual(5);
  }
  expect(op.snapshot().copyDiscarded).toBe(true);
  expect(h.rows().filter((r) => r.store === 'frames')).toEqual(other);
  const calls = f.calls.length;
  await op.discard();
  expect(f.calls).toHaveLength(calls);
  await expect(op.readDraft()).rejects.toThrow();
  expect((await f.ticket()).identity).toEqual(identity);
});
it('rolls back head removal, deletion counter and frames if the purge transaction aborts', async () => {
  const f = await setup(),
    op = f.make();
  await op.initialize();
  await released(op);
  const before = structuredClone(own(f)),
    head = await f.j.inspect();
  h.abortAt(h.commits() + 2);
  await expect(op.discard()).rejects.toThrow();
  expect(own(f)).toEqual(before);
  expect(await f.j.inspect()).toEqual(head);
  expect((await f.ticket()).discard).toEqual({ phase: 'requested', deleted: 0 });
  const resumed = f.resume();
  await discarded(resumed);
  expect(own(f)).toHaveLength(0);
});
it('rolls back a later bounded batch without losing prior progress', async () => {
  const f = await setup(),
    op = f.make();
  await op.initialize();
  await released(op);
  await op.discard(1);
  const before = structuredClone(h.rows());
  h.abortNext();
  await expect(op.discard(1)).rejects.toThrow();
  expect(h.rows()).toEqual(before);
  await discarded(op, 1);
  expect(own(f)).toHaveLength(0);
});
it('recovers a successful batch the controller did not observe', async () => {
  const f = await setup(),
    op = f.make();
  await op.initialize();
  await released(op);
  await op.discard(1);
  const p = await f.ticket();
  await advanceJournalDiscard(f.uid, f.input.writeId, p.stamp);
  await expect(op.discard()).rejects.toThrow();
  const resumed = f.resume();
  await discarded(resumed);
  expect(own(f)).toHaveLength(0);
});
it('does not wait for private key response and refuses a late encrypted writer after purging', async () => {
  const f = await setup();
  let entered, release;
  const waiting = new Promise((r) => {
    entered = r;
  });
  f.keyIntercept(async (invoke) => {
    const data = await invoke();
    entered();
    await new Promise((r) => {
      release = r;
    });
    return data;
  });
  const op = f.make(),
    initializing = op.initialize();
  await waiting;
  await discarded(op);
  expect(own(f)).toHaveLength(0);
  release();
  await expect(initializing).rejects.toThrow();
  expect(own(f)).toHaveLength(0);
});
it('fences an in-flight producer and retains native source/clock after explicit discard', async () => {
  const f = await setup(),
    op = f.make();
  await op.initialize();
  let entered, release;
  const waiting = new Promise((r) => {
    entered = r;
  });
  f.editIntercept(async (method, _v, invoke) => {
    const result = await invoke();
    if (method === 'startBookLoreSourceInspection') {
      entered();
      await new Promise((r) => {
        release = r;
      });
    }
    return result;
  });
  const before = structuredClone(f.records.get('books/book')),
    sending = op.advance();
  await waiting;
  await discarded(op);
  release();
  await expect(sending).rejects.toThrow();
  expect(own(f)).toHaveLength(0);
  expect(f.records.get('books/book')).toEqual(before);
});
it('retains applied lore and native bodies while deleting only the recovery copy', async () => {
  const f = await setup(),
    op = f.make();
  for (let n = 0; n < 300 && !op.snapshot().canApply; n++) await op.advance();
  await op.apply();
  const before = structuredClone([...f.records].filter(([p]) => p.startsWith('books/')));
  await discarded(op);
  expect([...f.records].filter(([p]) => p.startsWith('books/'))).toEqual(before);
  expect(op.snapshot().phase).toBe('applied');
});
it('rejects invalid limits before persisting irreversible intent', async () => {
  const f = await setup(),
    op = f.make();
  await op.initialize();
  const before = structuredClone(h.rows());
  for (const limit of [0, 51, -1, 1.5]) await expect(op.discard(limit)).rejects.toThrow();
  expect(h.rows()).toEqual(before);
  expect(op.snapshot().keyReleaseRequested).toBe(false);
});
it('preserves contradictory unknown records instead of deleting an unrecognized namespace', async () => {
  const f = await setup(),
    op = f.make();
  await op.initialize();
  await released(op);
  const key = [f.uid, f.input.writeId, 'aaa-unknown', 'generation', 0];
  h.stores.get('frames').set(JSON.stringify(key), { k: key, value: { foreign: true } });
  const before = structuredClone(own(f));
  await expect(op.discard()).rejects.toThrow();
  expect(own(f)).toEqual(before);
  expect(await readJournalHead(f.uid, f.input.writeId)).not.toBeNull();
});
it('does not accept a stale takeover for purge and preserves the tombstone across reopen', async () => {
  const f = await setup(),
    op = f.make();
  await op.initialize();
  await released(op);
  await op.discard(1);
  const stale = await f.ticket(),
    other = f.resume();
  await other.initialize();
  await expect(advanceJournalDiscard(f.uid, f.input.writeId, stale.stamp)).rejects.toThrow();
  await discarded(other);
  const p = await readJournalPreparation(f.uid, f.input.writeId);
  expect(p.discard.phase).toBe('complete');
  const resumed = f.make();
  await resumed.initialize();
  expect(resumed.snapshot().copyDiscarded).toBe(true);
  expect(own(f)).toHaveLength(0);
});

it('verifies a completed marker against actual storage and refuses contradictory residual frames', async () => {
  const f = await setup(),
    op = f.make();
  await op.initialize();
  await discarded(op);
  const key = [f.uid, f.input.writeId, 'draft', 'unexpected', 0];
  h.stores.get('frames').set(JSON.stringify(key), {
    k: key,
    value: { nonce: new ArrayBuffer(12), ciphertext: new ArrayBuffer(16) },
  });
  const before = structuredClone(h.rows());
  await expect(op.discard()).rejects.toThrow();
  expect(op.snapshot().copyDiscarded).toBe(false);
  expect(h.rows()).toEqual(before);
  const resumed = f.resume();
  await expect(resumed.initialize()).rejects.toThrow();
  expect(resumed.snapshot().copyDiscarded).toBe(false);
});
