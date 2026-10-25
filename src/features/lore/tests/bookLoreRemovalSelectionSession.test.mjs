// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { installLoreJournalHarness } from './bookLoreJournalHarness.mjs';
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
