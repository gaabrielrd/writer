import { describe, expect, it, vi } from 'vitest';
import { httpsCallable } from 'firebase/functions';
import {
  createBookWithGeneratedCover,
  saveBookLibraryCover,
} from '../services/generatedBookService';
vi.mock('@/shared/lib', () => ({ getFirebaseApp: () => ({}) }));
vi.mock('firebase/functions', () => ({ getFunctions: () => ({}), httpsCallable: vi.fn() }));
describe('generated book service', () => {
  it('updates a book cover through the server', async () => {
    const call = vi.fn().mockResolvedValue({ data: {} });
    vi.mocked(httpsCallable).mockReturnValue(Object.assign(call, { stream: vi.fn() }));
    await saveBookLibraryCover('book', { title: 'Atlas', coverImageId: 'image' });
    expect(call).toHaveBeenCalledWith({ bookId: 'book', title: 'Atlas', coverImageId: 'image' });
  });
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
    await expect(saveBookLibraryCover('book', { coverImageId: null })).rejects.toThrow(
      'Seus dados foram mantidos',
    );
    await expect(createBookWithGeneratedCover({ title: 'Atlas' })).rejects.toThrow(
      'Seus dados foram mantidos',
    );
  });
});
