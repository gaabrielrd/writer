// @vitest-environment node
import { it, expect, vi, beforeEach, afterEach } from 'vitest';
import { webcrypto } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { createBookRestoreStartSession } from '../services/bookRestoreStartSession.ts';
import {
  readBookRestoreTransferJob,
  expectedBookRestoreTarget,
  readBookRestoreTransferPage,
} from '../services/bookRestoreTransferJob.ts';
import { bookRestoreStartRequest } from '../services/bookRestoreTransferContracts.ts';
import { adventureImportDb } from '../../../../functions/test/helpers/adventureImportDb.mjs';
import { createBookRestoreUploadService } from '../../../../functions/src/bookRestoreUpload.mjs';
import { invokeBookRestoreCallable } from '../../../../functions/src/bookRestoreCallable.mjs';
import {
  targetId,
  requestHash,
  startInput,
} from '../../../../functions/src/bookRestoreUploadContracts.mjs';
beforeEach(() => vi.stubGlobal('crypto', webcrypto));
afterEach(() => vi.unstubAllGlobals());
const descriptor = {
    format: 'writer-book-archive',
    version: 1,
    byteLength: 131073,
    sha256: 'a'.repeat(64),
  },
  reviewHash = 'b'.repeat(64),
  ownerId = 'author';
function fixture(id = 'start-session-0001') {
  const base = adventureImportDb({ nativeUpdates: true }),
    local = new Map(),
    f = { ...base, local, id, calls: [], alive: true },
    key = (owner, id) => JSON.stringify([owner, id]),
    factory = () => createBookRestoreUploadService({ db: base.db, now: () => 1000 });
  f.storage = {
    async read(owner, id) {
      return structuredClone(local.get(key(owner, id)) ?? null);
    },
    async compare(owner, id, old, next) {
      const current = local.get(key(owner, id)) ?? null;
      if (!isDeepStrictEqual(current, old)) return false;
      if (next === null) local.delete(key(owner, id));
      else local.set(key(owner, id), structuredClone(next));
      return true;
    },
    async list(owner, _guard, input) {
      return {
        items: [...local.values()].filter((r) => r.intent.ownerId === owner),
        nextCursor: input.cursor ?? null,
      };
    },
  };
  f.api = {
    async start(input) {
      f.calls.push({ method: 'start', input: structuredClone(input) });
      expect(local.has(key(ownerId, input.operationId))).toBe(true);
      return JSON.parse(
        JSON.stringify(
          await invokeBookRestoreCallable(factory(), 'startBookRestore', ownerId, input),
        ),
      );
    },
    get: (input) => invokeBookRestoreCallable(factory(), 'getBookRestore', ownerId, input),
    list: (input) => invokeBookRestoreCallable(factory(), 'listBookRestores', ownerId, input),
    append: () => {
      throw Error('No upload in start session');
    },
    async resolveStart(input) {
      f.calls.push({ method: 'resolve', input: structuredClone(input) });
      return JSON.parse(
        JSON.stringify(
          await invokeBookRestoreCallable(factory(), 'resolveBookRestoreStart', ownerId, input),
        ),
      );
    },
  };
  f.make = () =>
    createBookRestoreStartSession({
      ownerId,
      api: f.api,
      storage: f.storage,
      operationId: () => id,
      check() {
        if (!f.alive) throw Error('Inactive account');
      },
    });
  f.pending = () => structuredClone(local.get(key(ownerId, id)) ?? null);
  f.factory = factory;
  return f;
}
it('start is persisted before the real RPC and cleared only after its original native receipt is validated', async () => {
  const f = fixture(),
    result = await f.make().begin(descriptor, reviewHash);
  expect(result.kind).toBe('confirmed');
  expect(result.progress.state).toBe('uploading');
  expect(result.progress.checkpoint).toBe(0);
  expect(result.progress.uploadedChunks).toBe(0);
  expect(f.pending()).toBeNull();
  expect(f.calls).toHaveLength(1);
  expect(f.records.has('books/' + result.progress.bookId)).toBe(false);
  const intent = { schemaVersion: 1, ownerId, operationId: f.id, source: descriptor, reviewHash };
  expect(result.progress.bookId).toBe(expectedBookRestoreTarget(intent));
  expect(result.progress.bookId).toBe(
    targetId(
      ownerId,
      f.id,
      requestHash('startBookRestore', startInput(bookRestoreStartRequest(intent))),
    ),
  );
});
it('lost start response is recovered by a fresh session with the identical recorded request and one native job', async () => {
  const f = fixture(),
    start = f.api.start;
  let lost = false;
  f.api.start = async (input) => {
    const answer = await start(input);
    if (!lost) {
      lost = true;
      throw Error('Lost after commit');
    }
    return answer;
  };
  await expect(f.make().begin(descriptor, reviewHash)).rejects.toThrow('Lost after commit');
  const pending = f.pending();
  expect(pending).not.toBeNull();
  const result = await f.make().resume(f.id);
  expect(result.kind).toBe('confirmed');
  expect(f.calls[0].input).toEqual(f.calls[1].input);
  expect(f.pending()).toBeNull();
  expect(
    [...f.records.keys()].filter((p) => p === 'users/' + ownerId + '/bookRestores/' + f.id),
  ).toHaveLength(1);
  expect(f.records.has('books/' + result.progress.bookId)).toBe(false);
});
it('cancel resolution before the start commit creates a native fence and a delayed start cannot resurrect the job', async () => {
  const f = fixture(),
    start = f.api.start;
  f.api.start = async () => {
    throw Error('Not sent');
  };
  await expect(f.make().begin(descriptor, reviewHash)).rejects.toThrow('Not sent');
  const pending = f.pending();
  f.api.start = start;
  const result = await f.make().resolveStartForCancellation(f.id);
  expect(result.kind).toBe('cancelled');
  expect(f.pending()).toBeNull();
  const delayed = await f
    .factory()
    .startBookRestore(ownerId, bookRestoreStartRequest(pending.intent));
  expect(delayed.kind).toBe('cancelled');
  expect(f.records.has('users/' + ownerId + '/bookRestores/' + f.id)).toBe(false);
  expect(f.records.has('books/' + result.bookId)).toBe(false);
});
it('cancel resolution after a commit returns the existing job without pretending that job cancellation happened', async () => {
  const f = fixture(),
    start = f.api.start;
  f.api.start = async (input) => {
    await start(input);
    throw Error('Lost');
  };
  await expect(f.make().begin(descriptor, reviewHash)).rejects.toThrow('Lost');
  const result = await f.make().resolveStartForCancellation(f.id);
  expect(result.kind).toBe('confirmed');
  expect(result.progress.state).toBe('uploading');
  expect(f.pending()).toBeNull();
  expect((await f.factory().getBookRestore(ownerId, { restoreId: f.id })).state).toBe('uploading');
});
it('a conflicting request under a reused operation id is not adopted and its local metadata is preserved', async () => {
  const f = fixture();
  const original = await f.make().begin(descriptor, reviewHash);
  await expect(f.make().begin(descriptor, 'c'.repeat(64))).rejects.toThrow();
  expect(f.pending().intent.reviewHash).toBe('c'.repeat(64));
  expect((await f.factory().getBookRestore(ownerId, { restoreId: f.id })).bookId).toBe(
    original.progress.bookId,
  );
});
it('invalid receipt or foreign/malformed progress cannot clear bootstrap metadata', async () => {
  const changes = [
    (r) => {
      r.receipt.operationId = 'another-operation-0001';
    },
    (r) => {
      r.receipt.action = 'activateBookRestore';
    },
    (r) => {
      r.receipt.checkpoint = 1;
    },
    (r) => {
      r.receipt.sequence = 0;
    },
    (r) => {
      r.progress.ownerId = 'other';
    },
    (r) => {
      r.progress.bookId = 'other';
    },
    (r) => {
      r.progress.reviewHash = 'd'.repeat(64);
    },
    (r) => {
      r.progress.source.byteLength++;
    },
    (r) => {
      r.progress.uploadedBytes = 1;
    },
    (r) => {
      r.progress.checkpoint = 1;
    },
    (r) => {
      r.progress.updatedAt = 0;
    },
  ];
  for (let n = 0; n < changes.length; n++) {
    const f = fixture('start-proof-0001-' + n),
      start = f.api.start;
    f.api.start = async (input) => {
      const result = await start(input);
      changes[n](result);
      return result;
    };
    await expect(f.make().begin(descriptor, reviewHash)).rejects.toThrow();
    expect(f.pending()).not.toBeNull();
  }
});
it('local CAS failure blocks sending and a competing record is not erased after native confirmation', async () => {
  const f = fixture();
  f.storage.compare = async () => false;
  await expect(f.make().begin(descriptor, reviewHash)).rejects.toThrow();
  expect(f.calls).toHaveLength(0);
  const g = fixture(),
    compare = g.storage.compare;
  g.storage.compare = async (owner, id, old, next) => {
    if (next === null) {
      const record = g.pending();
      record.stamp = crypto.randomUUID();
      g.local.set(JSON.stringify([owner, id]), record);
      return false;
    }
    return compare(owner, id, old, next);
  };
  await expect(g.make().begin(descriptor, reviewHash)).rejects.toThrow();
  expect(g.calls).toHaveLength(1);
  expect(g.pending()).not.toBeNull();
});
it('account invalidation after a native start commit keeps the control for later recovery instead of publishing a stale job', async () => {
  const f = fixture(),
    start = f.api.start;
  f.api.start = async (input) => {
    const result = await start(input);
    f.alive = false;
    return result;
  };
  await expect(f.make().begin(descriptor, reviewHash)).rejects.toThrow('Inactive account');
  expect(f.pending()).not.toBeNull();
  expect(f.calls).toHaveLength(1);
  f.alive = true;
  f.api.start = start;
  expect((await f.make().resume(f.id)).kind).toBe('confirmed');
  expect(f.pending()).toBeNull();
});
it('an absent bootstrap never creates a new request or fence when resuming', async () => {
  const f = fixture(),
    session = f.make();
  expect(await session.resume(f.id)).toEqual({ kind: 'absent' });
  expect(await session.resolveStartForCancellation(f.id)).toEqual({ kind: 'absent' });
  expect(f.calls).toHaveLength(0);
});
it('a single session refuses duplicate simultaneous starts before allocating another local control', async () => {
  const f = fixture(),
    compare = f.storage.compare;
  let release;
  f.storage.compare = async (...args) => {
    if (args[2] === null)
      await new Promise((resolve) => {
        release = resolve;
      });
    return compare(...args);
  };
  const session = f.make(),
    first = session.begin(descriptor, reviewHash);
  await expect(session.begin(descriptor, reviewHash)).rejects.toThrow();
  release();
  await first;
  expect(f.calls).toHaveLength(1);
  expect(f.pending()).toBeNull();
});
it('job parser projects metadata only and validates the source-bound identity even for authorized reads without a token', async () => {
  const f = fixture(),
    result = await f.make().begin(descriptor, reviewHash),
    raw = await f.factory().getBookRestore(ownerId, { restoreId: f.id });
  raw.privateText = 'NEVER_PUBLISH';
  expect(readBookRestoreTransferJob(raw, ownerId, { restoreId: f.id })).toEqual(result.progress);
  expect(JSON.stringify(result.progress)).not.toContain('NEVER_PUBLISH');
  expect(() =>
    readBookRestoreTransferJob(raw, ownerId, { restoreId: f.id, jobToken: 'd'.repeat(64) }),
  ).toThrow();
  expect(() => readBookRestoreTransferJob(raw, 'other')).toThrow();
});

it('authorized server pages are parsed with source-bound identities and an opaque bounded continuation cursor', async () => {
  const f = fixture();
  for (const operationId of ['start-page-job-0001', 'start-page-job-0002'])
    await f.factory().startBookRestore(ownerId, { operationId, source: descriptor, reviewHash });
  const raw = await f.factory().listBookRestores(ownerId, { limit: 1 }),
    first = readBookRestoreTransferPage(raw, ownerId, 1),
    second = readBookRestoreTransferPage(
      await f.factory().listBookRestores(ownerId, {
        limit: 1,
        cursor: first.nextCursor,
      }),
      ownerId,
      1,
    );
  expect(first.items).toHaveLength(1);
  expect(second.items).toHaveLength(1);
  expect(first.items[0].restoreId).not.toBe(second.items[0].restoreId);
  expect(second.nextCursor).toBeNull();
});
it('foreign, duplicated, oversized or malformed server pages cannot be adopted as a local restoration list', async () => {
  const f = fixture(),
    result = await f.make().begin(descriptor, reviewHash),
    item = await f.factory().getBookRestore(ownerId, { restoreId: f.id });
  for (const raw of [
    { schemaVersion: 2, items: [item], nextCursor: null },
    { schemaVersion: 1, items: [{ ...item, ownerId: 'other' }], nextCursor: null },
    { schemaVersion: 1, items: [item, item], nextCursor: null },
    { schemaVersion: 1, items: [item], nextCursor: 'invalid?cursor' },
    { schemaVersion: 1, items: true, nextCursor: null },
  ])
    expect(() => readBookRestoreTransferPage(raw, ownerId, 2)).toThrow();
  expect(() =>
    readBookRestoreTransferPage({ schemaVersion: 1, items: [item], nextCursor: null }, ownerId, 0),
  ).toThrow();
  expect(result.progress.ownerId).toBe(ownerId);
});

it('typed session getters and remote pages preserve scope and current account without returning raw replies', async () => {
  const f = fixture(),
    session = f.make(),
    result = await session.begin(descriptor, reviewHash);
  expect(await session.get({ restoreId: f.id, jobToken: result.progress.jobToken })).toEqual(
    result.progress,
  );
  expect((await session.listRemote({ limit: 1 })).items).toEqual([result.progress]);
  await f.factory().startBookRestore('other', {
    operationId: 'start-foreign-job-0001',
    source: descriptor,
    reviewHash,
  });
  expect((await session.listRemote({ limit: 1 })).items).toHaveLength(1);
  await expect(session.get({ restoreId: 'start-foreign-job-0001' })).rejects.toThrow();
  await expect(session.listRemote({ cursor: 'invalid?', limit: 1 })).rejects.toThrow();
  await expect(session.listRemote({ limit: 51 })).rejects.toThrow();
});
it('late getter or list replies from an invalidated account are suppressed', async () => {
  const f = fixture(),
    session = f.make();
  await session.begin(descriptor, reviewHash);
  const get = f.api.get,
    list = f.api.list;
  f.api.get = async (input) => {
    const raw = await get(input);
    f.alive = false;
    return raw;
  };
  await expect(session.get({ restoreId: f.id })).rejects.toThrow('Inactive account');
  f.alive = true;
  f.api.list = async (input) => {
    const raw = await list(input);
    f.alive = false;
    return raw;
  };
  await expect(session.listRemote()).rejects.toThrow('Inactive account');
  expect(f.pending()).toBeNull();
});
