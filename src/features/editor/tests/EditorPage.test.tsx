import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { EditorPage } from '../components/EditorPage';
import * as bookService from '@/features/books';
import * as loreService from '@/features/lore';
import type { Book, Chapter } from '@/features/books';
import type { LoreEntity } from '@/features/lore';

vi.mock('@/features/auth', async () => {
  const actual = await vi.importActual<typeof import('@/features/auth')>('@/features/auth');
  return {
    ...actual,
    useAuth: vi.fn(() => ({
      user: {
        id: 'auth-1',
        email: 'autor@exemplo.com',
        name: 'Autor',
        tier: 'free',
        credits: 10,
        createdAt: 1000,
        updatedAt: 1000,
      },
      loading: false,
    })),
  };
});

describe('EditorPage', () => {
  const mockBook: Book = {
    id: 'b-1',
    authorId: 'auth-1',
    title: 'Crônicas de Avalon',
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
      title: 'Capítulo 1: O Encontro',
      order: 1,
      wordCount: 120,
      content: 'Arthur caminhava ao entardecer.',
      createdAt: 1000,
      updatedAt: 1000,
    },
    {
      id: 'c-2',
      bookId: 'b-1',
      title: 'Capítulo 2: A Espada',
      order: 2,
      wordCount: 80,
      content: 'A espada brilhava na pedra.',
      createdAt: 1000,
      updatedAt: 1000,
    },
  ];

  const mockEntities: LoreEntity[] = [
    {
      id: 'e-1',
      bookId: 'b-1',
      name: 'Arthur',
      aliases: ['Pendragon'],
      category: 'character',
      summary: 'Herdeiro do trono',
      details: '',
      relations: [],
      isPublic: true,
      createdAt: 1000,
      updatedAt: 1000,
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('exibe tela de erro quando livro ou capitulo nao sao encontrados', async () => {
    vi.spyOn(bookService, 'getBook').mockResolvedValue(null);
    vi.spyOn(bookService, 'listChapters').mockResolvedValue([]);
    vi.spyOn(bookService, 'getChapter').mockResolvedValue(null);
    vi.spyOn(loreService, 'listLoreEntities').mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={['/books/b-none/editor/c-none']}>
        <Routes>
          <Route path="/books/:bookId/editor/:chapterId" element={<EditorPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Não foi possível abrir o editor')).toBeInTheDocument();
  });

  it('carrega o capitulo no editor e exibe contagem de palavras e status de salvamento', async () => {
    vi.spyOn(bookService, 'getBook').mockResolvedValue(mockBook);
    vi.spyOn(bookService, 'listChapters').mockResolvedValue(mockChapters);
    vi.spyOn(bookService, 'getChapter').mockResolvedValue(mockChapters[0] ?? null);
    vi.spyOn(loreService, 'listLoreEntities').mockResolvedValue(mockEntities);

    render(
      <MemoryRouter initialEntries={['/books/b-1/editor/c-1']}>
        <Routes>
          <Route path="/books/:bookId/editor/:chapterId" element={<EditorPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Capítulo 1: O Encontro')).toBeInTheDocument();
    expect(screen.getByText('Crônicas de Avalon')).toBeInTheDocument();
    expect(screen.getByText('120')).toBeInTheDocument();
    expect(screen.getByText('Salvo')).toBeInTheDocument();

    const textarea = screen.getByLabelText(/área de escrita do capítulo/i);
    expect(textarea).toHaveValue('Arthur caminhava ao entardecer.');
  });

  it('permite abrir sidebar, criar entidade e navegar para proximo capitulo', async () => {
    const user = userEvent.setup();
    vi.spyOn(bookService, 'getBook').mockResolvedValue(mockBook);
    vi.spyOn(bookService, 'listChapters').mockResolvedValue(mockChapters);
    vi.spyOn(bookService, 'getChapter').mockResolvedValue(mockChapters[0] ?? null);
    vi.spyOn(loreService, 'listLoreEntities').mockResolvedValue(mockEntities);
    vi.spyOn(loreService, 'createLoreEntity').mockResolvedValue({
      id: 'e-2',
      bookId: 'b-1',
      name: 'Guinevere',
      aliases: [],
      category: 'character',
      summary: 'Rainha',
      details: '',
      relations: [],
      isPublic: true,
      createdAt: 1000,
      updatedAt: 1000,
    });
    vi.spyOn(loreService, 'updateLoreEntity').mockResolvedValue();

    render(
      <MemoryRouter initialEntries={['/books/b-1/editor/c-1']}>
        <Routes>
          <Route path="/books/:bookId/editor/:chapterId" element={<EditorPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByText('Capítulo 1: O Encontro');

    // Abre sidebar
    const toggleBtn = screen.getByRole('button', { name: /compêndio/i });
    await user.click(toggleBtn);

    expect(screen.getByRole('heading', { name: 'Compêndio de Lore' })).toBeInTheDocument();

    // Criar nova entidade via sidebar
    await user.click(screen.getByRole('button', { name: /nova entidade/i }));
    await user.type(screen.getByLabelText(/nome da entidade/i), 'Guinevere');
    await user.type(screen.getByLabelText(/resumo curto/i), 'Rainha');
    await user.click(screen.getByRole('button', { name: 'Cadastrar Entidade' }));

    expect(loreService.createLoreEntity).toHaveBeenCalledWith(
      'b-1',
      expect.objectContaining({ name: 'Guinevere' }),
    );

    // Editar entidade via sidebar
    const editBtns = screen.getAllByRole('button', { name: 'Editar' });
    const editBtn = editBtns[0];
    if (editBtn) await user.click(editBtn);

    await user.type(screen.getByLabelText(/resumo curto/i), ' de Camelot');
    await user.click(screen.getByRole('button', { name: 'Salvar Alterações' }));
    expect(loreService.updateLoreEntity).toHaveBeenCalledWith(
      'b-1',
      'e-1',
      expect.objectContaining({ name: 'Arthur' }),
    );

    // Navegação entre capítulos
    const nextBtn = screen.getByLabelText('Próximo capítulo');
    await user.click(nextBtn);
  });
});
