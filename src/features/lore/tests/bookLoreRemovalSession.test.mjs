// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { removalOperationFixture, prepareRemoval } from './bookLoreRemovalHarness.mjs';
import { bookLoreRemovalSession } from '../services/bookLoreRemovalService.ts';
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
async function setup() {
  const f = await removalOperationFixture();
  s.call.mockImplementation(async ({ method, input }) => ({
    data: await f.port.call(method, input),
  }));
  const { uid, ...input } = f.identity;
  return { ...f, input };
}
it('creates and lists only metadata without RPC and forces the captured UID', async () => {
  const f = await setup(),
    session = bookLoreRemovalSession();
  const op = await session.createRemoval({ ...f.input, uid: 'other' });
  expect(op.identity.uid).toBe('author');
  expect(s.call).not.toHaveBeenCalled();
  const page = await session.recoveries();
  expect(page.items).toHaveLength(1);
  expect(page.items[0].identity).toEqual(f.identity);
  expect(JSON.stringify(page)).not.toContain('PRIVATE_PROSE');
  await prepareRemoval(op);
  expect(s.callable.mock.calls.every((c) => c[1] === 'bookLoreRemoval')).toBe(true);
});
it('resume checks the book and account before opening any native operation', async () => {
  const f = await setup(),
    session = bookLoreRemovalSession();
  await session.createRemoval(f.input);
  await expect(session.resumeRemoval('other-book', f.input.writeId)).rejects.toThrow(
    'não pertence',
  );
  s.auth.currentUser = { uid: 'other' };
  const other = bookLoreRemovalSession();
  expect((await other.recoveries()).items).toHaveLength(0);
  await expect(other.resumeRemoval('book', f.input.writeId)).rejects.toThrow('não pertence');
  expect(s.call).not.toHaveBeenCalled();
});
it('same-UID actor replacement leaves the pending original wire and a new session may resume', async () => {
  const f = await setup(),
    session = bookLoreRemovalSession(),
    op = await session.createRemoval(f.input);
  s.call.mockImplementationOnce(async ({ method, input }) => {
    const data = await f.port.call(method, input);
    s.auth.currentUser = { uid: 'author' };
    return { data };
  });
  await expect(op.advance()).rejects.toThrow('contexto mudou');
  expect((await f.store.read()).pending.method).toBe('startBookLoreSourceInspection');
  const resumed = await bookLoreRemovalSession().resumeRemoval('book', f.input.writeId);
  await prepareRemoval(resumed);
  expect(resumed.snapshot().phase).toBe('ready');
});
it('profile changes preserve the handle but host revocation blocks reads and mutations', async () => {
  const f = await setup();
  let current = true;
  const session = bookLoreRemovalSession(() => current),
    op = await session.createRemoval(f.input);
  s.auth.currentUser.displayName = 'New profile';
  await op.advance();
  current = false;
  await expect(op.advance()).rejects.toThrow('contexto mudou');
  await expect(session.resumeRemoval('book', f.input.writeId)).rejects.toThrow('contexto mudou');
  expect(() => session.recoveries()).toThrow('contexto mudou');
});
it('no IndexedDB or Web Locks fails before network and never falls back to unprotected storage', async () => {
  const f = await setup();
  vi.stubGlobal('indexedDB', undefined);
  await expect(bookLoreRemovalSession().createRemoval(f.input)).rejects.toThrow('recuperação');
  expect(s.call).not.toHaveBeenCalled();
});
