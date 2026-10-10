import { beforeEach, describe, expect, it, vi } from 'vitest';
import { httpsCallable } from 'firebase/functions';
import {
  deleteLibraryImage,
  listLibraryImages,
  renameLibraryImage,
} from '../services/imageLibraryService';
vi.mock('@/shared/lib', () => ({ getFirebaseApp: () => ({}) }));
vi.mock('firebase/functions', () => ({ getFunctions: () => ({}), httpsCallable: vi.fn() }));
describe('image library service', () => {
  beforeEach(() => vi.clearAllMocks());
  it('passes pagination and mutations through the authenticated callable service', async () => {
    const call = vi.fn().mockResolvedValue({ data: { images: [], cursor: null } });
    vi.mocked(httpsCallable).mockReturnValue(Object.assign(call, { stream: vi.fn() }));
    expect(await listLibraryImages()).toEqual({ images: [], cursor: null });
    await listLibraryImages('cursor');
    await renameLibraryImage('id', 'Nome');
    await deleteLibraryImage('id');
    expect(call.mock.calls).toEqual([
      [{ cursor: null }],
      [{ cursor: 'cursor' }],
      [{ id: 'id', name: 'Nome' }],
      [{ id: 'id' }],
    ]);
  });
  it('explains protected images and hides infrastructure errors', async () => {
    vi.mocked(httpsCallable).mockReturnValue(
      Object.assign(vi.fn().mockRejectedValue({ code: 'functions/failed-precondition' }), {
        stream: vi.fn(),
      }),
    );
    await expect(deleteLibraryImage('id')).rejects.toThrow('Remova-a dos livros');
    vi.mocked(httpsCallable).mockReturnValue(
      Object.assign(vi.fn().mockRejectedValue(new Error('backend detail')), { stream: vi.fn() }),
    );
    await expect(listLibraryImages()).rejects.toThrow('Tente novamente');
  });
});
