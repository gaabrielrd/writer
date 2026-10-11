import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
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
    const user = userEvent.setup();
    vi.spyOn(bookService, 'listChapters').mockResolvedValue(mockChapters);

    render(
      <MemoryRouter>
        <ChapterList book={mockBook} open={true} onClose={vi.fn()} />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Capítulo 1')).toBeInTheDocument();
    expect(screen.getByText('Capítulo 2')).toBeInTheDocument();
    expect(screen.getByText(/1\.500/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Escrever Capítulo 1' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Opções de Capítulo 1' }));
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Renomear',
      'Mover para cima',
      'Mover para baixo',
      'Excluir',
    ]);
  });

  it('exibe alerta quando ocorre erro ao carregar', async () => {
    vi.spyOn(bookService, 'listChapters').mockRejectedValueOnce(new Error('Erro de carregamento'));

    render(
      <MemoryRouter>
        <ChapterList book={mockBook} open={true} onClose={vi.fn()} />
      </MemoryRouter>,
    );

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

    render(
      <MemoryRouter>
        <ChapterList book={mockBook} open={true} onClose={vi.fn()} />
      </MemoryRouter>,
    );

    await screen.findByText('Capítulo 1');

    expect(screen.queryByLabelText('Título do capítulo')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Novo capítulo' }));
    const dialog = screen.getByRole('dialog', { name: 'Novo capítulo' });
    expect(within(dialog).getByRole('button', { name: 'Criar capítulo' })).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Título do capítulo'), '  Capítulo 3  ');
    await user.click(within(dialog).getByRole('button', { name: 'Criar capítulo' }));

    expect(await screen.findByText('Capítulo 3')).toBeInTheDocument();
    expect(bookService.createChapter).toHaveBeenCalledWith('b-1', { title: 'Capítulo 3' });
    expect(screen.queryByRole('dialog', { name: 'Novo capítulo' })).not.toBeInTheDocument();
  });

  it('permite renomear capitulo via input inline e cancelar com Escape ou texto vazio', async () => {
    const user = userEvent.setup();
    vi.spyOn(bookService, 'listChapters').mockResolvedValue(mockChapters);
    vi.spyOn(bookService, 'updateChapter').mockResolvedValue();

    render(
      <MemoryRouter>
        <ChapterList book={mockBook} open={true} onClose={vi.fn()} />
      </MemoryRouter>,
    );

    await screen.findByText('Capítulo 1');

    // Cancelar com Escape
    await user.click(screen.getByRole('button', { name: 'Opções de Capítulo 1' }));
    await user.click(screen.getByRole('menuitem', { name: 'Renomear' }));
    const input = screen.getByDisplayValue('Capítulo 1');
    await user.type(input, '{escape}');
    expect(screen.getByText('Capítulo 1')).toBeInTheDocument();

    // Cancelar com texto vazio
    await user.click(screen.getByRole('button', { name: 'Opções de Capítulo 1' }));
    await user.click(screen.getByRole('menuitem', { name: 'Renomear' }));
    const inputEmpty = screen.getByDisplayValue('Capítulo 1');
    await user.clear(inputEmpty);
    await user.tab(); // trigger onBlur
    expect(screen.getByText('Capítulo 1')).toBeInTheDocument();

    // Renomear com sucesso
    await user.click(screen.getByRole('button', { name: 'Opções de Capítulo 1' }));
    await user.click(screen.getByRole('menuitem', { name: 'Renomear' }));
    const inputSuccess = screen.getByDisplayValue('Capítulo 1');
    await user.clear(inputSuccess);
    await user.type(inputSuccess, 'Prólogo{enter}');

    expect(bookService.updateChapter).toHaveBeenCalledWith('b-1', 'c-1', { title: 'Prólogo' });
  });

  it('permite reordenar capitulos para cima e para baixo', async () => {
    const user = userEvent.setup();
    vi.spyOn(bookService, 'listChapters').mockResolvedValue(mockChapters);
    vi.spyOn(bookService, 'reorderChapters').mockResolvedValue();

    render(
      <MemoryRouter>
        <ChapterList book={mockBook} open={true} onClose={vi.fn()} />
      </MemoryRouter>,
    );

    await screen.findByText('Capítulo 1');

    // Mover para cima
    await user.click(screen.getByRole('button', { name: 'Opções de Capítulo 2' }));
    await user.click(screen.getByRole('menuitem', { name: 'Mover para cima' }));
    expect(bookService.reorderChapters).toHaveBeenCalledWith('b-1', ['c-2', 'c-1']);

    // Mover para baixo
    await user.click(screen.getByRole('button', { name: 'Opções de Capítulo 1' }));
    await user.click(screen.getByRole('menuitem', { name: 'Mover para baixo' }));
    expect(bookService.reorderChapters).toHaveBeenCalledWith('b-1', ['c-2', 'c-1']);
  });

  it('permite excluir capitulo', async () => {
    const user = userEvent.setup();
    vi.spyOn(bookService, 'listChapters').mockResolvedValue(mockChapters);
    vi.spyOn(bookService, 'deleteChapter').mockResolvedValue();

    render(
      <MemoryRouter>
        <ChapterList book={mockBook} open={true} onClose={vi.fn()} />
      </MemoryRouter>,
    );

    await screen.findByText('Capítulo 1');

    await user.click(screen.getByRole('button', { name: 'Opções de Capítulo 1' }));
    await user.click(screen.getByRole('menuitem', { name: 'Excluir' }));
    expect(screen.queryByText('Capítulo 1')).not.toBeInTheDocument();
  });

  it('cancela a criação, descarta o título e devolve foco ao botão', async () => {
    const user = userEvent.setup();
    vi.spyOn(bookService, 'listChapters').mockResolvedValue(mockChapters);
    const create = vi.spyOn(bookService, 'createChapter');
    render(
      <MemoryRouter>
        <ChapterList book={mockBook} open onClose={vi.fn()} mode="inline" />
      </MemoryRouter>,
    );
    await screen.findByText('Capítulo 1');
    const trigger = screen.getByRole('button', { name: 'Novo capítulo' });
    await user.click(trigger);
    await user.type(screen.getByLabelText('Título do capítulo'), 'Rascunho descartado');
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(create).not.toHaveBeenCalled();
    await waitFor(() => expect(trigger).toHaveFocus());
    await user.click(trigger);
    expect(screen.getByLabelText('Título do capítulo')).toHaveValue('');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('preserva o título e permite tentar novamente quando criar falha', async () => {
    const user = userEvent.setup();
    vi.spyOn(bookService, 'listChapters').mockResolvedValue(mockChapters);
    const create = vi
      .spyOn(bookService, 'createChapter')
      .mockRejectedValueOnce(new Error('Sem conexão'))
      .mockResolvedValue({ ...mockChapters[0]!, id: 'c-3', title: 'Novo início', order: 3 });
    render(
      <MemoryRouter>
        <ChapterList book={mockBook} open onClose={vi.fn()} mode="inline" />
      </MemoryRouter>,
    );
    await screen.findByText('Capítulo 1');
    await user.click(screen.getByRole('button', { name: 'Novo capítulo' }));
    await user.type(screen.getByLabelText('Título do capítulo'), 'Novo início');
    await user.click(screen.getByRole('button', { name: 'Criar capítulo' }));
    expect(await screen.findByText('Sem conexão')).toBeInTheDocument();
    expect(screen.getByLabelText('Título do capítulo')).toHaveValue('Novo início');
    await user.click(screen.getByRole('button', { name: 'Criar capítulo' }));
    expect(await screen.findByText('Novo início')).toBeInTheDocument();
    expect(create).toHaveBeenCalledTimes(2);
  });
});
