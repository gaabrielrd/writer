import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { BookList } from '../components/BookList';
import * as bookService from '../services/bookService';
import type { Book } from '../model/book';

describe('BookList', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('exibe EmptyState quando o autor nao possui livros e permite criar', async () => {
    const user = userEvent.setup();
    vi.spyOn(bookService, 'listBooksByAuthor').mockResolvedValueOnce([]);
    vi.spyOn(bookService, 'createBook').mockResolvedValueOnce({
      id: 'b-created',
      authorId: 'auth-1',
      title: 'Primeiro Livro',
      genre: 'Aventura',
      synopsis: 'Uma jornada',
      coverUrl: null,
      status: 'draft',
      wordCount: 0,
      createdAt: 1000,
      updatedAt: 1000,
    });

    render(
      <MemoryRouter>
        <BookList authorId="auth-1" />
      </MemoryRouter>,
    );

    const createBtn = await screen.findByRole('button', { name: /criar primeiro livro/i });
    await user.click(createBtn);

    expect(screen.getByRole('heading', { name: 'Criar Novo Livro' })).toBeInTheDocument();

    await user.type(screen.getByLabelText(/título da obra/i), 'Primeiro Livro');
    await user.click(screen.getByRole('button', { name: 'Criar Livro' }));

    expect(await screen.findByText('Primeiro Livro')).toBeInTheDocument();
  });

  it('permite abrir o modal de importacao a partir do EmptyState', async () => {
    const user = userEvent.setup();
    vi.spyOn(bookService, 'listBooksByAuthor').mockResolvedValueOnce([]);

    render(
      <MemoryRouter>
        <BookList authorId="auth-1" />
      </MemoryRouter>,
    );

    const importBtn = await screen.findByRole('button', { name: /importar documento/i });
    await user.click(importBtn);

    expect(
      screen.getByRole('heading', { name: 'Importar Livro de Documento' }),
    ).toBeInTheDocument();
  });

  it('exibe ErrorState e permite retentativa', async () => {
    const user = userEvent.setup();
    vi.spyOn(bookService, 'listBooksByAuthor')
      .mockRejectedValueOnce(new Error('Falha de rede'))
      .mockResolvedValueOnce([]);

    render(
      <MemoryRouter>
        <BookList authorId="auth-1" />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Falha de rede')).toBeInTheDocument();
    const retryBtn = screen.getByRole('button', { name: /tentar novamente/i });
    await user.click(retryBtn);

    expect(await screen.findByText('Nenhum livro cadastrado')).toBeInTheDocument();
  });

  it('renderiza cards como links para a pagina do livro e permite abrir importacao', async () => {
    const user = userEvent.setup();
    const mockBook: Book = {
      id: 'b-1',
      authorId: 'auth-1',
      title: 'Livro Existente',
      genre: 'Ficção',
      synopsis: 'Sinopse original',
      coverUrl: null,
      status: 'draft',
      wordCount: 500,
      createdAt: 1000,
      updatedAt: 1000,
    };

    vi.spyOn(bookService, 'listBooksByAuthor').mockResolvedValue([mockBook]);

    render(
      <MemoryRouter>
        <BookList authorId="auth-1" />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Livro Existente')).toBeInTheDocument();

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/books/b-1');

    // Abre importação pela toolbar
    const importBtn = screen.getByRole('button', { name: /importar documento/i });
    await user.click(importBtn);

    expect(
      screen.getByRole('heading', { name: 'Importar Livro de Documento' }),
    ).toBeInTheDocument();
  });
});
