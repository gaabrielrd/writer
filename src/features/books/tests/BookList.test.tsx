import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { BookList } from '../components/BookList';
import * as bookService from '../services/bookService';
import type { Book } from '../model/book';
vi.mock('@/features/auth', () => ({
  useAuth: () => ({ user: { uid: 'auth-1', credits: 20 }, updateUserCreditsState: vi.fn() }),
}));
vi.mock('@/features/ai-assistant/services/bookGenerationService', () => ({
  quoteBookGeneration: vi.fn().mockResolvedValue({ synopsis: 1, cover: 5 }),
}));

describe('BookList', () => {
  it.each([false, true])(
    'opens assisted creation with an empty or populated library (%s)',
    async (populated) => {
      vi.spyOn(bookService, 'listBooksByAuthor').mockResolvedValue(
        populated
          ? [
              {
                id: 'book',
                authorId: 'auth-1',
                title: 'Atlas',
                genre: 'Aventura',
                synopsis: '',
                coverUrl: null,
                status: 'draft',
                wordCount: 0,
                createdAt: 0,
                updatedAt: 0,
              },
            ]
          : [],
      );
      render(
        <MemoryRouter>
          <Routes>
            <Route path="/" element={<BookList authorId="auth-1" />} />
            <Route path="/books/new/assisted" element={<h1>Criação assistida</h1>} />
          </Routes>
        </MemoryRouter>,
      );
      await userEvent.click(await screen.findByRole('button', { name: 'Criar com IA' }));
      expect(screen.getByRole('heading', { name: 'Criação assistida' })).toBeInTheDocument();
    },
  );
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
    await user.type(screen.getByLabelText(/gênero literário/i), 'Aventura');
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
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
