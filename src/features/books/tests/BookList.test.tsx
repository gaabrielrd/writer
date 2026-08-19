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

  it('permite editar, excluir, alternar status e gerenciar capitulos de um livro', async () => {
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
    vi.spyOn(bookService, 'updateBook').mockResolvedValue();
    vi.spyOn(bookService, 'deleteBook').mockResolvedValue();
    vi.spyOn(bookService, 'listChapters').mockResolvedValue([]);

    render(
      <MemoryRouter>
        <BookList authorId="auth-1" />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Livro Existente')).toBeInTheDocument();

    // Alternar status
    await user.click(screen.getByRole('button', { name: /publicar/i }));
    expect(bookService.updateBook).toHaveBeenCalledWith('b-1', { status: 'published' });

    // Editar
    await user.click(screen.getByLabelText('Editar Livro Existente'));
    expect(screen.getByRole('heading', { name: 'Editar Obra' })).toBeInTheDocument();
    await user.type(screen.getByLabelText(/título da obra/i), ' Editado');
    await user.click(screen.getByRole('button', { name: 'Salvar Alterações' }));
    expect(bookService.updateBook).toHaveBeenCalledWith(
      'b-1',
      expect.objectContaining({ title: 'Livro Existente Editado' }),
    );

    // Gerenciar capítulos
    await user.click(screen.getByRole('button', { name: /capítulos/i }));
    expect(
      await screen.findByRole('heading', { name: /capítulos — livro existente/i }),
    ).toBeInTheDocument();
    const closeButtons = screen.getAllByRole('button', { name: 'Fechar' });
    const closeBtn = closeButtons[closeButtons.length - 1];
    if (closeBtn) await user.click(closeBtn);

    // Excluir
    await user.click(screen.getByLabelText('Excluir Livro Existente'));
    expect(bookService.deleteBook).toHaveBeenCalledWith('b-1');
  });
});
