// @vitest-environment node
import { it, expect } from 'vitest';
import { createAdventureRestoreStartSession as create } from '../services/adventureRestoreStartSession.ts';
import { adventureRestoreStartFingerprint } from '../services/adventureRestoreTransferContracts.ts';
import { harness } from './adventureTransferHarness.mjs';
const session = (f, extra = {}) =>
  create({
    ownerId: f.uid,
    check: () => {},
    api: f.remote,
    storage: f.storage,
    operationId: () => f.id,
    ...extra,
  });
it('persists metadata before creation and clears only a compatible real confirmation', async () => {
  const f = harness(),
    start = f.remote.start;
  f.remote.start = async (input) => {
    expect(f.local.size).toBe(1);
    return start(input);
  };
  const outcome = await session(f).begin(f.input.source, f.input.reviewHash);
  expect(outcome.kind).toBe('confirmed');
  expect(f.events).toEqual(['persist', 'clear']);
  expect(f.local.size).toBe(0);
  expect(f.records.get('adventures/' + outcome.progress.adventureId)).not.toHaveProperty('ownerId');
});
it('lost creation response reuses the exact ID/source/review after a fresh session', async () => {
  const f = harness(),
    start = f.remote.start;
  let once = true;
  f.remote.start = async (input) => {
    const result = await start(input);
    if (once) {
      once = false;
      throw Error('Lost start response');
    }
    return result;
  };
  await expect(session(f).begin(f.input.source, f.input.reviewHash)).rejects.toThrow('Lost start');
  expect(f.local.size).toBe(1);
  const outcome = await session(f).resume(f.id);
  expect(f.calls[0]).toEqual(f.calls[1]);
  expect(f.local.size).toBe(0);
  expect(outcome.progress.checkpoint).toBe(0);
  expect(
    [...f.records.keys()].filter((p) => p.startsWith('users/author/adventureRestores/')),
  ).toHaveLength(1);
});
it('an uncertain unsent start is fenced before a late request can create the job', async () => {
  const f = harness(),
    start = f.remote.start;
  f.remote.start = async () => {
    throw Error('Unsent');
  };
  await expect(session(f).begin(f.input.source, f.input.reviewHash)).rejects.toThrow('Unsent');
  const stored = [...f.local.values()][0];
  f.remote.start = start;
  const outcome = await session(f).resolveStartForCancellation(f.id);
  expect(outcome.kind).toBe('cancelled');
  expect(f.local.size).toBe(0);
  expect(f.calls[0].input.requestHash).toBe(adventureRestoreStartFingerprint(stored.intent));
  expect(await f.remote.start(f.input)).toMatchObject({
    kind: 'cancelled',
    adventureId: outcome.adventureId,
  });
  expect(f.records.has(f.path)).toBe(false);
});
it('resolving cancellation of an already committed start confirms the job without cancelling it', async () => {
  const f = harness(),
    start = f.remote.start;
  f.remote.start = async (input) => {
    await start(input);
    throw Error('Lost');
  };
  await expect(session(f).begin(f.input.source, f.input.reviewHash)).rejects.toThrow();
  const outcome = await session(f).resolveStartForCancellation(f.id);
  expect(outcome.kind).toBe('confirmed');
  expect(outcome.progress.state).toBe('uploading');
  expect(f.records.get(f.path).state).toBe('uploading');
});
it('save failure blocks creation and clear failure preserves the existing attempt', async () => {
  const f = harness();
  f.storage.compare = async () => false;
  await expect(session(f).begin(f.input.source, f.input.reviewHash)).rejects.toThrow();
  expect(f.calls).toHaveLength(0);
  const g = harness(),
    compare = g.storage.compare;
  g.storage.compare = async (...args) => (args[3] === null ? false : compare(...args));
  await expect(session(g).begin(g.input.source, g.input.reviewHash)).rejects.toThrow();
  expect(g.local.size).toBe(1);
  expect(g.records.has(g.path)).toBe(true);
});
it('a foreign confirmation never clears the start record', async () => {
  const f = harness(),
    start = f.remote.start;
  f.remote.start = async (input) => {
    const r = await start(input);
    r.progress.adventureId = 'another-adventure-0001';
    return r;
  };
  await expect(session(f).begin(f.input.source, f.input.reviewHash)).rejects.toThrow();
  expect(f.local.size).toBe(1);
  f.remote.start = start;
  expect((await session(f).resume(f.id)).kind).toBe('confirmed');
});
it('captures the source before awaiting persistence and retains attempts after guard invalidation', async () => {
  const f = harness(),
    source = { ...f.input.source },
    compare = f.storage.compare;
  let release,
    active = true;
  f.storage.compare = async (...args) => {
    const result = await compare(...args);
    await new Promise((r) => {
      release = r;
    });
    return result;
  };
  const promise = session(f, {
    check: () => {
      if (!active) throw Error('Expired');
    },
  }).begin(source, f.input.reviewHash);
  source.sha256 = 'd'.repeat(64);
  await Promise.resolve();
  await Promise.resolve();
  active = false;
  release();
  await expect(promise).rejects.toThrow('Expired');
  expect(f.calls).toHaveLength(0);
  expect([...f.local.values()][0].intent.source.sha256).toBe(f.input.source.sha256);
});
it('lists local attempts by account and remote jobs with their native cursor', async () => {
  const f = harness();
  f.remote.start = async () => {
    throw Error('Offline');
  };
  for (const id of [f.id, 'adventure-start-local-0002'])
    await expect(
      session(f, { operationId: () => id }).begin(f.input.source, f.input.reviewHash),
    ).rejects.toThrow();
  const page = await session(f).list({ limit: 1 });
  expect(page.items).toHaveLength(1);
  expect(page.nextCursor).not.toBeNull();
  expect((await session(f).list({ limit: 1, cursor: page.nextCursor })).items).toHaveLength(1);
  expect(await session(f, { ownerId: 'other' }).list()).toEqual({ items: [], nextCursor: null });
});
