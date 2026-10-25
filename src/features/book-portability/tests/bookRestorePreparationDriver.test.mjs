// @vitest-environment node
import { it, expect } from 'vitest';
import { isDeepStrictEqual } from 'node:util';
import { createBookRestorePreparationDriver } from '../services/bookRestorePreparationDriver.ts';
import { readBookRestorePreparationProgress } from '../services/bookRestorePreparationContracts.ts';
const identity = {
  ownerId: 'author',
  restoreId: 'restore-client-0001',
  jobToken: 'a'.repeat(64),
  bookId: 'restored-book',
};
const progress = (extra = {}) => ({
  schemaVersion: 1,
  ...identity,
  state: 'uploaded',
  checkpoint: 4,
  ...extra,
});
function fixture(raw = progress()) {
  const f = { stored: null, raw, events: [], calls: [], alive: true, sequence: 0 };
  f.journal = {
    async read() {
      f.events.push('read');
      return structuredClone(f.stored);
    },
    async compareAndSet(old, next) {
      f.events.push(next ? 'persist' : 'clear');
      if (!isDeepStrictEqual(old, f.stored)) return false;
      f.stored = structuredClone(next);
      return true;
    },
  };
  f.api = {
    async get() {
      f.events.push('get');
      return structuredClone(f.raw);
    },
    async advance(action, input) {
      f.events.push('advance');
      f.calls.push({ action, input: structuredClone(input) });
      expect(f.stored.operationId).toBe(input.operationId);
      return {
        schemaVersion: 1,
        kind: 'confirmed',
        receipt: {
          schemaVersion: 1,
          action,
          operationId: input.operationId,
          expectedCheckpoint: input.expectedCheckpoint,
          checkpoint: input.expectedCheckpoint + 1,
        },
        progress: { ...f.raw, checkpoint: input.expectedCheckpoint + 1 },
      };
    },
  };
  f.driver = () =>
    createBookRestorePreparationDriver({
      identity,
      api: f.api,
      journal: f.journal,
      check() {
        if (!f.alive) throw Error('Inactive account or scope');
      },
      operationId: () => {
        f.sequence++;
        return 'step-' + f.sequence;
      },
    });
  return f;
}
const phases = [
  ['structure', 1, 'advanceBookRestoreStructure'],
  ['resources', 1, 'advanceBookRestoreLore'],
  ['resources', 2, 'advanceBookRestoreLore'],
  ['scenes', 2, 'advanceBookRestoreResources'],
  ['scenes', 3, 'advanceBookRestoreResources'],
  ['resource-counts', 3, 'advanceBookRestoreCounts'],
  ['resource-counts', 4, 'advanceBookRestoreCounts'],
  ['personas', 4, 'advanceBookRestorePersonas'],
  ['personas', 5, 'advanceBookRestorePersonas'],
  ['universe', 5, 'advanceBookRestoreUniverse'],
  ['history', 6, 'advanceBookRestoreHistory'],
  ['history', 7, 'advanceBookRestoreHistory'],
  ['draft', 7, 'advanceBookRestoreDraft'],
  ['draft', 8, 'advanceBookRestoreDraft'],
  ['draft-finalize', 8, 'finalizeBookRestoreDraft'],
  ['cover', 8, 'advanceBookRestoreCover'],
  ['cover', 9, 'advanceBookRestoreCover'],
  ['cover-finalize', 9, 'reserveBookRestoreCover'],
  ['cover-finalize', 10, 'materializeBookRestoreCover'],
  ['personas-integrate', 10, 'advanceBookRestorePersonaLibrary'],
  ['personas-integrate', 11, 'advanceBookRestorePersonaLibrary'],
  ['resources-finalize', 11, 'advanceBookRestoreSourceIndexes'],
  ['resources-finalize', 12, 'advanceBookRestoreSourceIndexes'],
  ['resources-audit', 13, 'advanceBookRestoreAudit'],
  ['activation-ready', 13, null],
];
const preparation = (phase, schemaVersion) => ({
  phase,
  schemaVersion,
  ...(schemaVersion >= 10 ? { coverStorage: { state: 'prepared' } } : {}),
  ...(schemaVersion >= 12 ? { sourceIndexes: { complete: schemaVersion === 13 } } : {}),
});
for (const [phase, schemaVersion, action] of phases)
  it(
    'one unit maps native schema ' + schemaVersion + ' phase ' + phase + ' and never activates',
    async () => {
      const f = fixture(
        progress({ state: 'content-verified', preparation: preparation(phase, schemaVersion) }),
      );
      const result = await f.driver().step();
      if (action) {
        expect(result.kind).toBe('advanced');
        expect(f.calls).toHaveLength(1);
        expect(f.calls[0].action).toBe(action);
        expect(f.events).toEqual(['read', 'get', 'persist', 'advance', 'clear']);
      } else {
        expect(result).toMatchObject({ kind: 'paused', reason: 'review-required' });
        expect(f.calls).toHaveLength(0);
        expect(f.stored).toBeNull();
      }
    },
  );
for (const [state, action, reason] of [
  ['uploading', null, 'file-required'],
  ['uploaded', 'advanceBookRestoreIntegrity'],
  ['checking', 'advanceBookRestoreIntegrity'],
  ['bytes-verified', 'advanceBookRestoreValidation'],
  ['validating', 'advanceBookRestoreValidation'],
  ['content-verified', 'advanceBookRestoreStructure'],
  ['rejected', null, 'rejected'],
  ['content-rejected', null, 'rejected'],
  ['cancelling', null, 'cancelling'],
  ['cancelled', null, 'cancelled'],
  ['activated', null, 'activated'],
])
  it('state ' + state + ' only performs its explicit next unit or pauses', async () => {
    const f = fixture(
      progress({
        state,
        ...(state === 'activated'
          ? {
              preparation: preparation('activation-ready', 13),
            }
          : {}),
      }),
    );
    const result = await f.driver().step();
    if (action) expect(f.calls[0].action).toBe(action);
    else {
      expect(result).toMatchObject({ kind: 'paused', reason });
      expect(f.calls).toHaveLength(0);
    }
  });

it('reserved cover storage selects materialization without reserving a second image', async () => {
  const f = fixture(
    progress({
      state: 'content-verified',
      preparation: {
        schemaVersion: 10,
        phase: 'cover-finalize',
        coverStorage: { state: 'reserved' },
      },
    }),
  );
  await f.driver().step();
  expect(f.calls[0].action).toBe('materializeBookRestoreCover');
});
it('metadata projection omits server prose, source catalogs and unrelated identity properties', () => {
  const p = readBookRestorePreparationProgress(
    progress({ privateText: 'PRIVATE_TEST_LITERAL', source: { private: 'source' } }),
    { ...identity, unrelated: 'NEVER_RETURN' },
  );
  expect(Object.keys(p).sort()).toEqual(
    [
      'schemaVersion',
      'ownerId',
      'restoreId',
      'jobToken',
      'bookId',
      'state',
      'checkpoint',
      'preparation',
    ].sort(),
  );
  expect(JSON.stringify(p)).not.toContain('PRIVATE');
  expect(JSON.stringify(p)).not.toContain('NEVER_RETURN');
});
it('lost response retains the exact intent and a fresh driver confirms it before any new get or operation', async () => {
  const f = fixture(),
    advance = f.api.advance;
  let count = 0;
  f.api.advance = async (...args) => {
    const result = await advance(...args);
    if (count++ === 0) throw Error('Response lost');
    return result;
  };
  await expect(f.driver().step()).rejects.toThrow('Response lost');
  const pending = structuredClone(f.stored);
  f.events = [];
  const result = await f.driver().step();
  expect(result.kind).toBe('advanced');
  expect(f.calls[0]).toEqual(f.calls[1]);
  expect(f.events).toEqual(['read', 'advance', 'clear']);
  expect(f.sequence).toBe(1);
  expect(pending.operationId).toBe('step-1');
  expect(f.stored).toBeNull();
});
it('historical receipt can report later current progress without sending the next phase', async () => {
  const f = fixture(),
    advance = f.api.advance;
  f.api.advance = async (...args) => {
    const r = await advance(...args);
    r.progress = progress({
      state: 'content-verified',
      checkpoint: 90,
      preparation: preparation('activation-ready', 13),
    });
    return r;
  };
  const result = await f.driver().step();
  expect(result.progress.checkpoint).toBe(90);
  expect(f.calls).toHaveLength(1);
  expect(f.stored).toBeNull();
});
it('foreign or malformed progress is refused before persisting or mutating', async () => {
  for (const extra of [
    { ownerId: 'other' },
    { restoreId: 'other' },
    { bookId: 'other' },
    { jobToken: 'b'.repeat(64) },
    { schemaVersion: 2 },
    { checkpoint: -1 },
    { checkpoint: 1.5 },
    { state: 'unknown' },
    { state: 'activated' },
    { preparation: { schemaVersion: 1, phase: 'structure' } },
    { state: 'content-verified', preparation: { schemaVersion: 1, phase: 'resources-audit' } },
    { state: 'content-verified', preparation: { schemaVersion: 13, phase: 'constructor' } },
    { state: 'content-verified', preparation: { schemaVersion: 13, phase: 'activation-ready' } },
    {
      state: 'content-verified',
      preparation: { schemaVersion: 9, phase: 'cover', coverStorage: { state: 'prepared' } },
    },
    {
      state: 'content-verified',
      preparation: {
        schemaVersion: 10,
        phase: 'cover-finalize',
        coverStorage: { state: 'unknown' },
      },
    },
    { checkpoint: Number.MAX_SAFE_INTEGER },
  ]) {
    const f = fixture(progress(extra));
    await expect(f.driver().step()).rejects.toThrow();
    expect(f.calls).toHaveLength(0);
    expect(f.stored).toBeNull();
  }
});
it('malformed or foreign pending intent is preserved and never used to select a remote method', async () => {
  for (const extra of [
    { action: 'activateBookRestore' },
    { action: 'openPreparedBookRestoreLore' },
    { ownerId: 'other' },
    { bookId: 'other' },
    { restoreId: 'other' },
    { jobToken: 'b'.repeat(64) },
    { operationId: '' },
    { limit: 15 },
    { expectedCheckpoint: -1 },
    { expectedCheckpoint: Number.MAX_SAFE_INTEGER },
    { privateText: 'NEVER_FORWARD' },
    { schemaVersion: 2 },
  ]) {
    const f = fixture();
    f.stored = {
      schemaVersion: 1,
      ...identity,
      action: 'advanceBookRestoreIntegrity',
      operationId: 'old-operation',
      expectedCheckpoint: 4,
      limit: 16,
      ...extra,
    };
    const before = structuredClone(f.stored);
    await expect(f.driver().step()).rejects.toThrow();
    expect(f.calls).toHaveLength(0);
    expect(f.events).toEqual(['read']);
    expect(f.stored).toEqual(before);
  }
});
it('confirmation mismatch retains pending intent instead of discarding a debt or accepting a foreign book', async () => {
  for (const change of [
    (r) => {
      r.schemaVersion = 2;
    },
    (r) => {
      r.kind = 'unknown';
    },
    (r) => {
      r.receipt = null;
    },
    (r) => {
      r.receipt.operationId = 'other';
    },
    (r) => {
      r.receipt.action = 'activateBookRestore';
    },
    (r) => {
      r.receipt.expectedCheckpoint++;
    },
    (r) => {
      r.receipt.checkpoint++;
    },
    (r) => {
      r.progress.ownerId = 'other';
    },
    (r) => {
      r.progress.bookId = 'other';
    },
    (r) => {
      r.progress.checkpoint = 4;
    },
  ]) {
    const f = fixture(),
      advance = f.api.advance;
    f.api.advance = async (...args) => {
      const r = await advance(...args);
      change(r);
      return r;
    };
    await expect(f.driver().step()).rejects.toThrow();
    expect(f.stored.operationId).toBe('step-1');
    expect(f.events).not.toContain('clear');
  }
});
it('a failed journal CAS prevents send and a failed confirmation CAS never erases another intent', async () => {
  const f = fixture();
  f.journal.compareAndSet = async () => false;
  await expect(f.driver().step()).rejects.toThrow();
  expect(f.calls).toHaveLength(0);
  const g = fixture(),
    cas = g.journal.compareAndSet;
  g.journal.compareAndSet = async (old, next) => {
    if (next === null) {
      g.stored = { ...g.stored, operationId: 'another-tab' };
      return false;
    }
    return cas(old, next);
  };
  await expect(g.driver().step()).rejects.toThrow();
  expect(g.calls).toHaveLength(1);
  expect(g.stored.operationId).toBe('another-tab');
});
it('account invalidation after each pre-confirmation await stops progress and preserves any stored intent', async () => {
  for (const stage of ['read', 'get', 'persist', 'advance']) {
    const f = fixture();
    if (stage === 'read') {
      const fn = f.journal.read;
      f.journal.read = async () => {
        const r = await fn();
        f.alive = false;
        return r;
      };
    }
    if (stage === 'get') {
      const fn = f.api.get;
      f.api.get = async (...a) => {
        const r = await fn(...a);
        f.alive = false;
        return r;
      };
    }
    if (stage === 'persist') {
      const fn = f.journal.compareAndSet;
      f.journal.compareAndSet = async (...a) => {
        const r = await fn(...a);
        f.alive = false;
        return r;
      };
    }
    if (stage === 'advance') {
      const fn = f.api.advance;
      f.api.advance = async (...a) => {
        const r = await fn(...a);
        f.alive = false;
        return r;
      };
    }
    await expect(f.driver().step()).rejects.toThrow('Inactive');
    expect(f.calls).toHaveLength(stage === 'advance' ? 1 : 0);
    expect(f.stored === null).toBe(stage === 'read' || stage === 'get');
    expect(f.events).not.toContain('clear');
  }
});
it('one driver refuses concurrent steps and two drivers rely on the journal CAS to send only one intent', async () => {
  const f = fixture(),
    get = f.api.get;
  let release;
  f.api.get = async (...args) => {
    await new Promise((resolve) => {
      release = resolve;
    });
    return get(...args);
  };
  const d = f.driver(),
    first = d.step();
  await Promise.resolve();
  await Promise.resolve();
  await expect(d.step()).rejects.toThrow();
  release();
  await first;
  expect(f.calls).toHaveLength(1);
  const g = fixture(),
    results = await Promise.allSettled([g.driver().step(), g.driver().step()]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(g.calls).toHaveLength(1);
});
it('storage read failure, invalid operation id and checkpoint conflict leave the debt available without retry loops', async () => {
  const f = fixture();
  f.journal.read = async () => {
    throw Error('Storage unavailable');
  };
  await expect(f.driver().step()).rejects.toThrow('Storage unavailable');
  expect(f.calls).toHaveLength(0);
  const g = fixture();
  g.api.advance = async () => {
    throw Error('Checkpoint conflict');
  };
  await expect(g.driver().step()).rejects.toThrow('Checkpoint conflict');
  expect(g.stored.operationId).toBe('step-1');
  const h = fixture(),
    d = createBookRestorePreparationDriver({
      identity,
      api: h.api,
      journal: h.journal,
      check: () => {},
      operationId: () => '',
    });
  await expect(d.step()).rejects.toThrow();
  expect(h.stored).toBeNull();
  expect(h.calls).toHaveLength(0);
});
it('identity is copied at creation and cannot be redirected by later mutation of the options object', async () => {
  const f = fixture(),
    copy = { ...identity },
    d = createBookRestorePreparationDriver({
      identity: copy,
      api: f.api,
      journal: f.journal,
      check: () => {},
      operationId: () => 'fixed-operation',
    });
  copy.ownerId = 'other';
  copy.bookId = 'other';
  await d.step();
  expect(f.calls[0].input.restoreId).toBe(identity.restoreId);
});

it('completed source indexes in schema 12 resources-finalize select audit instead of running the completed migration again', async () => {
  const f = fixture(
    progress({
      state: 'content-verified',
      preparation: {
        ...preparation('resources-finalize', 12),
        sourceIndexes: { complete: true },
      },
    }),
  );
  await f.driver().step();
  expect(f.calls[0].action).toBe('advanceBookRestoreAudit');
});
it('malformed source index completion cannot skip preparation or counterfeit schema 13 readiness', async () => {
  for (const p of [
    { ...preparation('resources-finalize', 12), sourceIndexes: null },
    { ...preparation('resources-finalize', 12), sourceIndexes: { complete: 'true' } },
    { ...preparation('resources-audit', 13), sourceIndexes: { complete: false } },
    { ...preparation('personas-integrate', 11), sourceIndexes: { complete: true } },
  ]) {
    const f = fixture(progress({ state: 'content-verified', preparation: p }));
    await expect(f.driver().step()).rejects.toThrow();
    expect(f.calls).toHaveLength(0);
  }
});

it('invalid construction identity and inactive account never touch the journal or remote API', async () => {
  for (const extra of [
    { ownerId: '' },
    { ownerId: 'a/b' },
    { ownerId: 'a\\b' },
    { restoreId: '.' },
    { bookId: '..' },
    { bookId: 'x\n' },
    { bookId: '\ud800' },
    { jobToken: 'z'.repeat(64) },
    { jobToken: { toString: () => 'a'.repeat(64) } },
  ]) {
    const f = fixture();
    expect(() =>
      createBookRestorePreparationDriver({
        identity: { ...identity, ...extra },
        api: f.api,
        journal: f.journal,
        check: () => {},
        operationId: () => 'operation',
      }),
    ).toThrow();
    expect(f.events).toEqual([]);
  }
  const f = fixture();
  f.alive = false;
  await expect(f.driver().step()).rejects.toThrow('Inactive');
  expect(f.events).toEqual([]);
});
it('invalidation after clearing a confirmed own intent suppresses delivery and never sends a next unit', async () => {
  const f = fixture(),
    cas = f.journal.compareAndSet;
  f.journal.compareAndSet = async (old, next) => {
    const r = await cas(old, next);
    if (next === null) f.alive = false;
    return r;
  };
  await expect(f.driver().step()).rejects.toThrow('Inactive');
  expect(f.calls).toHaveLength(1);
  expect(f.stored).toBeNull();
});
