import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
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

  it('renderiza os dados do livro como link para a pagina do livro', () => {
    render(
      <MemoryRouter>
        <BookCard book={mockBook} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'O Enigma das Sombras' })).toBeInTheDocument();
    expect(screen.getByText('Fantasia Obscura')).toBeInTheDocument();
    expect(screen.getByText(/15\.400 palavras/)).toBeInTheDocument();
    expect(screen.getByText('Rascunho')).toBeInTheDocument();

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/books/book-123');
  });

  it('renderiza capa quando coverUrl e fornecido', () => {
    render(
      <MemoryRouter>
        <BookCard book={{ ...mockBook, coverUrl: 'https://exemplo.com/capa.jpg' }} />
      </MemoryRouter>,
    );

    expect(screen.getByAltText('Capa de O Enigma das Sombras')).toHaveAttribute(
      'src',
      'https://exemplo.com/capa.jpg',
    );
  });

  it('exibe badge Publicado para livros com status published', () => {
    render(
      <MemoryRouter>
        <BookCard book={{ ...mockBook, status: 'published' }} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Publicado')).toBeInTheDocument();
  });
});
