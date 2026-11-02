// @vitest-environment node
import { beforeEach, afterEach, afterAll, it, expect, vi } from 'vitest';
import { createBookLoreManualOperation as create } from '../services/bookLoreManualOperation.ts';
import { createBookLoreJournal, openBookLoreJournal } from '../services/bookLoreJournal.ts';
import {
  readJournalPreparation,
  listJournalPreparations,
  commitJournalPreparation,
} from '../services/bookLoreJournalDb.ts';
import { preparationRequestHash } from '../services/bookLorePreparationContracts.ts';
import { createBookLoreReadClient } from '../services/bookLoreReadClient.ts';
import { createBookLoreReadService } from '../../../../functions/src/bookLoreRead.mjs';
import { createBookLoreEditTransportService } from '../../../../functions/src/bookLoreEditTransport.mjs';
import { createBookLoreWriteRecoveryService } from '../../../../functions/src/bookLoreWriteRecovery.mjs';
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
async function setup({ big = false, signal } = {}) {
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
      writeId: 'native-bootstrap',
      source,
      changes: [
        { field: 'summary', value: ' BOOT_PRIVATE_🌙\r\n ' + (big ? '🌙'.repeat(40000) : '') },
      ],
    },
    recovery = createBookLoreWriteRecoveryService({ db: f.db, now: () => 8000 }),
    edit = createBookLoreEditTransportService({ db: f.db, now: () => 8000 }),
    calls = [],
    keys = [];
  let current = true,
    keyAllowed = true,
    reserveIntercept = null,
    editIntercept = null,
    keyIntercept = null,
    journal;
  const guard = () => {
    if (!current) throw Error('actor changed');
  };
  const options = (identity) => ({
    guard,
    yieldControl: async () => {},
    async getKey() {
      keys.push(identity.writeId);
      if (!keyAllowed) throw Error('key denied');
      const invoke = () =>
        recovery.getBookLoreEditRecoveryKey(seed.uid, {
          writeId: identity.writeId,
          requestHash: identity.requestHash,
          jobToken: identity.jobToken,
        });
      const data = keyIntercept ? await keyIntercept(invoke) : await invoke();
      guard();
      const bytes = Uint8Array.from(Buffer.from(data.keyBase64, 'base64')),
        key = await crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
      bytes.fill(0);
      return { identity, key };
    },
  });
  const environment = {
    uid: seed.uid,
    guard,
    recovery: {
      async call(method, value) {
        guard();
        const ticket = await readJournalPreparation(seed.uid, input.writeId);
        expect(ticket).not.toBeNull();
        expect(ticket.requestHash).toBe(preparationRequestHash(seed.uid, ticket.intent));
        if (method === 'reserveBookLoreEditRecovery') {
          expect(ticket.reserveState).toBe('pending');
          expect(value).toEqual(ticket.intent);
        } else {
          expect(ticket.cancelRequested).toBe(true);
          expect(ticket.jobsClosed).not.toBeNull();
          expect(ticket.revoke.wire).toEqual(value);
        }
        calls.push({ kind: 'recovery', method, input: structuredClone(value) });
        const invoke = () => recovery[method](seed.uid, value);
        return reserveIntercept ? reserveIntercept(method, value, invoke) : invoke();
      },
    },
    edit: {
      async call(method, value) {
        const ticket = await readJournalPreparation(seed.uid, input.writeId);
        expect(ticket.reserveState).toBe('confirmed');
        expect(ticket.identity).not.toBeNull();
        if (
          !method.startsWith('get') &&
          !method.startsWith('cancel') &&
          !method.endsWith('Cleanup')
        )
          expect(ticket.cancelRequested).toBe(false);
        calls.push({ kind: 'edit', method, input: structuredClone(value) });
        const invoke = () => edit.bookLoreEdit(seed.uid, { method, input: value });
        return editIntercept ? editIntercept(method, value, invoke) : invoke();
      },
    },
    createJournal: async (identity) => {
      journal = await createBookLoreJournal(identity, options(identity));
      return journal;
    },
    openJournal: async (identity) => {
      journal = await openBookLoreJournal(identity, options(identity));
      return journal;
    },
  };
  const make = (draft = input) =>
      create(input.writeId, environment, draft, { guard, signal, yieldControl: async () => {} }),
    resume = () =>
      create(input.writeId, environment, undefined, {
        guard,
        signal,
        yieldControl: async () => {},
      });
  return {
    ...f,
    ...seed,
    input,
    environment,
    calls,
    keys,
    client,
    source,
    recovery,
    make,
    resume,
    get j() {
      return journal;
    },
    current: (v) => {
      current = v;
    },
    keyAllowed: (v) => {
      keyAllowed = v;
    },
    reserveIntercept: (fn) => {
      reserveIntercept = fn;
    },
    editIntercept: (fn) => {
      editIntercept = fn;
    },
    keyIntercept: (fn) => {
      keyIntercept = fn;
    },
    ticket: () => readJournalPreparation(seed.uid, input.writeId),
    revokeOrigin: () =>
      f.db.runTransaction((tx) => tx.update(f.db.doc('books/book'), { authorId: 'other' })),
  };
}
async function ready(op) {
  for (let n = 0; n < 500; n++) {
    if (op.snapshot().canApply) return;
    await op.advance();
  }
  throw Error('not ready');
}
async function finish(op) {
  for (let n = 0; n < 500; n++) {
    if (op.snapshot().keyReleased) return;
    const before = op.snapshot();
    await op.releaseRecovery();
    expect(op.snapshot().phase === 'applied' || !before.keyReleased).toBe(true);
  }
  throw Error('not closed');
}
const localFrames = () => structuredClone(h.rows().filter((r) => r.store === 'frames'));
it('reserves only after durable metadata, composes protected editing, applies explicitly and preserves literal text', async () => {
  const f = await setup({ big: true }),
    op = f.make();
  expect(h.rows()).toHaveLength(0);
  expect(f.calls).toHaveLength(0);
  await op.initialize();
  expect(f.calls).toHaveLength(1);
  expect(f.calls[0].method).toBe('reserveBookLoreEditRecovery');
  expect(op.snapshot()).toMatchObject({
    draftSaved: true,
    hasRecoveryCopy: true,
    savePending: false,
    keyReleased: false,
    canApply: false,
  });
  expect(JSON.stringify(h.rows())).not.toContain('BOOT_PRIVATE');
  expect(JSON.stringify(op.snapshot())).not.toContain('BOOT_PRIVATE');
  const clock = f.records.get('books/book').localLoreVersion;
  await ready(op);
  const count = f.calls.length;
  await op.advance();
  expect(f.calls).toHaveLength(count);
  expect(f.records.get('books/book').localLoreVersion).toBe(clock);
  await op.apply();
  expect(op.snapshot().phase).toBe('applied');
  expect((await f.client.capture(f.bookId, f.entityId)).data.summary).toBe(
    f.input.changes[0].value,
  );
  expect(f.records.get('books/book').localLoreVersion).toBe(clock + 1);
  const copy = await op.readDraft();
  expect(copy).toEqual(f.input);
  const frames = localFrames();
  await finish(op);
  expect(op.snapshot()).toMatchObject({ phase: 'applied', keyReleased: true, canDiscard: true });
  expect(localFrames()).toEqual(frames);
  expect([...f.records.keys()].some((p) => p.endsWith('/keys/current'))).toBe(false);
  expect(f.records.get('books/book').localLoreVersion).toBe(clock + 1);
});
for (const fail of ['lost reply', 'local ACK']) {
  it(
    'discovers an uncertain reservation after reload without inventing a missing draft: ' + fail,
    async () => {
      const f = await setup();
      let once = true;
      f.reserveIntercept(async (method, _v, invoke) => {
        const reply = await invoke();
        if (method === 'reserveBookLoreEditRecovery' && once) {
          once = false;
          if (fail === 'local ACK') h.abortNext();
          else throw Error(fail);
        }
        return reply;
      });
      let op = f.make();
      await expect(op.initialize()).rejects.toThrow();
      const ticket = await f.ticket();
      expect(ticket.reserveState).toBe('pending');
      expect(ticket.identity).toBeNull();
      const found = await listJournalPreparations(f.uid);
      expect(found.items).toHaveLength(1);
      const before = f.calls[0];
      op = f.resume();
      await op.initialize();
      expect(f.calls[1]).toEqual(before);
      expect(op.snapshot()).toMatchObject({
        phase: 'awaiting-draft',
        requiresInput: true,
        hasRecoveryCopy: false,
        canApply: false,
      });
      expect(f.keys).toHaveLength(0);
      expect(f.calls.every((c) => c.kind === 'recovery')).toBe(true);
      await finish(op);
      expect(op.snapshot().canDiscard).toBe(true);
    },
  );
}
it('retains frozen input after a lost reservation and saves it when the same handle retries', async () => {
  const f = await setup();
  let once = true;
  f.reserveIntercept(async (m, _v, invoke) => {
    const reply = await invoke();
    if (m === 'reserveBookLoreEditRecovery' && once) {
      once = false;
      throw Error('lost');
    }
    return reply;
  });
  const op = f.make();
  f.input.changes[0].value = 'mutated';
  await expect(op.initialize()).rejects.toThrow('lost');
  await op.initialize();
  expect((await op.readDraft()).changes[0].value).toContain('BOOT_PRIVATE');
  expect(f.calls.filter((c) => c.method === 'reserveBookLoreEditRecovery')).toHaveLength(2);
});
it('cold resume with a confirmed draft sends no reservation or producer RPC and reauthorizes its private copy', async () => {
  const f = await setup(),
    op = f.make();
  await op.initialize();
  await op.advance();
  const before = f.calls.length,
    keys = f.keys.length,
    resumed = f.resume();
  await resumed.initialize();
  expect(f.calls).toHaveLength(before);
  expect(f.keys.length).toBeGreaterThan(keys);
  expect(await resumed.readDraft()).toEqual(f.input);
  await ready(resumed);
  expect(resumed.snapshot().canApply).toBe(true);
});
it('cancels before reserve and leaves a permanent native fence without a key or producer', async () => {
  const f = await setup(),
    op = f.make();
  await op.releaseRecovery();
  expect(f.calls.map((c) => c.method)).toEqual(['revokeBookLoreEditRecovery']);
  expect(f.keys).toHaveLength(0);
  expect(op.snapshot()).toMatchObject({
    phase: 'cancelled',
    keyReleased: true,
    canDiscard: true,
    hasRecoveryCopy: false,
  });
  const count = f.calls.length,
    resumed = f.resume();
  await resumed.initialize();
  await resumed.cancel();
  expect(f.calls).toHaveLength(count);
  const ticket = await f.ticket(),
    native = await f.recovery.reserveBookLoreEditRecovery(f.uid, ticket.intent);
  expect(native.phase).toBe('revoked');
});
it('revokes while reserve response remains pending and never opens a journal from the late reply', async () => {
  const f = await setup();
  let entered, release;
  const waiting = new Promise((r) => {
    entered = r;
  });
  f.reserveIntercept(async (method, _v, invoke) => {
    const reply = await invoke();
    if (method === 'reserveBookLoreEditRecovery') {
      entered();
      await new Promise((r) => {
        release = r;
      });
    }
    return reply;
  });
  const op = f.make(),
    initializing = op.initialize();
  await waiting;
  await op.cancel();
  expect(op.snapshot().keyReleased).toBe(false);
  await op.releaseRecovery();
  expect(op.snapshot().keyReleased).toBe(true);
  expect(f.j).toBeUndefined();
  expect(f.keys).toHaveLength(0);
  release();
  await initializing;
  expect(op.snapshot().phase).toBe('cancelled');
  expect(f.j).toBeUndefined();
  expect((await f.ticket()).reserveState).toBe('confirmed');
});
it('closes known controls and revokes independently of a stalled first key request', async () => {
  const f = await setup();
  let entered, release;
  const waiting = new Promise((r) => {
    entered = r;
  });
  f.keyIntercept(async (invoke) => {
    entered();
    await new Promise((r) => {
      release = r;
    });
    return invoke();
  });
  const op = f.make(),
    initializing = op.initialize();
  await waiting;
  await finish(op);
  expect(op.snapshot()).toMatchObject({ keyReleased: true, canDiscard: true, phase: 'cancelled' });
  expect(
    f.calls
      .filter((c) => c.kind === 'edit')
      .every(
        (c) =>
          c.method.startsWith('cancel') ||
          c.method.endsWith('Cleanup') ||
          c.method.startsWith('get'),
      ),
  ).toBe(true);
  release();
  await expect(initializing).rejects.toThrow();
  expect(op.snapshot().phase).toBe('cancelled');
});
it('preserves a full protected copy after origin revocation and closes without another key/decrypt', async () => {
  const f = await setup();
  let once = true;
  f.editIntercept(async (method, _v, invoke) => {
    const r = await invoke();
    if (method === 'appendBookLoreFieldUpload' && once) {
      once = false;
      throw Error('lost append');
    }
    return r;
  });
  let op = f.make();
  await expect(ready(op)).rejects.toThrow('lost append');
  await f.revokeOrigin();
  const before = f.keys.length,
    frames = localFrames();
  op = f.resume();
  const spy = vi.spyOn(crypto.subtle, 'decrypt');
  await finish(op);
  expect(f.keys).toHaveLength(before);
  expect(spy).not.toHaveBeenCalled();
  expect(localFrames()).toEqual(frames);
  expect(op.snapshot().keyReleased).toBe(true);
});
for (const failure of ['lost reply', 'ACK abort']) {
  it('replays exact revoke after ' + failure + ' while preserving copies', async () => {
    const f = await setup(),
      op = f.make();
    await op.initialize();
    let once = true;
    f.reserveIntercept(async (method, _v, invoke) => {
      const r = await invoke();
      if (method === 'revokeBookLoreEditRecovery' && once) {
        once = false;
        if (failure === 'ACK abort') h.abortNext();
        else throw Error(failure);
      }
      return r;
    });
    await expect(finish(op)).rejects.toThrow();
    const ticket = await f.ticket();
    expect(ticket.revoke.state).toBe('pending');
    expect(ticket.closed).toBeNull();
    const previous = f.calls.at(-1),
      frames = localFrames(),
      resumed = f.resume();
    await resumed.cancel();
    expect(f.calls.at(-1)).toEqual(previous);
    expect(resumed.snapshot().keyReleased).toBe(true);
    expect(localFrames()).toEqual(frames);
  });
}
it('detects successful adoption whose reply was lost, preserves active bodies, then revokes recovery', async () => {
  const f = await setup(),
    op = f.make();
  await ready(op);
  f.editIntercept(async (method, _v, invoke) => {
    const r = await invoke();
    if (method === 'adoptBookLoreEditGeneration') throw Error('lost adoption');
    return r;
  });
  await expect(op.apply()).rejects.toThrow('lost adoption');
  const physical = structuredClone(
      [...f.records].filter(([p]) => /bookResource(Bodies|Chunks)/u.test(p)),
    ),
    clock = f.records.get('books/book').localLoreVersion;
  await f.revokeOrigin();
  const keys = f.keys.length,
    resumed = f.resume();
  await finish(resumed);
  expect(resumed.snapshot()).toMatchObject({
    phase: 'applied',
    keyReleased: true,
    canDiscard: true,
  });
  expect(f.keys).toHaveLength(keys);
  expect([...f.records].filter(([p]) => /bookResource(Bodies|Chunks)/u.test(p))).toEqual(physical);
  expect(f.records.get('books/book').localLoreVersion).toBe(clock);
});
it('rejects key denial during cold initialization but retains metadata cancellation without claiming the text was recovered', async () => {
  const f = await setup(),
    op = f.make();
  await op.initialize();
  f.keyAllowed(false);
  const resumed = f.resume();
  await expect(resumed.initialize()).rejects.toThrow('key denied');
  expect(resumed.snapshot()).toMatchObject({
    hasRecoveryCopy: true,
    draftSaved: false,
    canDiscard: false,
  });
  await finish(resumed);
  expect(resumed.snapshot().canDiscard).toBe(true);
});
it('preserves cancellation after signal abort and fences production', async () => {
  const abort = new AbortController(),
    f = await setup({ signal: abort.signal }),
    op = f.make();
  await op.initialize();
  abort.abort();
  await expect(op.advance()).rejects.toThrow();
  await finish(op);
  expect(op.snapshot().keyReleased).toBe(true);
  expect(f.calls.filter((c) => c.kind === 'edit').every((c) => !c.method.startsWith('start'))).toBe(
    true,
  );
});
it('rejects a new input for the same ticket and fences a stale tab after explicit takeover', async () => {
  const f = await setup(),
    old = f.make();
  await old.initialize();
  const wrong = f.make({ ...f.input, changes: [{ field: 'summary', value: 'different' }] });
  await expect(wrong.initialize()).rejects.toThrow();
  const before = f.calls.length,
    resumed = f.resume();
  await resumed.initialize();
  await expect(old.advance()).rejects.toThrow();
  expect(f.calls).toHaveLength(before);
});
it('rejects account changes before storage/RPC and after a late reservation response', async () => {
  const f = await setup(),
    op = f.make(),
    before = structuredClone(h.rows());
  f.current(false);
  expect(() => op.snapshot()).toThrow('actor changed');
  expect(() => op.initialize()).toThrow('actor changed');
  expect(h.rows()).toEqual(before);
  expect(f.calls).toHaveLength(0);
});
it('rejects late actor replacement after reserve without accepting identity or opening a journal', async () => {
  const f = await setup(),
    op = f.make();
  f.reserveIntercept(async (_m, _v, invoke) => {
    const reply = await invoke();
    f.current(false);
    return reply;
  });
  await expect(op.initialize()).rejects.toThrow('actor changed');
  expect((await f.ticket()).identity).toBeNull();
  expect(f.j).toBeUndefined();
});
it('fails closed before RPC when IndexedDB cannot commit the initial ticket', async () => {
  const f = await setup(),
    op = f.make();
  h.abortNext();
  await expect(op.initialize()).rejects.toThrow();
  expect(h.rows()).toHaveLength(0);
  expect(f.calls).toHaveLength(0);
  await op.initialize();
  expect(f.calls).toHaveLength(1);
});
it('waits for ticket oncomplete before reserving', async () => {
  const f = await setup(),
    op = f.make();
  h.hold();
  const initializing = op.initialize();
  await vi.waitFor(() => expect(h.held()).toBeGreaterThan(0));
  expect(f.calls).toHaveLength(0);
  h.release();
  await initializing;
  expect(f.calls).toHaveLength(1);
});
it('paginates preparations by account with strict limits without reading private frames', async () => {
  for (let n = 0; n < 53; n++) {
    const intent = {
      writeId: 'ticket-' + String(n).padStart(3, '0'),
      bookId: 'book',
      loreId: 'arthur',
      sourceToken: 'a'.repeat(64),
      intentHash: 'b'.repeat(64),
    };
    await commitJournalPreparation(
      {
        schemaVersion: 1,
        uid: 'author',
        stamp: crypto.randomUUID(),
        intent,
        requestHash: preparationRequestHash('author', intent),
        cancelRequested: false,
        releaseRequested: false,
        reserveState: 'pending',
        identity: null,
        jobsClosed: null,
        revoke: null,
        closed: null,
      },
      null,
    );
  }
  const first = await listJournalPreparations('author');
  expect(first.items).toHaveLength(50);
  const second = await listJournalPreparations('author', first.next);
  expect(second.items).toHaveLength(3);
  expect(second.next).toBeNull();
  expect(await listJournalPreparations('other')).toEqual({ items: [], next: null });
  for (const limit of [0, 51, -1, 1.5])
    await expect(listJournalPreparations('author', undefined, limit)).rejects.toThrow();
  expect(h.rows().every((r) => r.store === 'preparations')).toBe(true);
});

it('cancels production while keeping the key and the protected draft recoverable until explicit release', async () => {
  const f = await setup(),
    op = f.make();
  await op.initialize();
  await op.advance();
  const frames = localFrames();
  for (let n = 0; n < 100 && !(await f.ticket()).jobsClosed; n++) await op.cancel();
  expect(op.snapshot()).toMatchObject({
    phase: 'cancelled',
    keyReleased: false,
    keyReleaseRequested: false,
    canDiscard: false,
  });
  expect(f.calls.some((c) => c.method === 'revokeBookLoreEditRecovery')).toBe(false);
  const resumed = f.resume();
  await resumed.initialize();
  expect(await resumed.readDraft()).toEqual(f.input);
  expect(localFrames()).toEqual(frames);
  await resumed.releaseRecovery();
  expect(resumed.snapshot()).toMatchObject({ keyReleased: true, canDiscard: true });
  await expect(resumed.readDraft()).rejects.toThrow();
});

for (const [name, poison] of [
  ['extra secret', (v) => ({ ...v, keyBase64: 'PRIVATE_KEY_MUST_NOT_PERSIST' })],
  ['wrong request', (v) => ({ ...v, requestHash: 'f'.repeat(64) })],
  ['wrong source', (v) => ({ ...v, sourceToken: 'f'.repeat(64) })],
  ['mixed fence', (v) => ({ ...v, keyId: null })],
]) {
  it('preserves ticket without accepting invalid reserve metadata: ' + name, async () => {
    const f = await setup(),
      op = f.make();
    f.reserveIntercept(async (_m, _v, invoke) => poison(await invoke()));
    await expect(op.initialize()).rejects.toThrow();
    expect((await f.ticket()).identity).toBeNull();
    expect(f.j).toBeUndefined();
    expect(f.keys).toHaveLength(0);
    expect(JSON.stringify(h.rows())).not.toContain('PRIVATE_KEY');
  });
}
it('keeps a confirmed reservation discoverable if journal birth aborts, without reserving again', async () => {
  const f = await setup(),
    original = f.environment.createJournal;
  let once = true;
  f.environment.createJournal = async (identity) => {
    if (once) {
      once = false;
      h.abortNext();
    }
    return original(identity);
  };
  const op = f.make();
  await expect(op.initialize()).rejects.toThrow();
  expect((await f.ticket()).identity).not.toBeNull();
  expect(f.calls).toHaveLength(1);
  await op.initialize();
  expect(f.calls).toHaveLength(1);
  expect(op.snapshot().draftSaved).toBe(true);
});
it('reports a partial draft as requiring original input after reload and closes controls without key', async () => {
  const f = await setup(),
    original = f.environment.createJournal;
  f.environment.createJournal = async (identity) => {
    const j = await original(identity);
    return {
      ...j,
      writeDraft: async (input) => {
        h.abortAt(h.commits() + 2);
        return j.writeDraft(input);
      },
    };
  };
  const op = f.make();
  await expect(op.initialize()).rejects.toThrow();
  const count = f.keys.length,
    resumed = f.resume();
  await resumed.initialize();
  expect(resumed.snapshot()).toMatchObject({
    phase: 'awaiting-draft',
    requiresInput: true,
    hasRecoveryCopy: false,
    draftSaved: false,
  });
  expect(f.keys).toHaveLength(count);
  await finish(resumed);
  expect(f.keys).toHaveLength(count);
});
it('replays the exact uncertain producer after cold bootstrap without repeating reservation', async () => {
  const f = await setup({ big: true });
  let once = true;
  f.editIntercept(async (method, _v, invoke) => {
    const r = await invoke();
    if (method === 'appendBookLoreFieldUpload' && once) {
      once = false;
      throw Error('lost');
    }
    return r;
  });
  let op = f.make();
  await expect(ready(op)).rejects.toThrow('lost');
  const prior = f.calls.at(-1),
    count = f.calls.length,
    reserves = f.calls.filter((c) => c.kind === 'recovery').length;
  op = f.resume();
  await op.initialize();
  expect(f.calls).toHaveLength(count);
  await op.advance();
  expect(f.calls[count]).toEqual(prior);
  expect(f.calls.filter((c) => c.kind === 'recovery')).toHaveLength(reserves);
  await ready(op);
});
it('does at most one native RPC per closing step including the separate key release', async () => {
  const f = await setup(),
    op = f.make();
  await ready(op);
  for (let n = 0; n < 100 && !op.snapshot().keyReleased; n++) {
    const before = f.calls.length;
    await op.releaseRecovery();
    expect(f.calls.length - before).toBeLessThanOrEqual(1);
  }
  expect(op.snapshot().keyReleased).toBe(true);
  const index = f.calls.findIndex((c) => c.method === 'revokeBookLoreEditRecovery');
  expect(index).toBe(f.calls.length - 1);
});
it('does not treat an externally revoked key as proof native jobs were closed', async () => {
  const f = await setup(),
    op = f.make();
  await op.initialize();
  await op.advance();
  const ticket = await f.ticket();
  await f.recovery.revokeBookLoreEditRecovery(f.uid, {
    writeId: ticket.intent.writeId,
    requestHash: ticket.requestHash,
    jobToken: ticket.identity.jobToken,
  });
  const stored = h.rows().find((r) => r.store === 'preparations').value;
  stored.reserveState = 'pending';
  stored.identity = null; // Simulate pre-ACK metadata with an existing journal.
  const resumed = f.resume();
  await resumed.initialize();
  expect(resumed.snapshot()).toMatchObject({
    phase: 'cancelling',
    canDiscard: false,
    keyReleased: false,
  });
  expect((await f.ticket()).jobsClosed).toBeNull();
  await finish(resumed);
  expect(resumed.snapshot().canDiscard).toBe(true);
  expect(f.calls.some((c) => c.method === 'cancelBookLoreSourceInspection')).toBe(true);
});
it('rejects invalid revoke proof and keeps the closing unit pending for exact retry', async () => {
  const f = await setup(),
    op = f.make();
  await op.initialize();
  f.reserveIntercept(async (method, _v, invoke) => {
    const result = await invoke();
    return method === 'revokeBookLoreEditRecovery'
      ? { ...result, jobToken: 'f'.repeat(64) }
      : result;
  });
  await expect(finish(op)).rejects.toThrow();
  expect(op.snapshot().canDiscard).toBe(false);
  const pending = (await f.ticket()).revoke.wire;
  f.reserveIntercept(null);
  await op.releaseRecovery();
  expect(f.calls.at(-1).input).toEqual(pending);
  expect(op.snapshot().canDiscard).toBe(true);
});
it('rejects local ticket corruption before network or private reads', async () => {
  const f = await setup(),
    op = f.make();
  await op.initialize();
  const before = f.calls.length,
    keys = f.keys.length;
  const row = h.rows().find((r) => r.store === 'preparations');
  row.value.intent.sourceToken = 'f'.repeat(64);
  const resumed = f.resume();
  await expect(resumed.initialize()).rejects.toThrow();
  expect(f.calls).toHaveLength(before);
  expect(f.keys).toHaveLength(keys);
});
it('preserves monotonic cancellation/release, identity and receipt in preparation CAS', async () => {
  const f = await setup(),
    op = f.make();
  await op.initialize();
  await finish(op);
  const head = await f.ticket(),
    before = structuredClone(h.rows());
  for (const change of [
    { cancelRequested: false },
    { releaseRequested: false },
    { identity: null },
    { closed: null },
    { jobsClosed: null },
    { reserveState: 'pending' },
  ]) {
    await expect(
      commitJournalPreparation({ ...head, ...change, stamp: crypto.randomUUID() }, head.stamp),
    ).rejects.toThrow();
  }
  expect(h.rows()).toEqual(before);
});

it('retries controller binding after a transient journal inspection failure without another reserve', async () => {
  const f = await setup(),
    original = f.environment.createJournal;
  let once = true;
  f.environment.createJournal = async (identity) => {
    const j = await original(identity);
    return {
      ...j,
      inspect: () => {
        if (once) {
          once = false;
          throw Error('transient inspect');
        }
        return j.inspect();
      },
    };
  };
  const op = f.make();
  await expect(op.initialize()).rejects.toThrow('transient inspect');
  await op.initialize();
  expect(op.snapshot().draftSaved).toBe(true);
  expect(f.calls).toHaveLength(1);
});
it('never changes an exact pending revoke wire when identity metadata becomes available', async () => {
  const f = await setup(),
    op = f.make();
  await op.initialize();
  let once = true;
  f.reserveIntercept(async (m, _v, invoke) => {
    const result = await invoke();
    if (m === 'revokeBookLoreEditRecovery' && once) {
      once = false;
      throw Error('lost');
    }
    return result;
  });
  await expect(finish(op)).rejects.toThrow('lost');
  const head = await f.ticket(),
    next = structuredClone(head),
    rows = structuredClone(h.rows());
  delete next.revoke.wire.jobToken;
  next.stamp = crypto.randomUUID();
  await expect(commitJournalPreparation(next, head.stamp)).rejects.toThrow();
  expect(h.rows()).toEqual(rows);
});
it('validates a late reserve reply against identity pinned by concurrent key release', async () => {
  const f = await setup();
  let entered, release;
  const waiting = new Promise((r) => {
    entered = r;
  });
  f.reserveIntercept(async (method, _v, invoke) => {
    const reply = await invoke();
    if (method === 'reserveBookLoreEditRecovery') {
      entered();
      await new Promise((r) => {
        release = r;
      });
      return { ...reply, keyId: 'f'.repeat(64) };
    }
    return reply;
  });
  const op = f.make(),
    initializing = op.initialize();
  await waiting;
  await op.releaseRecovery();
  release();
  await expect(initializing).rejects.toThrow();
  expect(op.snapshot().keyReleased).toBe(true);
});
it('does not retain a release intent rejected while a cancel unit is busy', async () => {
  const f = await setup(),
    op = f.make();
  await op.initialize();
  let entered, release;
  const waiting = new Promise((r) => {
    entered = r;
  });
  f.editIntercept(async (method, _v, invoke) => {
    const result = await invoke();
    if (method === 'cancelBookLoreFieldUpload') {
      entered();
      await new Promise((r) => {
        release = r;
      });
    }
    return result;
  });
  const cancelling = op.cancel();
  await waiting;
  await expect(op.releaseRecovery()).rejects.toThrow('andamento');
  release();
  await cancelling;
  for (let n = 0; n < 100 && !(await f.ticket()).jobsClosed; n++) await op.cancel();
  expect((await f.ticket()).releaseRequested).toBe(false);
  expect(op.snapshot().keyReleased).toBe(false);
  expect(await op.readDraft()).toEqual(f.input);
});
it('represents a literal no-op without applying or sending an edit producer', async () => {
  const f = await setup(),
    op = f.make({ ...f.input, changes: [] });
  await op.initialize();
  expect(op.snapshot()).toMatchObject({ phase: 'empty', canApply: false });
  await op.advance();
  expect(f.calls).toHaveLength(1);
  expect(f.calls[0].kind).toBe('recovery');
});
