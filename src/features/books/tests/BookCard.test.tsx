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

it('renderiza resumo paginado sem alegar sinopse ausente quando ela não foi fornecida', () => {
  render(
    <MemoryRouter>
      <BookCard
        book={{
          id: 'old_book',
          kind: 'book',
          title: 'Livro legado',
          status: 'draft',
          wordCount: 123,
          coverUrl: null,
          universeId: null,
          revision: 0,
          createdAt: 1,
          updatedAt: 2,
        }}
      />
    </MemoryRouter>,
  );
  expect(screen.getByRole('link')).toHaveAttribute('href', '/books/old_book');
  expect(screen.getByText('123 palavras')).toBeInTheDocument();
  expect(screen.queryByText('Nenhuma sinopse cadastrada para este livro.')).not.toBeInTheDocument();
});
it('mantém sinopse vazia conhecida e metadados editoriais recebidos no resumo', () => {
  render(
    <MemoryRouter>
      <BookCard
        book={{
          id: 'book',
          kind: 'book',
          title: 'Resumo editorial',
          status: 'published',
          wordCount: 0,
          coverUrl: null,
          universeId: null,
          revision: 0,
          createdAt: 1,
          updatedAt: 2,
          genre: 'Fantasia',
          synopsis: '',
        }}
      />
    </MemoryRouter>,
  );
  expect(screen.getByText('Fantasia')).toBeInTheDocument();
  expect(screen.getByText('Nenhuma sinopse cadastrada para este livro.')).toBeInTheDocument();
});

it('separa estado editorial de publicação sem badge de rascunho contraditório', () => {
  render(
    <MemoryRouter>
      <BookCard
        book={{
          id: 'book',
          authorId: 'owner',
          title: 'Texto em revisão',
          status: 'draft',
          editorialState: 'review',
          wordCount: 10,
          createdAt: 1,
          updatedAt: 2,
        }}
      />
    </MemoryRouter>,
  );
  expect(screen.getByText('Em revisão')).toBeVisible();
  expect(screen.getByText('Não publicado')).toBeVisible();
  expect(screen.queryByText('Rascunho')).not.toBeInTheDocument();
});
