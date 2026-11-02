// @vitest-environment node
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { createAdventureRestoreEffectSession } from '../services/adventureRestoreEffectSession.ts';
import {
  activationFixture,
  activationRequest,
} from '../../../../functions/test/helpers/adventureRestoreActivationFixture.mjs';
import { emptyAdventureArchive } from '../../../../functions/test/helpers/adventureRestoreArchiveFixture.mjs';
import {
  mediaFixture,
  finishMedia,
} from '../../../../functions/test/helpers/adventureRestoreMediaFixture.mjs';
import { invokeAdventureRestoreCallable } from '../../../../functions/src/adventureRestoreCallable.mjs';
beforeEach(() => vi.stubGlobal('crypto', webcrypto));
afterEach(() => vi.unstubAllGlobals());
async function ready() {
  return activationFixture(await emptyAdventureArchive());
}
function client({ f, p }) {
  const identity = {
    ownerId: f.uid,
    restoreId: p.restoreId,
    adventureId: p.adventureId,
    jobToken: p.jobToken,
    reviewHash: p.reviewHash,
  };
  const c = { identity, record: null, calls: [], active: true, next: 0, f, p };
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
      JSON.stringify(await invokeAdventureRestoreCallable(f.api, method, f.uid, input)),
    );
  };
  c.api = {
    mutate: call,
    retireActivation: (i) => call('retireAdventureRestoreActivation', i),
    review: (i) => call('getAdventureRestoreActivationReview', i),
    media: (i) => call('getAdventureRestoreMediaState', i),
    archive: (i) => call('getAdventureRestoreArchiveCleanup', i),
    resolve: (i) => call('resolveAdventureRestoreOperation', i),
  };
  c.make = () =>
    createAdventureRestoreEffectSession({
      identity,
      storage: c.storage,
      api: c.api,
      getJob: () =>
        f.api.getAdventureRestore(f.uid, { restoreId: p.restoreId, jobToken: p.jobToken }),
      check() {
        if (!c.active) throw Error('Expired');
      },
      operationId: () => 'client-adventure-effect-' + String(++c.next).padStart(6, '0'),
    });
  return c;
}
function lose(c, action) {
  const mutate = c.api.mutate;
  let once = true;
  c.api.mutate = async (...args) => {
    const r = await mutate(...args);
    if (args[0] === action && once) {
      once = false;
      throw Error('Lost ACK');
    }
    return r;
  };
}
const root = (c) => 'adventures/' + c.identity.adventureId;
const key = (c) =>
  'users/' + c.identity.ownerId + '/adventureRestoreRecoveryKeys/' + c.identity.restoreId;
async function complete(c) {
  for (let n = 0; n < 1000; n++) {
    const r = await c.make().advance();
    if (['complete', 'cancelled'].includes(r.kind)) return r;
  }
  throw Error('Unbounded effect loop');
}
it('pauses for review, activates only explicit consent, preserves root birth and refuses cancelling activated adventure', async () => {
  const c = client(await ready()),
    initial = c.f.metadata.get(root(c));
  expect((await c.make().advance()).kind).toBe('needs-review');
  expect(c.calls).toHaveLength(0);
  const review = await c.make().review();
  expect(c.f.records.get(root(c)).ownerId).toBeUndefined();
  expect(review.summary).toMatchObject({
    visibility: 'private',
    mediaState: 'none',
    counts: { images: 0 },
  });
  expect((await c.make().activate(review)).job.state).toBe('activated');
  expect(c.f.records.get(root(c)).ownerId).toBe(c.identity.ownerId);
  expect(c.f.metadata.get(root(c))).toMatchObject({
    createdAt: initial.createdAt,
    createdAtNanoseconds: initial.createdAtNanoseconds,
  });
  await expect(c.make().cancel()).rejects.toThrow();
  expect(c.record).toBeNull();
});
it('lost activation replays same ID after reload, confirms historical receipt without recreating deleted root', async () => {
  const c = client(await ready());
  lose(c, 'activateAdventureRestore');
  await expect(c.make().activate(await c.make().review())).rejects.toThrow('Lost ACK');
  const original = structuredClone(c.record);
  expect(JSON.stringify(original)).not.toMatch(
    /PRIVATE_EMPTY_TITLE|keyId|keyBase64|title|summary|url/,
  );
  c.f.records.delete(root(c));
  expect((await c.make().resume()).kind).toBe('confirmed');
  const calls = c.calls.filter((x) => x.method === 'activateAdventureRestore');
  expect(calls.map((x) => x.input)).toEqual([calls[0].input, calls[0].input]);
  expect(calls[1].input.operationId).toBe(original.intent.operationId);
  expect(c.record).toBeNull();
  expect(c.f.records.has(root(c))).toBe(false);
});
it('resolver confirms original activation without second mutation and no private key access', async () => {
  const c = client(await ready());
  lose(c, 'activateAdventureRestore');
  await expect(c.make().activate(await c.make().review())).rejects.toThrow();
  expect((await c.make().reconcile()).kind).toBe('confirmed');
  expect(c.calls.filter((x) => x.method === 'activateAdventureRestore')).toHaveLength(1);
  expect(c.calls.at(-1).input.requestHash).toMatch(/^[a-f0-9]{64}$/);
  expect(c.record).toBeNull();
});
it('stale review retires same request then returns fresh review, never activates automatically', async () => {
  const c = client(await ready()),
    review = await c.make().review();
  const ack = await c.make().activate({ ...review, reviewToken: 'f'.repeat(64) });
  expect(ack.kind).toBe('retired');
  expect(c.record).toBeNull();
  expect(c.f.records.get(root(c)).ownerId).toBeUndefined();
  const activation = c.calls.find((x) => x.method === 'activateAdventureRestore');
  expect(c.calls.find((x) => x.method === 'retireAdventureRestoreActivation').input).toEqual(
    activation.input,
  );
  const fresh = await c.make().review();
  expect(fresh.checkpoint).toBe(review.checkpoint + 1);
  expect(fresh.reviewToken).not.toBe(review.reviewToken);
  expect((await c.make().activate(fresh)).job.state).toBe('activated');
});
it('lost retirement replays original activation ID to its retired receipt', async () => {
  const c = client(await ready()),
    retire = c.api.retireActivation;
  c.api.retireActivation = async (i) => {
    await retire(i);
    throw Error('Lost retirement');
  };
  await expect(
    c.make().activate({ ...(await c.make().review()), reviewToken: 'f'.repeat(64) }),
  ).rejects.toThrow('Lost retirement');
  const original = structuredClone(c.record);
  expect((await c.make().resume()).kind).toBe('retired');
  expect(c.calls.filter((x) => x.method === 'retireAdventureRestoreActivation')).toHaveLength(1);
  expect(
    c.calls
      .filter((x) => x.method === 'activateAdventureRestore')
      .every((x) => x.input.operationId === original.intent.operationId),
  ).toBe(true);
  expect(c.record).toBeNull();
});
it('transport error never retires; unresolved original checkpoint preserves debt and blocks another review', async () => {
  const c = client(await ready());
  c.api.mutate = async () => {
    throw Error('Offline');
  };
  await expect(c.make().activate(await c.make().review())).rejects.toThrow('Offline');
  const original = structuredClone(c.record);
  expect((await c.make().reconcile()).kind).toBe('unconfirmed');
  expect(c.record).toEqual(original);
  await expect(c.make().review()).rejects.toThrow();
  expect(c.calls.some((x) => x.method === 'retireAdventureRestoreActivation')).toBe(false);
});
it('monotonic native checkpoint proves an unsent activation superseded', async () => {
  const state = await ready(),
    c = client(state);
  c.api.mutate = async () => {
    throw Error('Offline');
  };
  await expect(c.make().activate(await c.make().review())).rejects.toThrow();
  const { request } = await activationRequest(state.f, state.p, 'other-native-activation-0001');
  await state.f.api.activateAdventureRestore(state.f.uid, request);
  expect((await c.make().reconcile()).kind).toBe('superseded');
  expect(c.record).toBeNull();
});
it('cancel revokes key; lost cancel and cleanup responses recover without key or visible project', async () => {
  const c = client(await ready());
  lose(c, 'cancelAdventureRestore');
  await expect(c.make().cancel()).rejects.toThrow('Lost ACK');
  expect(c.f.records.has(key(c))).toBe(false);
  expect((await c.make().resume()).job.state).toBe('cancelling');
  lose(c, 'advanceAdventureRestoreCleanup');
  await expect(c.make().advance()).rejects.toThrow('Lost ACK');
  expect((await c.make().reconcile()).kind).toBe('confirmed');
  expect((await complete(c)).kind).toBe('cancelled');
  expect(c.f.records.get(root(c)).ownerId).toBeUndefined();
});
it('lost media and archive responses finish through fresh sessions, preserving frozen job and active edits', async () => {
  const c = client(await mediaFixture(await emptyAdventureArchive()));
  const job = structuredClone(c.f.records.get(c.f.path));
  const edited = { ...c.f.records.get(root(c)), title: 'MY_LATER_EDIT' };
  c.f.records.set(root(c), edited);
  lose(c, 'advanceAdventureRestoreMedia');
  await expect(c.make().advance()).rejects.toThrow('Lost ACK');
  expect((await c.make().resume()).kind).toBe('confirmed');
  lose(c, 'advanceAdventureRestoreArchiveCleanup');
  await expect(c.make().advance()).rejects.toThrow('Lost ACK');
  expect(c.f.records.has(key(c))).toBe(false);
  expect((await c.make().reconcile()).kind).toBe('confirmed');
  expect((await complete(c)).kind).toBe('complete');
  expect(c.f.records.get(c.f.path)).toEqual(job);
  expect(c.f.records.get(root(c))).toEqual(edited);
});
it('media done elsewhere with stale unused checkpoint becomes superseded', async () => {
  const state = await mediaFixture(await emptyAdventureArchive()),
    c = client(state),
    mutate = c.api.mutate;
  c.api.mutate = async () => {
    throw Error('Not sent');
  };
  await expect(c.make().advance()).rejects.toThrow();
  await finishMedia(state.f, state.p, state.media);
  c.api.mutate = mutate;
  // The server checks checkpoint before complete: stale unsent operation is superseded, not fabricated receipt.
  expect((await c.make().reconcile()).kind).toBe('superseded');
  expect(c.record).toBeNull();
});
it('archive advanced elsewhere reconciles its checkpoint conflict without deleting uncertain same-checkpoint request', async () => {
  const state = await mediaFixture(await emptyAdventureArchive());
  await finishMedia(state.f, state.p, state.media);
  const c = client(state),
    mutate = c.api.mutate;
  c.api.mutate = async () => {
    throw Error('Not sent');
  };
  await expect(c.make().advance()).rejects.toThrow();
  expect((await c.make().reconcile()).kind).toBe('unconfirmed');
  await state.f.api.advanceAdventureRestoreArchiveCleanup(state.f.uid, {
    restoreId: state.p.restoreId,
    jobToken: state.p.jobToken,
    operationId: 'other-archive-unit-0001',
    expectedCheckpoint: 0,
  });
  c.api.mutate = mutate;
  expect((await c.make().reconcile()).kind).toBe('superseded');
  expect(c.record).toBeNull();
});
it('archive completed elsewhere returns native already-complete without inventing own receipt', async () => {
  const state = await mediaFixture(await emptyAdventureArchive());
  await finishMedia(state.f, state.p, state.media);
  const c = client(state),
    mutate = c.api.mutate;
  c.api.mutate = async () => {
    throw Error('Not sent');
  };
  await expect(c.make().advance()).rejects.toThrow();
  const other = client(state);
  other.next = 10000;
  expect((await complete(other)).kind).toBe('complete');
  c.api.mutate = mutate;
  expect((await c.make().reconcile()).kind).toBe('already-complete');
  expect(c.record).toBeNull();
});
it('image media advances per asset and then empty confirmation before collection', async () => {
  const state = await mediaFixture(),
    c = client(state);
  expect((await c.make().advance()).media).toMatchObject({
    processed: 1,
    complete: false,
    ready: 1,
  });
  expect((await c.make().advance()).media).toMatchObject({
    processed: 1,
    complete: true,
    ready: 1,
  });
  expect(
    c.calls
      .filter((x) => x.method === 'advanceAdventureRestoreMedia')
      .map((x) => x.input.expectedCheckpoint),
  ).toEqual([0, 1]);
  expect((await complete(c)).kind).toBe('complete');
});
it('failed persistence blocks mutation; malformed receipt keeps original debt until real replay', async () => {
  const c = client(await ready()),
    review = await c.make().review(),
    compare = c.storage.compare;
  c.storage.compare = async () => false;
  await expect(c.make().activate(review)).rejects.toThrow();
  expect(c.calls.filter((x) => x.method === 'activateAdventureRestore')).toHaveLength(0);
  c.storage.compare = compare;
  const mutate = c.api.mutate;
  c.api.mutate = async (...args) => {
    const r = await mutate(...args);
    r.receipt.operationId = 'foreign-operation-0001';
    return r;
  };
  await expect(c.make().activate(review)).rejects.toThrow();
  expect(c.record).not.toBeNull();
  c.api.mutate = mutate;
  expect((await c.make().resume()).kind).toBe('confirmed');
});
it('expired account after commit and competing CAS cannot erase another tab record', async () => {
  const c = client(await ready()),
    mutate = c.api.mutate;
  c.api.mutate = async (...args) => {
    const r = await mutate(...args);
    c.active = false;
    return r;
  };
  await expect(c.make().activate(await c.make().review())).rejects.toThrow('Expired');
  expect(c.record).not.toBeNull();
  c.active = true;
  c.api.mutate = mutate;
  const compare = c.storage.compare;
  c.storage.compare = async (_u, _id, _old, next) => {
    if (next === null) c.record = { ...c.record, stamp: crypto.randomUUID() };
    return false;
  };
  await expect(c.make().resume()).rejects.toThrow();
  expect(c.record).not.toBeNull();
  c.storage.compare = compare;
  expect((await c.make().resume()).kind).toBe('confirmed');
  expect(c.record).toBeNull();
});
it('captures displayed consent before storage await and forbids parallel unit in same session', async () => {
  const c = client(await ready()),
    review = structuredClone(await c.make().review()),
    read = c.storage.read;
  let release;
  c.storage.read = async (...args) => {
    await new Promise((r) => {
      release = r;
    });
    return read(...args);
  };
  const s = c.make(),
    task = s.activate(review);
  review.reviewToken = 'f'.repeat(64);
  await expect(s.advance()).rejects.toThrow();
  release();
  expect((await task).kind).toBe('confirmed');
});
it('foreign identity or corrupt pending record prevents network and preserves stored attempt', async () => {
  const c = client(await ready());
  c.api.mutate = async () => {
    throw Error('Not sent');
  };
  await expect(c.make().activate(await c.make().review())).rejects.toThrow();
  c.record.intent = { ...c.record.intent, jobToken: 'f'.repeat(64) };
  const before = c.calls.length;
  await expect(c.make().resume()).rejects.toThrow();
  expect(c.calls).toHaveLength(before);
  expect(c.record).not.toBeNull();
});

it.each([
  (r) => {
    r.receipt.checkpoint++;
  },
  (r) => {
    r.receipt.activation.reviewToken = 'f'.repeat(64);
  },
  (r) => {
    r.receipt.activation.activatedAt++;
  },
  (r) => {
    r.progress.restoreId = 'foreign-restore-0001';
  },
  (r) => {
    r.receipt.staging.libraryImages++;
  },
  (r) => {
    r.receipt.validation = null;
  },
])('malformed activation ACK preserves metadata for valid later replay %#', async (tamper) => {
  const c = client(await ready()),
    mutate = c.api.mutate;
  c.api.mutate = async (...args) => {
    const r = await mutate(...args);
    tamper(r);
    return r;
  };
  await expect(c.make().activate(await c.make().review())).rejects.toThrow();
  expect(c.record).not.toBeNull();
  c.api.mutate = mutate;
  expect((await c.make().resume()).kind).toBe('confirmed');
  expect(c.record).toBeNull();
});
it('malformed media ACK and foreign archive receipt never erase pending effect', async () => {
  const c = client(await mediaFixture(await emptyAdventureArchive())),
    mutate = c.api.mutate;
  c.api.mutate = async (...args) => {
    const r = await mutate(...args);
    r.receipt.checkpoint++;
    return r;
  };
  await expect(c.make().advance()).rejects.toThrow();
  expect(c.record).not.toBeNull();
  c.api.mutate = mutate;
  expect((await c.make().resume()).kind).toBe('confirmed');
  c.api.mutate = async (...args) => {
    const r = await mutate(...args);
    r.receipt.ownerId = 'other';
    return r;
  };
  await expect(c.make().advance()).rejects.toThrow();
  expect(c.record).not.toBeNull();
  c.api.mutate = mutate;
  expect((await c.make().resume()).kind).toBe('confirmed');
});
