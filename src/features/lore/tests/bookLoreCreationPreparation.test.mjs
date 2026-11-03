// @vitest-environment node
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { installLoreJournalHarness } from './bookLoreJournalHarness.mjs';
import {
  preparationFixture,
  finishPreparationClose,
} from './bookLoreCreationPreparationHarness.mjs';
import { creationData, creationReady } from './bookLoreCreationHarness.mjs';
import { prepareBookLoreCreationOperation } from '../services/bookLoreCreationOperation.ts';
import { getCreationTicket, listCreationTickets } from '../services/bookLoreCreationTicketDb.ts';
import { prepareCreationRecovery } from '../services/bookLoreCreationPreparation.ts';
let h;
beforeEach(() => {
  h = installLoreJournalHarness();
});
afterEach(() => vi.unstubAllGlobals());
const frames = () => h.rows().filter((r) => r.store === 'creationFrames');
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
it('persists scope before RPCs, encrypts exact input, and reopens without reproducing or applying', async () => {
  const f = await preparationFixture(),
    op = f.make();
  expect(f.calls).toHaveLength(0);
  expect(op.snapshot().phase).toBe('opening');
  const s = await op.initialize();
  expect(s.phase).toBe('copy-ready');
  expect(s.hasRecoveryCopy).toBe(true);
  expect(f.calls.map((c) => c.method)).toEqual([
    'startBookLoreCreationReservation',
    'reserveBookLoreEditRecovery',
  ]);
  expect(f.keys.length).toBeGreaterThanOrEqual(2);
  const serialized = JSON.stringify(h.rows());
  expect(serialized).not.toContain('Literal');
  expect(serialized).not.toContain('Private');
  expect(serialized).not.toContain('keyBase64');
  expect(serialized).not.toContain('contentHash');
  expect(serialized).not.toContain('AES-GCM');
  expect(frames().length).toBeGreaterThan(1);
  expect((await listCreationTickets('author')).items.map((t) => t.writeId)).toEqual([
    f.input.writeId,
  ]);
  expect((await listCreationTickets('other')).items).toEqual([]);
  const before = f.calls.length,
    resumed = f.resume();
  expect((await resumed.initialize()).phase).toBe('copy-ready');
  expect(await resumed.readDraft()).toEqual(f.input);
  expect(f.calls).toHaveLength(before);
  expect('advance' in resumed).toBe(false);
  expect('apply' in resumed).toBe(false);
  expect((await f.db.doc('books/book/lore/' + (await f.ticket()).loreId).get()).exists).toBe(false);
});
it('freezes caller input and options synchronously before preparation', async () => {
  const f = await preparationFixture(),
    original = structuredClone(f.input),
    options = { yieldControl: async () => {} },
    op = f.make(f.input, options);
  f.input.data.details = 'later replacement';
  options.guard = () => {
    throw Error('mutated guard');
  };
  await op.initialize();
  expect(await op.readDraft()).toEqual(original);
});
it.each(['startBookLoreCreationReservation', 'reserveBookLoreEditRecovery'])(
  'retries exact %s after accepted response is lost',
  async (method) => {
    const f = await preparationFixture();
    let lost = true;
    const hook = async (m, _v, invoke) => {
      const raw = await invoke();
      if (m === method && lost) {
        lost = false;
        throw Error('lost response');
      }
      return raw;
    };
    f.editHook(hook);
    f.recoveryHook(hook);
    await expect(f.make().initialize()).rejects.toThrow('lost response');
    const t = await f.ticket();
    expect(t.draft).toBeNull();
    expect(method.startsWith('start') ? t.startState : t.keyState).toBe('pending');
    const resumed = f.resume(),
      status = await resumed.initialize();
    expect(status.phase).toBe('awaiting-draft');
    expect(status.requiresInput).toBe(true);
    expect(frames()).toHaveLength(0);
    expect(f.calls.filter((c) => c.method === method)).toHaveLength(2);
    const [a, b] = f.calls.filter((c) => c.method === method);
    expect(a.input).toEqual(b.input);
    const original = f.make();
    await original.initialize();
    expect(await original.readDraft()).toEqual(f.input);
  },
);
it('cancel preserves the protected copy and fresh authorized reading', async () => {
  const f = await preparationFixture(),
    op = f.make();
  await op.initialize();
  const before = structuredClone(frames());
  const s = await finishPreparationClose(op, 'cancel');
  expect(s.keyReleased).toBe(false);
  expect(frames()).toEqual(before);
  expect(f.calls.some((c) => c.method === 'revokeBookLoreEditRecovery')).toBe(false);
  const resumed = f.resume();
  expect((await resumed.initialize()).phase).toBe('cancelled');
  expect(await resumed.readDraft()).toEqual(f.input);
});
it('releases the own native key only after jobs close and purges explicitly in bounded transactions', async () => {
  const data = creationData();
  data.details += '🌙'.repeat(100000);
  const f = await preparationFixture({ data }),
    op = f.make();
  await op.initialize();
  const size = frames().length;
  expect(size).toBeGreaterThan(4);
  const s = await finishPreparationClose(op, 'release');
  expect(s.hasRecoveryCopy).toBe(true);
  expect(frames()).toHaveLength(size);
  await expect(op.readDraft()).rejects.toThrow();
  const first = await op.discard(1);
  expect(first.deleted).toBe(1);
  expect(first.copyDiscarded).toBe(false);
  expect(frames()).toHaveLength(size - 1);
  const resumed = f.resume(),
    done = await finishPreparationClose(resumed, 'discard', 1);
  expect(done.deleted).toBe(size);
  expect(done.copyDiscarded).toBe(true);
  expect(frames()).toHaveLength(0);
  const tombstone = await f.ticket();
  expect(tombstone.discard.phase).toBe('complete');
  expect((await f.resume().initialize()).copyDiscarded).toBe(true);
  expect((await f.make().initialize()).copyDiscarded).toBe(true);
  expect(frames()).toHaveLength(0);
});
it('cancels before initialization without reserving a key or transmitting authored data', async () => {
  const f = await preparationFixture(),
    op = f.make();
  await finishPreparationClose(op, 'discard');
  expect(f.calls.map((c) => c.method)).toEqual(['cancelBookLoreCreationReservation']);
  expect(f.keys).toHaveLength(0);
  expect(frames()).toHaveLength(0);
  expect((await op.initialize()).copyDiscarded).toBe(true);
});
it('does not serialize cancel behind an accepted but unanswered start', async () => {
  const f = await preparationFixture(),
    held = deferred(),
    started = deferred(),
    op = f.make();
  f.editHook(async (m, _v, invoke) => {
    const raw = await invoke();
    if (m.startsWith('start')) {
      started.resolve();
      await held.promise;
    }
    return raw;
  });
  const pending = op.initialize();
  await started.promise;
  const s = await finishPreparationClose(op, 'discard');
  expect(s.copyDiscarded).toBe(true);
  held.resolve();
  expect((await pending).copyDiscarded).toBe(true);
  expect(frames()).toHaveLength(0);
  expect((await f.ticket()).parent.phase).toBe('cancelled');
});
it('fences a late reserved key response after independent cancellation and release', async () => {
  const f = await preparationFixture(),
    held = deferred(),
    started = deferred(),
    op = f.make();
  f.recoveryHook(async (m, _v, invoke) => {
    const raw = await invoke();
    if (m.startsWith('reserve')) {
      started.resolve();
      await held.promise;
    }
    return raw;
  });
  const pending = op.initialize();
  await started.promise;
  expect((await f.ticket()).keyState).toBe('pending');
  const done = await finishPreparationClose(op, 'discard');
  expect(done.copyDiscarded).toBe(true);
  held.resolve();
  await pending;
  expect((await f.ticket()).keyView.phase).toBe('revoked');
  expect(frames()).toHaveLength(0);
});
it('fences encryption after key delivery is delayed and the same operation is discarded', async () => {
  const f = await preparationFixture(),
    held = deferred(),
    started = deferred(),
    op = f.make();
  f.keyHook(async (invoke) => {
    const raw = await invoke();
    started.resolve();
    await held.promise;
    return raw;
  });
  const pending = op.initialize(),
    rejected = expect(pending).rejects.toThrow();
  await started.promise;
  expect((await finishPreparationClose(op, 'discard')).copyDiscarded).toBe(true);
  held.resolve();
  await rejected;
  expect(frames()).toHaveLength(0);
});
it('retakes ownership without letting the old instance write or read', async () => {
  const f = await preparationFixture(),
    old = f.make();
  await old.initialize();
  const resumed = f.resume();
  await resumed.initialize();
  const before = structuredClone(h.rows());
  await expect(old.readDraft()).rejects.toThrow();
  await expect(old.discard()).rejects.toThrow();
  expect(h.rows()).toEqual(before);
  expect(await resumed.readDraft()).toEqual(f.input);
});
it('requires fresh key grants at both ends and preserves encrypted data on origin loss', async () => {
  const f = await preparationFixture(),
    op = f.make();
  await op.initialize();
  const before = structuredClone(h.rows()),
    keys = f.keys.length;
  f.allowed(false);
  await expect(op.readDraft()).rejects.toThrow('key denied');
  expect(f.keys).toHaveLength(keys + 1);
  expect(h.rows()).toEqual(before);
  f.allowed(true);
  let n = 0;
  f.keyHook(async (invoke) => {
    if (++n === 2) throw Error('end denied');
    return invoke();
  });
  await expect(op.readDraft()).rejects.toThrow('end denied');
  expect(h.rows()).toEqual(before);
  f.keyHook(null);
  await f.revokeOrigin();
  await expect(op.readDraft()).rejects.toThrow();
  expect(h.rows()).toEqual(before);
});
it('rejects other UID, changed actor, wrong scope and new content under the same immutable ticket', async () => {
  const f = await preparationFixture(),
    op = f.make();
  await op.initialize();
  const before = structuredClone(frames());
  const other = prepareCreationRecovery(f.input.writeId, { ...f.environment, uid: 'other' });
  await expect(other.initialize()).rejects.toThrow('não foi encontrada');
  f.current(false);
  expect(() => op.snapshot()).toThrow('actor changed');
  await expect(op.readDraft()).rejects.toThrow('actor changed');
  f.current(true);
  await expect(f.make({ ...f.input, bookId: 'other-book' }).initialize()).rejects.toThrow();
  await expect(
    f.make({ ...f.input, data: { ...f.input.data, details: 'replacement' } }).initialize(),
  ).rejects.toThrow();
  expect(frames()).toEqual(before);
});
it('rejects corrupted or swapped ciphertext without overwriting or returning plaintext', async () => {
  const f = await preparationFixture(),
    op = f.make();
  await op.initialize();
  const rows = frames(),
    body = rows.find((r) => r.k[4] === 0);
  new Uint8Array(body.value.ciphertext)[0] ^= 1;
  const before = structuredClone(h.rows());
  await expect(op.readDraft()).rejects.toThrow();
  expect(h.rows()).toEqual(before);
});
it('retries exact native revocation after a lost response and finishes metadata-only cleanup', async () => {
  const f = await preparationFixture(),
    op = f.make();
  await op.initialize();
  await finishPreparationClose(op, 'cancel');
  let first = true;
  f.recoveryHook(async (m, _v, invoke) => {
    const raw = await invoke();
    if (m.startsWith('revoke') && first) {
      first = false;
      throw Error('lost revoke');
    }
    return raw;
  });
  await expect(op.release()).rejects.toThrow('lost revoke');
  expect((await f.ticket()).revoke.state).toBe('pending');
  const resumed = f.resume();
  expect((await finishPreparationClose(resumed, 'release')).keyReleased).toBe(true);
  const wires = f.calls.filter((c) => c.method.startsWith('revoke'));
  expect(wires).toHaveLength(2);
  expect(wires[0].input).toEqual(wires[1].input);
});

it('never confirms a copy before its IndexedDB transaction completes', async () => {
  const f = await preparationFixture(),
    op = f.make();
  f.keyHook(async (invoke) => {
    const raw = await invoke();
    h.hold();
    return raw;
  });
  let done = false;
  const pending = op.initialize().then((s) => {
    done = true;
    return s;
  });
  await vi.waitFor(() => expect(h.held()).toBe(1));
  expect(done).toBe(false);
  expect(op.snapshot().hasRecoveryCopy).toBe(false);
  expect(frames()).toHaveLength(0);
  f.keyHook(null);
  h.release();
  expect((await pending).hasRecoveryCopy).toBe(true);
});
it.each(['birth', 'part'])(
  'preserves the ticket after an aborted %s transaction and resumes from the verified prefix',
  async (failure) => {
    const data = creationData();
    data.details += '🌙'.repeat(80000);
    const f = await preparationFixture({ data }),
      op = f.make();
    let first = true;
    f.keyHook(async (invoke) => {
      const raw = await invoke();
      if (first) {
        first = false;
        h.abortAt(h.commits() + (failure === 'birth' ? 1 : 3));
      }
      return raw;
    });
    await expect(op.initialize()).rejects.toThrow('gravação');
    const t = await f.ticket(),
      before = structuredClone(frames());
    expect(t.keyState).toBe('confirmed');
    expect(t.draft?.complete ?? false).toBe(false);
    expect(before).toHaveLength(failure === 'birth' ? 0 : 2);
    f.keyHook(null);
    const noInput = f.resume();
    expect((await noInput.initialize()).phase).toBe('awaiting-draft');
    await expect(noInput.readDraft()).rejects.toThrow('primeira cópia');
    expect(frames()).toEqual(before);
    const resumed = f.make();
    expect((await resumed.initialize()).phase).toBe('copy-ready');
    expect(await resumed.readDraft()).toEqual(f.input);
    for (const row of before)
      expect(frames().find((r) => JSON.stringify(r.k) === JSON.stringify(row.k))).toEqual(row);
  },
);
it('refuses a corrupt persisted prefix before writing any later part', async () => {
  const data = creationData();
  data.details += '🌙'.repeat(80000);
  const f = await preparationFixture({ data });
  let first = true;
  f.keyHook(async (invoke) => {
    const raw = await invoke();
    if (first) {
      first = false;
      h.abortAt(h.commits() + 3);
    }
    return raw;
  });
  await expect(f.make().initialize()).rejects.toThrow();
  const body = frames().find((r) => r.k[4] === 0);
  new Uint8Array(body.value.ciphertext)[0] ^= 1;
  const before = structuredClone(frames());
  f.keyHook(null);
  await expect(f.make().initialize()).rejects.toThrow();
  expect(frames()).toEqual(before);
});
it('keeps metadata cancellation available after signal abort', async () => {
  const controller = new AbortController(),
    f = await preparationFixture({ signal: controller.signal }),
    op = f.make();
  await op.initialize();
  controller.abort();
  await expect(op.readDraft()).rejects.toThrow();
  expect((await finishPreparationClose(op, 'discard')).copyDiscarded).toBe(true);
});
it('drops a late private read after the actor changes, without altering the encrypted copy', async () => {
  const f = await preparationFixture(),
    op = f.make();
  await op.initialize();
  const before = structuredClone(h.rows()),
    held = deferred(),
    started = deferred();
  f.keyHook(async (invoke) => {
    const raw = await invoke();
    started.resolve();
    await held.promise;
    return raw;
  });
  const pending = op.readDraft(),
    rejected = expect(pending).rejects.toThrow('actor changed');
  await started.promise;
  f.current(false);
  held.resolve();
  await rejected;
  expect(h.rows()).toEqual(before);
});
it('reconciles a lost cancellation reply using exactly the original wire', async () => {
  const f = await preparationFixture(),
    op = f.make();
  await op.initialize();
  let first = true;
  f.editHook(async (m, _v, invoke) => {
    const raw = await invoke();
    if (m.startsWith('cancel') && first) {
      first = false;
      throw Error('lost cancel');
    }
    return raw;
  });
  await expect(op.cancel()).rejects.toThrow('lost cancel');
  expect((await f.ticket()).closing.state).toBe('pending');
  const resumed = f.resume();
  await finishPreparationClose(resumed, 'cancel');
  const sent = f.calls.filter((c) => c.method.startsWith('cancel'));
  expect(sent).toHaveLength(2);
  expect(sent[0]).toEqual(sent[1]);
});
it('resumes a bounded purge after an aborted transaction without reporting deletion', async () => {
  const f = await preparationFixture(),
    op = f.make();
  await op.initialize();
  await finishPreparationClose(op, 'release');
  // First discard intent commits, then its physical deletion transaction aborts.
  h.abortAt(h.commits() + 2);
  const before = structuredClone(frames());
  await expect(op.discard(1)).rejects.toThrow('gravação');
  expect(frames()).toEqual(before);
  expect((await f.ticket()).discard).toMatchObject({ phase: 'requested', deleted: 0 });
  expect((await finishPreparationClose(f.resume(), 'discard', 1)).deleted).toBe(before.length);
});
it('does not trust a complete tombstone if a foreign or orphan frame is present', async () => {
  const f = await preparationFixture(),
    op = f.make();
  await op.initialize();
  const frame = structuredClone(frames()[0]);
  await finishPreparationClose(op, 'discard');
  h.stores.get('creationFrames').set(JSON.stringify(frame.k), { k: frame.k, value: frame.value });
  const resumed = f.resume();
  await expect(resumed.initialize()).rejects.toThrow();
  expect(resumed.snapshot().copyDiscarded).toBe(false);
  expect(frames()).toHaveLength(1);
});
// AES-GCM over >128 frames can exceed 20s on the shared coverage runner.
it('streams a draft larger than 8 MiB and deletes at most 50 actual frames per call', async () => {
  const data = creationData();
  data.details = '\ufeff' + 'x'.repeat(8 * 1024 * 1024 + 1024) + '🌙\r\n';
  const f = await preparationFixture({ data }),
    op = f.make();
  await op.initialize();
  const t = await f.ticket();
  expect(t.draft.chunkCount).toBeGreaterThan(128);
  expect(frames()).toHaveLength(t.draft.chunkCount + 1);
  for (const r of frames()) expect(r.value.ciphertext.byteLength).toBeLessThanOrEqual(65536 + 16);
  expect(await f.resume().readDraft()).toEqual(f.input);
  const closer = f.resume();
  await finishPreparationClose(closer, 'release');
  const size = frames().length,
    s = await closer.discard(50);
  expect(s.deleted).toBe(50);
  expect(s.copyDiscarded).toBe(false);
  expect(frames()).toHaveLength(size - 50);
  expect((await finishPreparationClose(closer, 'discard', 50)).deleted).toBe(size);
}, 60000);

it('paginates tickets within the account, with a stable exclusive cursor and bounded limit', async () => {
  const a = await preparationFixture({ writeId: 'a-ticket' }),
    b = await preparationFixture({ writeId: 'b-ticket' });
  await a.make().initialize();
  await b.make().initialize();
  const first = await listCreationTickets('author', undefined, 1);
  expect(first.items.map((t) => t.writeId)).toEqual(['a-ticket']);
  expect(first.next).toBe('a-ticket');
  const second = await listCreationTickets('author', first.next, 1);
  expect(second.items.map((t) => t.writeId)).toEqual(['b-ticket']);
  expect(second.next).toBeNull();
  await expect(listCreationTickets('author', undefined, 51)).rejects.toThrow();
  await expect(listCreationTickets('author', undefined, 0)).rejects.toThrow();
});
it('rejects an unknown frame generation atomically during purge without deleting neighboring resources', async () => {
  const f = await preparationFixture(),
    op = f.make();
  await op.initialize();
  await finishPreparationClose(op, 'release');
  const r = structuredClone(frames()[0]),
    k = [...r.k];
  k[3] = 'unknown-generation';
  h.stores.get('creationFrames').set(JSON.stringify(k), { k, value: r.value });
  const before = structuredClone(frames());
  await expect(op.discard()).rejects.toThrow();
  expect(frames()).toEqual(before);
  expect((await f.ticket()).discard.deleted).toBe(0);
});
it('blocks pending encryption after another instance takes the metadata ticket', async () => {
  const f = await preparationFixture(),
    op = f.make(),
    started = deferred(),
    held = deferred();
  f.keyHook(async (invoke) => {
    const raw = await invoke();
    started.resolve();
    await held.promise;
    return raw;
  });
  const pending = op.initialize(),
    rejected = expect(pending).rejects.toThrow();
  await started.promise;
  const other = f.resume();
  await other.initialize();
  expect(other.snapshot().phase).toBe('awaiting-draft');
  held.resolve();
  await rejected;
  expect(frames()).toHaveLength(0);
});

it('fences a late AES-GCM result after independent discard', async () => {
  const f = await preparationFixture(),
    started = deferred(),
    held = deferred(),
    op = f.make(),
    encrypt = crypto.subtle.encrypt.bind(crypto.subtle);
  const spy = vi.spyOn(crypto.subtle, 'encrypt').mockImplementation(async (...args) => {
    const sealed = await encrypt(...args);
    started.resolve();
    await held.promise;
    return sealed;
  });
  try {
    const pending = op.initialize(),
      rejected = expect(pending).rejects.toThrow();
    await started.promise;
    expect((await finishPreparationClose(op, 'discard')).copyDiscarded).toBe(true);
    held.resolve();
    await rejected;
    expect(frames()).toHaveLength(0);
  } finally {
    spy.mockRestore();
  }
});
it('preserves a conflicting adopted head and never claims own cleanup or key release', async () => {
  const f = await preparationFixture(),
    op = f.make();
  await op.initialize();
  const operation = await prepareBookLoreCreationOperation(
    { ...f.input, data: { ...f.input.data, details: 'Other adopted intent' } },
    { call: (method, input) => f.nativeEdit.bookLoreEdit('author', { method, input }) },
    { yieldControl: async () => {} },
  );
  await creationReady({ operation });
  await operation.apply();
  const before = structuredClone(frames());
  await expect(op.discard()).rejects.toMatchObject({ code: 'failed-precondition' });
  const s = await op.discard();
  expect(s.phase).toBe('conflict');
  expect(s.keyReleased).toBe(false);
  expect(s.copyDiscarded).toBe(false);
  expect((await f.ticket()).jobsClosed).toBe(false);
  expect(frames()).toEqual(before);
  expect(f.calls.some((c) => c.method === 'revokeBookLoreEditRecovery')).toBe(false);
  expect((await f.db.doc('books/book/lore/' + (await f.ticket()).loreId).get()).exists).toBe(true);
});
it('reconciles cleanup changed by another metadata unit before continuing the same creator cleanup', async () => {
  const f = await preparationFixture(),
    op = f.make();
  await op.initialize();
  const operation = await prepareBookLoreCreationOperation(
    f.input,
    { call: (method, input) => f.nativeEdit.bookLoreEdit('author', { method, input }) },
    { yieldControl: async () => {} },
  );
  // Create an actual in-flight native child and leave production unfinished.
  for (let n = 0; n < 5; n++) await operation.advance();
  const s = await op.cancel();
  expect(s.phase).toBe('cancelling');
  let conflict = true;
  f.editHook(async (method, input, invoke) => {
    if (method === 'advanceBookLoreCreationCleanup' && conflict) {
      conflict = false;
      await f.nativeEdit.bookLoreEdit('author', {
        method,
        input: { ...input, operationId: 'other-cleanup-unit' },
      });
    }
    return invoke();
  });
  await expect(op.cancel()).rejects.toMatchObject({ code: 'failed-precondition' });
  expect((await f.ticket()).closing.wire.method).toBe('getBookLoreCreationReservation');
  expect((await finishPreparationClose(op, 'cancel')).phase).toBe('cancelled');
  expect(f.calls.some((c) => c.method === 'getBookLoreCreationReservation')).toBe(true);
  expect(await op.readDraft()).toEqual(f.input);
});
