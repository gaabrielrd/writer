import { beforeEach, it, expect, vi } from 'vitest';
import { bookLoreEditSession } from '../services/bookLoreEditService';
import type { BookLoreManualEnvironment } from '../services/bookLoreManualOperation';
const state = vi.hoisted(() => ({
  auth: { currentUser: { uid: 'author' } },
  call: vi.fn(),
  httpsCallable: vi.fn(),
  getFunctions: vi.fn(),
  manual: vi.fn(),
  journalSession: vi.fn(),
  createJournal: vi.fn(),
  openJournal: vi.fn(),
  list: vi.fn(),
}));
vi.mock('@/shared/lib', () => ({ auth: state.auth, getFirebaseApp: () => ({ app: 'writer' }) }));
vi.mock('firebase/functions', () => ({
  httpsCallable: state.httpsCallable,
  getFunctions: state.getFunctions,
}));
vi.mock('../services/bookLoreManualOperation', () => ({
  createBookLoreManualOperation: state.manual,
}));
vi.mock('../services/bookLoreJournalSession', () => ({
  bookLoreJournalSession: state.journalSession,
}));
vi.mock('../services/bookLoreJournalDb', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/bookLoreJournalDb')>()),
  listJournalPreparations: state.list,
}));
const input = () => ({
  writeId: 'operation',
  source: {
    bookId: 'book',
    id: 'arthur',
    sourceToken: 'a'.repeat(64),
    data: { name: 'Literal', category: 'character' },
  },
  changes: [{ field: 'summary' as const, value: ' OWN PRIVATE ' }],
});
function environment() {
  return state.manual.mock.calls[0]![1] as BookLoreManualEnvironment;
}
beforeEach(() => {
  vi.resetAllMocks();
  state.auth.currentUser = { uid: 'author' };
  state.httpsCallable.mockReturnValue(state.call);
  state.getFunctions.mockReturnValue({ region: 'us-central1' });
  state.call.mockResolvedValue({ data: { metadata: true } });
  state.journalSession.mockReturnValue({ create: state.createJournal, open: state.openJournal });
  state.manual.mockReturnValue({ snapshot: () => ({ phase: 'opening' }) });
  state.list.mockResolvedValue({ items: [], next: null });
});
it('binds manual creation with captured UID and immutable input without storage or RPC', () => {
  const session = bookLoreEditSession(),
    draft = input();
  session.manual(draft);
  draft.changes[0]!.value = 'changed';
  expect(state.manual).toHaveBeenCalledTimes(1);
  const args = state.manual.mock.calls[0]!;
  expect(args[0]).toBe('operation');
  expect(args[2]).toMatchObject({ uid: 'author', changes: [{ value: ' OWN PRIVATE ' }] });
  expect(state.call).not.toHaveBeenCalled();
  expect(state.journalSession).not.toHaveBeenCalled();
  expect(state.list).not.toHaveBeenCalled();
});
it('binds cold resume without invented source or changes', () => {
  bookLoreEditSession().resumeManual('operation');
  expect(state.manual.mock.calls[0]![0]).toBe('operation');
  expect(state.manual.mock.calls[0]![2]).toBeUndefined();
  expect(state.call).not.toHaveBeenCalled();
});
it('uses only the regional reservation/revoke callables with metadata payloads', async () => {
  bookLoreEditSession().manual(input());
  const env = environment(),
    wire = { writeId: 'operation', requestHash: 'b'.repeat(64) };
  expect(await env.recovery.call('reserveBookLoreEditRecovery', wire)).toEqual({ metadata: true });
  expect(state.getFunctions).toHaveBeenCalledWith({ app: 'writer' }, 'us-central1');
  expect(state.httpsCallable).toHaveBeenCalledWith(
    { region: 'us-central1' },
    'reserveBookLoreEditRecovery',
    { timeout: 130000 },
  );
  expect(state.call).toHaveBeenCalledWith(wire);
  await env.recovery.call('revokeBookLoreEditRecovery', wire);
  expect(state.httpsCallable).toHaveBeenLastCalledWith(
    { region: 'us-central1' },
    'revokeBookLoreEditRecovery',
    { timeout: 130000 },
  );
});
it('delegates journal creation/opening to fresh Auth/App Check sessions without production signal', async () => {
  const signal = new AbortController().signal;
  bookLoreEditSession().manual(input(), { signal });
  const env = environment(),
    identity = {
      schemaVersion: 1 as const,
      uid: 'author',
      writeId: 'operation',
      bookId: 'book',
      loreId: 'arthur',
      sourceToken: 'a'.repeat(64),
      intentHash: 'b'.repeat(64),
      requestHash: 'c'.repeat(64),
      jobToken: 'd'.repeat(64),
      keyId: 'e'.repeat(64),
    };
  await env.createJournal(identity);
  await env.openJournal(identity);
  expect(state.createJournal).toHaveBeenCalledTimes(1);
  expect(state.openJournal).toHaveBeenCalledTimes(1);
  expect(state.journalSession.mock.calls[0]![0]).toEqual(identity);
  expect(state.journalSession.mock.calls[0]).toHaveLength(2);
});
it('lists only preparations of the captured account with pagination', async () => {
  const session = bookLoreEditSession();
  await session.preparations('cursor', 25);
  expect(state.list).toHaveBeenCalledWith('author', 'cursor', 25);
  expect(state.call).not.toHaveBeenCalled();
});
it('rejects a replaced actor before creating or resuming manual handles and before listing', async () => {
  const session = bookLoreEditSession();
  state.auth.currentUser = { uid: 'author' };
  expect(() => session.manual(input())).toThrow('contexto mudou');
  expect(() => session.resumeManual('id')).toThrow('contexto mudou');
  await expect(session.preparations()).rejects.toThrow('contexto mudou');
  expect(state.manual).not.toHaveBeenCalled();
  expect(state.list).not.toHaveBeenCalled();
});
it('drops a late reservation result after the same UID is replaced', async () => {
  bookLoreEditSession().manual(input());
  state.call.mockImplementation(() => {
    state.auth.currentUser = { uid: 'author' };
    return Promise.resolve({ data: {} });
  });
  await expect(environment().recovery.call('reserveBookLoreEditRecovery', {})).rejects.toThrow(
    'contexto mudou',
  );
});
it('drops a late preparation list after account replacement', async () => {
  const session = bookLoreEditSession();
  state.list.mockImplementation(() => {
    state.auth.currentUser = { uid: 'other' };
    return Promise.resolve({ items: [], next: null });
  });
  await expect(session.preparations()).rejects.toThrow('contexto mudou');
});
it('keeps the host guard captured before async session work', async () => {
  let current = true;
  const options = {
    guard: () => {
      if (!current) throw Error('host changed');
    },
  };
  bookLoreEditSession().manual(input(), options);
  options.guard = () => {};
  current = false;
  await expect(environment().recovery.call('revokeBookLoreEditRecovery', {})).rejects.toThrow(
    'host changed',
  );
  expect(state.call).not.toHaveBeenCalled();
});
