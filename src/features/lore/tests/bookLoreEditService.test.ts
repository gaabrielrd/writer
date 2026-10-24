import { beforeEach, expect, it, vi } from 'vitest';
import { bookLoreEditSession } from '../services/bookLoreEditService';
import { bookLoreWriteHash } from '../services/bookLoreWritePayload';

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
