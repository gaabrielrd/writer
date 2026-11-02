import { beforeEach, expect, it, vi } from 'vitest';
import {
  listLoreEntities,
  getLoreEntity,
  createLoreEntity,
  updateLoreEntity,
  deleteLoreEntity,
  subscribeLoreEntities,
} from '../services/loreService';
import { subscribeBookLore } from '../services/bookLoreSubscription';

type Data = Record<string, unknown>;
const state = vi.hoisted(() => {
  const auth: { currentUser: { uid: string } | null } = { currentUser: { uid: 'author' } };
  return {
    auth,
    get: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    list: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    getDoc: vi.fn(),
    getDocs: vi.fn(),
    tx: { get: vi.fn(), set: vi.fn(), update: vi.fn(), delete: vi.fn() },
    listeners: [] as {
      path: string;
      next: (value: unknown) => void;
      error: (error: unknown) => void;
      stop: ReturnType<typeof vi.fn>;
    }[],
    authListeners: [] as ((value: { uid: string } | null) => void)[],
    authStop: vi.fn(),
  };
});
vi.mock('@/shared/lib', () => ({ auth: state.auth, firestore: {}, getFirebaseApp: () => ({}) }));
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn((_auth: unknown, callback: (value: { uid: string } | null) => void) => {
    state.authListeners.push(callback);
    return state.authStop;
  }),
}));
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, ...parts: string[]) => ({ path: parts.join('/') }),
  doc: (db: { path?: string }, ...parts: string[]) => ({
    path: [db.path, ...parts].filter(Boolean).join('/'),
    id: parts.at(-1) ?? 'auto',
  }),
  query: (ref: unknown) => ref,
  orderBy: vi.fn(),
  getDoc: state.getDoc,
  getDocFromServer: state.getDoc,
  getDocs: state.getDocs,
  getDocsFromServer: state.getDocs,
  runTransaction: (_db: unknown, callback: (tx: typeof state.tx) => unknown) => callback(state.tx),
  onSnapshot: (
    ref: { path: string },
    optionsOrNext: { includeMetadataChanges: boolean } | ((value: unknown) => void),
    nextOrError: (value: unknown) => void,
    possibleError?: (error: unknown) => void,
  ) => {
    const next = typeof optionsOrNext === 'function' ? optionsOrNext : nextOrError;
    const error = typeof optionsOrNext === 'function' ? nextOrError : possibleError!;
    const stop = vi.fn();
    state.listeners.push({ path: ref.path, next, error, stop });
    return stop;
  },
}));
vi.mock('../services/bookLoreReadService', () => ({
  hasBookLorePayload: (data: object) => Object.hasOwn(data, 'payloadStorage'),
  bookLoreReadSession: (isCurrent = () => true) => {
    const actor = state.auth.currentUser;
    if (!actor) throw new Error('Entre na sua conta');
    const guard = () => {
      if (state.auth.currentUser !== actor || !isCurrent()) throw new Error('Context changed');
    };
    return {
      actor,
      guard,
      get: async (...args: unknown[]) => {
        guard();
        const v = await state.get(...args);
        guard();
        return v;
      },
      list: async (...args: unknown[]) => {
        guard();
        const v = await state.list(...args);
        guard();
        return v;
      },
    };
  },
}));
const logical = (name = 'Full') => ({
  name,
  category: 'other',
  details: '\ufeff 🌙 '.repeat(100),
  aliases: ['', 'same', 'same'],
  summary: ' private ',
  createdAt: 1,
  updatedAt: 1,
});
const row = (id: string, data: Data) => ({ id, data: () => data, exists: () => true });
const payload = () => ({ payloadStorage: { schemaVersion: 1 } });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
const settle = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};
beforeEach(() => {
  vi.clearAllMocks();
  state.auth.currentUser = { uid: 'author' };
  state.listeners.length = 0;
  state.authListeners.length = 0;
  state.get.mockReset();
  state.list.mockReset();
  state.getDoc.mockReset();
  state.getDocs.mockReset();
  state.tx.get.mockReset();
  state.tx.get.mockResolvedValue({ exists: () => true, data: () => ({}) });
});
it('includes nameless payloads in a book query and maps/sorts only the complete logical collection', async () => {
  state.getDocs.mockResolvedValue({ docs: [row('a', payload()), row('z', { name: 'Z' })] });
  state.list.mockResolvedValue([
    { id: 'a', data: logical('Beta') },
    { id: 'z', data: logical('Alpha') },
  ]);
  const values = await listLoreEntities('book');
  expect(values.map((value) => value.name)).toEqual(['Alpha', 'Beta']);
  expect(values[1]?.aliases).toEqual(['', 'same', 'same']);
  expect(state.list).toHaveBeenCalledWith('book');
});
it('preserves inline reading without invoking an undeployed payload API', async () => {
  state.getDocs.mockResolvedValue({
    docs: [row('z', logical('Zeta')), row('a', logical('Alpha'))],
  });
  expect((await listLoreEntities('book')).map((value) => value.name)).toEqual(['Alpha', 'Zeta']);
  state.getDoc.mockResolvedValue(row('a', logical('Alpha')));
  expect((await getLoreEntity('book', 'a'))?.name).toBe('Alpha');
  expect(state.list).not.toHaveBeenCalled();
  expect(state.get).not.toHaveBeenCalled();
});
it('hydrates a present payload before mapping an individual entity', async () => {
  state.getDoc.mockResolvedValue(row('a', payload()));
  state.get.mockResolvedValue({ id: 'a', data: logical() });
  const value = await getLoreEntity('book', 'a');
  expect(value?.name).toBe('Full');
  expect(value?.details).toBe(logical().details);
  expect(state.get).toHaveBeenCalledWith('book', 'a');
});
it('does not use an empty ficha fallback after a payload API error or disappearance', async () => {
  state.getDoc.mockResolvedValue(row('a', payload()));
  state.get.mockRejectedValueOnce(new Error('Revoked'));
  await expect(getLoreEntity('book', 'a')).rejects.toThrow('Revoked');
  state.get.mockResolvedValueOnce(null);
  await expect(getLoreEntity('book', 'a')).rejects.toThrow('indisponível');
  state.getDocs.mockResolvedValue({ docs: [row('a', payload())] });
  state.list.mockRejectedValueOnce(new Error('Unavailable'));
  await expect(listLoreEntities('book')).rejects.toThrow('Unavailable');
});
it.each(['list', 'get'] as const)(
  'rejects late inline %s results after switching account, including the same UID',
  async (method) => {
    const pending = deferred<unknown>();
    if (method === 'list') state.getDocs.mockReturnValue(pending.promise);
    else state.getDoc.mockReturnValue(pending.promise);
    const result = method === 'list' ? listLoreEntities('book') : getLoreEntity('book', 'a');
    const rejected = expect(result).rejects.toThrow('Context changed');
    state.auth.currentUser = { uid: 'author' };
    pending.resolve(method === 'list' ? { docs: [row('a', logical())] } : row('a', logical()));
    await rejected;
  },
);
it('hydrates an idempotent existing creation after the transaction without writing again', async () => {
  state.tx.get
    .mockResolvedValueOnce({ exists: () => true, data: () => ({}) })
    .mockResolvedValueOnce(row('stable-lore-0000001', payload()));
  state.get.mockResolvedValue({ id: 'stable-lore-0000001', data: logical() });
  const value = await createLoreEntity('book', {
    creationId: 'stable-lore-0000001',
    name: 'New',
    category: 'other',
    summary: '',
  });
  expect(value.name).toBe('Full');
  expect(state.tx.set).not.toHaveBeenCalled();
  expect(state.tx.update).not.toHaveBeenCalled();
});
it.each(['update', 'delete'])(
  'blocks the legacy %s path before any write to a payload',
  async (method) => {
    state.tx.get
      .mockResolvedValueOnce({ exists: () => true, data: () => ({}) })
      .mockResolvedValueOnce(row('a', payload()));
    const action =
      method === 'update'
        ? updateLoreEntity('book', 'a', { name: 'Bad' })
        : deleteLoreEntity('book', 'a');
    await expect(action).rejects.toThrow('editor de lore completo');
    expect(state.tx.update).not.toHaveBeenCalled();
    expect(state.tx.delete).not.toHaveBeenCalled();
  },
);
function subscribed() {
  const changed = vi.fn<(values: { name: string }[]) => void>(),
    failed = vi.fn<(error: unknown) => void>(),
    stop = subscribeLoreEntities('book', changed, failed);
  const root = state.listeners.find((v) => v.path === 'books/book')!,
    collection = state.listeners.find((v) => v.path === 'books/book/lore')!;
  root.next({ exists: () => true, data: () => ({ authorId: 'author', localLoreVersion: 0 }) });
  return { changed, failed, stop, root, collection };
}
it('subscribes by collection including nameless stubs, hydrates and sorts before publishing', async () => {
  const f = subscribed();
  state.list.mockResolvedValue([
    { id: 'z', data: logical('Zeta') },
    { id: 'a', data: logical('Alpha') },
  ]);
  f.collection.next({ docs: [row('z', payload()), row('a', logical('Alpha'))] });
  await settle();
  expect(f.changed).toHaveBeenCalledOnce();
  expect(f.changed.mock.calls[0]![0].map((v) => v.name)).toEqual(['Alpha', 'Zeta']);
  f.stop();
  expect(state.authStop).toHaveBeenCalledOnce();
  for (const listener of state.listeners) expect(listener.stop).toHaveBeenCalledOnce();
});
it('coalesces newer snapshots, suppresses the obsolete response and then reads the latest collection', async () => {
  const f = subscribed(),
    pending = deferred<unknown>();
  state.list
    .mockReturnValueOnce(pending.promise)
    .mockResolvedValueOnce([{ id: 'a', data: logical('Latest') }]);
  f.collection.next({ docs: [row('old', payload())] });
  f.collection.next({ docs: [row('a', payload())] });
  expect(state.list).toHaveBeenCalledTimes(1);
  pending.resolve([{ id: 'old', data: logical('Obsolete') }]);
  await settle();
  expect(state.list).toHaveBeenCalledTimes(2);
  expect(f.changed).toHaveBeenCalledOnce();
  expect(f.changed.mock.calls[0]![0][0]!.name).toBe('Latest');
});
it('does not publish a pending result or error after unsubscribe', async () => {
  const f = subscribed(),
    pending = deferred<unknown>();
  state.list.mockReturnValue(pending.promise);
  f.collection.next({ docs: [row('a', payload())] });
  f.stop();
  pending.resolve([{ id: 'a', data: logical() }]);
  await settle();
  expect(f.changed).not.toHaveBeenCalled();
  expect(f.failed).not.toHaveBeenCalled();
});
it.each(['account', 'deleting', 'missing', 'owner', 'invalid-clock', 'snapshot-error'])(
  'clears and invalidates presentation immediately on %s',
  async (kind) => {
    const f = subscribed(),
      pending = deferred<unknown>();
    state.list.mockReturnValue(pending.promise);
    f.collection.next({ docs: [row('a', payload())] });
    if (kind === 'account') {
      state.auth.currentUser = null;
      state.authListeners[0]!(null);
    } else if (kind === 'snapshot-error') f.collection.error(new Error('Offline'));
    else
      f.root.next({
        exists: () => kind !== 'missing',
        data: () => ({
          authorId: kind === 'owner' ? 'other' : 'author',
          ...(kind === 'deleting' ? { deleting: true } : {}),
          ...(kind === 'invalid-clock' ? { localLoreVersion: -1 } : {}),
        }),
      });
    expect(f.changed).toHaveBeenCalledExactlyOnceWith([]);
    expect(f.failed).toHaveBeenCalledOnce();
    pending.resolve([{ id: 'a', data: logical('Obsolete') }]);
    await settle();
    expect(f.changed).toHaveBeenCalledTimes(1);
  },
);
it('restarts payload hydration when the book clock changes without a collection snapshot', async () => {
  const f = subscribed();
  state.list.mockResolvedValue([{ id: 'a', data: logical() }]);
  f.collection.next({ docs: [row('a', payload())] });
  await settle();
  state.list.mockResolvedValueOnce([{ id: 'a', data: logical('Refreshed') }]);
  f.root.next({ exists: () => true, data: () => ({ authorId: 'author', localLoreVersion: 1 }) });
  await settle();
  expect(state.list).toHaveBeenCalledTimes(2);
  expect(f.changed.mock.calls.at(-1)![0][0]!.name).toBe('Refreshed');
});
it('forwards inline mapper failures instead of publishing partial data', async () => {
  const failed = vi.fn(),
    changed = vi.fn();
  subscribeBookLore(
    'book',
    () => {
      throw new Error('Invalid inline');
    },
    changed,
    failed,
    () => 0,
  );
  state.listeners
    .find((v) => v.path === 'books/book')!
    .next({ exists: () => true, data: () => ({ authorId: 'author' }) });
  state.listeners.find((v) => v.path.endsWith('/lore'))!.next({ docs: [row('a', logical())] });
  await settle();
  expect(changed).toHaveBeenCalledExactlyOnceWith([]);
  expect(failed).toHaveBeenCalledWith(expect.objectContaining({ message: 'Invalid inline' }));
});

it('waits for the book authorization before presenting an earlier inline snapshot', async () => {
  const changed = vi.fn(),
    failed = vi.fn();
  subscribeLoreEntities('book', changed, failed);
  state.listeners.find((v) => v.path.endsWith('/lore'))!.next({ docs: [row('a', logical())] });
  expect(changed).not.toHaveBeenCalled();
  state.listeners
    .find((v) => v.path === 'books/book')!
    .next({ exists: () => false, data: () => undefined });
  await settle();
  expect(changed).toHaveBeenCalledExactlyOnceWith([]);
  expect(failed).toHaveBeenCalledOnce();
});

it('rejects an account incarnation change before the auth callback arrives', async () => {
  const f = subscribed();
  state.auth.currentUser = { uid: 'author' };
  f.collection.next({ docs: [row('a', logical())] });
  await settle();
  expect(f.changed).toHaveBeenCalledExactlyOnceWith([]);
  expect(f.failed).toHaveBeenCalledOnce();
  expect(state.list).not.toHaveBeenCalled();
});

it('waits through an uncached book miss and cached lore until both server snapshots arrive', async () => {
  const changed = vi.fn(),
    failed = vi.fn();
  subscribeLoreEntities('book', changed, failed);
  const root = state.listeners.find((v) => v.path === 'books/book')!,
    collection = state.listeners.find((v) => v.path.endsWith('/lore'))!;
  root.next({
    exists: () => false,
    data: () => undefined,
    metadata: { fromCache: true, hasPendingWrites: false },
  });
  collection.next({
    docs: [row('a', logical('Cached'))],
    metadata: { fromCache: true, hasPendingWrites: false },
  });
  expect(changed).not.toHaveBeenCalled();
  expect(failed).not.toHaveBeenCalled();
  root.next({
    exists: () => true,
    data: () => ({ authorId: 'author' }),
    metadata: { fromCache: false, hasPendingWrites: false },
  });
  expect(changed).not.toHaveBeenCalled();
  collection.next({
    docs: [row('a', logical('Confirmed'))],
    metadata: { fromCache: false, hasPendingWrites: false },
  });
  await settle();
  expect(changed).toHaveBeenCalledExactlyOnceWith([expect.objectContaining({ name: 'Confirmed' })]);
  expect(failed).not.toHaveBeenCalled();
});
it('ignores optimistic uncommitted lore and presents the server confirmation', async () => {
  const f = subscribed();
  f.collection.next({
    docs: [row('a', logical('Pending'))],
    metadata: { fromCache: false, hasPendingWrites: true },
  });
  expect(f.changed).not.toHaveBeenCalled();
  f.collection.next({
    docs: [row('a', logical('Committed'))],
    metadata: { fromCache: false, hasPendingWrites: false },
  });
  await settle();
  expect(f.changed.mock.calls[0]![0][0]!.name).toBe('Committed');
});
