// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import {
  prepareBookLoreEditOperation,
  restoreBookLoreEditOperation,
} from '../services/bookLoreEditOperation.ts';
import { createBookLoreReadClient } from '../services/bookLoreReadClient.ts';
import { createBookLoreReadService } from '../../../../functions/src/bookLoreRead.mjs';
import { createBookLoreEditTransportService } from '../../../../functions/src/bookLoreEditTransport.mjs';
import { adventureImportDb } from '../../../../functions/test/helpers/adventureImportDb.mjs';
import { loreLogicalFixture } from '../../../../functions/test/helpers/bookLoreLogicalFixture.mjs';
afterEach(() => vi.unstubAllGlobals());
async function setup({ mode = 'v1', changes, guard = () => {} } = {}) {
  vi.stubGlobal('crypto', webcrypto);
  const f = adventureImportDb({ nativeUpdates: true }),
    seed = await loreLogicalFixture(f.db, { mode }),
    reader = createBookLoreReadService({ db: f.db }),
    client = createBookLoreReadClient((method, input) => reader[method](seed.uid, input), guard),
    source = await client.capture(seed.bookId, seed.entityId),
    server = createBookLoreEditTransportService({ db: f.db, now: () => 8000 }),
    calls = [];
  let intercept = null;
  const port = {
    async call(method, input) {
      calls.push({ method, input: structuredClone(input) });
      const invoke = () => server.bookLoreEdit(seed.uid, { method, input });
      return intercept ? intercept(method, input, invoke) : invoke();
    },
  };
  const input = {
      uid: seed.uid,
      writeId: 'checkpoint-recovery',
      source,
      changes: changes ?? [{ field: 'summary', value: ' CHECKPOINT_PRIVATE_🌙\r\n ' }],
    },
    options = { guard, yieldControl: async () => {} },
    operation = await prepareBookLoreEditOperation(input, port, options);
  return {
    ...f,
    ...seed,
    input,
    port,
    calls,
    options,
    operation,
    client,
    intercept: (fn) => {
      intercept = fn;
    },
  };
}
function capture(op) {
  const checkpoint = structuredClone(op.checkpoint()),
    pages = new Map();
  for (let offset = 0; offset < checkpoint.uploadCount; offset += 50)
    pages.set(
      offset,
      structuredClone(op.controlsPage(offset, Math.min(50, checkpoint.uploadCount - offset))),
    );
  return {
    checkpoint,
    controlsPage: async (offset, limit) => {
      expect(limit).toBe(Math.min(50, checkpoint.uploadCount - offset));
      return structuredClone(pages.get(offset));
    },
  };
}
async function restore(f, recovery = capture(f.operation)) {
  const calls = f.calls.length,
    snapshot = f.operation.snapshot();
  f.operation = await restoreBookLoreEditOperation(f.input, recovery, f.port, f.options);
  expect(f.calls).toHaveLength(calls);
  expect(f.operation.snapshot()).toEqual(snapshot);
}
async function ready(f, reload = false) {
  for (let n = 0; n < 3000; n++) {
    const phase = f.operation.snapshot().phase;
    if (['ready', 'applied'].includes(phase)) return;
    await f.operation.advance();
    if (reload) await restore(f);
  }
  throw Error('not ready');
}
async function until(f, method) {
  for (let n = 0; n < 3000; n++) {
    await f.operation.advance();
    if (f.calls.at(-1)?.method === method) return;
  }
  throw Error('no milestone');
}
async function cancelled(f, reload = false) {
  f.operation.requestCancel();
  for (let n = 0; n < 3000; n++) {
    if (['cancelled', 'applied'].includes(f.operation.snapshot().phase)) return;
    await f.operation.advance();
    if (reload) await restore(f);
  }
  throw Error('not cancelled');
}
for (const mode of ['inline', 'v1', 'v2', 'created'])
  it(
    'reconstructs between every native unit for ' +
      mode +
      ' and preserves explicit one-time adoption',
    async () => {
      const f = await setup({ mode }),
        before = structuredClone(f.input.source.data),
        clock = f.records.get('books/book').localLoreVersion;
      await ready(f, true);
      expect((await f.client.get(f.bookId, f.entityId)).data).toEqual(before);
      expect(f.calls.some((c) => c.method === 'adoptBookLoreEditGeneration')).toBe(false);
      expect(JSON.stringify(f.operation.snapshot())).not.toContain('CHECKPOINT_PRIVATE');
      await f.operation.apply();
      await restore(f);
      expect(f.operation.snapshot().phase).toBe('applied');
      expect((await f.client.get(f.bookId, f.entityId)).data.summary).toBe(
        f.input.changes[0].value,
      );
      expect(f.records.get('books/book').localLoreVersion).toBe(clock + 1);
      expect(f.records.get('users/author').credits).toBe(5);
      const count = f.calls.length;
      await f.operation.advance();
      await f.operation.apply();
      expect(f.calls).toHaveLength(count);
    },
  );
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
])
  it('reconstructs lost reply and replays exact wire for ' + method, async () => {
    const f = await setup();
    let lost = false,
      first;
    f.intercept(async (name, input, invoke) => {
      const value = await invoke();
      if (name === method && !lost) {
        lost = true;
        first = structuredClone(input);
        throw Error('lost reply');
      }
      return value;
    });
    for (let n = 0; n < 3000; n++) {
      try {
        if (f.operation.snapshot().phase === 'ready') await f.operation.apply();
        else await f.operation.advance();
      } catch (e) {
        expect(e.message).toBe('lost reply');
        break;
      }
    }
    expect(lost).toBe(true);
    await restore(f);
    await f.operation.advance();
    expect(f.calls.at(-1)).toEqual({ method, input: first });
    await ready(f, true);
    await f.operation.apply();
    expect((await f.client.get(f.bookId, f.entityId)).data.summary).toBe(f.input.changes[0].value);
  });
for (const method of [
  'cancelBookLoreSourceInspection',
  'cancelBookLoreFieldUpload',
  'advanceBookLoreFieldCleanup',
  'cancelBookLoreEditReservation',
  'advanceBookLoreEditReservationCleanup',
])
  it('reconstructs uncertain cleanup and exact replay for ' + method, async () => {
    const f = await setup();
    if (['cancelBookLoreFieldUpload', 'advanceBookLoreFieldCleanup'].includes(method))
      await until(f, 'appendBookLoreFieldUpload');
    else await ready(f);
    let lost = false,
      first;
    f.intercept(async (name, input, invoke) => {
      const value = await invoke();
      if (name === method && !lost) {
        lost = true;
        first = structuredClone(input);
        throw Error('lost cleanup');
      }
      return value;
    });
    f.operation.requestCancel();
    for (let n = 0; n < 3000; n++) {
      try {
        await f.operation.advance();
      } catch (e) {
        expect(e.message).toBe('lost cleanup');
        break;
      }
    }
    expect(lost).toBe(true);
    await restore(f);
    await f.operation.advance();
    expect(f.calls.at(-1)).toEqual({ method, input: first });
    await cancelled(f, true);
    expect((await f.client.get(f.bookId, f.entityId)).data).toEqual(f.input.source.data);
  });
for (const [name, mutate] of [
  ['schema', (c) => (c.schemaVersion = 2)],
  ['uid', (c) => (c.uid = 'other')],
  ['writeId', (c) => (c.writeId = 'other')],
  ['source CAS', (c) => (c.sourceToken = 'f'.repeat(64))],
  ['intent', (c) => (c.intentHash = 'f'.repeat(64))],
  ['private extra', (c) => (c.apiKey = 'PRIVATE')],
  ['cursor', (c) => (c.reservationIndex = 1)],
  ['negative count', (c) => (c.completedCalls = -1)],
  ['phase', (c) => (c.phase = 'applied')],
  ['controls digest', (c) => (c.controlsHash = 'f'.repeat(64))],
])
  it('rejects invalid checkpoint ' + name + ' without RPC', async () => {
    const f = await setup(),
      r = capture(f.operation);
    mutate(r.checkpoint);
    await expect(restoreBookLoreEditOperation(f.input, r, f.port, f.options)).rejects.toThrow();
    expect(f.calls).toHaveLength(0);
  });
for (const [name, mutate] of [
  ['intent', (p) => (p.intentHash = 'f'.repeat(64))],
  ['missing', (p) => (p.items = [])],
  ['extra', (p) => p.items.push(p.items[0])],
  ['cursor', (p) => (p.nextOffset = 0)],
  ['job identity', (p) => (p.items[0].id = 'foreign')],
])
  it('rejects control page ' + name + ' without RPC', async () => {
    const f = await setup(),
      r = capture(f.operation),
      read = r.controlsPage;
    r.controlsPage = async (...args) => {
      const page = await read(...args);
      mutate(page);
      return page;
    };
    await expect(restoreBookLoreEditOperation(f.input, r, f.port, f.options)).rejects.toThrow();
    expect(f.calls).toHaveLength(0);
  });
it('rejects stale pages from another checkpoint of the same intent', async () => {
  const f = await setup(),
    old = capture(f.operation);
  await until(f, 'startBookLoreFieldUpload');
  const latest = capture(f.operation);
  latest.controlsPage = old.controlsPage;
  const count = f.calls.length;
  await expect(restoreBookLoreEditOperation(f.input, latest, f.port, f.options)).rejects.toThrow();
  expect(f.calls).toHaveLength(count);
});
it('rejects changed append bytes even with the original operation ID and CAS', async () => {
  const f = await setup();
  await until(f, 'startBookLoreFieldUpload');
  f.intercept(async (name, _input, invoke) => {
    const v = await invoke();
    if (name === 'appendBookLoreFieldUpload') throw Error('lost');
    return v;
  });
  await expect(f.operation.advance()).rejects.toThrow('lost');
  const r = capture(f.operation),
    wire = r.checkpoint.pending.production;
  wire.input.chunkBase64 = btoa('OTHER_PRIVATE_BYTES');
  const count = f.calls.length;
  await expect(restoreBookLoreEditOperation(f.input, r, f.port, f.options)).rejects.toThrow();
  expect(f.calls).toHaveLength(count);
});
it('reconstructs cancel with an accepted producer still pending and closes all own bytes', async () => {
  const f = await setup();
  await until(f, 'startBookLoreFieldUpload');
  let release,
    entered = false;
  f.intercept(async (name, _input, invoke) => {
    const v = await invoke();
    if (name === 'appendBookLoreFieldUpload') {
      entered = true;
      await new Promise((done) => {
        release = done;
      });
    }
    return v;
  });
  const original = f.operation,
    late = original.advance();
  await vi.waitFor(() => expect(entered).toBe(true));
  original.requestCancel();
  await original.advance();
  await restore(f);
  await cancelled(f, true);
  release();
  await late;
  expect(f.operation.snapshot().phase).toBe('cancelled');
  expect((await f.client.get(f.bookId, f.entityId)).data).toEqual(f.input.source.data);
});
it('restores failed cancel/get reconciliation when native adoption won', async () => {
  const f = await setup();
  await ready(f);
  let release,
    entered = false;
  f.intercept(async (name, _input, invoke) => {
    const v = await invoke();
    if (name === 'adoptBookLoreEditGeneration') {
      entered = true;
      await new Promise((done) => {
        release = done;
      });
    }
    return v;
  });
  const late = f.operation.apply();
  await vi.waitFor(() => expect(entered).toBe(true));
  f.operation.requestCancel();
  await expect(f.operation.advance()).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(f.operation.checkpoint().pending.failedCancel).not.toBeNull();
  await restore(f);
  await f.operation.advance();
  expect(f.operation.snapshot().phase).toBe('applied');
  expect(f.calls.some((c) => c.method === 'cancelBookLoreFieldUpload')).toBe(false);
  release();
  await late;
});
it('returns frozen private checkpoint and never accepts the status snapshot as recovery', async () => {
  const f = await setup();
  await until(f, 'startBookLoreFieldUpload');
  f.intercept(async (name, _input, invoke) => {
    const v = await invoke();
    if (name === 'appendBookLoreFieldUpload') throw Error('lost');
    return v;
  });
  await expect(f.operation.advance()).rejects.toThrow('lost');
  const checkpoint = f.operation.checkpoint();
  expect(Object.isFrozen(checkpoint.pending.production.input)).toBe(true);
  expect(checkpoint.pending.production.input.chunkBase64).not.toBeUndefined();
  await expect(
    restoreBookLoreEditOperation(
      f.input,
      { checkpoint: f.operation.snapshot(), controlsPage: async () => null },
      f.port,
      f.options,
    ),
  ).rejects.toThrow();
});
it('restores no-op and cancelled no-op without consulting pages or sending', async () => {
  const f = await setup({ changes: [] }),
    controlsPage = vi.fn();
  for (const cancel of [false, true]) {
    if (cancel) f.operation.requestCancel();
    f.operation = await restoreBookLoreEditOperation(
      f.input,
      { checkpoint: f.operation.checkpoint(), controlsPage },
      f.port,
      f.options,
    );
    await f.operation.advance();
    if (cancel) await expect(f.operation.apply()).rejects.toThrow('preparação');
    else await f.operation.apply();
  }
  expect(controlsPage).not.toHaveBeenCalled();
  expect(f.calls).toHaveLength(0);
});
it('checks context after an asynchronous page read before returning the operation', async () => {
  let active = true;
  const f = await setup({
      guard: () => {
        if (!active) throw Error('context changed');
      },
    }),
    r = capture(f.operation),
    read = r.controlsPage;
  r.controlsPage = async (...args) => {
    const p = await read(...args);
    active = false;
    return p;
  };
  await expect(restoreBookLoreEditOperation(f.input, r, f.port, f.options)).rejects.toThrow(
    'context changed',
  );
  expect(f.calls).toHaveLength(0);
});

it('restores every upload through bounded pages beyond fifty relation uploads', async () => {
  const relations = Array.from({ length: 64 * 52 + 1 }, (_, n) => ({
      targetEntityId: 'target-' + n,
      relationType: 'knows',
      description: 'Private ' + n,
    })),
    f = await setup({ changes: [{ field: 'relations', value: relations }] }),
    r = capture(f.operation),
    read = r.controlsPage,
    seen = [];
  expect(r.checkpoint.uploadCount).toBeGreaterThan(50);
  expect(JSON.stringify(r.checkpoint).length).toBeLessThan(5000);
  r.controlsPage = async (offset, limit) => {
    seen.push([offset, limit]);
    return read(offset, limit);
  };
  await restore(f, r);
  expect(seen).toEqual([
    [0, 50],
    [50, 3],
  ]);
  expect(f.calls).toHaveLength(0);
});

it('aborted production cannot restore but confirmed cancel intent restores cleanup with the same aborted signal', async () => {
  const f = await setup(),
    controller = new AbortController(),
    recovery = capture(f.operation);
  controller.abort();
  await expect(
    restoreBookLoreEditOperation(f.input, recovery, f.port, {
      ...f.options,
      signal: controller.signal,
    }),
  ).rejects.toThrow();
  expect(f.calls).toHaveLength(0);
  f.operation.requestCancel();
  f.operation = await restoreBookLoreEditOperation(f.input, capture(f.operation), f.port, {
    ...f.options,
    signal: controller.signal,
  });
  await cancelled(f, true);
  expect(f.operation.snapshot().phase).toBe('cancelled');
});
for (const field of ['operationId', 'expectedRevision', 'uploadId'])
  it('rejects changed pending ' + field + ' before RPC', async () => {
    const f = await setup();
    await until(f, 'startBookLoreFieldUpload');
    f.intercept(async (name, _input, invoke) => {
      const r = await invoke();
      if (name === 'appendBookLoreFieldUpload') throw Error('lost');
      return r;
    });
    await expect(f.operation.advance()).rejects.toThrow('lost');
    const r = capture(f.operation),
      input = r.checkpoint.pending.production.input;
    if (field === 'expectedRevision') input.expectedRevision++;
    else if (field === 'uploadId') input.uploadId = 'lore-field-' + 'f'.repeat(64);
    else input.operationId = 'other-operation';
    const count = f.calls.length;
    await expect(restoreBookLoreEditOperation(f.input, r, f.port, f.options)).rejects.toThrow();
    expect(f.calls).toHaveLength(count);
  });

it('restores multi-part text, multiple reservation slots, removals and relation pages between units', async () => {
  const f = await setup(),
    relations = structuredClone(f.input.source.data.relations),
    literal = '\ufeff' + '🌙'.repeat(40000) + '\r\n ';
  relations[0].description = 'Changed first page';
  relations[64].description = 'Changed second page';
  f.input = {
    ...f.input,
    changes: [
      { field: 'summary', value: literal },
      { field: 'aliases', remove: true },
      { field: 'isPublic', value: false },
      { field: 'relations', value: relations },
    ],
  };
  f.operation = await prepareBookLoreEditOperation(f.input, f.port, f.options);
  expect(f.operation.snapshot().uploads.count).toBe(4);
  await ready(f, true);
  expect((await f.client.get(f.bookId, f.entityId)).data).toEqual(f.input.source.data);
  expect(f.operation.checkpoint().reservationIndex).toBe(4);
  await f.operation.apply();
  await restore(f);
  const data = (await f.client.get(f.bookId, f.entityId)).data;
  expect(data.summary).toBe(literal);
  expect(data.relations).toEqual(relations);
  expect(data.isPublic).toBe(false);
  expect(Object.hasOwn(data, 'aliases')).toBe(false);
  expect(f.calls.filter((c) => c.method === 'appendBookLoreFieldUpload').length).toBeGreaterThan(4);
});

it('reconstructs reconciliation that finds no adoption and preserves the original cancel for retry', async () => {
  const f = await setup();
  await ready(f);
  let rejected = false;
  f.intercept(async (name, _input, invoke) => {
    if (name === 'cancelBookLoreEditReservation' && !rejected) {
      rejected = true;
      throw Object.assign(Error('fixture transient conflict'), { code: 'failed-precondition' });
    }
    return invoke();
  });
  f.operation.requestCancel();
  await expect(f.operation.advance()).rejects.toMatchObject({ code: 'failed-precondition' });
  const first = structuredClone(f.calls.at(-1));
  await restore(f);
  await f.operation.advance();
  expect(f.operation.checkpoint().pending.failedCancel).toBeNull();
  expect(f.operation.checkpoint().pending.cleanup).toEqual(first);
  await restore(f);
  await f.operation.advance();
  expect(f.calls.at(-1)).toEqual(first);
  await cancelled(f, true);
  expect(f.operation.snapshot().phase).toBe('cancelled');
  expect((await f.client.get(f.bookId, f.entityId)).data).toEqual(f.input.source.data);
});
