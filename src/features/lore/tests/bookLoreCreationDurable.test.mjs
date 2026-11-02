// @vitest-environment node
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { installLoreJournalHarness } from './bookLoreJournalHarness.mjs';
import {
  durableCreationFixture,
  durableCreationReady,
  durableCreationClose,
  deferred,
} from './bookLoreCreationDurableHarness.mjs';
import { prepareCreationRecovery } from '../services/bookLoreCreationPreparation.ts';
import { bookLoreWriteHash as hash } from '../services/bookLoreWritePayload.ts';
let h;
beforeEach(() => {
  h = installLoreJournalHarness();
});
afterEach(() => vi.unstubAllGlobals());
const frames = () => h.rows().filter((r) => r.store === 'creationFrames');
it('drives protected literal creation to ready without head and applies explicitly once', async () => {
  const f = await durableCreationFixture(),
    op = f.make(),
    ready = await durableCreationReady(op),
    id = ready.operation.loreId;
  expect(ready.canApply).toBe(true);
  expect(ready.hasRecoveryCopy).toBe(true);
  expect((await f.db.doc('books/book/lore/' + id).get()).exists).toBe(false);
  expect(JSON.stringify(h.rows().filter((r) => r.store === 'creationTickets'))).not.toContain(
    'Literal',
  );
  const s = await op.apply();
  expect(s.phase).toBe('applied');
  expect(s.jobsClosed).toBe(true);
  expect((await f.ticket()).jobsClosed).toBe(false);
  expect((await f.ticket()).ownApply.phase).toBe('confirmed');
  expect((await f.db.doc('books/book/lore/' + id).get()).exists).toBe(true);
  const count = f.calls.length,
    clock = (await f.db.doc('books/book').get()).data().localLoreVersion;
  expect((await op.apply()).phase).toBe('applied');
  expect(f.calls).toHaveLength(count);
  expect((await f.db.doc('books/book').get()).data().localLoreVersion).toBe(clock);
}, 20000);
it('reopens ready without sending another authorial unit and preserves the same draft', async () => {
  const f = await durableCreationFixture(),
    op = f.make();
  await durableCreationReady(op);
  const count = f.calls.length,
    resumed = f.resume(),
    s = await resumed.initialize();
  expect(s.phase).toBe('ready');
  expect(s.canApply).toBe(true);
  expect(f.calls).toHaveLength(count);
  expect(await resumed.readDraft()).toEqual(f.input);
  await expect(op.advance()).rejects.toThrow();
}, 20000);
it('releases and discards only the recovery after confirmed adoption, preserving the head and native clock', async () => {
  const f = await durableCreationFixture(),
    op = f.make();
  await durableCreationReady(op);
  const applied = await op.apply(),
    id = applied.operation.loreId,
    before = (await f.db.doc('books/book/lore/' + id).get()).data(),
    clock = (await f.db.doc('books/book').get()).data().localLoreVersion;
  const s = await durableCreationClose(op, 'release');
  expect(s.phase).toBe('applied');
  expect(s.keyReleased).toBe(true);
  expect(frames().length).toBeGreaterThan(0);
  await expect(op.readDraft()).rejects.toThrow();
  const done = await durableCreationClose(op, 'discard', 1);
  expect(done.phase).toBe('applied');
  expect(done.copyDiscarded).toBe(true);
  expect(frames()).toHaveLength(0);
  expect((await f.db.doc('books/book/lore/' + id).get()).data()).toEqual(before);
  expect((await f.db.doc('books/book').get()).data().localLoreVersion).toBe(clock);
  expect(f.calls.some((c) => c.method === 'cancelBookLoreCreationReservation')).toBe(false);
  const reopened = await f.resume().initialize();
  expect(reopened.phase).toBe('applied');
  expect(reopened.copyDiscarded).toBe(true);
}, 20000);
it('reconciles a lost apply by native metadata after reload, without replay or decrypt permission', async () => {
  const f = await durableCreationFixture(),
    op = f.make();
  await durableCreationReady(op);
  let lost = true;
  f.editHook(async (method, _input, invoke) => {
    const raw = await invoke();
    if (method === 'adoptBookLoreEditGeneration' && lost) {
      lost = false;
      throw Error('lost apply');
    }
    return raw;
  });
  await expect(op.apply()).rejects.toThrow('lost apply');
  const own = (await f.ticket()).ownApply;
  expect(own.phase).toBe('pending');
  const count = f.calls.filter((c) => c.method === 'adoptBookLoreEditGeneration').length,
    keys = f.keys.length;
  f.allowed(false);
  const resumed = f.resume(),
    s = await resumed.initialize();
  expect(s.phase).toBe('applied');
  expect(f.keys).toHaveLength(keys);
  expect(f.calls.filter((c) => c.method === 'adoptBookLoreEditGeneration')).toHaveLength(count);
  expect((await durableCreationClose(resumed, 'discard')).copyDiscarded).toBe(true);
}, 20000);
it('keeps a rejected unsent apply explicit after reload; advance never sends it', async () => {
  const f = await durableCreationFixture(),
    op = f.make();
  await durableCreationReady(op);
  let failed = true;
  f.editHook(async (method, _input, invoke) => {
    if (method === 'adoptBookLoreEditGeneration' && failed) {
      failed = false;
      throw Error('offline before send');
    }
    return invoke();
  });
  await expect(op.apply()).rejects.toThrow('offline before send');
  const resumed = f.resume(),
    s = await resumed.initialize();
  expect(s.phase).toBe('ready');
  const count = f.calls.filter((c) => c.method === 'adoptBookLoreEditGeneration').length;
  expect((await resumed.advance()).phase).toBe('ready');
  expect(f.calls.filter((c) => c.method === 'adoptBookLoreEditGeneration')).toHaveLength(count);
  expect((await resumed.apply()).phase).toBe('applied');
}, 20000);
it('cancels independently while native upload response is held, without waiting or losing the protected draft', async () => {
  const f = await durableCreationFixture(),
    op = f.make();
  await op.initialize();
  await op.advance();
  await op.advance();
  const started = deferred(),
    held = deferred();
  f.editHook(async (method, _input, invoke) => {
    const raw = await invoke();
    if (method === 'appendBookLoreFieldUpload') {
      started.resolve();
      await held.promise;
    }
    return raw;
  });
  const pending = op.advance();
  await started.promise;
  const keys = f.keys.length,
    s = await durableCreationClose(op);
  expect(s.phase).toBe('cancelled');
  expect(s.keyReleased).toBe(false);
  expect(f.keys).toHaveLength(keys);
  held.resolve();
  await pending;
  expect(op.snapshot().phase).toBe('cancelled');
  expect(await op.readDraft()).toEqual(f.input);
});
it('confirms native adoption while its response is held, then discards recovery before releasing the response', async () => {
  const f = await durableCreationFixture(),
    op = f.make();
  await durableCreationReady(op);
  const started = deferred(),
    held = deferred();
  f.editHook(async (method, _input, invoke) => {
    const raw = await invoke();
    if (method === 'adoptBookLoreEditGeneration') {
      started.resolve();
      await held.promise;
    }
    return raw;
  });
  const pending = op.apply();
  await started.promise;
  const id = (await f.ticket()).loreId,
    keys = f.keys.length;
  f.allowed(false);
  const s = await durableCreationClose(op, 'discard', 1);
  expect(s.phase).toBe('applied');
  expect(s.copyDiscarded).toBe(true);
  expect(f.keys).toHaveLength(keys);
  expect(frames()).toHaveLength(0);
  held.resolve();
  await pending;
  expect(op.snapshot().phase).toBe('applied');
  expect(frames()).toHaveLength(0);
  expect((await f.db.doc('books/book/lore/' + id).get()).exists).toBe(true);
}, 20000);
it('cancels before initialization without reserving key or producing body', async () => {
  const f = await durableCreationFixture(),
    op = f.make();
  expect((await durableCreationClose(op, 'discard')).copyDiscarded).toBe(true);
  expect(f.calls.map((c) => c.method)).toEqual(['cancelBookLoreCreationReservation']);
  expect(f.keys).toHaveLength(0);
});

it('flushes an accepted result after local ACK abort without sending the next unit or replaying the native call', async () => {
  const f = await durableCreationFixture(),
    op = f.make();
  await op.initialize();
  await op.advance();
  await op.advance();
  let first = true;
  f.editHook(async (method, _input, invoke) => {
    const raw = await invoke();
    if (method === 'appendBookLoreFieldUpload' && first) {
      first = false;
      h.abortNext();
    }
    return raw;
  });
  await expect(op.advance()).rejects.toThrow('gravação');
  expect(op.snapshot().savePending).toBe(true);
  const count = f.calls.length,
    completed = op.snapshot().operation.completedCalls;
  const s = await op.advance();
  expect(f.calls).toHaveLength(count);
  expect(s.savePending).toBe(false);
  expect(s.operation.completedCalls).toBe(completed);
});
it('restores the persisted result bridge after fresh key denial, without replaying the upload', async () => {
  const f = await durableCreationFixture(),
    op = f.make();
  await op.initialize();
  await op.advance();
  await op.advance();
  let first = true;
  f.editHook(async (method, _input, invoke) => {
    const raw = await invoke();
    if (method === 'appendBookLoreFieldUpload' && first) {
      first = false;
      f.allowed(false);
    }
    return raw;
  });
  await expect(op.advance()).rejects.toThrow('key denied');
  expect((await f.ticket()).checkpoint.outcome).not.toBeNull();
  const count = f.calls.filter((c) => c.method === 'appendBookLoreFieldUpload').length;
  f.allowed(true);
  const resumed = f.resume(),
    s = await resumed.initialize();
  expect(s.operation.completedCalls).toBe(3);
  expect(s.savePending).toBe(false);
  expect(f.calls.filter((c) => c.method === 'appendBookLoreFieldUpload')).toHaveLength(count);
});
it('never sends an upload until an interrupted private checkpoint is fully confirmed', async () => {
  const f = await durableCreationFixture({ data: { name: 'x'.repeat(140000), category: 'other' } }),
    op = f.make();
  await op.initialize();
  await op.advance();
  await op.advance();
  const original = crypto.subtle.encrypt.bind(crypto.subtle);
  let count = 0;
  const spy = vi.spyOn(crypto.subtle, 'encrypt').mockImplementation(async (...args) => {
    const raw = await original(...args);
    if (++count === 2) h.abortNext();
    return raw;
  });
  try {
    await expect(op.advance()).rejects.toThrow('gravação');
  } finally {
    spy.mockRestore();
  }
  expect(f.calls.some((c) => c.method === 'appendBookLoreFieldUpload')).toBe(false);
  expect((await f.ticket()).checkpoint.pending.written).toBe(0);
  const resumed = f.resume(),
    s = await resumed.initialize();
  expect(s.savePending).toBe(true);
  await resumed.advance();
  expect(f.calls.filter((c) => c.method === 'appendBookLoreFieldUpload')).toHaveLength(1);
});
it('reports awaiting input after the initial key reservation reply is lost, preserving metadata cancellation', async () => {
  const f = await durableCreationFixture();
  let first = true;
  f.recoveryHook(async (method, _input, invoke) => {
    const raw = await invoke();
    if (method.startsWith('reserve') && first) {
      first = false;
      throw Error('lost key reservation');
    }
    return raw;
  });
  await expect(f.make().initialize()).rejects.toThrow('lost key reservation');
  const resumed = f.resume(),
    s = await resumed.initialize();
  expect(s.phase).toBe('awaiting-draft');
  expect(s.requiresInput).toBe(true);
  expect(s.hasRecoveryCopy).toBe(false);
  await expect(resumed.advance()).rejects.toThrow('rascunho original');
  expect((await durableCreationClose(resumed, 'discard')).copyDiscarded).toBe(true);
  expect(f.keys).toHaveLength(0);
});
it('confirms and releases an already adopted result after origin access is revoked', async () => {
  const f = await durableCreationFixture(),
    op = f.make();
  await durableCreationReady(op);
  await op.apply();
  await f.revokeOrigin();
  f.allowed(false);
  const keys = f.keys.length,
    resumed = f.resume(),
    s = await resumed.initialize();
  expect(s.phase).toBe('applied');
  expect(f.keys).toHaveLength(keys);
  expect((await durableCreationClose(resumed, 'discard')).copyDiscarded).toBe(true);
  expect(f.keys).toHaveLength(keys);
}, 20000);
it('preserves the adopted head and copy on a mismatched generation even if editId and operationId match', async () => {
  const f = await durableCreationFixture(),
    op = f.make();
  await durableCreationReady(op);
  f.editHook(async (method, _input, invoke) => {
    const raw = await invoke();
    if (method === 'getBookLoreCreationReservation' && raw?.phase === 'adopted')
      return { ...raw, adoption: { ...raw.adoption, generationId: 'f'.repeat(64) } };
    return raw;
  });
  const s = await op.apply();
  expect(s.phase).toBe('conflict');
  expect(s.jobsClosed).toBe(false);
  const before = structuredClone(frames()),
    id = (await f.ticket()).loreId;
  expect((await durableCreationClose(op, 'discard')).phase).toBe('conflict');
  expect(frames()).toEqual(before);
  expect(f.calls.some((c) => c.method === 'revokeBookLoreEditRecovery')).toBe(false);
  expect((await f.db.doc('books/book/lore/' + id).get()).exists).toBe(true);
}, 20000);
it('blocks another production action while a request is in flight but permits cancellation', async () => {
  const f = await durableCreationFixture(),
    op = f.make();
  await op.initialize();
  const started = deferred(),
    held = deferred();
  f.editHook(async (_m, _input, invoke) => {
    const raw = await invoke();
    started.resolve();
    await held.promise;
    return raw;
  });
  const pending = op.advance();
  await started.promise;
  await expect(op.advance()).rejects.toThrow('andamento');
  await expect(op.apply()).rejects.toThrow('andamento');
  f.editHook(null);
  expect((await durableCreationClose(op)).phase).toBe('cancelled');
  held.resolve();
  await pending;
});

it('keeps cancellation available after signal abort', async () => {
  const controller = new AbortController(),
    f = await durableCreationFixture({ signal: controller.signal }),
    op = f.make();
  await op.initialize();
  await op.advance();
  controller.abort();
  await expect(op.advance()).rejects.toThrow();
  expect((await durableCreationClose(op, 'discard')).copyDiscarded).toBe(true);
});
it('drops a late producer after ownership is retaken, and lets the new owner replay only the original request', async () => {
  const f = await durableCreationFixture(),
    op = f.make();
  await op.initialize();
  const held = deferred(),
    started = deferred();
  f.editHook(async (_method, _input, invoke) => {
    const raw = await invoke();
    started.resolve();
    await held.promise;
    return raw;
  });
  const pending = op.advance(),
    rejected = expect(pending).rejects.toThrow();
  await started.promise;
  f.editHook(null);
  const resumed = f.resume();
  await resumed.initialize();
  held.resolve();
  await rejected;
  const before = f.calls.length;
  await resumed.advance();
  expect(f.calls).toHaveLength(before + 1);
  expect(f.calls.at(-1).input).toEqual(f.calls[before - 1].input);
  await expect(op.readDraft()).rejects.toThrow();
});
it('rejects a malformed edit confirmation without releasing the key, then resumes the same native proof', async () => {
  const f = await durableCreationFixture(),
    op = f.make();
  await durableCreationReady(op);
  let first = true;
  f.editHook(async (method, _input, invoke) => {
    const raw = await invoke();
    if (method === 'getBookLoreEditReservation' && first) {
      first = false;
      return { ...raw, startHash: 'f'.repeat(64) };
    }
    return raw;
  });
  await expect(op.apply()).rejects.toThrow();
  expect((await f.ticket()).ownApply.phase).toBe('pending');
  expect((await f.ticket()).ownApply.request).toBe('edit');
  expect(f.calls.some((c) => c.method === 'revokeBookLoreEditRecovery')).toBe(false);
  expect((await op.advance()).phase).toBe('applied');
}, 20000);
it('replays a lost parent confirmation exactly, without applying again', async () => {
  const f = await durableCreationFixture(),
    op = f.make();
  await durableCreationReady(op);
  let first = true;
  f.editHook(async (method, _input, invoke) => {
    const raw = await invoke();
    if (method === 'getBookLoreCreationReservation' && first) {
      first = false;
      throw Error('lost parent query');
    }
    return raw;
  });
  await expect(op.apply()).rejects.toThrow('lost parent query');
  const firstCall = f.calls.at(-1),
    count = f.calls.filter((c) => c.method === 'adoptBookLoreEditGeneration').length;
  expect((await op.advance()).phase).toBe('applied');
  expect(f.calls.filter((c) => c.method === 'adoptBookLoreEditGeneration')).toHaveLength(count);
  const reads = f.calls.filter((c) => c.method === 'getBookLoreCreationReservation');
  expect(reads.at(-1).input).toEqual(firstCall.input);
}, 20000);

it('refuses an adoption intent unless the exact apply wire is already in the protected active checkpoint', async () => {
  const f = await durableCreationFixture(),
    op = f.make(),
    ready = await durableCreationReady(op),
    e = ready.operation.edit,
    wire = {
      method: 'adoptBookLoreEditGeneration',
      input: {
        editId: e.id,
        startHash: e.startHash,
        jobToken: e.jobToken,
        expectedRevision: e.revision,
        operationId: hash({
          domain: 'writer-book-lore-client-unit',
          uid: 'author',
          writeId: f.input.writeId,
          bookId: 'book',
          loreId: ready.operation.loreId,
          method: 'adoptBookLoreEditGeneration',
          id: e.id,
          revision: e.revision,
        }),
      },
    };
  const b = prepareCreationRecovery(f.input.writeId, f.environment);
  await b.initialize();
  await expect(b.stageApply(wire)).rejects.toThrow();
  expect((await f.ticket()).ownApply).toBeUndefined();
  expect(f.calls.some((c) => c.method === 'adoptBookLoreEditGeneration')).toBe(false);
}, 20000);
it('captures input and guards before waiting, without trusting later caller mutations', async () => {
  let current = true;
  const f = await durableCreationFixture(),
    original = structuredClone(f.input),
    options = {
      guard: () => {
        if (!current) throw Error('host changed');
      },
    },
    op = f.make(f.input, options);
  f.input.data.details = 'later replacement';
  options.guard = () => {};
  await op.initialize();
  expect(await op.readDraft()).toEqual(original);
  current = false;
  expect(() => op.snapshot()).toThrow('host changed');
  await expect(op.advance()).rejects.toThrow('host changed');
  await expect(op.readDraft()).rejects.toThrow('host changed');
});

it('confirms a lost apply on the same handle through advance without key access and disables apply after proof', async () => {
  const f = await durableCreationFixture(),
    op = f.make();
  await durableCreationReady(op);
  let first = true;
  f.editHook(async (method, _input, invoke) => {
    const raw = await invoke();
    if (method === 'adoptBookLoreEditGeneration' && first) {
      first = false;
      throw Error('lost hot apply');
    }
    return raw;
  });
  await expect(op.apply()).rejects.toThrow('lost hot apply');
  const count = f.calls.filter((c) => c.method === 'adoptBookLoreEditGeneration').length,
    keys = f.keys.length;
  f.allowed(false);
  const s = await op.advance();
  expect(s.phase).toBe('applied');
  expect(s.canApply).toBe(false);
  expect(f.keys).toHaveLength(keys);
  expect(f.calls.filter((c) => c.method === 'adoptBookLoreEditGeneration')).toHaveLength(count);
}, 20000);
