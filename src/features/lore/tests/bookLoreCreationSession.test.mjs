// @vitest-environment node
import { beforeEach, it, expect, vi } from 'vitest';
import { bookLoreEditSession } from '../services/bookLoreEditService.ts';
const s = vi.hoisted(() => ({
  auth: { currentUser: null },
  prepare: vi.fn(),
  list: vi.fn(),
  call: vi.fn(),
  callable: vi.fn(),
  key: vi.fn(),
}));
vi.mock('@/shared/lib', () => ({ auth: s.auth, getFirebaseApp: () => ({ app: 'fixture' }) }));
vi.mock('firebase/functions', () => ({
  getFunctions: () => ({ region: 'us-central1' }),
  httpsCallable: s.callable,
}));
vi.mock('../services/bookLoreCreationPreparation.ts', () => ({
  prepareCreationRecovery: s.prepare,
}));
vi.mock('../services/bookLoreCreationTicketDb.ts', () => ({ listCreationTickets: s.list }));
vi.mock('../services/bookLoreRecoveryKeyClient.ts', () => ({
  bookLoreRecoveryKeySession: (identity, current) => ({
    async getKey() {
      current();
      return s.key(identity);
    },
  }),
}));
beforeEach(() => {
  vi.resetAllMocks();
  s.auth.currentUser = { uid: 'author' };
  s.prepare.mockImplementation((writeId, environment, input, options) => ({
    writeId,
    environment,
    input,
    options,
  }));
  s.list.mockResolvedValue({ items: [], next: null });
  s.callable.mockReturnValue(s.call);
  s.call.mockResolvedValue({ data: { value: 'native' } });
});
it('captures authenticated UID and immutable creation input without local storage or RPC', () => {
  const input = {
      uid: 'spoof',
      writeId: 'creation-auth',
      bookId: 'book',
      data: { name: 'Literal', category: 'other' },
    },
    op = bookLoreEditSession().creationPreparation(input);
  input.data.name = 'mutated';
  expect(op.input.uid).toBe('author');
  expect(op.input.data.name).toBe('Literal');
  expect(op.environment.uid).toBe('author');
  expect(s.call).not.toHaveBeenCalled();
  expect(s.list).not.toHaveBeenCalled();
});
it('resumes metadata without inventing input and pages only the captured UID', async () => {
  const session = bookLoreEditSession(),
    op = session.resumeCreationPreparation('old-write');
  expect(op.input).toBeUndefined();
  expect(op.writeId).toBe('old-write');
  expect(await session.creationPreparations('cursor', 7)).toEqual({ items: [], next: null });
  expect(s.list).toHaveBeenCalledExactlyOnceWith('author', 'cursor', 7);
});
it.each(['actor', 'host', 'context'])(
  'fences all preparation ports after %s changes',
  async (kind) => {
    let host = true,
      context = true;
    const session = bookLoreEditSession(() => context),
      options = {
        guard: () => {
          if (!host) throw Error('host changed');
        },
      },
      op = session.creationPreparation(
        { writeId: 'guarded', bookId: 'book', data: { name: 'Own', category: 'other' } },
        options,
      );
    options.guard = () => {};
    if (kind === 'actor') s.auth.currentUser = { uid: 'author' };
    if (kind === 'host') host = false;
    if (kind === 'context') context = false;
    expect(() => op.environment.guard()).toThrow();
    await expect(op.environment.edit.call('getBookLoreCreationReservation', {})).rejects.toThrow();
    await expect(op.environment.recovery.call('reserveBookLoreEditRecovery', {})).rejects.toThrow();
    await expect(op.environment.getKey({ uid: 'author' })).rejects.toThrow();
    expect(s.call).not.toHaveBeenCalled();
    expect(s.key).not.toHaveBeenCalled();
  },
);
it('uses the private regional recovery callable and checks the actor after its response', async () => {
  const op = bookLoreEditSession().resumeCreationPreparation('old-write');
  expect(
    await op.environment.recovery.call('reserveBookLoreEditRecovery', { writeId: 'old-write' }),
  ).toEqual({ value: 'native' });
  expect(s.callable).toHaveBeenCalledWith(
    { region: 'us-central1' },
    'reserveBookLoreEditRecovery',
    { timeout: 130000 },
  );
  s.call.mockImplementationOnce(async () => {
    s.auth.currentUser = { uid: 'author' };
    return { data: { value: 'late' } };
  });
  await expect(op.environment.recovery.call('revokeBookLoreEditRecovery', {})).rejects.toThrow(
    'contexto mudou',
  );
});
it('drops a late preparation listing after the captured actor changes', async () => {
  const session = bookLoreEditSession();
  s.list.mockImplementationOnce(async () => {
    s.auth.currentUser = { uid: 'author' };
    return { items: [], next: null };
  });
  await expect(session.creationPreparations()).rejects.toThrow('contexto mudou');
});
