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
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createPortal } from 'react-dom';
import { MemoryRouter, Route, Routes } from 'react-router';
import { BookPage } from '../components/BookPage';
import * as publicationService from '../services/publicationService';
import * as bookService from '../services/bookService';
import type { Book } from '../model/book';

vi.mock('@/features/editor', () => ({
  ExportDialog: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="Exportar manuscrito">
      <button onClick={onClose}>Fechar exportação</button>
    </div>
  ),
}));

vi.mock('@/features/auth', () => ({
  useAuth: () => ({ user: { uid: 'user-1' }, loading: false }),
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

  function renderBookPage(bookId = 'book-1') {
    return render(
      <MemoryRouter initialEntries={[`/books/${bookId}`]}>
        <Routes>
          <Route path="/books/:bookId" element={<BookPage />} />
          <Route path="/" element={<div>Home</div>} />
        </Routes>
      </MemoryRouter>,
    );
  }

  beforeEach(() => {
    vi.restoreAllMocks();
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

  it('exibe ErrorState quando livro nao e encontrado', async () => {
    vi.spyOn(bookService, 'getBook').mockResolvedValue(null);

    renderBookPage();

    expect(await screen.findByText('Livro não encontrado')).toBeInTheDocument();
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
    expect(screen.getByText('Obra em Rascunho')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /publicar obra/i })).toBeInTheDocument();

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
    await screen.findByText('Rascunho');
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
    await user.click(screen.getByRole('button', { name: 'Reverter para Rascunho' }));
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
    expect(screen.getAllByRole('menuitem')).toHaveLength(4);
    await user.click(screen.getByRole('menuitem', { name: 'Exportar' }));
    expect(screen.getByRole('dialog', { name: 'Exportar manuscrito' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Fechar exportação' }));
    expect(screen.queryByRole('dialog', { name: 'Exportar manuscrito' })).not.toBeInTheDocument();
  });
});
