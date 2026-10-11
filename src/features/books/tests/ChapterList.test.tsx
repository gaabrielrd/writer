import * as organization from '../services/chapterOrganizationService';
vi.mock('../services/chapterOrganizationService', async () => ({
  ...(await vi.importActual<typeof import('../services/chapterOrganizationService')>(
    '../services/chapterOrganizationService',
  )),
  listActs: vi.fn(() => Promise.resolve([])),
  createAct: vi.fn(),
  moveChaptersToAct: vi.fn(),
  deleteChapters: vi.fn(),
}));
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
    vi.mocked(organization.listActs).mockResolvedValue([]);
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
    vi.mocked(organization.deleteChapters).mockResolvedValue();

    render(
      <MemoryRouter>
        <ChapterList book={mockBook} open={true} onClose={vi.fn()} />
      </MemoryRouter>,
    );

    await screen.findByText('Capítulo 1');

    await user.click(screen.getByRole('button', { name: 'Opções de Capítulo 1' }));
    await user.click(screen.getByRole('menuitem', { name: 'Excluir' }));
    await user.click(screen.getByRole('button', { name: 'Excluir capítulos' }));
    await waitFor(() =>
      expect(organization.deleteChapters).toHaveBeenCalledWith('b-1', [mockChapters[0]]),
    );
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

  function mountInline() {
    const user = userEvent.setup();
    const result = render(
      <MemoryRouter>
        <ChapterList book={mockBook} open onClose={vi.fn()} mode="inline" />
      </MemoryRouter>,
    );
    return { ...result, user };
  }
  it('filtra títulos sem acentos e seleciona apenas resultados exibidos', async () => {
    vi.spyOn(bookService, 'listChapters').mockResolvedValue([
      { ...mockChapters[0]!, title: 'Prólogo da ação' },
      mockChapters[1]!,
    ]);
    const { user } = mountInline();
    await screen.findByText('Prólogo da ação');
    const first = screen.getByRole('checkbox', { name: 'Selecionar Prólogo da ação' });
    const all = screen.getByRole('checkbox', { name: 'Selecionar todos os capítulos exibidos' });
    await user.click(first);
    expect(all).toBePartiallyChecked();
    await user.type(screen.getByRole('textbox', { name: 'Filtrar capítulos por nome' }), 'ACAO');
    expect(screen.queryByText('Capítulo 2')).not.toBeInTheDocument();
    expect(first).not.toBeChecked();
    await user.click(all);
    expect(screen.getByRole('status')).toHaveTextContent('1 selecionado');
    await user.click(screen.getByRole('button', { name: 'Excluir seleção' }));
    const dialog = screen.getByRole('dialog', { name: 'Excluir capítulos' });
    expect(within(dialog).getByText('Prólogo da ação')).toBeInTheDocument();
    expect(within(dialog).queryByText('Capítulo 2')).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(first).toBeChecked();
    await user.clear(screen.getByRole('textbox', { name: 'Filtrar capítulos por nome' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Filtrar capítulos por nome' }),
      'inexistente',
    );
    expect(screen.getByText('Nenhum capítulo encontrado')).toBeInTheDocument();
  });
  it('cria atos sem nome, conserva dados em falha e permite criar capítulo no ato', async () => {
    vi.spyOn(bookService, 'listChapters').mockResolvedValue([]);
    vi.mocked(organization.createAct)
      .mockRejectedValueOnce(new Error('Sem conexão'))
      .mockResolvedValue({
        id: 'act',
        name: null,
        order: 1,
        createdAt: 1,
        updatedAt: 1,
      });
    const { user } = mountInline();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Novo ato' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Novo ato' }));
    await user.click(screen.getByRole('button', { name: 'Criar ato' }));
    expect(await screen.findByText('Sem conexão')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Criar ato' }));
    expect(await screen.findByRole('heading', { name: 'I' })).toBeInTheDocument();
    expect(organization.createAct).toHaveBeenCalledWith('b-1', '');
    vi.spyOn(bookService, 'createChapter').mockResolvedValue({ ...mockChapters[0]!, actId: 'act' });
    await user.click(screen.getByRole('button', { name: 'Novo capítulo' }));
    await user.type(screen.getByLabelText('Título do capítulo'), 'Primeiro');
    await user.click(screen.getByRole('combobox', { name: 'Ato do capítulo' }));
    await user.click(screen.getByRole('option', { name: 'I' }));
    await user.click(screen.getByRole('button', { name: 'Criar capítulo' }));
    await waitFor(() =>
      expect(bookService.createChapter).toHaveBeenCalledWith('b-1', {
        title: 'Primeiro',
        actId: 'act',
      }),
    );
  });
  it('move seleção com confirmação, preserva seleção ao cancelar e evita confirmação duplicada', async () => {
    vi.spyOn(bookService, 'listChapters').mockResolvedValue(mockChapters);
    vi.mocked(organization.listActs).mockResolvedValue([
      { id: 'act', name: 'Virada', order: 1, createdAt: 1, updatedAt: 1 },
    ]);
    let resolve!: () => void;
    vi.mocked(organization.moveChaptersToAct).mockImplementation(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    const { user } = mountInline();
    await screen.findByText('Capítulo 1');
    await user.click(
      screen.getByRole('checkbox', { name: 'Selecionar todos os capítulos exibidos' }),
    );
    const trigger = screen.getByRole('button', { name: 'Mover para ato' });
    await user.click(trigger);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(screen.getByRole('status')).toHaveTextContent('2 selecionado');
    await user.click(trigger);
    await user.click(screen.getByRole('combobox', { name: 'Ato de destino' }));
    await user.click(screen.getByRole('option', { name: 'Virada' }));
    await user.click(screen.getByRole('button', { name: 'Mover capítulos' }));
    expect(screen.getByRole('button', { name: 'Processando...' })).toBeDisabled();
    expect(organization.moveChaptersToAct).toHaveBeenCalledTimes(1);
    expect(organization.moveChaptersToAct).toHaveBeenCalledWith('b-1', mockChapters, 'act');
    resolve();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByRole('group', { name: 'Ações da seleção' })).not.toBeInTheDocument();
  });
  it('preserva a seleção quando excluir falha e permite retentativa', async () => {
    vi.spyOn(bookService, 'listChapters').mockResolvedValue(mockChapters);
    vi.mocked(organization.deleteChapters)
      .mockRejectedValueOnce(new Error('Operação recusada'))
      .mockResolvedValue();
    const { user } = mountInline();
    await screen.findByText('Capítulo 1');
    await user.click(screen.getByRole('checkbox', { name: 'Selecionar Capítulo 1' }));
    await user.click(screen.getByRole('button', { name: 'Excluir seleção' }));
    await user.click(screen.getByRole('button', { name: 'Excluir capítulos' }));
    expect(await screen.findByText('Operação recusada')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveTextContent('Capítulo 1');
    await user.click(screen.getByRole('button', { name: 'Excluir capítulos' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(organization.deleteChapters).toHaveBeenCalledTimes(2);
  });
  it('a busca não transforma vizinhos filtrados na ordem real do ato', async () => {
    vi.spyOn(bookService, 'listChapters').mockResolvedValue(mockChapters);
    const reorder = vi.spyOn(bookService, 'reorderChapters').mockResolvedValue();
    const { user } = mountInline();
    await screen.findByText('Capítulo 1');
    await user.type(screen.getByRole('textbox', { name: 'Filtrar capítulos por nome' }), '2');
    await user.click(screen.getByRole('button', { name: 'Opções de Capítulo 2' }));
    await user.click(screen.getByRole('menuitem', { name: 'Mover para cima' }));
    expect(reorder).toHaveBeenCalledWith('b-1', ['c-2', 'c-1']);
  });
  it('informa o impacto na publicação ao confirmar ações sobre o rascunho', async () => {
    vi.spyOn(bookService, 'listChapters').mockResolvedValue(mockChapters);
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ChapterList
          book={{ ...mockBook, status: 'published' }}
          open
          onClose={vi.fn()}
          mode="inline"
        />
      </MemoryRouter>,
    );
    await screen.findByText('Capítulo 1');
    await user.click(screen.getByRole('checkbox', { name: 'Selecionar Capítulo 1' }));
    await user.click(screen.getByRole('button', { name: 'Excluir seleção' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('atualize ou retire a publicação');
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(organization.deleteChapters).not.toHaveBeenCalled();
  });
});
