import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BookFormDialog } from '../components/BookFormDialog';
import type { Book } from '../model/book';

describe('BookFormDialog', () => {
  it('renderiza modo de criacao e submete dados', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(<BookFormDialog open={true} onClose={onClose} onSubmit={onSubmit} />);

    expect(screen.getByRole('heading', { name: 'Criar Novo Livro' })).toBeInTheDocument();

    await user.type(screen.getByLabelText(/título da obra/i), 'O Senhor dos Aneis');
    await user.type(screen.getByLabelText(/gênero literário/i), 'Alta Fantasia');
    await user.type(screen.getByLabelText(/sinopse/i), 'A jornada do anel.');
    await user.click(screen.getByRole('button', { name: 'Criar Livro' }));

    expect(onSubmit).toHaveBeenCalledWith({
      title: 'O Senhor dos Aneis',
      genre: 'Alta Fantasia',
      synopsis: 'A jornada do anel.',
      coverUrl: null,
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('preenche campos no modo de edicao', () => {
    const mockBook: Book = {
      id: 'b-1',
      authorId: 'a-1',
      title: 'Duna',
      genre: 'Ficção Científica',
      synopsis: 'Arrakis',
      coverUrl: 'https://exemplo.com/duna.jpg',
      status: 'published',
      wordCount: 50000,
      createdAt: 1000,
      updatedAt: 1000,
    };

    render(
      <BookFormDialog open={true} bookToEdit={mockBook} onClose={vi.fn()} onSubmit={vi.fn()} />,
    );

    expect(screen.getByRole('heading', { name: 'Editar Obra' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Duna')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Ficção Científica')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Arrakis')).toBeInTheDocument();
  });
});
