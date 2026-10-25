// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { installLoreJournalHarness } from './bookLoreJournalHarness.mjs';
import { removalSelectionFixture } from './bookLoreRemovalSelectionHarness.mjs';
import { createBookLoreReadService } from '../../../../functions/src/bookLoreRead.mjs';
import { bookLoreRemovalSelectionSession } from '../services/bookLoreRemovalSelectionService.ts';
const s = vi.hoisted(() => ({ auth: { currentUser: null }, callable: vi.fn(), call: vi.fn() }));
vi.mock('@/shared/lib', () => ({ auth: s.auth, getFirebaseApp: () => ({ app: 'fixture' }) }));
vi.mock('firebase/functions', () => ({
  getFunctions: () => ({ region: 'us-central1' }),
  httpsCallable: s.callable,
}));
beforeEach(() => {
  vi.clearAllMocks();
  s.auth.currentUser = { uid: 'author' };
  s.callable.mockReturnValue(s.call);
});
afterEach(() => vi.unstubAllGlobals());
const input = () => ({
  bookId: 'book',
  selectionId: 'selected',
  members: [
    { loreId: 'a', sourceToken: 'a'.repeat(64) },
    { loreId: 'b', sourceToken: 'b'.repeat(64) },
  ],
});
it('forces Auth UID, persists the full selection and creates/lists/resumes without RPC or prose', async () => {
  const h = installLoreJournalHarness(),
    session = bookLoreRemovalSelectionSession(),
    op = await session.createSelection({ ...input(), uid: 'other' });
  expect(op.snapshot().identity.uid).toBe('author');
  expect((await session.recoveries()).items).toHaveLength(1);
  expect((await session.resumeSelection('book', 'selected')).snapshot().count).toBe(2);
  expect(s.call).not.toHaveBeenCalled();
  expect(JSON.stringify(h.rows())).not.toContain('prose');
});
it('rejects a different book before opening any child and isolates account discovery', async () => {
  installLoreJournalHarness();
  const session = bookLoreRemovalSelectionSession();
  await session.createSelection(input());
  await expect(session.resumeSelection('other', 'selected')).rejects.toThrow();
  s.auth.currentUser = { uid: 'other' };
  const other = bookLoreRemovalSelectionSession();
  expect((await other.recoveries()).items).toHaveLength(0);
  await expect(other.resumeSelection('book', 'selected')).rejects.toThrow();
  expect(s.call).not.toHaveBeenCalled();
});
it('same-UID replacement and host revocation stop old handles while a profile change preserves them', async () => {
  installLoreJournalHarness();
  let current = true;
  const session = bookLoreRemovalSelectionSession(() => current);
  await session.createSelection(input());
  s.auth.currentUser.displayName = 'Profile';
  expect((await session.recoveries()).items).toHaveLength(1);
  s.auth.currentUser = { uid: 'author' };
  expect(() => session.recoveries()).toThrow('contexto mudou');
  const fresh = bookLoreRemovalSelectionSession(() => current);
  expect((await fresh.recoveries()).items).toHaveLength(1);
  current = false;
  await expect(fresh.resumeSelection('book', 'selected')).rejects.toThrow('contexto mudou');
  expect(s.call).not.toHaveBeenCalled();
});
it('storage failure cannot open a child or fall back to an unprotected selection', async () => {
  const h = installLoreJournalHarness();
  h.abortNext();
  await expect(bookLoreRemovalSelectionSession().createSelection(input())).rejects.toThrow();
  expect(h.rows()).toEqual([]);
  expect(s.call).not.toHaveBeenCalled();
});
it('missing IndexedDB or Web Locks blocks creation before network', async () => {
  installLoreJournalHarness();
  vi.stubGlobal('indexedDB', undefined);
  await expect(bookLoreRemovalSelectionSession().createSelection(input())).rejects.toThrow();
  expect(s.call).not.toHaveBeenCalled();
});

it('reviews through the actual Auth-bound v2 reader while keeping child mutations absent', async () => {
  const f = await removalSelectionFixture({ count: 1 }),
    server = createBookLoreReadService({ db: f.db }),
    calls = [];
  s.callable.mockImplementation((_functions, method) => async (data) => {
    calls.push({ method, data });
    return { data: await server[method]('author', data) };
  });
  const session = bookLoreRemovalSelectionSession(),
    { uid, ...input } = f.input,
    op = await session.createSelection(input),
    reviewed = await session.review(op);
  expect(reviewed.members[0].name).toBe('PRIVATE_PROSE 0');
  expect(calls.some((c) => c.method === 'getBookLoreRead' && c.data.tokenVersion === 2)).toBe(true);
  expect(calls.every((c) => ['getBookLoreRead', 'readBookLorePart'].includes(c.method))).toBe(true);
  expect(JSON.stringify(f.local.rows())).not.toContain('PRIVATE_PROSE');
});
it('reader and selection session both reject a same-UID actor replacement during review', async () => {
  const f = await removalSelectionFixture({ count: 1 }),
    server = createBookLoreReadService({ db: f.db });
  s.callable.mockImplementation((_functions, method) => async (data) => {
    const value = await server[method]('author', data);
    s.auth.currentUser = { uid: 'author' };
    return { data: value };
  });
  const session = bookLoreRemovalSelectionSession(),
    { uid, ...input } = f.input,
    op = await session.createSelection(input);
  await expect(session.review(op)).rejects.toThrow('contexto mudou');
  expect(f.records.has(f.sources[0].seed.path)).toBe(true);
});
