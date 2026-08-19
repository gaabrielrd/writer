import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChapterList } from '../components/ChapterList';
import * as bookService from '../services/bookService';
import type { Book } from '../model/book';
import type { Chapter } from '../model/chapter';

describe('ChapterList', () => {
  const mockBook: Book = {
    id: 'b-1',
    authorId: 'a-1',
    title: 'O Nome do Vento',
    genre: 'Fantasia',
    synopsis: '',
    coverUrl: null,
    status: 'draft',
    wordCount: 1500,
    createdAt: 1000,
    updatedAt: 1000,
  };

  const mockChapters: Chapter[] = [
    {
      id: 'c-1',
      bookId: 'b-1',
      title: 'Capítulo 1',
      order: 1,
      wordCount: 1000,
      content: 'Texto 1',
      createdAt: 1000,
      updatedAt: 1000,
    },
    {
      id: 'c-2',
      bookId: 'b-1',
      title: 'Capítulo 2',
      order: 2,
      wordCount: 500,
      content: 'Texto 2',
      createdAt: 1000,
      updatedAt: 1000,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lista capitulos do livro com contagem de palavras e total', async () => {
    vi.spyOn(bookService, 'listChapters').mockResolvedValue(mockChapters);

    render(<ChapterList book={mockBook} open={true} onClose={vi.fn()} />);

    expect(await screen.findByText('Capítulo 1')).toBeInTheDocument();
    expect(screen.getByText('Capítulo 2')).toBeInTheDocument();
    expect(screen.getByText(/1\.500/)).toBeInTheDocument();
  });

  it('exibe alerta quando ocorre erro ao carregar', async () => {
    vi.spyOn(bookService, 'listChapters').mockRejectedValueOnce(new Error('Erro de carregamento'));

    render(<ChapterList book={mockBook} open={true} onClose={vi.fn()} />);

    expect(await screen.findByText('Erro de carregamento')).toBeInTheDocument();
  });

  it('permite adicionar novo capitulo', async () => {
    const user = userEvent.setup();
    vi.spyOn(bookService, 'listChapters').mockResolvedValue(mockChapters);
    vi.spyOn(bookService, 'createChapter').mockResolvedValue({
      id: 'c-3',
      bookId: 'b-1',
      title: 'Capítulo 3',
      order: 3,
      wordCount: 0,
      content: '',
      createdAt: 2000,
      updatedAt: 2000,
    });

    render(<ChapterList book={mockBook} open={true} onClose={vi.fn()} />);

    await screen.findByText('Capítulo 1');

    await user.type(screen.getByLabelText(/novo capítulo/i), 'Capítulo 3');
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));

    expect(await screen.findByText('Capítulo 3')).toBeInTheDocument();
  });

  it('permite renomear capitulo via input inline e cancelar com Escape ou texto vazio', async () => {
    const user = userEvent.setup();
    vi.spyOn(bookService, 'listChapters').mockResolvedValue(mockChapters);
    vi.spyOn(bookService, 'updateChapter').mockResolvedValue();

    render(<ChapterList book={mockBook} open={true} onClose={vi.fn()} />);

    await screen.findByText('Capítulo 1');

    // Cancelar com Escape
    await user.click(screen.getByLabelText('Renomear Capítulo 1'));
    const input = screen.getByDisplayValue('Capítulo 1');
    await user.type(input, '{escape}');
    expect(screen.getByText('Capítulo 1')).toBeInTheDocument();

    // Cancelar com texto vazio
    await user.click(screen.getByLabelText('Renomear Capítulo 1'));
    const inputEmpty = screen.getByDisplayValue('Capítulo 1');
    await user.clear(inputEmpty);
    await user.tab(); // trigger onBlur
    expect(screen.getByText('Capítulo 1')).toBeInTheDocument();

    // Renomear com sucesso
    await user.click(screen.getByLabelText('Renomear Capítulo 1'));
    const inputSuccess = screen.getByDisplayValue('Capítulo 1');
    await user.clear(inputSuccess);
    await user.type(inputSuccess, 'Prólogo{enter}');

    expect(bookService.updateChapter).toHaveBeenCalledWith('b-1', 'c-1', { title: 'Prólogo' });
  });

  it('permite reordenar capitulos para cima e para baixo', async () => {
    const user = userEvent.setup();
    vi.spyOn(bookService, 'listChapters').mockResolvedValue(mockChapters);
    vi.spyOn(bookService, 'reorderChapters').mockResolvedValue();

    render(<ChapterList book={mockBook} open={true} onClose={vi.fn()} />);

    await screen.findByText('Capítulo 1');

    // Mover Capítulo 2 para cima
    await user.click(screen.getByLabelText('Mover Capítulo 2 para cima'));
    expect(bookService.reorderChapters).toHaveBeenCalledWith('b-1', ['c-2', 'c-1']);

    // Mover Capítulo 1 para baixo
    await user.click(screen.getByLabelText('Mover Capítulo 1 para baixo'));
    expect(bookService.reorderChapters).toHaveBeenCalledWith('b-1', ['c-2', 'c-1']);
  });

  it('permite excluir capitulo', async () => {
    const user = userEvent.setup();
    vi.spyOn(bookService, 'listChapters').mockResolvedValue(mockChapters);
    vi.spyOn(bookService, 'deleteChapter').mockResolvedValue();

    render(<ChapterList book={mockBook} open={true} onClose={vi.fn()} />);

    await screen.findByText('Capítulo 1');

    await user.click(screen.getByLabelText('Excluir Capítulo 1'));
    expect(screen.queryByText('Capítulo 1')).not.toBeInTheDocument();
  });
});
