import { beforeEach, expect, it, vi } from 'vitest';
import { getDocs, getDoc, onSnapshot, runTransaction } from 'firebase/firestore';
import { DEFAULT_PERSONAS } from '../model/persona';
import { listPersonas, subscribePersonas, savePersona } from '../services/personaService';
const f = vi.hoisted(() => ({
  listeners: new Map<
    string,
    {
      changed: (value: unknown) => void;
      failed: (error: Error) => void;
      stop: ReturnType<typeof vi.fn>;
    }
  >(),
}));
vi.mock('@/shared/lib', () => ({ firestore: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, ...parts: string[]) => parts.join('/')),
  doc: vi.fn((base: unknown, ...parts: string[]) =>
    [...(typeof base === 'string' ? [base] : []), ...parts].join('/'),
  ),
  getDocs: vi.fn(),
  getDoc: vi.fn(),
  runTransaction: vi.fn(),
  onSnapshot: vi.fn(
    (ref: string, changed: (value: unknown) => void, failed: (error: Error) => void) => {
      const stop = vi.fn();
      f.listeners.set(ref, { changed, failed, stop });
      return stop;
    },
  ),
}));
const owner = 'author',
  bookId = 'restore-' + 'b'.repeat(64),
  origin = { schemaVersion: 1, bookId, restoreId: 'persona-restore-001', jobToken: 'c'.repeat(64) },
  legacy = { ...DEFAULT_PERSONAS[0]!, id: 'custom-legacy', createdAt: 1, updatedAt: 2 },
  restored = { ...legacy, id: 'custom-' + 'a'.repeat(64), revision: 7, restoreOrigin: origin },
  batch = {
    ...origin,
    ownerId: owner,
    state: 'preparing',
    profileCount: 1,
    createdByOperationId: 'persona-install-0001',
    lastOperationId: 'persona-activate-001',
  },
  profiles = 'users/' + owner + '/aiPersonas',
  batchPath = 'users/' + owner + '/aiPersonaRestoreBatches/' + bookId;
const documents = (values: ReadonlyArray<Record<string, unknown>>) => ({
  docs: values.map((value) => ({ id: String(value.id), data: () => value })),
});
const snapshot = (value: unknown, id = bookId) => ({
  id,
  exists: () => value !== undefined,
  data: () => value,
});
beforeEach(() => {
  vi.clearAllMocks();
  f.listeners.clear();
});
it('lists legacy profiles without requesting any restoration metadata', async () => {
  vi.mocked(getDocs).mockResolvedValue(documents([legacy]) as never);
  expect(await listPersonas(owner)).toEqual([legacy]);
  expect(getDoc).not.toHaveBeenCalled();
});
it('only lists restored profiles for the same active owner and origin', async () => {
  vi.mocked(getDocs).mockResolvedValue(documents([legacy, restored]) as never);
  for (const data of [
    undefined,
    batch,
    { ...batch, state: 'cancelled' },
    { ...batch, state: 'active', ownerId: 'other' },
    { ...batch, state: 'active', jobToken: 'd'.repeat(64) },
  ]) {
    vi.mocked(getDoc).mockResolvedValue(snapshot(data) as never);
    expect(await listPersonas(owner)).toEqual([legacy]);
  }
  vi.mocked(getDoc).mockResolvedValue(snapshot({ ...batch, state: 'active' }) as never);
  const result = await listPersonas(owner);
  expect(result.map((p) => p.id)).toEqual([legacy.id, restored.id]);
  expect(result[1]).not.toHaveProperty('restoreOrigin');
});
it('subscribes to batches only when needed and hides restored rows on revocation or error', () => {
  const changed = vi.fn(),
    failed = vi.fn(),
    stop = subscribePersonas(owner, changed, failed);
  expect(onSnapshot).toHaveBeenCalledTimes(1);
  f.listeners.get(profiles)!.changed(documents([legacy]));
  expect(changed).toHaveBeenLastCalledWith([legacy]);
  expect(onSnapshot).toHaveBeenCalledTimes(1);
  f.listeners.get(profiles)!.changed(documents([legacy, restored]));
  expect(changed).toHaveBeenLastCalledWith([legacy]);
  const watcher = f.listeners.get(batchPath)!;
  const beforePending = changed.mock.calls.length;
  watcher.changed(snapshot(batch));
  watcher.changed(snapshot({ ...batch, profileCount: 2 }));
  expect(changed).toHaveBeenCalledTimes(beforePending);
  watcher.changed(snapshot({ ...batch, state: 'active' }));
  expect(changed).toHaveBeenLastCalledWith([legacy, expect.objectContaining({ id: restored.id })]);
  watcher.changed(snapshot({ ...batch, state: 'cancelled' }));
  expect(changed).toHaveBeenLastCalledWith([legacy]);
  watcher.changed(snapshot({ ...batch, state: 'active' }));
  watcher.failed(new Error('offline'));
  expect(changed).toHaveBeenLastCalledWith([legacy]);
  expect(failed).toHaveBeenCalledWith(expect.objectContaining({ message: 'offline' }));
  stop();
  stop();
  expect(watcher.stop).toHaveBeenCalledOnce();
  expect(f.listeners.get(profiles)!.stop).toHaveBeenCalledOnce();
  const calls = changed.mock.calls.length;
  watcher.changed(snapshot({ ...batch, state: 'active' }));
  expect(changed).toHaveBeenCalledTimes(calls);
});
it('shares one batch observer and ignores a removed observer or mismatched origin', () => {
  const changed = vi.fn(),
    stop = subscribePersonas(owner, changed, vi.fn());
  f.listeners
    .get(profiles)!
    .changed(documents([restored, { ...restored, id: 'custom-' + 'e'.repeat(64) }]));
  expect(onSnapshot).toHaveBeenCalledTimes(2);
  const watcher = f.listeners.get(batchPath)!;
  watcher.changed(snapshot({ ...batch, state: 'active' }));
  expect(changed.mock.lastCall?.[0]).toHaveLength(2);
  f.listeners
    .get(profiles)!
    .changed(documents([{ ...restored, restoreOrigin: { ...origin, jobToken: 'f'.repeat(64) } }]));
  expect(changed).toHaveBeenLastCalledWith([]);
  f.listeners.get(profiles)!.changed(documents([legacy]));
  expect(watcher.stop).toHaveBeenCalledOnce();
  expect(changed).toHaveBeenLastCalledWith([legacy]);
  const count = changed.mock.calls.length;
  watcher.changed(snapshot({ ...batch, state: 'active' }));
  expect(changed).toHaveBeenCalledTimes(count);
  stop();
});
it('rejects malformed operational fields instead of treating them as a legacy profile', async () => {
  vi.mocked(getDocs).mockResolvedValue(documents([{ ...restored, restoreOrigin: null }]) as never);
  await expect(listPersonas(owner)).rejects.toThrow();
  const changed = vi.fn(),
    failed = vi.fn(),
    stop = subscribePersonas(owner, changed, failed);
  f.listeners
    .get(profiles)!
    .changed(documents([{ ...restored, restoreOrigin: { ...origin, path: 'outside' } }]));
  expect(failed).toHaveBeenCalledWith(expect.any(Error));
  expect(changed).toHaveBeenLastCalledWith([]);
  stop();
});
it('pending or cancelled profiles cannot be edited even when their revision matches', async () => {
  const set = vi.fn();
  for (const data of [batch, { ...batch, state: 'cancelled' }, undefined]) {
    vi.mocked(runTransaction).mockImplementation(async (_db, callback) =>
      callback({
        get: (reference: unknown) =>
          Promise.resolve(
            snapshot(
              String(reference) === batchPath ? data : restored,
              String(reference) === batchPath ? bookId : restored.id,
            ),
          ),
        set,
      } as never),
    );
    await expect(savePersona(owner, { ...restored, name: 'Edited' }, 7)).rejects.toThrow(
      'A restaura\u00e7\u00e3o desta persona ainda n\u00e3o foi conclu\u00edda.',
    );
  }
  expect(set).not.toHaveBeenCalled();
});
it('editing an active restored profile preserves native origin, revision CAS and creation date', async () => {
  const set = vi.fn();
  vi.mocked(runTransaction).mockImplementation(async (_db, callback) =>
    callback({
      get: (reference: unknown) =>
        Promise.resolve(
          snapshot(
            String(reference) === batchPath ? { ...batch, state: 'active' } : restored,
            String(reference) === batchPath ? bookId : restored.id,
          ),
        ),
      set,
    } as never),
  );
  const input = {
      ...restored,
      name: 'Edited',
      restoreOrigin: { ...origin, jobToken: 'f'.repeat(64) },
    },
    saved = await savePersona(owner, input, 7);
  expect(saved.revision).toBe(8);
  expect(saved.createdAt).toBe(restored.createdAt);
  expect(set).toHaveBeenCalledWith(profiles + '/' + restored.id, {
    ...saved,
    restoreOrigin: origin,
  });
  expect(saved).not.toHaveProperty('restoreOrigin');
  await expect(savePersona(owner, input, 6)).rejects.toThrow('outra janela');
});
