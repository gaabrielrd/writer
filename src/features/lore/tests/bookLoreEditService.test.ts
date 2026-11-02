import { beforeEach, expect, it, vi } from 'vitest';
import { loreControlJobId } from '../services/bookLoreControlContracts';
import { journalWire } from '../services/bookLoreJournalContracts';
import { bookLoreEditSession } from '../services/bookLoreEditService';
import { bookLoreWriteHash } from '../services/bookLoreWritePayload';
import type { BookLoreEditPort } from '../services/bookLoreEditOperation';

interface WireRequest {
  method: string;
  input: Record<string, unknown>;
}
const state = vi.hoisted(() => {
  const auth: { currentUser: { uid: string } | null } = { currentUser: { uid: 'author' } };
  return {
    auth,
    call: vi.fn<(data: WireRequest) => Promise<unknown>>(),
    httpsCallable: vi.fn(),
    getFunctions: vi.fn(),
  };
});
vi.mock('@/shared/lib', () => ({ auth: state.auth, getFirebaseApp: () => ({ app: 'writer' }) }));
vi.mock('firebase/functions', () => ({
  httpsCallable: state.httpsCallable,
  getFunctions: state.getFunctions,
}));
const request = () => ({
  writeId: 'session-operation',
  source: {
    bookId: 'book',
    id: 'entity',
    sourceToken: 'a'.repeat(64),
    data: { name: 'Literal', category: 'character' },
  },
  changes: [{ field: 'summary' as const, value: ' OWN PRIVATE DRAFT ' }],
});
function response({ input }: { input: Record<string, unknown> }) {
  return {
    data: {
      inspectionId: input.inspectionId,
      startHash: bookLoreWriteHash({
        domain: 'writer-lore-source-inspection',
        schemaVersion: 1,
        intent: input,
      }),
      jobToken: 'b'.repeat(64),
      phase: 'checking',
      revision: 0,
      nextIndex: 0,
      byteLength: 0,
      totalParts: 0,
      ready: false,
    },
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  state.auth.currentUser = { uid: 'author' };
  state.httpsCallable.mockReturnValue(state.call);
  state.getFunctions.mockReturnValue({ region: 'us-central1' });
  state.call.mockImplementation((data) => Promise.resolve(response(data)));
});
it('prepares without I/O and sends the exact first unit through the regional private callable', async () => {
  const session = bookLoreEditSession(),
    op = await session.prepare(request(), { yieldControl: async () => {} });
  expect(state.call).not.toHaveBeenCalled();
  const result = await op.advance();
  expect(state.getFunctions).toHaveBeenCalledWith({ app: 'writer' }, 'us-central1');
  expect(state.httpsCallable).toHaveBeenCalledWith({ region: 'us-central1' }, 'bookLoreEdit', {
    timeout: 130000,
  });
  expect(state.call).toHaveBeenCalledTimes(1);
  const data = state.call.mock.calls[0]![0];
  expect(data.method).toBe('startBookLoreSourceInspection');
  expect(Object.keys(data).sort()).toEqual(['input', 'method']);
  expect(data.input).toEqual({
    bookId: 'book',
    loreId: 'entity',
    sourceToken: 'a'.repeat(64),
    inspectionId: data.input.inspectionId,
  });
  expect(data.input.inspectionId).toMatch(/^lore-source-[a-f0-9]{64}$/);
  expect(result.inspection?.jobToken).toBe('b'.repeat(64));
  expect(result.phase).toBe('preparing');
  expect(JSON.stringify(data)).not.toContain('OWN PRIVATE DRAFT');
});
it.each([null, { uid: '' }])('refuses absent actor before preparing (%j)', (actor) => {
  state.auth.currentUser = actor;
  expect(() => bookLoreEditSession()).toThrow('Entre');
  expect(state.call).not.toHaveBeenCalled();
});
it.each(['account', 'context', 'host'])('refuses a changed %s before first I/O', async (kind) => {
  let current = true,
    host = true;
  const session = bookLoreEditSession(() => current),
    op = await session.prepare(request(), {
      yieldControl: async () => {},
      guard: () => {
        if (!host) throw Error('host changed');
      },
    });
  if (kind === 'account') state.auth.currentUser = { uid: 'author' };
  else if (kind === 'context') current = false;
  else host = false;
  await expect(op.advance()).rejects.toThrow(kind === 'host' ? 'host changed' : 'contexto mudou');
  expect(state.call).not.toHaveBeenCalled();
});
it.each(['account', 'context'])(
  'drops late first response after %s changes and preserves the original pending unit',
  async (kind) => {
    let current = true,
      resolve!: (value: unknown) => void;
    state.call.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const session = bookLoreEditSession(() => current),
      op = await session.prepare(request(), { yieldControl: async () => {} });
    const pending = op.advance(),
      failure = expect(pending).rejects.toThrow('contexto mudou');
    await vi.waitFor(() => expect(state.call).toHaveBeenCalledTimes(1));
    const sent = state.call.mock.calls[0]![0];
    if (kind === 'account') state.auth.currentUser = { uid: 'author' };
    else current = false;
    resolve(response(sent));
    await failure;
    expect(op.snapshot().inspection).toBeNull();
    expect(op.snapshot().pending.production).not.toBeNull();
  },
);
it('propagates a lost response and retries exactly without a legacy or public fallback', async () => {
  state.call.mockRejectedValueOnce(Error('lost transport reply'));
  const op = await bookLoreEditSession().prepare(request(), { yieldControl: async () => {} });
  await expect(op.advance()).rejects.toThrow('lost transport reply');
  const before = op.snapshot().pending.production;
  await op.advance();
  expect(state.call).toHaveBeenCalledTimes(2);
  expect(state.call.mock.calls[1]![0]).toEqual(state.call.mock.calls[0]![0]);
  expect(before).not.toBeNull();
  expect(op.snapshot().pending.production).toBeNull();
  expect(state.httpsCallable.mock.calls.every((c) => c[1] === 'bookLoreEdit')).toBe(true);
});
it('forces captured UID even when a runtime caller supplies another UID, and no-op sends nothing', async () => {
  const op = await bookLoreEditSession().prepare(
    { ...request(), uid: 'other' } as ReturnType<typeof request>,
    { yieldControl: async () => {} },
  );
  expect(op.snapshot().uid).toBe('author');
  const empty = await bookLoreEditSession().prepare({ ...request(), changes: [] });
  await empty.advance();
  await empty.apply();
  expect(state.call).not.toHaveBeenCalled();
});
it('preparation checks captured actor and host guard before hashing or sending', async () => {
  const session = bookLoreEditSession();
  state.auth.currentUser = null;
  await expect(session.prepare(request())).rejects.toThrow('contexto mudou');
  expect(state.call).not.toHaveBeenCalled();
});
it('aborted production retains explicit cleanup through the same authenticated transport', async () => {
  const signal = new AbortController(),
    op = await bookLoreEditSession().prepare(request(), {
      signal: signal.signal,
      yieldControl: async () => {},
    });
  signal.abort();
  await expect(op.advance()).rejects.toThrow();
  op.requestCancel();
  state.call.mockImplementation(({ input }) =>
    Promise.resolve({
      data: {
        receipt: null,
        progress: {
          uploadId: input.uploadId,
          startHash: input.startHash,
          jobToken: null,
          phase: 'cancelled',
          revision: 0,
          nextIndex: 0,
          sealIndex: 0,
          totalParts: 0,
          byteLength: 0,
          cleanupIndex: 0,
          cleanedCount: 0,
          prepared: false,
        },
      },
    }),
  );
  await op.advance();
  expect(state.call.mock.calls[0]![0].method).toBe('cancelBookLoreFieldUpload');
  expect(op.snapshot().phase).toBe('cancelling');
});

it('restores a pending unit without transport and then explicitly repeats the exact request', async () => {
  state.call.mockRejectedValueOnce(Error('lost reply'));
  const session = bookLoreEditSession(),
    input = request(),
    op = await session.prepare(input, { yieldControl: async () => {} });
  await expect(op.advance()).rejects.toThrow('lost reply');
  const checkpoint = op.checkpoint(),
    count = state.call.mock.calls.length;
  const restored = await session.restore(
    input,
    {
      checkpoint,
      controlsPage: (offset, limit) => Promise.resolve(op.controlsPage(offset, limit)),
    },
    { yieldControl: async () => {} },
  );
  expect(state.call).toHaveBeenCalledTimes(count);
  expect(restored.snapshot()).toEqual(op.snapshot());
  await restored.advance();
  expect(state.call.mock.calls[1]![0]).toEqual(state.call.mock.calls[0]![0]);
});
it.each(['account', 'context', 'host'])(
  'rejects a late %s change during checkpoint page read',
  async (kind) => {
    let current = true,
      host = true;
    const session = bookLoreEditSession(() => current),
      input = request(),
      op = await session.prepare(input, { yieldControl: async () => {} });
    await expect(
      session.restore(
        input,
        {
          checkpoint: op.checkpoint(),
          controlsPage: (offset, limit) => {
            const page = op.controlsPage(offset, limit);
            if (kind === 'account') state.auth.currentUser = { uid: 'author' };
            else if (kind === 'context') current = false;
            else host = false;
            return Promise.resolve(page);
          },
        },
        {
          yieldControl: async () => {},
          guard: () => {
            if (!host) throw Error('host changed');
          },
        },
      ),
    ).rejects.toThrow(kind === 'host' ? 'host changed' : 'contexto mudou');
    expect(state.call).not.toHaveBeenCalled();
  },
);
it('forces actor UID on restore and refuses a checkpoint owned by another account', async () => {
  const session = bookLoreEditSession(),
    input = request(),
    op = await session.prepare(input),
    checkpoint = { ...op.checkpoint(), uid: 'other' };
  await expect(
    session.restore({ ...input, uid: 'other' } as ReturnType<typeof request>, {
      checkpoint,
      controlsPage: (offset, limit) => Promise.resolve(op.controlsPage(offset, limit)),
    }),
  ).rejects.toThrow();
  expect(state.call).not.toHaveBeenCalled();
});

function cleanupJournal(uid = 'author') {
  const head = {
    schemaVersion: 1 as const,
    identity: {
      schemaVersion: 1 as const,
      uid,
      writeId: 'session-cleanup',
      bookId: 'book',
      loreId: 'entity',
      sourceToken: 'a'.repeat(64),
      intentHash: 'b'.repeat(64),
      requestHash: 'c'.repeat(64),
      jobToken: 'd'.repeat(64),
      keyId: 'e'.repeat(64),
    },
    stamp: 'cleanup-stamp',
    cancelRequested: true,
    draft: null,
    production: null,
    cleanup: null,
    diagnostic: null,
    checkpoint: null,
    controls: null,
    checkpointOutcome: null,
    checkpointOutcomeReceipt: null,
  };
  return {
    inspect: vi.fn(() => Promise.resolve(head)),
    advanceControlCleanup: vi.fn(async (port: BookLoreEditPort) => {
      await port.call('cancelBookLoreSourceInspection', {
        inspectionId: 'lore-source-' + 'f'.repeat(64),
        startHash: 'a'.repeat(64),
        operationId: 'cleanup-unit',
      });
      return head;
    }),
  };
}
it('delegates keyless cleanup to the captured authenticated regional transport', async () => {
  const j = cleanupJournal(),
    session = bookLoreEditSession();
  expect(await session.cleanup(j)).toEqual(await j.inspect());
  expect(j.advanceControlCleanup).toHaveBeenCalledTimes(1);
  expect(state.call).toHaveBeenCalledTimes(1);
  expect(state.call.mock.calls[0]![0].method).toBe('cancelBookLoreSourceInspection');
});
it('rejects cleanup journal of another account before calling its RPC', async () => {
  const j = cleanupJournal('other');
  await expect(bookLoreEditSession().cleanup(j)).rejects.toThrow('conta');
  expect(j.advanceControlCleanup).not.toHaveBeenCalled();
  expect(state.call).not.toHaveBeenCalled();
});
it('refuses a replaced actor before inspecting the cleanup journal', async () => {
  const j = cleanupJournal(),
    session = bookLoreEditSession();
  state.auth.currentUser = { uid: 'author' };
  await expect(session.cleanup(j)).rejects.toThrow('contexto mudou');
  expect(j.inspect).not.toHaveBeenCalled();
  expect(state.call).not.toHaveBeenCalled();
});
it('drops a late account change while inspecting cleanup metadata', async () => {
  const j = cleanupJournal(),
    inspect = j.inspect;
  j.inspect = vi.fn(() => {
    state.auth.currentUser = { uid: 'author' };
    return inspect();
  });
  await expect(bookLoreEditSession().cleanup(j)).rejects.toThrow('contexto mudou');
  expect(j.advanceControlCleanup).not.toHaveBeenCalled();
  expect(state.call).not.toHaveBeenCalled();
});
it('drops a late authenticated cleanup response after a context change', async () => {
  let current = true;
  const j = cleanupJournal(),
    session = bookLoreEditSession(() => current);
  state.call.mockImplementation((data) => {
    current = false;
    return Promise.resolve(response(data));
  });
  await expect(session.cleanup(j)).rejects.toThrow('contexto mudou');
  expect(state.call).toHaveBeenCalledTimes(1);
});

type PersistentJournal = Parameters<ReturnType<typeof bookLoreEditSession>['persistent']>[0];
it('binds a persistent journal without starting storage, crypto or network', async () => {
  const j = cleanupJournal(),
    session = bookLoreEditSession();
  const op = await session.persistent(j as unknown as PersistentJournal, request());
  expect(j.inspect).toHaveBeenCalledTimes(1);
  expect(state.call).not.toHaveBeenCalled();
  expect(op.snapshot().phase).toBe('opening');
  await op.initialize();
  expect(op.snapshot().phase).toBe('cancelling');
  expect(j.advanceControlCleanup).not.toHaveBeenCalled();
  expect(state.call).not.toHaveBeenCalled();
});
it('rejects binding a persistent journal owned by another account', async () => {
  const j = cleanupJournal('other');
  await expect(
    bookLoreEditSession().persistent(j as unknown as PersistentJournal, request()),
  ).rejects.toThrow('conta');
  expect(state.call).not.toHaveBeenCalled();
});
it('rejects an actor replaced with the same UID while binding persistent storage', async () => {
  const j = cleanupJournal(),
    session = bookLoreEditSession(),
    inspect = j.inspect;
  j.inspect = vi.fn(() => {
    state.auth.currentUser = { uid: 'author' };
    return inspect();
  });
  await expect(session.persistent(j as unknown as PersistentJournal, request())).rejects.toThrow(
    'contexto mudou',
  );
  expect(state.call).not.toHaveBeenCalled();
});
it('captures the host guard before awaiting persistent binding and checks it on every snapshot', async () => {
  let current = true;
  const j = cleanupJournal(),
    options = {
      guard: () => {
        if (!current) throw Error('host changed');
      },
    };
  const op = await bookLoreEditSession().persistent(
    j as unknown as PersistentJournal,
    request(),
    options,
  );
  options.guard = () => {};
  current = false;
  expect(() => op.snapshot()).toThrow('host changed');
  expect(state.call).not.toHaveBeenCalled();
});

it('keeps the existing edit journal closed to creation controls even in legacy-shaped envelopes', () => {
  const identity = request().source;
  for (const method of [
    'getBookLoreCreationReservation',
    'cancelBookLoreCreationReservation',
    'advanceBookLoreCreationCleanup',
  ]) {
    const get = method.startsWith('get'),
      cancel = method.startsWith('cancel');
    const input = {
      creationId: 'lore-creation-' + 'a'.repeat(64),
      startHash: 'b'.repeat(64),
      ...(!get ? { operationId: 'old-control' } : {}),
      ...(!get && !cancel ? { jobToken: 'c'.repeat(64), expectedRevision: 0 } : {}),
    };
    expect(() =>
      journalWire(
        { method, input },
        {
          bookId: identity.bookId,
          loreId: identity.id,
          sourceToken: identity.sourceToken,
        },
      ),
    ).toThrow();
  }
});

it('prepares creation with the authenticated UID and fences private reads after actor replacement', async () => {
  const input = {
    uid: 'spoofed',
    writeId: 'auth-creation',
    bookId: 'book',
    data: { name: 'Own', category: 'other' },
  };
  const op = await bookLoreEditSession().prepareCreation(input);
  expect(op.snapshot().uid).toBe('author');
  expect(state.call).not.toHaveBeenCalled();
  state.auth.currentUser = { uid: 'author' };
  expect(() => op.snapshot()).toThrow('contexto mudou');
  expect(() => op.checkpoint()).toThrow('contexto mudou');
  expect(() => op.controlsPage()).toThrow('contexto mudou');
  await expect(op.advance()).rejects.toThrow('contexto mudou');
  expect(state.call).not.toHaveBeenCalled();
});

it('preserves the host guard captured for creation without depending on the mutable options object', async () => {
  let current = true;
  const options = {
    guard: () => {
      if (!current) throw Error('host changed');
    },
  };
  const op = await bookLoreEditSession().prepareCreation(
    {
      writeId: 'host-creation',
      bookId: 'book',
      data: { name: 'Own', category: 'other' },
    },
    options,
  );
  options.guard = () => {};
  current = false;
  expect(() => op.checkpoint()).toThrow('host changed');
  await expect(op.advance()).rejects.toThrow('host changed');
  expect(state.call).not.toHaveBeenCalled();
});

function outcomeRequest() {
  const i = { writeId: 'manual-outcome', bookId: 'book', loreId: 'entity' };
  return {
    ...i,
    editId: loreControlJobId({ uid: 'author', ...i }, 'lore-edit'),
    sourceToken: 'a'.repeat(64),
    startHash: 'b'.repeat(64),
  };
}
function outcomeResponse(r = outcomeRequest()) {
  return {
    data: {
      schemaVersion: 1,
      ...r,
      jobToken: 'c'.repeat(64),
      phase: 'preparing',
      applied: false,
      changedFields: ['isPublic'],
      relationsChanged: false,
      adoption: null,
      outcomeToken: null,
    },
  };
}
it('queries original outcome through its dedicated regional callable with a closed flat request', async () => {
  const r = outcomeRequest();
  state.call.mockResolvedValueOnce(outcomeResponse(r));
  const result = await bookLoreEditSession().outcome(r);
  expect(result?.applied).toBe(false);
  expect(state.httpsCallable).toHaveBeenCalledExactlyOnceWith(
    { region: 'us-central1' },
    'bookLoreEditOutcome',
    { timeout: 130000 },
  );
  expect(state.call).toHaveBeenCalledExactlyOnceWith(r);
});
it.each(['account', 'same-uid', 'host'])(
  'invalidates pending outcome on %s replacement',
  async (kind) => {
    let resolve!: (value: unknown) => void,
      current = true;
    state.call.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const session = bookLoreEditSession(() => current),
      pending = session.outcome(outcomeRequest());
    if (kind === 'host') current = false;
    else state.auth.currentUser = { uid: kind === 'same-uid' ? 'author' : 'other' };
    resolve(outcomeResponse());
    await expect(pending).rejects.toThrow('contexto mudou');
    expect(state.call).toHaveBeenCalledTimes(1);
  },
);
it('preserves outcome lookup when only the same actor profile changes', async () => {
  state.call.mockResolvedValueOnce(outcomeResponse());
  const session = bookLoreEditSession();
  Object.assign(state.auth.currentUser!, { displayName: 'Updated' });
  expect((await session.outcome(outcomeRequest()))?.phase).toBe('preparing');
});
