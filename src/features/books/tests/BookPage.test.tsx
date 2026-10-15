vi.mock('../services/chapterOrganizationService', () => ({
  MAX_CHAPTER_SELECTION: 200,
  createOrganizedChapter: vi.fn(),
  listActs: vi.fn(() => Promise.resolve([])),
  createAct: vi.fn(),
  moveChaptersToAct: vi.fn(),
  deleteChapters: vi.fn(),
}));
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createPortal } from 'react-dom';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { BookPage } from '../components/BookPage';
import * as publicationService from '../services/publicationService';
import * as bookService from '../services/bookService';
import type { Book } from '../model/book';
const bookAuth = vi.hoisted(() => ({ user: { uid: 'user-1' }, loading: false }));
vi.mock('@/features/narrative-planning', () => ({
  NarrativePlanner: ({
    target,
    onProjectChange,
  }: {
    target: { kind: string; id: string };
    onProjectChange?: () => void;
  }) => (
    <>
      <h2>
        Planejamento de {target.kind}/{target.id}
      </h2>
      <input aria-label="Seleção privada da origem" defaultValue="" />
      <button onClick={onProjectChange}>Atualizar metadados do projeto</button>
    </>
  ),
}));
function CurrentLocation() {
  const location = useLocation();
  return <output aria-label="Localização atual">{location.search}</output>;
}

vi.mock('@/features/editor', () => ({
  ExportDialog: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="Exportar manuscrito">
      <button onClick={onClose}>Fechar exportação</button>
    </div>
  ),
}));

vi.mock('@/features/auth', () => ({
  useAuth: () => bookAuth,
}));

vi.mock('@/features/lore', () => ({
  LoreTab: ({
    book,
    actionsContainer,
    onEntitiesChanged,
  }: {
    book: Book;
    actionsContainer?: HTMLElement | null;
    onEntitiesChanged?: () => void;
  }) => (
    <>
      <div data-testid="lore-tab">Compêndio de {book.title}</div>
      {actionsContainer &&
        createPortal(
          <button onClick={onEntitiesChanged}>Concluir ação de lore</button>,
          actionsContainer,
        )}
    </>
  ),
}));

describe('BookPage', () => {
  const mockBook: Book = {
    id: 'book-1',
    authorId: 'user-1',
    title: 'A Jornada do Herói',
    genre: 'Fantasia Épica',
    synopsis: 'Uma aventura em terras distantes.',
    coverUrl: null,
    status: 'draft',
    wordCount: 12500,
    createdAt: 1000,
    updatedAt: 2000,
  };

  function renderBookPage(bookId = 'book-1', search = '') {
    return render(
      <MemoryRouter initialEntries={[`/books/${bookId}${search}`]}>
        <CurrentLocation />
        <Routes>
          <Route path="/books/:bookId" element={<BookPage />} />
          <Route path="/" element={<div>Home</div>} />
        </Routes>
      </MemoryRouter>,
    );
  }

  beforeEach(() => {
    bookAuth.user = { uid: 'user-1' };
    vi.restoreAllMocks();
    vi.spyOn(bookService, 'subscribeWritingBindings').mockReturnValue(() => undefined);
  });

  it('renderiza dados do livro e abas', async () => {
    vi.spyOn(bookService, 'getBook').mockResolvedValue(mockBook);
    vi.spyOn(bookService, 'listChapters').mockResolvedValue([]);

    renderBookPage();

    expect(await screen.findByText('A Jornada do Herói')).toBeInTheDocument();
    expect(screen.getByText('Fantasia Épica')).toBeInTheDocument();
    expect(screen.getByText(/12\.500 palavras/)).toBeInTheDocument();

    // Abas presentes
    expect(screen.getByRole('tab', { name: /capítulos/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /compêndio/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /publicação/i })).toBeInTheDocument();
  });

  it('restaura aba narrativa da URL e conserva contexto do arco ao trocar abas pelo teclado', async () => {
    vi.spyOn(bookService, 'getBook').mockResolvedValue(mockBook);
    vi.spyOn(bookService, 'listChapters').mockResolvedValue([]);
    renderBookPage('book-1', '?tab=narrative&narrativeArc=arco-1&narrativeView=arcs');
    expect(
      await screen.findByRole('heading', { name: 'Planejamento de book/book-1' }),
    ).toBeInTheDocument();
    const tab = screen.getByRole('tab', { name: 'Arcos e cronologia' });
    expect(tab).toHaveAttribute('aria-selected', 'true');
    tab.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Compêndio' })).toHaveFocus();
    expect(screen.getByLabelText('Localização atual')).toHaveTextContent('tab=compendium');
    expect(screen.getByLabelText('Localização atual')).toHaveTextContent('narrativeArc=arco-1');
    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Arcos e cronologia' })).toHaveFocus();
    expect(
      screen.getByRole('heading', { name: 'Planejamento de book/book-1' }),
    ).toBeInTheDocument();
  });

  it('troca de conta remove o planejamento carregado antes da resposta da nova conta', async () => {
    vi.spyOn(bookService, 'getBook')
      .mockResolvedValueOnce(mockBook)
      .mockImplementationOnce(() => new Promise(() => undefined));
    const view = renderBookPage('book-1', '?tab=narrative');
    expect(
      await screen.findByRole('heading', { name: 'Planejamento de book/book-1' }),
    ).toBeInTheDocument();
    bookAuth.user = { uid: 'another-user' };
    view.rerender(
      <MemoryRouter initialEntries={['/books/book-1?tab=narrative']}>
        <Routes>
          <Route path="/books/:bookId" element={<BookPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(
      screen.queryByRole('heading', { name: 'Planejamento de book/book-1' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(mockBook.synopsis!)).not.toBeInTheDocument();
  });

  it('exibe ErrorState quando livro nao e encontrado', async () => {
    vi.spyOn(bookService, 'getBook').mockResolvedValue(null);

    renderBookPage();

    expect(await screen.findByText('Livro não encontrado')).toBeInTheDocument();
  });

  it('não mostra dados privados retornados do cache de outro dono', async () => {
    bookAuth.user = { uid: 'another-user' };
    vi.spyOn(bookService, 'getBook').mockResolvedValue(mockBook);
    renderBookPage('book-1', '?tab=narrative');
    expect(await screen.findByText('Livro não encontrado')).toBeInTheDocument();
    expect(screen.queryByText(mockBook.title)).not.toBeInTheDocument();
    expect(screen.queryByText(mockBook.synopsis!)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Planejamento de book/book-1' }),
    ).not.toBeInTheDocument();
  });

  it('descarta estado da origem anterior ao desvincular universo e conserva o arco na URL', async () => {
    vi.spyOn(bookService, 'getBook')
      .mockResolvedValueOnce({ ...mockBook, universeId: 'old-world' })
      .mockResolvedValueOnce({ ...mockBook, universeId: null });
    renderBookPage('book-1', '?tab=narrative&narrativeView=arcs&narrativeArc=arc-1');
    await screen.findByRole('heading', { name: 'Planejamento de book/book-1' });
    await userEvent.type(
      screen.getByLabelText('Seleção privada da origem'),
      'Entidade do universo anterior',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Atualizar metadados do projeto' }));
    await waitFor(() => expect(screen.getByLabelText('Seleção privada da origem')).toHaveValue(''));
    expect(screen.getByLabelText('Localização atual')).toHaveTextContent('narrativeArc=arc-1');
    expect(screen.getByRole('tab', { name: 'Arcos e cronologia' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('atualização que retorna origem alheia remove o painel antes de exibir essa origem', async () => {
    vi.spyOn(bookService, 'getBook')
      .mockResolvedValueOnce(mockBook)
      .mockResolvedValueOnce({
        ...mockBook,
        authorId: 'another-user',
        title: 'Título privado alheio',
      });
    vi.spyOn(bookService, 'listChapters').mockResolvedValue([]);
    renderBookPage();
    await screen.findByText(mockBook.title);
    await userEvent.click(screen.getByRole('tab', { name: 'Arcos e cronologia' }));
    expect(await screen.findByText('Livro não encontrado')).toBeInTheDocument();
    expect(screen.queryByText('Título privado alheio')).not.toBeInTheDocument();
  });

  it('navega entre abas', async () => {
    const user = userEvent.setup();
    vi.spyOn(bookService, 'getBook').mockResolvedValue(mockBook);
    vi.spyOn(bookService, 'listChapters').mockResolvedValue([]);

    renderBookPage();

    await screen.findByText('A Jornada do Herói');

    // Aba Compêndio
    await user.click(screen.getByRole('tab', { name: /compêndio/i }));
    expect(screen.getByTestId('lore-tab')).toHaveTextContent('Compêndio de A Jornada do Herói');

    // Aba Publicação
    await user.click(screen.getByRole('tab', { name: /publicação/i }));
    expect(screen.getByText('Obra não publicada')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /publicar obra/i })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Progresso' }));
    expect(screen.getByRole('heading', { name: 'Progresso de book/book-1' })).toBeVisible();
    expect(screen.getByLabelText('Localização atual')).toHaveTextContent('tab=progress');

    // Volta para Capítulos
    await user.click(screen.getByRole('tab', { name: /capítulos/i }));
    expect(screen.getByText(/capítulo\(s\)/)).toBeInTheDocument();
  });

  it('atualiza o status após uma ação de lore e retira os controles ao sair da aba', async () => {
    const user = userEvent.setup();
    const getBook = vi
      .spyOn(bookService, 'getBook')
      .mockResolvedValue({ ...mockBook, status: 'published' });
    vi.spyOn(bookService, 'listChapters').mockResolvedValue([]);
    renderBookPage();
    await screen.findByText('Publicado');
    await user.click(screen.getByRole('tab', { name: 'Compêndio' }));
    const action = screen.getByRole('button', { name: 'Concluir ação de lore' });
    expect(action.closest('[role="tablist"]')).toBeNull();
    getBook.mockResolvedValue(mockBook);
    await user.click(action);
    await screen.findByText('Não publicado');
    await user.click(screen.getByRole('tab', { name: 'Capítulos' }));
    expect(screen.queryByRole('button', { name: 'Concluir ação de lore' })).not.toBeInTheDocument();
  });

  it('permite alternar status de publicacao', async () => {
    const user = userEvent.setup();
    vi.spyOn(bookService, 'getBook').mockResolvedValue(mockBook);
    vi.spyOn(publicationService, 'publishBook').mockResolvedValue();
    vi.spyOn(publicationService, 'unpublishBook').mockResolvedValue();
    vi.spyOn(bookService, 'listChapters').mockResolvedValue([]);

    renderBookPage();

    await screen.findByText('A Jornada do Herói');

    await user.click(screen.getByRole('tab', { name: /publicação/i }));
    await user.click(screen.getByRole('button', { name: /publicar obra/i }));

    expect(publicationService.publishBook).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText('Nome de autor público'), 'Nome Literário');
    await user.click(screen.getByRole('button', { name: 'Confirmar publicação' }));
    expect(publicationService.publishBook).toHaveBeenCalledWith('book-1', 'Nome Literário');
    expect(await screen.findByRole('link', { name: 'Abrir leitor público' })).toHaveAttribute(
      'href',
      '/read/book-1',
    );
    await user.click(screen.getByRole('button', { name: 'Despublicar obra' }));
    expect(publicationService.unpublishBook).toHaveBeenCalledWith('book-1');
  });

  it('permite abrir dialogo de edicao e salvar alteracoes', async () => {
    const user = userEvent.setup();
    vi.spyOn(bookService, 'getBook').mockResolvedValue(mockBook);
    vi.spyOn(bookService, 'updateBook').mockResolvedValue();
    vi.spyOn(bookService, 'listChapters').mockResolvedValue([]);

    renderBookPage();

    await screen.findByText('A Jornada do Herói');

    await user.click(screen.getByRole('button', { name: 'Opções do livro' }));
    await user.click(screen.getByRole('menuitem', { name: 'Editar' }));
    expect(screen.getByRole('heading', { name: 'Editar Obra' })).toBeInTheDocument();

    await user.type(screen.getByLabelText(/título da obra/i), ' Final');
    await user.click(screen.getByRole('button', { name: 'Salvar Alterações' }));

    expect(bookService.updateBook).toHaveBeenCalledWith(
      'book-1',
      expect.objectContaining({ title: 'A Jornada do Herói Final' }),
    );
  });

  it('permite excluir o livro e redirecionar para a home', async () => {
    const user = userEvent.setup();
    vi.spyOn(bookService, 'getBook').mockResolvedValue(mockBook);
    vi.spyOn(bookService, 'deleteBook').mockResolvedValue();
    vi.spyOn(bookService, 'listChapters').mockResolvedValue([]);

    renderBookPage();

    await screen.findByText('A Jornada do Herói');

    await user.click(screen.getByRole('button', { name: 'Opções do livro' }));
    const deleteBtn = screen.getByRole('menuitem', { name: 'Excluir' });
    await user.click(deleteBtn);

    expect(bookService.deleteBook).toHaveBeenCalledWith('book-1');
  });

  it('permite abrir modal de importacao de capitulos', async () => {
    const user = userEvent.setup();
    vi.spyOn(bookService, 'getBook').mockResolvedValue(mockBook);
    vi.spyOn(bookService, 'listChapters').mockResolvedValue([]);

    renderBookPage();

    await screen.findByText('A Jornada do Herói');

    await user.click(screen.getByRole('button', { name: 'Opções do livro' }));
    const importBtn = screen.getByRole('menuitem', { name: 'Importar documento' });
    await user.click(importBtn);

    expect(
      screen.getByRole('heading', { name: 'Importar Capítulos — A Jornada do Herói' }),
    ).toBeInTheDocument();
  });

  it('expande e recolhe a sinopse por um controle acessível', async () => {
    const user = userEvent.setup();
    vi.spyOn(bookService, 'getBook').mockResolvedValue(mockBook);
    vi.spyOn(bookService, 'listChapters').mockResolvedValue([]);
    renderBookPage();
    const expand = await screen.findByRole('button', { name: 'Expandir sinopse' });
    expect(expand).toHaveAttribute('aria-expanded', 'false');
    expect(document.getElementById(expand.getAttribute('aria-controls')!)).toHaveTextContent(
      mockBook.synopsis!,
    );
    await user.click(expand);
    const collapse = screen.getByRole('button', { name: 'Recolher sinopse' });
    expect(collapse).toHaveAttribute('aria-expanded', 'true');
    await user.click(collapse);
    expect(screen.getByRole('button', { name: 'Expandir sinopse' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('não mostra o controle da sinopse quando ela está vazia', async () => {
    vi.spyOn(bookService, 'getBook').mockResolvedValue({ ...mockBook, synopsis: '' });
    vi.spyOn(bookService, 'listChapters').mockResolvedValue([]);
    renderBookPage();
    await screen.findByText(mockBook.title);
    expect(screen.queryByRole('button', { name: 'Expandir sinopse' })).not.toBeInTheDocument();
  });

  it('concentra ações no menu e abre a exportação', async () => {
    const user = userEvent.setup();
    vi.spyOn(bookService, 'getBook').mockResolvedValue(mockBook);
    vi.spyOn(bookService, 'listChapters').mockResolvedValue([]);
    renderBookPage();
    const options = await screen.findByRole('button', { name: 'Opções do livro' });
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Importar Arquivo' })).not.toBeInTheDocument();
    await user.click(options);
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Exportar',
      'Importar documento',
      'Persona de IA',
      'Editar',
      'Excluir',
    ]);
    await user.click(screen.getByRole('menuitem', { name: 'Exportar' }));
    expect(screen.getByRole('dialog', { name: 'Exportar manuscrito' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Fechar exportação' }));
    expect(screen.queryByRole('dialog', { name: 'Exportar manuscrito' })).not.toBeInTheDocument();
  });
});

vi.mock('@/features/work-progress', async (original) => ({
  ...(await original<object>()),
  ProjectProgressPanel: ({ target }: { target: { kind: string; id: string } }) => (
    <h2>
      Progresso de {target.kind}/{target.id}
    </h2>
  ),
  ContinueWorkPanel: () => <h2>Continuar meu trabalho</h2>,
  useWorkActivity: vi.fn(() => ({ loading: false, error: '', conflict: false, retry: vi.fn() })),
  WorkActivityNotice: () => null,
}));
