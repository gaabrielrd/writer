import { beforeEach, expect, it, vi } from 'vitest';
import { bookLoreReadSession, hasBookLorePayload } from '../services/bookLoreReadService';
const state = vi.hoisted(() => {
  const auth: { currentUser: { uid: string } | null } = { currentUser: { uid: 'author' } };
  return { auth, call: vi.fn(), httpsCallable: vi.fn(), getFunctions: vi.fn() };
});
vi.mock('@/shared/lib', () => ({ auth: state.auth, getFirebaseApp: () => ({ app: 'writer' }) }));
vi.mock('firebase/functions', () => ({
  httpsCallable: state.httpsCallable,
  getFunctions: state.getFunctions,
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.auth.currentUser = { uid: 'author' };
  state.httpsCallable.mockReturnValue(state.call);
  state.getFunctions.mockReturnValue({ region: 'us-central1' });
  state.call.mockResolvedValue({ data: null });
});
it('uses the regional private callable and unwraps its data', async () => {
  expect(await bookLoreReadSession().get('book', 'entity')).toBeNull();
  expect(state.getFunctions).toHaveBeenCalledWith({ app: 'writer' }, 'us-central1');
  expect(state.httpsCallable).toHaveBeenCalledWith({ region: 'us-central1' }, 'getBookLoreRead');
  expect(state.call).toHaveBeenCalledWith({ bookId: 'book', id: 'entity' });
});
it.each([null, { uid: '' }])('rejects an unavailable actor before an RPC (%j)', (actor) => {
  state.auth.currentUser = actor;
  expect(() => bookLoreReadSession()).toThrow('Entre');
  expect(state.call).not.toHaveBeenCalled();
});
it('binds even an inline or missing read to the exact captured account object', async () => {
  const session = bookLoreReadSession();
  state.auth.currentUser = { uid: 'author' };
  await expect(session.get('book', 'entity')).rejects.toThrow('contexto mudou');
  expect(state.call).not.toHaveBeenCalled();
});
it.each(['account', 'cancel'])(
  'drops a late response after %s without returning null or another page',
  async (kind) => {
    let resolve!: (value: unknown) => void,
      current = true;
    state.call.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const session = bookLoreReadSession(() => current),
      promise = session.get('book', 'entity'),
      failed = expect(promise).rejects.toThrow('contexto mudou');
    if (kind === 'account') state.auth.currentUser = { uid: 'author' };
    else current = false;
    resolve({ data: null });
    await failed;
    expect(state.call).toHaveBeenCalledTimes(1);
  },
);
it('propagates backend failure without querying a legacy or public fallback', async () => {
  state.call.mockRejectedValueOnce(new Error('Origin unavailable'));
  await expect(bookLoreReadSession().get('book', 'entity')).rejects.toThrow('Origin unavailable');
  expect(state.call).toHaveBeenCalledTimes(1);
});
it('treats a malformed but present own pointer as payload, never as empty inline lore', () => {
  expect(hasBookLorePayload({ payloadStorage: null })).toBe(true);
  expect(hasBookLorePayload(Object.create({ payloadStorage: {} }) as object)).toBe(false);
  expect(hasBookLorePayload({ name: 'Inline' })).toBe(false);
});

it('opts into independent tokens only when the authenticated session explicitly requests them', async () => {
  const session = bookLoreReadSession(() => true, { tokenVersion: 2 });
  expect(await session.metadata('book', 'entity')).toBeNull();
  expect(state.call).toHaveBeenCalledExactlyOnceWith({
    bookId: 'book',
    id: 'entity',
    tokenVersion: 2,
  });
});

it('preserves the exact pinned source instead of negotiating during an authenticated resume', async () => {
  const token = 'a'.repeat(64);
  state.call.mockResolvedValue({
    data: {
      schemaVersion: 1,
      bookId: 'book',
      id: 'entity',
      readToken: token,
      mode: 'inline',
      base: { schemaVersion: 1, contentHash: 'b'.repeat(64), byteLength: 2, chunkCount: 1 },
      relations: null,
    },
  });
  const session = bookLoreReadSession(() => true, { tokenVersion: 2 });
  expect((await session.metadata('book', 'entity', token))?.readToken).toBe(token);
  expect(state.call).toHaveBeenCalledExactlyOnceWith({
    bookId: 'book',
    id: 'entity',
    readToken: token,
  });
});

it('drops a late independent read after the exact account object is replaced', async () => {
  let resolve!: (value: unknown) => void;
  state.call.mockReturnValue(
    new Promise((r) => {
      resolve = r;
    }),
  );
  const session = bookLoreReadSession(() => true, { tokenVersion: 2 }),
    reading = session.metadata('book', 'entity'),
    failed = expect(reading).rejects.toThrow('contexto mudou');
  state.auth.currentUser = { uid: 'author' };
  resolve({ data: null });
  await failed;
  expect(state.call).toHaveBeenCalledTimes(1);
});

it('captures the original UID independently of the mutable Auth object', async () => {
  const session = bookLoreReadSession();
  state.auth.currentUser!.uid = 'other';
  await expect(session.metadata('book', 'entity')).rejects.toThrow('contexto mudou');
  expect(state.call).not.toHaveBeenCalled();
});
it('drops a late response when the same Auth object changes its UID', async () => {
  let resolve!: (value: unknown) => void;
  state.call.mockReturnValue(
    new Promise((r) => {
      resolve = r;
    }),
  );
  const session = bookLoreReadSession(),
    reading = session.get('book', 'entity'),
    rejected = expect(reading).rejects.toThrow('contexto mudou');
  state.auth.currentUser!.uid = 'other';
  resolve({ data: null });
  await rejected;
  expect(state.call).toHaveBeenCalledTimes(1);
});
