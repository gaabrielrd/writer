// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { prepareBookLoreEditOperation } from '../services/bookLoreEditOperation.ts';
import { createBookLoreReadClient } from '../services/bookLoreReadClient.ts';
import { createBookLoreReadService } from '../../../../functions/src/bookLoreRead.mjs';
import { createBookLoreEditTransportService } from '../../../../functions/src/bookLoreEditTransport.mjs';
import { adventureImportDb } from '../../../../functions/test/helpers/adventureImportDb.mjs';
import { loreLogicalFixture } from '../../../../functions/test/helpers/bookLoreLogicalFixture.mjs';
afterEach(() => vi.unstubAllGlobals());
async function setup({
  mode = 'v1',
  changes,
  writeId = 'client-edit-operation',
  guard = () => {},
} = {}) {
  vi.stubGlobal('crypto', webcrypto);
  const f = adventureImportDb({ nativeUpdates: true }),
    seed = await loreLogicalFixture(f.db, { mode }),
    read = createBookLoreReadService({ db: f.db }),
    client = createBookLoreReadClient((name, input) => read[name](seed.uid, input), guard),
    source = await client.capture(seed.bookId, seed.entityId),
    server = createBookLoreEditTransportService({ db: f.db, now: () => 8000 }),
    calls = [];
  let intercept = null;
  const port = {
    call: async (method, input) => {
      calls.push({ method, input: structuredClone(input) });
      const invoke = () => server.bookLoreEdit(seed.uid, { method, input });
      return intercept ? intercept(method, input, invoke) : invoke();
    },
  };
  const operation = await prepareBookLoreEditOperation(
    {
      uid: seed.uid,
      writeId,
      source,
      changes: changes ?? [{ field: 'summary', value: 'OWN_DRAFT_LITERAL' }],
    },
    port,
    { guard, yieldControl: async () => {} },
  );
  return {
    ...f,
    ...seed,
    source,
    client,
    calls,
    port,
    operation,
    intercept: (fn) => {
      intercept = fn;
    },
  };
}
async function ready(f) {
  for (let i = 0; i < 3000; i++) {
    const s = f.operation.snapshot();
    if (s.phase === 'ready' || s.phase === 'applied') return s;
    expect(s.phase).toBe('preparing');
    await f.operation.advance();
  }
  throw Error('Did not reach ready');
}
async function cancelled(f) {
  f.operation.requestCancel();
  for (let i = 0; i < 3000; i++) {
    const s = f.operation.snapshot();
    if (s.phase === 'cancelled' || s.phase === 'applied') return s;
    try {
      await f.operation.advance();
    } catch (e) {
      if (!String(e.code).includes('failed-precondition')) throw e;
    }
  }
  throw Error('Did not finish cleanup');
}
async function until(f, method) {
  for (let i = 0; i < 3000; i++) {
    await f.operation.advance();
    if (f.calls.at(-1)?.method === method) return;
  }
  throw Error('Milestone not reached');
}
const records = (f) => structuredClone([...f.records]);
const physical = (f) =>
  structuredClone([...f.records].filter(([p]) => /\/bookResource(Bodies|Chunks)\//u.test(p)));
for (const mode of ['inline', 'v1', 'v2', 'created'])
  it(
    'real per-unit edit ' +
      mode +
      ' reaches ready without adopting, then explicit apply preserves source and one clock',
    async () => {
      const f = await setup({ mode }),
        before = structuredClone(f.source.data),
        clock = f.records.get('books/book').localLoreVersion;
      expect(f.calls).toHaveLength(0);
      await ready(f);
      expect((await f.client.get(f.bookId, f.entityId)).data).toEqual(before);
      expect(f.records.get('users/author').credits).toBe(5);
      expect(JSON.stringify(f.operation.snapshot())).not.toContain('OWN_DRAFT_LITERAL');
      expect(f.calls.some((c) => c.method === 'adoptBookLoreEditGeneration')).toBe(false);
      expect((await f.operation.apply()).phase).toBe('applied');
      expect((await f.client.get(f.bookId, f.entityId)).data).toEqual({
        ...before,
        summary: 'OWN_DRAFT_LITERAL',
        updatedAt: 8000,
      });
      expect(f.records.get('books/book').localLoreVersion).toBe(clock + 1);
      const all = records(f),
        count = f.calls.length;
      await f.operation.apply();
      await f.operation.advance();
      f.operation.requestCancel();
      expect(records(f)).toEqual(all);
      expect(f.calls).toHaveLength(count);
    },
  );
it('no-op never creates server jobs or sends an RPC', async () => {
  const f = await setup({ changes: [] });
  expect(f.operation.snapshot().phase).toBe('empty');
  await f.operation.advance();
  await f.operation.apply();
  f.operation.requestCancel();
  expect(f.calls).toHaveLength(0);
});
it('relation-page and removal intents follow actual seal, reservation and privacy semantics', async () => {
  const f = await setup(),
    relations = structuredClone(f.source.data.relations);
  relations[64].description = 'Changed page literal';
  f.operation = await prepareBookLoreEditOperation(
    {
      uid: f.uid,
      writeId: 'page-and-removal',
      source: f.source,
      changes: [
        { field: 'relations', value: relations },
        { field: 'aliases', remove: true },
        { field: 'isPublic', value: false },
      ],
    },
    f.port,
    { yieldControl: async () => {} },
  );
  await ready(f);
  await f.operation.apply();
  const result = (await f.client.get(f.bookId, f.entityId)).data;
  expect(result.relations).toEqual(relations);
  expect(Object.hasOwn(result, 'aliases')).toBe(false);
  expect(result.isPublic).toBe(false);
  expect(
    f.calls.filter((c) => c.method === 'startBookLoreFieldUpload').map((c) => c.input.target),
  ).toEqual([{ field: 'isPublic' }, { field: 'relations', page: 1, count: 1 }]);
  expect(f.records.get('books/book').publicationPrivacyVersion).toBe(1);
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
])
  it('lost reply retries exact method, operationId, CAS and bytes for ' + method, async () => {
    const f = await setup();
    let lost = false,
      first;
    f.intercept(async (name, input, invoke) => {
      const result = await invoke();
      if (name === method && !lost) {
        lost = true;
        first = structuredClone(input);
        throw Error('lost response');
      }
      return result;
    });
    let caught = false;
    for (let i = 0; i < 3000; i++) {
      try {
        if (f.operation.snapshot().phase === 'ready') await f.operation.apply();
        else await f.operation.advance();
      } catch (e) {
        expect(e.message).toBe('lost response');
        caught = true;
        expect(f.operation.snapshot().pending.production.method).toBe(method);
        await f.operation.advance();
        expect(f.calls.at(-1)).toEqual({ method, input: first });
        break;
      }
    }
    expect(caught).toBe(true);
    if (f.operation.snapshot().phase !== 'applied') {
      await ready(f);
      await f.operation.apply();
    }
    expect((await f.client.get(f.bookId, f.entityId)).data.summary).toBe('OWN_DRAFT_LITERAL');
    expect(f.records.get('users/author').credits).toBe(5);
  });
for (const milestone of [
  'none',
  'startBookLoreSourceInspection',
  'appendBookLoreFieldUpload',
  'advanceBookLoreFieldSeal',
  'initializeBookLoreEditGeneration',
  'reserveBookLoreEditUpload',
  'advanceBookLoreEditCompilation',
  'ready',
])
  it('cancel at ' + milestone + ' cleans own bytes and keeps source and receipts', async () => {
    const f = await setup(),
      before = structuredClone(f.source.data),
      originalBodies = physical(f);
    if (milestone === 'ready') await ready(f);
    else if (milestone !== 'none') await until(f, milestone);
    expect((await cancelled(f)).phase).toBe('cancelled');
    expect((await f.client.get(f.bookId, f.entityId)).data).toEqual(before);
    expect(physical(f)).toEqual(originalBodies);
    expect(
      [...f.records.keys()].some((p) => p.startsWith('users/author/bookLoreSourceInspections/')),
    ).toBe(true);
    expect(f.records.get('users/author').credits).toBe(5);
    const all = records(f);
    await f.operation.advance();
    expect(records(f)).toEqual(all);
  });
it('cleanup after revocation never replays the uncertain producer request', async () => {
  const f = await setup();
  let lost = false;
  f.intercept(async (name, _input, invoke) => {
    const r = await invoke();
    if (name === 'appendBookLoreFieldUpload' && !lost) {
      lost = true;
      throw Error('lost response');
    }
    return r;
  });
  for (let i = 0; i < 3000; i++) {
    try {
      await f.operation.advance();
    } catch (e) {
      expect(e.message).toBe('lost response');
      break;
    }
  }
  expect(lost).toBe(true);
  await f.db.runTransaction(async (tx) => tx.update(f.db.doc('books/book'), { authorId: 'other' }));
  const count = f.calls.filter((c) => c.method === 'appendBookLoreFieldUpload').length;
  expect((await cancelled(f)).phase).toBe('cancelled');
  expect(f.calls.filter((c) => c.method === 'appendBookLoreFieldUpload')).toHaveLength(count);
});
it('a nonresponding start can be fenced and its late reply cannot reopen the operation', async () => {
  const f = await setup();
  let release,
    entered = false;
  f.intercept(async (name, _input, invoke) => {
    if (name === 'startBookLoreSourceInspection') {
      entered = true;
      await new Promise((r) => {
        release = r;
      });
    }
    return invoke();
  });
  const pending = f.operation.advance();
  await vi.waitFor(() => expect(entered).toBe(true));
  await expect(f.operation.advance()).rejects.toThrow('andamento');
  expect((await cancelled(f)).phase).toBe('cancelled');
  release();
  await pending;
  expect(f.operation.snapshot().phase).toBe('cancelled');
  expect((await f.client.get(f.bookId, f.entityId)).data).toEqual(f.source.data);
});
it('a committed append with delayed response cannot overwrite confirmed cleanup', async () => {
  const f = await setup();
  await until(f, 'startBookLoreFieldUpload');
  let release,
    entered = false;
  f.intercept(async (name, _input, invoke) => {
    const r = await invoke();
    if (name === 'appendBookLoreFieldUpload') {
      entered = true;
      await new Promise((done) => {
        release = done;
      });
    }
    return r;
  });
  const pending = f.operation.advance();
  await vi.waitFor(() => expect(entered).toBe(true));
  expect((await cancelled(f)).phase).toBe('cancelled');
  release();
  await pending;
  expect(f.operation.snapshot().phase).toBe('cancelled');
});
it('when native apply wins cancellation, metadata confirms own success before child cleanup', async () => {
  const f = await setup();
  await ready(f);
  let release,
    entered = false;
  f.intercept(async (name, _input, invoke) => {
    const r = await invoke();
    if (name === 'adoptBookLoreEditGeneration') {
      entered = true;
      await new Promise((done) => {
        release = done;
      });
    }
    return r;
  });
  const pending = f.operation.apply();
  await vi.waitFor(() => expect(entered).toBe(true));
  f.operation.requestCancel();
  await expect(f.operation.advance()).rejects.toMatchObject({ code: 'failed-precondition' });
  expect((await f.operation.advance()).phase).toBe('applied');
  expect(f.calls.some((c) => c.method === 'cancelBookLoreFieldUpload')).toBe(false);
  release();
  await pending;
  expect(f.operation.snapshot().phase).toBe('applied');
});
it('account guards keep uncertain controls and prevent RPC until the actor returns', async () => {
  let active = true;
  const guard = () => {
      if (!active) throw Error('account changed');
    },
    f = await setup({ guard });
  f.intercept(async (_name, _input, invoke) => {
    const result = await invoke();
    active = false;
    return result;
  });
  await expect(f.operation.advance()).rejects.toThrow('account changed');
  const pending = f.operation.snapshot().pending.production,
    count = f.calls.length;
  await expect(f.operation.advance()).rejects.toThrow('account changed');
  expect(f.calls).toHaveLength(count);
  expect(f.operation.snapshot().pending.production).toEqual(pending);
  active = true;
  f.intercept(null);
  await f.operation.advance();
  expect(f.calls[1]).toEqual(f.calls[0]);
});
it('malformed progress preserves the exact request rather than adopting remote scalar state', async () => {
  const f = await setup();
  let corrupt = true;
  f.intercept(async (_name, _input, invoke) => {
    const result = await invoke();
    return corrupt ? { ...result, startHash: 'b'.repeat(64) } : result;
  });
  await expect(f.operation.advance()).rejects.toThrow();
  expect(f.operation.snapshot().pending.production).not.toBeNull();
  corrupt = false;
  await f.operation.advance();
  expect(f.calls[1]).toEqual(f.calls[0]);
});

it('cleanup reports native deferral without leaking arbitrary reason text or dropping controls', async () => {
  const f = await setup();
  await until(f, 'appendBookLoreFieldUpload');
  f.operation.requestCancel();
  await f.operation.advance();
  let blocked = false;
  f.intercept(async (name, _input, invoke) => {
    const r = await invoke();
    if (name === 'advanceBookLoreFieldCleanup' && !blocked) {
      blocked = true;
      return { ...r, blocked: 'active-head' };
    }
    return r;
  });
  const s = await f.operation.advance();
  expect(s.phase).toBe('cancelling');
  expect(s.blockedReason).toBe('active-head');
  expect(s.uploads.count).toBe(1);
  expect((await cancelled(f)).phase).toBe('cancelled');
});
it('abort stops production but explicit cancellation can still close all known jobs', async () => {
  const f = await setup(),
    controller = new AbortController(),
    op = await prepareBookLoreEditOperation(
      {
        uid: f.uid,
        writeId: 'abort-operation',
        source: f.source,
        changes: [{ field: 'summary', value: 'new' }],
      },
      f.port,
      { signal: controller.signal, yieldControl: async () => {} },
    );
  f.operation = op;
  await op.advance();
  controller.abort();
  const count = f.calls.length;
  await expect(op.advance()).rejects.toThrow();
  expect(f.calls).toHaveLength(count);
  expect((await cancelled(f)).phase).toBe('cancelled');
});
for (const method of [
  'cancelBookLoreSourceInspection',
  'cancelBookLoreFieldUpload',
  'advanceBookLoreFieldCleanup',
  'cancelBookLoreEditReservation',
  'advanceBookLoreEditReservationCleanup',
])
  it('lost cleanup reply repeats the original request for ' + method, async () => {
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
        throw Error('lost cleanup response');
      }
      return r;
    });
    f.operation.requestCancel();
    for (let i = 0; i < 3000; i++) {
      try {
        await f.operation.advance();
      } catch (e) {
        expect(e.message).toBe('lost cleanup response');
        await f.operation.advance();
        expect(f.calls.at(-1)).toEqual({ method, input: first });
        break;
      }
      if (f.operation.snapshot().phase === 'cancelled') break;
    }
    expect(lost).toBe(true);
    expect((await cancelled(f)).phase).toBe('cancelled');
  });

it('a pending append cannot create bytes after its upload has been cancelled', async () => {
  const f = await setup();
  await until(f, 'startBookLoreFieldUpload');
  let entered = false,
    release;
  f.intercept(async (name, _input, invoke) => {
    if (name === 'appendBookLoreFieldUpload') {
      entered = true;
      await new Promise((done) => {
        release = done;
      });
    }
    return invoke();
  });
  const pending = f.operation.advance(),
    rejected = expect(pending).rejects.toMatchObject({ code: 'failed-precondition' });
  await vi.waitFor(() => expect(entered).toBe(true));
  expect((await cancelled(f)).phase).toBe('cancelled');
  const before = physical(f);
  release();
  await rejected;
  expect(f.operation.snapshot().phase).toBe('cancelled');
  expect(physical(f)).toEqual(before);
});
it('native cancellation can win before a delayed apply without changing the active source', async () => {
  const f = await setup();
  await ready(f);
  let entered = false,
    release;
  f.intercept(async (name, _input, invoke) => {
    if (name === 'adoptBookLoreEditGeneration') {
      entered = true;
      await new Promise((done) => {
        release = done;
      });
    }
    return invoke();
  });
  const pending = f.operation.apply(),
    rejected = expect(pending).rejects.toMatchObject({ code: 'failed-precondition' });
  await vi.waitFor(() => expect(entered).toBe(true));
  expect((await cancelled(f)).phase).toBe('cancelled');
  release();
  await rejected;
  expect((await f.client.get(f.bookId, f.entityId)).data).toEqual(f.source.data);
  expect(f.operation.snapshot().phase).toBe('cancelled');
});
for (const [label, corrupt] of [
  ['unknown prose', (r) => ({ ...r, body: 'PRIVATE' })],
  ['overflow', (r) => ({ ...r, totalParts: Number.MAX_SAFE_INTEGER })],
  ['ready flag', (r) => ({ ...r, ready: true })],
  ['unknown phase', (r) => ({ ...r, phase: 'published' })],
  ['negative revision', (r) => ({ ...r, revision: -1 })],
])
  it('invalid ' + label + ' reply keeps its request and never reaches ready', async () => {
    const f = await setup();
    let first = true;
    f.intercept(async (_name, _input, invoke) => {
      const r = await invoke();
      return first ? corrupt(r) : r;
    });
    await expect(f.operation.advance()).rejects.toThrow();
    const s = f.operation.snapshot();
    expect(s.phase).toBe('preparing');
    expect(s.inspection).toBeNull();
    expect(JSON.stringify(s)).not.toContain('PRIVATE');
    expect(s.pending.production).not.toBeNull();
    first = false;
    await f.operation.advance();
    expect(f.calls[1]).toEqual(f.calls[0]);
  });

it('large multipart production uses one sequential iterator and keeps bytes exact after a lost reply', async () => {
  const f = await setup(),
    value = '\ufeff' + 'x'.repeat(9 * 1024 * 1024) + '🌙',
    yieldControl = vi.fn(async () => {});
  f.operation = await prepareBookLoreEditOperation(
    {
      uid: f.uid,
      writeId: 'large-sequential',
      source: f.source,
      changes: [{ field: 'details', value }],
    },
    f.port,
    { yieldControl },
  );
  const total = 145;
  expect(yieldControl).toHaveBeenCalledTimes(total);
  let lost = false;
  f.intercept(async (name, _input, invoke) => {
    const r = await invoke();
    if (name === 'appendBookLoreFieldUpload' && !lost) {
      lost = true;
      throw Error('lost chunk reply');
    }
    return r;
  });
  for (let i = 0; i < 3000 && f.operation.snapshot().phase !== 'ready'; i++) {
    try {
      await f.operation.advance();
    } catch (e) {
      expect(e.message).toBe('lost chunk reply');
    }
  }
  expect(f.operation.snapshot().phase).toBe('ready');
  expect(lost).toBe(true);
  expect(f.calls.filter((c) => c.method === 'appendBookLoreFieldUpload')).toHaveLength(total + 1);
  expect(yieldControl).toHaveBeenCalledTimes(total);
  await f.operation.apply();
  expect((await f.client.get(f.bookId, f.entityId)).data.details).toBe(value);
}, 30000);
it('metadata intent hash distinguishes edits without retaining their prose in the snapshot', async () => {
  const f = await setup(),
    other = await prepareBookLoreEditOperation(
      {
        uid: f.uid,
        writeId: 'client-edit-operation',
        source: f.source,
        changes: [{ field: 'summary', value: 'DIFFERENT PRIVATE VALUE' }],
      },
      f.port,
      { yieldControl: async () => {} },
    );
  expect(f.operation.snapshot().intentHash).toMatch(/^[a-f0-9]{64}$/);
  expect(f.operation.snapshot().intentHash).not.toBe(other.snapshot().intentHash);
  expect(JSON.stringify(other.snapshot())).not.toContain('DIFFERENT PRIVATE VALUE');
  expect(f.calls).toHaveLength(0);
});

it('status stays bounded with 100 relation uploads and controls are explicitly paginated', async () => {
  const f = await setup(),
    relations = Array.from({ length: 6400 }, (_, i) => ({
      targetEntityId: 'target-' + i,
      relationType: 'new relation',
    }));
  f.operation = await prepareBookLoreEditOperation(
    {
      uid: f.uid,
      writeId: 'many-pages',
      source: f.source,
      changes: [{ field: 'relations', value: relations }],
    },
    f.port,
    { yieldControl: async () => {} },
  );
  const op = f.operation,
    initial = op.snapshot();
  expect(initial.uploads.count).toBe(100);
  expect(JSON.stringify(initial).length).toBeLessThan(3000);
  const page1 = op.controlsPage(),
    page2 = op.controlsPage(page1.nextOffset);
  expect(page1.items).toHaveLength(50);
  expect(page2.items).toHaveLength(50);
  expect(page2.nextOffset).toBeNull();
  expect(new Set([...page1.items, ...page2.items].map((c) => c.id)).size).toBe(100);
  expect(page1.intentHash).toBe(initial.intentHash);
  expect(Object.isFrozen(page1.items)).toBe(true);
  for (let i = 0; i < 55; i++) expect(JSON.stringify(await op.advance()).length).toBeLessThan(4000);
  expect(op.snapshot().uploads.completed).toBeGreaterThan(1);
  for (const [offset, limit] of [
    [-1, 50],
    [101, 1],
    [0, 51],
    [0, 0],
    [0, 0.5],
  ])
    expect(() => op.controlsPage(offset, limit)).toThrow();
});
