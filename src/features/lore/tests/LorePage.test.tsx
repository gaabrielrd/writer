import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { LorePage } from '../components/LorePage';
import * as bookService from '@/features/books';
import * as loreService from '../services/loreService';
import type { Book } from '@/features/books';
import type { LoreEntity } from '../model/loreEntity';

describe('LorePage', () => {
  const mockBook: Book = {
    id: 'book-123',
    authorId: 'auth-1',
    title: 'Crônicas de Avalon',
    genre: 'Fantasia',
    synopsis: 'Lendas celtas',
    coverUrl: null,
    status: 'draft',
    wordCount: 1500,
    createdAt: 1000,
    updatedAt: 1000,
  };

  const mockEntities: LoreEntity[] = [
    {
      id: 'e-1',
      bookId: 'book-123',
      name: 'Rei Arthur',
      aliases: ['Pendragon'],
      category: 'character',
      summary: 'Soberano da Bretanha',
      details: 'Líder dos cavaleiros',
      relations: [],
      isPublic: true,
      createdAt: 1000,
      updatedAt: 1000,
    },
    {
      id: 'e-2',
      bookId: 'book-123',
      name: 'Camelot',
      aliases: ['Cidadela Dourada'],
      category: 'location',
      summary: 'A capital fortificada',
      details: 'Corte real',
      relations: [],
      isPublic: true,
      createdAt: 1000,
      updatedAt: 1000,
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('exibe erro quando o livro nao e encontrado', async () => {
    vi.spyOn(bookService, 'getBook').mockResolvedValue(null);
    vi.spyOn(loreService, 'listLoreEntities').mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={['/books/book-none/lore']}>
        <Routes>
          <Route path="/books/:bookId/lore" element={<LorePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Livro não encontrado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /voltar para minhas obras/i })).toBeInTheDocument();
  });

  it('exibe erro quando o servico de lore falha e permite retentativa', async () => {
    const user = userEvent.setup();
    vi.spyOn(bookService, 'getBook').mockResolvedValue(mockBook);
    vi.spyOn(loreService, 'listLoreEntities')
      .mockRejectedValueOnce(new Error('Falha no Firestore'))
      .mockResolvedValueOnce([]);

    render(
      <MemoryRouter initialEntries={['/books/book-123/lore']}>
        <Routes>
          <Route path="/books/:bookId/lore" element={<LorePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Falha no Firestore')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /tentar novamente/i }));
    expect(await screen.findByText('Nenhuma entidade cadastrada')).toBeInTheDocument();
  });

  it('exibe EmptyState quando o livro nao possui entidades de lore e permite criar', async () => {
    const user = userEvent.setup();
    vi.spyOn(bookService, 'getBook').mockResolvedValue(mockBook);
    vi.spyOn(loreService, 'listLoreEntities').mockResolvedValue([]);
    vi.spyOn(loreService, 'createLoreEntity').mockResolvedValue({
      id: 'e-created',
      bookId: 'book-123',
      name: 'Merlin',
      aliases: [],
      category: 'character',
      summary: 'Mago supremo',
      details: '',
      relations: [],
      isPublic: true,
      createdAt: 1000,
      updatedAt: 1000,
    });

    render(
      <MemoryRouter initialEntries={['/books/book-123/lore']}>
        <Routes>
          <Route path="/books/:bookId/lore" element={<LorePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', { name: 'Compêndio de Lore — Crônicas de Avalon' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Nenhuma entidade cadastrada')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /cadastrar primeira entidade/i }));

    expect(
      screen.getByRole('heading', { name: /cadastrar nova entidade no compêndio/i }),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText(/nome da entidade/i), 'Merlin');
    await user.type(screen.getByLabelText(/resumo curto/i), 'Mago supremo');
    await user.click(screen.getByRole('button', { name: 'Cadastrar Entidade' }));

    expect(await screen.findByText('Merlin')).toBeInTheDocument();
  });

  it('exibe grade de entidades, filtra por busca e por categoria', async () => {
    const user = userEvent.setup();
    vi.spyOn(bookService, 'getBook').mockResolvedValue(mockBook);
    vi.spyOn(loreService, 'listLoreEntities').mockResolvedValue(mockEntities);

    render(
      <MemoryRouter initialEntries={['/books/book-123/lore']}>
        <Routes>
          <Route path="/books/:bookId/lore" element={<LorePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Rei Arthur')).toBeInTheDocument();
    expect(screen.getByText('Camelot')).toBeInTheDocument();

    // Filtro de busca
    const searchInput = screen.getByLabelText(/buscar no compêndio/i);
    await user.type(searchInput, 'Camelot');
    expect(screen.queryByText('Rei Arthur')).not.toBeInTheDocument();
    expect(screen.getByText('Camelot')).toBeInTheDocument();

    // Limpar busca
    await user.clear(searchInput);
    expect(screen.getByText('Rei Arthur')).toBeInTheDocument();

    // Filtro por aba de categoria
    const charTab = screen.getByRole('tab', { name: /personagens/i });
    await user.click(charTab);
    expect(screen.getByText('Rei Arthur')).toBeInTheDocument();
    expect(screen.queryByText('Camelot')).not.toBeInTheDocument();

    // Busca sem resultados -> EmptyState de busca com botão Limpar Filtros
    await user.type(searchInput, 'TermoInexistente');
    expect(screen.getByText('Nenhuma entidade encontrada')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /limpar filtros/i }));
    expect(screen.getByText('Rei Arthur')).toBeInTheDocument();
  });

  it('abre o drawer ao clicar em Ver Ficha, edita via drawer e permite exclusao', async () => {
    const user = userEvent.setup();
    vi.spyOn(bookService, 'getBook').mockResolvedValue(mockBook);
    vi.spyOn(loreService, 'listLoreEntities').mockResolvedValue(mockEntities);
    vi.spyOn(loreService, 'updateLoreEntity').mockResolvedValue();
    vi.spyOn(loreService, 'deleteLoreEntity').mockResolvedValue();

    render(
      <MemoryRouter initialEntries={['/books/book-123/lore']}>
        <Routes>
          <Route path="/books/:bookId/lore" element={<LorePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Rei Arthur')).toBeInTheDocument();

    // Abrir drawer
    const viewButtons = screen.getAllByRole('button', { name: /ver ficha/i });
    const viewBtn = viewButtons[0];
    if (viewBtn) await user.click(viewBtn);

    expect(screen.getByText('Líder dos cavaleiros')).toBeInTheDocument();

    // Clicar em Editar Ficha de dentro do Drawer
    await user.click(screen.getByRole('button', { name: /editar ficha/i }));
    expect(
      screen.getByRole('heading', { name: /editar entidade: rei arthur/i }),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText(/nome da entidade/i), ' II');
    await user.click(screen.getByRole('button', { name: 'Salvar Alterações' }));

    expect(loreService.updateLoreEntity).toHaveBeenCalledWith(
      'book-123',
      'e-1',
      expect.objectContaining({ name: 'Rei Arthur II' }),
    );

    // Excluir entidade
    await user.click(screen.getByLabelText('Excluir Rei Arthur II'));
    expect(loreService.deleteLoreEntity).toHaveBeenCalledWith('book-123', 'e-1');
  });
});
