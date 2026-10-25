// @vitest-environment node
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { installLoreJournalHarness } from './bookLoreJournalHarness.mjs';
import { checkpointFixture, collectAll } from './bookLoreCreationCheckpointHarness.mjs';
import { finishPreparationClose } from './bookLoreCreationPreparationHarness.mjs';
import {
  captureCreationCheckpoint,
  makeCreationCheckpointOutcome,
  validateCreationCheckpoint,
} from '../services/bookLoreCreationCheckpointBundle.ts';
let h;
beforeEach(() => {
  h = installLoreJournalHarness();
});
afterEach(() => vi.unstubAllGlobals());
const frames = () =>
  h.rows().filter((r) => r.store === 'creationFrames' && r.k[2] === 'checkpoint');
it('stores a pure checkpoint without RPC and reopens the same private state', async () => {
  const f = await checkpointFixture(),
    bundle = captureCreationCheckpoint(f.op);
  await f.journal.write(bundle);
  expect(f.calls).toHaveLength(0);
  expect(await f.journal.read()).toEqual(bundle);
  const saved = await f.journal.inspect();
  expect(saved.checkpoint.active.complete).toBe(true);
  expect(saved.checkpoint.pending).toBeNull();
  const old = structuredClone(frames());
  await f.reopen();
  expect(captureCreationCheckpoint(f.op)).toEqual(bundle);
  expect(frames()).toEqual(old);
  expect(f.calls).toHaveLength(0);
});
it('confirms exact pending wire durably before its first native send', async () => {
  const f = await checkpointFixture();
  f.hook(async (method, input, invoke) => {
    const b = await f.journal.read();
    expect(b.checkpoint.pending.production).toEqual({ method, input });
    return invoke();
  });
  await f.step();
  expect(f.op.snapshot().completedCalls).toBe(1);
  expect((await f.journal.read()).checkpoint.pending.production).toBeNull();
  const metadata = JSON.stringify((await f.journal.inspect()).checkpoint);
  expect(metadata).not.toContain('Literal');
  expect(metadata).not.toContain('Private');
  expect(metadata).not.toContain('keyBase64');
});
it('recovers a validated native result from metadata without replaying its RPC', async () => {
  const f = await checkpointFixture();
  const after = await f.step(false, { persist: false }),
    outcome = makeCreationCheckpointOutcome(f.before, after, f.beforeGeneration);
  await f.journal.recordOutcome(outcome);
  const count = f.calls.length;
  await f.reopen();
  expect(f.calls).toHaveLength(count);
  expect(captureCreationCheckpoint(f.op)).toEqual(after);
  const state = (await f.journal.inspect()).checkpoint;
  expect(state.outcome).toBeNull();
  expect(state.receipt.id).toBe(outcome.id);
  expect(state.garbage).not.toBeNull();
});
it('keeps an accepted but unanswered native request exact across retake', async () => {
  const f = await checkpointFixture();
  let lost = true;
  f.hook(async (_m, _v, invoke) => {
    const raw = await invoke();
    if (lost) {
      lost = false;
      throw Error('lost native reply');
    }
    return raw;
  });
  await expect(f.step()).rejects.toThrow('lost native reply');
  const before = await f.journal.read();
  expect(before.checkpoint.pending.production).not.toBeNull();
  await f.reopen();
  expect(captureCreationCheckpoint(f.op)).toEqual(before);
  await f.step();
  expect(f.calls).toHaveLength(2);
  expect(f.calls[0]).toEqual(f.calls[1]);
  expect(f.op.snapshot().completedCalls).toBe(1);
});
it('rejects checkpoint, page or wire tampering without overwriting the active generation', async () => {
  const f = await checkpointFixture();
  await f.step();
  await collectAll(f.journal);
  const original = await f.journal.read(),
    before = structuredClone(frames());
  for (const mutate of [
    (b) => {
      b.checkpoint.uid = 'other';
    },
    (b) => {
      b.checkpoint.controlsHash = 'f'.repeat(64);
    },
    (b) => {
      b.pages[0].items[0].id = 'wrong';
    },
    (b) => {
      b.checkpoint.pending.production = {
        method: 'appendBookLoreFieldUpload',
        input: { bytes: 'PRIVATE' },
      };
    },
    (b) => {
      b.pages[0].items[0].privateText = 'PRIVATE';
    },
  ]) {
    const bad = structuredClone(original);
    mutate(bad);
    await expect(f.journal.write(bad)).rejects.toThrow();
  }
  expect(frames()).toEqual(before);
  expect(await f.journal.read()).toEqual(original);
});
it('does not treat the active header as an idempotence proof when ciphertext is corrupt', async () => {
  const f = await checkpointFixture(),
    bundle = captureCreationCheckpoint(f.op);
  await f.journal.write(bundle);
  const row = frames().find((r) => r.k[4] === 0);
  new Uint8Array(row.value.ciphertext)[0] ^= 1;
  const before = structuredClone(frames());
  await expect(f.journal.write(bundle)).rejects.toThrow();
  expect(frames()).toEqual(before);
});
it('keeps the predecessor until a verified successor swap commits and collects it in bounded batches', async () => {
  const f = await checkpointFixture();
  await f.step();
  const state = (await f.journal.inspect()).checkpoint;
  const old = state.garbage.blob.generation,
    active = state.active.generation,
    oldCount = frames().filter((r) => r.k[3] === old).length,
    draft = h.rows().filter((r) => r.store === 'creationFrames' && r.k[2] === 'draft');
  expect(oldCount).toBeGreaterThan(1);
  await f.journal.collect(1);
  expect(frames().filter((r) => r.k[3] === old)).toHaveLength(oldCount - 1);
  expect((await f.journal.inspect()).checkpoint.garbage.next).toBe(1);
  await collectAll(f.journal);
  expect(frames().filter((r) => r.k[3] === old)).toHaveLength(0);
  expect(frames().some((r) => r.k[3] === active)).toBe(true);
  expect(h.rows().filter((r) => r.store === 'creationFrames' && r.k[2] === 'draft')).toEqual(draft);
});
it('does not collect a predecessor if the successor no longer decrypts', async () => {
  const f = await checkpointFixture();
  await f.step();
  const c = (await f.journal.inspect()).checkpoint,
    row = frames().find((r) => r.k[3] === c.active.generation && r.k[4] === 0);
  new Uint8Array(row.value.ciphertext)[0] ^= 1;
  const before = structuredClone(h.rows());
  await expect(f.journal.collect()).rejects.toThrow();
  expect(h.rows()).toEqual(before);
});
it('rejects a metadata outcome containing prose, private wire or another base', async () => {
  const f = await checkpointFixture(),
    after = await f.step(false, { persist: false }),
    o = makeCreationCheckpointOutcome(f.before, after, f.beforeGeneration),
    before = structuredClone(h.rows());
  for (const mutate of [
    (v) => {
      v.privateText = 'Private';
    },
    (v) => {
      v.checkpoint.pending.production = {
        method: 'appendBookLoreFieldUpload',
        input: { text: 'Private' },
      };
    },
    (v) => {
      v.baseGeneration = 'other-generation';
    },
    (v) => {
      v.checkpoint.parent.name = 'Private';
    },
  ]) {
    const bad = structuredClone(o);
    mutate(bad);
    await expect(f.journal.recordOutcome(bad)).rejects.toThrow();
  }
  expect(h.rows()).toEqual(before);
});
it('never overwrites an already staged outcome with a different result', async () => {
  const f = await checkpointFixture(),
    after = await f.step(false, { persist: false }),
    o = makeCreationCheckpointOutcome(f.before, after, f.beforeGeneration);
  await f.journal.recordOutcome(o);
  const before = structuredClone(h.rows());
  await expect(f.journal.recordOutcome({ ...o, id: 'different-result' })).rejects.toThrow();
  expect(h.rows()).toEqual(before);
});
it('refuses other input while reconstructing a valid encrypted checkpoint', async () => {
  const f = await checkpointFixture(),
    b = captureCreationCheckpoint(f.op),
    t = await f.ticket();
  await expect(
    validateCreationCheckpoint(
      b,
      { ...f.input, data: { ...f.input.data, details: 'new input' } },
      t,
      { yieldControl: async () => {} },
    ),
  ).rejects.toThrow();
});
it('discards draft, active, pending and predecessor only after native jobs and key close', async () => {
  const f = await checkpointFixture();
  await f.step();
  const before = h.rows().filter((r) => r.store === 'creationFrames').length;
  const done = await finishPreparationClose(f.bootstrap, 'discard', 1);
  expect(done.copyDiscarded).toBe(true);
  expect(done.deleted).toBe(before);
  expect(h.rows().filter((r) => r.store === 'creationFrames')).toHaveLength(0);
  expect((await f.ticket()).checkpoint).toBeNull();
  await expect(f.journal.write(captureCreationCheckpoint(f.op))).rejects.toThrow();
});

it('recovers a fully sealed staging generation after the promotion transaction aborts', async () => {
  const f = await checkpointFixture(),
    bundle = captureCreationCheckpoint(f.op);
  let n = 0;
  f.keyHook(async (invoke) => {
    const raw = await invoke();
    if (++n === 3) h.abortNext();
    return raw;
  });
  await expect(f.journal.write(bundle)).rejects.toThrow('gravação');
  const c = (await f.ticket()).checkpoint;
  expect(c.active).toBeNull();
  expect(c.pending.written).toBe(c.pending.chunkCount);
  const before = structuredClone(frames());
  f.keyHook(null);
  await f.reopen();
  expect(captureCreationCheckpoint(f.op)).toEqual(bundle);
  expect(frames()).toEqual(before);
  expect((await f.ticket()).checkpoint.pending).toBeNull();
  expect(f.calls).toHaveLength(0);
});
it('keeps outcome after an aborted swap and acknowledges it atomically on a fresh instance', async () => {
  const f = await checkpointFixture(),
    after = await f.step(false, { persist: false }),
    outcome = makeCreationCheckpointOutcome(f.before, after, f.beforeGeneration);
  await f.journal.recordOutcome(outcome);
  let n = 0;
  // Existing active read: two grants; write + pending validation: three more.
  f.keyHook(async (invoke) => {
    const raw = await invoke();
    if (++n === 5) h.abortNext();
    return raw;
  });
  await expect(f.journal.write(after)).rejects.toThrow('gravação');
  const c = (await f.ticket()).checkpoint;
  expect(c.active.generation).toBe(f.beforeGeneration);
  expect(c.outcome.id).toBe(outcome.id);
  expect(c.receipt).toBeNull();
  expect(c.pending.written).toBe(c.pending.chunkCount);
  f.keyHook(null);
  await f.reopen();
  expect(captureCreationCheckpoint(f.op)).toEqual(after);
  const done = (await f.ticket()).checkpoint;
  expect(done.outcome).toBeNull();
  expect(done.receipt.id).toBe(outcome.id);
  expect(done.garbage.blob.generation).toBe(f.beforeGeneration);
});
it('records metadata without key access and preserves the bridge while private recovery is denied', async () => {
  const f = await checkpointFixture(),
    after = await f.step(false, { persist: false }),
    o = makeCreationCheckpointOutcome(f.before, after, f.beforeGeneration),
    keys = f.keys.length;
  f.allowed(false);
  await f.journal.recordOutcome(o);
  expect(f.keys).toHaveLength(keys);
  const before = structuredClone(h.rows());
  await expect(f.journal.recover()).rejects.toThrow('key denied');
  expect(h.rows()).toEqual(before);
  f.allowed(true);
  expect(await f.journal.recover()).toEqual(after);
});
it('refuses a valid but divergent partial generation without removing any of its frames', async () => {
  const f = await checkpointFixture(),
    initial = captureCreationCheckpoint(f.op);
  await f.journal.write(initial);
  await collectAll(f.journal);
  let n = 0;
  f.keyHook(async (invoke) => {
    const raw = await invoke();
    if (++n === 3) h.abortAt(h.commits() + 2);
    return raw;
  });
  await expect(f.step()).rejects.toThrow('gravação');
  const pending = (await f.ticket()).checkpoint.pending;
  expect(pending.written).toBe(0);
  const preserved = structuredClone(frames());
  await expect(f.journal.write(initial)).rejects.toThrow();
  expect(frames()).toEqual(preserved);
  expect(await f.journal.read()).toEqual(initial);
  expect(f.calls).toHaveLength(0);
});
it('keeps a partial large private wire, verifies its prefix and resumes without re-sending an earlier unit', async () => {
  const data = { name: 'x'.repeat(140000), category: 'other' },
    f = await checkpointFixture({ data });
  await f.step();
  await f.step();
  await collectAll(f.journal);
  const active = (await f.ticket()).checkpoint.active.generation,
    calls = f.calls.length;
  let n = 0;
  f.keyHook(async (invoke) => {
    const raw = await invoke();
    if (++n === 3) h.abortAt(h.commits() + 3);
    return raw;
  });
  await expect(f.step()).rejects.toThrow('gravação');
  const c = (await f.ticket()).checkpoint;
  expect(c.active.generation).toBe(active);
  expect(c.pending.written).toBe(1);
  expect(c.pending.chunkCount).toBeGreaterThan(1);
  expect(f.calls).toHaveLength(calls);
  const prefix = structuredClone(frames().filter((r) => r.k[3] === c.pending.generation));
  f.keyHook(null);
  await f.reopen();
  expect(f.op.snapshot().completedCalls).toBe(2);
  await f.step();
  expect(f.calls).toHaveLength(calls + 1);
  expect(f.calls.at(-1).method).toBe('appendBookLoreFieldUpload');
  for (const row of prefix)
    expect(frames().find((r) => JSON.stringify(r.k) === JSON.stringify(row.k))).toEqual(row);
});
it('preserves a corrupted pending prefix and active copy instead of replacing the generation', async () => {
  const f = await checkpointFixture({ data: { name: 'x'.repeat(140000), category: 'other' } });
  await f.step();
  await f.step();
  await collectAll(f.journal);
  let n = 0;
  f.keyHook(async (invoke) => {
    const raw = await invoke();
    if (++n === 3) h.abortAt(h.commits() + 3);
    return raw;
  });
  await expect(f.step()).rejects.toThrow();
  const c = (await f.ticket()).checkpoint,
    row = frames().find((r) => r.k[3] === c.pending.generation && r.k[4] === 0);
  new Uint8Array(row.value.ciphertext)[0] ^= 1;
  const before = structuredClone(frames());
  f.keyHook(null);
  await f.reopen();
  await expect(f.step()).rejects.toThrow();
  expect(frames()).toEqual(before);
  expect(f.calls).toHaveLength(2);
});
it('pages more than 50 upload controls and reconstructs their rolling hash', async () => {
  const data = {
      name: 'many',
      category: 'other',
      relations: Array.from({ length: 3265 }, (_, n) => ({
        targetEntityId: 'entity-' + n,
        relationType: 'knows',
      })),
    },
    f = await checkpointFixture({ data }),
    b = captureCreationCheckpoint(f.op);
  expect(b.pages).toHaveLength(2);
  expect(b.pages[0].items).toHaveLength(50);
  expect(b.pages[1].items.length).toBeGreaterThan(0);
  await f.journal.write(b);
  await f.reopen();
  expect(captureCreationCheckpoint(f.op)).toEqual(b);
}, 20000);
it('rolls back garbage deletes and cursor on abort', async () => {
  const f = await checkpointFixture();
  await f.step();
  const before = structuredClone(h.rows());
  h.abortNext();
  await expect(f.journal.collect(1)).rejects.toThrow('gravação');
  expect(h.rows()).toEqual(before);
  await f.journal.collect(1);
  expect((await f.ticket()).checkpoint.garbage.next).toBe(1);
});
it('refuses extra frames in a predecessor without losing the garbage pointer', async () => {
  const f = await checkpointFixture();
  await f.step();
  const g = (await f.ticket()).checkpoint.garbage;
  const row = structuredClone(frames().find((r) => r.k[3] === g.blob.generation)),
    k = [...row.k];
  k[4] = 999;
  h.stores.get('creationFrames').set(JSON.stringify(k), { k, value: row.value });
  const before = structuredClone(h.rows());
  await expect(f.journal.collect(50)).rejects.toThrow();
  expect(h.rows()).toEqual(before);
});

it('persists the complete native creation through ready and explicit apply, then reopens without another write', async () => {
  const f = await checkpointFixture();
  for (let n = 0; n < 1000 && f.op.snapshot().phase === 'preparing'; n++) await f.step();
  expect(f.op.snapshot().phase).toBe('ready');
  const id = f.op.snapshot().loreId;
  expect((await f.db.doc('books/book/lore/' + id).get()).exists).toBe(false);
  await f.step(true);
  expect(f.op.snapshot().phase).toBe('applied');
  const before = f.calls.length,
    version = (await f.db.doc('books/book').get()).data().localLoreVersion;
  await f.reopen();
  expect(f.op.snapshot().phase).toBe('applied');
  expect(f.calls).toHaveLength(before);
  expect((await f.db.doc('books/book').get()).data().localLoreVersion).toBe(version);
}, 20000);
it('keeps an uncertain apply explicit after reload and confirms the same adoption only once', async () => {
  const f = await checkpointFixture();
  for (let n = 0; n < 1000 && f.op.snapshot().phase === 'preparing'; n++) await f.step();
  let lost = true;
  f.hook(async (method, _input, invoke) => {
    const raw = await invoke();
    if (method === 'adoptBookLoreEditGeneration' && lost) {
      lost = false;
      throw Error('lost apply');
    }
    return raw;
  });
  await expect(f.step(true)).rejects.toThrow('lost apply');
  const first = f.calls.at(-1),
    version = (await f.db.doc('books/book').get()).data().localLoreVersion;
  await f.reopen();
  expect(f.op.snapshot().phase).toBe('ready');
  const count = f.calls.length;
  await f.op.advance();
  expect(f.calls).toHaveLength(count);
  await f.step(true);
  expect(f.op.snapshot().phase).toBe('applied');
  expect(f.calls.at(-1)).toEqual(first);
  expect((await f.db.doc('books/book').get()).data().localLoreVersion).toBe(version);
}, 20000);
it('blocks checkpoint writes after cancellation while preserving private authorized reading', async () => {
  const f = await checkpointFixture();
  await f.step();
  const b = await f.journal.read(),
    before = structuredClone(frames());
  await finishPreparationClose(f.bootstrap, 'cancel');
  expect(await f.journal.read()).toEqual(b);
  await expect(f.journal.write(b)).rejects.toThrow();
  await expect(f.journal.collect()).rejects.toThrow();
  expect(frames()).toEqual(before);
});
it('checks a fresh grant after decryption and does not return data on a late denial', async () => {
  const f = await checkpointFixture();
  await f.step();
  const before = structuredClone(h.rows());
  let n = 0;
  f.keyHook(async (invoke) => {
    if (++n === 2) throw Error('late grant denied');
    return invoke();
  });
  await expect(f.journal.read()).rejects.toThrow('late grant denied');
  expect(h.rows()).toEqual(before);
});
it('fences an old checkpoint writer after another instance retakes the preparation', async () => {
  const f = await checkpointFixture(),
    bundle = captureCreationCheckpoint(f.op);
  let release, started;
  const held = new Promise((r) => (release = r)),
    ready = new Promise((r) => (started = r));
  f.keyHook(async (invoke) => {
    const raw = await invoke();
    started();
    await held;
    return raw;
  });
  const old = f.journal,
    pending = old.write(bundle),
    rejected = expect(pending).rejects.toThrow();
  await ready;
  f.keyHook(null);
  const b = f.resume();
  await b.initialize();
  await b.checkpointJournal();
  release();
  await rejected;
  expect(frames()).toHaveLength(0);
});
it('does not resurrect staging after independent discard during AES-GCM', async () => {
  const f = await checkpointFixture(),
    bundle = captureCreationCheckpoint(f.op);
  let release, started;
  const held = new Promise((r) => (release = r)),
    ready = new Promise((r) => (started = r)),
    original = crypto.subtle.encrypt.bind(crypto.subtle),
    spy = vi.spyOn(crypto.subtle, 'encrypt').mockImplementation(async (...args) => {
      const bytes = await original(...args);
      started();
      await held;
      return bytes;
    });
  try {
    const pending = f.journal.write(bundle),
      rejected = expect(pending).rejects.toThrow();
    await ready;
    expect((await finishPreparationClose(f.bootstrap, 'discard')).copyDiscarded).toBe(true);
    release();
    await rejected;
    expect(frames()).toHaveLength(0);
  } finally {
    spy.mockRestore();
  }
});
it('never returns a checkpoint after its actor changes while a fresh key is pending', async () => {
  const f = await checkpointFixture();
  await f.step();
  const before = structuredClone(h.rows());
  let release, started;
  const held = new Promise((r) => (release = r)),
    ready = new Promise((r) => (started = r));
  f.keyHook(async (invoke) => {
    const raw = await invoke();
    started();
    await held;
    return raw;
  });
  const pending = f.journal.read(),
    rejected = expect(pending).rejects.toThrow('actor changed');
  await ready;
  f.current(false);
  release();
  await rejected;
  expect(h.rows()).toEqual(before);
});

it('observes a result bridge recorded while its active base is being decrypted', async () => {
  const f = await checkpointFixture(),
    after = await f.step(false, { persist: false }),
    o = makeCreationCheckpointOutcome(f.before, after, f.beforeGeneration);
  let once = true;
  f.keyHook(async (invoke) => {
    const raw = await invoke();
    if (once) {
      once = false;
      await f.journal.recordOutcome(o);
    }
    return raw;
  });
  expect(await f.journal.recover()).toEqual(after);
  expect((await f.ticket()).checkpoint.outcome).toBeNull();
});
