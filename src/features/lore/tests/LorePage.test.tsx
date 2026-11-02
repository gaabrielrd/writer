import { beforeEach, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { LorePage } from '../components/LorePage';
import { getBook, type Book } from '@/features/books';

vi.mock('@/features/books', () => ({ getBook: vi.fn() }));
vi.mock('../components/LoreTab', () => ({
  // Native read/write/auth workflows are exercised by BookLoreCollection.test.
  LoreTab: ({ book }: { book: Book }) => (
    <section aria-label="Compêndio nativo">
      {book.id}: {book.title}
    </section>
  ),
}));
const book: Book = {
  id: 'book-123',
  authorId: 'auth-1',
  title: 'Crônicas de Avalon',
  genre: 'Fantasia',
  synopsis: 'Lendas celtas',
  coverUrl: null,
  status: 'draft',
  wordCount: 1500,
  createdAt: 1000,
  updatedAt: 1000,
};
beforeEach(() => vi.resetAllMocks());
function page(path = '/books/book-123/lore') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/books/:bookId/lore" element={<LorePage />} />
        <Route path="/lore" element={<LorePage />} />
      </Routes>
    </MemoryRouter>,
  );
}
it('shows loading until the authorized book resolves, then delegates that book to the native compendium', async () => {
  let resolve!: (value: Book) => void;
  vi.mocked(getBook).mockImplementation(
    () =>
      new Promise<Book>((r) => {
        resolve = r;
      }),
  );
  page();
  expect(screen.getByText('Carregando compêndio de lore...')).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Compêndio nativo' })).not.toBeInTheDocument();
  await act(async () => {
    resolve(book);
    await Promise.resolve();
  });
  expect(
    await screen.findByRole('heading', { name: 'Compêndio de Lore — Crônicas de Avalon' }),
  ).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Compêndio nativo' })).toHaveTextContent(
    'book-123: Crônicas de Avalon',
  );
  expect(getBook).toHaveBeenCalledExactlyOnceWith('book-123');
});
it('shows unavailable book and a working return link without mounting the compendium', async () => {
  vi.mocked(getBook).mockResolvedValue(null);
  page();
  expect(await screen.findByText('Livro não encontrado')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /voltar para minhas obras/i })).toHaveAttribute(
    'href',
    '/',
  );
  expect(screen.queryByRole('region')).not.toBeInTheDocument();
});
it('shows the server failure without delegating an unauthorized book', async () => {
  vi.mocked(getBook).mockRejectedValue(new Error('Falha no Firestore'));
  page();
  expect(await screen.findByText('Falha no Firestore')).toBeInTheDocument();
  expect(screen.queryByRole('region')).not.toBeInTheDocument();
});
it('does not query a missing route identity', () => {
  page('/lore');
  expect(screen.getByText('Livro não encontrado')).toBeInTheDocument();
  expect(getBook).not.toHaveBeenCalled();
});
it('does not mount a late book response after leaving the route', async () => {
  let resolve!: (value: Book) => void;
  vi.mocked(getBook).mockImplementation(
    () =>
      new Promise<Book>((r) => {
        resolve = r;
      }),
  );
  const view = page();
  view.unmount();
  await act(async () => {
    resolve(book);
    await Promise.resolve();
  });
  expect(screen.queryByRole('region')).not.toBeInTheDocument();
  expect(screen.queryByText('Crônicas de Avalon')).not.toBeInTheDocument();
});
