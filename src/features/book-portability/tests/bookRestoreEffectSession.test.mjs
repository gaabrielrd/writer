// @vitest-environment node
import { it, expect, vi, beforeEach, afterEach } from 'vitest';
import { webcrypto } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { createBookRestoreEffectSession } from '../services/bookRestoreEffectSession.ts';
import { readBookRestoreTransferJob } from '../services/bookRestoreTransferJob.ts';
import {
  readyActivation,
  uid,
} from '../../../../functions/test/helpers/bookRestoreActivationFixture.mjs';
import {
  readyMedia,
  finishMedia,
} from '../../../../functions/test/helpers/bookRestoreMediaFixture.mjs';
import {
  readyArchive,
  archiveStep,
  finishArchive,
} from '../../../../functions/test/helpers/bookRestoreArchiveFixture.mjs';
import { invokeBookRestoreCallable } from '../../../../functions/src/bookRestoreCallable.mjs';
beforeEach(() => vi.stubGlobal('crypto', webcrypto));
afterEach(() => vi.unstubAllGlobals());
function client(f) {
  const identity = { ownerId: uid, restoreId: f.id, jobToken: f.p.jobToken, bookId: f.p.bookId };
  const c = { identity, record: null, calls: [], alive: true, next: 0 };
  const scope = { restoreId: f.id, jobToken: f.p.jobToken };
  c.storage = {
    async read() {
      return structuredClone(c.record);
    },
    async compare(_u, _id, old, next) {
      if (!isDeepStrictEqual(c.record, old)) return false;
      c.record = structuredClone(next);
      return true;
    },
  };
  const call = async (method, input) => {
    c.calls.push({ method, input: structuredClone(input) });
    if (!method.startsWith('get') && !method.startsWith('resolve')) expect(c.record).not.toBeNull();
    return JSON.parse(
      JSON.stringify(await invokeBookRestoreCallable(f.factory(), method, uid, input)),
    );
  };
  c.api = {
    mutate: call,
    review: (input) => call('getBookRestoreActivationReview', input),
    media: (input) => call('getBookRestoreMediaState', input),
    archive: (input) => call('getBookRestoreArchiveCleanup', input),
    resolve: (input) => call('resolveBookRestoreOperation', input),
  };
  c.getJob = async () =>
    readBookRestoreTransferJob(await f.factory().getBookRestore(uid, scope), uid, identity);
  c.make = () =>
    createBookRestoreEffectSession({
      identity,
      storage: c.storage,
      api: c.api,
      getJob: c.getJob,
      check() {
        if (!c.alive) throw Error('Inactive account');
      },
      operationId: () => 'client-terminal-operation-' + ++c.next,
    });
  return c;
}
function loseOnce(c, action) {
  const mutate = c.api.mutate;
  let lost = false;
  c.api.mutate = async (method, input) => {
    const result = await mutate(method, input);
    if (method === action && !lost) {
      lost = true;
      throw Error('Lost after commit');
    }
    return result;
  };
}
it('advance stops at review; only explicit original review creates one private book', async () => {
  const f = await readyActivation(),
    c = client(f),
    s = c.make();
  expect((await s.advance()).kind).toBe('needs-review');
  expect(c.calls).toHaveLength(0);
  const review = await s.review();
  expect(f.records.has('books/' + c.identity.bookId)).toBe(false);
  const result = await s.activate(review);
  expect(result).toMatchObject({
    kind: 'confirmed',
    action: 'activateBookRestore',
    job: { state: 'activated', recoveryReady: false },
  });
  expect(c.record).toBeNull();
  expect(f.records.get('books/' + c.identity.bookId)).toBeDefined();
  await expect(s.cancel()).rejects.toThrow();
});
it('lost activation survives key revocation and fresh session replays exactly once without recreating a deleted book', async () => {
  const f = await readyActivation(),
    c = client(f);
  loseOnce(c, 'activateBookRestore');
  const review = await c.make().review();
  await expect(c.make().activate(review)).rejects.toThrow('Lost after commit');
  const record = structuredClone(c.record);
  expect(f.records.has('users/' + uid + '/bookRestoreRecoveryKeys/' + f.id)).toBe(false);
  f.records.delete('books/' + c.identity.bookId);
  expect((await c.make().resume()).kind).toBe('confirmed');
  const calls = c.calls.filter((r) => r.method === 'activateBookRestore');
  expect(calls).toHaveLength(2);
  expect(calls[0].input).toEqual(calls[1].input);
  expect(calls[1].input.operationId).toBe(record.intent.operationId);
  expect(c.record).toBeNull();
  expect(f.records.has('books/' + c.identity.bookId)).toBe(false);
});
it('resolver confirms original activation after transport loss without issuing another mutation', async () => {
  const f = await readyActivation(),
    c = client(f);
  loseOnce(c, 'activateBookRestore');
  await expect(c.make().activate(await c.make().review())).rejects.toThrow();
  expect((await c.make().reconcile()).kind).toBe('confirmed');
  expect(c.record).toBeNull();
  expect(c.calls.filter((r) => r.method === 'activateBookRestore')).toHaveLength(1);
});
it('stale review is retained unchanged and an unknown same-checkpoint resolution cannot clear or replace it', async () => {
  const f = await readyActivation(),
    c = client(f),
    review = await c.make().review();
  const changed = { ...review, reviewToken: 'f'.repeat(64) };
  await expect(c.make().activate(changed)).rejects.toThrow();
  const original = structuredClone(c.record);
  expect(original.intent.reviewToken).toBe(changed.reviewToken);
  expect((await c.make().reconcile()).kind).toBe('unconfirmed');
  expect(c.record).toEqual(original);
  await expect(c.make().review()).rejects.toThrow();
  await expect(c.make().activate(review)).rejects.toThrow();
  expect(c.calls.filter((r) => r.method === 'activateBookRestore')).toHaveLength(1);
});
it('checkpoint advancement proves an uncommitted stale activation cannot produce later effects', async () => {
  const f = await readyActivation(),
    c = client(f),
    review = await c.make().review();
  await expect(c.make().activate({ ...review, reviewToken: 'f'.repeat(64) })).rejects.toThrow();
  await f.factory().activateBookRestore(uid, f.request);
  expect((await c.make().reconcile()).kind).toBe('superseded');
  expect(c.record).toBeNull();
});
it('lost media and archive responses replay their original metadata and finish without touching the active book', async () => {
  const f = await readyMedia({ none: true }),
    c = client(f),
    root = structuredClone(f.records.get('books/' + f.p.bookId));
  loseOnce(c, 'finalizeBookRestoreMedia');
  await expect(c.make().advance()).rejects.toThrow('Lost after commit');
  const media = structuredClone(c.record);
  expect((await c.make().resume()).kind).toBe('confirmed');
  expect(
    c.calls.filter((r) => r.method === 'finalizeBookRestoreMedia').map((r) => r.input),
  ).toEqual([
    expect.objectContaining({ operationId: media.intent.operationId }),
    expect.objectContaining({ operationId: media.intent.operationId }),
  ]);
  loseOnce(c, 'advanceBookRestoreArchiveCleanup');
  await expect(c.make().advance()).rejects.toThrow('Lost after commit');
  const archive = structuredClone(c.record);
  expect((await c.make().resume()).kind).toBe('confirmed');
  expect(
    c.calls
      .filter((r) => r.method === 'advanceBookRestoreArchiveCleanup')
      .map((r) => r.input.operationId),
  ).toEqual([archive.intent.operationId, archive.intent.operationId]);
  let result;
  for (let n = 0; n < 500; n++) {
    result = await c.make().advance();
    if (result.kind === 'complete') break;
  }
  expect(result.kind).toBe('complete');
  expect(c.record).toBeNull();
  expect(f.records.get('books/' + f.p.bookId)).toEqual(root);
});
it('media completed by another client is confirmed as a native no-op without inventing an own receipt', async () => {
  const f = await readyMedia({ none: true }),
    c = client(f),
    mutate = c.api.mutate;
  c.api.mutate = async () => {
    throw Error('Not sent');
  };
  await expect(c.make().advance()).rejects.toThrow('Not sent');
  const original = structuredClone(c.record);
  await finishMedia(f);
  c.api.mutate = mutate;
  const result = await c.make().reconcile();
  expect(result.kind).toBe('already-complete');
  expect(c.record).toBeNull();
  expect(c.calls.at(-1).input.operationId).toBe(original.intent.operationId);
});
it('archive revision conflict clears an obsolete pending request only after native monotonic proof', async () => {
  const f = await readyArchive({ none: true }),
    c = client(f),
    mutate = c.api.mutate;
  c.api.mutate = async () => {
    throw Error('Not sent');
  };
  await expect(c.make().advance()).rejects.toThrow('Not sent');
  const original = structuredClone(c.record);
  await archiveStep(f);
  c.api.mutate = mutate;
  const result = await c.make().reconcile();
  expect(result.kind).toBe('superseded');
  expect(result.archive.revision).toBeGreaterThan(original.intent.expectedRevision);
  expect(c.record).toBeNull();
});
it('finished archive confirms a pending unused operation as already complete', async () => {
  const f = await readyArchive({ none: true }),
    c = client(f),
    mutate = c.api.mutate;
  c.api.mutate = async () => {
    throw Error('Not sent');
  };
  await expect(c.make().advance()).rejects.toThrow();
  await finishArchive(f);
  c.api.mutate = mutate;
  expect((await c.make().reconcile()).kind).toBe('already-complete');
  expect(c.record).toBeNull();
});
it('cancel and cleanup survive lost responses and key revocation without creating a book', async () => {
  const f = await readyActivation(),
    c = client(f);
  loseOnce(c, 'cancelBookRestore');
  await expect(c.make().cancel()).rejects.toThrow('Lost after commit');
  expect((await c.make().resume()).job.state).toBe('cancelling');
  loseOnce(c, 'advanceBookRestoreCleanup');
  await expect(c.make().advance()).rejects.toThrow('Lost after commit');
  expect((await c.make().reconcile()).kind).toBe('confirmed');
  let result;
  for (let n = 0; n < 500; n++) {
    result = await c.make().advance();
    if (result.kind === 'cancelled') break;
  }
  expect(result.kind).toBe('cancelled');
  expect(c.record).toBeNull();
  expect(f.records.has('books/' + f.p.bookId)).toBe(false);
});
it('invalid account after commit preserves pending intent and a competing CAS record is never erased', async () => {
  const f = await readyActivation(),
    c = client(f),
    mutate = c.api.mutate;
  c.api.mutate = async (...args) => {
    const reply = await mutate(...args);
    c.alive = false;
    return reply;
  };
  await expect(c.make().activate(await c.make().review())).rejects.toThrow('Inactive account');
  expect(c.record).not.toBeNull();
  c.alive = true;
  c.api.mutate = mutate;
  c.storage.compare = async (_u, _id, _old, next) => {
    if (next === null) {
      c.record = { ...c.record, stamp: crypto.randomUUID() };
      return false;
    }
    return false;
  };
  await expect(c.make().resume()).rejects.toThrow();
  expect(c.record).not.toBeNull();
});
it('failed persistence blocks RPC; a malformed or foreign receipt never clears an original intent', async () => {
  const f = await readyActivation(),
    c = client(f),
    s = c.make(),
    review = await s.review(),
    compare = c.storage.compare;
  c.storage.compare = async () => false;
  await expect(s.activate(review)).rejects.toThrow();
  expect(c.calls.filter((r) => r.method === 'activateBookRestore')).toHaveLength(0);
  c.storage.compare = compare;
  const mutate = c.api.mutate;
  c.api.mutate = async (...args) => {
    const r = await mutate(...args);
    r.receipt.operationId = 'foreign-operation-001';
    return r;
  };
  await expect(c.make().activate(review)).rejects.toThrow();
  expect(c.record).not.toBeNull();
  c.api.mutate = mutate;
  expect((await c.make().resume()).kind).toBe('confirmed');
  expect(c.record).toBeNull();
});

it('activation snapshots the displayed review before waiting for local storage', async () => {
  const f = await readyActivation(),
    c = client(f),
    review = structuredClone(await c.make().review()),
    read = c.storage.read;
  let release;
  c.storage.read = async (...args) => {
    await new Promise((resolve) => {
      release = resolve;
    });
    return read(...args);
  };
  const result = c.make().activate(review);
  review.reviewToken = 'f'.repeat(64);
  release();
  expect((await result).kind).toBe('confirmed');
  expect(c.calls.filter((r) => r.method === 'activateBookRestore').at(-1).input.reviewToken).toBe(
    f.review.reviewToken,
  );
});
