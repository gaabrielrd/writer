import { beforeEach, expect, it, vi } from 'vitest';
const f = vi.hoisted(() => {
  const session = { guard: vi.fn(), writePortable: vi.fn(), portableMetadata: vi.fn() };
  return { session, open: vi.fn(() => session) };
});
vi.mock('@/features/lore', () => ({ bookLoreReadSession: f.open }));
import { createBookBackupLorePort } from '../index';
beforeEach(() => {
  vi.clearAllMocks();
  f.session.guard.mockImplementation(() => {});
  f.open.mockImplementation(() => f.session);
});
it('import, construction and unused guards do not open Auth; concurrent uses share one pinned v1 session', async () => {
  const port = createBookBackupLorePort();
  port.guard();
  expect(f.open).not.toHaveBeenCalled();
  const signal = new AbortController().signal,
    write = vi.fn(async () => {});
  await Promise.all([
    port.portableMetadata('book', 'entity', signal),
    port.writePortable('book', 'entity', write, signal),
  ]);
  expect(f.open).toHaveBeenCalledOnce();
  expect(f.open).toHaveBeenCalledWith(expect.any(Function), { tokenVersion: 1 });
  expect(f.session.writePortable).toHaveBeenCalledWith('book', 'entity', write, signal);
  expect(f.session.portableMetadata).toHaveBeenCalledWith('book', 'entity', signal);
  port.guard();
  expect(f.session.guard).toHaveBeenCalled();
});
it('actor invalidation after capture also blocks a later guard and metadata check', async () => {
  const port = createBookBackupLorePort();
  await port.portableMetadata('book', 'entity');
  f.session.guard.mockImplementation(() => {
    throw Error('Actor changed');
  });
  expect(() => port.guard()).toThrow('Actor changed');
  await expect(port.portableMetadata('book', 'entity')).rejects.toThrow('Actor changed');
  expect(f.session.portableMetadata).toHaveBeenCalledOnce();
  expect(f.open).toHaveBeenCalledOnce();
});
it('a failed session opening is not silently retried with a different actor', async () => {
  const port = createBookBackupLorePort();
  f.open.mockImplementation(() => {
    throw Error('No actor');
  });
  await expect(port.portableMetadata('book', 'entity')).rejects.toThrow('No actor');
  await expect(port.portableMetadata('book', 'entity')).rejects.toThrow('No actor');
  expect(f.open).toHaveBeenCalledOnce();
});
