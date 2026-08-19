import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { BookPage } from '../components/BookPage';
import * as bookService from '../services/bookService';
import type { Book } from '../model/book';

vi.mock('@/features/auth', () => ({
  useAuth: () => ({ user: { uid: 'user-1' }, loading: false }),
}));

vi.mock('@/features/lore', () => ({
  LoreTab: ({ book }: { book: Book }) => (
    <div data-testid="lore-tab">Compêndio de {book.title}</div>
  ),
}));

describe('BookPage', () => {
  const mockBook: Book = {
    id: 'book-1',
    authorId: 'user-1',
    title: 'A Jornada do Herói',
    genre: 'Fantasia Épica',
    synopsis: 'Uma aventura em terras distantes.',
    coverUrl: null,
    status: 'draft',
    wordCount: 12500,
    createdAt: 1000,
    updatedAt: 2000,
  };

  function renderBookPage(bookId = 'book-1') {
    return render(
      <MemoryRouter initialEntries={[`/books/${bookId}`]}>
        <Routes>
          <Route path="/books/:bookId" element={<BookPage />} />
          <Route path="/" element={<div>Home</div>} />
        </Routes>
      </MemoryRouter>,
    );
  }

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renderiza dados do livro e abas', async () => {
    vi.spyOn(bookService, 'getBook').mockResolvedValue(mockBook);
    vi.spyOn(bookService, 'listChapters').mockResolvedValue([]);

    renderBookPage();

    expect(await screen.findByText('A Jornada do Herói')).toBeInTheDocument();
    expect(screen.getByText('Fantasia Épica')).toBeInTheDocument();
    expect(screen.getByText(/12\.500 palavras/)).toBeInTheDocument();

    // Abas presentes
    expect(screen.getByRole('tab', { name: /capítulos/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /compêndio/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /publicação/i })).toBeInTheDocument();
  });

  it('exibe ErrorState quando livro nao e encontrado', async () => {
    vi.spyOn(bookService, 'getBook').mockResolvedValue(null);

    renderBookPage();

    expect(await screen.findByText('Livro não encontrado')).toBeInTheDocument();
  });

  it('navega entre abas', async () => {
    const user = userEvent.setup();
    vi.spyOn(bookService, 'getBook').mockResolvedValue(mockBook);
    vi.spyOn(bookService, 'listChapters').mockResolvedValue([]);

    renderBookPage();

    await screen.findByText('A Jornada do Herói');

    // Aba Compêndio
    await user.click(screen.getByRole('tab', { name: /compêndio/i }));
    expect(screen.getByTestId('lore-tab')).toHaveTextContent('Compêndio de A Jornada do Herói');

    // Aba Publicação
    await user.click(screen.getByRole('tab', { name: /publicação/i }));
    expect(screen.getByText('Obra em Rascunho')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /publicar obra/i })).toBeInTheDocument();

    // Volta para Capítulos
    await user.click(screen.getByRole('tab', { name: /capítulos/i }));
    expect(screen.getByText(/capítulo\(s\)/)).toBeInTheDocument();
  });

  it('permite alternar status de publicacao', async () => {
    const user = userEvent.setup();
    vi.spyOn(bookService, 'getBook').mockResolvedValue(mockBook);
    vi.spyOn(bookService, 'updateBook').mockResolvedValue();
    vi.spyOn(bookService, 'listChapters').mockResolvedValue([]);

    renderBookPage();

    await screen.findByText('A Jornada do Herói');

    await user.click(screen.getByRole('tab', { name: /publicação/i }));
    await user.click(screen.getByRole('button', { name: /publicar obra/i }));

    expect(bookService.updateBook).toHaveBeenCalledWith('book-1', { status: 'published' });
  });

  it('permite abrir dialogo de edicao', async () => {
    const user = userEvent.setup();
    vi.spyOn(bookService, 'getBook').mockResolvedValue(mockBook);
    vi.spyOn(bookService, 'listChapters').mockResolvedValue([]);

    renderBookPage();

    await screen.findByText('A Jornada do Herói');

    await user.click(screen.getByRole('button', { name: /editar/i }));
    expect(screen.getByRole('heading', { name: 'Editar Obra' })).toBeInTheDocument();
  });
});
