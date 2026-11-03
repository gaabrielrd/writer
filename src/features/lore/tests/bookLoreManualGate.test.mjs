// @vitest-environment node
import { beforeEach, afterEach, afterAll, it, expect, vi } from 'vitest';
vi.setConfig({ testTimeout: 60000 });
afterAll(() => vi.resetConfig());
import { createBookLoreManualOperation } from '../services/bookLoreManualOperation.ts';
import { installLoreJournalHarness } from './bookLoreJournalHarness.mjs';
import { manualFixture } from './bookLoreManualHarness.mjs';
let h;
beforeEach(() => {
  h = installLoreJournalHarness();
});
afterEach(() => vi.unstubAllGlobals());
const make = (f, options = {}, input = f.input) =>
  createBookLoreManualOperation(f.input.writeId, f.environment, input, {
    yieldControl: async () => {},
    ...options,
  });
async function ready(op) {
  for (let n = 0; n < 1000 && !op.snapshot().canApply; n++) await op.advance();
  expect(op.snapshot().canApply).toBe(true);
}
it('gates metadata after encrypted write-ahead and before every native edit RPC', async () => {
  const f = await manualFixture(h),
    seen = [];
  const op = make(f, {
    async beforeUnit(metadata) {
      expect(Object.isFrozen(metadata)).toBe(true);
      expect(Object.keys(metadata).sort()).toEqual(
        [
          'lane',
          'method',
          'id',
          'startHash',
          'jobToken',
          'operationId',
          'expectedRevision',
          'requestHash',
        ].sort(),
      );
      expect(JSON.stringify(metadata)).not.toContain('BOOT_PRIVATE');
      const head = await f.j.inspect();
      expect(head.production.state).toBe('pending');
      expect(head.production.method).toBe(metadata.method);
      expect(head.production.startHash).toBe(metadata.startHash);
      expect(f.calls.filter((c) => c.kind === 'edit')).toHaveLength(seen.length);
      seen.push(metadata);
    },
  });
  await ready(op);
  await op.apply();
  expect(op.snapshot().phase).toBe('applied');
  expect(seen.length).toBeGreaterThan(5);
  expect(seen.at(-1).method).toBe('adoptBookLoreEditGeneration');
  expect(f.calls.filter((c) => c.kind === 'edit')).toHaveLength(seen.length);
});
it('failed gate preserves pending ciphertext and emits no native request; explicit retry uses the same control', async () => {
  const f = await manualFixture(h);
  let blocked = true;
  const seen = [],
    op = make(f, {
      beforeUnit(metadata) {
        seen.push(structuredClone(metadata));
        return blocked ? Promise.reject(Error('parent metadata not saved')) : Promise.resolve();
      },
    });
  await op.initialize();
  await expect(op.advance()).rejects.toThrow('parent metadata not saved');
  expect(f.calls.filter((c) => c.kind === 'edit')).toHaveLength(0);
  const head = await f.j.inspect();
  expect(head.production.state).toBe('pending');
  const previous = f.calls.length;
  await op.flushLocal();
  expect(f.calls).toHaveLength(previous);
  blocked = false;
  await op.advance();
  expect(seen[1]).toEqual(seen[0]);
  expect(f.calls.filter((c) => c.kind === 'edit')).toHaveLength(1);
});
for (const change of ['actor', 'host'])
  it('rechecks ' + change + ' after awaited gate before dispatch', async () => {
    const f = await manualFixture(h);
    let current = true;
    const op = make(f, {
      guard: () => {
        if (!current) throw Error('host changed');
      },
      beforeUnit() {
        if (change === 'actor') f.current(false);
        else current = false;
        return Promise.resolve();
      },
    });
    await op.initialize();
    await expect(op.advance()).rejects.toThrow('changed');
    expect(f.calls.filter((c) => c.kind === 'edit')).toHaveLength(0);
  });
it('independent cancellation completes while a production gate is held and old producer cannot escape', async () => {
  const f = await manualFixture(h);
  let entered, release;
  const atGate = new Promise((resolve) => {
      entered = resolve;
    }),
    held = new Promise((resolve) => {
      release = resolve;
    }),
    op = make(f, {
      async beforeUnit(metadata) {
        if (metadata.lane === 'production') {
          entered();
          await held;
        }
      },
    });
  await op.initialize();
  const running = op.advance();
  const rejected = expect(running).rejects.toThrow();
  await atGate;
  await expect(op.flushLocal()).rejects.toThrow('em andamento');
  const keys = f.keys.length,
    cancel = createBookLoreManualOperation(f.input.writeId, f.environment);
  for (let n = 0; n < 200 && cancel.snapshot().phase !== 'cancelled'; n++) await cancel.cancel();
  expect(cancel.snapshot().phase).toBe('cancelled');
  expect(f.keys).toHaveLength(keys);
  expect(f.calls.some((c) => c.method.startsWith('start'))).toBe(false);
  release();
  await rejected;
  expect(f.calls.some((c) => c.method.startsWith('start'))).toBe(false);
});
for (const lane of ['before', 'after'])
  it(
    'flushLocal saves a ' + lane + '-RPC checkpoint debt without emitting another unit',
    async () => {
      const f = await manualFixture(h);
      let armed = false;
      const wrap = (journal) => ({
        ...journal,
        async writeCheckpoint(bundle) {
          if (
            armed &&
            (lane === 'before'
              ? bundle.checkpoint.pending.production !== null
              : bundle.confirmed.length > 0)
          ) {
            armed = false;
            h.abortNext();
          }
          return journal.writeCheckpoint(bundle);
        },
      });
      const env = {
          ...f.environment,
          createJournal: async (identity) => wrap(await f.environment.createJournal(identity)),
          openJournal: async (identity) => wrap(await f.environment.openJournal(identity)),
        },
        op = createBookLoreManualOperation(f.input.writeId, env, f.input, {
          yieldControl: async () => {},
        });
      await op.initialize();
      armed = true;
      await expect(op.advance()).rejects.toThrow();
      expect(op.snapshot().savePending).toBe(true);
      const count = f.calls.length,
        before = [...f.records];
      await op.flushLocal();
      expect(f.calls).toHaveLength(count);
      expect([...f.records]).toEqual(before);
      expect(op.snapshot().savePending).toBe(false);
      await op.advance();
      expect(f.calls.length).toBeGreaterThan(count);
    },
  );
it('cold flushLocal restores a pending adoption checkpoint without replay or new recovery reservation', async () => {
  const f = await manualFixture(h),
    op = make(f);
  await ready(op);
  f.editIntercept(async (method, _input, invoke) => {
    const value = await invoke();
    if (method === 'adoptBookLoreEditGeneration') throw Error('lost apply');
    return value;
  });
  await expect(op.apply()).rejects.toThrow('lost apply');
  const count = f.calls.length,
    clock = f.records.get('books/book').localLoreVersion,
    cold = createBookLoreManualOperation(f.input.writeId, f.environment, undefined, {
      yieldControl: async () => {},
    });
  await cold.flushLocal();
  expect(f.calls).toHaveLength(count);
  expect(f.records.get('books/book').localLoreVersion).toBe(clock);
  expect(cold.snapshot().operation.pending.production.method).toBe('adoptBookLoreEditGeneration');
});
it('flushLocal before reservation only persists the local preparation ticket', async () => {
  const f = await manualFixture(h),
    op = make(f);
  await op.flushLocal();
  expect(await f.ticket()).not.toBeNull();
  expect(f.calls).toHaveLength(0);
  expect(f.keys).toHaveLength(0);
  expect(op.snapshot().reservationPending).toBe(true);
});

it('captures the original gate policy instead of consulting a mutable options object later', async () => {
  const f = await manualFixture(h),
    options = {
      yieldControl: async () => {},
      beforeUnit: () => Promise.reject(Error('original gate')),
    },
    op = createBookLoreManualOperation(f.input.writeId, f.environment, f.input, options);
  options.beforeUnit = () => Promise.resolve();
  await op.initialize();
  await expect(op.advance()).rejects.toThrow('original gate');
  expect(f.calls.filter((c) => c.kind === 'edit')).toHaveLength(0);
});
