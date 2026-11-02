// @vitest-environment node
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { prepareBookLoreEditOperation } from '../services/bookLoreEditOperation.ts';
import { createBookLoreJournal, openBookLoreJournal } from '../services/bookLoreJournal.ts';
import { captureBookLoreEditCheckpoint } from '../services/bookLoreCheckpointBundle.ts';
import { checkpointJournal } from '../services/bookLoreCheckpointJournal.ts';
import { commitJournalHead } from '../services/bookLoreJournalDb.ts';
import { bookLoreWriteHash as hash } from '../services/bookLoreWritePayload.ts';
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
async function setup({ big = false } = {}) {
  const f = adventureImportDb({ nativeUpdates: true }),
    seed = await loreLogicalFixture(f.db, { mode: 'inline' }),
    reader = createBookLoreReadService({ db: f.db }),
    client = createBookLoreReadClient(
      (m, input) => reader[m](seed.uid, input),
      () => {},
    ),
    source = await client.capture(seed.bookId, seed.entityId),
    input = {
      uid: seed.uid,
      writeId: 'stored-checkpoint',
      source,
      changes: [
        {
          field: 'summary',
          value: big ? '\ufeff' + '🌙'.repeat(40000) + '\r\n' : ' CP_PRIVATE_🌙\r\n ',
        },
      ],
    },
    server = createBookLoreEditTransportService({ db: f.db, now: () => 8000 }),
    calls = [];
  let journal,
    allowed = true,
    current = true,
    gets = 0,
    intercept = null;
  const nativePort = {
      async call(method, input) {
        calls.push({ method, input: structuredClone(input) });
        const invoke = () => server.bookLoreEdit(seed.uid, { method, input });
        return intercept ? intercept(method, input, invoke) : invoke();
      },
    },
    port = { call: (method, input) => journal.send(nativePort, { method, input }) },
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
      guard() {
        if (!current) throw Error('context changed');
      },
      yieldControl: async () => {},
      async getKey() {
        gets++;
        if (!allowed) throw Error('source revoked');
        return { identity, key };
      },
    };
  journal = await createBookLoreJournal(identity, options);
  await journal.writeDraft(input);
  return {
    ...f,
    ...seed,
    client,
    input,
    identity,
    options,
    op,
    port,
    calls,
    nativePort,
    get j() {
      return journal;
    },
    open: async () => {
      journal = await openBookLoreJournal(identity, options);
      return journal;
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
  };
}
async function collect(f) {
  for (let n = 0; n < 10000; n++) {
    if (!(await f.j.inspect()).checkpoint?.garbage) return;
    await f.j.advanceCheckpointCleanup();
  }
  throw Error('garbage not collected');
}
async function persistAccepted(f) {
  const head = await f.j.inspect(),
    snapshot = f.op.snapshot(),
    confirmed = [];
  if (head.production?.state === 'pending' && snapshot.pending.production === null)
    confirmed.push({ lane: 'production', requestHash: head.production.requestHash });
  await f.j.writeCheckpoint(captureBookLoreEditCheckpoint(f.op, confirmed));
  await collect(f);
}
it('persists root/pages as ciphertext and reconstructs the coordinator after opening a fresh handle', async () => {
  const f = await setup(),
    bundle = captureBookLoreEditCheckpoint(f.op);
  await f.j.writeCheckpoint(bundle);
  const rows = JSON.stringify(h.rows());
  for (const literal of ['CP_PRIVATE', 'contentHash', 'controlsHash', 'chunkBase64', 'keyBase64'])
    expect(rows).not.toContain(literal);
  expect((await f.j.inspect()).checkpoint.active.complete).toBe(true);
  const before = f.gets();
  await f.open();
  expect(await f.j.readCheckpoint()).toEqual(bundle);
  const restored = await f.j.restoreCheckpointOperation(f.port, { yieldControl: async () => {} });
  expect(restored.snapshot()).toEqual(f.op.snapshot());
  expect(f.calls).toHaveLength(0);
  expect(f.gets()).toBeGreaterThan(before);
});
it('restores solely from protected storage between native units and keeps one explicit adoption', async () => {
  const f = await setup();
  await f.j.writeCheckpoint(captureBookLoreEditCheckpoint(f.op));
  const clock = f.records.get('books/book').localLoreVersion;
  for (let n = 0; n < 1000; n++) {
    if (f.op.snapshot().phase === 'ready') break;
    await f.op.advance();
    await persistAccepted(f);
    const snapshot = f.op.snapshot(),
      count = f.calls.length;
    await f.open();
    f.op = await f.j.restoreCheckpointOperation(f.port, { yieldControl: async () => {} });
    expect(f.op.snapshot()).toEqual(snapshot);
    expect(f.calls).toHaveLength(count);
  }
  expect(f.op.snapshot().phase).toBe('ready');
  expect((await f.client.get(f.bookId, f.entityId)).data).toEqual(f.input.source.data);
  await f.op.apply();
  await persistAccepted(f);
  await f.open();
  f.op = await f.j.restoreCheckpointOperation(f.port, { yieldControl: async () => {} });
  expect(f.op.snapshot().phase).toBe('applied');
  expect((await f.client.get(f.bookId, f.entityId)).data.summary).toBe(f.input.changes[0].value);
  expect(f.records.get('books/book').localLoreVersion).toBe(clock + 1);
});
it('recovers a multi-frame private pending append and replays exact wire after a reload equivalent', async () => {
  const f = await setup({ big: true });
  let lost = false,
    first;
  f.intercept(async (method, input, invoke) => {
    const result = await invoke();
    if (method === 'appendBookLoreFieldUpload' && !lost) {
      lost = true;
      first = structuredClone(input);
      throw Error('lost append');
    }
    return result;
  });
  for (let n = 0; n < 1000; n++) {
    try {
      await f.op.advance();
      const head = await f.j.inspect();
      if (head.production?.state === 'pending' && f.op.snapshot().pending.production === null)
        await f.j.confirmPending('production', head.production.requestHash);
    } catch (e) {
      expect(e.message).toBe('lost append');
      break;
    }
  }
  expect(lost).toBe(true);
  const bundle = captureBookLoreEditCheckpoint(f.op);
  await f.j.writeCheckpoint(bundle);
  expect((await f.j.inspect()).checkpoint.active.chunkCount).toBeGreaterThan(1);
  expect(JSON.stringify(h.rows())).not.toContain(first.chunkBase64);
  await f.open();
  f.op = await f.j.restoreCheckpointOperation(f.port, { yieldControl: async () => {} });
  await f.op.advance();
  expect(f.calls.at(-1)).toEqual({ method: 'appendBookLoreFieldUpload', input: first });
});
it('keeps prior active during a partial write and resumes only the exact captured bundle', async () => {
  const f = await setup(),
    old = captureBookLoreEditCheckpoint(f.op);
  await f.j.writeCheckpoint(old);
  await f.op.advance();
  const next = captureBookLoreEditCheckpoint(f.op);
  h.abortAt(h.commits() + 2);
  await expect(f.j.writeCheckpoint(next)).rejects.toThrow();
  const head = await f.j.inspect();
  expect(head.checkpoint.pending.written).toBe(0);
  expect(await f.j.readCheckpoint()).toEqual(old);
  const divergent = structuredClone(next);
  divergent.checkpoint.completedCalls++;
  await expect(f.j.writeCheckpoint(divergent)).rejects.toThrow();
  await f.j.writeCheckpoint(next);
  expect(await f.j.readCheckpoint()).toEqual(next);
  expect((await f.j.inspect()).checkpoint.garbage.blob.generation).toBe(
    head.checkpoint.active.generation,
  );
});
it('atomically promotes complete interrupted staging and confirms the accepted unit after opening', async () => {
  const f = await setup(),
    old = captureBookLoreEditCheckpoint(f.op);
  await f.j.writeCheckpoint(old);
  await f.op.advance();
  const head = await f.j.inspect(),
    bundle = captureBookLoreEditCheckpoint(f.op, [
      { lane: 'production', requestHash: head.production.requestHash },
    ]);
  h.abortAt(h.commits() + 3);
  await expect(f.j.writeCheckpoint(bundle)).rejects.toThrow();
  const failed = await f.j.inspect();
  expect(failed.checkpoint.pending.written).toBe(failed.checkpoint.pending.chunkCount);
  expect(failed.production.state).toBe('pending');
  expect(failed.checkpoint.active.generation).toBe(head.checkpoint.active.generation);
  await f.open();
  expect(await f.j.readCheckpoint(true)).toEqual(old);
  expect(await f.j.readCheckpoint()).toEqual(bundle);
  expect((await f.j.inspect()).production.state).toBe('confirmed');
});
it('rejects mismatched acknowledgement without confirming the unit or replacing prior active', async () => {
  const f = await setup(),
    old = captureBookLoreEditCheckpoint(f.op);
  await f.j.writeCheckpoint(old);
  await f.op.advance();
  const bundle = captureBookLoreEditCheckpoint(f.op, [
    { lane: 'production', requestHash: 'f'.repeat(64) },
  ]);
  await expect(f.j.writeCheckpoint(bundle)).rejects.toThrow();
  expect((await f.j.inspect()).production.state).toBe('pending');
  expect(await f.j.readCheckpoint(true)).toEqual(old);
  await expect(f.j.readCheckpoint()).rejects.toThrow();
});
it('waits for oncomplete and excludes stale handles with shared CAS', async () => {
  const f = await setup();
  h.hold();
  let resolved = false;
  const pending = f.j.writeCheckpoint(captureBookLoreEditCheckpoint(f.op)).then(() => {
    resolved = true;
  });
  await vi.waitFor(() => expect(h.held()).toBeGreaterThan(0));
  expect(resolved).toBe(false);
  h.release();
  await pending;
  const old = f.j;
  await f.open();
  await expect(old.writeCheckpoint(captureBookLoreEditCheckpoint(f.op))).rejects.toThrow();
});
it('preserves corruption and refuses key revocation before decrypt and at the end of a read', async () => {
  const f = await setup(),
    bundle = captureBookLoreEditCheckpoint(f.op);
  await f.j.writeCheckpoint(bundle);
  const decrypt = crypto.subtle.decrypt.bind(crypto.subtle),
    spy = vi.spyOn(crypto.subtle, 'decrypt');
  f.allowed(false);
  await expect(f.j.readCheckpoint()).rejects.toThrow('source revoked');
  expect(spy).not.toHaveBeenCalled();
  f.allowed(true);
  spy.mockImplementation(async (...args) => {
    const result = await decrypt(...args);
    f.allowed(false);
    return result;
  });
  await expect(f.j.readCheckpoint()).rejects.toThrow('source revoked');
  spy.mockRestore();
  f.allowed(true);
  const row = h.rows().find((r) => r.store === 'frames' && r.k[2] === 'checkpoint' && r.k[4] === 0);
  new Uint8Array(row.value.nonce)[0] ^= 1;
  await expect(f.j.readCheckpoint()).rejects.toThrow();
  expect((await f.j.inspect()).checkpoint.active.complete).toBe(true);
  expect(h.rows().some((r) => r.k?.[2] === 'checkpoint')).toBe(true);
});
it('honors monotonic journal cancel when restoring an older non-cancelled checkpoint', async () => {
  const f = await setup();
  await f.j.writeCheckpoint(captureBookLoreEditCheckpoint(f.op));
  await f.j.requestCancel();
  await f.open();
  const op = await f.j.restoreCheckpointOperation(f.port, { yieldControl: async () => {} });
  expect(op.snapshot().phase).toBe('cancelling');
  expect(f.calls).toHaveLength(0);
});
it('reads legacy journal headers without inventing a checkpoint', async () => {
  const f = await setup(),
    rows = h.stores.get('heads'),
    row = rows.get(JSON.stringify([f.uid, f.input.writeId]));
  delete row.value.checkpoint;
  await f.open();
  expect((await f.j.inspect()).checkpoint).toBeNull();
  expect(await f.j.readCheckpoint()).toBeNull();
  expect(f.calls).toHaveLength(0);
});
for (const [name, change] of [
  ['scope', (b) => (b.checkpoint.intentHash = 'f'.repeat(64))],
  ['extra credential', (b) => (b.checkpoint.apiKey = 'PRIVATE')],
  ['mixed page', (b) => (b.pages[0].intentHash = 'f'.repeat(64))],
  [
    'duplicate confirmation',
    (b) =>
      (b.confirmed = [
        { lane: 'cleanup', requestHash: 'f'.repeat(64) },
        { lane: 'cleanup', requestHash: 'f'.repeat(64) },
      ]),
  ],
])
  it('refuses invalid bundle ' + name + ' before creating checkpoint frames', async () => {
    const f = await setup(),
      bundle = structuredClone(captureBookLoreEditCheckpoint(f.op));
    change(bundle);
    await expect(f.j.writeCheckpoint(bundle)).rejects.toThrow();
    expect((await f.j.inspect()).checkpoint).toBeNull();
  });
it('bounds generation cleanup, needs no key and preserves draft/native data', async () => {
  const f = await setup(),
    bundle = captureBookLoreEditCheckpoint(f.op);
  await f.j.writeCheckpoint(bundle);
  await f.op.advance();
  await f.j.writeCheckpoint(captureBookLoreEditCheckpoint(f.op));
  const before = (await f.j.inspect()).draft,
    records = structuredClone([...f.records]);
  f.allowed(false);
  await expect(f.j.advanceCheckpointCleanup(51)).rejects.toThrow();
  const g = (await f.j.inspect()).checkpoint.garbage;
  await f.j.advanceCheckpointCleanup(1);
  expect((await f.j.inspect()).checkpoint.garbage.next).toBe(1);
  await collect(f);
  expect((await f.j.inspect()).draft).toEqual(before);
  expect([...f.records]).toEqual(records);
  expect(h.rows().some((r) => r.k?.[2] === 'checkpoint' && r.k[3] === g.blob.generation)).toBe(
    false,
  );
});

it('stores synthetic metadata above 8 MiB/128 frames and collects only fifty old frames per step', async () => {
  const f = await setup(),
    small = captureBookLoreEditCheckpoint(f.op),
    large = structuredClone(small),
    count = 55000;
  // Capacity only: synthetic metadata does not prove a native 55k-upload intent.
  large.checkpoint.uploadCount = count;
  large.pages = [];
  let digest = hash({
    domain: 'writer-lore-edit-control-pages',
    intentHash: f.identity.intentHash,
    count,
  });
  for (let offset = 0; offset < count; offset += 50) {
    const end = Math.min(offset + 50, count),
      items = [];
    for (let index = offset; index < end; index++) {
      const item = {
        id:
          'lore-field-' +
          hash({
            domain: 'writer-book-lore-client-job',
            uid: f.identity.uid,
            writeId: f.identity.writeId,
            bookId: f.identity.bookId,
            loreId: f.identity.loreId,
            kind: 'lore-field',
            index,
          }),
        startHash: 'e'.repeat(64),
        progress: null,
      };
      digest = hash({ previous: digest, ...item });
      items.push(item);
    }
    large.pages.push({
      intentHash: f.identity.intentHash,
      items,
      nextOffset: end < count ? end : null,
    });
  }
  large.checkpoint.controlsHash = digest;
  await f.j.writeCheckpoint(large);
  const active = (await f.j.inspect()).checkpoint.active;
  expect(active.byteLength).toBeGreaterThan(8 * 1024 * 1024);
  expect(active.chunkCount).toBeGreaterThan(128);
  await f.open();
  expect((await f.j.readCheckpoint()).pages).toHaveLength(1100);
  await f.j.writeCheckpoint(small);
  f.allowed(false);
  const before = h.rows().filter((r) => r.k?.[2] === 'checkpoint').length;
  await f.j.advanceCheckpointCleanup();
  const head = await f.j.inspect(),
    after = h.rows().filter((r) => r.k?.[2] === 'checkpoint').length;
  expect(before - after).toBe(50);
  expect(head.checkpoint.garbage.next).toBe(50);
  await collect(f);
  expect(f.calls).toHaveLength(0);
}, 30000);

it('refuses an obsolete reconstructed operation if the same handle changes journal state during preparation', async () => {
  const f = await setup();
  await f.j.writeCheckpoint(captureBookLoreEditCheckpoint(f.op));
  let changed = false;
  await expect(
    f.j.restoreCheckpointOperation(f.port, {
      yieldControl: async () => {
        if (!changed) {
          changed = true;
          await f.j.requestCancel();
        }
      },
    }),
  ).rejects.toThrow();
  expect((await f.j.inspect()).cancelRequested).toBe(true);
  expect((await f.j.readCheckpoint()).checkpoint.cancelRequested).toBe(false);
  expect(f.calls).toHaveLength(0);
});

it('keeps exclusive checkpoint writing until the final transaction has completed', async () => {
  const f = await setup(),
    bundle = captureBookLoreEditCheckpoint(f.op);
  let head = await f.j.inspect(),
    release,
    entered = false;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const store = checkpointJournal({
    options: f.options,
    inspect: async () => head,
    async mutate(update, adds = [], removes = []) {
      const next = { ...update(head), stamp: crypto.randomUUID() };
      if (next.checkpoint?.active && !head.checkpoint?.active) {
        entered = true;
        await gate;
      }
      head = await commitJournalHead(head.identity, head.stamp, next, adds, removes);
      return head;
    },
  });
  const first = store.writeCheckpoint(bundle);
  await vi.waitFor(() => expect(entered).toBe(true));
  try {
    await expect(store.writeCheckpoint(bundle)).rejects.toThrow('andamento');
  } finally {
    release();
    await first;
  }
  expect(head.checkpoint.active.complete).toBe(true);
});

it('rejects an inconsistent terminal phase before replacing the last valid checkpoint', async () => {
  const f = await setup(),
    bundle = captureBookLoreEditCheckpoint(f.op);
  await f.j.writeCheckpoint(bundle);
  const bad = structuredClone(bundle);
  bad.checkpoint.phase = 'applied';
  await expect(f.j.writeCheckpoint(bad)).rejects.toThrow();
  expect(await f.j.readCheckpoint()).toEqual(bundle);
  expect(f.calls).toHaveLength(0);
});
