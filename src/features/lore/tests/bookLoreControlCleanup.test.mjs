// @vitest-environment node
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { sha256 } from '@noble/hashes/sha2.js';
import { bookLoreWriteHash as controlHash } from '../services/bookLoreWritePayload.ts';
import { bytesToHex } from '@noble/hashes/utils.js';
import { prepareBookLoreEditOperation } from '../services/bookLoreEditOperation.ts';
import { createBookLoreJournal, openBookLoreJournal } from '../services/bookLoreJournal.ts';
import { captureBookLoreControlMap } from '../services/bookLoreControlMap.ts';
import { loreControlUnitId, loreControlJobId } from '../services/bookLoreControlContracts.ts';
import { journalWire } from '../services/bookLoreJournalContracts.ts';
import { createBookLoreReadClient } from '../services/bookLoreReadClient.ts';
import { createBookLoreReadService } from '../../../../functions/src/bookLoreRead.mjs';
import { createBookLoreEditTransportService } from '../../../../functions/src/bookLoreEditTransport.mjs';
import { adventureImportDb } from '../../../../functions/test/helpers/adventureImportDb.mjs';
import { loreLogicalFixture } from '../../../../functions/test/helpers/bookLoreLogicalFixture.mjs';
import { installLoreJournalHarness } from './bookLoreJournalHarness.mjs';
let h;
beforeEach(() => {
  h = installLoreJournalHarness();
});
afterEach(() => vi.unstubAllGlobals());
async function setup({ map = true, changes, signal } = {}) {
  const f = adventureImportDb({ nativeUpdates: true }),
    seed = await loreLogicalFixture(f.db, { mode: 'inline' }),
    read = createBookLoreReadService({ db: f.db }),
    client = createBookLoreReadClient(
      (m, input) => read[m](seed.uid, input),
      () => {},
    ),
    source = await client.capture(seed.bookId, seed.entityId),
    input = {
      uid: seed.uid,
      writeId: 'keyless-cleanup',
      source,
      changes: changes ?? [{ field: 'summary', value: ' OWN_PRIVATE_🌙\r\n ' }],
    },
    server = createBookLoreEditTransportService({ db: f.db, now: () => 8000 }),
    calls = [];
  let j,
    allowed = true,
    current = true,
    gets = 0,
    intercept = null;
  const native = {
      async call(method, input) {
        calls.push({ method, input: structuredClone(input) });
        const invoke = () => server.bookLoreEdit(seed.uid, { method, input });
        return intercept ? intercept(method, input, invoke) : invoke();
      },
    },
    port = { call: (method, input) => j.send(native, { method, input }) },
    op = await prepareBookLoreEditOperation(input, port, { yieldControl: async () => {} }),
    raw = crypto.getRandomValues(new Uint8Array(32)),
    key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']),
    identity = {
      schemaVersion: 1,
      uid: seed.uid,
      writeId: input.writeId,
      bookId: seed.bookId,
      loreId: seed.entityId,
      sourceToken: source.sourceToken,
      intentHash: op.snapshot().intentHash,
      requestHash: 'b'.repeat(64),
      jobToken: 'c'.repeat(64),
      keyId: bytesToHex(sha256(raw)),
    },
    options = {
      signal,
      guard() {
        if (!current) throw Error('actor changed');
      },
      yieldControl: async () => {},
      async getKey() {
        gets++;
        if (!allowed) throw Error('key revoked');
        return { identity, key };
      },
    };
  j = await createBookLoreJournal(identity, options);
  await j.writeDraft(input);
  if (map) await j.writeControlMap(captureBookLoreControlMap(op));
  return {
    ...f,
    ...seed,
    client,
    source,
    input,
    op,
    port,
    native,
    calls,
    identity,
    options,
    get j() {
      return j;
    },
    open: async () => {
      j = await openBookLoreJournal(identity, options);
      return j;
    },
    allowed: (v) => {
      allowed = v;
    },
    current: (v) => {
      current = v;
    },
    gets: () => gets,
    intercept: (fn) => {
      intercept = fn;
    },
    revoke: async () => {
      allowed = false;
      await f.db.runTransaction((tx) => tx.update(f.db.doc('books/book'), { authorId: 'other' }));
    },
  };
}
async function advanceProducer(f) {
  await f.op.advance();
  const head = await f.j.inspect();
  if (head.production?.state === 'pending' && f.op.snapshot().pending.production === null)
    await f.j.confirmPending('production', head.production.requestHash);
}
async function until(f, method) {
  for (let n = 0; n < 3000; n++) {
    await advanceProducer(f);
    if (f.calls.at(-1)?.method === method) return;
  }
  throw Error('no milestone');
}
async function ready(f) {
  for (let n = 0; n < 3000; n++) {
    if (f.op.snapshot().phase === 'ready') return;
    await advanceProducer(f);
  }
  throw Error('not ready');
}
async function cleanup(f, reload = false) {
  for (let n = 0; n < 3000; n++) {
    const before = f.calls.length,
      result = await f.j.advanceControlCleanup(f.native);
    expect(f.calls.length - before).toBeLessThanOrEqual(1);
    if (['cancelled', 'applied'].includes(result.controls.worker.phase)) return result;
    if (reload) await f.open();
  }
  throw Error('cleanup did not finish');
}
const physical = (f) =>
  structuredClone([...f.records].filter(([p]) => /\/bookResource(Bodies|Chunks)\//u.test(p)));
for (const milestone of [
  'none',
  'startBookLoreSourceInspection',
  'appendBookLoreFieldUpload',
  'advanceBookLoreFieldSeal',
  'startBookLoreEditReservation',
  'initializeBookLoreEditGeneration',
  'reserveBookLoreEditUpload',
  'advanceBookLoreEditCompilation',
  'ready',
])
  it(
    'closes all known jobs without key after ' + milestone + ' and reloads between steps',
    async () => {
      const f = await setup(),
        before = structuredClone(f.records.get('books/book/lore/arthur')),
        bodies = physical(f),
        clock = f.records.get('books/book').localLoreVersion;
      if (milestone === 'ready') await ready(f);
      else if (milestone !== 'none') await until(f, milestone);
      await f.revoke();
      const gets = f.gets(),
        decrypt = vi.spyOn(crypto.subtle, 'decrypt');
      await f.open();
      expect((await cleanup(f, true)).controls.worker.phase).toBe('cancelled');
      expect(f.gets()).toBe(gets);
      expect(decrypt).not.toHaveBeenCalled();
      expect(f.records.get('books/book/lore/arthur')).toEqual(before);
      expect(physical(f)).toEqual(bodies);
      expect(f.records.get('books/book').localLoreVersion).toBe(clock);
      expect(f.records.get('users/author').credits).toBe(5);
      const header = await f.j.inspect();
      expect(header.draft.complete).toBe(true);
      expect(JSON.stringify(h.rows())).not.toContain('OWN_PRIVATE');
      const count = f.calls.length;
      await f.j.advanceControlCleanup(f.native);
      expect(f.calls).toHaveLength(count);
    },
  );
for (const method of [
  'getBookLoreEditReservation',
  'cancelBookLoreEditReservation',
  'advanceBookLoreEditReservationCleanup',
  'cancelBookLoreFieldUpload',
  'advanceBookLoreFieldCleanup',
  'cancelBookLoreSourceInspection',
])
  it(
    'replays exact lost metadata reply for ' + method + ' after opening a new handle',
    async () => {
      const f = await setup();
      if (['cancelBookLoreFieldUpload', 'advanceBookLoreFieldCleanup'].includes(method))
        await until(f, 'appendBookLoreFieldUpload');
      else await ready(f);
      let lost = false,
        first;
      f.intercept(async (name, input, invoke) => {
        const r = await invoke();
        if (name === method && !lost) {
          lost = true;
          first = structuredClone(input);
          throw Error('lost metadata');
        }
        return r;
      });
      f.allowed(false);
      for (let n = 0; n < 3000; n++) {
        try {
          await f.j.advanceControlCleanup(f.native);
        } catch (e) {
          expect(e.message).toBe('lost metadata');
          break;
        }
      }
      expect(lost).toBe(true);
      const pending = (await f.j.inspect()).controls.worker.pending;
      expect(pending.wire).toEqual({ method, input: first });
      await f.open();
      await f.j.advanceControlCleanup(f.native);
      expect(f.calls.at(-1)).toEqual({ method, input: first });
      expect((await cleanup(f, true)).controls.worker.phase).toBe('cancelled');
    },
  );
it('recognizes native adoption without reading text or cleaning its active children', async () => {
  const f = await setup();
  await ready(f);
  await f.op.apply();
  await f.revoke();
  await f.open();
  const before = structuredClone([...f.records]),
    calls = f.calls.length;
  const result = await cleanup(f);
  expect(result.controls.worker.phase).toBe('applied');
  expect(f.calls.slice(calls).map((c) => c.method)).toEqual(['getBookLoreEditReservation']);
  expect([...f.records]).toEqual(before);
  expect(result.draft.complete).toBe(true);
});
it('closes a producer whose append committed while its response is still pending', async () => {
  const f = await setup();
  await until(f, 'startBookLoreFieldUpload');
  let release,
    entered = false;
  f.intercept(async (method, _input, invoke) => {
    const r = await invoke();
    if (method === 'appendBookLoreFieldUpload') {
      entered = true;
      await new Promise((done) => {
        release = done;
      });
    }
    return r;
  });
  const late = f.op.advance();
  await vi.waitFor(() => expect(entered).toBe(true));
  f.allowed(false);
  expect((await cleanup(f, true)).controls.worker.phase).toBe('cancelled');
  release();
  await late;
  const count = f.calls.length;
  await expect(f.op.advance()).rejects.toThrow();
  expect(f.calls).toHaveLength(count);
  expect((await f.j.inspect()).controls.worker.phase).toBe('cancelled');
});
it('fences a registered edit before its delayed start and never reopens it', async () => {
  const f = await setup();
  let release,
    started,
    entered = false;
  const atStart = new Promise((done) => {
    started = done;
  });
  f.intercept(async (method, _input, invoke) => {
    if (method === 'startBookLoreEditReservation') {
      entered = true;
      started();
      await new Promise((done) => {
        release = done;
      });
    }
    return invoke();
  });
  let late;
  for (let n = 0; n < 3000; n++) {
    const step = advanceProducer(f);
    await Promise.race([step, atStart]);
    if (entered) {
      late = step;
      break;
    }
    await step;
  }
  expect(entered).toBe(true);
  expect((await f.j.inspect()).controls.edit).not.toBeNull();
  try {
    expect((await cleanup(f, true)).controls.worker.phase).toBe('cancelled');
  } finally {
    release();
    await late;
  }
  expect((await f.j.inspect()).controls.worker.phase).toBe('cancelled');
  expect((await f.client.get(f.bookId, f.entityId)).data).toEqual(f.source.data);
});
it('preserves original cancel across a transient conflict/get/retry cycle', async () => {
  const f = await setup();
  await ready(f);
  let rejected = false,
    first;
  f.intercept(async (name, input, invoke) => {
    if (name === 'cancelBookLoreEditReservation' && !rejected) {
      rejected = true;
      first = structuredClone(input);
      throw Object.assign(Error('fixture conflict'), { code: 'failed-precondition' });
    }
    return invoke();
  });
  for (let n = 0; n < 3000; n++) {
    const r = await f.j.advanceControlCleanup(f.native);
    if (r.controls.worker.failedCancel) break;
  }
  expect(rejected).toBe(true);
  await f.open();
  await f.j.advanceControlCleanup(f.native);
  expect((await f.j.inspect()).controls.worker.failedCancel.input).toEqual(first);
  await f.open();
  await f.j.advanceControlCleanup(f.native);
  expect(f.calls.at(-1).input).toEqual(first);
  expect((await cleanup(f)).controls.worker.phase).toBe('cancelled');
});
it('keeps partial map atomic, refuses divergent retry and blocks production/cleanup until ready', async () => {
  const f = await setup({ map: false }),
    map = captureBookLoreControlMap(f.op);
  h.abortAt(h.commits() + 2);
  await expect(f.j.writeControlMap(map)).rejects.toThrow();
  const partial = await f.j.inspect();
  expect(partial.controls.ready).toBe(false);
  expect(partial.controls.written).toBe(0);
  expect(h.rows().filter((r) => r.k?.[2] === 'controls')).toHaveLength(0);
  await expect(f.op.advance()).rejects.toThrow();
  await expect(f.j.advanceControlCleanup(f.native)).rejects.toThrow('mapa');
  expect(f.calls).toHaveLength(0);
  const bad = structuredClone(map);
  bad.pages[0].items[0].startHash = 'f'.repeat(64);
  let digest = controlHash({
    domain: 'writer-lore-cleanup-controls',
    intentHash: bad.intentHash,
    count: bad.count,
  });
  for (const page of bad.pages)
    for (const item of page.items) digest = controlHash({ previous: digest, ...item });
  bad.mapHash = digest;
  await expect(f.j.writeControlMap(bad)).rejects.toThrow();
  await f.open();
  await f.j.writeControlMap(map);
  expect((await f.j.inspect()).controls.ready).toBe(true);
  await advanceProducer(f);
  expect(f.calls).toHaveLength(1);
});
it('persists more than fifty real upload controls and fences every unstarted child with bounded calls', async () => {
  const relations = Array.from({ length: 64 * 52 + 1 }, (_, n) => ({
      targetEntityId: 'target-' + n,
      relationType: 'knows',
      description: 'Own ' + n,
    })),
    f = await setup({ changes: [{ field: 'relations', value: relations }] });
  const head = await f.j.inspect();
  expect(head.controls.count).toBe(53);
  expect(head.controls.pages).toBe(2);
  f.allowed(false);
  await f.open();
  expect((await cleanup(f, true)).controls.worker.phase).toBe('cancelled');
  expect(f.calls.filter((c) => c.method === 'cancelBookLoreFieldUpload')).toHaveLength(53);
  expect(f.calls.some((c) => c.method.startsWith('start') || c.method.startsWith('append'))).toBe(
    false,
  );
});
it('recovers known parent metadata when backfilling controls from a legacy in-memory coordinator', async () => {
  const f = await setup({ map: false });
  await ready(f);
  await f.j.writeControlMap(captureBookLoreControlMap(f.op));
  await f.revoke();
  await f.open();
  expect((await f.j.inspect()).controls.edit).not.toBeNull();
  expect((await cleanup(f, true)).controls.worker.phase).toBe('cancelled');
});
it('can clean with an aborted signal but still refuses a changed actor', async () => {
  const signal = new AbortController(),
    f = await setup({ signal: signal.signal });
  signal.abort();
  f.current(false);
  await expect(f.j.advanceControlCleanup(f.native)).rejects.toThrow('actor changed');
  expect(f.calls).toHaveLength(0);
  f.current(true);
  expect((await cleanup(f)).controls.worker.phase).toBe('cancelled');
});
it('preserves an exact uncertain cleanup unit if the final local acknowledgement aborts', async () => {
  const f = await setup();
  let once = true;
  f.intercept(async (_method, _input, invoke) => {
    const r = await invoke();
    if (once) {
      once = false;
      h.abortNext();
    }
    return r;
  });
  await expect(f.j.advanceControlCleanup(f.native)).rejects.toThrow();
  const pending = (await f.j.inspect()).controls.worker.pending;
  expect(pending).not.toBeNull();
  const first = structuredClone(f.calls[0]);
  await f.open();
  await f.j.advanceControlCleanup(f.native);
  expect(f.calls[1]).toEqual(first);
  expect((await cleanup(f)).controls.worker.phase).toBe('cancelled');
});
it('rejects stale handles and never starts a second concurrent cleanup RPC', async () => {
  const f = await setup();
  let release,
    entered = false;
  f.intercept(async (_name, _input, invoke) => {
    entered = true;
    await new Promise((done) => {
      release = done;
    });
    return invoke();
  });
  const old = f.j,
    pending = old.advanceControlCleanup(f.native);
  await vi.waitFor(() => expect(entered).toBe(true));
  await expect(old.advanceControlCleanup(f.native)).rejects.toThrow('andamento');
  await f.open();
  const failure = expect(pending).rejects.toThrow();
  release();
  await failure;
  f.intercept(null);
  expect((await cleanup(f)).controls.worker.phase).toBe('cancelled');
});

it('reconciles an uncertain legacy cleanup outside the current cursor without overwriting it', async () => {
  const f = await setup({
      changes: [
        { field: 'summary', value: 'one' },
        { field: 'details', value: 'two' },
      ],
    }),
    control = f.op.controlsPage().items[1],
    wire = {
      method: 'cancelBookLoreFieldUpload',
      input: {
        uploadId: control.id,
        startHash: control.startHash,
        operationId: loreControlUnitId(f.identity, 'cancelBookLoreFieldUpload', control.id, null),
      },
    };
  let once = true;
  f.intercept(async (_m, _i, invoke) => {
    const r = await invoke();
    if (once) {
      once = false;
      throw Error('legacy lost');
    }
    return r;
  });
  await expect(f.j.send(f.native, wire)).rejects.toThrow('legacy lost');
  f.intercept(null);
  f.allowed(false);
  await f.open();
  const result = await f.j.advanceControlCleanup(f.native);
  expect(result.controls.worker.uploadIndex).toBe(0);
  expect(result.cleanup.state).toBe('confirmed');
  expect(f.calls[1]).toEqual(wire);
  expect((await cleanup(f, true)).controls.worker.phase).toBe('cancelled');
});
it('reconciles an uncertain legacy diagnostic without using a key or changing its exact request', async () => {
  const f = await setup();
  await until(f, 'startBookLoreSourceInspection');
  const p = f.op.snapshot().inspection,
    wire = {
      method: 'getBookLoreSourceInspection',
      input: { inspectionId: p.id, startHash: p.startHash, jobToken: p.jobToken },
    };
  f.intercept(async (_m, _i, invoke) => {
    await invoke();
    throw Error('lost diagnostic');
  });
  await expect(f.j.send(f.native, wire)).rejects.toThrow('lost diagnostic');
  f.intercept(null);
  await f.revoke();
  await f.open();
  const before = f.calls.length;
  await f.j.advanceControlCleanup(f.native);
  expect(f.calls[before]).toEqual(wire);
  expect((await f.j.inspect()).diagnostic.state).toBe('confirmed');
  expect((await cleanup(f)).controls.worker.phase).toBe('cancelled');
});
it('refuses a control lookup with a corrupted index before RPC and preserves the draft', async () => {
  const f = await setup(),
    rows = h.stores.get('frames'),
    entry = [...rows.values()].find((r) => r.k[2] === 'controls' && typeof r.k[4] === 'string');
  entry.value.index = 99;
  await expect(f.j.advanceControlCleanup(f.native)).rejects.toThrow();
  expect(f.calls).toHaveLength(0);
  expect((await f.j.inspect()).draft.complete).toBe(true);
});
it('rejects malformed progress while retaining the exact request for retry', async () => {
  const f = await setup();
  f.intercept(async (_m, _i, invoke) => {
    const r = await invoke();
    return { ...r, progress: { ...r.progress, startHash: 'f'.repeat(64) } };
  });
  await expect(f.j.advanceControlCleanup(f.native)).rejects.toThrow();
  const pending = (await f.j.inspect()).controls.worker.pending;
  expect(pending).not.toBeNull();
  f.intercept(null);
  await f.open();
  await f.j.advanceControlCleanup(f.native);
  expect(f.calls[1]).toEqual(f.calls[0]);
  expect((await cleanup(f)).controls.worker.phase).toBe('cancelled');
});
it('reports a metadata deferral and resumes the same cleanup unit without resetting progress', async () => {
  const f = await setup();
  await until(f, 'appendBookLoreFieldUpload');
  let view,
    blocked = false;
  f.intercept(async (method, _input, invoke) => {
    if (method === 'advanceBookLoreFieldCleanup' && !blocked) {
      blocked = true;
      return { receipt: null, progress: view, blocked: 'active-head' };
    }
    const r = await invoke();
    if (method === 'cancelBookLoreFieldUpload') view = structuredClone(r.progress);
    return r;
  });
  await f.j.advanceControlCleanup(f.native);
  const deferred = await f.j.advanceControlCleanup(f.native),
    first = structuredClone(f.calls.at(-1));
  expect(deferred.controls.worker.blockedReason).toBe('active-head');
  await f.open();
  await f.j.advanceControlCleanup(f.native);
  expect(f.calls.at(-1)).toEqual(first);
  expect((await cleanup(f)).controls.worker.phase).toBe('cancelled');
});
it('keeps a known start-uncertain parent when backfilling a legacy map', async () => {
  const f = await setup({ map: false });
  let lost = false;
  f.intercept(async (method, _input, invoke) => {
    const r = await invoke();
    if (method === 'startBookLoreEditReservation' && !lost) {
      lost = true;
      throw Error('lost parent');
    }
    return r;
  });
  for (let n = 0; n < 3000; n++) {
    try {
      await advanceProducer(f);
    } catch (e) {
      expect(e.message).toBe('lost parent');
      break;
    }
  }
  expect(lost).toBe(true);
  expect(f.op.snapshot().edit).toBeNull();
  await f.j.writeControlMap(captureBookLoreControlMap(f.op));
  expect((await f.j.inspect()).controls.edit).not.toBeNull();
  f.intercept(null);
  await f.revoke();
  await f.open();
  expect((await cleanup(f)).controls.worker.phase).toBe('cancelled');
});
for (const [name, change] of [
  ['scope', (m) => (m.intentHash = 'f'.repeat(64))],
  ['extra credential', (m) => (m.apiKey = 'PRIVATE')],
  ['foreign upload', (m) => (m.pages[0].items[0].id = 'lore-field-' + 'f'.repeat(64))],
  ['digest', (m) => (m.mapHash = 'f'.repeat(64))],
])
  it('rejects control map ' + name + ' before writing records', async () => {
    const f = await setup({ map: false }),
      map = structuredClone(captureBookLoreControlMap(f.op));
    change(map);
    await expect(f.j.writeControlMap(map)).rejects.toThrow();
    expect((await f.j.inspect()).controls).toBeNull();
  });
it('does not allow a previously unknown parent to register after cleanup started', async () => {
  const f = await setup();
  await f.j.advanceControlCleanup(f.native);
  const metadataBefore = JSON.stringify((await f.j.inspect()).controls);
  const c = (await f.j.inspect()).controls,
    u = f.op.controlsPage().items[0],
    wire = {
      method: 'startBookLoreEditReservation',
      input: {
        bookId: f.bookId,
        loreId: f.entityId,
        sourceToken: f.identity.sourceToken,
        editId: loreControlJobId(f.identity, 'lore-edit'),
        inspection: {
          inspectionId: c.inspection.id,
          startHash: c.inspection.startHash,
          jobToken: 'e'.repeat(64),
        },
        fields: { summary: { uploadId: u.id, startHash: u.startHash, jobToken: 'f'.repeat(64) } },
      },
    };
  expect(journalWire(wire, f.identity).metadata.lane).toBe('production');
  await expect(f.j.registerControlEdit(wire)).rejects.toThrow();
  expect(JSON.stringify((await f.j.inspect()).controls)).toBe(metadataBefore);
});

it('preserves an unknown uncertain legacy job without sending it or erasing its metadata', async () => {
  const f = await setup(),
    wire = {
      method: 'cancelBookLoreFieldUpload',
      input: {
        uploadId: 'lore-field-' + 'f'.repeat(64),
        startHash: 'e'.repeat(64),
        operationId: 'uncertain-foreign',
      },
    };
  await f.j.stagePending(wire);
  f.allowed(false);
  await expect(f.j.advanceControlCleanup(f.native)).rejects.toThrow();
  expect((await f.j.readPending('cleanup')).wire).toEqual(wire);
  expect(f.calls).toHaveLength(0);
  expect((await f.j.inspect()).draft.complete).toBe(true);
});
it('refuses arbitrary blocked reason text without storing or echoing private response content', async () => {
  const f = await setup();
  f.intercept(async (_m, _i, invoke) => ({
    ...(await invoke()),
    blocked: 'PRIVATE_SOURCE_DETAILS',
  }));
  const error = await f.j.advanceControlCleanup(f.native).catch((e) => e);
  expect(error).toBeInstanceOf(Error);
  expect(error.message).not.toContain('PRIVATE_SOURCE_DETAILS');
  expect(JSON.stringify((await f.j.inspect()).controls)).not.toContain('PRIVATE_SOURCE_DETAILS');
  f.intercept(null);
  expect((await cleanup(f)).controls.worker.phase).toBe('cancelled');
});

it('freezes a mutable map before the first storage await instead of adopting a later caller edit', async () => {
  const f = await setup({ map: false }),
    map = structuredClone(captureBookLoreControlMap(f.op)),
    expected = map.mapHash;
  const pending = f.j.writeControlMap(map);
  map.mapHash = 'f'.repeat(64);
  await pending;
  expect((await f.j.inspect()).controls.mapHash).toBe(expected);
  expect(f.calls).toHaveLength(0);
});

for (const foreign of ['inspection', 'upload'])
  it('refuses a new edit with ' + foreign + ' outside its registered map before RPC', async () => {
    const f = await setup(),
      c = (await f.j.inspect()).controls,
      u = f.op.controlsPage().items[0],
      wire = {
        method: 'startBookLoreEditReservation',
        input: {
          bookId: f.bookId,
          loreId: f.entityId,
          sourceToken: f.identity.sourceToken,
          editId: loreControlJobId(f.identity, 'lore-edit'),
          inspection: {
            inspectionId:
              foreign === 'inspection' ? 'lore-source-' + 'f'.repeat(64) : c.inspection.id,
            startHash: c.inspection.startHash,
            jobToken: 'e'.repeat(64),
          },
          fields: {
            summary: {
              uploadId: foreign === 'upload' ? 'lore-field-' + 'f'.repeat(64) : u.id,
              startHash: u.startHash,
              jobToken: 'f'.repeat(64),
            },
          },
        },
      };
    expect(journalWire(wire, f.identity).metadata.lane).toBe('production');
    await expect(f.j.send(f.native, wire)).rejects.toThrow();
    expect(f.calls).toHaveLength(0);
    expect((await f.j.inspect()).controls.edit).toBeNull();
  });
it('refuses reservation of an upload outside its map without replacing the current unit', async () => {
  const f = await setup();
  await ready(f);
  const p = f.op.snapshot().edit,
    count = f.calls.length,
    previous = (await f.j.inspect()).production;
  const wire = {
    method: 'reserveBookLoreEditUpload',
    input: {
      editId: p.id,
      startHash: p.startHash,
      jobToken: p.jobToken,
      operationId: 'foreign-slot',
      expectedRevision: p.revision,
      target: { field: 'summary' },
      upload: {
        uploadId: 'lore-field-' + 'f'.repeat(64),
        startHash: 'e'.repeat(64),
        jobToken: 'f'.repeat(64),
      },
    },
  };
  await expect(f.j.send(f.native, wire)).rejects.toThrow();
  expect(f.calls).toHaveLength(count);
  expect((await f.j.inspect()).production).toEqual(previous);
});
