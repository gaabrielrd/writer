import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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
        uid: 'auth-1',
        email: 'autor@exemplo.com',
        name: 'Autor',
        tier: 'free',
        credits: 10,
        createdAt: 1000,
        updatedAt: 1000,
      },
      loading: false,
      updateUserCreditsState: vi.fn(),
      setPendingEditorOperation: vi.fn(),
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
    expect(textarea).toHaveTextContent('Arthur caminhava ao entardecer.');
  });

  it('permite abrir sidebar, criar entidade e navegar para proximo capitulo', async () => {
    const user = userEvent.setup({ delay: null });
    vi.spyOn(bookService, 'getBook').mockResolvedValue(mockBook);
    vi.spyOn(bookService, 'listChapters').mockResolvedValue(mockChapters);
    vi.spyOn(bookService, 'getChapter').mockImplementation((_bookId, chapterId) =>
      Promise.resolve(mockChapters.find((chapter) => chapter.id === chapterId) ?? null),
    );
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

    const sidebar = screen.getByRole('complementary', {
      name: 'Painel lateral do Compêndio de Lore',
    });
    expect(within(sidebar).getByRole('heading', { name: 'Compêndio de Lore' })).toBeInTheDocument();

    // Criar nova entidade via sidebar
    await user.click(screen.getByRole('button', { name: /nova entidade/i }));
    const createDialog = await screen.findByRole('dialog', {
      name: 'Cadastrar Nova Entidade no Compêndio',
    });
    await user.click(within(createDialog).getByLabelText(/nome da entidade/i));
    await user.paste('Guinevere');
    await user.click(within(createDialog).getByLabelText(/resumo curto/i));
    await user.paste('Rainha');
    await user.click(screen.getByRole('button', { name: 'Cadastrar Entidade' }));

    await waitFor(() => expect(createDialog).not.toBeInTheDocument());
    expect(await within(sidebar).findByText('Guinevere', { exact: true })).toBeInTheDocument();
    expect(loreService.createLoreEntity).toHaveBeenCalledWith(
      'b-1',
      expect.objectContaining({ name: 'Guinevere' }),
    );

    // Editar entidade via sidebar
    const editBtns = within(sidebar).getAllByRole('button', { name: 'Editar' });
    expect(editBtns).toHaveLength(2);
    await user.click(editBtns[0]!);
    const editDialog = await screen.findByRole('dialog', { name: 'Editar Entidade: Arthur' });
    await user.click(within(editDialog).getByLabelText(/resumo curto/i));
    await user.keyboard('{End}');
    await user.paste(' de Camelot');
    await user.click(screen.getByRole('button', { name: 'Salvar Alterações' }));
    await waitFor(() => expect(editDialog).not.toBeInTheDocument());
    expect(await within(sidebar).findByText('Herdeiro do trono de Camelot')).toBeInTheDocument();
    expect(loreService.updateLoreEntity).toHaveBeenCalledWith(
      'b-1',
      'e-1',
      expect.objectContaining({ name: 'Arthur', summary: 'Herdeiro do trono de Camelot' }),
    );

    // Navegação entre capítulos
    const nextBtn = screen.getByLabelText('Próximo capítulo');
    await user.click(nextBtn);
    expect(await screen.findByText('Capítulo 2: A Espada')).toBeInTheDocument();
    expect(screen.getByLabelText(/área de escrita do capítulo/i)).toHaveTextContent(
      'A espada brilhava na pedra.',
    );
  });
  it.each(['Recuperar texto local', 'Manter versão salva'])(
    'exige escolha explicita para rascunho divergente: %s',
    async (choice) => {
      const user = userEvent.setup({ delay: null });
      vi.spyOn(bookService, 'getBook').mockResolvedValue(mockBook);
      vi.spyOn(bookService, 'listChapters').mockResolvedValue(mockChapters);
      vi.spyOn(bookService, 'getChapter').mockResolvedValue(mockChapters[0] ?? null);
      vi.spyOn(bookService, 'updateChapter').mockResolvedValue();
      vi.spyOn(loreService, 'listLoreEntities').mockResolvedValue(mockEntities);
      localStorage.setItem(
        'writer:draft:auth-1:b-1:c-1',
        JSON.stringify({ content: 'Texto local preservado', updatedAt: 1 }),
      );
      render(
        <MemoryRouter initialEntries={['/books/b-1/editor/c-1']}>
          <Routes>
            <Route path="/books/:bookId/editor/:chapterId" element={<EditorPage />} />
          </Routes>
        </MemoryRouter>,
      );
      expect(
        await screen.findByRole('dialog', { name: 'Recuperar rascunho local?' }),
      ).toBeInTheDocument();
      expect(bookService.updateChapter).not.toHaveBeenCalled();
      expect(screen.queryByLabelText(/área de escrita do capítulo/i)).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: choice }));
      const editor = await screen.findByLabelText(/área de escrita do capítulo/i);
      expect(editor).toHaveTextContent(
        choice === 'Recuperar texto local'
          ? 'Texto local preservado'
          : 'Arthur caminhava ao entardecer.',
      );
    },
  );
});
