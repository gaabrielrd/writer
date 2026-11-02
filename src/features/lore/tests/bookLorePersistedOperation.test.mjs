// @vitest-environment node
import { beforeEach, afterEach, afterAll, it, expect, vi } from 'vitest';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { prepareBookLoreEditOperation } from '../services/bookLoreEditOperation.ts';
import { createPersistedBookLoreEditOperation as create } from '../services/bookLorePersistedOperation.ts';
import { createBookLoreJournal, openBookLoreJournal } from '../services/bookLoreJournal.ts';
import { bookLoreWriteHash as hash } from '../services/bookLoreWritePayload.ts';
import { journalWire } from '../services/bookLoreJournalContracts.ts';
import { createBookLoreReadClient } from '../services/bookLoreReadClient.ts';
import { createBookLoreReadService } from '../../../../functions/src/bookLoreRead.mjs';
import { createBookLoreEditTransportService } from '../../../../functions/src/bookLoreEditTransport.mjs';
import { adventureImportDb } from '../../../../functions/test/helpers/adventureImportDb.mjs';
import { loreLogicalFixture } from '../../../../functions/test/helpers/bookLoreLogicalFixture.mjs';
import { installLoreJournalHarness } from './bookLoreJournalHarness.mjs';
// Full encrypted persistence protocols retain their complete data and assertions under coverage.
vi.setConfig({ testTimeout: 60000 });
afterAll(() => vi.resetConfig());
let h;
beforeEach(() => {
  h = installLoreJournalHarness();
});
afterEach(() => vi.unstubAllGlobals());
async function setup({ big = false, changes, signal } = {}) {
  const f = adventureImportDb({ nativeUpdates: true }),
    seed = await loreLogicalFixture(f.db, { mode: 'inline' }),
    read = createBookLoreReadService({ db: f.db }),
    client = createBookLoreReadClient(
      (m, v) => read[m](seed.uid, v),
      () => {},
    ),
    source = await client.capture(seed.bookId, seed.entityId),
    input = {
      uid: seed.uid,
      writeId: 'persistent-edit',
      source,
      changes: changes ?? [
        { field: 'summary', value: ' OWN_PRIVATE_🌙\r\n ' + (big ? '🌙'.repeat(40000) : '') },
      ],
    },
    server = createBookLoreEditTransportService({ db: f.db, now: () => 8000 }),
    prepared = await prepareBookLoreEditOperation(
      input,
      {
        call: () => {
          throw Error('static');
        },
      },
      { yieldControl: async () => {} },
    ),
    raw = crypto.getRandomValues(new Uint8Array(32)),
    key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']),
    identity = {
      schemaVersion: 1,
      uid: seed.uid,
      writeId: input.writeId,
      bookId: seed.bookId,
      loreId: seed.entityId,
      sourceToken: source.sourceToken,
      intentHash: prepared.snapshot().intentHash,
      requestHash: 'b'.repeat(64),
      jobToken: 'c'.repeat(64),
      keyId: bytesToHex(sha256(raw)),
    },
    calls = [];
  let j,
    allowed = true,
    current = true,
    gets = 0,
    intercept = null;
  const options = {
      guard() {
        if (!current) throw Error('actor changed');
      },
      yieldControl: async () => {},
      async getKey() {
        gets++;
        if (!allowed) throw Error('key revoked');
        return { identity, key };
      },
    },
    native = {
      async call(method, value) {
        calls.push({ method, input: structuredClone(value) });
        if (journalWire({ method, input: value }, identity).metadata.lane === 'production') {
          const head = await j.inspect(),
            cp = await j.readCheckpoint(true);
          expect(head.draft.complete).toBe(true);
          expect(head.controls.ready).toBe(true);
          expect(head.production.state).toBe('pending');
          expect(head.checkpointOutcome).toBeNull();
          expect(cp.checkpoint.pending.production).toEqual({ method, input: value });
        }
        const invoke = () => server.bookLoreEdit(seed.uid, { method, input: value });
        return intercept ? intercept(method, value, invoke) : invoke();
      },
    };
  j = await createBookLoreJournal(identity, options);
  const make = (inputValue = input, journal = j) =>
      create(journal, native, inputValue, { ...options, signal }),
    open = async () => {
      j = await openBookLoreJournal(identity, options);
      return make(undefined);
    };
  return {
    ...f,
    ...seed,
    input,
    identity,
    options,
    native,
    calls,
    make,
    open,
    client,
    source,
    get j() {
      return j;
    },
    allowed: (v) => {
      allowed = v;
    },
    current: (v) => {
      current = v;
    },
    gets: () => gets,
    intercept: (v) => {
      intercept = v;
    },
    revoke: async () => {
      allowed = false;
      await f.db.runTransaction((tx) => tx.update(f.db.doc('books/book'), { authorId: 'other' }));
    },
  };
}
async function until(op, predicate) {
  for (let n = 0; n < 500; n++) {
    if (predicate(op.snapshot())) return;
    await op.advance();
  }
  throw Error('milestone not reached');
}
const ready = (op) => until(op, (s) => s.phase === 'ready');
const closing = (op) => until(op, (s) => ['cancelled', 'applied'].includes(s.phase));
it('saves map, literal draft and baseline before any RPC; exposes metadata only and requires explicit apply', async () => {
  const f = await setup(),
    op = f.make(),
    before = structuredClone(f.records.get('books/book'));
  const state = await op.initialize();
  expect(state).toMatchObject({
    initialized: true,
    draftSaved: true,
    hasRecoveryCopy: true,
    savePending: false,
    canApply: false,
  });
  expect(f.calls).toHaveLength(0);
  await expect(op.apply()).rejects.toThrow('preparação');
  await ready(op);
  expect(op.snapshot().canApply).toBe(true);
  const calls = f.calls.length;
  await op.advance();
  expect(f.calls).toHaveLength(calls);
  expect(f.records.get('books/book')).toEqual(before);
  expect(JSON.stringify(op.snapshot())).not.toContain('OWN_PRIVATE');
  expect(
    JSON.stringify(
      h
        .rows()
        .filter((r) => r.store === 'heads')
        .map((r) => r.value),
    ),
  ).not.toContain('OWN_PRIVATE');
  expect((await op.apply()).phase).toBe('applied');
  expect((await f.j.inspect()).production.state).toBe('confirmed');
  const reread = await f.client.capture(f.bookId, f.entityId);
  expect(reread.data.summary).toBe(f.input.changes[0].value);
  const count = f.calls.length;
  const resumed = await f.open();
  await resumed.initialize();
  expect(resumed.snapshot().phase).toBe('applied');
  await resumed.advance();
  expect(f.calls).toHaveLength(count);
});
for (const method of [
  'startBookLoreSourceInspection',
  'advanceBookLoreSourceInspection',
  'startBookLoreFieldUpload',
  'appendBookLoreFieldUpload',
  'advanceBookLoreFieldSeal',
  'startBookLoreEditReservation',
  'initializeBookLoreEditGeneration',
  'reserveBookLoreEditUpload',
  'advanceBookLoreEditCompilation',
  'adoptBookLoreEditGeneration',
]) {
  it('replays an unobserved native reply exactly after reload: ' + method, async () => {
    const f = await setup({ big: method === 'appendBookLoreFieldUpload' });
    let op = f.make(),
      lost = false;
    f.intercept(async (m, _v, invoke) => {
      const result = await invoke();
      if (m === method && !lost) {
        lost = true;
        throw Error('lost reply');
      }
      return result;
    });
    let error;
    try {
      await ready(op);
      if (method === 'adoptBookLoreEditGeneration') await op.apply();
    } catch (e) {
      error = e;
    }
    expect(error?.message).toBe('lost reply');
    expect(lost).toBe(true);
    const prior = f.calls.at(-1),
      n = f.calls.length;
    op = await f.open();
    await op.initialize();
    expect(f.calls).toHaveLength(n);
    await op.advance();
    expect(f.calls[n]).toEqual(prior);
    if (method === 'adoptBookLoreEditGeneration') expect(op.snapshot().phase).toBe('applied');
    else {
      await ready(op);
      expect(op.snapshot().canApply).toBe(true);
    }
  });
}
for (const at of [1, 2, 3]) {
  it('recovers interrupted baseline commit ' + at + ' without producing', async () => {
    const f = await setup();
    let armed = true;
    const journal = {
        ...f.j,
        writeCheckpoint: async (bundle) => {
          if (armed) {
            armed = false;
            h.abortAt(h.commits() + at);
          }
          return f.j.writeCheckpoint(bundle);
        },
      },
      op = f.make(f.input, journal);
    await expect(op.initialize()).rejects.toThrow();
    expect(f.calls).toHaveLength(0);
    expect(op.snapshot().savePending).toBe(true);
    const resumed = await f.open();
    await resumed.initialize();
    expect(resumed.snapshot()).toMatchObject({
      initialized: true,
      draftSaved: true,
      savePending: false,
    });
    expect(f.calls).toHaveLength(0);
    await resumed.advance();
    expect(f.calls).toHaveLength(1);
  });
  it('recovers interrupted pre-RPC commit ' + at + ' before sending exact unit', async () => {
    const f = await setup();
    let armed = false;
    const journal = {
        ...f.j,
        writeCheckpoint: async (bundle) => {
          if (armed && bundle.checkpoint.pending.production) {
            armed = false;
            h.abortAt(h.commits() + at);
          }
          return f.j.writeCheckpoint(bundle);
        },
      },
      op = f.make(f.input, journal);
    await op.initialize();
    armed = true;
    await expect(op.advance()).rejects.toThrow();
    expect(f.calls).toHaveLength(0);
    const resumed = await f.open();
    await resumed.initialize();
    await resumed.advance();
    expect(f.calls).toHaveLength(1);
    expect((await f.j.inspect()).production.state).toBe('confirmed');
  });
  it(
    'recovers validated result after interrupted post-RPC commit ' + at + ' without repeating RPC',
    async () => {
      const f = await setup();
      let armed = false;
      const journal = {
          ...f.j,
          writeCheckpoint: async (bundle) => {
            if (armed && bundle.confirmed.length) {
              armed = false;
              while ((await f.j.inspect()).checkpoint?.garbage)
                await f.j.advanceCheckpointCleanup();
              h.abortAt(h.commits() + at);
            }
            return f.j.writeCheckpoint(bundle);
          },
        },
        op = f.make(f.input, journal);
      await op.initialize();
      armed = true;
      await expect(op.advance()).rejects.toThrow();
      const head = await f.j.inspect();
      expect(head.checkpointOutcome).not.toBeNull();
      expect(head.production.state).toBe('pending');
      expect(JSON.stringify(head.checkpointOutcome)).not.toContain('OWN_PRIVATE');
      const resumed = await f.open();
      await resumed.initialize();
      expect(f.calls).toHaveLength(1);
      expect(resumed.snapshot().operation.completedCalls).toBe(1);
      const saved = await f.j.inspect();
      expect(saved.production.state).toBe('confirmed');
      expect(saved.checkpointOutcome).toBeNull();
      expect(saved.checkpointOutcomeReceipt.id).toBe(head.checkpointOutcome.id);
    },
  );
}
it('retains a post-save debt in memory and retries local save without advancing another native unit', async () => {
  const f = await setup();
  let armed = false;
  const journal = {
      ...f.j,
      recordCheckpointOutcome: async (value) => {
        if (armed) {
          armed = false;
          throw Error('local offline');
        }
        return f.j.recordCheckpointOutcome(value);
      },
    },
    op = f.make(f.input, journal);
  await op.initialize();
  armed = true;
  await expect(op.advance()).rejects.toThrow('local offline');
  expect(op.snapshot().savePending).toBe(true);
  expect(f.calls).toHaveLength(1);
  await op.advance();
  expect(f.calls).toHaveLength(1);
  expect(op.snapshot().savePending).toBe(false);
  await op.advance();
  expect(f.calls).toHaveLength(2);
});
it('treats a lost local ACK observation as idempotent; does not recreate outcome or repeat RPC', async () => {
  const f = await setup();
  let armed = false;
  const journal = {
      ...f.j,
      writeCheckpoint: async (value) => {
        const saved = await f.j.writeCheckpoint(value);
        if (armed && value.confirmed.length) {
          armed = false;
          throw Error('observation lost');
        }
        return saved;
      },
    },
    op = f.make(f.input, journal);
  await op.initialize();
  armed = true;
  await expect(op.advance()).rejects.toThrow('observation lost');
  const receipt = (await f.j.inspect()).checkpointOutcomeReceipt;
  await op.advance();
  expect(f.calls).toHaveLength(1);
  expect((await f.j.inspect()).checkpointOutcomeReceipt).toEqual(receipt);
});
it('freezes input before awaiting storage and never claims a failed draft as saved', async () => {
  const f = await setup();
  f.allowed(false);
  const op = f.make();
  f.input.changes[0].value = 'changed after construction';
  await expect(op.initialize()).rejects.toThrow('key revoked');
  expect(op.snapshot()).toMatchObject({
    initialized: false,
    draftSaved: false,
    hasRecoveryCopy: false,
  });
  expect((await f.j.inspect()).controls.ready).toBe(true);
  f.allowed(true);
  await op.initialize();
  expect((await f.j.readDraft()).changes[0].value).toContain('OWN_PRIVATE');
  expect(f.calls).toHaveLength(0);
});
it('cancels independently while the first private key request remains unresolved', async () => {
  const f = await setup();
  let release, entered;
  const waiting = new Promise((r) => {
      entered = r;
    }),
    original = f.options.getKey;
  const j = await openBookLoreJournal(f.identity, {
      ...f.options,
      getKey: () => {
        entered();
        return new Promise((r) => {
          release = r;
        });
      },
    }),
    op = f.make(f.input, j),
    init = op.initialize();
  await waiting;
  const result = await op.cancel();
  expect(result.phase).toBe('cancelling');
  expect(f.calls).toHaveLength(1);
  expect(f.calls[0].method).toBe('cancelBookLoreFieldUpload');
  release(await original());
  await init;
  await closing(op);
  expect(op.snapshot().phase).toBe('cancelled');
});
it('cancels and reloads without key/decrypt after a producer reply is lost and source is revoked', async () => {
  const f = await setup();
  let op = f.make();
  f.intercept(async (m, _v, invoke) => {
    const result = await invoke();
    if (m === 'appendBookLoreFieldUpload') throw Error('lost append');
    return result;
  });
  await expect(ready(op)).rejects.toThrow('lost append');
  await f.revoke();
  const gets = f.gets();
  op = await f.open();
  await op.cancel();
  while (op.snapshot().phase !== 'cancelled') {
    op = await f.open();
    await op.advance();
  }
  expect(f.gets()).toBe(gets);
  expect((await f.j.inspect()).production.state).toBe('pending');
  expect(f.records.get('books/book').authorId).toBe('other');
});
it('does not ACK a late producer after cancellation; metadata worker fences and cleans it', async () => {
  const f = await setup();
  let release, entered;
  const waiting = new Promise((r) => {
    entered = r;
  });
  f.intercept(async (m, _v, invoke) => {
    const response = await invoke();
    if (m === 'startBookLoreSourceInspection') {
      entered();
      await new Promise((r) => {
        release = r;
      });
    }
    return response;
  });
  const op = f.make();
  await op.initialize();
  const sending = op.advance();
  await waiting;
  await op.cancel();
  expect(op.snapshot().phase).toBe('cancelling');
  release();
  await sending;
  expect((await f.j.inspect()).production.state).toBe('pending');
  await closing(op);
  expect(op.snapshot().phase).toBe('cancelled');
});
it('blocks production on signal abort but allows metadata cleanup', async () => {
  const controller = new AbortController(),
    f = await setup({ signal: controller.signal }),
    op = f.make();
  await op.initialize();
  controller.abort();
  await expect(op.advance()).rejects.toThrow();
  expect(f.calls).toHaveLength(0);
  await op.cancel();
  await closing(op);
  expect(op.snapshot().phase).toBe('cancelled');
});
it('rejects account changes before local writes/RPC and retains ciphertext for the original account', async () => {
  const f = await setup(),
    op = f.make();
  await op.initialize();
  const rows = structuredClone(h.rows());
  f.current(false);
  await expect(op.advance()).rejects.toThrow('actor changed');
  expect(() => op.cancel()).toThrow('actor changed');
  expect(h.rows()).toEqual(rows);
  expect(f.calls).toHaveLength(0);
});

it('recovers a changed upload page from the metadata bridge after post-save abort', async () => {
  const f = await setup({ big: true });
  let armed = false;
  const journal = {
      ...f.j,
      writeCheckpoint: async (bundle) => {
        if (armed && bundle.confirmed.length) {
          armed = false;
          h.abortAt(h.commits() + 2);
        }
        return f.j.writeCheckpoint(bundle);
      },
    },
    op = f.make(f.input, journal);
  await until(op, (s) => s.operation?.uploads.current?.progress?.phase === 'uploading');
  armed = true;
  await expect(op.advance()).rejects.toThrow();
  const head = await f.j.inspect();
  expect(head.checkpointOutcome.patch).not.toBeNull();
  const calls = f.calls.length,
    resumed = await f.open();
  await resumed.initialize();
  expect(f.calls).toHaveLength(calls);
  expect(resumed.snapshot().operation.uploads.current.progress.nextIndex).toBe(1);
  await ready(resumed);
});
for (const which of ['active', 'prefix']) {
  it(
    'preserves corrupt ' + which + ' checkpoint ciphertext instead of reporting saved/promoting',
    async () => {
      const f = await setup({ big: which === 'prefix' });
      let armed = false,
        bundle;
      const journal = {
          ...f.j,
          writeCheckpoint: async (b) => {
            if (armed && b.checkpoint.pending.production) {
              armed = false;
              bundle = b;
              h.abortAt(h.commits() + 3);
            }
            return f.j.writeCheckpoint(b);
          },
        },
        op = f.make(f.input, journal);
      await op.initialize();
      if (which === 'prefix') {
        await until(op, (s) => s.operation?.uploads.current?.progress?.phase === 'uploading');
        while ((await f.j.inspect()).checkpoint?.garbage) await f.j.advanceCheckpointCleanup();
        armed = true;
        await expect(op.advance()).rejects.toThrow();
      } else bundle = await f.j.readCheckpoint(true);
      const head = await f.j.inspect(),
        target = which === 'active' ? head.checkpoint.active : head.checkpoint.pending;
      expect(target.written).toBeGreaterThan(0);
      const row = h
        .rows()
        .find(
          (r) =>
            r.store === 'frames' &&
            r.k[2] === 'checkpoint' &&
            r.k[3] === target.generation &&
            r.k[4] === 0,
        );
      new Uint8Array(row.value.ciphertext)[0] ^= 1;
      const before = structuredClone(h.rows()),
        calls = f.calls.length;
      await expect(f.j.writeCheckpoint(bundle)).rejects.toThrow();
      expect(h.rows()).toEqual(before);
      expect(f.calls).toHaveLength(calls);
    },
  );
}
it('cancels a lost successful adoption without key and preserves the native winner', async () => {
  const f = await setup();
  let op = f.make();
  await ready(op);
  const clock = f.records.get('books/book').localLoreVersion;
  f.intercept(async (m, _v, invoke) => {
    const r = await invoke();
    if (m === 'adoptBookLoreEditGeneration') throw Error('lost adoption');
    return r;
  });
  await expect(op.apply()).rejects.toThrow('lost adoption');
  f.allowed(false);
  const gets = f.gets();
  op = await f.open();
  await op.cancel();
  await closing(op);
  expect(op.snapshot().phase).toBe('applied');
  expect(f.gets()).toBe(gets);
  expect(f.records.get('books/book').localLoreVersion).toBe(clock + 1);
  expect(f.calls.filter((c) => c.method === 'adoptBookLoreEditGeneration')).toHaveLength(1);
  expect(f.calls.some((c) => c.method === 'advanceBookLoreFieldCleanup')).toBe(false);
});
it('handles cancellation racing an in-flight successful adoption through metadata winner detection', async () => {
  const f = await setup(),
    op = f.make();
  await ready(op);
  let release, entered;
  const waiting = new Promise((r) => {
    entered = r;
  });
  f.intercept(async (m, _v, invoke) => {
    const response = await invoke();
    if (m === 'adoptBookLoreEditGeneration') {
      entered();
      await new Promise((r) => {
        release = r;
      });
    }
    return response;
  });
  const applying = op.apply();
  await waiting;
  await op.cancel();
  release();
  await applying;
  await closing(op);
  expect(op.snapshot().phase).toBe('applied');
  expect(f.calls.filter((c) => c.method === 'adoptBookLoreEditGeneration')).toHaveLength(1);
});
it('can reload between every production unit with multiple fields and retain explicit apply', async () => {
  const f = await setup({
    changes: [
      { field: 'summary', value: 'first' },
      { field: 'details', value: 'second' },
      { field: 'isPublic', value: false },
    ],
  });
  let op = f.make();
  await op.initialize();
  for (let n = 0; n < 150 && op.snapshot().phase !== 'ready'; n++) {
    await op.advance();
    const s = op.snapshot(),
      count = f.calls.length;
    op = await f.open();
    await op.initialize();
    expect(op.snapshot().operation).toEqual(s.operation);
    expect(f.calls).toHaveLength(count);
  }
  expect(op.snapshot().canApply).toBe(true);
  expect((await f.j.inspect()).controls.count).toBe(3);
  await op.apply();
  expect((await f.client.capture(f.bookId, f.entityId)).data.summary).toBe('first');
}, 30000);
it('preserves malformed native response as uncertain and does not create an outcome or ACK', async () => {
  const f = await setup(),
    op = f.make();
  await op.initialize();
  f.intercept(async (_m, _v, invoke) => ({ ...(await invoke()), prose: 'PRIVATE_LEAK' }));
  await expect(op.advance()).rejects.toThrow();
  const head = await f.j.inspect();
  expect(head.checkpointOutcome).toBeNull();
  expect(head.production.state).toBe('pending');
  f.intercept(null);
  await op.advance();
  expect(f.calls[1]).toEqual(f.calls[0]);
  expect((await f.j.inspect()).production.state).toBe('confirmed');
});
it('does not turn an existing recovery copy into proof a different supplied draft was saved', async () => {
  const f = await setup(),
    op = f.make();
  await op.initialize();
  const wrong = { ...f.input, changes: [{ field: 'summary', value: 'different draft' }] },
    other = f.make(wrong);
  await expect(other.initialize()).rejects.toThrow();
  expect(other.snapshot().draftSaved).toBe(false);
  expect(f.calls).toHaveLength(0);
});

for (const [name, mutate] of [
  [
    'wire prose',
    (o) => {
      o.checkpoint.pending.production = { method: 'secret', input: { text: 'PRIVATE' } };
    },
  ],
  [
    'extra root prose',
    (o) => {
      o.checkpoint.text = 'PRIVATE';
    },
  ],
  [
    'wrong account',
    (o) => {
      o.checkpoint.uid = 'other';
    },
  ],
  [
    'wrong base generation',
    (o) => {
      o.baseGeneration = 'different';
    },
  ],
  [
    'wrong ACK',
    (o) => {
      o.confirmed[0].requestHash = 'f'.repeat(64);
    },
  ],
  [
    'duplicate ACK',
    (o) => {
      o.confirmed.push({ ...o.confirmed[0] });
    },
  ],
]) {
  it('rejects invalid result bridge before modifying storage: ' + name, async () => {
    const f = await setup();
    let captured,
      armed = false;
    const journal = {
        ...f.j,
        recordCheckpointOutcome: async (o) => {
          if (armed) {
            captured = structuredClone(o);
            throw Error('captured');
          }
          return f.j.recordCheckpointOutcome(o);
        },
      },
      op = f.make(f.input, journal);
    await op.initialize();
    armed = true;
    await expect(op.advance()).rejects.toThrow('captured');
    const rows = structuredClone(h.rows());
    mutate(captured);
    await expect(f.j.recordCheckpointOutcome(captured)).rejects.toThrow();
    expect(h.rows()).toEqual(rows);
  });
}

it('verifies an already-committed copy before collecting its predecessor on an ACK-observation retry', async () => {
  const f = await setup();
  let armed = false;
  const journal = {
      ...f.j,
      writeCheckpoint: async (value) => {
        const head = await f.j.writeCheckpoint(value);
        if (armed && value.confirmed.length) {
          armed = false;
          throw Error('ACK observation lost');
        }
        return head;
      },
    },
    op = f.make(f.input, journal);
  await op.initialize();
  armed = true;
  await expect(op.advance()).rejects.toThrow('ACK observation lost');
  const head = await f.j.inspect();
  expect(head.checkpoint.garbage).not.toBeNull();
  const row = h
    .rows()
    .find(
      (r) =>
        r.store === 'frames' &&
        r.k[2] === 'checkpoint' &&
        r.k[3] === head.checkpoint.active.generation &&
        r.k[4] === 0,
    );
  new Uint8Array(row.value.ciphertext)[0] ^= 1;
  const before = structuredClone(h.rows());
  await expect(op.advance()).rejects.toThrow();
  expect(h.rows()).toEqual(before);
  expect(f.calls).toHaveLength(1);
});
