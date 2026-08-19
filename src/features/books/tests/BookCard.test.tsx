import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { BookCard } from '../components/BookCard';
import type { Book } from '../model/book';

describe('BookCard', () => {
  const mockBook: Book = {
    id: 'book-123',
    authorId: 'user-1',
    title: 'O Enigma das Sombras',
    genre: 'Fantasia Obscura',
    synopsis: 'Um mistério nas profundezas da floresta.',
    coverUrl: null,
    status: 'draft',
    wordCount: 15400,
    createdAt: 1000,
    updatedAt: 2000,
  };

  it('renderiza os dados do livro e botoes de acao', () => {
    render(
      <MemoryRouter>
        <BookCard
          book={mockBook}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
          onToggleStatus={vi.fn()}
          onManageChapters={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'O Enigma das Sombras' })).toBeInTheDocument();
    expect(screen.getByText('Fantasia Obscura')).toBeInTheDocument();
    expect(screen.getByText(/15\.400 palavras/)).toBeInTheDocument();
    expect(screen.getByText('Rascunho')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /compêndio/i })).toBeInTheDocument();
  });

  it('renderiza capa quando coverUrl e fornecido', () => {
    render(
      <MemoryRouter>
        <BookCard
          book={{ ...mockBook, coverUrl: 'https://exemplo.com/capa.jpg' }}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
          onToggleStatus={vi.fn()}
          onManageChapters={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByAltText('Capa de O Enigma das Sombras')).toHaveAttribute(
      'src',
      'https://exemplo.com/capa.jpg',
    );
  });

  it('dispara callbacks de acoes ao clicar nos botoes', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const onToggleStatus = vi.fn();
    const onManageChapters = vi.fn();

    render(
      <MemoryRouter>
        <BookCard
          book={mockBook}
          onEdit={onEdit}
          onDelete={onDelete}
          onToggleStatus={onToggleStatus}
          onManageChapters={onManageChapters}
        />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /capítulos/i }));
    expect(onManageChapters).toHaveBeenCalledWith(mockBook);

    await user.click(screen.getByRole('button', { name: /publicar/i }));
    expect(onToggleStatus).toHaveBeenCalledWith(mockBook);

    await user.click(screen.getByLabelText('Editar O Enigma das Sombras'));
    expect(onEdit).toHaveBeenCalledWith(mockBook);

    await user.click(screen.getByLabelText('Excluir O Enigma das Sombras'));
    expect(onDelete).toHaveBeenCalledWith('book-123');
  });
});
