import { beforeEach, expect, it, vi } from 'vitest';
import { bookLoreRemovalSession } from '../services/bookLoreRemovalService';

interface Wire {
  method: string;
  input: Record<string, unknown>;
}
const state = vi.hoisted(() => {
  const auth: { currentUser: { uid: string; displayName?: string } | null } = {
    currentUser: { uid: 'author' },
  };
  return {
    auth,
    call: vi.fn<(input: unknown) => Promise<{ data: unknown }>>(),
    httpsCallable: vi.fn<(functions: unknown, name: string, options: unknown) => unknown>(),
    getFunctions: vi.fn(),
  };
});
vi.mock('@/shared/lib', () => ({ auth: state.auth, getFirebaseApp: () => ({ app: 'writer' }) }));
vi.mock('firebase/functions', () => ({
  httpsCallable: state.httpsCallable,
  getFunctions: state.getFunctions,
}));
const hash = 'a'.repeat(64),
  token = 'b'.repeat(64);
const query = () => ({ removalId: 'lore-removal-' + hash, startHash: token });
const header = () => ({
  schemaVersion: 1,
  bookId: 'book',
  id: 'entity',
  readToken: token,
  mode: 'inline',
  base: { schemaVersion: 1, contentHash: hash, byteLength: 20, chunkCount: 1 },
  relations: null,
});
beforeEach(() => {
  vi.clearAllMocks();
  state.auth.currentUser = { uid: 'author' };
  state.getFunctions.mockReturnValue({ region: 'us-central1' });
  state.httpsCallable.mockReturnValue(state.call);
  state.call.mockResolvedValue({ data: null });
});
it('creates a dormant session and sends a mutation only through the dedicated regional callable', async () => {
  const session = bookLoreRemovalSession();
  expect(state.call).not.toHaveBeenCalled();
  await session.call('getBookLoreRemoval', query());
  expect(state.getFunctions).toHaveBeenCalledWith({ app: 'writer' }, 'us-central1');
  expect(state.httpsCallable).toHaveBeenCalledWith({ region: 'us-central1' }, 'bookLoreRemoval', {
    timeout: 130000,
  });
  expect(state.call).toHaveBeenCalledWith({ method: 'getBookLoreRemoval', input: query() });
});
it('reads source metadata without downloading any author text or starting an inspection', async () => {
  state.call.mockResolvedValue({ data: header() });
  const result = await bookLoreRemovalSession().metadata('book', 'entity', token);
  expect(result).toEqual(header());
  expect(state.call).toHaveBeenCalledExactlyOnceWith({
    bookId: 'book',
    id: 'entity',
    readToken: token,
  });
  expect(state.httpsCallable.mock.calls[0]![1]).toBe('getBookLoreRead');
});
it('null source stays absent; a mismatched metadata response fails closed', async () => {
  const session = bookLoreRemovalSession();
  expect(await session.metadata('book', 'entity')).toBeNull();
  state.call.mockResolvedValue({ data: { ...header(), id: 'other' } });
  await expect(session.metadata('book', 'entity')).rejects.toThrow('conferir');
});
it('invalid metadata identifiers or tokens are rejected before any RPC', async () => {
  const session = bookLoreRemovalSession();
  await expect(session.metadata('book/path', 'entity')).rejects.toThrow();
  await expect(session.metadata('book', 'entity', 'bad-token')).rejects.toThrow();
  expect(state.call).not.toHaveBeenCalled();
});
it('no signed-in account cannot open the port', () => {
  state.auth.currentUser = null;
  expect(() => bookLoreRemovalSession()).toThrow('Entre');
  expect(state.call).not.toHaveBeenCalled();
});
it.each(['logout', 'same-uid-new-actor', 'host'] as const)(
  'rejects %s before and after transport I/O',
  async (kind) => {
    let current = true;
    const session = bookLoreRemovalSession(() => current);
    const change = () => {
      if (kind === 'logout') state.auth.currentUser = null;
      else if (kind === 'same-uid-new-actor') state.auth.currentUser = { uid: 'author' };
      else current = false;
    };
    state.call.mockImplementation(() => {
      change();
      return Promise.resolve({ data: { removed: true } });
    });
    await expect(session.call('getBookLoreRemoval', query())).rejects.toThrow('contexto mudou');
    await expect(session.call('getBookLoreRemoval', query())).rejects.toThrow('contexto mudou');
    expect(state.call).toHaveBeenCalledTimes(1);
  },
);
it('metadata responses are fenced too when the actor changes during the request', async () => {
  const session = bookLoreRemovalSession();
  state.call.mockImplementation(() => {
    state.auth.currentUser = { uid: 'other' };
    return Promise.resolve({ data: header() });
  });
  await expect(session.metadata('book', 'entity')).rejects.toThrow('contexto mudou');
});
it('a profile update on the same actor preserves the session', async () => {
  const session = bookLoreRemovalSession();
  state.auth.currentUser!.displayName = 'New profile';
  await expect(session.call('getBookLoreRemoval', query())).resolves.toBeNull();
});
it('freezes a detached nested wire before SDK I/O', async () => {
  const session = bookLoreRemovalSession(),
    input = {
      bookId: 'book',
      loreId: 'entity',
      removalId: query().removalId,
      sourceToken: token,
      inspection: { inspectionId: 'lore-removal-source-' + hash, startHash: token, jobToken: hash },
    };
  const pending = session.call('startBookLoreRemoval', input);
  input.inspection.jobToken = token;
  input.loreId = 'replacement';
  await pending;
  const wire = state.call.mock.calls[0]![0] as Wire;
  expect(wire.input.loreId).toBe('entity');
  expect(wire.input.inspection).toEqual({
    inspectionId: 'lore-removal-source-' + hash,
    startHash: token,
    jobToken: hash,
  });
  expect(Object.isFrozen(wire.input)).toBe(true);
  expect(Object.isFrozen(wire.input.inspection)).toBe(true);
});
it('does not retry a lost reply, fetch a new source or fall back to legacy writes', async () => {
  state.call.mockRejectedValue(Error('lost reply'));
  await expect(
    bookLoreRemovalSession().call('startBookLoreRemoval', {
      ...query(),
      bookId: 'book',
      loreId: 'entity',
    }),
  ).rejects.toThrow('lost reply');
  expect(state.call).toHaveBeenCalledTimes(1);
  expect(state.httpsCallable.mock.calls.map((c) => c[1])).toEqual(['bookLoreRemoval']);
});
it('refuses unknown methods and other operation namespaces before network access', async () => {
  const session = bookLoreRemovalSession();
  for (const [method, input] of [
    ['adoptBookLoreEditGeneration', query()],
    ['constructor', query()],
    ['getBookLoreRemoval', { ...query(), removalId: 'analysis-removal-' + hash }],
    ['getBookLoreSourceInspection', { inspectionId: 'lore-source-' + hash, startHash: token }],
    ['getBookLoreRemoval', null],
    ['getBookLoreRemoval', []],
  ] as const)
    await expect(session.call(method, input)).rejects.toThrow();
  expect(state.call).not.toHaveBeenCalled();
});
