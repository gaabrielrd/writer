import { beforeEach, expect, it, vi } from 'vitest';
import { getDocs, getDoc, onSnapshot, runTransaction } from 'firebase/firestore';
import { DEFAULT_PERSONAS, type AIPersona } from '../model/persona';
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

const adventureOrigin = {
    schemaVersion: 2,
    target: { kind: 'adventure', id: 'restore-a-' + 'b'.repeat(64) },
    restoreId: 'adventure-persona-restore-001',
    jobToken: 'c'.repeat(64),
  },
  adventureProfile = {
    ...restored,
    id: 'custom-' + 'e'.repeat(64),
    restoreOrigin: adventureOrigin,
  },
  adventureBatch = {
    ...adventureOrigin,
    ownerId: owner,
    state: 'active',
    profileCount: 1,
    createdByOperationId: 'adventure-persona-install-001',
    lastOperationId: 'adventure-persona-activate-001',
  },
  adventureBatchPath = 'users/' + owner + '/aiPersonaRestoreBatches/' + adventureOrigin.target.id;

it('lists mixed book and adventure origins from separate batches and strips operational fields', async () => {
  vi.mocked(getDocs).mockResolvedValue(documents([legacy, restored, adventureProfile]) as never);
  vi.mocked(getDoc)
    .mockResolvedValueOnce(snapshot({ ...batch, state: 'active' }) as never)
    .mockResolvedValueOnce(snapshot(adventureBatch) as never);
  const result = await listPersonas(owner);
  expect(result.map((p) => p.id)).toEqual([legacy.id, restored.id, adventureProfile.id]);
  expect(getDoc).toHaveBeenCalledWith(batchPath);
  expect(getDoc).toHaveBeenCalledWith(adventureBatchPath);
  expect(result.every((p) => !Object.hasOwn(p, 'restoreOrigin'))).toBe(true);
});
it('hides adventure profiles for pending, cancelled, foreign, missing or mismatched batches', async () => {
  vi.mocked(getDocs).mockResolvedValue(documents([legacy, adventureProfile]) as never);
  for (const value of [
    undefined,
    { ...adventureBatch, state: 'preparing' },
    { ...adventureBatch, state: 'cancelled' },
    { ...adventureBatch, ownerId: 'other' },
    { ...adventureBatch, jobToken: 'f'.repeat(64) },
    { ...batch, state: 'active' },
    { ...adventureBatch, target: { kind: 'book', id: adventureOrigin.target.id } },
  ]) {
    vi.mocked(getDoc).mockResolvedValue(snapshot(value) as never);
    expect(await listPersonas(owner)).toEqual([legacy]);
  }
});
it('observes adventure batches once and revokes only their rows while preserving book rows', () => {
  const changed = vi.fn<(personas: AIPersona[]) => void>(),
    failed = vi.fn(),
    stop = subscribePersonas(owner, changed, failed);
  f.listeners
    .get(profiles)!
    .changed(
      documents([
        restored,
        adventureProfile,
        { ...adventureProfile, id: 'custom-' + 'f'.repeat(64) },
      ]),
    );
  expect(onSnapshot).toHaveBeenCalledTimes(3);
  const bookWatcher = f.listeners.get(batchPath)!,
    watcher = f.listeners.get(adventureBatchPath)!;
  bookWatcher.changed(snapshot({ ...batch, state: 'active' }));
  expect(changed.mock.lastCall?.[0].map((p: { id: string }) => p.id)).toEqual([restored.id]);
  watcher.changed(snapshot(adventureBatch));
  expect(changed.mock.lastCall?.[0]).toHaveLength(3);
  watcher.changed(snapshot({ ...adventureBatch, state: 'cancelled' }));
  expect(changed.mock.lastCall?.[0].map((p: { id: string }) => p.id)).toEqual([restored.id]);
  watcher.changed(snapshot(adventureBatch));
  watcher.failed(new Error('offline adventure'));
  expect(changed.mock.lastCall?.[0].map((p: { id: string }) => p.id)).toEqual([restored.id]);
  expect(failed).toHaveBeenCalledOnce();
  f.listeners.get(profiles)!.changed(documents([restored]));
  expect(watcher.stop).toHaveBeenCalledOnce();
  const calls = changed.mock.calls.length;
  watcher.changed(snapshot(adventureBatch));
  expect(changed).toHaveBeenCalledTimes(calls);
  stop();
  expect(bookWatcher.stop).toHaveBeenCalledOnce();
});
it('edits an active adventure persona with its native origin and rejects conflicting revisions', async () => {
  const set = vi.fn();
  vi.mocked(runTransaction).mockImplementation(async (_db, callback) =>
    callback({
      get: (ref: unknown) =>
        Promise.resolve(
          snapshot(
            String(ref) === adventureBatchPath ? adventureBatch : adventureProfile,
            String(ref) === adventureBatchPath ? adventureOrigin.target.id : adventureProfile.id,
          ),
        ),
      set,
    } as never),
  );
  const input = {
      ...adventureProfile,
      name: 'Edited adventure',
      restoreOrigin: { ...adventureOrigin, jobToken: 'f'.repeat(64) },
    },
    saved = await savePersona(owner, input, 7);
  expect(saved.revision).toBe(8);
  expect(saved.createdAt).toBe(adventureProfile.createdAt);
  expect(saved).not.toHaveProperty('restoreOrigin');
  expect(set).toHaveBeenCalledWith(profiles + '/' + adventureProfile.id, {
    ...saved,
    restoreOrigin: adventureOrigin,
  });
  await expect(savePersona(owner, adventureProfile, 6)).rejects.toThrow('outra janela');
});
it('blocks editing an inactive adventure profile without writing any document', async () => {
  const set = vi.fn();
  for (const value of [
    undefined,
    { ...adventureBatch, state: 'preparing' },
    { ...adventureBatch, state: 'cancelled' },
    { ...adventureBatch, target: { kind: 'adventure', id: 'restore-a-' + 'f'.repeat(64) } },
  ]) {
    vi.mocked(runTransaction).mockImplementation(async (_db, callback) =>
      callback({
        get: (ref: unknown) =>
          Promise.resolve(
            snapshot(
              String(ref) === adventureBatchPath ? value : adventureProfile,
              String(ref) === adventureBatchPath ? adventureOrigin.target.id : adventureProfile.id,
            ),
          ),
        set,
      } as never),
    );
    await expect(savePersona(owner, adventureProfile, 7)).rejects.toThrow(
      'ainda não foi concluída',
    );
  }
  expect(set).not.toHaveBeenCalled();
});
it('rejects a malformed adventure origin rather than exposing it as a legacy persona', async () => {
  vi.mocked(getDocs).mockResolvedValue(
    documents([
      { ...adventureProfile, restoreOrigin: { ...adventureOrigin, bookId: bookId } },
    ]) as never,
  );
  await expect(listPersonas(owner)).rejects.toThrow();
  expect(getDoc).not.toHaveBeenCalled();
});
