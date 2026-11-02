// @vitest-environment node
import { it, expect } from 'vitest';
import { isDeepStrictEqual } from 'node:util';
import { createAdventureRestorePreparationDriver as create } from '../services/adventureRestorePreparationDriver.ts';
import { readAdventurePreparationProgress } from '../services/adventureRestorePreparationProgress.ts';
const context = {
  ownerId: 'author',
  restoreId: 'client-restore-0001',
  adventureId: 'client-adventure-0001',
  jobToken: 'a'.repeat(64),
  reviewHash: 'b'.repeat(64),
  keyId: 'c'.repeat(64),
};
const view = (extra = {}) => ({
  schemaVersion: 1,
  restoreId: context.restoreId,
  adventureId: context.adventureId,
  jobToken: context.jobToken,
  reviewHash: context.reviewHash,
  state: 'uploaded',
  checkpoint: 4,
  ...extra,
});
function fixture(raw = view()) {
  const f = { raw, stored: null, events: [], calls: [], alive: true, sequence: 0 };
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
          state: 'bytes-verified',
          sequence: null,
        },
        progress: view({ state: 'bytes-verified', checkpoint: input.expectedCheckpoint + 1 }),
      };
    },
  };
  f.driver = () =>
    create({
      context,
      api: f.api,
      journal: f.journal,
      check() {
        if (!f.alive) throw Error('Inactive');
      },
      operationId: () => 'client-preparation-' + String(++f.sequence).padStart(8, '0'),
    });
  return f;
}
it('persists before sending one exact unit and clears only its confirmation', async () => {
  const f = fixture(),
    r = await f.driver().step();
  expect(r.kind).toBe('advanced');
  expect(f.events).toEqual(['read', 'get', 'persist', 'advance', 'clear']);
  expect(f.calls).toHaveLength(1);
  expect(f.calls[0].input).toEqual({
    restoreId: context.restoreId,
    jobToken: context.jobToken,
    operationId: 'client-preparation-00000001',
    expectedCheckpoint: 4,
    limit: 16,
  });
  expect(f.stored).toBeNull();
});
it('lost response replays the original pending request without get or new operation', async () => {
  const f = fixture(),
    advance = f.api.advance;
  let first = true;
  f.api.advance = async (...args) => {
    const r = await advance(...args);
    if (first) {
      first = false;
      throw Error('Lost response');
    }
    return r;
  };
  await expect(f.driver().step()).rejects.toThrow('Lost response');
  expect(f.stored).not.toBeNull();
  f.events = [];
  await f.driver().step();
  expect(f.calls[0]).toEqual(f.calls[1]);
  expect(f.sequence).toBe(1);
  expect(f.events).toEqual(['read', 'advance', 'clear']);
  expect(f.stored).toBeNull();
});
it.each([
  ['uploading', 'file-required', {}],
  ['rejected', 'rejected', { integrityFailure: 'file-hash-mismatch' }],
  [
    'content-rejected',
    'rejected',
    {
      validation: {
        version: 1,
        phase: 'rejected',
        frames: 0,
        items: 0,
        recheckedChunks: 0,
        failure: 'adventure-backup-invalid-content',
        summary: null,
      },
    },
  ],
  ['cancelling', 'cancelling', {}],
  ['cancelled', 'cancelled', {}],
])('state %s pauses with %s and never persists a new command', async (state, reason, extra) => {
  const f = fixture(view({ state, ...extra }));
  expect(await f.driver().step()).toMatchObject({ kind: 'paused', reason });
  expect(f.calls).toHaveLength(0);
  expect(f.stored).toBeNull();
  expect(f.sequence).toBe(0);
});
it('projects only explicit metadata and does not invent ownerId from the server', () => {
  const p = readAdventurePreparationProgress(
    view({ source: { privateText: 'PRIVATE_SOURCE' }, privateText: 'PRIVATE_TEXT' }),
    context,
  );
  expect(p.ownerId).toBe(context.ownerId);
  expect(p).not.toHaveProperty('source');
  expect(p).not.toHaveProperty('keyId');
  expect(JSON.stringify(p)).not.toContain('PRIVATE');
  expect(Object.isFrozen(p)).toBe(true);
});
it.each([
  { restoreId: 'another-restore-0001' },
  { adventureId: 'another-adventure-0001' },
  { jobToken: 'd'.repeat(64) },
  { reviewHash: 'd'.repeat(64) },
  { ownerId: 'other' },
  { schemaVersion: 2 },
  { checkpoint: -1 },
  { checkpoint: 1.5 },
  { checkpoint: Number.MAX_SAFE_INTEGER },
  { state: 'unknown' },
  { state: 'content-verified' },
  { state: 'activated' },
  { staging: { version: 1, phase: 'structure' } },
])('malformed progress %j cannot create a pending operation', async (patch) => {
  const f = fixture(view(patch));
  await expect(f.driver().step()).rejects.toThrow();
  expect(f.calls).toHaveLength(0);
  expect(f.stored).toBeNull();
});
it.each([
  { action: 'activateAdventureRestore' },
  { action: 'getAdventureRestoreRecoveryKey' },
  { ownerId: 'other' },
  { restoreId: 'other' },
  { limit: 17 },
  { operationId: '' },
  { expectedCheckpoint: -1 },
  { extra: 'NEVER_FORWARD' },
])('foreign or malformed pending operation %j is preserved without send', async (patch) => {
  const f = fixture();
  f.stored = {
    schemaVersion: 1,
    ownerId: context.ownerId,
    restoreId: context.restoreId,
    adventureId: context.adventureId,
    jobToken: context.jobToken,
    action: 'advanceAdventureRestoreIntegrity',
    operationId: 'original-operation-0001',
    expectedCheckpoint: 4,
    limit: 16,
    ...patch,
  };
  const before = structuredClone(f.stored);
  await expect(f.driver().step()).rejects.toThrow();
  expect(f.calls).toHaveLength(0);
  expect(f.stored).toEqual(before);
  expect(f.events).toEqual(['read']);
});
it('historical receipt may return later current progress without sending the next phase', async () => {
  const f = fixture(),
    advance = f.api.advance;
  f.api.advance = async (...args) => {
    const r = await advance(...args);
    r.progress = view({ state: 'cancelling', checkpoint: 20 });
    return r;
  };
  const r = await f.driver().step();
  expect(r.progress.state).toBe('cancelling');
  expect(r.progress.checkpoint).toBe(20);
  expect(f.calls).toHaveLength(1);
  expect(f.stored).toBeNull();
});
it.each(['kind', 'action', 'id', 'checkpoint', 'state', 'sequence', 'origin', 'validation'])(
  'a wrong confirmation %s preserves the exact pending operation',
  async (field) => {
    const f = fixture(),
      advance = f.api.advance;
    f.api.advance = async (...args) => {
      const r = await advance(...args);
      if (field === 'kind') r.kind = 'unknown';
      if (field === 'action') r.receipt.action = 'activateAdventureRestore';
      if (field === 'id') r.receipt.operationId = 'another-operation-0001';
      if (field === 'checkpoint') r.receipt.expectedCheckpoint++;
      if (field === 'state') r.receipt.state = 'activated';
      if (field === 'sequence') r.receipt.sequence = 0;
      if (field === 'origin') r.progress.jobToken = 'd'.repeat(64);
      if (field === 'validation') r.receipt.validation = { privateText: 'NEVER_TRUST' };
      return r;
    };
    await expect(f.driver().step()).rejects.toThrow();
    expect(f.stored.operationId).toBe('client-preparation-00000001');
    expect(f.events).not.toContain('clear');
  },
);
it('failed save CAS prevents send; failed clear CAS never deletes another pending operation', async () => {
  const f = fixture();
  f.journal.compareAndSet = async () => false;
  await expect(f.driver().step()).rejects.toThrow();
  expect(f.calls).toHaveLength(0);
  const g = fixture(),
    cas = g.journal.compareAndSet;
  g.journal.compareAndSet = async (old, next) => {
    if (next === null) {
      g.stored = { ...g.stored, operationId: 'another-tab-operation-0001' };
      return false;
    }
    return cas(old, next);
  };
  await expect(g.driver().step()).rejects.toThrow();
  expect(g.stored.operationId).toBe('another-tab-operation-0001');
});
it.each(['read', 'get', 'persist', 'advance'])(
  'guard expires after %s without confirming or planning another unit',
  async (stage) => {
    const f = fixture();
    const object = stage === 'read' || stage === 'persist' ? f.journal : f.api;
    const method = stage === 'persist' ? 'compareAndSet' : stage;
    const original = object[method];
    object[method] = async (...args) => {
      const result = await original(...args);
      f.alive = false;
      return result;
    };
    await expect(f.driver().step()).rejects.toThrow('Inactive');
    expect(f.events).not.toContain('clear');
    expect(f.calls.length).toBeLessThanOrEqual(1);
  },
);
it('a driver rejects reentry but releases its lock after failure for exact pending replay', async () => {
  const f = fixture();
  let release;
  const read = f.journal.read;
  f.journal.read = () =>
    new Promise((resolve) => {
      release = async () => resolve(await read());
    });
  const driver = f.driver(),
    first = driver.step();
  await expect(driver.step()).rejects.toThrow();
  await release();
  await first;
  f.journal.read = read;
  expect(await driver.step()).toMatchObject({ kind: 'advanced' });
});
