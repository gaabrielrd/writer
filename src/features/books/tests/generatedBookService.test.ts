import { describe, expect, it, vi } from 'vitest';
import { httpsCallable } from 'firebase/functions';
import { createBookWithGeneratedCover } from '../services/generatedBookService';
vi.mock('@/shared/lib', () => ({ getFirebaseApp: () => ({}) }));
vi.mock('firebase/functions', () => ({ getFunctions: () => ({}), httpsCallable: vi.fn() }));
describe('generated book service', () => {
  it('saves the draft through the backend with a stable creation ID', async () => {
    const book = { id: 'book-1', title: 'Atlas' };
    const callable = vi.fn().mockResolvedValue({ data: book });
    vi.mocked(httpsCallable).mockReturnValue(Object.assign(callable, { stream: vi.fn() }));
    const input = { title: 'Atlas', creationId: 'book-1', coverGenerationId: 'cover-1' };
    expect(await createBookWithGeneratedCover(input)).toEqual(book);
    expect(callable).toHaveBeenCalledWith(input);
  });
  it('keeps saving failures actionable without exposing provider details', async () => {
    vi.mocked(httpsCallable).mockReturnValue(
      Object.assign(vi.fn().mockRejectedValue(new Error('network')), { stream: vi.fn() }),
    );
    await expect(createBookWithGeneratedCover({ title: 'Atlas' })).rejects.toThrow(
      'Seus dados foram mantidos',
    );
  });
});
